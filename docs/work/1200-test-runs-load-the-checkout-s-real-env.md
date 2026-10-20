---
kind: bug
status: open
updated: 2026-10-20
priority: P1
area: security
plan: test-foundation
---

# Test runs load the checkout's real .env despite ORB_ENV_NO_FILE

## What

Lane worktrees carry .env as a symlink to the main checkout's real .env, and its keys reach vitest workers even with ORB_ENV_NO_FILE=1 set: a probe saw AUTH_MODE, AUTH_FALLBACK, DEBUG_TOKEN, OIDC_ALLOWED_GROUPS and OWNER_HANDLES set. tests/server/foundation/observability/debug/settings-read.int.test.ts gets 401 instead of 404, and legacy app.test reads mode oidc from the checkout env. The same leak likely hits test runs on main.

## Why

Tests that read the owner's real secrets and auth config are nondeterministic and can expose private configuration to test output; the test layer must run on injected, env-independent config.

## Done when

The loader that reads .env under test is found and honours ORB_ENV_NO_FILE, the test runners set it so no worker sees the checkout's .env, a test proves a worker started with a .env present sees none of its keys, and settings-read passes with the .env link in place.

## Evidence

Filled at landing: what ran and where its output is.

Cause, traced with a resolve hook: the verify CLI that pnpm test:scoped runs statically imports @orb/server/entry/boot through tooling/src/verify/cli.ts:85, verify/lib/cli-help.ts, verify/ops/baseline.ts:13, verify/ops/gen/snap-flags-index.ts:20, the snap guards and stage-keeper chain, and tooling/src/snap/ops/stage-source.ts:12. That reaches the server logger and then foundation/env, which loads .env with override into the CLI process (packages/server/src/foundation/env/index.ts:181). testProcessEnv (tooling/src/floor/process/process-env.ts:31) passes that environment to vitest, so the workers' ORB_ENV_NO_FILE arrives too late. Fix both halves: keep the verify CLI's static graph off server entry code by loading stage-source only when a stage verb runs, and have testProcessEnv start test workers from an explicit allowlist rather than the parent environment.
