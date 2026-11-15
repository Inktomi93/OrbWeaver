---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: connection
---

# The role readout keeps showing stated facts after a turn warms the row

## What

The Connections list and Model roles pane read each role from the server facts already held and dial nothing. A row that has never been warmed shows its stated and curated facts: its Needs rail judges those, and a native-server capability (tools, vision, an embedder's kind) can read unmet. The first turn, an explicit read or the editor then warms the row, but nothing invalidates the bindings read, so the pane keeps the cold answer until something else refetches it.

## Why

A user who binds a local model sees a requirement marked unmet that the next turn meets, with no way to know the row simply was not checked yet.

## Done when

A warm of a connection's facts (a turn, the editor's capability read, an endpoint inspection) invalidates the bindings read, or the readout says a row has not been checked, and a CT shows the Needs rail change after the warm.

## Evidence

Filled at landing: what ran and where its output is.
