---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: contracts
---

# Derive scoped inputs from their canonical wire contracts

## What

Derive SetChatInjectionParams and AddJournalEntryParams from their canonical wire input shapes, adding the resolved principal and chat scope in the domain.

## Why

These parameter types independently repeat the same payload fields already owned by contracts. A wire-field change can leave the domain envelope behind.

## Done when

Preserve current field optionality, identifier types and readonly semantics. Keep Principal server-owned. Replace the repeated payload declarations with derived types and verify both router-to-service boundaries with affected type assertions. Do not change injection or journal behavior.

## Evidence

The candidates and dispositions are in `reports/launch-ast-audit-2026-10-01/respell.json` and `reports/launch-ast-audit-2026-10-01/adjudications.json`. Compare `packages/contracts/src/chat/assemble.ts` with the chat parameter contract, and `packages/contracts/src/rpg/inputs.ts` with the RPG parameter contract. Correct the injection schema comment that claims an absent local satisfies check.
