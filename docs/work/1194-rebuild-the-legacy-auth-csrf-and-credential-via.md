---
kind: work
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# Rebuild the legacy auth, CSRF and credential-via cases at the e2e layer

## What

Cases that need a cookie or forward-auth Principal, or an auth seam double that hands the seam a role (the row resolver mints via fallback only). Rows: transport/trpc/trpc.test:113,127,139,151 tRPC CSRF: cookie mutation without header refused, with header passes, header credential exempt, queries never gated (now throw at the wrapper); trpc/routers/sessions.test:42 sessions.me keeps externalId and via off the wire (throws); trpc/routers/automation.int:131 mounted create recovers after a lost response; entry/app.test:86 COOKIE_OWNER cases 165,249,828,835,1043,1073, mount over a cookie principal incl. the mount CSRF refusal; entry/http/upload.test:136,462 cases 433,439,461 upload guard CSRF by via; http/import-chat.test:20,25 case 163; import-tree.test:29,34 cases 196,233; import.test:43,48,49 cases 172,182,191,200 plus staging cases 210-314 on the same principals: import guard CSRF by via; http/auth-meta.test:89 cases 287,329,349,355 projections over a request principal; http/portability-routes.suite.int:36 cases 101,133,207,272 export/import routes incl. the fallback CSRF refusal; entry/debug-gate.suite:164,179,186,201 every case, the /api/\_debug credential-and-owner gate (D17); entry/auth/seam.test:149-617 every case, the three seam paths and fail-closed gates (D135, relay, debugGateAdmits); http/auth-routes.test:271,1933 and auth-routes.int:68 OIDC callback and local route cases; entry/boot/owner-claim.test:44 cases 71,93 owner-claim over a host resolver double. Paths under tests/legacy/server/.

## Why

The layer table gives auth, cookies and CSRF to e2e; rebuilt server tests never mint cookie or header Principals, so a testkit door for them would exist only for legacy. Today these cases fail to typecheck or throw at the trpc wrapper, and tRPC unit-level CSRF proof is down to two mount-level controls in app.test.

## Done when

Every listed behaviour is proven by an e2e or real-seam test through a real credential, and the listed legacy cases are removed with their rebuild cited.

## Evidence

Filled at landing: what ran and where its output is.
