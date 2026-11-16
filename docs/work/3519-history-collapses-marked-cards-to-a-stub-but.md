---
kind: work
status: open
updated: 2026-11-16
priority: P2
area: server
plan: chat-html-and-presets
---

# History collapses marked cards to a stub but resends unmarked model-written HTML in full

## What

The `cardKeepLastX` setting in `packages/contracts/src/rpg/config.ts` keeps the newest marked cards whole in the prompt and collapses older ones to a title stub. A panel the model wrote as raw HTML with no card marker is not a card to that rule, so every such panel in history goes back to the model whole on every turn. Presets written for SillyTavern have the model write a panel in each reply with no marker.

## Why

A room using such a preset spends a growing share of its context on old markup, and the model copies its own earlier markup forward.

## Done when

History treats a model-written panel as it treats a marked card: the newest ones ride whole and older ones collapse, by one stated rule for what the collapsed form is and which setting counts them. The rule reads the same panels the reply frame draws. A server test through prompt assembly shows the collapse and the kept count.

## Evidence

Filled at landing: what ran and where its output is.
