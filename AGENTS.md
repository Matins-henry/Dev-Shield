# DevShield Development Guidelines & Agent Instructions

This document governs architecture, code quality, TypeScript standards, and testing conventions across the **DevShield** repository.

---

## 1. System Overview & Architecture

DevShield is a high-performance API Gateway, Sliding-Window Rate Limiter, and Metrics Dashboard.

The codebase is organized into modular decoupled subsystems:
- **`/gateway`**: High-throughput proxy server built with **Fastify** and **TypeScript**. Intercepts incoming HTTP requests, enforces sliding-window rate limiting against Redis, captures metrics, and forwards valid requests downstream.
- **`/dashboard`**: Operational and observability dashboard built with **Next.js (App Router)** and **Tailwind CSS**. Visualizes real-time request rates, latency, 429 rejections, and route configurations.
- **`docker-compose.yml`**: Local infrastructure orchestration (Redis 7 and mock downstream echo service).

---

## 2. Strict TypeScript Rules

All TypeScript code in DevShield must adhere to strict compilation and typing standards:

1. **Strict Compiler Settings**:
   - `strict: true` must be enabled in all `tsconfig.json` files.
   - `noImplicitAny: true`, `strictNullChecks: true`, and `noUncheckedIndexedAccess: true` are mandatory.
2. **No Unconstrained `any`**:
   - The use of `any` is strictly prohibited. Use `unknown` with runtime validation (e.g., Zod schemas or type guards) when types are dynamic or incoming over the wire.
3. **Explicit Function & Handler Return Types**:
   - All exported functions, Fastify route handlers, plugin hooks, and Redis client operations must have explicit return types.
4. **Zod Validation at Boundaries**:
   - Validate environment variables, incoming headers, route definitions, and configuration payloads at the boundary using Zod schemas.

---

## 3. Modular Separation of Concerns

The proxy server must maintain strict boundaries between components. Never mix rate-limiting, proxy forwarding, and metrics logic in a single file or monolithic middleware.

```plaintext
gateway/src/
├── config/             # Typed environment configs and route-table rules
├── limiter/            # Redis connection, Lua scripts, sliding-window algorithms
├── proxy/              # Reverse proxy handler, target dispatching, header hygiene
├── analytics/          # Async metrics emission, latency recording, Redis telemetry
├── routes/             # Internal administration endpoints (/health, /metrics, /rules)
└── server.ts           # Fastify server composition and plugin registration
```

### Module Responsibilities:
1. **`limiter/` (Rate Limiting Engine)**:
   - Implements atomic sliding-window rate limiting using Redis sorted sets (`ZADD`, `ZREMRANGEBYSCORE`, `ZCARD`, `EXPIRE`) or equivalent atomic Lua scripts.
   - Computes window states: `limit`, `remaining`, `resetTimeSeconds`, and `retryAfterSeconds`.
   - Populates standard HTTP headers on every proxied or rejected response:
     - `X-RateLimit-Limit`
     - `X-RateLimit-Remaining`
     - `X-RateLimit-Reset`
     - `Retry-After` (when rate-limited)
   - Emits a clean `429 Too Many Requests` JSON response with error code and retry guidance when limits are exceeded.
   - Provides graceful fallback / bypass if Redis is temporarily unreachable (fail-open or fail-closed based on configuration).

2. **`proxy/` (Proxy & Routing)**:
   - Resolves target microservices from dynamic route configurations or path mappings.
   - Handles header sanitization (preserves and appends `X-Forwarded-For`, `X-Forwarded-Proto`, and generates unique `X-Request-Id`).
   - Streams requests and responses with low memory overhead.
   - Forwards HTTP methods, headers, query parameters, and streaming request bodies faithfully.

3. **`analytics/` (Telemetry & Observability)**:
   - Captures request timestamps, duration/latency (ms), status codes (2xx, 4xx, 429, 5xx), route ID, and client IP hash.
   - Asynchronously increments time-bucketed Redis counters or streams without blocking the main proxy forwarding event loop.
   - Exposes summarized metrics to the dashboard via `/api/metrics` or SSE.

4. **`dashboard/` (UI Layer)**:
   - Clean, modular Next.js components styled with Tailwind CSS.
   - Separation between data fetching (server components / React Query / SWR) and presentation components (charts, gauges, tables).
   - Real-time updates with smooth micro-interactions and dark-mode aesthetic.

---

## 4. End-to-End Integration Testing Standards

Every critical behavior must be verified by automated end-to-end integration tests located in `gateway/test/`:

1. **Proxy Forwarding Tests**:
   - Verify that GET, POST, PUT, DELETE requests correctly reach the downstream service.
   - Verify that request bodies (JSON, text) and query parameters are forwarded intact.
   - Verify that response status codes and headers from downstream are delivered back to the client.
   - Verify `X-Request-Id` is appended and returned.

2. **HTTP 429 & Rate-Limiting Tests**:
   - Verify that sending requests under the allowed limit returns `200 OK` (or downstream status) with decremented `X-RateLimit-Remaining`.
   - Verify that bursting beyond the threshold immediately triggers `HTTP 429 Too Many Requests`.
   - Verify the presence and correctness of `Retry-After` and `X-RateLimit-Reset` headers.
   - Verify that once the sliding window duration passes, subsequent requests succeed again.

3. **Resilience & Edge Cases**:
   - Test behavior when Redis experiences latency or errors.
   - Test concurrent request bursts from multiple distinct client IPs / API keys to verify sliding window isolation.

---

## 5. Development Workflow & Commands

- **Local Infrastructure**: `docker compose up -d redis`
- **Gateway Dev**: `cd gateway && npm run dev`
- **Gateway Tests**: `cd gateway && npm test`
- **Dashboard Dev**: `cd dashboard && npm run dev`
