# Matrix · 多账号社媒 / 金融矩阵数据监测系统 v2.0

基于 **指纹浏览器 (AdsPower / 比特浏览器) + Chrome MV3 扩展 + 本地 Python 自动化** 的分布式团队矩阵数据采集与可视化看板。

**v2 新增三大核心能力**：RBAC 多角色权限（Admin 全景 / 运营个人视角）· 分布式采集溯源（多运营多人多电脑）· Stocktwits 股票情绪 + Reddit 社区监测。

---

## 1. 项目结构

```
matrix/
├── chrome-extension/                 # 模块一：Manifest V3 分布式采集扩展（v2）
│   ├── manifest.json                 # + Stocktwits/Reddit host 权限 + system/identity
│   ├── content.js                    # + 13 平台 DOM 提取（含股票/社区）+ 双类型 Toast
│   ├── background.js                 # + 7 个溯源 Header（Operator/Machine/JWT）+ 30min 重试
│   └── popup.html                    # + 身份卡（UID/名称/机器）+ SSO JWT Token 输入
│
├── python-runner/                    # 模块二：Python 自动化 + FastAPI 权限服务（v2）
│   ├── main_runner.py                # + RBAC 过滤 / JWT 解码 / Stocktwits·Reddit 提取器 / 绩效视图
│   ├── accounts.json                 # + operators 数组（admin/operator）· entity_type · assigned_operator
│   ├── requirements.txt
│   ├── data.sample.json              # v2 示例：COMMUNITY 记录 + operator/machine 溯源
│   └── ...
│
├── dashboard/                        # 模块三：React 双视角看板（v2 重写）
│   └── src/
│       ├── App.jsx                   # + 身份切换 / Admin 绩效对比条形图 / Stocktwits & Reddit 专属卡
│       └── lib/
│           ├── api.js                # + whoami / operator_uid=xxx 透传 / JWT session
│           └── mockData.js           # v2 完整 RBAC mock（10 账号 + 6 社区 + 4 运营）
│
└── schema/
    ├── supabase_schema.sql           # v2：operators 表 · entity_type · assigned_operator · 溯源字段 · 绩效视图
    └── sqlite_schema.sql             # v2：SQLite 同语义版
```

---

## 2. 快速启动（5 分钟跑通 v2 全能力）

### ① 启动 API 服务（接收扩展数据 + RBAC + 鉴权）

```bash
cd python-runner
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 启动 FastAPI（默认 0.0.0.0:8000，CORS 全开 + iframe CSP frame-ancestors=*）
python main_runner.py server
```

- 健康检查：<http://127.0.0.1:8000/api/health>
- 身份接口：<http://127.0.0.1:8000/api/whoami>
- 角色数据（Admin）：<http://127.0.0.1:8000/api/summary?operator_uid=admin_001>
- 角色数据（运营）：<http://127.0.0.1:8000/api/summary?operator_uid=op_001>

> 💡 无 Python 环境也可直接跳下一步——Dashboard 会自动加载 v2 mock 数据用于演示（含 RBAC 切换）。

### ② 启动可视化 Dashboard

```bash
cd dashboard
npm install          # 或 pnpm / yarn
npm run dev
```

打开 <http://localhost:5173>，v2 默认以 **admin_001（张总）管理员** 登录。

**在右上角 "当前登录人" 下拉中切换身份，体验 RBAC：**
- 🔘 `admin_001`（张总）：**管理员全景视角** → 看到所有 22 个对象（账号 + 社区）+ 顶部「运营绩效对比」条形图 + 表格中完整的「归属运营 / 上报人 / 机器」三列溯源
- 🔘 `op_001`（李运营）/ `op_002`（王运营）/ `op_003`（赵运营）：**运营个人视角** → 统计卡片、趋势图、饼图、表格、社区卡片 **仅显示 assigned 给自己的对象**，表格隐藏归属运营等内部列，右上角单独显示此人「负责对象数」。

下拉最底部还支持 **粘贴内部主系统的 JWT Token**（HS256，payload 含 `sub`=uid / `name` / `role`=admin|operator），一键切换 SSO 模式。

### ③ 安装 Chrome 扩展（分布式采集 · 多台电脑）

