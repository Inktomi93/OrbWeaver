---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: docs
---

# Three owner rulings cited only in comments get decision records

## What

The comment sweep for item 2444 found three owner rulings whose only record is a code comment. One: under host load the tooling floor labels a rate result and does not withhold it (tooling/src/floor/host/load-budget.ts); ADR 0308 covers timing by hardware class, not this. Two: the mirror side of the port registry has no env file and does not move into the kit package, and the port registry check leaves it out by ruling (tooling/src/floor/host/ports.ts). Three: a user macro has two definition homes, the preset and the game (packages/contracts/src/rpg/inputs.ts and the sites that say owner ruling for the game half); ADR 0169 covers per-chat macro values, not the two homes.

## Why

A ruling that lives in a comment has no id to cite and no place to amend, and the comment law lets a comment cite only a decision id or a named law section.

## Done when

Each ruling has an ADR minted with pnpm doc new adr, stating the ruling, its reason and what it rejected, drawn from the comments and the code they govern. Each citing comment names the ADR id. The owner has confirmed the three texts or corrected them.

## Evidence

Filled at landing: what ran and where its output is.
