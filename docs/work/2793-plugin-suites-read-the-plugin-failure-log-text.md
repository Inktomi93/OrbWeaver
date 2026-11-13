---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: test-foundation
---

# Plugin suites read the plugin failure log text from its production home

## What

Plugin test suites copy the plugin failure log line, and the plugin CLI integration test asserts a substring of stderr.

## Why

Copied text passes or fails for the wrong reason when production changes its wording.

## Done when

The suites import the log text from the module production writes it from, and the CLI test asserts the structured outcome, not a stderr substring.

## Evidence

Filled at landing: what ran and where its output is.
