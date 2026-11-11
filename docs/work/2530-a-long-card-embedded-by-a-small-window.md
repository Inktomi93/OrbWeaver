---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: embeddings
---

# A long card embedded by a small-window model is indexed from its opening only, and nothing tells the owner

## What

The card text handed to embedding is capped by a fixed bound, and each embed backend then clamps it to the model's own window. With the smallest curated embedder a long card is embedded from a small fraction of its text, its opening, and the only trace is a log line. The decision not to thread the window into the cap is recorded at packages/server/src/domain/embeddings, in the embed-text header, with a test of the clamp. No surface tells the owner that search and recall see only the start of long cards under that model.

## Why

Search quality for long cards depends on a setting whose effect is invisible. An owner who picks a small local embedder cannot tell why a card is found by its first paragraphs and not its later ones.

## Done when

A recorded product decision: say it in the connection or embedding settings where the model is chosen, embed long cards in windows the way documents are chunked, or accept it as stated. If a notice is chosen, a rendered review has read it.

## Evidence

Filled at landing: what ran and where its output is.
