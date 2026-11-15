---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Decide whether the wire capture judges a reply's decoded text

## What

The wire capture (`packages/inference/src/backends/v4/fetch.ts`, `emitCapture`) keeps the literal response bytes and scrubs them by value in the raw and JSON-escaped spellings only. A reply that echoes the key with any character written as a `\u` escape keeps the key readable in the capture.

## Why

Every message and log path now decodes before it scrubs. The capture does not, because its claim is the literal wire. The capture is operator-only and opt-in, and only an echo that escapes a character inside the key reaches it.

## Done when

The owner rules between keeping literal bytes as they are, or adding a decoded check that masks the capture when the decoded text holds a known literal; a case pins the ruling with an echoed escaped key.

## Evidence

Filled at landing: what ran and where its output is.
