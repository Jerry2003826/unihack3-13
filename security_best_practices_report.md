# Security Best Practices Report

## Executive Summary

Scope reviewed:

- `apps/web`
- `apps/api`
- `packages/contracts`

Audit level: `L5` by request.

This workspace is a TypeScript/Next.js application with a browser-heavy workflow and an `apps/api` package that is expected to expose `/api/analyze` and `/api/intelligence`, but no Route Handlers are present in the checked-in `apps/api/src` tree. The most important confirmed issues are:

1. A production-reachable hidden demo switch lets any user flip the product into fake-data mode.
2. The API app defaults all `/api/*` endpoints to wildcard CORS.
3. Sensitive inspection data is persisted in browser storage for extended periods with no trust-boundary protection.

Where protections may exist in infrastructure, that uncertainty is called out explicitly.

## High Severity

### INSPECT-SEC-001: Hidden demo toggle allows unauthenticated integrity bypass

- Severity: High
- Locations:
  - `apps/web/src/components/shared/FallbackTrigger.tsx:16`
  - `apps/web/src/components/shared/FallbackTrigger.tsx:27`
  - `apps/web/src/app/page.tsx:48`
  - `apps/web/src/app/radar/page.tsx:29`
  - `apps/web/src/hooks/useVisionEngine.ts:56`
- Evidence:

```tsx
if (validClicks.length >= 3) {
  const nextState = !isDemoMode;
  setIsDemoMode(nextState);
}
```

```tsx
<div
  className="fixed top-0 right-0 w-16 h-16 z-50 cursor-default"
  onClick={() => setClicks((prev) => [...prev, Date.now()])}
  title="Hidden Demo Toggle Area"
/>
```

`FallbackTrigger` is mounted on the home page, and `isDemoMode` later switches the app from live API calls to mock intelligence / mock hazard timelines.

- Impact: Any end user who knows or discovers the hidden click area can silently force mock intelligence and mock hazard results, undermining the integrity of risk assessments and any generated inspection outputs.
- Fix: Gate demo mode behind an explicit non-production build flag and an authenticated/admin-only control, or remove it entirely from production bundles.
- Mitigation: If demo mode must exist, surface a persistent visual banner and watermark all outputs derived from mock data.
- False positive notes: None. This behavior is directly reachable in checked-in client code.

## Medium Severity

### INSPECT-SEC-002: `/api/*` CORS policy falls back to `*`

- Severity: Medium
- Locations:
  - `apps/api/next.config.ts:9`
  - `apps/web/src/app/radar/page.tsx:57`
  - `apps/web/src/hooks/useVisionEngine.ts:94`
- Evidence:

```ts
{ key: "Access-Control-Allow-Origin", value: process.env.CORS_ALLOWED_ORIGINS || "*" },
```

The web client is wired to call cross-origin API endpoints for `POST /api/intelligence` and `POST /api/analyze`.

- Impact: If these endpoints are implemented in `apps/api` as intended, every origin is allowed by default to call them. For an AI-backed service that processes address data and inspection images, this turns the backend into a publicly callable cross-origin service unless another auth boundary exists elsewhere.
- Fix: Require an explicit allowlist value at startup and fail closed when `CORS_ALLOWED_ORIGINS` is unset. Avoid wildcard CORS for non-public APIs.
- Mitigation: Add authentication, per-origin validation, and rate limiting on every request-facing endpoint.
- False positive notes: No Route Handlers are present in the checked-in `apps/api/src` tree, so this is a latent but directly configured exposure rather than a confirmed live endpoint exploit.

### INSPECT-SEC-003: Sensitive inspection context is persisted in browser storage

- Severity: Medium
- Locations:
  - `apps/web/src/store/useSessionStore.ts:52`
  - `apps/web/src/store/useSessionStore.ts:72`
  - `apps/web/src/store/useSessionStore.ts:109`
  - `apps/web/src/store/useHazardStore.ts:107`
  - `apps/web/src/app/scan/page.tsx:63`
  - `apps/web/src/lib/report-snapshot/reportSnapshotStore.ts:37`
  - `packages/contracts/src/schemas.ts:169`
  - `packages/contracts/src/schemas.ts:184`
