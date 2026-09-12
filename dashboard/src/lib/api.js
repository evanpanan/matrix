import { generateMockData, applyRBACFilter, generatePostsForAccount, generateDailyTrend, seeded, PLATFORM_META, OPERATORS, PLATFORM_LOGOS } from './mockData.js';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const SESSION_KEY = 'matrix_current_operator_uid';

function getStoredUid() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function setStoredUid(uid) {
  try {
    sessionStorage.setItem(SESSION_KEY, uid);
    localStorage.setItem(SESSION_KEY, uid);
  } catch { /* noop */ }
}

function getAuthHeaders() {
  const out = {};
  try {
    const token = sessionStorage.getItem('matrix_jwt_token') || localStorage.getItem('matrix_jwt_token') || _jwtToken;
    if (token) out['Authorization'] = `Bearer ${token}`;
  } catch { /* noop */ }
  return out;
}

export function setJwtToken(token, refresh) {
  _jwtToken = token || null;
  try {
    if (token) {
      sessionStorage.setItem('matrix_jwt_token', token);
      localStorage.setItem('matrix_jwt_token', token);
    } else {
      sessionStorage.removeItem('matrix_jwt_token');
      localStorage.removeItem('matrix_jwt_token');
    }
  } catch { /* noop */ }
  try {
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else if (refresh === null) localStorage.removeItem(REFRESH_KEY);
  } catch { /* noop */ }
  if (typeof _notifyAuth === 'function') _notifyAuth({ token: _jwtToken });
}

export function clearSession() {
  _jwtToken = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('matrix_jwt_token');
    localStorage.removeItem('matrix_jwt_token');
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.clear();
  } catch { /* noop */ }
  if (typeof _notifyAuth === 'function') _notifyAuth({ token: null, user: null, uid: null, role: null, ready: true });
}

