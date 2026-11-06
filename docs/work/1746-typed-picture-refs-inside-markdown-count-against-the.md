---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# Typed picture refs inside markdown count against the send picture limit

## What

Count typed picture references inside markdown text toward the per-send picture limit that block attachments already share.

## Why

packages/contracts/src/chat/content-blocks.ts makes the attachment list the cap for a send's pictures. A picture typed as a reference in the text is a second way to carry one, and it should share that cap.

## Done when

A test sends text with more typed picture references than the cap and sees a refusal. A send at the cap, mixing blocks and typed references, still succeeds.

## Evidence

Filled at landing: what ran and where its output is.
