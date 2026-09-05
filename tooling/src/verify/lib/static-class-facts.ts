// Public final-runtime class/JSX fact boundary; allocate once in GatePolicy.create and stream visitors.
import { SyntaxKind } from "ts-morph";
import type { StaticClassFactReader } from "./static-class-fact-collector.ts";
import { createStaticClassFactReader as createReader } from "./static-class-fact-collector.ts";

export const STATIC_CLASS_FACT_KINDS = [
  SyntaxKind.JsxAttribute,
  SyntaxKind.JsxSpreadAttribute,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.CallExpression,
] as const;

export function createStaticClassFactReader(): StaticClassFactReader {
  return createReader();
}
