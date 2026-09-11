import dayjs from 'dayjs';

const PLATFORMS = [
  { key: 'wechat', name: '微信公众号', category: '社媒', color: '#07C160' },
  { key: 'wechat_video', name: '微信视频号', category: '社媒', color: '#10B981' },
  { key: 'douyin', name: '抖音', category: '社媒', color: '#000000' },
  { key: 'xiaohongshu', name: '小红书', category: '社媒', color: '#EF4444' },
  { key: 'futu', name: '富途牛牛', category: '金融', color: '#3B82F6' },
  { key: 'laohu', name: '老虎社区', category: '金融', color: '#F59E0B' },
  { key: 'xueqiu', name: '雪球', category: '金融', color: '#14B8A6' },
  { key: 'x', name: 'X(Twitter)', category: '海外', color: '#18181B' },
  { key: 'youtube', name: 'YouTube', category: '海外', color: '#FF0000' },
  { key: 'tiktok', name: 'TikTok', category: '海外', color: '#FE2C55' },
  { key: 'linkedin', name: 'LinkedIn', category: '海外', color: '#0A66C2' },
  { key: 'instagram', name: 'Instagram', category: '海外', color: '#E4405F' },
  { key: 'stocktwits', name: 'Stocktwits', category: '社区', color: '#4263EB' },
  { key: 'seekingalpha', name: 'Seeking Alpha', category: '社区', color: '#00853D' },
  { key: 'reddit', name: 'Reddit', category: '社区', color: '#FF4500' },
];

const OPERATORS = [
  { operator_uid: 'admin_001', operator_name: '张总（管理）', role: 'admin' },
  { operator_uid: 'op_001', operator_name: '李运营', role: 'operator' },
  { operator_uid: 'op_002', operator_name: '王运营', role: 'operator' },
  { operator_uid: 'op_003', operator_name: '赵运营', role: 'operator' },
];

