---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: client
plan: cross-surface-consistency
---

# Suspending reads use a boundary, not a loading ladder: judge the flagged useQuery sites and the list sections with no boundary

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Source: the ui-facts read-shape cohort (`pnpm ui-facts`), every `useQuery` classed `ladder` or `ladder+enabled`.

The test (`docs/law/client-architecture-lockdown.md` §1 table, "a suspending read"): a rendered read uses `useGatedQuery` or `useSuspenseQuery` inside `QueryBoundary`. Having pending and error arms is not a reason to keep a site. A site stays only if it is a hook that returns state to a caller and renders no ladder, or if it cites the sanctioned non-suspense probe in `docs/law/client-architecture-state-and-gates.md` §10 or a ruling. Every other site converts.

### Converted

| site | false state | conversion |
| - | - | - |
| features/character/components/character-relations-tab.tsx, LinkedBooksSection and ConnectedPersonasSection | "No world books linked." and "No personas connected." while the reads were pending | `useSuspenseQueries` under a per-section `QueryBoundary`; held-read CT in `tests/client/features/character/components/platform-context-recovery.suite.ct.tsx` |
| features/character/components/character-overview-card.tsx | "Never" for the last conversation while the chats read was pending or failed | both reads suspend under the card's boundary; held-read CT in the same suite |
| features/chat/components/add-chat-book-dialog.tsx, add-chat-document-dialog.tsx | a failed read rendered "no world books" and "your bank is empty" | `useSuspenseQuery` under the picker's own `QueryBoundary` with a Retry; CT in `tests/client/features/chat/components/chat-attach-pickers.ct.tsx` |
| features/chat/components/add-chat-script-dialog.tsx | a failed read rendered "no regex scripts" | same conversion; no CT, because the room's script tier shares the picker's cache key, so a failed read hides the Attach button before the picker opens |

### Kept: hooks that return state and render no ladder

| site | reason |
| - | - |
| data/use-session-recovery.ts, features/app-shell/hooks/use-selected-theme.ts, features/character/hooks/use-library-scope.ts, features/chat/hooks/use-credit-connections.ts, features/chat/lib/home-starter-region.ts, features/plugin/hooks/use-extensions-empty.ts, features/plugin/hooks/use-plugin-pages.ts, features/chat/components/chat-documents-section.tsx useSlotState, features/preset/components/logit-bias-editor.tsx useWordLookup | the hook returns a value or a named state to a caller; the caller renders the claim. use-session-recovery cites the non-suspense probe class of §10 |
| features/roster-preset/hooks/use-saved-rosters.ts (two hooks) | hook-only gated reads; the file cites D264 for the `skipToken` gate |

### Still to convert

These render a pending or error ladder with `useQuery` and cite neither §10 nor a ruling. Each reads as a convertible site. Where a comment gives a reason, the reason is a code comment and not a ruling, so the owner rules it (keep with a citation) or the site converts.

| site | reason in the code | what the owner rules or the batch does |
| - | - | - |
| features/databank/surfaces/databank-detail-surface.tsx SourceText | non-suspending so revealing the text does not re-suspend the header | convert with `useGatedQuery` inside a local boundary, or cite a ruling |
| features/databank/components/databank-context-body.tsx ContextBody | gone state needs the error code | cite a ruling for the gone state, or convert and read the code in `renderError` |
| features/databank/components/databank-active-in.tsx ActiveInSection | a failed junction read must say so | convert |
| features/preset/components/preset-library-welcome.tsx, features/discovery/surfaces/corpus-home-surface.tsx CorpusHomeBody | comment says non-suspending so the pane does not suspend on a wording fact | convert or cite |
| features/discovery/components/corpus-context-header.tsx | band chrome never suspends (cites D271) | cite D271 or convert |
| features/stats/surfaces/analytics-list-surface.tsx LeaderboardRows | `keepPreviousData` so a search keystroke does not blank the rows | cite a ruling or convert with a transition |
| features/preset/components/readout/prompt-readout.tsx, transforms-readout.tsx, usage-readout.tsx, actions-readout.tsx | three-arm ladders with distinct status copy | convert |
| features/chat/components/member-card-viewer.tsx, composer-next-turn-line.tsx, chat-list-character-filter.tsx, chat-recall-indicator.tsx, invite-dialog.tsx OutstandingInvites, transcript-window\.tsx AnchoredThread, variant-wire-viewer.tsx | pending and error arms | convert |
| features/automation/components/rule-character-field.tsx, rule-tool-fields.tsx, rule-preset-knob-field.tsx | pending and error arms with fallback copy | convert |
| components/editable-tag-chip.tsx, components/tag-picker-dialog.tsx | gated read with pending and error arms | convert with `useGatedQuery` |
| features/credentials/components/connection-account.tsx, features/imagery/components/provenance-strip.tsx, features/plugin/components/plugin-dialog-body.tsx, features/refinery/components/context-tabs.tsx VersionsTab, features/rpg/components/rpg-journal-tab.tsx | pending and error arms | convert |
| features/discovery/components: corpus-archetypes-tab, corpus-compare-tab, corpus-home-charts (two), corpus-search-results (two), corpus-similarity-tab, corpus-visuals-tab, features/discovery/surfaces/corpus-dossier-surface.tsx SimilarArtBody | pending and error arms | convert |

### List sections with no list boundary

| section | verdict | reason |
| - | - | - |
| character, `character-library-surface.tsx` | keep | `createCollectionSurface` owns pending and error, and `useInfiniteQuery` belongs to it by the lockdown law |
| config, `config-list-surface.tsx` | keep | the list reads no query, so there is no suspending read to bound |
| stats, `analytics-list-surface.tsx` | listed above | `LeaderboardRows` needs a ruling or conversion |
