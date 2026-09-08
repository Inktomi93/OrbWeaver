// Ambient shorthand for browser ASSET side-effect imports (`import "….css"`), scoped to the ROOT
// AGGREGATOR program ONLY — it is listed in tsconfig.json's `include`, NOT in tsconfig.base.json, so it
// never enters a per-package program (no collision with ui's packages/ui/src/markdown/css-modules.d.ts
// or client's vite/client). The aggregator EXCLUDES packages/{ui,client}/src as roots but pulls them in
// TRANSITIVELY (moduleResolution: bundler), so it does not inherit those packages' local CSS ambients;
// without this, a transitively-reached `import "katex/dist/katex.min.css"` (ui/src/markdown/math.ts) reds
// the root Node program with TS2882 "Cannot find module … side-effect import". Declaration-only, zero emit.
declare module "*.css";
