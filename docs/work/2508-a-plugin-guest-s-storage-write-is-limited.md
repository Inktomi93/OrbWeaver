---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# A plugin guest's storage write is limited by a table check a NUL in the key gets past

## What

The plugin UI relay refuses an over-long storage key or over-large value at its wire schema. The guest's own storage write through the membrane has no host-side check and relies on the plugin_kv table's CHECK. That CHECK measures the key with a length function that stops at a NUL character, so a key holding a NUL passes at any size, and a plugin can store far more than its budget. A guest write the CHECK does refuse surfaces to the guest as a raw database error where the relay answers a coded refusal. The limits live in the plugin contract (packages/contracts/src/plugin). Source: the errors leg-five security review under reports/review.

## Why

The storage budget is the bound on what an installed plugin can make the server keep. The WASM sandbox is the plugin trust boundary, and a limit that only one of its two doors enforces is not a limit.

## Done when

One host-side check of key and value size runs for the guest write and the relay write and reads the contract constants; a key containing a NUL is refused or measured in full. A test through the real guest's storage write shows an over-long key, a NUL-bearing over-long key and an over-large value each refused with the coded answer. If the table CHECK changes, it ships as a numbered migration.

## Evidence

Filled at landing: what ran and where its output is.
