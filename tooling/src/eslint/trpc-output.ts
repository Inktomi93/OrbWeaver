// Every tRPC output is strict, but a spread or a wider typed value passes tsc and fails at runtime. A resolver is judged
// whole; any other returned literal, a value bound to an annotated contract-typed variable, and an element pushed onto a
// contract-typed array are judged for their spreads. An ordinary call argument is an input to someone else, so it is not judged.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { excessKeys, undeclaredKeys } from "./type-keys.ts";

// The procedure builder calls whose function argument is a resolver.
const RESOLVER_METHODS: ReadonlySet<string> = new Set(["query", "mutation"]);

/** The path of a wire or port shape: the contracts package or a domain's `contract/` folder. */
export const CONTRACT_FILE = /\/packages\/contracts\/|\/contract\//u;

const message = (keys: readonly string[], resolver: boolean): string =>
  `This ${resolver ? "resolver" : "return"} carries ${keys.map((key) => `\`${key}\``).join(", ")}, which the declared ${resolver ? "procedure output" : "contract type"} does not declare, and the strict output refuses an undeclared key at runtime. Build the value from the declared type: name each field, or omit the extra keys before the spread.`;

const members = (type: ts.Type): readonly ts.Type[] => (type.isUnion() ? type.types : [type]);

/** Whether a type is declared under the contracts package or a domain's `contract/` folder. */
export function declaredHere(type: ts.Type): boolean {
  const declarations = (type.aliasSymbol ?? type.getSymbol())?.getDeclarations() ?? [];
  return declarations.some((declaration) => CONTRACT_FILE.test(declaration.getSourceFile().fileName));
}

/** Whether a type, or the element of an array of it, is declared under the contracts package or a `contract/` folder.
 *  One array level deep: a recursive element type (a JSON value) would otherwise never end. */
export function declaredInContract(checker: ts.TypeChecker, type: ts.Type): boolean {
  return members(type).some((member) => {
    const element = checker.isArrayLikeType(member) ? checker.getIndexTypeOfType(member, ts.IndexKind.Number) : undefined;
    return element === undefined ? declaredHere(member) : members(element).some(declaredHere);
  });
}

// A function-valued member marks a dependency bundle: the strict output parses JSON, so no wire shape can declare one.
const carriesFunction = (checker: ts.TypeChecker, type: ts.Type, at: ts.Node): boolean =>
  members(type).some((member) =>
    checker
      .getPropertiesOfType(member)
      .some((property) => checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, at)).getCallSignatures().length > 0),
  );

const isWireContract = (checker: ts.TypeChecker, type: ts.Type, at: ts.Node): boolean =>
  declaredInContract(checker, type) && !carriesFunction(checker, type, at);

const isNamed = (property: TSESTree.Node, name: string): boolean => property.type === AST_NODE_TYPES.Identifier && property.name === name;

function isResolver(node: TSESTree.Node): boolean {
  const call = node.parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === node &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    call.callee.property.type === AST_NODE_TYPES.Identifier &&
    RESOLVER_METHODS.has(call.callee.property.name)
  );
}

function enclosingFunction(node: TSESTree.Node): TSESTree.Node | null {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    if (at.type === AST_NODE_TYPES.ArrowFunctionExpression || at.type === AST_NODE_TYPES.FunctionExpression || at.type === AST_NODE_TYPES.FunctionDeclaration) {
      return at;
    }
  }
  return null;
}

/** Refuses a tRPC resolver, or a return, annotated variable or array push typed by a contract, carrying a key the declared output type does not declare. */
export const trpcOutputKeysRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = context.sourceCode.parserServices;
    const program = services?.program ?? null;
    const toTs = services?.esTreeNodeToTSNodeMap;
    if (program === null || toTs === undefined) {
      return {};
    }
    const checker = program.getTypeChecker();
    // A `.map` or `.flatMap` callback is typed by inference, so its own contextual return type is a bare type parameter; the element
    // type it must produce is the one the mapped array is headed for.
    const mappedElement = (owner: TSESTree.Node | null): ts.Type | undefined => {
      const call = owner?.parent;
      if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== owner || call.callee.type !== AST_NODE_TYPES.MemberExpression) {
        return undefined;
      }
      const flat = isNamed(call.callee.property, "flatMap");
      if (!(flat || isNamed(call.callee.property, "map"))) {
        return undefined;
      }
      const mapped = toTs.get(call);
      const destination = ts.isSpreadElement(mapped.parent) ? mapped.parent.parent : mapped;
      const array = ts.isExpression(destination) ? checker.getContextualType(destination) : undefined;
      if (array === undefined || !checker.isArrayLikeType(array)) {
        return undefined;
      }
      // A flatMap callback returns arrays of the destination's elements, so its target is the array itself.
      return flat ? array : checker.getIndexTypeOfType(array, ts.IndexKind.Number);
    };
    const judge = (returned: TSESTree.Expression, owner: TSESTree.Node | null): void => {
      const expression = toTs.get(returned);
      const own = ts.isExpression(expression) ? checker.getContextualType(expression) : undefined;
      const contextual = mappedElement(owner) ?? own;
      if (contextual === undefined || !ts.isExpression(expression)) {
        return;
      }
      const target = checker.getNonNullableType(checker.getAwaitedType(contextual) ?? contextual);
      const resolver = owner !== null && isResolver(owner);
      if (!(resolver || isWireContract(checker, target, expression))) {
        return;
      }
      const keys = undeclaredKeys(checker, expression, target, resolver);
      if (keys.length > 0) {
        context.report({ node: returned, message: message(keys, resolver) });
      }
    };
    // A resolver passed by name has no return to walk; its signature's result is compared with the output it must fit.
    const judgeHandler = (argument: TSESTree.Node): void => {
      const handler = toTs.get(argument);
      const expected = ts.isExpression(handler) ? checker.getContextualType(handler) : undefined;
      const [declared] = expected?.getCallSignatures() ?? [];
      const [given] = checker.getTypeAtLocation(handler).getCallSignatures();
      if (declared === undefined || given === undefined) {
        return;
      }
      const keys = excessKeys(checker, checker.getReturnTypeOfSignature(given), checker.getReturnTypeOfSignature(declared));
      if (keys.length > 0) {
        context.report({ node: argument, message: message(keys, true) });
      }
    };
    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        const [handler] = node.arguments;
        const callee = node.callee;
        // `push` onto a contract-typed array builds that array's output; any other argument is someone else's input.
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          isNamed(callee.property, "push") &&
          checker.isArrayLikeType(checker.getTypeAtLocation(toTs.get(callee.object)))
        ) {
          for (const argument of node.arguments) {
            if (argument.type !== AST_NODE_TYPES.SpreadElement) {
              judge(argument, null);
            }
          }
        }
        if (
          handler !== undefined &&
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          RESOLVER_METHODS.has(callee.property.name) &&
          (handler.type === AST_NODE_TYPES.Identifier || handler.type === AST_NODE_TYPES.MemberExpression)
        ) {
          judgeHandler(handler);
        }
      },
      VariableDeclarator: (node: TSESTree.VariableDeclarator): void => {
        if (node.id.typeAnnotation !== undefined && node.init !== null) {
          judge(node.init, null);
        }
      },
      ReturnStatement: (node: TSESTree.ReturnStatement): void => {
        if (node.argument !== null) {
          judge(node.argument, enclosingFunction(node));
        }
      },
      ArrowFunctionExpression: (node: TSESTree.ArrowFunctionExpression): void => {
        if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
          judge(node.body, node);
        }
      },
    };
  },
};
