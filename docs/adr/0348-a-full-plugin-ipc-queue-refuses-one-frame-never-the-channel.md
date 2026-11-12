---
kind: adr
status: active
updated: 2026-11-12
---

# A full plugin IPC queue refuses one frame, never the channel

## Context

The plugin host's processes talk over inherited IPC channels. When a frame would pass a sender's byte cap, the sender closed the channel and ended its process, so one owner's plugins could stop the host for every owner.

## Decision

A full queue refuses the one frame that would overflow it, to the plugin that sized it, and the channel stays open. The full decision text lands with the change that builds it.

## Consequences

One owner's flood fills only its runtimes' shares.

## Alternatives rejected

Closing the channel on overflow: one plugin's flood ended the host for every owner.
