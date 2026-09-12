# Stage 2 · 数据采集端（Chrome 插件）+ API 对接开发指南

> 适用版本：Dashboard v4.0 · Collector Extension v2.0 · Server FastAPI

- 产品源码仓库：`https://github.com/evanpanan/matrix`
- 本文件位置：`/README_STAGE2.md` （仓库根目录）

---

## 一、3 端架构全景

```
┌─────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ 运营 A 指纹浏览器 / Chrome          │      │ 运营 B 指纹浏览器 / Chrome          │
│  ┌─────────────────────────────┐   │      │  ┌─────────────────────────────┐   │
│  │ Matrix Collector Extension  │   │      │  │ Matrix Collector Extension  │   │
│  │ - content.js  (DOM 采集)    │   │      │  │ - content.js  (DOM 采集)    │   │
│  │ - background.js (3min 心跳) │   │      │  │ - background.js (3min 心跳) │   │
│  │ - popup.html (运营选择/同步)│   │      │  │ - popup.html (运营选择/同步)│   │
│  └─────────────────────────────┘   │      │  └─────────────────────────────┘   │
└─────────────────────────────────────┘      └─────────────────────────────────────┘
                        │                                         │
                        │  POST /api/heartbeat (3 分钟)          │
                        │  POST /api/collect-data (60s / 满 50)  │
                        ▼                                         ▼
              ┌──────────────────────────────────────────────────────────┐
              │  FastAPI Backend (server/ 目录 · SQLite / Supabase)     │
              │  POST /api/heartbeat         → machines 表更新           │
              │  POST /api/collect-data      → records + 爆款判定 + webhook │
              │  GET  /api/summary  (Dashboard 主接口 · 全量聚合)       │
              │  GET  /api/whoami            → 返回当前登录人            │
              └──────────────────────────────────────────────────────────┘
                        │
                        │ 浏览器请求 /api/summary ?days=30&operator_uid=xxx
                        │   ↓
                        ▼
        ┌────────────────────────────────────────────────────────┐
        │ Frontend Dashboard (dashboard/ 目录 · Vite + React)    │
        │  - 默认走 vite proxy:  localhost:5173/api → localhost:8000│
        │  - 如果后端挂了 /api/summary 返回非 200 → 自动 fallback mockData.js│
        └────────────────────────────────────────────────────────┘
```

关键映射：
- **插件 → 后端**：`collector-extension/`（Manifest V3）`POST /api/heartbeat`、`POST /api/collect-data`
- **Dashboard → 后端**：`dashboard/src/lib/api.js`（`fetchSummary` 走 `/api/summary`，`fetchWhoami` 走 `/api/whoami`）
- **后端 ↔ Supabase/PostgreSQL**：`schema/supabase_schema.sql` 提供生产版 DDL（本地 SQLite 已内置 seed，可平滑迁移）

---

## 二、后端服务（FastAPI · `server/`）启动步骤

### 2.1 安装 & 启动（Mac / Linux）

