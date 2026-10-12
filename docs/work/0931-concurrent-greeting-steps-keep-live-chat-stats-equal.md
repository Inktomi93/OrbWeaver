---
kind: bug
status: open
updated: 2026-10-12
priority: P2
area: chat
---

# Concurrent greeting steps keep live chat stats equal to a rebuild

## What

Two concurrent setSeededGreeting steps on a pristine seeded greeting leave live assistantWords at 4 against a rebuild of 1 (a verifier probed it against the real createEdit at c6ede5a58d and at its parent adc273f4c5, identical). Both steps overwrite in place and each applies its stats delta against the same prior row, so the second delta double-applies. Make the overwrite delta read and write under one transaction or compare-and-set on the variant's content, so concurrent steps converge.

## Why

Live stats that drift from the rebuild are the class the stats drift gate exists to catch; this path escapes it because the tests step sequentially.

## Done when

A concurrent-steps test shows live stats equal to the rebuild after two parallel steps, red on the current code.

## Evidence

Filled at landing: what ran and where its output is.
