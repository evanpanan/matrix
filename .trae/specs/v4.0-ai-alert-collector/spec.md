# Matrix Dashboard v4.0 — AI 诊断周报 / Webhook 外部告警 / 采集健康控制台 需求规格

## 问题背景与用户画像

### 问题（Problem）
当前 v3.4.2 仅提供「数据呈现 + 人工监测」闭环，缺少以下关键能力：
1. **主动诊断能力**：异常（账号阅读量异常/数据停更）淹没在 23 条记录里，运营无法一眼捕捉。
2. **汇报效率**：每周需人工总结爆款/平台/运营表现 → 耗时 30+ 分钟写周报。
3. **告警缺位**：采集器设备掉线/爆款诞生无 IM 即时触达。
4. **运维黑盒**：5 台运营电脑指纹浏览器运行状态不明，故障排查靠口头询问。

### 用户（Users）
- **管理员（张总）**：AI 诊断栏抓全局风险，AI周报一键分发；Webhook 推飞书；采集节点健康全景。
- **运营（李/王/赵）**：关注自己的异常修复告警；掉线被提醒运营检查设备。

### 目标（Goals）
用 **3 个新增高级模块**把「监测」升级为「监测 + 诊断 + 自动汇报 + 主动触达」。

### 非目标（Non-Goals）
- ❌ 不接入真实 LLM API（OPENAI 未配置，使用 mock 智能生成器，数据派生产生高质量周报内容；接口层 `generateWeeklyReport(data, scope)` 暴露，后续可无缝替换真实 LLM。
- ❌ 不真发真实 HTTP 请求（测试发送只做本地 Toast + 状态记录）。
- ❌ 不新增 npm 依赖（仅用 Tailwind + lucide-react + framer-motion + rechart 现有栈）。
- ❌ 不打破现有个人视角 scoped 隔离（AI 诊断 / AI 周报必须按当前 scope 生成）。

---

## 功能性需求（FR）

### FR1：AI 智能异常诊断栏
- **位置**：App.jsx 顶部 Header → BreadcrumbBar 与 StatCard 之间 Banner，一行整幅条，左 16px 圆角，左 AI Sparkle 图标带闪烁动画（每 1.8s 呼吸）。
- **内容结构**（一行横排，高度 ≥52px）：
  - 左：`Sparkles + AI 智能诊断` 标题
  - 中：**1~3 条异常摘要胶囊 (Chip)，每条可点击，点开对应 Tab 跳转到 DataTable 筛选区（category=all）。异常判定规则：
    1. **异常掉线类**：abnormal=true 的账号/社区 ≥ 2 条 → Chip 「🔴 2 个对象掉线，建议重登指纹浏览器」「⚡ 3 分钟未心跳「r/wallstreetbets 数据断更超 24h
    2. **下滑类**：曝光环比下降≥50%的账号（mock 2 个随机）→ Chip 「📉 《价值投资笔记》阅读量环比 -63%，建议调整内容节奏
  - 右：【生成 AI 周报】按钮（独立按钮，直接打开 AISummaryModal。
- **手机端（<640px）响应式**：诊断栏 改为 2 行布局，Chip 溢出横滑 + max-w-px
- **scoped 隔离**：个人视角只显示当前运营负责对象的异常，admin 显示全量。

### FR2：AI 一键生成周报 Drawer（AISummaryModal.jsx
- **样式**：沿用 PlatformDetailModal 手机全屏 + 桌面端 960px 居中 88vh。
- **Markdown 四大章节**：
  1. **本周矩阵增长亮点**：总粉丝 Δ% / 曝光 Δ% / 异常 Δ（对比上周：当前周对比 6%、异常数对比）。
  2. **各平台爆款总结**：每平台 Top1 爆款（取 views 最高 + engagement_rate 最高作品 → 标题 + 平台 + 曝光 + 互动率。
  3. **运营绩效 Top3**：按 bomb_rate 排序 1/2/3 名 → 姓名、作品数、爆款率徽章，个人视角时自己标高亮（黄）。
  4. **下周优化建议**：3 条 actionable 建议（从异常下滑类 + 平台机会类 + 爆款复制策略，每类 1 条，模板化 + 动态字段注入）。
- **操作区**：右上角 3 按钮：
  - 【🔄 重新生成】旋转动画 300ms 后换一批。
  - 【📋 一键复制】 navigator.clipboard，复制成功 Toast 2秒
  - 【📄 导出 PDF】调用 window.print() + CSS @media print 样式 → 另存为 PDF（A4）。
- **Mock 生成函数**：`ai/generateWeeklyReport(data, {scope, weekLabel})` 按数据返回纯文本 Markdown，可替换真实 LLM。

### FR3：采集设备/指纹浏览器健康控制台（CollectorHealthModal.jsx Tab1）
- **CollectorHealthModal 2 Tab Switch：【采集节点】Tab + 【告警配置 (Webhook)】Tab
- **采集节点 Tab**（5 卡片列表）：
  - 字段：设备名称（赵运营 - Mac Studio）、当前绑定的指纹浏览器数量（= assigned_operator_uid → count 映射）、网络状态 🟢/🔴、最后心跳（2 分钟前）。
  - 状态判断**：MACHINES 4/5 在线 + 1/5 随机掉线（赵运营游戏本）。
  - 掉线卡片有【🔔 一键提醒运营】按钮 → Toast 「已提醒 ××× 检查指纹浏览器」。
  - 卡片尺寸：桌面端 grid 3 列，手机 2 列（AccountDetailDrawer KPI 同样式）。

