---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: surface-walk
---

# ui-facts gaps: class strings in differently named constants, a raw-wire chip column, the duplicate variant report

## What

ui-facts reads a class string held in a constant however it is named: a className, a \*ClassName prop, a cn or tv call, or a \*Class constant names it, in the same file or through a relative import. The chip cohort has a wire column that says how a shown expression gets its words (literal, lookup, call, template, bare). One variant report remains: the declared-variant reader moved into variants.ts and now opens axes built from shared scales (a const, a spread, a call over one), and lists the axes it could not open.

## Why

The census drives the unused-variant deletes, so a class string, a chip or a declared value it cannot see is a wrong answer. A constant such as PLATE_INSET in message-box.tsx, not named \*Class, was invisible. A raw wire value in a chip was marked unmeasurable. adoption.ts counted variant uses a second way, literals only, and disagreed with the composition report. Axes written as TONE_ARMS or CONTROL_SIZE were not declared at all, so the most used axes had no census.

## Done when

pnpm ui-facts reports class strings from constants that a class context reads, one site per string. The copy:chip cohort lists wire per chip and names the bare ones. The report has one variant section, uncapped, and states the declared axes it could not read (none today). tests/tooling/ui-facts/ui-facts.test.ts and composition.test.ts assert each case. Folded readers compared: the old adoption.ts count (literals only, spreads ignored) is a subset of the composition report, so it was deleted.

## Evidence

Filled at landing: what ran and where its output is.
