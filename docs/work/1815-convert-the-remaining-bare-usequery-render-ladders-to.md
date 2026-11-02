---
kind: work
status: open
updated: 2026-11-02
priority: P2
area: client
plan: cross-surface-consistency
---

# Convert the remaining bare useQuery render ladders to QueryBoundary, by feature, each with a held-read CT

## What

Every client feature component that renders its own pending, error and empty ladder from a bare `useQuery` reads through `QueryBoundary` instead. Each converted surface gets a CT that holds the read, fails it, and checks the shared skeleton and the shared error block with Retry.

## Why

One visual system: every surface shows the same loading, error and retry states. Rule 1810 refuses a new bare ladder only after this list is empty.

## Done when

- Each site in the table below is converted, or keeps its ladder and cites `docs/law/client-architecture-state-and-gates.md` §10 or a ruling.
- Each converted surface has a CT that holds the read pending, then fails it, and asserts the shared loading and error states.

## Evidence

Converted in the first batch:

| site | CT |
| - | - |
| `packages/client/src/features/discovery/components/corpus-archetypes-tab.tsx` (catalog gate, art section, writing section) | `tests/client/features/discovery/components/corpus-context-tabs-boundary.ct.tsx` |
| `packages/client/src/features/chat/components/member-card-viewer.tsx`, `invite-dialog.tsx` OutstandingInvites | `tests/client/features/chat/components/members-reads-boundary.ct.tsx` |

Still open. None of these cites §10 or a ruling yet. The owner ruled the readouts and NearestPairs convert (typed FORBIDDEN through the boundary error render, read-dependent part only; knob changes in a transition).

| site | why it is not converted yet |
| - | - |
| `packages/client/src/features/preset/components/readout/prompt-readout.tsx`, `transforms-readout.tsx` | the panel keeps rendering estimates and a named refusal ("you are not the host") while the read is pending or failed. A boundary would replace the whole panel with a generic error |
| `packages/client/src/features/discovery/components/corpus-similarity-tab.tsx` NearestPairs | a plain read on purpose, so the two knobs re-rank in place without re-suspending the tab. Needs a transition design or a ruling |
| `packages/client/src/features/chat/components/transcript-window.tsx` AnchoredThread | a sibling lane edits this file |
| `packages/client/src/features/preset/components/readout/usage-readout.tsx`, `actions-readout.tsx`, `preset-readout.tsx` | convert directly. The preset context pane has no CT mount |
| `packages/client/src/features/discovery/components/corpus-compare-tab.tsx` CompareResult, `corpus-visuals-tab.tsx`, `corpus-home-charts.tsx`, `corpus-search-results.tsx`, `corpus-home-surface.tsx`, `corpus-context-header.tsx`, `corpus-dossier-surface.tsx` | not started |
| the remaining rows of the 1762 "Still to convert" table (databank, automation, tag, credentials, imagery, plugin, refinery, rpg, stats, chat) | not started |
