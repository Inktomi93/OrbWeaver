---
kind: bug
status: open
updated: 2026-11-13
priority: P1
area: security
plan: authorization-and-visibility
---

# The blob route serves inline only an exact allowlist of media types

## What

A document or plugin file restored under a comma-joined type that starts with `audio/` is served inline exactly as stored (`packages/server/src/domain/assets/substrate/mime.ts`, the blob route). Chromium reads the last entry of such a type, so an HTML page renders and a same-origin script runs. Reaching it needs someone to import a crafted bundle.

## Why

Stored script execution in the app's origin from an imported bundle.

## Done when

A stored asset whose type is not exactly one allowed inline type is served as an attachment with `nosniff`. Restore and upload refuse a comma-joined or parameter-carrying type. A test through the real blob route shows the crafted file is not served inline. The co-participant attachment path is traced and the result recorded.

## Evidence

Filled at landing: what ran and where its output is.
