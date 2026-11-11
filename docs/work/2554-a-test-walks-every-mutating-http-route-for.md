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

The law census found two rulings in .claude/rules/server-edge.md with no checker. CSRF must cover every mutating route: tRPC has one central check, but the plain HTTP routes are guarded one at a time and no test enumerates the route table. A route that serves its own content security policy must be registered with the security headers module's servesOwnPolicy list; the census reports a third such route that is not registered, which is unverified. Source: the leg-one report under reports/law-census.

## Why

A new mutating route with no CSRF check, or a route whose policy is overwritten or doubled, is a security defect that nothing fails on today.

## Done when

A test enumerates the composed app's routes from production and fails for a mutating route that does not pass through the CSRF check, with a planted route as its control. A test fails for a route that sets its own policy and is not registered. The reported unregistered route is confirmed and fixed, or the census row is corrected with evidence.

## Evidence

Filled at landing: what ran and where its output is.
