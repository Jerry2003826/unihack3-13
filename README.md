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

### 9. 技术实现细节

#### 9.1 实时扫描工作流

实时扫描（Live Inspection）是系统的核心功能，采用多阶段 AI 引导机制：

**阶段一：视觉捕获**
- 使用 `useVisionEngine` hook 捕获视频帧
- 通过 Canvas API 提取 Base64 图像数据
- 实时发送到 `/api/analyze/live` 端点

**阶段二：AI 分析**
- Gemini 2.5 Flash 模型分析当前画面
- 识别房间类型、潜在隐患、拍摄角度
- 返回结构化观察结果

**阶段三：引导反馈**
- 根据分析结果生成语音播报（MiniMax TTS）
- 视觉引导：高亮需要拍摄的关键区域
- 检查清单自动更新

**阶段四：复检确认**
- 高风险问题需要用户靠近并确认
- AI 验证拍摄质量后才计入报告
- 避免误报和遗漏

#### 9.2 知识库 RAG 架构

系统内置租房知识库，采用 RAG（Retrieval-Augmented Generation）架构：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ rental-     │────▶│  Text       │────▶│  Cohere     │
│ knowledge.  │     │  Chunking   │     │  Embedding  │
│ json        │     │  (420 chars)│     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  Qdrant     │
                                        │  Vector DB  │
                                        └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User       │────▶│  Dense      │────▶│  Gemini     │
│  Query      │     │  Retrieval  │     │  Generate   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**实现细节：**
- **文档切分**：420 字符滑动窗口，保留上下文
- **向量嵌入**：Cohere embed-english-v3 模型
- **向量存储**：Qdrant 本地/远程混合部署
- **检索策略**：Top-12 候选 + 重排序
- **答案生成**：Gemini 结合检索内容生成可执行建议

#### 9.3 3D 房间重建

非 LiDAR 的 AI 驱动房间重建：

**输入**：多视角房间照片（2-4 张）
**处理流程**：
1. 每张图片独立分析（Gemini Vision）
2. 提取房间类型、家具布局、尺寸估算
3. 多视角融合生成统一场景描述
4. 合成 3D 语义模型（非精确几何，而是功能区域）

**输出**：
- 房间边界框
- 家具位置（相对坐标）
- 风险区域标注
- 可交互 3D 查看器（Three.js）

#### 9.4 多源情报融合

报告中的情报来自多个数据源：

| 数据源 | 用途 | API |
|--------|------|-----|
| Google Maps Geocoding | 地址标准化 | `/api/geocode/reverse` |
| Google Places API | 周边设施查询 | `lib/providers/googlePlaces.ts` |
| Tavily Search | 网络搜索增强 | `lib/providers/tavily.ts` |
| Gemini Grounded | 带引用的生成 | `lib/ai.ts` |

**情报类型：**
- **地理情报**：交通、噪音、安全评分
- **社区情报**：学校、医院、商圈
- **中介情报**：背景调查、历史评价
- **租赁情报**：市场价、合同条款分析

#### 9.5 离线优先架构

系统采用离线优先设计：

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

#### 9.6 多模型 AI 策略

不同任务使用最优模型：

| 任务 | 模型 | 原因 |
|------|------|------|
| 图片分析 | Gemini 2.5 Flash | 速度快、成本低 |
| 场景合成 | Gemini 2.5 Pro | 需要复杂推理 |
| 情报生成 | Gemini 2.5 Flash-Lite | 平衡质量与速度 |
| 合同分析 | Gemini 2.5 Pro | 需要深度理解 |
| 实时引导 | Gemini 2.5 Flash | 低延迟要求 |

#### 9.7 类型安全架构

全链路类型安全：

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

### 10. 测试

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

### 11. 部署

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

### 12. 安全最佳实践

- 所有 API 密钥存储在服务端 `.env.local`
- 前端仅使用 `NEXT_PUBLIC_` 前缀的公开配置
- CORS 白名单限制跨域请求
- 上传使用预签名 URL，避免暴露密钥
- 输入数据 Zod 验证
- 输出数据类型安全

### 13. 开发建议

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
