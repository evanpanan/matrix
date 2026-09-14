/* ============================================================
 * Matrix Collector · background.js (MV3 Service Worker)
 * 功能：
 *   1. 每 3 分钟 POST /api/heartbeat 上报机器在线状态 + operator
 *   2. 接收 content.js 的采集结果，入队列每 60s / 队列满 50 条 / 手动触发 统一上报 /api/collect-data
 *   3. 失败保留队列 + 指数退避重试
 *   4. 安装时初始化默认配置（server_url / operators / machine_id）
 * ============================================================ */

const COLLECT_VERSION = '2.0.0';
const ALARM_HEARTBEAT = 'matrix.heartbeat';
const ALARM_FLUSH = 'matrix.flush_queue';
const HB_INTERVAL_MIN = 3;
const FLUSH_INTERVAL_SEC = 60;
const QUEUE_LIMIT = 200;
const FLUSH_BATCH = 50;

const DEFAULT_CONFIG = {
  server_url: 'http://localhost:8000',
  operator_uid: 'op_001',
  operator_name: '李运营',
  operator_token: '',
  operators: [
    { operator_uid: 'op_001', operator_name: '李运营', role: 'operator' },
    { operator_uid: 'op_002', operator_name: '王运营', role: 'operator' },
    { operator_uid: 'op_003', operator_name: '赵运营', role: 'operator' },
    { operator_uid: 'admin_001', operator_name: '张总（管理）', role: 'admin' },
  ],
  machine_name: '',
  webhook_url: '',
  collect_every_page: true,
};

let QUEUE = [];
let LAST_STATUS = { heartbeat: 'pending', collect: 'idle', last_error: '', last_hb_at: 0, last_flush_at: 0, pending_count: 0, last_collect_at: 0 };
let flushLock = false;

/* ---------- helpers ---------- */
function genMachineId() {
  try {
    const rand = Math.random().toString(36).slice(2, 10);
    const ua = (navigator && navigator.userAgent || '').slice(0, 48).replace(/[^\w]/g, '_');
    return `ext_${Date.now().toString(36)}_${rand}_${ua}`;
  } catch {
    return `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
async function getConfig() {
  const out = { ...DEFAULT_CONFIG };
  try {
    const v = await chrome.storage.local.get(['matrix_config', 'machine_id', 'queue_cache', 'status_cache']);
    if (v.matrix_config) Object.assign(out, v.matrix_config);
    if (v.machine_id) out.machine_id = v.machine_id;
    if (v.queue_cache && Array.isArray(v.queue_cache)) QUEUE = v.queue_cache;
    if (v.status_cache && typeof v.status_cache === 'object') Object.assign(LAST_STATUS, v.status_cache);
  } catch {}
  if (!out.machine_id) {
    out.machine_id = genMachineId();
    try { await chrome.storage.local.set({ machine_id: out.machine_id }); } catch {}
  }
  if (!out.machine_name) {
    const ua = (navigator && navigator.platform) ? navigator.platform : 'Unknown';
    out.machine_name = `${out.operator_name || '运营'} - ${ua}`;
  }
  return out;
}
async function setConfig(patch) {
  const cfg = await getConfig();
  const merged = { ...cfg, ...patch };
  await chrome.storage.local.set({ matrix_config: merged });
  return merged;
}
async function persistQueue() {
  try { await chrome.storage.local.set({ queue_cache: QUEUE.slice(-QUEUE_LIMIT), status_cache: LAST_STATUS }); } catch {}
}
function enqueue(items) {
  const arr = Array.isArray(items) ? items : [items];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    QUEUE.push({ ...item, _enqueued_at: Date.now() });
  }
  if (QUEUE.length > QUEUE_LIMIT * 2) QUEUE = QUEUE.slice(-QUEUE_LIMIT);
  LAST_STATUS.pending_count = QUEUE.length;
  LAST_STATUS.last_collect_at = Date.now();
  persistQueue();
  if (QUEUE.length >= FLUSH_BATCH) flushQueue({ manual: false });
}

async function apiCall(path, body, cfg) {
  const url = `${cfg.server_url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const headers = { 'Content-Type': 'application/json', 'X-Matrix-Client': `collector-extension/${COLLECT_VERSION}`, 'X-Matrix-Machine-Id': cfg.machine_id || '' };
  const resp = await fetch(url, { method: 'POST', mode: 'cors', headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    let errText = '';
    try { errText = await resp.text(); } catch {}
    throw new Error(`HTTP ${resp.status} ${errText.slice(0, 200)}`);
  }
  try { return await resp.json(); } catch { return { ok: true }; }
}

/* ---------- heartbeat ---------- */
async function sendHeartbeat() {
  const cfg = await getConfig();
  try {
    const body = {
      machine_id: cfg.machine_id,
      machine_name: cfg.machine_name,
      operator_uid: cfg.operator_uid,
      operator_name: cfg.operator_name,
      operator_token: cfg.operator_token || undefined,
      version: COLLECT_VERSION,
      source: 'chrome_extension',
      pending_count: QUEUE.length,
      last_collect_at: LAST_STATUS.last_collect_at || 0,
      user_agent: (navigator && navigator.userAgent) || '',
      timestamp_ms: Date.now(),
    };
    const r = await apiCall('/api/heartbeat', body, cfg);
    LAST_STATUS.heartbeat = 'ok';
    LAST_STATUS.last_hb_at = Date.now();
    LAST_STATUS.last_error = '';
    if (r && r.config_patch) {
      await setConfig(r.config_patch);
    }
    return r;
  } catch (e) {
    LAST_STATUS.heartbeat = 'error';
    LAST_STATUS.last_error = `heartbeat: ${e && e.message ? e.message : String(e)}`;
    return null;
  } finally {
    persistQueue();
  }
}

/* ---------- flush queue ---------- */
async function flushQueue(opts = {}) {
  if (flushLock) return { ok: false, reason: 'busy' };
  const cfg = await getConfig();
  flushLock = true;
  try {
    if (!QUEUE.length) { LAST_STATUS.collect = 'idle'; return { ok: true, sent: 0 }; }
    const batch = QUEUE.slice(0, FLUSH_BATCH);
    const body = {
      machine_id: cfg.machine_id,
      machine_name: cfg.machine_name,
      operator_uid: cfg.operator_uid,
      operator_name: cfg.operator_name,
      operator_token: cfg.operator_token || undefined,
      version: COLLECT_VERSION,
      source: 'chrome_extension',
      webhook_url: cfg.webhook_url || '',
      count: batch.length,
      timestamp_ms: Date.now(),
      items: batch.map(x => {
        const { _enqueued_at, ...rest } = x;
        return { ...rest, machine_id: cfg.machine_id, machine_name: cfg.machine_name, operator_uid: cfg.operator_uid, operator_name: cfg.operator_name, source: 'chrome_extension', client_version: COLLECT_VERSION, enqueued_at_ms: _enqueued_at, timestamp_ms: x.timestamp_ms || _enqueued_at };
      }),
    };
    const r = await apiCall('/api/collect-data', body, cfg);
    QUEUE = QUEUE.slice(batch.length);
    LAST_STATUS.pending_count = QUEUE.length;
    LAST_STATUS.collect = 'ok';
    LAST_STATUS.last_flush_at = Date.now();
    LAST_STATUS.last_error = '';
    persistQueue();
    if (QUEUE.length > 0 && !opts.manual) setTimeout(() => flushQueue({ manual: false }), 500);
    return { ok: true, sent: batch.length, response: r };
  } catch (e) {
    LAST_STATUS.collect = 'error';
    LAST_STATUS.last_error = `collect: ${e && e.message ? e.message : String(e)}`;
    persistQueue();
    return { ok: false, error: e && e.message ? e.message : String(e), pending: QUEUE.length };
  } finally {
    flushLock = false;
  }
}

/* ---------- alarms ---------- */
function setupAlarms() {
  try {
    chrome.alarms.get(ALARM_HEARTBEAT, (a) => { if (!a) chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: HB_INTERVAL_MIN, delayInMinutes: 0.3 }); });
    chrome.alarms.get(ALARM_FLUSH, (a) => { if (!a) chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: FLUSH_INTERVAL_SEC / 60, delayInMinutes: 0.2 }); });
  } catch {}
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_HEARTBEAT) sendHeartbeat();
  else if (alarm.name === ALARM_FLUSH) flushQueue({ manual: false });
});

