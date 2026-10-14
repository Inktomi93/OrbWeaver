---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
lane: codex/funding-qualification-969
plan: inference-flow
---

# Every runtime call is funded and struck out the same way

## What

Put current funding and credential authority checks at the executor boundary, including pinned embedding, imagery and rpg calls. Centralize auth-failure strike-out and test each path. Correct the compose comment to describe the graph-owned configured-endpoint adapter, URL validation and firewall-controlled admission. Obtain security review.

## Why

A call path that skips the funding verdict or the strike-out can spend on a connection the funder cannot fund, or keep using a revoked credential.

## Done when

Every call path to the executor runs both checks (a test per path); the egress comment states the real guard; security review confirms.

## Evidence

The execution boundary must read current consent and credential authority, not only apply `canFund` to a captured snapshot. Pinned embedding snapshots retain stale consent and credentials after later authority changes. Preserve immutable generation/model configuration while refusing revoked, missing, foreign or stale authorization before accounting and provider I/O.

Reuse the runtime's owned-read capability with ownership checked before private parsing. This depends on the stored-connection parsing work. Remove duplicate role/chat strike handling and unused context wiring without retrofitting obsolete legacy observer contracts. Preserve original provider errors, secondary failure reporting and proven settled-signal cancellation semantics. Source mapping is not runtime qualification.

An in-flight failure can revoke replacement material under the same credential ID. The credential owner must compare captured sealed material atomically before revocation. Carry correlated ID and opaque execution evidence, not plaintext, through the strike callback. Preserve foreign-owner refusal and audit semantics. Prove replacement survival, unchanged-material revocation and sealed-field redaction on a real driver failure; no schema version or timestamp comparison.

Independent review confirms current admission, cancellation classification, replacement-safe revocation and diagnostic redaction. Positive cases pass across affected runs; planted admission and material-comparison cuts fail. Throwing query-factory controls prove package-boundary refusal, not native SDK execution. Native stream and compaction cases use the SDK and actual children; complete physical-exit qualification remains with the server harness. The optional callback-rejection branch remains source-only. Root typechecking fails on non-owned diagnostics.

The production authority fix, canonical owner-before-parse dependency and configured-endpoint graph are integrated after security review. Actual database controls prove stored refusal, foreign ownership and secret-free errors. Contracts, inference and server configs and exact lint pass; root types retain non-owned diagnostics.

The complete funding, recall, compaction and failure proof population remains unlanded. Corpus checkpoint `6e595679a7` preserves coupled producer-preparation edits; they cannot import an absent private fixture assembly into the current corpus candidate. Rebuild those consumers on the integrated canonical root. The dependent SDK-session producer case remains preserved with its raw SDK script dependency, not current-tree qualified. Complete call-path and physical-exit qualification remain required; this item stays open.
