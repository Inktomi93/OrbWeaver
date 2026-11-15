---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# Check the host's frame message handlers against a hostile frame

## What

A sandboxed frame can post any message to the host page. `SandboxFrame` in `packages/ui/src/content/sandbox-frame/sandbox-frame.tsx` checks the sender window and folds height, link and missing messages, and hands the rest to `onHostMessage` for the plugin bridge. A public account takeover in another product came from a host handler that trusted a frame's message. Our handlers have not been read against that pattern as one review.

## Why

The frame is the boundary, and the host's message handler is the part of it that runs with the app's authority.

## Done when

A security review reads every host-side consumer of a frame message, card, reply and plugin, and states for each what a hostile frame can make the host do. Any handler that writes markup, navigates, or calls a privileged operation from frame data is fixed or shown safe with a test. Findings are boarded.

## Evidence

Filled at landing: what ran and where its output is.
