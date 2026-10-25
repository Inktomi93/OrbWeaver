import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";

const NAME = /^[A-Za-z][A-Za-z0-9]*$/u;
const API = "api.";
const JS_BUILTINS = "javascript.builtins.";
const GLOBAL_ROOTS = new Set(["window", "globalThis", "self"]);
const CSS_SUPPORTS = /\bCSS\.supports\(/u;
// lib.d.ts spells a static side `XConstructor` and a few instance sides under another name than the compat data does.
const LIB_ALIASES: Readonly<Record<string, string>> = { IteratorObject: "Iterator", ReadonlyArray: "Array", ReadonlyMap: "Map", ReadonlySet: "Set" };
const EXITS = new Set<string>(["ReturnStatement", "ThrowStatement", "ContinueStatement", "BreakStatement"]);

type Lacking = readonly string[];
type Use = "call" | "new" | "chain" | null;

interface SupportIndex {
  /** Global value names some floor lacks (`CSSKeywordValue`, `DisposableStack`). */
  readonly globals: Map<string, Lacking>;
  /** Global constructors whose `new` some floor lacks while the name exists. */
  readonly constructors: Map<string, Lacking>;
  /** member name → declaring interface → lacking browsers. */
  readonly members: Map<string, Map<string, Lacking>>;
}

/** `api.Owner[.member]` and `javascript.builtins.Owner[.member]` as owner/member names; anything else (parameters, events) is not a use. */
function ownerAndMember(key: string): [string, string | undefined] | null {
  const prefix = [API, JS_BUILTINS].find((candidate) => key.startsWith(candidate)) ?? key;
  const parts = key.slice(prefix.length).split(".");
  const [owner, member] = parts;
  return owner !== undefined && parts.length <= 2 && parts.every((part) => NAME.test(part)) ? [owner, member] : null;
}

function indexUnsupported(unsupported: ReadonlyMap<string, Lacking>): SupportIndex {
  const index: SupportIndex = { globals: new Map(), constructors: new Map(), members: new Map() };
  const memberKeys: [string, string, Lacking][] = [];
  for (const [key, lacking] of unsupported) {
    const [owner, member] = ownerAndMember(key) ?? [];
    if (owner === undefined) {
      continue;
    }
    if (member === undefined) {
      index.globals.set(owner, lacking);
    } else if (member === owner) {
      index.constructors.set(owner, lacking);
    } else {
      memberKeys.push([owner, member, lacking]);
    }
  }
  for (const [owner, member, lacking] of memberKeys) {
    // An instance of an owner the browser lacks outright can only come from a path this rule already refuses (or an app-made stand-in).
    const ownerGap = index.globals.get(owner);
    if (ownerGap === undefined || !lacking.every((browser) => ownerGap.includes(browser))) {
      index.members.set(member, (index.members.get(member) ?? new Map()).set(owner, lacking));
    }
  }
  return index;
}

function declaringInterface(symbol: ts.Symbol): string | undefined {
  for (const declaration of symbol.declarations ?? []) {
    const owner = declaration.parent;
    if ((ts.isInterfaceDeclaration(owner) || ts.isClassDeclaration(owner)) && owner.name !== undefined) {
      return LIB_ALIASES[owner.name.text] ?? owner.name.text.replace(/Constructor$/u, "");
    }
  }
  return undefined;
}

function memberName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : undefined;
  }
  return node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value : undefined;
}

/** The use that throws when the thing is missing; a plain read is `undefined` and is not one. */
function throwingUse(node: TSESTree.Node): Use {
  const parent = node.parent;
  if (parent?.type === "CallExpression" && parent.callee === node && !parent.optional) {
    return "call";
  }
  if (parent?.type === "NewExpression" && parent.callee === node) {
    return "new";
  }
  return parent?.type === "MemberExpression" && parent.object === node && !parent.optional ? "chain" : null;
}

function exits(statement: TSESTree.Statement): boolean {
  if (statement.type === "BlockStatement") {
    const last = statement.body.at(-1);
    return last !== undefined && exits(last);
  }
  return EXITS.has(statement.type);
}

function statementsOf(node: TSESTree.Node): readonly TSESTree.Node[] {
  if (node.type === "BlockStatement" || node.type === "Program") {
    return node.body;
  }
  return node.type === "SwitchCase" ? node.consequent : [];
}

