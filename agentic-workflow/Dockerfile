FROM python:3.12-slim

LABEL maintainer="lijiarui"
LABEL description="Agentic Workflow Agent – Elastic-themed AI ops agent"

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/
COPY workflows/ ./workflows/
COPY entrypoint.sh ./

RUN pip install --no-cache-dir -e . && \
    chmod +x entrypoint.sh

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

ENV RUN_MODE=workflow
ENV BOOTSTRAP_ON_START=true
ENV LOAD_DEMO_DATA=false
ENV WORKFLOW_FILE=workflows/ubuntu_auto_ops.yaml
ENV WORKFLOW_INPUT="Perform a full system health check and auto-remediate any issues found."

HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
    CMD python -c "from agentic_workflow_agent.config import load_settings; load_settings()" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
