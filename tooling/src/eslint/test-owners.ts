// A root has one owner. `OWNED_DB_RESTRICTIONS` in eslint.config.ts judges each acquisition by its helper's name, so a
// file-local helper that returns one (`localRoot()`, `harness()`) hides it. This rule makes every such helper, and every
// helper over one, an acquisition its callers must own.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { staticName, unwrapped } from "./test-derivation.ts";

/** Every helper that builds and returns a root its caller must own: a new one joins this list in the change that adds it. */
export const OWNED_ROOT_ACQUISITIONS = [
  "createServerHarness",
  "createChatRoot",
  "createFirstBootHarness",
  "createCorpusHarness",
  "createAuthModeRoot",
  "createRuntimeRoot",
  "conformanceRoot",
  "coreHttpRoom",
  "coreDispatchRoom",
  "textRoom",
  "followupRoom",
  "personaRoom",
  "turnToolsRoom",
  "signedInBox",
] as const;

const OWNED_ROOT_MESSAGE =
  "This helper returns a root, so it has one owner. Write `await using root = await helper()`, pass it to a stack's `.use(...)`, or return it from a helper that owns it.";
const SETUP_HOOKS = new Set(["beforeAll", "beforeEach"]);

function calleeName(call: TSESTree.CallExpression): string | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression ? staticName(callee) : undefined;
}

type Helper = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

function helperName(helper: Helper): string | undefined {
  if (helper.type === AST_NODE_TYPES.FunctionDeclaration) {
    return helper.id?.name;
  }
  const { parent } = helper;
  return parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier ? parent.id.name : undefined;
}

// The callee a returned value calls, through an `await`: `return createServerHarness()` and `async () => await textRoom()`.
function returnedCallee(node: TSESTree.Node): string | undefined {
  const value = unwrapped(node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node);
  return value.type === AST_NODE_TYPES.CallExpression ? calleeName(value) : undefined;
}

const isFunction = (node: TSESTree.Node): node is Helper =>
  node.type === AST_NODE_TYPES.FunctionDeclaration || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.ArrowFunctionExpression;

// The callees each named helper hands back: an arrow's expression body, and the argument of each `return` that belongs to it.
function returnedCallees(returns: readonly (readonly [Helper, TSESTree.Node])[]): ReadonlyMap<string, ReadonlySet<string>> {
  const byHelper = new Map<string, Set<string>>();
  for (const [helper, value] of returns) {
    const name = helperName(helper);
    const callee = returnedCallee(value);
    if (name !== undefined && callee !== undefined) {
      byHelper.set(name, (byHelper.get(name) ?? new Set()).add(callee));
    }
  }
  return byHelper;
}

// Helpers that return an acquisition, to a fixpoint: a helper over a helper is one too.
function aliasesOf(byHelper: ReadonlyMap<string, ReadonlySet<string>>): ReadonlySet<string> {
  const acquisitions = new Set<string>(OWNED_ROOT_ACQUISITIONS);
  const aliases = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, callees] of byHelper) {
      if (!acquisitions.has(name) && [...callees].some((callee) => acquisitions.has(callee))) {
        acquisitions.add(name);
        aliases.add(name);
        grew = true;
      }
    }
  }
  return aliases;
}

function isSetupHook(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.CallExpression && SETUP_HOOKS.has(calleeName(node) ?? "");
}

// The positions the name-keyed rule accepts, mirrored: a `using` declaration, a stack's `.use(await ...)`, a return, an
// arrow body, `expect(...).rejects`, and an assignment in a setup hook its teardown disposes.
function isOwned(call: TSESTree.CallExpression): boolean {
  const awaited = call.parent.type === AST_NODE_TYPES.AwaitExpression ? call.parent : undefined;
  const site = awaited ?? call;
  const { parent } = site;
  const usingDeclarator = (node: TSESTree.Node): boolean => node.type === AST_NODE_TYPES.VariableDeclarator && node.parent.kind.endsWith("using");
  if (awaited !== undefined && (usingDeclarator(parent) || (parent.type === AST_NODE_TYPES.ConditionalExpression && usingDeclarator(parent.parent)))) {
    return true;
  }
  if (awaited !== undefined && parent.type === AST_NODE_TYPES.CallExpression && calleeName(parent) === "use") {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.ReturnStatement || parent.type === AST_NODE_TYPES.ArrowFunctionExpression) {
    return true;
  }
  if (
    awaited === undefined &&
    parent.type === AST_NODE_TYPES.CallExpression &&
    calleeName(parent) === "expect" &&
    parent.parent.type === AST_NODE_TYPES.MemberExpression &&
    staticName(parent.parent) === "rejects"
  ) {
    return true;
  }
  const statement = parent.type === AST_NODE_TYPES.AssignmentExpression ? parent.parent : undefined;
  const hook = statement?.type === AST_NODE_TYPES.ExpressionStatement ? statement.parent.parent : undefined;
  return awaited !== undefined && hook?.type === AST_NODE_TYPES.ArrowFunctionExpression && isSetupHook(hook.parent);
}

/** Refuse a call to a file-local helper that returns a root, directly or through another such helper, unless the call
 *  sits where the name-keyed owned-root rule accepts an acquisition. */
export const ownedRootAliasRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const returns: (readonly [Helper, TSESTree.Node])[] = [];
    const calls: TSESTree.CallExpression[] = [];
    return {
      "ArrowFunctionExpression[body]"(node: TSESTree.ArrowFunctionExpression): void {
        if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
          returns.push([node, node.body]);
        }
      },
      "ReturnStatement[argument]"(node: TSESTree.ReturnStatement): void {
        const owner = context.sourceCode.getAncestors(node).findLast(isFunction);
        if (owner !== undefined && node.argument !== null) {
          returns.push([owner, node.argument]);
        }
      },
      "CallExpression[callee]"(node: TSESTree.CallExpression): void {
        calls.push(node);
      },
      "Program:exit"(): void {
        const aliases = aliasesOf(returnedCallees(returns));
        for (const call of calls) {
          const callee = unwrapped(call.callee);
          if (callee.type === AST_NODE_TYPES.Identifier && aliases.has(callee.name) && !isOwned(call)) {
            context.report({ node: call, message: OWNED_ROOT_MESSAGE });
          }
        }
      },
    };
  },
};
