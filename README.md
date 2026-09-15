# Matrix · 多账号社媒 / 金融矩阵数据监测系统 v4.3

基于 **指纹浏览器 (AdsPower / Hubstudio) + Chrome MV3 扩展 + 本地 FastAPI+SQLite 后端** 的分布式团队矩阵数据采集与可视化看板。

**v4 最新交付：** 账号体系 JWT + SSO 免登（v4.1）· 股票/社区白名单采集触发（v4.1）· 发布频率热力图 + 24h 活跃曲线 + 18 平台筛选（v4.2）· 管理后台 Tab4 重排 + 内联 Logo 上传（v4.2）· 全站禁假数据 + 昵称实时同步 + 平台曝光 18 平台全显（v4.3）。

---

## 0. 版本时间线（已交付能力）

| 版本 | 核心交付 | 验证状态 |
|------|---------|---------|
| **v4.3**（当前） | 下载插件入口替代 AI周报；全站禁假数据（删除 OPERATORS fallback + 15s Math.random 注入）；平台曝光占比 18 平台 0% 全显；修改昵称后 header/面包屑/归属列实时同步 | ✅ 浏览器实机 + build 0 fatal |
| **v4.2** | 管理后台 Tab 顺序：系统用户 → 采集器授权 Token → 股票监控 → 社区监控；股票/社区内联 Logo 上传（Base64 data_url）；移除页面右上角冗余大按钮；全站移除原自助注册仅管理员手动创建账号；Tokens 模块搬家至管理后台系统用户 Tab（prop 注入，Hooks 前置修复 Rules of Hooks 96 vs 115 + TDZ ReferenceError） | ✅ 8 条冒烟测试 |
| **v4.1** | FastAPI JWT + bcrypt 账号体系；管理员手动创建（仅管理员入口）；Admin User Management 页面；SSO JWT 免登 HS256/RS256 JWKS；采集器白名单触发机制（≥3s 停留三重置 + pushState / visibilitychange）；Stocktwits + Reddit 双模块独立紫色渐变卡片 | ✅ smoke_auth.sh 21/21 PASS |
| **v3.4** | 发布频率热力图（GitHub 风）+ 24h 活跃气泡曲线双列 + 18 平台筛选 chips（9 列 × 2 行严格 Grid）；连续活跃 / 最长静默天数统计；头像采集兜底蓝底白代码渐变；华盛通玫红 + 老虎社区玫红双平台加入 | ✅ 热力图 + 24h 视觉验收 |
| **v2.0** | Manifest V3 扩展 + Stocktwits 股票情绪 + Reddit 社区 + RBAC 双视角（Admin 全景 / 运营个人视角）+ 7 字段采集溯源 | ✅ 构建 0 fatal |

---

## 1. 项目结构

