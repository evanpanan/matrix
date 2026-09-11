# v3.4 体验优化升级规格说明书

> 指定时间: 2026-09-11
> 版本: v3.4
> 覆盖页面: 矩阵数据总览（首页） / 运营者个人绩效看板（个人页） / 平台汇总看板（平台页 / 原 PlatformDetailModal 升级）

---

## 1. 问题、用户、目标

### 1.1 问题 (Problem)

基于 v3.2 实测发现 5 类影响核心体验的结构级问题：
1. **Viral 爆款 Toast 视觉混乱**：一次弹 3~6 张上下叠层，每张卡「折叠 → 展开 → 关闭」三段态切换，悬浮层影响下方内容阅读，质感差。
2. **平台看板 Modal 错版 & 显示不全**：窄屏截断、排版挤，弹窗形态无法承载「平台全量数据」；现有 PlatformDetailModal 的 4 KPI / Top5 / 贡献占比远不够。
3. **导航不闭环**：左上角 Logo / 产品名无法返回首页，运营者名、平台 Tag 等多处出现的「人 / 平台锚点」均是静态展示，无法点击下钻进入对应看板。
4. **个人看板返回层级混乱**：右上角「返回主页 + ×」两个按钮语义重叠，返回不明显，不符合 B 端面包屑规范。
5. **结构不一致**：个人看板是「全屏页面」，平台看板是「弹层」，二者视觉深度不统一，导致用户在两级下钻间产生迷路感。

### 1.2 用户 (Users)
- **矩阵管理员**（张总，管理 23 个监测对象、17 账号、6 社区）：需要从平台级、运营者级、账号级三层下钻，快速定位爆款归属和运营绩效。
- **运营者本人**（赵运营 / 王运营 / 李运营）：需要从「我的负责对象」中快速跳转平台、账号、作品原链，完成日常运营闭环。

### 1.3 目标 (Goals)

| 编号 | 目标 | 量化描述 |
|---|---|---|
| G1 | 爆款干扰减少 | 同时在屏幕上悬浮的 Viral Toast 数量 = 1 条；其余移入「历史爆款」抽屉 |
| G2 | 页面结构统一 | 「平台汇总看板」由 Modal 升级为全屏独立页，与个人看板同层级、同样使用面包屑 + 返回导航 |
| G3 | 下钻导航闭环 | 所有出现「运营者名」「平台 Tag（含平台名圆点 + 文字）」的位置：全部变成可点击入口，跳转对应看板 |
| G4 | 导航可见性 | 首页 / 个人页 / 平台页 左上角 Breadcrumb 固定展示，层级可点击返回；Logo + 产品名点击始终返回首页 |
| G5 | 排版质量 | 任何 550px 以上宽度，平台看板 / 个人看板无横向裁切（≤ 24px 右间距） |

### 1.4 非目标 (Non-Goals)

- ❌ 不引入真实后端路由 (react-router)；使用现有 App.jsx 内的 `effectiveScopeUid` + 新引入的 `effectivePlatform` 双 state 作为视图路由（与当前 RBAC 结构保持一致，零依赖新增）。
- ❌ 不更换图表库 / 不增加新数据源（仍然使用 lib/mockData.js 中 PLATFORMS / ACCOUNTS / POST_TITLE_POOL 作为仿真数据）。
- ❌ 不做账号级独立页面（v3.5 再考虑），本期账号明细仍用 AccountDetailDrawer。

---

## 2. 功能性需求 (Functional Requirements)

### FR-1 Viral 爆款展示重构（取消折叠 + 只保留 1 条最新 Toast + 历史爆款入口）

**视图层级**:
- `ViralBanner`（单条常驻，屏幕右上 / 右下）：永远只显示 1 条「最新未关闭爆款」。
- 新爆款生成时：**自动关闭旧 Toast**（0.4s fade 动画），新 Toast 以 slide-in 进入（保留动画，不叠层）。
- **删除「折叠态」**：ViralPostToast 组件内 `collapsed` / `onCollapse` 全部移除，只剩 2 个按钮：「外链跳转 ↗」和「关闭通知 ×」。

