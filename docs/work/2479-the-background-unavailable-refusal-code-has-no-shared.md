---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: contracts
---

# The background-unavailable refusal code has no shared home across its two domains

## What

background_unavailable is thrown by two domains as one refusal: the character domain aliases it through CHARACTER_BACKGROUND_UNAVAILABLE (domain/character/contract/errors.ts, used by the card write path and restore), while the settings domain spells the same code as a bare string literal in two places (domain/settings/persistence/queries.ts, domain/settings/verbs/add-external-background.ts). The house rule for refusal codes is stated by the character errors file itself: a refusal code is wire vocabulary, homed in the contracts package beside the sibling codes (handle_conflict and friends correctly live there and alias back) so the two domains can never drift into two spellings of one refusal.

## Why

One refusal, four sites, one shared home missing: a rename or a reason-taxonomy change lands on three of the four and silently splits what the wire sees as one answer. It is the drift shape every closed-vocabulary door in this repo was built to prevent.

## Done when

The code is exported from the character contracts module as an OP_CODE constant beside its three siblings, the character alias reads from it, and both settings sites import it. No literal spelling of the code remains outside the contracts constant.

## Evidence

Filled at landing: what ran and where its output is.
