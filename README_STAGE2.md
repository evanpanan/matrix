# Stage 2 · 数据采集端（Chrome 插件）+ API 对接开发指南

> 适用版本：Dashboard v4.3 · Collector Extension v2.0 · Server FastAPI

配套主 README.md v4.3 · 2026-09-16

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
        │  - v4.3 起已关闭假数据 fallback；/api/summary 非 200 直接显示空态（0 值而非 mock）│
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

启动即建库 `server/matrix.db`（SQLite 文件）。如果 `accounts` 表为空，会自动 seed 演示账号（匹配 18 平台 PLATFORM_META 静态常量），这样前端一开结构是对齐的。**v4.3 起 seed 不再注入假运营人（OPERATORS），只建 18 平台空壳壳，数据量 = 真实采集量。真实环境上线前记得清掉 seed**：

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
| `GET /api/dashboard-data` （别名：`GET /api/summary`） | Dashboard v4.3 前端 `fetchSummary(days, operatorUid)` | 返回真实汇总 + 明细（无 mock fallback） | `latest_records`、`trend`、`platform_traffic`、`operator_stats`、`current_user`、`collector_machines` |

Swagger 文档 `/docs` 中每个端点都有 Pydantic 模型定义 + Example Value 可直接发请求调试。

### 2.4 替换生产数据库（Supabase / Postgres）

方案 A（最小改动）：把 `main.py` 的 `get_conn()` 换成 `psycopg2.connect(SUPABASE_DSN)`，用同一套 DDL（`schema/supabase_schema.sql` 已给全）。
方案 B：在 Supabase Dashboard 里直接导入 `schema/supabase_schema.sql`，然后用 PostgREST 直接暴露 REST API（插件发 POST 到 Supabase REST Endpoint，FastAPI 只做 Dashboard 聚合）。

推荐方案 A，保留 FastAPI 里的"爆款判定 + webhook"业务规则。

### 2.5 Header 下载插件入口（v4.3 新增 · 运营同事零 Git 操作）

v4.3 起顶部 Header 右侧 **天蓝色「下载插件」按钮**（替代原 AI周报），点击进入 `DownloadsPage`：

1. **一键下载 ZIP**：JSZip 打包 `dashboard/public/downloads/collector-extension/` 下 6 个同步副本文件（manifest/content/background/popup/popup.js/rules）+ `README_STAGE2.md`（就是本文件），`a.download='collector-extension.zip'` 直接触发浏览器下载
2. **文件清单展示**：DownloadsPage 显示 6 个文件名 + 用途说明 + 版本标签 v2.0，运营确认无误再下载
3. **本文件超链接**：DownloadsPage 底部有「查看详细安装指南」跳转按钮，直接打开 README_STAGE2.md 全文（就是本文件）

**运营同事不需要从 GitHub clone 仓库**：登录 Dashboard → 右上角点「下载插件」→ 解压 ZIP → 按本文件 §三 加载已解压扩展即可，整个流程无命令行操作。

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
| **机器名称** | 建议填如 `李运营 - 台式 win11` / `赵运营 - Mac Studio`，与 v4.3 节点健康 Modal 一致 |
| **后端服务地址** | 本地开发 `http://localhost:8000`；局域网部署 `http://192.168.1.xxx:8000`；生产 `https://matrix.your-company.com` |
| Webhook（可选） | 爆款事件推送：填 飞书 / 钉钉 / Slack / 企业微信 webhook 地址，一旦 engagement_rate≥8% 或 views≥50,000，插件就把 POST body 原封不动推送给飞书机器人 |

点 **保存**，状态灯 🟢 → 即可。

### 3.6 手动 & 自动采集流程

