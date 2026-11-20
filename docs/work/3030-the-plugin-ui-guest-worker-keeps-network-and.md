---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: security
---

# The plugin UI guest Worker keeps network and cross-context storage after its boot strip

## What

After boot, the guest Worker thread in packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts still holds WebSocketStream and WebTransport on Chromium, and caches (whose Cache.add and addAll send requests), a nested Worker constructor (a fresh thread with full fetch), BroadcastChannel and indexedDB on Chromium and WebKit. NETWORK_GLOBALS lists only fetch, XMLHttpRequest, WebSocket and EventSource, and the file header calls the removal a build-time impossibility. The QuickJS guest cannot reach any of these; only the worker module's own code can.

## Why

The strip exists so that a future edit or a bundler helper in the worker module cannot send a plugin's data out with the signed-in user's cookies. A denylist that misses a request path makes that guarantee false, and the page CSP limits only off-origin requests, not same-origin calls with the session.

## Done when

The worker deletes every request, nested-thread, cross-context messaging and shared-storage name it does not need, and a component test enumerates the Worker's global chain after boot against one reviewed list on Chromium and WebKit, red when a name is added.

## Evidence

Filled at landing: what ran and where its output is.
