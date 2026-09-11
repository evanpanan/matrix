# 手机版 Mobile UX 全面适配优化 Implementation Plan

## Repository Research
375px iPhone SE 尺寸模拟调研结论（CSS 强制 body max-width=375px + overflow 扫描 + snapshot）：
- 当前仅用 Tailwind 默认 lg 断点（1024px）两/四列布局，sm（640px）以下布局断点未做深度适配
- **P0 水平溢出**：DataTable min-w-[960px] → width 1359px，父容器缺少 overflow-x-auto 100% wrapper；ViralToast fixed w-[380px] max-w-[94vw] 在 375px 下超 380-352=28px；图表 grid 在 375 下 scrollW=376 微溢出
- **P1 布局/文案截断**：TopBanner 标题 "Matrix Multi-Account Monitor v3.4 管理员全景视角" 太长 + 右侧 4 个按钮在 375px 可能换行错位；PlatformDetailModal `w-[900px] max-w-[96vw]` 双列 data 在 96vw=360px 下列重叠
- **P2 触控可达**：多数 icon button 是 w-8 h-8（32px），低于 WCAG 44×44 最小触控尺寸；DataTable 行内「查看明细 / 导出 / 归属运营」小按钮点不到；TrafficPie 扇区 legend 6 条 OK，但扇区点击区域小
- **P3 细节体验**：Header 64px 固定高度 + Banner badge，移动页面主内容 padding-top=72px OK，但下拉身份切换菜单右对齐会溢出视口；JWT 输入框弹出软键盘 body 可能挤压缩放

### 代码库约束（必须遵守）
- 零新依赖，继续使用 framer-motion + lucide-react + recharts
- 不修业务逻辑，仅改类名 / 响应式前缀（sm: md: lg: max-sm:）/ Tailwind 布局与尺寸
- 断点约定：< 640px 为手机（max-sm: / sm: 断点）；640~1023 为平板（md:）；≥ 1024 桌面

## Files and Modules
- `App.jsx`：Header banner / 三视图 UI / StatCard / OperatorOverview / StocktwitsCard / RedditCard / GrowthChart / TrafficPie / DataTable / FiltersBar / Viral schedule 尺寸响应式 + overflow-x-auto wrapper + 触控最小 44 尺寸
- `ViralPostToast.jsx`：fixed w-[380px] → 手机 `w-[min(92vw,340px)]`，按钮 h-11 w-11 触控尺寸 + 内边距压缩到 `p-3 sm:p-3.5`
- `AccountDetailDrawer.jsx`：Drawer 最大 `sm:max-w-[520px] max-w-[94vw]`，内边距 max-sm:p-4，标题字号 max-sm:text-[15px]，按钮 44 触控
- `PlatformDetailModal.jsx`：Modal `w-[900px] max-w-[96vw]` → 手机改为 `top-0 left-0 right-0 bottom-0 h-full rounded-none w-full max-w-none` 全屏；列布局 `max-sm:grid-cols-1` 从双列变单列

## Implementation Steps（依赖顺序）
1. **P0 水平溢出修复（App.jsx）**
   - DataTable section 包一层 `<div className="w-full overflow-x-auto border border-black/[0.04] rounded-2xl bg-white">` 解决 min-w-[960px] 水平滚动（保留表头，不隐藏列）
   - Charts 双列 grid `lg:grid-cols-[2fr_1fr]` → 手机 `max-sm:grid-cols-1 max-sm:gap-4`；给 recharts ResponsiveContainer 的外层 div `max-sm:h-[260px]` 高度合适
   - 搜索页面所有 fixed/absolute + hardcoded px 宽度：统一改为 `w-[min(px, 92vw)]` 防止越界
2. **P0 ViralToast 宽度修复（ViralPostToast.jsx）**
   - 最外层 Toast wrapper 类名改 `fixed z-[60] right-2 sm:right-6 bottom-2 sm:bottom-6 w-[min(92vw,340px)] sm:w-[380px] pointer-events-none`，内边距 max-sm:p-3；关闭/外链按钮 max-sm:h-11 max-sm:w-11
   - ViralBanner 标题 `text-[13px] sm:text-[13px]` 保持，运营 badge `max-sm:max-w-[96px] truncate`
