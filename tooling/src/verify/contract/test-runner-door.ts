// The door verdict `lib/test-runner-door.ts#readFixtureDoor` answers with (#1988).
// `gates/test-fixture-imports.ts` imports it BY NAME and narrows every arm, so it crosses the lib↔policy
// boundary and `lib/` is not a type home (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).
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
