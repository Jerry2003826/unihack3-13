#!/usr/bin/env bash
set -uo pipefail

WORKFLOW_FILE="${WORKFLOW_FILE:-workflows/ubuntu_auto_ops.yaml}"
WORKFLOW_INPUT="${WORKFLOW_INPUT:-Perform a full system health check and auto-remediate any issues found.}"
RUN_MODE="${RUN_MODE:-workflow}"
BOOTSTRAP_ON_START="${BOOTSTRAP_ON_START:-true}"
LOAD_DEMO_DATA="${LOAD_DEMO_DATA:-false}"
RETRY_DELAY="${RETRY_DELAY:-60}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

log "=== Agentic Workflow Agent starting ==="
log "RUN_MODE=$RUN_MODE | BOOTSTRAP_ON_START=$BOOTSTRAP_ON_START"

if [[ "$BOOTSTRAP_ON_START" =~ ^(true|1|yes)$ ]]; then
    log "Bootstrapping Elasticsearch indices …"
    python -m agentic_workflow_agent.cli bootstrap-indices || log "WARNING: bootstrap-indices failed (indices may already exist)"
fi

if [[ "$LOAD_DEMO_DATA" =~ ^(true|1|yes)$ ]]; then
    log "Loading demo data …"
    python -m agentic_workflow_agent.cli load-demo-data || log "WARNING: load-demo-data failed"
fi

run_workflow_once() {
    python -m agentic_workflow_agent.cli run-workflow \
        --workflow "$WORKFLOW_FILE" \
        --input "$WORKFLOW_INPUT"
}

case "$RUN_MODE" in
    workflow)
        log "Running workflow: $WORKFLOW_FILE"
        run_workflow_once || { log "ERROR: workflow failed with exit code $?"; exit 1; }
        ;;
    ask)
        log "Running single question: $WORKFLOW_INPUT"
        python -m agentic_workflow_agent.cli ask "$WORKFLOW_INPUT" || { log "ERROR: ask failed"; exit 1; }
        ;;
    loop)
        log "Entering continuous loop mode (interval=${LOOP_INTERVAL_SECONDS:-3600}s, retry_delay=${RETRY_DELAY}s) …"
        consecutive_failures=0
        while true; do
            log "--- Loop iteration start ---"
            if run_workflow_once; then
                log "--- Loop iteration succeeded ---"
                consecutive_failures=0
                sleep_time="${LOOP_INTERVAL_SECONDS:-3600}"
            else
                consecutive_failures=$((consecutive_failures + 1))
                sleep_time=$(( RETRY_DELAY * (consecutive_failures < 5 ? consecutive_failures : 5) ))
                log "WARNING: workflow iteration failed (consecutive failures: $consecutive_failures). Retrying in ${sleep_time}s"
            fi
            log "Sleeping ${sleep_time}s …"
            sleep "$sleep_time"
        done
        ;;
    chat)
        log "Starting interactive REPL (not recommended for headless cloud) …"
        exec python -m agentic_workflow_agent.cli chat
        ;;
    *)
        log "ERROR: Unknown RUN_MODE=$RUN_MODE. Supported: workflow|ask|loop|chat"
        exit 1
        ;;
esac
