// Ambient side-effect-CSS module type for the KaTeX stylesheet import in `math.ts`. @orb/ui runs
// `types: []` + no `vite/client` reference (unlike @orb/client, whose `styles/vite-env.d.ts` pulls
// this in for free), so a bare `import "…​.css"` has no module type here. Declaration-only, zero emit;
// the consuming bundler (client Vite / playwright-ct Vite) resolves the file and rewrites its font
// url()s to hashed assets. Scoped to this dir's need — the only CSS import in package source.
declare module "*.css";
