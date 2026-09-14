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
  operator_uid: '',
  operator_name: '',
  operator_token: '',
  operators: [],
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
function decodeOperatorFromJwt(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (!parts || parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    const uid = (payload && (payload.op_uid || payload.operator_uid || payload.sub)) || null;
    const name = (payload && (payload.op_name || payload.operator_name || payload.name)) || '';
    const role = (payload && payload.role) || 'operator';
    if (!uid) return null;
    return { operator_uid: String(uid), operator_name: String(name || ''), role: String(role || 'operator'), source: 'jwt' };
  } catch {
    return null;
  }
}
const RESOLVE_CACHE_TTL_MS = 5 * 60 * 1000;
let _resolveCache = null;
function getResolvedFromCache(cfg) {
  if (!cfg || !cfg.operator_token) return null;
  if (!_resolveCache || _resolveCache.token !== cfg.operator_token) return null;
  if (Date.now() - (_resolveCache.resolved_at_ms || 0) > RESOLVE_CACHE_TTL_MS) return null;
  return _resolveCache;
}
async function resolveOperatorWithServer(cfg, force = false) {
  if (!cfg || !cfg.operator_token) {
    return { operator_uid: (cfg && cfg.operator_uid) || '', operator_name: (cfg && cfg.operator_name) || '', role: 'operator', source: 'cfg_empty' };
  }
  const cached = force ? null : getResolvedFromCache(cfg);
  if (cached) return cached;
  const jwtOp = decodeOperatorFromJwt(cfg.operator_token);
  try {
    const url = `${cfg.server_url.replace(/\/+$/, '')}/api/collector/bootstrap?token=${encodeURIComponent(cfg.operator_token)}`;
    const resp = await fetch(url, { method: 'GET', headers: { 'X-Matrix-Client': `collector-extension/${COLLECT_VERSION}`, 'X-Matrix-Machine-Id': cfg.machine_id || '' } });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const me = data && data.me;
      if (me && me.operator_uid) {
        const out = {
          operator_uid: String(me.operator_uid),
          operator_name: String(me.operator_name || (jwtOp && jwtOp.operator_name) || cfg.operator_name || ''),
          role: String(me.operator_role || (jwtOp && jwtOp.role) || 'operator'),
          token_id: String(me.token_id || ''),
          site_id: String(me.site_id || (data && data.site && data.site.site_id) || ''),
          source: 'server',
          resolved_at_ms: Date.now(),
          token: cfg.operator_token,
        };
        _resolveCache = out;
        try {
          if (cfg && (!cfg.operator_uid || cfg.operator_uid !== out.operator_uid)) {
            const patch = { operator_uid: out.operator_uid, operator_name: out.operator_name };
            await chrome.storage.local.get(['matrix_config']).then(v => {
              const merged = { ...(v && v.matrix_config || {}), ...patch };
              return chrome.storage.local.set({ matrix_config: merged });
            }).catch(() => {});
          }
        } catch {}
        return out;
      }
    }
  } catch {}
  if (jwtOp) {
    const out = { ...jwtOp, source: 'jwt_fallback', resolved_at_ms: Date.now(), token: cfg.operator_token };
    _resolveCache = out;
    return out;
  }
  return { operator_uid: cfg.operator_uid || '', operator_name: cfg.operator_name || '', role: 'operator', source: 'cfg_fallback' };
}
async function resolveOperator(cfg) {
  return resolveOperatorWithServer(cfg, false);
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
    const op = await resolveOperator(cfg);
    const body = {
      machine_id: cfg.machine_id,
      machine_name: cfg.machine_name,
      operator_uid: op.operator_uid || undefined,
      operator_name: op.operator_name || undefined,
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
    if (r && r.collector) LAST_STATUS.collector = r.collector;
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
    const op = await resolveOperator(cfg);
    const opUid = op.operator_uid || undefined;
    const opName = op.operator_name || undefined;
    const batch = QUEUE.slice(0, FLUSH_BATCH);
    const body = {
      machine_id: cfg.machine_id,
      machine_name: cfg.machine_name,
      operator_uid: opUid,
      operator_name: opName,
      operator_token: cfg.operator_token || undefined,
      version: COLLECT_VERSION,
      source: 'chrome_extension',
      webhook_url: cfg.webhook_url || '',
      count: batch.length,
      timestamp_ms: Date.now(),
      items: batch.map(x => {
        const { _enqueued_at, ...rest } = x;
        return { ...rest, machine_id: cfg.machine_id, machine_name: cfg.machine_name, operator_uid: opUid, operator_name: opName, source: 'chrome_extension', client_version: COLLECT_VERSION, enqueued_at_ms: _enqueued_at, timestamp_ms: x.timestamp_ms || _enqueued_at };
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
    const items_summary = batch.map(x => ({
      account: x.account,
      platform: x.platform,
      platform_key: x.platform_key,
      platform_category: x.platform_category,
      entity_type: x.entity_type,
      followers: x.followers,
      following: x.following,
      likes: x.likes,
      views: x.views,
      comments: x.comments,
      members: x.members,
      posts_24h: x.posts_24h,
      message_volume_24h: x.message_volume_24h,
      extra: x.extra || {},
    }));
    return { ok: true, sent: batch.length, response: r, items_summary };
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
          const patch = { ...(msg.patch || {}) };
          const currentCfg = await getConfig();
          const hasAnyToken = !!(patch.operator_token || (currentCfg && currentCfg.operator_token));
          let resolved = decodeOperatorFromJwt(patch.operator_token || (currentCfg && currentCfg.operator_token));
          if (hasAnyToken) {
            try {
              const forceResolve = await resolveOperatorWithServer({ ...currentCfg, ...patch }, true);
              if (forceResolve && forceResolve.operator_uid) resolved = forceResolve;
            } catch (rErr) { /* 网络不通时 fallback 用 JWT decode 或已有值 */ }
          }
          if (resolved && resolved.operator_uid) {
            patch.operator_uid = resolved.operator_uid;
            patch.operator_name = resolved.operator_name || patch.operator_name || (currentCfg && currentCfg.operator_name) || '';
          }
          const cfg = await setConfig(patch);
          sendResponse({ ok: true, config: cfg, resolved_operator: resolved || null });
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
            if (!tab.id || !tab.url || /^chrome:\/\/|^edge:\/\/|^about:|^chrome-extension:\/\//i.test(tab.url)) {
              sendResponse({ ok: false, error: '当前页签不支持采集（浏览器内置页面）。请在小红书/抖音/X等平台页面上使用。' });
              return;
            }
            let res = null;
            try {
              res = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, { type: 'MATRIX_COLLECT_TRIGGER' }, (r) => {
                  const err = chrome.runtime.lastError;
                  if (err) reject(new Error(err.message || 'send_message_failed'));
                  else resolve(r);
                });
              });
            } catch (_sendErr) {
              try {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
                await new Promise(r => setTimeout(r, 350));
              } catch (injErr) {
                sendResponse({
                  ok: false,
                  error: '当前站点未在扩展 host_permissions 中，或浏览器禁止注入：' + ((injErr && injErr.message) || String(injErr)),
                });
                return;
              }
              try {
                res = await new Promise((resolve, reject) => {
                  chrome.tabs.sendMessage(tab.id, { type: 'MATRIX_COLLECT_TRIGGER' }, (r2) => {
                    const err2 = chrome.runtime.lastError;
                    if (err2) reject(new Error(err2.message || 'send_message_failed_after_inject'));
                    else resolve(r2);
                  });
                });
              } catch (e2) {
                sendResponse({
                  ok: false,
                  error: '注入 content.js 后仍无响应，请手动刷新当前页面后重试：' + (e2 && e2.message ? e2.message : String(e2)),
                });
                return;
              }
            }
            if (res && res.ok === false) {
              sendResponse({
                ok: false,
                error: (res.reason || res.error || '采集失败') + (res.note ? ' ('+res.note+')' : ''),
                code: res.code || null,
                collect: res && res.record ? { record: res.record, items: [res.record] } : null,
              });
              return;
            }
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