```
matrix/
├── chrome-extension/                 # 模块一：Manifest V3 分布式采集扩展（副本 chrome-extension 目录，与 collector-extension 双份同步）
│   ├── manifest.json                 # + Stocktwits/Reddit host 权限 + declarativeNetRequest CORS
│   ├── content.js                    # + 18 平台 DOM 提取 + 双类型 Toast + 白名单 ≥3s 触发
│   ├── background.js                 # + 7 个溯源 Header（Operator/Machine/JWT）+ 3min 心跳重试
│   └── popup.html                    # + 身份卡（UID/名称/机器）+ SSO JWT Token 输入
│
├── collector-extension/              # 模块一主目录（Dashboard DownloadsPage 打包此目录）
│   ├── manifest.json
│   ├── content.js                    # Stocktwits 股票提取 6 指标 + Reddit 社区提取 4 指标 + 跨平台 extractAvatar 头像打分器
│   ├── background.js                 # chrome.alarms 3 分钟心跳 + flushQueue 批量 / 指数退避 / chrome.storage.local QUEUE
│   ├── popup.html + popup.js         # Tailwind 3 CDN · 归属运营 / 机器名 / server URL / webhook / 三枚状态卡
│   └── rules.json                    # declarativeNetRequest：剥离 Origin/Referer 响应注入 ACAO*
│
├── dashboard/                        # 模块三：React/Vite 双视角看板（v4.3）
│   └── src/
│       ├── App.jsx                   # 主入口（LoginPage + Dashboard + DownloadsPage + ProfileView + AdminUserManagementPage 内嵌）
│       └── lib/
│           ├── api.js                # fetchSummary / fetchWhoami / RBAC CSV / 管理员路由（createAccount/resetPassword/updateMe）
│           └── mockData.js           # ⚠️ 仅静态平台配置（PLATFORM_META + PLATFORM_LOGOS），不再含 OPERATORS 假运营人；v4.3 起所有数据严格真实采集，0 就是 0，空就是空
│
├── server/                           # 模块二：FastAPI + SQLite 聚合服务（v4.3）
│   ├── main.py                       # JWT auth · /api/auth/login · /api/admin/* 路由 · /api/summary 全量聚合 · 加权发布频率口径 + 24h 小时分布 + 366 天补 0 日历 · 18 PLATFORMS 常量
│   └── requirements.txt              # fastapi[all] / uvicorn[standard] / pydantic v2 / pyjwt / bcrypt
│
├── python-runner/                    # （保留）Python Playwright 自动化批量采集器（AdsPower/Hubstudio 指纹浏览器）
├── chrome-extension/                 # （保留副本）
└── schema/
    ├── supabase_schema.sql           # v4.2：users · operators · accounts · records · daily_snapshots · refresh_tokens · audit_logs · collector_tokens
    └── sqlite_schema.sql             # SQLite 同语义版（server/main.py 内建 DDL 自动建表）
```

---

## 2. 快速启动（5 分钟跑通 v4.3）

### 前置说明：真实数据唯一入口

v4.3 起 **全站禁止任何假数据 / Mock fallback**。所有数字来源：
1. **Chrome 插件采集**（运营浏览对应平台页面后自动上报）
2. **Python Playwright 自动化**（无值守指纹浏览器批量采集）
3. **管理员在后台手动添加股票/社区白名单**（插件用户浏览到对应页面自动触发）

后端无采集数据时显示空态（0 就是 0，不会填充假数据）。

---

### ① 启动 API 服务（接收扩展数据 + RBAC + 鉴权）

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 启动 FastAPI（默认 0.0.0.0:8000，CORS 全开 + iframe CSP frame-ancestors=*）
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- 健康检查：<http://127.0.0.1:8000/api/health>
- Swagger 文档：<http://127.0.0.1:8000/docs>
- Redoc：<http://127.0.0.1:8000/redoc>

首启动自动 seed：创建 SQLite `server/matrix.db`，**建库 + 插入唯一初始管理员 `admin / admin123`**（bcrypt rounds=12）。

> 🔐 **生产必改**：登录后立刻在「个人资料与安全 → 登录密码 → 修改密码」重置 admin 默认密码；环境变量 `JWT_SECRET` 改为 `openssl rand -hex 32` 生成的随机 32+ 字节。

### ② 启动可视化 Dashboard

```bash
cd dashboard
npm install          # 或 pnpm / yarn
npm run dev          # Vite 默认 5173，/api → 127.0.0.1:8000（vite.config.js 已配置 proxy）
npm run build        # 生产打包
```

打开 <http://localhost:5173> → 登录页：

| 初始账号（seed） | 密码 | 角色 |
|------------------|------|------|
| `admin`          | `admin123` | 平台管理员（Admin 全景） |

> v4.2 起 **全站仅管理员手动创建、无公开注册**；运营同事账号只能由管理员在「用户与权限后台 → 系统用户 → 新建账号」手动创建（自动生成 16 位大小写+数字+符号强密码）。

### ③ 安装 Chrome 采集扩展（Manifest V3 · 运营电脑必装）

