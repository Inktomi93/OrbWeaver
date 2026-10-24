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

- The `auth-config-overlay-to-env` codemod (`tooling/src/codemods/auth-config-overlay-to-env/`) rewrote the inline and the `const`-bound overlays; its fixtures cover each refused and judgment shape. A dry run over `tests/` after the corpus move rewrites nothing.
- The corpus harness composes over `env`: its default record posture is `local` with `deny`, and callers pass record keys.
- The overlay remains for `single-user` with `deny`, in `body-limit-ordering`, `body-limit-population`, `auth-meta` and the `debug-gate-admission` builder, and as the fixtures' `authConfig` slot.
- `debug-gate-admission` gains one strict-posture HTTP row per mode with no relay header. The red is the production change: passing `fallbackWidened: false` at `packages/server/src/entry/http/app.ts`, where the seam reads `ownerFallbackCredentialInput(deps.env)`, fails all four rows and no other case.
- `tests/support/node/env-seams.int.test.ts` shows a resumed corpus root's record matches the mode `/api/auth/config` serves; it is red on the previous corpus harness, whose record said `single-user`.
