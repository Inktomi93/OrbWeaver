// Authored writer sources carry real helper/body and assignment provenance, not replace/merge judgments.
import type { CallExpression, Node } from "ts-morph";

export type DrizzleWriterSource =
  | { readonly kind: "empty"; readonly node: Node | undefined }
  | { readonly kind: "object"; readonly node: Node; readonly members: readonly DrizzleWriterMember[] }
  | { readonly kind: "choice"; readonly node: Node; readonly values: readonly DrizzleWriterSource[] }
  | {
      readonly kind: "call";
      readonly node: CallExpression;
      readonly owner: Node;
      readonly returns: readonly DrizzleWriterSource[];
      readonly assignments: readonly DrizzleWriterMember[];
    }
  | { readonly kind: "unresolved"; readonly node: Node; readonly detail: string };

export type DrizzleWriterMember =
  | { readonly kind: "spread"; readonly source: DrizzleWriterSource }
  | { readonly kind: "named"; readonly name: string; readonly node: Node; readonly value: Node | undefined };