async function safeFetch(url, opts = {}) {
  try {
    const headers = {
      ...(opts.headers || {}),
      ...getAuthHeaders(),
    };
    const r = await fetch(url, { ...opts, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    return null;
  }
}

export async function fetchWhoami() {
  const storedUid = getStoredUid();
  const data = await safeFetch(`${API_BASE}/whoami`);
  if (data && data.uid) {
    setStoredUid(data.uid);
    return {
      uid: data.uid,
      name: data.name,
      role: data.role,
      machine_id: data.machine_id,
      from_token: !!data.from_token,
    };
  }
  const fallback = OPERATORS.find(o => o.operator_uid === storedUid) || OPERATORS[0];
  return {
    uid: fallback.operator_uid,
    name: fallback.operator_name,
    role: fallback.role,
    machine_id: null,
    from_token: false,
  };
}

export async function fetchSummary(days = 30, operatorUid, role) {
  const uid = operatorUid || getStoredUid();
  if (uid) setStoredUid(uid);
  const params = new URLSearchParams();
  params.set('days', String(days));
  if (uid) params.set('operator_uid', uid);
  if (role) params.set('role', role);
  const url = `${API_BASE}/summary?${params.toString()}`;
  const data = await safeFetch(url);
  const fallbackMock = generateMockData();
  if (!data) {
    const filtered = uid ? applyRBACFilter(fallbackMock, uid) : fallbackMock;
    return transformLive(filtered);
  }
  const operators = OPERATORS;
  const currentUser = (data.current_user && data.current_user.uid)
    ? {
        operator_uid: data.current_user.uid,
        operator_name: data.current_user.name || data.current_user.uid,
        role: data.current_user.role || 'operator',
      }
    : (operators.find(o => o.operator_uid === uid) || operators[0]);
  const latestRecordsLive = data.latest_records || [];
  const postsRand = seeded(20260912 + (latestRecordsLive.length || 0));
  const latestRecords = latestRecordsLive.map((r, i) => {
    const pf = (r.platform_key && PLATFORM_META[r.platform_key]) ? r.platform_key : (r.platform && Object.values(PLATFORM_META).find(m => m.name === r.platform))?.key || 'tiktok';
    const baseViews = Number(r.views || r.message_volume_24h || r.avg_views_30d || 0) || (10000 + Math.floor(postsRand() * 120000));
    const baseLikes = Number(r.total_likes || r.views * 0.08 || 0) || Math.floor(baseViews * (0.05 + postsRand() * 0.1));
    const hasPosts = Array.isArray(r.posts) && r.posts.length > 0;
    const merge = transformRecordLive(r);
    if (!hasPosts) {
      merge.posts = generatePostsForAccount(postsRand, pf, baseViews, baseLikes, 0).slice(0, 10);
    }
    if (!merge.daily_trend || !Array.isArray(merge.daily_trend) || merge.daily_trend.length < 10) {
      const baseAud = Number(r.followers || r.members || 0) || 50000;
      const baseViewsTrend = Number(r.views || r.message_volume_24h || baseAud * 0.6) || 10000;
      merge.daily_trend = fallbackMock.latestRecords[i % fallbackMock.latestRecords.length]?.daily_trend || generateDailyTrend(postsRand, baseAud, baseViewsTrend);
    }
    return merge;
  });
  const aiDiagnosis = (Array.isArray(data.ai_diagnosis) && data.ai_diagnosis.length > 0)
    ? data.ai_diagnosis
    : fallbackMock.aiDiagnosis;
  const viralAlerts = (Array.isArray(data.viral_alerts) && data.viral_alerts.length > 0)
    ? data.viral_alerts
    : (fallbackMock.viralAlerts || []);
  const trendLive = data.trend || [];
  const trendPlatformDim = Array.isArray(trendLive) && trendLive.length > 0 &&
    trendLive.some(row => Object.keys(row).some(k => k !== 'date' && typeof row[k] === 'number' && !isFinite(row.updated_at)));
  const trend = trendPlatformDim
    ? trendLive
    : (buildTrendFromRecords(data.all_records || data.daily_trend || [], days).length > 0
        ? buildTrendFromRecords(data.all_records || data.daily_trend || [], days)
        : fallbackMock.trend);
  return transformLive({
    currentUser,
    operators,
    operatorStats: data.operator_stats || fallbackMock.operatorStats,
    totalFollowers: data.total_followers ?? fallbackMock.totalFollowers,
    totalMembers: data.total_members ?? fallbackMock.totalMembers,
    totalViews7d: data.total_views_7d ?? fallbackMock.totalViews7d,
    platformCount: data.platform_count ?? fallbackMock.platformCount,
    accountCount: data.account_count ?? fallbackMock.accountCount,
    communityCount: data.community_count ?? fallbackMock.communityCount,
    abnormalCount: data.abnormal_count ?? fallbackMock.abnormalCount,
    latestRecords,
    platformTraffic: (data.platform_traffic && (Array.isArray(data.platform_traffic) || Object.keys(data.platform_traffic).length > 0))
      ? buildTrafficFromLive(data.platform_traffic)
      : fallbackMock.platformTraffic,
    trend,
    aiDiagnosis,
    viralAlerts,
    platforms: dedupPlatforms(data.platforms),
    categories: [
      { key: 'all', name: '全部' },
      { key: '金融', name: '金融社区' },
      { key: '社媒', name: '国内社媒' },
      { key: '海外', name: '海外平台' },
      { key: '社区', name: '公开社区' },
    ],
    entityTypes: [
      { key: 'all', name: '全部类型' },
      { key: 'ACCOUNT', name: '仅账号' },
      { key: 'COMMUNITY', name: '仅社区' },
    ],
  });
}

function buildTrafficFromLive(pt) {
  if (Array.isArray(pt)) return pt.map(p => {
    const meta = resolvePlatform(p.name || p.key);
    return { name: p.name || meta.name, key: p.key || meta.key, value: Number(p.value || 0), color: meta.color, category: meta.category };
  });
  return Object.entries(pt || {}).map(([name, value]) => {
    const meta = resolvePlatform(name);
    return { name, value: Number(value || 0), color: meta.color, category: meta.category, key: meta.key };
  });
}

function resolvePlatform(ident) {
  const m = PLATFORM_META[ident];
  if (m) return m;
  const found = Object.values(PLATFORM_META).find(p => p.name === ident || p.key === ident);
  return found || { name: ident, key: (ident || 'other').toLowerCase(), category: '社媒', color: '#6366f1' };
}

function dedupPlatforms(list) {
  if (!list || !list.length) return Object.values(PLATFORM_META).filter((v, i, a) => a.findIndex(x => x.key === v.key) === i);
  const out = [];
  const seen = new Set();
  list.forEach(p => {
    const normalized = typeof p === 'string' ? resolvePlatform(p) : resolvePlatform(p.key || p.name);
    if (normalized && !seen.has(normalized.key)) {
      seen.add(normalized.key);
      out.push(normalized);
    }
  });
  return out;
}

function buildTrendFromRecords(records, days) {
  const byDay = {};
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start.getTime() - i * 86400000);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    byDay[key] = { date: key };
  }
  for (const r of records) {
    const raw = r.updated_at || r.date;
    if (!raw) continue;
    const d = raw.slice(5, 10).replace('-', '/');
    if (!byDay[d]) continue;
    const pf = r.platform || resolvePlatform(r.platform_key || '').name || '未知';
    const metric = Number(r.followers || r.members || 0);
    byDay[d][pf] = (byDay[d][pf] || 0) + metric;
  }
  const keys = Object.keys(byDay).sort();
  const platforms = new Set();
  keys.forEach(d => Object.keys(byDay[d]).forEach(k => k !== 'date' && platforms.add(k)));
  let prev = {};
  return keys.map(d => {
    const entry = { date: d };
    platforms.forEach(p => {
      const cur = byDay[d][p] ?? prev[p] ?? 0;
      entry[p] = cur;
      prev[p] = cur;
    });
    return entry;
  });
}

