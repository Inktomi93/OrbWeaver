---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: plugins
---

# Repeated plugin broker replacements are bounded

## What

After a broker loss, plugins now recover on their own and at once. Nothing bounds a loop: recovery has no backoff, and a replacement on liveness or memory strikes no plugin. The security review found no way for a guest to end the broker today, so no loop can be driven yet; the broker's measured peak under the largest flood stayed under its memory limit with room.

## Why

If a guest-reachable broker exit is ever found, automatic recovery turns it into a repeating outage for every owner with nobody struck and nobody told.

## Done when

Broker replacements inside a stated window back off, and past a stated count the host stops restarting and tells the owner, with the reason, where plugin health is shown. A test drives repeated replacements through the production watchdog and shows the backoff and the stop. The bound and its reason are in D347.

## Evidence

Filled at landing: what ran and where its output is.
