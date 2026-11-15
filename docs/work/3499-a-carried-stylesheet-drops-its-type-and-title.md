---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# A carried stylesheet drops its type and title, so a non-CSS style element applies as CSS in other runs

## What

`frameStyleElements` in `packages/kit/src/content/index.ts` keeps a style element's media and text only. A style element whose type is not CSS is inert in its own run and becomes a live stylesheet in every run it is carried into, and a titled alternate sheet becomes persistent.

## Why

The carried cascade should equal the cascade of the same reply as one document.

## Done when

A style element with a type that is not CSS is not carried, a titled sheet's handling is decided and stated in the header, and a test under `tests/client/features/chat/lib/` covers each.

## Evidence

Filled at landing: what ran and where its output is.
