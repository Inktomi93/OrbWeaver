---
kind: adr
status: active
updated: 2026-11-11
---

# A rate measurement on a loaded box is labelled, not withheld

## Context

A wall-clock budget written for a quiet box reads as a red on a loaded one, and a rate measured on a loaded box describes the box as much as the code. The same code has read different dropped-frame rates at different contention levels. A rate check that declined to report above the load boundary left every rate check without a number on a box that runs lanes and engines most of the day. ADR 0308 decides by hardware class whether a timing budget is a verdict at all. This ruling covers what a rate check does on a loaded box of any class.

## Decision

Above the load boundary a rate check still measures, reports its number and labels it `load-suspect`; it never withholds for load. The boundary is the quiet or contended boundary of `computeLoadFactor` in `tooling/src/floor/host/load-budget.ts`, not a second constant. A `load-suspect` number is never a verdict: no threshold judgement, no exit contribution, no problem row. `withheld` stays only for a run that produces no number, such as an unproven or software-rendered browser. Homes: `judgeMeasurementLoad` and `MEASUREMENT_DISPOSITIONS` in `tooling/src/floor/host/load-budget.ts`, `SNAP_ARM_STATES` in `tooling/src/snap/contract/run-facts.ts`, and `tests/tooling/floor/host/load-budget.test.ts`, which plants a loaded box and a quiet box.

## Consequences

A new rate check calls `judgeRateLoad`, or `annotateRateLoad` in a component test, and prints the label beside its number. It never skips or withholds for load, and it never promotes a `load-suspect` number. A reader re-runs on a quiet tree before treating the number as a verdict. A wall-clock budget is scaled by the box factor under an absolute ceiling and is not a rate; a kill from that budget is a tool exit, never a verdict. `judgeMeasurementLoad` reads loadavg alone, because the cgroup throttle counters accumulate over a session and would label every rate check in a fenced lane.

## Alternatives rejected

Withhold the number above the boundary: it made every rate check unavailable on a box that is loaded most of the day, and the owner ruled against it. Scale a rate like a wall clock: load does not scale a rate, it destroys it. Fold the throttle counters into the rate judge: they describe the session, not the measurement, and would label every rate check in a fenced lane.
