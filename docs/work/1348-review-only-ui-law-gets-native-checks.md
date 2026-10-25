---
kind: tooling
status: doing
updated: 2026-10-25
priority: P1
area: client
lane: cb-uilaw
plan: css-system
---

# Review-only UI law gets native checks

## What

UI and client law rules with no check today: manual memo outside compiler-skipped files; useInfiniteQuery outside createCollectionSurface; the React 19 skip list (useOptimistic, useActionState, useFormStatus, form action, use() on a promise, document.title writes); transition-all; lifecycle keyframes on Base UI parts; exit animation only on a child; suspending reads outside QueryBoundary; one primary per region, one focal element, no box in a box, no same-tier Surface nesting; the ui primitive file shape; law docs citing rule names that do not exist.

## Why

Owner: every law that can be enforced gets enforced. These pass review today only by attention.

## Done when

Each rule has a native lint, dependency-cruiser rule, repo test or rendered census CT with planted controls, every existing site is fixed, and each rule is on at zero; a rule that cannot be checked soundly is recorded with the reason; the two stale rule names in UI-Architecture-and-Layout.md are corrected and a repo test fails on any cited rule name that does not exist.

## State

- Branch `wt/agent-a0049768bc6ca34bb` at `1ecf4682f4`, refuted once; the lane is fixing:
  - `orb/no-lifecycle-keyframes` passes a cross-sheet keyframe in the `animation` shorthand and refuses a longhand `animation-iteration-count: infinite` loop (`stylelint-rules.ts:604-636`).
  - The surface census opens `imagine`, `imageDetail`, `imageEdit` and `pluginDialog` without content, so the `imagine-body.tsx:158` fix is unproven.
  - The selected toggles in `add-document-body.tsx` and `imagine-body.tsx` moved to `intent="solid"`, which still paints a full accent fill; use `ToggleGroup` or `intent="secondary"` and fix the law sentence at `UI-Architecture-and-Layout.md:330`.
  - Memo and `use()` rules miss a renamed namespace import; class-string gaps for `transition-all!`, `transition-[all,…]`, `data-[open]:animate-*`; the citation test checks registration, not enablement; three code comments name retired rule names.
  - `character-picker.tsx:143` uses `useSuspenseInfiniteQuery` around `createCollectionSurface`.
- Re-verify after the fix commit.

## Evidence

Filled at landing: what ran and where its output is.
