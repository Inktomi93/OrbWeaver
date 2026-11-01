---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: server
plan: unwired-code
---

# Judge the unwired auth members: AuthSeamResolution.csrfHeaderPresent, IdentityResolution.hasCsrfHeader, PasswordHasher.enabled and dummyHash, ResolveDeps.oidcStore

## What

Judge each auth member the unwired scans flagged as a live control, a dead control or dead code. Delete a dead member only with proof that no control reads it. Prove each live control through its real door by breaking it.

## Why

A field that looks unread can be a control nobody enforces. The scan reports members, and it cannot say which one guards a request.

## Done when

Each row below has a verdict with evidence, each live control has a door test that goes red when the control is removed, and any real gap is fixed with a test.

## Evidence

The one real gap: `DATABASE_URL` stayed in `process.env` after the boot scrub, so every child started without an explicit env inherited it, and a remote URL can carry a token. `APP_SECRET_ENV_KEYS` now holds it. `tests/server/entry/boot/secret-boot-process.int.test.ts` went red first with `expected [ 'DATABASE_URL' ] to deeply equal []`.

| Row | Verdict | Evidence |
| - | - | - |
| `AuthSeamResolution.csrfHeaderPresent` | dead code, deleted; the control is live elsewhere | `entry/app.ts` reads only `principal` and `sessionId` from the seam, then computes `csrfHeaderPresent` from the request for the tRPC context. `trpc.ts` gates on the context field. Removing that gate turned the new `seam-arms` mount test from 403 to 200. |
| `IdentityResolution.hasCsrfHeader` | dead code, deleted | Zero reads. Every route gate calls the `hasCsrfHeader` function on its own request. Each mutating route was read: tRPC, the ingest routes, the auth routes, the frame routes and the bug report all gate, and the backchannel logout is a verified server call. |
| `PasswordHasher.enabled` | dead code, deleted; the control is live elsewhere | Zero reads, and the compiler confirms it. With no pepper, `hash` and `verify` throw before any KDF. A cookie mode never gets there: `entry/lifecycle.ts` refuses the boot. `secret-boot-process` boots the real entry over a corrupt keyfile, sees exit 1 and the file unchanged, and goes red when both refusals are removed. |
| `PasswordHasher.dummyHash` | live control, kept | `authenticate` verifies against it for an unknown handle and an SSO-only row. Median `authenticate` time was 56.84 ms unknown and 58.86 ms wrong password. With the dummy removed it was 0.26 ms and 114.94 ms, and `login-timing-floor` went red in both cases. Every `password_hash` writer stores `hash()` output, so no row skips the KDF. |
| `ResolveDeps.oidcStore` | dead code, deleted | No mode resolver reads it. The PKCE store reaches the routes through `OidcRoutesDeps.store` (`entry/http/oidc.ts`). |
| `createAuthSeam.deps.oidcStore` | dead code, deleted | Neither the production seam (`entry/http/app.ts`) nor any test passes it. |
| `Services.sessions` | dead code, deleted | No router or transport module reads it, and `routers/sessions.ts` states that identity comes from `ctx.auth`. Deleting it removes the session mint and user ensure verbs from the tRPC context. Two test sites moved to `app.sessions`, the production reader. |
| `loadOrCreateKeyfile.generate` | dead code, deleted | No caller passes it, and the test it was added for does not exist. `randomBytes` was the only value. |
| `startOidcGcScheduler.deps.intervalMs` | dead code, deleted | No caller passes it. The hourly reap stays live: `entry/http/oidc.ts` starts it, and `scheduler-log-level` advances it by `MS_PER_HOUR`. |
| `HOST_SECRET_ENV_KEYS` (rows in [1637](1637-judge-the-inference-union-members-the-unwired-unions.md)) | dead control, deleted | The test ran over `SUPPORTED_HOST_ENV_KEYS`, which holds no member of it, so it could never fire. The ambient Claude prefix test beside it was dead the same way and went with it. The allowlist is the firewall. The new `env-seams` test plants every app secret and ambient key in the host env through a real agent turn, and goes red when a secret joins the allowlist. |
| `ROLE_POLICY_ENV_KEYS` (rows in [1642](1642-judge-the-server-domain-sessions-union-members-the.md)) | live, kept | `substrate/role-policy.ts` reads all six keys. The tuple now holds constants, so `tupleOf` in `tooling/src/unwired/unions.ts` skips it and the scan needs no teaching. |
| `authConfigFromEnv`, `oidcPendingJoinCookieFor`, `readRequestCookie` (rows in [1683](1683-judge-the-server-entry-shapes-the-unwired-shapes.md)) | live, kept | `tests/support/node/server.ts` and `tests/support/node/corpus-oidc.ts` read them through `@orb/server/entry/auth`, and `infra/auth` has no package export. |
| `ownerFallbackPeerWarnings`, `resolveOwnerFallbackPeers` (rows in [1684](1684-judge-the-server-foundation-shapes-the-unwired-shapes.md)) | live, chain removed | The boot warning and the widening posture read them. `entry/lifecycle.ts` now imports them from `#foundation/env/record`, so `foundation/env/index.ts` drops the re-export. |

Sweep before each deletion: `ast-grep` with `$X.m`, `$X?.m`, `$X["m"]` and the destructuring forms over `packages tests tooling scripts`, 5958 `ts` files and 1531 `tsx` files, plus a literal `rg`. `csrfHeaderPresent` reads resolve to the tRPC context only. `hasCsrfHeader` as a member has 0 hits. `oidcStore` has only the seam's own spread. `enabled` and `sessions` are common words, so the compiler proves those two: the Node, server and inference worlds typecheck with both removed.

The child env control also rests on `spawn` options: the Claude Agent SDK replaces `process.env` with `options.env` (`sdk.d.ts`, and `sdk.mjs` builds `pt=D?{...D}:{...process.env}`). The plugin host and broker pass an explicit `NODE_ENV`-only env. Every other child inherits the scrubbed `process.env`.
