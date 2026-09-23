---
kind: adr
status: active
updated: 2026-09-23
---

# Snap heap evidence uses the pinned DevTools parser

## Context

Snap captures V8 heap snapshots from the page it already drives. Dominators, retainers and detached nodes need a real snapshot parser. The official DevTools `HeapSnapshotManager` runs without a browser and ships inside `chrome-devtools-mcp`.

## Decision

`tooling/src/snap/ops/arms/heap.ts` captures through Playwright CDP on the settled page Snap owns. It never launches, attaches or closes a browser or context. `tooling/src/snap/lib/heap-devtools.ts` is the only module that deep-imports the pinned parser (`HEAP_PARSER_PACKAGE` and `HEAP_PARSER_VERSION` in `tooling/src/snap/contract/heap.ts`). It converts every DevTools object into the bounded JSON contract. Growth and detached nodes are reported as evidence with no exit vote. Heap artifacts land only in the run slot.

## Consequences

A parser upgrade is a pin change plus the version check in the adapter. A leak shows as evidence that the reader judges. Snap never fails a run on heap size.

## Alternatives rejected

A custom snapshot parser: it would be a second, plausible but wrong truth beside the DevTools engine. Importing or spawning the MCP server: it adds a process and a browser path for a parser that needs neither. A separate heap CLI or a run-level capture: the heap belongs to the page Snap already drives. A heap-size pass or fail threshold: no correct heap size exists apart from the application. Caller-chosen output paths: run-slot paths stay immutable.
