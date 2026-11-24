---
kind: tooling
status: doing
updated: 2026-11-24
priority: P2
area: tooling
lane: wt/agent-abf90df0f06f44a65
plan: unwired-code
---

# A form field bound by a string path writes the member the path names

## What

The graph cannot see a write through a form field bound by a string path, such as the user macro editor's AppField name built from a template path in packages/client/src/features/config/components/user-macro-editor-dialog.tsx, so userMacroSchema.description and .strict report read-only though the editor writes both.

## Why

Each such field turns a written member into a false ask.

## Done when

A field bound by a literal or template string path whose segments resolve against the form's value type writes the named member, a planted case is red without it, a path naming a member the type lacks writes nothing, and the two user macro rows leave read-only on the real tree.

## Evidence

Filled at landing: what ran and where its output is.
