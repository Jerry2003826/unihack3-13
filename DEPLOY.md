# Deploy Guide

## Current architecture

This repository is a `pnpm` workspace monorepo:

- `apps/web`: Next.js frontend
- `apps/api`: Next.js API service with Route Handlers
- `packages/contracts`: shared schemas and contracts
- `packages/ui`: shared UI package

Important deployment facts for this repo:

- Both apps depend on workspace packages, so deployment must preserve monorepo access.
- The frontend calls the API through `NEXT_PUBLIC_API_BASE_URL`.
- The API can fall back to local filesystem storage, but that is not suitable for most cloud deployments.
- Report snapshots are currently stored in the browser's `IndexedDB`, not in a server database.

## What you actually need

For the current codebase, a full production setup is:

1. Frontend hosting
2. API hosting
3. Object storage for uploads and derived images
4. Provider API keys
5. Custom domains and CORS

You do **not** need a database for the current feature set unless you want:

- multi-user accounts
- cross-device report persistence
- server-side history
- analytics or audit records

## Recommended setup

### Option A: easiest to operate

- Frontend: Vercel project for `apps/web`
- API: Vercel project for `apps/api`
- Upload storage: DigitalOcean Spaces
- Domain:
  - `app.yourdomain.com` -> frontend
  - `api.yourdomain.com` -> API

Use this when you want the least ops work and are fine with managed hosting.

### Option B: balanced control

- Frontend: Vercel project for `apps/web`
- API: Render or Railway Node service
- Upload storage: DigitalOcean Spaces

Use this when you want the frontend on Vercel but prefer a long-running backend service with easier debugging and optional persistent disk.

### Option C: single VPS

- One Ubuntu VPS
- Nginx reverse proxy
- PM2 for process management
- Both `web` and `api` running as Node processes
- DigitalOcean Spaces for uploads

Use this when you want one machine you fully control.

## Server sizing

### Frontend

If you deploy `apps/web` on Vercel, you do not need to provision a traditional frontend server.

If you deploy `apps/web` on your own machine, start with:

- `1 vCPU / 1 GB RAM` for testing
- `2 vCPU / 2 GB RAM` for real usage

### API

The API runs image analysis, remote API aggregation, TTS, and thumbnail generation. Start with:

- minimum: `1 vCPU / 1 GB RAM`
- recommended: `2 vCPU / 2 GB RAM`
- safer if traffic or image volume rises: `2 vCPU / 4 GB RAM`

Avoid tiny instances if you expect concurrent image analysis.

## Required environment variables

### Shared essentials

Set these for real production behavior:

```bash
GEMINI_API_KEY=
COHERE_API_KEY=
COHERE_EMBED_MODEL=embed-v4.0
COHERE_RERANK_MODEL=rerank-v4.0-pro
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=rental_kb_v1
QDRANT_API_KEY=
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
MINIMAX_API_KEY=
```

### Object storage

Strongly recommended:

```bash
DO_SPACES_REGION=
DO_SPACES_BUCKET=
DO_SPACES_ENDPOINT=
DO_SPACES_KEY=
DO_SPACES_SECRET=
```

For Vercel specifically, treat these as required for upload flows.
This codebase falls back to `.local-storage` on the app filesystem when Spaces is missing, which is not a reliable persistence model for Vercel deployments.

### API-only

```bash
DEPLOY_TARGET=api
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
TAVILY_API_KEY=
```

### Frontend-only

```bash
DEPLOY_TARGET=frontend
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

## Monorepo rule that matters

Do not deploy `apps/web` or `apps/api` as isolated folders unless the platform explicitly supports workspace files outside the root directory.

Safer patterns:

- Keep the repo root as build context and use `pnpm --filter ...`
- Or use a platform feature that includes files outside the app root during build

## Vercel + Vercel setup

Create two Vercel projects from the same repository.

### Frontend project

- Root Directory: `apps/web`
- Framework: Next.js
- Install Command: auto or `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter web build`

Env vars:

```bash
DEPLOY_TARGET=frontend
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

### API project

- Root Directory: `apps/api`
- Framework: Next.js
- Install Command: auto or `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter api build`

Env vars:

```bash
DEPLOY_TARGET=api
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
GEMINI_API_KEY=...
GOOGLE_MAPS_API_KEY=...
MINIMAX_API_KEY=...
TAVILY_API_KEY=...
DO_SPACES_REGION=...
DO_SPACES_BUCKET=...
DO_SPACES_ENDPOINT=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
```

