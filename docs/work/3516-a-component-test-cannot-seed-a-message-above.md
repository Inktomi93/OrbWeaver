---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: client
plan: test-foundation
---

# A component test cannot seed a message above about one megabyte into the transcript

## What

A security review tried to drive replies of 1.17 MB and 3.8 MB through a chat component test under `tests/client/features/chat/components/`. The edits never reached the transcript and the row kept its corpus text. The cause is not known. Large-reply cost is measured in node tests only.

## Why

The stored content cap allows replies of that size, and no browser test can show what one costs to draw.

## Done when

The cause is found, and a component test can mount a reply at the stored cap or the limit is stated in `tests/support/README.md`.

## Evidence

Filled at landing: what ran and where its output is.
