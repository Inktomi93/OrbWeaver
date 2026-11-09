---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: client
plan: cross-surface-consistency
---

# The phone history pager holds its landing after a jump on WebKit

## What

platform-history-pager.suite.ct.tsx fails after one jump to 50px at 1x on the 390x844 WebKit cell (pnpm test:ct:webkit), reproduced at low load. After the press the transcript runs from scrollTop 50 to the tail at about 82px per 40 to 60ms and the plate grows from 44 to 88px. The reading-row hold (packages/ui/src/primitives/message-list/reading-row\.ts) logs no frames there, which points at the tail re-pin path (useTailRepin or jumpToEnd in message-list.tsx); recent movers are c8c7654495 and fa4ff552bb.

## Why

A reader who jumps back in history on an iPhone is thrown to the end of the chat.

## Done when

The 390x844 WebKit cell holds its landing after the jump, with the cause fixed at its owner and a WebKit red first, and the desktop and Chromium cells stay green.

## Evidence

Filled at landing: what ran and where its output is.
