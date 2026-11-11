---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# The client-side plugin UI realm has no test of what a guest can reach

## What

The server's plugin realm now has a test that boots a real guest and compares its reachable globals with a reviewed allow-list (tests/server/infra/plugin-host/realm.int.test.ts). Plugin UI code also runs in a guest realm in the browser, under packages/client/src/features/plugin, with its own host bridge. No test enumerates what that guest can reach or asserts that the page's ambient objects stay out of it.

## Why

The browser guest runs beside the signed-in user's session. An ambient object that leaks into it is the same class of hole the server test now holds shut, on the side with cookies and the DOM.

## Done when

A component or browser test mounts the production plugin frame with a real guest bundle, has the guest enumerate its global object and compares the result with one reviewed allow-list, failing when a name is added. It asserts the guest cannot reach the parent document, storage or network except through the host bridge.

## Evidence

Filled at landing: what ran and where its output is.
