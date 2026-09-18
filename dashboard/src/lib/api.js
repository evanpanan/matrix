import { PLATFORM_META, PLATFORM_LOGOS, PLATFORM_METRIC_SEMANTICS } from './mockData.js';

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
    const token = sessionStorage.getItem(JWT_STORAGE_KEY) || localStorage.getItem(JWT_STORAGE_KEY) || _jwtToken;
    if (token) out['Authorization'] = `Bearer ${token}`;
  } catch { /* noop */ }
  return out;
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

export function setJwtToken(token, refresh) {
  _jwtToken = token || null;
  try {
    if (token) {
      sessionStorage.setItem(JWT_STORAGE_KEY, token);
      localStorage.setItem(JWT_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(JWT_STORAGE_KEY);
      localStorage.removeItem(JWT_STORAGE_KEY);
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
    sessionStorage.removeItem(JWT_STORAGE_KEY);
    localStorage.removeItem(JWT_STORAGE_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.clear();
  } catch { /* noop */ }
  if (typeof _notifyAuth === 'function') _notifyAuth({ token: null, user: null, uid: null, role: null, ready: true });
}

export async function fetchWhoami() {
  const storedUid = getStoredUid();
  try {
    const data = await safeFetch(`${API_BASE}/whoami`);
    if (data && data.uid) {
      setStoredUid(data.uid);
      return {
        uid: data.uid,
        name: data.name,
        role: data.role,
        machine_id: data.machine_id,
        from_token: !!data.from_token,
        username: data.username,
        display_name: data.display_name,
        email: data.email,
        avatar_gradient: data.avatar_gradient,
        avatar_data_url: data.avatar_data_url,
      };
    }
  } catch {}
  return null;
}

function buildEmptyShell(uid, operators) {
  const emptyArr = [];
  const safeOperators = Array.isArray(operators) ? operators : [];
  const currentUser = (safeOperators && safeOperators.length)
    ? (safeOperators.find(o => o.operator_uid === uid) || safeOperators[0])
    : { operator_uid: uid || 'admin_001', operator_name: '未登录演示', role: 'operator' };
  return transformLive({
    currentUser,
    operators: safeOperators,
    operatorStats: emptyArr,
    totalFollowers: 0,
    totalMembers: 0,
    totalViews7d: 0,
    platformCount: 0,
    accountCount: 0,
    communityCount: 0,
    abnormalCount: 0,
    latestRecords: emptyArr,
    platformTraffic: emptyArr,
    trend: emptyArr,
    aiDiagnosis: emptyArr,
    viralAlerts: emptyArr,
    platforms: emptyArr,
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
    stocktwits_monitors: emptyArr,
    reddit_monitors: emptyArr,
    post_frequency_calendar: {
      days: [],
      platforms: [],
      hourly_distribution: Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, by_platform: {} })),
      total_days: 0,
      total_value: 0,
      active_days: 0,
    },
  });
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
  const emptyArr = [];

  if (!data) {
    return buildEmptyShell(uid, []);
  }

  const operators = data.operators && data.operators.length ? data.operators : [];
  const currentUser = (data.current_user && data.current_user.uid)
    ? {
        operator_uid: data.current_user.uid,
        operator_name: data.current_user.name || data.current_user.uid,
        role: data.current_user.role || 'operator',
      }
    : (operators.find(o => o.operator_uid === uid) || operators[0] || { operator_uid: uid || 'admin_001', operator_name: '管理员', role: 'admin' });
  const latestRecordsLive = data.latest_records || [];
  const latestRecords = latestRecordsLive.map((r) => {
    if (!r || typeof r !== 'object') return r;
    return r;
  });
  const computeLiveDiagnosis = (list) => {
    const diag = [];
    if (!Array.isArray(list) || list.length === 0) {
      diag.push({
        id: 'diag_empty', type: 'data_missing', icon: 'Database',
        title: '📭 暂无真实采集数据',
        desc: '请打开采集器或用采集插件浏览目标账号 / 股票 / 社区，首次采集后看板即可显示完整模块',
        target_ids: [], severity: 'minor',
      });
      return diag;
    }
    const abnormalDrop = list.filter(r => {
      if (r.entity_type === 'ACCOUNT') return Number(r.followers || 0) === 0 && Number(r.views || 0) === 0;
      return Number(r.members || 0) === 0;
    });
    if (abnormalDrop.length > 0) {
      diag.push({
        id: 'diag_abn_' + abnormalDrop.length,
        type: 'abnormal_drop', icon: 'AlertOctagon',
        title: `🔴 ${abnormalDrop.length} 个对象数据为 0 / 疑似掉线`,
        desc: '建议检查指纹浏览器登录态 / 采集器 Token / 插件 Network 请求',
        target_ids: abnormalDrop.slice(0, 4).map(r => r.id),
        severity: abnormalDrop.length >= 3 ? 'critical' : 'major',
      });
    }
    const stalled = list.filter(r => !r.updated_at || (Date.now() - new Date(r.updated_at).getTime() > 24 * 3600 * 1000));
    if (stalled.length > 3) {
      diag.push({
        id: 'diag_sta_' + stalled[0]?.id,
        type: 'stalled_data', icon: 'AlertTriangle',
        title: `⚡ ${stalled[0]?.account || '监测对象'} 数据断更超 24h`,
        desc: '最近一次上报超过 24 小时，疑似采集规则失效或被风控',
        target_ids: stalled.slice(0, 3).map(r => r.id), severity: 'major',
      });
    }
    const sortedByViews = list.slice().sort((a, b) => (Number(b.views || 0) - Number(a.views || 0)));
    const poor = sortedByViews.slice(-Math.min(3, Math.ceil(sortedByViews.length * 0.15)));
    if (poor.length >= 2 && Number(poor[poor.length - 1]?.views || 0) > 0) {
      diag.push({
        id: 'diag_perf_' + poor[0]?.id,
        type: 'reading_drop', icon: 'TrendingDown',
        title: `📉 尾部 ${poor.length} 个账号曝光低迷，建议参考历史爆款选题节奏`,
        desc: '建议结合爆款 Top20 封面与标题结构优化下周内容节奏',
        target_ids: poor.map(r => r.id), severity: 'minor',
      });
    }
    return diag;
  };
  const aiDiagnosis = (Array.isArray(data.ai_diagnosis) && data.ai_diagnosis.length > 0)
    ? data.ai_diagnosis
    : computeLiveDiagnosis(latestRecordsLive);
  const viralAlerts = (Array.isArray(data.viral_alerts) && data.viral_alerts.length > 0)
    ? data.viral_alerts
    : [];
  const trendLive = data.trend || [];
  const trendPlatformDim = Array.isArray(trendLive) && trendLive.length > 0 &&
    trendLive.some(row => Object.keys(row).some(k => k !== 'date' && typeof row[k] === 'number' && !isFinite(row.updated_at)));
  const builtRecords = buildTrendFromRecords(data.all_records || data.daily_trend || [], days);
  const trend = trendPlatformDim
    ? trendLive
    : (builtRecords.length > 0
        ? builtRecords
        : []);
  const out = transformLive({
    currentUser,
    operators,
    operatorStats: (Array.isArray(data.operator_stats) && data.operator_stats.length > 0 && data.operator_stats.some(s => (s.accounts_count || 0) + (s.communities_count || 0) > 0))
      ? data.operator_stats
      : emptyArr,
    totalFollowers: (typeof data.total_followers === 'number')
      ? data.total_followers
      : 0,
    totalMembers: (typeof data.total_members === 'number')
      ? data.total_members
      : 0,
    totalViews7d: (typeof data.total_views_7d === 'number')
      ? data.total_views_7d
      : 0,
    platformCount: (typeof data.platform_count === 'number')
      ? data.platform_count
      : 0,
    accountCount: (typeof data.account_count === 'number')
      ? data.account_count
      : 0,
    communityCount: (typeof data.community_count === 'number')
      ? data.community_count
      : 0,
    abnormalCount: (typeof data.abnormal_count === 'number')
      ? data.abnormal_count
      : 0,
    latestRecords,
    platformTraffic: (data.platform_traffic && (Array.isArray(data.platform_traffic) || Object.keys(data.platform_traffic || {}).length > 0))
      ? buildTrafficFromLive(data.platform_traffic)
      : emptyArr,
    trend,
    aiDiagnosis,
    viralAlerts,
    platforms: dedupPlatforms(data.platforms || []),
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
    stocktwits_monitors: (Array.isArray(data.stocktwits_monitors) && data.stocktwits_monitors.length > 0)
      ? data.stocktwits_monitors.map((r, i) => mapRecordLive(r, i))
      : emptyArr,
    reddit_monitors: (Array.isArray(data.reddit_monitors) && data.reddit_monitors.length > 0)
      ? data.reddit_monitors.map((r, i) => mapRecordLive(r, i))
      : emptyArr,
    post_frequency_calendar: (() => {
      const raw = data.post_frequency_calendar || null;
      if (!raw || typeof raw !== 'object') {
        return {
          days: [],
          platforms: [],
          hourly_distribution: Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, by_platform: {} })),
          total_days: 0,
          total_value: 0,
          active_days: 0,
        };
      }
      const days = (Array.isArray(raw.days) ? raw.days : []).map((d) => ({
        date: String(d.date || ''),
        total: Number(d.total || 0),
        by_platform: (d.by_platform && typeof d.by_platform === 'object')
          ? Object.fromEntries(Object.entries(d.by_platform).map(([k, v]) => [String(k), Number(v || 0)]))
          : {},
      }));
      const platforms = (Array.isArray(raw.platforms) ? raw.platforms : []).map((p) => {
        const meta = resolvePlatform(p.key || p.name || '');
        return {
          key: String(p.key || meta.key || ''),
          name: String(p.name || meta.name || p.key || 'Platform'),
          color: String(p.color || meta.color || '#6366f1'),
          category: String(p.category || meta.category || ''),
          logo: p.logo || meta.logo || null,
        };
      }).filter((p) => p.key);
      const hourly = (Array.isArray(raw.hourly_distribution) && raw.hourly_distribution.length > 0)
        ? raw.hourly_distribution.map((h) => ({
            hour: Number(h.hour ?? 0),
            total: Number(h.total || 0),
            by_platform: (h.by_platform && typeof h.by_platform === 'object')
              ? Object.fromEntries(Object.entries(h.by_platform).map(([k, v]) => [String(k), Number(v || 0)]))
              : {},
          }))
        : Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, by_platform: {} }));
      // Normalize hourly to exactly 24 buckets (index 0-23), missing fill 0
      const byHour = new Map(hourly.map((x) => [x.hour, x]));
      const hourlyOut = Array.from({ length: 24 }, (_, h) => {
        if (byHour.has(h)) return byHour.get(h);
        return { hour: h, total: 0, by_platform: {} };
      });
      return {
        days,
        platforms,
        hourly_distribution: hourlyOut,
        total_days: Number(raw.total_days || days.length),
        total_value: Number(raw.total_value || days.reduce((a, d) => a + (d.total || 0), 0)),
        active_days: Number(raw.active_days || days.reduce((a, d) => a + ((d.total || 0) > 0 ? 1 : 0), 0)),
      };
    })(),
  });
  return out;
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

