# RentRadar

中文 | [English](#english)

RentRadar 是一个面向租房/看房场景的 AI 辅助风险检查系统。它把实时扫描、图片分析、地理情报、租前建议、比较推荐、3D 房间示意和报告导出放在同一套产品流程里。

RentRadar is an AI-assisted rental inspection and decision-support system. It combines live scan guidance, image analysis, location intelligence, pre-lease advice, multi-property comparison, approximate 3D room views, and exportable reports in one workflow.

---

## 中文

### 1. 项目概览

RentRadar 解决的是"看房时信息不完整、签约前风险难判断、检查记录容易遗漏"的问题。当前系统支持：

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

#### CORS 与部署

```bash
DEPLOY_TARGET=              # local | api | frontend
CORS_ALLOWED_ORIGINS=       # 逗号分隔的 origin 列表
```

### 9. 核心工作流详解

#### 9.1 实时扫描工作流 (Live Scan Workflow)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  启动摄像头  │────▶│  选择房间   │────▶│  开始扫描   │
│             │     │  类型       │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Vision     │
                                        │  Engine     │
                                        │  分析循环   │
                                        └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
            ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
            │  AI 分析    │           │  语音播报   │           │  目标引导   │
            │  /analyze   │           │  MiniMax    │           │  视觉提示   │
            │  /live      │           │  TTS        │           │             │
            └─────────────┘           └─────────────┘           └─────────────┘
                    │                          │                          │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  复检确认   │
                                        │  (高风险)   │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  结束扫描   │
                                        │  生成报告   │
                                        └─────────────┘
```

**关键组件：**
- `useCameraStream.ts` - 摄像头捕获与帧提取
- `useVisionEngine.ts` - 视觉分析引擎（60请求/分钟限流）
- `liveGuidance.ts` - 引导目标系统（每个房间类型有预定义目标序列）
- `liveRoomState.ts` - 房间扫描状态机

**状态机设计：**
```typescript
interface LiveRoomScanState {
  roomType: RoomType;
  status: "not-started" | "in-progress" | "complete" | "forced-incomplete";
  requiredTargets: string[];      // 必需目标
  optionalTargets: string[];      // 可选目标
  escalationTargets: string[];    // 升级目标（隐患追踪）
  completedTargets: string[];     // 已完成
  missingTargets: string[];       // 缺失
  skippedTargets: string[];       // 跳过
  coverageStatus: "insufficient-evidence" | "complete";
  endAllowed: boolean;
  endBlockedReasons: string[];
  hazardEscalations: LiveHazardEscalation[];
}
```

**房间裁决逻辑：**
- `pass` - 证据充足，无隐患
- `caution` - 证据充足，有需要跟进的问题
- `fail` - 存在高风险问题
- `insufficient-evidence` - 证据不足

#### 9.2 报告生成工作流 (Report Generation Workflow)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  扫描结束   │────▶│  构建快照   │────▶│  保存到     │────▶│  跳转报告页 │
│             │     │  Report     │     │  IndexedDB  │     │             │
└─────────────┘     │  Snapshot   │     └─────────────┘     └──────┬──────┘
                    └─────────────┘                                │
                                                                     │
                    ┌────────────────────────────────────────────────┘
                    │
                    ▼
            ┌─────────────┐
            │  渐进式加载  │
            │  增强内容   │
            └──────┬──────┘
                   │
       ┌───────────┼───────────┬───────────┐
       │           │           │           │
       ▼           ▼           ▼           ▼
 ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
 │ 地理情报 │ │ 社区反馈 │ │ 中介背景 │ │ 决策建议 │
 │/intel   │ │/intel   │ │/intel   │ │/negotiate│
 └─────────┘ └─────────┘ └─────────┘ └─────────┘
       │           │           │           │
       └───────────┴───────────┴───────────┘
                   │
                   ▼
            ┌─────────────┐
            │  知识库查询  │
            │ /knowledge  │
            │ /query      │
            └─────────────┘
```

**关键特性：**
- **渐进式增强** - 核心数据优先显示，异步加载增强内容
- **优雅降级** - 每个模块独立加载，失败时使用 fallback 数据
- **规范化管道** - `normalizeReportSnapshot()` 确保数据完整性

#### 9.3 情报收集工作流 (Intelligence Gathering Workflow)

**并行多 Agent 架构：**

```typescript
const [geoResult, groundedResult, communityResult, agencyResult] = 
  await Promise.allSettled([
    analyzeGeoContext({ address, coordinates, targetDestinations, depth }),
    summarizeMapsGroundedIntelligence({ address, coordinates, agency, depth }),
    researchCommunity({ address, coordinates, propertyNotes, depth }),
    analyzeAgencyBackground({ agency, depth }),
  ]);
```

**Agent 分工：**

| Agent | 职责 | 数据源 |
|-------|------|--------|
| `geoAnalyzer.ts` | 地理分析 | Google Maps Geocoding, Places, Routes API |
| `searchAgent.ts` | 中介背景 | Tavily Search, Gemini Grounded |
| `communityResearchAgent.ts` | 社区研究 | Google Search, Gemini |
| `mapsGroundedIntelligence.ts` | 地图融合 | Google Maps + Gemini |

**多源融合 (Fusion)：**
```typescript
interface IntelligenceFusion {
  mapSignals: string[];      // 地图信号
  webSignals: string[];      // 网络信号
  conflicts: string[];       // 冲突检测
  confidence: number;        // 置信度
}
```

**冲突检测示例：**
- 地图显示交通便利，但网络证据显示噪音问题
- 系统会标注冲突并提供平衡视角

#### 9.4 知识库 RAG 工作流 (Knowledge Base RAG Workflow)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User       │────▶│  Cohere     │────▶│  Qdrant     │────▶│  重排序     │
│  Query      │     │  Embedding  │     │  Vector DB  │     │  (可选)     │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                     │
                    ┌────────────────────────────────────────────────┘
                    │
                    ▼
            ┌─────────────┐     ┌─────────────┐
            │  Top-K      │────▶│  Gemini     │
            │  匹配       │     │  Generate   │
            │  (默认4个)  │     │  Answer     │
            └─────────────┘     └─────────────┘
```

**技术细节：**
- **文档切分** - 420 字符滑动窗口
- **嵌入模型** - Cohere embed-english-v3
- **向量数据库** - Qdrant (本地/远程)
- **检索策略** - Dense Retrieval + 可选 Rerank
- **生成模型** - Gemini 2.5 Flash

**降级策略：**
- RAG 不可用时，自动切换到关键词匹配 fallback
- 追踪透明性 - 返回完整的查询追踪信息

#### 9.5 比较工作流 (Comparison Workflow)

**输入：**
- 候选报告列表 (2-5 个)
- 因子权重 (FactorWeights): 预算、通勤、噪音、照明、条件、中介、社区
- 偏好配置 (PreferenceProfile): 预算上限、噪音容忍度

**算法：**
```typescript
// 加权评分系统
const score = 
  budgetScore * weights.budget +
  commuteScore * weights.commute +
  noiseScore * weights.noise +
  lightingScore * weights.lighting +
  conditionScore * weights.condition +
  agencyScore * weights.agency +
  communityScore * weights.community;
```

**输出：**
- 排名候选列表
- 胜出原因分析
- 权衡分析 (Trade-offs)
- 相关知识库匹配
- 文书检查清单

#### 9.6 3D 房间重建工作流 (3D Reconstruction Workflow)

**非 LiDAR 的 AI 驱动重建：**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  3-8 张     │────▶│  每张分析   │────▶│  场景综合   │
│  房间照片   │     │  (Gemini)   │     │  (Gemini)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  3D Scene   │
                                        │  - 尺寸     │
                                        │  - 开口     │
                                        │  - 家具     │
                                        │  - 标记     │
                                        └─────────────┘
```

**分析步骤：**
1. **单帧分析** - 每张图片独立分析，提取房间结构信号
2. **多视角融合** - 合并多个视角的分析结果
3. **场景综合** - Gemini 2.5 Pro 生成统一场景描述
4. **几何约束** - 应用尺寸范围、位置边界等约束

**输出结构：**
```typescript
interface RoomScene3D {
  sceneId: string;
  dimensionsApprox: { width: number; depth: number; height: number };
  openings: Opening[];      // 门、窗、阳台、通风口
  furniture: Furniture[];   // 家具布局
  markers: SceneMarker[];   // 隐患标记
}
```

#### 9.7 清单预填充工作流 (Checklist Prefill Workflow)

**字段分类策略：**

```typescript
// 可通过远程研究填充的字段
const REMOTE_FRIENDLY_FIELD_PATHS = [
  "security.nightEntryRoute",
  "noise.weekdayMorning",
  "noise.lateNight",
  "leaseCosts.hiddenFees",
  "buildingManagement.repairTurnaround",
];

// 几乎总是需要人工确认的字段
const MANUAL_PRIORITY_FIELD_PATHS = [
  "utilities.hotWater",
  "security.doorLocks",
  "kitchenBathroom.toiletFlush",
  "pestsHiddenIssues.pests",
];
```

**流程：**
1. 并行收集情报（地理、社区、中介）
2. 启发式预填充（基于规则）
3. AI 结构化预填充（Gemini）
4. 返回清单 + 自动填充字段 + 需人工审核字段

#### 9.8 房源发现工作流 (Listing Discovery Workflow)

**发现 API：**
- 输入：地址
- 输出：候选房源 URL 列表
- 限流：12 请求 / 2 分钟

**提取 API：**
- 输入：房源 URL
- 输出：房源详情（标题、摘要、租金、特性、清单提示）
- 限流：10 请求 / 2 分钟

### 10. Docker 部署架构

#### 10.1 部署策略

RentRadar 采用**混合部署策略**：
- **应用层**: PM2 直接管理 Node.js 进程（非容器化）
- **向量数据库**: Docker 运行 Qdrant（唯一容器化组件）

**设计决策原因：**
1. **Serverless 优先**: 主要面向 Vercel、Render 等 Serverless 平台
2. **Monorepo 复杂性**: pnpm workspace 结构使得多阶段构建复杂
3. **Node.js 进程管理**: PM2 提供比 Docker 更轻量的进程管理

#### 10.2 Qdrant Docker 配置

```bash
# VPS 部署脚本中的 Docker 配置
setup_qdrant() {
  docker run -d \
    --name qdrant \
    --restart unless-stopped \
    -p 127.0.0.1:6333:6333 \
    -v /opt/inspect-ai/qdrant_storage:/qdrant/storage \
    qdrant/qdrant:latest
}
```

| 特性 | 实现 |
|------|------|
| 容器镜像 | `qdrant/qdrant:latest` |
| 端口映射 | `127.0.0.1:6333:6333`（仅本地访问） |
| 数据持久化 | `/opt/inspect-ai/qdrant_storage:/qdrant/storage` |
| 重启策略 | `unless-stopped` |
| 网络隔离 | 绑定到 localhost，不暴露公网 |

#### 10.3 PM2 进程管理

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "inspect-web",
      cwd: "/opt/inspect-ai",
      script: "pnpm",
      args: "--filter web start",
      env: { NODE_ENV: "production", PORT: 3000 },
      instances: 1,
      exec_mode: "fork",
    },
    {
      name: "inspect-api",
      cwd: "/opt/inspect-ai",
      script: "pnpm",
      args: "--filter api start",
      env: { NODE_ENV: "production", PORT: 3001 },
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
```

#### 10.4 VPS 部署架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        VPS Server                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Nginx     │────│   PM2       │────│  Node.js    │     │
│  │   (80/443)  │    │   Process   │    │  Apps       │     │
│  │             │    │   Manager   │    │             │     │
│  └─────────────┘    └──────┬──────┘    └──────┬──────┘     │
│                            │                   │            │
│                     ┌──────┴──────┐    ┌──────┴──────┐     │
│                     │  inspect-web│    │  inspect-api│     │
│                     │  (port 3000)│    │  (port 3001)│     │
│                     └─────────────┘    └──────┬──────┘     │
│                                               │            │
│                              ┌────────────────┘            │
│                              │                             │
│                     ┌────────┴────────┐                   │
│                     │   Docker        │                   │
│                     │   Qdrant        │                   │
│                     │   (port 6333)   │                   │
│                     └─────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 10.5 部署选项

| 选项 | 前端 | API | 向量DB | 适用场景 |
|------|------|-----|--------|---------|
| **A -  easiest** | Vercel | Vercel | 无 | 快速启动，无RAG |
| **B - balanced** | Vercel | Render/Railway | 托管Qdrant | 中等规模 |
| **C - full control** | VPS | VPS | Docker Qdrant | 完整功能 |

### 11. AI 工作流架构

#### 11.1 系统架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RentRadar AI 工作流架构                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   前端应用   │───▶│   API 路由   │───▶│  AI Agent   │───▶│  外部服务   │  │
│  │  (Next.js)  │    │  (Route H)  │    │   协调层    │    │  (多模型)   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│        │                  │                  │                  │          │
│        ▼                  ▼                  ▼                  ▼          │
│   Live Scan          /api/analyze      geoAnalyzer         Gemini         │
│   Manual Upload      /api/intelligence searchAgent         Google Maps    │
│   Report View        /api/negotiate    communityResearch   Cohere        │
│   Compare            /api/knowledge    mapsGroundedIntel   Qdrant        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 11.2 多模型协调策略

**模型配置矩阵：**

```typescript
export const appEnv = {
  // Gemini 模型家族
  geminiVisionModel: "gemini-2.5-flash",        // 视觉分析
  geminiLiveModel: "gemini-2.5-flash",          // 实时扫描
  geminiSceneExtractModel: "gemini-2.5-flash",  // 3D场景提取
  geminiSceneSynthesisModel: "gemini-2.5-pro",  // 3D场景合成
  geminiGroundedModel: "gemini-2.5-flash",      // Grounding 搜索
  geminiIntelligenceModel: "gemini-2.5-flash-lite", // 轻量情报
  geminiReasoningModel: "gemini-2.5-pro",       // 复杂推理
  
  // Cohere 模型
  cohereEmbedModel: "embed-v4.0",               // 文本嵌入
  cohereRerankModel: "rerank-v4.0-pro",         // 结果重排序
  
  // MiniMax TTS
  minimaxTtsModel: "speech-2.8-hd",
};
```

**模型分工策略：**

| 任务类型 | 主模型 | 备用/辅助 | 选择理由 |
|---------|--------|----------|---------|
| **图像分析** | Gemini 2.5 Flash | - | 速度快、成本低、多模态 |
| **地理情报** | Gemini + Google Maps | Web Search | Grounding 增强 |
| **社区研究** | Gemini 2.5 Flash | Search Grounding | 多 Pass 搜索 |
| **中介背景** | Gemini 2.5 Flash | Search Grounding | 多 Pass 搜索 |
| **知识库 RAG** | Cohere Embed | Cohere Rerank | 专业嵌入/排序 |
| **答案生成** | Gemini 2.5 Flash | 本地 Fallback | 成本与质量平衡 |
| **语音合成** | MiniMax TTS | - | 中文支持好 |

#### 11.3 AI 调用链路详解

**图片分析链路：**

| 步骤 | 操作 | 模型/服务 | 超时 |
|------|------|-----------|------|
| 1 | 图片获取 (Spaces/base64) | DigitalOcean Spaces | - |
| 2 | 视觉分析 | Gemini 2.5 Flash | 25s |
| 3 | 危害去重 | 本地算法 | - |
| 4 | 光照评分 | 启发式算法 | - |
| 5 | 缩略图生成 | Jimp | - |

**情报分析链路：**

```
┌────────────────────────────────────────┐
│         Intelligence Route             │
│           (45s maxDuration)            │
├────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐     │
│  │ Geo Context │  │ Maps Ground │     │
│  │  (多源聚合)  │  │ (Gemini+Maps)│    │
│  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐     │
│  │  Community  │  │   Agency    │     │
│  │ (Search×3-5)│  │ (Search×3-4)│     │
│  └─────────────┘  └─────────────┘     │
│           │                            │
│           ▼                            │
│  ┌─────────────────────────┐          │
│  │    Fusion (信号融合)     │          │
│  │  - 冲突检测              │          │
│  │  - 置信度评估            │          │
│  └─────────────────────────┘          │
└────────────────────────────────────────┘
```

#### 11.4 提示词工程 (Prompt Engineering)

**结构化输出强制：**

```typescript
export async function callGeminiJson<TSchema extends ZodTypeAny>(args: {
  model: string;
  prompt: string;
  schema: TSchema;  // Zod Schema 约束
  timeoutMs?: number;
}) {
  const response = await client.models.generateContent({
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: createGeminiSchema(args.schema),  // JSON Schema
    },
  });
  return args.schema.parse(JSON.parse(extractJsonText(rawText)));  // 双重验证
}
```

**视觉分析提示词示例：**

```typescript
function buildPrompt(request: AnalyzeRequest) {
  return [
    "You are inspecting rental property photos for tenant-visible risks.",
    "Return only a JSON array of hazard drafts.",
    "Detect visible issues only. Do not infer hidden problems without image evidence.",
    "Allowed categories: Mould, Structural, Plumbing, Pest, Electrical, Safety, Other.",
    "Allowed severities: Critical, High, Medium, Low.",
    "Each hazard must contain category, severity, and a short tenant-friendly description.",
    "Descriptions must be plain English, one sentence, under 90 characters...",
    request.source === "manual"
      ? "You may receive multiple photos of the same property. Merge duplicate findings across images."
      : "You are analyzing a single live camera frame.",
    `Current room type context: ${request.roomType}.`,
  ].filter(Boolean).join("\n");
}
```

**提示词设计原则：**
1. **角色定义**: "tenant-visible risks" 明确角色边界
2. **输出格式**: 强制 JSON，限定字段
3. **约束条件**: 字符数限制、类别限制
4. **上下文注入**: roomType、source 动态插入

#### 11.5 错误处理与降级机制

**多层降级架构：**

```
┌─────────────────────────────────────────┐
│         错误处理层级架构                 │
├─────────────────────────────────────────┤
│  Layer 1: 请求级 (Route Handler)        │
│    - Schema 验证失败 → 返回空结果        │
│    - 限流触发 → 429 + Retry-After       │
├─────────────────────────────────────────┤
│  Layer 2: 服务级 (Agent)                │
│    - API 超时 → Fallback 数据           │
│    - 搜索无结果 → 降级到本地知识库        │
├─────────────────────────────────────────┤
│  Layer 3: 模型级 (AI Call)              │
│    - Gemini 失败 → 返回 fallbackReason  │
│    - 重试机制 (withTimeout)             │
├─────────────────────────────────────────┤
│  Layer 4: 数据级 (Fallback Builder)     │
│    - 生成默认/提示性内容                 │
│    - 保持 UI 可用性                      │
└─────────────────────────────────────────┘
```

**超时控制：**

```typescript
export async function withTimeout<T>(factory: () => Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    factory()
      .then((value) => { clearTimeout(timeout); resolve(value); })
      .catch((error) => { clearTimeout(timeout); reject(error); });
  });
}
```

#### 11.6 成本优化策略

**模型选择优化：**

| 场景 | 使用模型 | 成本级别 |
|------|---------|---------|
| 视觉分析 | Gemini 2.5 Flash | $ |
| 简单情报 | Gemini 2.5 Flash-lite | $ |
| 复杂推理 | Gemini 2.5 Pro | $$ |
| 嵌入 | Cohere embed-v4.0 | $ |
| 重排序 | Cohere rerank-v4.0-pro | $$ |

**缓存策略：**

```typescript
// 内存缓存
let cachedKnowledgeDocs: KnowledgeDocument[] | null = null;
let cachedKnowledgeChunks: KnowledgeChunk[] | null = null;