- Evidence:

```ts
storage: createJSONStorage(() => sessionStorage)
```

```ts
await (await db).put(SNAPSHOT_STORE, snapshot);
```

The persisted state and snapshot schema include address, agency, coordinates, property notes, hazards, intelligence, and optional base64 export assets / thumbnails.

- Impact: Any XSS, malicious extension, or shared-device access can read or tamper with inspection context and saved reports. The IndexedDB retention window is up to 7 days and 20 snapshots, which materially increases exposure.
- Fix: Minimize persisted fields, keep sensitive data in memory where possible, and avoid storing report artifacts or location data in browser storage unless absolutely necessary.
- Mitigation: Encrypt server-side, move report persistence to an authenticated backend, and clear client caches aggressively after export/submission.
- False positive notes: This is a client-side privacy/integrity issue. The actual business sensitivity depends on deployment and user population, but the storage behavior is confirmed in code.

### INSPECT-SEC-004: Manual upload flow relies on client hints, not real file validation

- Severity: Medium
- Locations:
  - `apps/web/src/app/manual/page.tsx:40`
  - `apps/web/src/app/manual/page.tsx:126`
- Evidence:

```tsx
if (images.length + files.length > 8) {
  toast.error("Maximum 8 images allowed");
  return;
}
```

```tsx
<input type="file" multiple accept="image/jpeg,image/png,image/webp" ... />
```

Only count and browser `accept` filtering are enforced. There is no MIME verification, size limit, magic-byte validation, or EXIF/privacy handling in the active manual upload path.

- Impact: When the stubbed upload flow is connected to a backend, oversized or malformed files will reach deeper into the pipeline than intended, and image metadata handling will be inconsistent.
- Fix: Validate file size and MIME type in the browser for UX, then repeat strict validation server-side before upload or processing.
- Mitigation: Centralize upload validation in a shared schema/helper and reject unsupported files before generating object URLs.
- False positive notes: The current manual flow is still stubbed, so exploitability depends on future backend wiring.

## Low Severity

### INSPECT-SEC-005: No security header baseline is visible in app code

- Severity: Low
- Locations:
  - `apps/web/next.config.ts:3`
  - `apps/web/src/app/layout.tsx:15`
  - `apps/api/next.config.ts:4`
- Evidence:

`apps/web/next.config.ts` only defines `images.remotePatterns`, and the web layout does not inject a CSP or other browser-enforced protections. `apps/api/next.config.ts` adds CORS/cache headers but no visible CSP, `X-Content-Type-Options`, or clickjacking controls.

- Impact: If edge or platform headers are not set elsewhere, the application loses important defense-in-depth protections against XSS, MIME confusion, and framing.
- Fix: Define a production security-header baseline in app config or deployment config, with CSP as the primary control.
- Mitigation: Verify runtime headers in deployed environments before treating this as resolved.
- False positive notes: These protections may exist in CDN / reverse-proxy / hosting configuration that is not present in this repository.

## Open Questions / Audit Limits

1. `apps/api` depends on `@google/genai` and `@tavily/core`, and the web client calls `/api/analyze` and `/api/intelligence`, but no server Route Handlers are present in the checked-in `apps/api/src` files. I could not audit:
   - input validation on API requests
   - SSRF protections around Tavily or external fetches
   - secret handling for `GEMINI_*`, `TAVILY_API_KEY`, `DO_SPACES_*`
   - rate limiting, auth, or request logging on backend endpoints
2. Runtime/deployment headers were not verified live; this review is repository-only.

## Recommended Fix Order

1. Remove or hard-gate demo mode in production.
2. Change CORS to fail closed and add auth/rate limiting before exposing any `/api/*` route.
3. Reduce browser-side persistence of inspection/report data.
4. Add real upload validation before wiring manual upload to backend processing.
