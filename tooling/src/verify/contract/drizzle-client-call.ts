// The verdict `lib/drizzle-client-call.ts` answers with (#1988). `gates/no-await-db-in-loop.ts` dispatches
// on its `kind` — a shape one reader returns and a policy consumes crosses the lib↔policy boundary, so it
// is homed here rather than beside the reader (Spine-TypeScript-and-Patterns.md §7.4).
import type { Node as MorphNode } from "ts-morph";

export type DrizzleClientCall =
  /** The called member is declared inside the installed drizzle-orm package. */
  | { readonly kind: "drizzle"; readonly method: string; readonly nameNode: MorphNode }
  /** The member resolved to declarations OUTSIDE drizzle-orm — a same-named method of something else. */
  | { readonly kind: "foreign"; readonly method: string; readonly nameNode: MorphNode }
  /** No property symbol, or a member spelling the reader cannot normalize. Absence is never a verdict.
   *  `nameNode` is present whenever the MEMBER normalized and only the property symbol refused, so a
   *  fail-closed caller still has the exact authored token to anchor its finding on. */
  | { readonly kind: "unresolved"; readonly method: string | null; readonly nameNode: MorphNode | null; readonly detail: string };
