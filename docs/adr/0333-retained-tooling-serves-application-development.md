---
kind: adr
status: active
updated: 2026-11-07
supersedes: docs/adr/0309-hosted-mutation-execution.md
---

# Retained tooling serves application development

## Context

Tooling maintenance must fit contributor hardware and the available development budget.

## Decision

Delete the mutation gate and mutation-probe, custom AST inspection, the codemod platform, review-mirror and the custom Verify framework. Keep maintained native lint rules and self-contained custom ESLint or Stylelint rules. Remove lint dependencies on custom analysis infrastructure. Remove their dedicated tests, dependencies, patches, commands and board obligations together. Delete custom waiver markers, baseline ledgers, probes, agent-sync, tool-guard and replay machinery, and generated reports. Maintain agent definitions directly. Keep the document CLI for authoring and organizing work documents. Remove proof-marker certification, whole-repository checker replay and checker self-policing requirements. Keep native world-purity boundaries and the file-scoped Biome edit hook. Keep Snap, design, motion, CPU capture, application development commands, production test composition and behavioral regression coverage. Keep shared infrastructure only where a retained consumer needs it. Compiler, dependency and retained lint checks run directly without Verify, check aliases or equivalent replacements for removed analysis reports. Use ordinary targeted tests for useful bounded assertions; do not build another policy framework.

Mutation testing is a tool a lane runs on named files (this supersedes D309): `pnpm test:mutation <file...>` runs Stryker with the ARID ignorer and the classic TypeScript checker over those files and their mirrored tests or the tests it is given, in the one compiler world that holds them. It holds no target list, score or threshold and never runs as a gate, in CI or in pre-push. It takes exact files, never a pattern. One sandbox runs at a time on a machine, sized by half the shared Vitest worker cap, and each run removes its own. Static mutants run, because module-level tables and schemas hold logic. The ignorer drops error prose, because no test may pin copy, and keeps codes, keys and modes. Homes are `stryker.config.ts`, `vitest.stryker.config.ts`, `tooling/src/floor/testing/stryker-config.ts`, `tooling/src/mutation-run/`, `tooling/src/mutation-arid/` and the Stryker core patch.

A sealed vendor surface needs no committed surface manifest (this supersedes D128): Base UI's published types are the surface record, and a version bump is reviewed against them.

## Consequences

Tooling removal deliberately reduces automated architectural and tool-certification coverage. Production authorization, validation, persistence and application behavior are unchanged. Legacy test sources live outside the repository as replacement references, not CI or compiler populations. Native compiler checks include maintained type assertions; Vitest runs runtime tests. Closed work stays in Git history rather than an archive or parked implementation queue. Retained tools still require behavioral checks for changed behavior. A Stryker bump owes the patch re-derived and a planted control on a target with several test files: a weakened test must turn a killed mutant into a survivor, and a hand-planted survivor must match the report.

## Alternatives rejected

Moving every removed policy into another runner preserves the same maintenance obligation. Rebuilding the tooling platform is outside the application test rebuild. Hand-written mutation scripts differ per lane and prove only what the author thought to plant. A mutation gate cannot finish within a hosted run, and a score measures the target list as much as the tests.
