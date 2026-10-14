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

Native facts need bounded persistence and indexed readers without giant JSON strings or whole-partition decoding. Qualify worker release and complete publication at real scale. The program requires shared persisted facts, not larger heaps, truncated populations or another detector.

## Done when

Native partitions preserve options, roots, dependency closure and unresolved outcomes. Worker programs release before publication. Content-version invalidation, change-during-build refusal, atomic complete cross-world generations, reader pinning, concurrent reuse and transaction-overlay isolation pass discriminating controls. Existing collector outputs preserve alias, dynamic-import, namespace, type/value and consumer-class meaning. Frozen replay completes with measured peak after controls and review; no heap increase or fake program.

## Evidence

Reviewed extraction preserves native resolution, roots, closure, ordering, aliases, physical spans and overlay isolation. Ownership, cleanup and collector parity controls pass. Frozen Knip bytes and root identities remain preserved. GNU time reports descendant high water, not simultaneous aggregate memory.

Extraction shares ts-morph's bundled language-service checker, not the TS7 typechecker. Client and root retain separate browser and Node descriptors. Cached closure paths do not authorize combined worlds or changed membership.

Pinned patch `0450353ca5` skips definition formatting only for opted-in native queries. Independent review confirms native kind, selection, default metadata, lean parity, runtime-byte invalidation and formatter rejection controls. Isolated real-client `TrpcClient` and `useTRPC` queries complete at the fixed heap.

The reviewed correction replaces whole-partition persistence and eager readers with indexed SQLite records. Bounded controls cover native meanings, ordering, multiplicity, input versions, atomic generations, last-good data, overlays and CLI disposal.

The independent review found native scalar UTF-16 loss through SQLite text binding. The accepted correction uses a canonical scalar JSON codec for records and indexed predicates. Its format boundary preserves previous generations without reinterpretation. Native extraction and metadata controls pass, including decoded program ordering and changed-value hashes. Tooling types and scoped lint pass; root retains unrelated errors.

Integrated source `f109dc2abd` completes canonical client extraction, FORMAT3 staging, scalar parent import, input rechecks, publication, lazy read and disposal at frozen revision `77c78fa141`. The post-exit verifier confirms current descriptor, roots and recorded inputs. Worker exit precedes parent import; the closed committed store is reusable at that frozen root.

The run completes in 58:17 with GNU time maximum RSS 11,187,848 KiB at the unchanged 16 GiB heap setting. Parent public high water is 294,456 KiB. These are process high-water measurements, not aggregate memory. Full evidence is `/tmp/ast-memory-format3-client-1002/result-summary.md`.

Default-demand replay is running with fixed deadline and source, dependency and seed guards. It reuses the qualified client. Evidence lives in `/tmp/ast-memory-full-replay-1002/replay-77c78fa141-once`.

Complete cross-world publication and original collector replay remain unqualified until terminal results are read. Client success is not current-main liveness evidence or complete memory qualification. Preserve the reusable generation without rebuilding the client automatically.
