---
kind: decision
status: open
updated: 2026-11-16
priority: P3
area: chat
---

# Decide whether a framed reply draws while it streams

## What

A reply that will draw in its row's frame shows a forming chip until it settles, then draws once. SillyTavern formats the whole message on every token, so a panel appears as it arrives.

## Why

A long styled reply shows nothing but a chip for its whole generation, which reads as slower than the same preset elsewhere.

## Done when

A ruling on streaming a framed reply, with the cost of each option measured: frame mints per reply, redraws, and what a half-arrived element shows. The forming row follows it.

## Evidence

Filled at landing: what ran and where its output is.
