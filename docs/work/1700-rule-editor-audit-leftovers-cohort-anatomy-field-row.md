---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: cross-surface-consistency
---

# Rule editor audit leftovers: cohort-anatomy field-row heights and the caveat-outweighed autosave alert (keeps 0550 from its done line)

## What

The rule editor's design audit still raised `cohort-anatomy` (field rows 92px against 54px) and `caveat-outweighed` (a 10.5px autosave alert under 15 to 16px siblings) after the nested-card fix in 0550.

## Why

0550's done line needs a clean audit on the rule editor.

## Done when

The audit on the rule editor raises neither finding, with the fix built from `@orb/ui` primitives and house components only.

## Evidence

Instrument: `pnpm snap --dirty` on isolated stage band 0, `--goto config:automation --click 'text=Custom rule' --click 'text=Add action' --click 'text=Add action' --design-audit --fail-on P3`, desktop 1280x800, pane 694px wide. Load was 34 to 46 on 24 cores, so every run is load-suspect; the numbers are layout.

Before (run slot `reports/runs/snap/agent-a9e84be4a77dcc8a0-3054375-2026-10-31T22-28-55-143Z`): P2 `cohort-anatomy` 1 of 4 field rows at 92px, 3 at 54px; P2 `caveat-outweighed` 10.5px alert under a 16px sibling; P3 `line-length` 140 characters.

Causes and fixes:

- Field-row heights: the 92px row was the described "Include events caused by automation" switch, built as `field.SwitchField`, whose vertical orientation stacks label, description and switch. It is now `SettingSwitchRow` (label left, switch right), the ruled switch row that `packages/client/src/components/tag-editor-body.tsx` already uses. Measured after: every editor field row is 54px except "When" (76px, a field with a description line); the switch row is horizontal at 54px (`packages/client/src/features/automation/components/rule-editor-settings.tsx`).
- The 16px sibling was the "When" trigger label: a hand-rolled `<label>` at 16px weight 400 beside field labels at 13px weight 500. It is now `Field label="When"` around the same `Select`, with the two gloss lines as its description.
- Caveat: the held-save line ("Not saved", "Review this form before saving.") rode `voice="gloss"` at 10.5px under 15px body text. The `blocked` arm of `AutosaveStatus` now uses `voice="reading"`, body scale like the `error` arm (`packages/client/src/forms/editor/autosave-status.tsx`). The arm is shared by every autosave editor; it renders only while a form is invalid and touched.
- Line length: the three explanatory glosses at the top of the editor capped at `--reading-measure-prose` (`packages/client/src/features/automation/components/rule-editor.tsx`).

After (run slot `reports/runs/snap/agent-a9e84be4a77dcc8a0-3274235-2026-10-31T22-49-20-279Z`): no `cohort-anatomy` on the editor, no `caveat-outweighed`, no `line-length`. Two findings remain and are not the editor's: P2 `cohort-anatomy` on `[data-slot=config-list]` (the Settings list: the open group is 114px beside two collapsed groups at 32px, the accordion's own state), and `population-verdict=NO-VERDICT` (`quiet-state` unmatched off switch and `selection-idiom` unmatched unselected grip; a rule editor has no selected member of the grip cohort, so the withholding is the correct verdict there). 0550's "audit clean on the rule editor" holds for the editor; the Settings-list cohort is a separate surface and needs its own item.

Tests, `tests/client/features/automation/components/platform-rule-action-groups.suite.ct.tsx`, through the real library-rules section door (`CtConfigGroupBody`):

- "the trigger label and the automation switch follow the form's own field grammar": red on the old source (`Expected: "13px/500"`, `Received: "16px/400"`), green after.
- "a held save is stated at the editor's body size, not under it": red (`Expected: >= 15`, `Received: 10.5`), green after.
- "the editor's explanatory lines keep the reading measure inside a wide pane": red (`Received: 694`), green after.
- The suite: 8 passed in Chromium.
