---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: surface-walk
---

# Evidence walk: design audit populations stay incomplete on quiet state and backdrops

## What

Across the three evidence runs (surface-Nn5cKU, surface-q297LL, surface-2sWzKu) the design audit reports incomplete populations: quiet-state unmatchedOn, unmatchedOff and unresolved on switch roots, checkbox roots, setting rows and the theme collection; contrast, gray-on-color and border-contrast with unresolvedBackdrop or paint-layer-over-base; selection-idiom unmatchedSelected. Those subjects are withheld from judgement. In the desktop evidence walk the dominant withheld reason is unreadCover, on contrast, gray-on-color, inactive-control-legibility and text-over-art.

## Why

A withheld population is neither clean nor failing, so the rules it feeds cannot certify a surface.

## Done when

Each incomplete population either resolves to judged subjects through the public pixel pass or a declared state attribute, or carries a cited reason it cannot, and the evidence runs show the remaining withheld subjects by reason.

## Evidence

Surface walk of the owner-db clone, desktop and `--mobile`, `pnpm snap / --isolated --stage-db <clone> --goto <surface> --design-audit` over every rail section, every Config group and an opened chat. Contrast, gray-on-color, text-over-art and inactive-control-legibility judge every candidate on every surface: nothing is withheld, so unreadCover no longer appears. Remaining withheld subjects, by reason, desktop run slots: quiet-state unmatchedOn on Config personas `reports/runs/snap/agent-a8a76b60ece6b02c7-214811-2026-11-27T17-32-24-793Z`, workloads `reports/runs/snap/agent-a8a76b60ece6b02c7-234756-2026-11-27T17-36-06-946Z`, backup `reports/runs/snap/agent-a8a76b60ece6b02c7-239368-2026-11-27T17-37-16-417Z`, admin `reports/runs/snap/agent-a8a76b60ece6b02c7-254269-2026-11-27T17-40-46-148Z`, plugins `reports/runs/snap/agent-a8a76b60ece6b02c7-278421-2026-11-27T17-46-33-161Z`; quiet-state unmatchedOff on Corpus `reports/runs/snap/agent-a8a76b60ece6b02c7-160983-2026-11-27T17-24-30-831Z`; selection-idiom unmatchedSelected on workloads, backup and admin; repeated-container-text containerPastScanBound on Refinery `reports/runs/snap/agent-a8a76b60ece6b02c7-206957-2026-11-27T17-31-02-326Z` (desktop only; mobile completes). Cited reasons: a quiet-state cohort with only ON or only OFF members at rest has no twin to rank, and `tooling/src/ui-audit/ops/walker/census-region.ts` withholds a one-sided cohort that holds a real state carrier because the audit is read-only and cannot drive a twin; selection-idiom unmatchedSelected is a bulk-default group where every member starts chosen, and the remedy is printed by `WITHHELD_REMEDIES` in `tooling/src/ui-audit/lib/population.ts`; containerPastScanBound is the walker's scan cap named in `tooling/src/ui-audit/ops/walker/census-quality.ts`.
