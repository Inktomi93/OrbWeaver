---
kind: work
status: open
updated: 2026-11-24
priority: P2
area: tooling
plan: unwired-code
---

# Mutually exclusive optional fields are discriminated unions

## What

pnpm brand-flow's optional-pair inventory lists optional field groups whose fields no construction, test or fallback reader sets together; most groups carry no co-set evidence at all. Many carry writes the scan cannot resolve, and some are library types such as MutationObserverInit. orb/no-optional-alternatives enforces only proven alternatives.

## Why

Law 5 (composites make wrong use unwritable): fields that are never set together, written as independent optionals, let a caller set both or neither and the compiler cannot refuse it.

## Done when

The groups are split into proven alternatives, groups blocked by unresolved writes (each write named) and library or deliberate shapes (each with a reason); every proven group is a discriminated union through the exclusive-optional-slots codemod; unresolved writes that hide a real group are fixed in the scan; orb/no-optional-alternatives stays at zero.

## Evidence

Filled at landing: what ran and where its output is.
