# v3.4 体验优化升级 · 任务分解与实施计划

> 匹配 spec.md 版本: v3.4
> 核心文件: [App.jsx](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/App.jsx)（大部分改动）、[ViralPostToast.jsx](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/ViralPostToast.jsx)（简化：去折叠 + 2 按钮）、[PlatformDetailModal.jsx](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/PlatformDetailModal.jsx)（弃用 Modal，代码搬到 App.jsx 的 PlatformView 组件）
> 依赖文件: [lib/mockData.js](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/lib/mockData.js)（PLATFORMS 15 平台常量源）、[AccountDetailDrawer.jsx](file:///Users/panhaixiang/Desktop/技术/matrix/dashboard/src/AccountDetailDrawer.jsx)（归属 / 平台 改为 锚点）

---

## 总览映射表

| Spec AC | 功能模块 | 对应 Task |
|---|---|---|
| AC-R1 ~ AC-R4 | 爆款 Toast 简化 + 历史爆款 Drawer | Task 1, Task 2 |
| AC-R5 ~ AC-R7, AC-Q3 | 平台看板独立全屏页 | Task 3 |
| AC-R8, AC-R11, AC-R12, AC-Q2 | 统一面包屑 + Logo 回首页 | Task 4 |
| AC-R9, AC-R10, AC-R15, AC-Q5 | 运营者 / 平台 下钻跳转（13 处锚点） | Task 5 |
| AC-R13, AC-R14, AC-Q1, AC-Q4 | Build 通过 + 3 视图 × 3 断点 响应式 + 无溢出 | Task 6 |

---

## Task 1: ViralPostToast 简化（去折叠、仅 2 按钮、移除整卡跳转）

| 项 | 值 |
|---|---|
| **对应 Spec AC** | AC-R1, AC-R2, AC-R3 |
| **优先级** | High |
| **修改文件** | ViralPostToast.jsx |
| **依赖任务** | 无 |

### 任务描述
1. 删除 collapsed / onCollapse 相关 prop 和 state；只接受 `post / onDismiss / onOpenPost` 三个必要 props。
2. 根 motion.div 无 onClick，cursor: default；展开态（现在只有这一种） pr-3，不再用 pr-24 / pr-20。
3. 控制按钮组只保留 2 个：
   - ① 外链跳转按钮（琥珀色边框 hover + ↗ ExternalLink 图标 + title "跳转原帖"，z-20 + stopPropagation）
   - ② 关闭通知按钮（× 图标 + title "关闭通知"，z-20 + stopPropagation）
4. 封面按钮（hasValidUrl 时）独立 `<button>` 包裹；标题独立 `<button>` 包裹；两个 click 都走 onOpenPost + stopPropagation。
5. 保留 Framer Motion slide-in + exit 动画，width 固定 380px（v3.3 稳定）。

### 测试要求（Task-Test Requirement）

| TR 类型 | TR 内容 | 证据方式 |
|---|---|---|
| rule | ViralPostToast 组件无 collapsed prop/state；Chevron 相关 SVG（ChevronUp/ChevronDown）在文件中 count=0 | Grep 全文件 0 命中 |
| rule | 每条 Toast DOM 中控制按钮数 = 2（外链 + 关闭）；无折叠 Chevron 按钮 | browser_evaluate `.toast-control-btn` count == 2 |
| rule | 关闭按钮点击不触发 onOpenPost（onClose 被 stopPropagation 拦截，onOpenPost 不被调用） | 单元 mock 调用计数 / browser_evaluate 模拟 click 并在父级监听 confirm 无冒泡 |

---

## Task 2: App.jsx 爆款机制升级（单条常驻 + 历史爆款 Drawer）

| 项 | 值 |
|---|---|
| **对应 Spec AC** | AC-R1, AC-R2, AC-R4, AC-Q1 |
| **优先级** | High |
| **修改文件** | App.jsx |
| **依赖任务** | Task 1 |

### 任务描述
1. **新增 state & 常量**：
   - 常量 `VIRAL_TOAST_AUTO_DISMISS_MS = 45000`（45s）
   - 常量 `VIRAL_HISTORY_MAX = 20`（历史爆款上限 20）
   - `activeViralAlert: ViralPost | null`（当前唯一一条单条 Toast，值为 null 或 最新 Viral 实例）
   - `viralHistory: ViralPost[]`（历史爆款数组，倒序排列，长度 ≤ 20）
   - `showViralHistory: boolean`（控制 Drawer 展开）
2. **爆款仿真生成逻辑改写**：每次生成新的 viralAlert（15~30s useEffect）时：
   - 若当前有 `activeViralAlert` → 自动将其 unshift 进 `viralHistory` 头部并截断到 20 条
   - 将新 viral alert 赋给 `activeViralAlert`
   - 设置 45s 自动关闭的 setTimeout（dismiss old & push history），cleanup 时清 timeout
3. **关闭行为统一**：
   - 用户主动点 × 关闭 activeViralAlert → push history + 清 active
   - 45s 自动关闭 → push history + 清 active
   - 新 alert 替换时 → push old history + active = new
4. **H1 右侧 Chip 入口**（首页 / 个人页 / 平台页 三张 H1 区，H1 flex justify-between 的右侧）：
   - 显示 `🔥 历史爆款 · {length}` chip；琥珀色 outline；onClick 切换 showViralHistory
5. **新增 ViralHistoryDrawer 组件（App.jsx 内嵌）**：
   - 定位 fixed top-24 right-4 sm:right-6 w-full sm:w-[460px] max-h-[72vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-black/[0.05] z-[55]
   - 顶部 header "Viral 历史爆款记录" + × 关闭按钮
   - 列表卡片：20 条，每条：
     - 左：Flame 图标 琥珀色背景
     - 中：标题 + 账号名 + 归属运营者（点击跳个人）+ 平台 tag（点击跳平台） + 曝光 + 点赞 + 互动率
     - 右：外链 ↗ 按钮 + × 按钮（× 从历史中移除）
   - 空态 "暂无爆款记录"
6. **挂载 Toast**：原 App.jsx L1982 挂载 ViralPostToast 处，改成只渲染 `activeViralAlert != null` 时一张，key 用 alert.id。

### Task-Test Requirements

| TR 类型 | TR 内容 | 证据方式 |
|---|---|---|
| rule | 连续触发 2 条新 alert，DOM fixed Toast 数量永远 ≤ 1 | 集成浏览器脚本 2× dispatchViral() 后 countFixedToast() ≤ 1 |
| rule | 历史爆款列表 viralHistory.length ≥ 1（至少触发过一次 alert 后），按时间倒序；超过 20 条则头部最旧自动被移除 | browser_evaluate 查 window.__viralHistory.length 最大 20 |
| rule | H1 右侧 chip `data-testid=viral-history-chip` 存在，点击后 Drawer 容器 display = block / visible | browser_evaluate click + visibility 查询 |
| rule | 45s 到点 activeViralAlert 自动置 null，历史列表 +1（或用 mock 快速定时器验证） | 单元测试 mock setTimeout |
| rubric | AC-Q1 爆款视觉干净度 ≥ 2 分 | Snapshot 人工评分 |

---

## Task 3: 平台看板 PlatformView 独立页面（替换 PlatformDetailModal）

| 项 | 值 |
|---|---|
| **对应 Spec AC** | AC-R5, AC-R6, AC-R7, AC-R14, AC-Q3, AC-Q4 |
| **优先级** | High |
| **修改文件** | App.jsx（主要新增 PlatformView 内嵌组件）、PlatformDetailModal.jsx（废弃，但保留文件不动，不再被渲染） |
| **依赖任务** | Task 4, Task 5（导航跳转要同时实现，才能从首页进入平台页） |

### 任务描述
1. **新增路由 state & 公共工具**：
   - `effectivePlatform: string | null`（值 ∈ PLATFORMS.map(p => p.key)）
   - **互斥逻辑**：写公共函数 `setEffectivePlatformState(newVal)`，如果 newVal != null，则清 `effectiveScopeUid = null`（保证 scopeUid/platform 互斥）。
   - **同样**：改写 `setEffectiveScopeUidState(newVal)`，非 null 时清 effectivePlatform = null。
2. **视图切换结构重构（App.jsx JSX 结构）**：
   ```
   return (
     <div>
       <Header />
       {!effectiveScopeUid && !effectivePlatform && <GlobalHomeView />} // 原首页
       {effectiveScopeUid && <OperatorOverview scopeUid />}             // 原个人页
       {effectivePlatform && <PlatformView platformKey />}              // 新增平台页
     </div>
   )
   ```
   - 三级视图互斥渲染，AnimatePresence key 切页 fade+slide 动画。
3. **PlatformView 组件 6 个 section（App.jsx 内新建函数组件）**：
   - **Section 1：H1 标题区**（BreadcrumbBar 组件下一行）
     - 平台色大圆点 w-12 h-12 + 平台名 H1（例如 "● 抖音"） + 平台中文语义别名（如「短视频平台」，从 PLATFORMS 数据中读）
     - 右 Chips：「监测对象 N 个 · 近 7 天作品 M 条 · 爆款 K 条」
   - **Section 2：4 KPI（沿用 v3.3 PlatformDetailModal 的 4 张 StatCardMini）**
     - 响应式类 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5`
   - **Section 3：双栏 Top 区**
     - 左：贡献占比条形图（原 Modal L200-265，升级为 Top 10）
     - 右：Top 10 爆款作品（原 Top 5，复制 2×5 结构，或循环 10 次；每条卡点击运营者跳个人，点击平台 Tag 跳平台，点击封面/标题跳原帖）
     - 响应式：`grid-cols-1 lg:grid-cols-2`（1024+ 才双栏）
   - **Section 4：平台级增长趋势图（双轴折线）**
     - 直接复用 App.jsx 的 MultiLineChart 组件（首页同屏使用的）
     - 数据筛选：仅当前平台的 records（抽 `getPlatformRecords(platformKey)` 公共函数）
   - **Section 5：平台监测对象明细表**（DataTable 结构与首页完全一致）
     - 数据 filteredRecords = 所有 records 过滤 platform == effectivePlatform
     - 归属运营 / 上报人 列 → 应用 Task 5 锚点函数
     - 平台列固定 effectivePlatform（不可点）
     - 对象行点击 → 打开 AccountDetailDrawer（与首页一致）
   - **Section 6：Top 20 作品列表（近 7 天）**
     - 20 张横向卡片网格（grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5）
     - 结构：封面 80×80 + 标题 2 行 + 运营者 Tag（跳个人） + 平台 Tag（跳平台） + 曝光/点赞/互动率 3 指标 + 外链按钮
4. **PlatformDetailModal.jsx 处理**：App.jsx 不再 import & 渲染此组件；文件保留但废弃（防止将来回退），Grep 全项目确保 `PlatformDetailModal` className 不再被引用。
5. **原 DataTable 中「平台 Tag 点击 Modal」改为跳转全屏页面**：App.jsx 原来的 `setSelectedPlatform(platform)` 调用处 → 改为走 `navigateToPlatform(platformKey)`（Task 5 抽的公共函数）。

### Task-Test Requirements

| TR 类型 | TR 内容 | 证据方式 |
|---|---|---|
| rule | effectivePlatform != null 时 effectiveScopeUid 必 == null（互斥） | browser_evaluate 模拟连续 set 2 个 state 都非空，最后一个生效清另一个 |
| rule | PlatformDetailModal 组件在 App.jsx import 链被移除（保留文件，但无 JSX 元素 `<PlatformDetailModal`） | Grep App.jsx 字符串 `<PlatformDetailModal` count = 0 |
| rule | PlatformView 页面内 DOM 查询 section 标题计数 ≥ 6 | evaluate 取 `'4 KPI / 贡献占比 / Top 10 / 增长趋势 / 监测对象明细 / Top 20 作品'` 标题文本去重计数 ≥ 6 |
| rule | 平台页监测对象明细表「归属运营」「上报人」列点击进入对应个人看板（面包屑正确） | 浏览器 click 行为 + DOM 面包屑验证 |
| rule | 550 / 768 / 1280 三宽度平台页右间距 ≥ 10px（viewport w - modal/container right ≥ 10） | 3 次 evaluate rect.right 检查 |
| rubric | AC-Q3 平台页内容完整度 ≥ 2 分 | 6 section 视觉存在性 |
| rubric | AC-Q4 响应式质量（平台页部分）≥ 2 分 | 3 宽度 无溢出 |

---

## Task 4: 顶部 Header 导航 + 统一面包屑 + 移除个人页右上角「返回主页 / ×」双按钮

| 项 | 值 |
|---|---|
| **对应 Spec AC** | AC-R8, AC-R11, AC-R12, AC-Q2 |
| **优先级** | High |
| **修改文件** | App.jsx |
| **依赖任务** | Task 3（平台页和个人页都要能正确返回） |

### 任务描述
1. **顶部 Header Logo + 产品名可点击返回（原 App.jsx L1650-1670 顶部区域）**：
   - 用 `<button type=button className="flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-amber-50 active:bg-amber-100 transition-colors" style={{cursor:'pointer'}} onClick=goHome>` 包裹整组（Logo + Matrix + v3.0）
   - goHome = 封装 Task 5 的 navigateToHome（清 scopeUid、清 platform、关 accountDrawer、关 viralHistoryDrawer、scrollToTop(0,0)）
2. **新增内嵌组件 BreadcrumbBar（App.jsx 内）**：
   - 接受 props：scopeUid / platformKey（可选）
   - 统一结构（spec.md §FR-5 的面包屑）：
     - 首页（都空）：🏠 矩阵数据总览（非链接样式）
     - 个人（scopeUid）：🏠 矩阵数据总览（可点击 goHome） + ` · ` + 👤 {operatorName} · 个人绩效看板（不可点击）
     - 平台（platformKey）：🏠 矩阵数据总览（可点击 goHome） + ` · ` + 📊 {platformColorDot}{platformName} · 平台汇总看板（不可点击）
   - className 统一 34px 行高，gap-1.5，文字 14px
3. **三张视图（Home / Operator / Platform）各自 JSX 顶部插入 BreadcrumbBar**：紧接 top Header 下方，H1 上一行。
4. **删除 OperatorOverview（个人页）右上角双按钮**：App.jsx 原来的「← 返回主页」和「× 关闭」按钮，两处 className 含 `返回主页` / `关闭` 的 DOM 全部删除，仅保留 BreadcrumbBar。

### Task-Test Requirements

| TR 类型 | TR 内容 | 证据方式 |
|---|---|---|
| rule | Header Logo + 产品名 外层是 button，className 含 `items-center gap-2.5` | Grep App.jsx button string 正则 ✓ |
| rule | 在个人页点击 Logo → DOM Breadcrumb 只剩「矩阵数据总览」单级（goHome 生效） | 集成浏览器行为 + DOM 查询 |
| rule | 个人页 / 平台页 DOM 中没有 className 含「返回主页」的按钮（仅 Breadcrumb 级非按钮文本） | evaluate 查 buttons 文本 = '返回主页' count = 0 |
| rule | 三视图切换 BreadcrumbBar className 容器一致（行高 34px、gap-1.5） | evaluate 比对 className 子串 |
| rubric | AC-Q2 导航一致性 ≥ 2 分 | 3 视图 Snapshot 对比 |

---

## Task 5: 13 处下钻锚点统一（navigateToOperator / navigateToPlatform / navigateToHome）

| 项 | 值 |
|---|---|
| **对应 Spec AC** | AC-R9, AC-R10, AC-R15, AC-Q5 |
| **优先级** | High |
| **修改文件** | App.jsx（大部分）、AccountDetailDrawer.jsx（归属 / 平台 chip 改可点） |
| **依赖任务** | Task 3, Task 4（state 互斥逻辑先到位） |

### 任务描述
1. **在 App.jsx 顶部抽 3 个公共函数**（保证 13 处跳转全部统一）：
   ```js
   function navigateToHome() {
     setEffectiveScopeUid(null);
     setEffectivePlatform(null);
     setSelectedAccount(null); // AccountDetailDrawer 关闭
     setShowViralHistory(false);
     window.scrollTo({ top: 0, behavior: 'smooth' });
   }

   function navigateToOperator(uid, { silent = false } = {}) {
     // 互斥：清空 platform
     setEffectivePlatform(null);
     setEffectiveScopeUid(uid);
     setSelectedAccount(null);
     setShowViralHistory(false);
     if (!silent) window.scrollTo({ top: 0, behavior: 'smooth' });
   }

   function navigateToPlatform(platformKey, { silent = false } = {}) {
     // 互斥：清空 scopeUid
     setEffectiveScopeUid(null);
     setEffectivePlatform(platformKey);
     setSelectedAccount(null);
     setShowViralHistory(false);
     if (!silent) window.scrollTo({ top: 0, behavior: 'smooth' });
   }
   ```
2. **App.jsx 内部下钻锚点改写（共 11 处）**：
   - (A) DataTable「归属运营」列 7 列 × 3 个页面 = 3 处 × 多列循环 → 2
   - (B) DataTable「上报人」列 → 2（3 张表）
   - (C) 首页 / 个人页 / 平台页 三张表的「平台列 Tag Chip」→ 3（3 张表循环）
   - (D) 平台饼图 Legend 15 平台（PieChart 传 onClick 给 legendItem）→ 1
   - (E) 活跃 ViralAlert Toast 内「归属运营」+「平台 Chip」→ 2（单条 Toast 渲染）
   - (F) 历史爆款 Drawer 每条记录「归属运营」+「平台 Chip」→ 2（列表循环）
   - (G) OperatorOverview 个人页 H1 区的圆形 Avatar（赵运营头像） → 1（但其实是同一个人，点击 scrollTop 即可，走 navigateToOperator 会自动清 platform，本身 scopeUid=赵运营，重设不影响）
   - (H) AccountDetailDrawer（单独文件，Task 5 第 2 步）
   合计：≥ 11 处 App.jsx 内 + 2 处 AccountDetailDrawer = 13 处
3. **AccountDetailDrawer.jsx 下钻锚点改写（2 处）**：
   - (H1) 归属·王运营 → `<button>` 包裹 + onClick(navigateToOperator) + stopPropagation
   - (H2) 平台 Tag Chip → `<button>` 包裹 + onClick(navigateToPlatform) + stopPropagation
   - 注意：AccountDetailDrawer 是独立文件，navigateToOperator / navigateToPlatform 必须作为 props 从 App.jsx 传入（避免循环依赖）。
4. **平台筛选 Chip / Top 栏平台 Chip 等其他出现平台名的位置**：统一改 `<button>` 点击走 navigateToPlatform。
5. **全部禁止 onClick 冒泡**：所有锚点点击 `event.stopPropagation()`，尤其是 DataTable 行有 `setSelectedAccount` 的行级 click，必须 stopPropagation 避免打开 Drawer。

### Task-Test Requirements

| TR 类型 | TR 内容 | 证据方式 |
|---|---|---|
| rule | navigateToOperator / navigateToPlatform / navigateToHome 三个函数在 App.jsx 中存在，且定义在 state setters 之后 | Grep 函数定义 count = 3 |
| rule | 13 处跳转全部通过这三个函数（Grep call 次数 ≥ 13），直接调用 setEffectiveScopeUid / setEffectivePlatform 的独立次数 ≤ 3 处 | Grep 调用次数统计 + 独立 state setter 调用次数计数 |
| rule | DataTable 归属运营列点赵运营 → 面包屑变成「矩阵数据总览 → 👤 赵运营 · 个人绩效看板」（AC-R9） | 浏览器行为 + DOM 验证 |
| rule | DataTable 平台列点 Stocktwits → 面包屑变成「矩阵数据总览 → 📊 ● Stocktwits · 平台汇总看板」（AC-R10） | 浏览器行为 + DOM 验证 |
| rule | 平台明细表「归属运营」列点击行为与首页一致（AC-R15） | 同 AC-R9 验证脚本在平台页再跑 1 次 |
| rule | 所有点击 stopPropagation 生效：DataTable 点运营者不打开 AccountDetailDrawer（行 click 被拦截） | 浏览器点击 selectedAccount null 检查（非目标 account 行的点人后 drawer 不打开 / 打开的是其他 account 视为拦截失败） |
| rubric | AC-Q5 代码一致性 ≥ 2 分（调用公共函数 ≥ 13 处，独立 set ≤ 3） | Grep 计数结果 |

---

## Task 6: Build 通过 + 全场景端到端验证

| 项 | 值 |
|---|---|
| **对应 Spec AC** | AC-R13, AC-R14, AC-Q4 |
| **优先级** | High |
| **修改文件** | 不修改代码（验证阶段） |
| **依赖任务** | Task 1~5 全部 completed |

### 任务描述
1. 运行 `npm run build`（dashboard 根目录）
2. 启动 dev server `npm run dev`
3. 集成浏览器三断点 × 三视图 9 场景：
   - 视图：Home / Operator(赵运营) / Platform(抖音)
   - 宽度：550 / 768 / 1280
   - 每个场景：(a) 右间距 ≥ 10px，(b) Breadcrumb 正确，(c) 无 Modal 遮罩（平台页不是弹窗），(d) 单条 Toast ≤ 1，(e) 历史爆款 Drawer 可展开
4. 完整导航链跑 3 轮：
   - (i) 首页 → 点归属运营（赵运营）→ 个人页 → 点 Logo 返回首页
   - (ii) 首页 → 点平台列「抖音」→ 平台页 → 点平台页「归属运营（王运营）」→ 个人页 → 点 Breadcrumb 首页返回
   - (iii) 首页 → 饼图 Legend 点 Stocktwits → 平台页 → Logo 返回
5. 每轮后 DOM 断言：Breadcrumb 正确、activeViralToast ≤ 1、无负溢出

### Task-Test Requirements（所有 Spec AC 的最终入口）

| TR 类型 | TR 内容 | 证据方式 |
|---|---|---|
| rule | build: `2600~2900 modules, 0 errors 0 warnings`（AC-R13） | Build 输出全文 |
| rule | 9 场景（3 view × 3 width）右间距 ≥ 10px（AC-R14） | 9 次 evaluate rect.right 记录数组 |
| rule | 3 条导航链（i / ii / iii）全部最终 Breadcrumb 正确 | 3 轮 DOM Breadcrumb 文本匹配 |
| rule | 任意时刻 active Toast DOM count ≤ 1（AC-R1 回归验证） | 每轮后 evaluate count |
| rubric | AC-Q4 全局响应式质量 = min(3视图×3宽度右间距评分) ≥ 2 | 9 场景综合评分 |

---

## 实施顺序（依赖约束）

```
 ┌─── Task 1 (Viral 简化组件)
 │
 ▼
 ┌─── Task 2 (爆款机制 + 历史 Drawer, 依赖 Task 1)
 │
 ├─── Task 4 (Header + Breadcrumb, 独立, 与 Task 3 可并行)
 │
 ▼
 ┌─── Task 3 (PlatformView 独立页面, 依赖 Task 4 state)
 │
 ▼
 ┌─── Task 5 (13 处锚点统一，依赖 Task 3 公共函数)
 │
 ▼
 ┌─── Task 6 (Build + E2E 9 场景 3 导航链全验)
```

**预计总任务数：6 个（5 个实现类 + 1 个验证类）**
