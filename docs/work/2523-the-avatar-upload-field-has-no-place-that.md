---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: client
plan: unwired-code
---

# The avatar upload field has no place that renders it

## What

The rendered re-check walked every place a file can be dropped or picked and found the client's AvatarUploadField component rendered nowhere. Confirm with a structural search of both languages and a literal search, and check its history for the surface it was built for.

## Why

Unwired code is a question about intent: it is forgotten work or dead code, and either answer changes the tree.

## Done when

The component is wired into the surface it was built for, with a test, or deleted with its copy and tests, by a recorded reason.

## Evidence

Filled at landing: what ran and where its output is.
