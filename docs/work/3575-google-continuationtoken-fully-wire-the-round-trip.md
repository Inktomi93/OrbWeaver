---
kind: work
status: open
updated: 2026-11-18
area: inference
---

# Google truncation continues via the domain continue path; the record says so

## What

Superseded scope: the original "fully wire the continuationToken round-trip" was ruled over-engineered —
the leg-loop design is parked at the google-continuation-token plan. Owner ruling: a truncated Google reply
continues through the EXISTING `continue` turn intent (`autoContinue` / `runAutoContinue`, gated on
`finishReason === "length"`), not a new backend loop. Remaining scope: (1) a proof that `continueTurn`
actually continues a Google truncation correctly on the native route (wire or verb level, including whatever
the native route does without an assistant-prefill row — nudge path included), and (2) the record half: the
past-cap condition today spelled twice in the persistence layer collapses to one predicate so a continued
reply reports `outputCapReached` uniformly.

## Why

Truncation-as-terminal is already wrong on every wire, and the domain already carries the continuation
mechanism; what is missing is the proof it holds on the native Google route and the single past-cap predicate
the parked plan's record section designed.

## Done when

A test proves a length-capped Google reply continued by `continueTurn` lands as one extended message with the
past-cap fact recorded, and the persistence layer's duplicated past-cap condition reads through one
predicate. The parked plan's D355 row ships only if the continue-path proof settles the per-request-ceiling
reading as standing law.

## Evidence

Filled at landing: what ran and where its output is.
