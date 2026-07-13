---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — `entry`: the composition root

`entry/` is the topmost server tier — the ONE place allowed to cross every boundary, because it *wires* everything and owns no business logic. Imports flow DOWN only; `entry` may import ANY lower tier (transport, domain front doors, infra, foundation, kit) — it is the only tier that may, and nothing imports `entry`.

## What this tier owns

1. **The composition root** — constructs every domain service (passing each its `*Context` DI bundle), resolves the cross-feature **injection model** (every "injected at the composition root" op is wired HERE), and hands the wired services to transport. Built LAST (after all domains) and the reason domains never import each other sideways.
2. **The boot protocol** — `index.ts` is intentionally tiny (construct the lifecycle, wire OS signals, `boot()`); `lifecycle.ts` runs `migrate → seed → supervisors → compose → serve` + graceful shutdown.
3. **The HTTP edge** — `entry/http/`: the non-tRPC registrars (binary blob serve, multipart upload, healthz) + the auth-mint routes + cookie I/O. Non-tRPC registrars are `entry/`, not `transport/` — they compose domain+infra+the auth seam (`Core-0-Architecture-and-Structure.md` §3).

NOT owned: business logic (domains), drivers (transport), I/O adapters (infra), env/observability (foundation). Entry only *assembles* them.

## Layout

```
packages/server/src/entry/
├── index.ts                  the process entry point — construct lifecycle, wire signals, boot()
├── lifecycle.ts              boot/shutdown protocol (per Core-Laws-and-Precedents.md §7 D5: entry, NOT foundation)
├── app.ts                    the Hono builder (middleware order, ingress-allowlist, mount tRPC + http)
├── rate-limit-gate.ts        builds the RateLimitGate impl (limiter instances need db; bucket POLICY lives here;
│                             transport declares only the port — core/Tier-4-Transport.md §"rate-limit")
├── auth/seam.ts              THE AUTH SEAM — the ONE Principal construction site: wires infra/auth (verify)
│                             + domain/sessions (resolve/validate/upsert) (per §7 D1)
├── boot/                     migrate.ts (backup → FK-off migrations → foreign_key_check) · seed-owner.ts ·
│                             seed-credential.ts (env→DB-once) · seed-default-preset.ts ·
│                             seed-default-characters.ts · seed-default-persona.ts (+ seed-default-persona-step.ts) ·
│                             seed-themes.ts · seed-assets/ · reclaim-locks.ts
├── compose/                  THE COMPOSITION ROOT (non-auth wiring; no logic)
│   ├── services.ts           constructs every domain service with its Context; the injection graph
│   ├── chat.ts               the chat domain's slice of the graph
│   ├── runner-env.ts         builds the WorkloadRunnerEnv bundle (crosses every feature — the one true hub)
│   ├── event-bus.ts          the in-process typed event bus + subscriptions (embeddings indexer, …)
│   ├── role-clients.ts       bindRoleClientsForUser — per-role connection.resolveRole (Tier-3b §"boot binder")
│   ├── effective-config.ts   wires settings' getEffectiveConfig sync getter + the boot reload
│   ├── buddy-observer.ts     wires the buddy domain's cross-feature observer
│   ├── emit-character-updated.ts / emit-chat-changed.ts   cross-feature event-emit wiring
│   ├── portability.ts        import/export composition wiring
│   └── resolve-image-ref.ts  cross-feature image-ref resolution wiring
├── http/                     non-tRPC registrars (compose domain + infra + auth)
│   ├── blob.ts               GET /blob/… (+ ?w=&f=webp variant transform via the infra/image op)
│   ├── upload.ts             multipart asset + card-file import routes (delegates to import/run-profile-import — D3)
│   ├── auth-routes.ts        OIDC/local mint handlers + cookie set/clear (the __Host- contract)
│   ├── auth-meta.ts          auth-mode/capability discovery for the client
│   ├── export.ts / import.ts  the bulk export/import HTTP registrars
│   ├── join.ts               /join/:token invite-acceptance registrar
│   ├── security-headers.ts   the response security-header registrar
│   └── healthz.ts            liveness + credentials_key_mismatch / shutdown-503 signals
└── import/run-profile-import.ts  the bulk-import composition driver (upload route + future import-st runner)
```

Inventory lists are illustrative — the tree on disk is the truth.

## Runtime dependencies

Versions live in the pnpm catalog (`packages/server/package.json`); two why-notes are load-bearing:

- `@hono/node-server` — the Node HTTP listener; the `httpServer` object `lifecycle.ts` takes injected IS this lib's `serve()` return.
- `openid-client` v6 — the OIDC **mint** flow only (discovery, PKCE, code exchange) at `http/auth-routes.ts`. The **verify** side (JWKS) is `infra/auth`'s `jose` (`core/Tier-3-Infra.md`) — client-side mint lands at entry, never infra.

## The injection model (how the cake stays clean without sideways imports)

Every cross-feature dependency is a **typed op declared in the consumer domain's `contract/` + wired here**. `entry/compose/services.ts` is the graph. The rule: if two domains must interact, the consumer declares the op TYPE in its `contract/`; `entry` supplies the runtime fn. A domain importing another domain's `index.ts` for a runtime value (outside the sanctioned `@orb/db` bulk-read pattern) is a `domain-no-cross-feature` violation.

## Boot order

1. **`installEgressFirewall()`** — the FIRST boot step (swaps undici's global dispatcher before anything else can open a socket; `core/Tier-3-Infra.md`).
2. **env** (`foundation/env`) — the one `process.env` read; `superRefine` boot-fatality per `AUTH_MODE`.
3. **migrate** — `backupBeforeMigrate` → migrations on an FK-off connection → `assertReferentialIntegrity`.
4. **seed (pre-compose)** — env→DB credential seed; default preset/characters/persona/themes; `reclaimChatLocksOnBoot`.
5. **compose** — event bus + subscriptions, role clients, every domain service + injected ops, the auth seam, the effective-config getter.
6. **crypto decrypt-probe** — runs AFTER compose via `built.services.credentials.probeKeyDecrypt()` (`entry/lifecycle.ts` is the truth).
7. **supervisors** — the vLLM supervisor (honor `VLLM_DISABLED`), the jobs worker poll loop.
8. **serve** — mount `app.ts` (middleware + tRPC + `entry/http`), start listening; healthz goes live.
9. **shutdown** — drain in-flight turns, stop supervisors, healthz → 503.

## Invariants

1. **`entry/` owns no business logic** — only wiring/boot/HTTP-edge. *(review + dep-cruiser.)*
2. **`entry/` is the ONLY tier that may import both `infra/auth` and `domain/sessions`** (the auth seam) — and the only tier that may cross features at runtime. *(dep-cruiser: `domain-no-cross-feature` exempts `entry/` alone.)*
3. **Nothing imports `entry/`** — the top of the cake. *(resolve-time.)*
4. **Every cross-feature op is typed in a `contract/` and supplied here.** *(lint: `domain-no-cross-feature`.)*

## Deferred

- **Event bus mechanism** — in-process typed bus (single-replica); the durable-outbox upgrade is the multi-replica seam. The `content_hash` catch-up sweep is the reliability backstop regardless.
