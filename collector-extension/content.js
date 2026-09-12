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
    const e = el.querySelector ? el.querySelector(sel) : null;
    return e ? e.textContent.trim() : '';
  };
  const attr = (el, sel, a) => {
    const e = el.querySelector ? el.querySelector(sel) : null;
    return e ? (e.getAttribute(a) || '').trim() : '';
  };
  const all = (el, sel) => Array.from((el && el.querySelectorAll) ? el.querySelectorAll(sel) : []);
  const safeDate = (d) => (d instanceof Date && !isNaN(d)) ? d.toISOString() : new Date().toISOString();

  function detectPlatform() {
    const host = location.hostname;
    for (const p of PLATFORM_DETECTORS) {
      if (p.re.test(host)) return p;
    }
    return null;
  }

  function extractAccountName(platform) {
    const fallback = document.title.replace(/[｜|\-—_].*$/, '').trim() || location.pathname.replace(/\//g, ' ').trim() || host;
    const selectors = {
      xiaohongshu: ['.username', '.user-nickname', '.name', 'h1', '[class*=name]'],
      douyin: ['.author-name', '.user-name', '[class*=nick]', 'h1'],
      wechat: ['.rich_media_meta_nickname', '#js_name', '.profile_nickname', '.weui-desktop-mass-account__name'],
      weibo: ['.username', '.name', '[class*=name] .W_fb', 'h1'],
      bilibili: ['.username', 'h1.user-name', '#h-name', '.name'],
      zhihu: ['.ProfileHeader-name', '.UserLink-link', 'h1'],
      futu: ['.user-name', '.nick-name', '.name', 'h1'],
      laohu: ['.user-name', '.nickname', 'h1'],
      xueqiu: ['.name', '.user-name', '.screen-name', 'h1'],
      x: ['[data-testid=User-Name]', 'div[data-testid=UserProfileHeader_Items] + div h2', 'h1', '.css-1jxf684'],
      tiktok: [['h2[data-e2e=user-title]', '[data-e2e=user-nickname]', 'h1']],
      youtube: ['#channel-title yt-formatted-string', 'h1 yt-formatted-string', '.ytd-channel-name'],
      linkedin: ['.text-heading-xlarge', '.pv-text-details__left-panel h1', 'h1'],
      instagram: ['header h2', 'h1', '._aada'],
      telegram: ['.tgme_page_title', '.channel_header_title', 'h1'],
      discord: ['.headerTag-3XvMzY', '.name-2m3Cms', 'h1'],
      stocktwits: ['.with-header-user-name', '.UserHeader__username', 'h1'],
      reddit: ['[data-testid=top-bar-title]', 'h1', '.subredditname'],
      seekingalpha: ['.profile-name', '.author-name', 'h1'],
      tieba: ['.card_head_title', '.tbui_title_wrap h1', 'h1'],
      changqiao: ['.user-name', 'h1', '.name'],
    };
    const list = selectors[platform.key] || ['h1'];
    for (const sel of (Array.isArray(list[0]) ? list[0] : list)) {
      const t = text(document, sel);
      if (t && t.length < 80) return t;
    }
    return fallback;
  }

  function extractFollowers(platform) {
    const rules = {
      xiaohongshu:   ['.fans-count', '.follower-count', 'span:has(+ span:contains("粉丝"))', '[class*=fans]', '[class*=follower]'],
      douyin:        ['.follow-count', '[class*=fans]', '[class*=follow] + span', 'span:has(> span:contains("粉丝"))'],
      wechat:        ['.weui-desktop-mass-fans__num', 'span.num:contains("粉丝") + strong', '强:contains("全部群发")'],
      weibo:         ['table.tb_counter strong + span', '.S_line1 strong', '.W_f18'],
      bilibili:      ['[id=page-followers]', '.n-f .n-stat .n-num', '#n-fans .n-num'],
      zhihu:         ['.NumberBoard-itemValue', '.FollowStatus + strong', 'strong:contains("关注者")'],
      futu:          ['.fans-count', '.follow-count', '[class*=fans]', 'span:contains("粉丝") + *'],
      laohu:         ['.fans-num', '.follow-count', '[class*=fans]'],
      xueqiu:        ['.fans_count', '.follow-count', 'a[href$=followers]'],
      x:             ['a[href$=followers] span span:first-child', 'a[href$="/followers"] span', '[class*=followers]'],
      tiktok:        [['[data-e2e=followers-count] strong', '[class*=stat-item] > strong:nth-child(1)', 'strong:contains("粉丝")']],
      youtube:       ['#subscriber-count yt-formatted-string', '.yt-core-attributed-string'],
      linkedin:      ['.pvs-header__optional-link', 'section:contains("connections")'],
      instagram:     ['ul li:nth-child(2) span:first-child', 'span:contains("followers")'],
      telegram:      ['.tgme_page_extra', '.members-count'],
      discord:       ['.membersGroup-2eiWxl', '.total-1Zbp7E'],
      stocktwits:    ['.UserHeader__watchers', '.with-header-subtitle', 'span:contains("Watchers")'],
      reddit:        ['[data-testid=subscribers-id]', 'div:contains("members")'],
      seekingalpha:  ['.followers-count', '.stat-followers'],
      tieba:         ['.tbui_total_num', '.th_footer_l_rs span'],
      changqiao:     ['.fans-count', '[class*=fans]', 'span:contains("粉丝") + *'],
      wechat_video:  ['.user-profile-header-fans', '.fans-count', '[class*=fans]'],
    };
    const sels = rules[platform.key] || rules.default || [];
    for (const s of sels) {
      let nodes;
      try { nodes = document.querySelectorAll(s); } catch { continue; }
      for (const n of nodes) {
        const v = toNum(n.textContent);
        if (v > 0) return v;
      }
    }
    const m = document.body.innerText.match(/(粉丝|关注者|订阅者|followers|fans|subscribers|members|成员)[^\d]{0,8}([\d,.]+)\s*(亿|万|k|m|b)?/i);
    if (m) return toNum(m[2] + (m[3] || ''));
    return 0;
  }

  function extractPosts(platform) {
    const out = [];
    const rules = {
      xiaohongshu: { list: '.note-item, .feeds-container .note, a[href^="/explore/"]', title: '.title, .content, h3, p', views: '.view, .count', likes: '.like-wrapper .count, .like, .icon-like + span', comments: '.comment, .icon-comment + span', url: 'a[href]', date: '.date, .time' },
      douyin: { list: 'li[data-e2e=user-post-item-list-item], div[class*=video-card], a[href^="/video/"]', title: 'div[data-e2e=user-post-item-desc]', views: 'div[data-e2e=user-post-item-play-count], .play-count', likes: 'div[data-e2e=user-post-item-digg], .digg-count', comments: '.comment-count', url: 'a[href]', date: '.time' },
      weibo: { list: '.WB_cardwrap[class*=S_bg2]', title: '.WB_text, .content', views: '.WB_from a', viewsRx: /阅读\s*([\d.]+万?)/i, likes: '.WB_feed_handle .pos span:nth-child(3) em', comments: '.WB_feed_handle .pos span:nth-child(2) em', url: '.WB_from a[href]', date: '.WB_from a' },
      bilibili: { list: '.small-item, .video-list-item, li.small-item', title: '.title, .info .title', views: '.so-icon, .play', likes: '.like, .fav', comments: '.comment, .danmaku', url: 'a[href]', date: '.time' },
      x: { list: 'article[data-testid=tweet], div[data-testid=cellInnerDiv]', title: 'div[data-testid=tweetText]', views: 'div[aria-label*=views], a[href$=analytics] span', likes: 'button[data-testid=like] div, div[data-testid=like] span', comments: 'button[data-testid=reply] div, div[data-testid=reply] span', url: 'a[href*=status]', date: 'time' },
      tiktok: { list: 'div[data-e2e=user-post-item], a[href^=/video/]', title: 'div[data-e2e=user-post-item-desc]', views: 'div[data-e2e=user-post-item-play-count], strong', likes: 'div[data-e2e=user-post-item-digg] strong', comments: '.comment-count', url: 'a[href]', date: '.time' },
      xueqiu: { list: '.status-list .status, article, .AnonymousHome_home__timeline-item', title: '.status-title, .status-content', views: '.status-source, .retweet', likes: '.iconfont.icon-like + span, .like-count', comments: '.reply-count, .iconfont.icon-comment + span', url: 'a[href^=/status/]', date: '.status-source a, time' },
      futu: { list: '.momo-post, .article-item, .feed-item', title: '.title, .content', views: '.read-count, .view-count', likes: '.like-count, .digg-count', comments: '.comment-count', url: 'a[href]', date: '.time' },
      youtube: { list: '#contents ytd-grid-video-renderer, ytd-rich-grid-media', title: '#video-title yt-formatted-string', views: '#metadata-line yt-formatted-string:nth-child(1)', likes: '', comments: '', url: '#video-title', date: '#metadata-line yt-formatted-string:nth-child(2)' },
      stocktwits: { list: 'article.message, .stream-item', title: '.Message_content', views: '.views', likes: '.like-count, .like-btn span', comments: '.reply-count', url: 'a[href*=messages/]', date: 'time' },
      reddit: { list: 'div[data-testid=post-container], .Post', title: 'h3', views: '[data-testid=vote-arrows] + div', likes: '[data-testid=vote-arrows]', comments: '[data-testid=comments-count]', url: 'a[data-testid=comments-page-link]', date: 'time' },
      zhihu: { list: '.ContentItem, .List-item, article', title: '.ContentItem-title, h2', views: '.ContentItem-meta .number + span:contains("阅读")', likes: '.VoteButton--up .count', comments: '.ContentItem-actions .Button--plain:contains("评论")', url: 'a[href*=answer], a[href*=p/]', date: '.ContentItem-time' },
      instagram: { list: 'article a[href*=/p/]', title: 'img[alt]', views: '', likes: '', comments: '', url: 'a[href]', date: 'time' },
      tieba: { list: '.j_thread_list li, .threadlist_title', title: '.threadlist_title a', views: '.threadlist_rep_num', likes: '', comments: '.threadlist_rep_num', url: 'a[href]', date: '.threadlist_reply_date' },
      linkedin: { list: 'div[data-id], .occludable-update, section.feed-shared-update-v2', title: '.feed-shared-update-v2__description, .break-words', views: '.analytics-entry-point', likes: '.social-details-social-counts__reactions-count', comments: '.social-details-social-counts__comments', url: 'a[href*=posts]', date: 'time' },
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
      out.push({ id: uid(), title, views, likes, comments, shares: 0, collect: 0, engagement_rate: views > 0 ? +(((likes + comments) / views) * 100).toFixed(2) : 0, url: href, published_at: iso, platform: platform.name, platform_key: platform.key });
    }
    return out.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
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
    const communityPlatforms = { stocktwits: true, reddit: true, tieba: true, discord: true, telegram: true };
    const entityType = communityPlatforms[platform.key] ? 'COMMUNITY' : 'ACCOUNT';
    const extra = {};
    if (platform.key === 'stocktwits') {
      const m = path.match(/symbol\/([A-Za-z.]+)/i);
      if (m) extra.symbol = m[1].toUpperCase();
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

  function collect() {
    const platform = detectPlatform();
    if (!platform) {
      return Promise.resolve({ ok: false, reason: `unsupported_host:${location.hostname}` });
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const entity = extractEntity(platform);
          const followers = extractFollowers(platform);
          const posts = extractPosts(platform);
          const latest_post = posts[0] || null;
          const views = posts.reduce((s, p) => s + (p.views || 0), 0);
          const likes = posts.reduce((s, p) => s + (p.likes || 0), 0);
          const comments = posts.reduce((s, p) => s + (p.comments || 0), 0);
          const members = /COMMUNITY/.test(entity.entity_type) ? (() => {
            const sel = platform.key === 'reddit' ? '[data-testid=subscribers-id], div:contains("members")' : platform.key === 'stocktwits' ? '.UserHeader__watchers' : platform.key === 'telegram' ? '.tgme_page_extra, .members-count' : '';
            let max = 0;
            if (sel) for (const n of document.querySelectorAll(sel)) { const v = toNum(n.textContent); if (v > max) max = v; }
            return max || followers;
          })() : 0;
          const msg24h = posts.length;
          const record = {
            id: uid(),
            platform: platform.name,
            platform_key: platform.key,
            platform_category: platform.category,
            entity_type: entity.entity_type,
            account: entity.account,
            target_url: location.href,
            followers,
            views,
            likes,
            comments,
            members,
            posts_24h: msg24h,
            message_volume_24h: msg24h,
            engagement_rate: views > 0 ? +(((likes + comments) / views) * 100).toFixed(2) : 0,
            latest_post,
            posts,
            extra: entity.extra || {},
            collected_at: new Date().toISOString(),
            page_title: document.title,
          };
          try {
            chrome.runtime.sendMessage({ type: 'MATRIX_COLLECT_RESULT', payload: record }, (resp) => resolve({ ok: true, record, resp }));
          } catch (e) {
            resolve({ ok: true, record, resp: null, note: 'sw_busy:queued_local' });
          }
        } catch (err) {
          resolve({ ok: false, reason: err && err.message ? err.message : String(err) });
        }
      }, 600);
    });
  }

  if (typeof window !== 'undefined' && typeof chrome !== 'undefined') {
    window.__matrix_collect = collect;
    chrome.runtime.onMessage.addListener((msg, sender, send) => {
      if (msg && msg.type === 'MATRIX_COLLECT_TRIGGER') { collect().then(r => send && send(r)); return true; }
      return false;
    });
    let collectTimer = null;
    const schedule = () => {
      if (collectTimer) clearInterval(collectTimer);
      collectTimer = setInterval(collect, 60 * 1000);
    };
    setTimeout(collect, 2000);
    schedule();
    let lastPath = location.pathname + location.search;
    setInterval(() => {
      const now = location.pathname + location.search;
      if (now !== lastPath) { lastPath = now; setTimeout(collect, 1500); }
    }, 1500);
    setTimeout(() => {
      try { chrome.runtime.sendMessage({ type: 'MATRIX_CONTENT_HELLO', payload: { url: location.href, host: location.hostname, title: document.title, collected_at: new Date().toISOString() } }); } catch {}
    }, 800);
  }
})();
