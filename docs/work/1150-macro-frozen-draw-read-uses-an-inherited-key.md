---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# Macro frozen-draw read uses an inherited-key lookup

## What

packages/kit/src/macro/user-macros.ts line 231 reads opts.frozenDraws?.\[input.name], and MACRO_NAME_RE admits names like constructor and toString, so a macro name can read an inherited Object.prototype member. Same class as the sites fixed under 1118. Security: route to security-executor.

## Why

A user-authored macro name reaching an inherited member is a prototype-read path through card and chat content.

## Done when

The read goes through readVarKey (own keys only) with a red-first test for constructor and toString, and the macro tests pass.

## Evidence

Filled at landing: what ran and where its output is.

The security review found the same inherited-key read at packages/kit/src/macro/user-macros.ts lines 258, 324 and 332; fix all four sites together.
