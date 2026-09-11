// Declaration-level hook ownership. This module selects real rendering/DOM terminals; the neutral static
// class evaluator owns value flow, composer identity, wrapper transparency, spreads, and overwrite order.
import type { SourceFile, Type } from "ts-morph";
import { Node } from "ts-morph";
import type { GateRunCtx } from "../contract/gate.ts";
import type { RuntimeClassPrefix, StaticClassCandidate, StaticClassEvaluation, StaticClassSegment } from "../contract/static-class-expression.ts";
import { unwrapExpression } from "./ast-read.ts";
import type { HookOwners } from "./css-family-census.ts";
import { recordClassTokens, recordOwner, sourceOwner } from "./css-family-census.ts";
import type { StaticClassCollector } from "./static-class-expression.ts";
import { StaticClassCollector as ClassCollector } from "./static-class-expression.ts";

type SourceOwner = "ui" | "client";

interface HookOwnerPass {
  readonly passIdentity: object;
  readonly project: GateRunCtx["project"];
  readonly files: GateRunCtx["files"];
  readonly collector: StaticClassCollector;
  readonly owners: Map<string, HookOwners>;
  readonly dataShellNames: Set<string>;
  readonly spreads: Array<{ readonly spread: import("ts-morph").JsxSpreadAttribute; readonly owner: SourceOwner }>;
  readonly terminals: Array<{ readonly node: Node; readonly owner: SourceOwner }>;
  readonly visited: WeakSet<Node>;
  result?: ReadonlyMap<string, HookOwners>;
}

let hookPass: HookOwnerPass | undefined;

/** Open one exact dispatcher lifecycle; the sibling CSS gate reuses the still-open state. */
export function beginHookOwnerCollection(ctx: GateRunCtx): void {
  if (ctx.passIdentity === undefined) {
    throw new Error("hook-owner collection requires a dispatcher pass identity");
  }
  if (hookPass?.passIdentity === ctx.passIdentity && hookPass.project === ctx.project && hookPass.files === ctx.files) {
    return;
  }
  const files = ctx.files.filter((source) => ownerForPath(source.getFilePath().replaceAll("\\", "/")) !== undefined);
  hookPass = {
    passIdentity: ctx.passIdentity,
    project: ctx.project,
    files: ctx.files,
    collector: new ClassCollector(files),
    owners: new Map(),
    dataShellNames: new Set(),
    spreads: [],
    terminals: [],
    visited: new WeakSet(),
  };
}

const CLASS_LIST_MUTATORS = new Set(["add", "remove", "toggle", "replace"]);
const CLASS_NAME_ASSIGNMENT_OPERATORS = new Set(["=", "+=", "&&=", "||=", "??="]);
const TYPESCRIPT_DOM_LIB = "/typescript/lib/lib.dom.d.ts";

function normalizedPath(node: Node): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

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

function propertyName(node: Node): string | undefined {
  if (Node.isIdentifier(node) || Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return Node.isIdentifier(node) ? node.getText() : node.getLiteralText();
  }
  if (!Node.isComputedPropertyName(node)) {
    return;
  }
  const expression = unwrapExpression(node.getExpression());
  return Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression) ? expression.getLiteralText() : undefined;
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

function accessedPropertyName(node: Node): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const argument = node.getArgumentExpression();
  const unwrapped = argument === undefined ? undefined : unwrapExpression(argument);
  return unwrapped !== undefined && (Node.isStringLiteral(unwrapped) || Node.isNoSubstitutionTemplateLiteral(unwrapped))
    ? unwrapped.getLiteralText()
    : undefined;
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

/** Accumulate hook terminals during pass.ts's shared walk; spreads wait until every data-shell key is known. */
export function visitHookOwnerNode(node: Node, source: SourceFile, ctx: GateRunCtx): void {
  const state = hookPass;
  if (state === undefined || state.passIdentity !== ctx.passIdentity || state.project !== ctx.project || state.files !== ctx.files) {
    throw new Error("hook-owner visit ran outside its begin lifecycle");
  }
  state.collector.index(node);
  if (state.visited.has(node)) {
    return;
  }
  state.visited.add(node);
  const owner = ownerForPath(normalizedPath(source));
  if (owner === undefined) {
    return;
  }
  if (Node.isPropertyAssignment(node)) {
    const name = propertyName(node.getNameNode());
    if (name?.startsWith("data-shell-") === true) {
      state.dataShellNames.add(name);
    }
  }
  if (Node.isJsxSpreadAttribute(node)) {
    state.spreads.push({ spread: node, owner });
  }
  state.terminals.push({ node, owner });
}

/** Collect only hooks that reach JSX, a declaration-proven class composer, or a DOM class terminal. */
export function collectHookOwners(ctx: GateRunCtx): ReadonlyMap<string, HookOwners> {
  const state = hookPass;
  if (state === undefined || state.passIdentity !== ctx.passIdentity || state.project !== ctx.project || state.files !== ctx.files) {
    throw new Error("hook-owner reconciliation ran outside its begin lifecycle");
  }
  if (state.result !== undefined) {
    return state.result;
  }
  for (const { node } of state.terminals) {
    state.collector.visit(node);
  }
  recordWalkedClassCarriers(state.owners, state.collector);
  for (const { node, owner } of state.terminals) {
    if (Node.isJsxAttribute(node)) {
      recordDirectJsxAttribute(state.owners, node, owner, state.collector);
    } else if (Node.isCallExpression(node)) {
      recordCall(state.owners, node, owner, state.collector);
    } else if (Node.isBinaryExpression(node)) {
      recordAssignment(state.owners, node, owner, state.collector);
    }
  }
  for (const { spread, owner } of state.spreads) {
    recordJsxSpread(state.owners, spread, { owner, collector: state.collector }, [...state.dataShellNames]);
  }
  state.result = state.owners;
  return state.result;
}

export function hookOwnerWork(ctx: GateRunCtx): StaticClassCollector["work"] {
  const state = hookPass;
  if (state === undefined || state.passIdentity !== ctx.passIdentity || state.project !== ctx.project || state.files !== ctx.files) {
    throw new Error("hook-owner work receipt ran outside its begin lifecycle");
  }
  return state.collector.work;
}

export function hookOwnerCollector(ctx: GateRunCtx): StaticClassCollector {
  const state = hookPass;
  if (state === undefined || state.passIdentity !== ctx.passIdentity || state.project !== ctx.project || state.files !== ctx.files) {
    throw new Error("hook-owner collector requested outside its begin lifecycle");
  }
  return state.collector;
}