function mapRecordLive(r, i) {
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
  const pk = r.platform_key || meta.key;
  const pm = PLATFORM_METRIC_SEMANTICS[pk] || { volume_label: '核心指标', volume_algo: 'posts_views_sum', interaction_label: '互动', interaction_algo: 'interactions_abs' };
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
    avatar_url: r.avatar_url || null,
    avatar_data_url: r.avatar_data_url || null,
    avatar_gradient: r.avatar_gradient || ['#6366f1,#8b5cf6', '#0ea5e9,#22d3ee', '#f59e0b,#ef4444', '#10b981,#14b8a6', '#ec4899,#f43f5e', '#4263EB,#3b82f6', '#FF4500,#f59e0b'][i % 7],
    _metric: pm,
  };
  if (entityType === 'ACCOUNT') {
    const followers = Number(r.followers || r.fans || 0);
    const views = Number(r.views || r.reads || 0);
    const likes = Number(r.likes || r.like_count || 0);
    const comments = Number(r.comments || r.comment_count || 0);
    const collect = Number(r.collect || r.shares || 0);
    const eng = views > 0 ? ((likes + comments + collect) / views * 100) : 0;
    const er = Number(r.engagement_rate || eng).toFixed(2);
    const recWithMetric = { ...rec, _metric: pm };
    return {
      ...recWithMetric,
      followers, views, likes, comments, collect,
      engagement_rate: Number(er),
      abnormal: (followers === 0 && views === 0) || !!r.extra?.error || !!r.abnormal,
      posts: Array.isArray(r.posts) ? r.posts : [],
      daily_trend: Array.isArray(r.daily_trend) ? r.daily_trend : [],
    };
  } else {
    const recWithMetric = { ...rec, _metric: pm };
    const out = {
      ...recWithMetric,
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
}

function transformLive(d) {
  d.latestRecords = (d.latestRecords || []).map((r, i) => mapRecordLive(r, i));
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
  const rows = (records || []).filter(r => r.entity_type === 'ACCOUNT');
  const headers = [
    '对象', '类型', '平台', '归属运营', '上报人', '机器', '粉丝/成员', '阅读/曝光/消息24h', '互动率%', '最后上报',
  ];
  const body = rows.map(r => [
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
    [headers, ...body]
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

// ============================================================
// 帖子去重工具（L3 展示兜底，也可被前端任何列表复用）
// ============================================================
export function normalizeWeiboUrl(href) {
  if (!href) return '';
  try {
    const u = href.indexOf('://') > 0 ? href : ('https://weibo.com' + (href[0]==='/' ? '' : '/') + href);
    const url = new URL(u);
    const m = url.pathname.match(/(?:\/status\/|\/detail\/|\/weibo\/|\/\d\/)([A-Za-z0-9]+)/) || url.pathname.match(/\/(\d{6,})(?:\?|#|$)/);
    return m ? 'weibo://' + m[1] : '';
  } catch { return ''; }
}
export function normalizePostKey(platformKey, href, title, publishedAt) {
  platformKey = platformKey || '';
  if (platformKey === 'weibo') {
    const w = normalizeWeiboUrl(href);
    if (w) return w;
  }
  try {
    if (href) {
      const u = new URL(href, location.href);
      const g = (u.hostname + u.pathname).toLowerCase().replace(/\/+$/, '');
      if (g) return g;
    }
  } catch {}
  return ((title || '').toString().slice(0, 30) + '|' + (publishedAt || '0'));
}
/**
 * 帖子去重（保持首次出现顺序稳定）
 * @param {Array} posts 
 * @param {String} defaultPlatformKey 
 * @returns {Array} 去重后的 posts
 */
export function dedupPosts(posts, defaultPlatformKey) {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i] || {};
    const key = normalizePostKey(
      p.platform_key || defaultPlatformKey || '',
      p.url,
      p.title,
      p.published_at
    );
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

const JWT_STORAGE_KEY = 'matrix_jwt_token';
const REFRESH_KEY = 'matrix.jwt.refresh';

let _jwtToken = null;
try { _jwtToken = localStorage.getItem(JWT_STORAGE_KEY) || sessionStorage.getItem(JWT_STORAGE_KEY) || null; } catch {}
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
  const snap = { token: access || null, ready: true, mode: 'jwt' };
  if (user) {
    snap.user = user;
    snap.uid = user.uid || user.operator_uid || user.id;
    snap.role = user.role || 'operator';
    snap.isAuthenticated = true;
    snap.requireAuth = true;
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
  const snap = { token, ready: true, mode: 'jwt', requireAuth: true };
  if (payload) {
    snap.uid = payload.sub || payload.uid || payload.user_id;
    snap.role = payload.role || 'operator';
    snap.user = {
      uid: snap.uid,
      operator_name: payload.name || payload.username || '免登录用户',
      role: snap.role,
    };
    snap.isAuthenticated = true;
  }
  _notifyAuth(snap);
  try {
    const me = await fetchWhoami();
    if (me && me.uid) {
      const merge = { isAuthenticated: true, mode: 'jwt', requireAuth: true, user: { uid: me.uid, operator_name: me.name, role: me.role || snap.role }, uid: me.uid, role: me.role || snap.role };
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
  const snap = { token: access || null, ready: true, mode: 'jwt', requireAuth: true };
  if (user) {
    snap.user = user;
    snap.uid = user.uid || user.operator_uid || user.id;
    snap.role = user.role || 'operator';
    snap.isAuthenticated = true;
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
    requireAuth: true,
    mode: 'jwt',
    token: _jwtToken,
    isAuthenticated: !!user,
    user: user ? {
      uid: user.uid,
      operator_name: user.name,
      role: user.role || 'operator',
      machine_id: user.machine_id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      avatar_gradient: user.avatar_gradient,
      avatar_data_url: user.avatar_data_url,
    } : null,
    uid: user?.uid || null,
    role: user?.role || null,
  };
  _notifyAuth(snap);
  return snap;
}

export async function adminApi(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (_jwtToken && !headers.Authorization) headers.Authorization = `Bearer ${_jwtToken}`;
  if (opts.body !== undefined && opts.body !== null && !headers['Content-Type']) {
    if (typeof opts.body === 'string') {
      let t = null;
      try { t = opts.body.trim().charAt(0); } catch {}
      if (t === '{' || t === '[') headers['Content-Type'] = 'application/json';
    } else if (opts.body instanceof FormData) {
      // browser sets multipart boundary automatically
    } else {
      headers['Content-Type'] = 'application/json';
    }
  }
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

export async function listCollectorTokens() {
  return adminApi('/user/me/collector-tokens', { method: 'GET' });
}

export async function listOperators() {
  return adminApi('/admin/operators', { method: 'GET' });
}

export async function createCollectorToken(label, expires_days, operator_uid) {
  const body = {
    label: label || '未命名采集器',
    expires_days: Number(expires_days) > 0 ? Number(expires_days) : 365,
  };
  if (operator_uid) body.operator_uid = operator_uid;
  const endpoint = operator_uid ? '/admin/collector-tokens' : '/user/me/collector-tokens';
  return adminApi(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function revokeCollectorToken(id) {
  return adminApi(`/user/me/collector-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listCollectorMachines(collectorId) {
  return adminApi(`/user/me/collector-tokens/${encodeURIComponent(collectorId)}/machines`, { method: 'GET' });
}

export async function adminListSystemFlags() {
  return adminApi('/admin/system-flags', { method: 'GET' });
}

export async function adminPatchSystemFlags(flags) {
  return adminApi('/admin/system-flags', {
    method: 'PATCH',
    body: JSON.stringify(flags || []),
  });
}

export async function adminClearData(scope = 'all') {
  return adminApi('/admin/clear-data', {
    method: 'POST',
    body: JSON.stringify({ scope: scope || 'all', confirm: true }),
  });
}

export async function adminDeleteAccount(accountId, { onlyRecords = false } = {}) {
  const suffix = onlyRecords ? `/${encodeURIComponent(accountId)}/records` : `/${encodeURIComponent(accountId)}`;
  return adminApi(`/admin/accounts${suffix}`, { method: 'DELETE' });
}

export async function adminListMonitoredStocks({ q = '', page = 1, size = 50 } = {}) {
  const qs = new URLSearchParams({ q: q || '', page, size });
  return adminApi(`/admin/monitored-stocks?${qs.toString()}`, { method: 'GET' });
}

export async function adminAddMonitoredStock(body) {
  return adminApi('/admin/monitored-stocks', {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

export async function adminDeleteMonitoredStock(accountId) {
  return adminApi(`/admin/monitored-stocks/${encodeURIComponent(accountId)}?confirm=true`, { method: 'DELETE' });
}

export async function adminListMonitoredCommunities({ q = '', page = 1, size = 50 } = {}) {
  const qs = new URLSearchParams({ q: q || '', page, size });
  return adminApi(`/admin/monitored-communities?${qs.toString()}`, { method: 'GET' });
}

export async function adminAddMonitoredCommunity(body) {
  return adminApi('/admin/monitored-communities', {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}

export async function adminDeleteMonitoredCommunity(accountId) {
  return adminApi(`/admin/monitored-communities/${encodeURIComponent(accountId)}?confirm=true`, { method: 'DELETE' });
}

export async function adminUpdateAccountLogo(accountId, { avatar_data_url, avatar_url } = {}) {
  return adminApi(`/admin/accounts/${encodeURIComponent(accountId)}/logo`, {
    method: 'PUT',
    body: JSON.stringify({ avatar_data_url: avatar_data_url ?? null, avatar_url: avatar_url ?? null }),
  });
}

export async function adminSiteOverview() {
  return adminApi('/admin/site-overview', { method: 'GET' });
}

export { PLATFORM_META, PLATFORM_LOGOS };

