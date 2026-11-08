---
kind: bug
status: open
updated: 2026-11-08
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

Picker skeleton: tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx holds the skeleton box, the loaded box and the dialog within 1px (accepted in acceptance part 1; first-open residue is 2062).

Stepper: inline-height.ct.tsx passed because its max(box, ::before) probe hid the 42px box inside the bordered group. tests/client/components/setting-number-stepper.ct.tsx mounts a NumberField in the production SettingRowGroup and SettingTrackRow at a coarse pointer and asserts each stepper's own box reaches the touch-target token. Red on the old tree (box 42px under the token), green after the steppers take the input's negative block margin in packages/ui/src/primitives/number-field/variants.ts.

Plugin panel switch: tests/client/features/plugin/components/show-in-chat-switch.ct.tsx mounts the production installed-plugins section at 1440 and asserts the switch sits closer to its label text than the label is long. Red on the old tree (656px gap against a 230px label), green after plugin-row\.tsx renders ShowInChatSwitch through SettingRowGroup and SettingTrackRow. platform-plugin-presentation.suite.ct.tsx passes (11) on a quiet re-run; its first run under load 33 timed out four Atlas cases.

The design audit confirmation (`row-void` and `tap-target` clear) is the next ux-reviewer pass.
