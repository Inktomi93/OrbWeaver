---
kind: work
status: open
updated: 2026-10-28
priority: P2
area: client
plan: surface-walk
---

# Reconcile visible control labels with accessible names

## What

Review ListRow, character shelf actions, described menu items and the chat title control against their visible labels and accessible names. Preserve native axe findings while checking the existing name-and-description decisions.

## Why

The production walkthrough reports label-content-name-mismatch findings on shared controls. Existing component comments document intent but do not establish conformance or usable voice control.

## Done when

Resolve each shared control through current accessibility guidance and actual production composition. Add coupled native accessible-name and description checks and rerun affected axe checkpoints. Preserve hit targets and useful descriptions without whole-rule exclusions or accepted-count baselines.

## Evidence

Resolution per control, against WCAG 2.5.3 (the name contains the visible label) and the production composition:

| Control | Finding | Result |
| - | - | - |
| Chat title rename button (`packages/client/src/features/chat/components/chat-header-title.tsx`) | A real defect. The date shown inside the button was in the description, not the name, and the participants, room name and date nodes ran together with no separator in the button text. | Fixed. The name carries the date after the stable identity, the description is gone, and whitespace separates the flex items. `tests/client/features/chat/components/chat-header-title-name.ct.tsx` was red (name lacked the date, then axe fired on the run-together words) and is green. `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx` followed the name. |
| `ListRow` (`packages/ui/src/primitives/list-row/list-row.tsx`) | Conformant: the name holds the visible title and qualifier. axe still counts the subtitle and meta as label text. The header records the owner ruling (#512) that refuses both ways to silence it, a longer name or a smaller hit target. | Kept. `tests/ui/primitives/list-row/accessible-name.ct.tsx` holds the name and description split and attaches the raw axe scan. |
| Character shelf face (`packages/client/src/features/character/components/character-shelf-face.tsx`) | Conformant: the name holds the name and the visible stamp. The pitch is the description; axe counts it as label text, the same class as `ListRow`. | Kept. `tests/client/features/character/components/shelf-face-name.ct.tsx` holds the split on both doors. |
| `DescribedMenuItem` (`packages/client/src/components/described-menu-item.tsx`) | Conformant: the name is the label, the detail line is the description and stays a hit target. axe counts the detail as label text. | Kept. `tests/client/components/described-menu-item.ct.tsx` already holds names, descriptions and the raw scan. |

Fork for the owner: axe's `label-content-name-mismatch` still reports a `ListRow`, shelf face or described menu item that shows a description line, because axe reads every text node under the control as the label. Silencing it means a name that reads the whole line, or a description moved out of the hit target. Both are refused by #512 and the item's own "keep hit targets and descriptions". The finding stays visible in the raw scan; no rule is excluded and no count is accepted.

Ran, in `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a49eae541c91fbf91` with `CT_PORT=3421`: the four CT files above plus `tests/ui/primitives/list-row` and `tests/client/features/app-shell/surfaces/app-shell-topbar.ct.tsx`, 43 passed on Chromium. `pnpm typecheck` on `packages/client/tsconfig.json`, `packages/ui/tsconfig.json` and `tsconfig.tests-dom.json` passed. `pnpm depcruise` and `pnpm lint:eslint` on the touched paths passed.
