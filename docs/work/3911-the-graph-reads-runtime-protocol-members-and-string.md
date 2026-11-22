---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The graph reads runtime protocol members and string-named routes and modules

## What

Members the runtime calls by a well-known name are never referenced in code: toJSON (JSON.stringify), \[Symbol.dispose] and \[Symbol.asyncDispose] (using), then (await), \[Symbol.iterator] and \[Symbol.asyncIterator] (for-of), valueOf, toString and \[Symbol.toPrimitive] (coercion), \[util.inspect.custom] (logging). A class implementing a lib interface is dispatched; an object literal or a class without that heritage carrying one looks unread. A module loaded by a computed name (import(variable), createRequire(...)(name)) has no edge. A Hono route path parameter (/x/:id) is read by string (c.req.param("id")), and Vite import.meta.env keys are read by name.

## Why

Each reads as dead or untouched while the runtime or framework uses it.

## Done when

A protocol member on any value the program uses counts as called by the runtime; a computed module load is reported in its own bucket with its call site; a route path parameter pairs with its param reads and a parameter no handler reads is reported; import.meta.env keys pair with their declarations; planted case per shape.

## Evidence

Filled at landing: what ran and where its output is.
