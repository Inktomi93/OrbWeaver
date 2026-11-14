---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# Two more render-floor cases run past the slow threshold untagged

## What

In tests/server/domain/chat/verbs/co-participant-render-floor.int.test.ts, the from-join pre-join picture case ran 4460 ms and the disabled owner's art case ran 3003 ms in a 19-file run at about load 20, against a 5000 ms base budget. Only the fork pin case carries the slow tag. tests/server/infra/plugin-host/marshal.int.test.ts has a 5038 ms case without the tag.

## Why

Item 2926 fixed one case of a class; the siblings time out under the same load and read as gate regressions in a security suite.

## Done when

Each case past the slow threshold in those two suites is tagged slow from tooling/src/floor/testing/test-tags.ts with its alone runtime, or made faster.

## Evidence

Filled at landing: what ran and where its output is.
