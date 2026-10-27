---
kind: bug
status: doing
updated: 2026-10-27
priority: P2
area: client
lane: composer_two_rows
---

# Point Keepsake Album guidance to the actual Snapshot command

## What

Correct the Album page's command directions. Snapshot is a composer-media placement under Message tools, not an unplaced command in Plugin commands.

## Why

The displayed menu path cannot reach Snapshot. The working slash command and command-palette alternative do not make the incorrect menu instructions true.

## Done when

Use the actual current host route and bare placement label. Preserve plugin attribution, the in-chat prerequisite, the working slash spelling and command execution. Verify the Album guidance against the actual composer menu without running image generation.

## Case map

Rendered owner: `tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx`.

| Behavior | Layer | Existing coverage | Decision |
| - | - | - | - |
| Album directions and current registered placement | CT | No maintained guidance case | Add the installed Album page and compare its guidance with the real command registration. |
| Attributed Snapshot media menu reachability | CT | Composer command test covers other commands | Add a bounded real composer-menu case without invoking Snapshot. |
| Album-to-chat navigation journey | Live application review | Main owns Snap | Keep this journey out of component tests. |

Execution remains pending. These are audit regressions, not wholesale legacy restoration.

## Evidence

Filled at landing: what ran and where its output is.
