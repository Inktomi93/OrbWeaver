// Semantic selector writers. The shared static-class evaluator owns value flow; this module only chooses
// rendering/DOM terminals and records their exact data-attribute identities.
import type { Type } from "ts-morph";
import { Node } from "ts-morph";
import type { GateRunCtx } from "../contract/gate.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readInstalledStateAttributeValues, readInstalledSurface, readManifest } from "./baseui-read.ts";
import { collectHookOwners, hookOwnerCollector, visitHookOwnerNode } from "./css-family-source-provenance.ts";
import type { StaticClassCollector } from "./static-class-expression.ts";

const DOM_LIB = "/typescript/lib/lib.dom.d.ts";
const CLASS_PREFIX_LENGTH = "class:".length;

interface DataWriter {
  readonly values: ReadonlySet<string>;
  readonly sites: number;
}

export interface SelectorWriterCensus {
  readonly classes: ReadonlySet<string>;
  readonly data: ReadonlyMap<string, DataWriter>;
  readonly opaque: number;
  readonly unresolved: number;
  readonly baseUiAttributes: ReadonlyMap<string, ReadonlySet<string>>;
  readonly baseUiManifestOnly: readonly string[];
  readonly baseUiInstalledOnly: readonly string[];
}

function pathOf(node: Node): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
}

function isProductSource(node: Node): boolean {
  const path = pathOf(node);
  return path.includes("/packages/ui/src/") || path.includes("/packages/client/src/");
}

function jsxValue(attribute: import("ts-morph").JsxAttribute): Node | undefined {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return;
  }
  return Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
}

function stringLiteralTypes(type: Type): readonly string[] {
  const types = type.isUnion() ? type.getUnionTypes() : [type];
  return types.flatMap((part) => {
    const literal = part.getLiteralValue();
    if (typeof literal === "string" || typeof literal === "number") {
      return [String(literal)];
    }
    if (part.isBooleanLiteral()) {
      return [part.getText()];
    }
    return [];
  });
}

function valuesAt(
  node: Node,
  consumer: Node,
  collector: StaticClassCollector,
): { readonly values: readonly string[]; readonly opaque: number; readonly unresolved: number } {
  const evaluated = collector.evaluate(node, consumer);
  const values = new Set(evaluated.candidates.map((candidate) => candidate.value));
  for (const value of stringLiteralTypes(node.getType())) {
    values.add(value);
  }
  return { values: [...values], opaque: evaluated.opaque.length, unresolved: evaluated.unresolved.length };
}

function propertyName(node: Node): string | undefined {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) ? node.getLiteralText() : undefined;
}

function accessedName(node: Node): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (!Node.isElementAccessExpression(node)) {
    return;
  }
  const argument = node.getArgumentExpression();
  const value = argument === undefined ? undefined : unwrapExpression(argument);
  return value !== undefined && (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) ? value.getLiteralText() : undefined;
}

function accessReceiver(node: Node): Node | undefined {
  return Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? node.getExpression() : undefined;
}

function meaningfulTypes(type: Type): readonly Type[] {
  const parts = type.isUnion() ? type.getUnionTypes() : [type];
  return parts.filter((part) => !(part.isNull() || part.isUndefined()));
}

function isDomAttributeReceiver(node: Node): boolean {
  const types = meaningfulTypes(node.getType());
  return (
    types.length > 0 &&
    types.every(
      (type) =>
        type
          .getProperty("setAttribute")
          ?.getDeclarations()
          .some((declaration) => pathOf(declaration).endsWith(DOM_LIB)) === true,
    )
  );
}

interface StateSurface {
  readonly components: Readonly<Record<string, { readonly parts: Readonly<Record<string, { readonly state: readonly string[] }>> }>>;
}

function stateAttributes(surface: StateSurface | undefined): ReadonlySet<string> {
  const out = new Set<string>();
  if (surface === undefined) {
    return out;
  }
  for (const component of Object.values(surface.components)) {
    for (const part of Object.values(component.parts)) {
      for (const state of part.state) {
        out.add(`data-${state.toLowerCase()}`);
      }
    }
  }
  return out;
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): readonly string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

interface WriterAccumulator {
  readonly data: Map<string, { values: Set<string>; sites: number }>;
  opaque: number;
  unresolved: number;
}

interface WriterContext {
  readonly state: WriterAccumulator;
  readonly collector: StaticClassCollector;
}

interface SelectorWriterPass {
  readonly passIdentity: object;
  readonly project: GateRunCtx["project"];
  readonly files: GateRunCtx["files"];
  readonly state: WriterAccumulator;
  readonly spreads: import("ts-morph").JsxSpreadAttribute[];
  readonly visited: WeakSet<Node>;
  processedSpreads: boolean;
}

let writerPass: SelectorWriterPass | undefined;

export function beginSelectorWriterCollection(ctx: GateRunCtx): void {
  if (ctx.passIdentity === undefined) {
    throw new Error("selector-writer collection requires a dispatcher pass identity");
  }
  writerPass = {
    passIdentity: ctx.passIdentity,
    project: ctx.project,
    files: ctx.files,
    state: { data: new Map(), opaque: 0, unresolved: 0 },
    spreads: [],
    visited: new WeakSet(),
    processedSpreads: false,
  };
}

function record(state: WriterAccumulator, name: string, values: readonly string[]): void {
  const before = state.data.get(name) ?? { values: new Set<string>(), sites: 0 };
  for (const value of values) {
    before.values.add(value);
  }
  before.sites += 1;
  state.data.set(name, before);
}

function recordValue(context: WriterContext, name: string, value: Node | undefined, consumer: Node): void {
  if (value === undefined) {
    record(context.state, name, ["true"]);
    return;
  }
  const result = valuesAt(value, consumer, context.collector);
  record(context.state, name, result.values);
  context.state.opaque += result.opaque;
  context.state.unresolved += result.unresolved;
}

