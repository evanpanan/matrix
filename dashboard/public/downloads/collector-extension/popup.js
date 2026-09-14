/* Matrix Collector popup.js v2.1
 * 重点新增：
 *  1. Token 前缀解析：mxtok_{site6}_{col8}_{rand}
 *  2. 双向匹配：token 解析的 site6 vs bootstrap 返回的 site.site_prefix 对得上才 OK
 *  3. 站点不匹配 → 禁用采集按钮 + 红框告警
 *  4. 状态分级：绿(已绑定) / 黄(兼容未授权) / 橙(网络异常) / 红(不匹配)
 *  5. 去掉 tailwindcdn，全部内联样式 + DOM 操作
 */

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  serverUrl: 'http://localhost:8000',
  opUid: 'op_001',
  opName: '',
  machineName: (() => {
    try {
      const p = (navigator.platform || '').replace(/\s+/g, '');
      return `Collector-${p || 'Device'}`;
    } catch { return 'Collector-Device'; }
  })(),
};

const STORE_KEY = 'matrix_collector_cfg_v2';
const QUEUE_KEY = 'matrix_collector_queue_v1';
const STATE_KEY = 'matrix_collector_state_v1';

function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

async function loadCfg() {
  try {
    const raw = await new Promise(r => chrome.storage.local.get([STORE_KEY], v => r(v && v[STORE_KEY])));
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}
async function saveCfg(cfg) {
  try {
    await new Promise(r => chrome.storage.local.set({ [STORE_KEY]: JSON.stringify(cfg) }, r));
  } catch {}
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch {}
}

function getQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function setQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q || []));
  $('queueBadge').textContent = String(q ? q.length : 0);
}
function getState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function setState(patch) {
  const s = { ...getState(), ...patch };
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
  return s;
}

function nowShort(tsMs) {
  if (!tsMs) return '—';
  try {
    const d = new Date(Number(tsMs));
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch { return '—'; }
}

function fmtRel(tsMs) {
  if (!tsMs) return '从未';
  const sec = Math.floor((Date.now() - Number(tsMs)) / 1000);
  if (sec < 60) return `${sec}s 前`;
  if (sec < 3600) return `${Math.floor(sec/60)}m 前`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h 前`;
  return `${Math.floor(sec/86400)}d 前`;
}

function parseCollectorToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = token.trim();
  if (!t.startsWith('mxtok_')) return { legacy: true, raw: t };
  const rest = t.slice('mxtok_'.length);
  const parts = rest.split('_');
  if (parts.length >= 3) {
    return {
      legacy: false,
      raw: t,
      site_prefix: (parts[0] || '').toLowerCase(),
      collector_prefix: (parts[1] || '').toLowerCase(),
      tail: parts.slice(2).join('_'),
    };
  }
  return { legacy: true, raw: t };
}

function setStatusPill(kind, text) {
  const pill = $('statePill');
  const map = {
    green: 'status-green',
    yellow: 'status-yellow',
    orange: 'status-orange',
    red: 'status-red',
    grey: 'status-grey',
  };
  pill.className = 'pill ' + (map[kind] || 'status-grey');
  $('stateText').textContent = text || '';
}

function setSiteBanner(siteInfo, match) {
  const banner = $('siteBanner');
  if (!siteInfo || !siteInfo.site_id) {
    banner.className = 'site-banner status-grey';
    $('siteHcChar').textContent = 'MX';
    $('siteNameTxt').textContent = '未连接后端';
    $('siteHandshakeTxt').textContent = '—';
    $('sitePrefixTxt').textContent = 'prefix: —';
    $('siteMatchBadge').className = 'tag tag-info';
    $('siteMatchBadge').textContent = '无连接';
    return;
  }
  const hand = siteInfo.handshake_code || 'MX-XXXX-XXXX';
  const chars = hand.replace(/[^A-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'MX';
  $('siteHcChar').textContent = chars;
  $('siteNameTxt').textContent = siteInfo.site_name || '未命名站点';
  $('siteHandshakeTxt').textContent = hand;
  $('sitePrefixTxt').textContent = 'prefix: ' + (siteInfo.site_prefix || '—');
  const badge = $('siteMatchBadge');
  if (match === 'match') {
    banner.className = 'site-banner status-green';
    badge.className = 'tag tag-ok';
    badge.textContent = '✓ 双向匹配';
  } else if (match === 'mismatch') {
    banner.className = 'site-banner status-red';
    badge.className = 'tag tag-err';
    badge.textContent = '✗ 站点不匹配';
  } else if (match === 'notoken') {
    banner.className = 'site-banner status-yellow';
    badge.className = 'tag tag-warn';
    badge.textContent = '未绑定Token';
  } else if (match === 'compat-ok') {
    banner.className = 'site-banner status-yellow';
    badge.className = 'tag tag-warn';
    badge.textContent = '兼容旧Token';
  } else {
    banner.className = 'site-banner status-orange';
    badge.className = 'tag tag-info';
    badge.textContent = '校验中';
  }
}

function setButtonsDisabled(yes) {
  $('triggerBtn').disabled = !!yes;
  $('flushBtn').disabled = !!yes;
}

async function api(url, opts = {}) {
  const cfg = (await loadCfg()) || DEFAULTS;
  const base = (cfg.serverUrl || DEFAULTS.serverUrl).replace(/\/+$/, '');
  const full = /^https?:\/\//i.test(url) ? url : (base + url);
  const res = await fetch(full, {
    method: 'GET',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const detail = (data && data.detail) ? data.detail : `HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function doBootstrap(cfg) {
  const token = (cfg && cfg.opToken) || '';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  return await api('/api/collector/bootstrap' + (qs ? `?${qs}` : ''));
}

async function doHeartbeat(cfg, extra) {
  const machineId = cfg.machineId || getState().machineId;
  return await api('/api/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      machine_id: machineId,
      machine_name: cfg.machineName || DEFAULTS.machineName,
      operator_uid: cfg.opUid,
      operator_name: cfg.opName || '',
      operator_token: cfg.opToken || null,
      version: '2.1.0',
      source: 'chrome_extension',
      pending_count: (getQueue() || []).length,
      last_collect_at: getState().lastCollectAt || 0,
      timestamp_ms: Date.now(),
      user_agent: navigator.userAgent,
      ...(extra || {}),
    }),
  });
}

