---
kind: bug
status: blocked
updated: 2026-10-19
priority: P2
blocked: on 953
---

# byte-check-cast and compose-wiring-only are blind to a respelling of their own mustFlag fixture

## What

tests/tooling/gate-spelling-twins.int.test.ts reports two gates that miss a respelled copy of their own mustFlag fixture and are not in the shrink-only ledger: byte-check-cast under the namespace respelling and compose-wiring-only under the bracket respelling. The floor guard failed first on main, which hid this. byte-check-cast reads tagged sql through tooling/src/floor/code-facts/drizzle-sql.ts, which item 953 is rebuilding; see also 1088.

## Why

A gate that flags x.y but not ns.x.y or x\['y'] lets the second spelling ship; the ledger forbids new rows, so the gate or its reader must see the respelling.

## Done when

Both gates flag the respelled fixture, through the shared reader for byte-check-cast after 953, and gate-spelling-twins passes on main.

## Evidence

Filled at landing: what ran and where its output is.
