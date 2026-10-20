---
kind: bug
status: open
updated: 2026-10-20
priority: P3
area: security
---

# 1194 rebuild precision gaps

## What

debug-gate-admission.int.test.ts rows named un-credentialed callers never reach /api/\_debug add a relay header to every request (lines 35, 88), so they prove relayed refusal, and the strict-posture HTTP property survives only in two halves; docs/law/container-deployment-security.md:39 still cites the deleted legacy app.test for the cookie CSRF 403; the batch-limit rebuild in tests/e2e/csrf-gates.local.spec.ts dropped the assertion that a refused batch spends no rate-limit budget; the third case in `tests/server/entry/auth/seam-arms.int.test.ts` compares only sessions.me output where D135 (E) says deep-equals, so externalId agreement is no longer compared.

## Why

Each narrows what a security test proves or misdirects a reader.

## Done when

The describe is renamed or gains one strict-posture HTTP row per mode without the relay header; the doc cites the e2e spec; the batch spec asserts zero budget on refusal and N on admit; D135 agreement deep-compares the request and host Principals.

## Evidence

Filled at landing: what ran and where its output is.
