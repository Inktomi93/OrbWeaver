---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: tests
---

# Tests import constants instead of re-spelling them

## What

Re-spelled constants across the test tree: the AA contrast floor in 11 sites, talkativeness default, max output tokens, max image bytes, blur surfaces, the eight chat styles, owned settings keys, the frozen clock constant, config anchor ids, gallery and command chip name grammars, the CSRF header, chat-with names, test ids, data-app-ready, the local model leaf, and 154 inline e2e timeouts. Import each from its production home, or extract a zero-import module where a CT cannot import a tsx value.

## Why

A policy or default change moves production and leaves the tests asserting the old value.

## Done when

Every category D row in the audit inventories imports its home or is justified in the row; e2e timeouts use named constants.

## Evidence

Filled at landing: what ran and where its output is.