1. 打开 Chrome / Edge → `chrome://extensions` → 开启「开发者模式」→「加载已解压」选中 `chrome-extension/`
2. 点击扩展图标 → **在「运营身份」区域填入 4 项：**
   - **运营 UID**：`op_001` / `op_002` / `op_003`（与 `accounts.json` 中 `assigned_operator_uid` 对齐）
   - **运营名称**：李运营 / 王运营 / 赵运营
   - **机器名**：如 `李运营-MacBook-Pro`（方便 Admin 看板溯源哪台电脑掉线）
   - **SSO JWT Token**（可选）：内部主系统签发的 JWT（覆盖手动填写）
   - API Endpoint：`http://中央服务器IP:8000/api/collect`（或本地 `127.0.0.1`）
3. 访问任意平台：
   - **账号页（11 个平台）** → 右上绿色 Toast ✅ 「已采集」
   - **Stocktwits 股票页**（如 `https://stocktwits.com/symbol/NVDA`）→ 紫色 🟣 社区 Toast「🐂 看涨 68%」
   - **Reddit 社区页**（如 `https://www.reddit.com/r/wallstreetbets`）→ 紫色 🟣 社区 Toast「👥 1580万成员 / 4.2万在线」

4. 打开 Dashboard → 对应股票 / 社区卡片立即出现，并且底部「来源机器 / 运营」「最后上报时间」实时更新，方便 Admin 一眼看出哪位运营的哪个账号超过 6 小时未上报（标红异常 ⚠️）。

---

## 3. v2 核心业务能力详解

### 3.1 账号权限与内部系统对接（RBAC + SSO + iframe 内嵌）

**角色定义（`operators` 表）**

| role | 权限 | 典型使用者 |
|---|---|---|
| `admin` | 查看所有平台 / 所有运营 / 所有对象 / 绩效对比 / CSV 全量导出 | 老板、管理层 |
| `operator` | 仅看 `assigned_operator_uid = 自己` 的账号/社区 + 自己上报的数据 CSV 导出 | 运营人员 |
| `viewer`（预留） | 只读全部，不能导出 | 访客 / 审计 |

**账号 / 社区归属配置（`accounts.json` + 数据库）**
每个监测对象必带：
- `entity_type`：`ACCOUNT`（个人/官方账号）或 `COMMUNITY`（股票页 / Subreddit）
- `assigned_operator_uid`：绑定的运营 UID（如 `op_001`）
- `assigned_operator_name`：运营姓名（看板展示用）

**后端 RBAC 过滤（FastAPI）**
`/api/summary` / `/api/export/csv` 三个渠道取当前登录人，优先级：
1. **Authorization: Bearer <JWT>** → HS256 校验，payload `sub` → uid，`role` 判定
2. **Header `X-Operator-UID` + `X-Role`** → 内部微服务内网透传
3. **Query `?operator_uid=xxx`** → 开发测试 / 前端切换模拟

命中后 `apply_rbac(records, uid, role)`：
- admin：原样返回全部
- operator：只返回 `assigned_operator_uid == uid` 的对象；所有聚合（总粉丝 / 趋势 / 平台流量 / 社区 Watchers）自动只统计负责范围
- CSV 导出：同样走 RBAC（运营下载到的 Excel 只有自己账号）

**SSO / iframe 内嵌对接**
本系统天然支持微前端接入：
- **iframe 内嵌**：后端设置 CSP `Content-Security-Policy: frame-ancestors *`；Dashboard 本身 100% 自适应，可嵌入任意宽高
- **Token 鉴权**：父系统拿到 JWT → 写 `localStorage.matrix_jwt_token = xxx` 或通过 `postMessage`；再 iframe Dashboard
- **Query 传身份**（低安全场景）：`/dashboard?operator_uid=admin_001` 直接作为默认登录人

### 3.2 分布式采集溯源（多运营 · 多人多电脑）

**Chrome 扩展上报 Header（7 个溯源字段，100% 兜底）**

| Header | 说明 | 示例 |
|---|---|---|
| `X-Operator-UID` | 运营唯一 ID（popup 配置） | `op_001` |
| `X-Operator-Name` | 运营姓名（看板展示） | `李运营` |
| `X-Machine-ID` | 本机唯一 ID（`chrome.storage.local` 自动生成 UUID，永不变化） | `mac-3fa2-8c...` |
| `X-Machine-Name` | popup 中手填的机器昵称 | `李运营-MacBook-Pro` |
| `X-Client-Version` | 扩展版本号 | `2.0.0` |
| `X-Entity-Type` | ACCOUNT / COMMUNITY | `COMMUNITY` |
| `Authorization` | SSO JWT（可选，优先级最高） | `Bearer eyJhbGc...` |

