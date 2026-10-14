---
kind: work
status: doing
updated: 2026-10-14
priority: P2
lane: codex/every-owner-authority-984
---

# Every-owner reads take a typed null-owner run token

## What

Replace drifting discovery read waivers with typed authority. Mint opaque `EveryOwnerRun` only in the workloads runner after claiming an actual null-owner row. Execution reads require that authority; owned reads retain required owner predicates.

Preserve exact bulk model-call estimates through separate typed estimate authority after existing owner, mode and retry admission. Estimate authority permits count computation, not execution, writes or raw-row egress. Reuse production clustering and content predicates.

## Why

A prose waiver for a system read is already false in five places; a type the compiler checks cannot drift.

## Done when

Every execution-wide read requires runner-minted authority. Estimate-wide reads require separately admitted estimate authority and return counts only. Neither authority can replace the other. The gate resolves required canonical identities, rejects lookalike or optional tokens, and preserves owned-query checks. Remove superseded waivers without grants or budget inflation. Prove actual null-owner runs, authorized exact estimates and ordinary-owner refusals through production.

## Evidence

`packages/server/src/domain/workloads/verbs/estimate-model-calls.ts` admits bulk estimates before any workload executes. Theme estimates use actual vectors and seeded clustering, so metadata counts cannot preserve the existing result. Keep this legitimate estimate path distinct from runner authority; do not report it as an execution-only caller or degrade its answer to null.

The contribution, digest, segment and lineage census owns complete scope. Include the embeddings terminal-freshness fan where it enumerates owners. Existing waiver counts are leads, not the population boundary.

Reviewed source `4495cfba7c` implements claim-derived execution authority and separate exact estimate authority. Deleted-owner rows cannot become system work. The single review's containing-type mint bypass is corrected through the canonical type-origin reader; bounded authority and product controls pass.

Integration updates required testkit scopes and readback narrowing. The maintained vector-sweep case still needs real-root adaptation before closure. Unchanged owner-read verdicts and ownerless model funding remain separate work; no whole-policy clean verdict is claimed.
