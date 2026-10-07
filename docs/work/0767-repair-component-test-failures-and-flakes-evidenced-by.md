---
kind: bug
status: open
updated: 2026-10-07
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

CI retains `reports/` for every component-test shard, including passing shards with retries. Missing failed-attempt artifacts prevent a root-cause verdict for the cases below. Bounded clean repetitions do not establish that these cases are stable.

| Case | Test | Missing evidence |
| - | - | - |
| First Select entrance | `tests/client/lib/motion-stats.ct.tsx` | First-attempt motion observation and trace on main |
| Custom journal type and gloss | `tests/client/features/rpg/lib/rpg-context-section.ct.tsx` | First-attempt error and trace |
| Unreachable endpoint admission | `tests/client/features/credentials/components/connection-editor.ct.tsx` | First-attempt error and trace |
| Failed sign-in verdict | `tests/client/features/credentials/components/connection-editor.ct.tsx` | Request, response and rendered-state trace |
| Activity refresh | `tests/client/features/automation/components/suggestion-card-mount.ct.tsx` | First-attempt error and trace |
| Guest loading and empty state | `tests/client/features/plugin/components/plugin-dialog-body.ct.tsx` | Source-request and guest-ready trace |
| Replacing a started import batch | `tests/client/features/chat/components/chat-import-dialog.ct.tsx` | First-attempt error and trace |

Keep this item open until the remaining cases have demonstrated causes. Preserve each failed-attempt artifact when a retry passes.
