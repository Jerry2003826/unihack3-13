# Changelog

All notable changes to this project are documented in this file.

## [2026-03-15] — Day 3: Intelligence & Hardening

### Added
- **SafeOps Execution Framework** — anti-hallucination security layer: 3-tier command permissions (READ_ONLY / MODIFY / DANGEROUS), command whitelist/blacklist (18 regex patterns), dry-run simulation, LLM self-verification gate, auto-rollback registry (9 patterns), structured audit logging, and state-machine driven execution (`safe_ops.py`, 35 unit tests)
- **Retrieval Planner for Rental Intelligence** — multi-strategy RAG with Gemini-powered query decomposition (defect/regulation/neighborhood/agency), per-category retrieval strategies (variable top_k, tag filtering, rerank), parallel execution via `Promise.allSettled`, and Gemini-driven result fusion with conflict detection (`retrievalPlanner.ts`, `/api/knowledge/plan`)
- **Smart Gateway** — dynamic model routing lets Gemini Flash automatically escalate complex tasks to Gemini Pro via schema-wrapping technique (`ai.ts`)
- **Autonomous Server Ops Agent** — Python-based agentic workflow deployed via systemd; first auto-remediation detected SSH brute-force attacks and installed fail2ban + UFW + SSH hardening within minutes of deployment
- **i18n / Translation endpoint** — `/api/translate` for multi-language report support
- **Engineering Deep-Dive** — comprehensive README section with design rationale, hard metrics, rate-limit tables, and performance benchmarks
- **Hazard Detection Precision/Recall evaluation** — first formal evaluation run added to README

### Fixed
- `zod-to-json-schema` silent failure in monorepo — replaced with custom `createGeminiSchema()` mapper using `constructor.name` lookups
- Smart Gateway Zod validation crashes on incomplete escalation JSON — switched to native `JSON.parse` pre-check

### Improved
- Live room state machine transitions and scan guidance logic
- Knowledge indexing script and Qdrant storage configuration
- Deployment scripts and environment variable documentation

---

## [2026-03-14] — Day 2: Full Feature Build

### Added
- **Live Inspection Scan** — real-time camera scanning with AI-guided targets, hazard re-inspection, bounding-box IoU confirmation, and MiniMax voice alerts (`useCameraStream`, `useVisionEngine`, `liveGuidance`, `liveRoomState`)
- **3D Room Reconstruction** — AI-driven (no LiDAR) room scene from 3–8 photos via per-image Gemini analysis + multi-view fusion + scene synthesis (`roomSceneReconstruct.ts`)
- **Maps-Grounded Intelligence** — Google Maps + Gemini fusion agent for location intelligence with conflict detection (`mapsGroundedIntelligence.ts`)
- **Community Research Agent** — multi-pass Google Search grounding for neighborhood analysis (`communityResearchAgent.ts`)
- **Agency Background Agent** — Tavily Search + Gemini grounded analysis (`searchAgent.ts`)
- **Knowledge Base RAG** — Cohere embed-v3 + Qdrant vector DB + optional rerank, 420-char sliding window chunking with 80-char overlap, 3-layer fallback chain (`queryKnowledge.ts`)
- **Multi-Property Comparison** — weighted scoring across 7 factors with trade-off analysis (`/api/compare`)
- **Checklist Prefill** — auto-fill remote-friendly inspection fields from intelligence data (`/api/checklist/prefill`)
- **Listing Discovery & Extraction** — address → candidate listings → structured detail extraction (`/api/listing/discover`, `/api/listing/extract`)
- **MiniMax TTS Voice Alerts** — real-time voice guidance during live scan (`/api/tts/alert`)
- **Lease Negotiation Advice** — context-aware negotiation strategies (`/api/negotiate`)
- **Report Center** — risk scoring, evidence summary, pre-lease advice, progressive enhancement loading
- **History** — local IndexedDB persistence of past searches and comparisons
- **Static Map Generation** — Google Maps Static API integration (`/api/maps/static`)
- **14 rate-limited API endpoints** with per-route sliding window controls (8–60 req/min)
- **22 test files** — 19 Vitest unit tests + 3 Playwright E2E specs

### Infrastructure
- **VPS Deployment** — PM2 + Nginx + Docker Qdrant on DigitalOcean
- **Comprehensive README** with full technical architecture documentation
- **4-layer error degradation** — request → service → model → data fallback strategy

---

## [2026-03-13] — Day 1: Foundation

### Added
- **Monorepo initialized** — Next.js 16 + React 19 + TypeScript, `pnpm` workspaces
- `apps/web` — frontend with Tailwind CSS v4, shadcn/ui, Framer Motion, Zustand
- `apps/api` — backend with Next.js Route Handlers, Zod schema validation
- `packages/contracts` — shared Zod schemas and TypeScript types
- `packages/ui` — shared UI component library
- **Image Analysis** — Gemini 2.5 Flash vision for rental property hazard detection (`/api/analyze`)
- **Manual Upload** — batch photo analysis with automatic hazard detection and deduplication
- **Geo Intelligence** — Google Maps Geocoding + Places + Routes integration (`geoAnalyzer.ts`)
- **Presigned Upload** — DigitalOcean Spaces S3-compatible object storage (`/api/upload/sign`)
- **Report Generation** — initial report page with hazard summary
- **Thumbnail Service** — hazard thumbnail derivation from source images

### Infrastructure
- `.env.example` with all required and optional environment variables
- Git repository initialized with proper `.gitignore`
