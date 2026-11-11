---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-a30ee1d42d1997dfe
---

# The character import-identity ruling cites a migration a baseline squash removed

## What

The ruling fixing the content identity of every importable entity records the second identity key for a card whose art arrives after its JSON form, and points readers to the migration that added the column by name. That migration no longer exists: the pre-launch migration chain was squashed into one baseline, and the number the prose cites now belongs to a different migration in the tree. The column, its dual-key lookup, and the single-write re-key are all alive and verified at the statement level — only the evidence pointer in the decision record dangles, naming a file no path exists for. This is the only migration-name citation anywhere in the decision-record corpus.

## Why

The decision record is where a cold author goes to re-verify a ruling at the line, and the cited file resolves to a real but unrelated migration — worse than a missing pointer, because it argues the wrong evidence. A squash of the migration chain is exactly the machinery that silently kills name cites, and no path-resolution check catches a name that matches no file.

## Done when

The parenthetical in the ruling names a location that resolves in the tree — the schema column carrying the second key — the property text and the cited decision are unchanged, and no other decision record cites a migration name that resolves to no file.

## Evidence

Filled at landing: what ran and where its output is.
