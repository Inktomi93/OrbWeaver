// What the unwired scan suites plant beside the testkit's `plantedTsconfig`: the libs a node-only tree builds with,
// the one package world a single-world tree holds, and a JSX namespace, since a planted tree has no node_modules.

/** The libs of a planted tree with no DOM. */
export const LIB = ["ESNext"];

/** The one package world every single-world tree plants. */
export const WORLD = "packages/a/tsconfig.json";

/** A minimal JSX namespace, so a planted `.tsx` file type-checks its elements' props. */
export const JSX_NAMESPACE = [
  "declare namespace JSX {",
  "  interface Element {}",
  "  interface IntrinsicElements { [name: string]: Record<string, unknown> }",
  "  interface ElementChildrenAttribute { children: {} }",
  "}",
].join("\n");
