// Matrix Collector Background v2
// 新增：operator_uid/operator_name 统一注入 Header、machine_id 电脑指纹、JWT 对接、entity_type 透传

const DEFAULT_CONFIG = {
  apiEndpoint: 'http://localhost:8000/api/collect',
  apiToken: '',
  jwtToken: '',

  // —— 分布式采集溯源字段（v2）——
  operator_uid: '',          // 对接内部主系统 user_id / JWT sub
  operator_name: '',
  machine_id: '',            // 电脑指纹（自动生成并固定）
  machine_name: '',          // 机器展示名，如 "运营A-MBP16"
  client_version: '2.0.0',

  enableAutoUpload: true,
  enableLocalStorage: true,
  maxLocalRecords: 2000,
  uploadTimeout: 12000,
  uploadRetryCount: 3,
  uploadRetryDelay: 1200,
};

// ---------------- 工具：存储 ----------------
const gc = () => new Promise(r => chrome.storage.local.get(['matrix_config','matrix_records','matrix_pending_uploads'], x => r(x)));
const sc = (x) => new Promise(r => chrome.storage.local.set(x, () => r()));

async function getConfig() {
  const s = await gc();
  const cfg = { ...DEFAULT_CONFIG, ...(s.matrix_config || {}) };
  if (!cfg.machine_id) {
    cfg.machine_id = 'mac_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    await sc({ matrix_config: cfg });
  }
  return cfg;
}
const saveConfig = (p) => gc().then(s => {
  const n = { ...DEFAULT_CONFIG, ...(s.matrix_config || {}), ...p };
  return sc({ matrix_config: n }).then(() => n);
});

// 从页面 URL / JWT 尝试推导 operator（若 SSO 场景）
function readUserFromJwt(jwt) {
  try {
    const payload = JSON.parse(atob(String(jwt).split('.')[1]));
    return {
      operator_uid:  payload.sub || payload.user_id || payload.uid || '',
      operator_name: payload.name || payload.username || payload.nickname || '',
    };
  } catch { return {}; }
}

// ---------------- 上传 ----------------
async function uploadToServer(record, cfg) {
  if (!cfg.enableAutoUpload || !cfg.apiEndpoint) return { success: false, skipped: true, reason: 'upload_disabled' };

  const headers = { 'Content-Type': 'application/json' };
  // —— v2 溯源 Headers ——
  if (cfg.operator_uid)  headers['X-Operator-UID']   = cfg.operator_uid;
  if (cfg.operator_name) headers['X-Operator-Name']  = encodeURIComponent(cfg.operator_name);
  if (cfg.machine_id)    headers['X-Machine-ID']     = cfg.machine_id;
  if (cfg.machine_name)  headers['X-Machine-Name']   = encodeURIComponent(cfg.machine_name);
  headers['X-Client-Version'] = cfg.client_version || DEFAULT_CONFIG.client_version;
  headers['X-Entity-Type']    = record.entity_type || 'ACCOUNT';

  let token = cfg.apiToken || cfg.jwtToken;
  if (!token && cfg.jwtToken) token = cfg.jwtToken;
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  // —— 若 JWT 里有用户信息且配置为空则自动填充 ——
  if (cfg.jwtToken && (!cfg.operator_uid || !cfg.operator_name)) {
    const fromJwt = readUserFromJwt(cfg.jwtToken);
    if (fromJwt.operator_uid || fromJwt.operator_name) {
      Object.assign(record, fromJwt);
    }
  }

  // 记录级别溯源字段（兜底：Header 之外 Body 里也带一份）
  record.operator_uid  = record.operator_uid  || cfg.operator_uid  || '';
  record.operator_name = record.operator_name || cfg.operator_name || '';
  record.machine_id    = record.machine_id    || cfg.machine_id    || '';
  record.machine_name  = record.machine_name  || cfg.machine_name  || '';
  record.client_version = record.client_version || cfg.client_version || DEFAULT_CONFIG.client_version;
  record.source = 'chrome_extension';

  let lastErr = null;
  for (let attempt = 1; attempt <= cfg.uploadRetryCount; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), cfg.uploadTimeout);
      const resp = await fetch(cfg.apiEndpoint, {
        method: 'POST', headers,
        body: JSON.stringify(record),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { success: true, data, attempt };
      }
      lastErr = new Error(`HTTP ${resp.status}`);
    } catch (e) { lastErr = e;
      if (attempt < cfg.uploadRetryCount) {
        await new Promise(r => setTimeout(r, cfg.uploadRetryDelay * attempt));
      }
    }
  }
  return { success: false, error: lastErr?.message || 'Unknown error', recordId: record.timestamp };
}

