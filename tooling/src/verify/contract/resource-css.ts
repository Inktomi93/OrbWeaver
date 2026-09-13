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

export type CssSelectorHookFact =
  | (CssSourcePosition & { readonly kind: "class"; readonly name: string })
  | (CssSourcePosition & {
      readonly kind: "data";
      readonly name: string;
      readonly operator: "presence" | "=" | "^=" | "$=" | "*=" | "~=" | "|=";
      readonly value: string | undefined;
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
