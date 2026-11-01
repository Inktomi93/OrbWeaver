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

Source: the ui-facts read-shape cohort (`pnpm ui-facts`), every `useQuery` classed `ladder` or `ladder+enabled`. Each site is judged by whether it renders a false state: an empty or "never" claim while the read is pending or failed. A site that renders pending, error and data arms separately, or that only returns a value from a hook, shows nothing false and stays.

How the sites were judged: "read" means the whole function was read. "arm scan" means a script found a pending arm and an error arm in the function body and the site was not read further; treat those as unverified keeps.

### Fixed

| site | false state | fix |
| - | - | - |
| features/character/components/character-relations-tab.tsx, LinkedBooksSection and ConnectedPersonasSection | "No world books linked." and "No personas connected." while the reads were pending | `useSuspenseQueries` under a per-section `QueryBoundary`; held-read CT in `tests/client/features/character/components/platform-context-recovery.suite.ct.tsx` |
| features/character/components/character-overview-card.tsx | "Never" for the last conversation while the chats read was pending or failed | both reads suspend under the card's boundary; held-read CT in the same suite |
| features/chat/components/add-chat-book-dialog.tsx, add-chat-document-dialog.tsx, add-chat-script-dialog.tsx | a failed read rendered "no world books", "bank is empty" or "no scripts" | each picker reads under its own `QueryBoundary` with a Retry; no CT door mounts these dialogs, so these three are covered by typecheck and lint only |

### Kept

| site | verdict | reason |
| - | - | - |
| features/automation/components/rule-character-field.tsx | read | the name falls back to the saved id and the error arm states the identity is retained |
| features/automation/components/rule-tool-fields.tsx | read | loading, error with Retry and the empty-catalog copy are separate arms, and the empty arm is guarded by not pending and not error |
| features/databank/surfaces/databank-detail-surface.tsx, SourceText | read | loading, error and data arms; the read is non-suspending so revealing it does not re-suspend the header |
| features/databank/surfaces/databank-detail-surface.tsx, DatabankWelcome | arm scan | pending arm only; renders a welcome, no data claim |
| features/databank/components/databank-context-body.tsx, ContextBody | read | three arms by design: gone state needs the error code, so it cannot suspend |
| features/databank/components/databank-active-in.tsx | arm scan | pending, error and data arms; the junction read must state failure rather than claim nothing feeds the room |
| features/preset/components/preset-library-welcome.tsx | read | the filtered-to-nothing claim is gated on a search needle, and the pane reads `isLoading` for its ready flag |
| features/chat/components/chat-documents-section.tsx, useSlotState | read | hook returns `resolving`, `unknown` or a slot; no empty claim |
| features/discovery/components/corpus-context-header.tsx | read | a pending census shows no number; a failed one says so with a Retry |
| features/preset/components/readout/prompt-readout.tsx | read | pending and failed pricing have distinct status lines |
| features/preset/components/readout/transforms-readout.tsx | read | "…" for pending and "couldn't read" for failed; "off" only after a count |
| features/preset/components/readout/usage-readout.tsx | read | error, "Checking…" and data arms |
| features/chat/components/member-card-viewer.tsx | read | gated read in a dialog; the body takes `isError` and `error` and renders its own arms |
| features/chat/components/composer-next-turn-line.tsx | read | the line is derived from `chatFailed` and `resolveFailed`; absent data renders nothing |
| features/chat/components/chat-list-character-filter.tsx | read | a pending or failed read leaves only the scoped face; no claim is printed |
| features/stats/surfaces/analytics-list-surface.tsx, LeaderboardRows | read | `keepPreviousData` on purpose: a search keystroke re-keys the page and must not blank the rows |
| data/use-session-recovery.ts, features/app-shell/hooks/use-selected-theme.ts, features/character/hooks/use-library-scope.ts, features/chat/hooks/use-credit-connections.ts, features/chat/lib/home-starter-region.ts, features/plugin/hooks/use-extensions-empty.ts, features/plugin/hooks/use-plugin-pages.ts, features/roster-preset/hooks/use-saved-rosters.ts (two hooks), features/preset/components/logit-bias-editor.tsx useWordLookup | arm scan | hooks that return a value or state to a caller; the caller renders the claim |
| components/editable-tag-chip.tsx, components/tag-picker-dialog.tsx | arm scan | gated reads with pending and error arms |
| features/automation/components/rule-preset-knob-field.tsx, ChatWorldInfoBookKnobField | arm scan | pending and error arms present |
| features/chat/components/chat-recall-indicator.tsx, invite-dialog.tsx OutstandingInvites, transcript-window\.tsx AnchoredThread, variant-wire-viewer.tsx | arm scan | pending and error arms present |
| features/credentials/components/connection-account.tsx, features/imagery/components/provenance-strip.tsx, features/plugin/components/plugin-dialog-body.tsx | arm scan | pending and error arms present |
| features/discovery: corpus-archetypes-tab, corpus-compare-tab, corpus-home-charts (two), corpus-search-results (two), corpus-similarity-tab, corpus-visuals-tab, corpus-dossier-surface, corpus-home-surface | arm scan | pending and error arms present |
| features/preset/components/readout/actions-readout.tsx, features/refinery/components/context-tabs.tsx VersionsTab, features/rpg/components/rpg-journal-tab.tsx | arm scan | pending and error arms present |

### List sections with no list boundary

| section | verdict | reason |
| - | - | - |
| character, `character-library-surface.tsx` | keep | `createCollectionSurface` owns pending and error; the surface reads `collection.isPending` |
| config, `config-list-surface.tsx` | keep | the list reads no query, so there is no suspending read to bound |
| stats, `analytics-list-surface.tsx` | keep | `useQuery` with `keepPreviousData` and explicit pending and error arms |
