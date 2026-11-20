---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: tooling
plan: unwired-code
---

# The unwired unions scan counts a member built through a discriminated-union variant, a key-list tuple or a parsed request value

## What

pnpm unwired unions on main reports members unbuilt that production builds. DOMAIN_EVENT_TYPES persona.updated is emitted at packages/server/src/domain/persona/verbs/update.ts through a variant that re-spells the literal (packages/contracts/src/events/index.ts). POPUP_LOOK in packages/client/src/components/content-dialog.tsx only names prop keys for a type. MUTATING_METHODS in packages/server/src/entry/auth/csrf-exemptions.ts types a request method that arrives from outside. These match the scan's own stated limits, so its unbuilt list is mostly noise.

## Why

A dead-member report that lists live members gets ignored, and real dead members hide in it.

## Done when

The scan credits a literal in a discriminated-union variant or hand-written union that a tuple's members feed, lists a tuple used only as a key list for a type, and sorts a member typed from outside input as parsed. A test per class goes red against the current scanner. A rerun on main lists only members no production path builds, each checked against the code.

## Evidence

Filled at landing: what ran and where its output is.
