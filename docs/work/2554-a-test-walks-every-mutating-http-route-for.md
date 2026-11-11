---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: security
plan: checked-law
---

# A test walks every mutating HTTP route for the CSRF check, and every route with its own CSP is registered

## What

A route that serves its own content security policy writes the header in its handler and is registered separately with the security headers module (packages/server/src/entry/http/security-headers.ts). When a route is not registered, the app policy overwrites the handler's policy before the response leaves, so the defect leaves no evidence on the wire and no test of responses can find it; the plugin frame asset route was in that state until it was registered. The CSRF half of this item is done: a test walks every mutating route in every auth mode, exemptions cite their ruling, and the byte-ingest routes require the header on every auth path. A single table of policies does not fit, because the card frame computes its policy on every request from the character's grant, the deployment ceiling and the viewer's script setting. Source: the route checker lane report under reports/lanes and its two security reviews under reports/review.

## Why

A policy written in one place and registered in another can be forgotten silently, and the route then ships the wrong policy with every test green.

## Done when

The security headers module exports one registrar that registers an own-policy route and exempts its path from the app policy in the same call; a handler returns its policy beside its body and status and only the registrar builds the response, so a plain route cannot return it. A native lint entry refuses the content security policy header name outside that module. The three own-policy routes use the registrar, the own-policy test stays green, and a planted handler that sets the header directly fails lint.

## Evidence

Filled at landing: what ran and where its output is.
