---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: client
---

# Step 2 side-eye pre-existing findings: Jobs phone clip and dead CSS tokens

## What

Found in both builds during the step-2 rendered review (`reports/side-eye/2026-10-30-tone-vocabulary-step2.md`): on the phone Jobs screen the run-a-job action is clipped, and the character view carries dead CSS tokens (`rounded px-1.5 py-0.5 text-sm`). The bulk-bar count overlap with a narrowed list pane was seen on the base before 1450 landed; recheck it on current main.

## Why

Visible clipping on a phone, and classes that no rule matches.

## Done when

The Jobs action is fully visible on a 390px phone with a CT pinning it, the dead tokens are gone, and the bulk-bar overlap is fixed or recorded as fixed by 1450.

## Evidence

- Jobs run action: `packages/client/src/features/workloads/components/workloads-jobs-section.tsx` wraps the tabs row. `tests/client/features/workloads/components/platform-action-groups.suite.ct.tsx` asserts the action stays inside the host at four regimes, including the 390px phone with enlarged text. Red with horizontal overflow at the phone and narrow regimes; green after.
- Dead classes: they came from Streamdown's inline code element, not the character view. `packages/ui/src/markdown/inline-code-component.tsx` owns that element through the `inlineCode` slot. `tests/ui/markdown/inline-code.ct.tsx` checks every class on it has a rule: red on `px-1.5`, `py-0.5` and `text-sm`, green after.
- Bulk bar overlap: fixed by the bulk bar wrap that landed with item 1450; `tests/client/features/character/components/bulk-bar-layout.ct.tsx` passes at five regimes on current main.
- Typecheck of `packages/client` and `tsconfig.tests-dom.json`, `pnpm lint:css` and whole-tree depcruise pass.