- **自动**：content.js 每 60 秒解析一次当前页面 DOM；运营每切换 Tab / URL（SPA pushState）也会 1.5s 后重新解析。采集结果先入 chrome.storage.local 队列持久化，background.js 每 60 秒 / 队列满 50 条 批量上报一次。
- **手动（推荐上线前先试）**：打开一个目标平台（例如小红书创作者中心首页 `creator.xiaohongshu.com`）→ 点插件 → 点 **【采集当前页】** → 1 秒后点 **【立即同步全部】** → 同步成功后打开 Dashboard，马上能看到真实粉丝 / 作品数据。

### 3.7 已覆盖平台（content.js 内置识别 + 解析 · 共 18 个）

| 平台 Key | 名称 | 默认 URL 样例 |
|------|------|------|
| `wechat` | 微信公众号 | mp.weixin.qq.com（管理后台） |
| `wechat_video` | 视频号 | channels.weixin.qq.com |
| `douyin` | 抖音 | creator.douyin.com |
| `xiaohongshu` | 小红书 | creator.xiaohongshu.com |
| `futu` | 富途牛牛 | futu.moomoo.com |
| `laohu` | 老虎社区 | laohu8.com |
| `huasheng` | 华盛通 | 华盛通平台采集页域名 |
| `xueqiu` | 雪球 | xueqiu.com/u/xxx |
| `x` | X / Twitter | x.com/username |
| `youtube` | YouTube | youtube.com/@channel |
| `tiktok` | TikTok | tiktok.com/@username |
| `linkedin` | LinkedIn | linkedin.com/in/xxx |
| `instagram` | Instagram | instagram.com/username |
| `discord` | Discord（Web） | discord.com/channels/ |
| `stocktwits` | Stocktwits | stocktwits.com/symbol/NVDA |
| `seekingalpha` | Seeking Alpha | seekingalpha.com/ |
| `reddit` | Reddit | reddit.com/r/wallstreetbets |
| `weibo` | 微博 | weibo.com |

> 平台 Key 与后端 `server/main.py:PLATFORMS` 常量（18 个）+ Dashboard `dashboard/src/lib/mockData.js:PLATFORM_META`（18 个 key）**三方绝对一致**，是平台列表唯一真源。新加入平台必须在三处同步加 key，否则 Dashboard 饼图 / 热力图 / 筛选芯片 三处会不一致。

DOM 选择器与平台改版耦合，如果后续某平台 DOM 变了，改 `collector-extension/content.js` 中 `extractFollowers / extractPosts` 的 selectors 数组即可（顶部有注释说明，每加一条 selector 都在数组里加字符串，不用改逻辑）。

---

## 四、前端 Dashboard：PLATFORM_META 静态配置 → 真实 API 切换

### 4.1 默认行为（开箱即用，v4.3 已禁用 fallback mock）

Dashboard v4.3 在 1 个关键处做了静默切换：

1. **Vite 代理配置**：`dashboard/vite.config.js` 里 `server.proxy['/api']` → 已经默认指向 `http://127.0.0.1:8000`。开发模式下前端 5173 端口请求 `/api/summary` 会直接转发给后端 8000 端口，零 CORS 问题。

> v4.3 **已永久删除 mock 自动降级逻辑**：原 `safeFetch(url)` 非 200 → `generateMockData()` 段落已移除；空数据就是 0，平台曝光占比 0% 也照常显示（见 §十一 T203）。不会出现"停后端还有假数据跑"的情况。

所以切换顺序就是 **先启动后端（8000），再启动前端（5173）**，Dashboard 自动使用真实采集数据；后端挂了 Dashboard 显示空态（数值为 0，图例全显，不会白屏）。

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

### 4.3 验证真实采集模式（一键自测）

```bash
# 终端 A：起后端
cd server && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# 终端 B：起前端 Dashboard（5175 保持上一轮一直开着的也可以，因为 proxy 已配）
cd dashboard && npm run dev
```

