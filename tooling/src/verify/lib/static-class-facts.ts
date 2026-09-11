// Public final-runtime class/JSX fact boundary; allocate once in GatePolicy.create and stream visitors.
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { StaticClassFactReader } from "./static-class-fact-collector.ts";
import { createStaticClassFactReader as createReader } from "./static-class-fact-collector.ts";

export const STATIC_CLASS_FACT_KINDS = [
  SyntaxKind.JsxAttribute,
  SyntaxKind.JsxSpreadAttribute,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.CallExpression,
  SyntaxKind.Identifier,
  SyntaxKind.JsxOpeningElement,
  SyntaxKind.JsxSelfClosingElement,
] as const;

export function createStaticClassFactReader(files: readonly import("ts-morph").SourceFile[]): StaticClassFactReader {
  return createReader(files);
}

/** One frontend-wide class/JSX derivation shared by every consuming policy. */
export const staticClassFact = defineFact({
  id: "static-class",
  population: "@frontend",
  analysis: "types",
  resources: [],
  create: (context) => {
    const reader = createReader(context.files);
    return {
      visitors: [{ kinds: STATIC_CLASS_FACT_KINDS, visit: reader.visit }],
      finish: () => {
        const facts = reader.finish();
        context.receipt({ kind: "population", source: "static-class-token", members: facts.tokens.length, unresolved: facts.unresolved.length });
        return facts;
      },
    };
  },
});
