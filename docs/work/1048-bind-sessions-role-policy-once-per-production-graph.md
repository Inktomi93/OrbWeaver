---
kind: work
status: doing
updated: 2026-10-18
priority: P1
area: server
lane: codex/session-role-policy-config-1006
plan: test-foundation
---

# Bind sessions role policy once per production graph

## What

Replace sanctioned call-time environment reads with one immutable domain-owned policy injected into sessions and every boot, auth, signup and admin consumer. Foundation retains raw configuration ownership.

## Why

Authorization configuration must have the graph lifetime, not depend on later process-env mutations or legacy test setup.

## Done when

Production-root controls preserve login-time group rederivation, owner and subject protections, legacy flag grammar and isolated graphs. Remove only covered environment exceptions after independent security review.

## Evidence

Production-root controls and independent security review qualify immutable deployment policy with current-login groups, owner proof and reserved-handle protection. Source and covered environment exceptions land together. Matching scoped checks pass; inherited compiler, legacy and import failures remain explicit. Broader native lint and application qualification follow D317. Evidence: `reports/review/1048-session-role-policy-config-delivery.md` and `reports/review/1048-session-role-policy-security-independent.md`.
