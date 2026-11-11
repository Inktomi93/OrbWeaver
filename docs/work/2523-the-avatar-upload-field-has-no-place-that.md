---
kind: decision
status: doing
updated: 2026-11-11
priority: P3
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: unwired-code
---

# The avatar upload field has no place that renders it

## What

The rendered re-check walked every place a file can be dropped or picked and found the client's AvatarUploadField component rendered nowhere. Confirm with a structural search of both languages and a literal search, and check its history for the surface it was built for.

## Why

Unwired code is a question about intent: it is forgotten work or dead code, and either answer changes the tree.

## Done when

Ruling: delete. The component was built for the first persona editor and the compact persona panel replaced it with its own avatar control; it is registered in packages/client/src/forms/editor/use-app-form.ts and no form renders it (a structural search of the client tsx files and a literal search both find no use). The component, its registration, its copy and any test are deleted in one commit, and knip stays clean.

## Evidence

Filled at landing: what ran and where its output is.
