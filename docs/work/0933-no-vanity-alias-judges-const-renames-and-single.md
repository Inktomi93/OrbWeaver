---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: tooling
lane: wt/agent-a718808369cb361a5
plan: test-mirror
---

# no-vanity-alias judges const renames and single type aliases

## What

pnpm ast aliases lists const renames (const Y = X) and single type aliases (type Y = X), and both now classify through tooling/src/floor/code-facts/rename-bindings.ts renameBindingOf, but no-vanity-alias judges only import, export and double type alias renames. Add the two spellings to the gate, baseline the hits it surfaces as waivers under 906 with the budget row at the measured count.

## Why

The law bans one symbol under two names; the gate enforces less than the law claims for two spellings the detector already recognises.

## Done when

Both spellings flag with planted controls, the surfaced hits are baselined, and the budget row matches.

## Evidence

Filled at landing: what ran and where its output is.