const ACCOUNTS = [
  { name: '价值投资笔记', platform: 'futu', entity_type: 'ACCOUNT', base: { f: 58000, v: 2_450_000, l: 120000 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '成长股猎手', platform: 'laohu', entity_type: 'ACCOUNT', base: { f: 32000, v: 1_100_000, l: 55000 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '财经观察', platform: 'xueqiu', entity_type: 'ACCOUNT', base: { f: 128000, v: 5_200_000, l: 380000 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '港股研究员', platform: 'wechat', entity_type: 'ACCOUNT', base: { f: 8500, v: 420_000, l: 18000 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: '生活记录', platform: 'xiaohongshu', entity_type: 'ACCOUNT', base: { f: 42000, v: 890_000, l: 72000 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: '短视频运营', platform: 'douyin', entity_type: 'ACCOUNT', base: { f: 210000, v: 12_500_000, l: 980000 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: 'Global Investor', platform: 'x', entity_type: 'ACCOUNT', base: { f: 38000, v: 2_100_000, l: 95000 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
  { name: 'Tech Insights', platform: 'youtube', entity_type: 'ACCOUNT', base: { f: 156000, v: 18_300_000, l: 620000 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
  { name: '科技数码观察', platform: 'tiktok', entity_type: 'ACCOUNT', base: { f: 298000, v: 9_800_000, l: 720000 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
  { name: '消费品牌研究', platform: 'wechat_video', entity_type: 'ACCOUNT', base: { f: 185000, v: 7_600_000, l: 580_000 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '职场成长日记', platform: 'linkedin', entity_type: 'ACCOUNT', base: { f: 72000, v: 3_200_000, l: 210000 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: '期权交易员', platform: 'futu', entity_type: 'ACCOUNT', base: { f: 14000, v: 680_000, l: 28000 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
  { name: 'Crypto Daily', platform: 'x', entity_type: 'ACCOUNT', base: { f: 72000, v: 4_100_000, l: 190_000 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
  { name: '价值投资观察', platform: 'xueqiu', entity_type: 'ACCOUNT', base: { f: 21000, v: 850_000, l: 42_000 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '穿搭分享', platform: 'xiaohongshu', entity_type: 'ACCOUNT', base: { f: 118000, v: 2_900_000, l: 210_000 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: 'AI 前沿观察', platform: 'instagram', entity_type: 'ACCOUNT', base: { f: 95000, v: 4_100_000, l: 280_000 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: '深度研究室', platform: 'seekingalpha', entity_type: 'ACCOUNT', base: { f: 48000, v: 2_100_000, l: 135_000 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '$NVDA', platform: 'stocktwits', entity_type: 'COMMUNITY', symbol: 'NVDA', base: { watchers: 1_820_000, msg_24h: 12840, bull: 68.5, bear: 31.5, price: 118.42, change_pct: 2.31 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '$TSLA', platform: 'stocktwits', entity_type: 'COMMUNITY', symbol: 'TSLA', base: { watchers: 2_540_000, msg_24h: 28960, bull: 52.8, bear: 47.2, price: 248.60, change_pct: -1.15 }, assigned_operator_uid: 'op_001', assigned_operator_name: '李运营' },
  { name: '$AAPL', platform: 'stocktwits', entity_type: 'COMMUNITY', symbol: 'AAPL', base: { watchers: 3_120_000, msg_24h: 15220, bull: 61.2, bear: 38.8, price: 224.80, change_pct: 0.58 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: 'r/wallstreetbets', platform: 'reddit', entity_type: 'COMMUNITY', subreddit: 'wallstreetbets', base: { members: 15_800_000, online: 42_800, posts_24h: 3210 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
  { name: 'r/stocks', platform: 'reddit', entity_type: 'COMMUNITY', subreddit: 'stocks', base: { members: 6_200_000, online: 18_400, posts_24h: 890 }, assigned_operator_uid: 'op_002', assigned_operator_name: '王运营' },
  { name: 'r/CryptoCurrency', platform: 'reddit', entity_type: 'COMMUNITY', subreddit: 'CryptoCurrency', base: { members: 7_800_000, online: 25_600, posts_24h: 1560 }, assigned_operator_uid: 'op_003', assigned_operator_name: '赵运营' },
];

const POST_TITLE_POOL = {
  default: [
    '关于本周市场的几个核心观察', '深度解读 Q3 财报：为什么业绩超预期', '长期主义视角下的资产配置建议',
    '周末复盘：3 个被忽视的信号', '这次回调与 2022 年最大的不同', '为什么我们继续持有核心资产',
    '一个被低估的细分赛道机会', '关于资金流向的数据实录', '投资者情绪见底的 5 个标志',
    '从历史复盘看当前赔率', '热点行业轮动的底层逻辑', '别让噪音打乱你的节奏',
  ],
  douyin: [
    '3 分钟看懂 AI 芯片产业链', '一个普通人能抓住的红利期', '我踩过的 3 个大坑，你别再踩',
    '真实记录：月薪 5 千到 3 万', '为什么你总赚不到认知外的钱', '5 个习惯彻底改变生活质量',
    '被骂上热搜的真实原因', '99% 的人不知道的隐藏技巧', '这才是真正的信息差', '毕业 3 年我做对了什么',
  ],
  xiaohongshu: [
    '秋日通勤穿搭｜160cm 显高 10 套', '新手化妆｜底妆不卡粉保姆级教程', '独居好物｜这 5 件幸福感拉满',
    '减脂餐｜10 分钟搞定一周午餐', '30+ 姐姐护肤｜平价也能养出好皮肤', '房间改造｜500 元搞定氛围感',
    '存钱日常｜月薪 8k 我是怎么存下 6 万的', '旅行攻略｜成都 3 天 2 晚不踩雷', '手账分享｜我的周计划排版',
    '自律日常｜早起 2 小时改变了我',
  ],
  tiktok: [
    'AI Breakdown in 60 Seconds', 'Investing Tips Nobody Tells You', 'Day in My Life: Wall Street Intern',
    'Why This Stock is About to Pop', '3 Habits That Changed My Finances', 'The Cheapest Way to Start Investing',
    'I Tried This Side Hustle for 30 Days', 'Saving Money Hacks That Actually Work', 'Unboxing the New Workstation Setup',
    'Morning Routine of a Millionaire',
  ],
  wechat_video: [
    '财经早餐｜5 分钟看懂今日大盘', '行业深度：AI 算力的下半场机会', '普通人如何抓住下一轮红利',
    '我的一周投资复盘（实盘）', '这 3 个信号一定要注意', '从 0 开始学理财（入门级）',
    '被低估的宝藏行业分享', '今日热点解读｜政策方向背后的逻辑', '年轻人的第一只指数基金',
    '价值投资入门｜5 分钟搞懂 PE 和 PB',
  ],
  wechat: [
    '深度｜一场正在发生的产业范式转移', '周报｜本周 5 个最重要的信号解读', '访谈｜这位 10 年老兵说透了行业真相',
    '方法论｜我如何用一张表格跟踪 200 家公司', '案例｜从 0 到 1 做一个百万粉丝账号', '观点｜别被短期波动迷惑了双眼',
    '书单｜今年读过最值的 12 本书', '随笔｜人到中年，学会做减法', '数据｜这组图看清全球资金流向',
    '研究｜下一个 5 年的结构性机会在哪里',
  ],
  xueqiu: [
    'NVDA 三季报复盘：这次超预期在哪里', '白酒板块到击球区了吗？几组数据给你答案', '从历史 5 轮牛熊看当前估值水平',
    '被忽视的现金奶牛：这家公司的真实盈利能力', '医疗集采第七批：对龙头意味着什么', '我的 10 大金股最新跟踪（9 月）',
    '为什么我敢在这个位置加仓', '消费复苏的 3 个真实信号', '新能源还能重回 2022 年的高点吗？',
    '深度：互联网平台估值重构的逻辑',
  ],
  futu: [
    '港股通资金流向速报｜连续 5 日净买入名单', '本周美股 Q3 财报预警｜这 8 家重点关注',
    '期权异动｜某科技龙头大单押注大涨', '打新分析：这只新股值不值得申购', '技术面复盘：恒指关键支撑位在哪',
    '富途研选｜9 月金股组合', '窝轮牛熊证：本周资金最热 5 只', 'ADR 表现｜港股明日开盘前瞻',
    '南下资金连续扫货这 3 个板块', '离岸人民币汇率对港股的影响拆解',
  ],
  laohu: [
    '中概股集体反弹，这次是反转吗？', '特斯拉 Q3 交付量超预期，目标价上调', '拼多多出海业务的真实天花板在哪',
    '蔚来这次换电策略终于走对了', '理想财报的几个隐藏细节', '贝壳：被低估的产业互联网龙头',
    '京东：从效率优先到体验优先的转身', '阿里健康：互联网医疗的拐点信号', '美团：到店酒旅能否撑起第二曲线',
    '阿里巴巴：分拆后的估值重估路径',
  ],
  x: [
    'The market is forward-looking, not backward-looking.', '3 charts that explain the current macro setup.',
    'Thread: Why AI infrastructure capex is still in the 1st inning.', "Don't confuse volatility with risk.",
    'Cash is no longer trash. Real yields matter again.', 'My highest-conviction positions for Q4.',
    'The single biggest mistake retail investors make right now.', 'Why the Fed paused for the 2nd time.',
    'Gold, bonds, or stocks? The real answer.', 'Long crypto, short consensus.',
  ],
  youtube: [
    'Top 10 Stocks To Buy Now (September 2026)', 'I Quit My Job After This One Trade',
    "Warren Buffett: This Is Where To Invest $10,000 Right Now", 'The Next Big AI Stock Nobody Is Talking About',
    'Market Crash Incoming? What The Data Actually Says', "Complete Beginner's Guide To Index Funds (2026)",
    'How I Analyze A Stock In 10 Minutes', 'The Truth About Real Estate Nobody Tells You',
    'Dividend Portfolio: Living Off $500K At Age 35', 'Why 90% Of Traders Lose (And How To Be In The 10%)',
  ],
  linkedin: [
    'Career Lessons From My First 10 Years In Finance', 'Why Soft Skills Matter More Than Technical Ability',
    'Building A Personal Brand: A Practical Playbook', 'Transitioning From Sell-Side To Buy-Side',
    'How AI Is Reshaping The Modern Workforce', 'Mentorship: What I Wish I Knew Earlier',
    'Leadership Principles From Top Fund Managers', 'The Future Of Remote Work In Financial Services',
    'Certifications That Actually Move The Needle (2026)', 'How To Negotiate Your Next Offer Like A Pro',
  ],
  instagram: [
    'My Minimalist Home Office Setup (Productivity Boost)', 'Capsule Wardrobe: 15 Pieces I Live In',
    'Weekend In My City｜Photo Diary', 'Self-Care Routine For High Performers',
    'Recipe｜15-Minute High-Protein Dinner', 'My 5 Favorite Productivity Apps This Month',
    'Book Club｜Must-Read Before Year End', 'Travel Guide｜Short Trip Worth Taking',
    'Mindset Shift That Changed Everything', 'Daily Habits For A Strong Mind',
  ],
  stocktwits: [
    'NVDA CEO 最新讲话解读：下一代芯片路线图曝光', 'TSLA 周末大事件汇总：Robotaxi 再引热议',
    'AAPL 发布会前瞻：AI 手机元年真的来了', '盘前异动：这 3 只股票成交异常放大',
    '情绪指标：标普看涨比例创 3 个月新高', '资金流向：这 5 只 ETF 连续 3 周净流入',
    '散户仓位调查：现金比例创阶段新低', '期权成交榜：SPY 看涨期权疯狂加仓',
    '财报日历：本周最值得熬夜看的 10 家公司', '宏观日历：周五非农，预期多少算超预期',
  ],
  seekingalpha: [
    'Deep Dive: Why I Initiate Coverage On This Undervalued Moat', 'Earnings Analysis: Margin Expansion Is Just Getting Started',
    'Risk Assessment: 5 Red Flags In The Latest 10-Q', 'Dividend Stock Ideas: 3 Names Yielding 4%+ With Buybacks',
    'Macro Outlook: My Base Case For The Next FOMC', 'Sector Spotlight: This Group Is Breaking Out Relative',
    'Quant Screening: The Highest-Quality Names Below Fair Value', 'Merger Arbitrage: Spread Widening Presents Entry',
    'Long Idea: Why The Bears Have This One Wrong', 'Short Thesis: Structural Headwinds Underappreciated',
  ],
  reddit: [
    'WSB Daily Discussion - What are your positions today?', 'YOLO Update: 300% in 2 weeks and counting',
    'Data: S&P 500 performance after 5 straight up days', 'Company CEO sells $50M worth of shares',
    'Fed minutes released: Here are the key takeaways', 'Most undervalued stock in your portfolio right now?',
    'Honest thoughts on this 10-year DCF model', 'Breaking: Major earnings revision for this chip giant',
    'Chart of the day: Gold just broke 10-year resistance', 'The "crossover signal" everyone is watching',
  ],
};

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function randRange(rand, min, max) {
  return min + rand() * (max - min);
}

function seedHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) + 1;
}

const MACHINES = [
  { machine_id: 'MAC-OP1-001', machine_name: '李运营-MacBook-Pro' },
  { machine_id: 'WIN-OP1-002', machine_name: '李运营-台式机' },
  { machine_id: 'MAC-OP2-001', machine_name: '王运营-MacBook-Air' },
  { machine_id: 'WIN-OP3-001', machine_name: '赵运营-游戏本' },
  { machine_id: 'MAC-OP3-002', machine_name: '赵运营-Mac-Studio' },
];

function generatePostsForAccount(rand, platformKey, accountBaseViews, accountBaseLikes, daysAgo = 0) {
  const pool = POST_TITLE_POOL[platformKey] || POST_TITLE_POOL.default;
  const out = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const publishedAt = dayjs()
      .subtract(daysAgo, 'day')
      .subtract(i * (2 + Math.floor(rand() * 20)), 'hour')
      .toISOString();
    const isBomb = rand() < 0.12;
    const viewScale = isBomb ? 12 : 0.25 + rand() * 2.8;
    const views = Math.round(accountBaseViews / 20 * viewScale);
    const likes = Math.max(1, Math.round(accountBaseLikes / 30 * viewScale * (0.5 + rand())));
    const comments = Math.max(0, Math.round(likes * (0.05 + rand() * 0.15)));
    const shares = Math.max(0, Math.round(likes * (0.03 + rand() * 0.1)));
    const engagement = views > 0 ? ((likes + comments + shares) / views * 100) : 0;
    const title = pool[(Math.floor(rand() * pool.length) + i) % pool.length];
    const platformHost = (() => {
      switch (platformKey) {
        case 'wechat': return 'mp.weixin.qq.com/s';
        case 'wechat_video': return 'channels.weixin.qq.com';
        case 'douyin': return 'www.douyin.com/video';
        case 'xiaohongshu': return 'www.xiaohongshu.com/explore';
        case 'futu': return 'moomoo.com/community/post';
        case 'laohu': return 'laohu8.com/post';
        case 'xueqiu': return 'xueqiu.com';
        case 'x': return 'x.com';
        case 'youtube': return 'www.youtube.com/watch';
        case 'tiktok': return 'www.tiktok.com/video';
        case 'linkedin': return 'www.linkedin.com/posts';
        case 'instagram': return 'www.instagram.com/p';
        case 'stocktwits': return 'stocktwits.com';
        case 'seekingalpha': return 'seekingalpha.com/article';
        case 'reddit': return 'www.reddit.com';
        default: return 'example.com/post';
      }
    })();
    out.push({
      id: `p_${platformKey}_${Math.floor(rand() * 1e9)}_${i}`,
      title,
      summary: `${title} — ${platformKey === 'wechat' ? '全文 3000 字' : platformKey === 'x' ? '' : '详细内容展示在原文中'}。`,
      url: (() => {
        const tsId = `${Date.now()}_${i}`;
        switch (platformKey) {
          case 'youtube': return `https://www.youtube.com/watch?v=${tsId}`;
          case 'reddit': return `https://www.reddit.com/r/stocks/comments/${tsId}/${encodeURIComponent(title.slice(0, 24).replace(/\s+/g, '-'))}/`;
          case 'wechat': return `https://mp.weixin.qq.com/s/${tsId}`;
          case 'wechat_video': return `https://channels.weixin.qq.com/${tsId}`;
          case 'douyin': return `https://www.douyin.com/video/${tsId}`;
          case 'xiaohongshu': return `https://www.xiaohongshu.com/explore/${tsId}`;
          case 'futu': return `https://moomoo.com/community/post/${tsId}`;
          case 'laohu': return `https://laohu8.com/post/${tsId}`;
          case 'xueqiu': return `https://xueqiu.com/${tsId}`;
          case 'x': return `https://x.com/matrix_${tsId}/status/${tsId}`;
          case 'tiktok': return `https://www.tiktok.com/video/${tsId}`;
          case 'linkedin': return `https://www.linkedin.com/posts/${tsId}`;
          case 'instagram': return `https://www.instagram.com/p/${tsId}`;
          case 'stocktwits': return `https://stocktwits.com/matrix/${tsId}`;
          case 'seekingalpha': return `https://seekingalpha.com/article/${tsId}`;
          default: return `https://example.com/post/${tsId}`;
        }
      })(),
      cover_gradient: [
        '#6366f1,#8b5cf6', '#0ea5e9,#22d3ee', '#f59e0b,#ef4444', '#10b981,#14b8a6',
        '#ec4899,#f43f5e', '#4263EB,#3b82f6', '#FF4500,#f59e0b', '#8b5cf6,#ec4899',
      ][(i + Math.floor(rand() * 5)) % 8],
      published_at: publishedAt,
      views: Math.max(0, views),
      likes: Math.max(0, likes),
      comments,
      shares,
      engagement_rate: +engagement.toFixed(2),
      is_bomb: isBomb,
    });
  }
  return out;
}

function generateDailyTrend(rand, baseFollowers, baseViews30d) {
  const days = 30;
  const result = [];
  let followers = Math.round(baseFollowers * 0.88);
  const dailyViewsBase = baseViews30d / 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('MM/DD');
    const followerDelta = Math.round(baseFollowers * 0.0035 * (rand() * 1.4 - 0.2));
    followers = Math.max(1, followers + followerDelta);
    const views = Math.max(0, Math.round(dailyViewsBase * (0.45 + rand() * 1.9)));
    result.push({
      date: d,
      followers,
      views,
    });
  }
  return result;
}

export function generateMockData() {
  const rand = seeded(20260912);
  const dailyGrowthDays = 30;
  const now = dayjs();

  const platformDailyTotals = {};
  PLATFORMS.forEach(p => {
    platformDailyTotals[p.key] = [];
    let running = 0;
    for (let i = dailyGrowthDays - 1; i >= 0; i--) {
      const d = now.subtract(i, 'day').format('MM/DD');
      const base = p.category === '海外' ? 400 : p.category === '金融' ? 300 : p.category === '社区' ? 800 : 600;
      const inc = base + randRange(rand, -80, 450);
      running += Math.max(inc, 0);
      platformDailyTotals[p.key].push({ date: d, followers: Math.round(running) });
    }
  });

  const latestRecords = ACCOUNTS.map((acc, idx) => {
    const pf = PLATFORMS.find(p => p.key === acc.platform);
    const variance = 0.82 + rand() * 0.36;
    const isAbnormal = idx % 17 === 3;
    const reporterIdx = idx % MACHINES.length;
    const reporterUid = acc.assigned_operator_uid;
    const reporterName = acc.assigned_operator_name;
    const hoursAgo = isAbnormal ? 20 + idx % 12 : idx % 6;
    const updatedAt = now.subtract(hoursAgo, 'hour').toISOString();

    const common = {
      id: `acc_${String(idx + 1).padStart(2, '0')}`,
      account: acc.name,
      platform: pf.name,
      platform_key: pf.key,
      platform_category: pf.category,
      entity_type: acc.entity_type,
      assigned_operator_uid: acc.assigned_operator_uid,
      assigned_operator_name: acc.assigned_operator_name,
      operator_uid: reporterUid,
      operator_name: reporterName,
      machine_id: MACHINES[reporterIdx].machine_id,
      machine_name: MACHINES[reporterIdx].machine_name,
      client_version: '2.0.0',
      updated_at: updatedAt,
      url: acc.entity_type === 'COMMUNITY'
        ? (acc.platform === 'stocktwits' ? `https://stocktwits.com/symbol/${acc.symbol || acc.name.replace('$', '')}` : `https://www.reddit.com/${acc.name}`)
        : '#',
      avatar_gradient: ['#6366f1,#8b5cf6', '#0ea5e9,#22d3ee', '#f59e0b,#ef4444', '#10b981,#14b8a6', '#ec4899,#f43f5e', '#4263EB,#3b82f6', '#FF4500,#f59e0b'][idx % 7],
      abnormal: isAbnormal,
    };

    if (acc.entity_type === 'ACCOUNT') {
      const followers = Math.round(acc.base.f * variance);
      const views = Math.round(acc.base.v * variance / (3 + rand() * 8));
      const likes = Math.round(acc.base.l * variance);
      const comments = Math.round(likes * (0.08 + rand() * 0.12));
      const collect = Math.round(likes * (0.15 + rand() * 0.3));
      const engagement = views > 0 ? ((likes + comments + collect) / views * 100) : 0;
      return {
        ...common,
        followers: isAbnormal ? 0 : followers,
        views: isAbnormal ? 0 : views,
        likes: isAbnormal ? 0 : likes,
        comments,
        collect,
        engagement_rate: +engagement.toFixed(2),
        posts: generatePostsForAccount(rand, pf.key, acc.base.v, acc.base.l, idx % 5),
        daily_trend: generateDailyTrend(rand, acc.base.f, acc.base.v),
      };
    } else {
      if (acc.platform === 'stocktwits') {
        const watchers = Math.round(acc.base.watchers * (0.96 + rand() * 0.08));
        const msg24 = Math.round(acc.base.msg_24h * (0.8 + rand() * 0.4));
        const bull = +(acc.base.bull + randRange(rand, -5, 5)).toFixed(1);
        const bear = +(100 - bull).toFixed(1);
        const price = +(acc.base.price * (0.97 + rand() * 0.06)).toFixed(2);
        const changePct = +(acc.base.change_pct + randRange(rand, -0.8, 0.8)).toFixed(2);
        return {
          ...common,
          members: isAbnormal ? 0 : watchers,
          message_volume_24h: isAbnormal ? 0 : msg24,
          sentiment_bull: bull,
          sentiment_bear: bear,
          symbol_price: price,
          symbol_change_pct: changePct,
          symbol: acc.symbol,
          posts: generatePostsForAccount(rand, pf.key, msg24 * 50, msg24 * 2, idx % 4),
          daily_trend: generateDailyTrend(rand, watchers, msg24 * 50),
        };
      } else {
        const members = Math.round(acc.base.members * (0.98 + rand() * 0.05));
        const online = Math.round(acc.base.online * (0.6 + rand() * 0.8));
        const posts24 = Math.round(acc.base.posts_24h * (0.75 + rand() * 0.5));
        return {
          ...common,
          members: isAbnormal ? 0 : members,
          online: isAbnormal ? 0 : online,
          posts_24h: isAbnormal ? 0 : posts24,
          message_volume_24h: isAbnormal ? 0 : posts24,
          subreddit: acc.subreddit,
          posts: generatePostsForAccount(rand, pf.key, posts24 * 400, posts24 * 10, idx % 4),
          daily_trend: generateDailyTrend(rand, members, posts24 * 400),
        };
      }
    }
  });

  const trend = [];
  for (let i = 29; i >= 0; i--) {
    const d = now.subtract(i, 'day').format('MM/DD');
    const base = {};
    PLATFORMS.forEach(p => {
      const t = platformDailyTotals[p.key].find(x => x.date === d);
      base[p.name] = t ? t.followers : 0;
    });
    trend.push({ date: d, ...base });
  }

  const platformTraffic = PLATFORMS.map(p => {
    const total = latestRecords
      .filter(r => r.platform_key === p.key)
      .reduce((s, r) => {
        if (r.entity_type === 'ACCOUNT') return s + (r.views || 0);
        return s + (r.message_volume_24h || r.posts_24h || 0) * 50;
      }, 0);
    return { name: p.name, key: p.key, value: total, color: p.color, category: p.category };
  }).filter(p => p.value > 0);

  const accountRecords = latestRecords.filter(r => r.entity_type === 'ACCOUNT');
  const communityRecords = latestRecords.filter(r => r.entity_type === 'COMMUNITY');
  const totalFollowers = accountRecords.reduce((s, r) => s + r.followers, 0);
  const totalMembers = communityRecords.reduce((s, r) => s + r.members, 0);
  const totalViews7d = accountRecords.reduce((s, r) => s + r.views, 0);
  const abnormalCount = latestRecords.filter(r => {
    if (r.abnormal) return true;
    if (r.entity_type === 'ACCOUNT') return r.followers === 0 && r.views === 0;
    return r.members === 0 || (r.online !== undefined && r.online === 0);
  }).length;

  const operatorStats = OPERATORS
    .filter(op => op.role === 'operator')
    .map(op => {
      const mine = latestRecords.filter(r => r.assigned_operator_uid === op.operator_uid);
      const myAccounts = mine.filter(r => r.entity_type === 'ACCOUNT');
      const myCommunities = mine.filter(r => r.entity_type === 'COMMUNITY');
      const totalF = myAccounts.reduce((s, r) => s + r.followers, 0);
      const totalM = myCommunities.reduce((s, r) => s + r.members, 0);
      const abnormal = mine.filter(r => r.abnormal).length;
      const allPosts = mine.flatMap(r => r.posts || []);
      const bombCount = allPosts.filter(p => p.is_bomb).length;
      const bombRate = allPosts.length ? +(bombCount / allPosts.length * 100).toFixed(2) : 0;
      const totalPosts30d = Math.round(allPosts.length * 3.2);
      return {
        operator_uid: op.operator_uid,
        operator_name: op.operator_name,
        accounts_count: myAccounts.length,
        communities_count: myCommunities.length,
        total_followers: totalF,
        total_members: totalM,
        abnormal_count: abnormal,
        bomb_rate: bombRate,
        total_posts_30d: totalPosts30d,
        records: mine,
      };
    });

  const OP_NAME_BY_MACHINE_PREFIX = {
    '李运营': 'op_001',
    '王运营': 'op_002',
    '赵运营': 'op_003',
  };
  const collectorMachines = MACHINES.map((m, i) => {
    const opName = (Object.keys(OP_NAME_BY_MACHINE_PREFIX).find(k => m.machine_name.indexOf(k) === 0)) || '';
    const opUid = OP_NAME_BY_MACHINE_PREFIX[opName];
    const opStat = operatorStats.find(o => o.operator_uid === opUid);
    const browserCount = opStat ? (opStat.accounts_count + opStat.communities_count) : 3;
    const offline = m.machine_id === 'WIN-OP3-001';
    const minsAgo = offline
      ? 60 * 5 + Math.floor(seeded(seedHash(m.machine_id))() * 180)
      : 1 + Math.floor(seeded(seedHash(m.machine_id + '_on'))() * 15);
    return {
      machine_id: m.machine_id,
      machine_name: m.machine_name,
      operator_uid: opUid,
      operator_name: opName,
      fingerprint_browser_count: browserCount,
      status: offline ? 'offline' : 'online',
      last_heartbeat_iso: dayjs().subtract(minsAgo, 'minute').toISOString(),
    };
  });

  const abnormalRecords = latestRecords.filter(r => {
    if (r.abnormal) return true;
    if (r.entity_type === 'ACCOUNT') return r.followers === 0 && r.views === 0;
    return r.members === 0 || (r.online !== undefined && r.online === 0);
  });
  const aiDiagnosis = [];
  if (abnormalCount >= 2) {
    aiDiagnosis.push({
      id: 'diag_abnormal_' + abnormalCount,
      type: 'abnormal_drop',
      icon: 'AlertOctagon',
      title: `🔴 ${abnormalCount} 个对象掉线 / 数据为 0`,
      desc: '建议检查指纹浏览器登录态或采集器心跳',
      target_ids: abnormalRecords.slice(0, 3).map(r => r.id),
      severity: 'critical',
    });
  }
  const stalled = latestRecords.filter(r => r.entity_type === 'COMMUNITY' && (r.members === 0 || (r.online !== undefined && r.online === 0)));
  if (stalled.length > 0) {
    aiDiagnosis.push({
      id: 'diag_stall_' + stalled[0].id,
      type: 'stalled_data',
      icon: 'AlertTriangle',
      title: `⚡ ${stalled[0].account} 数据断更超 24h`,
      desc: '最近一条上报超过 24 小时，疑似采集规则失效',
      target_ids: stalled.map(r => r.id),
      severity: 'major',
    });
  }
  const droppers = latestRecords
    .filter(r => r.entity_type === 'ACCOUNT' && r.views > 0)
    .slice(0, 10)
    .sort((a, b) => (a.views || 0) - (b.views || 0))
    .slice(0, 2);
  if (droppers.length > 0) {
    const d0 = droppers[0];
    aiDiagnosis.push({
      id: 'diag_drop_' + d0.id,
      type: 'reading_drop',
      icon: 'TrendingDown',
      title: `📉 《${d0.account}》本周曝光环比 -${60 + Math.floor(rand() * 20)}%`,
      desc: '建议检查内容节奏与投放预算，参考同期爆款选题',
      target_ids: droppers.map(r => r.id),
      severity: 'minor',
    });
  }

  return {
    currentUser: OPERATORS[0],
    operators: OPERATORS,
    operatorStats,
    totalFollowers,
    totalMembers,
    totalViews7d,
    platformCount: PLATFORMS.length,
    accountCount: accountRecords.length,
    communityCount: communityRecords.length,
    abnormalCount,
    latestRecords,
    platformTraffic,
    trend,
    collectorMachines,
    aiDiagnosis,
    platforms: PLATFORMS,
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
  };
}

export function applyRBACFilter(data, operatorUid) {
  if (!data || !operatorUid) return data;
  const op = data.operators?.find(o => o.operator_uid === operatorUid);
  const currentUser = op || data.currentUser;
  if (currentUser?.role === 'admin') {
    return { ...data, currentUser };
  }
  const latestRecords = (data.latestRecords || []).filter(r => r.assigned_operator_uid === operatorUid);
  const accountRecords = latestRecords.filter(r => r.entity_type === 'ACCOUNT');
  const communityRecords = latestRecords.filter(r => r.entity_type === 'COMMUNITY');
  const totalFollowers = accountRecords.reduce((s, r) => s + r.followers, 0);
  const totalMembers = communityRecords.reduce((s, r) => s + r.members, 0);
  const totalViews7d = accountRecords.reduce((s, r) => s + r.views, 0);
  const abnormalCount = latestRecords.filter(r => r.abnormal).length;
  const platformKeys = new Set(latestRecords.map(r => r.platform_key));
  const platforms = (data.platforms || []).filter(p => platformKeys.has(p.key));
  const platformTraffic = (data.platformTraffic || []).filter(p => platformKeys.has(p.key));
  const operatorStats = (data.operatorStats || []).filter(s => s.operator_uid === operatorUid).map(s => ({
    ...s,
    records: latestRecords,
  }));
  const platformTrendMap = new Map();
  latestRecords.forEach(r => {
    const pMeta = PLATFORM_META[r.platform_key] || PLATFORM_META[r.platform];
    if (!pMeta || !r.daily_trend || !Array.isArray(r.daily_trend)) return;
    if (!platformTrendMap.has(pMeta.name)) platformTrendMap.set(pMeta.name, []);
    const bucket = platformTrendMap.get(pMeta.name);
    r.daily_trend.forEach(dt => {
      bucket.push(dt);
    });
  });
  const dateSet = new Set();
  platformTrendMap.forEach(list => list.forEach(dt => dateSet.add(dt.date)));
  const sortedDates = Array.from(dateSet).sort();
  const trend = sortedDates.map(date => {
    const row = { date };
    platformTrendMap.forEach((list, pName) => {
      const hit = list.find(x => x.date === date);
      if (hit) {
        if (typeof row[pName] !== 'number') row[pName] = 0;
        row[pName] += (hit.followers || hit.views || 0);
      }
    });
    return row;
  });
  return {
    ...data,
    currentUser,
    latestRecords,
    totalFollowers,
    totalMembers,
    totalViews7d,
    accountCount: accountRecords.length,
    communityCount: communityRecords.length,
    abnormalCount,
    platforms,
    platformTraffic,
    operatorStats,
    trend: trend.length ? trend : (data.trend || []),
  };
}

export const PLATFORM_META = PLATFORMS.reduce((acc, p) => {
  acc[p.key] = p;
  acc[p.name] = p;
  return acc;
}, {});

export { OPERATORS, PLATFORMS };

function fmtShort(n) {
  if (n == null) return '—';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return new Intl.NumberFormat('zh-CN').format(Math.round(n));
}

export function generateWeeklyReportMarkdown(data, opts = {}) {
  const { scopeUid = null, weekLabel = '近 7 天' } = opts;
  const operatorName = opts.operatorName || '';
  const scopeTag = scopeUid && operatorName ? `（${operatorName} · 个人视角）` : '';

  const totalF = data?.totalFollowers || 0;
  const totalM = data?.totalMembers || 0;
  const totalV = data?.totalViews7d || 0;
  const abnormal = data?.abnormalCount || 0;

  const allPosts = (data?.latestRecords || []).flatMap(r => r.posts || []);
  const bombPosts = allPosts.filter(p => p.is_bomb);
  const platformMap = new Map();
  (data?.latestRecords || []).forEach(r => {
    (r.posts || []).forEach(p => {
      const key = r.platform;
      if (!platformMap.has(key)) platformMap.set(key, []);
      platformMap.get(key).push({ ...p, platform: r.platform, account: r.account });
    });
  });
  const perPlatformTop = [];
  platformMap.forEach((arr, plat) => {
    const best = arr.slice().sort((a, b) => (b.views || 0) - (a.views || 0))[0];
    if (best) perPlatformTop.push(best);
  });

  const topOps = (data?.operatorStats || [])
    .slice()
    .sort((a, b) => (b.bomb_rate || 0) - (a.bomb_rate || 0))
    .slice(0, 3);

  const diag = (data?.aiDiagnosis || [])[0];
  const weakPlat = (data?.platformTraffic || []).slice().sort((a, b) => a.value - b.value)[0];

  const lines = [];
  lines.push(`# Matrix 矩阵运营周报 · ${weekLabel} ${scopeTag}`);
  lines.push('');
  lines.push(`> 生成时间：${dayjs().format('YYYY-MM-DD HH:mm')}  · 本报告由 AI 智能诊断自动生成`);
  lines.push('');
  lines.push('## 一、本周矩阵增长亮点');
  lines.push('');
  lines.push(`- **全网总粉丝（账号）**：${fmtShort(totalF)}，环比 **+${(5 + Math.random() * 4).toFixed(1)}%**，${scopeUid ? '领先团队平均 1.2pp' : '稳健增长，社媒账号保持周更节奏'}`);
  lines.push(`- **社区覆盖（成员）**：${fmtShort(totalM)}，环比 **+${(3 + Math.random() * 3).toFixed(1)}%**，Reddit r/CryptoCurrency 与 Stocktwits 情绪面偏多`);
  lines.push(`- **近 7 天总曝光量**：${fmtShort(totalV)}，环比 **+${(6 + Math.random() * 5).toFixed(1)}%**，本周诞生 ${bombPosts.length} 篇内容爆款（互动前 12%）`);
  lines.push(`- **异常 / 掉线数**：${abnormal}，较上周 **${abnormal <= 2 ? '-2（状态改善 ✅' : '+1（需尽快修复 ⚠️）'}`);
  lines.push('');
  lines.push('## 二、各平台爆款总结（Top 1 × 平台）');
  lines.push('');
  perPlatformTop.forEach(p => {
    lines.push(`- **[${p.platform}] ${p.title}** — 账号「${p.account}」 · 曝光 **${fmtShort(p.views)}** · 互动率 **${Number(p.engagement_rate || 0).toFixed(2)}%**`);
  });
  if (!perPlatformTop.length) lines.push('- 暂无爆款记录');
  lines.push('');
  lines.push('## 三、运营绩效 Top 3（按爆款率排序）');
  lines.push('');
  topOps.forEach((op, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
    lines.push(`${medal} **${op.operator_name}** — 负责 ${op.accounts_count + op.communities_count} 个对象 · 近 30 天作品 ${op.total_posts_30d} 篇 · **爆款率 ${op.bomb_rate}%**`);
  });
  if (!topOps.length) lines.push('- 暂无运营绩效数据');
  lines.push('');
  lines.push('## 四、下周优化建议（3 条行动项）');
  lines.push('');
  if (diag) {
    lines.push(`1. **风险修复（${diag.severity === 'critical' ? 'P0' : diag.severity === 'major' ? 'P1' : 'P2'}）**：${diag.title} → ${diag.desc}`);
  } else {
    lines.push('1. **风险侧（P1）**：本周无高危异常，继续监控采集心跳，保持 >95% 在线率');
  }
  if (weakPlat) {
    lines.push(`2. **平台机会侧**：当前曝光贡献最低平台「${weakPlat.name}」为 **${fmtShort(weakPlat.value)}**，建议复制 ${(data?.platformTraffic || []).sort((a,b)=>b.value-a.value)[0]?.name || 'YouTube'} 的爆款选题模式，目标 +30% 周曝光`);
  } else {
    lines.push('2. **平台机会侧**：优先复制 YouTube / TikTok 的短视频模板，目标周环比 +25% 海外曝光');
  }
  const bombSample = bombPosts[0];
  if (bombSample) {
    lines.push(`3. **爆款复制策略**：本周爆款《${bombSample.title}》互动率 ${Number(bombSample.engagement_rate || 0).toFixed(2)}%，建议拆解标题结构 + 封面 + 发布时段，下周同模式至少产出 3 篇候选`);
  } else {
    lines.push('3. **爆款复制策略**：增加「争议 + 数据可视化」两种模板占比，各平台每周至少 2 条候选 A/B 发布');
  }
  lines.push('');
  lines.push('---');
  lines.push(`_Matrix Dashboard v4.0 · ${dayjs().format('YYYY-MM-DD')}_`);
  return lines.join('\n');
}
