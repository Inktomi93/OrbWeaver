---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-ac7632a404161150a
---

# Prove or correct the focus-on-arrival check that the accessibility statement names

## What

`ACCESSIBILITY.md` says a build check fails any new screen that skips moving focus into an opening view. The review found focus tests and Base UI focus props but no check under that name. Source: `docs/work/codebase-review/units/root-docs.md`.

## Why

A public accessibility claim must name a check that exists.

## Done when

The item names the check with its path, or `ACCESSIBILITY.md` states what the tests cover.

## Evidence

Filled at landing: what ran and where its output is.
