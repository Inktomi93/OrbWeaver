// A projection that copies a closed role, kind or status keeps the producer's vocabulary.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const AXIS_NAME = /^(?:kind|status|role)$|[a-z](?:Kind|Status|Role)$/u;

function projectedType(checker: ts.TypeChecker, property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment, name: string): ts.Type | undefined {
  if (ts.isShorthandPropertyAssignment(property)) {
    const symbol = checker.getShorthandAssignmentValueSymbol(property);
    return symbol === undefined ? undefined : checker.getTypeOfSymbolAtLocation(symbol, property.name);
  }
  const value = property.initializer;
  if (ts.isIdentifier(value) && value.text === name) {
    return checker.getTypeAtLocation(value);
  }
  if (ts.isPropertyAccessExpression(value) && value.name.text === name) {
    return checker.getTypeAtLocation(value);
  }
  if (ts.isElementAccessExpression(value) && ts.isStringLiteralLike(value.argumentExpression) && value.argumentExpression.text === name) {
    return checker.getTypeAtLocation(value);
  }
  return undefined;
}

function axisName(name: ts.PropertyName): string | undefined {
  return (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && AXIS_NAME.test(name.text) ? name.text : undefined;
}

export const closedVocabularyRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { program, checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    return {
      "ObjectExpression > Property"(node: TSESTree.Property): void {
        const property = toTs.get(node);
        if (!(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))) {
          return;
        }
        const name = axisName(property.name);
        if (name === undefined) {
          return;
        }
        const source = projectedType(checker, property, name);
        const vocabulary = source === undefined ? undefined : checker.getNonNullableType(source);
        if (vocabulary?.isUnion() !== true || !vocabulary.types.every((part) => part.isStringLiteral())) {
          return;
        }
        const slot = checker.getContextualType(property.parent)?.getProperty(name);
        const field = slot?.valueDeclaration;
        if (slot === undefined || field === undefined || !ts.isPropertySignature(field) || program.isSourceFileFromExternalLibrary(field.getSourceFile())) {
          return;
        }
        const assigned = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(slot, property));
        if (assigned.flags === ts.TypeFlags.String) {
          context.report({ node: node.key, message: `Derive the projected ${name} field from its closed source vocabulary.` });
        }
      },
    };
  },
};
