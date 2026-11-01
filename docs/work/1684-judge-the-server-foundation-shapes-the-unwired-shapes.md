---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/foundation shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/foundation`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `bindPostureWarnings` / `bindPostureWarnings` | `server/src/foundation/env/index.ts:22` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `diagnosticsPostureWarnings` / `diagnosticsPostureWarnings` | `server/src/foundation/env/index.ts:24` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `loopbackCompanion` / `loopbackCompanion` | `server/src/foundation/env/index.ts:27` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `ownerFallbackPeerWarnings` / `ownerFallbackPeerWarnings` | `server/src/foundation/env/index.ts:30` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `resolveAllowedHosts` / `resolveAllowedHosts` | `server/src/foundation/env/index.ts:32` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `resolveBindPosture` / `resolveBindPosture` | `server/src/foundation/env/index.ts:33` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `resolveDiagnosticsPosture` / `resolveDiagnosticsPosture` | `server/src/foundation/env/index.ts:34` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `resolveOwnerFallbackPeers` / `resolveOwnerFallbackPeers` | `server/src/foundation/env/index.ts:35` | reexport-chain | delete | export it from its home, not through `server/src/foundation/env/record/index.ts` |
| `ClientErrorReport` / `ClientErrorReport` | `server/src/foundation/observability/client-error.ts:14` | reexport-chain | delete | export it from its home, not through `contracts/src/diagnostics/index.ts` |
| `MemoryRecallInspector` / `MemoryRecallInspector` | `server/src/foundation/observability/debug/index.ts:5` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/routes.ts` |
| `RpgTraceInspector` / `RpgTraceInspector` | `server/src/foundation/observability/debug/index.ts:6` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/routes.ts` |
| `WireOutcome` / `WireOutcome` | `server/src/foundation/observability/debug/index.ts:16` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/wire-capture.ts` |
| `AuditEntry` / `AuditEntry` | `server/src/foundation/observability/index.ts:5` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/audit.ts` |
| `createWireCaptureSpill` / `createWireCaptureSpill` | `server/src/foundation/observability/index.ts:12` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `isWireCaptureEnabled` / `isWireCaptureEnabled` | `server/src/foundation/observability/index.ts:13` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `isWireReplyCaptureEnabled` / `isWireReplyCaptureEnabled` | `server/src/foundation/observability/index.ts:14` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `MemoryRecallInspector` / `MemoryRecallInspector` | `server/src/foundation/observability/index.ts:15` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts`, `server/src/foundation/observability/debug/routes.ts` |
| `RpgTraceInspector` / `RpgTraceInspector` | `server/src/foundation/observability/index.ts:16` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts`, `server/src/foundation/observability/debug/routes.ts` |
| `recordTurnOutcome` / `recordTurnOutcome` | `server/src/foundation/observability/index.ts:17` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `recordWireCapture` / `recordWireCapture` | `server/src/foundation/observability/index.ts:18` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `registerDebugRoutes` / `registerDebugRoutes` | `server/src/foundation/observability/index.ts:19` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `WireCaptureSpill` / `WireCaptureSpill` | `server/src/foundation/observability/index.ts:20` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts` |
| `WireOutcome` / `WireOutcome` | `server/src/foundation/observability/index.ts:21` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/debug/index.ts`, `server/src/foundation/observability/debug/wire-capture.ts` |
| `Logger` / `Logger` | `server/src/foundation/observability/index.ts:27` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/logger.ts` |
| `ObservabilityRings` / `ObservabilityRings` | `server/src/foundation/observability/index.ts:33` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/rings.ts` |
| `DetachedSupervision` / `DetachedSupervision` | `server/src/foundation/observability/index.ts:38` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/tracing.ts` |
| `RequestTrace` / `RequestTrace` | `server/src/foundation/observability/index.ts:40` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/tracing.ts` |
| `SerializedSpan` / `SerializedSpan` | `server/src/foundation/observability/index.ts:41` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/tracing.ts` |
| `SpanAttrs` / `SpanAttrs` | `server/src/foundation/observability/index.ts:42` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/tracing.ts` |
| `TraceRing` / `TraceRing` | `server/src/foundation/observability/index.ts:45` | reexport-chain | delete | export it from its home, not through `server/src/foundation/observability/tracing.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 30 rows = 28 applied, 2 left and flagged for 1698 (authn). 0 kept, 0 owner questions.

- Handed to 1698: `ownerFallbackPeerWarnings` and `resolveOwnerFallbackPeers` in `packages/server/src/foundation/env/index.ts`. They resolve the trusted peers for the owner-fallback auth mode, an authn posture. Left untouched.
- Applied (door exports from the home file, no consumer changes, since the door's names are unchanged): `env/index.ts` exports `bindPostureWarnings`, `loopbackCompanion`, `resolveBindPosture` from `bind.ts`, `resolveAllowedHosts` from `allowed-hosts.ts`, `diagnosticsPostureWarnings`, `resolveDiagnosticsPosture` from `diagnostics.ts`. `observability/index.ts` exports `AuditEntry`, `Logger`, `ObservabilityRings`, `DetachedSupervision`, `RequestTrace`, `SerializedSpan`, `SpanAttrs`, `TraceRing`, `MemoryRecallInspector`, `RpgTraceInspector` and `WireOutcome` from `contract/*`, and `registerDebugRoutes` and the wire-capture functions and `WireCaptureSpill` from `debug/routes.ts` and `debug/wire-capture.ts`. `debug/index.ts` had `observability/index.ts` as its only importer (rg over packages, tests, tooling and docs: 0 others) and is deleted, which resolves its three rows (`MemoryRecallInspector`, `RpgTraceInspector`, `WireOutcome`).
- `ClientErrorReport` reexport-chain: applied. The `client-error.ts` re-export is deleted; no file imported it from there (ast-grep ts 5949 / tsx 1525 tracked files).
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0.
