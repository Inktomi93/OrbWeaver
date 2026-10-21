---
kind: bug
status: doing
updated: 2026-10-21
priority: P2
area: plugins
lane: codex/legacy-turn-rpg-1193
plan: test-foundation
---

# Sandbox collection drops plugin tool display and replay metadata

## What

The plugin SDK and membrane accept displayName and replayHistory on tools.register. Sandbox.create collectTool reconstructs each registration without those fields. collectedTools therefore supplies a truncated registration to the activation registrar and tool execution cannot retain the supplied metadata. The real image plugin declares replayHistory:true, but its persisted native tool record omits it.

## Why

A valid guest declaration disappears between validation and activation. The composed continuation review exposed the missing field; changing its unrelated preservation assertion does not repair this registration contract.

## Done when

Preserve validated tool metadata through sandbox collection, registration and actual tool execution. A real installed plugin regression fails before the fix and proves supplied displayName and both replayHistory values survive. Preserve the membrane's humanized display-name default; an omitted replayHistory stays omitted. Keep capability, handler ownership and teardown behavior unchanged without a new export or exception.

## Evidence

The registration loses metadata at `packages/server/src/infra/plugin-host/sandbox.ts:246`. The membrane supplies it through `toolDisplayMetadata`; the activation registrar and tool execution preserve fields that reach them. The primary worktree's completed run3413596 records a real plugin call without its declared replay flag. This is separate from the original continuation-preservation obligation.
