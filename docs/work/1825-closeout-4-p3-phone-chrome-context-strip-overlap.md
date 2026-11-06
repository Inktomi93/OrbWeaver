---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Closeout 4 P3 phone chrome: context strip overlap, twin kebabs, truncated screen titles, Refinery short landscape scroll

## What

Fix four phone chrome findings from the closeout 4 side-eye review. The chat context strip overlaps the tab control. The phone character sheet has two adjacent kebab menus. Screen titles truncate when actions share the bar. Refinery in short landscape opens scrolled past its top.

## Why

The review measured each of these on screen. The Evidence names the source report and its run ids.

## Done when

Each finding is fixed with a component test, or answered with a cited reason, and a rendered pass at the phone sizes shows none of them.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.