**历史爆款展示**:
- 首页顶部（面包屑下方，H1 区右侧）放 Chip 入口：「🔥 历史爆款 · N」，点击打开一个顶部向下展开的 Drawer（`bg-white rounded-3xl shadow-2xl`）。
- Drawer 内以列表形式展示最近 20 条 Viral 记录（卡片式列表，按生成时间倒序），每条仍带跳转与关闭。
- 新爆款进入时：历史爆款 Drawer 自动 prepend 新记录，当前正在展示的单条 Toast 如果用户未关闭，则被移入历史列表。

**交互细则**:
- 单条 Toast 展示时长默认 45 秒，到时自动进入历史爆款列表（不打断用户操作）。
- 用户手动「关闭通知 ×」 → 从单条位移除，移入历史爆款列表。
- 历史爆款 Drawer 标题：「Viral 历史爆款记录」，右上角带 ×；不阻止对页面内容操作（可边看爆款边看数据）。

### FR-2 平台看板升级为全屏独立页面（PlatformView）

**视图路由（App.jsx）**:
- 新增 state `effectivePlatform: string | null`，取值 = PLATFORMS 中 key（如 `douyin`, `stocktwits`）。
- 三种视图：
  1. `!effectiveScopeUid && !effectivePlatform` → 矩阵数据总览（首页）
  2. `effectiveScopeUid && !effectivePlatform` → 运营者个人绩效看板（个人页）
  3. `!effectiveScopeUid && effectivePlatform` → 平台汇总看板（平台页）
  - 互斥约束：同一时刻，`effectiveScopeUid` 与 `effectivePlatform` 只允许其一为真；进入平台时必须清 scopeUid，进入个人时必须清 platform。

