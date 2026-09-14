@echo off
chcp 65001 >nul
title Matrix Python Collector - 一键启动
cd /d "%~dp0"

echo ============================================================
echo   Matrix 矩阵账号监测系统 - Python 自动化采集脚本
echo   一键启动脚本 (Windows)
echo ============================================================
echo.

if not exist ".venv" (
    echo [1/5] 首次运行，正在创建 Python 虚拟环境 (.venv) ...
    python -m venv .venv
    if errorlevel 1 (
        echo [错误] 创建虚拟环境失败，请确认已安装 Python 3.10+
        pause
        exit /b 1
    )
    echo [OK] 虚拟环境创建完成
    echo.
)

echo [2/5] 激活虚拟环境 ...
call .venv\Scripts\activate.bat

echo [3/5] 检查并安装依赖 ...
pip install -r requirements_collector.txt -q
if errorlevel 1 (
    echo [警告] 依赖安装遇到问题，尝试继续 ...
)
echo [OK] 依赖检查完成
echo.

echo [4/5] 检查 Playwright Chromium 浏览器内核 ...
python -c "import playwright; from playwright.sync_api import sync_playwright; p = sync_playwright().start(); p.chromium.launch(headless=True).close(); p.stop(); print('OK')" 2>nul
if errorlevel 1 (
    echo 正在下载 Playwright Chromium 浏览器内核（首次约 300MB）...
    playwright install chromium
    if errorlevel 1 (
        echo [警告] 浏览器内核下载失败，脚本仍会尝试运行
    )
)
echo [OK] 浏览器内核检查完成
echo.

echo [5/5] 启动采集脚本 (使用 collector_config.example.yaml 配置) ...
echo.
echo   提示：修改 collector_config.example.yaml 中的 URL 列表、运营配置等
echo   或编辑本脚本末尾参数自定义运行方式
echo.
echo ============================================================
echo   脚本运行中，按 Ctrl+C 可停止
echo ============================================================
echo.

python python_collector.py --mode chrome --config collector_config.example.yaml --interval 3600

echo.
echo 脚本已退出，按任意键关闭窗口 ...
pause >nul
