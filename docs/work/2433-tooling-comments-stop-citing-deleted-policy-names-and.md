---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: tooling
---

# Tooling comments stop citing deleted policy names and deleted importers as live

## What

Comments under `tooling/src/floor/`, `tooling/src/stack/ops/` and `tooling/src/snap/ops/stage-keeper.ts` cite `policy` names from the deleted gate system as current enforcement, including the file size cap, which has no successor and which D333 forbids replacing. `tooling/src/floor/prose/prose-rules.ts` and `prose-references.ts` justify their placement by an importer that is deleted. `tooling/src/stack/lib/spawn-lock.ts` rests its header on a script shape `ops/prod.ts` no longer has. `tooling/src/doc/ops/check.ts` and `tooling/src/doc/index.ts` keep agent-sync remnants. Source: `docs/work/codebase-review/units/tooling-floor.md` and `tooling-configs.md`.

## Why

A cold author trusts a named policy that does not fire, and splits files for a cap nothing enforces.

## Done when

Every `policy` cite under `tooling/src` resolves to a dependency-cruiser rule name or an ESLint rule id, or is rewritten to state the constraint without the name. The placement and script headers describe the tree. The dead agent-sync code and message are deleted.

## Evidence

Filled at landing: what ran and where its output is.
