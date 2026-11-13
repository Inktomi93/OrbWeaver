// A recorder is a test's own history of what an edge received. Its newest entry is the previous act's when the act
// under test sent nothing, so a tail read of a recorder, under any spelling or alias, proves nothing about that act.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, TSESLint } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";
import { constInitOf, staticName, unwrapped } from "./test-derivation.ts";

// The names the tests give their recorders. A name joins this list in the change that adds a recorder under it.
const RECORDER = /^(requests|calls|errors|tokens|idTokens|children|funders|authorizations|prompts|asked|sent|saved|[A-Za-z]*[bB]odies)$/u;
// A view of the whole history, so its tail is still the history's tail. `slice(mark)` is the bracket, so it is not one.
const WHOLE_VIEWS = new Set(["map", "filter", "flatMap"]);
const TAIL_SEARCHES = new Set(["findLast", "findLastIndex"]);

const TAIL_MESSAGE =
  "The newest recorded entry is the previous act's when this act sent none. Bracket the act: wireOf(h, act) or quietOf(h, act) from tests/server/domain/chat/scenario-physical.ts, appendedBy(log, act) from @orb/testkit/iso, or the act's own `newest`.";

const isNegative = (node: TSESTree.Node | undefined): boolean =>
  node?.type === AST_NODE_TYPES.UnaryExpression && node.operator === "-" && node.argument.type === AST_NODE_TYPES.Literal;

// `x.length - 1`, whatever `x` is: the index of the last entry.
const isLastIndex = (node: TSESTree.Node | undefined): boolean =>
  node?.type === AST_NODE_TYPES.BinaryExpression &&
  node.operator === "-" &&
  node.left.type === AST_NODE_TYPES.MemberExpression &&
  staticName(node.left) === "length" &&
  node.right.type === AST_NODE_TYPES.Literal &&
  node.right.value === 1;

// The helpers that return only what one act recorded, each with the modules that export it. The name alone proves
// nothing: a file-local function under it returns whatever it likes, so a bracket is its home's export, imported.
const CHAT_SCENARIO_HOME = /(?:^|\/)scenario-physical\.ts$/u;
const APPENDED_HOME = /^@orb\/testkit\/iso$|(?:^|\/)iso\/non-empty\.ts$/u;
const ACT_BRACKET_HOMES: ReadonlyMap<string, RegExp> = new Map([
  ["wireOf", CHAT_SCENARIO_HOME],
  ["quietOf", CHAT_SCENARIO_HOME],
  ["appendedBy", APPENDED_HOME],
]);

// Whether the callee is a bracket helper's own export, under any local name the import gives it.
function isActBracket(sourceCode: Source, callee: TSESTree.Identifier): boolean {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(callee); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(callee.name);
    if (variable !== undefined) {
      const [definition] = variable.defs;
      if (
        variable.defs.length !== 1 ||
        definition?.type !== TSESLint.Scope.DefinitionType.ImportBinding ||
        definition.parent.type !== AST_NODE_TYPES.ImportDeclaration ||
        definition.node.type !== AST_NODE_TYPES.ImportSpecifier ||
        definition.node.imported.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }
      return ACT_BRACKET_HOMES.get(definition.node.imported.name)?.test(definition.parent.source.value) ?? false;
    }
  }
  return false;
}

// A recorder lives on something that outlasts the act: a binding or a member path. A call's result is that call's own
// value, so `room.prompts()` reads a history only when `room` is held.
function isHeld(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    value.type === AST_NODE_TYPES.Identifier ||
    value.type === AST_NODE_TYPES.ThisExpression ||
    (value.type === AST_NODE_TYPES.MemberExpression && isHeld(value.object))
  );
}

// The `const` initialiser behind an identifier, if it has one.
function initOf(sourceCode: Source, identifier: TSESTree.Identifier): TSESTree.Expression | undefined {
  const declarator = constInitOf(sourceCode, identifier)?.node;
  return declarator?.type === AST_NODE_TYPES.VariableDeclarator && declarator.init !== null ? declarator.init : undefined;
}

// An imported bracket helper's own result, through `await` and `const` bindings. Its fields are the act's entries.
function isActResult(sourceCode: Source, node: TSESTree.Node, seen: Set<TSESTree.Node>): boolean {
  const value = unwrapped(node);
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (value.type === AST_NODE_TYPES.AwaitExpression) {
    return isActResult(sourceCode, value.argument, seen);
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    const init = initOf(sourceCode, value);
    return init !== undefined && isActResult(sourceCode, init, seen);
  }
  return value.type === AST_NODE_TYPES.CallExpression && value.callee.type === AST_NODE_TYPES.Identifier && isActBracket(sourceCode, value.callee);
}

/** Whether the expression holds only one act's entries: a field of a bracket helper's result, `slice(mark)` with the
 *  mark a binding, a whole view of one, or a `const` bound from one. A literal or computed slice start is no mark. */
