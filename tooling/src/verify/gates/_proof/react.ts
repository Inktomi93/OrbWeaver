// Shared isolated-project React surface for the React-19 migration policies' self-proofs.
//
// The proofs run on an in-memory workspace, so `react` must be a RESOLVABLE package door there or every
// identity claim would be proved only against an unresolved external door — the weaker half of the fact.
// A file at `node_modules/@types/react/index.d.ts` is resolved by the same node module walk the real tree
// uses, and it puts the declaration in the same `/node_modules/@types/react/` home the live checker
// reports, so `declaredByAnyPackage` is exercised for real rather than stubbed.
export const REACT_TYPES_HOME = "node_modules/@types/react/index.d.ts";

/** A second package that also exports `forwardRef`/`useContext`/a `Provider`-bearing context — the
 *  same-SPELLING/different-ORIGIN twin every React policy owes. */
export const REACT_LOOKALIKE_HOME = "node_modules/not-react/index.d.ts";

const SURFACE = [
  "export interface Provider<T> {",
  "  (props: { value: T; children?: unknown }): unknown;",
  "}",
  "export interface Context<T> {",
  "  Provider: Provider<T>;",
  "  displayName?: string;",
  "}",
  "export declare function createContext<T>(value: T): Context<T>;",
  "export declare function forwardRef<T, P>(render: (props: P, ref: T) => unknown): unknown;",
  "export declare function useContext<T>(context: Context<T>): T;",
  "export declare function use<T>(context: Context<T>): T;",
  "export declare function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;",
  "export declare function useCallback<T>(callback: T, deps: readonly unknown[]): T;",
  "export declare function memo<T>(component: T): T;",
  "export declare function cloneElement(element: unknown): unknown;",
  "export declare function createRef<T>(): { current: T | null };",
  "export declare const Children: { toArray(children: unknown): readonly unknown[] };",
  "export declare class Component<P = object, S = object> { props: P; state: S; }",
  "export declare class PureComponent<P = object, S = object> extends Component<P, S> {}",
  "declare const surface: {",
  "  createContext: typeof createContext;",
  "  forwardRef: typeof forwardRef;",
  "  useContext: typeof useContext;",
  "  use: typeof use;",
  "  useMemo: typeof useMemo;",
  "  useCallback: typeof useCallback;",
  "  memo: typeof memo;",
  "  cloneElement: typeof cloneElement;",
  "  createRef: typeof createRef;",
  "  Children: typeof Children;",
  "  Component: typeof Component;",
  "  PureComponent: typeof PureComponent;",
  "};",
  "export default surface;",
  "",
].join("\n");

/** React's public surface as the policies read it: named exports, a namespace-importable module, and a
 *  default object so `React.forwardRef` resolves through the default door too. */
export function reactProofModule(): string {
  return SURFACE;
}

/** A DIFFERENT package exporting the same names. Nothing but the resolved origin separates the two. */
export function reactLookalikeProofModule(): string {
  return SURFACE;
}

/** The same surface with `forwardRef` and `useContext` declared as OVERLOAD SETS.
 *
 *  React's real `.d.ts` already ships overloaded hooks (`useState` has two declarations, `useRef` three —
 *  557 live import specifiers on this tree resolve through an overload set), and the origin-client family
 *  carried a declared limit that an overloaded React export would flip these policies from their precise
 *  verdict to the LOUD `unreadable` finding, because `resolveModuleMemberOrigin` refused any multiply-declared
 *  export as `ambiguous`. The reader now resolves a same-file overload set to its one home
 *  (`reference-fact-overload.ts#overloadHome`), so the limit is closed — and this module is what keeps it
 *  closed: a proof row built on it asserts the DEPRECATION message, which the unreadable arm does not carry. */
export function reactOverloadedProofModule(): string {
  return SURFACE.replace(
    "export declare function forwardRef<T, P>(render: (props: P, ref: T) => unknown): unknown;",
    "export declare function forwardRef<T, P>(render: (props: P, ref: T) => unknown): unknown;\nexport declare function forwardRef<T>(render: (props: object, ref: T) => unknown, displayName: string): unknown;",
  ).replace(
    "export declare function useContext<T>(context: Context<T>): T;",
    "export declare function useContext<T>(context: Context<T>): T;\nexport declare function useContext<T>(context: Context<T>, fallback: T): T;",
  );
}
