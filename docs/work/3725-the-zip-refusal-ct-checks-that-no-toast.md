---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: import
plan: test-foundation
---

# The zip refusal CT checks that no toast of any kind appears

## What

tests for the SillyTavern zip refusal assert no toast with getByRole alert, which only catches error toasts; other toasts carry role status (packages/ui toast).

## Why

A non-error toast beside the inline refusal would pass the test.

## Done when

The case asserts no toast root renders, red when any toast is raised.

## Evidence

Filled at landing: what ran and where its output is.
