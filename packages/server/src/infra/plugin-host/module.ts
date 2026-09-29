// The ONE QuickJSWASMModule per broker Worker (module caches are isolate-local). QuickJS-ng via `quickjs-emscripten-core` +
// `@jitl/quickjs-ng-wasmfile-release-sync` — the -ng variant loaded explicitly (the `quickjs-emscripten`
// umbrella bundles only the ORIGINAL Bellard quickjs; honoring D46's "-ng" REQUIRES core + the -ng
// variant, pnpm-workspace.yaml records the full pin rationale). SYNC variant (not asyncify): the
// membrane's async posture is manual `executePendingJobs()` job-pumping under the invocation deadline
// — proven in the original spike — so an `await` chain cannot outlive its budget; asyncify's whole-
// stack suspend is both a size/perf tax and a budget-escape vector.
//
// One `QuickJSWASMModule` loads the WASM once; each plugin/snippet gets its OWN `QuickJSContext` (own
// globals, own memory cap, own interrupt budget) via `module.newContext()` — proven isolated in the spike.

import variantModule from "@jitl/quickjs-ng-wasmfile-release-sync";
import type { QuickJSSyncVariant, QuickJSWASMModule } from "quickjs-emscripten-core";
import { newQuickJSWASMModuleFromVariant, newVariant } from "quickjs-emscripten-core";
import { PLUGIN_WASM_MEMORY_INITIAL_BYTES, PLUGIN_WASM_MEMORY_MAX_BYTES } from "./budgets.ts";

type WasmMemoryOption = NonNullable<Parameters<typeof newVariant>[1]["wasmMemory"]>;

// The variant package ships ONE `dist/index.d.ts` for BOTH export conditions and declares no
// `"type": "module"`, so `nodenext` types it as CJS (`typeof import(…)`, i.e. the namespace) while the
// runtime resolves the `import` condition to a real ESM `index.mjs` whose default IS the variant. Under
// `bundler` the mismatch was invisible; nodenext surfaces it (tsx-shedding stage 4). Normalize here, at
// the single seam, rather than weakening the program: take `.default` when the CJS namespace shape shows
// up, else the value itself.
const variant: QuickJSSyncVariant =
  (variantModule as unknown as { readonly default?: QuickJSSyncVariant }).default ?? (variantModule as unknown as QuickJSSyncVariant);

let modulePromise: Promise<QuickJSWASMModule> | undefined;

const KIBIBYTE = 1024;
const WASM_PAGE_KIBIBYTES = 64;
const WASM_PAGE_BYTES = WASM_PAGE_KIBIBYTES * KIBIBYTE;

function pages(bytes: number): number {
  return bytes / WASM_PAGE_BYTES;
}

function createWebAssemblyMemory(): WasmMemoryOption {
  const namespace: unknown = Reflect.get(globalThis, "WebAssembly");
  if (typeof namespace !== "object" || namespace === null) {
    throw new Error("plugin host: WebAssembly is unavailable");
  }
  const memoryConstructor: unknown = Reflect.get(namespace, "Memory");
  if (typeof memoryConstructor !== "function") {
    throw new Error("plugin host: WebAssembly.Memory is unavailable");
  }
  return Reflect.construct(memoryConstructor, [
    {
      initial: pages(PLUGIN_WASM_MEMORY_INITIAL_BYTES),
      maximum: pages(PLUGIN_WASM_MEMORY_MAX_BYTES),
    },
  ]) as WasmMemoryOption;
}

/** Memoized loader for this Worker's QuickJS-ng WASM module. Idempotent within the isolate; terminating the
 *  Worker reclaims this module's linear-memory high-water allocation. */
export function getPluginQuickJS(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(
    newVariant(variant, {
      // The published Emscripten loader otherwise defaults to maximum:32768 pages (2 GiB). QuickJS's
      // setMemoryLimit accounts live guest allocations and does not constrain that allocator high-water mark.
      // One module lives in one recyclable Worker, so this WebAssembly-native maximum is both per guest and
      // reclaimed when the broker terminates the Worker.
      wasmMemory: createWebAssemblyMemory(),
    }),
  );
  return modulePromise;
}