**页面内容（相比原 PlatformDetailModal 新增 4 节）**:
1. **顶部标题区**（H1）：平台色大圆点 + 平台名 + 中文语义别名（例：`● Stocktwits · 股票情绪社区`） + 右部「总监测对象 N 个 / 近 7 天发布作品 M 条 / 爆款 K 条」KPI Chips。
2. **4 张核心 KPI 卡**：总粉丝/成员、总曝光/阅读、总发布作品数、平均互动率 %（保持响应式 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`）。
3. **贡献占比 + 双栏 Top 区**（左：账号 / 社区贡献排名条形图；右：Top 5 爆款作品卡片列表）→ 保持 v3.3 已有，但高度从 320 升级到 400，显示 Top 10（原 Top 5 ×2）。
4. **新增：平台级增长趋势（双轴折线图）**（x 轴 = 近 30 天；左 y 轴 = 曝光/阅读量；右 y 轴 = 粉丝/成员增长）→ 复用 App.jsx 中 MultiLineChart（首页同屏渲染的组件），但只筛选属于当前平台的 records（跨平台共用逻辑，抽公共函数 `getPlatformRecords(platformKey)`）。
5. **新增：平台监测对象明细表**（9 列：对象 / 类型 / 平台 固定 / 粉丝或成员 / 曝光或消息 / 互动率 / 归属运营 / 上报人 / 机器 / 最后上报；与首页 DataTable 结构完全相同，仅数据过滤为当前平台）→ 支持点击运营者名 → 跳个人看板；点击对象行 → 打开 AccountDetailDrawer（与首页一致）。
6. **新增：Top 20 作品列表（近 7 天）**：按曝光 + 互动率综合排序，封面 80×80，2 行标题，平台色 Tag，跳转按钮，支持「新标签页打开原帖」↗。

### FR-3 导航：Logo + 产品名返回首页

**所有页面共享 Header（App.jsx Top Header）**:
- 左侧 `div class="flex items-center gap-2.5"` 中 Logo +「Matrix · Multi-Account Monitor v3.0」整组**包裹 `<button>`**，`onClick={() => { resetScopeUid(); resetPlatform(); closeAccountDrawer(); scrollToTop(); }}`。
- Hover 时整组背景「琥珀色 10% + 圆角 2xl」，`cursor: pointer` 显式。
- 视觉保持 Logo 尺寸不变（w-10 h-10）。

### FR-4 下钻跳转：运营者名 / 平台 Tag 全部可点

**需要改成可点击锚点的组件清单（全部点击后 stopPropagation，不触发父级行 click）**:
| 组件 / 位置 | 锚点内容 | 点击行为 |
|---|---|---|
| DataTable「归属运营」「上报人」列（首页 / 平台页 / 个人页三张表共 6 列） | Avatar + 运营者名文字 | `setEffectiveScopeUid(uid); resetPlatform(); closeAccountDrawer(); scrollToTop();` |
| 平台汇总饼图（PieChart）Legend | 平台色块 + 平台名文字 | `setEffectivePlatform(pKey); resetScopeUid(); closeAccountDrawer(); scrollToTop();` |
| 各页面「平台 Tag Chip」（带圆点 + 文字，例如 `● 抖音`） | 平台名文字 + 圆点外层容器 | `setEffectivePlatform(pKey); resetScopeUid(); closeAccountDrawer(); scrollToTop();` |
| ViralPostToast / 历史爆款 Drawer 卡片中「归属 · 赵运营」 | 运营者名 + Avatar | `setEffectiveScopeUid(uid); resetPlatform(); closeAccountDrawer(); scrollToTop();` |
| ViralPostToast / 历史爆款 Drawer 卡片中「平台 Tag Chip」 | 平台圆点 + 文字 | `setEffectivePlatform(pKey); resetScopeUid(); closeAccountDrawer(); scrollToTop();` |
| AccountDetailDrawer 内「归属 · 王运营」文字 | 运营者名文字（去掉静态 badge） | `setEffectiveScopeUid(uid); resetPlatform(); closeAccountDrawer(); scrollToTop();` |
| AccountDetailDrawer 内「平台 Tag Chip」 | 平台圆点 + 文字 | `setEffectivePlatform(pKey); resetScopeUid(); closeAccountDrawer(); scrollToTop();` |
| OperatorOverview 个人页 4 KPI 上方「赵运营 · 综合绩效」区 圆形 Avatar 组 | Avatar + 文字（点击本人进入个人页即当前页，但要 scroll 到顶部） | scrollToTop |

**公共工具函数**:
- `navigateToOperator(uid, {recordRef?: ...})`: 封装 FR-4 第 1 列点击 6 处相同逻辑（resetPlatform + scopeUid + closeDrawer + scrollTop）
- `navigateToPlatform(pKey, {recordRef?: ...})`: 封装 FR-4 第 2~3 列点击 7 处相同逻辑
- **禁止**在同一组件中分散写 13 段 setEffectiveScopeUid；必须抽公共函数，保证行为一致性、后续维护性

### FR-5 统一面包屑（替代个人页右上角「返回主页 + ×」按钮）

**所有页面（首页 / 个人页 / 平台页）面包屑结构**（固定在顶部 H1 上方一行）：

| 页面 | Breadcrumb 层级结构（每级可点击，最后一级非链接） |
|---|---|
| 首页 | `🏠 矩阵数据总览`（仅 1 级，单字非链接） |
| 个人页 | `🏠 矩阵数据总览 → 👤 赵运营 · 个人绩效看板`（中间「→」非点击，首页可点，最后一级非点击） |
| 平台页 | `🏠 矩阵数据总览 → 📊 ● 抖音 · 平台汇总看板`（中间「→」非点击，首页可点，最后一级非点击） |

**交互细节**:
- 面包屑「矩阵数据总览」点击 = FR-3 Logo + 产品名点击等价行为（reset scope / reset platform / scroll top）。
- 个人页 & 平台页右上角原有的「返回主页 + ×」按钮**完全移除**，避免与面包屑语义冲突。
- 面包屑行高度 34px，间距 `gap-1.5`，文字 14px，hover 色 = 琥珀色 600，配合 underline。
- 面包屑始终与 H1 同 padding（左对齐）。

---

## 3. 非功能性需求

### NFR-1 排版与响应式
- 所有新增页（平台页）和改动页（首页 / 个人页）在 550px（phone mini）、768px（tablet）、1280px（xl desktop）三断点下，右间距 ≥ 10px、底部间距 ≥ 10px，不出现负溢出。
- 所有 KPI 网格最大断点 `xl:grid-cols-5`（5 列仅 ≥1280 才显示），避免 1024~1280 挤压（沿用 v3.3）。
- DataTable 类容器均保持 `min-w-[960px]` + 外层 `overflow-x-auto`。

### NFR-2 动画质量
- 页面切换（首页 ↔ 个人 ↔ 平台）：使用 Framer Motion AnimatePresence key 切换（`fade + y6 轻量`，duration 0.24s），避免整页闪烁。
- Toast 新旧替换：旧 Toast exit opacity 0 0.35s，新 Toast initial x+280 至 animate x=0 spring-240。

### NFR-3 工程化一致性
- 新增组件（PlatformView / ViralHistoryDrawer / BreadcrumbBar 三个函数组件）全部写在 App.jsx 内（减少跨文件跳转），禁止新增独立 .jsx 文件（遵循用户要求：优先编辑现有文件）。
- 仅当 App.jsx 单一文件超 3000 行时才允许拆分组件，但本次修改预估 2600~2800 行，无需拆分。
- PLATFORMS / OPERATORS / 颜色常量保持在 lib/mockData.js，不迁移。

### NFR-4 零依赖新增
- 不新增 npm package（react-router / clsx / classnames 等都不允许），全部用 Tailwind className + React Hooks + Framer Motion（现有依赖）。

---

## 4. 约束 / 依赖 / 假设

| 项 | 内容 |
|---|---|
| 依赖 D1 | 现有的 `setEffectiveScopeUid` / `setSelectedAccount` / `ViralPostToast` / `AccountDetailDrawer` / `MultiLineChart` / `PieChart` / `DataTable` 组件与逻辑必须保持可用（本期以重写为主，不拆文件）。 |
| 依赖 D2 | mockData.js PLATFORMS 15 个真实平台（v3.2 清理后）= 平台页 key 唯一来源，不新增 key。 |
| 约束 C1 | 不拆出 react-router：`effectiveScopeUid` 与 `effectivePlatform` 双 state 作为视图路由，同时互斥。 |
| 约束 C2 | 不新增独立 .jsx 组件文件：3 个新组件（PlatformView / ViralHistoryDrawer / BreadcrumbBar）放 App.jsx 内。 |
| 假设 A1 | 用户所有截图的浏览器宽度在 550 ~ 1920 区间，平台页 / 个人页 / 首页右间距不超过 v3.3 修复后的 ≤ 24px 要求。 |
| 假设 A2 | 历史爆款 Drawer 最多显示 20 条（超过 20 条时，最老的自动从列表头移除；防止内存占用过高）。 |

---

## 5. 开放问题 (Open Questions)

| 编号 | 问题 | 推荐默认值 |
|---|---|---|
| OQ-1 | 单条 Viral Toast 自动关闭时长 | 默认 45 秒（可调：`VIRAL_TOAST_AUTO_DISMISS_MS` 常量放 App.jsx 顶部） |
| OQ-2 | 历史爆款 Drawer 最多保留条数 | 20 条（超过最旧的自动出队） |
| OQ-3 | 平台页增长趋势图显示天数 | 近 30 天（与首页相同），保持视觉一致 |

> 如用户无异议，全部按推荐默认值实现。

---

## 6. 验收标准 (Acceptance Criteria)

### AC-Type：rule（客观可验证）

| ID | 条件 | 证据来源 |
|---|---|---|
| AC-R1 | 屏幕任意时刻单条 Toast（`fixed bottom-*` 或 `fixed top-*` 带 Viral Alert 标识）最多 1 条 | 集成 browser_evaluate 查 DOM `.toast-root` 类元素计数 ≤ 1 |
| AC-R2 | 触发新爆款时旧 Toast 在 0.5s 内消失并进入历史爆款列表 | history drawer 列表长度 +1，旧 toast id 在列表中存在 |
| AC-R3 | ViralPostToast 组件中无 `collapsed` state / prop / Chevron 折叠按钮 DOM | Grep + browser_evaluate `.toast-chevron-btn` 数量 = 0 |
| AC-R4 | 首页顶部 H1 右侧有 Chip「🔥 历史爆款 · N」可点击打开 Drawer | DOM 存在 `data-testid=viral-history-chip`，点击后 Drawer 显式 visible=true |
| AC-R5 | 进入平台看板：`effectivePlatform !== null && effectiveScopeUid == null`（互斥成立） | browser_evaluate 查 state（通过全局 window.__STATE_INSPECT__ 或 DOM Breadcrumb 中无「个人绩效」文字） |
| AC-R6 | 平台页 = 全屏页面（`fixed top-0 left-0 right-0 bottom-0` 类 Modal 的遮罩不存在） | browser_evaluate `modal-overlay` 元素数量 = 0，页面 Breadcrumb 存在「平台汇总看板」文字 |
| AC-R7 | 平台页至少包含 6 个 section（H1 / 4 KPI / 贡献占比 & Top 10 / 增长趋势 / 监测对象明细 / Top 20 作品列表） | browser_evaluate platform section header 计数 ≥ 6 |
| AC-R8 | Logo + 产品名外层为可点击按钮，点击回到首页（Breadcrumb 只有 1 级） | browser_navigate 个人页 → 点击 Logo 按钮 → Breadcrumb 变为「矩阵数据总览」单级 |
| AC-R9 | DataTable「归属运营」「上报人」列的每个运营者文字都被 `<button>` 包裹，点击 `stopPropagation` 并跳转到对应个人看板 | 点击赵运营行 → DOM Breadcrumb 变为「矩阵数据总览 → 👤 赵运营 · 个人绩效看板」 |
| AC-R10 | 所有 15 平台的 Tag Chip（含饼图 Legend + DataTable 平台列 + AccountDetailDrawer 平台 Chip）外层包裹 `<button>`，点击跳对应平台看板 | 点击抖音 Tag → Breadcrumb 变为「矩阵数据总览 → 📊 ● 抖音 · 平台汇总看板」 |
| AC-R11 | 个人页和平台页右上角不存在「返回主页」按钮和「×」关闭按钮（原两个按钮移除） | Grep DOM「返回主页」文案：出现次数 = 仅 Breadcrumb 级文字（非按钮） |
| AC-R12 | 所有 3 类页面均展示同结构 Breadcrumb（左对齐、H1 上方一行、高度 34px、间距 1.5） | 3 次切换视图后 Breadcrumb 外容器 className 稳定一致 |
| AC-R13 | `npm run build` 0 errors 0 warnings（警告也必须 0） | build 输出 modules 2600~2900 之间 0 error |
| AC-R14 | 550px 宽度视口下平台页 / 个人页 / 首页右间距 ≥ 10px（没有负溢出） | 3 视图切换后 evaluate 查 rect right ≤ window.innerWidth - 10 |
| AC-R15 | 平台页监测对象明细表的「归属运营」「上报人」列点击行为与首页 DataTable 一致（跳个人） | 验证 AC-R9 同样方式在平台页再执行一次通过 |

### AC-Type：rubric（可评估质量维度）

| ID | 维度 | 分数范围 | 通过阈值 | 证据来源 |
|---|---|---|---|---|
| AC-Q1 | 爆款视觉干净度（0-2）：2=无叠层、单条不遮挡下方内容；1=单条但位置稍挡 KPI；0=仍有多条叠层 | 0-2 | ≥ 2 | Snapshot 对比 + 人工评分 |
| AC-Q2 | 导航一致性（0-2）：2=面包屑+Logo 结构在 3 视图完全一致，返回路径无歧义；1=有一处不一致但仍可用；0=迷路风险高 | 0-2 | ≥ 2 | 3 视图截图比对 Breadcrumb DOM |
| AC-Q3 | 平台页内容完整度（0-2）：2=6 个 section 全部渲染成功、数据合理；1=少 1 个 section 但其余完整；0=缺失 ≥ 2 个 section | 0-2 | ≥ 2 | 6 section 渲染计数 + 视觉检查 |
| AC-Q4 | 响应式质量（0-2）：2=三断点 550 / 768 / 1280 全部无横向裁切；1=有 1 断点轻微溢出（≤ 5px）；0=严重截断 | 0-2 | ≥ 2 | 3 次 evaluate 查 rect 右间距 |
| AC-Q5 | 代码一致性（0-2）：2=所有运营者 / 平台跳转统一走 `navigateToOperator` / `navigateToPlatform` 两个公共函数；1=有 ≤ 3 处没走公共函数但行为一致；0=≥ 4 处分散的 setEffectiveScopeUid / Platform | 0-2 | ≥ 2 | Grep 两处公共函数调用 ≥ 13 次，独立直接调用 state ≤ 3 次 |

