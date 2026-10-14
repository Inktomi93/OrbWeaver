---
kind: tooling
status: doing
updated: 2026-10-14
priority: P1
area: tooling
lane: codex/native-reference-display-1002
plan: test-foundation
---

# Persist native semantic inventory facts and release world programs

## What

Implement the planned persisted native-world inventory store and worker lifecycle. Existing alias-aware collectors consume shared export origins, module targets, bindings and physical references without retaining every native program. Keep unported typed consumers on explicit native views.

## Why

Complete client extraction returns at the unchanged heap after the reviewed native display correction. Publication then fails because whole-partition JSON exceeds the runtime string limit. Canonical persistence and readers need bounded records without whole-partition decoding. The program requires shared persisted facts, not larger heaps, truncated populations or another detector.

## Done when

Native partitions preserve options, roots, dependency closure and unresolved outcomes. Worker programs release before publication. Content-version invalidation, change-during-build refusal, atomic complete cross-world generations, reader pinning, concurrent reuse and transaction-overlay isolation pass discriminating controls. Existing collector outputs preserve alias, dynamic-import, namespace, type/value and consumer-class meaning. Frozen replay completes with measured peak after controls and review; no heap increase or fake program.

## Evidence

Reviewed extraction preserves native resolution, roots, closure, ordering, aliases, physical spans and overlay isolation. Ownership, cleanup and collector parity controls pass. Frozen Knip bytes and root identities remain preserved. GNU time reports descendant high water, not simultaneous aggregate memory.

Extraction shares ts-morph's bundled language-service checker, not the TS7 typechecker. Client and root retain separate browser and Node descriptors. Cached closure paths do not authorize combined worlds or changed membership.

Inspector diagnostics localize native definition-display allocation but force collection and change heap behavior. Preserve those artifacts without claiming fixed-heap qualification. Native kind, group selection and definition flags remain required; flat references alone are not equivalent.

Pinned patch `0450353ca5` skips definition formatting only for opted-in native queries. Independent review confirms native kind, selection, default metadata, lean parity, runtime-byte invalidation and formatter rejection controls. Isolated real-client `TrpcClient` and `useTRPC` queries complete at the fixed heap.

The complete cold client run on that patch returns from native extraction, then fails with `RangeError: Invalid string length` at `JSON.stringify(partition)`. It runs for 55:01 with peak RSS 12,188,660 KiB and no OOM. The closed staging database contains no committed partition or generation. The terminal report is `/tmp/ast-memory-cold-client-1002/result-summary.md`; it does not qualify parent decoding, publication or complete-world replay.

The reviewed correction replaces whole-partition persistence and eager readers with indexed SQLite records. Bounded controls cover native meanings, ordering, multiplicity, input versions, atomic generations, last-good data, overlays and CLI disposal.

The independent review found native scalar UTF-16 loss through SQLite text binding. The accepted correction uses a canonical scalar JSON codec for records and indexed predicates. Its format boundary preserves previous generations without reinterpretation. Native extraction and metadata controls pass, including decoded program ordering and changed-value hashes. Tooling types and scoped lint pass; root retains unrelated errors.

Integrate the corrected source with current main before scheduling frozen replay. Real-client staging, parent import cost and complete-world publication remain unqualified. Bounded controls do not establish resource qualification. No automatic retry is authorized.
