// A narrowed JSON object (`NarrowedJsonObject` in `packages/kit/src/json/index.ts`) is produced only by its owner's
// narrowing. Its brand refuses a literal, a spread and a rest rebuild in tsc; this rule refuses the two forms the type
// cannot: an `Object.assign` whose target or result carries the brand (an intersection is assignable to each of its
// members), and an `as` or angle-bracket assertion to a branded type outside the brand's one mint. The rule keys on the
// kit brand's declaration, never on a type name, so every branded type is covered when it is declared.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import type { FunctionSite } from "./function-site.ts";
import { inFunctionSite } from "./function-site.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

const KIT_JSON = "packages/kit/src/json/index.ts";
const KIT_JSON_FILE = /\/packages\/kit\/src\/json\/index\.ts$/u;
// The private method `JsonNarrowing` declares; a type carries the brand when this member reaches it from the kit.
const BRAND_MEMBER = "jsonNarrowing";

/** The one function that may assert a narrowed type: the parse that mints the brand. */
export const NARROWED_JSON_MINT: FunctionSite = { path: KIT_JSON, name: "narrowJsonObject" };

const ASSIGN_MESSAGE =
  "Object.assign returns an intersection, so it carries a narrowed JSON brand onto an object the narrowing never parsed. Build the object with a spread and pass it through its owner's narrowing function.";
const ASSERTION_MESSAGE =
  "An assertion to a narrowed JSON type skips its owner's narrowing. Call the owner's narrowing function (narrowPersonaMetadata, narrowEntryMetadata), which parses the value.";

function carriesBrand(checker: ts.TypeChecker, type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some((part) => carriesBrand(checker, part));
  }
  const member = checker.getPropertyOfType(type, BRAND_MEMBER);
  return (member?.declarations ?? []).some((declaration) => KIT_JSON_FILE.test(declaration.getSourceFile().fileName.replaceAll("\\", "/")));
}

const isObjectAssign = (callee: TSESTree.Expression): boolean =>
  callee.type === AST_NODE_TYPES.MemberExpression &&
  callee.object.type === AST_NODE_TYPES.Identifier &&
  callee.object.name === "Object" &&
  ((!callee.computed && callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === "assign") ||
    (callee.property.type === AST_NODE_TYPES.Literal && callee.property.value === "assign"));

/** Refuses `Object.assign` onto or into a narrowed JSON type, and an assertion to one outside {@link NARROWED_JSON_MINT}. */
export const narrowedJsonBrandRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    const branded = (node: TSESTree.Node): boolean => carriesBrand(checker, checker.getTypeAtLocation(toTs.get(node)));
    const assertion = (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion): void => {
      const target = checker.getTypeFromTypeNode(toTs.get(node.typeAnnotation) as ts.TypeNode);
      if (carriesBrand(checker, target) && !inFunctionSite(context, node, [NARROWED_JSON_MINT])) {
        context.report({ node, message: ASSERTION_MESSAGE });
      }
    };
    const assign = (node: TSESTree.CallExpression): void => {
      const [target] = node.arguments;
      if (isObjectAssign(node.callee) && ((target !== undefined && branded(target)) || branded(node))) {
        context.report({ node, message: ASSIGN_MESSAGE });
      }
    };
    return { CallExpression: assign, TSAsExpression: assertion, TSTypeAssertion: assertion };
  },
};