async function flushQueue(cfg) {
  const q = getQueue();
  if (!q || q.length === 0) return { accepted: 0, received: 0 };
  const machineId = cfg.machineId || getState().machineId;
  const data = await api('/api/collect-data', {
    method: 'POST',
    body: JSON.stringify({
      machine_id: machineId,
      machine_name: cfg.machineName || DEFAULTS.machineName,
      operator_uid: cfg.opUid,
      operator_name: cfg.opName || '',
      operator_token: cfg.opToken || null,
      webhook_url: cfg.webhook || null,
      version: '2.1.0',
      source: 'chrome_extension',
      items: q,
    }),
  });
  if (data && data.accepted) {
    const drop = Math.min(q.length, Number(data.accepted) || q.length);
    setQueue(q.slice(drop));
    setState({ lastFlushAt: Date.now() });
  }
  return data || { received: q.length, accepted: 0 };
}

async function fillOpDatalist(bootstrap) {
  const dl = $('opDatalist');
  dl.innerHTML = '';
  const ops = (bootstrap && bootstrap.operators) || [];
  ops.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.operator_uid;
    opt.textContent = `${o.operator_name} (${o.operator_uid})`;
    dl.appendChild(opt);
  });
}

function evaluateMatch(parsedToken, siteInfo, tokenIdentity) {
  // 返回: match | mismatch | notoken | compat-ok | unknown
  if (!parsedToken) return 'notoken';
  if (parsedToken.legacy) {
    // 旧 token：只要 token_identity.valid 就算兼容
    if (tokenIdentity && tokenIdentity.valid === true) return 'compat-ok';
    if (tokenIdentity && tokenIdentity.valid === false) return 'mismatch';
    return 'compat-ok';
  }
  if (!siteInfo || !siteInfo.site_prefix) return 'unknown';
  if (String(siteInfo.site_prefix || '').toLowerCase() !== String(parsedToken.site_prefix || '').toLowerCase()) {
    return 'mismatch';
  }
  if (tokenIdentity) {
    if (tokenIdentity.valid === false) return 'mismatch';
    if (tokenIdentity.valid === true) return 'match';
  }
  return 'match';
}

