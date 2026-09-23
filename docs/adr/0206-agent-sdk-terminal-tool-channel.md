---
kind: adr
status: active
updated: 2026-09-23
---

# The agent-sdk wire gets a terminal-tool channel for folded extraction

## Context

Split off [ADR 0112](0112-the-hosted-extraction-fold-amends-d108-s-delivery.md), whose agent-sdk terminal-channel amendment pushed it over the 8 KiB ADR cap. The SDK has no raw `tools[]`, so [ADR 0112](0112-the-hosted-extraction-fold-amends-d108-s-delivery.md)'s known-consequence gap left every folded room on that wire running the loud fallback round.

## Decision

**\[AMENDED, `314a37c9` — THE AGENT-SDK TERMINAL CHANNEL IS BUILT]:** this known-consequence clause is CLOSED — both Claude-runtime skins now co-emit prose + state in ONE call. Mechanism (the SDK has no raw `tools[]`): DECLARE via an in-process MCP mount (`createSdkMcpServer`; projected JSON Schema lifted back through the ONE `@orb/kit/json-schema` `liftJsonSchema`, which gained `anyOf`→union) · STOP via a `PreToolUse` hook returning `{continue:false}` + hook-deny → the runtime's `hook_stopped` path (the tool never runs, no tool_result feeds back; `defer` REJECTED — solo-only, and a folded beat calls several planes) · CAPTURE off the assistant frame's `tool_use` blocks, mapped to the same shape the openrouter runner reports. `attachTerminalTools` lost its `api !== "agent-sdk"` source branch — eligibility is purely `coEmitsProseWithTools`; only DELIVERY splits by wire (mirroring `attachTools`). Guard rails: `maxTurns` floors at 2 on a terminal turn (a hook miss costs a CALL, never a BEAT — the (2b) rule); an unliftable schema mounts NOTHING, loud (`provider.terminal_tools {mounted:false}`) → the `null` channel → the same fallback round; the terminal denial is exempted from the `permission_leak` tripwire (it IS the mechanism); option fragments MERGE (`mergeMountedOptions` — a spread would drop the dynamic-context hook). The mechanism is read off the BUNDLED `claude` binary — RE-VERIFY on every SDK bump. Remaining review: one live folded turn on a Claude connection (wire capture `terminalToolsMounted:true` + `rpg.extraction.path` `fallbackReason:null`).

## Consequences

Both Claude-runtime skins co-emit prose and state in one call. `attachTerminalTools` eligibility is purely `coEmitsProseWithTools`; only delivery splits by wire. Remaining review: one live folded turn on a Claude connection, wire capture `terminalToolsMounted:true` and `rpg.extraction.path` `fallbackReason:null`.

## Alternatives rejected

Route the terminal call through `defer` (rejected: solo-only, and a folded beat calls several planes).
