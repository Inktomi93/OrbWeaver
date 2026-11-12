---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# FORWARD_AUTH_TRUSTED_PROXIES is parsed once

## What

Parse FORWARD_AUTH_TRUSTED_PROXIES once at config load and pass the parsed set, instead of parsing it at each use.

## Why

Two parses of one trust list can drift, and the trust list decides whose headers the server believes.

## Done when

One parse site remains, every reader takes the parsed value, and the forward-header tests pass.

## Evidence

Filled at landing: what ran and where its output is.
