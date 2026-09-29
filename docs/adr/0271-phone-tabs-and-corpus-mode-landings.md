---
kind: adr
status: active
updated: 2026-09-29
---

# Phone tabs and Corpus mode landings

## Context

The phone shell needs a fixed navigation order and an explicit landing pane for each Corpus mode. Corpus Variant A is selected and is not yet built.

## Decision

The permanent phone tabs are Home, Chats, Characters, and You, in that order. Corpus enters through You as a sheet entry in the shared chrome registry. This ruling replaces only D62-P3. D211 remains in force, including Home as the first phone tab and default section. All other D62 clauses remain in force.

Corpus uses Variant A with Explore, Insights, and Labels modes. On phones, Explore lands on LIST, Insights on CONTENT, and Labels on LIST. A LIST landing is a full-screen pane, not an open overlay sheet. Declare mode landings in the panel policy rather than fabricating a selection.

Navigation order belongs to `packages/client/src/state/section-ids.ts`. Corpus mobile placement belongs to `packages/client/src/features/discovery/lib/corpus-section.tsx`; You belongs to `packages/client/src/features/app-shell/lib/you-modal.tsx`. Pane resolution belongs to `packages/client/src/state/panel-resolve.ts`. The shell layout contract lives in `docs/law/UI-Architecture-and-Layout.md`.

## Consequences

The permanent phone bar stays consistent across Corpus modes. Corpus remains reachable through You without a dedicated permanent tab. The Corpus build must prove mode landings and Back restoration through rendered shell tests. This decision does not change desktop rail membership or unrelated mobile pane policies.

## Alternatives rejected

Give Corpus a permanent phone tab: rejected because the selected bar reserves its section tabs for Home, Chats, and Characters.

Apply one landing pane to every Corpus mode: rejected because Explore and Labels start with finding an item, while Insights starts with its dashboard.