// ---------------- 本地记录 / 重试队列 ----------------
async function appendRecord(record) {
  const cfg = await getConfig();
  if (!cfg.enableLocalStorage) return;
  const s = await gc();
  const arr = s.matrix_records || [];
  arr.unshift(record);
  if (arr.length > cfg.maxLocalRecords) arr.length = cfg.maxLocalRecords;
  await sc({ matrix_records: arr });
}

async function pushPending(item) {
  const s = await gc();
  const arr = s.matrix_pending_uploads || [];
  arr.push(item);
  await sc({ matrix_pending_uploads: arr.slice(-500) });
}

async function processCollected(payload) {
  try {
    const cfg = await getConfig();
    const record = {
      ...payload,
      received_at: new Date().toISOString(),
      record_id: `${payload.timestamp}_${Math.random().toString(36).slice(2,8)}`,
      operator_uid:  cfg.operator_uid  || payload.operator_uid,
      operator_name: cfg.operator_name || payload.operator_name,
      machine_id:    cfg.machine_id    || payload.machine_id,
      machine_name:  cfg.machine_name  || payload.machine_name,
    };
    await appendRecord(record);
    const up = await uploadToServer(record, cfg);
    if (!up.success && !up.skipped) {
      await pushPending({ record, last_error: up.error, failed_at: Date.now() });
    }
    return { success: true, upload: up, record_id: record.record_id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function retryPending() {
  const cfg = await getConfig();
  if (!cfg.enableAutoUpload) return;
  const s = await gc();
  const pending = s.matrix_pending_uploads || [];
  if (!pending.length) return;
  const remaining = [];
  for (const it of pending) {
    const r = await uploadToServer(it.record, cfg);
    if (!r.success && !r.skipped) {
      it.failed_at = Date.now();
      it.last_error = r.error;
      remaining.push(it);
    }
  }
  await sc({ matrix_pending_uploads: remaining });
}

// ---------------- 消息路由 ----------------
chrome.runtime.onMessage.addListener((msg, _s, sendResp) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'DATA_COLLECTED':   return sendResp(await processCollected(msg.payload));
        case 'GET_CONFIG':       return sendResp({ success: true, config: await getConfig() });
        case 'UPDATE_CONFIG': {
          const payload = { ...(msg.payload || {}) };
          // 若填了 JWT 但没填 operator，尝试自动解析
          if (payload.jwtToken && (!payload.operator_uid || !payload.operator_name)) {
            const from = readUserFromJwt(payload.jwtToken);
            if (from.operator_uid)  payload.operator_uid  = payload.operator_uid  || from.operator_uid;
            if (from.operator_name) payload.operator_name = payload.operator_name || from.operator_name;
          }
          const c = await saveConfig(payload);
          return sendResp({ success: true, config: c });
        }
        case 'GET_RECORDS': {
          const s = await gc();
          return sendResp({ success: true, records: s.matrix_records || [], total: (s.matrix_records || []).length });
        }
        case 'CLEAR_RECORDS': return sendResp({ success: await sc({ matrix_records: [] }), ok: true });
        case 'EXPORT_RECORDS': {
          const s = await gc();
          const blob = new Blob([JSON.stringify(s.matrix_records || [], null, 2)], { type: 'application/json' });
          return sendResp({ success: true, url: URL.createObjectURL(blob), total: (s.matrix_records || []).length });
        }
        case 'RETRY_PENDING': {
          await retryPending();
          const s = await gc();
          return sendResp({ success: true, remaining: (s.matrix_pending_uploads || []).length });
        }
        case 'TRIGGER_COLLECT': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) return chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_NOW' }, (r) => sendResp({ success: true, result: r || {} }));
          return sendResp({ success: false, error: 'No active tab' });
        }
        default: return sendResp({ success: false, error: 'Unknown message type' });
      }
    } catch (e) { sendResp({ success: false, error: e.message }); }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const c = await getConfig();
  if (!c._initialized) await saveConfig({ _initialized: true, _installed_at: Date.now() });
});

chrome.alarms?.create('matrix_retry_uploads', { periodInMinutes: 30 });
chrome.alarms?.onAlarm.addListener(a => { if (a.name === 'matrix_retry_uploads') retryPending(); });
