---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: testkit
---

# Test roots set auth posture through the env record, not the authConfig overlay

## What

The harness `authConfig` option in `tests/support/node/server.ts` is a `Partial<AuthConfig>` overlaid on `authConfigFromEnv(record)`. Many suites use it for pairings the env parse accepts, for example `{ mode: "local", fallback: "deny" }` in `corpus-plugin-http`, `recipient-isolation` and `corpus-chat-outputs`, and seven suites set `forwardTrustedProxies` through it (`body-limit-ordering`, `users`, `role-policy-config` twice, `seam-arms` twice, `import-owned`, `debug-gate-admission`). In those roots the record still says `single-user` with no trusted proxies while the app runs the overlaid config. Readers that take the record disagree with the live config: `bugReportDiagnostics` reports the record's `runtime.authMode`, `ownerFallbackCredentialInput(deps.env)` in `entry/http/app.ts` judges the record's posture, and the app's `X-Forwarded-*` reads trust only the record's proxies. Production cannot produce that split, since one `FORWARD_AUTH_TRUSTED_PROXIES` key and one `AUTH_MODE` key drive both sides.

## Why

Tests run the product. A root whose record and live config disagree exercises a configuration no operator can reach, so a pass there proves less than it reads. Found by the verifier and security reads of item 1254: the overlay is honest only for the parse-refused pairings; the seven `forwardTrustedProxies` sites are harmless today because loopback is always a trusted hop, but the split is still one production cannot produce.

## Done when

Every suite whose `authConfig` pairing the parse accepts sets `env: { AUTH_MODE, AUTH_FALLBACK, FORWARD_AUTH_TRUSTED_PROXIES }` instead, so one record drives the auth seam and the app's forwarded reads. The `authConfig` overlay remains only for pairings the parse refuses (for example `single-user` with `deny` in `body-limit-ordering`), and its doc comment in `tests/support/node/server.ts` says so. The sweep uses the codemod toolchain, not hand edits, where the rewrite is mechanical. The affected suites pass under `pnpm test` with no assertion weakened.

## Evidence

Filled at landing: what ran and where its output is.
