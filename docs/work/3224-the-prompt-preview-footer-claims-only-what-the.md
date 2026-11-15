---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# The prompt preview footer claims only what the preview shows

## What

The footer in `packages/client/src/features/chat/components/assembly-preview-panel.tsx` says the host sees what the model sees. Reported but not traced: the preview defers plugin macros, pins its randomness, and the stored record holds no tool list and no history rows. Close each gap or name it in the footer.

## Why

A host debugging a reply reads the preview as the exact request.

## Done when

Each gap is closed or named in the footer, with a test that reads the footer.

## Evidence

Filled at landing: what ran and where its output is.
