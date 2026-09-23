// Declaration-level hook ownership. This module selects real rendering/DOM terminals; the neutral static
// class evaluator owns value flow, composer identity, wrapper transparency, spreads, and overwrite order.
//
// THIS MODULE IS THE `css-hook-provenance` FACT PROVIDER — the ONE entry point the #1584 conversion left
// standing, and the home of the state that used to be a module-global.
//
// WHAT THE LEGACY SHAPE WAS, AND WHY IT COULD NOT BECOME `create` STATE. `let hookPass` at module scope was
// opened by `beginHookOwnerCollection(ctx)` from BOTH `css-selector-has-a-writer` and
// `css-family-ownership`, and the second call was a deliberate no-op — its own comment said "the sibling
// CSS gate reuses the still-open state". That sharing is the whole point: the pass builds one
// `StaticClassCollector` over `@ui` + `@client` and walks it once (measured on the real tree at
// `1692583d6`: 23.9s of gate-hook time for the selector gate's visit, 16.7s for the ownership gate's
// finalize, ONE collector between them). The final contract owns state in `create`, which is PER POLICY —
// and this fact now has THREE consumers — `css-selector-has-a-writer`, `css-family-ownership` and
// `css-family-direct-client-mechanism` — so `create`-owned state would build the collector three times over
// and triple the walk that the legacy sharing existed to avoid.
//
// THREE, NOT FIVE, AND THE COUNT IS PINNED (#2305, the 2026-09-13 CSS-family verifier review ledger row 5). Four prose
// homes said FIVE by counting the FAMILY rather than the consumers: both `-health` siblings declare
// `facts: []` and never call `ctx.fact`, because their subjects are the CSS identity and the vendor surface
// rather than the TS writer census. `tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts` now
// holds the declared consumer set two-sided against a literal census of `ctx.fact(cssHookProvenanceFact)`
// call sites under `gates/`, with a planted control, so the prose cannot overstate again.
//
// §12.3 names the home for exactly this: "Shared whole-population work is a branded `defineFact` provider
// with its own id, population, analysis, resources, collector, finish hook, receipts, timing and errors …
// the dispatcher instantiates each unique provider once, feeds it in the same physical walk, and finishes
// it before policy evaluation." That is a description of `beginHookOwnerCollection`'s contract, written
// down. So the pass state moved INTO `create` — the fact's `create`, which runs once per INVOCATION rather
// than once per policy — and the `ctx.passIdentity` guard that hand-rolled lifecycle identity is deleted
// with the global it protected.
//
// THE PROVIDER RECEIPTS WHAT IT MEASURED, NEVER WHAT IT FOUND (§12.3). `members` is the authored source
// count its population admitted; the hook census rides the receipt SOURCE string. A provider that receipted
// its census would turn an empty corpus into a fact TOOL ERROR and preempt the `-health` policies whose job
// is reporting exactly that (`receiptFailures` reds on `members === 0`).
//
// WHY IT DECLARES `product-css`. Spreads cannot be evaluated until the authored data-attribute NAMES are
// known — `evaluateObjectProperties` takes the name set — and those names come from the CSS census. The
// provider therefore reads the same closed identity its consumers do, one phase earlier.

import { readStaticString } from "@orb/tooling/_shared/reference-fact";
import type { SourceFile, Type } from "ts-morph";
import { Node } from "ts-morph";
import type { GateFactContext } from "../contract/fact.ts";
import { defineFact } from "../contract/fact.ts";
import type { RuntimeClassPrefix, StaticClassCandidate, StaticClassEvaluation, StaticClassSegment } from "../contract/static-class-expression.ts";
import { unwrapExpression } from "./ast-read.ts";
import type { HookOwners } from "./css-family-census.ts";
import { recordClassTokens, recordOwner, sourceOwner } from "./css-family-census.ts";
import type { SelectorWriterCensus, SelectorWriterPass } from "./css-selector-writers.ts";
import { createSelectorWriterPass } from "./css-selector-writers.ts";
import { readyResourceValue } from "./resource-declaration.ts";
import type { StaticClassCollector, StaticClassWork } from "./static-class-expression.ts";
import { StaticClassCollector as ClassCollector, STATIC_CLASS_KINDS } from "./static-class-expression.ts";

