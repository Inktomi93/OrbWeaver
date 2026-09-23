---
kind: adr
status: active
updated: 2026-09-23
---

# You contains identity, which contains account

## Context

Not recorded in the ledger row.

## Decision

**You ⊃ Identity ⊃ Account.** YOU is not a page — it is the mobile projection of shell chrome (the sheet where `mobile:"sheet"` entries land; a real modal — portal/focus-trap/scrim — never a CSS fake). IDENTITY is ONE chrome widget (`features/persona/lib/persona-chrome.tsx`) with two lenses over one data fetch: `body("bar")` = the avatar chip + popover, `body("sheet")` = the same sections inline (this is where mobile persona switching lives). ACCOUNT is a leaf modal (handle · role · sign-out) reached ONLY from inside Identity, placement `surface` — exactly one concept named "account" exists (the settings account PANE died 2026-07-16; it returns as a pane only if account settings grow real weight — a future D-note, not structure now).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