// Gemini 客户端单例
let client: GoogleGenAI | null | undefined;
export function getGeminiClient(): GoogleGenAI | null {
  if (client !== undefined) return client;
  client = appEnv.geminiApiKey ? new GoogleGenAI({ apiKey: appEnv.geminiApiKey }) : null;
  return client;
}
```

**搜索结果过滤：**

```typescript
export function filterGroundedWebCatalog(catalog: GroundedCatalogItem[], args: {
  channel: Channel;
  context: string[];
  minScore?: number;
  fallbackCount?: number;
}) {
  const scored = catalog.map((item) => ({
    item,
    score: scoreGroundedWebItem(item, args.channel, args.context),
  })).sort((left, right) => right.score - left.score);
  
  return scored.filter((entry) => entry.score >= (args.minScore ?? 3));
}
```

**过滤策略：**
- 域名白名单/黑名单
- 路径模式匹配
- 关键词相关性评分
- 低价值内容过滤（营业时间、地图列表等）

#### 11.7 RAG 实现详解

**架构图：**

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG Pipeline                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Query ──▶ Tokenize ──▶ Embed (Cohere) ──▶ Search (Qdrant) │
│                                                             │
│  Retrieved Chunks ──▶ Rerank (Cohere) ──▶ Generate (Gemini) │
│                                                             │
│  Fallback: Local keyword search (no embedding cost)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**文档切分策略：**

```typescript
const KNOWLEDGE_CHUNK_TARGET = 420;   // 目标字符数
const KNOWLEDGE_CHUNK_OVERLAP = 80;   // 重叠字符数
const RAG_RETRIEVE_LIMIT = 12;        // 检索数量

