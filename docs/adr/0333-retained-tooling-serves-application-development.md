---
kind: adr
status: active
updated: 2026-10-21
---

# Retained tooling serves application development

## Context

Tooling maintenance must fit contributor hardware and the available development budget.

## Decision

Delete mutation tooling, custom AST inspection, the codemod platform, review-mirror and the custom Verify framework. Keep maintained native lint rules and self-contained custom ESLint or Stylelint rules. Remove lint dependencies on custom analysis infrastructure. Remove their dedicated tests, dependencies, patches, commands and board obligations together. Delete custom waiver markers, baseline ledgers, probes, agent-sync, tool-guard and replay machinery, and generated reports. Maintain agent definitions directly. Keep the document CLI for authoring and organizing work documents. Remove proof-marker certification, whole-repository checker replay and checker self-policing requirements. Keep native world-purity boundaries and the file-scoped Biome edit hook. Keep Snap, design, motion, CPU capture, application development commands, production test composition and behavioral regression coverage. Keep shared infrastructure only where a retained consumer needs it. Compiler, dependency and retained lint checks run directly without Verify, check aliases or equivalent replacements for removed analysis reports. Use ordinary targeted tests for useful bounded assertions; do not build another policy framework.

## Consequences

Tooling removal deliberately reduces automated architectural and tool-certification coverage. Production authorization, validation, persistence and application behavior are unchanged. Legacy test sources live outside the repository as replacement references, not CI or compiler populations. Native compiler checks include maintained type assertions; Vitest runs runtime tests. Closed work stays in Git history rather than an archive or parked implementation queue. Retained tools still require behavioral checks for changed behavior.

## Alternatives rejected

Moving every removed policy into another runner preserves the same maintenance obligation. Rebuilding the tooling platform is outside the application test rebuild.
