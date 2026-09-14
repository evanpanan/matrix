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

function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

async function bg(msgType, payload = {}) {
  try {
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: msgType, ...payload }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || 'runtime_error'));
        else resolve(resp);
      });
    });
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function getStatusFromBg() {
  const r = await bg('MATRIX_GET_STATUS');
  if (r && r.ok) return r;
  return { ok: false, config: { ...DEFAULTS }, status: {}, queue_length: 0 };
}

function cfgToBgPatch(cfg) {
  return {
    server_url: cfg.serverUrl || DEFAULTS.serverUrl,
    operator_uid: cfg.opUid || DEFAULTS.opUid,
    operator_name: cfg.opName || '',
    operator_token: cfg.opToken || '',
    machine_name: cfg.machineName || DEFAULTS.machineName,
    webhook_url: cfg.webhook || '',
  };
}

function bgConfigToCfg(bgCfg) {
  return {
    serverUrl: bgCfg.server_url || DEFAULTS.serverUrl,
    opUid: bgCfg.operator_uid || DEFAULTS.opUid,
    opName: bgCfg.operator_name || '',
    opToken: bgCfg.operator_token || '',
    machineName: bgCfg.machine_name || DEFAULTS.machineName,
    machineId: bgCfg.machine_id || '',
    webhook: bgCfg.webhook_url || '',
  };
}

async function loadCfg() {
  const r = await getStatusFromBg();
  if (r && r.config) return bgConfigToCfg(r.config);
  return { ...DEFAULTS };
}

async function saveCfg(cfg) {
  const patch = cfgToBgPatch(cfg);
  const r = await bg('MATRIX_SET_CONFIG', { patch });
  if (r && r.ok && r.config) return bgConfigToCfg(r.config);
  return cfg;
}

let _lastQueueLen = 0;
let _localTodayN = 0;
let _localLastCollectAt = 0;
let _localLastFlushAt = 0;
let _localLastHeartbeatAt = 0;
let _localLastConnStatus = null;
let _localLastCollectorId = null;
let _localLastBootstrapSite = null;

function setQueueLen(n) { _lastQueueLen = Number(n) || 0; $('queueBadge').textContent = String(_lastQueueLen); }
function getQueueLen() { return _lastQueueLen; }

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
    const site_prefix = (parts[0] || '').toLowerCase();
    const collector_prefix = (parts[1] || '').toLowerCase();
    return {
      legacy: false,
      raw: t,
      site_prefix,
      collector_prefix,
      collector_id: `col_${collector_prefix}`,
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
  const r = await bg('MATRIX_HEARTBEAT');
  if (!r || !r.ok) throw new Error((r && r.error) || 'heartbeat failed');
  _localLastHeartbeatAt = Date.now();
  let cid = null;
  if (r.hb && r.hb.collector && r.hb.collector.collector_id) cid = r.hb.collector.collector_id;
  if (!cid && r.status && r.status.collector && r.status.collector.collector_id) cid = r.status.collector.collector_id;
  if (!cid && cfg && cfg.opToken) {
    const parsed = parseCollectorToken(cfg.opToken || '');
    if (parsed && (parsed.collector_id || parsed.raw)) {
      cid = parsed.collector_id || parsed.collector_prefix || parsed.raw;
    }
  }
  if (cid) _localLastCollectorId = cid;
  if (r.status) {
    if (r.status.heartbeat === 'error') throw new Error(r.status.last_error || 'heartbeat error');
    setQueueLen(r.status.pending_count || 0);
  }
  return r.hb || { authorized: false };
}

