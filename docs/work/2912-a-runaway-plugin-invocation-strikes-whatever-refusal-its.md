---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: server
---

# A runaway plugin invocation strikes whatever refusal its command met

## What

A command that met a host refusal and then overran its CPU window is excused, because the interrupt reaches the app as a guest error and the recorded refusal covers it. D348 states both that a command fails as its refusal and that a runaway invocation takes the strike. Give the CPU guard in `packages/server/src/infra/plugin-host/cpu-guard.ts` a host-set mark for an interrupted invocation, as the settlement wall has, and make D348 state one rule.

## Why

The decision record contradicts itself, and a plugin can burn its CPU window on each command without a strike. The broker's span bound limits the cost, so the risk is low.

## Done when

A server case shows a command that meets a refusal and then overruns its CPU window takes a strike, a control that throws after a refusal does not, and D348 holds one statement of the rule.

## Evidence

Filled at landing: what ran and where its output is.
