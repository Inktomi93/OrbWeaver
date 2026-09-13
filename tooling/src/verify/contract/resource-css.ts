import type { AuthoredCssFile } from "./resource-tree.ts";

export type CssInventoryRequest = "authored" | "product";

export interface CssSourcePosition {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

export interface CssDeclarationFact extends CssSourcePosition {
  readonly property: string;
  readonly value: string;
  readonly owner:
    | { readonly kind: "style-rule"; readonly selectorList: string }
    | { readonly kind: "at-rule"; readonly prelude: string; readonly line: number; readonly offset: number };
}

export interface CssSelectorFact extends CssSourcePosition {
  /** Exact authored selector arm, excluding surrounding whitespace. */
  readonly authored: string;
  /** Whitespace-normalized selector identity. */
  readonly selector: string;
  readonly selectorList: string;
}

/** ONE selector hook, positioned at its own first character.
 *
 *  `authored` IS THE EXACT SOURCE SLICE AT `offset` — `.rail-shell` for a class, `[data-density="compact"]`
 *  for an attribute, brackets and quotes included. It exists because the position is the WAIVER POSITION:
 *  `lib/ordinary-waiver.ts#locateFinding` re-reads the finding's token out of comment-blanked source and
 *  requires it to be authored text at the exact line and column, so an ordinary policy anchoring on a hook
 *  needs the slice, not the name. Without it the attribute's CLOSING bracket is unrecoverable from the
 *  fact (only `offset`, the `[`, is published) and every consumer re-derives one — which is the private-
 *  reader shape §12.3 bans, at the one place a wrong answer mints an unwaivable finding. */
export type CssSelectorHookFact =
  | (CssSourcePosition & { readonly kind: "class"; readonly name: string; readonly authored: string })
  | (CssSourcePosition & {
      readonly kind: "data";
      readonly name: string;
      readonly operator: "presence" | "=" | "^=" | "$=" | "*=" | "~=" | "|=";
      readonly value: string | undefined;
      readonly authored: string;
    });

/** ONE BLOCKLESS at-rule, positioned in its sheet — the sheet's `@import`/`@source`/`@charset` topology.
 *  `name` is the at-keyword lowercased without `@`; `prelude` is the whole collapsed statement text, the
 *  same spelling `CssDeclarationFact.owner` uses for a BLOCK at-rule. Resolution is deliberately absent: a
 *  specifier is text here, and turning it into a repo path is the consuming policy's judgment. */
export interface CssStatementAtRuleFact extends CssSourcePosition {
  readonly name: string;
  readonly prelude: string;
}

export interface CssCustomPropertyDefinitionFact extends CssSourcePosition {
  readonly name: string;
}

export interface CssCustomPropertyReferenceFact extends CssSourcePosition {
  readonly name: string;
  readonly fallback: boolean;
}

/** @public knip type-face false positive — a structural field (`population`) of the exported `CssFacts` shape, never
 *  referenced by its own name at any call site. */
export interface CssFactPopulation {
  readonly files: number;
  readonly rules: number;
  readonly declarations: number;
  readonly selectors: number;
  readonly selectorHooks: number;
  readonly statements: number;
  readonly customPropertyDefinitions: number;
  readonly customPropertyReferences: number;
}

/** Syntax facts only. Writer ownership, variable legality, grants, and policy verdicts stay outside ResourceHost. */
export interface CssFacts {
  readonly files: readonly AuthoredCssFile[];
  readonly declarations: readonly CssDeclarationFact[];
  readonly selectors: readonly CssSelectorFact[];
  readonly selectorHooks: readonly CssSelectorHookFact[];
  readonly statements: readonly CssStatementAtRuleFact[];
  readonly customPropertyDefinitions: readonly CssCustomPropertyDefinitionFact[];
  readonly customPropertyReferences: readonly CssCustomPropertyReferenceFact[];
  readonly population: CssFactPopulation;
}