**方式 A：从 Dashboard 一键下载整包（v4.3 推荐 ⭐）**
1. 登录 Dashboard → 顶部 Header 右侧「下载插件」天蓝渐变按钮
2. 进入 DownloadsPage → 点「一键下载插件整包（ZIP）」→ 获得 `collector-extension.zip`
3. 解压后得到 `collector-extension/` 文件夹，进入 Chrome 扩展管理页面

**方式 B：直接加载仓库目录**
```
矩阵仓库目录 → collector-extension/
```

**标准加载流程（Chrome / Edge / 所有 Chromium ≥110 内核）**：
1. 打开 `chrome://extensions/` → 右上角开启「开发者模式」
2. 点「加载已解压的扩展程序」→ 选中 `collector-extension/` 目录
3. 工具栏拼图图标 → Matrix Collector → 📌 固定

**插件 3 项必填配置（Popup 界面）**：
| 项目 | 说明 | 示例 |
|------|------|------|
| **归属运营** | 下拉选择已在 Admin 后台创建的运营账号 | `李运营` / `王运营` / `张总（管理）` |
| **机器名称** | 机器昵称，便于溯源排错 | `李运营 - Win11 台式` / `赵运营 - Mac Studio` |
| **后端服务地址** | 本地 / 局域网 / 生产域名 | `http://127.0.0.1:8000` / `https://matrix.company.com` |

**采集触发（v4.1 白名单方案 A）**：
> ⚠️ 插件不会盲目采集所有页面。必须管理员先在「管理后台 → 股票监控 / 社区监控 → 添加监控对象」配置白名单（如 `$NVDA` / `r/wallstreetbets` / 小红书具体账号 URL）。白名单配置后，插件用户浏览对应 URL → **停留 ≥ 3 秒** 或 **Tab visibilitychange 切回** → 自动解析 DOM 上报。

---

## 3. v4 账号体系（JWT + SSO · 无公开注册）

### 3.1 RBAC 三级角色（后端 `require_role` 多层 Depends 强制校验）

| 角色 | 英文常量 | 权限 |
|------|---------|------|
| 平台管理员 | `admin` | 一切权限：用户 CRUD / 重置密码 / Token 授权 / 股票+社区白名单维护 / 禁用账号 / 审计日志 |
| 运营主管 | `manager` | 所有运营数据 + 切换视角；不可访问 Admin 后台 4 Tab |
| 运营专员 | `operator` | 仅个人绩效看板 + 本人负责对象；表格隐藏归属/上报人/机器列 |

前端菜单只是 UI 裁剪，即使绕过前端构造 HTTP 请求后端也返回 401 / 403。

### 3.2 创建运营账号（管理员唯一入口）

路径：`右上角头像 → 用户与权限后台 ADMIN → Tab 1「系统用户」→ 顶部「新建账号」`

字段：用户名 / 邮箱 / 角色（默认运营专员）/ 绑定运营档案 → 提交后 **Toast 仅出现 1 次密码**（16 位强密码），管理员复制发送给对应同事。

> v4.2 永久移除：原自助注册生成、登录页原注册 Tab、原注册 400 系列错误码。所有新账号必须走管理员手动创建。

### 3.3 昵称修改实时同步（v4.3）

所有显示昵称的地方（header 用户按钮、面包屑绩效看板标题、归属运营列）都从 `currentUser.display_name` 单一真源读取。

进入「个人资料与安全 → 显示昵称」改成新值 → 保存 → **无需手动刷新页面**，Header / 面包屑 / 表格归属列 0.5 秒内全部重渲染。

---

## 4. v4 Dashboard 功能清单（当前 UI 版本）

### 顶部 Header 按钮顺序（左 → 右）

