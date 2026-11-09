---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a3238f16751f90318
plan: cross-surface-consistency
---

# Button, Toggle, Badge, Tab and Kbd labels stay on one line and outgrow a phone column at enlarged text

## What

The label primitives set `whitespace-nowrap` with an auto minimum width: `packages/ui/src/primitives/button/variants.ts:48`, `packages/ui/src/primitives/toggle/variants.ts:21`, `packages/ui/src/primitives/badge/variants.ts:10`, `packages/ui/src/primitives/tabs/variants.ts:24` and the command branch at `packages/ui/src/primitives/kbd/variants.ts:21`. A long label is wider than the column, so `config-content` scrolls sideways or a clipping parent cuts the control. Examples: the Imagine mode toggles at `packages/client/src/features/imagery/components/imagine-body.tsx:154`, the character Look tab actions at `packages/client/src/features/character/components/character-appearance-tab.tsx:205`, the automation rule card actions, the databank source picker, the Appearance sizing rows and the chat context section actions. Shows at phone 200%, phone 300% text on: Characters independent look; Characters independent look-recovery; Characters independent relations; Characters independent source-context; Chat existing engaged game room; Chat existing group room; Chat library and primary composer; Chat primary Context; Config independent category about; Config independent category admin; Config independent category appearance; Config independent category automation; Config independent category backup; Config independent category chat-behavior; Config independent category connections; Config independent category personas; Config independent category plugins; Config independent category regex; Config independent category rosterPreset; Config independent category workloads; Config independent category worldInfo; Config reversible settings; Rail independent databank; Rail independent home; Rail independent presets; Refinery disposable stage execution and versions.

## Why

A label that cannot wrap is wider than a phone column at enlarged text, so the user cannot see or press the whole control.

## Done when

Labels wrap or their rows reflow, chosen once in `@orb/ui`, not per call site. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: composer-chat-*, config-about-*, config-admin-*, config-appearance-*, config-automation-*, config-backup-*, config-chat-*, config-connections-*, config-library-setting-changed, config-persona-original-editor, config-personas-*, config-plugins-*, config-regex-*, config-rosterPreset-*, config-workloads-*, config-world-*, config-worldInfo-*, context-chat-*, copy-context-tabs-*-*, databank-add-*, home-native-*, look-background-*, look-failed-save-draft, look-keyboard-save-recovered, look-type-shape, original-context-tabs-*-*, presets-preset-*-view-*-disclosure-*, refinery-execution-\*.

## Evidence

Filled at landing: what ran and where its output is.
