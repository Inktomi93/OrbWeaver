// The zustand surface `no-raw-zustand-persist` resolves its two vendor identities against: the `persist`
// middleware export and the store api's `setState`/`getInitialState` methods.
//
// These are REAL package doors in the proof workspace, resolved by the same node module walk the live tree
// uses, so a proof exercises the declaration home rather than a stub. The lookalike twin exports the same
// names from a different package — that pair is the whole identity claim.
const ZUSTAND_HOME = "node_modules/zustand/index.d.ts";
const ZUSTAND_MIDDLEWARE_HOME = "node_modules/zustand/middleware.d.ts";
const ZUSTAND_LOOKALIKE_HOME = "node_modules/store-lookalike/index.d.ts";

const STORE_API = [
  "export declare class StoreApi<T> {",
  "  setState(partial: T, replace?: boolean): void;",
  "  getState(): T;",
  "  getInitialState(): T;",
  "}",
  "export declare function create<T>(initializer: unknown): StoreApi<T>;",
  "",
].join("\n");

const MIDDLEWARE = ["export declare function persist<T>(initializer: T, options?: unknown): T;", ""].join("\n");

/** zustand's own doors: the store api and the persist middleware. */
export function zustandProof(): Readonly<Record<string, string>> {
  return { [ZUSTAND_HOME]: STORE_API, [ZUSTAND_MIDDLEWARE_HOME]: MIDDLEWARE };
}

/** A DIFFERENT package exporting the same names. Nothing but the resolved origin separates the two. */
export function storeLookalikeProof(): Readonly<Record<string, string>> {
  return { [ZUSTAND_LOOKALIKE_HOME]: `${STORE_API}${MIDDLEWARE}` };
}
