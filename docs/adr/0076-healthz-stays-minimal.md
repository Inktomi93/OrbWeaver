---
kind: adr
status: active
updated: 2026-09-25
---

# Healthz stays minimal

## Context

Not recorded in the ledger row.

## Decision

**`/healthz` stays minimal `{status}` (+ shutdown/key-mismatch reason); operational detail lives behind auth.** neo's health route carried a version + vLLM-engine-status + runnerOverride rider on an UNAUTHENTICATED endpoint — fingerprinting fodder, and orchestrator probes (docker healthcheck, k8s, uptime monitors) want a status code, not a payload. Orbweaver's split is deliberate: `/healthz` = liveness/readiness only; version/engines/runnerOverride = the auth-gated `/api/_debug/info`. If the client ever needs live engine status for UI, expose it as an `adminProcedure` query over the engine-status registry — never widen healthz. Do not re-flag the missing rider as a parity gap.

## Consequences

`/healthz` carries the build-identity block only for the box operator: a loopback TCP peer on a request with no relay header, the `ownerFallbackAllowed` check. The gate is `HealthzDeps.identityVisible` in `packages/server/src/entry/http/healthz.ts`, wired in `packages/server/src/entry/app.ts`. Every other caller, a share link or a LAN client included, gets the status fields and the `harness` stamp. A signed-in owner gets no exception on this route; the owner reads the version through `settings.getVersion`.

## Alternatives rejected

Not recorded in the ledger row.