> 为防止中间代理丢 Header，`background.js` **同步在 POST Body JSON 中冗余写入同名字段**；后端 `/api/collect` 双兜底取数，保证永不丢失溯源信息。

**看板溯源展示**
1. 顶部「异常 / 掉线」卡片 + 表格「异常」列：超过 6 小时未上报的对象自动标琥珀色 🟠，展示 `AlertTriangle` 图标 + "异常" 徽标
2. 表格 **Admin 视角** 新增 3 列：归属运营（渐变头像）/ 上报人 / 机器名（鼠标悬停显示机器 ID）
3. 表格 **最后上报** 列：相对时间（"2 分钟前" / "18 小时前"）一眼看数据新鲜度
4. Stocktwits / Reddit 社区专属卡片底部固定两行：「机器名」+「最后上报」，管理者随时定位问题来源

**扩展本地重试队列**
- 网络失败的上报自动入 `chrome.storage.local` retry 队列
- 每 30 分钟 + 浏览器启动时自动重试
- Popup 显示「待上传 N 条」，可手动触发

### 3.3 特殊平台监测：Stocktwits 股票 + Reddit 社区

#### 3.3.1 Stocktwits（股票情绪页 `https://stocktwits.com/symbol/$CODE`）

Chrome 扩展 `content.js` 进入该 URL 自动提取 **6 个指标**：

| 字段 | 提取方式 | 展示位置 |
|---|---|---|
| `members` / Watchers | 正则 "X followers / X Watchers" + 万/亿/K 单位换算 | 社区卡「Watchers」+ 表格粉丝/成员列 |
| `message_volume_24h` | 24h Message Volume | 社区卡「24h 消息」|
| `sentiment_bull` / `sentiment_bear` | 看涨 % / 看跌 %（Bullish / Bearish 文本正则）| 社区卡情绪条（绿看涨 + 红看跌）+ 表格互动率位置显示 🐂 XX% |
| `symbol_price` | 当前股价 $X.XX | 社区卡顶部大号 $价格 |
| `symbol_change_pct` | 当日涨跌 ±X.XX%（红 ↓ / 绿 ↑）| 价格旁涨跌徽标 + 箭头 |

accounts.json 配置示例：
```json
{ "account_name": "$NVDA", "entity_type": "COMMUNITY", "platform_key": "stocktwits",
  "symbol": "NVDA", "target_url": "https://stocktwits.com/symbol/NVDA",
  "assigned_operator_uid": "op_001", "assigned_operator_name": "李运营" }
```

看板 Stocktwits 专属卡片（Dashboard 中单独横排展示 3 列网格）：
- 顶部：股票大 Logo（$NVDA）+ 价格 / 涨跌徽标
- 中部三宫格：Watchers · 24h 消息 · 🐂/🐻 情绪
- **看涨 / 看跌情绪条**：渐变绿段占宽 + 红段占宽，1:1 比例，一眼判断市场
- 底部：来源机器 / 最后上报时间（溯源）

#### 3.3.2 Reddit Subreddit 社区页 `https://www.reddit.com/r/XXX`

自动提取 **4 个指标**：

| 字段 | 提取方式 | 展示 |
|---|---|---|
| `members` | 正则 "X.Xm members" → 15,800,000 | Members 卡 + 表格成员列 |
| `online` | "X.Xk online" → 42,800 | Online 卡（颜色按热度：绿 >4‰ / 黄 >2‰ / 灰）+ 带呼吸点 pulse 图标 |
| `posts_24h` | 正则 / DOM 24 小时发帖数 | 24h 帖卡 + "每 N 分钟 1 帖" 文案 |
| `message_volume_24h` | = posts_24h，用于流量饼图折算 | / |

accounts.json：
```json
{ "account_name": "r/wallstreetbets", "entity_type": "COMMUNITY", "platform_key": "reddit",
  "subreddit": "wallstreetbets", "target_url": "https://www.reddit.com/r/wallstreetbets",
  "assigned_operator_uid": "op_003", "assigned_operator_name": "赵运营" }
```

