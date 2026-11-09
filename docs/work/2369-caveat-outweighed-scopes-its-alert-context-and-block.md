---
kind: tooling
status: doing
updated: 2026-11-09
priority: P3
area: tooling
lane: wt/agent-a7e614c3dc6eac284
plan: cross-surface-consistency
---

# caveat-outweighed scopes its alert context and block pairing

## What

caveat-outweighed (tooling/src/ui-audit/lib/checks-caveat.ts, alertContext in ops/walker/census-text.ts) treats every paragraph under any alert-role ancestor as a caveat carrier and pairs subjects whose four-level ancestor paths meet in a shared list, so a notice's own explainer and sibling plugin cards produce findings.

## Why

A rule that fires on a notice's own body copy buries the real outweighed caveats.

## Done when

Alert context reads only the caveat element itself or its nearest block, pairing stops at a card or list item boundary, fixtures keep the known true positive in plugin-grant-list and clear the Installed plugins landing.

## Evidence

Filled at landing: what ran and where its output is.
