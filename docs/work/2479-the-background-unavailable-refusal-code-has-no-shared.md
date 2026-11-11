---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: contracts
---

# The background-unavailable refusal code has no shared home across the domains that throw it

## What

background_unavailable is one refusal thrown by the character, settings and chat domains, and each spells it for itself. The character domain holds CHARACTER_BACKGROUND_UNAVAILABLE (domain/character/contract/errors.ts, read by the card write path and restore). The settings domain writes the bare string literal (domain/settings/persistence/queries.ts, domain/settings/verbs/add-external-background.ts). The chat domain declares it again as CHAT_OP_CODES.backgroundUnavailable (domain/chat/contract/errors.ts), thrown from set-rpg-pointer, fork, participants and the chat import write. The character errors file states the house rule: a refusal code is wire vocabulary, homed in the contracts package beside its sibling codes and aliased back, as handle_conflict is. Source: reports/codebase-review/units/dom-character.md; the chat home was found on the spot-check.

## Why

One refusal has a separate spelling in each domain that throws it, so a rename or a change to the reason taxonomy can land on some and split what the wire sees as one answer. A client that later keys on the code would match only the spelling it was written against.

## Done when

The code has one exported constant in the contracts package. The character alias and the chat op-code table read from it, and both settings sites import it. A literal search for the code under packages/ finds only that constant.

## Evidence

Filled at landing: what ran and where its output is.
