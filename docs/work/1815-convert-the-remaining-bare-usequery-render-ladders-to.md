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

Rulings applied: a typed refusal (FORBIDDEN) renders through the boundary's error render; only the read-dependent part sits in the boundary; a knob change keeps the settled rows on screen through a deferred value. Converted in the preset, discovery, chat, databank, automation, stats, tag, plugin, imagery, refinery, rpg and credentials features. Every CT holds the read, fails it and retries. Where the old ladder already printed the same states, the CT passes on the old source too and only locks the shared states.

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

Converted in the final pass. Every CT holds the read, fails it and retries unless the row says otherwise.

| site | CT |
| - | - |
| `components/editable-tag-chip.tsx` popover, `components/tag-picker-dialog.tsx` (suspending child mounted only while open) | `tests/client/components/tag-reads-boundary.ct.tsx` |
| `features/plugin/components/plugin-dialog-body.tsx` (no subject is the gone state) | `tests/client/features/plugin/components/plugin-dialog-boundary.ct.tsx` |
| `features/imagery/components/provenance-strip.tsx` | `tests/client/features/imagery/components/provenance-boundary.ct.tsx` |
| `features/refinery/components/context-tabs.tsx` VersionsTab (the error wins over "No versions yet") | `tests/client/features/refinery/components/versions-boundary.ct.tsx` |
| `features/rpg/components/rpg-journal-tab.tsx` card archive | `tests/client/features/rpg/components/rpg-journal-boundary.ct.tsx` |
| `features/credentials/components/connection-account.tsx` AccountCreditsBlock (provider message kept) | `tests/client/features/credentials/components/account-credits-boundary.ct.tsx`; the corpus responders can only fail or delay, so Retry is not proved to recover |
| `features/chat/components/variant-wire-viewer.tsx`, `chat-list-character-filter.tsx` faces strip | `tests/client/features/chat/components/chat-reads-boundary.ct.tsx` |
| `features/chat/components/chat-recall-indicator.tsx` RecallHostDetail | no CT: the recall state is fed only by a bus event, and a story may not write `chatStream` |
| `features/automation/components/rule-character-field.tsx` | keeps the unavailable note and a Retry control, drops the shared block (ruling); `rule-reads-boundary.ct.tsx` |

Non-ladder, read in the final pass.

| site | why it is not a ladder |
| - | - |
| `features/credentials/components/connection-editor-essential.tsx` ModelField | derives a `source` value for the shared `ModelPicker`, which owns the states; a failed catalog degrades to the typed-id field and a boundary would blank the editable field. The save-correction effect also needs the settled answer |
| `features/chat/components/chat-documents-section.tsx` | the list read already suspends; `useSlotState` is a hook returning a named state for an advisory warning with its own "Check again" line |
| `features/app-shell/hooks/use-selected-theme.ts`, `features/character/hooks/use-library-scope.ts`, `features/plugin/hooks/use-extensions-empty.ts`, `features/roster-preset/hooks/use-saved-rosters.ts` | hooks that return a named state to a caller |
| `features/user-admin/components/about-section.tsx` | a manual `enabled: false` refetch behind a button; the verdict slot is the result, not a pending or error ladder |
| `features/preset/components/preset-library-welcome.tsx`, `features/character/surfaces/character-library-surface.tsx` (settings and favorites reads), `features/chat/hooks/use-guided-actions.ts`, `features/rpg/hooks/use-rpg-context-state.ts`, `features/regex/hooks/use-regex-collection.ts`, `features/roster-preset/hooks/use-roster-collection.ts`, `features/world-info/hooks/use-world-info-collection.ts`, `components/imported-chats-memory-offer.tsx`, `features/persona/anchors/first-run-persona-dialog.tsx`, `features/imagery/components/imagine-body.tsx`, `features/notifications/components/notification-inbox-row.tsx` | read in the final pass: the status words are mutation states, a `data-ready` flag, or a value handed to a caller |
| `features/chat/components/transcript-window.tsx`, `composer-next-turn-line.tsx` | open: a sibling lane edits composer and transcript files |

Open.

| site | reason |
| - | - |
| `features/plugin/surfaces/extensions-page-surface.tsx` with `hooks/use-plugin-pages.ts` | the pending and error arms render in the surface from the hook's flags; the hook is shared with the list header, so it needs a split |
| `features/preset/surfaces/preset-editor-surface.tsx` capability query, `readout/capability-panel.tsx` with `readout-parts.tsx` EffectiveProfile | the resolve error is a typed state (no chat model) that the profile discriminates; needs a call on whether the typed refusal renders through the boundary's error render, with the Select outside and a deferred target |
| `features/preset/components/logit-bias-editor.tsx` word lookup | an inline per-entry annotation beside an editable key, with `keepPreviousData`; a boundary cannot sit inline |
| `features/chat/components/chat-recall-indicator.tsx`, `corpus` rows listed above as converted without a CT | no held-read CT yet |