function recordJsxAttribute(attribute: import("ts-morph").JsxAttribute, context: WriterContext): void {
  const name = attribute.getNameNode().getText();
  if (name.startsWith("data-")) {
    recordValue(context, name, jsxValue(attribute), attribute);
  }
}

function recordJsxSpread(spread: import("ts-morph").JsxSpreadAttribute, context: WriterContext, dataNames: readonly string[]): void {
  const evaluation = context.collector.evaluateObjectProperties(spread.getExpression(), spread, dataNames);
  context.state.opaque += evaluation.opaque.length;
  context.state.unresolved += evaluation.unresolved.length;
  for (const property of evaluation.properties) {
    recordValue(context, property.name, property.value, spread);
  }
}

function recordDomCall(call: import("ts-morph").CallExpression, context: WriterContext): void {
  const expression = call.getExpression();
  const receiver = accessReceiver(expression);
  const method = accessedName(expression);
  if (receiver === undefined || !isDomAttributeReceiver(receiver) || (method !== "setAttribute" && method !== "toggleAttribute")) {
    return;
  }
  const [nameNode, valueNode] = call.getArguments();
  if (nameNode === undefined) {
    return;
  }
  const names = valuesAt(nameNode, call, context.collector);
  context.state.opaque += names.opaque;
  context.state.unresolved += names.unresolved;
  for (const name of names.values.filter((candidate) => candidate.startsWith("data-"))) {
    if (method === "toggleAttribute") {
      record(context.state, name, ["true", "false"]);
    } else {
      recordValue(context, name, valueNode, call);
    }
  }
}

function recordHastObject(property: import("ts-morph").PropertyAssignment, context: WriterContext): void {
  const parent = property.getParent();
  if (!Node.isObjectLiteralExpression(parent)) {
    return;
  }
  const typeProperty = parent.getProperty("type");
  const tagProperty = parent.getProperty("tagName");
  if (!Node.isPropertyAssignment(typeProperty)) {
    return;
  }
  if (!Node.isPropertyAssignment(tagProperty)) {
    return;
  }
  const typeInitializer = typeProperty.getInitializer();
  if (!Node.isStringLiteral(typeInitializer) || typeInitializer.getLiteralText() !== "element") {
    return;
  }
  const rawInitializer = property.getInitializer();
  const initializer = rawInitializer === undefined ? undefined : unwrapExpression(rawInitializer);
  if (initializer === undefined || !Node.isObjectLiteralExpression(initializer)) {
    return;
  }
  for (const child of initializer.getProperties()) {
    if (!Node.isPropertyAssignment(child)) {
      continue;
    }
    const name = propertyName(child.getNameNode());
    if (name?.startsWith("data-") === true) {
      recordValue(context, name, child.getInitializer(), child);
    }
  }
}

function recordHastProperty(property: import("ts-morph").PropertyAssignment, context: WriterContext): void {
  if (propertyName(property.getNameNode()) === "properties") {
    recordHastObject(property, context);
  }
}

export function visitSelectorWriterNode(node: Node, source: import("ts-morph").SourceFile, ctx: GateRunCtx): void {
  visitHookOwnerNode(node, source, ctx);
  const state = writerPass;
  if (state === undefined || state.passIdentity !== ctx.passIdentity || state.project !== ctx.project || state.files !== ctx.files) {
    throw new Error("selector-writer visit ran outside its begin lifecycle");
  }
  if (!isProductSource(source) || state.visited.has(node)) {
    return;
  }
  state.visited.add(node);
  const context = { state: state.state, collector: hookOwnerCollector(ctx) };
  if (Node.isJsxAttribute(node)) {
    recordJsxAttribute(node, context);
  } else if (Node.isJsxSpreadAttribute(node)) {
    state.spreads.push(node);
  } else if (Node.isCallExpression(node)) {
    recordDomCall(node, context);
  } else if (Node.isPropertyAssignment(node)) {
    recordHastProperty(node, context);
  }
}

/** Collect exact class/data writers from live terminals; arbitrary object properties and prose are inert. */
export function collectSelectorWriters(ctx: GateRunCtx, dataNames: readonly string[]): SelectorWriterCensus {
  const classOwners = collectHookOwners(ctx);
  const classes = new Set([...classOwners.keys()].filter((hook) => hook.startsWith("class:")).map((hook) => hook.slice(CLASS_PREFIX_LENGTH)));
  const pass = writerPass;
  if (pass === undefined || pass.passIdentity !== ctx.passIdentity || pass.project !== ctx.project || pass.files !== ctx.files) {
    throw new Error("selector-writer reconciliation ran outside its begin lifecycle");
  }
  if (!pass.processedSpreads) {
    const context = { state: pass.state, collector: hookOwnerCollector(ctx) };
    for (const spread of pass.spreads) {
      recordJsxSpread(spread, context, dataNames);
    }
    pass.processedSpreads = true;
  }
  const manifestAttributes = stateAttributes(readManifest(ctx.root));
  const installedAttributes = stateAttributes(readInstalledSurface(ctx.root));
  const installedValues = readInstalledStateAttributeValues(ctx.root);
  return {
    classes,
    data: pass.state.data,
    opaque: pass.state.opaque,
    unresolved: pass.state.unresolved,
    baseUiAttributes: new Map(
      [...manifestAttributes].filter((name) => installedAttributes.has(name)).map((name) => [name, installedValues.get(name) ?? new Set<string>()]),
    ),
    baseUiManifestOnly: difference(manifestAttributes, installedAttributes),
    baseUiInstalledOnly: difference(installedAttributes, manifestAttributes),
  };
}
