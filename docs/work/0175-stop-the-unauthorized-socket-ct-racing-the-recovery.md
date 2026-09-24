---
kind: bug
status: open
updated: 2026-09-24
priority: P2
area: client
---

# Stop the unauthorized-socket CT racing the recovery navigation

## What

tests/client/data/bus/use-orb-socket.ct.tsx case 'an UNAUTHORIZED socket fault ENTERS the recovery ladder' asserts the user frame rendered, but the ladder's navigation reloads the page first in some runs. Measured with --repeat-each=15: 6 of 15 fail on the native EventSource link, 3 of 15 on the POST link.

## Why

A test that fails a third of the time on an unchanged tree trains everyone to re-run instead of read. The race is in the test's barrier, not the app.

## Done when

The case passes 30 of 30 under --repeat-each=30, and its barrier no longer depends on rendering before the ladder navigates.

## Evidence

Filled at landing: what ran and where its output is.
