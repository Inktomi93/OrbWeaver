---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: contracts
plan: type-law
---

# Close brand-flow's contract-tier string ids so a wrong id cannot compile

## What

Work pnpm brand-flow's tier-two rows: a branded id widened into a plain string slot, and an id field declared string where a brand exists. orb/no-raw-id is already on at error, so first find why these rows pass it: a generic id field is not judged, and some names may match only as aliases. Extend that rule rather than adding a second one. Declare each slot with its brand. Where one field holds several id kinds, make the shape a union on its kind so each kind carries its own brand. Keep plain string only for ids that are not ours, such as guest-chosen plugin ids, with the reason in the type's comment.

## Why

A plain string id field accepts any id. Turn assembly passes a chat id as a plugin macro's source and it compiles, so a plugin macro could never link to its plugin. T5 and T7 fixed brand minting and raw ids, but these slots have no owner.

## Done when

pnpm brand-flow reports no tier-two widen or missing row in production code, each remaining plain string id states why, and orb/no-raw-id refuses a new one, including a branded id passed into a generic id field.

## Evidence

Filled at landing: what ran and where its output is.