async function flushQueue(cfg) {
  const r = await bg('MATRIX_FLUSH');
  if (!r) throw new Error('flush failed');
  if (r.ok === false) throw new Error(r.error || 'flush error');
  _localLastFlushAt = Date.now();
  setQueueLen(r.pending != null ? r.pending : (getQueueLen() - (r.sent || 0)));
  const backendAccepted = r && r.response ? (r.response.accepted ?? r.sent) : r.sent;
  const backendReceived = r && r.response ? (r.response.received ?? r.sent) : r.sent;
  const viralCount = r && r.response ? (r.response.viral_events ?? 0) : 0;
  const serverSummary = r && r.response && r.response.items_summary ? r.response.items_summary : null;
  const localSummary = r.items_summary || serverSummary || null;
  return {
    received: backendReceived,
    accepted: backendAccepted,
    sent: r.sent || 0,
    viral_events: viralCount,
    items_summary: localSummary,
  };
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
  const bgSt = (bootstrapResult && bootstrapResult.status) || {};
  $('lastHb').textContent = fmtRel(_localLastHeartbeatAt || bgSt.last_hb_at || 0);
  $('lastFlush').textContent = fmtRel(_localLastFlushAt || bgSt.last_flush_at || 0);
  $('lastCollect').textContent = fmtRel(_localLastCollectAt || bgSt.last_collect_at || 0);
  $('todayN').textContent = Number(_localTodayN || 0).toLocaleString();
  $('colId').textContent = _localLastCollectorId || (cfg && (parseCollectorToken(cfg.opToken || '')?.collector_id || parseCollectorToken(cfg.opToken || '')?.collector_prefix || parseCollectorToken(cfg.opToken || '')?.raw)) || '—';
  setQueueLen(getQueueLen() || bgSt.pending_count || 0);
  const conn = _localLastConnStatus;
  if (conn === 'ok') { $('connStatus').innerHTML = '<span style="color:#047857;">● 已连接</span>'; }
  else if (conn === 'fail') { $('connStatus').innerHTML = '<span style="color:#b91c1c;">✗ 失败</span>'; }
  else { $('connStatus').textContent = '—'; }
}

function showErrorBox(msg) {
  const b = $('errorBox');
  if ($('warningBox').style.display === 'block') $('warningBox').style.display = 'none';
  if ($('successBox').style.display === 'block') $('successBox').style.display = 'none';
  b.style.display = 'block';
  b.textContent = msg || '';
  setTimeout(() => {
    if ($('errorBox').textContent === (msg || '')) { $('errorBox').style.display = 'none'; }
  }, 14000);
}
function showSuccessBox(msg) {
  const b = $('successBox');
  if ($('errorBox').style.display === 'block') $('errorBox').style.display = 'none';
  if ($('warningBox').style.display === 'block') $('warningBox').style.display = 'none';
  b.style.display = 'block';
  b.style.whiteSpace = 'pre-wrap';
  b.style.lineHeight = '1.45';
  b.textContent = msg || '';
  setTimeout(() => {
    if ($('successBox').textContent === (msg || '')) { $('successBox').style.display = 'none'; }
  }, 12000);
}
function showWarningBox(msg) {
  const b = $('warningBox');
  if ($('errorBox').style.display === 'block') $('errorBox').style.display = 'none';
  if ($('successBox').style.display === 'block') $('successBox').style.display = 'none';
  b.style.display = 'block';
  b.style.whiteSpace = 'pre-wrap';
  b.style.lineHeight = '1.55';
  b.textContent = msg || '';
  setTimeout(() => {
    if ($('warningBox').textContent === (msg || '')) { $('warningBox').style.display = 'none'; }
  }, 14000);
}