function isBracketed(sourceCode: Source, node: TSESTree.Node, seen: Set<TSESTree.Node>): boolean {
  const value = unwrapped(node);
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  switch (value.type) {
    case AST_NODE_TYPES.Identifier: {
      const init = initOf(sourceCode, value);
      return init !== undefined && isBracketed(sourceCode, init, seen);
    }
    case AST_NODE_TYPES.AwaitExpression:
      return isActResult(sourceCode, value, new Set());
    case AST_NODE_TYPES.MemberExpression:
      return isActResult(sourceCode, value.object, new Set());
    case AST_NODE_TYPES.CallExpression: {
      const callee = unwrapped(value.callee);
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return isActResult(sourceCode, value, new Set());
      }
      const name = staticName(callee) ?? "";
      const [first] = value.arguments;
      return (
        (name === "slice" && value.arguments.length === 1 && first?.type === AST_NODE_TYPES.Identifier) ||
        (WHOLE_VIEWS.has(name) && isBracketed(sourceCode, callee.object, seen))
      );
    }
    default:
      return false;
  }
}

// Each sub-pattern of a destructure, with the object key it is read under when it has one.
function subPatterns(pattern: TSESTree.Node): readonly (readonly [string | undefined, TSESTree.Node])[] {
  switch (pattern.type) {
    case AST_NODE_TYPES.ObjectPattern:
      return pattern.properties.map((property) =>
        property.type === AST_NODE_TYPES.Property
          ? ([property.key.type === AST_NODE_TYPES.Identifier ? property.key.name : undefined, property.value] as const)
          : ([undefined, property.argument] as const),
      );
    case AST_NODE_TYPES.ArrayPattern:
      return pattern.elements.flatMap((element) => (element === null ? [] : [[undefined, element] as const]));
    case AST_NODE_TYPES.AssignmentPattern:
      return [[undefined, pattern.left]];
    default:
      return [];
  }
}

// The keys a destructure reads on the way to the binding, outermost first; undefined when the binding is not in it.
function keysTo(pattern: TSESTree.Node, name: string): readonly string[] | undefined {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    return pattern.name === name ? [] : undefined;
  }
  for (const [key, child] of subPatterns(pattern)) {
    const found = keysTo(child, name);
    if (found !== undefined) {
      return key === undefined ? found : [key, ...found];
    }
  }
  return undefined;
}

// The name is the floor: a recorder name is a recorder unless a bracket helper bound it. A `const` under another name
// is a recorder when it holds one, by alias or by a destructured recorder key.
function identifierRecorder(sourceCode: Source, identifier: TSESTree.Identifier, seen: Set<TSESTree.Node>): boolean {
  const declarator = constInitOf(sourceCode, identifier)?.node;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init === null) {
    return RECORDER.test(identifier.name);
  }
  const { id, init } = declarator;
  if (isBracketed(sourceCode, init, new Set())) {
    return false;
  }
  if (RECORDER.test(identifier.name)) {
    return true;
  }
  if (id.type === AST_NODE_TYPES.Identifier) {
    return isRecorder(sourceCode, init, seen);
  }
  // `const { requests: sent } = h`: the key names the recorder whatever the binding is called.
  return keysTo(id, identifier.name)?.some((key) => RECORDER.test(key)) ?? false;
}

/** Whether the expression reads a whole recorder: by its name, through a call such as `room.prompts()`, through a
 *  `map` or `filter` over one, or through a `const` that holds one. */
function isRecorder(sourceCode: Source, node: TSESTree.Node, seen: Set<TSESTree.Node> = new Set()): boolean {
  const value = unwrapped(node);
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  switch (value.type) {
    case AST_NODE_TYPES.Identifier:
      return identifierRecorder(sourceCode, value, seen);
    case AST_NODE_TYPES.MemberExpression:
      return RECORDER.test(staticName(value) ?? "") && isHeld(value.object);
    case AST_NODE_TYPES.ArrayExpression:
      return (
        value.elements.length === 1 && value.elements[0]?.type === AST_NODE_TYPES.SpreadElement && isRecorder(sourceCode, value.elements[0].argument, seen)
      );
    case AST_NODE_TYPES.CallExpression: {
      const callee = unwrapped(value.callee);
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      const name = staticName(callee) ?? "";
      return (
        (value.arguments.length === 0 && RECORDER.test(name) && isHeld(callee.object)) || (WHOLE_VIEWS.has(name) && isRecorder(sourceCode, callee.object, seen))
      );
    }
    default:
      return false;
  }
}

/** The receiver a tail read takes its last entry from, or undefined when the node is no tail read. */
function tailReceiver(node: TSESTree.CallExpression | TSESTree.MemberExpression): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return node.computed && isLastIndex(node.property) ? node.object : undefined;
  }
  const callee = unwrapped(node.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const name = staticName(callee) ?? "";
  const [first] = node.arguments;
  const tail =
    TAIL_SEARCHES.has(name) ||
    (name === "pop" && node.arguments.length === 0) ||
    (name === "at" && (isNegative(first) || isLastIndex(first))) ||
    (name === "slice" && node.arguments.length === 1 && isNegative(first));
  return tail ? callee.object : undefined;
}

/** Refuse a tail read of a recorded history: `.at(-1)`, `.at(x.length - 1)`, `[x.length - 1]`, `findLast`, `pop`
 *  (also over a spread copy) and `slice(-n)`, on a recorder by its name or through a `const` alias of one. */
export const noTailRecorderReadRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const judge = (node: TSESTree.CallExpression | TSESTree.MemberExpression): void => {
      const receiver = tailReceiver(node);
      if (receiver !== undefined && isRecorder(context.sourceCode, receiver)) {
        context.report({ node, message: TAIL_MESSAGE });
      }
    };
    return { CallExpression: judge, "MemberExpression[computed=true]": judge };
  },
};
