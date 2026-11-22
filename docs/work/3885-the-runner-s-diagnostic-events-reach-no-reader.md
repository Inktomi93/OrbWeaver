---
kind: bug
status: open
updated: 2026-11-22
priority: P2
area: inference
plan: unwired-code
---

# The runner's diagnostic events reach no reader

## What

`ChatEvent` (packages/inference/src/contract/events.ts) carries ten kinds. `outOfBandChunks` in packages/server/src/domain/chat/engine/provider-bridge.ts reads only `warning` and `refusal`; nothing else in the tree reads `ChatResult.events`. The `compaction`, `api_retry`, `rate_limit`, `status`, `auth_status`, `model_downgrade` and `permission_leak` kinds, and the `refusal` kind's `category`, `explanation`, `fallbackModel` and `retried`, are written by the agent-sdk runner and dropped. The bridge header says these stay on `ChatResult.events` for the wire-outcome ring, but `WireOutcome` (packages/server/src/foundation/observability/contract/wire-capture.ts) has no events field, so that claim is false. `rate_limit` and `permission_leak` also have log lines beside their emits; the other kinds have no reader at all. Found by the bloodhound member-roles pass (reports/api-play/bloodhound), confirmed by a full literal sweep of each kind string.

## Why

Owner ruling: data the app collects and never shows is a product item, not a delete. `permission_leak` is described as security-relevant and never silent, and `model_downgrade` as silent-downgrade detection, yet neither reaches a reader past its log line. A comment that names a reader that does not exist is a defect.

## Done when

Each kind is either shown where it helps (the wire-outcome ring, a debug route, or a user-facing notice, each with its own ruling), or no longer produced. The provider-bridge header states what actually reads the events.

## Evidence

Filled at landing: what ran and where its output is.