看板 Reddit 专属卡片：
- Reddit 橙红渐变 Logo + 社区名
- 三宫格：Members / 🟢 Online（带颜色 + 呼吸灯）/ Posts 24h
- 在线率条：`online / members`，宽度 0~100%，热度染色
- 发贴节奏：自动计算 "每 X 分钟 1 帖" 文案（24h / posts_24h × 60）
- 底部溯源 + 最后上报

---

## 4. 数据结构总览（v2 Schema）

### 4.1 核心枚举贯穿全链路

```ts
type EntityType = 'ACCOUNT' | 'COMMUNITY';
type RoleType   = 'admin' | 'operator' | 'viewer';
```

### 4.2 `operators` 表 / JSON 数组

| 字段 | 类型 | 说明 |
|---|---|---|
| `operator_uid` | VARCHAR PK | 运营 ID，如 `op_001` / `admin_001` |
| `operator_name` | VARCHAR | 看板展示姓名 |
| `role` | ENUM | admin / operator / viewer |
| `email` / `phone` / `extra` | VARCHAR JSON | （预留）|

### 4.3 `accounts` 表 / JSON（监测对象）

| 字段 | 类型 | 示例（ACCOUNT） | 示例（COMMUNITY Stocktwits） | 示例（COMMUNITY Reddit） |
|---|---|---|---|---|
| `entity_type` | ENUM | ACCOUNT | COMMUNITY | COMMUNITY |
| `account_name` | VARCHAR | 财经观察 | $NVDA | r/wallstreetbets |
| `platform_key` | VARCHAR | xueqiu | stocktwits | reddit |
| `symbol` | VARCHAR | — | NVDA | — |
| `subreddit` | VARCHAR | — | — | wallstreetbets |
| `target_url` | VARCHAR | xueqiu.com/u/xxx | stocktwits.com/symbol/NVDA | reddit.com/r/wallstreetbets |
| `assigned_operator_uid` | VARCHAR | op_001 | op_001 | op_003 |
| `assigned_operator_name` | VARCHAR | 李运营 | 李运营 | 赵运营 |
| `profile_id` | VARCHAR | 指纹浏览器 ID | （空，不需登录） | （空，不需登录）|

### 4.4 `records` 表（每次采集一行，可无限追加）

公共字段 + ACCOUNT 字段 + COMMUNITY 字段三组合并：

```
id · created_at · updated_at
-- 归属 & 溯源
account_name · platform_key · entity_type · symbol · subreddit · target_url
assigned_operator_uid · assigned_operator_name
operator_uid · operator_name        ← 本次上报是谁操作的
machine_id · machine_name           ← 本次上报来自哪台电脑（UUID + 昵称）
client_version                      ← Chrome 扩展版本号

-- ACCOUNT (entity_type=ACCOUNT)
followers · following · views · likes · comments · collect · engagement_rate

-- COMMUNITY Stocktwits
members (=Watchers) · message_volume_24h
sentiment_bull · sentiment_bear     ← 0~100, 两者和为 100
symbol_price · symbol_change_pct    ← e.g. 118.42, 2.31 (%)

-- COMMUNITY Reddit
members · online · posts_24h · message_volume_24h (=posts_24h)

source: 'extension' | 'runner' | 'manual'
abnormal: BOOLEAN                   ← 后端自动判断（粉丝=0 或 6h+未更新）
extra: JSON                         ← 平台原始 DOM 片段 / 错误信息
```

视图（Supabase / SQLite 均已提供）：
- `vw_latest_records`：每个 account_name 的最新一条记录（Dashboard 主数据源）
- `vw_operator_performance`：每个 operator 的 accounts_count / communities_count / total_followers / total_members / abnormal_count（管理员绩效条形图数据源）

完整 Schema：[schema/supabase_schema.sql](schema/supabase_schema.sql) / [schema/sqlite_schema.sql](schema/sqlite_schema.sql)

---

## 5. v2 Dashboard 功能清单

启动后可见（顶部状态栏标注当前视角）：

### 顶部 5 张统计卡片（v2 新增社区覆盖）
1. 全网总粉丝（账号）`indigo`
2. **社区覆盖（成员）** `violet`（所有 Stocktwits Watchers + Reddit Members 合计，管理层看舆情覆盖数）
3. 近 7 天总曝光量 `sky`（账号阅读/播放 + 社区消息量×50 折算）
4. 涵盖监测对象（N 账号 + M 社区 + P 平台明细）
5. 异常 / 掉线 `rose`（>0 变红，文案提示尽快检查）

