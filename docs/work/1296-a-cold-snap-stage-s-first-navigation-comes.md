---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tooling
plan: test-foundation
---

# A cold snap stage's first navigation comes up degraded

## What

In the 0656 lane, each cold isolated snap stage boot, or re-sync into a cleared stage, failed its first navigation: data-app-ready came up degraded (reads still in flight at the client's readiness ceiling, tooling/src/snap/ops/drive.ts). A warm retry passed. Six of fourteen runs failed this way; the runs are under reports/runs/snap/agent-a46b39870d7116c01-\* in the main checkout (gitignored).

The same failure appears on the e2e path: the first corpus case of a cold `scripts/corpus-fixture.ts e2e` run reported `data-app-ready="degraded"` with the router splash still up after 30 s, while the lazy `authed-app` chunk was still compiling under vite dev, at a load average near the core count. Artifacts: the cb-shelle2e run0 copy in the session scratchpad. The cause is likely shared: a readiness ceiling shorter than a cold dev transform under load.

## Why

Spine-Testing keeps cold failures as failures; a stage that needs a warm retry makes every first capture unreliable and teaches lanes to rerun until green.

## Done when

E2E: every mode serves a production build of the client, the way the OIDC project already does in `playwright.config.ts`, so no cold e2e run compiles modules on demand; a cold run on a loaded box passes its first corpus case with the readiness ceiling unchanged. Snap: the cause of a cold isolated stage's degraded first navigation is named (dev transform, a read past the ceiling, or stage seeding) and fixed without raising the ceiling or adding a retry; a cold-boot snap run passes first time.

## Evidence

E2E half (snap half still open):

- Mechanism: every mode's server serves one client build (`E2E_CLIENT_DIR`, `tests/e2e/support/modes.ts`), as the OIDC mode did. The first booted webServer builds it (`playwright.config.ts`, `CLIENT_BUILD`); the rest reuse it. Specs drive the server origin; the dev-target drive keeps the operator's vite.
- The build sets `NODE_ENV=development` so `import.meta.env.DEV` instruments stay: `window.__orb` is read by the specs in `tests/e2e/support/chat-room.ts` and `browser-actors.ts`. A plain production build folds them away. Owner decision open: replace those signals, then drop `NODE_ENV=development` from `CLIENT_BUILD`.
- Smoke selection from the test-foundation design, cold, load 21.5: 32 passed, 1 skipped, 1 failed. The failure, `oidc-pending-join.oidc.spec.ts`, fails the same way on the unchanged tree (load 22.2).
- First corpus case, cold, load 22.2 at start: `corpus-home-launch.spec.ts` under `corpus-desktop-bubble`, 4 passed, first case 8.7 s, no degraded readiness.
- Control, single-user pointed back at vite dev, load 23.1: same file, 4 passed, first case 15.0 s.
