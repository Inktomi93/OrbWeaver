---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: main
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

Picker skeleton: tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx holds the skeleton box, the loaded box and the dialog within 1px on a desktop, a coarse portrait and two landscape phones, with and without saved rosters, at 100% and 300% text (see 2062 for the first-open residue). Plugin panel switch and the omnibox floor: platform-plugin-presentation.suite.ct.tsx and corpus-search-controls.ct.tsx pass on this tip. Appearance stepper: tests/ui/primitives/number-field/inline-height.ct.tsx asserts the input and both steppers reach the touch-target token under a coarse pointer. The done line also needs the design audit to report none of the three, and the audit was not run in this lane (no snap stack): the item stays open for the acceptance pass.
