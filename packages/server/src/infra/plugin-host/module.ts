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

import variantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
import type { QuickJSSyncVariant, QuickJSWASMModule } from "quickjs-emscripten-core";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";

// The variant package ships ONE `dist/index.d.ts` for BOTH export conditions and declares no
// `"type": "module"`, so `nodenext` types it as CJS (`typeof import(…)`, i.e. the namespace) while the
// runtime resolves the `import` condition to a real ESM `index.mjs` whose default IS the variant. Under
// `bundler` the mismatch was invisible; nodenext surfaces it (tsx-shedding stage 4). Normalize here, at
// the single seam, rather than weakening the program: take `.default` when the CJS namespace shape shows
// up, else the value itself.
const variant: QuickJSSyncVariant = (variantModule as unknown as { readonly default?: QuickJSSyncVariant }).default ?? (variantModule as unknown as QuickJSSyncVariant);

let modulePromise: Promise<QuickJSWASMModule> | undefined;

/** Memoized loader for the single process-wide QuickJS-ng WASM module. Idempotent — every caller shares
 *  one WASM instantiation; contexts are cheap and per-plugin. */
export function getPluginQuickJS(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
  return modulePromise;
}
