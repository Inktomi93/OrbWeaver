---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# Rendered review follow-ups on the import section, back links and modal landings

## What

The rendered review of the client focus and refusal branch confirmed its claims and left findings on neighbouring surfaces. After a Backup import is confirmed, focus drops to the page and the result or the wrong-folder line renders below the fold on a desktop window (packages/client/src/features/workloads, the import library section). The Back to Looks and Back to Regex scripts links drop focus to the page. The theme leftovers note sends the person to Settings, Appearance, but some of its settings sit behind Customize this look. Smaller: reauth should land on its password field, imagine on its prompt, image edit on its instruction field and plugin arguments on the first field; a list emptied by a delete lands on a frame with no focus ring; the New chat picker shows one row on a landscape phone at enlarged text; the character import zone is marked invalid without its reason linked; refusal text sits under the file input; dialog headers take most of the height at the largest text size; the wrong-folder sentence names only SillyTavern; two focus targets show the browser's default ring. Not reached by the review: image detail, image edit, a plugin dialog and the real reauth path. Source: the client leg-seven rendered review under reports/review.

## Why

Each is a keyboard or screen-reader user losing their place or a person missing a result, on surfaces next to the ones just fixed.

## Done when

The import result takes focus and is in view after a confirmed import. Each back link returns focus to the control that opened the view. The leftovers note names where each group of settings lives. Each modal lands where the review ruled, asserted in the modal landing tests. The smaller findings are each fixed or closed with a reason, and the four unreached views get a rendered check.

## Evidence

Filled at landing: what ran and where its output is.
