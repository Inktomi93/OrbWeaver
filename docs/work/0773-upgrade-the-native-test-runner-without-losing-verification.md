---
kind: tooling
status: doing
updated: 2026-10-07
priority: P2
area: tooling
lane: codex/ci-major-compat
---

# Upgrade the native test runner without losing verification evidence

## What

Upgrade the parser and native test runner catalogs. Adapt native configuration observation and keep supervisor, selector and mutation-runner evidence intact.

## Why

The major runner changes its native configuration result and refusal behavior. The current observation seam cannot read it.

## Done when

Native configuration, refusal, supervised runner and parser controls pass. Compiler, coverage and focused mutation-runner checks pass; shared verification and required hosted checks pass before merge.

## Evidence

Native configuration observation, selector refusals, supervised runner and parser controls pass. Matcher behavior and tag type assertions pass. Invalid selectors remain refused instead of producing empty evidence.

Affected compiler programs, scoped lint and formatting pass. Native coverage observes statements and both branch outcomes. A focused temporary mutation profile kills its actual mutant through the native adapter; production checker and threshold settings remain unchanged.

Supervisor failures retain child output for diagnosis. An earlier nested child exit has no preserved cause and is not claimed as a runtime fix. Completed shared static checks pass except the recorded candidate-index and timeout results. The staged showcase check passes; the timed-out suites pass at one worker without changed deadlines. Unchanged completed tooling cases remain valid. Hosted checks remain required before merge.
