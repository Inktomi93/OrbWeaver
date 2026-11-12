---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: chat
lane: wt/agent-ae0dbb86398ce7ecd
plan: authorization-and-visibility
---

# Hidden-tag follow-ups from the security read of the strip fix

## What

Do four hidden-tag follow-ups. Warn the host when a cut-off reply lost its tail to a tag that is not at the cut. Widen the loose name test beyond the ASCII identifier. Bound the tag close inside the scan limit. Record in ADR 0285 that a hidden tag spanning a non-hidden tag's close reads left-most.

## Why

The security read of the strip fix found these gaps. Only a truncated tag should take the cutOff excuse, a non-English attribute name should still conceal, and the close scan should be bounded. The last item is an accepted risk to write down.

## Done when

Each follow-up has a test or a recorded decision. The warning, the ADR 0285 sentence, the comment in packages/kit/src/content/index.ts and the unfinished test agree. Non-ASCII, namespaced and quoted names conceal, and a bare phrase such as lie down on the bed stays prose.

## Evidence

Filled at landing: what ran and where its output is.

1. Warn the host when a cut-off reply lost its tail to a tag not at the cut: only a truncated tag takes the `cutOff` excuse; a complete tag past the pass bound and a capped tag warn always. A tool loop keeps only the last finish, so `aggregateEconomics` can excuse an earlier step. Correct the ADR 0285 sentence, the comment at `packages/kit/src/content/index.ts:1224-1227` and the `unfinished` test.
2. Define the loose test's `name=` shape past the ASCII identifier, so `<lie véracité="S"/>`, `<lie x:truth="S"/>` and `<lie "truth"="S"/>` conceal and `<lie down on the bed` stays prose. Non-English cards make this plausible.
3. Bound the tag close inside the scan limit (`index.ts:350,354`).
4. Record in ADR 0285 that a hidden tag spanning a non-hidden tag's close reads left-most. Accepted risk: my call, with the cost of closing it higher than the case.
