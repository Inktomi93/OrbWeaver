// CSS side-effect imports in the CT harness (vite handles them; tsc needs the ambient shape —
// noUncheckedSideEffectImports rejects an undeclared module).
declare module "*.css" {}