### FR4：Webhook 外部预警配置（CollectorHealthModal.jsx Tab2）
- **3 URL 输入框（每平台独立）**：
  - 飞书 Webhook（placeholder：https://open.feishu.cn/open-apis/bot/v2/hook/xxx）
  - 企业微信 Webhook（placeholder：https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx）
  - Telegram Bot（placeholder：https://api.telegram.org/botXXX/sendMessage）
- **触发条件 Checkbox Group 2 条**：
  - [x] 诞生爆款内容（互动量 > 5K）
  - [x] 账号掉线/异常超过 2 个
- **操作区**：
  - 【💾 保存配置】按钮 → localStorage 保存 `matrix_webhook_cfg`，Toast「配置保存成功」。
  - 【🧪 测试发送】按钮 → 模拟飞书/企微/Telegram JSON Payload → Toast「测试消息已发出，请到客户端确认」。

---

## 非功能性需求（NFR）

### NFR1：稳定性与约定（续 v3.4 既有约定）
- 沿用 Project Memory 硬约束：`loadDataLockRef（防竞态 + 防重复，sanitizeUrl（href 包裹），URL 真实协议，`timerRef（防泄漏）
- 所有 scoped 数据 不穿：AI 诊断 / 周报按 effectiveScopeUid 计算，跟 GrowthChart/TrafficPie 同 scopeDerivedCharts 一致。
- 所有新 Modal/Drawer 手机端全屏 / Drawer 92vw / Modal 全屏，同既有。

### NFR2：性能
- AISummaryModal 生成 纯文本（1000字以内 Markdown，首屏渲染 < 200ms（纯同步 mock 计算），@media print，
- A4 优化样式。

### NFR3：安全（延续 7 Issue 修复）
- Webhook URL 校验：仅 https:// 协议，sanitizeUrl 包裹测试发送 URL；localStorage 本地保存，不发请求。

---

## 约束/Assumptions
- 真实 LLM 接入，`generateWeeklyReport` 函数保持单入口。
- 指纹浏览器数量 = 当前运营负责对象 assigned count。
- 掉线 1/5 固定（赵运营 - 游戏本，真实分布。
- 周报时间窗口：「本周」= 近 7 天。

## 开放问题（Open Q1真实 Q1：AI 诊断栏异常 3 条 vs 只 2 条默认 → 默认显示 2~3 条（max 3，可扩展）。
Q2：PDF 导出用 window.print 轻量 vs jsPDF（✅window.print（轻量，后续可换）。

---

## 验收标准（Acceptance Criteria）

| ID | 类型 | 内容 | 验收方法 |
|---|---|---|---|
| AC1 | rule | AI 诊断栏位于 BreadcrumbBar 下方、StatCard 上方，带 Sparkle 呼吸灯，异常 ≥2 条。 | 肉眼 snapshot + class 含 "animate-pulse`。|
| AC2 | rule | 点击【生成 AI 周报 → 开 AISummaryModal，内 4 章节齐全。 | 开 Drawer 内 h3 数量=4 个章节。 |
| AC3 | rule | 【一键复制】调用 navigator.clipboard，并弹 Toast 「复制成功」。 | evaluate clipboardData 非空。 |
| AC4 | rule | 【导出 PDF】触发 window.print（无报错）。 | evaluate window.print = fn called（mock）。 |
| AC5 | rule | CollectorHealthModal【采集节点】Tab 显示 5 卡片，4 在线 1 掉线，掉线卡片显示【提醒运营】按钮。 | count 5 = 4 on + 1 off。 |
| AC6 | rule | 【提醒运营】弹 Toast「已提醒 xxx 检查指纹浏览器」，不影响其他节点状态。 | Toast 文案。 |
| AC7 | rule | Webhook Tab 3 URL + 2 Checkbox + Save localStorage 保存 `matrix_webhook_cfg`。 | evaluate localStorage 键非空 JSON。 |
| AC8 | rule | 【测试发送】Toast「测试消息已发出」。 | Toast 文案。 |
| AC9 | rule | 个人视角 AI 诊断栏仅显示当前运营的异常（admin=2条 vs 赵运营=1 条）。 | 切换视角后 Chip count 对。 |
| AC10 | rule | npm run build 0 errors 0 warnings（chunk warning 允许。 | 构建命令 exit 0。 |
| AC11 | rubric | 手机端响应式（375px）：诊断栏 2 行布局、AISummaryModal 全屏、Collector 卡片 2 列，无水平溢出。 | 375 evaluate 溢出。 |
| AC12 | rubric | 视觉质感（0-2）：与 v3.4 风格一致性（渐变色、圆角 2xl、徽章层级、动效时长 0.3-0.45s）0 = 风格跳脱；1 = 基本一致；2 = 无缝融合。 | snapshot 评审 ≥ 1.5 / 2。 |
