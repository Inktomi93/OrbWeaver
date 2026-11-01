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

/** A minimal `z`: its object schemas keep their keys and infer a value type the way zod does. */
export const ZOD_STUB = [
  "export interface Schema<V> { readonly value?: V; optional(): Schema<V | undefined> }",
  "const schema = <V>(): Schema<V> => ({ optional: () => schema<V | undefined>() });",
  "export type Infer<S> = S extends { readonly shape: infer T } ? { [K in keyof T]: T[K] extends Schema<infer V> ? V : never } : never;",
  "export const z = {",
  "  object: <T>(shape: T): { readonly shape: T } => ({ shape }),",
  "  discriminatedUnion: <T>(key: string, options: T): { readonly shape: T } => ({ shape: options }),",
  "  lazy: <T>(make: () => T): T => make(),",
  "  string: (): Schema<string> => schema<string>(),",
  "};",
  "export type Checked<T> = { readonly shape: unknown } & { readonly checked?: T };",
].join("\n");
