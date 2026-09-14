#!/bin/bash
cd "$(dirname "$0")"

clear
echo "============================================================"
echo "  Matrix 矩阵账号监测系统 - Python 自动化采集脚本"
echo "  一键启动脚本 (macOS / Linux)"
echo "============================================================"
echo ""

if [ ! -d ".venv" ]; then
    echo "[1/5] 首次运行，正在创建 Python 虚拟环境 (.venv) ..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[错误] 创建虚拟环境失败，请确认已安装 Python 3.10+"
        read -p "按回车键退出..."
        exit 1
    fi
    echo "[OK] 虚拟环境创建完成"
    echo ""
fi

echo "[2/5] 激活虚拟环境 ..."
source .venv/bin/activate

echo "[3/5] 检查并安装依赖 ..."
pip install -r requirements_collector.txt -q
if [ $? -ne 0 ]; then
    echo "[警告] 依赖安装遇到问题，尝试继续 ..."
fi
echo "[OK] 依赖检查完成"
echo ""

echo "[4/5] 检查 Playwright Chromium 浏览器内核 ..."
python3 -c "import playwright; from playwright.sync_api import sync_playwright; p = sync_playwright().start(); p.chromium.launch(headless=True).close(); p.stop(); print('OK')" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "正在下载 Playwright Chromium 浏览器内核（首次约 300MB）..."
    playwright install chromium
    if [ $? -ne 0 ]; then
        echo "[警告] 浏览器内核下载失败，脚本仍会尝试运行"
    fi
fi
echo "[OK] 浏览器内核检查完成"
echo ""

echo "[5/5] 启动采集脚本 (使用 collector_config.example.yaml 配置) ..."
echo ""
echo "  提示：修改 collector_config.example.yaml 中的 URL 列表、运营配置等"
echo "  或编辑本脚本末尾参数自定义运行方式"
echo ""
echo "============================================================"
echo "  脚本运行中，按 Ctrl+C 可停止"
echo "============================================================"
echo ""

python3 python_collector.py --mode chrome --config collector_config.example.yaml --interval 3600

echo ""
echo "脚本已退出"
read -p "按回车键关闭窗口..."
