---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tooling
---

# Plan order lives on the plans, not in the orchestrator skill

## What

Give each plan a rank field in its design.md frontmatter, and have pnpm doc index sort docs/plans/README.md by rank and show it. Move each plan's dependency notes, such as what waits on what, into that plan's design. Replace the skill's Plan order list with one line pointing at the README, and point the onboard hook at the same place. Delete the dated rulings the skill still carries once their home exists, and state in the writing rule that skills hold procedure, never plan state.

## Why

The skill's list went stale: it names a lint drain that landed and an easy-sharing plan that does not exist. Plan state in a skill is archeology; the board and plan docs are its home.

## Done when

docs/plans/README.md lists plans in rank order from their own frontmatter, the skill names no plan, a plan with no rank is refused, and the writing rule says where plan state lives.

## Evidence

Filled at landing: what ran and where its output is.
