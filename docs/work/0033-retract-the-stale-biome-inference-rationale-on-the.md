---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: contracts
---

# Retract the stale Biome-inference rationale on the databank ingest-phase twin

## What

The `IngestPhase` doc comment in packages/contracts/src/databank/index.ts says the type is derived from the tuple because Biome cannot see through `z.infer` and marks every switch case unreachable. The zod-twin audit's mechanism probes show the installed Biome passes both z.infer and tuple-derived exhaustive switches under noUnreachable, single-file and cross-module. The tag-folder twin already had the same claim retracted. Rewrite the databank comment to give its real reason: the vocabulary's type face lives at the tuple, its one home. State that `satisfies` checks one direction only and the output-twin gate proves exact parity. Separately, probe the transform-backed discriminated union in packages/contracts/src/regex/index.ts (RegexAttachScope). If Biome now narrows through it, apply the same correction there, including its claim that `satisfies` keeps the schema honest. If it still fails, keep the rationale and cite the probe.

## Why

House law treats a comment that states a false mechanism as a drifted-comment defect. A reader who trusts this comment will split types for a Biome limit the audit's probes no longer reproduce, and will assume `satisfies` guards both directions, which the audit's probe refuted.

## Done when

The databank IngestPhase comment no longer claims a Biome inference failure and names the one-way `satisfies` plus the output-twin gate as the parity proof. The regex RegexAttachScope rationale either rests on a recorded probe result or has been corrected the same way. A search of packages/contracts/src for Biome 'cannot see through' or 'unreachable' claims about z.infer finds none that a current probe does not back.

## Evidence

Filled at landing: what ran and where its output is.
