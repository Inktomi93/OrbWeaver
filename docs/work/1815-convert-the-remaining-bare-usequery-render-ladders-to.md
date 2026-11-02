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

Rulings applied: a typed refusal (FORBIDDEN) renders through the boundary's error render; only the read-dependent part sits in the boundary; a knob change keeps the settled rows on screen through a deferred value. A second lane owns databank, automation, tag, credentials, imagery, plugin, refinery, rpg and stats.

Converted in the preset, discovery and chat features. Every CT holds the read, fails it and retries. Where the old ladder already printed the same states, the CT passes on the old source too and only locks the shared states.

| site | CT |
| - | - |
| `features/discovery/components/corpus-archetypes-tab.tsx` (catalog gate, art section, writing section) | `tests/client/features/discovery/components/corpus-context-tabs-boundary.ct.tsx` |
| `features/discovery/components/corpus-similarity-tab.tsx` nearest pairs | same file; the knob test fails on the old source |
| `features/chat/components/member-card-viewer.tsx`, `invite-dialog.tsx` OutstandingInvites | `tests/client/features/chat/components/members-reads-boundary.ct.tsx` |
| `features/preset/components/readout/preset-readout.tsx`, `prompt-readout.tsx`, `transforms-readout.tsx`, `usage-readout.tsx`, `actions-readout.tsx` | `tests/client/features/preset/components/preset-readout-boundary.ct.tsx` (story `_preset-readout-stories.tsx`) |
| `features/discovery/components/corpus-home-insights.tsx` (never played, model usage), `corpus-home-charts.tsx` (keywords, co-occurrence, story-theme drift), `corpus-home-surface.tsx` | `tests/client/features/discovery/surfaces/corpus-surfaces-boundary.ct.tsx` (never played, model usage, keywords, drift) |
| `features/discovery/components/corpus-compare-tab.tsx` result, `features/discovery/surfaces/corpus-dossier-surface.tsx` similar art | same file (story `_corpus-destination-stories.tsx`); the comparison test fails on the old source |

Converted without a held-read CT. Each needs a mount that opens the destination; the conversion is the same shape as the covered ones.

| site | what is missing |
| - | - |
| `corpus-visuals-tab.tsx` facet drill, `corpus-home-charts.tsx` co-occurrence | no seeded facet value or keyword with a drill to open |
| `corpus-search-results.tsx` (unified and text results) | the retry would run a real embedding search; needs a held search that recovers to a fixture |
| `corpus-dossier-surface.tsx` Ask answer | the retry would call a model |
| `corpus-artifact-surface.tsx` grouping check, `corpus-context-header.tsx` census | no CT opens a cluster artifact or reads the band census failure |

Non-ladder reads in the three features. Each reads a value or hands state to a caller and renders no pending or error branch of its own; `ast-grep` over `packages/client/src/features/chat`, `preset` and `discovery` matched `useQuery($$$)` in 191 `.ts` and 263 `.tsx` files scanned, and a grep for `isPending`, `isError`, `isLoading` and `.error` over each remaining `.tsx` site found no render branch in the sites below.

| site | why it is not a ladder |
| - | - |
| `chat/hooks/*` (behavior prefs, census, style, credit connections, guided actions, message appearance, room gallery door, room roster, send availability, shared room), `chat/lib/home-starter-region.ts`, `discovery/hooks/use-readiness-passes.ts`, `use-understanding-pass.ts`, `preset/hooks/use-preset-census.ts`, `use-readout-binding.ts` | hooks that return a value or a named state to a caller |
| `chat/components/chat-character-bar.tsx`, `chat-header.tsx`, `chats-topbar-header.tsx`, `regex-section.tsx`, `room-overrides-tab.tsx`, `composer-chat-options.tsx`, `member-persona-lore-control.tsx`, `settings-context-tab.tsx`, `chat/hooks/use-slash-commands.tsx`, `attachment-url-provider.tsx`, `chat/lib/home-recents-tile.tsx`, `home-also-open-tile.tsx`, `chat/surfaces/chat-room-surface.tsx`, `message-list-surface.tsx`, `preset/components/preset-library-welcome.tsx`, `discovery/surfaces/corpus-list-surface.tsx` suggest | no pending or error branch in the source; the read feeds a value with a default. Classified by grep, not by reading each file |
| `chat/components/chat-import-dialog.tsx`, `reattribute-from-here.tsx`, `choice-send-provider.tsx`, `composer-guided-cluster.tsx`, `chat/surfaces/new-chat-picker-surface.tsx` | the `isPending` matches are mutation states |
| `discovery/surfaces/corpus-home-surface.tsx` keywords and workloads reads | feed the derived analysis state the readiness rail renders; no ladder of their own |

Still a ladder, or not yet judged. None of these cites section 10 or a ruling.

| site | note |
| - | - |
| `chat/components/transcript-window.tsx` AnchoredThread | skipped: a sibling lane edits this file |
| `chat/components/variant-wire-viewer.tsx` | the same dialog shape as the member card; converts the same way. Needs a CT that opens a message variant's wire viewer |
| `chat/components/chat-recall-indicator.tsx` (line 199), `chat-list-character-filter.tsx`, `composer-next-turn-line.tsx` | pending and error arms; not converted |
| `preset/surfaces/preset-editor-surface.tsx` capability query, `preset/components/readout/capability-panel.tsx` and `readout-parts.tsx` EffectiveProfile, `preset/components/logit-bias-editor.tsx` word lookup | the capability panel hands `.data` and `.error` to a child that owns the ladder, and its Select must survive a target change; needs a design call on where the boundary goes |
| `chat/components/chat-documents-section.tsx` | hook state; the five matches name a slot state, not a render ladder; needs a read to confirm |
| the 1762 rows outside these three features | owned by the second lane |