function fmtNum(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  const x = Number(n);
  if (!isFinite(x)) return '—';
  if (x >= 100000000) return (x / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (x >= 10000) return (x / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return x.toLocaleString();
}

function summarizeCollectRecord(rec, showRawFieldsFirst=false) {
  if (!rec) return '';
  const parts = [];
  parts.push(`[${rec.platform || rec.platform_key || '未知平台'}]`);
  const name = String(rec.account || '(无名账号)').slice(0, 24);
  parts.push(name);
  if (rec.extra && rec.extra.native_account_id) parts.push(`ID:${rec.extra.native_account_id}`);

  if (rec.extra && showRawFieldsFirst && rec.extra.raw_fields && typeof rec.extra.raw_fields === 'object') {
    const raw = rec.extra.raw_fields;
    Object.keys(raw).forEach(k => {
      const v = raw[k];
      if (typeof v === 'number' && v > 0) parts.push(`${k} ${fmtNum(v)}`);
      else if (typeof v === 'string' && v) parts.push(`${k} ${String(v).slice(0,12)}`);
    });
  }

  if (rec.entity_type === 'COMMUNITY') {
    if (rec.members) parts.push(`成员 ${fmtNum(rec.members)}`);
    if (rec.message_volume_24h) parts.push(`24h帖 ${fmtNum(rec.message_volume_24h)}`);
    if (rec.extra) {
      if (rec.extra.symbol) parts.push(`代码 ${rec.extra.symbol}`);
      if (rec.extra.subreddit) parts.push(`r/${rec.extra.subreddit}`);
      if (rec.extra.channel) parts.push(`@${rec.extra.channel}`);
    }
  } else {
    if (rec.followers) parts.push(`粉丝 ${fmtNum(rec.followers)}`);
    if (rec.following) parts.push(`关注 ${fmtNum(rec.following)}`);
    if (rec.likes) parts.push(`获赞 ${fmtNum(rec.likes)}`);
    if (rec.views) parts.push(`浏览 ${fmtNum(rec.views)}`);
    if (rec.comments) parts.push(`评论 ${fmtNum(rec.comments)}`);
    const postCount = Array.isArray(rec.posts) ? rec.posts.length : (rec.posts_24h || 0);
    if (postCount) parts.push(`作品 ${fmtNum(postCount)}`);
  }
  return parts.join(' · ');
}

function summarizeFlushItems(items) {
  if (!items || !items.length) return '';
  const arr = Array.isArray(items) ? items : [items];
  return arr.slice(0, 8).map((it, idx) => {
    const head = `${idx + 1}.`;
    return `${head} ${summarizeCollectRecord(it)}`;
  }).join('\n');
}

async function refreshFullUi() {
  try {
    setStatusPill('grey', '连接中…');
    const stRsp = await getStatusFromBg();
    const bgCfg = stRsp.config || {};
    const bgStatus = stRsp.status || {};
    setQueueLen(stRsp.queue_length || 0);

    let cfg = bgConfigToCfg(bgCfg);
    cfg = { ...DEFAULTS, ...(cfg || {}) };
    if (!cfg.machineId) {
      cfg.machineId = bgCfg.machine_id || 'ext_' + Math.random().toString(36).slice(2,8) + '_' + Date.now().toString(36).slice(-6);
      await saveCfg(cfg);
    }
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

    refreshStatusUiFromState(cfg, { status: bgStatus });
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
      _localLastConnStatus = 'fail';
      $('bindBadge').className = 'tag tag-err';
      $('bindBadge').textContent = '后端未通';
      $('mServerHand').textContent = '—';
      showErrorBox('连接后端失败：' + (e.message || '请检查后端地址是否正确、服务是否已启动、以及 CORS 是否放行。'));
      refreshStatusUiFromState(cfg, { status: bgStatus });
      setButtonsDisabled(false);  // 后端没通也允许本地采集（队列留着未来同步）
      return;
    }
    _localLastConnStatus = 'ok';
    const siteInfo = bootstrap && bootstrap.site;
    _localLastBootstrapSite = siteInfo || null;
    const tokenIdent = bootstrap && bootstrap.token_identity;
    const tErr = bootstrap && bootstrap.token_error;

    const identityOpName = tokenIdent && tokenIdent.operator_name;
    const identityOpUid = tokenIdent && tokenIdent.operator_uid;
    const identityColLabel = tokenIdent && tokenIdent.label;

    // 更新 token identity
    $('tIdentTxt').textContent = identityOpName
      ? `${identityOpName}（${identityOpUid}）· ${identityColLabel || '采集器'}`
      : (tokenIdent && tokenIdent.valid === false ? 'Token 无效' : (parsed?.legacy ? '（旧格式无身份信息）' : '—'));

    // 如果 token 已解析出身份，强制回填到输入框（防止用户手填旧值造成幻觉）
    const opSelectEl = $('opSelect');
    const opNameEl = $('opName');
    if (identityOpUid) {
      opSelectEl.value = identityOpUid;
      opSelectEl.readOnly = true;
      opSelectEl.style.opacity = '0.75';
      opSelectEl.title = '身份由采集器 Token 绑定决定，请勿手动修改';
    } else {
      opSelectEl.readOnly = false;
      opSelectEl.style.opacity = '1';
      opSelectEl.title = '';
    }
    if (identityOpName) {
      if (!opNameEl.value || (cfg.opName && tokenIdent && tokenIdent.from_resolve === true)) {
        opNameEl.value = identityOpName;
      }
      opNameEl.placeholder = identityOpName;
    }

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
      _localLastHeartbeatAt = Date.now();
      if (hb && hb.authorized) {
        if (match !== 'mismatch') {
          setStatusPill('green', '心跳正常');
        }
      }
    } catch (_hbErr) { /* ignore, bootstrap already worked */ }
    refreshStatusUiFromState(cfg, { status: bgStatus });
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
    _localLastHeartbeatAt = Date.now();
    _localLastConnStatus = 'ok';
    refreshStatusUiFromState(cfg, null);
    showSuccessBox('✓ 心跳成功：authorized=' + (d && d.authorized) + ', site=' + (d.site && d.site.site_name));
  } catch (e) {
    _localLastConnStatus = 'fail';
    refreshStatusUiFromState(await loadCfg() || DEFAULTS, null);
    showErrorBox('心跳失败：' + (e && e.message ? e.message : e));
  }
}

