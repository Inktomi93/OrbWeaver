import type { RuleVisitor } from "@eslint/core";
import { indexCss } from "@orb/tooling/browser-support";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { ConstantText } from "./browser-support-classes.ts";
import { classSupportVisitor } from "./browser-support-classes.ts";
import { accessedName, staticTextValue } from "./static-values.ts";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";
import type { CandidatesToCss } from "./ui-feature-classname.ts";

const NAME = /^[A-Za-z][A-Za-z0-9]*$/u;
const API = "api.";
const JS_BUILTINS = "javascript.builtins.";
const GLOBAL_ROOTS = new Set(["window", "globalThis", "self"]);
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
  readonly events: Map<string, Map<string, Lacking>>;
}

/** `api.Owner[.member]` and `javascript.builtins.Owner[.member]` as owner/member names; anything else (parameters, events) is not a use. */
function ownerAndMember(key: string): [string, string | undefined] | null {
  const prefix = [API, JS_BUILTINS].find((candidate) => key.startsWith(candidate)) ?? key;
  const parts = key.slice(prefix.length).split(".");
  const [owner, member] = parts;
  return owner !== undefined && parts.length <= 2 && parts.every((part) => NAME.test(part) || /^[A-Za-z][A-Za-z0-9]*_event$/u.test(part))
    ? [owner, member]
    : null;
}

function indexUnsupported(unsupported: ReadonlyMap<string, Lacking>): SupportIndex {
  const index: SupportIndex = { globals: new Map(), constructors: new Map(), members: new Map(), events: new Map() };
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
    } else if (member.endsWith("_event")) {
      const event = member.slice(0, -"_event".length);
      index.events.set(event, (index.events.get(event) ?? new Map()).set(owner, lacking));
    } else {
      memberKeys.push([owner, member, lacking]);
    }
  }
  indexMembers(index, memberKeys);
  return index;
}

function indexMembers(index: SupportIndex, keys: readonly [string, string, Lacking][]): void {
  for (const [owner, member, lacking] of keys) {
    const ownerGap = index.globals.get(owner);
    if (ownerGap === undefined || !lacking.every((browser) => ownerGap.includes(browser))) {
      index.members.set(member, (index.members.get(member) ?? new Map()).set(owner, lacking));
    }
  }
}

function hasOwner(candidate: ts.Type, owner: string): boolean {
  if (candidate.getSymbol()?.name === owner) {
    return true;
  }
  if (candidate.isUnionOrIntersection()) {
    return candidate.types.some((type) => hasOwner(type, owner));
  }
  return candidate.isClassOrInterface() && (candidate.getBaseTypes() ?? []).some((base) => hasOwner(base, owner));
}

function hasEventOwner(type: ts.Type, owner: string, event: string): boolean {
  if (hasOwner(type, owner)) {
    return true;
  }
  // Shared DOM event handlers also expose Document/Element events on Window and their other native targets.
  return (owner === "Document" || owner === "Element") && hasOwner(type, "EventTarget") && type.getProperty(`on${event}`) !== undefined;
}

function listenedEvent(context: OrbRuleContext, call: TSESTree.CallExpression): { readonly receiver: TSESTree.Expression; readonly event: string } | undefined {
  if (call.callee.type !== "MemberExpression" || accessedName(context, call.callee) !== "addEventListener") {
    return undefined;
  }
  const argument = call.arguments[0];
  const event = argument === undefined ? undefined : staticTextValue(context, argument);
  return typeof event === "string" ? { receiver: call.callee.object, event } : undefined;
}

function receiverType(context: OrbRuleContext, receiver: TSESTree.Node): ts.Type | undefined {
  const services = context.sourceCode.parserServices;
  if (!services?.program || services.esTreeNodeToTSNodeMap === undefined) {
    return undefined;
  }
  return services.program.getTypeChecker().getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(receiver));
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
  const tests = (test: TSESTree.Node): boolean => pattern.test(sourceCode.getText(test));
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

const regexpSource = (text: string): string => RegExp.escape(text);

/** The text of a `const` string initializer (`as const`, parentheses, `satisfies` and template pieces looked through), or `undefined`. */
function stringText(node: ts.Expression): string | undefined {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return stringText(node.expression);
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ") : undefined;
}

// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
const isAlias = (symbol: ts.Symbol): boolean => (symbol.flags & ts.SymbolFlags.Alias) !== 0;

// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript NodeFlags is a compiler-owned bitfield.
const isConstDeclaration = (declaration: ts.VariableDeclaration): boolean => (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) !== 0;