然后在 Dashboard 里：
1. 打开 「节点」 Modal（右上角 3 个 node 图标），看到机器状态，若后端在线会显示"在线 / 离线"根据 heartbeat 实际状态。
2. 在运营电脑用插件点 **采集当前页 + 立即同步全部** → 回 Dashboard 刷最新一行（会立刻出现在 latestRecords，对应平台 StatCard AnimatedNumber 走增量过渡动画 ✅）。
3. **v4.3 模式下**：停掉终端 A（后端挂了）→ Dashboard 下一次 5 分钟静默拉取会发现 502/非 200 → **直接显示空态（0 值）**，不再回退 mock 数据。排查路径：DevTools → Network → 看 `/api/summary` 实际 HTTP Code + Response Body；若 502 检查后端 uvicorn 是否正常；若 401 检查 token 是否过期。
4. **额外验证 T203 饼图 18 平台**：首页「平台曝光占比」卡片 → 展开图例 → 数一下必须是 **18 条全列**，无采集数据平台显示 `0.0%`（扇形角度 = 0，但图例条目存在）。
5. **额外验证 T204 昵称实时同步**：头像菜单 → 个人资料 → 修改「显示昵称」（例：Evan → 张总）→ 保存成功后 **不要刷新**，立即看 Header 用户按钮文案 + 面包屑标题 + 归属运营列三处，必须即时变更新昵称（≤0.5s）。

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
- [ ] **T203 饼图 18 平台全显？** 首页「平台曝光占比」卡片图例数量数一遍，必须是 18 条（空平台 0.0% 也要出现）。
- [ ] **T204 昵称同步生效？** 改昵称后 Header + 面包屑 + 列表三处 **无刷新** 即时更新。

### 5.2 常见问题排查

| 现象 | 根因 | 解决 |
|------|------|------|
| 插件【立即同步】返回 HTTP 422 Unprocessable | items 字段缺失或 JSON 格式错 | 看后端 FastAPI `/docs` 里 CollectRequest 字段要求，按 Pydantic 校验返回填字段 |
| 插件心跳成功，但 Dashboard 最新记录一直不出现 | background.js 队列积压（服务器连不上时自动保留 ≥ 200 条）| 先修后端 URL 配置，然后点【立即同步全部】多次，或清队列：`chrome.storage.local.clear()` |
| Dashboard 仍然是 0 数据，不显示真实采集 | 原因 1：后端 /api/summary 返回非 200 → v4.3 不再走 mock，直接空态；<br/>原因 2：operator_uid 不一致（插件选的 admin，前端请求的是 op_001） | 打开 DevTools Network，看 `/api/summary` 实际返回；对齐 operator_uid |
| CORS 错误（生产部署）| 前后端跨域但后端没配 origin | FastAPI 已经配 CORSMiddleware allow_origins=["*"]，或填具体域名白名单 |
| SQLite 被锁 `database is locked` | 多个 uvicorn worker 同时写 | 启动时加 `--workers 1`，或切 Postgres |
| 饼图图例少于 18 条（T203 退化）| Dashboard 代码被回退到 v4.2 之前；检查 TrafficPie 调用前是否有 `Object.values(PLATFORM_META) 18 平台补 0` 的 normalize 逻辑 | 打开 `dashboard/src/App.jsx` 首页调用点，确认 IIFE normalize 块存在（见主 README §11 文件索引 T203）|
| 改昵称后需要刷新才能看到（T204 退化）| ProfileView 未注入 onUpdateCurrentUser prop；检查 App.jsx <ProfileView> 调用是否传了该 prop | 打开 `dashboard/src/App.jsx`，确认 ProfileView save() 后调用了 onUpdateCurrentUser?.(prev => patch)（见主 README §11 T204）|

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
  - `SCHEMA_SQL`（SQLite DDL）+ seed（首启动插入 18 平台空壳壳 + admin 默认账号）
  - `PLATFORMS` 常量（18 个 key，与 §3.7 表 / Dashboard PLATFORM_META 三方一致）
  - `HeartbeatRequest / CollectItem / CollectRequest` Pydantic 模型
  - `is_bomb_viral(r)` 爆款判定（engagement_rate ≥ 8% 或 views ≥ 50,000 或 latest_post.is_bomb = true）
  - `POST /api/heartbeat` → upsert machines 表，15 分钟无 hb 自动标 offline
  - `POST /api/collect-data` → 逐条 `insert_record` + upsert accounts + `daily_snapshots`（按天快照，支撑 GrowthChart 周月聚合）+ 爆款 webhook 异步 fire
  - `GET /api/summary` (alias dashboard-data) → 聚合 latest_records / operator_stats / trend(30 天) / platform_traffic / collector_machines → **返回结构与前端 transformLive 完全对齐**，零字段改造
  - `GET /api/whoami` → 先按 machine_id 找 machines → 再返回 operator uid/name/role
  - Admin 后台 4 Tab 路由（系统用户 / 采集器 Token / 股票监控 / 社区监控）+ Logo PUT 上传（v4.2 新增）
