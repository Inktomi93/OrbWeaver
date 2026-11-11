---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: security
---

# The deployment security doc says a proxy in front of the app must not answer CORS preflights

## What

The tRPC mount's cross-site defence is its JSON-only content type check: a JSON request forces a browser preflight, and the app grants no CORS, so the request never arrives. That holds only while nothing in front of the app answers the preflight on its behalf. The assumption is written in no doc. The owner approved recording it. Source: the second security review of the route checker branch under reports/review.

## Why

An operator who adds permissive CORS at their reverse proxy removes the defence without changing the app, and nothing tells them.

## Done when

docs/container-deployment-security.md, or the deployment doc that owns proxy requirements, states that a reverse proxy must not add CORS response headers or answer preflights for the app, with the reason in one sentence, and the auth law's CSRF invariant points to it.

## Evidence

Filled at landing: what ran and where its output is.
