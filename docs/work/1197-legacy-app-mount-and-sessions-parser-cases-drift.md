---
kind: bug
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Legacy app mount and sessions parser cases drift from production

## What

Runtime reds unrelated to Principals. Rows: entry/app.test 'GET /healthz 200 ok when live', '503 shutting_down', '503 credentials_key_mismatch': healthz now carries a version block the assertions omit; entry/app.test 'GET /api/auth/config the injected mode + flags': reads mode oidc from the checkout env, expects single-user; entry/app.test 'GET /join/:token 404 while not multi-human capable': answers 302 under the same env; transport/trpc/routers/sessions.test:60 'the procedure parses its result through the canonical viewerViewSchema': the schema identity it compares no longer matches. Paths under tests/legacy/server/.

## Why

The expectations encode an older healthz payload, an env-dependent auth config and an older viewer schema.

## Done when

Each case asserts the current production contract under an injected, env-independent config, or is removed with its rebuild cited.

## Evidence

Filled at landing: what ran and where its output is.