function findChunkBoundary(text: string, start: number, suggestedEnd: number) {
  const max = Math.min(text.length, suggestedEnd + 60);
  const min = Math.min(text.length, start + Math.floor(KNOWLEDGE_CHUNK_TARGET * 0.55));
  
  let boundary = suggestedEnd;
  for (let index = suggestedEnd; index <= max; index += 1) {
    const char = text[index];
    if (char === "." || char === "!" || char === "?" || char === ";") {
      boundary = index + 1;
      break;
    }
  }
  return boundary;
}
```

**混合检索：**

```typescript
export function queryKnowledge(args: { query: string; tags?: string[]; topK?: number }) {
  const scored = chunks.map((chunk) => {
    let score = 0;
    // 关键词匹配
    for (const token of queryTokens) {
      if (docText.includes(token)) score += 4;
    }
    // 标签匹配
    for (const tag of chunk.tags) {
      if (requestedTags.has(tag.toLowerCase())) score += 6;
    }
    return { chunk, score };
  });
}
```

### 12. 技术实现细节

#### 12.1 离线优先架构

**数据层：**
- IndexedDB 存储报告快照
- Zustand + persist 状态持久化
- 刷新后自动恢复会话

**关键实现：**
```typescript
// 报告快照存储
const saveReportSnapshot = async (snapshot: ReportSnapshot) => {
  const db = await openDB('rentradar', 1);
  await db.put('reports', snapshot, snapshot.reportId);
};

