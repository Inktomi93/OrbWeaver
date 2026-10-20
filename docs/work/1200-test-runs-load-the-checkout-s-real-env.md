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
