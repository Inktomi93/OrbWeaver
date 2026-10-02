---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: kit
---

# Remove the unused macro diagnostic wrapper

## What

Remove the test-only validateMacroArgs wrapper and its barrel export. Preserve checkMacroArgs, macroArgDiagnostics and the live evaluator behavior.

## Why

The mounted product uses the validation and diagnostic functions directly. The wrapper only has test callers and adds an unused public entry point.

## Done when

Confirm the complete caller set with identity-aware AST and literal searches. Remove the wrapper, update its comments and preserve numeric-argument diagnostic assertions against the live engine. Run affected macro validation and cache-safety tests. Record evidence in the launch AST audit.

## Evidence

The caller census in `reports/launch-ast-audit-2026-10-01/callers-validateMacroArgs.json` resolves only test calls. The independent literal sweep is `reports/launch-ast-audit-2026-10-01/testonly-literal-crosscheck.txt`. Runtime validation lives in `packages/kit/src/macro/evaluator.ts`; preserve its diagnostics.
