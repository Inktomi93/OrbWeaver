---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: kit
---

# A template brace beside a splice slot cannot make live the spliced value

## What

The macro neutralizer leaves no adjacent brace pair inside a value. A template that writes a brace directly against a splice slot can still form a live opener across the boundary: the user-macro argument splice in `packages/kit/src/macro/user-macros.ts` and the guided base-text replace in `packages/kit/src/guided/index.ts`. A security review probed both: a three-brace slot fed a value that starts with one brace evaluates and writes a variable. No shipped template holds a three-brace slot.

## Why

A user-written macro template or a guided template with a brace against its slot gives the spliced text macro power the neutralizer is there to remove.

## Done when

Each splice puts the zero-width space before a value that starts with an opening brace and after one that ends with a closing brace, with a kit case for each splice that fails without it.

## Evidence

Filled at landing: what ran and where its output is.
