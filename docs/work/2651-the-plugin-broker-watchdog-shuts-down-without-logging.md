---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: plugins
---

# The plugin broker watchdog shuts down without logging a relay failure

## What

At server shutdown, after the last request, the plugin broker watchdog logs that the app-to-broker relay failed because the inherited channel is closed. It prints once in every run of the corpus e2e launcher, after the relay and channel changes as well as before them, and not in a plain e2e run. So it follows how the corpus launcher's web server is shut down: the channel closes before the relay stops, and the ordinary close is reported as a failure.

## Why

A failure line on every clean shutdown hides a real relay failure and teaches readers to ignore the watchdog's log.

## Done when

A clean shutdown stops the relay before the channel closes, or the relay treats a close during shutdown as expected, and logs nothing at failure level. A test shuts a composed server down with a live broker and asserts no relay failure line. A channel that closes while the server is running still logs and is handled as today.

## Evidence

Filled at landing: what ran and where its output is.
