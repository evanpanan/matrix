# v4.0 AI 诊断 / Webhook 告警 / 采集健康控制台 — 任务清单

> 覆盖范围：`dashboard/src/App.jsx`（增量接入）+ 新增 2 组件 `AISummaryModal.jsx` / `CollectorHealthModal.jsx` + `lib/mockData.js` / `lib/api.js`（扩展派生函数）
> 成功标准：每个任务的 Local Test Requirement (TR) 全部 self-verified；最后 Review Gate 独立验收。
> 原子粒度：按文件边界切垂直切片，互不阻塞。

---

## Task 1：mockData.js 派生 collectorMachines + aiDiagnosis + 周报函数
**Status**: pending
**Priority**: high
**AC 映射**: AC1/AC5/AC9
**实现说明**：
- 在 `generateSummary` 输出对象中新增 `collectorMachines: Machine[]`
  - Machine 结构：`{ machine_id, machine_name, operator_name(从 machine_name 提取 "李运营"/"王运营"/"赵运营"), fingerprint_browser_count(= 该 operator_uid 负责对象数 = 运营负责 accounts + communities ), status(online/offline), last_heartbeat_iso(随机) }`
  - 固定离线 1 台：赵运营 - 游戏本（MAC-OP3-002 保持一致
  - 心跳时间差：在线 1~15 分钟，离线 > 4 小时
- 新增 `aiDiagnosis: DiagnosisItem[]`（3 条，admin 全量，个人 scope 过滤）：
  - 类型：`abnormal_drop / stalled_data / reading_drop` 三类
  - 字段：`{ id, type, icon, title, desc, targetIds(关联 record.id[])`
- 新增纯函数导出 `export function generateWeeklyReportMarkdown(data, opts: { scopeUid?, weekLabel?, operatorName? })`：
  - 输出字符串，4 大章节（亮点 / 爆款 Top / 运营 Top3 / 下周建议）
  - 亮点：计算 total_fans Δ（6.6%） + 曝光（+ 8.5%）+ 异常（-2 → 本周异常 vs 上周假设）
  - 爆款：每个平台取 Top1 views 最高作品标题
  - 运营：`operatorStats.bomb_rate desc` 排序 Top3
  - 建议：取诊断 top3 问题各 1 条 actionable
**文件改动**：`dashboard/src/lib/mockData.js`

---

## Task 2：新增 AISummaryModal.jsx（AI 周报预览与导出）
**Status**: pending
**Priority**: high
**AC 映射**: AC2/AC3/AC4/AC11/AC12
**依赖**: Task 1 的 `generateWeeklyReportMarkdown`
**Props 接口**：
```
AISummaryModalProps = {
  open: boolean,
  onClose: () => void,
  data: SummaryData | null,       // 当前 data 全局
  scopeUid?: string | null,       // effectiveScopeUid（个人视角）
  operatorName?: string | null,   // 当前运营姓名（用于标题）
  generateFn: (data, opts) => string, // Task1 导出函数，依赖注入
  onToast?: (msg: string, tone?: 'ok'|'warn') => void
}
```
**实现说明**：
- **样式**：沿用 `PlatformDetailModal.jsx` 的全屏 + 居中模板：
  - `max-sm:inset-0 translate 0 0 w-full h-full rounded-none`
  - 桌面 `min(96vw, 60rem) max-h-[88vh] rounded-3xl`
  - 关闭按钮 44px h11 w11（手机）
