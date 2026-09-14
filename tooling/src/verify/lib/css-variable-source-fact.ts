// Dispatcher-fed source evidence for CSS custom-property literals and CSSProperties writers.
// Static-class flow remains owned by staticClassFact; this provider preserves the distinct literal and
// writer arms that are not class facts without a gate-local descendant walk.
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { CssVariableSite } from "./css-var-resolution.ts";
import { inventoryCssVariableSourceNode } from "./css-var-resolution.ts";

export interface CssVariableSourceFact {
  readonly definitions: ReadonlySet<string>;
  readonly definitionSites: readonly CssVariableSite[];
  readonly references: readonly CssVariableSite[];
}

const KINDS = [SyntaxKind.PropertyAssignment, SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateExpression] as const;

function unique(sites: readonly CssVariableSite[]): readonly CssVariableSite[] {
  return [...new Map(sites.map((site) => [`${site.file}:${site.line}:${site.column}:${site.name}`, site])).values()];
}

export const cssVariableSourceFact = defineFact({
  id: "css-variable-source",
  population: "@frontend",
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const definitions = new Set<string>();
    const definitionSites: CssVariableSite[] = [];
    const references: CssVariableSite[] = [];
    return {
      visitors: [
        {
          kinds: KINDS,
          visit: (node) => {
            inventoryCssVariableSourceNode(node, ctx.relativePath(node.getSourceFile()), { definitions, definitionSites, references });
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "css-variable-source", members: ctx.files.length });
        return { definitions, definitionSites: unique(definitionSites), references: unique(references) };
      },
    };
  },
});
