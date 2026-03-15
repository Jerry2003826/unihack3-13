# Contributing to RentRadar

Thank you for your interest in contributing to RentRadar! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Branch Strategy](#branch-strategy)
- [Commit Conventions](#commit-conventions)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Python** >= 3.10 (for the ops agent only)
- macOS / Linux / Windows

### Installation

```bash
# Clone the repository
git clone https://github.com/Jerry2003826/unihack3-13.git
cd unihack3-13

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys (at minimum: GEMINI_API_KEY, GOOGLE_MAPS_API_KEY)

# Start development servers
pnpm dev
```

### Running Individual Apps

```bash
pnpm dev:web   # Frontend at http://localhost:3000
pnpm dev:api   # API at http://localhost:3001
```

### Optional: Knowledge Base (RAG)

If you want to work on the knowledge base features:

```bash
# Start Qdrant vector database
docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:latest

# Index knowledge documents
pnpm --filter api run knowledge:index
```

## Project Structure

```
Inspect/
├── apps/
│   ├── web/          # Next.js frontend (React 19, Tailwind v4)
│   └── api/          # Next.js API routes (Gemini, Maps, RAG)
├── packages/
│   ├── contracts/    # Shared Zod schemas and TypeScript types
│   └── ui/           # Shared UI components
├── agentic-workflow/ # Python autonomous ops agent
└── tests/            # E2E tests (Playwright)
```

### Key Directories

| Directory | Purpose |
|---|---|
| `apps/api/src/lib/agents/` | AI agent implementations (geo, community, search, maps) |
| `apps/api/src/lib/vision/` | Vision analysis, 3D reconstruction, live scan |
| `apps/api/src/lib/knowledge/` | RAG pipeline (Cohere + Qdrant) |
| `apps/api/src/lib/providers/` | External service integrations (Gemini, MiniMax, Google Maps) |
| `apps/web/src/lib/` | Frontend state management, utilities, hooks |
| `packages/contracts/src/` | Shared schemas, scoring, paperwork logic |

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code, deployed to VPS |
| `feat/*` | New feature development |
| `fix/*` | Bug fixes |
| `docs/*` | Documentation updates |
| `chore/*` | Tooling, config, dependency updates |

### Rules

- `main` must always build cleanly (`pnpm build` passes)
- All feature branches should be rebased onto `main` before merging
- Direct pushes to `main` are acceptable for hotfixes and documentation

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `chore` | Build process, tooling, config |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `perf` | Performance improvement |

### Scopes (optional)

`web`, `api`, `contracts`, `ui`, `ops`, `ci`

### Examples

```
feat(api): add smart gateway for dynamic model switching
fix(web): prevent report page crash on missing intelligence data
docs: update README with engineering deep-dive section
chore(api): remove deprecated zod-to-json-schema dependency
test(contracts): add scoring edge case tests
```

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make changes** following the code standards below.

3. **Run checks locally**:
   ```bash
   pnpm build          # Ensure TypeScript compiles
   pnpm test:unit      # Run unit tests
   pnpm lint           # Lint all packages
   ```

4. **Commit** with a conventional commit message.

5. **Push and create a PR** against `main`.

## Code Standards

### TypeScript

- Strict mode enabled — no `any` unless absolutely necessary (cast with comment)
- All AI responses validated through Zod schemas
- Use `callGeminiJson()` for structured model outputs (never raw string parsing)
- Every agent function returns typed results with optional `fallbackReason`

### File Naming

- Components: `PascalCase.tsx` (e.g., `RoomSceneViewer.tsx`)
- Utilities: `camelCase.ts` (e.g., `liveGuidance.ts`)
- Tests: `<module>.test.ts` (co-located with source)
- API routes: `route.ts` inside kebab-case directories

### Error Handling

- No single AI failure should crash a request
- Every route handler wraps AI calls in try-catch with typed fallback responses
- Use `withTimeout()` wrapper for all external API calls
- Rate limit all public endpoints with sliding window + `429 + Retry-After`

## Testing

### Unit Tests

```bash
pnpm test:unit             # Run all unit tests
pnpm test:unit -- --watch  # Watch mode
```

Unit tests use **Vitest** and cover: scoring algorithms, checklist logic, live scan helpers (IoU, focus confirmation), room state machines, knowledge query, search relevance, and more.

### E2E Tests

```bash
pnpm test:e2e   # Run Playwright tests
```

E2E tests cover: demo smoke flow, manual upload flow, comparison flow.

### Writing Tests

- Place test files next to the source file: `myModule.ts` → `myModule.test.ts`
- Use descriptive test names: `"only auto-records critical or high severity live observations"`
- Test both success paths and edge cases / error paths

## Pull Request Process

1. Ensure `pnpm build` and `pnpm test:unit` pass locally
2. Write a clear PR description explaining **what** and **why**
3. Reference any related issues
4. Request review from a team member
5. Squash-merge into `main` when approved

## Questions?

Open an issue or reach out to the maintainers. We appreciate all contributions!
