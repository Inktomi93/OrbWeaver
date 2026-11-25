---
kind: bug
status: open
updated: 2026-11-25
priority: P3
area: security
---

# A boxed string a guest passes to a plugin host read cannot abort the guest runtime

## What

A guest that passes a boxed new String of several million characters to a host read aborts that plugin's guest runtime, because the boxed value is not measured by the string length bound before it is copied out (reports/reviews, the sec2 plugin security review).

## Why

A plugin can crash its own runtime through a host door instead of getting a refusal, and the bound the membrane promises does not cover the boxed form.

## Done when

A boxed string is measured and refused like a primitive string before any copy, with a case that passes a large boxed string to a host read and gets a refusal while the runtime keeps serving.

## Evidence

Filled at landing: what ran and where its output is.
