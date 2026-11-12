---
kind: bug
status: open
updated: 2026-11-12
priority: P1
area: chat
plan: authorization-and-visibility
---

# Member view strips hidden tags from chat tool records

## What

Make projectViewForMember strip hidden tags from the arguments and the result of chat tool-call records.

## Why

projectViewForMember keeps toolCalls arguments and result verbatim. listDrivableToolNames in packages/server/src/domain/tool-use/teaching-contribution.ts attaches host plugin tools with no game gate, so a model that writes a hidden tag into a tool argument reaches a member. This is the same member promise on another field.

## Done when

A red test with a real member principal reads a tool call whose arguments and result hold a hidden tag, then turns green after the fix. It uses the decode-first shape of RpgRecordedToolCall.

## Evidence

Filled at landing: what ran and where its output is.
What: `projectViewForMember` keeps `toolCalls` `arguments` and `result` verbatim, so a tag a model writes into a tool argument on a host plugin tool reaches a member. Path: `listDrivableToolNames` at `packages/server/src/domain/tool-use/teaching-contribution.ts:64` attaches host plugin tools with no game gate. Teaching only asks for tags in prose, so it needs a model to do this. Why: same member promise on another field. Done: red real-member test on `arguments` and `result`, then green, using the `RpgRecordedToolCall` decode-first shape.
