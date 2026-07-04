// `IS_DEV` — the ONE client dev/prod discriminant for RUNTIME-gated instrumentation (the [trpc]
// logger `enabled` fn, the zustand devtools `enabled` flag, RenderProfiler's bare-children path).
// Vite/vitest inject `import.meta.env` (DEV true under `vite dev` + vitest, false in `vite build`).
// The access is deliberately OPTIONAL-CHAINED, not the literal `import.meta.env.DEV`: modules
// reachable from the root aggregator tsconfig (a NODE program without vite/client ambient types —
// the vitest types lane pulls client source in via tests/client/**) must still typecheck, and the
// missing-env case degrades to `false` (instrumentation OFF — fails safe). The composition root
// (main.tsx) keeps the LITERAL `import.meta.env.DEV` instead — that exact expression is what the
// bundler constant-folds to strip the devtools/tracer chunks from prod output entirely; this flag
// is only for gates where shipping the check is by design (error logging fires in prod too).

/** True under the Vite dev server + vitest; false in a production build (or when no bundler env exists). */
export const IS_DEV: boolean =
  (import.meta as unknown as { readonly env?: { readonly DEV?: boolean } }).env?.DEV === true;
