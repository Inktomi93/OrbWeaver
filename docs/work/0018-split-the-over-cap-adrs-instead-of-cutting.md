---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: docs
plan: doc-migration
---

# Split the over-cap ADRs instead of cutting their content

## What

Split each ADR that exceeds the 8 KiB cap into the separate decisions it holds. Each split-off decision
becomes its own ADR, minted with `pnpm doc new adr` and linked from the original. Alternatively, rule that
the cap is wrong for dense rulings and raise it. `pnpm check:agents` lists the over-cap files.

## Why

Squeezing a dense ADR under the cap dropped normative rules, parameter values and test pins. An
adversarial check found this twice. The prose cleanup therefore left those files at full length, and
their size finding stays red until they are split.

## Done when

`pnpm check:agents` shows no size-cap finding. Every rule, value and pin in the original ADRs still
appears in some ADR.

## Evidence

Filled at landing: what ran and where its output is.