function transformLive(d) {
  d.latestRecords = (d.latestRecords || []).map((r, i) => {
    const key = r.platform_key || (r.platform || '').toLowerCase();
    const meta = PLATFORM_META[key] || PLATFORM_META[r.platform] || resolvePlatform(key);
    const entityType = r.entity_type || (r.symbol || r.subreddit ? 'COMMUNITY' : 'ACCOUNT');
    const assignedOpUid = r.assigned_operator_uid || r.assigned_operator_id || r.operator_uid;
    const assignedOpName = r.assigned_operator_name || r.operator_name || '未分配';
    let accountName = r.account || r.name;
    if (!accountName) {
      if (r.symbol) accountName = `$${r.symbol}`;
      else if (r.subreddit) accountName = `r/${r.subreddit}`;
      else accountName = '未知';
    }
    const rawId = r.id || `${entityType.toLowerCase()}_${key}_${accountName}_${i}`;
    const rawUrl = r.target_url || r.url || '#';
    const rec = {
      id: rawId,
      account: accountName,
      platform: r.platform || meta.name,
      platform_key: r.platform_key || meta.key,
      platform_category: r.platform_category || meta.category,
      entity_type: entityType,
      assigned_operator_uid: assignedOpUid,
      assigned_operator_name: assignedOpName,
      operator_uid: r.operator_uid || assignedOpUid,
      operator_name: r.operator_name || assignedOpName,
      machine_id: r.machine_id,
      machine_name: r.machine_name,
      client_version: r.client_version,
      updated_at: r.updated_at || new Date().toISOString(),
      url: sanitizeUrl(rawUrl),
      avatar_gradient: ['#6366f1,#8b5cf6', '#0ea5e9,#22d3ee', '#f59e0b,#ef4444', '#10b981,#14b8a6', '#ec4899,#f43f5e', '#4263EB,#3b82f6', '#FF4500,#f59e0b'][i % 7],
    };
      if (entityType === 'ACCOUNT') {
      const followers = Number(r.followers || r.fans || 0);
      const views = Number(r.views || r.reads || 0);
      const likes = Number(r.likes || r.like_count || 0);
      const comments = Number(r.comments || r.comment_count || 0);
      const collect = Number(r.collect || r.shares || 0);
      const eng = views > 0 ? ((likes + comments + collect) / views * 100) : 0;
      const er = Number(r.engagement_rate || eng).toFixed(2);
      return {
        ...rec,
        followers, views, likes, comments, collect,
        engagement_rate: Number(er),
        abnormal: (followers === 0 && views === 0) || !!r.extra?.error || !!r.abnormal,
        posts: Array.isArray(r.posts) ? r.posts : [],
        daily_trend: Array.isArray(r.daily_trend) ? r.daily_trend : [],
      };
    } else {
      const out = {
        ...rec,
        members: Number(r.members || r.watchers || 0),
        message_volume_24h: Number(r.message_volume_24h || r.msg_24h || 0),
        posts: Array.isArray(r.posts) ? r.posts : [],
        daily_trend: Array.isArray(r.daily_trend) ? r.daily_trend : [],
      };
      if (r.symbol !== undefined || r.platform_key === 'stocktwits' || /^\$/.test(rec.account)) {
        out.symbol = r.symbol || rec.account.replace(/^\$/, '');
        out.sentiment_bull = Number(r.sentiment_bull ?? r.bull ?? 50);
        out.sentiment_bear = Number(r.sentiment_bear ?? r.bear ?? 50);
        out.symbol_price = Number(r.symbol_price ?? r.price ?? 0);
        out.symbol_change_pct = Number(r.symbol_change_pct ?? r.change_pct ?? 0);
      }
      if (r.subreddit !== undefined || r.platform_key === 'reddit' || /^r\//.test(rec.account)) {
        out.subreddit = r.subreddit || rec.account.replace(/^r\//, '');
        out.online = Number(r.online ?? r.online_count ?? 0);
        out.posts_24h = Number(r.posts_24h ?? r.message_volume_24h ?? 0);
        if (!out.message_volume_24h) out.message_volume_24h = out.posts_24h;
      }
      out.abnormal = !!r.abnormal || out.members === 0 || (out.online !== undefined && out.online === 0);
      return out;
    }
  });
  if (!d.operatorStats?.length && d.operators) {
    d.operatorStats = d.operators
      .filter(op => op.role === 'operator')
      .map(op => {
        const mine = d.latestRecords.filter(r => r.assigned_operator_uid === op.operator_uid);
        const myAccounts = mine.filter(r => r.entity_type === 'ACCOUNT');
        const myCommunities = mine.filter(r => r.entity_type === 'COMMUNITY');
        const allPosts = mine.flatMap(r => r.posts || []);
        const bombCount = allPosts.filter(p => p.is_bomb).length;
        const bombRate = allPosts.length ? +(bombCount / allPosts.length * 100).toFixed(2) : 0;
        const totalPosts30d = Math.round(allPosts.length * 3.2);
        return {
          operator_uid: op.operator_uid,
          operator_name: op.operator_name,
          accounts_count: myAccounts.length,
          communities_count: myCommunities.length,
          total_followers: myAccounts.reduce((s, r) => s + r.followers, 0),
          total_members: myCommunities.reduce((s, r) => s + r.members, 0),
          abnormal_count: mine.filter(r => r.abnormal).length,
          bomb_rate: bombRate,
          total_posts_30d: totalPosts30d,
          records: mine,
        };
      });
  }
  return d;
}

export async function exportCSV(operatorUid) {
  try {
    const uid = operatorUid || getStoredUid();
    const params = new URLSearchParams();
    if (uid) params.set('operator_uid', uid);
    const qs = params.toString();
    const a = document.createElement('a');
    a.href = `${API_BASE}/export/csv${qs ? `?${qs}` : ''}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (e) {
    return false;
  }
}

export function exportCSVFromData(records) {
  const headers = [
    '对象', '类型', '平台', '归属运营', '上报人', '机器', '粉丝/成员', '阅读/曝光/消息24h', '互动率%', '最后上报',
  ];
  const rows = records.map(r => [
    r.account,
    r.entity_type === 'COMMUNITY' ? '社区' : '账号',
    r.platform,
    r.assigned_operator_name || '—',
    r.operator_name || '—',
    r.machine_name || r.machine_id || '—',
    r.entity_type === 'COMMUNITY' ? (r.members || 0) : (r.followers || 0),
    r.entity_type === 'COMMUNITY' ? (r.message_volume_24h || r.posts_24h || 0) : (r.views || 0),
    r.entity_type === 'COMMUNITY' ? '—' : (r.engagement_rate || 0),
    r.updated_at,
  ]);
  const csv =
    '\uFEFF' +
    [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `matrix_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function sanitizeUrl(u) {
  if (!u || typeof u !== 'string') return '#';
  const trimmed = u.trim();
  if (trimmed === '#' || trimmed === '') return '#';
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return '#';
  } catch {
    return '#';
  }
}

const JWT_KEY = 'matrix.jwt.access';
const REFRESH_KEY = 'matrix.jwt.refresh';

let _jwtToken = null;
try { _jwtToken = localStorage.getItem(JWT_KEY) || null; } catch {}
const _authListeners = new Set();
let _authSnapshot = { ready: false, token: _jwtToken, user: null, uid: null, role: null };

function _notifyAuth(next) {
  _authSnapshot = { ..._authSnapshot, ...next };
  _authListeners.forEach(fn => {
    try { fn(_authSnapshot); } catch {}
  });
}

export function subscribeAuth(fn) {
  if (typeof fn === 'function') _authListeners.add(fn);
  fn(_authSnapshot);
  return () => _authListeners.delete(fn);
}

export function getAuthSnapshot() {
  return { ..._authSnapshot };
}

export async function fetchSsoConfig() {
  try {
    const r = await safeFetch(`${API_BASE}/sso/config`);
    return r || { enabled: false, providers: [] };
  } catch {
    return { enabled: false, providers: [] };
  }
}

export async function loginWithPassword(username, password) {
  const url = `${API_BASE}/auth/login`;
  const r = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r) throw new Error('登录失败，请检查用户名密码');
  const access = r.access_token || r.data?.access_token || r.token;
  const refresh = r.refresh_token || r.data?.refresh_token;
  const user = r.current_user || r.user || r.data?.current_user || null;
  if (access) setJwtToken(access, refresh || null);
  const snap = { token: access || null, ready: true };
  if (user) {
    snap.user = user;
    snap.uid = user.uid || user.operator_uid || user.id;
    snap.role = user.role || 'operator';
  }
  _notifyAuth(snap);
  return snap;
}

export async function ssoPasteToken(paste) {
  if (!paste || typeof paste !== 'string') throw new Error('请粘贴有效的 token');
  const token = paste.trim();
  let payload = null;
  try {
    const parts = token.split('.');
    if (parts && parts[1]) payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {}
  setJwtToken(token, null);
  const snap = { token, ready: true };
  if (payload) {
    snap.uid = payload.sub || payload.uid || payload.user_id;
    snap.role = payload.role || 'operator';
    snap.user = {
      uid: snap.uid,
      operator_name: payload.name || payload.username || '免登录用户',
      role: snap.role,
    };
  }
  _notifyAuth(snap);
  try {
    const me = await fetchWhoami();
    if (me && me.uid) {
      const merge = { user: { uid: me.uid, operator_name: me.name, role: me.role || snap.role }, uid: me.uid, role: me.role || snap.role };
      _notifyAuth(merge);
      return { ...snap, ...merge };
    }
  } catch {}
  return snap;
}

export async function registerWithInvite({ username, email, password, invite_code }) {
  const r = await safeFetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, invite_code }),
  });
  if (!r || (r.error && !r.access_token && !r.data?.access_token)) {
    const msg = r?.message || r?.error || r?.detail || '注册失败，请检查邀请码或用户名';
    throw new Error(msg);
  }
  const access = r.access_token || r.data?.access_token;
  const refresh = r.refresh_token || r.data?.refresh_token;
  if (access) setJwtToken(access, refresh || null);
  const user = r.current_user || r.user || r.data?.current_user || null;
  const snap = { token: access || null, ready: true };
  if (user) {
    snap.user = user;
    snap.uid = user.uid || user.operator_uid || user.id;
    snap.role = user.role || 'operator';
  }
  _notifyAuth(snap);
  return snap;
}

