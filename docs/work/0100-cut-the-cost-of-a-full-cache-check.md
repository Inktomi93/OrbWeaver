---
kind: work
status: done
updated: 2026-09-23
priority: P3
area: tooling
evidence: ee069b6af
---

# Cut the cost of a full cache check run

## What

A full pnpm cache:check costs about $1 (OpenRouter billed $0.48, direct about the same). The prefix must exceed the 12k calibration so the read floor can judge the narrator case.

## Why

A cheaper run gets run more often.

## Done when

A measured cost reduction (e.g. a per-case floor, or a smaller calibration) with every case still judged and the planted regression still red.

## Evidence

Cases that share a room now share one chat. Each room writes its long prefix once, with a committed user line and one generate, instead of sending it uncached and then writing it for every case. The prefix is 1.25 times the calibration prefix instead of 1.5, which still keeps the largest healthy loss (the narrator cue) inside the floor at a ratio of 0.985. On OpenRouter a full run fell from $0.4765 to $0.3427, with direct at the same token counts. Every case is still judged: the group case keeps its opening call in the judged sequence, so the first round boundary still reads 0 on main. The planted regression (the OpenRouter content-part marker stripped) still fails solo and continue at a ratio of 0.000.
