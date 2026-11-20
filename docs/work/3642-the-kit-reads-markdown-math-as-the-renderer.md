---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: kit
plan: chat-html-and-presets
---

# The kit reads Markdown math as the renderer does

## What

The renderer reads single-dollar inline math and double-dollar blocks through remark-math, while the kit content readers read them as prose or HTML. Math changes code-span pairing and swallows HTML blocks and markup, and a seeded run against the real parser stack found a stylesheet strip leak caused by math; prose prices such as two dollar amounts in one line trigger it.

## Why

A stylesheet can print on the plain path when a reply mentions two prices.

## Done when

The kit reads math as the renderer does, or the seal turns off single-dollar math with a recorded ruling, and a seeded run against the real parser reports no math disagreement.

## Evidence

Filled at landing: what ran and where its output is.