/** True when an enclosing branch, short-circuit or earlier exiting `if` tests for the thing `pattern` names. */
function isGuarded(sourceCode: Source, site: TSESTree.Node, pattern: RegExp): boolean {
  const tests = (test: TSESTree.Node): boolean => pattern.test(sourceCode.getText(test)) || CSS_SUPPORTS.test(sourceCode.getText(test));
  let child: TSESTree.Node = site;
  for (let parent = site.parent; parent; child = parent, parent = parent.parent) {
    const branch = (parent.type === "IfStatement" || parent.type === "ConditionalExpression") && child !== parent.test && tests(parent.test);
    const shortCircuit = parent.type === "LogicalExpression" && child === parent.right && tests(parent.left);
    const earlier = statementsOf(parent).slice(0, statementsOf(parent).indexOf(child));
    const bailed = earlier.some((sibling) => sibling.type === "IfStatement" && sibling.alternate === null && exits(sibling.consequent) && tests(sibling.test));
    if (branch || shortCircuit || bailed) {
      return true;
    }
  }
  return false;
}

/** The lib interface declaring the member a property access names, or `undefined` outside the checker's reach. */
function ownerOfMember(context: OrbRuleContext, node: TSESTree.MemberExpression): string | undefined {
  const services = context.sourceCode.parserServices;
  const program = services?.program;
  if (!program || services.esTreeNodeToTSNodeMap === undefined) {
    return undefined;
  }
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  if (!(ts.isPropertyAccessExpression(tsNode) || ts.isElementAccessExpression(tsNode))) {
    return undefined;
  }
  const at = ts.isPropertyAccessExpression(tsNode) ? tsNode.name : tsNode.argumentExpression;
  const symbol = program.getTypeChecker().getSymbolAtLocation(at);
  return symbol === undefined ? undefined : declaringInterface(symbol);
}

/**
 * Refuses a browser API the declared floor (`BROWSER_TARGETS`) lacks in some browser, at the use that throws: a call, a `new`,
 * a member chain through it, or a bare reference to a global it does not define. A plain read is `undefined`, never a crash.
 * Member uses resolve through the type checker to the lib interface that declares the member, so `el.value` and `el.source`
 * are judged by their declaring interface and only the names the compat data flags cost a lookup.
 *
 * A use passes when it is optional (`el.m?.()`), or when an enclosing `if`, `?:`, `&&`, `||` or `??` tests for it, or an
 * earlier `if (...) return|throw|continue|break` in the same block does. A test counts when it contains `"m" in x`, `x.m`
 * or `x?.m` (member), the bare global name (global), or `CSS.supports(`. Polarity is not checked, so keep the guard honest.
 */
export const browserSupportRule = (unsupported: ReadonlyMap<string, Lacking>): OrbRule => {
  const index = indexUnsupported(unsupported);
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const { sourceCode } = context;
      const refuse = (node: TSESTree.Node, what: string, lacking: Lacking): void => {
        context.report({
          node,
          message: `${what} is missing in ${lacking.join(", ")}, which are in the declared browser floor (packages/client/browser-targets.ts); guard it ("x" in el, typeof X, CSS.supports) or drop it.`,
        });
      };
      const checkGlobal = (name: string, use: Use, site: TSESTree.Node): void => {
        // A constructor-only gap (the name exists, `new` does not) matters at the `new` alone.
        const lacking = index.globals.get(name) ?? (use === "new" ? index.constructors.get(name) : undefined);
        if (lacking !== undefined && !isGuarded(sourceCode, site, new RegExp(String.raw`\b${name}\b`, "u"))) {
          refuse(site, `\`${name}\``, lacking);
        }
      };
      const checkLibGlobals = (program: TSESTree.Program): void => {
        const globalScope = sourceCode.getScope(program);
        // typescript-eslint declares lib globals as source-less variables, so their references resolve there, not in `through`.
        const libReferences = globalScope.variables.filter(({ defs }) => defs.length === 0).flatMap(({ references }) => references);
        for (const { identifier, isValueReference } of [...globalScope.through, ...libReferences]) {
          const parent = identifier.parent;
          if (isValueReference !== false && !(parent.type === "UnaryExpression" && parent.operator === "typeof")) {
            checkGlobal(identifier.name, throwingUse(identifier), identifier);
          }
        }
      };
      const checkMember = (node: TSESTree.MemberExpression, name: string): void => {
        const owners = index.members.get(name);
        const owner = owners === undefined ? undefined : ownerOfMember(context, node);
        const lacking = owner === undefined ? undefined : owners?.get(owner);
        if (owner !== undefined && lacking !== undefined && !isGuarded(sourceCode, node, new RegExp(String.raw`["']${name}["']\s+in\b|\??\.${name}\b`, "u"))) {
          refuse(node, `\`${owner}.${name}\``, lacking);
        }
      };
      return {
        "Program:exit": checkLibGlobals,
        "MemberExpression[object]"(node: TSESTree.MemberExpression): void {
          const name = memberName(node);
          const use = name === undefined ? null : throwingUse(node);
          if (name === undefined || use === null) {
            return;
          }
          if (node.object.type === "Identifier" && GLOBAL_ROOTS.has(node.object.name)) {
            checkGlobal(name, use, node);
          }
          checkMember(node, name);
        },
      };
    },
  };
};
