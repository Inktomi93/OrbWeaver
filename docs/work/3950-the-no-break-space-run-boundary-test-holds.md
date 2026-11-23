---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: client
---

# The no-break-space run boundary test holds its intended bytes

## What

tests/client/features/chat/lib/reply-parts.test.ts fails 'no script reaches another run past a close with a no-break space' with a .a{} expectation. The source may hold a literal no-break space where an escape was meant, a known agent-write trap.

## Why

CI's Node job is red, and a test whose bytes changed no longer proves its boundary.

## Done when

The case builds its no-break space from a code point, the test passes, and a production break of the boundary turns it red.

## Evidence

Filled at landing: what ran and where its output is.