type SourceOwner = "ui" | "client";

const CLASS_LIST_MUTATORS = new Set(["add", "remove", "toggle", "replace"]);
const CLASS_NAME_ASSIGNMENT_OPERATORS = new Set(["=", "+=", "&&=", "||=", "??="]);
const TYPESCRIPT_DOM_LIB = "/typescript/lib/lib.dom.d.ts";
const CLASS_PREFIX_LENGTH = "class:".length;

/** Everything one invocation learned about who WRITES the hooks the product stylesheets select. */
export interface CssHookProvenance {
  /** `class:x` / `slot:x` / `attr:data-shell-x` → which package's live terminals emit it. */
  readonly owners: ReadonlyMap<string, HookOwners>;
  /** Exact class and `data-*` writers from rendering/DOM terminals. */
  readonly writers: SelectorWriterCensus;
  /** Authored sources the collector walked — the denominator, not the census. */
  readonly sources: number;
  /** The shared evaluator's own work counters. Published because ONE collector per invocation is the whole
   *  reason this is a fact rather than `create` state, and `evaluators: 1` is how a test says so
   *  (`tests/tooling/static-class-collection.int.test.ts`). */
  readonly work: StaticClassWork;
}

function normalizedPath(node: Node): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

/** WHICH PACKAGE authored this path — a semantic classifier, not a scope predicate: the population already
 *  decided membership, and this decides which SIDE of the `@ui` / `@client` dependency direction a hook
 *  came from, which is the whole subject of the ownership policies. */
function ownerForPath(path: string): SourceOwner | undefined {
  const packagesAt = path.indexOf("/packages/");
  return sourceOwner(packagesAt === -1 ? path : path.slice(packagesAt + 1));
}

function segmentOwners(segments: readonly StaticClassSegment[], terminalOwner: SourceOwner): ReadonlySet<SourceOwner> {
  const owners = new Set<SourceOwner>([terminalOwner]);
  for (const segment of segments) {
    const owner = ownerForPath(normalizedPath(segment.node));
    if (owner !== undefined) {
      owners.add(owner);
    }
  }
  return owners;
}

function candidateOwners(candidate: StaticClassCandidate, terminalOwner: SourceOwner): ReadonlySet<SourceOwner> {
  return segmentOwners(candidate.segments, terminalOwner);
}

/** A runtime substitution invalidates its own token and everything after it, but whitespace-delimited
 * tokens before that boundary remain exact class evidence. */
function completeRuntimePrefix(prefix: string): string {
  const lastWhitespace = prefix.search(/\s+\S*$/u);
  return lastWhitespace === -1 ? "" : prefix.slice(0, lastWhitespace + 1);
}

function recordCandidates(map: Map<string, HookOwners>, evaluation: StaticClassEvaluation, terminalOwner: SourceOwner): void {
  for (const candidate of evaluation.candidates) {
    for (const owner of candidateOwners(candidate, terminalOwner)) {
      recordClassTokens(map, candidate.value, owner);
    }
  }
  for (const prefix of evaluation.runtimePrefixes) {
    const complete = completeRuntimePrefix(prefix.prefix);
    for (const owner of segmentOwners(prefix.segments, terminalOwner)) {
      recordClassTokens(map, complete, owner);
    }
  }
}

function classTerminalOwner(consumer: Node): SourceOwner | undefined {
  const isTerminal = Node.isCallExpression(consumer) || (Node.isJsxAttribute(consumer) && consumer.getNameNode().getText() === "className");
  return isTerminal ? ownerForPath(normalizedPath(consumer)) : undefined;
}

function recordWalkedCandidate(map: Map<string, HookOwners>, candidate: StaticClassCandidate): void {
  for (const consumer of candidate.consumers) {
    const owner = classTerminalOwner(consumer);
    if (owner === undefined) {
      continue;
    }
    for (const candidateOwner of candidateOwners(candidate, owner)) {
      recordClassTokens(map, candidate.value, candidateOwner);
    }
  }
}

