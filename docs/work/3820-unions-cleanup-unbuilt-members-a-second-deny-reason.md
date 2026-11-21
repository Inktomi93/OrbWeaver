---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: unwired-code
---

# Unions cleanup: unbuilt members, a second deny-reason tuple and unread evidence tiers

## What

The unions review (reports/unwired/unions-judge.md) found: TURN_KINDS.opening has no producer under D166, which rules out a generated opening, and the comment in chat/verbs/turn.ts claiming one is stale; CASCADE_SOURCES.dynamic and APPEARANCE_PROPERTY_UNITS px and rem are never produced by any rated row or manifest entry; PROVISION_DENY_REASONS in packages/server/src/entry/http/auth-routes.ts restates the sessions tuple; two server tests re-spell the MUTATING_METHODS set instead of importing it; ADR 0123 names VIEWER_SACRED_THEME_KEYS, which no longer exists; and the capability fold in synthesize.ts follows the EVIDENCE_TIERS order without reading the tuple.

## Why

Unbuilt members keep dead branches alive, and a restated tuple drifts from its home.

## Done when

The unbuilt members and their branches are deleted, the turn.ts comment is fixed, auth-routes and the two tests import their tuples from the home, ADR 0123 names the current partition, the fold derives its order from EVIDENCE_TIERS, and the affected suites and typecheck worlds pass.

## Evidence

Filled at landing: what ran and where its output is.
