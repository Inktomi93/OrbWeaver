---
kind: tooling
status: open
updated: 2026-10-02
priority: P3
area: tooling
---

# Correct AST output and candidate classification

## What

Make pnpm ast respell with --near and --json emit one parseable JSON document, preserving both result sections and scope metadata. Correct clientgap classification of ViewerView: sessions.me declares viewerViewSchema as output, and useSettingsViewerView reads its inferred globalRole. The current command still reports ViewerView as a client gap. Report mutable bindings honestly in aliases output. The notify and session-document bindings use let and are reassigned; they are not const renames.

Exclude JSDoc symbol links from executable liveness consumption. Classify sanctioned Zod output twins using the existing twin-identity reader rather than treating their type-only role as an intent defect.

## Why

Composite output cannot be parsed as the advertised single JSON value, and a live inferred client contract appears unused.

## Done when

JSON.parse accepts the complete composite stdout and both result sections survive. A control covers a schema-derived output consumed through the typed client without importing its alias; the real ViewerView case is not reported. A truly unconsumed view remains reported. Mutable binding controls must not appear as const aliases; retain genuine immutable-alias controls.

A JSDoc-only reference cannot keep a symbol production-live, while a real call still does. Canonical schema twins appear in a named classification without suppressing unrelated candidates or stale annotations.

## Evidence

`reports/launch-ast-audit-2026-10-01/respell.json` contains consecutive top-level objects, so parsing the complete stdout fails with extra data. `reports/launch-ast-audit-2026-10-01/clientgap.json` reports the live viewer alias. `packages/server/src/transport/trpc/routers/sessions.ts:28` binds its output schema. `packages/client/src/data/use-settings-viewer-view.ts:21` queries that procedure and reads its role.

The captured aliases report labels mutable bindings as local const. `packages/client/src/lib/notify.ts:68` and `packages/client/src/lib/session-document-host.ts:24` declare let bindings, and their bind functions reassign them. `tooling/src/ast/ops/graph.ts:151` emits const-rename for every identifier initializer without checking the declaration kind. Literal and structural checks confirm both real cases.

`/tmp/claude-launch-zero-audit/RESULTS.md` identifies the JSDoc reference to `readingBandSurface` and the schema-twin classification gap. Root reproduced the JSDoc identifier ancestry with the installed parser. Reuse `tooling/src/verify/lib/zod-output-twin.ts` where applicable; retain its canonical ownership rule.

Composite `rot` intentionally omits standalone census and stale-marker detail. Audit those through the standalone commands; this item does not require widening the composite contract merely to repeat documented detail.