function refreshStatusUiFromState(cfg, bootstrapResult) {
  const st = getState();
  $('lastHb').textContent = fmtRel(st.lastHeartbeatAt);
  $('lastFlush').textContent = fmtRel(st.lastFlushAt);
  $('lastCollect').textContent = fmtRel(st.lastCollectAt);
  $('todayN').textContent = Number(st.todayRecords || 0).toLocaleString();
  $('colId').textContent = st.lastCollectorId || (cfg && parseCollectorToken(cfg.opToken || '')?.collector_prefix) || '—';
  $('queueBadge').textContent = String((getQueue() || []).length);
  const conn = st.lastConnStatus;
  if (conn === 'ok') { $('connStatus').innerHTML = '<span style="color:#047857;">● 已连接</span>'; }
  else if (conn === 'fail') { $('connStatus').innerHTML = '<span style="color:#b91c1c;">✗ 失败</span>'; }
  else { $('connStatus').textContent = '—'; }
}

function showErrorBox(msg) {
  const b = $('errorBox');
  b.style.display = 'block';
  b.textContent = msg || '';
  setTimeout(() => {
    if ($('errorBox').textContent === (msg || '')) { $('errorBox').style.display = 'none'; }
  }, 9000);
}
function showSuccessBox(msg) {
  const b = $('successBox');
  b.style.display = 'block';
  b.textContent = msg || '';
  setTimeout(() => {
    if ($('successBox').textContent === (msg || '')) { $('successBox').style.display = 'none'; }
  }, 4500);
}

