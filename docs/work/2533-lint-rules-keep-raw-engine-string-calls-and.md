---
kind: tooling
status: open
updated: 2026-11-11
priority: P2
area: security
plan: test-enforcement
---

# Lint rules keep raw engine string calls and argument coercion inside the plugin marshal

## What

The plugin boundary work established two rules by review alone. A string crosses the boundary only through the one marshal, never through the engine binding's own string read or write, which cut at a NUL. A host function never coerces a guest argument with String or a template; it takes it through the membrane's string intake. A native ESLint no-restricted-syntax entry scoped to packages/server/src/infra/plugin-host can refuse the binding's string calls outside the marshal file and a String call on an argument array element outside the intake helper.

## Why

Each of these was the door a size or NUL check was bypassed through. The next host function added to the membrane is written by an author who has not read the security reviews.

## Done when

Both entries are mounted for the plugin-host directory with the marshal and the intake helper as their exact-path homes, each with a planted test. The remaining raw string reads the security review listed are routed through the marshal or removed first, so the rule lands at zero.

## Evidence

Filled at landing: what ran and where its output is.
