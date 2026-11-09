---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a47d381f0dc43d6ea
plan: cross-surface-consistency
---

# Item enable switches use one stable name grammar

## What

Item enable switches name themselves three ways: Turn X off (plugins, flips with state), Enabled: name (Admin users) and Allow background work on name (Connections). Ruling: one stable name that names the item, from action-names.ts, with aria-checked carrying the state.

## Why

A switch name that changes with its state reads as an action, and three grammars for one control break the family.

## Done when

The plugin, Admin user and Connections item switches read one grammar from one home, itemSwitchName in packages/client/src/lib/item-switch-names.ts, a CT finds each by its stable name across two items and asserts aria-checked, and the plugin row comment states the ruling. Source: acceptance part 4 report A SET-R1.

## Evidence

Plugins read Enabled: plugin through enablePluginLabel, Admin users read Enabled: handle through userEnabledFieldName, and the Connections list row, editor and Model-roles repair share allowBackgroundSwitchName. tests/client/features/user-admin/components/admin-user-enabled-switch.ct.tsx and tests/client/features/credentials/components/connections-background-switch.ct.tsx find two items in opposite states by stable name and assert aria-checked across a flip. tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx finds two plugins by stable name and asserts aria-checked, and plugin-macro-browser.ct.tsx flips one plugin under one name. tests/e2e/corpus-libraries.spec.ts drives the new name, not run here. Follow-up, other item switches with their own grammar: packages/client/src/features/automation/components/rule-row\.tsx:284 Enable rule, packages/client/src/features/workloads/components/schedules-section.tsx:176 Enable kind schedule, packages/client/src/features/preset/components/prompt-assembly/section-row\.tsx:159 and section-drill-in.tsx:194 name enabled, packages/client/src/features/chat/components/regex-tier-row\.tsx:106 and regex-on-screen-group.tsx:98 name: everywhere, packages/client/src/features/chat/components/regex-section.tsx:278 label: in this chat, packages/client/src/features/plugin/components/plugin-row\.tsx:72 showInChatLabel.
