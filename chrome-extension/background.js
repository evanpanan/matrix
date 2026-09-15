// Matrix Collector Background v2.1 (chrome-extension 兼容版)
// 新增：operator_uid/operator_name 统一注入 Header、machine_id 电脑指纹、JWT 对接、entity_type 透传
// 新增 v2.1：Stocktwits/Reddit 官方监控白名单双防线（前端拦截 + 后端最后一道）、3s 停留自动采集
//            新 MATRIX_* 协议桥（与 collector-extension content.js 1025 行版兼容）

const DEFAULT_CONFIG = {
  apiEndpoint: 'http://localhost:8000/api/collect-data',
  apiToken: '',
  jwtToken: '',

  operator_uid: '',
  operator_name: '',
  machine_id: '',
  machine_name: '',
  client_version: '2.1.0',

  enableAutoUpload: true,
  enableLocalStorage: true,
  maxLocalRecords: 2000,
  uploadTimeout: 12000,
  uploadRetryCount: 3,
  uploadRetryDelay: 1200,
};

let _lastWhitelistSig = '';
let LAST_STATUS = { last_error: '', last_upload_at: 0, pending_count: 0, monitor_whitelist_count: 0 };

// ---------------- 工具：存储 ----------------
const gc = () => new Promise(r => chrome.storage.local.get(['matrix_config','matrix_records','matrix_pending_uploads','monitor_whitelist'], x => r(x)));
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

function readUserFromJwt(jwt) {
  try {
    const payload = JSON.parse(atob(String(jwt).split('.')[1]));
    return {
      operator_uid:  payload.sub || payload.user_id || payload.uid || '',
      operator_name: payload.name || payload.username || payload.nickname || '',
    };
  } catch { return {}; }
}

// ---------------- v2.1 白名单 ----------------
async function updateMonitorWhitelist(list, { forceBroadcast = false } = {}) {
  const wl = Array.isArray(list) ? list : [];
  const sig = JSON.stringify(wl.map(x => ({ id: x?.id, et: x?.entity_type, sym: x?.symbol, sub: x?.subreddit, act: x?.active })));
  const changed = forceBroadcast || (sig !== _lastWhitelistSig);
  _lastWhitelistSig = sig;
  try { await chrome.storage.local.set({ monitor_whitelist: wl }); } catch {}
  LAST_STATUS.monitor_whitelist_count = wl.length;
  if (!changed) return { stored: wl.length, broadcast: false };
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of (tabs || [])) {
      if (!tab?.id) continue;
      if (!tab?.url || /^chrome:\/\/|^edge:\/\/|^about:\/\//i.test(tab.url)) continue;
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'MATRIX_SET_WHITELIST', payload: wl }, () => { void chrome.runtime.lastError; });
      } catch {}
    }
  } catch {}
  return { stored: wl.length, broadcast: true };
}

