---
kind: work
status: doing
updated: 2026-11-07
priority: P3
area: security
lane: wt/agent-a38f7b86f9a820d87
plan: restoration-register
---

# Bind signed forward-header verification to an operator-trusted key source

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-SERVERSEC-Q0001`: Revalidate the live signed forward-header path. Bind verification keys to an operator-trusted source independent of caller JWT and JWKS metadata.

Inspect `tests/server/entry/auth/forward-jwks-execution.int.test.ts`, `packages/server/src/infra/auth/jwks.ts`, `packages/server/src/infra/auth/modes/forward-header.ts` and `packages/server/src/entry/auth/seam.ts`.

## Why

`AF3-SERVERSEC-Q0001`: Under the specified mode and ingress prerequisites, caller-selected literal keys can validate a caller-signed token without establishing trusted identity authority.

The source scenario requires forward-header JWT verification, a configured JWKS host allowlist, an admitted application host and ingress preserving caller-controlled authentication headers. A proxy that replaces those headers prevents that prerequisite. Preserve enabled-user checks and legitimate subject-binding behavior; no OIDC-cookie or deployment-wide claim follows.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-SERVERSEC-Q0001`: A native HTTP key-source substitution is refused without changing owner binding. Preserve configured-key success and D258 subject, enabled-owner and trusted-proxy behavior. Establish actual ingress prerequisites; no deployment exposure is presumed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
