// The ONE QuickJSWASMModule per process (01 §0). QuickJS-ng via `quickjs-emscripten-core` +
// `@jitl/quickjs-ng-wasmfile-release-sync` — the -ng variant loaded explicitly (the `quickjs-emscripten`
// umbrella bundles only the ORIGINAL Bellard quickjs; honoring D46's "-ng" REQUIRES core + the -ng
// variant, pnpm-workspace.yaml records the full pin rationale). SYNC variant (not asyncify): the
// membrane's async posture is manual `executePendingJobs()` job-pumping under the invocation deadline
// (03 §3) — proven in the P1 spike — so an `await` chain cannot outlive its budget; asyncify's whole-
// stack suspend is both a size/perf tax and a budget-escape vector.
//
// One `QuickJSWASMModule` loads the WASM once; each plugin/snippet gets its OWN `QuickJSContext` (own
// globals, own memory cap, own interrupt budget) via `module.newContext()` — proven isolated in the spike.

import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";

let modulePromise: Promise<QuickJSWASMModule> | undefined;

/** Memoized loader for the single process-wide QuickJS-ng WASM module. Idempotent — every caller shares
 *  one WASM instantiation; contexts are cheap and per-plugin. */
export function getPluginQuickJS(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return modulePromise;
}