async function fetchAndSyncWhitelist(cfg) {
  try {
    const token = cfg?.operator_token || cfg?.jwtToken || cfg?.apiToken || '';
    const base = (cfg?.apiEndpoint || DEFAULT_CONFIG.apiEndpoint).replace(/\/[^/]*$/, '');
    if (!base || !token) return { ok: false, reason: 'no_token_or_base' };
    const url = `${base}/api/collector/bootstrap?token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, { method: 'GET', headers: { 'X-Matrix-Client': `chrome-extension/${cfg?.client_version || '2.1.0'}`, 'X-Matrix-Machine-Id': cfg?.machine_id || '' } });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (Array.isArray(data?.monitor_whitelist)) {
        return await updateMonitorWhitelist(data.monitor_whitelist, { forceBroadcast: false });
      }
    }
    return { ok: false, status: resp.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---------------- 上传（v2.1 改 /api/collect-data 新格式） ----------------
async function uploadToServer(record, cfg) {
  if (!cfg.enableAutoUpload || !cfg.apiEndpoint) return { success: false, skipped: true, reason: 'upload_disabled' };

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.operator_uid)  headers['X-Operator-UID']   = cfg.operator_uid;
  if (cfg.operator_name) headers['X-Operator-Name']  = encodeURIComponent(cfg.operator_name);
  if (cfg.machine_id)    headers['X-Machine-ID']     = cfg.machine_id;
  if (cfg.machine_name)  headers['X-Machine-Name']   = encodeURIComponent(cfg.machine_name);
  headers['X-Client-Version'] = cfg.client_version || DEFAULT_CONFIG.client_version;
  headers['X-Entity-Type']    = record.entity_type || 'ACCOUNT';
  headers['X-Matrix-Client']  = `chrome-extension/${cfg.client_version || '2.1.0'}`;

  let token = cfg.apiToken || cfg.jwtToken;
  if (!token && cfg.jwtToken) token = cfg.jwtToken;
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  if (cfg.jwtToken && (!cfg.operator_uid || !cfg.operator_name)) {
    const fromJwt = readUserFromJwt(cfg.jwtToken);
    if (fromJwt.operator_uid || fromJwt.operator_name) {
      Object.assign(record, fromJwt);
    }
  }

  record.operator_uid  = record.operator_uid  || cfg.operator_uid  || '';
  record.operator_name = record.operator_name || cfg.operator_name || '';
  record.machine_id    = record.machine_id    || cfg.machine_id    || '';
  record.machine_name  = record.machine_name  || cfg.machine_name  || '';
  record.client_version = record.client_version || cfg.client_version || DEFAULT_CONFIG.client_version;
  record.source = 'chrome_extension';

  const body = { items: [record], machine_id: cfg.machine_id || record.machine_id };

  let lastErr = null;
  for (let attempt = 1; attempt <= cfg.uploadRetryCount; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), cfg.uploadTimeout);
      const resp = await fetch(cfg.apiEndpoint, {
        method: 'POST', headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        LAST_STATUS.last_upload_at = Date.now();
        return { success: true, data, attempt };
      }
      lastErr = new Error(`HTTP ${resp.status}`);
      LAST_STATUS.last_error = lastErr.message;
    } catch (e) { lastErr = e; LAST_STATUS.last_error = e.message;
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
  LAST_STATUS.pending_count = arr.length;
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
  LAST_STATUS.pending_count = remaining.length;
}

// ---------------- 消息路由（v2.1 新老协议双兼容） ----------------
chrome.runtime.onMessage.addListener((msg, _s, sendResp) => {
  (async () => {
    try {
      switch (msg.type) {
        // ===== 老协议兼容保留 =====
        case 'DATA_COLLECTED':   return sendResp(await processCollected(msg.payload));
        case 'GET_CONFIG':       return sendResp({ success: true, config: await getConfig() });
        case 'UPDATE_CONFIG': {
          const payload = { ...(msg.payload || {}) };
          if (payload.jwtToken && (!payload.operator_uid || !payload.operator_name)) {
            const from = readUserFromJwt(payload.jwtToken);
            if (from.operator_uid)  payload.operator_uid  = payload.operator_uid  || from.operator_uid;
            if (from.operator_name) payload.operator_name = payload.operator_name || from.operator_name;
          }
          const c = await saveConfig(payload);
          if (payload.jwtToken || payload.operator_token) {
            fetchAndSyncWhitelist(c).catch(() => {});
          }
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
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'MATRIX_COLLECT_TRIGGER', payload: { manual: true } }, () => { void chrome.runtime.lastError; });
            chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_NOW' }, () => { void chrome.runtime.lastError; });
            return sendResp({ success: true });
          }
          return sendResp({ success: false, error: 'No active tab' });
        }

        // ===== v2.1 新 MATRIX_* 协议（与 collector-extension content.js 同步） =====
        case 'MATRIX_COLLECT_RESULT': return sendResp(await processCollected(msg.payload));
        case 'MATRIX_COLLECT_REJECT': {
          return sendResp({ success: true, reason: msg.payload?.reason || 'rejected_by_content' });
        }
        case 'MATRIX_GET_STATUS': {
          const cfg = await getConfig();
          const s = await gc();
          return sendResp({
            success: true,
            status: { ...LAST_STATUS, pending_count: (s.matrix_pending_uploads || []).length },
            config: cfg,
          });
        }
        case 'MATRIX_GET_WHITELIST': {
          const s = await gc();
          return sendResp({ success: true, monitor_whitelist: s.monitor_whitelist || [] });
        }
        case 'MATRIX_REFRESH_WHITELIST': {
          const cfg = await getConfig();
          const r = await fetchAndSyncWhitelist(cfg);
          return sendResp({ success: true, ...r });
        }
        case 'MATRIX_BROADCAST_WHITELIST': {
          const s = await gc();
          const r = await updateMonitorWhitelist(s.monitor_whitelist || [], { forceBroadcast: true });
          return sendResp({ success: true, ...r });
        }
        case 'MATRIX_SET_WHITELIST': {
          const r = await updateMonitorWhitelist(msg.payload || [], { forceBroadcast: !!msg.forceBroadcast });
          return sendResp({ success: true, ...r });
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
  if (c.jwtToken || c.operator_token) fetchAndSyncWhitelist(c).catch(() => {});
});

chrome.runtime.onStartup?.addListener(async () => {
  const c = await getConfig();
  if (c.jwtToken || c.operator_token) fetchAndSyncWhitelist(c).catch(() => {});
});

chrome.alarms?.create('matrix_retry_uploads', { periodInMinutes: 30 });
chrome.alarms?.onAlarm.addListener(a => { if (a.name === 'matrix_retry_uploads') retryPending(); });
