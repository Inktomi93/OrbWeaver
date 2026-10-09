---
kind: bug
status: open
updated: 2026-10-08
priority: P1
area: testing
---

# Diagnose hosted Select first-open blocking

## What

Attribute the native first-open blocking failure and repair a demonstrated cause without widening performance budgets.

## Why

A retry can conceal first-open work that exceeds the required blocking budget.

## Done when

Native evidence distinguishes fixture contention from application work; any repair preserves cold first-open semantics and the existing budgets.

## Evidence

The ordinary first-open budget fails in hosted and local native runs. Select product source and performance budgets remain unchanged.

Profiler-on and trace-only diagnostics execute the same cold render and compilation path with different observed durations. These observations do not establish the original failure's cause.

The original-cohort capture records a native budget failure with matching emitted sources. The failing focus-origin task contains cold React work and compilation. Its intra-React attribution remains unresolved.

Source-complete sampled diagnostics identify Select render and commit work without proving a product defect.

An opt-in stock-esbuild optimization diagnostic compares cold openings against the ordinary CT build. Ordinary CT configuration and qualification budgets remain unchanged.

The selected diagnostic does not reproduce the native failure. Its component registry differs from the failing capture. Application-source attribution remains unresolved; investigation stays open.

Native trace finalization retains its referenced emitted bundles and source maps before CT lease cleanup without changing measurement. Native and deterministic file tests prove retention.

The deadline-diagnostics case in [hosted qualification](https://github.com/Inktomi93/OrbWeaver/actions/runs/37855732691) exceeds the cold-opening budget before diagnostic transport starts. Artifact `reports-ct-4` records 239ms raw blocking, 140ms initialization credit and 99ms budgeted blocking against 50ms.

Replaying the verdict reader with original and substituted source URLs preserves the failed and successful outcomes. Diagnostic transport does not explain the opening excess.

An exact-bundle excerpt identifies the generic Base UI timer wrapper, not its invoked callback. The ordinary retry trace lacks bundle bodies, source maps and timer-install records; callback attribution remains unresolved.

The normal lifecycle case in [qualification](https://github.com/Inktomi93/OrbWeaver/actions/runs/37861729329) has distinct failures. A 93ms frame contains manufactured lifecycle work. Another attempt retains 317ms budgeted timer blocking and an 83ms input frame before that work.

The installed-source analysis narrows eligible callbacks to the Select focus timer that publishes `forceMount` and the modal scroll-lock timer. It excludes item-aligned positioning, scroll arrows and unrelated hover timers. Runtime callback identity and cost remain unproven.

Separating manufactured lifecycle work from unplanted performance measurement and acquiring bounded trace evidence needs an explicit scope ruling. Existing assertions and budgets remain unchanged.