/** The text of the `const` string an identifier names, following an import to its declaring module. */
function constantTextOf(context: OrbRuleContext): ConstantText {
  const services = context.sourceCode.parserServices;
  const program = services?.program;
  return (identifier) => {
    if (!program || services.esTreeNodeToTSNodeMap === undefined) {
      return;
    }
    const checker = program.getTypeChecker();
    const found = checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(identifier));
    const symbol = found !== undefined && isAlias(found) ? checker.getAliasedSymbol(found) : found;
    const declaration = symbol?.valueDeclaration;
    const isConst = declaration !== undefined && ts.isVariableDeclaration(declaration) && isConstDeclaration(declaration);
    return isConst && declaration.initializer !== undefined ? stringText(declaration.initializer) : undefined;
  };
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
 * earlier `if (...) return|throw|continue|break` in the same block does. A test counts when it contains `"m" in el`,
 * `el.m` or `el?.m` for the SAME receiver text (member), or the bare global name (global). `CSS.supports` guards nothing here:
 * it tests a style, not a script API. Polarity is not checked, so keep the guard honest.
 *
 * A builtin the client's polyfill entry installs (`POLYFILLED_BUILTINS`, dropped from `unsupported` by `withoutPolyfilled`) is
 * trusted everywhere, at module top level and inside callbacks alike. The page's one script, src/entry.ts, awaits those installs and
 * only then dynamically imports the app graph, so no app module can evaluate before them; the e2e `polyfill-floor.spec.ts` runs
 * the built bundle with the builtins deleted and is the proof, not this rule.
 *
 * The Tailwind classes in `className`, `class` and class helpers are compiled and their declarations judged by the Stylelint
 * rule's key check: a property in `harmless` passes, and a class whose CSS sits under `@supports` is guarded.
 */
export interface BrowserSupportOptions {
  readonly unsupported: ReadonlyMap<string, Lacking>;
  /** Property → why a browser ignoring it changes no layout or behavior. */
  readonly harmless: Readonly<Record<string, string>>;
  readonly candidatesToCss: CandidatesToCss;
}

export const browserSupportRule = ({ unsupported, harmless, candidatesToCss }: BrowserSupportOptions): OrbRule => {
  const index = indexUnsupported(unsupported);
  const cssIndex = indexCss(unsupported, harmless);
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const { sourceCode } = context;
      const refuse = (node: TSESTree.Node, what: string, lacking: Lacking): void => {
        context.report({
          node,
          message: `${what} is missing in ${lacking.join(", ")}, which are in the declared browser floor (packages/client/browser-targets.ts); guard it ("x" in el, typeof X) or drop it.`,
        });
      };
      // One verdict for a missing thing: a guard on it passes.
      const judge = (site: TSESTree.Node, key: string, lacking: Lacking, guard: RegExp): void => {
        if (!isGuarded(sourceCode, site, guard)) {
          refuse(site, `\`${key}\``, lacking);
        }
      };
      const checkGlobal = (name: string, use: Use, site: TSESTree.Node): void => {
        // A constructor-only gap (the name exists, `new` does not) matters at the `new` alone.
        const lacking = index.globals.get(name) ?? (use === "new" ? index.constructors.get(name) : undefined);
        if (lacking !== undefined) {
          judge(site, name, lacking, new RegExp(String.raw`\b${name}\b`, "u"));
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
        if (owner !== undefined && lacking !== undefined) {
          // The guard must test this receiver: `"m" in other` says nothing about `el.m`.
          const receiver = regexpSource(sourceCode.getText(node.object));
          judge(node, `${owner}.${name}`, lacking, new RegExp(String.raw`["']${name}["']\s+in\s+${receiver}\b|${receiver}\??\.${name}\b`, "u"));
        }
      };
      const checkEvent = (call: TSESTree.CallExpression): void => {
        const listened = listenedEvent(context, call);
        if (listened === undefined) {
          return;
        }
        const { event, receiver } = listened;
        const owners = index.events.get(event);
        if (owners === undefined) {
          return;
        }
        const type = receiverType(context, receiver);
        if (type === undefined) {
          return;
        }
        const missing = [...owners].find(([candidateOwner]) => hasEventOwner(type, candidateOwner, event));
        if (missing === undefined) {
          return;
        }
        const [owner, lacking] = missing;
        const text = regexpSource(sourceCode.getText(receiver));
        judge(call, `${owner}.${event}_event`, lacking, new RegExp(String.raw`["']on${event}["']\s+in\s+${text}\b|${text}\??\.on${event}\b`, "u"));
      };
      return {
        CallExpression: checkEvent,
        ...classSupportVisitor(cssIndex, candidatesToCss, constantTextOf(context), (node, what, lacking) => {
          refuse(node, what, lacking);
        }),
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
