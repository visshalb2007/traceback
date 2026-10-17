# TraceBack

**Who broke the build?**

TraceBack is an incident-tracking and deployment-monitoring platform. It records deployments,
code changes and incidents as an **append-only event stream**, then correlates them to answer
the question every on-call engineer asks first: _which change is most likely responsible?_

Every mutation is an event. Events can arrive late, out of order, or twice — TraceBack treats
all three as normal, keeps a stable ordering, and never silently overwrites a human decision.
<img width="1892" height="897" alt="image" src="https://github.com/user-attachments/assets/9a99ea14-b7fb-4cab-95a9-5dafca30f2e5" />

---

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Data model (ER diagram)](#data-model-er-diagram)
- [Events: late, duplicate and conflicting writes](#events-late-duplicate-and-conflicting-writes)
- [The correlation engine](#the-correlation-engine)
- [Incident status state machine](#incident-status-state-machine)
- [Realtime (SSE)](#realtime-sse)
- [RBAC matrix](#rbac-matrix)
- [Webhooks](#webhooks)
- [API keys](#api-keys)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API examples (curl)](#api-examples-curl)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Deployment](#deployment)
- [Trade-offs and decisions](#trade-offs-and-decisions)
- [Known limitations](#known-limitations)

---

## Overview

| Concern         | How TraceBack does it                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Source of truth | An append-only `events` table; entity tables are **projections**                                               |
| Ordering        | `(occurred_at, sequence)` — event time first, insertion order as tie-breaker                                   |
| Late events     | Flagged `is_late` when `occurred_at` predates receipt by > 5 min, and still inserted in place                  |
| Duplicates      | Idempotency key per project → `200` + `X-Idempotent-Replay: true`                                              |
| Concurrency     | Optimistic `rowVersion` + `expectedRowVersion` (If-Match); `409` with a field-level diff and a three-way merge |
| Incidents       | A strict status **state machine**, append-only comments, recurring-issue fingerprints                          |
| Correlation     | A pure, weighted, explainable ranking (`0–1`) with reasons and an algorithm version                            |
| Realtime        | SSE at `/projects/:id/stream`, resumable via `Last-Event-ID`, backed by Postgres `LISTEN/NOTIFY`               |
| Auth            | JWT access/refresh (rotating) + argon2id hashes; project-scoped API keys                                       |
| Authorization   | One declarative matrix, enforced only through `can(user, action, resource)`                                    |
| Audit           | Immutable `audit_logs` written in the **same transaction** as the change it records                            |

### Frontend

Login/register, project list & creation, a project dashboard, a live timeline (with late badges),
deployments list/detail, incidents list/detail with a correlation panel, and settings
(members & roles, webhooks, API keys) plus an audit-log viewer. Every list has loading, empty and
error states; the layout is responsive and supports dark mode.

---

## Architecture

pnpm-workspace monorepo:

```
traceback/
├── apps/
│   ├── api/                 Fastify + Zod + Drizzle + Postgres
│   │   ├── drizzle/         SQL migrations (generated + hand-written)
│   │   └── src/
│   │       ├── modules/     one folder per domain, layered routes → service → repository → db
│   │       ├── plugins/     auth, rbac, db, events, realtime, audit, api-keys
│   │       ├── openapi/     OpenAPI generation from the route schemas
│   │       └── db/          schema, migrator, seed
│   └── web/                 Next.js 14 App Router + TanStack Query + Tailwind
├── packages/
│   └── shared/              Zod schemas, enums and types shared by api and web
├── docker-compose.yml       db, db-test, migrate, api, web
├── render.yaml / fly.*.toml / railway.json
└── .github/workflows/ci.yml
```

`packages/shared` is the single source of truth for enums and wire schemas. It is consumed as
TypeScript source (no build step), so the API's Zod validators, the Drizzle `pgEnum`s and the
web app's labels can never disagree.

### Request lifecycle

```
HTTP request
   │
   ▼
Fastify  ──►  plugins: cors · helmet · rate-limit · db · apiKeys · auth · rbac · events · realtime · audit
   │
   ▼
route (Zod schema validates params/body/query, serialises the response)
   │  preHandler: requireAuth → authorize('action')   ← the RBAC matrix
   ▼
service   ← business rules, state machine, idempotency, conflict resolution
   │
   ▼
repository ──►  db.transaction(tx):
                   ├── write the entity projection
                   ├── events.append(...)      ← the source of truth
                   └── writeAudit(...)         ← immutable, same transaction
```

Repositories accept a `DbExecutor` (`Database | Transaction`) so a mutation, its event and its
audit row commit together or not at all.

---

## Data model (ER diagram)

```mermaid
erDiagram
    users ||--o{ refresh_tokens : has
    users ||--o{ project_members : "is member of"
    users ||--o{ api_keys : creates
    projects ||--o{ project_members : has
    projects ||--o{ deployments : has
    projects ||--o{ changes : has
    projects ||--o{ incidents : has
    projects ||--o{ events : "append-only"
    projects ||--o{ audit_logs : has
    projects ||--o{ webhook_endpoints : has
    projects ||--o{ api_keys : has
    deployments ||--o{ changes : "may include"
    incidents ||--o{ incident_updates : "comments (append-only)"
    incidents ||--o{ incident_assignees : has
    incidents ||--o{ incident_links : "suspects"
    webhook_endpoints ||--o{ webhook_deliveries : receives

    users {
        uuid id PK
        text email UK
        text name
        text password_hash
        timestamptz created_at
    }
    projects {
        uuid id PK
        text name
        text slug UK
        text description
        text repository_url
        int row_version
        timestamptz deleted_at
    }
    project_members {
        uuid project_id FK
        uuid user_id FK
        enum role
    }
    deployments {
        uuid id PK
        uuid project_id FK
        text service
        enum environment
        enum status
        text version
        text commit_sha
        text external_id
        int row_version
        timestamptz started_at
        timestamptz finished_at
    }
    changes {
        uuid id PK
        uuid project_id FK
        enum type
        text sha
        text title
        text_array files_changed
        text_array services
        uuid deployment_id FK
    }
    incidents {
        uuid id PK
        uuid project_id FK
        text title
        enum severity
        enum status
        text service
        text fingerprint
        int count
        int row_version
        timestamptz started_at
        timestamptz resolved_at
    }
    incident_updates {
        uuid id PK
        uuid incident_id FK
        uuid author_id FK
        text kind
        text body
        timestamptz occurred_at
    }
    incident_links {
        uuid id PK
        uuid incident_id FK
        enum entity_type
        uuid entity_id
        enum source
        enum status
        numeric score
        text algorithm_version
        jsonb reasons
        jsonb signals
    }
    events {
        uuid id PK
        uuid project_id FK
        bigint sequence
        enum type
        enum entity_type
        uuid entity_id
        jsonb payload
        timestamptz occurred_at
        timestamptz received_at
        bool is_late
        text idempotency_key
        enum source
    }
    audit_logs {
        uuid id PK
        uuid project_id FK
        uuid actor_id FK
        enum action
        text entity_type
        uuid entity_id
        jsonb before
        jsonb after
        timestamptz created_at
    }
    webhook_endpoints {
        uuid id PK
        uuid project_id FK
        enum provider
        text name
        text secret
        bool active
    }
    webhook_deliveries {
        uuid id PK
        uuid endpoint_id FK
        text delivery_id
        text event
        enum status
        text error
    }
    api_keys {
        uuid id PK
        uuid project_id FK
        text name
        text prefix UK
        text token_hash
        enum role
        timestamptz last_used_at
        timestamptz revoked_at
    }
```

Migrations live in `apps/api/drizzle/` and are applied by `pnpm db:migrate`. Migration `0005`
installs an `AFTER INSERT` trigger on `events` that calls `pg_notify('traceback_events', …)`,
which is what powers realtime fan-out.

---

## Events: late, duplicate and conflicting writes

The `events` table is the source of truth. Entity tables are projections that can always be
rebuilt from events. This is what makes late, duplicate and out-of-order writes tractable.

### Ordering

Events are ordered by `(occurred_at, sequence)`:

- `occurred_at` is when the thing _actually happened_. It is client-supplied and may be backdated.
- `sequence` is a monotonic `bigserial` assigned on insert, used only to break ties when two
  events share the same `occurred_at`.

Arrival order (`received_at`) never affects the timeline. An event that arrives late is inserted
at its correct position.

### Late events

If `occurred_at` is older than `received_at − LATE_EVENT_THRESHOLD_MS` (default 5 minutes) the row
is flagged `is_late = true`. The timeline surfaces late events with a badge instead of hiding
them. Try it:

```
GET /api/v1/projects/:id/timeline?type=deployment.recorded
```

A deployment recorded with an `occurredAt` ten minutes in the past comes back with `isLate: true`.

### Duplicate events

Every write accepts an optional `idempotencyKey`. It is unique **per project** (a partial unique
index), so a retried submission collapses onto the original:

- First request: `201` (or `200` for records) with the created entity.
- Replay: `200` with `X-Idempotent-Replay: true` and the original entity.

Deployments dedupe on a supplied key or on `(project, externalId)`; changes dedupe on the commit
`sha`; incidents dedupe on `(project, fingerprint, startedAt)` proximity.

### Conflicting writes (optimistic concurrency)

Entity rows carry a `rowVersion` counter. A client that has read a row sends `expectedRowVersion`
(the `If-Match` equivalent, carried in the body because the API is JSON-first). If it is stale:

1. The API returns **`409` `VERSION_CONFLICT`** with a field-level diff of what changed.
2. If a base version was supplied, the service attempts a **three-way merge**
   (`base`, `theirs`, `mine`). Non-overlapping field edits merge cleanly; overlapping ones do not.
3. The client re-reads, re-applies and retries with the fresh `rowVersion`.

Passing `expectedRowVersion: 0` reliably yields a `409`, which is how the integration tests pin
the behaviour.

---

## The correlation engine

`apps/api/src/modules/correlation/scoring.ts` is **pure**: given an incident, a candidate
(deployment or change) and a little history, it returns a `0–1` score plus the human-readable
reasons that produced it. No database, no clock, no randomness — which is what makes it
unit-testable and its output explainable.

The score is a **weighted average normalised over the signals that actually apply**, so a change
(which has no deployment status) is not penalised for a signal it can never satisfy.

| Signal               | Weight | What it measures                                                           |
| -------------------- | -----: | -------------------------------------------------------------------------- |
| `timing`             |   0.30 | Exponential decay `0.5 ** (Δt / halfLife)`; half-life defaults to 6 h      |
| `serviceOverlap`     |   0.22 | Jaccard overlap of the incident's service/components and the candidate's   |
| `environment`        |   0.12 | Same environment (production incidents are rarely staging deploys)         |
| `fileOverlap`        |   0.14 | Jaccard overlap of touched file paths vs. the incident's components        |
| `deploymentStatus`   |   0.10 | `failed` = 1.0, `rolled_back` = 0.9, `success` = 0.25, …                   |
| `authorHistory`      |   0.07 | This author was implicated in the same fingerprint before (saturates at 3) |
| `fingerprintHistory` |   0.05 | This service was implicated in the same fingerprint before                 |

Candidates below `minScore` (default `0.25`) are dropped; the rest are ranked best-first and
capped at `limit` (default 5). The engine runs over a `lookbackHours` window (default 72).

Every stored suggestion records its `algorithmVersion` (`correlation-v1`), `score`, `signals`
(the raw per-signal values) and `reasons`, so a suggestion remains explainable after the fact.
Re-running correlation never clobbers a **confirmed** or **rejected** link or a manual one —
human decisions are inputs, not outputs. Confirming a link feeds `authorHistory` /
`fingerprintHistory` for future incidents.

Reasons are gated by score (≥ 0.2) except categorical mismatches (e.g. a different environment),
which are always surfaced via an `alwaysExplain` flag.

---

## Incident status state machine

Status is not a free-form field; it is a state machine. An illegal transition returns
**`422` `INVALID_TRANSITION`** (and `open → open` is illegal).

```
        ┌───────────────────────────── open ─────────────────────────────┐
        │            │                    │                │             │
        ▼            ▼                    ▼                ▼             │
  investigating  mitigated            resolved          closed ──────────┤
        │            │                    │                │             │
        ▼            ▼                    ▼                ▼             │
  mitigated /    resolved /         closed / open      open ─────────────┘
  resolved /     investigating
  closed / open
```

`resolved` stamps `resolvedAt`; reopening clears it. Comments (`incident_updates`) are
append-only, so two responders commenting at once can never conflict. Comments never bump the
incident's `rowVersion`.

---

## Realtime (SSE)

```
GET /api/v1/projects/:projectId/stream
```

Server-Sent Events, authorised with the same bearer token (or API key). The web client consumes
it with `fetch` + a stream reader because `EventSource` cannot set an `Authorization` header.

- The browser sends `Last-Event-ID` on reconnect; the server replays the backlog from that
  `sequence` **before** subscribing, so nothing is lost or duplicated across the seam.
- `lastEventId` may also be passed as a query parameter.
- A heartbeat comment is written every 25 s to keep proxies from closing the socket.
- Fan-out is backed by Postgres `LISTEN/NOTIFY` (the `events` trigger), so multiple API
  instances share one stream.

---

## RBAC matrix

Authorisation is enforced **only** through `can(role, action)` in `apps/api/src/lib/policy.ts`.
Routes declare the action they need (`authorize('incident:update')`); they never compare roles by
hand. Roles are ranked `viewer < member < maintainer < admin < owner`.

| Action                      | viewer | member | maintainer | admin | owner |
| --------------------------- | :----: | :----: | :--------: | :---: | :---: |
| `project:read`              |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `member:read`               |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `deployment:read`           |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `change:read`               |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `incident:read`             |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `timeline:read`             |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `correlation:read`          |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `dashboard:read`            |   ✓    |   ✓    |     ✓      |   ✓   |   ✓   |
| `incident:create`           |        |   ✓    |     ✓      |   ✓   |   ✓   |
| `incident:comment`          |        |   ✓    |     ✓      |   ✓   |   ✓   |
| `incident:link`             |        |   ✓    |     ✓      |   ✓   |   ✓   |
| `deployment:write`          |        |        |     ✓      |   ✓   |   ✓   |
| `change:write`              |        |        |     ✓      |   ✓   |   ✓   |
| `incident:update`           |        |        |     ✓      |   ✓   |   ✓   |
| `correlation:run`           |        |        |     ✓      |   ✓   |   ✓   |
| `project:update`            |        |        |            |   ✓   |   ✓   |
| `member:invite`             |        |        |            |   ✓   |   ✓   |
| `member:update_role`        |        |        |            |   ✓   |   ✓   |
| `member:remove`             |        |        |            |   ✓   |   ✓   |
| `audit:read`                |        |        |            |   ✓   |   ✓   |
| `webhook:manage`            |        |        |            |   ✓   |   ✓   |
| `apikey:manage`             |        |        |            |   ✓   |   ✓   |
| `project:delete`            |        |        |            |       |   ✓   |
| `project:transfer`          |        |        |            |       |   ✓   |
| `member:transfer_ownership` |        |        |            |       |   ✓   |

Additional rules: nobody may manage the owner, you may not out-rank yourself, and only an owner
may transfer ownership (demoting themselves in the same operation).

---

## Webhooks

```
POST /webhooks/github/:endpointId
```

Mounted **outside** `/api/v1` because GitHub calls it, not our client. The endpoint must exist
and be `active`.

1. The **HMAC-SHA256 signature** (`X-Hub-Signature-256`) is verified against the endpoint's
   secret over the **raw** request body. A missing or mismatched signature is rejected with `401`.
   The body is buffered before parsing for exactly this reason (a scoped content-type parser
   keeps this from affecting any other route).
2. The delivery is deduped on `X-GitHub-Delivery` (falling back to a body hash when the header is
   absent). A replay returns `202` with `X-Webhook-Duplicate: true`.
3. The translated domain action is applied: `push`/`pull_request` → a change,
   `deployment` → a queued deployment, `deployment_status` → enrichment by `externalId`,
   `ping`/unknown → ignored.
4. Every attempt is recorded in `webhook_deliveries` with a status of `received`, `processed`,
   `duplicate` or `failed`.

The receiver **always returns `202`** for an accepted delivery. A processing failure is recorded
(`status: failed`) and reported in the body rather than thrown as a `500` — a `5xx` would make
GitHub retry noisily for a payload we may never be able to process.

---

## API keys

Machine access for CI and scripts. Created from Settings → API keys (`apikey:manage`, admin+).

- Format `tbk_<8-hex-prefix>_<secret>`; the plaintext is shown **once** and never stored.
- Only the SHA-256 hash and the public prefix are persisted.
- A key is **project-scoped** and carries a fixed role (`maintainer | member | viewer`, default
  `member`), capped at the creator's own role — a leaked key can never grant more than the person
  who minted it.
- `requireAuth` resolves a `tbk_…` token, attaches the key's role, and `authorize()` uses it when
  the request targets that project. A revoked or expired key, or one used against a different
  project, is rejected (`401` / `404`).

---

## Getting started

### Prerequisites

- Node.js ≥ 20 and pnpm 12
- Docker (for Postgres, or use an existing Postgres 16)

### 1. Install and start everything

```bash
pnpm install
docker compose up -d db          # Postgres 16 on :5432
cp .env.example .env             # optional; sensible defaults exist
pnpm db:migrate                  # apply migrations
pnpm db:seed                     # optional: demo project + incidents
pnpm dev                         # api on :4000, web on :3000
```

Open http://localhost:3000. If you seeded, sign in with
**`demo@traceback.dev` / `DemoPassword123!`**.

### 2. Or run the whole stack in Docker

```bash
docker compose up --build        # db + api (:4000) + web (:3000)
docker compose run --rm migrate  # one-shot migration runner
```

### 3. Useful scripts

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`              | Run api + web in watch mode                                              |
| `pnpm build`            | Build every package (shared → api → web)                                 |
| `pnpm typecheck`        | `tsc --noEmit` across the workspace                                      |
| `pnpm lint`             | ESLint across the workspace                                              |
| `pnpm test`             | Unit + integration tests (integration skips without `TEST_DATABASE_URL`) |
| `pnpm db:migrate`       | Apply SQL migrations                                                     |
| `pnpm db:seed`          | Seed the demo project                                                    |
| `pnpm openapi:generate` | Write `apps/api/openapi.json` from the route schemas                     |

Interactive API docs are served at http://localhost:4000/docs; the raw document at
http://localhost:4000/openapi.json.

---

## Environment variables

Validated at boot by Zod (`apps/api/src/env.ts`). In production, `DATABASE_URL`,
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are **required**; in development/test they fall back
to deterministic local defaults.

| Variable                       | Default                                                   | Notes                                           |
| ------------------------------ | --------------------------------------------------------- | ----------------------------------------------- |
| `NODE_ENV`                     | `development`                                             | `development` \| `test` \| `production`         |
| `PORT`                         | `4000`                                                    | API port                                        |
| `HOST`                         | `0.0.0.0`                                                 | API bind address                                |
| `LOG_LEVEL`                    | `info`                                                    | pino level (`silent` in tests)                  |
| `DATABASE_URL`                 | `postgres://traceback:traceback@localhost:5432/traceback` | Required in production                          |
| `JWT_ACCESS_SECRET`            | dev fallback                                              | ≥ 16 chars; required in production              |
| `JWT_REFRESH_SECRET`           | dev fallback                                              | ≥ 16 chars; required in production              |
| `JWT_ACCESS_TTL_SECONDS`       | `900`                                                     | 15 minutes                                      |
| `JWT_REFRESH_TTL_SECONDS`      | `2592000`                                                 | 30 days                                         |
| `CORS_ORIGIN`                  | `http://localhost:3000`                                   | Comma-separated list, or `*`                    |
| `DATABASE_POOL_MAX`            | `10`                                                      | postgres.js pool size                           |
| `LATE_EVENT_THRESHOLD_MS`      | `300000`                                                  | Events older than this are flagged `is_late`    |
| `WEB_CONCURRENCY`              | `1`                                                       | Reserved                                        |
| `RATE_LIMIT_MAX`               | `600`                                                     | Requests per window                             |
| `RATE_LIMIT_WINDOW`            | `1 minute`                                                | Rate-limit window                               |
| `TEST_DATABASE_URL`            | —                                                         | When set, the integration suites run against it |
| `NEXT_PUBLIC_API_URL` (web)    | `http://localhost:4000`                                   | Baked into the client bundle at build time      |
| `NEXT_OUTPUT_STANDALONE` (web) | —                                                         | Set to `1` for the Docker standalone build      |

---

## API examples (curl)

All examples assume `API=http://localhost:4000/api/v1`.

**Register and log in**

```bash
curl -sX POST $API/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@example.com","name":"You","password":"Sup3rSecretPassword"}'

TOKEN=$(curl -sX POST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"Sup3rSecretPassword"}' \
  | jq -r .accessToken)
```

**Create a project**

```bash
PROJECT=$(curl -sX POST $API/projects -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Checkout Platform","repositoryUrl":"https://github.com/acme/checkout"}' \
  | jq -r .id)
```

**Record a deployment** (idempotent on `externalId`)

```bash
curl -sX POST $API/projects/$PROJECT/deployments -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
        "service":"checkout-api",
        "environment":"production",
        "status":"failed",
        "version":"v2.4.0",
        "commitSha":"c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        "externalId":"gh-42",
        "occurredAt":"2026-01-01T12:00:00Z"
      }'
# Repeat the call → 200 with `x-idempotent-replay: true`.
```

**Create an incident**

```bash
INCIDENT=$(curl -sX POST $API/projects/$PROJECT/incidents -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
        "title":"Checkout requests timing out",
        "severity":"sev2",
        "service":"checkout-api",
        "environment":"production",
        "errorSignature":"ETIMEDOUT connecting to payments-gateway",
        "affectedComponents":["checkout-api","src/checkout/retry.ts"],
        "startedAt":"2026-01-01T12:05:00Z"
      }' | jq -r .id)
```

**Run correlation and read the suspects**

```bash
curl -sX POST "$API/projects/$PROJECT/incidents/$INCIDENT/correlation/run" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"lookbackHours":72,"minScore":0.25,"limit":5}' | jq '.candidates[] | {entityType, score, reasons}'
```

**Stream the timeline (SSE)**

```bash
curl -N "$API/projects/$PROJECT/stream" -H "authorization: Bearer $TOKEN"
# Reconnect with resume:
curl -N "$API/projects/$PROJECT/stream" -H "authorization: Bearer $TOKEN" -H 'Last-Event-ID: 42'
```

**Deliver a signed GitHub webhook**

```bash
SECRET='a-very-secret-webhook-signing-key'
BODY='{"ref":"refs/heads/main","repository":{"name":"checkout-api"},"head_commit":{"id":"'$(printf 'a%.0s' {1..40})'","message":"Fix","timestamp":"2026-01-01T12:00:00Z"}}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -sX POST http://localhost:4000/webhooks/github/$ENDPOINT_ID \
  -H "x-hub-signature-256: $SIG" \
  -H 'x-github-event: push' \
  -H 'x-github-delivery: 1111-2222' \
  -H 'content-type: application/json' \
  -d "$BODY"
# Replay the same delivery → `x-webhook-duplicate: true`.
```

---

## Testing

Three layers, all runnable with `pnpm test`:

| Layer            | Location                                     | Runs without a database?       |
| ---------------- | -------------------------------------------- | ------------------------------ |
| Unit             | `apps/*/src/**/__tests__`, `packages/shared` | ✅                             |
| Integration      | `apps/api/tests/integration`                 | ❌ — needs `TEST_DATABASE_URL` |
| E2E (Playwright) | `apps/web/e2e`                               | ✅ (UI smoke only)             |

The integration suites run against a **real Postgres** (ordering, optimistic concurrency,
idempotency and webhook dedupe are meaningless against mocks). They **skip cleanly** when
`TEST_DATABASE_URL` is unset, so a fresh clone still has a green `pnpm test`.

```bash
# Integration, against the throwaway test database on :5433
docker compose --profile test up -d db-test
TEST_DATABASE_URL=postgres://traceback:traceback@localhost:5433/traceback_test pnpm test

# Browser smoke tests
pnpm --filter @traceback/web test:e2e:install   # once, downloads Chromium
pnpm --filter @traceback/web test:e2e
```

Covered integration flows: auth (register/login/refresh/rotate), projects + RBAC, deployments
(idempotent replay, enrichment, completeness), incidents (state machine, `409` conflict, recurring
fingerprints), correlation (run/confirm/reject), API keys (scoping/revocation), and GitHub webhook
ingest (signature rejection, dedupe, `ping`).

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every PR:

- **verify** — starts a Postgres service, then `pnpm lint`, `pnpm typecheck`, `pnpm test`
  (integration suites run because `TEST_DATABASE_URL` is set) and `pnpm build`, plus
  `pnpm openapi:generate` to prove the document still derives.
- **e2e** — installs Chromium and runs the Playwright smoke tests, uploading the report as an
  artifact.

Husky + lint-staged run ESLint/Prettier on staged files, and commitlint enforces
Conventional Commits with a ≤ 72-character subject.

---

## Deployment

Three providers are configured; each builds the same Docker images, runs migrations before
release, and points the web build at the public API URL.

### Render (Blueprint)

`render.yaml` provisions Postgres, the API and the web service:

```bash
# Dashboard → New → Blueprint → select this repo
```

### Fly.io

```bash
fly launch --config fly.api.toml --no-deploy
fly secrets set --config fly.api.toml DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=...
fly deploy --config fly.api.toml

fly launch --config fly.web.toml --no-deploy
fly deploy --config fly.web.toml
```

### Railway

`railway.json` configures the API service (Dockerfile, pre-deploy migration, `/health` check).
Add the web service in the dashboard with Dockerfile path `apps/web/Dockerfile` and
`NEXT_PUBLIC_API_URL` set to the API's public URL.

### Deployed URL

> **Not deployed yet.** This repository has only ever been built and tested locally, so there is
> no public URL to link. Once deployed with one of the configs above, the expected endpoints are:
>
> - Web: `https://traceback-web.onrender.com` (Render) / `https://traceback-web.fly.dev` (Fly)
> - API: `https://traceback-api.onrender.com` (Render) / `https://traceback-api.fly.dev` (Fly)

---

## Trade-offs and decisions

These were chosen deliberately; each is a real trade-off, not an accident.

- **Events as the source of truth, projections for reads.** Writes are heavier (an event + an
  audit row per mutation), but ordering, late arrivals and idempotency all fall out naturally,
  and the timeline can be rebuilt. The alternative — mutating entity rows directly — cannot answer
  "what did this look like at 12:03?".
- **`rowVersion` for concurrency, not `version`.** The release identifier is `version`; the
  optimistic-concurrency counter is `rowVersion` everywhere. Naming them apart avoids a class of
  bug where a deploy version is mistaken for a concurrency token.
- **`incident_links` instead of `incident_deployment_links`.** The plan named a
  deployment-only join table; it is generalised with an `entity_type` because the correlation
  engine scores _changes_ too, and duplicating the suggestion/score/feedback machinery for a
  second table would have been worse.
- **RBAC only via `can(user, action, resource)`.** A single declarative matrix keeps the docs
  (the table above) a copy/paste exercise and stops ad-hoc role checks from drifting. The cost is
  a level of indirection at every route.
- **Webhook receiver always returns `202`.** GitHub retries on `5xx`; for a payload we may never
  be able to process, recording a `failed` delivery is better than a retry storm.
- **SSE over WebSockets.** The traffic is one-directional (server → client), SSE reconnects and
  resumes for free with `Last-Event-ID`, and it rides on plain HTTP. The cost is a hard cap on
  concurrent connections per browser and no client → server channel.
- **`packages/shared` consumed as source.** No build step means one fewer thing to keep in sync;
  the cost is that the API and web builds both typecheck the shared source.
- **API keys store a hash, never the token.** A leaked database cannot be replayed against the
  API. The cost is that a lost key cannot be recovered, only rotated.
- **Integration tests need real Postgres.** They skip without `TEST_DATABASE_URL` rather than
  mock the database, because the properties under test (ordering, races, unique constraints) are
  exactly the ones mocks get wrong.

---

## Known limitations

- **Local-only.** Nothing has been pushed or deployed; the Docker images and deploy configs have
  not been exercised on a real host.
- **Integration and E2E tests are not runnable without Docker/Postgres locally.** They are wired
  into CI, but on a machine without Docker they skip.
- **`db-test` is a single throwaway database.** Suites truncate between tests; they are not
  parallel-safe against one shared `db-test` instance.
- **Correlation is heuristic.** Weights are hand-tuned, not learned. The engine is explainable and
  versioned, but a `0.9` is a suggestion, never a verdict.
- **Rate limiting is in-process.** With multiple API instances the limit is per-instance, not
  global; a shared store (Redis) would be needed to make it exact.
- **SSE fan-out assumes one Postgres.** `LISTEN/NOTIFY` is shared across instances, but a very
  large fan-out would want a dedicated broker.
- **No email delivery.** Member invites add an existing user to a project; no invitation email is
  sent.
- **`fingerprintHistory` needs confirmed links to be useful.** On a brand-new project the history
  signals are zero, so ranking leans on timing, service and file overlap.

---

## License

MIT.
