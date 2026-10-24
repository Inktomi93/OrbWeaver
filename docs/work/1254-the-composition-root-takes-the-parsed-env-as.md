---
kind: work
status: open
updated: 2026-10-23
priority: P1
area: server
---

# The composition root takes the parsed env as a dependency

## What

`packages/server/src/foundation/env/index.ts:786` parses `process.env` once into a frozen module-level `env`, and about twenty-five production sites read `env.X` from that singleton instead of taking the parsed record as a dependency: `entry/app.ts:271,291,302,386,523` (`NODE_ENV`, `IP_ALLOWLIST`, `ALLOWED_HOSTS`, `E2E_HARNESS`), `entry/rate-limit-gate.ts:84-96` (`RATE_LIMIT_WINDOW_MS`), `entry/compose/services.ts:1427` (`SEED_CONTENT`), `entry/compose/assets-character.ts:239` (the automated persona seed flags), `infra/network/egress.ts:96,569,593,599,705,1340` (`TRUSTED_PRIVATE_RANGES`, `EGRESS_FIREWALL`, `EGRESS_ALLOWLIST`, `OIDC_ISSUER`), `infra/network/ingress.ts:52` (`TRUSTED_PROXIES` computed at import time, read by `host-allowlist.ts:57`, `infra/auth/transport.ts:43`, `ingress.ts:97`), `domain/settings/effective-config/layer.ts:54-87` (the env floors for `CORPUS_AUTOINDEX`, `IMPORT_SKIP_CHARACTERS`, `PRIVATE_ENDPOINT_ALLOWLIST`, the `RATE_LIMIT_*` keys), `infra/plugin-host/process-runtime.ts:480-482,946` (`PLUGIN_BROKER_*`), `foundation/observability/debug/routes.ts:300` and `infra/crypto/key.ts:56` (`NODE_ENV`). The logger level is also set at module init (`logger.ts:56`), which the harness works around with `borrowLogLevel`.

## Why

Env stubs in tests are now a lint error and every other seam is required at the root, so these are the last knobs testkit cannot turn; the code paths behind them go untested, and the import-time read in `ingress.ts` is the class that item 1229 removed elsewhere.

## Done when

The env parse is a pure exported function in `foundation/env` applied to the process input for the module `env`; the parsed record is a required field on `ServicesDeps`, `AppDeps` and the egress and share options; every listed `env.X` read takes it from that field; `TRUSTED_PROXIES` is computed from the record and passed in; `entry/lifecycle.ts` passes the module `env` and is the only runtime reader of the singleton outside `foundation/env`; the harness builds its record from options through the production parse so a value production refuses is refused in tests; a sweep (`rg '\benv\.[A-Z_]+' packages/server/src --glob '!**/foundation/env/**' --glob '!**/entry/lifecycle.ts'`) prints nothing; the ingress, host-allowlist and egress hunks get a security-executor read; item 1253 is unblocked.

## Evidence

Filled at landing: what ran and where its output is.
