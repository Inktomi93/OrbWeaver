---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# Literal hits that hold a trial row are keys or reads of the member

## What

The real-tree delete trial (member-untouched, 50 candidates) gives 23 confirmed-literal rows. They are held by product hits that look unrelated to the member: import-export hits for common words such as id, scope and connection, and read hits the checker resolved to nothing. The string-key rule landed on the 3892 branch; these remaining holders are import-export and unresolved-read hits.

## Why

A confirmed-literal row tells the owner a dead member may be read by name, so a noisy holder hides real dead members behind a false doubt.

## Done when

Each confirmed-literal row in a real-tree 50-candidate trial names a holder that is a key use or an unresolved read of the member's own owner; an import-export hit holds a row only when it imports or exports the member's own name; a planted case per holder kind goes red when the rule is removed.

## Evidence

Filled at landing: what ran and where its output is.
