---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: contracts
---

# A failed character card import carries no code the client can key on

## What

The result the server sends for a card that failed to import holds a file name and a message only (packages/contracts, the import card result). The client now shows its own sentence for a failed card, and without a code it shows the same sentence, that the picture holds no character card, for every failure: a card that decoded and failed validation and a server fault read the same as a plain picture. The loader already distinguishes these by an internal error code.

## Why

A person whose card file is damaged or too new is told it is not a card at all, and cannot tell a bad file from a server problem.

## Done when

The failed-card result carries a code from one contracts tuple, the loader maps its internal error codes onto it, and the client's copy is an exhaustive record over that tuple with a general sentence for an absent code. A server test asserts the code for a plain picture, an invalid card and a loader fault through the import route, and a component test shows each sentence.

## Evidence

Filled at landing: what ran and where its output is.
