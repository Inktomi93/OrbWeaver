---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: connection
---

# The connection create and update verbs parse the declared block before the write

## What

Only the router parses a connection's declared block. The service-level create writes a block the stored schema refuses, and the owner's whole connection list then fails to read. No production caller skips the router today.

## Why

The connection rule is to judge every refusal at the write, so a second caller cannot store a row that breaks the list.

## Done when

A service-level create with a refused declared block throws before the insert, and the list still reads, in one case through the composed root.

## Evidence

Filled at landing: what ran and where its output is.
