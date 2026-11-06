---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Closeout 4 P3 controls: picker skeleton height jump, plugin panel switch gap, 42px tap targets

## What

Fix three control findings from the closeout 4 side-eye review. The picker skeleton is shorter than the loaded list and the dialog jumps and re-centers. The plugin panel switch sits far from its label on desktop. Two controls have 42px tap targets: the Corpus omnibox and the Appearance number stepper on a phone.

## Why

The review measured each of these, and the design audit flags the gap and the tap targets. The Evidence names the source report and its run ids.

## Done when

The skeleton reserves the height of the loaded list, the switch sits beside its label, and both tap targets meet the touch floor. The design audit reports none of the three.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.
