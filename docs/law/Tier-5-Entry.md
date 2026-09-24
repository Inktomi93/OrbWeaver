---
kind: law
status: active
updated: 2026-09-18
---

# Orbweaver — `entry`: the composition root

`entry/` is the topmost server tier — the ONE place allowed to cross every boundary, because it *wires* everything and owns no business logic. Imports flow DOWN only; `entry` may import ANY lower tier (transport, domain front doors, infra, foundation, kit) — it is the only tier that may, and nothing imports `entry`.

## What this tier owns

1. **The composition root** — constructs every domain service (passing each its `*Context` DI bundle), resolves the cross-feature **injection model** (every "injected at the composition root" op is wired HERE), and hands the wired services to transport. Built LAST (after all domains) and the reason domains never import each other sideways.
2. **The boot protocol** — `index.ts` is intentionally tiny (construct the lifecycle, wire OS signals, `boot()`); `lifecycle.ts` runs `migrate → seed → supervisors → compose → serve` + graceful shutdown.
3. **The HTTP edge** — `entry/http/`: the non-tRPC registrars (binary blob serve, multipart upload, healthz, the prod SPA static-serve) + the auth-mint routes + cookie I/O. Non-tRPC registrars are `entry/`, not `transport/` — they compose domain+infra+the auth seam (`Core-0-Architecture-and-Structure.md` §3).

NOT owned: business logic (domains), drivers (transport), I/O adapters (infra), env/observability (foundation). Entry only *assembles* them.

## Layout

```
packages/server/src/entry/
├── index.ts                  the process entry point — construct lifecycle, wire signals, boot()
├── lifecycle.ts              boot/shutdown protocol (per D5: entry, NOT foundation)
├── app.ts                    the Hono builder (middleware order, ingress-allowlist, mount tRPC + http)
├── rate-limit-gate.ts        builds the RateLimitGate impl (limiter instances need db; bucket POLICY lives here;
│                             transport declares only the port — docs/law/Tier-4-Transport.md §"rate-limit").
│                             Second policy site: http/auth-routes.ts owns its own login-IP throttle,
│                             adjacent to the route it guards.
├── auth/seam.ts              THE AUTH SEAM — the ONE Principal construction site: wires infra/auth (verify)
│                             + domain/sessions (resolve/validate/upsert) (per §7 D1)
├── boot/                     migrate.ts (backup → FK-off migrations → foreign_key_check) · seed-owner.ts ·
│                             seed-credential.ts (env→DB-once) · seed-default-preset.ts ·
│                             seed-default-characters.ts · seed-default-persona.ts (+ seed-default-persona-step.ts) ·
│                             seed-themes.ts · reclaim-locks.ts. The default CONTENT the seeders lay
│                             down is NOT here — avatars + demo-chat transcripts ship as
│                             `@orb/default-content`, plugin bundles as `@orb/showcase-plugins` (D160)
├── compose/                  THE COMPOSITION ROOT (non-auth wiring; no logic)
│   ├── services.ts           constructs every domain service with its Context; the injection graph —
│   │                         incl. `roleClientsFor(funderUserId)`, the runtime's PER-CALL fold over
│   │                         connection_bindings (Tier-3b §"The composition seam"; no boot-time binding)
│   ├── chat.ts               the chat domain's slice of the graph
│   ├── workload-contributions.ts  spreads every domain's WorkloadContribution factory into ONE exhaustive
│   │                         registry (D117 — the former runner-env.ts hub is DELETED; D4 superseded)
│   ├── event-bus.ts          the in-process typed event bus + subscriptions (embeddings indexer, …)
│   ├── effective-config.ts   wires settings' getEffectiveConfig sync getter + the boot reload
│   ├── room-reach.ts / emit-chat-changed.ts   cross-feature event-emit wiring (room-reach = the entity→room
│   │                         reach table: a DomainEvent → a live-only roomEntityChanged per reached room)
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
│   ├── spa.ts                the prod SPA static-serve: hashed-asset immutable cache + index.html
│   │                         history fallback (registered LAST; /api/* misses never get HTML;
│   │                         CLIENT_DIST_DIR missing → prod boot-fatal, dev skipped)
│   └── healthz.ts            liveness + credentials_key_mismatch / shutdown-503 signals
└── import/                  the bulk-import composition drivers (run-profile-import · run-bundle-import ·
                              build-import-context) — the upload route + the import-st runner
```

