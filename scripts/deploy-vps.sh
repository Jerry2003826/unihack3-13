#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="inspect-ai"
APP_DIR="/opt/${APP_NAME}"
REPO_URL=""
BRANCH="main"
ENV_SOURCE=""
APP_DOMAIN=""
API_DOMAIN=""
CONTACT_EMAIL=""
WEB_PORT="3000"
API_PORT="3001"
NODE_MAJOR="22"
ENABLE_SSL="0"
SKIP_SYSTEM_PACKAGES="0"
QDRANT_CONTAINER_NAME="inspect-qdrant"
QDRANT_STORAGE_DIR="/opt/${APP_NAME}/qdrant_storage"

RUN_USER="${SUDO_USER:-${USER}}"
RUN_HOME="$(getent passwd "${RUN_USER}" | cut -d: -f6 2>/dev/null || true)"

usage() {
  cat <<'EOF'
Usage:
  sudo bash scripts/deploy-vps.sh \
    --repo git@github.com:your-org/inspect.git \
    --branch main \
    --env-file /root/inspect.env \
    --app-domain app.example.com \
    --api-domain api.example.com \
    --contact-email ops@example.com \
    --enable-ssl

Required:
  --repo           Git repository URL
  --env-file       Path to the filled runtime env file
  --app-domain     Frontend domain, for example app.example.com
  --api-domain     API domain, for example api.example.com

Optional:
  --branch         Git branch to deploy, default: main
  --app-dir        Install directory, default: /opt/inspect-ai
  --web-port       Frontend port, default: 3000
  --api-port       API port, default: 3001
  --node-major     Node.js major version, default: 22
  --contact-email  Email for Let's Encrypt
  --enable-ssl     Request HTTPS certificates with certbot
  --skip-system-packages
                   Skip apt and Node.js installation

Notes:
  - This script targets Ubuntu 22.04 / 24.04.
  - Run it as root or with sudo privileges.
  - The env file should be based on .env.example and contain real secrets.
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

warn() {
  printf '[deploy] WARN: %s\n' "$*" >&2
}

die() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    bash -lc "$*"
  else
    sudo bash -lc "$*"
  fi
}

as_run_user() {
  local cmd="$1"
  if [[ "$(id -un)" == "${RUN_USER}" ]]; then
    bash -lc "${cmd}"
  else
    sudo -u "${RUN_USER}" -H bash -lc "${cmd}"
  fi
}

require_file() {
  local path="$1"
  [[ -f "${path}" ]] || die "File not found: ${path}"
}

get_env_value() {
  local file="$1"
  local key="$2"
  local line

  line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

warn_if_env_missing() {
  local file="$1"
  local key="$2"
  local value

  value="$(get_env_value "${file}" "${key}")"
  if [[ -z "${value}" ]]; then
    warn "Runtime env is missing ${key}"
  fi
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped
  escaped="$(printf '%s' "${value}" | sed 's/[&|]/\\&/g')"

  if grep -Eq "^${key}=" "${file}"; then
    sed -i.bak "s|^${key}=.*$|${key}=${escaped}|" "${file}"
    rm -f "${file}.bak"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >>"${file}"
  fi
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempt

  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 "${url}" >/dev/null 2>&1; then
      log "${label} is healthy: ${url}"
      return 0
    fi

    sleep 2
  done

  die "${label} failed health check: ${url}"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        REPO_URL="${2:-}"
        shift 2
        ;;
      --branch)
        BRANCH="${2:-}"
        shift 2
        ;;
      --env-file)
        ENV_SOURCE="${2:-}"
        shift 2
        ;;
      --app-domain)
        APP_DOMAIN="${2:-}"
        shift 2
        ;;
      --api-domain)
        API_DOMAIN="${2:-}"
        shift 2
        ;;
      --contact-email)
        CONTACT_EMAIL="${2:-}"
        shift 2
        ;;
      --app-dir)
        APP_DIR="${2:-}"
        shift 2
        ;;
      --web-port)
        WEB_PORT="${2:-}"
        shift 2
        ;;
      --api-port)
        API_PORT="${2:-}"
        shift 2
        ;;
      --node-major)
        NODE_MAJOR="${2:-}"
        shift 2
        ;;
      --enable-ssl)
        ENABLE_SSL="1"
        shift
        ;;
      --skip-system-packages)
        SKIP_SYSTEM_PACKAGES="1"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown argument: $1"
        ;;
    esac
  done
}

validate_args() {
  [[ -n "${REPO_URL}" ]] || die "--repo is required"
  [[ -n "${ENV_SOURCE}" ]] || die "--env-file is required"
  [[ -n "${APP_DOMAIN}" ]] || die "--app-domain is required"
  [[ -n "${API_DOMAIN}" ]] || die "--api-domain is required"

  require_file "${ENV_SOURCE}"

  if [[ "${ENABLE_SSL}" == "1" && -z "${CONTACT_EMAIL}" ]]; then
    die "--contact-email is required when --enable-ssl is set"
  fi

  if [[ -z "${RUN_HOME}" ]]; then
    die "Unable to determine home directory for user ${RUN_USER}"
  fi
}

