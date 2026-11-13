---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: docs
plan: authorization-and-visibility
---

# The cross-site law says what each kind of header-less request gets

## What

The deployment security law's CSRF row and invariant 9 of the auth law say every header-less request outside POST is refused the same way. In fact a real query or subscription gets FORBIDDEN, an unknown procedure gets 404, a mutation or OPTIONS gets 405, HEAD gets 204, and a subscription gets an SSE error frame inside a 200. Nothing runs in any of them and a cross-site page cannot read the difference.

## Why

Law that states one answer where the server gives several sends the next author looking for a defect that is not there.

## Done when

The two law passages state the answer each kind of header-less request gets.

## Evidence

Filled at landing: what ran and where its output is.
