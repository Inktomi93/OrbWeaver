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

## Probe result: the Biome premise is refuted

Biome 2.5.1, zod 4.4.3. The probe used two untracked files, deleted afterwards, inside the repository so
that zod resolves exactly as it does for tracked code:

- `cbtoolsmallprobe/index.ts` under `packages/contracts/src/`. Exhaustive switches over `z.infer` of a `z.enum` of
  the ingest-phase tuple and of the `RegexAttachScope`-shaped `z.discriminatedUnion` (its members carry
  `typeIdSchema`). A tuple-derived alias and a declared union sit in the same file as controls.
- `cbtoolsmall-probe.ts` under `packages/server/src/`. The same two `z.infer` switches, importing the types
  cross-package from `@orb/contracts/cbtoolsmallprobe`.

Command: `pnpm exec biome lint <both files>`. Every `case` of every `z.infer` switch reported
`lint/suspicious/noUnnecessaryConditions` "This case is unreachable": 9 in the contracts file and 9 in the
server file. The tuple-derived and declared-union switches reported nothing.

The audit probe that recorded "passed" was wrong on two counts. It ran under `/tmp`, where `zod` does not
resolve. It also checked `lint/correctness/noUnreachable`, which is not the rule that fires.

The Biome rationale therefore stays in `databank/index.ts` and `regex/index.ts`, and the true mechanism is
restored in `tag/index.ts`. All three comments now say that `satisfies` checks one direction only and that
the `zod-output-twin-parity` gate proves exact parity. `chat/bus.ts` also makes Biome claims, but they are
about `Omit`/`Exclude`/`Extract`, not `z.infer`, so they fall outside this item.

## Evidence

Filled at landing: what ran and where its output is.
