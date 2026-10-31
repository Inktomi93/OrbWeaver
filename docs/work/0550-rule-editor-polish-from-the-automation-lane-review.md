---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: automation
plan: cross-surface-consistency
---

# Rule editor polish from the automation lane review

## What

From the cb-automation side-eye: action cards are still cards inside the editor card (design audit flags it 3x); Reply N headers use the same type as the action title; grip and trash icons sit 8-16px inside the field edges; replies are separated mostly by a 1.24:1 hairline where more space would read better. Also seen: on mobile the side-pane MEMORY — IDLE chip runs into Built-in preset.

## Why

The rule editor reads busier than it needs to.

## Done when

Each point fixed or ruled out with a screenshot; design audit clean on the rule editor.

## Evidence

Instrument: `pnpm snap --dirty` on isolated stage band 1, a scenario that opens a blank chat, This chat, Rules, Custom rule, then adds a set-variable action, an offer-quick-replies action and two replies, with a computed-geometry `--eval` and `--design-audit --fail-on P3`. Desktop 1280x800, pane 341px wide. Load was 36 to 50 on 24 cores, so every run is marked load-suspect; the numbers are layout, not timing. Run slots under `reports/runs/snap/`: before `agent-a81f5ee07cc8e702b-1876371-2026-10-31T19-59-24-405Z`, design audit and after `agent-a81f5ee07cc8e702b-1894531-2026-10-31T20-01-35-586Z`, mobile `agent-a81f5ee07cc8e702b-1907153-2026-10-31T20-03-19-523Z` and `agent-a81f5ee07cc8e702b-1911659-2026-10-31T20-03-56-784Z`.

- Nested cards: confirmed. Before, 2 `card-root` elements inside the editor card and `nested-card` P3 on both action items. Fixed in `packages/client/src/features/automation/components/rule-editor-actions.tsx`: each action is a `Stack` with a `Separator` above every action after the first, the same grammar `rule-list-action-fields.tsx` already uses between replies. After, 0 card roots and no `nested-card` finding.
- Reply N header type: confirmed. Both the action title and `Reply 1` measured 15px, weight 400, line 23px. `rule-list-action-fields.tsx` now sets `voice="label"` on the Reply header: 13px, weight 500, line 16px. This is a design call made with an existing voice; the owner can flip it.
- Icon insets: partly ruled out. The grip and trash boxes sit flush with the field edges (grip x equals field x, trash right equals field right, 0px). The 13px inset in the old render was the inner card padding, now gone, so the controls are 341px wide edge to edge. The remaining glyph inset is the control's own hit box: grip 32px, trash 36px. Shrinking them would cut the touch target, so nothing changed. The two boxes differ by 4px (32 and 36); not changed, flagged.
- Reply separation: measured, not changed. The reply rule is 1px at `oklch(0.99 0.005 60 / 0.08)` with 8px above and 7px below. Whether more space or a stronger rule reads better is a design call; the nested-card fix makes action boundaries use the same hairline, so the call now covers both levels.
- Mobile chip overlap: not reproduced. At 390x844 the topbar Memory, Members and Show details chips sit at x 334..378, 282..326 and 226..274 with 8px gaps and no overlap, and the details panel has no overlapping controls apart from tabs scrolling under the overflow and close buttons. The "Built-in preset" chip is not rendered in a blank chat with no connection, so the reviewed state was not reproduced. This stays a missing measurement.
- Design audit: `nested-card` is clear. The audit run on this surface still returns NO VERDICT (`rule population completeness` withheld: unmatched reorder-grip selection cohort, quiet-state switch, 11 unresolved hover backdrops) and two P2 findings inside the editor outside this item's five points: `cohort-anatomy` (field rows 92px against 54px) and `caveat-outweighed` (10.5px autosave alert under a 15px sibling). "Audit clean on the rule editor" is therefore not claimed.
- Tests: `tests/client/features/automation/components/platform-rule-action-groups.suite.ct.tsx` asserts neither the card nor the header type.
