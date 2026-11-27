---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: server
lane: wt/agent-a200462b5de058ccf
plan: unwired-code
---

# Server results and views drop unread fields and name their log fields

## What

No reader takes GeneratedPictureImage.generationId and block, VariantWireView\.variantId, RuleView\.updatedAt, DataLayout.dbDir and cache outside tests, or RegexTwoAxisChangedScript.markdownOnly and promptOnly in TypeScript. The fan-out sentences in plugin-distribute-section.tsx hard-code one skip reason per direction instead of reading PluginFanoutSkip.reason. FsckResult counts what it scanned and FsckReport drops it. DrainReport, EgressAllowlistWarning and the provider capability and sampling drops reach their log lines as whole records.

## Why

Unread fields read as promises, a hard-coded reason breaks silently on a new skip reason, and a clean integrity check gives no sense of what it covered.

## Done when

The unread fields leave their types, schemas and queries; the fan-out sentences read reason through a Record over PLUGIN_FANOUT_SKIP_REASONS and userId is dropped; FsckReport carries the scanned counts and the result line states them; each named log call spells its fields; affected suites and CTs pass.

## Evidence

Filled at landing: what ran and where its output is.
