---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: tests
lane: wt/agent-a610037145affe8fb
plan: test-mirror
---

# CT harness mints an empty chat settings sections registry

## What

tests/support/browser/ct-data-providers.tsx (near line 153) creates createContributorRegistry("chat-settings-sections", \[]) and feeds it to the real chats section and CtChatContributorSectionRegistry, while production's list in packages/client/src/compose/contributors.ts has three sections (automationRulesSection, pluginSnippetConsoleSection, pluginChatSettingsSection) and tests/support/browser/ct-door.ts already re-exports it. The ct-config-mirror-parity gate (tooling/src/verify/gates/ct-config-mirror-parity.ts, FAMILIES) omits chatSettingsSections, so the hand mint passes. Every shell or chat CT renders the This chat tab without those sections.

## Why

Item 889's done line requires every CT registry list to derive from or be gated against production; this one does neither, and the gate's own message forbids re-listing a door registry.

## Done when

The harness uses the door export, the gate's families include chatSettingsSections and flag a hand mint, and the affected CTs are fed and green.

## Evidence

Filled at landing: what ran and where its output is.
