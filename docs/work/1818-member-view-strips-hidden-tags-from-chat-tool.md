---
kind: bug
status: open
updated: 2026-11-01
priority: P2
area: chat
---

# Member view strips hidden tags from chat tool records

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.
What: `projectViewForMember` keeps `toolCalls` `arguments` and `result` verbatim, so a tag a model writes into a tool argument on a host plugin tool reaches a member. Path: `listDrivableToolNames` at `packages/server/src/domain/tool-use/teaching-contribution.ts:64` attaches host plugin tools with no game gate. Teaching only asks for tags in prose, so it needs a model to do this. Why: same member promise on another field. Done: red real-member test on `arguments` and `result`, then green, using the `RpgRecordedToolCall` decode-first shape.
