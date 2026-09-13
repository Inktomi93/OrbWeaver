// Shared isolated-project QuickJS surface for the plugin-host membrane policy's self-proofs.
//
// The proofs run on an in-memory workspace, so `quickjs-emscripten-core` must be a RESOLVABLE package door
// there or the `ctx.dump` identity claim would be proved only against an unresolved receiver — the weaker
// half of the fact. A file at `node_modules/quickjs-emscripten-core/index.d.ts` is resolved by the same
// node module walk the real tree uses and puts the declaration in the same `/node_modules/…/` home the live
// checker reports, so `declaredByPackage` is exercised for real rather than stubbed.
const QUICKJS_HOME = "node_modules/quickjs-emscripten-core/index.d.ts";
/** A second package declaring the same `dump` member — the same-SPELLING/different-ORIGIN twin. */
const QUICKJS_LOOKALIKE_HOME = "node_modules/not-quickjs/index.d.ts";

const SURFACE = [
  "export interface QuickJSHandle {",
  "  readonly alive: boolean;",
  "}",
  "export interface QuickJSContext {",
  "  dump(handle: QuickJSHandle): unknown;",
  "  getProp(handle: QuickJSHandle, key: string): QuickJSHandle;",
  "}",
  "",
].join("\n");

/** The QuickJS context surface as the membrane reads it. */
export function quickjsProof(): Readonly<Record<string, string>> {
  return { [QUICKJS_HOME]: SURFACE };
}

/** The same member names from a package that is not the runtime — the counterfactual half of the claim. */
export function quickjsLookalikeProof(): Readonly<Record<string, string>> {
  return { [QUICKJS_LOOKALIKE_HOME]: SURFACE };
}
