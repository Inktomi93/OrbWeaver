---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: plugins
---

# A refused plugin UI host call answers as an unknown server fault

## What

The verb behind `plugin.uiHostCall` (packages/server/src/domain/plugin, ui-host-call.ts) refuses a bad call by throwing a bare Error in several places, and two non-exported classes, PluginKvCapError (a storage write past the key cap) and UiHostCallScopeError (a chat-scoped call with no room id), reach the transport the same way. The mapper classifies none of them, so a plugin author's ordinary mistake answers INTERNAL_SERVER_ERROR and is logged as a server fault. The scope error's header says the transport maps it; it does not. Source: the errors lane report, the rv-errors file under reports/lanes.

## Why

A plugin surface cannot tell its own bad call from a broken server, and the operator's error log fills with refusals that are the caller's. These refusals are reachable by any installed plugin's UI.

## Done when

Each refusal in the verb is a coded error in the domain error tree with a code in the plugin contract's vocabulary. A test through `plugin.uiHostCall` on the composed root shows a write past the key cap and a chat-scoped call with no room id each answer a client error with their code, and neither writes an error-level log record. The header states what the mapper does.

## Evidence

Filled at landing: what ran and where its output is.
