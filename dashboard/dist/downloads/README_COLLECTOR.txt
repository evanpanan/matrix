========================================================================
 Matrix · Stage 2 采集工具 — 快速上手
========================================================================

▎两种采集方式：

（A）Chrome 插件（Manifest V3）
    适用：运营电脑日常使用 / 指纹浏览器（AdsPower / Hubstudio / Multilogin 等）
    特点：后台自动采集，不影响正常使用，断网本地队列持久化

  安装步骤：
  1. Chrome / Edge / Chromium 地址栏输入  chrome://extensions
  2. 右上角打开「开发者模式」
  3. 点击「加载已解压的扩展程序」，选择 collector-extension/ 文件夹
  4. 浏览器右上角 📌 固定 Matrix 采集插件，点击图标配置：
       - 归属运营（下拉选择）
       - 机器名（必填，用于 Dashboard 节点视图标识）
       - 后端 Server URL（默认 http://localhost:8000）
       - 可选：爆款飞书 / 钉钉 webhook URL
  5. 打开任意支持平台（小红书、X、抖音、雪球、公众号 等 23 个）即可自动采集
  6. 弹窗里点击「手动采集当前页 + 立即同步」可以立刻跑一次解析 + 批量上报

  支持平台：
  小红书、抖音、快手、视频号、B站、微博、知乎、公众号、豆瓣、贴吧、虎扑、
  X (Twitter)、Facebook、Instagram、TikTok、YouTube、LinkedIn、Reddit、
  Discord、Twitch、雪球、东方财富、同花顺、华尔街见闻

▎（B）Python Playwright 自动化脚本（批量 / 无人值守）
    适用：机器批量爬、定时采集、和指纹浏览器联动复用登录态
    三种模式：
      --mode adspower   AdsPower Local API，传入 --user-id=xx
      --mode hubstudio  Hubstudio / 指纹浏览器，传入 --profile-id=xx
      --mode chrome     原生 Playwright Chromium（自行处理 Cookie）

  安装依赖：
      pip install -r requirements_collector.txt
      playwright install chromium

  示例 1 · AdsPower 指纹浏览器：
      python python_collector.py \
        --mode adspower --user-id k1xxxxxxx \
        --operator-uid op_001 --operator-name 李运营 \
        --machine-name "李运营 - MBP" \
        --api-base http://localhost:8000 \
        --urls "https://x.com/elonmusk,https://xueqiu.com/xxx" \
        --interval 3600   # 每小时跑一轮

  示例 2 · Hubstudio 指纹浏览器：
      python python_collector.py \
        --mode hubstudio --profile-id p1xxxxxxx \
        --config collector_config.example.yaml

  示例 3 · 本机 Chromium · 无头模式测解析：
      python python_collector.py --mode chrome --headless \
        --urls "https://example.com/page1,https://example.com/page2"

========================================================================
 完整文档：README_STAGE2.md
 GitHub    : https://github.com/evanpanan/matrix
========================================================================