// 状态恢复
useEffect(() => {
  const loadSession = async () => {
    const saved = await getSavedSession();
    if (saved) restoreSession(saved);
  };
  loadSession();
}, []);
```

#### 12.2 类型安全架构

**Contracts 包：**
```typescript
// packages/contracts/src/schemas.ts
export const HazardSchema = z.object({
  id: z.string(),
  type: z.enum(['structural', 'electrical', 'plumbing', 'environmental']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  evidence: z.array(z.string()), // image URLs
});

export type Hazard = z.infer<typeof HazardSchema>;
```

**API 端点类型：**
```typescript
// apps/api/src/app/api/analyze/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: 'validation_error',
      message: 'Invalid request body',
      status: 400,
    });
  }
  // parsed.data 完全类型安全
}
```

#### 12.3 速率限制与降级

**限流配置：**
- `/api/analyze/live` - 60 请求/分钟
- `/api/listing/discover` - 12 请求/2分钟
- `/api/listing/extract` - 10 请求/2分钟

**降级策略：**
```typescript
const geo = geoResult.status === "fulfilled" 
  ? geoResult.value 
  : {
      geoAnalysis: buildGeoFallback({ address }),
      fallbackReason: "geo_failed",
      provider: "fallback",
    };
```

### 13. 测试

#### 单元测试

```bash
pnpm test:unit
```

使用 Vitest，覆盖：
- 工具函数
- Store 逻辑
- 类型转换

#### E2E 测试

```bash
pnpm test:e2e
```

使用 Playwright，覆盖：
- 完整用户流程
- 跨页面状态保持
- 响应式布局

### 14. 部署

#### VPS 部署

参考 `DEPLOY.md` 和 `scripts/deploy-vps.sh`：

```bash
# 配置服务器
./scripts/deploy-vps.sh

