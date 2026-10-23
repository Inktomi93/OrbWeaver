---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: security
---

# Prove the login timing floor for unknown and SSO-only users

## What

`packages/server/src/domain/sessions/verbs/authenticate.ts:17` verifies an unknown handle or a row without a password hash against `ctx.dummyPasswordHash`, a well-formed scrypt hash built from the live format constants in `infra/auth/password.ts:44`, so a failed login costs the same whether the user exists. No test under `tests/server/{domain/sessions,infra/auth,entry/auth,entry/http}` asserts that path: dropping the `??` fallback or supplying a malformed dummy would fail nothing. The security review measured the floor by hand (dummy and real row both about 60 ms, a malformed hash 0 ms) on the required-seams branch.

## Why

The dummy now reaches sessions through an injected seam (`SessionsCryptoOps`), so the control is one edit away from silently disappearing.

## Done when

A sessions integration test through the production root authenticates an unknown handle and an SSO-only row and asserts the verifier ran against a well-formed hash of the live format (shape, not wall clock); shown red by removing the fallback, then green; also the two client copies of `MIN_PASSWORD_LENGTH` (`features/auth/components/login-first-run-form.tsx:19`, `features/user-admin/lib/admin-model.ts:11`) import the one constant from `@orb/contracts/identity`.

## Evidence

Filled at landing: what ran and where its output is.
