---
kind: bug
status: open
updated: 2026-10-19
priority: P1
---

# Stop storing printed field type text in shape facts

## What

ShapeField.type stores every field's fully printed type (NoTruncation, fully qualified); zod schema members print up to about 1 MB each, and printing is most of the shape-catalog workers' CPU and memory (contracts alone stores over a gigabyte of type text). No consumer reads it: respell's renamed.type is never emitted and the copy and component readers use names only. Lives in floor/code-facts/shape-fields.ts and shape-facts.ts (954's files). Found by 1133.

## Why

Printing and storing text nobody reads is the largest single cost in the shape catalog and keeps workers near the 16 GB runner (965).

## Done when

ShapeField no longer carries printed type text, every consumer still passes with identical output, the inventory format is bumped, and worker peak and time are measured before and after.

## Evidence

Filled at landing: what ran and where its output is.
