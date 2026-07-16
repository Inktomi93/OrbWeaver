// The ONE client dev/prod discriminant for runtime-gated instrumentation. Deliberately optional-chained,
// not the literal `import.meta.env.DEV`: modules reachable from the node-only root aggregator tsconfig
// must still typecheck, and a missing env degrades to false (fails safe). main.tsx keeps the literal
// expression instead — that's what the bundler constant-folds to strip devtools chunks from prod.

/** True under the Vite dev server + vitest; false in a production build (or when no bundler env exists). */
export const IS_DEV: boolean = (import.meta as unknown as { readonly env?: { readonly DEV?: boolean } }).env?.DEV === true;
