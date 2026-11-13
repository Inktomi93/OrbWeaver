// `orb/viewer-visibility-parameter-checked`: a viewer visibility answer opens a room's pre-join and hidden canon, so a
// function that takes one from its caller must prove it is the resolver's answer for the chat it reads. The brand stops
// a hand-built answer in tsc, but a spread copy keeps the brand, and an answer for another room has the right type. Only
// the registry's identity and chat check refuses those, so a parameter that carries an answer runs that check first.
//
// The type cannot hold this: the self-resolving reads read the resolver's answer directly, so any "checked" type
// state is one a new function can skip by declaring the plain type. The rule keys on the brand's declaration, never on
// a type name, so a look-alike brand declared elsewhere is not the answer and a nullable answer still is.
import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES as T } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import type { FunctionSite } from "./function-site.ts";
import { inFunctionSite } from "./function-site.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath } from "./syntax.ts";

const BRAND_HOME = /\/packages\/contracts\/src\/chat\/owner-ops\.ts$/u;
const BRAND_NAME = "viewerVisibilityBrand";
const REGISTRY = "packages/server/src/domain/chat/substrate/viewer-visibility-registry.ts";
const CHECK = "assertResolvedVisibility";

/** The check itself takes the answer it judges. */
export const VISIBILITY_CHECK_SITE: FunctionSite = { path: REGISTRY, name: CHECK };

const MESSAGE =
  "A function that takes a viewer visibility answer runs assertResolvedVisibility on it as a top-level statement before any other use, or passes it whole to a read that does. Outside chat, resolve the answer through the injected resolveViewerVisibility op instead of taking it as a parameter.";

type FunctionNode = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

// A binding that holds the answer, either whole (`member` null) or as one property (`opts.visibility`).
interface Carrier {
  readonly variable: TSESLint.Scope.Variable;
  readonly member: string | null;
}

function carriesBrand(type: ts.Type, checker: ts.TypeChecker): boolean {
  const target = checker.getNonNullableType(type);
  if (target.isUnion()) {
    return target.types.some((part) => carriesBrand(part, checker));
  }
  return checker
    .getPropertiesOfType(target)
    .some((property) =>
      (property.declarations ?? []).some(
        (declaration) =>
          ts.isPropertySignature(declaration) &&
          ts.isComputedPropertyName(declaration.name) &&
          ts.isIdentifier(declaration.name.expression) &&
          declaration.name.expression.text === BRAND_NAME &&
          BRAND_HOME.test(posixPath(declaration.getSourceFile().fileName)),
      ),
    );
}

// The properties of a parameter's object type that carry the answer: an options bag one level deep.
function carryingMembers(type: ts.Type, checker: ts.TypeChecker): readonly string[] {
  const target = checker.getNonNullableType(type);
  if (target.isUnion()) {
    return [...new Set(target.types.flatMap((part) => carryingMembers(part, checker)))];
  }
  return checker.getPropertiesOfType(target).flatMap((property) => {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    return declaration !== undefined && carriesBrand(checker.getTypeOfSymbolAtLocation(property, declaration), checker) ? [property.getName()] : [];
  });
}

const bindingOf = (node: TSESTree.Node): TSESTree.Node => (node.type === T.AssignmentPattern ? node.left : node);

