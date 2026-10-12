---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: tests
lane: wt/agent-a58aafa75b5c9c820
plan: test-mirror
---

# Story test ids come from a typed story registry

## What

testid-typed-only-stories waives the CT stories' test ids under item 906, but none is a production TEST_IDS value, and adding story-only rows to the production registry would trip testid-liveness (its producer rule reads only packages/\*\*/src and a testId() call is not a literal producer). Design a typed story-id registry the gates read (or extend testid-liveness to story producers), migrate the stories, and delete the waivers.

## Why

A string test id in a story re-spells a selector that drifts silently; the burn-down needs a home the gates accept.

## Done when

Story test ids come from a typed registry the testid gates accept, and the testid-typed-only-stories waivers and budget row are gone.

## Evidence

Filled at landing: what ran and where its output is.
