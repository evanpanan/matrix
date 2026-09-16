/* ============================================================
 * Matrix Collector · content.js (MV3)
 * 功能：
 *   1. 自动识别当前 URL 所属平台
 *   2. DOM 解析：粉丝数 / 最新作品（标题 · 阅读/播放 · 点赞 · 评论 · 发布时间 · URL）
 *   3. 每 60s 自动采集一次 + 监听 SPA pushState 切换页面 + 支持手动 trigger
 *   4. 数据通过 chrome.runtime.sendMessage 发给 background.js 清洗后上报
 * ============================================================ */

(() => {
  'use strict';

  const PLATFORM_DETECTORS = [
    { key: 'xiaohongshu',   name: '小红书',     re: /(^|\.)xiaohongshu\.com$/i,         category: '社媒' },
    { key: 'douyin',        name: '抖音',       re: /(^|\.)douyin\.com$/i,              category: '社媒' },
    { key: 'wechat',        name: '微信公众号', re: /(^|\.)mp\.weixin\.qq\.com$/i,      category: '社媒' },
    { key: 'wechat_video',  name: '微信视频号', re: /channels\.weixin\.qq\.com/i,       category: '社媒' },
    { key: 'weibo',         name: '微博',       re: /(^|\.)weibo\.(com|cn)$/i,          category: '社媒' },
    { key: 'bilibili',      name: 'B 站',      re: /(^|\.)bilibili\.com$/i,             category: '社媒' },
    { key: 'zhihu',         name: '知乎',       re: /(^|\.)zhihu\.com$/i,               category: '社媒' },
    { key: 'tieba',         name: '百度贴吧',   re: /(^|\.)tieba\.baidu\.com$/i,        category: '社区' },

    { key: 'futu',          name: '富途牛牛',   re: /(^|\.)(futu\.moomoo|futunn|moomoo)\.com$/i, category: '金融' },
    { key: 'laohu',         name: '老虎社区',   re: /(^|\.)(laohu8|itiger)\.com$/i,     category: '金融' },
    { key: 'xueqiu',        name: '雪球',       re: /(^|\.)xueqiu\.com$/i,              category: '金融' },
    { key: 'changqiao',     name: '长桥',       re: /(^|\.)(changqiao|longbridge\.sg)\.com$/i, category: '金融' },

    { key: 'x',             name: 'X(Twitter)', re: /(^|\.)(x|twitter)\.com$/i,         category: '海外' },
    { key: 'tiktok',        name: 'TikTok',     re: /(^|\.)tiktok\.com$/i,              category: '海外' },
    { key: 'youtube',       name: 'YouTube',    re: /(^|\.)youtube\.com$/i,             category: '海外' },
    { key: 'linkedin',      name: 'LinkedIn',   re: /(^|\.)linkedin\.com$/i,            category: '海外' },
    { key: 'instagram',     name: 'Instagram',  re: /(^|\.)instagram\.com$/i,           category: '海外' },
    { key: 'telegram',      name: 'Telegram',   re: /(^|\.)(t|telegram)\.me$/i,         category: '海外' },
    { key: 'discord',       name: 'Discord',    re: /(^|\.)discord\.com$/i,             category: '海外' },

    { key: 'stocktwits',    name: 'Stocktwits', re: /(^|\.)stocktwits\.com$/i,          category: '社区' },
    { key: 'reddit',        name: 'Reddit',     re: /(^|\.)reddit\.com$/i,              category: '社区' },
    { key: 'seekingalpha',  name: 'Seeking Alpha', re: /(^|\.)seekingalpha\.com$/i,     category: '社区' },
  ];

  const PROFILE_URL_PATTERNS = {
    xiaohongshu:   { allow: [/^\/user\/profile\/[A-Za-z0-9_]+/i], deny: [/^\/(explore|discovery|search|$|home|index|shop|chat\/|result|item)/i], hint: '请打开某个人主页（URL 必须包含 /user/profile/xxx），不是笔记/发现/搜索/首页/活动' },
    douyin:        { allow: [/^\/user\/\w+/i, /^\/@[^/?#]+/i, /^\/video\/\w+/i], deny: [/^\/($|explore|search|jingxuan|recommend|discover|follow|hot)/i], hint: '请打开创作者个人主页（/user/xxx 或 @昵称）或具体视频页，不是精选/推荐/首页/搜索' },
    wechat:        { allow: [/^\/s\//i, /^\/mp\/profile_ext/i, /^\/cgi-bin\/home\?t=home\/index/i, /^\/\?action=home/i], deny: [/^\/cgi-bin\/(?!home|masssendpage|masssend)/i, /^\/mp\/appmsg\/template/i], hint: '请打开某一篇公众号文章页（URL 含 /s/）或该公众号的「全部文章」列表页，不是后台「首页」那种纯操作台' },
    x:             { allow: [/^\/[A-Za-z0-9_]{1,15}(\/|$|\?|#)/i, /^\/i\/communities\//i], deny: [/^\/($|home|explore|search|notifications|messages|compose\/post|i\/flow|settings|tos|privacy|signup|login)/i, /^\/hashtag\//i, /^\/search-advanced/i], hint: '请打开某个用户主页（x.com/用户名）或一条具体推文页，不是首页/探索/搜索/话题' },
    instagram:     { allow: [/^\/[A-Za-z0-9._-]{1,30}(\/|$|\?|#)/i, /^\/p\/\w+/i, /^\/reel\/\w+/i, /^\/stories\/[A-Za-z0-9._-]+/i], deny: [/^\/($|explore|reels|accounts|direct|emails|pwa|privacy|terms|about|developer|login|signup)/i, /^\/directory\//i, /^\/?next=/i], hint: '请打开某个人主页（instagram.com/用户名）或具体帖子页（/p/xxx），不是「发现 /explore」「Reels」「搜索」「登录」页' },
    weibo:         { allow: [/^\/u\/\d+/i, /^\/profile\.php/i, /^\/[A-Za-z0-9_-]+(\/|$)/i, /^\/\d+\/status\//i], deny: [/^\/($|home|search|discover|login|signup|pub|explore|message|notification|hot)/i], hint: '请打开某个微博主页（/u/数字ID）或具体微博页，不是首页/发现/搜索' },
    bilibili:      { allow: [/^\/space\/\w+/i, /^\/video\/BV\w+/i, /^\/read\/(cv|op)/i], deny: [/^\/($|video|anime|bangumi|cinema|guochuang|tv|gamecenter|live|article|shop|news|channel|game|help|privacy|search|login)/i], hint: '请打开某个 UP 主的空间（/space/xxx）或具体视频 BV 页，不是首页/分区/搜索' },
    zhihu:         { allow: [/^\/people\/[^/?#]+/i, /^\/org\/[^/?#]+/i, /^\/question\/\d+/i, /^\/p\/\d+/i, /^\/answer\/\d+/i], deny: [/^\/($|explore|hot|search|topic|column|question|organizations|signin|signup|appview|search_result)/i], hint: '请打开某个人主页（/people/昵称）或具体回答页，不是「首页」「热榜」「搜索」「话题」聚合页' },
    tiktok:        { allow: [/^\/@[^/?#]+/i, /^\/v\/\d+/i, /^\/video\/\d+/i], deny: [/^\/($|explore|foryou|following|search|login|signup|creator-center|about|press)/i], hint: '请打开创作者主页（/@昵称）或具体视频页（/v/数字ID），不是 For You / 发现 / 搜索' },
    youtube:       { allow: [/^\/(channel|c|user)\/[^/?#]+/i, /^\/@[^/?#]+/i, /^\/watch/i, /^\/shorts\/\w+/i], deny: [/^\/($|feed|results|premium|signin|signup|account|account_picker)/i, /^\/playlist\?list=/i], hint: '请打开某个频道页（/@用户名、/channel/xxx）或具体视频 /watch?v=xxx 页，不是首页/搜索结果/播放列表' },
    linkedin:      { allow: [/^\/in\/[^/?#]+/i, /^\/company\/[^/?#]+/i, /^\/jobs\/view\/\d+/i, /^\/posts\/[^/?#]+/i, /^\/pulse\/[^/?#]+/i], deny: [/^\/($|feed|mynetwork|jobs|messaging|notifications|search|signup|login|learning|solutions|products)/i], hint: '请打开某个人档案（/in/昵称）或公司主页（/company/xxx），不是 Feed / 我的人脉 / 搜索 聚合页' },
    telegram:      { allow: [/^\/s\/[A-Za-z0-9_]+/i, /^\/[A-Za-z0-9_]{4,}(\/|$)/i], deny: [/^\/($|api|apps|privacy|tos|dl|login|addstickers|setlanguage)/i], hint: '请打开某个频道预览页（t.me/频道名）或公开分享链接 /s/xxx，不是 Telegram 首页' },
    discord:       { allow: [/^\/channels\/\d+\/\d+/i, /^\/invite\/\w+/i], deny: [/^\/($|company|careers|download|branding|shop|nitro|safety|developers|applications|oauth2|login|register)/i], hint: '请打开某个服务器频道（/channels/服务器ID/频道ID）或邀请页，不是 Discord 公司官网' },
    stocktwits:    { allow: [/^\/[A-Za-z.]+(\/|$)/i, /^\/streams\/[^/?#]+/i, /^\/messages\/\d+/i, /^\/symbol\/[A-Za-z.]+/i], deny: [/^\/($|home|trending|watchlists|explore|login|signup|pricing|search|about|terms|privacy)/i], hint: '请打开某个用户主页（/用户名）或某只股票（/symbol/AAPL），不是 Trending / Watchlists / 首页' },
    reddit:        { allow: [/^\/r\/[A-Za-z0-9_]+(\/|$)/i, /^\/u(ser)?\/[A-Za-z0-9_-]+/i, /^\/comments\/\w+/i], deny: [/^\/($|hot|new|top|rising|search|settings|login|signup|prefs|submit|explore|wiki)/i, /^\/me(\/|$)/i], hint: '请打开某个子版块（/r/xxx）或用户页（/u/用户名）或具体帖子（/comments/xxx），不是首页 / hot / search' },
    xueqiu:        { allow: [/^\/\d+(\/|$)/i, /^\/people\/[^/?#]+/i, /^\/[A-Za-z0-9_]{4,}(\/|$)/i, /^\/s\/\w+/i], deny: [/^\/($|h|hq|stock|invest|discover|t|explore|login|signup|search|home|index|article)/i, /^\/(funds|etf|industries|options|bonds|ipo|holdings)\b/i], hint: '请打开某个用户主页（/people/昵称 或 /数字ID）或个股页，不是 雪球首页 / 行情中心 / 话题 / 搜索' },
    futu:          { allow: [/^\/u(ser)?\/\w+/i, /^\/[^/?#]*-u(ser)?-\d+/i, /^\/community\/post\/\w+/i, /^\/stock\/\w+/i], deny: [/^\/($|community|markets|news|fund|wealth|account|login|signup|search|appdownload|activity|open|promotion)/i], hint: '请打开某个用户主页（/user/xxx）或具体帖子 /community/post/xxx 或个股页，不是社区/行情/活动首页' },
    laohu:         { allow: [/^\/user\/\d+/i, /^\/community\/post\/\d+/i, /^\/stock\/[A-Za-z.]+/i], deny: [/^\/($|community|market|news|hot|discover|login|register|account|activity)/i], hint: '请打开某个用户主页（/user/数字ID）、具体社区帖（/community/post/xxx）或个股页，不是首页/社区聚合/行情' },
    seekingalpha:  { allow: [/^\/author\/[^/?#]+/i, /^\/article\/\w+/i, /^\/symbol\/[A-Za-z.]+/i], deny: [/^\/($|markets|earnings|news|dividends|ideas|investing|instablog|portfolio|login|signup|watchlists|premium)/i], hint: '请打开作者页（/author/昵称）、具体文章（/article/xxx）或个股（/symbol/AAPL），不是 Markets / News / 首页' },
    tieba:         { allow: [/^\/f\?kw=/i, /^\/f\/\w+/i, /^\/home\/main\?un=/i, /^\/p\/\d+/i], deny: [/^\/($|index|home|search|sign|login|register|discover|tiebaSquare|forum|forum\/)/i], hint: '请打开某个具体贴吧（?kw=xxx）或某个帖子（/p/数字ID）或用户主页（?un=xxx），不是贴吧首页/贴吧广场' },
    changqiao:     { allow: [/^\/u(ser)?\/[^/?#]+/i, /^\/post\/\w+/i, /^\/symbol\/[^/?#]+/i], deny: [/^\/($|community|market|news|activity|login|signup|account|search|index)/i], hint: '请打开某个用户主页（/user/xxx）、帖子页（/post/xxx）或个股页，不是社区/行情/活动聚合' },
  };

  /* ============ 官方监控白名单 (Admin 严格方案 A) ============ */
  let _cachedWhitelist = null;
  let _cachedWhitelistAt = 0;
  const WHITELIST_CACHE_MS = 15 * 1000;
  function getMonitorWhitelist(force = false) {
    return new Promise((resolve) => {
      const now = Date.now();
      if (!force && _cachedWhitelist && (now - _cachedWhitelistAt) < WHITELIST_CACHE_MS) {
        resolve(_cachedWhitelist || []);
        return;
      }
      try {
        chrome.storage.local.get(['monitor_whitelist'], (v) => {
          const list = Array.isArray(v?.monitor_whitelist) ? v.monitor_whitelist : [];
          _cachedWhitelist = list;
          _cachedWhitelistAt = now;
          resolve(list);
        });
      } catch {
        resolve([]);
      }
    });
  }
  function symbolFromStocktwitsUrl() {
    const m = (location.pathname || '').match(/\/symbol\/([A-Za-z.]+)/i);
    if (m) return m[1].toUpperCase();
    const m2 = (location.pathname || '').match(/^\/([A-Z.]{1,8})(\/|$|\?|#)/);
    if (m2 && /^[A-Z.]{1,8}$/.test(m2[1])) return m2[1].toUpperCase();
    return '';
  }
  function subredditFromRedditUrl() {
    const m = (location.pathname || '').match(/\/r\/([A-Za-z0-9_-]+)/i);
    return m ? m[1].toLowerCase() : '';
  }
  function extractMonitorTargetKey(platform) {
    if (platform?.key === 'stocktwits') {
      const sym = symbolFromStocktwitsUrl();
      if (sym) return { entity_type: 'STOCK', key: sym };
      const path = (location.pathname || '');
      const m = path.match(/^\/([A-Za-z.]+)(\/|$|\?|#)/);
      if (m && m[1]) {
        const candidate = String(m[1]);
        if (!/^(home|trending|watchlists|explore|login|signup|pricing|search|about|terms|privacy|streams|messages|symbol|premium|discover|$)/i.test(candidate)) {
          return { entity_type: 'ACCOUNT', key: candidate };
        }
      }
      return null;
    }
    if (platform?.key === 'reddit') {
      const sub = subredditFromRedditUrl();
      if (sub) {
        const userPath = (location.pathname || '').match(/\/u(ser)?\//i);
        if (userPath) return null;
        return { entity_type: 'SUBREDDIT', key: sub };
      }
    }
    return null;
  }
  async function whitelistMatch(platform) {
    const target = extractMonitorTargetKey(platform);
    if (!target) return null;
    const list = await getMonitorWhitelist(false);
    if (!list || list.length === 0) return null;
    const normKey = String(target.key).toLowerCase();
    for (const row of list) {
      if (!row || row.entity_type !== target.entity_type) continue;
      if (row.active === 0 || row.active === false) continue;
      const rk = String(row.symbol || row.subreddit || row.account_name || '').toLowerCase();
      if (rk === normKey) return { row, entity_type: target.entity_type, match_key: target.key };
    }
    return null;
  }

  function isProfilePageAllowed(platform) {
    if (!platform) return { ok: false, code: 'UNSUPPORTED_HOST', reason: '未识别平台', hint: '' };
    const rule = PROFILE_URL_PATTERNS[platform.key];
    if (!rule) return { ok: true };
    const path = (location.pathname || '') + (location.search || '');
    if (Array.isArray(rule.deny)) {
      for (const re of rule.deny) {
        if (re.test(path)) {
          return { ok: false, code: 'NOT_PROFILE_PAGE', reason: `当前页不是「账号主页/具体内容页」，不允许采集`, hint: rule.hint || '' };
        }
      }
    }
    let ok = !rule.allow || rule.allow.length === 0;
    if (Array.isArray(rule.allow)) {
      ok = rule.allow.some(re => re.test(path));
    }
    if (ok) return { ok: true };
    return { ok: false, code: 'NOT_PROFILE_PAGE', reason: `当前页不是「账号主页/具体内容页」，不允许采集`, hint: rule.hint || '请进入具体账号主页或具体作品/帖子/视频页，再点击采集。' };
  }

  const uid = () => `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const toNum = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/,/g, '').trim();
    const m = s.match(/([\d.]+)\s*(亿|万|k|m|b)?/i);
    if (!m) return parseInt(s, 10) || 0;
    const n = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit === '亿') return Math.round(n * 1e8);
    if (unit === '万') return Math.round(n * 1e4);
    if (unit === 'k') return Math.round(n * 1e3);
    if (unit === 'm') return Math.round(n * 1e6);
    if (unit === 'b') return Math.round(n * 1e9);
    return Math.round(n);
  };
  const text = (el, sel) => {
    if (!sel || typeof sel !== 'string' || !el || !el.querySelector) return '';
    const e = el.querySelector(sel);
    return e ? e.textContent.trim() : '';
  };
  const attr = (el, sel, a) => {
    if (!sel || typeof sel !== 'string' || !el || !el.querySelector) return '';
    const e = el.querySelector(sel);
    return e ? (e.getAttribute(a) || '').trim() : '';
  };
  const all = (el, sel) => {
    if (!sel || typeof sel !== 'string' || !el || !el.querySelectorAll) return [];
    return Array.from(el.querySelectorAll(sel));
  };
  const safeDate = (d) => (d instanceof Date && !isNaN(d)) ? d.toISOString() : new Date().toISOString();

  function detectPlatform() {
    const host = location.hostname;
    for (const p of PLATFORM_DETECTORS) {
      if (p.re.test(host)) return p;
    }
    return null;
  }

  function _findTextValueByLabel(labels, scope = document) {
    const candidates = scope.querySelectorAll('*');
    for (const el of candidates) {
      if (el.childElementCount > 0) continue;
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      for (const lbl of labels) {
        if (typeof lbl === 'string') {
          if (txt === lbl || txt.startsWith(lbl)) {
            const sibs = [];
            const p = el.parentElement;
            if (p) {
              for (const s of p.children) sibs.push(s);
            }
            for (let i = 0; i < sibs.length; i++) {
              if (sibs[i] === el) {
                for (let j = i + 1; j < sibs.length; j++) {
                  const v = toNum(sibs[j].textContent);
                  if (v > 0) return v;
                }
                for (let j = i - 1; j >= 0; j--) {
                  const v = toNum(sibs[j].textContent);
                  if (v > 0) return v;
                }
              }
            }
            const parent = el.parentElement;
            if (parent) {
              const pv = toNum(parent.textContent.replace(txt, ''));
              if (pv > 0) return pv;
            }
          }
        } else if (lbl instanceof RegExp) {
          if (lbl.test(txt)) {
            const m = (el.parentElement ? el.parentElement.textContent : txt).match(/([\d,.]+)\s*(亿|万|k|m|b)?/i);
            if (m) return toNum(m[1] + (m[2] || ''));
          }
        }
      }
    }
    const full = (scope.innerText || scope.textContent || '');
    for (const lbl of labels) {
      const pat = (typeof lbl === 'string') ? lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : lbl.source;
      const m = full.match(new RegExp(pat + '[^\\d]{0,6}([\\d,.]+)\\s*(亿|万|k|m|b)?', 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
    }
    return 0;
  }

  function extractAccountId(platform) {
    const rules = {
      xiaohongshu: { patterns: [/小红?书号\s*[:：]\s*([A-Za-z0-9_\-]{4,})/i, /ID\s*[:：]\s*([A-Za-z0-9_\-]{4,})/i], selectors: ['[class*=uid]', '[class*=account-id]', '[class*=user-id]'] },
    };
    const r = rules[platform.key];
    if (!r) return '';
    const fullText = document.body ? (document.body.innerText || '') : '';
    for (const re of r.patterns || []) {
      const m = fullText.match(re);
      if (m) return m[1];
    }
    for (const sel of r.selectors || []) {
      try {
        const n = document.querySelector(sel);
        if (n) {
          const t = (n.textContent || '').replace(/[^A-Za-z0-9_\-]/g, '');
          if (t && t.length >= 4) return t;
        }
      } catch {}
    }
    return '';
  }

  function extractAvatar(platform) {
    function _srcOf(el, attr = 'src') {
      if (!el) return '';
      const a = (el.getAttribute && el.getAttribute(attr)) || '';
      if (a) return a;
      if (attr === 'src') {
        try {
          const cs = getComputedStyle(el);
          const bi = cs.backgroundImage || '';
          const m = bi.match(/url\(["']?([^"')]+)["']?\)/);
          if (m) return m[1];
        } catch {}
      }
      return '';
    }
    function _fix(src) {
      const s = String(src || '').trim();
      if (!s || /^(about:|javascript:|#)/i.test(s) || s.length < 4) return '';
      if (s.startsWith('data:image/')) return { url: '', data_url: s };
      let u = s;
      if (u.startsWith('//')) u = 'https:' + u;
      if (!/^https?:/i.test(u)) try { u = new URL(u, location.href).href; } catch {}
      return { url: u, data_url: null };
    }
    function _tryAll(list) {
      for (const rule of list) {
        try {
          const nodes = rule.all
            ? Array.from(document.querySelectorAll(rule.sel))
            : [document.querySelector(rule.sel)].filter(Boolean);
          for (const n of nodes) {
            if (!n) continue;
            const attrs = Array.isArray(rule.attr) ? rule.attr : [rule.attr || 'src'];
            for (const a of attrs) {
              const src = _srcOf(n, a);
              const r = _fix(src);
              if (r && (r.url || r.data_url)) return r;
            }
          }
        } catch {}
      }
      return null;
    }
    const rules = {
      xiaohongshu: [
        { sel: 'header img[class*=avatar]', attr: ['src','data-src','data-original-src'] },
        { sel: '.user-info img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src','data-original-src'], all: true },
        { sel: 'img[src*="sns-avatar"]', attr: 'src' },
        { sel: 'img[src*="xhslink"]', attr: 'src', all: true },
        { sel: 'img[src*="qpic.cn"]', attr: 'src', all: true },
        { sel: 'a[href*="/user/profile/"] img', attr: ['src','data-src'], all: true },
        { sel: 'div[class*=avatar i]', attr: 'style' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      douyin: [
        { sel: 'img[class*=avatar]', attr: ['src','data-src'], all: true },
        { sel: '.user-info img', attr: ['src','data-src'] },
        { sel: 'header img', attr: ['src','data-src'] },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      wechat: [
        { sel: '.weui-desktop-mass-account__avatar img', attr: 'src' },
        { sel: '.rich_media_meta_nickname ~ img', attr: 'src' },
        { sel: '#js_profile_qrcode_img', attr: 'src' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      x: [
        { sel: 'img[data-testid="UserAvatar"]', attr: 'src' },
        { sel: 'img[alt*="avatar" i]', attr: 'src', all: true },
        { sel: 'img[src*="pbs.twimg.com/profile_images"]', attr: 'src' },
        { sel: 'header img', attr: 'src' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      instagram: [
        { sel: 'header img', attr: ['src','data-src'] },
        { sel: '._aarf img', attr: 'src' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
        { sel: 'img[src*="scontent.cdninstagram.com"]', attr: 'src', all: true },
      ],
      tiktok: [
        { sel: '[data-e2e="user-avatar"] img', attr: 'src' },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      youtube: [
        { sel: '#channel-header yt-img-shadow img', attr: 'src' },
        { sel: '#avatar img', attr: 'src' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      weibo: [
        { sel: '.ProfileHeader_avatarWrap img, .ProfileAvatar_image img, .woo-avatar-img, img[class*=ProfileAvatar], [class*=Profile] [class*=Avatar] img, [class*=Header] [class*=Avatar] img, [class*=UserAvatar] img, [class*=userInfo] img, [class*=user-info] img, [class*=user_avatar] img', attr: ['src','data-src','data-original','srcset'] },
        { sel: '[class*=Cover] + * img, [class*=Cover] ~ div img, [class*=Banner] + div img, header [class*=avatarWrap] img, [class*=AvatarWrap] img, [class*=avatar_wrap] img', attr: ['src','data-src','data-original','srcset'] },
        { sel: 'img[src*=sinaimg.cn][src*=/crop/], img[src*=sinaimg.cn][src*=/avatar/], img[src*=sinaimg.cn][src*=/large/], img[src*=sinaimg.cn][src*=/orj360/], img[src*=sinaimg.cn][src*=/mw1024/]', attr: ['src','data-src','data-original'], all: true },
        { sel: '[class*=Verify] ~ img, [class*=VIP] ~ img, [class*=Vip] ~ img, [class*=verified] ~ img, [class*=Verify] + img, [class*=VIP] + img, [class*=icon-v] + img', attr: ['src','data-src','data-original'] },
        { sel: '.W_fl img, .photo_wrap img, .avatar img, img[class*=avatar i]', attr: ['src','data-src','data-original'], all: true },
        { sel: 'img[src*="h5.sinaimg.cn/u"]', attr: ['src','data-src'], all: true },
        { sel: 'img[src*="avatar"]', attr: ['src','data-src','data-original'], all: true },
        { sel: 'header img, [class*=header] img:first-of-type', attr: ['src','data-src','data-original'], all: true },
      ],
      bilibili: [
        { sel: '.h-avatar', attr: ['src','data-src'] },
        { sel: '#h-avatar', attr: ['src','data-src'] },
        { sel: '.bili-avatar-img', attr: ['src','data-src'] },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      zhihu: [
        { sel: '.ProfileHeader-avatar img', attr: 'src' },
        { sel: 'img[class*=Avatar]', attr: ['src','data-src'], all: true },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      stocktwits: [
        { sel: '[class*="SymbolHeader"] img', attr: ['src','data-src'] },
        { sel: '[class*="CompanyLogo"] img, [class*=symbol-logo] img, [class*=stock-logo] img', attr: ['src','data-src'], all: true },
        { sel: '[aria-label*="logo" i] img, [role=img][aria-label*="logo" i]', attr: ['src','data-src'] },
        { sel: 'h1 ~ img, h1 + * img', attr: 'src' },
        { sel: '.UserHeader__avatar img, [class*=Header] img, header img, [class*=Profile] img, [class*=profile] img', attr: ['src','data-src'] },
        { sel: 'img[class*=Avatar i], img[class*=avatar i]', attr: ['src','data-src'], all: true },
        { sel: 'img[src*="logo" i]', attr: 'src', all: true },
        { sel: 'link[rel*="icon" i]', attr: 'href' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      _stocktwits_symbol: [
        { sel: '[class*="SymbolHeader"] img', attr: ['src','data-src'] },
        { sel: '[class*="CompanyLogo"] img, [class*=symbol-logo] img, [class*=stock-logo] img', attr: ['src','data-src'], all: true },
        { sel: '[aria-label*="logo" i] img, [role=img][aria-label*="logo" i]', attr: ['src','data-src'] },
        { sel: 'h1 ~ img, h1 + * img', attr: 'src' },
        { sel: 'img[src*="logo" i], img[src*="ticker" i], img[src*="company" i]', attr: 'src', all: true },
        { sel: 'link[rel*="icon" i]', attr: 'href' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      reddit: [
        { sel: '[data-testid="subreddit-icon"] img, [data-testid=community-icon] img, [data-testid="subreddit-banner-icon"] img', attr: ['src','data-src'] },
        { sel: '[about^="/r/"] img, [class*=SubredditIcon] img, [class*=community-header] img, [class*=subreddit-icon] img', attr: ['src','data-src'], all: true },
        { sel: 'img[src*="styles.redditmedia" i], img[src*="redd.it" i]', attr: 'src', all: true },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
        { sel: 'link[rel*="icon" i]', attr: 'href' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      _reddit_subreddit: [
        { sel: '[data-testid="subreddit-icon"] img, [data-testid=community-icon] img, [data-testid="subreddit-banner-icon"] img', attr: ['src','data-src'] },
        { sel: '[about^="/r/"] img, [class*=SubredditIcon] img, [class*=community-header] img, [class*=subreddit-icon] img', attr: ['src','data-src'], all: true },
        { sel: 'img[src*="styles.redditmedia" i], img[src*="redd.it" i]', attr: 'src', all: true },
        { sel: 'link[rel*="icon" i]', attr: 'href' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      linkedin: [
        { sel: '.pv-top-card--photo img', attr: ['src','data-delayed-url','data-src'] },
        { sel: 'img[class*=profile i]', attr: ['src','data-delayed-url'], all: true },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      xueqiu: [
        { sel: '.user-card img', attr: ['src','data-src'] },
        { sel: '.Avatar img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
      ],
      futu: [
        { sel: '.user-header img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
      ],
      laohu: [
        { sel: '.user-avatar img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
      ],
      discord: [
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      telegram: [
        { sel: '.tgme_page_photo img', attr: 'src' },
        { sel: 'meta[property="og:image"]', attr: 'content' },
      ],
      seekingalpha: [
        { sel: '.author-avatar img', attr: ['src','data-src'] },
        { sel: '.profile-avatar img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
      ],
      tieba: [
        { sel: '.userinfo_wrap img', attr: ['src','data-src'] },
        { sel: '.portrait img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
      ],
      changqiao: [
        { sel: '.avatar img', attr: ['src','data-src'] },
        { sel: 'img[class*=avatar i]', attr: ['src','data-src'], all: true },
      ],
    };
    const pathname = (location && location.pathname) ? location.pathname : '';
    const isSymbolPage = (platform.key === 'stocktwits') && /\/symbol\/[A-Za-z.]+/.test(pathname);
    const isSubredditPage = (platform.key === 'reddit') && /^\/r\/[A-Za-z0-9_]/.test(pathname);
    let ruleKey = platform.key;
    if (isSymbolPage) ruleKey = '_stocktwits_symbol';
    else if (isSubredditPage) ruleKey = '_reddit_subreddit';
    const list = rules[ruleKey] || rules[platform.key] || [{ sel: 'meta[property="og:image"]', attr: 'content' }];
    const r = _tryAll(list);
    if (r && (r.url || r.data_url)) return r;
    if (platform.key === 'weibo') {
      try {
        const rectOf = (el) => { try { return el.getBoundingClientRect(); } catch { return { top: 0, left: 0, width: 0, height: 0 }; } };
        const allImgs = Array.from(document.querySelectorAll('img'));
        const scored = allImgs.map((el, idx) => {
          const s = _srcOf(el, 'src') || _srcOf(el, 'data-src') || _srcOf(el, 'data-original') || _srcOf(el, 'srcset');
          if (!s) return null;
          const w = Math.max((el.naturalWidth || 0), (el.width || 0));
          const h = Math.max((el.naturalHeight || 0), (el.height || 0));
          if (w < 60 || h < 60) return null;
          if (w > 1500 || h > 1500) return null;
          const ratio = w && h ? (w > h ? w / h : h / w) : 99;
          if (ratio > 1.35) return null;
          const srcStr = String(s).toLowerCase();
          if (!/sinaimg\.cn/i.test(srcStr)) return null;
          const rect = rectOf(el);
          const y = (rect.top || 0) + window.scrollY;
          if (y > 900) return null;
          const area = w * h;
          let bonus = 0;
          if (/(avatar|头像|profile|user|用户)/i.test([el.id || '', typeof el.className === 'string' ? el.className : '', el.alt || ''].join(' '))) bonus += 15;
          if (/(crop|avatar|large|orj360|mw1024)/i.test(srcStr)) bonus += 12;
          if (y < 500) bonus += 8;
          return { s, score: bonus + Math.log10(1 + area) * 2 - ratio * 2, y, area };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
        for (const c of (scored || []).slice(0, 3)) {
          const fr = _fix(c.s);
          if (fr && (fr.url || fr.data_url)) return fr;
        }
      } catch {}
    }
    try {
      const imgs = Array.from(document.querySelectorAll('img'))
        .slice(0, 40)
        .map((el, idx) => {
          const s = _srcOf(el, 'src') || _srcOf(el, 'data-src') || _srcOf(el, 'data-original');
          if (!s) return null;
          const w = (el.naturalWidth || el.width || 0);
          const h = (el.naturalHeight || el.height || 0);
          if (w < 40 || h < 40) return null;
          if (w > 1200 || h > 1200) return null;
          const ratio = w && h ? (w > h ? w / h : h / w) : 99;
          if (ratio > 1.8) return null;
          const idStr = (el.id || '').toLowerCase();
          const clsStr = (typeof el.className === 'string' ? el.className : '').toLowerCase();
          const altStr = (el.alt || '').toLowerCase();
          const srcStr = String(s).toLowerCase();
          const blob = [idStr, clsStr, altStr, srcStr].join(' ');
          if (/(avatar|message|user|post|author|tweet|profile|comment|reply|stream|sender|from|writer|creator)/i.test(blob)) {
            if (isSymbolPage || isSubredditPage) return null;
          }
          let bonus = 0;
          if (/(symbol|logo|company|corp|brand|quote|stock|ticker|subreddit|community|og:image|favicon)/i.test(blob)) bonus += 4;
          else if (/(icon|header|banner|hero|section)/i.test(blob)) bonus += 1;
          else if (/(avatar|头像|profile|用户)/.test(blob)) bonus += 2;
          if (/[?&](w|width|size|h|height)=\d/.test(srcStr)) bonus += 0.5;
          return { s, score: (10 - ratio) + bonus, idx };
        })
        .filter(Boolean)
        .sort((a,b) => b.score - a.score);
      for (const c of (imgs || []).slice(0, 3)) {
        const fr = _fix(c.s);
        if (fr && (fr.url || fr.data_url)) return fr;
      }
    } catch {}
    const og = document.querySelector('meta[property="og:image"]');
    const ogR = og ? _fix(og.getAttribute('content')) : null;
    if (ogR && (ogR.url || ogR.data_url)) return ogR;
    return { url: '', data_url: null };
  }

  function extractAccountName(platform) {
    const fallback = (document.title || '').replace(/[｜|\-—_].*$/, '').trim() || location.pathname.replace(/\//g, ' ').trim() || 'Unknown';
    const selectors = {
      xiaohongshu: ['h1', '[class*=nick]', '[class*=name-wrap] h1', '[class*=user-info] [class*=name]', '[class*=header] [class*=title]'],
      douyin: ['.author-name', '.user-name', '[class*=nick]', 'h1'],
      wechat: ['.rich_media_meta_nickname', '#js_name', '.profile_nickname', '.weui-desktop-mass-account__name', '.account-name__text', '.weui-desktop-layout__left-side [class*=account] .name'],
      weibo: ['.username', '.name', '[class*=name] .W_fb', 'h1'],
      bilibili: ['.username', 'h1.user-name', '#h-name', '.name'],
      zhihu: ['.ProfileHeader-name', '.UserLink-link', 'h1'],
      futu: ['.user-name', '.nick-name', '.name', 'h1'],
      laohu: ['.user-name', '.nickname', 'h1'],
      xueqiu: ['.name', '.user-name', '.screen-name', 'h1'],
      x: ['[data-testid=User-Name]', 'div[data-testid=UserProfileHeader_Items] + div h2', 'h1'],
      tiktok: [['h2[data-e2e=user-title]', '[data-e2e=user-nickname]', 'h1']],
      youtube: ['#channel-title yt-formatted-string', 'h1 yt-formatted-string', '.ytd-channel-name'],
      linkedin: ['.text-heading-xlarge', '.pv-text-details__left-panel h1', 'h1'],
      instagram: ['header h2', 'h1', '._aada'],
      telegram: ['.tgme_page_title', '.channel_header_title', 'h1'],
      discord: ['.name-2m3Cms', 'h1'],
      stocktwits: ['.with-header-user-name', '.UserHeader__username', '[class*=username]', '[class*=screen-name]', '[class*=Header] [class*=name]', '[class*=UserHeader] h2', '[class*=UserHeader] h1', 'header h2', 'header h1', 'h1'],
      reddit: ['[data-testid=top-bar-title]', 'h1', '.subredditname'],
      seekingalpha: ['.profile-name', '.author-name', 'h1'],
      tieba: ['.card_head_title', '.tbui_title_wrap h1', 'h1'],
      changqiao: ['.user-name', 'h1', '.name'],
    };
    const list = selectors[platform.key] || ['h1'];
    for (const sel of (Array.isArray(list[0]) ? list : [list])) {
      for (const s of sel) {
        const t = text(document, s);
        if (t && t.length < 80) {
          if (platform.key === 'xiaohongshu') {
            if (/^(关注|粉丝|获赞|收藏|小红书号|天蝎|广东)/.test(t)) continue;
          }
          if (platform.key === 'stocktwits') {
            if (/^(Posts|Posts & Replies|Liked|Watchlist|Strategy|Joined|Following|Followers|Edit Profile|Messages)$/i.test(t)) continue;
          }
          return t;
        }
      }
    }
    if (platform.key === 'stocktwits') {
      try {
        const m = (location.pathname || '').match(/^\/([A-Za-z.]+)(\/|$|\?|#)/);
        if (m && m[1] && !/^(home|trending|watchlists|explore|login|signup|pricing|search|about|terms|privacy|streams|messages|symbol|premium|discover|$)/i.test(m[1])) {
          return m[1];
        }
      } catch {}
    }
    return fallback;
  }

  function isGenericAccountName(name, platform) {
    if (!name) return true;
    const n = String(name).trim();
    if (!n) return true;
    if (n.length > 30) return false;
    const generic = [
      '微信公众平台', '公众号', '公众平台', '登录', '注册', '首页', '主页', '控制台', '工作台',
      '小红书', '抖音', '抖音精选', '精选', '微博', 'b站', 'bilibili', '哔哩哔哩',
      '知乎', '知乎首页', '百度贴吧', '雪球', '富途', '老虎社区', '老虎证券',
      'youtube', 'linkedin', 'instagram', 'telegram', 'discord', 'reddit', 'stocktwits',
      'x', 'twitter', 'tiktok', 'home', 'index', 'explore', 'discover',
    ];
    const lowered = n.toLowerCase();
    if (generic.some(g => lowered === g.toLowerCase())) return true;
    if (/^https?:\/\//i.test(n)) return true;
    if (/^(sign in|log in|login|register|signup|sign up|homepage|home page|main page)$/i.test(n)) return true;
    return false;
  }

  function shouldRejectRecord(platform, account, followers, views, likes, members, postsLen) {
    const audience = Number(followers || 0) + Number(members || 0);
    const engagement = Number(views || 0) + Number(likes || 0) + Number(postsLen || 0);
    const acc = String(account || '').trim();
    if (!acc) return { ok: false, code: 'EMPTY_ACCOUNT_NAME', reason: '未抽到账号名，请切换到具体账号主页再采集' };
    if (isGenericAccountName(acc, platform)) return { ok: false, code: 'GENERIC_ACCOUNT_NAME', reason: `当前是平台首页（"${acc}"），请打开具体账号/频道主页再采集` };
    if (audience === 0 && engagement === 0) return { ok: false, code: 'NO_SIGNAL_METRICS', reason: '当前页未抽到粉丝/关注/浏览/点赞等任何指标，请确认是否是账号主页或等待页面完全加载' };
    return { ok: true };
  }

  const FIELD_META_BY_PLATFORM = {
    xiaohongshu: {
      followers:      { nativeNames: ['粉丝', '粉丝数', '关注者'],        unified: '粉丝' },
      following:      { nativeNames: ['关注', '关注数', '关注中'],        unified: '关注' },
      likesTotal:     { nativeNames: ['获赞与收藏', '获赞', '点赞和收藏'], unified: '获赞/收藏' },
      posts:          { nativeNames: ['笔记', '作品'],                    unified: '作品' },
      views:          { nativeNames: ['浏览', '阅读', '播放', '曝光'],    unified: '浏览/曝光' },
      accountId:      { nativeNames: ['小红书号', 'ID'],                   unified: '账号ID' },
    },
    douyin: {
      followers:      { nativeNames: ['粉丝', '粉丝量', '粉丝数'],        unified: '粉丝' },
      following:      { nativeNames: ['关注', '关注数'],                  unified: '关注' },
      likesTotal:     { nativeNames: ['获赞', '总获赞', '点赞'],          unified: '获赞' },
      posts:          { nativeNames: ['作品', '视频', '动态'],             unified: '作品' },
      views:          { nativeNames: ['播放', '播放量', '浏览', '观看'],  unified: '播放/浏览' },
      comments:       { nativeNames: ['评论', '评论数'],                  unified: '评论' },
    },
    wechat: {
      followers:      { nativeNames: ['总用户数', '订阅用户', '粉丝', '订阅人数', '关注'], unified: '粉丝/总用户数' },
      following:      { nativeNames: ['已关注', '关注数'],                unified: '关注' },
      likesTotal:     { nativeNames: ['点赞', '赞', '喜欢', '在看'],       unified: '点赞/在看' },
      posts:          { nativeNames: ['群发', '发布', '发表记录', '篇'],   unified: '发布/原创' },
      views:          { nativeNames: ['阅读', '阅读量', '浏览', '查看'],  unified: '阅读量' },
      comments:       { nativeNames: ['留言', '评论'],                     unified: '留言' },
      originals:      { nativeNames: ['原创', '原创文章', '原创声明'],    unified: '原创' },
    },
    x: {
      followers:      { nativeNames: ['Followers', '粉丝', '关注者'],       unified: '粉丝' },
      following:      { nativeNames: ['Following', '关注'],                 unified: '关注' },
      likesTotal:     { nativeNames: ['Likes', '点赞', '喜欢'],             unified: '获赞' },
      posts:          { nativeNames: ['Posts', '推文', 'Tweets', '帖子'],   unified: '推文' },
      views:          { nativeNames: ['Impressions', 'Views', '查看', '浏览', '曝光'], unified: '浏览/曝光' },
      reposts:        { nativeNames: ['Retweets', 'Reposts', '转发'],       unified: '转发' },
    },
    instagram: {
      followers:      { nativeNames: ['followers', '粉丝', '粉丝数', '关注者'], unified: '粉丝' },
      following:      { nativeNames: ['following', '关注'],                    unified: '关注' },
      likesTotal:     { nativeNames: ['Likes', '点赞', '喜欢'],                unified: '获赞' },
      posts:          { nativeNames: ['posts', '帖子', '动态', '作品'],         unified: '帖子' },
      views:          { nativeNames: ['Views', '浏览', '播放', '观看'],        unified: '浏览/播放' },
      stories:        { nativeNames: ['Stories', '动态'],                      unified: 'Stories' },
    },
    tiktok: {
      followers:      { nativeNames: ['粉丝', 'Followers'],        unified: '粉丝' },
      following:      { nativeNames: ['关注', 'Following'],        unified: '关注' },
      likesTotal:     { nativeNames: ['获赞', 'Likes', '喜欢'],     unified: '获赞' },
      posts:          { nativeNames: ['作品', '视频', 'Videos'],   unified: '作品' },
      views:          { nativeNames: ['播放', '播放量', 'Views'],  unified: '播放量' },
    },
    youtube: {
      followers:      { nativeNames: ['订阅', '订阅者', 'subscribers'], unified: '订阅者' },
      following:      { nativeNames: ['订阅频道', '关注'],             unified: '订阅频道' },
      likesTotal:     { nativeNames: ['点赞', 'Likes'],                 unified: '点赞' },
      posts:          { nativeNames: ['视频', '视频数', 'Videos'],      unified: '视频' },
      views:          { nativeNames: ['观看', '观看次数', 'Views'],     unified: '观看次数' },
      comments:       { nativeNames: ['评论', 'Comments'],              unified: '评论' },
    },
    weibo: {
      followers:      { nativeNames: ['粉丝', '粉丝数', '关注者'],     unified: '粉丝' },
      following:      { nativeNames: ['关注', '关注数'],               unified: '关注' },
      likesTotal:     { nativeNames: ['转评赞', '获赞', '赞', '点赞'], unified: '转评赞' },
      posts:          { nativeNames: ['微博', '动态', '帖子'],         unified: '微博' },
      views:          { nativeNames: ['阅读', '阅读量', '浏览'],       unified: '阅读量' },
    },
    bilibili: {
      followers:      { nativeNames: ['粉丝', '粉丝数'],                  unified: '粉丝' },
      following:      { nativeNames: ['关注', '关注数'],                  unified: '关注' },
      likesTotal:     { nativeNames: ['点赞', '获赞', '总获赞'],          unified: '获赞' },
      posts:          { nativeNames: ['投稿', '视频', '稿件'],             unified: '投稿' },
      views:          { nativeNames: ['播放', '播放量', '总播放', '阅读'], unified: '总播放' },
    },
    zhihu: {
      followers:      { nativeNames: ['关注者', '粉丝'],            unified: '关注者' },
      following:      { nativeNames: ['关注了', '关注数'],          unified: '关注' },
      likesTotal:     { nativeNames: ['获得的赞', '点赞', '喜欢'], unified: '获得点赞' },
      posts:          { nativeNames: ['回答', '文章', '想法'],      unified: '回答/文章' },
      views:          { nativeNames: ['阅读', '浏览'],               unified: '阅读' },
    },
    xueqiu: {
      followers:      { nativeNames: ['粉丝', '关注者'],  unified: '粉丝' },
      following:      { nativeNames: ['关注'],             unified: '关注' },
      likesTotal:     { nativeNames: ['获赞', '点赞'],     unified: '获赞' },
      posts:          { nativeNames: ['讨论', '长文', '帖子'], unified: '讨论/长文' },
      views:          { nativeNames: ['阅读', '浏览', '阅读量'], unified: '阅读' },
    },
    stocktwits:    { followers:{nativeNames:['Followers','Watchers','粉丝','关注者'],unified:'关注者'}, following:{nativeNames:['Following','Watching','关注','关注列表'],unified:'关注列表'}, posts:{nativeNames:['Posts','Messages','帖子'],unified:'帖子'}, likesTotal:{nativeNames:['Likes','点赞','获赞'],unified:'获赞'} },
    reddit:        { followers:{nativeNames:['members','subscribers','成员'],unified:'成员'}, following:{nativeNames:['Joined','订阅'],unified:'订阅'}, posts:{nativeNames:['Posts','帖子'],unified:'帖子'}, likesTotal:{nativeNames:['Karma','积分','点赞'],unified:'积分/点赞'} },
    linkedin:      { followers:{nativeNames:['connections','关注者','粉丝'],unified:'人脉'}, following:{nativeNames:['Following','关注'],unified:'关注'}, posts:{nativeNames:['Posts','动态'],unified:'动态'}, likesTotal:{nativeNames:['Likes','点赞'],unified:'获赞'} },
  };

  function _extractByLabelList(labels) {
    if (!Array.isArray(labels) || labels.length === 0) return 0;
    return _findTextValueByLabel(labels);
  }

  function extractFollowers(platform) {
    const meta = (FIELD_META_BY_PLATFORM[platform.key] || {}).followers;
    const labels = (meta && meta.nativeNames) ? meta.nativeNames : ['粉丝', '粉丝数', '关注者', 'Followers', 'subscribers', 'members'];
    const v = _extractByLabelList(labels);
    if (v > 0) return v;
    const full = (document.body ? document.body.innerText : '');
    const labelsPat = (labels || []).map(l => typeof l === 'string' ? l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : (l instanceof RegExp ? l.source : l)).join('|');
    if (labelsPat) {
      // 顺序 B: 数值在前（分两支：带单位 2.5万 粉丝 / 无单位 152 关注）
      //   分支1（带单位）: 数值 任意空白 单位 0-2空白 标签 → 匹配 "2.5万 粉丝"
      //   分支2（无单位）: 数值 0-2空白 标签 → 匹配 "152 关注"，不匹配 "25000   关注"（3空格跨字段污染）
      let m = full.match(new RegExp(`([\\d,.]+)(?:\\s*(亿|万|k|m|b)\\s{0,2}|\\s{0,2})(?:${labelsPat})`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
      // 顺序 A: 标签在前（粉丝 25000）兼容老页面
      m = full.match(new RegExp(`(?:${labelsPat})[^\\d]{0,10}([\\d,.]+)\\s*(亿|万|k|m|b)?`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
    }
    return 0;
  }

  function extractFollowing(platform) {
    const meta = (FIELD_META_BY_PLATFORM[platform.key] || {}).following;
    const labels = (meta && meta.nativeNames) ? meta.nativeNames : ['关注', 'Following', '关注中', '关注数', 'Watching'];
    const v = _extractByLabelList(labels);
    if (v > 0) return v;
    const full = (document.body ? document.body.innerText : '');
    const labelsPat = (labels || []).map(l => typeof l === 'string' ? l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : (l instanceof RegExp ? l.source : l)).join('|');
    if (labelsPat) {
      // 顺序 B: 数值在前（分两支：带单位 / 无单位≤2空白 防止跨字段）
      let m = full.match(new RegExp(`([\\d,.]+)(?:\\s*(亿|万|k|m|b)\\s{0,2}|\\s{0,2})(?:${labelsPat})`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
      // 顺序 A: 标签在前（关注 152）兼容
      m = full.match(new RegExp(`(?:${labelsPat})[^\\d]{0,10}([\\d,.]+)\\s*(亿|万|k|m|b)?`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
    }
    return 0;
  }

  function extractLikesTotal(platform) {
    const meta = (FIELD_META_BY_PLATFORM[platform.key] || {}).likesTotal;
    const labels = (meta && meta.nativeNames) ? meta.nativeNames : ['获赞', '获赞与收藏', '转评赞', 'Likes', '点赞', '总获赞', 'Karma'];
    const v1 = _extractByLabelList(labels);
    if (v1 > 0) return v1;
    const full = (document.body ? document.body.innerText : '');
    const labelsPat = (labels || []).map(l => typeof l === 'string' ? l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : (l instanceof RegExp ? l.source : l)).join('|');
    if (labelsPat) {
      // 顺序 B: 数值在前（分两支：带单位 / 无单位≤2空白 防止跨字段）
      let m = full.match(new RegExp(`([\\d,.]+)(?:\\s*(亿|万|k|m|b)\\s{0,2}|\\s{0,2})(?:${labelsPat})`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
      // 顺序 A: 标签在前（转评赞 12000）兼容
      m = full.match(new RegExp(`(?:${labelsPat})[^\\d]{0,10}([\\d,.]+)\\s*(亿|万|k|m|b)?`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
    }
    return 0;
  }

  function extractViewsAccount(platform) {
    const labels = (platform.key === 'weibo')
      ? ['阅读', '阅读量', '浏览', '播放', '播放量', '累计播放', '视频累计播放量', '累计阅读']
      : (platform.key && ((FIELD_META_BY_PLATFORM[platform.key] || {}).views || {}).nativeNames) || ['阅读', '阅读量', '浏览', '播放', '播放量'];
    const labelsPat = (labels || []).map(l => typeof l === 'string' ? l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : (l instanceof RegExp ? l.source : l)).join('|');
    const full = (document.body ? document.body.innerText : '');
    if (labelsPat) {
      let m = full.match(new RegExp(`(${labelsPat})[^\\d]{0,12}([\\d,.]+)\\s*(亿|万|k|m|b)?`, 'i'));
      if (m) return toNum(m[2] + (m[3] || ''));
      m = full.match(new RegExp(`([\\d,.]+)(?:\\s*(亿|万|k|m|b)\\s{0,2}|\\s{0,2})(${labelsPat})`, 'i'));
      if (m) return toNum(m[1] + (m[2] || ''));
    }
    return 0;
  }

  function extractRawFieldsSnapshot(platform, { followers, following, likesTotal, postsCount, views, comments }) {
    const meta = FIELD_META_BY_PLATFORM[platform.key] || {};
    const snap = {};
    if (meta.followers)   snap[meta.followers.nativeNames[0]]   = followers;
    if (meta.following)   snap[meta.following.nativeNames[0]]   = following;
    if (meta.likesTotal)  snap[meta.likesTotal.nativeNames[0]]  = likesTotal;
    if (meta.posts)       snap[meta.posts.nativeNames[0]]       = postsCount;
    if (meta.views)       snap[meta.views.nativeNames[0]]       = views;
    if (meta.comments)    snap[meta.comments.nativeNames[0]]    = comments;
    if (meta.originals)   snap[meta.originals.nativeNames[0]]   = 0;
    if (meta.reposts)     snap[meta.reposts.nativeNames[0]]     = 0;
    if (meta.stories)     snap[meta.stories.nativeNames[0]]     = 0;
    return snap;
  }

  function extractPosts(platform) {
    const out = [];
    const rules = {
      xiaohongshu: { list: '.note-item, .feeds-container .note, a[href^="/explore/"]', title: '.title, .content, h3, p', views: '.view, .count', likes: '.like-wrapper .count, .like, .icon-like + span', comments: '.comment, .icon-comment + span', url: 'a[href]', date: '.date, .time', cover: 'img.cover, img[class*=cover], img:not([srcset])' },
      douyin: { list: 'li[data-e2e=user-post-item-list-item], div[class*=video-card], a[href^="/video/"]', title: 'div[data-e2e=user-post-item-desc]', views: 'div[data-e2e=user-post-item-play-count], .play-count', likes: 'div[data-e2e=user-post-item-digg], .digg-count', comments: '.comment-count', url: 'a[href]', date: '.time', cover: 'img, img[class*=cover], img[class*=thumbnail]' },
      weibo: { list: 'div[class*=feed] > div, div[class*=Feed_item], div[class*=Card_wrap], div[class*=card-wrap], div[class*=weibo-item], article, [class*=vue-recycle-scroller] > div > div, .WB_cardwrap[class*=S_bg2]', title: '.WB_text, .content, [class*=weibo-text], [class*=Feed_item_content], [class*=text], p, [class*=detail] [class*=content]', views: '[class*=views], [class*=read-count], [class*=WB_from], .WB_from a, [class*=count]', viewsRx: /阅读\s*([\d.]+万?)/i, likes: '.WB_feed_handle .pos span:nth-child(3) em, [aria-label*=like] span, [class*=like-count], [class*=likes], button[class*=like] span, [class*=icon-like] + span, [class*=feed_handle] span:nth-child(3) em', comments: '.WB_feed_handle .pos span:nth-child(2) em, [aria-label*=comment] span, [class*=comment-count], [class*=comments], button[class*=comment] span, [class*=icon-comment] + span, [class*=feed_handle] span:nth-child(2) em', url: '.WB_from a[href], a[href*=status], a[href*=/weibo/], [class*=from] a, [class*=time] a', date: '.WB_from a, time, [class*=from] a, [class*=time], [class*=publish]', cover: 'img.WB_pic, img[src*=sinaimg.cn], img[class*=pic], img[class*=cover], img[class*=media]' },
      bilibili: { list: '.small-item, .video-list-item, li.small-item', title: '.title, .info .title', views: '.so-icon, .play', likes: '.like, .fav', comments: '.comment, .danmaku', url: 'a[href]', date: '.time', cover: 'img, .cover img, .pic img' },
      x: { list: 'article[data-testid=tweet], div[data-testid=cellInnerDiv]', title: 'div[data-testid=tweetText]', views: 'div[aria-label*=views], a[href$=analytics] span', likes: 'button[data-testid=like] div, div[data-testid=like] span', comments: 'button[data-testid=reply] div, div[data-testid=reply] span', url: 'a[href*=status]', date: 'time', cover: 'img[src*=pbs.twimg.com/media], div[aria-label*=Image] img, article img' },
      tiktok: { list: 'div[data-e2e=user-post-item], a[href^=/video/]', title: 'div[data-e2e=user-post-item-desc]', views: 'div[data-e2e=user-post-item-play-count], strong', likes: 'div[data-e2e=user-post-item-digg] strong', comments: '.comment-count', url: 'a[href]', date: '.time', cover: 'img, img[class*=cover], img[class*=thumbnail]' },
      xueqiu: { list: '.status-list .status, article, .AnonymousHome_home__timeline-item', title: '.status-title, .status-content', views: '.status-source, .retweet', likes: '.iconfont.icon-like + span, .like-count', comments: '.reply-count, .iconfont.icon-comment + span', url: 'a[href^=/status/]', date: '.status-source a, time', cover: 'img' },
      futu: { list: '.momo-post, .article-item, .feed-item', title: '.title, .content', views: '.read-count, .view-count', likes: '.like-count, .digg-count', comments: '.comment-count', url: 'a[href]', date: '.time', cover: 'img' },
      youtube: { list: '#contents ytd-grid-video-renderer, ytd-rich-grid-media', title: '#video-title yt-formatted-string', views: '#metadata-line yt-formatted-string:nth-child(1)', likes: '', comments: '', url: '#video-title', date: '#metadata-line yt-formatted-string:nth-child(2)', cover: 'ytd-thumbnail img, #thumbnail img, img' },
      stocktwits: { list: 'article, div[class*=Message], div[class*=message-item], div[class*=Post], div[class*=post-item], div[class*=Stream] > div, div[class*=stream] > div, section[class*=post], article.message, .stream-item', title: '.Message_content, [class*=Message] [class*=content], [class*=Post] [class*=content], [class*=post] [class*=content], [class*=message] [class*=body], [class*=message] [class*=text], .content, p', views: '.views', likes: '.like-count, .like-btn span, button[aria-label*=like] span, [class*=likes] span, [class*=like] span, [class*=icon-like] + span, [class*=post] [class*=actions] [class*=like] em, [class*=Post] [class*=actions] [class*=like] em', comments: '.reply-count, button[aria-label*=reply] span, [class*=comments] span, [class*=comment] span, [class*=icon-comment] + span, [class*=post] [class*=actions] [class*=reply] em, [class*=Post] [class*=actions] [class*=reply] em', url: 'a[href*=messages/], a[href*=/message/], [class*=time] a, a[href*=statuses]', date: 'time, [class*=time], [class*=date]', cover: 'img' },
      reddit: { list: 'div[data-testid=post-container], .Post', title: 'h3', views: '[data-testid=vote-arrows] + div', likes: '[data-testid=vote-arrows]', comments: '[data-testid=comments-count]', url: 'a[data-testid=comments-page-link]', date: 'time', cover: 'img' },
      zhihu: { list: '.ContentItem, .List-item, article', title: '.ContentItem-title, h2', views: '.ContentItem-meta .number + span', viewsRx: /阅读\s*([\d.]+万?)/i, likes: '.VoteButton--up .count', comments: '.ContentItem-actions .Button--plain', commentsRx: /评论\s*(\d+)/, url: 'a[href*=answer], a[href*=p/]', date: '.ContentItem-time', cover: 'img' },
      instagram: { list: 'article a[href*=/p/]', title: 'img[alt]', views: '', likes: '', comments: '', url: 'a[href]', date: 'time', cover: 'img, img[src*=cdninstagram]' },
      tieba: { list: '.j_thread_list li, .threadlist_title', title: '.threadlist_title a', views: '.threadlist_rep_num', likes: '', comments: '.threadlist_rep_num', url: 'a[href]', date: '.threadlist_reply_date', cover: 'img' },
      linkedin: { list: 'div[data-id], .occludable-update, section.feed-shared-update-v2', title: '.feed-shared-update-v2__description, .break-words', views: '.analytics-entry-point', likes: '.social-details-social-counts__reactions-count', comments: '.social-details-social-counts__comments', url: 'a[href*=posts]', date: 'time', cover: 'img' },
    };
    const r = rules[platform.key] || null;
    if (!r) return out;
    let nodes = [];
    try { nodes = all(document, r.list); } catch {}
    for (const n of nodes.slice(0, 12)) {
      const title = (text(n, r.title) || (attr(n, r.title ? '' : 'img', 'alt') || '')).replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!title) continue;
      let views = 0, likes = 0, comments = 0;
      if (r.views) views = r.viewsRx ? (toNum((text(n, r.views) || '').match(r.viewsRx)?.[1])) : toNum(text(n, r.views));
      if (r.likes)  likes  = toNum(text(n, r.likes));
      if (r.comments) comments = toNum(text(n, r.comments));
      if (views === 0) { const m = (n.textContent || '').match(/(阅读|播放|views?|播放量)[^\d]{0,6}([\d,.]+\s*[亿万km]?)/i); if (m) views = toNum(m[2]); }
      let href = attr(n, r.url, 'href');
      if (href && !/^https?:/i.test(href)) href = new URL(href, location.href).href;
      if (!href) href = location.href;
      const d = text(n, r.date) || '';
      const iso = parseRelativeDate(d);
      let coverSrc = '';
      if (r.cover) {
        try {
          const imgs = Array.from(n.querySelectorAll(r.cover) || []).filter(img => (img.src || '').trim().length > 4);
          if (imgs.length > 0) coverSrc = imgs[0].src;
        } catch {}
      }
      if (!coverSrc) {
        try {
          const anyImg = Array.from(n.getElementsByTagName('img') || []).filter(img => (img.src || '').trim().length > 4 && !/(data:image[^,]*base64,[A-Za-z0-9+/=]{0,32})$/i.test(img.src));
          if (anyImg.length > 0) coverSrc = anyImg[0].src;
        } catch {}
      }
      if (coverSrc && !/^https?:/i.test(coverSrc) && !coverSrc.startsWith('data:')) {
        try { coverSrc = new URL(coverSrc, location.href).href; } catch {}
      }
      const images = coverSrc ? [coverSrc] : [];
      out.push({ id: uid(), title, views, likes, comments, shares: 0, collect: 0, engagement_rate: views > 0 ? +(((likes + comments) / views) * 100).toFixed(2) : 0, url: href, published_at: iso, platform: platform.name, platform_key: platform.key, cover: coverSrc, images });
    }
    return out.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  }

  /* ============ Stocktwits 股票专用字段抓取 (STOCK) ============ */
  function extractStocktwitsStockMetrics() {
    const out = { symbol_price: null, symbol_change_pct: null, watchers: 0, sentiment_bull: 0, sentiment_bear: 0, message_volume_24h: 0 };
    const bodyText = document.body ? document.body.innerText : '';
    // --- 1. Price: $8.83 / $8,830.00（截图里大字号价格）多级 selector fallback ---
    const priceSelectors = [
      '[class*="SymbolHeader"] [class*="price"]', '[class*="Price"] span',
      'h1 + div > div:first-child div', '[aria-label*="price" i]',
      '[class*="symbolPrice"]', '[class*="stock-price"]', '[class*="quote-price"]',
    ];
    for (const sel of priceSelectors) {
      for (const n of document.querySelectorAll(sel)) {
        const txt = (n.textContent || '').trim();
        const m = txt.match(/\$?\s*([\d,]+\.\d{2,4})/);
        if (m) { out.symbol_price = parseFloat(m[1].replace(/,/g, '')); break; }
      }
      if (out.symbol_price != null) break;
    }
    if (out.symbol_price == null) {
      const pm = bodyText.match(/(^|\n|　)\s*\$\s*([\d,]+\.\d{2,4})\s*(\n|$|Prev Close|Pre-Market)/m);
      if (pm) out.symbol_price = parseFloat(pm[2].replace(/,/g, ''));
    }
    // --- 2. Change pct: +0.42% / −1.23% ---
    const pctSelectors = [
      '[class*="change"] span', '[class*="Change"] span', '[class*="delta"]',
      '[class*="price-delta"]', '[aria-label*="change" i]',
    ];
    for (const sel of pctSelectors) {
      try {
        for (const n of document.querySelectorAll(sel)) {
          const txt = (n.textContent || '').trim();
          const m = txt.match(/([+−\-−])\s*([\d.]+)\s*%/);
          if (m) { const sign = m[1] === '+' ? 1 : -1; out.symbol_change_pct = sign * parseFloat(m[2]); break; }
        }
        if (out.symbol_change_pct != null) break;
      } catch {}
    }
    if (out.symbol_change_pct == null) {
      const cm = bodyText.match(/([+−\-−])\s*([\d.]+)\s*%\s*(\(|Pre|Prev)/);
      if (cm) { const sign = cm[1] === '+' ? 1 : -1; out.symbol_change_pct = sign * parseFloat(cm[2]); }
    }
    // --- 3. Watchers: 6,104（用户头像右上角的 Watchers 计数）---
    const watcherSelectors = [
      '[class*="Watchers"]', '[class*="watchers"]', '[class*="UserHeader"] [class*="count"]',
      '[class*="symbol-stats"] [class*="watcher" i]', 'div[aria-label*="Watchers" i]',
    ];
    let maxW = 0;
    for (const sel of watcherSelectors) {
      try {
        for (const n of document.querySelectorAll(sel)) {
          const txt = (n.textContent || '').replace(/\s+/g, ' ');
          const m = txt.match(/(Watchers|关注者)[^\d]{0,8}([\d,.]+)/i) || txt.match(/([\d,.]+)[^\d]{0,8}(Watchers|关注者)/i);
          if (m) { const v = toNum(m[2] || m[1]); if (v > maxW) maxW = v; }
          else { const v = toNum(txt); if (v > maxW) maxW = v; }
        }
      } catch {}
    }
    if (maxW === 0) {
      const wm = bodyText.match(/(Watchers|关注者)[^\d]{0,10}([\d,.]+\s*[kKmM]?)/i);
      if (wm) maxW = toNum(wm[2]);
    }
    // 通用 label 匹配（页面顶部右侧 6,104 + 号按钮旁边的数字）
    if (maxW === 0) {
      const nodes = document.querySelectorAll('button, div[class*="count"], span[class*="count"]');
      for (const n of nodes) {
        const prev = (n.previousElementSibling?.textContent || '').trim().toLowerCase();
        const full = (n.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
        if (/watcher|关注|follower/i.test(prev) || /watcher|关注|follower/i.test(full)) {
          const v = toNum(n.textContent);
          if (v > maxW) maxW = v;
        }
      }
    }
    out.watchers = maxW;
    // --- 4. Sentiment Bullish / Bearish: 51 / 49 ---
    // 方式 A: 页面底部的 Bullish / Bearish 按钮组（截图里 "🐂 Bullish" / "🐻 Bearish"）
    let bull = null, bear = null;
    try {
      const allTextNodes = Array.from(document.querySelectorAll('button, [class*="sentiment"], [class*="bull"], [class*="bear"], [aria-label*="Bullish" i], [aria-label*="Bearish" i]'));
      for (const n of allTextNodes) {
        const txt = (n.textContent || '').replace(/\s+/g, ' ').trim();
        // 只看百分比或数字
        if (/Bullish|看涨|🐂|🐃/.test(txt)) {
          const m = txt.match(/([\d.]+)\s*%|([\d,]+)/);
          if (m) { const v = parseFloat((m[1]||m[2]||'0').replace(/,/g,'')); if (bull == null || v > bull) bull = v; }
        }
        if (/Bearish|看跌|🐻|🧸/.test(txt)) {
          const m = txt.match(/([\d.]+)\s*%|([\d,]+)/);
          if (m) { const v = parseFloat((m[1]||m[2]||'0').replace(/,/g,'')); if (bear == null || v > bear) bear = v; }
        }
      }
      // 方式 B: 文本正则 "51 Bullish" / "Bullish 49%"
      if (bull == null) { const bm = bodyText.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(Bullish|看涨)/i) || bodyText.match(/(Bullish|看涨)[^\d]{0,6}(\d{1,3}(?:\.\d+)?)\s*%/i); if (bm) bull = parseFloat(bm[1]||bm[2]); }
      if (bear == null) { const bm = bodyText.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(Bearish|看跌)/i) || bodyText.match(/(Bearish|看跌)[^\d]{0,6}(\d{1,3}(?:\.\d+)?)\s*%/i); if (bm) bear = parseFloat(bm[1]||bm[2]); }
      // 方式 C: 进度条 style width: 51% (Bullish bar)
      if (bull == null) {
        const bars = document.querySelectorAll('[class*="progress-bar"], [class*="sentiment-bar"], [class*="bullish"] [class*="bar"], div[style*="width"]');
        for (const b of bars) {
          const w = b.style?.width;
          if (w && /%/.test(w)) {
            const pct = parseFloat(w);
            const parent = (b.parentElement?.textContent || '').toLowerCase();
            if (/bull|看涨/.test(parent) || /bear|看跌/.test(parent) === false) {
              if (bull == null) bull = pct;
            }
          }
        }
      }
      if (bull == null && bear == null) {
        // 方式 D: 截图中最显眼的 "51 Neutral Sentiment" — 数字是 Bullish %
        const nm = bodyText.match(/(^|\n)\s*(\d{1,3})\s*(Neutral Sentiment|Sentiment)\s*How do you feel/i);
        if (nm) { bull = parseFloat(nm[2]); bear = 100 - bull; }
      }
    } catch {}
    if (bull != null) out.sentiment_bull = Math.max(0, Math.min(100, bull));
    if (bear != null) out.sentiment_bear = Math.max(0, Math.min(100, bear));
    if (out.sentiment_bull === 0 && out.sentiment_bear === 0) { out.sentiment_bull = 50; out.sentiment_bear = 50; }
    // --- 5. Message volume 24h: 直接复用 extractPosts.length 或 Latest 旁边的 count ---
    try {
      const volLabels = document.querySelectorAll('[class*="Latest"], [class*="Messages"], [aria-label*="messages" i], [class*="volume"]');
      for (const n of volLabels) {
        const txt = (n.parentElement?.textContent || '').replace(/\s+/g,' ');
        const m = txt.match(/(Messages|24h|Latest)[^\d]{0,10}([\d,.]+\s*[kKmM]?)/i);
        if (m) { const v = toNum(m[2]); if (v > out.message_volume_24h) out.message_volume_24h = v; }
      }
    } catch {}
    return out;
  }

  /* ============ Reddit 社区专用字段抓取 (SUBREDDIT) ============ */
  function extractRedditCommunityMetrics() {
    const out = { members: 0, online: 0, posts_24h: 0, message_volume_24h: 0 };
    const bodyText = document.body ? document.body.innerText : '';
    // --- Members: 官方 subreddit info card 「xx members」 ---
    const memberSels = [
      '[data-testid="subscribers-id"]', '[data-testid=\"community-card\"] [class*=\"member\"]',
      'div[id^=\"IdCard\"]', '[about=\"/r/\"] [class*=\"stat\"]',
      '[class*=\"_1B96\"]', '[class*=\"sidebar\"] [class*=\"member\"]',
    ];
    let maxM = 0, maxO = 0;
    for (const sel of memberSels) {
      try {
        for (const n of document.querySelectorAll(sel)) {
          const txt = (n.textContent || '').replace(/\s+/g,' ');
          const mm = txt.match(/([\d,.]+)\s*(members?|成员|订阅者)/i) || txt.match(/(members?|成员|订阅者)[^\d]{0,8}([\d,.]+\s*[kKmM]?)/i);
          if (mm) { const v = toNum(mm[1] || mm[2]); if (v > maxM) maxM = v; }
          const om = txt.match(/([\d,.]+)\s*(online|在线)/i) || txt.match(/(online|在线)[^\d]{0,8}([\d,.]+\s*[kKmM]?)/i);
          if (om) { const v = toNum(om[1] || om[2]); if (v > maxO) maxO = v; }
        }
      } catch {}
    }
    if (maxM === 0) {
      const mm = bodyText.match(/([\d,.]+\s*[kKmM]?)\s*(members?|成员|订阅者)/i);
      if (mm) maxM = toNum(mm[1]);
    }
    if (maxO === 0) {
      const om = bodyText.match(/([\d,.]+\s*[kKmM]?)\s*(online|在线)/i);
      if (om) maxO = toNum(om[1]);
    }
    out.members = maxM;
    out.online = maxO;
    // --- Posts 24h: Hot/New/Top tab 上方或侧边 "Today" 计数 ---
    const postSels = [ '[class*=\"posts-today\"]', '[class*=\"today-count\"]', '[class*=\"submission\"] [class*=\"count\"]' ];
    let maxP = 0;
    for (const sel of postSels) {
      try {
        for (const n of document.querySelectorAll(sel)) {
          const v = toNum(n.textContent);
          if (v > maxP) maxP = v;
        }
      } catch {}
    }
    out.posts_24h = maxP;
    out.message_volume_24h = maxP;
    return out;
  }

  function parseRelativeDate(s) {
    if (!s) return new Date().toISOString();
    const t = String(s).trim();
    const now = Date.now();
    const m1 = t.match(/(\d+)\s*(秒|second|min|分钟|小时|hour|day|天|周|week|月|month|年|year)/i);
    if (m1) {
      const n = parseInt(m1[1], 10);
      const u = m1[2].toLowerCase();
      const mult = /秒|second/.test(u) ? 1000 : /min|分钟/.test(u) ? 60000 : /小时|hour/.test(u) ? 3600000 : /天|day/.test(u) ? 86400000 : /周|week/.test(u) ? 7 * 86400000 : /月|month/.test(u) ? 30 * 86400000 : /年|year/.test(u) ? 365 * 86400000 : 0;
      return new Date(now - n * mult).toISOString();
    }
    const abs = new Date(t);
    if (abs.toString() !== 'Invalid Date' && abs.getFullYear() > 2015) return abs.toISOString();
    return new Date().toISOString();
  }

  function extractEntity(platform) {
    const path = location.pathname;
    const account = extractAccountName(platform);
    const communityPlatforms = { reddit: true, tieba: true, discord: true, telegram: true };
    let entityType = communityPlatforms[platform.key] ? 'COMMUNITY' : 'ACCOUNT';
    const extra = {};
    if (platform.key === 'stocktwits') {
      const m = path.match(/symbol\/([A-Za-z.]+)/i);
      if (m) { extra.symbol = m[1].toUpperCase(); entityType = 'COMMUNITY'; }
      else entityType = 'ACCOUNT';
    }
    if (platform.key === 'reddit') {
      const m = path.match(/r\/([A-Za-z0-9_]+)/i);
      if (m) extra.subreddit = m[1];
    }
    if (platform.key === 'telegram') {
      const m = path.match(/\/(s\/)?([A-Za-z0-9_]+)/);
      if (m) extra.channel = m[2];
    }
    return { account, entity_type: entityType, extra };
  }

  function collect({ manual = false } = {}) {
    const platform = detectPlatform();
    if (!platform) {
      return Promise.resolve({ ok: false, code: 'UNSUPPORTED_HOST', reason: `unsupported_host:${location.hostname}`, hint: '仅支持社媒/社区/金融平台的账号主页或具体作品页，其他域名一律不采集。' });
    }
    const profileCheck = isProfilePageAllowed(platform);
    if (profileCheck && profileCheck.ok === false) {
      const rejectRecord = {
        id: uid(), platform: platform.name, platform_key: platform.key, platform_category: platform.category,
        entity_type: 'ACCOUNT', account: (document.title || '').replace(/[｜|\-—_].*$/, '').trim().slice(0, 30), target_url: location.href,
        followers: 0, following: 0, views: 0, likes: 0, comments: 0, members: 0, posts_24h: 0,
        message_volume_24h: 0, engagement_rate: 0, latest_post: null, posts: [], extra: {},
        collected_at: new Date().toISOString(), page_title: document.title,
        error: profileCheck.code || 'NOT_PROFILE_PAGE', error_reason: profileCheck.reason, error_hint: profileCheck.hint,
      };
      try {
        chrome.runtime.sendMessage({ type: 'MATRIX_COLLECT_REJECT', payload: rejectRecord, code: profileCheck.code, reason: profileCheck.reason, hint: profileCheck.hint },
          () => { /* ignore lastError */ });
      } catch {}
      return Promise.resolve({ ok: false, code: profileCheck.code, reason: profileCheck.reason, hint: profileCheck.hint, record: rejectRecord });
    }
    const monitorTarget = extractMonitorTargetKey(platform);
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          let wlHit = null;
          if (platform.key === 'stocktwits' || platform.key === 'reddit') {
            wlHit = await whitelistMatch(platform).catch(() => null);
            if (!wlHit && monitorTarget) {
              const displayKey = monitorTarget.entity_type === 'STOCK' ? `$${monitorTarget.key}` : `r/${monitorTarget.key}`;
              const rejectRecord = {
                id: uid(), platform: platform.name, platform_key: platform.key, platform_category: platform.category,
                entity_type: monitorTarget.entity_type,
                account: displayKey, target_url: location.href,
                followers: 0, following: 0, views: 0, likes: 0, comments: 0, members: 0, posts_24h: 0,
                message_volume_24h: 0, engagement_rate: 0, latest_post: null, posts: [],
                extra: monitorTarget.entity_type === 'STOCK' ? { symbol: monitorTarget.key } : { subreddit: monitorTarget.key },
                collected_at: new Date().toISOString(), page_title: document.title,
                error: 'NOT_IN_MONITOR_WHITELIST',
                error_reason: `严格方案 A：${displayKey} 不在 Admin 官方监控清单，严禁入库（如需采集请先让管理员在后台添加）`,
                error_hint: `管理员进入 Admin → ${monitorTarget.entity_type === 'STOCK' ? '股票监控' : '社区监控'} Tab → 添加「${monitorTarget.key}」`,
              };
              try {
                chrome.runtime.sendMessage({ type: 'MATRIX_COLLECT_REJECT', payload: rejectRecord, code: 'NOT_IN_MONITOR_WHITELIST', reason: rejectRecord.error_reason, hint: rejectRecord.error_hint, _note: manual ? 'manual_trigger' : 'auto_3s_timer' },
                  () => resolve({ ok: false, code: 'NOT_IN_MONITOR_WHITELIST', reason: rejectRecord.error_reason, hint: rejectRecord.error_hint, record: rejectRecord, note: 'strict_scheme_A_blocked' }));
              } catch {
                resolve({ ok: false, code: 'NOT_IN_MONITOR_WHITELIST', reason: rejectRecord.error_reason, hint: rejectRecord.error_hint, record: rejectRecord, note: 'strict_scheme_A_blocked' });
              }
              return;
            }
          }
          const entity = extractEntity(platform);
          let finalEntityType = entity.entity_type;
          let finalAccount = entity.account;
          let finalTarget = location.href;
          let finalExtra = Object.assign({}, entity.extra || {});
          let finalAccountId = null;
          if (wlHit && wlHit.row) {
            finalEntityType = wlHit.entity_type;
            finalAccount = String(wlHit.row.account_name || wlHit.row.symbol || wlHit.row.subreddit || entity.account || '').trim();
            finalTarget = String(wlHit.row.target_url || location.href).trim() || location.href;
            if (wlHit.row.symbol) finalExtra.symbol = String(wlHit.row.symbol).toUpperCase();
            if (wlHit.row.subreddit) finalExtra.subreddit = String(wlHit.row.subreddit).toLowerCase();
            if (wlHit.row.note) finalExtra.monitor_note = String(wlHit.row.note);
            if (wlHit.row.id) {
              finalAccountId = String(wlHit.row.id);
              finalExtra.admin_monitor_id = String(wlHit.row.id);
            }
            finalExtra.monitor_whitelist_hint = 'admin_managed_strict_scheme_A';
          }
          const followers = extractFollowers(platform);
          const following = extractFollowing(platform);
          const likesTotal = extractLikesTotal(platform);
          const nativeAccountId = extractAccountId(platform);
          const avatar = extractAvatar(platform);
          const posts = extractPosts(platform);
          const latest_post = posts[0] || null;
          const postsViewsSum = posts.reduce((s, p) => s + (p.views || 0), 0);
          const accountViews = extractViewsAccount(platform);
          const views = Math.max(postsViewsSum, accountViews);
          const postLikesSum = posts.reduce((s, p) => s + (p.likes || 0), 0);
          const comments = posts.reduce((s, p) => s + (p.comments || 0), 0);
          const likes = likesTotal > 0 ? likesTotal : postLikesSum;
          let members = /COMMUNITY|STOCK|SUBREDDIT/.test(finalEntityType) ? (() => {
            let sel = '';
            try {
              sel = platform.key === 'reddit' ? '[data-testid="subscribers-id"]' : platform.key === 'stocktwits' ? '.UserHeader__watchers' : platform.key === 'telegram' ? '.tgme_page_extra, .members-count' : '';
            } catch {}
            let max = 0;
            if (sel) {
              try {
                for (const n of document.querySelectorAll(sel)) { const v = toNum(n.textContent); if (v > max) max = v; }
              } catch {}
            }
            if (max === 0 && platform.key === 'reddit') {
              try {
                for (const n of Array.from(document.querySelectorAll('div, span, td, li, strong, h2, h3')).slice(0, 800)) {
                  const txt = (n.textContent || '').replace(/\s+/g,' ').trim();
                  if (/members?|成员|订阅者/i.test(txt) && n.children && n.children.length <= 6 && txt.length < 80) {
                    const mm = txt.match(/([\d,.]+\s*[kKmM]?)\s*(members?|成员|订阅者)/i) || txt.match(/(members?|成员|订阅者)[^\d]{0,8}([\d,.]+\s*[kKmM]?)/i);
                    if (mm) { const v = toNum(mm[1] || mm[2]); if (v > max) max = v; }
                  }
                }
              } catch {}
            }
            return max || followers;
          })() : 0;
          let msg24h = posts.length;
          let symbol_price = null, symbol_change_pct = null, sentiment_bull = 0, sentiment_bear = 0, online = 0;
          let stockMetrics = null, redditMetrics = null;
          if (finalEntityType === 'STOCK' && platform.key === 'stocktwits') {
            try { stockMetrics = extractStocktwitsStockMetrics(); } catch {}
            if (stockMetrics) {
              if (stockMetrics.watchers > members) members = stockMetrics.watchers;
              if (stockMetrics.message_volume_24h > msg24h) msg24h = stockMetrics.message_volume_24h;
              if (stockMetrics.symbol_price != null) symbol_price = stockMetrics.symbol_price;
              if (stockMetrics.symbol_change_pct != null) symbol_change_pct = stockMetrics.symbol_change_pct;
              if (stockMetrics.sentiment_bull > 0) sentiment_bull = stockMetrics.sentiment_bull;
              if (stockMetrics.sentiment_bear > 0) sentiment_bear = stockMetrics.sentiment_bear;
              finalExtra.stock_metrics = stockMetrics;
            }
          } else if (finalEntityType === 'SUBREDDIT' && platform.key === 'reddit') {
            try { redditMetrics = extractRedditCommunityMetrics(); } catch {}
            if (redditMetrics) {
              if (redditMetrics.members > members) members = redditMetrics.members;
              if (redditMetrics.online >= 0) online = redditMetrics.online;
              if (redditMetrics.posts_24h > msg24h) msg24h = redditMetrics.posts_24h;
              if (redditMetrics.message_volume_24h > 0) msg24h = Math.max(msg24h, redditMetrics.message_volume_24h);
              finalExtra.reddit_metrics = redditMetrics;
            }
          }
          if (finalExtra.symbol && symbol_price == null && sentiment_bull === 0) {
            try { stockMetrics = stockMetrics || extractStocktwitsStockMetrics(); if (stockMetrics) {
              if (stockMetrics.watchers > members) members = stockMetrics.watchers;
              if (stockMetrics.message_volume_24h > msg24h) msg24h = stockMetrics.message_volume_24h;
              if (stockMetrics.symbol_price != null) symbol_price = stockMetrics.symbol_price;
              if (stockMetrics.symbol_change_pct != null) symbol_change_pct = stockMetrics.symbol_change_pct;
              if (stockMetrics.sentiment_bull > 0) sentiment_bull = stockMetrics.sentiment_bull;
              if (stockMetrics.sentiment_bear > 0) sentiment_bear = stockMetrics.sentiment_bear;
              finalExtra.stock_metrics = finalExtra.stock_metrics || stockMetrics;
            } } catch {}
          }
          if (nativeAccountId) finalExtra.native_account_id = nativeAccountId;
          if (likesTotal > 0) finalExtra.total_post_likes = postLikesSum;
          if (avatar && avatar.url) {
            finalExtra.avatar_url = avatar.url;
            if (avatar.data_url) finalExtra.avatar_data_url = avatar.data_url;
          }
          finalExtra.raw_fields = extractRawFieldsSnapshot(platform, { followers, following, likesTotal, postsCount: posts.length, views, comments });
          finalExtra.platform_field_meta = (() => {
            const meta = FIELD_META_BY_PLATFORM[platform.key] || null;
            if (!meta) return null;
            const map = {};
            ['followers','following','likesTotal','posts','views','comments','members','originals','reposts','stories','accountId'].forEach(k => {
              const m = meta[k]; if (m) map[k] = { native: m.nativeNames[0], unified: m.unified };
            });
            return map;
          })();
          const reject = shouldRejectRecord(platform, finalAccount, followers, views, likes, members, posts.length);
          if (!reject.ok) {
            const errorRecord = {
              id: uid(), platform: platform.name, platform_key: platform.key, platform_category: platform.category,
              entity_type: finalEntityType, account: finalAccount, target_url: finalTarget,
              followers, following, views, likes, comments, members, online, posts_24h: msg24h,
              message_volume_24h: msg24h, engagement_rate: 0, latest_post, posts, extra: finalExtra,
              sentiment_bull, sentiment_bear, symbol_price, symbol_change_pct,
              collected_at: new Date().toISOString(), page_title: document.title,
              error: reject.code, error_reason: reject.reason,
            };
            if (finalAccountId) errorRecord.account_id = finalAccountId;
            try {
              chrome.runtime.sendMessage({ type: 'MATRIX_COLLECT_REJECT', payload: errorRecord, code: reject.code, reason: reject.reason },
                () => resolve({ ok: false, code: reject.code, reason: reject.reason, record: errorRecord }));
            } catch (e) {
              resolve({ ok: false, code: reject.code, reason: reject.reason, record: errorRecord });
            }
            return;
          }
          const record = {
            id: uid(),
            platform: platform.name,
            platform_key: platform.key,
            platform_category: platform.category,
            entity_type: finalEntityType,
            account: finalAccount,
            target_url: finalTarget,
            followers,
            following,
            views,
            likes,
            comments,
            members,
            online,
            posts_24h: msg24h,
            message_volume_24h: msg24h,
            sentiment_bull,
            sentiment_bear,
            symbol_price,
            symbol_change_pct,
            engagement_rate: views > 0 ? +(((likes + comments) / views) * 100).toFixed(2) : 0,
            latest_post,
            posts,
            extra: finalExtra,
            collected_at: new Date().toISOString(),
            page_title: document.title,
          };
          if (finalAccountId) record.account_id = finalAccountId;
          try {
            chrome.runtime.sendMessage({ type: 'MATRIX_COLLECT_RESULT', payload: record }, (resp) => resolve({ ok: true, record, resp, wl_hit: !!wlHit }));
          } catch (e) {
            resolve({ ok: true, record, resp: null, note: 'sw_busy:queued_local', wl_hit: !!wlHit });
          }
        } catch (err) {
          resolve({ ok: false, code: 'COLLECT_EXCEPTION', reason: err && err.message ? err.message : String(err) });
        }
      }, manual ? 300 : 600);
    });
  }

  if (typeof window !== 'undefined' && typeof chrome !== 'undefined') {
    window.__matrix_collect = collect;
    chrome.runtime.onMessage.addListener((msg, sender, send) => {
      if (!msg || !msg.type) return false;
      if (msg.type === 'MATRIX_COLLECT_TRIGGER') { collect({ manual: true }).then(r => send && send(r)); return true; }
      if (msg.type === 'MATRIX_SET_WHITELIST') {
        const list = Array.isArray(msg.payload) ? msg.payload : [];
        _cachedWhitelist = list;
        _cachedWhitelistAt = Date.now();
        try {
          chrome.storage.local.set({ monitor_whitelist: list });
        } catch {}
        try { send && send({ ok: true, cached: list.length }); } catch {}
        return true;
      }
      if (msg.type === 'MATRIX_GET_WHITELIST') {
        getMonitorWhitelist(true).then(list => { try { send && send({ ok: true, list }); } catch {}; });
        return true;
      }
      return false;
    });

    /* --- 通用 60s 轮询（用于非监控平台） --- */
    let collectTimer = null;
    const schedule = () => {
      if (collectTimer) clearInterval(collectTimer);
      collectTimer = setInterval(() => {
        const pl = detectPlatform();
        if (pl && pl.key !== 'stocktwits' && pl.key !== 'reddit') collect({ manual: false });
      }, 60 * 1000);
    };
    setTimeout(() => {
      const pl = detectPlatform();
      if (pl && pl.key !== 'stocktwits' && pl.key !== 'reddit') collect({ manual: false });
    }, 2000);
    schedule();

    /* --- 「停留 ≥3s + load 完」 三重置（针对 Stocktwits/Reddit） --- */
    let _autoMonitorTimer = null;
    let _autoMonitorKey = '';
    const clearAutoMonitor = (reason = '') => {
      if (_autoMonitorTimer) { clearTimeout(_autoMonitorTimer); _autoMonitorTimer = null; }
    };
    const startAutoMonitor = () => {
      clearAutoMonitor();
      const pl = detectPlatform();
      const target = extractMonitorTargetKey(pl);
      if (!target) return;
      _autoMonitorKey = `${target.entity_type}:${target.key}`;
      _autoMonitorTimer = setTimeout(() => {
        if (document.hidden) { return; }
        collect({ manual: false }).catch(() => {});
      }, 3000);
    };
    const currentPlatformForAuto = detectPlatform();
    if (currentPlatformForAuto && (currentPlatformForAuto.key === 'stocktwits' || currentPlatformForAuto.key === 'reddit')) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(startAutoMonitor, 200);
      } else {
        window.addEventListener('load', () => setTimeout(startAutoMonitor, 200), { once: true });
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearAutoMonitor('hidden');
      else {
        const pl = detectPlatform();
        if (pl && (pl.key === 'stocktwits' || pl.key === 'reddit')) startAutoMonitor();
      }
    });

    /* --- SPA 路由变化同时触发 3s 倒计时重置 --- */
    let lastPath = location.pathname + location.search;
    setInterval(() => {
      const now = location.pathname + location.search;
      if (now !== lastPath) {
        lastPath = now;
        const pl = detectPlatform();
        if (!pl) return;
        if (pl.key === 'stocktwits' || pl.key === 'reddit') {
          clearAutoMonitor('spa_nav');
          setTimeout(startAutoMonitor, 250);
        } else {
          setTimeout(() => collect({ manual: false }), 1500);
        }
      }
    }, 1500);

    /* --- pushState/popstate 直接重置 --- */
    try {
      const _origPush = history.pushState;
      const _origRepl = history.replaceState;
      const hook = function () {
        setTimeout(() => {
          const pl = detectPlatform();
          if (pl && (pl.key === 'stocktwits' || pl.key === 'reddit')) {
            clearAutoMonitor('pushstate');
            setTimeout(startAutoMonitor, 200);
          } else if (pl) {
            setTimeout(() => collect({ manual: false }), 1500);
          }
        }, 50);
      };
      history.pushState = function () { const r = _origPush.apply(this, arguments); hook(); return r; };
      history.replaceState = function () { const r = _origRepl.apply(this, arguments); hook(); return r; };
      window.addEventListener('popstate', () => { setTimeout(hook, 50); });
    } catch {}

    setTimeout(() => {
      try { chrome.runtime.sendMessage({ type: 'MATRIX_CONTENT_HELLO', payload: { url: location.href, host: location.hostname, title: document.title, collected_at: new Date().toISOString() } }); } catch {}
    }, 800);
  }
})();