```bash
cd server

# 1. 虚拟环境（强烈推荐）
python3 -m venv .venv
source .venv/bin/activate      # Windows 用：.venv\Scripts\activate

# 2. 装依赖（fastapi + uvicorn + pydantic v2 + httpx）
pip install -r requirements.txt

# 3. 启动开发模式（默认 8000 端口）
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

启动后立刻能访问：
| 地址 | 用途 |
|------|------|
| http://localhost:8000/            | 元信息：版本 + 端点列表 |
| http://localhost:8000/docs        | Swagger OpenAPI 交互文档，可以直接点 Try it out 调试 3 个端点 |
| http://localhost:8000/redoc       | Redoc 文档（部署给团队内部更美观）|
| http://localhost:8000/api/health  | 健康检查（机器数 / 采集记录总数） |

### 2.2 首次启动行为（seed 数据）

启动即建库 `server/matrix.db`（SQLite 文件）。如果 `accounts` 表为空，会自动 seed 23 个演示账号（匹配 mockData.js 里 demo 池），这样前端一开就是熟悉的数据结构。**真实环境上线前记得清掉 seed**：

```bash
# 手动清空 seed，只保留真实采集
sqlite3 server/matrix.db
> DELETE FROM accounts; DELETE FROM records; DELETE FROM daily_snapshots;
> .quit
```

### 2.3 3 个核心端点（对齐 Stage2 用户需求）

| 方法 · 路径 | 调用方 | 作用 | 关键字段 |
|------|------|------|------|
| `POST /api/heartbeat` | Chrome 插件（background.js，每 3 分钟）| 上报机器在线状态 | `machine_id`、`machine_name`、`operator_uid`、`pending_count` |
| `POST /api/collect-data` | Chrome 插件（background.js，满 50 条 / 每 60s / 手动同步）| 批量上报作品 + 账号数据，**自动做爆款判定 + webhook** | `items[]` 批量（`account` / `posts` / `views` / `likes` / `engagement_rate`）、`webhook_url` |
| `GET /api/dashboard-data` （别名：`GET /api/summary`） | Dashboard v4.0 前端 `fetchSummary(days, operatorUid)` | 替代 `mockData.js`：返回汇总 + 明细 | `latest_records`、`trend`、`platform_traffic`、`operator_stats`、`current_user`、`collector_machines` |

Swagger 文档 `/docs` 中每个端点都有 Pydantic 模型定义 + Example Value 可直接发请求调试。

### 2.4 替换生产数据库（Supabase / Postgres）

方案 A（最小改动）：把 `main.py` 的 `get_conn()` 换成 `psycopg2.connect(SUPABASE_DSN)`，用同一套 DDL（`schema/supabase_schema.sql` 已给全）。
方案 B：在 Supabase Dashboard 里直接导入 `schema/supabase_schema.sql`，然后用 PostgREST 直接暴露 REST API（插件发 POST 到 Supabase REST Endpoint，FastAPI 只做 Dashboard 聚合）。

推荐方案 A，保留 FastAPI 里的"爆款判定 + webhook"业务规则。

---

## 三、Chrome 采集插件（`collector-extension/` · Manifest V3）安装

### 3.1 标准 Chrome / Edge / Chromium（普通浏览器）

1. 打开扩展管理：
   - Chrome：`chrome://extensions/`
   - Edge：`edge://extensions/`
2. 右上角开启 **开发者模式**（Developer mode）。
3. 点击 **加载已解压的扩展程序** / **Load unpacked**。
4. 选中仓库路径：`/Users/panhaixiang/Desktop/技术/matrix/collector-extension`（选目录本身，不要选里面的单个文件）。
5. 浏览器右上角拼图图标的扩展列表 → 找到 **Matrix Collector** → 图钉 📌 固定到工具栏。

### 3.2 AdsPower 指纹浏览器（常用指纹浏览器 A）

1. 启动 AdsPower → 创建 / 打开一个环境（例如分配给 **李运营 - Mac 台式**）。
2. 在环境详情 → **扩展中心** / 扩展程序里，点"本地安装"或直接把整个 `collector-extension/` 文件夹 **拖进** 浏览器窗口。
   - 若 AdsPower 有"全局扩展安装"功能，建议装全局 → 所有运营环境都能复用同一个插件包（每个运营在 popup 下拉里选自己名字即可，不会混数据）。
3. 打开环境 → 打开任意支持的平台（小红书创作者中心、X、抖音创作者后台、富途、雪球…）。
4. 点击右上角 Matrix Collector 图标 → **归属运营**下拉选正确的人 → 保存。

### 3.3 Hubstudio 指纹浏览器

