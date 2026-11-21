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

Review of the fields report found false-positive classes: reads through a tRPC procedure's ctx typed from Context; preset editor writes by TanStack field path such as params.reasoningSeed; reads through a narrowed message type (runner.ts reads every rate_limit_info and refusal field); indexed reads of a constant table such as TASK_DEFS\[task].scope in packages/inference/src/resolve/precedence.ts and TASK_DEFS\[task].spend in packages/contracts/src/inference/policy.ts; writes to a host object such as a canvas width and height (packages/ui/src/lib/live-token-resolver.ts); destructured reads in a loop body (drawDew in web-weave-render.ts, the global variable drain at turn commit); a parsed object sent whole to a provider (openRouterWebSearchSchema in openai-compat/chat.ts); a context written whole into a column (EmbeddingInvocationContext); a type read through keyof (ReactivatePluginsReport); runtime port types read across the plugin port (PluginCardDataHit); mapped-type registry keys still reported after the mapped-key fix (WorkloadResultByKind.index and csls); mutation inputs sent through createEntityMutation typed by inferInput (createEntry, commitMessage, forceCharacterTurn and siblings); infinite-query cursors and limits the query library fills; curated capability rows that write a schema field (packages/inference/src/capability/sources/curated/openai.ts); shapes handed to a dependency (rehype-sanitize options, hast and mdast nodes, Hono Variables); string field lists such as a fuzzy-search fields array; objects written to a serializer or zip (the SillyTavern export tags and zip files); literal acknowledgement outputs such as admin.restart's restarting; writes through a spread object (capability/floor.ts marks sendsWindow); writes through computed keys (tokenSampleSlice in stats-delta.ts); compound assignment writes such as ??= (Group.dirName in import/loader/collect.ts); reads through a union member (RegexRosterOffEntry.off); reads through a wrapper type such as DbAssemblyInput (PersonaSeatReseatDeps.db); acknowledgement outputs such as MarkAllReadResult.markedCount, DisconnectResult.disconnected, DetachResult and ReorderResult; the published plugin surface; outside-input schema keys reported as dead; and diagnostic sinks. Owner ruling: a field picked by name into a log, debug route or bug bundle counts as read; a field that only rides a whole-object dump does not.

## Why

These rows bury the real dead fields the judgement items need.

## Done when

Each class has a red-first fixture in tests/tooling/unwired and a scanner fix: reads through a tRPC procedure's ctx, TanStack form field-path writes, reads through a narrowed message type or a narrowed union member, a discriminant read by a switch, indexed reads of a constant table, mutation inputs through inferInput, query-library cursors, curated capability rows, shapes handed to a dependency, string field lists, serializer and zip writes, acknowledgement outputs, spread-object writes, computed-key writes, compound-assignment writes, union-member reads, wrapper-type reads, mapped-type registry keys, writes to a host object, destructured reads, an object sent whole to a provider or written whole into a column, a type read through keyof, a persisted store shape read whole, automation facts read from CEL, composition-root destructuring, and payloads a schema-driven renderer reads by key; outside-input schema keys report in their own bucket, never as judged rows; tooling/src/unwired/deliberate.ts holds packages/contracts/src/plugin and packages/plugin-sdk with the published-API reason, triggerFactPayloadSchema in packages/contracts/src/automation with the same reason, AdminUserView\.kind and ownerHandle citing D60, and AssetListItem.kinds citing D350, and ThemeFallbackRing, the motion evidence records and CssMergeReceipt with the agent bridge reason; the orchestrator reruns the scans and every remaining row in the classes is checked.

## Evidence

Filled at landing: what ran and where its output is.