check_platform() {
  require_file "/etc/os-release"
  if ! grep -Eq '^ID=ubuntu$' /etc/os-release; then
    die "This script currently supports Ubuntu only."
  fi
}

install_system_packages() {
  if [[ "${SKIP_SYSTEM_PACKAGES}" == "1" ]]; then
    log "Skipping system package installation"
    return 0
  fi

  log "Installing system packages"
  as_root "apt-get update"
  as_root "DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg git nginx build-essential docker.io"

  if [[ "${ENABLE_SSL}" == "1" ]]; then
    as_root "DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx"
  fi

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(\".\")[0]')" != "${NODE_MAJOR}" ]]; then
    log "Installing Node.js ${NODE_MAJOR}"
    as_root "mkdir -p /etc/apt/keyrings"
    as_root "curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor >/etc/apt/keyrings/nodesource.gpg"
    as_root "printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main\n' >/etc/apt/sources.list.d/nodesource.list"
    as_root "apt-get update"
    as_root "DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs"
  fi

  log "Enabling Corepack and installing PM2"
  as_root "corepack enable"
  as_root "npm install -g pm2"
}

prepare_checkout() {
  local run_group

  run_group="$(id -gn "${RUN_USER}")"
  log "Preparing application directory ${APP_DIR}"
  as_root "mkdir -p '$(dirname "${APP_DIR}")'"

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Updating existing checkout"
    as_run_user "cd '${APP_DIR}' && git fetch origin '${BRANCH}' && git checkout '${BRANCH}' && git pull --ff-only origin '${BRANCH}'"
  else
    log "Cloning repository"
    as_root "rm -rf '${APP_DIR}'"
    as_root "install -d -o '${RUN_USER}' -g '${run_group}' '${APP_DIR}'"
    as_run_user "git clone --branch '${BRANCH}' --depth 1 '${REPO_URL}' '${APP_DIR}'"
  fi
}

write_runtime_env() {
  local target_env="${APP_DIR}/.env.local"
  local spaces_ready="1"

  log "Writing runtime environment"
  as_root "install -m 600 '${ENV_SOURCE}' '${target_env}'"
  as_root "chown ${RUN_USER}:$(id -gn "${RUN_USER}") '${target_env}'"

  upsert_env_var "${target_env}" "DEPLOY_TARGET" "local"
  upsert_env_var "${target_env}" "NEXT_PUBLIC_API_BASE_URL" "https://${API_DOMAIN}"
  upsert_env_var "${target_env}" "CORS_ALLOWED_ORIGINS" "https://${APP_DOMAIN}"

  if [[ -z "$(get_env_value "${target_env}" "COHERE_EMBED_MODEL")" ]]; then
    upsert_env_var "${target_env}" "COHERE_EMBED_MODEL" "embed-v4.0"
  fi
  if [[ -z "$(get_env_value "${target_env}" "COHERE_RERANK_MODEL")" ]]; then
    upsert_env_var "${target_env}" "COHERE_RERANK_MODEL" "rerank-v4.0-pro"
  fi
  if [[ -z "$(get_env_value "${target_env}" "QDRANT_URL")" ]]; then
    upsert_env_var "${target_env}" "QDRANT_URL" "http://127.0.0.1:6333"
  fi
  if [[ -z "$(get_env_value "${target_env}" "QDRANT_COLLECTION")" ]]; then
    upsert_env_var "${target_env}" "QDRANT_COLLECTION" "rental_kb_v1"
  fi

  warn_if_env_missing "${target_env}" "GEMINI_API_KEY"
  warn_if_env_missing "${target_env}" "COHERE_API_KEY"
  warn_if_env_missing "${target_env}" "GOOGLE_MAPS_API_KEY"
  warn_if_env_missing "${target_env}" "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
  warn_if_env_missing "${target_env}" "MINIMAX_API_KEY"

  for key in DO_SPACES_REGION DO_SPACES_BUCKET DO_SPACES_ENDPOINT DO_SPACES_KEY DO_SPACES_SECRET; do
    if [[ -z "$(get_env_value "${target_env}" "${key}")" ]]; then
      spaces_ready="0"
      break
    fi
  done

  if [[ "${spaces_ready}" != "1" ]]; then
    warn "DigitalOcean Spaces is not fully configured. Uploads will fall back to local disk on the VPS."
  fi
}