### Admin 视角专属：运营绩效对比条形图
- Recharts BarChart，维度：粉丝总量 / 社区覆盖 / 异常数
- 自动按粉丝总量降序，一眼看出谁产出最高 / 谁的异常数最高

### 专属卡片横排
- **Stocktwits · 股票情绪监测 3 列网格**：每只股票一张卡（价格 / 涨跌 / Watchers / 24h 消息 / 🐂🐻 情绪条 + 来源机器）
- **Reddit · 社区活跃度监测 3 列网格**：每个 Subreddit 一张卡（Members / Online 带呼吸灯 / Posts 24h / 在线率条 / 发帖节奏 / 溯源）

### 图表区
- 近 30 天各平台覆盖增长 LineChart（账号粉丝 + 社区成员，按平台拆分多色线条）
- 平台曝光占比 Donut Pie（中心总曝光 + Top6 平台排序列表）

### 监测对象明细表（v2 列大改）
| 列 | 说明 |
|---|---|
| 对象 | 渐变头像 + 账号/社区名 + 异常徽章（琥珀色 AlertTriangle）|
| **类型**（v2 新）| 🏷️ 账号（sky）/ 🌐 社区（violet）彩色 chip |
| 平台 | 色点圆 tag |
| 粉丝 / 成员 | ACCOUNT 用 followers，COMMUNITY 用 members，统一排序字段 `entity_audience` |
| 曝光 / 消息 | ACCOUNT 用 views，COMMUNITY 用 message_volume_24h |
| 互动率 / 情绪 | ACCOUNT：三档染色互动率；**Stocktwits**：🐂 XX%（绿/红）；**Reddit**：每 N 分钟 1 帖 |
| **归属运营**（Admin 才显示）| 渐变头 + 运营姓名 |
| **上报人**（Admin 才显示）| 小头像 + 姓名 |
| **机器**（Admin 才显示）| Server 图标 + 机器昵称 |
| 最后上报 | 相对时间（"X 分钟前"）|
| 操作 | 外链打开主页 |

### 筛选器（v2 新增）
- 🔘 **类型**：全部 / 仅账号 / 仅社区 （LayoutGrid 图标）
- 🔘 分类：全部 / 金融 / 社媒 / 海外 / 社区
- 🔘 平台：13 平台下拉（Globe2 图标）
- 🔍 顶栏搜索框（v2 加强）：账号名 / 平台 **/ 运营姓名 / 机器昵称** 四字段模糊匹配
- 🛡️ 清除会话按钮（Shield 图标）：一键清 JWT + 当前登录人，回到默认 admin_001 演示

### CSV 导出（v2 RBAC + 新列）
- 优先调 `/api/export/csv?operator_uid=xxx`（后端按 RBAC 过滤 + 编码 UTF-8 BOM 可 Excel 直接打开）
- 后端无响应则前端本地导出，**v2 新表头**：对象、类型、平台、归属运营、上报人、机器、粉丝/成员、阅读/曝光/消息24h、互动率%、最后上报

---

## 6. 日常工作流（推荐运营 SOP）

### 每个运营（首次配置 3 分钟）
1. 在自己电脑安装扩展 → popup 填入 `op_xxx` / 姓名 / 机器昵称 / 服务器 API 地址 → 保存
2. 打开指纹浏览器 AdsPower / 比特浏览器，**每个指纹 Profile 也单独加载同一个扩展**（或者打包 crx 批量下发）
3. 日常刷账号页 / 股票页 / Reddit 社区 → 看到 Toast 即采集成功，无其他操作

### 管理员（每日查看 < 5 分钟）
1. 打开 Dashboard → 默认管理员视角
2. 先看「异常 / 掉线」卡片：是否有异常数
3. 再扫 Stocktwits / Reddit 社区卡片底部「最后上报」：是否有运营超过 6 小时没刷新对应页面（立即私聊对方要求操作）
4. 运营绩效条形图：每人负责的粉丝总量 / 社区覆盖排名
5. 每周一导出 CSV 留存备案

---

## 7. 部署建议

### 本地单机（1 人团队）
`python main_runner.py server` 挂后台 + Dashboard `npm run build` 后本地双击即可。定时采集 crontab `0 */6 * * * /usr/bin/python3 ~/matrix/python-runner/main_runner.py run`。

