---
kind: review
status: active
updated: 2026-09-18
---

# The six systemic themes behind the 510 external-review findings (#1513)

An external blind cold-read review produced 510 findings (502 after excluding archive/docs/devcontainer
out-of-scope observations). Package severity spread: server 239 (37 high), client 92 (3 high), tooling
67 (4 high), vendor 24, db 18, ui 15, contracts 13, kit 12, root-config 11, repo-ops 10, test-support 5,
e2e 4. These cluster into six systemic themes. The themes converge almost exactly with what independent
verification produced, which is the strongest evidence any of this is real. This document exists so the
structural fix is visible above the ~120 instance rows, because fixing the instances one at a time will
not stop the next batch.

The reviewer's own headline judgment: *"high-skill, high-ambition codebase with a coherent modular
shape... It is not slop and it does not need a rewrite. The hard verdict is request changes before
production trust. The main risk is not ordinary algorithmic incompetence. It is composition."*

Source: `REPO_SYNTHESIS.md` and `MISC_SYNTHESIS.md` from the blind cold read; themes cross-checked
against the ~120 independently verified instance rows filed from the same review round. Claim
adjudication (refuted/narrowed findings) recorded separately in
[`2026-09-05-external-review-claim-adjudication.md`](2026-09-05-external-review-claim-adjudication.md)
and [`2026-09-06-external-review-claim-adjudication.md`](2026-09-06-external-review-claim-adjudication.md).

## Theme 1. Unknown is treated as false

Pending, failed, missing, unreadable and unsupported states are repeatedly collapsed into `[]`, `0`,
`false`, `null`, or an apparently complete artifact. The user-facing consequence is confident
misinformation: no attachments, empty bank, no versions, not run, import succeeded, model comparison
passed, trace evidence complete.

**Structural fix:** one shared state contract where pending, unavailable/error, empty and complete stay
distinct through the last consumer. Evidence tools additionally owe scanned-root denominators, dropped
counts, a completeness basis, and an explicit refusal state.

**Boarded instances:** the eleven-surface client failure-state batch, the seven-instrument
false-completeness batch, the core-capture and interaction-perf completeness lies.

## Theme 2. Producer inference replaces local invariants

One side of a relationship is validated and the producer is trusted to have made the other side coherent.
Same shape across owner/resource, chat/message, character/persona roster, terminal/ordinary tool class,
snapshot/game lineage, carried books. Ordinary callers satisfy it; import, replay, handoff, background
work, malformed rows and future callers do not.

**Structural fix:** prove the relationship at the narrow persistence or service boundary that can do it
cheaply — same owner, same chat, same game, permitted membership, valid tool class, current lock/version.
This is the seam-ownership decision already boarded; it is a real fork (add predicates vs. name an
enforcer) and it should be decided once rather than per row.

## Theme 3. Read, derive, write with no durable claim

Whole-document replacement and read-modify-write across chat sequencing, settings, RPG state, refinery
sessions, variables, plugin KV quotas, notification allocation, seeders, imports, credential activation.
Promise maps and single service instances make local tests look serialized while replicas stay free to
race.

**Structural fix:** field-level updates for patch semantics, compare-and-set with bounded conflict
handling, unique admission keys with loser readback, durable leases for expensive single-flight, and one
transaction for a completion latch plus the state it claims is complete.

**Note:** verification established this repo runs ONE process per box today, so the replica half of this
family is latent — see the process-topology row. The read-modify-write half is live regardless.

## Theme 4. Cancellation is mistaken for completion

Abort signals are cooperative. Code releases a lock, removes an active-turn entry, returns from a stream
API, or treats EOF as success before the underlying task is known to have stopped.

**Structural fix:** pair cancellation with awaited settlement and a commit-time ownership/write fence.
Stream protocols must distinguish terminal success, terminal failure, caller cancellation and truncation
as four states, not two.

**Instances:** the turn lock fence, the four provider reducers accepting truncated streams, the
impersonation stream never registered with activeTurns.

## Theme 5. Partial side effects hide behind idempotence labels

Import, seed, activation and duplication paths deduplicate a base row or a completion latch only. Tags,
books, scripts, images, pointers, RPG state, plugin assets and provenance can fail afterwards, leaving a
result retries treat as complete.

**Structural fix:** idempotence requires atomic completion, or an explicit completion state per logical
side-effect plane.

**Instances:** character import permanently partial, the seeded-pack under-dressing, the plugin
bundle-asset leak, the persona seed latch.

## Theme 6. Test strength is local, composition coverage is thin

The test volume is real. The blind spots are temporal and cross-boundary: concurrent admission, two
service instances, malformed cross-owner fixtures, ignored cancellation, truncated streams, failure after
the first overlay, out-of-order completions, prop changes while mounted, and the actual production
adapter composition.

This theme is the reason the others survived. A focused green suite is not proof of the composed
guarantee — and in several cases verified here, the test asserts a shape production does not have (the
engine tests inject a rejecting emitter; production's composition root discards the result).

**Structural fix:** composition-level integration tests that exercise the production wiring, not mocked
substitutes. Cross-boundary fixtures that represent the other side's actual failure modes (malformed,
partial, cancelled, concurrent). Temporal tests (out-of-order delivery, mid-flight cancellation,
mount/unmount during async).

## The reviewer's recommended fix order

Recorded as stated — the order reflects their cold-read risk assessment:

1. **Server stop-ship:** migration safety, process execution, turn/stream fencing, tenant ownership,
   identity binding, prompt privacy, long-lived authorization.
2. **Tooling evidence integrity:** subprocess lifecycle, deadlines, exit-status handling, population
   completeness, syntax-equivalent AST coverage.
3. **Async state contracts** across client and UI.
4. **Durable database constraints** for ownership, lineage, physical domains and security-bearing
   discriminants, so service code stops inferring them.
5. **Kit/e2e/test-support** evidence paths.
6. **Vendored upstream defects** tracked separately with explicit pin/patch/upgrade/risk-acceptance
   decisions.