1. Matrix 监测看板 v3.4 品牌 Logo → 点击回首页
2. 「我的矩阵」面包屑快捷切换
3. 全局搜索 🔍（账号名 / 平台 / 运营姓名 / 机器昵称 四字段模糊）
4. 实时 · 历史爆款 2 个快捷筛选
5. ⭐ **「下载插件」天蓝渐变按钮**（v4.3 新增，替换原 AI周报 → 进入 DownloadsPage ZIP 整包下载）
6. 右上角用户菜单：个人资料与安全、用户与权限后台（仅 Admin 可见）、清空全部监测数据（仅 Admin 可见）、退出登录

### 首页全景卡片 5 张
1. 全网总粉丝（账号）indigo
2. 社区覆盖（成员）violet（Stocktwits Watchers + Reddit Members 合计）
3. 近 7 天总曝光量 sky（阅读/播放/消息量折算）
4. 涵盖监测对象（平台 × 账号 × 社区 拆分）
5. 异常 / 掉线 rose（6h+ 未上报 或 粉丝=0 标红）

### Stocktwits · 股票情绪监测（横排 3 列网格）
- 采集失败头像 → 蓝紫渐变 + `$代码` 兜底
- 三宫格：Watchers · 24h 消息 · 🐂 看涨 % / 🐻 看跌 %
- 内联 Logo 上传（v4.2：hover 显示 Camera 按钮，Base64 data_url 同步）

### Reddit · 社区活跃度监测（横排 3 列网格）
- 橙红渐变兜底 + `Globe2` 图标（采集不到头像时）
- 三宫格：Members / Online 呼吸灯 / Posts 24h + "每 N 分钟 1 帖"
- 内联 Logo 上传（v4.2，股票一致）

### 内容发布总体统计（双列 Emerald 绿）
| 左列：GitHub 风频率热力图 | 右列：24h 活跃气泡曲线图 |
|--------------------------|---------------------------|
| 53 周 × 7 日；**竖长矩形 22px**，`gap-1`，所有 0/null 白格强制 `ring-1 ring-black/[0.04]` 无缺口 | SVG viewBox 95×100；每个数据点 28×28px 透明 hitbox，hover 稳定显示 X 时 + 发布数 |
| 顶部 Chips 筛选：**9 列 × 2 行 Grid = 18 平台**（微信/视频号/抖音/小红书/富途/老虎/华盛通/雪球/X/YouTube/TikTok/LinkedIn/Instagram/Discord/Stocktwits/SeekingAlpha/Reddit/微博） | Emerald 绿系统一视觉；太阳/月亮图标已移除 |
| **底部两张天蓝渐变统计卡**：「连续活跃 N 天」+「最长静默 M 天」（替换原 Less→More 色阶图例，业务指标更有价值） | 两列对齐严格对称：标题层级 + 线框结构 + padding 像素级一致 |

### 平台曝光占比 Donut Pie（v4.3 升级 ⭐）
- **固定 18 个平台图例 100% 显示**，即使平台无采集数据也强制显示 `0.0%`（value=0 扇形角度 0 不可见，但右侧图例 18 条全在）
- 排序：按 `value desc`，有曝光的在前，0% 的在后
- 点击任一图例 → 跳对应平台看板
- **空态触发条件**：全部平台 value 加总为 0 **且** 平台列表 < 2（避免把 18 个 0% 误判为空），否则正常渲染

### 图表 + 表格
- 近 30 天各平台覆盖增长 LineChart（多色拆线）
- 监测对象明细 10 列：对象（渐变头像+异常徽标）/ 类型 chip / 平台色点 / 粉丝成员 / 曝光消息 / 互动率情绪 / 归属运营（Admin 才可见）/ 上报人（Admin）/ 机器（Admin）/ 最后上报相对时间 / 外链打开

### 管理后台 Tab 顺序（v4.2 永久 4 项）
`Tab 0 系统用户 → Tab 1 采集器授权 Token → Tab 2 股票监控 → Tab 3 社区监控`

---

## 5. 18 平台总览（当前稳定集）