function recordWalkedPrefix(map: Map<string, HookOwners>, prefix: RuntimeClassPrefix): void {
  for (const consumer of prefix.consumers) {
    const owner = classTerminalOwner(consumer);
    if (owner === undefined) {
      continue;
    }
    const complete = completeRuntimePrefix(prefix.prefix);
    for (const prefixOwner of segmentOwners(prefix.segments, owner)) {
      recordClassTokens(map, complete, prefixOwner);
    }
  }
}

function recordWalkedClassCarriers(map: Map<string, HookOwners>, collector: StaticClassCollector): void {
  const walk = collector.walk();
  for (const candidate of walk.candidates) {
    recordWalkedCandidate(map, candidate);
  }
  for (const prefix of walk.runtimePrefixes) {
    recordWalkedPrefix(map, prefix);
  }
}

function recordSlotCandidates(map: Map<string, HookOwners>, evaluation: StaticClassEvaluation, terminalOwner: SourceOwner): void {
  for (const candidate of evaluation.candidates) {
    for (const owner of candidateOwners(candidate, terminalOwner)) {
      recordOwner(map, `slot:${candidate.value}`, owner);
    }
  }
}

function jsxValue(attribute: import("ts-morph").JsxAttribute): Node | undefined {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return;
  }
  return Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
}

/** A property NAME in every authored spelling. The computed arm reads its expression through the shared
 *  stable-binding resolver (`_shared/reference-fact.ts`), so `{ [DATA_SHELL_RAIL]: true }` is the same fact as
 *  `{ "data-shell-rail": true }` — a widening over the legacy `unwrapExpression`-only strip. */
function propertyName(node: Node): string | undefined {
  if (Node.isIdentifier(node) || Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return Node.isIdentifier(node) ? node.getText() : node.getLiteralText();
  }
  if (!Node.isComputedPropertyName(node)) {
    return;
  }
  const fact = readStaticString(node.getExpression());
  return fact.kind === "unresolved" ? undefined : fact.value;
}

function recordDirectJsxAttribute(
  map: Map<string, HookOwners>,
  attribute: import("ts-morph").JsxAttribute,
  owner: SourceOwner,
  collector: StaticClassCollector,
): void {
  const name = attribute.getNameNode().getText();
  if (name === "class") {
    const value = jsxValue(attribute);
    if (value !== undefined) {
      recordCandidates(map, collector.evaluate(value, attribute), owner);
    }
  } else if (name === "data-slot") {
    const value = jsxValue(attribute);
    if (value !== undefined) {
      recordSlotCandidates(map, collector.evaluate(value, attribute), owner);
    }
  } else if (name.startsWith("data-shell-")) {
    recordOwner(map, `attr:${name}`, owner);
  }
}

function recordSpreadPropertyOwner(map: Map<string, HookOwners>, property: { readonly name: string; readonly node: Node }, owner: SourceOwner): void {
  const producer = ownerForPath(normalizedPath(property.node));
  recordOwner(map, `attr:${property.name}`, owner);
  if (producer !== undefined) {
    recordOwner(map, `attr:${property.name}`, producer);
  }
}

function recordJsxSpread(
  map: Map<string, HookOwners>,
  spread: import("ts-morph").JsxSpreadAttribute,
  context: { readonly owner: SourceOwner; readonly collector: StaticClassCollector },
  dataShellNames: readonly string[],
): void {
  recordCandidates(map, context.collector.evaluateClassProperties(spread.getExpression(), spread), context.owner);
  const properties = context.collector.evaluateObjectProperties(spread.getExpression(), spread, ["data-slot", ...dataShellNames]).properties;
  for (const property of properties) {
    if (property.name === "data-slot") {
      recordSlotCandidates(map, context.collector.evaluate(property.value, spread), context.owner);
    } else if (property.name.startsWith("data-shell-")) {
      recordSpreadPropertyOwner(map, property, context.owner);
    }
  }
}

