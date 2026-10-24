---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: server
---

# Entry and transport follow their tier law

## What

Four sites still break a written tier rule, and no check covers them.

- `packages/server/src/entry/boot/repair-stale-join-seq.ts:26-38` runs a raw `sql` UPDATE on `chat_participants` and `messages`, called from `entry/lifecycle.ts:310`. `Tier-5-Entry.md` invariant 1 says a compose module runs no query. `.dependency-cruiser.ts` exempts all of `entry/boot/*` from `entry-wiring-no-query-capability` except three named seed files, so nothing flags it.
- `packages/server/src/entry/boot/boot-secrets.ts:31-49` queries `userCredentials`, `sessions` and `chatInvites` with drizzle and passes the probe into the sessions domain's `createSettleSessionSecret` as `hasOtherDependents`. The sessions domain already owns the settle verb and the password-dependents probe (`domain/sessions/verbs/settle-session-secret.ts:12`); the credentials and invite probes stay in entry.
- `packages/server/src/entry/compose/sessions-crypto.ts:8` exports a module-level `SESSIONS_CRYPTO` constant that `entry/boot/boot-owner.ts` and `entry/compose/services.ts` import directly instead of receiving through `BootOwnerInput` and the services deps. The tier law allows the import; the defect is that a shared singleton is the only seam, and `tests/server/domain/sessions/verbs/login-timing-floor.int.test.ts:30,45` spies on it.
- `packages/server/src/transport/jobs/workload-schedule-scheduler.ts:14` imports `tickWorkloadSchedules` from `#domain/workloads` at runtime and calls it at `:49`. `Tier-4-Transport.md` says job drivers take injected ops and import only types from the workloads front door. The other three drivers comply; `entry/compose/service-jobs.ts:34-41` hands the scheduler no tick op. `drivers-through-domain` forbids only `@orb/db` and `infra/` from transport.

The structured-retry summary type lives in `packages/inference/src/contract/structured-turn.ts:29` and is imported as a type by `foundation/observability/structured-retry.ts:18`; that placement follows `AGENTS.md` and needs no move.

## Why

Each is a written tier rule with no check, so the tree drifted from it and will drift again without a control.

## Done when

- The join-floor repair lives in `domain/chat/persistence/` and is exported from the chat front door; entry only calls it.
- The three dependent probes live with their table owners (`domain/sessions`, `domain/chat/persistence/invites.ts`, `domain/credentials`) and entry composes them into `hasOtherDependents`.
- The crypto ops are required fields on `BootOwnerInput` and the services deps, supplied from `lifecycle.ts` and the testkit root; the module-level constant is gone and the login timing test injects its spy through the root.
- `domain/workloads` supplies the tick op, `entry/compose/service-jobs.ts` injects it, and the scheduler deps type it.
- The `entry/boot/*` exemption in `entry-wiring-no-query-capability` narrows to the files that must run a query, with the reason per file, and a new dependency-cruiser rule bars runtime `#domain/` imports from `transport/jobs`; each rule has a planted failing control.
- The boot, sessions, credentials, workloads and jobs suites pass with no assertion weakened.

## Evidence

Filled at landing: what ran and where its output is.