与 AdsPower 几乎完全一致：
1. Hubstudio 客户端 → 环境管理 → 打开目标环境。
2. 环境内地址栏输入 `chrome://extensions` → 打开开发者模式 → 加载已解压扩展 → 选择 `collector-extension/` 目录。
3. 固定插件到工具栏 → 设置归属运营 + 机器名。

### 3.4 其他指纹浏览器（LoginBox / Undetected Chrome / MoreLogin / BitBrowser）

所有 **Chromium 内核 ≥ 110** 的浏览器都完全支持 Manifest V3 本插件：
- 通用方法：**打开浏览器的扩展管理页面 → 开发者模式 → 加载已解压 → 选 `collector-extension/` 目录**
- 若浏览器禁用 Service Worker（极少情况），把 MV3 插件改成"仅 content.js 注入 + 前端 popup 自建定时器"模式，也能工作（大部分浏览器不会有此问题）。

### 3.5 插件配置（popup 界面 · 每个运营首次必做）

打开 Matrix Collector 图标后要做 3 件事：

| 项目 | 说明 |
|------|------|
| **归属运营** | 下拉选 **李运营 / 王运营 / 赵运营 / 张总（管理）**，决定"采集到的账号归谁" |
| **机器名称** | 建议填如 `李运营 - 台式 win11` / `赵运营 - Mac Studio`，与 v4.0 节点健康 Modal 一致 |
| **后端服务地址** | 本地开发 `http://localhost:8000`；局域网部署 `http://192.168.1.xxx:8000`；生产 `https://matrix.your-company.com` |
| Webhook（可选） | 爆款事件推送：填 飞书 / 钉钉 / Slack / 企业微信 webhook 地址，一旦 engagement_rate≥8% 或 views≥50,000，插件就把 POST body 原封不动推送给飞书机器人 |

点 **保存**，状态灯 🟢 → 即可。

### 3.6 手动 & 自动采集流程

- **自动**：content.js 每 60 秒解析一次当前页面 DOM；运营每切换 Tab / URL（SPA pushState）也会 1.5s 后重新解析。采集结果先入 chrome.storage.local 队列持久化，background.js 每 60 秒 / 队列满 50 条 批量上报一次。
- **手动（推荐上线前先试）**：打开一个目标平台（例如小红书创作者中心首页 `creator.xiaohongshu.com`）→ 点插件 → 点 **【采集当前页】** → 1 秒后点 **【立即同步全部】** → 同步成功后打开 Dashboard，马上能看到真实粉丝 / 作品数据。

### 3.7 已覆盖平台（content.js 内置识别 + 解析）

| 平台 Key | 名称 | 默认 URL 样例 |
|------|------|------|
| `xiaohongshu` | 小红书 | creator.xiaohongshu.com |
| `douyin` | 抖音 | creator.douyin.com |
| `wechat` | 微信公众号 | mp.weixin.qq.com（管理后台） |
| `wechat_video` | 视频号 | channels.weixin.qq.com |
| `weibo` | 微博 | weibo.com |
| `bilibili` | B 站 | space.bilibili.com / member.bilibili.com |
| `zhihu` | 知乎 | zhihu.com/people/xxx |
| `tieba` | 贴吧 | tieba.baidu.com/f?kw=xxx |
| `futu` | 富途牛牛 | futu.moomoo.com |
| `laohu` | 老虎社区 | laohu8.com |
| `xueqiu` | 雪球 | xueqiu.com/u/xxx |
| `changqiao` | 长桥 | changqiao.com |
| `x` | X / Twitter | x.com/username |
| `tiktok` | TikTok | tiktok.com/@username |
| `youtube` | YouTube | youtube.com/@channel |
| `linkedin` | LinkedIn | linkedin.com/in/xxx |
| `instagram` | Instagram | instagram.com/username |
| `telegram` | Telegram（Web） | t.me/channelname |
| `discord` | Discord（Web） | discord.com/channels/ |
| `stocktwits` | Stocktwits | stocktwits.com/symbol/NVDA |
| `reddit` | Reddit | reddit.com/r/wallstreetbets |
| `seekingalpha` | Seeking Alpha | seekingalpha.com/ |