export async function logout() {
  try {
    const token = _jwtToken;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    await safeFetch(`${API_BASE}/auth/logout`, { method: 'POST', headers, body: JSON.stringify({}) });
  } catch {}
  clearSession();
}

export async function initAuth() {
  let user = null;
  if (_jwtToken) {
    try { user = await fetchWhoami(); } catch { user = null; }
  }
  const snap = {
    ready: true,
    token: _jwtToken,
    user: user ? { uid: user.uid, operator_name: user.name, role: user.role || 'operator', machine_id: user.machine_id } : null,
    uid: user?.uid || null,
    role: user?.role || null,
  };
  _notifyAuth(snap);
  return snap;
}

export async function adminApi(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (_jwtToken && !headers.Authorization) headers.Authorization = `Bearer ${_jwtToken}`;
  if (opts.body && typeof opts.body !== 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return safeFetch(url, { ...opts, headers });
}

export async function fetchMe() {
  return adminApi('/user/me');
}

export async function updateMe(patch) {
  return adminApi('/user/me', { method: 'PATCH', body: JSON.stringify(patch || {}) });
}

export async function changePassword({ old_password, new_password }) {
  return adminApi('/user/me/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password, new_password }),
  });
}

export async function updateRecord(recordId, patch) {
  return adminApi(`/accounts/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch || {}),
  });
}

export { PLATFORM_META, OPERATORS, PLATFORM_LOGOS };
