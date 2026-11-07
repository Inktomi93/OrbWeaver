---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a87a17d0e7877c3a3
plan: type-law
---

# Every dialog has a dismiss path by type: FormDialog owns its footer with submit required and Cancel always rendered, replacing orb/dialog-needs-dismiss

## What

Make FormDialog own its footer, with a required submit and a Cancel that is always rendered, and remove the orb/dialog-needs-dismiss rule.

## Why

A dialog can ship with no way out because only a lint rule checks for one. Type law 5 says a wrong composition fails the typecheck.

## Done when

A dialog built on FormDialog without a submit fails the typecheck. orb/dialog-needs-dismiss is gone from eslint.config.ts and tooling/src/eslint/ui-feature-policy.ts, and docs/law/client-architecture-lockdown.md no longer lists the item.

## Evidence

Filled at landing: what ran and where its output is.