async function refreshFullUi() {
  try {
    setStatusPill('grey', '连接中…');
    let cfg = await loadCfg();
    cfg = { ...DEFAULTS, ...(cfg || {}) };
    if (!cfg.machineId) {
      cfg.machineId = 'ext_' + Math.random().toString(36).slice(2,8) + '_' + Date.now().toString(36).slice(-6);
      await saveCfg(cfg);
    }
    const st = getState();
    if (!st.machineId) setState({ machineId: cfg.machineId });
    // 填表
    $('opSelect').value = cfg.opUid || DEFAULTS.opUid;
    $('opName').value = cfg.opName || DEFAULTS.opName;
    $('opToken').value = cfg.opToken || '';
    $('machineName').value = cfg.machineName || DEFAULTS.machineName;
    $('machineId').value = cfg.machineId || '';
    $('serverUrl').value = cfg.serverUrl || DEFAULTS.serverUrl;
    $('webhook').value = cfg.webhook || '';

    const parsed = parseCollectorToken(cfg.opToken || '');
    if (parsed && !parsed.legacy) {
      $('tokenParsedBox').style.display = 'grid';
      $('tSitePrefix').textContent = parsed.site_prefix || '—';
      $('tColPrefix').textContent = parsed.collector_prefix || '—';
    } else if (parsed && parsed.legacy && parsed.raw) {
      $('tokenParsedBox').style.display = 'grid';
      $('tSitePrefix').textContent = 'legacy';
      $('tColPrefix').textContent = 'legacy';
    } else {
      $('tokenParsedBox').style.display = 'none';
    }

    refreshStatusUiFromState(cfg, null);
    $('compatWarn').style.display = (cfg.opToken && cfg.opToken.trim()) ? 'none' : 'block';
    $('tokenStatus').className = 'tag ' + ((cfg.opToken && cfg.opToken.trim()) ? 'tag-info' : 'tag-warn');
    $('tokenStatus').textContent = (cfg.opToken && cfg.opToken.trim()) ? '已填写' : '未设置';

    // 站点不匹配告警先隐藏
    $('siteMismatchBox').style.display = 'none';

    // 1) 调 bootstrap
    let bootstrap = null;
    try {
      bootstrap = await doBootstrap(cfg);
      fillOpDatalist(bootstrap);
    } catch (e) {
      setStatusPill('orange', '连接异常');
      setSiteBanner(null, 'unknown');
      setState({ lastConnStatus: 'fail' });
      $('bindBadge').className = 'tag tag-err';
      $('bindBadge').textContent = '后端未通';
      $('mServerHand').textContent = '—';
      showErrorBox('连接后端失败：' + (e.message || '请检查后端地址是否正确、服务是否已启动、以及 CORS 是否放行。'));
      refreshStatusUiFromState(cfg, null);
      setButtonsDisabled(false);  // 后端没通也允许本地采集（队列留着未来同步）
      return;
    }
    setState({ lastConnStatus: 'ok' });
    const siteInfo = bootstrap && bootstrap.site;
    const tokenIdent = bootstrap && bootstrap.token_identity;
    const tErr = bootstrap && bootstrap.token_error;

    // 更新 token identity
    $('tIdentTxt').textContent = (tokenIdent && tokenIdent.operator_name)
      ? `${tokenIdent.operator_name}（${tokenIdent.operator_uid}）· ${tokenIdent.label || '采集器'}`
      : (tokenIdent && tokenIdent.valid === false ? 'Token 无效' : (parsed?.legacy ? '（旧格式无身份信息）' : '—'));

    // 匹配评估
    let match = evaluateMatch(parsed, siteInfo, tokenIdent);
    if (tErr === 'wrong_site') match = 'mismatch';
    else if (tErr === 'invalid_token' || tErr === 'revoked' || tErr === 'expired') {
      if (match !== 'mismatch' && match !== 'match') match = (cfg.opToken && cfg.opToken.trim()) ? 'mismatch' : 'notoken';
    }
    setSiteBanner(siteInfo, match);

    // 状态 pill 与 bindBadge + mismatch banner + 按钮禁用
    if (match === 'mismatch' || tErr === 'wrong_site') {
      setStatusPill('red', '站点不匹配');
      $('bindBadge').className = 'tag tag-err';
      $('bindBadge').textContent = '禁止采集';
      $('siteMismatchBox').style.display = 'block';
      $('mServerHand').textContent = siteInfo ? `${siteInfo.site_name}（${siteInfo.handshake_code}·prefix:${siteInfo.site_prefix}）` : '—';
      $('mTokenHand').textContent = (parsed && !parsed.legacy) ? `prefix:${parsed.site_prefix}（采集器:${parsed.collector_prefix}）` : ((parsed && parsed.legacy) ? '兼容旧Token无法判断站点' : '—');
      $('tokenStatus').className = 'tag tag-err';
      $('tokenStatus').textContent =
        tErr === 'revoked' ? '已吊销' :
        tErr === 'expired' ? '已过期' :
        tErr === 'invalid_token' ? '无效' :
        (tErr === 'wrong_site' || match === 'mismatch') ? '归属站点不匹配' : '不匹配';
      setButtonsDisabled(true);
    } else if (match === 'match') {
      setStatusPill('green', '已就绪');
      $('bindBadge').className = 'tag tag-ok';
      $('bindBadge').textContent = '✓ 已绑定';
      $('tokenStatus').className = 'tag tag-ok';
      $('tokenStatus').textContent = '有效';
      setButtonsDisabled(false);
    } else if (match === 'compat-ok') {
      setStatusPill('yellow', '兼容模式');
      $('bindBadge').className = 'tag tag-warn';
      $('bindBadge').textContent = '旧Token·未授权';
      setButtonsDisabled(false);
    } else {
      // notoken / unknown
      setStatusPill('yellow', '未绑定');
      $('bindBadge').className = 'tag tag-warn';
      $('bindBadge').textContent = '未设置Token';
      setButtonsDisabled(false);
    }

    // 2) 立即试一次 heartbeat（只记录，失败不影响 UI）
    try {
      const hb = await doHeartbeat(cfg);
      setState({
        lastHeartbeatAt: Date.now(),
        lastCollectorId: (hb && hb.collector && hb.collector.collector_id) || null,
      });
      if (hb && hb.authorized) {
        // 有可能 bootstrap 没传 token，但 heartbeat 带 token 成功；统一回绿色
        if (match !== 'mismatch') {
          setStatusPill('green', '心跳正常');
        }
      }
    } catch (_hbErr) { /* ignore, bootstrap already worked */ }
    refreshStatusUiFromState(cfg, bootstrap);
  } catch (e) {
    console.error('[popup] refresh failed:', e);
    setStatusPill('orange', '状态异常');
    showErrorBox('刷新状态失败：' + (e && e.message ? e.message : e));
  }
}

/* ===== 按钮事件 ===== */

