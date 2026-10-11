---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Repair component test failures and flakes evidenced by CI

## What

Read available component test results from previous CI runs. Separate missing browser and canceled execution from test failures, then repair reproduced mainline flakes.

## Why

Retries can hide unstable assertions and obscure real regressions.

## Done when

Available runs have classified results and a bounded failure inventory. Repairs retain meaningful assertions and pass affected component tests. Missing artifacts and dependency-only failures are explicit.

## Evidence

The chat geometry test waits for fonts before capturing the read-mode size. The inert touch control compares simultaneous canvases. The model picker waits for its first filtered result before keyboard selection.

Selection callbacks wait for Node delivery before exact-count assertions. The plugin setup waits for its source request before releasing it.

CI retains `reports/` for every component-test shard. The verdicts below come from retained shard reports, their `error-context.md` snapshots and CT job logs, which name a flaky test but keep no error.

| Case | Test | Verdict |
| - | - | - |
| First Select entrance | `tests/client/lib/motion-stats.ct.tsx` | Cause shown. Failed attempts recorded `select-first-loaf` budgeted blocking between 54 and 370 ms under four-times CPU throttling, against the 50 ms budget. The D308 change removed that throttle and records the budget on hosted hardware. Later runs measure about 11 ms with no failed attempt. |
| Unreachable endpoint admission | `tests/client/features/credentials/components/connection-editor.ct.tsx` | Cause shown. The failure snapshot shows Diagnostics expanded, "Nothing has been checked yet" and an enabled "Check again": the click on the opening panel never reached the button. `expectDisclosureReady` now gates every Diagnostics interaction. No later failed attempt. |
| Failed sign-in verdict | `tests/client/features/credentials/components/connection-editor.ct.tsx` | Cause shown, same class. The snapshot shows "Check sign-in" focused and no verdict, and the sibling case recorded no `connection.verifyAuth` request. Repaired by the same Diagnostics readiness check. |
| Activity refresh | `tests/client/features/automation/components/suggestion-card-mount.ct.tsx` | Cause shown, a product defect. The first attempt held the empty Activity list: a rule terminal that landed while the initial read was in flight was dropped. The invalidation layer now keeps that event across the initial read, and the held-read case covers it. No later failed attempt. |
| Guest loading and empty state | `tests/client/features/plugin/components/plugin-dialog-body.ct.tsx` | Cause shown by control. The old test released the source after the loading text appeared, before the node route handler had run. With the handler delayed, the old gating fails with "the plugin source request did not start" and the current gating passes. Only the pre-repair run flaked. |
| Replacing a started import batch | `tests/client/features/chat/components/chat-import-dialog.ct.tsx` | Cause shown by control, a product defect. The dialog judged an import by the Memory switch as rendered at drop time, so a drop made before the settings read answered closed the dialog without the offer. The dialog now reads the switch when the import lands. A held-settings case was red before the repair and is green after it. The CI first-attempt error predates artifact retention. |
| Custom journal type and gloss | `tests/client/features/rpg/lib/rpg-context-section.ct.tsx` | No cause found. One CI flake predates artifact retention, so no error exists. The test and its components are unchanged since. Retained runs and repeated local runs under load show no failure. |

Keep this item open until the custom journal type case has a demonstrated cause or a retained failed attempt. Preserve each failed-attempt artifact when a retry passes.
