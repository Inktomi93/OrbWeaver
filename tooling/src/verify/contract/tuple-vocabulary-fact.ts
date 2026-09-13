// Ordered tuple vocabulary facts retain canonical declarations and authored member anchors.
import type { Node, VariableDeclaration } from "ts-morph";
import type { ReferenceUnresolvedReason } from "./reference-fact.ts";

/** @public knip type-face false positive — a structural field (`symbol`) of the exported `TupleVocabularyFact` shape,
 *  never referenced by its own name at any call site. */
export interface TupleVocabularySymbol {
  readonly exportedName: string;
  readonly declaration: VariableDeclaration;
}

export interface TupleVocabularyEntry {
  readonly value: string;
  readonly node: Node;
  readonly declaration: VariableDeclaration;
}

export type TupleVocabularyFact =
  | {
      readonly kind: "resolved";
      readonly symbol: TupleVocabularySymbol;
      readonly entries: readonly TupleVocabularyEntry[];
      readonly declarations: readonly Node[];
    }
  | { readonly kind: "absent"; readonly exportedName: string }
  | { readonly kind: "empty"; readonly symbol: TupleVocabularySymbol; readonly declarations: readonly Node[] }
  | {
      readonly kind: "unresolved";
      readonly exportedName: string;
      readonly reason: ReferenceUnresolvedReason;
      readonly detail: string;
      readonly node: Node;
      readonly declarations: readonly Node[];
    };

/** The finished provider view: one lazy read per exported tuple name, over one shared collection. */
export interface TupleVocabularies {
  readonly read: (exportedName: string) => TupleVocabularyFact;
  /** Distinct exported variable names the shared walk indexed — the provider's own denominator. */
  readonly indexed: number;
}

export interface TupleVocabularyReceipt {
  readonly source: string;
  readonly members: number;
  readonly unresolved: number;
}