- [requirements.txt](file:///Users/panhaixiang/Desktop/技术/matrix/server/requirements.txt) — fastapi[all] / uvicorn[standard] / pydantic v2 / httpx / python-multipart

**Dashboard 已有对接（v4.3 无 mock fallback）**
- [dashboard/src/lib/api.js](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/lib/api.js#L1-L368) — `fetchSummary` 走 `/api/summary?days=&operator_uid=` + v4.3 已删除 OPERATORS fallback 与 Math.random 伪数据注入；所有空兜底 `|| 0`
- [dashboard/src/lib/mockData.js](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/lib/mockData.js) — v4.3 起只存 PLATFORM_META（18 平台静态配置）+ PLATFORM_LOGOS，不再承担 mock 运营人 / 假数据池角色
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

## 八、账号体系与 RBAC 权限（v4.2 已交付 · 开箱即用）

> 登录入口：Dashboard 首页右上角头像菜单，或直接访问 `http://localhost:5173` 首次自动弹出登录页。
>
> **首次启动唯一入口 · 初始管理员账号（种子数据）**
> - 用户名：`admin`
> - 密  码：`admin123`
> - 登录后 **强烈建议立刻在「用户与权限后台 → admin 行 → 重置密码」改掉默认密码**（密码 bcrypt rounds=12，单次哈希 ≥200ms，离线爆破不现实）。
> - 种子账号绑定运营档案：`张总（管理）· admin_001`，默认以「管理员全景」视角查看所有运营数据。

### 8.1 RBAC 三级角色

| 角色 | 英文常量 | 权限说明 | 典型账号 |
|------|---------|----------|----------|
| 平台管理员 | `admin` | 一切权限：用户 CRUD / 密码重置 / 账号禁用启用 / 审计日志 / 管理员全景数据 / 采集器授权 Token 管理 / 股票 & 社区监控白名单 | 技术负责人、产品 Admin |
| 运营主管 | `manager` | 查看所有运营数据（含切换视角）+ 个人绩效；**不可**：用户后台 / 重置他人密码 / 采集器 Token | 运营组长、部门负责人 |
| 运营专员 | `operator` | 仅查看「个人绩效看板」+ 本人绑定的运营档案数据；**不可**：全局数据、后台 | 一线运营同学 |

角色权限判定在后端 3 层 Depends 链强制执行（`get_current_user → require_current_user → require_role(*roles)`），前端仅做菜单隐藏兜底；**即使前端绕过构造 HTTP 请求也会 401/403**。

### 8.2 管理员手动创建账号（v4.2 起唯一入口 · 无公开注册）

**v4.2 起永久移除原自助注册方式**：不再存在"管理员发放凭证 + 同事自助注册"路径；所有账号必须由管理员手动创建，满足"先建账号再分发密码"的合规流程。

管理员创建账号唯一入口：
- 路径：`UserSwitcher（头像菜单）→ 用户与权限后台 ADMIN → Tab 0「系统用户」→ 顶部「新建账号」按钮`
- 字段：用户名 * / 邮箱 / 角色（运营专员默认）/ 绑定运营档案（可选）/ ✅ 自动生成 16 位强密码（含大小写+数字+符号，正则 `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{16,}$`）
- 提交后 **Toast 仅显示 1 次密码**，管理员需要立刻复制给对应同事；表格同步新增该行。

### 8.3 账号全生命周期操作

| 操作 | 入口 | 审计日志事件 |
|------|------|-------------|
| 登录（账号密码） | 登录页 Tab 1 | `AUTH_LOGIN_OK` / `AUTH_LOGIN_FAIL` |
| 登出 | UserSwitcher → 退出登录 | `AUTH_LOGOUT` |
| 重置密码 | Admin 后台每行「重置密码」按钮（仅 admin）；**账号本人忘记密码联系管理员重置** | `ADMIN_RESET_PASSWORD` |
| 禁用账号 | Admin 后台每行「禁用」（如离职/账号泄露）→ 账号 status=disabled；被禁用账号任何 token 失效并拒绝登录 | `ADMIN_DISABLE_USER` |
| 启用账号 | Admin 后台（原禁用账号按钮变「启用」） | `ADMIN_ENABLE_USER` |
| 编辑账号信息 | Admin 后台每行「编辑」→ 可修改邮箱 / 角色 / 绑定运营档案 3 项（用户名不可改） | `ADMIN_EDIT_USER` |
| 上传 Logo（股票 / 社区监控） | Admin → Tab 2「股票监控」/ Tab 3「社区监控」→ 行首 Logo 容器 hover → 点修改图标 → 内联上传（Base64 data_url） | `ADMIN_UPDATE_ACCOUNT_LOGO` |

---

## 九、SSO 免登接入 3 方案（给同事用 · 零后端改动）

> **同事侧 SSO 对接目标：只需 10 行 Python 签发 JWT + POST 1 个 HTTP 请求，同事不需要动 Matrix 任何代码。**
>
> 默认 secret 共享：`SSO_JWT_SECRET = JWT_SECRET`（两者可独立覆盖，见 §10）

### 9.1 方案 A · HS256 共享密钥（推荐 · 默认启用 · 0 配置）

内部 SSO 门户（你们同事那侧的中台）用共享 secret 签发 JWT，直接调 `/api/sso/jwt-login` 换 Matrix token pair + 自动建号（首次登录不存在则 `is_new=true`）。

**同事需要写的 10 行 Python 代码（复制粘贴即用）：**

```python
# 同事内部 SSO 门户（零 Matrix 依赖）
# pip install python-jose  # 你们可能已装；与 Matrix 版本一致 3.3.0
from jose import jwt
from datetime import datetime, timedelta
import httpx  # 或 requests

SSO_JWT_SECRET = "t0p_s3cr3t_8765"  # 与 Matrix .env JWT_SECRET 保持一致
MATRIX_SSO_URL = "http://localhost:8765/api/sso/jwt-login"  # 生产换成你们 Matrix 域名

payload = {
    "sub": "ldap_uid_or_staff_id",        # 稳定唯一 ID（必填，Matrix 用户表绑定用）
    "username": "laowang",                 # 用户名（必填，Matrix 显示）
    "email": "laowang@corp.com",           # 邮箱（必填）
    "role": "manager",                     # admin | manager | operator（必填）
    "display_name": "老王（运营主管）",     # 可选，昵称
    "operator_uid": "op_001",              # 可选；指定绑定 Matrix 侧运营档案
}
payload.update({
    "iss": "corp-sso",                     # 可自定义
    "iat": int(datetime.utcnow().timestamp()),
    "exp": int((datetime.utcnow() + timedelta(minutes=5)).timestamp()),  # 5 分钟窗口
})
signed = jwt.encode(payload, SSO_JWT_SECRET, algorithm="HS256")

# 用这个 signed 换用户 Matrix 登录态
resp = httpx.post(MATRIX_SSO_URL, json={"jwt": signed}).json()
# resp 结构: { "ok": true, "access_token": "ey...", "refresh_token": "...",
#             "user": {...}, "is_new": bool }
print("Matrix token:", resp["access_token"])  # 给前端 setTokenPair 就免登了
```

**等价 curl 手动验证（排错用）：**
```bash
# 先把 signed 变量用上面代码拿到，下面命令把 <SIGNED> 替换
curl -s -X POST http://localhost:8765/api/sso/jwt-login \
  -H "Content-Type: application/json" \
  -d '{"jwt":"<SIGNED>"}' | python3 -m json.tool
```

首次 `is_new=true` 会在 `users` 表自动插入记录 + `audit_logs=SSO_LOGIN_NEW_USER`；再次登录返回 `is_new=false` + `AUTH_SSO_LOGIN`。

### 9.2 方案 B · RS256 + JWKS（多租户 / 强隔离 · 已预留）

需要 `SSO_JWT_PUBLIC_KEY_URL` 指向一个 JWKS endpoint，Matrix 后端 `httpx` GET 后用 kid 匹配公钥验签（SHA256 RSA，密钥长度 ≥ 2048 位，exp ≤ 5 分钟）。

设置 `server/.env`（见 §10）：
```
SSO_MODE=rs256
SSO_JWT_PUBLIC_KEY_URL=https://sso.corp.com/.well-known/jwks.json
```

### 9.3 方案 C · OAuth 授权码回调（TODO 占位 · 后续加）

路由框架已经预留 `POST /api/sso/oauth-callback` 及 UI 按钮「粘贴 SSO Token」作为降级；接入 Okta / Authing / 企业微信等 OAuth 只需在 `server/main.py` 该路由里把 `state + code` 换成 userinfo payload 后复用 `_upsert_sso_user()` 辅助函数，1-2 天即可上线。

---

## 十、.env 配置参考 · 错误码 · SSO Payload 字段表

### 10.1 `server/.env` 10 项环境变量（全部可选，默认值即满足本地开发）

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | str | `./matrix.db` | SQLite 文件路径（相对 `server/` 目录）；生产换成 `postgresql+psycopg://user:pw@host/db` |
| `JWT_SECRET` | str | **`CHANGE_ME_IN_PROD`** | **生产必须改**：HS256 签名密钥（≥ 32 字节随机，推荐 `openssl rand -hex 32`） |
| `JWT_ACCESS_TTL_SEC` | int | `3600`（1h） | access_token 有效期，到期后前端静默 `refresh()` |
| `JWT_REFRESH_TTL_SEC` | int | `604800`（7d）| refresh_token 有效期；到期强制重新登录 |
| `BCRYPT_ROUNDS` | int | `12` | bcrypt 迭代轮次；生产服务器慢可降 11（单次 ≥100ms 安全下限） |
| `BCRYPT_PEPPER` | str | `""`（空=不启用） | 密码前置加"胡椒"，丢库后 rainbow table 失效（长度 ≤ 60 字节） |
| `SSO_MODE` | enum | `hs256` | `hs256`（§9.1）/ `rs256`（§9.2）/ `none`（关闭 SSO） |
| `SSO_JWT_SECRET` | str | **同 JWT_SECRET** | 方案 A 共享密钥；与主 JWT 分开可把 SSO 密钥给同事而不泄露主密钥 |
| `SSO_JWT_PUBLIC_KEY_URL` | str | `""`（空） | 方案 B JWKS URL，返回 `{"keys":[{kty=RSA, kid=..., n=..., e=...}]}` |
| `REQUIRE_AUTH` | bool | `false` | 生产建议 `true`：关闭匿名浏览；未登录自动弹登录页 |

### 10.2 后端错误码表（9 条 · v4.2 起删除 3 条原注册相关 · 前端 Toast 直接可展示 `message`，排查看 `code`）

| HTTP 码 | code 常量 | 触发场景 |
|---------|-----------|----------|
| 400 | `ERR_USERNAME_EXISTS` | 新建账号时用户名重名（不区分大小写） |
| 400 | `ERR_EMAIL_EXISTS` | 邮箱已被其他账号占用 |
| 400 | `ERR_WEAK_PASSWORD` | 密码 < 8 位或缺少字符类型要求（注册 / 重置 / 改密） |
| 401 | `ERR_CREDENTIAL_INVALID` | 用户名不存在或密码 bcrypt 不匹配（故意返回相同文案，防枚举） |
| 401 | `ERR_ACCOUNT_DISABLED` | 登录账号已被管理员禁用 |
| 401 | `ERR_TOKEN_EXPIRED` | access_token 过期；前端自动 `POST /api/auth/refresh` 换一对新的 |
| 401 | `ERR_TOKEN_INVALID` | JWT 签名错误 / 伪造 / 非矩阵签发；清 token 弹登录页 |
| 403 | `ERR_ROLE_REQUIRED`（或 `ERR_PERMISSION_DENIED`）| 非 admin 访问 `/api/admin/*`；后端直接 403 |
| 403 | `ERR_MUST_CHANGE_PW` | 管理员开启强制改密开关；首次登录必须改（默认关闭） |

### 10.3 SSO JWT payload 字段表（§9.1 `payload` 一一对应）

| 字段 | 类型 | 必填 | 长度约束 | 说明 |
|------|------|------|----------|------|
| `sub` | str | ✅ | ≤ 128 | 你们 SSO 侧的稳定唯一 ID（LDAP UID / 工号 / Auth0 user_id 等），**不能变**，Matrix `sso_external_id` 用它做幂等建号 |
| `username` | str | ✅ | 3~32 | Matrix 用户名（登录时输入；首字符字母/数字/下划线）；与现有 `users.username` 冲突会自动加后缀 `-2/-3` 并返回 `user.username` |
| `email` | str | ✅ | ≤ 128 | 合法邮箱格式；冲突策略同 username |
| `role` | str | ✅ | enum | `admin` / `manager` / `operator`（与 §8.1 表一致）；传其他值 400 |
| `display_name` | str | ⭕ | ≤ 64 | 昵称 / 中文全名；不传则用 username 做 Avatar 首字母 |
| `operator_uid` | str | ⭕ | `op_xxx` | 绑定 Matrix `operators.uid`；传非法值自动降级为"未绑定"，不会 4xx（方便同事先调通） |
| `iat` / `exp` | int | ✅ | Unix 秒 | Matrix **手动校验**（python-jose 自动验关闭）：`exp - iat ≤ 300s`（5 分钟窗口），防重放 |
| `iss` | str | ⭕ | ≤ 64 | 签发方标识，Matrix 仅记录到 audit_logs 不做白名单 |

---

## 十一、v4.3 最新能力变更日志（2026-09-16 · 对接必看）

### T203 · 平台曝光占比饼图：18 平台 0% 全显 + 空态条件调整

**问题背景 v4.2 及以前**：TrafficPie 组件只接收后端实际返回的平台数据（通常只有 3~5 个有采集量的平台），其余 13+ 平台从图例中消失，运营无法一眼确认"是真的 0 采集量还是平台压根没接入"。

**v4.3 修复方式**：
- 在首页 TrafficPie 调用点前增加 **IIFE normalize 块**：用 `Object.values(PLATFORM_META)`（18 条）作为唯一真源，循环补齐无采集平台 `value = 0`
- 空态触发条件由 `data.length === 0` 改为 `total === 0 && data.length < 2`（避免只有 1 个平台有 0 数据时误触空态隐藏整个饼图）
- TrafficPie 图例按 `value desc` 排序，有采集平台靠前，0% 平台统一靠后，视觉一致

**验收方式**：首页「平台曝光占比」卡片展开图例 → 手指点一遍 → 必须恰好 **18 条**，无采集平台末尾显示 `平台名 0.0%`。

### T204 · 昵称修改实时同步：无刷新全局 currentUser 即时重渲染

**问题背景 v4.2 及以前**：ProfileView「保存」成功后只刷新本页本地 state；Header 用户按钮 / 面包屑绩效标题 / 归属运营列 等读取 `currentUser.display_name` 的组件必须手动 F5 才能变更新昵称，体验割裂。

**v4.3 修复方式**：
1. `App.jsx` 顶层 `<ProfileView>` 调用新增 prop：`onUpdateCurrentUser={setCurrentUser}`（把顶层 currentUser setter 注入进去）
2. `ProfileView` 函数签名加第 2 个参数：`function ProfileView({ user, onUpdateCurrentUser })`
3. save() 成功 `PUT /api/auth/profile` 返回 200 后，立即调用：
   ```js
   onUpdateCurrentUser?.(prev => ({
     ...prev,
     display_name: newDisplayName,
     displayName:  newDisplayName, // 兼容历史 camelCase 字段
     email:        newEmail,
     avatar:       newAvatar,      // 渐变/自定义头像
   }));
   ```
4. React 顶层 `currentUser` state 变更 → 所有订阅该 state 的子组件（Header / Breadcrumb / Operator 列等）**0.5s 内自动重渲染**

**验收方式**：个人资料改昵称 → 保存 → 不要刷新 → 同时看：① Header 头像右侧用户名按钮；② 面包屑「张总 · 个人绩效看板」标题；③ 列表归属运营列 3 处，三处必须同时立即变更新值。

---

**本阶段交付清单检查（含 v4.2 仅管理员创建 + v4.3 T203/T204 大模块）**
- [x] Chrome 采集插件（Manifest V3）4 个核心文件（manifest / content / background / popup）+ 1 个 rules.json
- [x] FastAPI 后端 `server/main.py`（SQLite + seed admin 默认账号 + 3 个核心端点 + 对齐 Dashboard 字段）
- [x] 前端零改动接入（Vite proxy + API 层 v4.3 已禁 mock fallback）
- [x] **v4.2 账号体系：管理员手动创建唯一入口，原自助注册永久移除**（invite_codes 表/路由/错误码 3 条 全移除）
- [x] **v4.2 管理后台 Tab4 顺序：系统用户 → 采集器授权 Token → 股票监控 → 社区监控**
- [x] **v4.2 股票 + 社区监控内联 Logo 上传**（hover Logo 容器 → 修改图标 → Base64 data_url 同步写库）
- [x] **v4.3 Header 下载插件入口**：天蓝色按钮替换 AI周报 → DownloadsPage 一键 ZIP 下载 + 6 文件清单 + README_STAGE2.md（本文件）链接
- [x] **v4.3 T203 饼图 18 平台 0% 全显**：PLATFORM_META normalize + 空态条件调整
- [x] **v4.3 T204 昵称实时同步**：onUpdateCurrentUser prop 注入 → 顶层 setCurrentUser patch → 无需刷新
- [x] 本 README 安装 / 联调 / 部署指南 + §8 账号与权限（仅管理员创建） + §9 SSO 对接 3 方案 + §10 .env 10 表 / 错误码 9 条 / SSO payload 6 字段表 + §11 v4.3 变更日志 2 条

下一步可以：
- 在 Swagger `/docs` 里真实发一遍 heartbeat + collect，立刻在 Dashboard 看到结果；
- 用 §9.1 的 10 行 Python 脚本让同事把 SSO 门户联调跑通（后端无需改动，只需告知共享 JWT_SECRET 或独立 SSO_JWT_SECRET）；
- 或者继续 Stage3 剩余模块（Collector 分布式调度 / 数据质量监控告警），要做哪块告诉我就行。
