// The compiler options a planted unwired tree builds with, and the one-world tree shape the scan suites share.
// Planted trees carry no node_modules, so `types` stays empty and JSX runs on a declared namespace.

export const COMPILER = {
  strict: true,
  target: "ESNext",
  lib: ["ESNext"],
  module: "ESNext",
  moduleResolution: "bundler",
  allowImportingTsExtensions: true,
  noEmit: true,
  jsx: "preserve",
  types: [],
} as const;

/** A tsconfig that includes `include` with {@link COMPILER} and any extra options. */
export const config = (include: readonly string[], extra: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({ compilerOptions: { ...COMPILER, ...extra }, include });

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