# 或使用 PM2
pm2 start ecosystem.config.js
```

#### Vercel 部署

```bash
# 前端
vercel --prod

# API（需要配置环境变量）
vercel --prod --cwd apps/api
```

### 15. 安全最佳实践

- 所有 API 密钥存储在服务端 `.env.local`
- 前端仅使用 `NEXT_PUBLIC_` 前缀的公开配置
- CORS 白名单限制跨域请求
- 上传使用预签名 URL，避免暴露密钥
- 输入数据 Zod 验证
- 输出数据类型安全

### 16. 开发建议

#### 添加新页面

1. 在 `apps/web/src/app/` 创建目录
2. 添加 `page.tsx` 和可选的 `loading.tsx`
3. 使用 `useSessionStore` 管理状态
4. 添加路由到 `next.config.ts` 的 headers 配置

#### 添加新 API

1. 在 `apps/api/src/app/api/` 创建目录结构
2. 添加 `route.ts`，导出 HTTP 方法处理函数
3. 使用 `ensureCrossOriginAllowed` 处理 CORS
4. 使用 Zod schema 验证输入
5. 添加类型到 `packages/contracts`

#### 添加新 Agent

1. 在 `apps/api/src/lib/agents/` 创建文件
2. 导出 `run` 函数，接收上下文参数
3. 使用 `callGemini` 或 `callGeminiJson` 调用模型
4. 返回结构化结果

---

## English

### Overview

RentRadar is an AI-assisted rental inspection system that combines real-time scanning, image analysis, location intelligence, and report generation.

### Key Features

- **Live Inspection**: AI-guided real-time camera scanning with voice alerts
- **Manual Upload**: Batch image analysis for existing photos
- **Report Center**: Comprehensive risk assessment with 3D room views
- **Multi-property Compare**: Side-by-side comparison with recommendations
- **Knowledge Base**: RAG-enhanced rental advice

### Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Three.js
- **Backend**: Next.js API Routes, Zod, Google Gemini
- **AI**: Multi-model strategy (Gemini 2.5 Flash/Pro), Tavily Search, MiniMax TTS
- **Storage**: IndexedDB, Qdrant Vector DB
- **Maps**: Google Maps Platform

### Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Visit `http://localhost:3000`

### Documentation

See full documentation in [README.md](./README.md) (Chinese).
