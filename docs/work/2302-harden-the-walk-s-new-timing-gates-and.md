---
kind: tooling
status: open
updated: 2026-11-09
priority: P3
area: tests
plan: surface-walk
---

# Harden the walk's new timing gates and the chat wheel settle

## What

The held-swap and disclosure-growth controls in surface-measurement.ct.tsx release on fixed frame and transition windows, so a loaded box can turn them falsely red. The scrollViewport settle wait in surface-chat.ts has no failure message, and its two agreeing reads can match before a scroll starts if the main thread stalls right after the wheel. Held media waits on running route handlers but not on a request that arrives after that wait begins. The settling gate ignores scroll-driven animations only because Chromium reports their end time as a percentage, and nothing states or asserts that.

## Why

Each gap fails as a bare timeout or a false red under load and costs a triage round to tell apart from a product defect.

## Done when

The held swap releases on a signal the test sends after the checkpoint reads; the settle poll carries a named message and first waits for the position to move from its pre-wheel value; held media removes its route with unrouteAll behavior wait; the scroll-driven exclusion is an explicit check with a comment saying why.

## Evidence

Filled at landing: what ran and where its output is.