- **Header**：左侧「🤖 AI 智能周报 · {weekLabel=近 7 天 / 个人视角：XX 运营」+ 3 个右侧操作按钮：
  - 🔄 重新生成（onClick regenerate → toast「重新生成中 → 延迟 400ms 调用 generateFn 换随机种子）
  - 📋 一键复制（navigator.clipboard.writeText(md) → success toast）
  - 📄 导出 PDF（window.print()；内联 style tag @media print：隐藏除 md 之外所有元素 + padding 2cm）
- **内容区**：使用 `<pre class="whitespace-pre-wrap font-sans text-[14px] leading-7">` 渲染 Markdown 纯文本（四章节标题用 `h-4 font-bold + text-xl 粗体 每章 24px 顶部空间，章节分隔粗线 border-b 2px）：
  - `# 本周矩阵增长亮点 / 各平台爆款 / 运营绩效 Top3 / 下周建议
- **手机端响应式**：`grid-cols-1` / `px-4` / `max-w-full`。
**文件改动**：新增 `dashboard/src/AISummaryModal.jsx`

---

## Task 3：新增 CollectorHealthModal.jsx（采集健康 + Webhook 配置）
**Status**: pending
**Priority**: high
**AC 映射**: AC5/AC6/AC7/AC8
**Props**: `{ open, onClose, collectorMachines, onToast? }`
**实现说明**：
- **Modal 容器同 Task2**（PlatformDetailModal 样式）。
- **Tab 切换（左对齐 Tab 2 项）**：
  - Tab1【🖥 采集节点（默认）：
    - 5 张卡片 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4
    - 单卡结构：rounded-2xl border bg-white shadow-card + p-4 + 状态灯🟢🔴 + 设备名 + 绑定浏览器数（= 负责对象）+ 心跳 + 在线按钮
    - 离线卡片【🔔 一键提醒运营】按钮：h-10 px-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 → toast 「已提醒 {运营姓名} 检查指纹浏览器状态
- **Tab2【🔔 Webhook 告警配置】**：
  - 3 URL 输入（飞书 / 企微 / Telegram 每输入框 label + placeholder + value state）
  - 2 Checkbox（互动>5000/异常≥2）默认全勾。
  - 【💾 保存】：localStorage.setItem('matrix_webhook_cfg', JSON.stringify({urls,triggers})) + toast 「配置保存成功」
  - 【🧪 测试发送】：toast「测试消息已发出（飞书/企微/Telegram），请到客户端确认 → 防重复 1s 防抖。
  - 初始化读取 localStorage 回填（若存在）。
  - URL 输入框内联校验 sanitizeUrl。
**文件改动**：新增 `dashboard/src/CollectorHealthModal.jsx`

---

## Task 4：App.jsx 接入 v4.0 三大功能入口
**Status**: pending
**Priority**: high
**AC 映射**: AC1/AC9/AC10/AC11/AC12
**改动点**（按文件顺序）：
1. **顶部 imports**（L13-L25 附近）：
   - 新增 icon：`Sparkles, Printer, Copy, RefreshCcw, Cpu, AlertOctagon, BellRing`
   - 新增 component：`import AISummaryModal from './AISummaryModal.jsx'; import CollectorHealthModal from './CollectorHealthModal.jsx';`
   - 新增 import：`generateWeeklyReportMarkdown` from `./lib/mockData.js`
2. **新增 state 组**（约 L1523 附近 setData 之后）：
   - `showAISummaryModal`, `showCollectorModal` 两个 `useState(false)`
   - 导入 `generateWeeklyReportMarkdown` from mockData
3. **Header 右上角按钮**（L2400-2428，爆款按钮旁）新增 2 个按钮：
   - 【📋 AI 周报】：max-sm:h-11 w-11，onClick open AISummary
   - 【🖥 节点】：max-sm:h-11 w-11，onClick open CollectorHealth
4. **AI 诊断栏 Banner**（位置：L2431 BreadcrumbBar 之后、StatCard 之前）：
   - Wrapper: `rounded-2xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50 to-violet-50/80 shadow-sm h-14 sm:h-14 px-4 sm:px-5 flex items-center justify-between gap-3 mb-3 sm:mb-4`
   - 左：Sparkles icon + animate-pulse h-5 w-5 +「AI 智能诊断」（font-semibold 14px）
   - 中：Chip 容器 flex items-center gap-2 overflow-x-auto 横滑（手机）每 Chip rounded-full border px-3 py-1.5
   - 右：【生成周报】按钮（与顶部按钮同义，打开同一 Modal
5. **Scoped AI 诊断派生**：useMemo 过滤 aiDiagnosis 按 effectiveScopeUid 与当前 scope 的 records.id 交集对齐 → 展示 Chip 时点击 → 滚动 DataTable `setCategory('all')`；
6. **Modal/Drawer 渲染**（底部 AnimatePresence 外，与 ViralToast 同层）：
   - `<AISummaryModal open={showAISummaryModal} onClose={()=>setShowAISummaryModal(false)} ... />`
   - `<CollectorHealthModal open={showCollectorModal} onClose={()=>setShowCollectorModal(false)} ... />`
**文件改动**：`dashboard/src/App.jsx`（纯增量插入，不删原稳定结构）

---

## Task 5：构建 + 3D 全景验证
**Status**: pending
**Priority**: high
**AC 映射**: AC1~AC12 全量
**验证步骤**：
1. `npm run build` → exit 0，0 errors（AC10）
2. Dev server 打开 admin 视图：
   - AI 诊断栏存在 + 至少 2 Chip + Sparkles animate（AC1）
   - 点击 【AI 周报】→ Modal 开 → 四大章节齐全（AC2）
   - 点击 复制 → clipboard data ok（AC3）
   - 点击 导出 PDF → window.print 被调用（mock 不报错，AC4）
3. 【节点健康】→ 5 卡片，1 离线，点提醒 → toast（AC5/6）
4. Webhook → 输入 URL + Save → localStorage ok；测试 send → toast（AC7/8）
5. 切到赵运营个人视图 → AI 诊断栏 Chip 数 = 1/2（小于 admin 视角，AC9）
6. 375px 手机视图 → 诊断栏 2 行横滑 + 2 Modal 全屏 + Collector 2 列卡片无溢出（AC11）
7. Snapshot 视觉质感评分 ≥ 1.5/2（与 v3.4 统一圆角 2xl/渐变色/framer 动效）

---

## 依赖图
```
Task 1 ─┬─→ Task 2 (generateWeeklyReport)
        ├─→ Task 3 (collectorMachines)
        └─→ Task 4 (aiDiagnosis + collectorMachines + generateFn)
Task 2 ─→ Task 5
Task 3 ─→ Task 5
Task 4 ─→ Task 5
```
并行策略：Task 2 / Task 3 可并行；Task 4 依赖 Task 1；Task 5 收束（串行）。
