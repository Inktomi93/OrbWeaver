---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Automation suggestion refusal codes have no exported home

## What

SuggestionRefusedError builds its code as automation_suggestion\_<code> in packages/server/src/domain/automation/contract/errors.ts from file-local constants such as ACT_FAILED in verbs/confirm-suggestion.ts. Tests spell the composed literal: dispatch.int.test.ts (two sites), plugin-ask-confirm.int.test.ts (two sites), analysis-confirm.int.test.ts (one site).

## Why

Spine-Testing section 9 and the authoring checklist step 10 require every error code from its production home; a renamed code passes these tests only by accident.

## Done when

The suggestion refusal codes live in one exported \*\_CODES object read by production and by every test site.

## Evidence

Filled at landing: what ran and where its output is.
