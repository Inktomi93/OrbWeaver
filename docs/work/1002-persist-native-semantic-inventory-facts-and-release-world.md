---
kind: tooling
status: open
updated: 2026-10-14
priority: P1
area: tooling
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

Native extraction uses ts-morph's bundled checker. Root, client and test programs retain their own descriptors, roots and closure.

Pinned patch `0450353ca5` skips unused definition formatting only for opted-in native queries. Independent controls preserve reference kinds, selection, metadata, aliases and lean parity. The fixed-heap client queries pass.

Reviewed indexed SQLite persistence preserves native UTF-16 scalars, ordering, multiplicity, input versions, atomic generations, last-good data and overlay isolation. Bounded native controls, tooling types and scoped lint pass.

Source `f109dc2abd` qualifies client extraction, FORMAT3 staging, parent import, input rechecks, publication and disposal at frozen `77c78fa141`. The run completes in 58:17; GNU time maximum RSS is 11,187,848 KiB. Parent high water is 294,456 KiB. These are process measurements, not aggregate memory. Evidence: `/tmp/ast-memory-format3-client-1002/result-summary.md`.

Source `53a485a41c`, integrated by `4de2122c1a`, corrects cached unredirected wrappers through checker-admitted source identity. Different physical syntax refuses. This invalidates historical client reuse for a new generation.

Frozen `4de2122c1a` full replay reaches its fixed deadline without an OOM or source-identity diagnostic. Worker staging and parent import complete for the preceding worlds; the tests-DOM worker does not finish. Remaining worlds and collectors never start. The target generation stays zero; staged partitions are not published facts.

The terminal report preserves exact populations, timings, per-process RSS and swap observations: `/tmp/ast-native-full-current-1002/result-summary.md`. All owned processes are absent. Source, dependency and workspace-link guards pass. Staged input currency is not revalidated, so reuse is not yet authorized.

Reviewed `49d607fd3c` reuses extraction-local physical identities and completed native import maps through a typed readonly reference pass. Bounded parity, cancellation, invalidation and refusal controls pass. Complete tests-DOM cold extraction, staging, worker release, import, generation publication, lazy reading and disposal pass at frozen `7394d01aaf`; recorded inputs revalidate. Evidence: `.claude/worktrees/codex-tests-dom-profile-1002/reports/review/1002-tests-dom-postfix-qualification.md`. This qualifies that native world, not complete demand. Multi-world replay, collector equivalence, concurrent reuse and hosted memory remain open.

Reviewed `e70114404e` repairs syntax-carrier virtual library collisions with captured text. Native ordered parity, refusal and error disposal pass. Reader fingerprints remain intact; historical partitions need a new current-source generation.
