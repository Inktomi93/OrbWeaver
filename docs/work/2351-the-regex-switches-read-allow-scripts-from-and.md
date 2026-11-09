---
kind: work
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-aed439736e8f3a94a
plan: cross-surface-consistency
---

# The regex switches read Allow scripts from and Enabled everywhere

## What

Ruling (claude-b under delegation, in the <setting>: <item> grammar): the chat regex tier lever reads Allow scripts from: Everywhere and Allow scripts from: This chat, and the per-script switch reads Enabled everywhere: <script>. Today they read In this chat: Everywhere and Everywhere: <script>, from regexTierAllowedSwitchName and regexScriptEverywhereSwitchName in regex-section-model.ts.

## Why

A setting named after a scope reads as nonsense once the scope becomes the item.

## Done when

Both builders return the ruled names, the regex CTs find each switch by the new name and assert aria-checked, and no test spells the old names.

## Evidence

Filled at landing: what ran and where its output is.
