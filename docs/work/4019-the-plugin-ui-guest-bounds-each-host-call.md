---
kind: work
status: open
updated: 2026-11-25
priority: P3
area: security
---

# The plugin UI guest bounds each host call, a frame serves the current bundle after an upgrade, and the frame bridge pins its channel

## What

handleHostCall in the client plugin UI guest host has no per-call timer, so hostCallDeadlineMs does not stop a call outstanding after its event settles; packages/server/src/entry/http/plugin-frame.ts snapshots the frame document at mint, so a remount inside the handle TTL after an upgrade serves the old HTML; the frame bridge in sandbox-frame.tsx authenticates by window identity alone and posts replies to any origin; no test shows whether a dns-prefetch or preconnect link in a frame is blocked.

## Why

Each is a documented bound or isolation the plugin UI promises without a mechanism or a test behind it.

## Done when

A host call past its deadline settles refused with a case, a remount after an upgrade serves the new bundle with a case, the bridge pins its MessageChannel or a nonce and posts to the frame's own origin, and a frame case proves prefetch and preconnect links make no request.

## Evidence

Filled at landing: what ran and where its output is.
