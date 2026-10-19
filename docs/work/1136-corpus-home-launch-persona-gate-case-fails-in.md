---
kind: bug
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a2f6cc226f4a38146
---

# corpus-home-launch persona-gate case fails in some CI corpus cells

## What

In CI run 39279178336 on main 97b639a30d, tests/e2e/corpus-home-launch.spec.ts 'a user who owns a persona never sees the first-run gate' fails all retries in corpus-desktop-document, corpus-desktop-hush, corpus-desktop-ripple and corpus-phone-hush, and passes in the other signed-in and every local cell. The desktop rail-foot button 'Playing as <persona>' (phone: the You tab) is not visible within the 5 s expect timeout. Not style-specific in an obvious way.

## Why

A smoke case that fails by cell is either a product race (the rail-foot name resolving late or never) or a test barrier that is not one; either hides the persona-gate regression it guards.

## Done when

The cause is found from the uploaded CI trace and a local reproduction: a product fix with the spec unchanged, or a correct barrier with the reason in the spec. The case passes in every corpus cell, with planted-red proof kept.

## Evidence

Filled at landing: what ran and where its output is.
