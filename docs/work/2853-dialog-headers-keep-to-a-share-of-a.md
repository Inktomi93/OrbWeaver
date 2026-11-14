---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Dialog headers keep to a share of a phone window at the largest text

## What

At 300% text on a phone, a dialog header takes most of the window. In landscape it leaves a short body window. In portrait the Close button wraps under a title that fills a large part of the height, so a long refusal line in Add document is mostly out of view. The header is built in `packages/ui/src/primitives/dialog/variants.ts`.

## Why

A dialog whose chrome fills the window leaves no room for the content the person opened it to read.

## Done when

A component test in `tests/client/components/` opens Add document at 932px by 430px and at 430px by 740px with 300% text and a long refusal line. It asserts that the header's block size is at most 40% of the viewport height and that the refusal line can be reached by scrolling the body once. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