> 说明：v3.4 后多次平台调整（删除长桥/Telegram/知乎/贴吧/B站 → +老虎/华盛通），最终沉淀 **18 个平台**。后端 `server/main.py:PLATFORMS` 常量 / 前端 `mockData.js:PLATFORM_META` / 筛选 Chips 三方 **同源对齐**，任何一处改动都会同步。

| Key | 名称 | 分类 | 主色 |
|-----|------|------|------|
| wechat | 微信公众号 | 国内社媒 | #07C160 |
| wechat_video | 微信视频号 | 国内社媒 | #1AAD19 |
| douyin | 抖音 | 国内短视频 | #000000 |
| xiaohongshu | 小红书 | 国内种草 | #FE2C55 |
| futu | 富途牛牛 | 股票社区 | #00B2FF |
| laohu | 老虎社区 | 股票社区 | #FF7A00 |
| huasheng | 华盛通 | 股票社区（v4.2 新增） | #E91E63 |
| xueqiu | 雪球 | 股票社区 | #FF4500 |
| x | X(Twitter) | 海外社交 | #1DA1F2 |
| youtube | YouTube | 海外视频 | #FF0000 |
| tiktok | TikTok | 海外短视频 | #000000 |
| linkedin | LinkedIn | 海外职场 | #0A66C2 |
| instagram | Instagram | 海外图片 | #E4405F |
| discord | Discord | 海外社区 | #5865F2 |
| stocktwits | Stocktwits | 股票情绪 | #00A6E8 |
| seekingalpha | Seeking Alpha | 股票研报 | #FF6600 |
| reddit | Reddit | 海外社区 | #FF4500 |
| weibo | 微博 | 国内社交 | #E6162D |

---

## 6. 后端 API 路由（FastAPI Pydantic 强校验）

### 6.1 鉴权（JWT access + refresh token 双 token）
| 路由 | 说明 |
|------|------|
| `POST /api/auth/login` | 用户名密码 → `{access_token, refresh_token, user}` |
| `POST /api/auth/refresh` | refresh_token → 新 access_token |
| `POST /api/auth/logout` | 撤销 refresh_token |
| `GET /api/whoami` | 当前登录人（含 display_name / email / avatar） |
| `POST /api/sso/jwt-login` | SSO 免登（v4.1，HS256 默认 / RS256 JWKS 预留） |
| `PUT /api/auth/me` | 修改本人昵称/邮箱/头像渐变/自定义头像（v4.3 立即同步 UI） |
| `POST /api/auth/password-change` | 修改本人登录密码 |

### 6.2 Dashboard 主数据
| 路由 | 说明 |
|------|------|
| `GET /api/summary?days=30&operator_uid=xxx` | 全量聚合（latest_records / trend / platform_traffic / operator_stats / collector_machines / by_platform） |
| `GET /api/export/csv` | RBAC 过虑后 UTF-8 BOM CSV，Excel 直接打开 |
| `GET /api/post_frequency_calendar?operator_uid=&platform_keys[]=` | 366 天发布频率加权值 + 24 小时分布（v3.4 热力图 + 24h 曲线数据源） |

### 6.3 采集端（插件 / Playwright）
| 路由 | 说明 |
|------|------|
| `POST /api/heartbeat` | 3min 机器在线 |
| `POST /api/collect-data` | **双防线**：白名单检查（不在白名单 → 200 但丢弃，提示配置）+ 解析校验；数据失败时保留历史值不填 0（CASE WHEN 条件更新） |
| `POST /api/admin/accounts/{id}/logo` | PUT（v4.2）Base64 avatar_data_url 同步 logo 到数据库 |

