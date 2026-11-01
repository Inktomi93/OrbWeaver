---
kind: bug
status: open
updated: 2026-11-01
priority: P3
area: client
plan: cross-surface-consistency
---

# The remaining raw labels in rule-analysis-fields.tsx and rule-tool-fields.tsx use the Field label grammar

## What

The route switches in `rule-analysis-fields.tsx` use `SettingSwitchRow` and the Tool select in `rule-tool-fields.tsx` uses `Field`, replacing hand-spelled `label`/`htmlFor`/`aria-label` pairs.

## Why

A one-off labeled control uses the `@orb/ui` Field label grammar, as `rule-editor-settings.tsx` already does; the raw label plus duplicate `aria-label` could drift.

## Done when

No raw `<label>` remains in the two files; accessible names (Guidance, World book, Suggested turns, Rewrite suggestions, Score variable, Tool) are unchanged and no test pins them; client typecheck and scoped eslint pass.

## Evidence

Filled at landing: see the landing commit.
