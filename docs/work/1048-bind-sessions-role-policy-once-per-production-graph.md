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

The call-time exception is sanctioned for test setup, not required by the identity ledger. A production-root control observes late environment changes altering login role. The assigned lane binds immutable configuration while preserving current-group rederivation and meaningful cases. Evidence: `reports/review/1006-session-role-policy-config-survey.md`.