function aliased(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

/** Refuses a function whose parameter carries a viewer visibility answer it neither checks first nor only forwards. */
export const viewerVisibilityParameterRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    const typeOf = (node: TSESTree.Node): ts.Type => checker.getTypeAtLocation(toTs.get(node));
    const variableOf = (fn: FunctionNode, name: string): TSESLint.Scope.Variable | undefined =>
      context.sourceCode.getDeclaredVariables(fn).find((variable) => variable.name === name);

    const isCheck = (call: TSESTree.CallExpression): boolean => {
      const symbol = aliased(checker, checker.getSymbolAtLocation(toTs.get(call.callee)));
      return (
        symbol?.getName() === CHECK &&
        (symbol.declarations ?? []).some((declaration) => posixPath(declaration.getSourceFile().fileName).endsWith(`/${REGISTRY}`))
      );
    };

    // The carriers one binding holds, or null when it holds the answer in a shape the rule cannot follow (a nested
    // pattern), which is reported rather than passed.
    const carriersAt = (fn: FunctionNode, node: TSESTree.Node): readonly Carrier[] | null => {
      const type = typeOf(node);
      const members = carriesBrand(type, checker) ? [null] : carryingMembers(type, checker);
      if (members.length === 0) {
        return [];
      }
      const variable = node.type === T.Identifier ? variableOf(fn, node.name) : undefined;
      return variable === undefined ? null : members.map((member) => ({ variable, member }));
    };

    const carriersOf = (fn: FunctionNode, param: TSESTree.Parameter): readonly Carrier[] | null => {
      const bound = bindingOf(param.type === T.TSParameterProperty ? param.parameter : param);
      if (bound.type !== T.ObjectPattern) {
        return carriersAt(fn, bound);
      }
      const found = bound.properties.map((property) => carriersAt(fn, bindingOf(property.type === T.Property ? property.value : property.argument)));
      return found.includes(null) ? null : found.flatMap((carriers) => carriers ?? []);
    };

    const answerOf = (node: TSESTree.Node, carrier: Carrier): boolean => {
      if (carrier.member === null) {
        return node.type === T.Identifier && carrier.variable.references.some((reference) => reference.identifier === node);
      }
      return (
        node.type === T.MemberExpression &&
        !node.computed &&
        node.property.type === T.Identifier &&
        node.property.name === carrier.member &&
        node.object.type === T.Identifier &&
        carrier.variable.references.some((reference) => reference.identifier === node.object)
      );
    };

    // Where the first check of the carrier starts. A check counts only as its own statement in the function's
    // top-level body, so no branch can skip it.
    const checkedFrom = (fn: FunctionNode, carrier: Carrier): number => {
      if (fn.body.type !== T.BlockStatement) {
        return Number.POSITIVE_INFINITY;
      }
      for (const statement of fn.body.body) {
        if (statement.type !== T.ExpressionStatement || statement.expression.type !== T.CallExpression || !isCheck(statement.expression)) {
          continue;
        }
        const [answer] = statement.expression.arguments;
        if (answer !== undefined && answerOf(answer, carrier)) {
          return statement.range[0];
        }
      }
      return Number.POSITIVE_INFINITY;
    };

    // A whole binding handed to a call whose parameter there also carries the answer: that callee's parameter is judged
    // in its own file. A parameter typed `unknown` or `object` is not judged, so a hand-off to it is a use.
    const forwarded = (identifier: TSESTree.Node): boolean => {
      const { parent } = identifier;
      if (parent?.type !== T.CallExpression) {
        return false;
      }
      const index = parent.arguments.findIndex((argument) => argument === identifier);
      const signature = index === -1 ? undefined : checker.getResolvedSignature(toTs.get(parent));
      const target = signature?.parameters[index];
      const declaration = target?.valueDeclaration;
      if (target === undefined || declaration === undefined) {
        return false;
      }
      const type = checker.getTypeOfSymbolAtLocation(target, declaration);
      return carriesBrand(type, checker) || carryingMembers(type, checker).length > 0;
    };

    // A use is safe after the check, or when it forwards the whole binding to a judged parameter.
    const unchecked = (fn: FunctionNode, carrier: Carrier): boolean => {
      const checkedAt = checkedFrom(fn, carrier);
      return carrier.variable.references.some(({ identifier }) => {
        if (identifier.range[0] >= checkedAt || forwarded(identifier)) {
          return false;
        }
        const { parent } = identifier;
        // Another property of an options bag is not the answer.
        const otherMember =
          carrier.member !== null &&
          parent.type === T.MemberExpression &&
          parent.object === identifier &&
          !parent.computed &&
          parent.property.type === T.Identifier &&
          parent.property.name !== carrier.member;
        return !otherMember;
      });
    };

    const judge = (fn: FunctionNode): void => {
      if (inFunctionSite(context, fn, [VISIBILITY_CHECK_SITE])) {
        return;
      }
      for (const param of fn.params) {
        const carriers = carriersOf(fn, param);
        if (carriers === null || carriers.some((carrier) => unchecked(fn, carrier))) {
          context.report({ node: param, message: MESSAGE });
        }
      }
    };

    return { FunctionDeclaration: judge, FunctionExpression: judge, ArrowFunctionExpression: judge };
  },
};
