---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: tooling
lane: wt/agent-a1b41287df1811879
---

# Keep a failed doc commit from deleting a file the snapshot never saw

## What

After a failed doc commit, `putBack` in `tooling/src/doc/ops/tree.ts` deletes every path missing from its snapshot, on the reading that the write created it. A path a sibling process wrote in between is deleted with them. Both callers rely on the deletion: `tooling/src/doc/ops/items.ts` snapshots before a mint writes its file, and `tooling/src/doc/ops/land.ts` regenerates generated files. So the write verbs declare the paths they create, and `putBack` deletes only those.

## Why

A future verb that writes outside the tracked text files would lose that file when its commit fails.

## Done when

Each write verb declares the paths it creates, `putBack` deletes only declared paths and keeps any other path the snapshot never saw, and a test writes an undeclared file, fails the commit and finds the file kept and the minted file gone.

## Evidence

Filled at landing: what ran and where its output is.