Notes:

- Because this is a workspace repo, confirm Vercel includes shared files outside the app root during build.
- Set the frontend domain into the API `CORS_ALLOWED_ORIGINS`.
- Set the API domain into the frontend `NEXT_PUBLIC_API_BASE_URL`.
- For this repo on Vercel, configure `DO_SPACES_*`. Do not rely on the local filesystem fallback for uploads.

## Vercel + Render setup

### Frontend

Deploy `apps/web` on Vercel exactly as above.

### API on Render

Do **not** set Render `rootDir` to `apps/api`, because files outside root are not available and the API depends on `packages/contracts`.

Recommended Render settings:

- Runtime: Node
- Root Directory: repo root
- Build Command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter api build`
- Start Command: `pnpm --filter api start`

Env vars:

```bash
PORT=3001
DEPLOY_TARGET=api
CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
GEMINI_API_KEY=...
GOOGLE_MAPS_API_KEY=...
MINIMAX_API_KEY=...
TAVILY_API_KEY=...
DO_SPACES_REGION=...
DO_SPACES_BUCKET=...
DO_SPACES_ENDPOINT=...
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
```

If you choose not to use Spaces:

- attach a persistent disk
- mount it where your service can persist `.local-storage`
- accept that scaling horizontally becomes awkward

## Single VPS setup

Start with:

- Ubuntu 22.04 or 24.04
- Node.js 22 LTS
- `pnpm` via Corepack
- Nginx
- PM2

### One-click deploy script

This repository now includes:

- `scripts/deploy-vps.sh`

The script will:

- install Node.js, Nginx, Docker, PM2, and required system packages
- clone or update the repo
- write the runtime env file to repo root `.env.local`
- start local Qdrant (`qdrant/qdrant`) with persistent storage
- build both Next.js apps
- run `knowledge:index` to seed the RAG corpus into Qdrant
- start both services with PM2
- write the Nginx reverse proxy config
- optionally request Let's Encrypt certificates

Example:

```bash
cp .env.example /root/inspect.env
# fill /root/inspect.env with real secrets first

sudo bash scripts/deploy-vps.sh \
  --repo git@github.com:your-org/inspect.git \
  --branch main \
  --env-file /root/inspect.env \
  --app-domain app.example.com \
  --api-domain api.example.com \
  --contact-email ops@example.com \
  --enable-ssl
```

The script automatically forces:

- `DEPLOY_TARGET=local`
- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`
- `CORS_ALLOWED_ORIGINS=https://app.example.com`

If `DO_SPACES_*` is missing, the script warns and the app will use VPS local disk for uploads.

### Process layout

- `web`: `pnpm --filter web start`
- `api`: `pnpm --filter api start`

### Build once

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

### PM2

```bash
pm2 start "pnpm --filter web start" --name inspect-web
pm2 start "pnpm --filter api start" --name inspect-api
pm2 save
pm2 startup
```

### Nginx

- `app.yourdomain.com` -> `http://127.0.0.1:3000`
- `api.yourdomain.com` -> `http://127.0.0.1:3001`

If you do not use Spaces and want local file persistence on the VPS, ensure the app user can write its working directory and keep `.local-storage` on persistent disk.

## DigitalOcean Spaces CORS

For browser upload and image usage, allow:

- Origin: `https://app.yourdomain.com`
- Methods: `GET`, `PUT`, `HEAD`
- Headers:
  - `Content-Type`
  - any custom headers you later add

If reports render remote images in the browser, verify `GET` is allowed for the frontend origin.

## Things to fix later if you want real production scale

The app can be deployed now, but these are current architectural limits:

1. Rate limiting is in-memory, so limits reset on restart and are not shared across instances.
2. TTS cache is in-memory only.
3. Report history is browser-local, not server-persistent.
4. `DATABASE_URL` exists in env examples but is not currently used.

## Deployment checklist

1. Buy a domain or prepare a subdomain plan.
2. Create a Spaces bucket and configure bucket CORS.
3. Deploy the API first.
4. Set `CORS_ALLOWED_ORIGINS` on the API to the final frontend origin.
5. Deploy the frontend with `NEXT_PUBLIC_API_BASE_URL` pointing to the API domain.
6. Bind custom domains.
7. Test:
   - homepage load
   - Google Maps rendering
   - manual upload
   - generated report images
   - TTS route
   - compare flow