3. **P1 顶部 Banner 适配（App.jsx Header section）**
   - 标题文字：手机下「Matrix · v3.4」简写，避免长文本溢出：`text-[10.5px] sm:text-[12px] line-clamp-1` + 管理员全景视角 badge 手机下折到下一行
   - Banner 右侧 4 个按钮：`flex-wrap max-sm:gap-1 max-sm:text-[10px]`，头像按钮 max-sm:h-9 max-sm:w-9；「管理员视角查看个人」按钮 max-sm:px-2.5
   - 身份切换下拉菜单：`left-auto right-0 max-sm:w-[180px]` 防出界，内部按钮 44 触控
4. **P2 触控尺寸全量修复**
   - 全局扫描所有 `h-8 w-8` 的 icon button → 改成 `h-11 w-11`（移动端）/ `sm:h-8 sm:w-8`（桌面节省空间），即 `max-sm:h-11 max-sm:w-11`
   - DataTable 行内按钮「查看明细 / 导出 / 打开 / 归属运营」：`max-sm:h-11 max-sm:min-w-24 rounded-lg`
   - TrafficPie Legend 按钮：`max-sm:h-12 max-sm:rounded-lg`；Pie 容器外层 min-h 加 10px
5. **P1 PlatformDetailModal 手机全屏化（PlatformDetailModal.jsx）**
   - AnimatePresence 内 modal 容器 className：`max-sm:inset-0 max-sm:rounded-none max-sm:w-full max-sm:max-w-none` 去掉 900px 限制，铺满全屏
   - 内部 3 列 grid → `max-sm:grid-cols-1`；posts 列表 → `max-sm:gap-3`
   - 关闭按钮右上角绝对定位 → max-sm:h-11 max-sm:w-11
6. **P1 AccountDetailDrawer 手机内边距压缩**
   - Drawer fixed：保持从右滑出，宽度 `sm:w-[520px] w-[94vw]`；内部 padding `p-5 sm:p-6 max-sm:py-4 max-sm:px-4`
   - 标题 font-size max-sm:text-lg；2 列 detail 网格 → max-sm:grid-cols-1
7. **P3 细节收尾 + 触控反馈**
   - 所有按钮 hover 效果 → 手机加 `active:scale-95 transition` 有按压反馈
   - 给 <body> 加 `touch-action: manipulation` 防双击缩放（在 index.css 或 <main> className 里注入）
   - 检查 Chart 组件的 Legend：recharts 默认 legend 在手机下过小 → 移动到 chart 下方（mobile 时 verticalAlign='bottom'）
8. **Build + 手机端到端验证**
   - npm run build 无错误
   - 浏览器 375px 再跑一遍 overflow 扫描：body.scrollWidth === clientWidth (375) 无水平溢出
   - DataTable 横向可 swipe（overflow-x-auto 生效），ViralToast 右对齐不超，Modal / Drawer 按钮可达

## Dependencies and Considerations
- **Tailwind 响应式前缀**：所有调整必须用 `sm:`/`md:`/`max-sm:`，不能用自定义 CSS（保持一致性）；用 `min(px, vw)` 处理 hardcoded width
- **Recharts 兼容性**：GrowthChart / TrafficPie recharts ResponsiveContainer 对固定高高度依赖高，手机只调整外层 div 高度，不改 width 100%
- **不删功能**：DataTable 10 列在移动端 **不隐藏列**（保持管理员信息全等），改用 overflow-x-auto 横向滚动
- **交互安全**：`max-sm:h-11 w-11` 只用于 button/icon，不改 input / select 的默认高度（保持原生）

## Validation
1. `npm run build` 0 error
2. evaluate body.scrollWidth === 375（无水平溢出）、overflow offenders 数组为空（0 条 > 375px）
3. 点击路径验证：DataTable 滚动后，点「赵运营归属运营」能下钻；ViralToast 关闭、外链能点；Modal/DetailDrawer 打开关闭能操作
4. 触控抽样测：随机选 10 个按钮，evaluate getBoundingClientRect 宽高 ≥ 44px

## Risks
- **Risk：Tailwind `w-[min(...)]` 语法浏览器不兼容 → Fallback**：若编译失败（Tailwind 要求 v3.2+ arbitrary variants），改用 `w-[92vw] sm:w-[380px] max-w-[340px] sm:max-w-none` 两阶段写法
- **Risk：Recharts legend verticalAlign='bottom' 手机下与饼图重叠 → Fallback**：只改 `wrapperStyle={{ paddingBottom: 10 }}`，不强制 bottom
- **Risk：DataTable 12 列 + overflow-x-auto 会出现横向滚动条影响美观 → Mitigation**：外层包 `shadow-sm border rounded-2xl bg-white` 营造卡片边界视觉，提示用户横滑