/** The accessed member name in either spelling; the computed arm resolves through the shared reader. */
function accessedPropertyName(node: Node): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const argument = node.getArgumentExpression();
  if (argument === undefined) {
    return;
  }
  const fact = readStaticString(argument);
  return fact.kind === "unresolved" ? undefined : fact.value;
}

function accessReceiver(node: Node): Node | undefined {
  return Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? node.getExpression() : undefined;
}

function meaningfulTypes(type: Type): readonly Type[] {
  const candidates = type.isUnion() ? type.getUnionTypes() : [type];
  return candidates.filter((candidate) => !(candidate.isNull() || candidate.isUndefined()));
}

function isDomDeclaration(node: Node): boolean {
  return normalizedPath(node).endsWith(TYPESCRIPT_DOM_LIB);
}

function isDomTokenListExpression(node: Node): boolean {
  const types = meaningfulTypes(node.getType());
  return (
    types.length > 0 &&
    types.every((type) => {
      const symbol = type.getAliasSymbol() ?? type.getSymbol();
      return symbol?.getName() === "DOMTokenList" && symbol.getDeclarations().some(isDomDeclaration);
    })
  );
}

function isDomClassNameReceiver(node: Node): boolean {
  const types = meaningfulTypes(node.getType());
  return types.length > 0 && types.every((type) => type.getProperty("className")?.getDeclarations().some(isDomDeclaration) === true);
}

function recordCall(map: Map<string, HookOwners>, call: import("ts-morph").CallExpression, owner: SourceOwner, collector: StaticClassCollector): void {
  const receiver = accessReceiver(call.getExpression());
  if (receiver === undefined || !CLASS_LIST_MUTATORS.has(accessedPropertyName(call.getExpression()) ?? "") || !isDomTokenListExpression(receiver)) {
    return;
  }
  for (const argument of call.getArguments()) {
    recordCandidates(map, collector.evaluate(argument, call), owner);
  }
}

function recordAssignment(
  map: Map<string, HookOwners>,
  binary: import("ts-morph").BinaryExpression,
  owner: SourceOwner,
  collector: StaticClassCollector,
): void {
  // The STRUCTURAL strip stays `unwrapExpression`: an assignment TARGET is a member access, never a value,
  // and `resolveStableExpression` correctly refuses one as a dynamic terminal. This is the same layering
  // `reference-fact.ts` itself uses — it calls `unwrapExpression` and then resolves.
  const left = unwrapExpression(binary.getLeft());
  const receiver = accessReceiver(left);
  if (
    accessedPropertyName(left) === "className" &&
    receiver !== undefined &&
    isDomClassNameReceiver(receiver) &&
    CLASS_NAME_ASSIGNMENT_OPERATORS.has(binary.getOperatorToken().getText())
  ) {
    recordCandidates(map, collector.evaluate(binary.getRight(), binary), owner);
  }
}

/** Drive the accumulated terminals through the shared evaluator, then record what each one owns. Split out
 *  of the pass's `finish` so the closure stays a lifecycle rather than an algorithm. */
function recordTerminals(
  owners: Map<string, HookOwners>,
  collector: StaticClassCollector,
  terminals: readonly { readonly node: Node; readonly owner: SourceOwner }[],
): void {
  for (const { node } of terminals) {
    collector.visit(node);
  }
  recordWalkedClassCarriers(owners, collector);
  for (const { node, owner } of terminals) {
    if (Node.isJsxAttribute(node)) {
      recordDirectJsxAttribute(owners, node, owner, collector);
    } else if (Node.isCallExpression(node)) {
      recordCall(owners, node, owner, collector);
    } else if (Node.isBinaryExpression(node)) {
      recordAssignment(owners, node, owner, collector);
    }
  }
}

interface HookOwnerPass {
  readonly visit: (node: Node, source: SourceFile) => void;
  readonly finish: () => ReadonlyMap<string, HookOwners>;
}