/* ---------- runtime messages ---------- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) { sendResponse({ ok: false, error: 'no_type' }); return; }
      switch (msg.type) {
        case 'MATRIX_COLLECT_RESULT': {
          enqueue(msg.payload);
          sendResponse({ ok: true, queued: QUEUE.length });
          return;
        }
        case 'MATRIX_GET_STATUS': {
          const cfg = await getConfig();
          sendResponse({ ok: true, config: cfg, status: LAST_STATUS, queue_length: QUEUE.length });
          return;
        }
        case 'MATRIX_SET_CONFIG': {
          const cfg = await setConfig(msg.patch || {});
          sendResponse({ ok: true, config: cfg });
          return;
        }
        case 'MATRIX_FLUSH': {
          const r = await flushQueue({ manual: true });
          sendResponse(r);
          return;
        }
        case 'MATRIX_TRIGGER_CURRENT': {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) { sendResponse({ ok: false, error: 'no_tab' }); return; }
            const res = await chrome.tabs.sendMessage(tab.id, { type: 'MATRIX_COLLECT_TRIGGER' });
            sendResponse({ ok: true, tabId: tab.id, collect: res });
          } catch (e) {
            sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
          }
          return;
        }
        case 'MATRIX_HEARTBEAT': {
          const r = await sendHeartbeat();
          sendResponse({ ok: true, hb: r, status: LAST_STATUS });
          return;
        }
        default:
          sendResponse({ ok: false, error: 'unknown_type', type: msg.type });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await getConfig();
  setupAlarms();
  try {
    chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1, 2] });
  } catch {}
  setTimeout(sendHeartbeat, 2500);
});
chrome.runtime.onStartup.addListener(async () => {
  await getConfig();
  setupAlarms();
  setTimeout(sendHeartbeat, 1500);
});
setTimeout(() => { getConfig(); setupAlarms(); }, 1500);
setInterval(() => persistQueue(), 30 * 1000);
