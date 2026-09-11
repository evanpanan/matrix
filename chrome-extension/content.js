(() => {
  // ============================================================
  // v2 平台配置 + 新增 stocktwits / reddit 社区类提取
  // entity_type 由平台 + 路径自动判定：
  //   stocktwits symbol / reddit subreddit → COMMUNITY
  //   其他账号页 → ACCOUNT
  // ============================================================
  const PLATFORM_CONFIG = {
    xueqiu: {
      name: '雪球', category: '金融', entityType: 'ACCOUNT',
      patterns: [/xueqiu\.com/],
      selectors: {
        followers: ['.followers .count', '.user-followers b', '[class*="follower"] [class*="count"]', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        following: ['.following .count', '[class*="following"] [class*="count"]'],
        likes:     ['.likes .count', '[class*="like"] [class*="count"]'],
        views:     ['.views .count', '[class*="view"] [class*="count"]', '[class*="read"] [class*="count"]'],
      }
    },
    futu: {
      name: '富途牛牛', category: '金融', entityType: 'ACCOUNT',
      patterns: [/futu\.cn/, /futunn\.com/],
      selectors: {
        followers: ['[class*="follower"] [class*="num"]', '[class*="粉丝"] [class*="num"]', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="like"] [class*="num"]', '[class*="赞"] [class*="num"]'],
        views:     ['[class*="view"] [class*="num"]', '[class*="阅读"] [class*="num"]'],
        posts:     ['[class*="post"] [class*="num"]', '[class*="动态"] [class*="num"]'],
      }
    },
    laohu: {
      name: '老虎社区', category: '金融', entityType: 'ACCOUNT',
      patterns: [/laohu8\.com/],
      selectors: {
        followers: ['[class*="follower"]', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        views:     ['[class*="view"]', 'text=/阅读\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="like"]', 'text=/赞\\s*[\\d,\\.万]+/'],
      }
    },
    wechat: {
      name: '微信公众号', category: '社媒', entityType: 'ACCOUNT',
      patterns: [/weixin\.qq\.com/],
      selectors: {
        followers: ['[class*="follower"]', '#js_name + .inner_tool .follower_num', 'text=/(总用户数|粉丝)\\s*[\\d,\\.万]+/'],
        views:     ['[class*="read_num"]', '#readNum', 'text=/阅读\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="like_num"]', '#likeNum', '[class*="赞"] [class*="num"]'],
        comments:  ['[class*="comment"] [class*="num"]', 'text=/留言\\s*[\\d,\\.万]+/'],
      }
    },
    xiaohongshu: {
      name: '小红书', category: '社媒', entityType: 'ACCOUNT',
      patterns: [/xiaohongshu\.com/, /xhslink\.com/],
      selectors: {
        followers: ['.fans-count', '[class*="fan"] [class*="count"]', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        likes:     ['.like-count', 'text=/(获赞与收藏|赞)\\s*[\\d,\\.万]+/'],
        views:     ['[class*="view"] [class*="count"]', 'text=/阅读\\s*[\\d,\\.万]+/'],
        collect:   ['.collect-count', '[class*="collect"] [class*="count"]', 'text=/收藏\\s*[\\d,\\.万]+/'],
      }
    },
    douyin: {
      name: '抖音', category: '社媒', entityType: 'ACCOUNT',
      patterns: [/douyin\.com/, /iesdouyin\.com/],
      selectors: {
        followers: ['[class*="follower"] [class*="num"]', '[class*="粉丝"] [class*="num"]', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="like"] [class*="num"]', 'text=/(获赞|赞)\\s*[\\d,\\.万]+/'],
        views:     ['[class*="play"] [class*="num"]', 'text=/播放\\s*[\\d,\\.万]+/'],
        comments:  ['[class*="comment"] [class*="num"]', 'text=/评论\\s*[\\d,\\.万]+/'],
      }
    },
    x: {
      name: 'X(Twitter)', category: '海外', entityType: 'ACCOUNT',
      patterns: [/twitter\.com/, /x\.com/],
      selectors: {
        followers: ['a[href$="/followers"] span', '[data-testid*="followers"] span', 'text=/[\\d,\\.KM]+ Followers/'],
        following: ['a[href$="/following"] span', '[data-testid*="following"] span'],
        likes:     ['[data-testid="like"] span', '[aria-label*="likes"] span'],
        views:     ['[aria-label*="views"] span', '[data-testid="app-text-transition-container"] span'],
      }
    },
    youtube: {
      name: 'YouTube', category: '海外', entityType: 'ACCOUNT',
      patterns: [/youtube\.com/],
      selectors: {
        followers: ['#subscriber-count', 'yt-formatted-string[id*="subscriber"]', 'text=/[\\d,\\.MKB]+ subscribers/'],
        views:     ['#view-count', 'yt-view-count-renderer span', '[class*="view-count"]'],
        likes:     ['#segmented-like-button .yt-spec-button-shape-next__button-text-content', 'text=/[\\d,\\.MKB]+ Likes/'],
        comments:  ['#count yt-formatted-string', 'text=/[\\d,\\.MKB]+ Comments/'],
      }
    },
    bilibili: {
      name: '哔哩哔哩', category: '社媒', entityType: 'ACCOUNT',
      patterns: [/bilibili\.com/],
      selectors: {
        followers: ['[class*="follower"] [class*="num"]', '.n-fs', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="like"] [class*="num"]', '.like', 'text=/点赞\\s*[\\d,\\.万]+/'],
        views:     ['[class*="view"] [class*="num"]', '.view', 'text=/播放\\s*[\\d,\\.万]+/'],
        collect:   ['[class*="collect"] [class*="num"]', '.collect', 'text=/收藏\\s*[\\d,\\.万]+/'],
      }
    },
    weibo: {
      name: '微博', category: '社媒', entityType: 'ACCOUNT',
      patterns: [/weibo\.com/],
      selectors: {
        followers: ['.S_txt1 [href$="/fans"]', '[class*="follower"]', 'text=/粉丝\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="like"] [class*="num"]', 'text=/赞\\s*[\\d,\\.万]+/'],
        views:     ['[class*="view"] [class*="num"]', '.WB_info .S_txt2', 'text=/阅读\\s*[\\d,\\.万]+/'],
        comments:  ['[class*="comment"] [class*="num"]', 'text=/评论\\s*[\\d,\\.万]+/'],
      }
    },
    zhihu: {
      name: '知乎', category: '社媒', entityType: 'ACCOUNT',
      patterns: [/zhihu\.com/],
      selectors: {
        followers: ['[class*="follower"] [class*="num"]', 'text=/关注者\\s*[\\d,\\.万]+/'],
        likes:     ['[class*="vote"] [class*="num"]', '[class*="赞同"]', 'text=/[\\d,\\.万]+ 赞同/'],
        views:     ['[class*="view"] [class*="num"]', 'text=/[\\d,\\.万]+ 次阅读/'],
        collect:   ['[class*="collect"] [class*="num"]', 'text=/[\\d,\\.万]+ 次收藏/'],
      }
    },
    stocktwits: {
      name: 'Stocktwits', category: '股票', entityType: 'COMMUNITY',
      patterns: [/stocktwits\.com\/symbol\//i, /stocktwits\.com\/[^/]+$/i],
      isCommunityUrl: (url) => /\/symbol\//i.test(url) || /\/stock\//i.test(url),
      selectors: {
        watchers:   ['[class*="watch"] [class*="count"]', '[data-testid="watch-count"]', 'text=/[\\d,.KMB]+\\s*Watcher/'],
        msgVolume:  ['[class*="volume"] [class*="count"]', '[class*="messages-count"]', 'text=/[\\d,.KMB]+\\s*(messages?|讨论|消息)/i'],
        bullPct:    ['[class*="sentiment"] [class*="bull"] [class*="pct"]', '.sentiment-bar .bull', '[aria-label*="Bullish"]', 'text=/看涨\\s*[\\d.]+%?/'],
        bearPct:    ['[class*="sentiment"] [class*="bear"] [class*="pct"]', '.sentiment-bar .bear', '[aria-label*="Bearish"]', 'text=/看跌\\s*[\\d.]+%?/'],
        price:      ['[class*="price"] [class*="current"]', '.symbol-price', '[data-testid="symbol-price"]'],
        changePct:  ['[class*="change"] [class*="percent"]', '.price-change', '[data-testid="change-percent"]'],
      }
    },
    reddit: {
      name: 'Reddit', category: '社区', entityType: 'COMMUNITY',
      patterns: [/reddit\.com\/r\//i],
      isCommunityUrl: (url) => /\/r\/[A-Za-z0-9_]+/i.test(url),
      selectors: {
        members:  ['[class*="member"] [class*="count"]', '#MembersAndOnline ._1EAZY1wP17x7X9q1iC3j9V span', 'text=/[\\d,.KMB]+\\s*members?/i'],
        online:   ['[class*="online"] [class*="count"]', '._26rIU8Xm5hKQhk98fLxZ0V span', '._3J0ufs3GfVrJv1p2k3fS7_ span', 'text=/[\\d,.KMB]+\\s*online/i'],
        posts24h: ['[class*="posts"] [class*="count"]', 'text=/[\\d,.KMB]+\\s*(posts?|帖文|帖子)\\s*(per day|today|今日)?/i'],
        desc:     ['[data-testid="community-sidebar"] p', '._3b98SgZJ_8VJt1E1jP2d3f'],
      }
    }
  };

  function detectPlatform() {
    const url = window.location.href;
    for (const [key, config] of Object.entries(PLATFORM_CONFIG)) {
      if (config.patterns.some(p => p.test(url))) {
        const forceCommunity = config.isCommunityUrl ? config.isCommunityUrl(url) : false;
        const entity = forceCommunity ? 'COMMUNITY' : (config.entityType || 'ACCOUNT');
        return { key, entity_type: entity, ...config };
      }
    }
    return null;
  }

  function parseNumber(text) {
    if (!text) return 0;
    text = String(text).trim().replace(/[,，\s]/g, '');
    const w = text.match(/([\d.]+)\s*万/);   if (w) return Math.round(parseFloat(w[1]) * 10000);
    const y = text.match(/([\d.]+)\s*亿/);   if (y) return Math.round(parseFloat(y[1]) * 1e8);
    const b = text.match(/([\d.]+)\s*[Bb]/); if (b) return Math.round(parseFloat(b[1]) * 1e9);
    const m = text.match(/([\d.]+)\s*[Mm]/); if (m) return Math.round(parseFloat(m[1]) * 1e6);
    const k = text.match(/([\d.]+)\s*[Kk]/); if (k) return Math.round(parseFloat(k[1]) * 1000);
    const n = text.match(/[\d.]+/);
    return n ? Math.round(parseFloat(n[0])) : 0;
  }

  function parsePercent(text) {
    if (!text) return 0;
    const m = String(text).match(/([\d.]+)\s*%?/);
    return m ? Math.min(100, Math.max(0, parseFloat(m[1]))) : 0;
  }

  function extractBySelectors(selectors) {
    if (!selectors) return 0;
    for (const sel of selectors) {
      try {
        if (sel.startsWith('text=/')) {
          const regex = new RegExp(sel.replace('text=/', '').replace(/\/$/, ''));
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          const candidates = [];
          while ((node = walker.nextNode())) if (regex.test(node.textContent)) candidates.push(node.textContent);
          if (candidates.length) return parseNumber(candidates.join(' '));
        } else {
          const el = document.querySelector(sel);
          if (el) {
            const n = parseNumber(el.textContent);
            if (n > 0) return n;
          }
        }
      } catch (_) { continue; }
    }
    return 0;
  }

  // ---- Stocktwits 专属：情绪条 + Watchers ----
  function extractStocktwits() {
    const bodyText = document.body.innerText || '';
    const out = {
      members: 0, message_volume_24h: 0,
      sentiment_bull: 0, sentiment_bear: 0,
      symbol_price: null, symbol_change_pct: null,
    };

    const wm = bodyText.match(/([\d,.KMB]+)\s*Watcher/i);
    if (wm) out.members = parseNumber(wm[1]);
    const mm = bodyText.match(/([\d,.KMB]+)\s*(Message|messages?|讨论|消息)/i);
    if (mm) out.message_volume_24h = parseNumber(mm[1]);
    const bm = bodyText.match(/(?:看涨|Bullish)[^0-9]{0,6}([\d.]+)\s*%?/i);
    const br = bodyText.match(/([\d.]+)%\s*(?:看涨|Bullish)/i);
    if (bm || br) out.sentiment_bull = parsePercent((bm || br)[1]);
    const em = bodyText.match(/(?:看跌|Bearish)[^0-9]{0,6}([\d.]+)\s*%?/i);
    const er = bodyText.match(/([\d.]+)%\s*(?:看跌|Bearish)/i);
    if (em || er) out.sentiment_bear = parsePercent((em || er)[1]);

    if (!out.sentiment_bull && !out.sentiment_bear) {
      const bars = document.querySelectorAll('[class*="sentiment"], [class*="Sentiment"]');
      bars.forEach(bar => {
        const txt = bar.textContent || '';
        const bulls = txt.match(/([\d.]+)\s*%/);
        if (bulls && /bull|涨|多/i.test(txt)) out.sentiment_bull = parsePercent(bulls[1]);
        const bears = txt.match(/([\d.]+)\s*%/);
        if (bears && /bear|跌|空/i.test(txt)) out.sentiment_bear = parsePercent(bears[1]);
      });
    }

    // 股票价格
    const price = document.querySelector('[data-testid="symbol-price"], .symbol-price, [class*="symbol"] [class*="price"]');
    if (price) out.symbol_price = parseFloat(price.textContent.replace(/[^0-9.-]/g, '')) || null;
    const chg = document.querySelector('[data-testid="change-percent"], [class*="change"] [class*="percent"], .price-change');
    if (chg) out.symbol_change_pct = parseFloat(chg.textContent.replace(/[^0-9.-]/g, '')) || null;

    return out;
  }

  // ---- Reddit Subreddit 专属：Members / Online / Posts 24h ----
  function extractReddit() {
    const bodyText = document.body.innerText || '';
    const out = { members: 0, online: 0, posts_24h: 0, message_volume_24h: 0 };

    const mm = bodyText.match(/([\d,.KMB]+)\s*members?/i);
    if (mm) out.members = parseNumber(mm[1]);
    const om = bodyText.match(/([\d,.KMB]+)\s*online/i);
    if (om) out.online = parseNumber(om[1]);
    const pm = bodyText.match(/([\d,.KMB]+)\s*(posts?|帖文|帖子)\s*(per day|today|今日)?/i);
    if (pm) {
      out.posts_24h = parseNumber(pm[1]);
      out.message_volume_24h = out.posts_24h;
    }

    if (!out.members || !out.online) {
      document.querySelectorAll('h1, h2, [class*="about"], [class*="sidebar"] [class*="text"]').forEach(el => {
        const t = el.textContent || '';
        if (!out.members) {
          const m = t.match(/([\d,.KMB]+)\s*members?/i);
          if (m) out.members = parseNumber(m[1]);
        }
        if (!out.online) {
          const m = t.match(/([\d,.KMB]+)\s*online/i);
          if (m) out.online = parseNumber(m[1]);
        }
      });
    }
    return out;
  }

  function extractAccountName(platform) {
    if (platform?.key === 'stocktwits') {
      const m = window.location.pathname.match(/\/symbol\/([A-Za-z0-9.]+)/i);
      if (m) return '$' + m[1].toUpperCase();
    }
    if (platform?.key === 'reddit') {
      const m = window.location.pathname.match(/\/r\/([A-Za-z0-9_]+)/i);
      if (m) return 'r/' + m[1];
    }
    const candidates = [
      'h1', '.username', '.user-name', '[class*="name"]',
      '#channel-name', '#js_name', '.ProfileHeaderCard-name',
      '[data-testid="UserName"]', '._244FWDcT', '.shreddit-subreddit-header-title',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim() && el.textContent.trim().length < 60) {
        return el.textContent.trim();
      }
    }
    const title = document.title.split(/[|丨\-–—]/)[0].trim();
    return title || window.location.hostname;
  }

  function extractLatestPostData(entity_type) {
    if (entity_type === 'COMMUNITY') return {};
    const sels = [
      '[class*="note-item"]', '[class*="post "]', '[class*="dynamic"]', '[class*="status"]',
      'article', '.timeline-item', '[data-testid="tweet"]', 'ytd-video-renderer'
    ];
    let result = { views: 0, likes: 0, comments: 0, collect: 0 };
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = el.textContent;
      result.views    = Math.max(result.views,    parseNumber(t.match(/[\d,.万KM]+\s*(阅读|播放|View|观看)/i)?.[0] || ''));
      result.likes    = Math.max(result.likes,    parseNumber(t.match(/[\d,.万KM]+\s*(赞|Like|喜欢|赞同)/i)?.[0] || ''));
      result.comments = Math.max(result.comments, parseNumber(t.match(/[\d,.万KM]+\s*(评论|Comment|留言)/i)?.[0] || ''));
      result.collect  = Math.max(result.collect,  parseNumber(t.match(/[\d,.万KM]+\s*(收藏|Collect)/i)?.[0] || ''));
      if (result.views || result.likes) break;
    }
    return result;
  }

  function showToast(msg, type = 'success') {
    const existing = document.getElementById('matrix-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'matrix-toast';
    toast.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 2147483647;
      padding: 14px 22px; border-radius: 12px; color: #fff;
      background: ${type === 'success' ? 'rgba(34,197,94,0.95)' : type === 'community' ? 'rgba(99,102,241,0.95)' : 'rgba(239,68,68,0.95)'};
      font-size: 14px; font-weight: 500; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15); backdrop-filter: blur(10px);
      transform: translateX(400px); transition: transform 0.4s cubic-bezier(0.4,0,0.2,1);
      display: flex; align-items: center; gap: 8px; white-space: nowrap; max-width: 420px;
      overflow: hidden; text-overflow: ellipsis;
    `;
    toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${msg}</span>`;
    document.documentElement.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
    setTimeout(() => {
      toast.style.transform = 'translateX(400px)';
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  function formatShort(num) {
    if (num >= 1e8) return (num / 1e8).toFixed(1) + '亿';
    if (num >= 1e4) return (num / 1e4).toFixed(1) + '万';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return String(num);
  }

  function collectData() {
    const platform = detectPlatform();
    if (!platform) return { success: false, error: 'Unsupported platform', url: location.href };

    const data = {
      account: extractAccountName(platform),
      platform: platform.name,
      platform_key: platform.key,
      platform_category: platform.category,
      entity_type: platform.entity_type,
      url: location.href,
      followers: 0, following: 0, likes: 0, views: 0, comments: 0, collect: 0,
      members: 0, online: 0, message_volume_24h: 0,
      sentiment_bull: 0, sentiment_bear: 0, posts_24h: 0,
      symbol_price: null, symbol_change_pct: null,
      updated_at: new Date().toISOString(),
      timestamp: Date.now(),
    };

    if (platform.entity_type === 'COMMUNITY') {
      if (platform.key === 'stocktwits') {
        Object.assign(data, extractStocktwits());
      } else if (platform.key === 'reddit') {
        Object.assign(data, extractReddit());
      } else {
        data.members            = extractBySelectors(platform.selectors.watchers || platform.selectors.members);
        data.message_volume_24h = extractBySelectors(platform.selectors.msgVolume || platform.selectors.posts24h);
        data.posts_24h          = extractBySelectors(platform.selectors.posts24h);
        data.sentiment_bull     = parsePercent(String(extractBySelectors(platform.selectors.bullPct))) || 0;
        data.sentiment_bear     = parsePercent(String(extractBySelectors(platform.selectors.bearPct))) || 0;
      }
      if (!data.message_volume_24h) data.message_volume_24h = data.posts_24h;
    } else {
      data.followers = extractBySelectors(platform.selectors.followers);
      data.following = extractBySelectors(platform.selectors.following);
      data.likes     = extractBySelectors(platform.selectors.likes);
      data.views     = extractBySelectors(platform.selectors.views);
      data.comments  = extractBySelectors(platform.selectors.comments);
      data.collect   = extractBySelectors(platform.selectors.collect);

      const lp = extractLatestPostData(platform.entity_type);
      if (lp.views    && !data.views)    data.views    = lp.views;
      if (lp.likes    && !data.likes)    data.likes    = lp.likes;
      if (lp.comments && !data.comments) data.comments = lp.comments;
      if (lp.collect  && !data.collect)  data.collect  = lp.collect;
      data.latest_post = lp;

      if (data.views > 0) {
        data.engagement_rate = +(((data.likes + data.comments + data.collect) / data.views) * 100).toFixed(2);
      }
    }

    // 兜底：页面文本正则
    const body = document.body.innerText || '';
    if (platform.entity_type === 'ACCOUNT') {
      const rules = [
        [/粉丝\s*([\d,.万KM]+)/,        'followers'],
        [/([\d,.万KM]+)\s*Followers/i,   'followers'],
        [/关注者[^0-9]{0,6}([\d,.万KM]+)/, 'followers'],
        [/([\d,.万KM]+)\s*阅读(量)?/i,   'views'],
        [/([\d,.万KM]+)\s*播放(量)?/i,   'views'],
        [/([\d,.万KM]+)\s*Views/i,       'views'],
      ];
      rules.forEach(([re, key]) => {
        const m = body.match(re);
        if (m && !data[key]) data[key] = parseNumber(m[1]);
      });
    }

    return { success: true, data };
  }

  function runCollection() {
    const result = collectData();
    if (result.success) {
      chrome.runtime.sendMessage({ type: 'DATA_COLLECTED', payload: result.data }, (resp) => {
        if (resp?.success) {
          const d = result.data;
          const parts = [];
          if (d.entity_type === 'COMMUNITY') {
            if (d.members)            parts.push(`成员 ${formatShort(d.members)}`);
            if (d.message_volume_24h) parts.push(`讨论量 ${formatShort(d.message_volume_24h)}`);
            if (d.sentiment_bull)     parts.push(`情绪 🐂${d.sentiment_bull}% / 🐻${d.sentiment_bear || 0}%`);
            showToast(`${d.platform} · ${d.account} 社区数据提取成功${parts.length ? ' · ' + parts.join(' / ') : ''}`, 'community');
          } else {
            if (d.followers) parts.push(`粉丝 ${formatShort(d.followers)}`);
            if (d.views)     parts.push(`阅读 ${formatShort(d.views)}`);
            if (d.likes)     parts.push(`赞 ${formatShort(d.likes)}`);
            showToast(`${d.platform} · ${d.account} 数据提取成功${parts.length ? ' · ' + parts.join(' / ') : ''}`);
          }
        }
      });
    }
    return result;
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResp) => {
    if (msg.type === 'COLLECT_NOW') { sendResp(runCollection()); }
    else if (msg.type === 'PING')    { sendResp({ ok: true, platform: detectPlatform()?.name || 'unknown', entity: detectPlatform()?.entity_type }); }
    return true;
  });

  let last = 0;
  function debouncedCollect() {
    const now = Date.now();
    if (now - last < 6000) return;
    last = now;
    setTimeout(() => {
      const r = collectData();
      if (!r.success) return;
      const d = r.data;
      const has = d.entity_type === 'COMMUNITY'
        ? (d.members > 0 || d.message_volume_24h > 0 || d.posts_24h > 0 || d.sentiment_bull > 0)
        : (d.followers > 0 || d.views > 0 || d.likes > 0);
      if (has) chrome.runtime.sendMessage({ type: 'DATA_COLLECTED', payload: d });
    }, 3000);
  }

  addEventListener('load', () => setTimeout(debouncedCollect, 4000));
  let ob = new MutationObserver(() => {
    clearTimeout(window._mxt);
    window._mxt = setTimeout(debouncedCollect, 2500);
  });
  ob.observe(document.documentElement, { childList: true, subtree: true });
})();
