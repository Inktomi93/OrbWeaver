---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Disclosure triggers and truncating spans at enlarged text

## What

Findings left by the Settings fold fix. The room override, injection manager and reasoning disclosures each hold a row inside their trigger and were not proven at enlarged text because no component test mounts them. The categorized library header is a button with no row and was not checked. `Text as="span"` with `truncate` does nothing outside a flex item, and many client files pass it that way. The shared touch target in `packages/ui/src/lib/selection-control.ts` can still reach past a small control at default text; nothing keeps it inside its row by construction.

## Why

The same sideways scroll that the Settings fold had can sit in each of these, and a truncate that never truncates hides overflow until text is enlarged.

## Done when

Each disclosure has a reflow case at enlarged text on its production surface, a truncating span either truncates or the prop is refused where it cannot, and the touch target stops at its row's edge by construction or the law records why it need not.

## Evidence

Filled at landing: what ran and where its output is.