async function onSaveCfg() {
  try {
    const cfg = (await loadCfg()) || {};
    const newCfg = {
      ...cfg,
      opUid: $('opSelect').value.trim(),
      opName: $('opName').value.trim(),
      opToken: $('opToken').value,
      machineName: $('machineName').value.trim() || DEFAULTS.machineName,
      machineId: cfg.machineId || $('machineId').value.trim() || ('ext_' + Date.now().toString(36).slice(-10)),
      serverUrl: $('serverUrl').value.trim() || DEFAULTS.serverUrl,
      webhook: $('webhook').value.trim() || null,
    };
    await saveCfg(newCfg);
    showSuccessBox('✓ 配置已保存，正在重新校验双向握手…');
    await refreshFullUi();
  } catch (e) {
    showErrorBox('保存失败：' + (e && e.message ? e.message : e));
  }
}

async function onTestHb() {
  try {
    const cfg = (await loadCfg()) || DEFAULTS;
    const d = await doHeartbeat(cfg);
    setState({
      lastHeartbeatAt: Date.now(),
      lastCollectorId: (d && d.collector && d.collector.collector_id) || null,
      lastConnStatus: 'ok',
    });
    refreshStatusUiFromState(cfg, null);
    showSuccessBox('✓ 心跳成功：authorized=' + (d && d.authorized) + ', site=' + (d.site && d.site.site_name));
  } catch (e) {
    setState({ lastConnStatus: 'fail' });
    refreshStatusUiFromState(await loadCfg() || DEFAULTS, null);
    showErrorBox('心跳失败：' + (e && e.message ? e.message : e));
  }
}

async function onFlush() {
  try {
    const cfg = (await loadCfg()) || DEFAULTS;
    const d = await flushQueue(cfg);
    showSuccessBox('✓ 同步完成：received=' + d.received + ', accepted=' + d.accepted);
    refreshStatusUiFromState(cfg, null);
  } catch (e) {
    showErrorBox('同步失败：' + (e && e.message ? e.message : e));
  }
}

async function onCollectThisPage() {
  const cfg = (await loadCfg()) || DEFAULTS;
  const parsed = parseCollectorToken(cfg.opToken || '');
  // 匹配检查：先读 getState().bootstrapSite 做快速匹配
  const st = getState();
  const match = evaluateMatch(parsed, st.lastBootstrapSite || null, null);
  if (match === 'mismatch') {
    showErrorBox('站点不匹配，禁止采集！请先换正确 Token 或修改后端地址。');
    return;
  }
  try {
    const [tab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    if (!tab || !tab.id) throw new Error('找不到当前活动页签');
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'MATRIX_COLLECT_NOW' }, (resp) => {
        if (chrome.runtime.lastError || !resp) resolve({ ok: false, reason: 'content脚本未加载，请在支持的平台页面上采集。' });
        else resolve(resp);
      });
    });
    if (!result || result.ok === false) {
      throw new Error((result && result.reason) || '采集失败');
    }
    const items = Array.isArray(result.items) ? result.items : (result.item ? [result.item] : []);
    if (items.length === 0) throw new Error('页面没有可采集到的账号数据');
    const enriched = items.map(it => ({
      ...it,
      machine_id: cfg.machineId,
      machine_name: cfg.machineName,
      operator_uid: cfg.opUid,
      operator_name: cfg.opName,
      client_version: '2.1.0',
      source: 'chrome_extension',
      timestamp_ms: Date.now(),
    }));
    const q = getQueue();
    setQueue(q.concat(enriched));
    setState({
      lastCollectAt: Date.now(),
      todayRecords: Number(st.todayRecords || 0) + enriched.length,
    });
    refreshStatusUiFromState(cfg, null);
    showSuccessBox('✓ 采集完成：' + enriched.length + ' 条已入队，点击「立即同步全部」发送。');
  } catch (e) {
    showErrorBox('采集失败：' + (e && e.message ? e.message : e));
  }
}

async function onResetCfg() {
  if (!confirm('确定要重置所有本地配置吗？（队列与采集历史不会删除）')) return;
  try {
    await new Promise(r => chrome.storage.local.remove([STORE_KEY], r));
  } catch {}
  localStorage.removeItem(STORE_KEY);
  showSuccessBox('已重置，刷新后恢复默认');
  setTimeout(() => location.reload(), 600);
}

document.addEventListener('DOMContentLoaded', () => {
  $('saveBtn').addEventListener('click', onSaveCfg);
  $('testHbBtn').addEventListener('click', onTestHb);
  $('flushBtn').addEventListener('click', onFlush);
  $('triggerBtn').addEventListener('click', onCollectThisPage);
  $('resetCfg').addEventListener('click', onResetCfg);
  refreshFullUi();
});