DOM 选择器与平台改版耦合，如果后续某平台 DOM 变了，改 `collector-extension/content.js` 中 `extractFollowers / extractPosts` 的 selectors 数组即可（顶部有注释说明，每加一条 selector 都在数组里加字符串，不用改逻辑）。

---

## 四、前端 Dashboard：mockData.js → 真实 API 切换

### 4.1 默认行为（开箱即用，无需改代码）

Dashboard v4.0 已经在 2 个关键处做了"静默切换"：

1. **Vite 代理配置**：`dashboard/vite.config.js` 里 `server.proxy['/api']` → 已经默认指向 `http://127.0.0.1:8000`。开发模式下前端 5173 端口请求 `/api/summary` 会直接转发给后端 8000 端口，零 CORS 问题。
2. **API 层 fallback**：`dashboard/src/lib/api.js` 的 `safeFetch(url)` 里，任何 fetch 失败 / 非 200 返回会 **自动降级使用 `generateMockData()`**，保证前端不会白屏。

所以切换顺序就是 **先启动后端（8000），再启动前端（5173）**，Dashboard 自动使用真实采集数据；后端停了 Dashboard 立刻回退 mockData，你永远不会看到空页面。

### 4.2 生产部署场景（前后端不同域名）

例如：
- Dashboard 部署在 `https://matrix.your-company.com`（Vercel）
- API 部署在 `https://api.your-company.com`（FastAPI on Fly.io / Supabase Edge）

改一个环境变量即可（**无需改任何代码**）：

```bash
# 在 dashboard/.env 里（与 package.json 平级）
echo "VITE_API_BASE=https://api.your-company.com/api" > dashboard/.env
```

`dashboard/src/lib/api.js` 顶部已经是 `const API_BASE = import.meta.env.VITE_API_BASE || '/api'`，打包时会用你填的真实域名。

### 4.3 验证真/假切换（一键自测）

```bash
# 终端 A：起后端
cd server && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# 终端 B：起前端 Dashboard（5175 保持上一轮一直开着的也可以，因为 proxy 已配）
cd dashboard && npm run dev
```

然后在 Dashboard 里：
1. 打开 「节点」 Modal（右上角 3 个 node 图标），看到 5 台机器状态，若后端在线会显示"在线 / 离线"根据 heartbeat 实际状态。
2. 在运营电脑用插件点 **采集当前页 + 立即同步全部** → 回 Dashboard 刷最新一行（会立刻出现在 latestRecords，对应平台 StatCard AnimatedNumber 走增量过渡动画 ✅）。
3. 停掉终端 A（后端挂了） → Dashboard 下一次 5 分钟静默拉取会发现 502 → fallback 到 mock，页面仍然正常显示。

---

## 五、3 端联调 Checklist（推荐按顺序走一遍）

### 5.1 Checklist

- [ ] **后端通了吗？** 打开 `http://localhost:8000/api/health`，JSON 有 `"ok": true` 就是通。
- [ ] **Swagger 可调吗？** 打开 `http://localhost:8000/docs`，点 `POST /api/heartbeat` → Try it out → 填任意 `machine_id` → Execute，返回 `{"ok": true}` 即通。
- [ ] **插件加载成功吗？** `chrome://extensions/` → Matrix Collector → "查看视图：Service Worker" → 无报错，点插件 → 状态灯显示 🟢 **正在采集**
- [ ] **插件心跳到后端了吗？** Swagger GET `/api/summary` → Response 里 `collector_machines` 数组应至少 1 台（刚才插件安装那台）。
- [ ] **手动采集 + 同步 OK？** 打开 `https://x.com/elonmusk` → 插件点【采集当前页】→【立即同步全部】→ Swagger 查 records 数（`/api/health` records_total 增加）。
- [ ] **Dashboard 接收到真实数据？** Dashboard 顶部「监测对象总数 / 粉丝总数」变了，或某账号最新一行最新作品标题出现 X 的真实推文。
- [ ] **爆款 webhook 触发？**（填了飞书机器人 URL）→ 模拟一条高 engagement：在 Swagger `/api/collect-data` 里发一个 views=500000 engagement_rate=12 的 item，飞书卡片立刻出现。
- [ ] **Dashboard 防刷新还稳定吗？** 监控 28s：5 分钟 silent=true 不闪 skeleton，ticker 只在真实采集数据变了才 AnimatedNumber。

