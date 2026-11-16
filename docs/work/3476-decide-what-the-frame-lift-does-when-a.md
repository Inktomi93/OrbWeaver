---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Decide what the frame lift does when a reply names every private-use character

## What

The framed reply's raw-text lift picks a stand-in from the private-use characters the reply neither holds nor names by numeric reference. A reply that holds or names all of them gets no lift, so a stylesheet with a blank line can print as prose again in that reply.

## Why

It is a cosmetic return of the stylesheet fault at an extreme input, visible only in that reply.

## Done when

The case is accepted with the reason recorded in the lift's header, or the lift uses a longer stand-in when the single characters are exhausted, with a test.

## Evidence

Filled at landing: what ran and where its output is.
