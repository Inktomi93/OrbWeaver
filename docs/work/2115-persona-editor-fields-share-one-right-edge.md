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

The macro field keeps the reading measure the macro editor was pinned to: 75 characters of its own monospace face, inside the 65 to 75 band in `docs/law/UI-Architecture-and-Layout.md`. That measure is now a length, `--reading-measure-code` (75 characters of Geist Mono at `text.code-field`, so 585px at a fine pointer and 720px at a coarse one), because a `ch` resolves in the face of the element that carries it and the plain fields use another face. `CAP.code` reads the token. `MacroTextarea` takes it at its root and `PersonaEditor` takes it as its column cap, so the plain fields end on the macro field's edge. The wider 720px editor column is not used here, since at the fine pointer it runs the field to about 87 characters per line.

CT `tests/client/features/persona/components/platform-persona-editor-footprint.suite.ct.tsx` compares the Name, Title and Description right edges at desktop, enlarged and phone widths, resolves the token for the field width, and counts the characters in the Description line. The line stays at or under 75 everywhere and reaches 65 at the wide layouts. Against the 720px cap the wide default fails on the field width (720 where 585 is expected).

Open: the Character editor still caps at `pane`, so its macro fields and plain fields differ by the gap between `pane` and `column`. That surface is outside this item.
