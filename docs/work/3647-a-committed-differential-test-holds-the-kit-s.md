---
kind: work
status: doing
updated: 2026-11-20
priority: P2
area: tests
lane: wt/agent-a4d098f9b2f799d95
plan: chat-html-and-presets
---

# A committed differential test holds the kit's Markdown reading to the real parser

## What

A test under tests/ui/markdown compares the kit content readers with the renderer's real stack (remark with the seal plugins and remark-math, rehype-raw, remend and Streamdown's block split) on five axes: code a macro sits in, style and script elements, strip leaks, held ranges and the panel trigger, over seeded inputs and real-shaped heavy rows. The 3570 research ran it ad hoc and recommends keeping the kit reading behind it rather than replacing it.

## Why

The two readings must agree forever, and no test compares them today, so a library upgrade can open a leak unseen.

## Done when

The test runs in the default suite, proves red on a planted shape for each axis, and reports zero once the math, non-breaking space, hold, info line and panel items and 3509, 3513 and 3560 land.

## Evidence

Filled at landing: what ran and where its output is.
