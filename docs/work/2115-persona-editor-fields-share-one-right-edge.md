---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Persona editor fields share one right edge

## What

In the persona editor, the Description textarea resolves --reading-measure in its monospace font and ends near 600px, while the other fields end near 750px. Give the editor family's fields one cap so their right edges align.

## Why

Fields of one form that end at different edges read as unrelated controls. The cap is a family decision, not a local width.

## Done when

Name, Description and the other persona editor fields end on one right edge at desktop and phone widths, the cap comes from one home shared by the member editors, and a CT measures the edges.

## Evidence

The member editors share one cap, `CAP.column` (`--width-content-col`). `MacroTextarea` takes it as a length at its root, and `PersonaEditor` uses `cap="column"`, so the macro fields and the plain fields end on one edge.

CT `tests/client/features/persona/components/platform-persona-editor-footprint.suite.ct.tsx` resolves the token and compares the Name, Title and Description right edges at desktop, enlarged and phone widths. It fails on the prior source and passes now.

Open: the Character editor still caps at `pane`, so its macro fields and plain fields differ by the gap between `pane` and `column`. That surface is outside this item.