Inventory lists are illustrative — the tree on disk is the truth.

## Runtime dependencies

Versions live in the pnpm catalog (`packages/server/package.json`). Two dependencies need a reason:

- `@hono/node-server` — the Node HTTP listener; the `httpServer` object `lifecycle.ts` takes injected IS this lib's `serve()` return.
- `openid-client` v6 — the OIDC **mint** flow only (discovery, PKCE, code exchange) at `http/auth-routes.ts`. The **verify** side (JWKS) is `infra/auth`'s `jose` (`docs/law/Tier-3-Infra.md`) — client-side mint lands at entry, never infra.

## The injection model (how the cake stays clean without sideways imports)

Every cross-feature dependency is a **typed op declared in the consumer domain's `contract/` + wired here**. `entry/compose/services.ts` is the graph. The rule: if two domains must interact, the consumer declares the op TYPE in its `contract/`; `entry` supplies the runtime fn. A domain importing another domain's `index.ts` for a runtime value (outside the sanctioned `@orb/db` bulk-read pattern) is a `domain-no-cross-feature` violation.

## Boot order

Keep the split: **only `seedOwner` runs pre-compose**, because compose binds the owner role-clients against the owner id. **Every other seed runs post-compose**, because it consumes a composed service or seeder. `entry/lifecycle.ts` is the truth.

1. **`installEgressFirewall()`** — the FIRST boot step (swaps undici's global dispatcher before anything else can open a socket; `docs/law/Tier-3-Infra.md`).
2. **env** (`foundation/env`) — the one `process.env` read (at module load); `superRefine` boot-fatality per `AUTH_MODE`.
3. **migrate** — `backupBeforeMigrate` → chain-aware baseline drift check (boot-FATAL on a db whose applied migration is in no shipped journal entry — D163; `pnpm seed:demo --fresh` is the only wipe) → migrations → `assertReferentialIntegrity`.
4. **seed-owner (pre-compose)** — resolves the owner id the compose graph binds against, via a TRANSIENT sessions service (compose owns the real one). The ONLY pre-compose seed.
5. **compose** — event bus + subscriptions, role clients, every domain service + injected ops, the auth seam, the effective-config getter.
6. **crypto decrypt-probe** — `built.services.credentials.probeKeyDecrypt()`, immediately after compose (a failure flips healthz to `credentials_key_mismatch`; boot continues).
7. **seed (post-compose)** — env→DB credential seed (needs the composed credentials service); default preset/themes/characters/persona (the seeders are composed); `reclaimChatLocksOnBoot`; then the fire-and-forget host-offline **deferred-turn drain** (`chat.drainDeferredTurns` — the `pending_turns` reclaim; does real generation, so it must NOT block listen).
8. **supervisors** — the workloads worker poll loop, the catalog-refresh / workload-schedule / (oidc-only) oidc-gc schedulers.
9. **serve** — mount `app.ts` (middleware + tRPC + `entry/http`, the SPA static-serve registered LAST so every API/auth route wins by order; a missing client bundle is boot-fatal in prod, skipped-with-log in dev where vite serves the SPA), await the async bind (an `EADDRINUSE` surfaces as a server `error` event, not a throw — boot fails loudly on a dead listener), start listening; healthz goes live.
10. **shutdown** — close the listener (healthz → 503 first, so the LB pulls traffic), stop supervisors, drain vLLM, db pre-close housekeeping.

## Invariants

1. **`entry/` owns no business logic** — only wiring/boot/HTTP-edge. *(review + dep-cruiser.)*
2. **`entry/` is the ONLY tier that may import both `infra/auth` and `domain/sessions`** (the auth seam) — and the only tier that may cross features at runtime. *(dep-cruiser: `domain-no-cross-feature` exempts `entry/` alone.)*
3. **Nothing imports `entry/`** — the top of the cake. *(resolve-time.)*
4. **Every cross-feature op is typed in a `contract/` and supplied here.** *(lint: `domain-no-cross-feature`.)*

## Deferred

- **Event bus mechanism** — in-process typed bus (single-replica); the durable-outbox upgrade is the multi-replica seam. The `content_hash` catch-up sweep is the reliability backstop regardless.