/** Accumulate hook terminals during the dispatcher's shared walk; spreads wait until every data-shell key
 *  is known. The object IS the state — nothing survives the invocation that created it. */
function createHookOwnerPass(collector: StaticClassCollector): HookOwnerPass {
  const owners = new Map<string, HookOwners>();
  const dataShellNames = new Set<string>();
  const spreads: Array<{ readonly spread: import("ts-morph").JsxSpreadAttribute; readonly owner: SourceOwner }> = [];
  const terminals: Array<{ readonly node: Node; readonly owner: SourceOwner }> = [];
  const visited = new WeakSet<Node>();
  let result: ReadonlyMap<string, HookOwners> | undefined;
  return {
    visit: (node, source): void => {
      if (result !== undefined) {
        throw new Error("hook-owner pass received a node after its result was read");
      }
      collector.index(node);
      if (visited.has(node)) {
        return;
      }
      visited.add(node);
      const owner = ownerForPath(source.getFilePath().replaceAll("\\", "/"));
      if (owner === undefined) {
        return;
      }
      if (Node.isPropertyAssignment(node)) {
        const name = propertyName(node.getNameNode());
        if (name?.startsWith("data-shell-") === true) {
          dataShellNames.add(name);
        }
      }
      if (Node.isJsxSpreadAttribute(node)) {
        spreads.push({ spread: node, owner });
      }
      terminals.push({ node, owner });
    },
    finish: (): ReadonlyMap<string, HookOwners> => {
      if (result !== undefined) {
        return result;
      }
      recordTerminals(owners, collector, terminals);
      for (const { spread, owner } of spreads) {
        recordJsxSpread(owners, spread, { owner, collector }, [...dataShellNames]);
      }
      result = owners;
      return result;
    },
  };
}

/** Close the invocation: the hook owners, then the data-attribute names the CSS census demands, then the
 *  writer census, then the provider receipt. Split out of `create` so the descriptor stays a declaration. */
function finishProvenance(
  ctx: GateFactContext,
  ownerPass: HookOwnerPass,
  writerPass: SelectorWriterPass,
  collectorWork: () => StaticClassWork,
): CssHookProvenance {
  const owners = ownerPass.finish();
  const classes = new Set([...owners.keys()].filter((hook) => hook.startsWith("class:")).map((hook) => hook.slice(CLASS_PREFIX_LENGTH)));
  const hooks = readyResourceValue(ctx.resources.cssInventory("product")).selectorHooks;
  const dataNames = [...new Set(hooks.flatMap((hook) => (hook.kind === "data" ? [hook.name] : [])))];
  const writers = writerPass.finish(classes, dataNames);
  // THE RECEIPT STATES WHAT IT MEASURED. `members` is the authored source count this provider walked; the
  // census rides the SOURCE string. Receipting the census would make an empty corpus a fact TOOL ERROR and
  // preempt the `-health` policies whose job is reporting exactly that (§12.3).
  ctx.receipt({
    kind: "population",
    source: `css-hook-provenance [hooks=${String(owners.size)}; classes=${String(classes.size)}; data=${String(writers.data.size)}]`,
    members: ctx.files.length,
    unresolved: 0,
  });
  return { owners, writers, sources: ctx.files.length, work: collectorWork() };
}

/** THE ONE ENTRY POINT. One collector, one walk, three consumers — the sharing the module-global `hookPass`
 *  hand-rolled, expressed as the contract's own mechanism. */
export const cssHookProvenanceFact = defineFact({
  id: "css-hook-provenance",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  resources: [{ kind: "product-css" }],
  create: (ctx) => {
    const collector = new ClassCollector(ctx.files);
    const ownerPass = createHookOwnerPass(collector);
    const writerPass = createSelectorWriterPass(collector);
    return {
      visitors: [
        {
          kinds: STATIC_CLASS_KINDS,
          visit: (node, source): void => {
            ownerPass.visit(node, source);
            writerPass.visit(node);
          },
        },
      ],
      finish: (): CssHookProvenance => finishProvenance(ctx, ownerPass, writerPass, () => collector.work),
    };
  },
});
