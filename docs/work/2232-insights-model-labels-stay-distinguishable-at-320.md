---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-acaf86636920912a1
plan: cross-surface-consistency
---

# Insights model labels stay distinguishable at 320

## What

The Generations by model labels now differ at desktop and 390, but at 320 they collide again: several Gemini preview models and several Claude models share one truncated label.

## Why

A chart whose labels read the same carries no information on the narrowest phone.

## Done when

Every model label is distinguishable at 320, with a CT cell at 320 on a corpus with several models from one provider. Source: acceptance part 3 report, 2171.

## Evidence

`BarList` widens a middle-ellipsized category column, up to 60 percent of the container, until every painted name differs (`packages/ui/src/charts/bar-list/option.ts`, `distinctMiddleBudgetPx`). `tests/client/features/stats/components/analytics-model-labels.ct.tsx` gained a 320 px regime and a set of preview builds from two providers (Gemini previews and dated Claude releases). It was red at 320 for that set and for the existing four-release set (an ambiguous label painted), and is green after: 9 passed, covering desktop, 390 and 320. The text equivalent still names every id whole.