setup_qdrant() {
  log "Ensuring local Qdrant service via Docker"
  as_root "systemctl enable --now docker"
  as_root "mkdir -p '${QDRANT_STORAGE_DIR}'"
  as_root "docker rm -f '${QDRANT_CONTAINER_NAME}' >/dev/null 2>&1 || true"
  as_root "docker run -d --name '${QDRANT_CONTAINER_NAME}' --restart unless-stopped -p 127.0.0.1:6333:6333 -v '${QDRANT_STORAGE_DIR}:/qdrant/storage' qdrant/qdrant:latest >/dev/null"
}

build_application() {
  log "Installing dependencies and building application"
  as_run_user "cd '${APP_DIR}' && pnpm install --frozen-lockfile && pnpm build"
}

run_knowledge_index() {
  local target_env="${APP_DIR}/.env.local"

  if [[ -z "$(get_env_value "${target_env}" "COHERE_API_KEY")" ]]; then
    warn "Skipping knowledge:index because COHERE_API_KEY is missing."
    return 0
  fi

  log "Building RAG index into local Qdrant"
  as_run_user "cd '${APP_DIR}' && node apps/api/scripts/knowledge-index.mjs --env-file '${target_env}' --docs-file '${APP_DIR}/apps/api/src/data/rental-knowledge.json'"
}

write_pm2_config() {
  local pm2_config="${APP_DIR}/ecosystem.config.cjs"

  log "Writing PM2 config"
  cat >"${pm2_config}" <<EOF
module.exports = {
  apps: [
    {
      name: "inspect-web",
      cwd: "${APP_DIR}",
      script: "pnpm",
      args: "--filter web start",
      env: {
        NODE_ENV: "production",
        PORT: "${WEB_PORT}"
      }
    },
    {
      name: "inspect-api",
      cwd: "${APP_DIR}",
      script: "pnpm",
      args: "--filter api start",
      env: {
        NODE_ENV: "production",
        PORT: "${API_PORT}"
      }
    }
  ]
};
EOF

  as_root "chown ${RUN_USER}:$(id -gn "${RUN_USER}") '${pm2_config}'"
}

start_processes() {
  log "Starting services with PM2"
  as_run_user "cd '${APP_DIR}' && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save"
  as_root "env PATH=\$PATH:/usr/bin:/usr/local/bin pm2 startup systemd -u '${RUN_USER}' --hp '${RUN_HOME}' >/dev/null"
}

write_nginx_config() {
  local nginx_conf="/etc/nginx/sites-available/${APP_NAME}.conf"
  local tmp_conf

  tmp_conf="$(mktemp)"

  log "Writing Nginx config"
  cat >"${tmp_conf}" <<EOF
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${APP_DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:${WEB_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name ${API_DOMAIN};
  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:${API_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
  }
}
EOF

  as_root "install -m 644 '${tmp_conf}' '${nginx_conf}'"
  rm -f "${tmp_conf}"
  as_root "ln -sf '${nginx_conf}' '/etc/nginx/sites-enabled/${APP_NAME}.conf'"
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    as_root "rm -f /etc/nginx/sites-enabled/default"
  fi

  as_root "systemctl enable --now nginx"
  as_root "nginx -t"
  as_root "systemctl reload nginx"
}

enable_https() {
  if [[ "${ENABLE_SSL}" != "1" ]]; then
    return 0
  fi

  log "Requesting Let's Encrypt certificates"
  as_root "certbot --nginx --non-interactive --agree-tos -m '${CONTACT_EMAIL}' --redirect -d '${APP_DOMAIN}' -d '${API_DOMAIN}'"
}

post_checks() {
  wait_for_http "http://127.0.0.1:${WEB_PORT}" "Frontend"
  wait_for_http "http://127.0.0.1:${API_PORT}/api/health" "API"
  wait_for_http "http://127.0.0.1:6333/" "Qdrant"
}

print_summary() {
  local scheme="http"
  if [[ "${ENABLE_SSL}" == "1" ]]; then
    scheme="https"
  fi

  cat <<EOF

[deploy] Deployment completed.
[deploy] Frontend: ${scheme}://${APP_DOMAIN}
[deploy] API:      ${scheme}://${API_DOMAIN}
[deploy] App dir:  ${APP_DIR}
[deploy] PM2 user: ${RUN_USER}

[deploy] Next steps:
[deploy] 1. Point DNS for both domains to this VPS before enabling SSL.
[deploy] 2. If you skipped SSL, rerun the script with --enable-ssl after DNS is live.
[deploy] 3. Inspect services with: sudo -u ${RUN_USER} -H pm2 status
EOF
}

main() {
  parse_args "$@"
  validate_args
  check_platform
  install_system_packages
  prepare_checkout
  write_runtime_env
  setup_qdrant
  build_application
  run_knowledge_index
  write_pm2_config
  start_processes
  write_nginx_config
  post_checks
  enable_https
  print_summary
}

main "$@"