### 团队协作（5-10 运营分布式）
1. 找一台内网服务器（或者 1C2G 云服务器）跑 `python main_runner.py server`，开放 `8000` 端口（或用 Nginx 反代 HTTPS）
2. 所有运营电脑的 Chrome 扩展 popup 填 `http://服务器IP:8000/api/collect`
3. Supabase 建库，跑 `schema/supabase_schema.sql`；在 `main_runner.py` 中写入库逻辑（`records` 表结构已对齐），或直接把 `data.json` 目录定期 rsync 备份
4. Dashboard 部署 Vercel：直接 drag `dashboard/` 文件夹 → Vercel，环境变量 `VITE_API_BASE=https://your-server.com/api`
5. 可选：接入内部 SSO → 签发 HS256 JWT（`sub`=uid, `name`=xxx, `role`=admin|operator, 过期 8h）→ 父系统 iframe 嵌入 Dashboard 前写入 `localStorage.matrix_jwt_token`

---

## 8. 常见问题（v2）

**Q: 切换到运营视角后数据全空？**
→ 运营 `op_001` 只有 7 个对象（5 账号 + 2 社区），如果开启了额外筛选器（比如平台=Reddit，op_001 没分配 Reddit）就会空。把平台切回 "所有平台" 即可。

**Q: Stocktwits / Reddit 采集不到情绪 / Online？**
→ 90% 场景：Reddit 未登录会把 Online 隐藏。解决：在指纹浏览器里登录一个 Reddit 账号（不需要订阅），再打开 Subreddit 就能看到 "X.Xk online"。
→ 扩展有正则兜底，也可以在 content.js `extractStocktwits()` / `extractReddit()` 中打断点调试。

**Q: 怎么判断哪个运营的哪个账号没上报？**
→ Dashboard 管理员视角 → 表格按「最后上报」倒序 → 超过 6h 的会自动标异常。或者在社区卡片底部查看 "最后上报" / "来源机器"。

**Q: iframe 嵌入在内部系统后 RBAC 不生效？**
→ 父系统需要在 iframe URL 拼接 `?operator_uid=op_001` 或先在同域 localStorage 写 JWT。也可以通过 `postMessage` 通知 App：
```js
document.querySelector('iframe').contentWindow.postMessage(
  { type: 'matrix_set_jwt', token: 'eyJhbGc...' }, '*'
);
```
（v2 App 已预留 `window.addEventListener('message', ...)` 接入位置，在 `api.js` 中扩展即可）

---

## 9. 文件索引（v2 全部写盘完成）

- [chrome-extension/manifest.json](chrome-extension/manifest.json) v2.0.0（host+权限）
- [chrome-extension/content.js](chrome-extension/content.js) v2（13 平台 + Stocktwits/Reddit COMMUNITY 提取）
- [chrome-extension/background.js](chrome-extension/background.js) v2（7 个溯源 Header + Body 兜底 + JWT 解析 + Retry）
- [chrome-extension/popup.html](chrome-extension/popup.html) v2（运营身份卡 + JWT 粘贴）
- [python-runner/main_runner.py](python-runner/main_runner.py) v2（dataclass + STOCKTWITS_JS / REDDIT_JS / decode_jwt HS256 / apply_rbac / operator_stats 绩效视图 + iframe CSP）
- [python-runner/accounts.json](python-runner/accounts.json) v2（4 operators + 16 ACCOUNT + 6 COMMUNITY）
- [python-runner/data.sample.json](python-runner/data.sample.json) v2（11 条完整 COMMUNITY 记录 + operator/machine 溯源）
- [dashboard/src/App.jsx](dashboard/src/App.jsx) v2（双视角 + 绩效条形 + Stocktwits/Reddit 专属卡 + 新表格列）
- [dashboard/src/lib/api.js](dashboard/src/lib/api.js) v2（whoami + operator_uid=xxx 透传 + JWT session + RBAC CSV 列）
- [dashboard/src/lib/mockData.js](dashboard/src/lib/mockData.js) v2（4 运营 + 10 账号 + 6 社区 + applyRBACFilter 过滤函数）
- [schema/supabase_schema.sql](schema/supabase_schema.sql) v2（operators 表 + entity_type + 溯源字段 + vw_latest_records + vw_operator_performance）
- [schema/sqlite_schema.sql](schema/sqlite_schema.sql) v2（SQLite 语义对齐版）
