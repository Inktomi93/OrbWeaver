---
kind: tooling
status: open
updated: 2026-11-21
priority: P2
area: tooling
plan: unwired-code
---

# The unwired fields scan reads tRPC context, form field paths, narrowed messages and diagnostic sinks

## What

Review of the fields report found false-positive classes: reads through a tRPC procedure's ctx typed from Context; preset editor writes by TanStack field path such as params.reasoningSeed; reads through a narrowed message type (runner.ts reads every rate_limit_info and refusal field); indexed reads of a constant table such as TASK_DEFS\[task].scope in packages/inference/src/resolve/precedence.ts and TASK_DEFS\[task].spend in packages/contracts/src/inference/policy.ts; writes to a host object such as a canvas width and height (packages/ui/src/lib/live-token-resolver.ts); destructured reads in a loop body (drawDew in web-weave-render.ts, the global variable drain at turn commit); a parsed object sent whole to a provider (openRouterWebSearchSchema in openai-compat/chat.ts); a context written whole into a column (EmbeddingInvocationContext); a type read through keyof (ReactivatePluginsReport); runtime port types read across the plugin port (PluginCardDataHit); client reads through a router's inferred output type (regex-section-model.ts reads EffectiveRegexEntry.runsAt through inferOutput); mapped-type registry keys still reported after the mapped-key fix (WorkloadResultByKind.index and csls); the published plugin surface; outside-input schema keys reported as dead; and diagnostic sinks. Owner ruling: a field picked by name into a log, debug route or bug bundle counts as read; a field that only rides a whole-object dump does not.

## Why

These rows bury the real dead fields the judgement items need.

## Done when

Each class has a red-first fixture in tests/tooling/unwired and a scanner fix: reads through a tRPC procedure's ctx, TanStack form field-path writes, reads through a narrowed message type or a narrowed union member, a discriminant read by a switch, indexed reads of a constant table, client reads through a router's inferred output type, mapped-type registry keys, writes to a host object, destructured reads, an object sent whole to a provider or written whole into a column, a type read through keyof, a persisted store shape read whole, automation facts read from CEL, composition-root destructuring, and payloads a schema-driven renderer reads by key; outside-input schema keys report in their own bucket, never as judged rows; tooling/src/unwired/deliberate.ts holds packages/contracts/src/plugin and packages/plugin-sdk with the published-API reason, triggerFactPayloadSchema in packages/contracts/src/automation with the same reason, AdminUserView\.kind and ownerHandle citing D60, and AssetListItem.kinds citing D350, and ThemeFallbackRing with the agent bridge reason; the orchestrator reruns the scans and every remaining row in the classes is checked.

## Evidence

Filled at landing: what ran and where its output is.