### 5.2 常见问题排查

| 现象 | 根因 | 解决 |
|------|------|------|
| 插件【立即同步】返回 HTTP 422 Unprocessable | items 字段缺失或 JSON 格式错 | 看后端 FastAPI `/docs` 里 CollectRequest 字段要求，按 Pydantic 校验返回填字段 |
| 插件心跳成功，但 Dashboard 最新记录一直不出现 | background.js 队列积压（服务器连不上时自动保留 ≥ 200 条）| 先修后端 URL 配置，然后点【立即同步全部】多次，或清队列：`chrome.storage.local.clear()` |
| Dashboard 仍然只有 mock 数据，不显示真实采集 | 原因 1：后端 /api/summary 返回非 200 → 自动 fall back；<br/>原因 2：operator_uid 不一致（插件选的 admin，前端请求的是 op_001） | 打开 DevTools Network，看 `/api/summary` 实际返回；对齐 operator_uid |
| CORS 错误（生产部署）| 前后端跨域但后端没配 origin | FastAPI 已经配 CORSMiddleware allow_origins=["*"]，或填具体域名白名单 |
| SQLite 被锁 `database is locked` | 多个 uvicorn worker 同时写 | 启动时加 `--workers 1`，或切 Postgres |

---

## 六、关键文件索引（便于你二次开发）

