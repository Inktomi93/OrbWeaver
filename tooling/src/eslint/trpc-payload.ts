// Every tRPC input is strict, and TypeScript checks excess keys only on a fresh object literal, so a typed value
// (a form or view type spread or passed whole) can carry a key the input refuses at the server. This rule finds it.
// Keys the tRPC client adds after the call (`direction`, `lastEventId`) never appear here; the inputs declare them.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";

// The tRPC client calls whose first argument is a procedure input.
const TRPC_PAYLOAD_METHODS: ReadonlySet<string> = new Set(["mutate", "mutateAsync", "queryOptions", "infiniteQueryOptions", "queryKey", "subscriptionOptions"]);

const factoryMessage = (keys: readonly string[]): string =>
  `These mutation variables carry ${keys.map((key) => `\`${key}\``).join(", ")}, which the procedure input does not declare, and the factory sends the variables whole, so the strict input refuses the call. Type the variables as the router input (\`inferInput<Trpc[...]>\`) and read client-only scope from elsewhere.`;

const message = (keys: readonly string[]): string =>
  `This tRPC payload carries ${keys.map((key) => `\`${key}\``).join(", ")}, which the procedure input does not declare, so the strict input refuses the call. Build the payload from the router input type (a fresh literal, or a value typed from \`inferInput<Trpc[...]>\`), never from a form or view type.`;

// The keys of a type's object members, or null when one is open (an index signature, an array, a function): an open
// member can carry any key. A primitive member (a skip token, a literal) holds no keys and is passed over.
function keysOf(checker: ts.TypeChecker, type: ts.Type): ReadonlySet<string> | null {
  const names = new Set<string>();
  for (const member of type.isUnion() ? type.types : [type]) {
    // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
    if ((member.flags & ts.TypeFlags.Object) === 0) {
      continue;
    }
    const open = checker.isArrayLikeType(member) || member.getCallSignatures().length > 0;
    if (open || member.getStringIndexType() !== undefined || member.getNumberIndexType() !== undefined) {
      return null;
    }
    for (const property of checker.getPropertiesOfType(member)) {
      names.add(property.getName());
    }
  }
  return names;
}

function propertyType(checker: ts.TypeChecker, target: ts.Type, name: string, at: ts.Node): ts.Type | null {
  const types = (target.isUnion() ? target.types : [target]).flatMap((member) => {
    const symbol = checker.getPropertyOfType(member, name);
    return symbol === undefined ? [] : [checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, at))];
  });
  const [first] = types;
  return first ?? null;
}

// The keys `expression` carries that `target` does not declare, walking fresh literals so a nested value is judged
// against its own field's type. A fresh literal's own keys are TypeScript's to refuse.
function undeclaredKeys(checker: ts.TypeChecker, expression: ts.Expression, target: ts.Type): readonly string[] {
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return undeclaredKeys(checker, expression.expression, target);
  }
  if (ts.isConditionalExpression(expression)) {
    return [...undeclaredKeys(checker, expression.whenTrue, target), ...undeclaredKeys(checker, expression.whenFalse, target)];
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.flatMap((property) => {
      if (ts.isSpreadAssignment(property)) {
        return undeclaredKeys(checker, property.expression, target);
      }
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        const field = propertyType(checker, target, property.name.text, property);
        return field === null ? [] : undeclaredKeys(checker, property.initializer, field).map((key) => `${property.name.getText()}.${key}`);
      }
      return [];
    });
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const element = checker.isArrayLikeType(target) ? checker.getIndexTypeOfType(target, ts.IndexKind.Number) : undefined;
    return element === undefined ? [] : expression.elements.flatMap((item) => (ts.isSpreadElement(item) ? [] : undeclaredKeys(checker, item, element)));
  }
  const declared = keysOf(checker, target);
  const carried = keysOf(checker, checker.getTypeAtLocation(expression));
  if (declared === null || carried === null || declared.size === 0) {
    return [];
  }
  return [...carried].filter((key) => !declared.has(key));
}

// The first parameter of a type's `mutationFn` member: the variables a mutation's options accept.
function mutationVariables(checker: ts.TypeChecker, type: ts.Type, at: ts.Node): ts.Type | null {
  const member = checker.getPropertyOfType(checker.getNonNullableType(type), "mutationFn");
  const [signature] = member === undefined ? [] : checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(member, at)).getCallSignatures();
  const [variables] = signature?.getParameters() ?? [];
  return variables === undefined ? null : checker.getTypeOfSymbolAtLocation(variables, at);
}

// A mutation factory config (`{ options: (trpc) => trpc.x.y.mutationOptions(), … }`) whose declared variables carry a
// key the procedure input does not declare: the factory sends the variables whole, so the key reaches the server.
function factoryVariableKeys(checker: ts.TypeChecker, config: ts.Expression): readonly string[] {
  if (!ts.isObjectLiteralExpression(config)) {
    return [];
  }
  const options = config.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText() === "options");
  const factory = options !== undefined && ts.isPropertyAssignment(options) ? options.initializer : undefined;
  if (factory === undefined || !ts.isArrowFunction(factory) || ts.isBlock(factory.body)) {
    return [];
  }
  const declared = checker.getContextualType(factory.body);
  const input = mutationVariables(checker, checker.getTypeAtLocation(factory.body), factory.body);
  const variables = declared === undefined ? null : mutationVariables(checker, declared, factory.body);
  if (input === null || variables === null) {
    return [];
  }
  const accepted = keysOf(checker, input);
  const carried = keysOf(checker, variables);
  return accepted === null || carried === null || accepted.size === 0 ? [] : [...carried].filter((key) => !accepted.has(key));
}

/** Refuses a tRPC call, or a mutation factory's variables, carrying a key the procedure input does not declare. */
export const trpcPayloadKeysRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = context.sourceCode.parserServices;
    const program = services?.program ?? null;
    const toTs = services?.esTreeNodeToTSNodeMap;
    if (program === null || toTs === undefined) {
      return {};
    }
    const checker = program.getTypeChecker();
    const judgeFactory = (config: TSESTree.ObjectExpression): void => {
      const expression = toTs.get(config);
      const carried = ts.isExpression(expression) ? factoryVariableKeys(checker, expression) : [];
      if (carried.length > 0) {
        context.report({ node: config, message: factoryMessage(carried) });
      }
    };
    const judgeCall = (payload: TSESTree.Expression): void => {
      const expression = toTs.get(payload);
      const target = ts.isExpression(expression) ? checker.getContextualType(expression) : undefined;
      if (target === undefined || !ts.isExpression(expression)) {
        return;
      }
      const keys = undeclaredKeys(checker, expression, checker.getNonNullableType(target));
      if (keys.length > 0) {
        context.report({ node: payload, message: message(keys) });
      }
    };
    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        const [payload] = node.arguments;
        if (payload?.type === "ObjectExpression") {
          judgeFactory(payload);
        }
        const callee = node.callee;
        if (
          payload !== undefined &&
          payload.type !== "SpreadElement" &&
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          TRPC_PAYLOAD_METHODS.has(callee.property.name)
        ) {
          judgeCall(payload);
        }
      },
    };
  },
};
