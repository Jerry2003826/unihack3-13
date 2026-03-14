# Inspect.AI

中文 | [English](#english)

Inspect.AI 是一个面向租房/看房场景的 AI 辅助风险检查系统。它把实时扫描、图片分析、地理情报、租前建议、比较推荐、3D 房间示意和报告导出放在同一套产品流程里。

Inspect.AI is an AI-assisted rental inspection and decision-support system. It combines live scan guidance, image analysis, location intelligence, pre-lease advice, multi-property comparison, approximate 3D room views, and exportable reports in one workflow.

---

## 中文

### 1. 项目概览

Inspect.AI 解决的是“看房时信息不完整、签约前风险难判断、检查记录容易遗漏”的问题。当前系统支持：

- 实时扫描 `Live Inspection`
  - 相机实时取景
  - AI 引导用户拍关键区域
  - 高风险问题复检后自动入报告
  - MiniMax 英文语音播报
- 手动上传 `Manual Upload`
  - 上传房屋照片
  - AI 分析隐患
  - 自动生成报告
- 报告中心 `Report`
  - 风险评分
  - 地理 / 社区 / 中介情报
  - 证据汇总
  - 租前行动建议
  - 3D Room View
- 多房源比较 `Compare`
  - 读取已保存报告
  - 按权重生成推荐结果
- 历史记录 `History`
  - 本机保存搜索与比较记录
- 知识库增强 `Knowledge Base`
  - 结合租房知识内容生成更可执行的建议

### 2. 技术栈

#### 前端

- `Next.js 16.1.6`
- `React 19`
- `TypeScript`
- `Tailwind CSS v4`
- `shadcn/ui`
- `Zustand`
- `IndexedDB (idb)`
- `Framer Motion`
- `Recharts`
- `@vis.gl/react-google-maps`
- `Three.js`
- `html2canvas + jsPDF`

#### 后端 / 服务端

- `Next.js Route Handlers`
- `Zod`
- `@google/genai`
- `Jimp`
- `DigitalOcean Spaces / S3-compatible presigned upload`
- `MiniMax TTS`
- `Google Maps Platform`
  - Geocoding
  - Places
  - Routes
  - Static Maps
  - Maps JS

#### 共享层

- `packages/contracts`
  - Zod schema
  - 前后端共享类型
- `packages/ui`
  - 共享 UI 包

### 3. 仓库结构

```text
Inspect/
├─ apps/
│  ├─ web/                  # 前端应用（用户界面）
│  └─ api/                  # API 应用（服务端路由）
├─ packages/
│  ├─ contracts/            # 共享 schema / 类型
│  └─ ui/                   # 共享 UI 组件
├─ tests/                   # Vitest / Playwright
├─ package.json             # Monorepo 根脚本
├─ pnpm-workspace.yaml
└─ README.md
```

### 4. 主要页面

- `/`
  - 新首页 UI
  - Live / Manual 入口
- `/radar`
  - 实时扫描前的准备与状态页
- `/scan`
  - 相机扫描
  - 引导式复检
  - 3D Scan Studio
- `/manual`
  - 图片上传分析
- `/report/[id]`
  - 检查报告
- `/compare`
  - 多房源比较入口
- `/compare/[id]`
  - 比较报告详情
- `/history`
  - 搜索历史与比较历史

### 5. 主要 API

- `GET /api/health`
- `POST /api/upload/sign`
- `POST /api/storage/object`
- `POST /api/analyze`
- `POST /api/analyze/live`
- `POST /api/intelligence`
- `POST /api/negotiate`
- `POST /api/knowledge/query`
- `POST /api/compare`
- `POST /api/geocode/reverse`
- `POST /api/checklist/prefill`
- `POST /api/listing/discover`
- `POST /api/listing/extract`
- `POST /api/maps/static`
- `POST /api/assets/sign-get`
- `POST /api/tts/alert`
- `POST /api/scan/3d/reconstruct`

### 6. 环境要求

建议环境：

- `Node.js >= 20`
- `pnpm >= 9`
- macOS / Linux / Windows 均可

检查版本：

```bash
node -v
pnpm -v
```

### 7. 安装与启动

#### 安装依赖

```bash
pnpm install
```

#### 配置环境变量

复制一份环境文件：

```bash
cp .env.example .env.local
```

#### 本地开发

同时启动前后端：

```bash
pnpm dev
```

或分别启动：

```bash
pnpm dev:web
pnpm dev:api
```

默认地址：

- 前端：`http://localhost:3000`
- API：`http://localhost:3001`

#### 构建

```bash
pnpm build
```

#### 生产启动

```bash
pnpm start
```

### 8. 环境变量说明

#### 必需或强烈建议配置

```bash
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

#### Gemini 模型配置

```bash
GEMINI_VISION_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-2.5-flash
GEMINI_SCENE_EXTRACT_MODEL=gemini-2.5-flash
GEMINI_SCENE_SYNTHESIS_MODEL=gemini-2.5-pro
GEMINI_GROUNDED_MODEL=gemini-2.5-flash
GEMINI_INTELLIGENCE_MODEL=gemini-2.5-flash-lite
GEMINI_REASONING_MODEL=gemini-2.5-pro
```

#### MiniMax 语音

```bash
MINIMAX_API_KEY=
MINIMAX_API_BASE=https://api.minimax.io
MINIMAX_TTS_MODEL=speech-2.8-hd
MINIMAX_TTS_VOICE_ID=English_expressive_narrator
MINIMAX_TTS_FORMAT=mp3
```

#### 前端公共配置

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
```

#### DigitalOcean Spaces（可选，但上传功能建议配置）

```bash
DO_SPACES_REGION=
DO_SPACES_BUCKET=
DO_SPACES_ENDPOINT=
DO_SPACES_KEY=
DO_SPACES_SECRET=
```

#### 其他

```bash
TAVILY_API_KEY=
DATABASE_URL=
DEPLOY_TARGET=local
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

说明：

- 即使没有完整三方配置，项目中很多链路也带有本地 fallback
- 但若要体验完整能力，至少应配置：
  - `GEMINI_API_KEY`
  - `GOOGLE_MAPS_API_KEY`
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `MINIMAX_API_KEY`

### 9. 软件使用方法

#### 9.1 Live Inspection

1. 打开首页 `/`
2. 点击 `Enter Deep Scan`
3. 录入：
   - 地址
   - 中介
   - 可选租金
   - 可选 listing URL
4. 点击 `Start Live Scan`
5. 在 `/scan` 页面：
   - 启动相机
   - 跟着 AI 提示拍关键区域
   - 若 AI 识别到高风险，会引导你靠近复检
   - 语音播报由 MiniMax 输出
6. 扫描结束后生成报告

#### 9.2 Manual Upload

1. 首页点击 `Manual Override`
2. 或直接进入 `/manual`
3. 上传房屋图片
4. 系统会：
   - 压缩图片
   - 读取 EXIF
   - 上传文件
   - 触发 AI 分析
5. 自动跳转到报告页

#### 9.3 3D Scan Studio

1. 在 `/scan` 页面点击 `Open 3D Scan Studio`
2. 按步骤拍摄房间关键视角
3. 点击 `Generate 3D Demo`
4. 系统会生成一个近似 3D 房间示意
5. 可以在 3D 视图里：
   - 调整 marker 位置
   - 将 suggested marker 加入正式报告

注意：

- 这不是 LiDAR 级精确重建
- 当前是单房间、近似 3D、用于问题可视化和报告增强

#### 9.4 查看报告

报告页包含：

- Property Risk Score
- Fit Score
- Decision Recommendation
- Hazard List
- Area Intelligence
- Community Feedback
- Agency Background
- Evidence & Confidence
- Inspection Coverage
- Pre-lease Action Guide
- Knowledge Base Guidance
- People & Paperwork Checks
- 3D Room View
- Export Actions

#### 9.5 多房源比较

1. 先生成多份报告
2. 进入 `/compare`
3. 选择已保存报告
4. 调整权重
5. 生成 comparison report

#### 9.6 历史记录

进入 `/history` 可查看：

- 最近搜索
- 最近比较
- 从历史恢复输入
- 重新打开报告或比较结果

### 10. 测试与质量检查

#### Lint

```bash
pnpm lint
```

#### Unit Test

```bash
pnpm test:unit
```

#### E2E Test

```bash
pnpm test:e2e
```

#### 全量构建检查

```bash
pnpm build
```

### 11. 当前实现特点

- 实时扫描采用引导式复检，而不是每帧直接入报告
- Live scan 与 Manual upload 共用报告管线
- 报告是 refresh-safe 的本地快照
- 支持 3D Room View 的问题标记
- 支持多房源比较
- 支持知识库增强建议
- 支持 Google Maps + Web 搜索融合情报

### 12. 已知限制

- 3D 扫描目前是近似模型，不是高精度空间重建
- 某些三方 API 未配置时会走 fallback
- 部分公开网页信号质量依赖 Google 搜索结果本身
- 报告分享目前仍以本地 snapshot 为主，不是公网永久链接

### 13. 开发建议

- 新增字段时，优先改 `packages/contracts`
- API 响应必须走 Zod schema 校验
- 前后端共享数据结构应保持单一来源
- 新增页面状态时，尽量保持 `idle/loading/success/fallback/error` 一致

---

## English

### 1. Overview

Inspect.AI is an AI-assisted rental inspection and decision-support platform. It helps renters or property viewers inspect homes, collect evidence, understand local risk signals, compare multiple properties, and export decision-ready reports.

Current capabilities:

- `Live Inspection`
  - camera-based guided scan
  - AI-guided capture flow
  - guided recheck before high-risk issues are recorded
  - MiniMax voice alerts
- `Manual Upload`
  - upload room/property photos
  - AI hazard analysis
  - direct report generation
- `Report`
  - risk scoring
  - geo/community/agency intelligence
  - evidence summary
  - pre-lease action guide
  - 3D Room View
- `Compare`
  - compare saved reports with weighted scoring
- `History`
  - local search and comparison history
- `Knowledge Base`
  - renter-oriented guidance and checklist enrichment

### 2. Tech Stack

#### Frontend

- `Next.js 16.1.6`
- `React 19`
- `TypeScript`
- `Tailwind CSS v4`
- `shadcn/ui`
- `Zustand`
- `IndexedDB (idb)`
- `Framer Motion`
- `Recharts`
- `@vis.gl/react-google-maps`
- `Three.js`
- `html2canvas + jsPDF`

#### Backend / Server

- `Next.js Route Handlers`
- `Zod`
- `@google/genai`
- `Jimp`
- `DigitalOcean Spaces / S3-compatible uploads`
- `MiniMax TTS`
- `Google Maps Platform`

#### Shared packages

- `packages/contracts`
  - shared types and schemas
- `packages/ui`
  - shared UI primitives

### 3. Repository Layout

```text
Inspect/
├─ apps/
│  ├─ web/                  # frontend app
│  └─ api/                  # backend/API app
├─ packages/
│  ├─ contracts/            # shared schemas and types
│  └─ ui/                   # shared UI package
├─ tests/                   # vitest and playwright
├─ package.json             # root scripts
└─ README.md
```

### 4. Main Routes

- `/` home / intake shell
- `/radar` pre-scan state page
- `/scan` live camera scanning + 3D studio
- `/manual` photo upload flow
- `/report/[id]` report page
- `/compare` comparison entry
- `/compare/[id]` comparison report
- `/history` local history

### 5. Main API Routes

- `GET /api/health`
- `POST /api/upload/sign`
- `POST /api/storage/object`
- `POST /api/analyze`
- `POST /api/analyze/live`
- `POST /api/intelligence`
- `POST /api/negotiate`
- `POST /api/knowledge/query`
- `POST /api/compare`
- `POST /api/geocode/reverse`
- `POST /api/checklist/prefill`
- `POST /api/listing/discover`
- `POST /api/listing/extract`
- `POST /api/maps/static`
- `POST /api/assets/sign-get`
- `POST /api/tts/alert`
- `POST /api/scan/3d/reconstruct`

### 6. Requirements

Recommended:

- `Node.js >= 20`
- `pnpm >= 9`

Check versions:

```bash
node -v
pnpm -v
```

### 7. Setup

#### Install

```bash
pnpm install
```

#### Create env file

```bash
cp .env.example .env.local
```

#### Run locally

```bash
pnpm dev
```

Or run apps separately:

```bash
pnpm dev:web
pnpm dev:api
```

Default local URLs:

- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`

#### Build

```bash
pnpm build
```

#### Start

```bash
pnpm start
```

### 8. Environment Variables

Recommended minimum:

```bash
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
MINIMAX_API_KEY=
```

Important notes:

- Some flows can fall back locally when providers are unavailable
- Full production-like behavior needs real provider keys
- Spaces config is strongly recommended if you want upload persistence

### 9. Product Usage

#### 9.1 Live Inspection

1. Open `/`
2. Click `Enter Deep Scan`
3. Fill in:
   - property address
   - agency
   - optional weekly rent
   - optional listing URL
4. Click `Start Live Scan`
5. Follow AI guidance in `/scan`
6. End the scan and generate a report

#### 9.2 Manual Upload

1. Open `/manual` or click `Manual Override`
2. Upload property images
3. Let the app analyze them
4. Review the generated report

#### 9.3 3D Scan Studio

1. Open `/scan`
2. Click `Open 3D Scan Studio`
3. Capture the guided room views
4. Click `Generate 3D Demo`
5. Review the approximate 3D room scene
6. Adjust markers or promote suggested markers into the report

Note:

- This is an approximate semantic 3D room model
- It is not a LiDAR or mesh-accurate reconstruction

#### 9.4 Reports

Reports include:

- risk score
- fit score
- recommendation
- hazard list
- area intelligence
- community feedback
- agency background
- evidence and confidence
- inspection coverage
- pre-lease action guide
- knowledge guidance
- paperwork checks
- 3D room view
- export actions

#### 9.5 Compare

1. Generate multiple reports
2. Open `/compare`
3. Select saved reports
4. Adjust weights
5. Generate a comparison report

#### 9.6 History

Use `/history` to:

- reopen previous searches
- revisit comparison runs
- restore prior inputs

### 10. Quality Commands

Lint:

```bash
pnpm lint
```

Unit tests:

```bash
pnpm test:unit
```

E2E tests:

```bash
pnpm test:e2e
```

Full build:

```bash
pnpm build
```

### 11. Current Characteristics

- Guided live scan instead of naive frame-by-frame recording
- Shared report pipeline for live and manual modes
- Refresh-safe report snapshots
- 3D Room View marker support
- Multi-property comparison
- Knowledge-base-assisted renter guidance
- Map + web fused intelligence

### 12. Known Limitations

- 3D reconstruction is approximate, not measurement-grade
- Some provider-backed capabilities fall back when keys are missing
- Public web evidence quality depends partly on search result quality
- Report sharing is still primarily local-snapshot based

### 13. Development Guidance

- Add shared fields in `packages/contracts` first
- Validate API inputs/outputs with Zod
- Keep async status naming consistent:
  - `idle`
  - `loading`
  - `success`
  - `fallback`
  - `error`