**Chrome 采集插件（`/collector-extension/`）**
- [manifest.json](file:///Users/panhaixiang/Desktop/技术/matrix/collector-extension/manifest.json) — MV3 权限 + content_scripts host + declarativeNetRequest CORS 白名单
- [content.js](file:///Users/panhaixiang/Desktop/技术/matrix/collector-extension/content.js#L1-L450) — `detectPlatform`（按 hostname 正则）+ `extractFollowers` / `extractPosts` DOM 选择器数组 + 60s 定时 + SPA 路由变化重采 + `chrome.runtime.sendMessage` 发 background
- [background.js](file:///Users/panhaixiang/Desktop/技术/matrix/collector-extension/background.js#L1-L260) — Service Worker · 3 分钟 chrome.alarms heartbeat + flushQueue 批量 / 指数退避 / chrome.storage.local 持久化 QUEUE
- [popup.html](file:///Users/panhaixiang/Desktop/技术/matrix/collector-extension/popup.html) + [popup.js](file:///Users/panhaixiang/Desktop/技术/matrix/collector-extension/popup.js) — Tailwind 3 CDN UI · 运营下拉 / 机器名 / server URL / webhook / 三枚状态卡 / 手动采集 & 同步按钮
- [rules.json](file:///Users/panhaixiang/Desktop/技术/matrix/collector-extension/rules.json) — declarativeNetRequest：剥离 Origin/Referer 响应注入 ACAO*

**后端（`/server/`）**
- [main.py](file:///Users/panhaixiang/Desktop/技术/matrix/server/main.py#L1-L760)
  - `SCHEMA_SQL`（SQLite DDL）+ `seed_demo_accounts`（23 个演示账号 seed，首启动插入）
  - `HeartbeatRequest / CollectItem / CollectRequest` Pydantic 模型
  - `is_bomb_viral(r)` 爆款判定（engagement_rate ≥ 8% 或 views ≥ 50,000 或 latest_post.is_bomb = true）
  - `POST /api/heartbeat` → upsert machines 表，15 分钟无 hb 自动标 offline
  - `POST /api/collect-data` → 逐条 `insert_record` + upsert accounts + `daily_snapshots`（按天快照，支撑 GrowthChart 周月聚合）+ 爆款 webhook 异步 fire
  - `GET /api/summary` (alias dashboard-data) → 聚合 latest_records / operator_stats / trend(30 天) / platform_traffic / collector_machines → **返回结构与前端 transformLive 完全对齐**，零字段改造
  - `GET /api/whoami` → 先按 machine_id 找 machines → 再返回 operator uid/name/role
- [requirements.txt](file:///Users/panhaixiang/Desktop/技术/matrix/server/requirements.txt) — fastapi[all] / uvicorn[standard] / pydantic v2 / httpx / python-multipart

**Dashboard 已有对接（零改）**
- [dashboard/src/lib/api.js](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/lib/api.js#L1-L368) — `fetchSummary` 走 `/api/summary?days=&operator_uid=` + 非 200 自动 fallback mockData
- [dashboard/vite.config.js](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/vite.config.js#L1-L16) — server.proxy '/api' → :8000（开发模式）

**DDL（生产版 · Supabase PostgreSQL）**
- [schema/supabase_schema.sql](file:///Users/panhaixiang/Desktop/技术/matrix/schema/supabase_schema.sql) — `operators / accounts / records / daily_snapshots / vw_latest_records / vw_operator_performance` 与 Stage1 设计稿完全对齐

---

## 七、生产部署建议（可选后续步骤）

1. **后端部署**：
   - 方案 1（最快）：Fly.io 1 台最小实例（$2 月），Dockerfile 一行 `FROM python:3.11-slim ... CMD uvicorn main:app --host 0.0.0.0 --port 8080 --workers 2`
   - 方案 2（无服务器 + 免费）：Supabase Edge Functions 写 3 个 handler 直接 RPC + PostgREST，SQLite 换成 Supabase Postgres
2. **Dashboard 部署**：Vercel 接 GitHub → Environment Variables 配 `VITE_API_BASE=https://api.your-company.com/api`
3. **告警路由**：Stage2 已支持 webhook_url 注入，后续可把飞书 / 钉钉 Bot URL 存到 `operators` 表字段中，运营一键绑定即可
4. **安全加固（上线前必须做）**：
   - 给插件请求加签名：`X-Matrix-Signature: HMAC-SHA256(body, SECRET)`，后端 `@app.middleware('http')` 验签，否则拒绝（防止模拟插件伪造数据）
   - CORS 生产白名单：从 `allow_origins=["*"]` 改成 `allow_origins=["https://matrix.your-company.com"]`
   - Dashboard `/api/*` 加 JWT：登录页输入账号密码 → 签发 JWT → `setJwtToken()` 存入 localStorage（Stage1 已经预留 setJwtToken / getAuthHeaders，直接接入 Supabase Auth 即可）

---

**本阶段交付清单检查**
- [x] Chrome 采集插件（Manifest V3）4 个核心文件（manifest / content / background / popup）+ 1 个 rules.json
- [x] FastAPI 后端 `server/main.py`（SQLite + seed demo 数据 + 3 个核心端点 + 对齐 Dashboard 字段）
- [x] 前端零改动接入（Vite proxy + API 层 fallback mock 已预留）
- [x] 本 README 安装 / 联调 / 部署指南：AdsPower / Hubstudio / Chrome 三平台安装步骤 + 3 端 Checklist + 生产部署建议

下一步可以：
- 在 Swagger `/docs` 里真实发一遍 heartbeat + collect，立刻在 Dashboard 看到结果；
- 或者直接继续 Stage3（AI 周报模型接入 / Collector 分布式调度 / RBAC + SSO 登录页），告诉我要做哪块就行。
