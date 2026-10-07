---
kind: bug
status: doing
updated: 2026-10-07
priority: P2
area: plugins
lane: codex/plugin-consent-notification
---

# Publish resolved extension permission asks to the notification stream

## What

Publish standing permission-request corrections and retractions without treating them as duplicate notification inserts. Preserve recipient scope, replay deduplication and resume cursor order.

## Why

Approving permissions dismisses the durable ask, but its live update retains the original sequence and can be discarded by the stream.

## Done when

Composed grant and notification regressions pass for same-row corrections and final retraction. Replay overlap, later cursors and recipient isolation remain proven. Affected transport checks pass; historical data and live production state remain intact.

## Evidence

Composed approval and settlement regressions pass through real notification writes and sockets. Corrections retain their row sequence without rewinding the frame cursor. Insert replay overlap remains deduplicated. A broken recipient-channel control exposes foreign data; the restored recipient scope passes.

Rendered live, reconnect and lag cases clear the pending ask while retaining informational history. Recovery refetches the authoritative inbox; old-row revisions are not described as durable replay.

Affected compiler programs, scoped lint, formatting and structural checks pass. The initial scoped aggregate records test-scaffolding failures; corrected checks pass separately. Read-only production inspection confirms the ask is already dismissed. No live grants, notifications, authentication settings or server process were changed. Updated server code remains required for future live settlements.
