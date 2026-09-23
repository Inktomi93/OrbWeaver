---
kind: adr
status: active
updated: 2026-09-23
---

# O3 as amended (SUPERSEDES O3's "settings keeps appearance/system/tags/regex/chat-behavior")

## Context

Not recorded in the ledger row.

## Decision

Under SET-SEAMS a pane is not owned by whoever names it: a SECTION is owned by the feature that READS its knobs, and `features/settings` owns only the SHELL that skims them. `appearance` and `system` decompose to `chat`/`app-shell`/`workloads`/`user-admin` sections at their anchors; `chat-behavior` decomposes to `chat`; **`tags` and `regex` re-home to newly-minted `features/tag` and `features/regex`**, each owning its pane in `surface` mode; `theme` stays settings-owned (the theme model + serde ARE settings-domain). `system` MERGES into `admin` at the program's stage 4. Settings keeps: the shell (nav/search/scroll-spy/deep-link — gaining sub-level `openSettingsTo(category, subId)` in-program), the section renderer, the modals, the theme pane — nothing else. The full decision stack (Q1–Q6) is recorded RULED in the spec's §10.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
