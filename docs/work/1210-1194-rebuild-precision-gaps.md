---
kind: bug
status: open
updated: 2026-10-20
priority: P3
area: security
plan: test-foundation
---

# 1194 rebuild precision gaps

## What

debug-gate-admission.int.test.ts rows named un-credentialed callers never reach /api/\_debug add a relay header to every request (lines 35, 88), so they prove relayed refusal, and the strict-posture HTTP property survives only in two halves; docs/law/container-deployment-security.md:39 still cites the deleted legacy app.test for the cookie CSRF 403; the batch-limit rebuild in tests/e2e/csrf-gates.local.spec.ts dropped the assertion that a refused batch spends no rate-limit budget; the third case in `tests/server/entry/auth/seam-arms.int.test.ts` compares only sessions.me output where D135 (E) says deep-equals, so externalId agreement is no longer compared.

## Why

Each narrows what a security test proves or misdirects a reader.

## Done when

The describe is renamed or gains one strict-posture HTTP row per mode without the relay header; the doc cites the e2e spec; the batch spec asserts zero budget on refusal and N on admit; D135 agreement deep-compares the request and host Principals.

## Evidence

- The debug-gate describe now names both refusals. Modes with a deny fallback send no relay header. The single-user rows stay relayed because this process runs the operator posture. The production-posture HTTP row is `tests/server/entry/http/production-debug-posture.int.test.ts`, which boots a child under `NODE_ENV=production`. Per-mode strict-posture rows need a posture seam on the harness; `entry/http/app.ts` reads it through `ownerFallbackCredentialInput()`, which belongs with item 1254.
- The CSRF row in `container-deployment-security.md` cites the two CSRF e2e specs. The register row for `server/entry/app.test.ts` names those homes.
- The budget property moved to [batch budget](../../tests/server/entry/trpc-batch-budget.int.test.ts). No e2e response reports bucket counts, so the case reads `rate_limit_buckets` behind the real HTTP mount. A refused batch spends 0, and an admitted batch spends `TRPC_BATCH_MAX_ITEMS`. A planted double debit in `entry/rate-limit-gate.ts` failed both methods at 44 against 22. The source was restored exactly.
- The D135 agreement case compares the request Principal with the host Principal. The request Principal comes from the production seam over the same config and sessions. The comparison includes `externalId` and `via`.
