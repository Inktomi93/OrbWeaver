---
kind: decision
status: open
updated: 2026-11-13
priority: P3
area: embeddings
plan: stored-data-integrity
---

# A long card embedded by a small-window model is indexed from its opening only, and nothing tells the owner

## What

A hosted embedder with a small input window indexes a long card from its opening only, and nothing tells the owner where the embedder is chosen. Local encoders window long text without loss and are exempt. Show a notice on the embed role slot in `packages/client/src/components/connection-role-slot.tsx` when the resolved embedding capability has no local text encoding and its input window is under a named threshold. The threshold is a constant in the contracts package, set below the card cap so an embedder one token under the cap gets no notice; the cap in `packages/server/src/domain/character/substrate/embed-text.ts` reads the same home.

## Why

Search quality for long cards depends on a setting whose effect is invisible. An owner who picks a small local embedder cannot tell why a card is found by its first paragraphs and not its later ones.

## Done when

The embed role slot shows the notice for a small hosted window and not for a large one or a local encoder, the threshold and the copy each have one home, a CT covers the three cases, and a rendered review has read it.

## Evidence

Filled at landing: what ran and where its output is.