### 6.4 Admin 后台（4 Tab，`role=admin` 才能访问）
| 路由 | 说明 |
|------|------|
| `GET /api/admin/accounts` + `POST /api/admin/accounts` + `PUT /api/admin/accounts/{id}` + `DELETE /api/admin/accounts/{id}` | 系统用户 CRUD（Tab 1） |
| `POST /api/admin/accounts/{id}/reset-password` | 重置密码（16 位强密码，Toast 仅显示一次） |
| `GET /api/admin/collector-tokens` + `POST /api/admin/collector-tokens` + `DELETE` | 采集器授权 Token（Tab 2，v4.2 搬家至此） |
| `GET /api/admin/monitored-stocks` + `POST` + `PUT` + `DELETE` | 股票监控白名单（Tab 3，内联 Logo 上传） |
| `GET /api/admin/monitored-communities` + `POST` + `PUT` + `DELETE` | 社区监控白名单（Tab 4，内联 Logo 上传） |
| `GET /api/admin/audit-logs` | 审计日志（AUTH_LOGIN_OK / ADMIN_RESET_PASSWORD / ADMIN_DISABLE_USER 等事件） |

---

## 7. 发布频率加权口径（热力图格子颜色来源）

```
格子 value 加权（同一日同一平台多账号去重求和）：
  = COUNT(posts)          -- 独立作品数
  + SUM(posts_24h)        -- 平台报表 24h 发布数
  + SUM(message_volume_24h)-- 社区消息量
  + ⌊ SUM(views) / 500 ⌋   -- 阅读量折算
  + ⌊ SUM(likes) / 20 ⌋    -- 点赞折算
  + ⌊ SUM(comments) / 10 ⌋ -- 评论折算
```

5 阶色阶：
```
0 分：     白      ring-1 ring-black/[0.04]（所有空格子强制描边，视觉不缺块）
1-10 分：   #DDFBE4 浅绿
11-50 分：  #9AE6B4 中绿
51-200 分： #38A169 深绿
>200 分：   #22543D 墨绿
```

---

## 8. 日常运营 SOP

### 新同事入职（管理员 30 秒完成）
1. 管理后台 → Tab 1 系统用户 → 新建账号 → 角色选「运营专员」→ 提交 → 复制弹出的 16 位密码
2. 把 `用户名 + 初始密码 + Dashboard 登录页 URL` 发给同事
3. 同事首次登录后，在「个人资料与安全」立即改昵称 + 改密码 + 选渐变头像（或上传自定义）
4. 管理后台 → Tab 2 采集器授权 Token → 生成该同事专属 Token → 发给同事在插件 Popup 填
5. Tab 3 股票监控 / Tab 4 社区监控 → 添加该同事负责的白名单 → 绑定归属运营
6. 同事在运营电脑打开 `chrome://extensions` → 加载 `collector-extension/` → Popup 选自己名字、填机器昵称、填后端地址、填授权 Token → 保存 🟢
7. 打开任意一个被分配的白名单页面 → 停留 ≥ 3s → Dashboard 对应卡片立刻出现真实数据

### 管理员每日检查（< 5 分钟）
1. 首页第 5 张「异常 / 掉线」卡：是否有 >0 标红
2. 浏览 3 只 Stocktwits / 1 个 Reddit 底部「最后上报」：超过 6h 私聊运营
3. 运营绩效对比条形图（仅 Admin 可见）：每人负责的粉丝 + 社区覆盖 + 异常数横向对比

---

## 9. 部署建议

### 本地单机（1 人团队）
```bash
# 后端：screen/tmux 挂后台
cd server && source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1

# 前端：
cd dashboard && npm run build
# 产物在 dashboard/dist，双击 index.html 或 serve
```

### 团队协作（5-10 人分布式）
1. 1C2G 云服务器跑 `uvicorn main:app --port 8000 --workers 1 --host 0.0.0.0`（SQLite 单 worker 不锁库；>10 人切 PostgreSQL + schema/supabase_schema.sql）
2. Nginx 反代 HTTPS：`matrix.company.com/api` → 8000，`matrix.company.com/` → Dashboard 静态
3. Dashboard Vercel 部署：drag `dashboard/` → Vercel，`VITE_API_BASE=https://matrix.company.com/api`
4. 采集白名单统一通过 Admin 后台维护，运营无需直接接触代码

