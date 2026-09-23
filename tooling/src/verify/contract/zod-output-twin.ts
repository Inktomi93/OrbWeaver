// The shape lib/zod-output-twin.ts returns. Homed here because the five-slot template puts every exported
// shape in contract/ (docs/architecture/core/Core-Tooling-Law.md §2.5) and `no-inline-types` enforces it.
import type { Node as MorphNode, Type } from "ts-morph";

/** One twin read: no ZodType twin at the site, a twin the reader could not resolve (withholds the policy),
 *  or a concrete authored-type/schema-output pair with both assignability directions. */
export type ZodOutputTwinRead =
  | { readonly kind: "none" }
  | { readonly kind: "unresolved"; readonly carrier: MorphNode; readonly reason: string }
  | {
      readonly kind: "pair";
      readonly carrier: MorphNode;
      readonly target: Type;
      readonly output: Type;
      readonly outputToTarget: boolean;
      readonly targetToOutput: boolean;
    };
