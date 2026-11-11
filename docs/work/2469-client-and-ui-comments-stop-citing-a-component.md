---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
---

# Client and ui comments stop citing a component size cap nothing enforces

## What

Many comments under `packages/client/src` and `packages/ui/src` say a file was split because it crossed a component size cap, or that a cap applies. No lint rule, dependency rule or test enforces a line cap, and D333 forbids a replacement for the deleted check. Item 2433 corrected the same claim under `tooling/src`.

## Why

An author who reads the comment splits a file for a rule that does not exist.

## Done when

No comment in those two trees states a size cap as a rule in force. A comment that explains why two files are separate keeps its real reason.

## Evidence

Filled at landing: what ran and where its output is.