### 安全加固（上线前 4 项）
| 项 | 操作 |
|----|------|
| JWT 签名密钥 | `server/.env` 中 `JWT_SECRET=$(openssl rand -hex 32)`；`REQUIRE_AUTH=true` 关闭匿名浏览 |
| 插件请求签名 | `X-Matrix-Signature: HMAC-SHA256(body, SECRET)` 验签，防止伪造采集数据 |
| CORS 白名单 | FastAPI CORSMiddleware `allow_origins` 从 `*` 改 `[https://matrix.company.com]` |
| 管理账号 | admin 默认密码必改；bcrypt rounds=12 单哈希 ≥200ms |

---

## 10. v4.3 构建 + 质量验证（当前验证通过状态）

```bash
cd dashboard
npm run build
# → ✓ 2638 modules transformed.
# → ✓ 0 fatal error

# 代码质量（GetDiagnostics）
# dashboard/src/App.jsx        → 0 errors
# dashboard/src/lib/api.js    → 0 errors
```

浏览器 4 点实机 UI 验证通过（2026-09-15 v4.3 发布）：
- ✅ Header「下载插件」按钮 → DownloadsPage ZIP 整包 → 返回看板
- ✅ 平台曝光占比 18 平台图例全显，15 个 0.0% 正确
- ✅ 昵称 Evan → 张总(管理)·v4 → header/面包屑即时同步，无需刷新
- ✅ liveMode 观察 1 分钟，监测对象明细表数据非 0 增量跳变不再出现（原 15-25s 伪随机注入已完全删除）

---

## 11. 文件索引（v4.3 全部写盘完成）

| 文件 | 版本 | 说明 |
|------|------|------|
| [README.md](README.md) | v4.3 | 本文档 · 版本时间线 · 18 平台 · 管理后台 Tab4 · 昵称同步 · 曝光饼图 18 平台 |
| [README_STAGE2.md](README_STAGE2.md) | v4.3 | 采集插件安装 + 后端启动 + SSO 对接 + 环境变量 + 错误码（更新原自助注册移除/18平台/v4.3新能力） |
| [server/main.py](server/main.py) | v4.3 | FastAPI SQLite · 18 PLATFORMS · JWT bcrypt · 白名单双防线 · CASE WHEN 保留历史值不填 0 |
| [dashboard/src/App.jsx](dashboard/src/App.jsx) | v4.3 | 内嵌 6 页面：Login/Dashboard/Downloads/Profile/Admin/Tokens；onUpdateCurrentUser 昵称实时回调 |
| [dashboard/src/lib/api.js](dashboard/src/lib/api.js) | v4.3 | 无 OPERATORS 假数据 fallback；所有空兜底 `\|\| 0`；PLATFORM_META 仅静态配置 |
| [dashboard/src/lib/mockData.js](dashboard/src/lib/mockData.js) | v4.3 | PLATFORM_META 18 平台配置（非假数据）；OPERATORS 假运营列表已删除 |
| [collector-extension/content.js](collector-extension/content.js) | v4.3 | extractStocktwitsStockMetrics / extractRedditCommunityMetrics / extractAvatar 上下文打分；白名单触发；头像采集失败兜底 |
| [collector-extension/background.js](collector-extension/background.js) | v4.3 | 3 分钟心跳 + 60s / 满 50 批量上报 + 离线持久化队列 |
| [collector-extension/manifest.json](collector-extension/manifest.json) | v4.3 | Manifest V3 权限清单 |
| [collector-extension/rules.json](collector-extension/rules.json) | v4.3 | declarativeNetRequest CORS 白名单 |
| [schema/supabase_schema.sql](schema/supabase_schema.sql) | v4.2 | PostgreSQL 生产版 DDL（users/operators/accounts/records/refresh_tokens/audit_logs/collector_tokens） |
| [schema/sqlite_schema.sql](schema/sqlite_schema.sql) | v4.2 | SQLite 同语义版（server/main.py 已内建 DDL，首启动自动建库） |
