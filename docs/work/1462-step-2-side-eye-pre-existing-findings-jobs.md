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

Filled at landing: what ran and where its output is.
