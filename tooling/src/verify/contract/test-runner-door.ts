import type { SourceFile } from "ts-morph";

export type FixtureDoor =
  /** The consumer named a runner package directly. */
  | { readonly kind: "runner"; readonly specifier: string }
  /** The consumer named a project module — a composed door, judged further by the caller. */
  | { readonly kind: "project"; readonly specifier: string; readonly sourceFile: SourceFile }
  /** Some other package (a third-party assertion helper). Out of the doctrine's subject. */
  | { readonly kind: "external"; readonly specifier: string }
  /** A relative/alias door that resolves to no module. Absence is never a verdict. */
  | { readonly kind: "unresolved"; readonly detail: string };
