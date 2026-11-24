---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a153864a73f49fb3e
plan: unwired-code
---

# Id-named plain declarations carry the brand that flows into them

## What

pnpm brand-flow lists missing rows with match "type": plain string declarations named as ids that a branded value flows into, which the name table could not name (character-card.tsx ids, the prompt-assembly sectionId sites, entity-draft-store ids, collection-contracts memberId and others). The list is in `reports/lanes/2026-11-22-3895.md`.

## Why

Before 3895 neither the rule nor the report caught them; a plain string slot drops the brand check at every use.

## Done when

Each site is declared as the brand it holds, or its generic slot is recorded with a reason, and pnpm brand-flow lists no production missing row with match "type".

## Evidence

Filled at landing: what ran and where its output is.
