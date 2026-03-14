#!/usr/bin/env bash
# 云服务器一键部署脚本 – 在 Ubuntu 22.04+ 上运行
set -euo pipefail

APP_DIR="/opt/agentic-workflow"
SERVICE_NAME="agentic-workflow"

echo "=== 1. 安装系统依赖 ==="
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip git

echo "=== 2. 创建应用目录 ==="
sudo mkdir -p "$APP_DIR"
sudo chown "$(whoami):$(whoami)" "$APP_DIR"

echo "=== 3. 复制项目文件 ==="
if [ -d "./src" ]; then
    cp -r src pyproject.toml workflows entrypoint.sh "$APP_DIR/"
else
    echo "ERROR: 请在项目根目录运行此脚本"
    exit 1
fi

echo "=== 4. 创建虚拟环境并安装依赖 ==="
cd "$APP_DIR"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .
chmod +x entrypoint.sh

echo "=== 5. 配置环境变量 ==="
if [ ! -f "$APP_DIR/.env" ]; then
    echo "请编辑 $APP_DIR/.env 填入你的配置（Elastic、OpenAI 等）"
    cat > "$APP_DIR/.env" <<'ENVEOF'
ELASTIC_URL=https://your-elastic-cluster.elastic-cloud.com:443
ELASTIC_API_KEY=your-elastic-api-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://coding.dashscope.aliyuncs.com/v1
OPENAI_CHAT_MODEL=kimi-k2.5
HYBRID_SEARCH_ENABLED=false
RUN_MODE=loop
LOOP_INTERVAL_SECONDS=3600
BOOTSTRAP_ON_START=true
TRACE_ENABLED=true
ENVEOF
    echo "已创建模板 $APP_DIR/.env — 请编辑后再启动服务"
fi

echo "=== 6. 安装 systemd 服务 ==="
sudo cp deploy/agentic-workflow.service /etc/systemd/system/${SERVICE_NAME}.service 2>/dev/null || \
    sudo cp "$APP_DIR/../deploy/agentic-workflow.service" /etc/systemd/system/${SERVICE_NAME}.service 2>/dev/null || \
    echo "WARNING: 请手动复制 deploy/agentic-workflow.service 到 /etc/systemd/system/"

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

echo ""
echo "=== 部署完成 ==="
echo "1. 编辑环境变量: sudo nano $APP_DIR/.env"
echo "2. 启动服务:     sudo systemctl start $SERVICE_NAME"
echo "3. 查看日志:     sudo journalctl -u $SERVICE_NAME -f"
echo "4. 查看状态:     sudo systemctl status $SERVICE_NAME"