async function onFlush() {
  try {
    const cfg = (await loadCfg()) || DEFAULTS;
    const d = await flushQueue(cfg);
    const lines = [];
    lines.push(`✓ 同步完成：已发送 ${d.sent} 条，后端接收 ${d.received}，入库 accepted ${d.accepted}` + (d.viral_events ? `，🔥 爆款 ${d.viral_events}` : ''));
    if (d.items_summary) {
      const sum = summarizeFlushItems(d.items_summary);
      if (sum) { lines.push(''); lines.push('📋 同步摘要：'); lines.push(sum); }
    }
    if (d.accepted > 0 && d.sent > d.accepted) {
      lines.push(''); lines.push('⚠️ ' + (d.sent - d.accepted) + ' 条未入库，可在 chrome://extensions 查看 Service Worker 日志');
    }
    showSuccessBox(lines.join('\n'));
    refreshStatusUiFromState(cfg, null);
  } catch (e) {
    showErrorBox('同步失败：' + (e && e.message ? e.message : e));
  }
}

async function onCollectThisPage() {
  const cfg = (await loadCfg()) || DEFAULTS;
  const parsed = parseCollectorToken(cfg.opToken || '');
  const match = evaluateMatch(parsed, _localLastBootstrapSite || null, null);
  if (match === 'mismatch') {
    showErrorBox('站点不匹配，禁止采集！请先换正确 Token 或修改后端地址。');
    return;
  }
  try {
    const r = await bg('MATRIX_TRIGGER_CURRENT');
    const isWarn = (!r || r.ok) ? false : true;
    const rawItems = (r && r.collect && r.collect.items) ? r.collect.items : [];
    const singleRecord = (r && r.collect && r.collect.record) ? r.collect.record : null;
    const allRecords = rawItems.length ? rawItems : (singleRecord ? [singleRecord] : []);
    const collected = allRecords.length || (r && r.ok ? 1 : 0);
    if (!isWarn) {
      _localLastCollectAt = Date.now();
      _localTodayN = Number(_localTodayN || 0) + collected;
      const stRsp = await getStatusFromBg();
      setQueueLen(stRsp.queue_length || 0);
      refreshStatusUiFromState(cfg, null);
    } else {
      refreshStatusUiFromState(cfg, null);
    }
    const lines = [];
    if (!isWarn) {
      lines.push(`✓ 采集完成：${collected} 条已入队（当前待同步 ${getQueueLen()}）`);
      if (allRecords.length) {
        lines.push(''); lines.push('📋 采集摘要：');
        allRecords.slice(0, 5).forEach((rec, idx) => {
          const s = summarizeCollectRecord(rec, true);
          if (s) lines.push(`${idx + 1}. ${s}`);
        });
        if (allRecords.length > 5) lines.push(`… 以及其余 ${allRecords.length - 5} 条`);
      }
      lines.push(''); lines.push('👉 点击「立即同步全部」即可发送到后端');
      showSuccessBox(lines.join('\n'));
    } else {
      const errMsg = (r && r.error) || '采集失败';
      const code = (r && r.code) || '';
      const hint = (r && r.hint) || (r && r.record && r.record.error_hint) || '';
      lines.push('⚠️ ' + errMsg);
      if (code === 'NOT_PROFILE_PAGE') {
        lines.push('');
        lines.push('💡 说明：矩阵只采集【具体账号主页 / 具体作品页】，不会采集平台首页、搜索、活动、推荐流等聚合页，避免数据被无关账号污染。');
        if (hint) lines.push('👉 ' + hint);
      } else if (code === 'GENERIC_ACCOUNT_NAME') {
        lines.push('');
        lines.push('💡 说明：你在平台首页 / 控制台 / 推荐流页，当前还没打开【具体账号主页】。');
        lines.push('👉 正确操作示例：');
        lines.push('   • 公众号：打开某一篇公众号文章页或该公众号的"全部文章"列表页（不是你的后台首页 mp.weixin.qq.com/cgi-bin/home）');
        lines.push('   • 抖音：打开创作者个人主页（不是首页/精选/推荐流）');
        lines.push('   • 小红书：打开某个人主页（user/profile/xxx），不是首页/发现页/搜索页');
      } else if (code === 'NO_SIGNAL_METRICS') {
        lines.push('');
        lines.push('💡 当前页没抽到粉丝/关注/浏览/点赞等数据，可能是页面没加载完，或当前不是目标账号主页。');
        lines.push('👉 操作：确认是目标账号主页 → 手动向下滚动或刷新页面 → 再点一次「采集当前页」。');
      } else if (code === 'UNSUPPORTED_HOST') {
        lines.push('');
        lines.push('💡 说明：当前域名不是矩阵支持的平台（小红书/抖音/X/IG 等），请切换到对应平台。');
        if (hint) lines.push('👉 ' + hint);
      } else if (code && code !== 'EMPTY_ACCOUNT_NAME') {
        lines.push('');
        lines.push('（错误码：' + code + '，用于诊断）');
      }
      if (hint && code !== 'NOT_PROFILE_PAGE' && code !== 'UNSUPPORTED_HOST') {
        lines.push('👉 ' + hint);
      }
      if (allRecords.length) {
        lines.push('');
        lines.push('📎 本次抽到的原始字段（未入库，用于诊断）：');
        allRecords.slice(0, 3).forEach((rec, idx) => {
          const s = summarizeCollectRecord(rec, true);
          if (s) lines.push(`${idx + 1}. ${s}`);
        });
      }
      showWarningBox(lines.join('\n'));
    }
  } catch (e) {
    showErrorBox('采集失败：' + (e && e.message ? e.message : e));
  }
}

async function onResetCfg() {
  if (!confirm('确定要重置所有本地配置吗？（队列与采集历史不会删除）')) return;
  try {
    await bg('MATRIX_SET_CONFIG', {
      patch: {
        server_url: DEFAULTS.serverUrl,
        operator_uid: DEFAULTS.opUid,
        operator_name: '',
        operator_token: '',
        machine_name: DEFAULTS.machineName,
        webhook_url: '',
      },
    });
  } catch {}
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
