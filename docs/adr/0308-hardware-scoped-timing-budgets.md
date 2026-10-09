---
kind: adr
status: active
updated: 2026-10-09
---

# Timing budgets qualify only on a named hardware class

## Context

Shared hardware changes elapsed measurements independently of application behavior. Timing evidence needs an explicit qualification class.

## Decision

A timing budget is a verdict only on a named hardware class with the stable-timing capability. Hosted GitHub runners and unnamed hardware record timing measurements and over-budget results without asserting them. Behavioral assertions and measurement integrity remain blocking everywhere. Test-kind metadata and the shared timing policy own this distinction. The named owner-box class asserts budgets only in trusted main pushes and schedules; pull requests never execute on that self-hosted class. Select cold-open measurements do not require callback attribution or a special timing tolerance.

## Consequences

Reports retain measured values, hardware class and whether timing qualified. Application CI can qualify behavior without granting timing qualification. Timing qualification remains independent and must not report a skipped or unavailable measurement as a pass.

## Alternatives rejected

Raising a Select tolerance obscures the measurement class. Repeated callback attribution cannot establish stable hardware. A dispatch flag does not identify hardware capability.
