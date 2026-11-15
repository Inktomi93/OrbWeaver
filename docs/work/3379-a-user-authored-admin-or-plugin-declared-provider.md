---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A user-authored, admin or plugin-declared provider row states where its samplers come from

## What

The generation floor states no sampler and a stated set replaces it. A provider row that is not built in has no curated row, so its models resolve no sampler unless the connection declares a sampling set or the model id matches a family row; every knob the user sets is dropped with the room notice.

## Why

The built-in guard only covers rows in BUILTIN_PROVIDER_ROWS; a user row pointing at an OpenAI-compatible server silently ignores the preset's samplers.

## Done when

A non-built-in row either names its sampler source (a declared set on the row, or its wire's default for an OpenAI-compatible endpoint) or the add flow says which samplers it will send; a case proves a set temperature reaches the body for a user row.

## Evidence

Filled at landing: what ran and where its output is.
