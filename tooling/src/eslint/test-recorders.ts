// A recorder is a test's own history of what an edge received. Its newest entry is the previous act's when the act
// under test sent nothing, so a tail read of a recorder, under any spelling or alias, proves nothing about that act.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";
import { constInitOf, staticName, unwrapped } from "./test-derivation.ts";

// The names the tests give their recorders. A name joins this list in the change that adds a recorder under it.
const RECORDER = /^(requests|calls|errors|tokens|idTokens|children|funders|authorizations|prompts|[A-Za-z]*[bB]odies)$/u;
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

// A recorder lives on something that outlasts the act: a binding or a member path. A call's result is that call's own
// value, so `(await wireOf(h, act)).bodies` is the act's bracket, not the history.
function isHeld(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return (
    value.type === AST_NODE_TYPES.Identifier ||
    value.type === AST_NODE_TYPES.ThisExpression ||
    (value.type === AST_NODE_TYPES.MemberExpression && isHeld(value.object))
  );
}

// A `const` is judged by what it holds, and its name only when it holds a fresh list the test records into.
function identifierRecorder(sourceCode: Source, identifier: TSESTree.Identifier, seen: Set<TSESTree.Node>): boolean {
  const declarator = constInitOf(sourceCode, identifier)?.node;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init === null) {
    return RECORDER.test(identifier.name);
  }
  const { id, init } = declarator;
  if (id.type === AST_NODE_TYPES.Identifier) {
    const fresh = init.type === AST_NODE_TYPES.ArrayExpression && init.elements.length === 0;
    return fresh ? RECORDER.test(identifier.name) : isRecorder(sourceCode, init, seen);
  }
  // `const { requests: sent } = h`: the key names the recorder whatever the binding is called.
  return (
    id.type === AST_NODE_TYPES.ObjectPattern &&
    isHeld(init) &&
    id.properties.some(
      (property) =>
        property.type === AST_NODE_TYPES.Property &&
        property.value.type === AST_NODE_TYPES.Identifier &&
        property.value.name === identifier.name &&
        property.key.type === AST_NODE_TYPES.Identifier &&
        RECORDER.test(property.key.name),
    )
  );
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
