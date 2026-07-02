# Orbweaver — `entry`: the composition root (tier survey)

> **Status: planning (authoritative).** `entry/` is the topmost server tier — the ONE place allowed to
> cross every boundary, because it _wires_ everything and owns no business logic. It was implicit across
> ~12 docs (the scattered "→ entry" movement rows); this doc gives it a home (council/skeptic finding
> #5). Upstream: `core/Core-0-Architecture-and-Structure.md §3` (the tier list — `entry` is the top), `core/Core-Legacy-Migration-and-Gaps.md`
> §8 (boot order), `core/Core-Laws-and-Precedents.md §4` (the build DAG), and every domain/tier doc's
> "injected at the composition root" rows. Imports flow DOWN only; `entry` may import ANY lower tier
> (transport, domain front doors, infra, foundation, kit) — it is the only tier that may, and nothing
> imports `entry`.

---

## What this tier owns

`entry/` is **wiring + boot + the HTTP edge** — zero domain logic. Three concerns:

1. **The composition root** — constructs every domain service (passing each its `*Context` DI bundle),
   resolves the cross-feature **injection model** (every "injected at the composition root" op in the
   domain docs is wired HERE), and hands the wired services to transport. This is the single most
   load-bearing wiring in the system; it is built LAST (after all domains exist) and it is the reason
   domains never import each other sideways.
2. **The boot protocol** — `index.ts`: `migrate → seed → supervisors → serve` (+ graceful shutdown).
3. **The HTTP edge** — `entry/http/`: the non-tRPC registrars (binary blob serve, multipart
   asset/import upload, healthz) + the auth-mint routes + cookie I/O. (Per `core/Core-0-Architecture-and-Structure.md §3`,
   non-tRPC registrars are `entry/`, not `transport/` — they compose domain+infra+the auth seam.)

This tier does **NOT** own: business logic (domains), drivers (transport — tRPC routers + the jobs
worker), I/O adapters (infra), or env/observability (foundation). It only _assembles_ them.

---

## Layout

```
packages/server/src/entry/
├── index.ts                  boot: load env → migrate (backupBeforeMigrate + assertReferentialIntegrity)
│                             → seed → start supervisors → wire composition root → serve → graceful shutdown
├── app.ts                    the Hono builder (middleware order, ingress-allowlist, mount tRPC + http)
├── lifecycle.ts              boot/shutdown protocol — invoked once with injected deps; read by entry only
│                             (per DECISIONS-LEDGER §7 D5: entry/lifecycle.ts, NOT foundation/lifecycle.ts)
├── auth/                     THE AUTH SEAM (the ONE Principal construction site)
│   └── seam.ts               wires infra/auth (verify) + domain/sessions (resolve/upsert) → mints the ONE
│                             Principal (per DECISIONS-LEDGER §7 D1: entry/auth/seam.ts, NOT compose/auth-seam.ts)
├── boot/
│   ├── migrate.ts            run drizzle migrations (FK-off connection; post-check); backup first
│   ├── seed-credential.ts    env→DB-once OPENROUTER_API_KEY seed (calls credentials + ensureOwner)
│   ├── seed-owner.ts         idempotent owner provisioning at boot
│   ├── seed-default-preset.ts / seed-default-characters.ts   the idempotent boot packs
│   └── reclaim-locks.ts      reclaimChatLocksOnBoot (single-replica boot wipe)
├── compose/                  THE COMPOSITION ROOT (NON-auth wiring; no logic — the auth seam is in auth/)
│   ├── services.ts           constructs every domain service with its Context; the injection graph
│   ├── runner-env.ts         builds the WorkloadRunnerEnv bundle (crosses every feature — the one true hub)
│   ├── event-bus.ts          the in-process typed event bus + subscriptions (embeddings indexer, etc.)
│   ├── role-clients.ts       binds the role clients (createVllmRoleClients / per-role via connection.resolveRole)
│   └── effective-config.ts   wires settings' getEffectiveConfig sync getter + the boot reload
├── http/                     non-tRPC registrars (compose domain + infra + auth)
│   ├── blob.ts               GET /blob/<hash> (+ ?w=&f=webp variant transform via the infra/image op)
│   ├── upload.ts             multipart asset + import-zip routes (the HTTP multipart route DELEGATES to
│   │                         import/run-profile-import.ts — per DECISIONS-LEDGER §7 D3)
│   ├── auth-routes.ts        OIDC/local mint handlers + cookie set/clear (the __Host- contract)
│   └── healthz.ts            liveness + the credentials_key_mismatch / shutdown-503 signals
└── import/                   bulk composition driver
    └── run-profile-import.ts the composition driver (store→collect→reconcile→emit); the upload route
                              delegates here (per DECISIONS-LEDGER §7 D3)
```

## Runtime dependencies (join the catalog at Phase 4e)

The entry tier owns the two server-edge libraries no lower tier names — both added per-tier (like
foundation's pino), versions confirm-latest at build:

| Package              | Version  | Where                                  | Note                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hono/node-server`  | `^2.0.4` | `index.ts` / `app.ts` / `lifecycle.ts` | the Node HTTP listener: `serve()` + `serve-static` + the keep-alive `serverOptions`. The `httpServer` object `lifecycle.ts` takes **injected** is literally this lib's `serve()` return (`ServerType`) — boot order step "serve" is `serve(app)`.                                                                                                                                                                |
| `openid-client` (v6) | `^6.8.4` | `http/auth-routes.ts`                  | the OIDC mint flow — `discovery()` (one cached round-trip), `randomPKCECodeVerifier`/`calculatePKCECodeChallenge`, `buildAuthorizationUrl`, `authorizationCodeGrant`. v6's API differs substantially from v5. The **verify** side (JWKS) is `infra/auth`'s `jose` (`core/Tier-3-Infra.md`); this is the **client** side (discovery + code exchange), which is why it lands at the entry mint handler, not infra. |

---

## What lands here (movement summary — the scattered "→ entry" rows, consolidated)

| Unit                                                                                                                           | From                                   | Why entry                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `buildWorkloadsEnv` / the `WorkloadRunnerEnv` value                                                                            | workloads.md                           | crosses every feature boundary — above `domain-no-cross-feature`                         |
| the auth seam (`createAuthResolver`/`resolveOwner` → the `Principal` mint) — `entry/auth/seam.ts` (per DECISIONS-LEDGER §7 D1) | sessions.md / infra.md                 | the ONE place that may import both `infra/auth` (verify) and `domain/sessions` (resolve) |
| the bulk-import outer driver (`run-profile-import.ts`)                                                                         | import.md                              | composes import + assets + workloads + the event emit                                    |
| the non-tRPC registrars (blob/upload/auth-routes/healthz)                                                                      | transport.md / sessions.md / assets.md | compose domain+infra+auth; not thin drivers                                              |
| cookie I/O (`setSessionCookie`/clear/refresh, `__Host-`)                                                                       | sessions.md / infra.md                 | route-layer job; the domain returns a token string                                       |
| `seedCredentialFromEnv`, default-preset/character seeders, `reclaimChatLocksOnBoot`                                            | credentials/preset/character/chat      | boot-time composition; import any domain front door                                      |
| `createVllmRoleClients` / the role-client binder                                                                               | shared-dissolution + providers         | mints credentials + wires role dispatchers at boot                                       |
| `lifecycle.ts` (a root entry file: `entry/lifecycle.ts`, per DECISIONS-LEDGER §7 D5)                                           | foundation.md (ruled here)             | boot protocol + injected deps; read by entry only                                        |
| the event-bus instance + indexer subscriptions                                                                                 | embeddings.md / assets.md              | the bus shape is an entry concern (in-process typed bus)                                 |
| `getEffectiveConfig` reload wiring                                                                                             | settings.md                            | the sync getter is injected from here into chat/workloads                                |

---

## The injection model (how the cake stays clean without sideways imports)

Every cross-feature dependency in the domain docs is a **typed op declared in a domain's `contract/` +
wired here**. `entry/compose/services.ts` is the graph. Examples (non-exhaustive):

- `chat.context` ← `connection.resolveChat`, the `chat` role, `credentials.resolve`/`maybeRevoke`,
  `character.getCard`/`mintSyntheticGroupCharacter`, `persona.setActivePersona`,
  `embeddings.store`, `search.digests`/`corpus`, `stats.applyDelta`, `RoleClients.summarize`.
- `connection.context` ← `credentials.resolve`, `credentials.buildKeylessCatalogCredential`,
  `providers.fetchOrCatalog`.
- `workloads.runner-env` ← `connection.resolveRole`, `embeddings.store`, `memory.build`,
  `discovery.*`, `tag.*` (the re-partitioned bundle per workloads.md).
- `discovery.context` ← `embeddings.writeHubScores`, `search.findCharacters`/`discover`,
  the injected `stats` economics op.

**The rule:** if two domains must interact, the consumer declares the op TYPE in its `contract/`; `entry`
supplies the runtime fn. A domain that imports another domain's `index.ts` for a runtime value (not the
sanctioned `@orb/db` bulk-read pattern) is a `domain-no-cross-feature` violation.

---

## Boot order (the protocol `index.ts` runs)

1. **env** (`foundation/env`) — the one `process.env` read; `superRefine` boot-fatality per `AUTH_MODE`.
2. **crypto** — initialize `SecretBox` (the `.credentials-key` auto-key path + the boot decrypt-probe; see `core/Core-Planning-and-Checklists.md`).
3. **migrate** — `backupBeforeMigrate` → run migrations on an FK-off connection → `assertReferentialIntegrity` (`PRAGMA foreign_key_check`) → abort+restore on failure.
4. **seed** — env→DB credential seed; default preset; default characters; `reclaimChatLocksOnBoot`.
5. **supervisors** — the vLLM supervisor (honor `VLLM_DISABLED`), the jobs worker poll loop.
6. **compose** — build the event bus + subscriptions, the role clients, every domain service + its injected ops, the auth seam, the effective-config getter.
7. **serve** — mount `app.ts` (middleware + tRPC + `entry/http`), start listening; healthz goes live.
8. **shutdown** — drain in-flight turns, stop supervisors, healthz → 503.

Package/contract build order: see `core/Core-Laws-and-Precedents.md §4` + `core/Core-Audits-and-Debt.md`.

---

## Invariants (gate candidates)

1. **`entry/` owns no business logic** — only wiring/boot/HTTP-edge. _(review + a dep-cruiser rule: `entry/compose/**` may import domain front doors but contains no domain types of its own.)_
2. **`entry/` is the ONLY tier that may import both `infra/auth` and `domain/sessions`** (the auth seam) — and the only tier that may import across features at runtime. _(dep-cruiser: `domain-no-cross-feature` exempts `entry/` alone.)_
3. **Nothing imports `entry/`** — it's the top of the cake. _(resolve-time: `entry` is in no other tier's import surface.)_
4. **The composition root is pure wiring** — no verb logic; a verb's behavior is never defined in `entry/`. _(review.)_
5. **Every cross-feature op is typed in a `contract/` and supplied here** — no sideways runtime imports between domains. _(lint: `domain-no-cross-feature`.)_

---

## Open decisions

- **`compose/` granularity** — one `services.ts` graph vs per-concern files (recommended: the split shown above; collapse if it stays small).
- **Event bus mechanism** — in-process typed `EventEmitter` for v1 (single-replica); the durable-outbox upgrade is the multi-replica seam (see `core/Core-Planning-and-Checklists.md` — the `content_hash` catch-up sweep is the required reliability backstop regardless).
- **`lifecycle.ts` home — DECIDED: `entry/lifecycle.ts`** (per DECISIONS-LEDGER §7 D5; the `foundation/lifecycle.ts` alternative is closed). It is a root entry file (boot protocol + injected deps, read by entry only); the one-directional invariant holds.
