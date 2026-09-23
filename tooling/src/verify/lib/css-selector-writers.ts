// Semantic selector writers. The shared static-class evaluator owns value flow; this module only chooses
// rendering/DOM terminals and records their exact data-attribute identities.
//
// WHAT THE #1584 CONVERSION CHANGED HERE, and why each half moved:
//
//   1. NO MODULE-GLOBAL PASS. The `let writerPass` slot plus `beginSelectorWriterCollection(ctx)` was the
//      legacy dispatcher's one shared lifecycle, keyed on `ctx.passIdentity`. The final contract owns state
//      in `create`, so this module exports a PASS FACTORY and the caller holds the object. There is exactly
//      one caller: `css-family-source-provenance.ts#cssHookProvenanceFact`.
//   2. THE COLLECTOR IS HANDED IN, NOT FETCHED. `hookOwnerCollector(ctx)` reached back into the sibling
//      module's global, which is what made the import graph a cycle the moment either side became a
//      factory. The shared `StaticClassCollector` is now a constructor argument, so this module imports
//      only `static-class-expression.ts` and the dependency runs one way.
//   3. NO `isProductSource` FENCE. It tested `/packages/{ui,client}/src/` against the node's absolute path,
//      which is `@ui` + `@client` byte for byte (`contract/population.ts#POPULATION_ROOTS`). Under the
//      declared population the fence is MUTUALLY REDUNDANT with the population itself and is deleted rather
//      than kept as decoration — the `server-layout` precedent (docs/law/resource-policy-contract.md §7).
//   4. NO BASE UI. `readManifest`/`readInstalledSurface`/`readInstalledStateAttributeValues` were
//      `ctx.root` FILESYSTEM reads, and a final policy has no root. The committed-vs-installed
//      reconciliation is not a question about authored WRITERS anyway, so it moved to the policy that
//      declares the doors (`json:baseui-manifest` + `installed-package{base-ui,ast}`).
//   5. VALUE READS GO THROUGH THE SHARED FACT BOUNDARY. `accessedName`'s element-access argument and the
//      HAST `properties` initializer are VALUES, and the shared-semantic-readers map rules `ast-read.ts`
//      "not the new fact boundary" — they now resolve through `_shared/reference-fact.ts`
//      (`readStaticString` / `resolveStableExpression`), which follows a stable const binding as well as
//      stripping wrappers. That is a WIDENING, not a rename: `el["data-x"]` still resolves and
//      `el[DATA_X]` now resolves too. `unwrapExpression` survives ONLY where the strip is structural
//      (a parenthesized assignment target), which is the same layering `reference-fact.ts` itself uses.

import { readStaticString, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { Type } from "ts-morph";
import { Node } from "ts-morph";
import type { StaticClassCollector } from "./static-class-expression.ts";

const DOM_LIB = "/typescript/lib/lib.dom.d.ts";

interface DataWriter {
  readonly values: ReadonlySet<string>;
  readonly sites: number;
}

export interface SelectorWriterCensus {
  readonly classes: ReadonlySet<string>;
  readonly data: ReadonlyMap<string, DataWriter>;
  readonly opaque: number;
  readonly unresolved: number;
}

function pathOf(node: Node): string {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/");
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

/** The accessed member name in either spelling. The computed arm reads its argument through the shared
 *  stable-binding resolver, so `el[DATA_SLOT]` resolves exactly as `el["data-slot"]` does. */
function accessedName(node: Node): string | undefined {
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

interface WriterAccumulator {
  readonly data: Map<string, { values: Set<string>; sites: number }>;
  opaque: number;
  unresolved: number;
}

interface WriterContext {
  readonly state: WriterAccumulator;
  readonly collector: StaticClassCollector;
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

/** The HAST element's `properties` object, resolved through the shared stable-binding reader so a shared
 *  const (`properties: CODE_BLOCK_PROPS`) is a writer exactly as an inline literal is. */
function hastPropertiesObject(property: import("ts-morph").PropertyAssignment): import("ts-morph").ObjectLiteralExpression | undefined {
  const raw = property.getInitializer();
  if (raw === undefined) {
    return;
  }
  const fact = resolveStableExpression(raw);
  const resolved = fact.kind === "unresolved" ? undefined : fact.value;
  return resolved !== undefined && Node.isObjectLiteralExpression(resolved) ? resolved : undefined;
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
  const initializer = hastPropertiesObject(property);
  if (initializer === undefined) {
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

/** One invocation's selector-writer accumulation. The caller owns the object; nothing here is module state. */
export interface SelectorWriterPass {
  /** Accumulate one dispatched node. Spreads are deferred until the CSS data-attribute names are known. */
  readonly visit: (node: Node) => void;
  /** Close the pass. `classes` comes from the hook-owner half; `dataNames` from the authored CSS census. */
  readonly finish: (classes: ReadonlySet<string>, dataNames: readonly string[]) => SelectorWriterCensus;
}

/** Collect exact class/data writers from live terminals; arbitrary object properties and prose are inert. */
export function createSelectorWriterPass(collector: StaticClassCollector): SelectorWriterPass {
  const state: WriterAccumulator = { data: new Map(), opaque: 0, unresolved: 0 };
  const context: WriterContext = { state, collector };
  const spreads: import("ts-morph").JsxSpreadAttribute[] = [];
  const visited = new WeakSet<Node>();
  let census: SelectorWriterCensus | undefined;
  return {
    visit: (node): void => {
      if (census !== undefined) {
        throw new Error("selector-writer pass received a node after its census was read");
      }
      if (visited.has(node)) {
        return;
      }
      visited.add(node);
      if (Node.isJsxAttribute(node)) {
        recordJsxAttribute(node, context);
      } else if (Node.isJsxSpreadAttribute(node)) {
        spreads.push(node);
      } else if (Node.isCallExpression(node)) {
        recordDomCall(node, context);
      } else if (Node.isPropertyAssignment(node)) {
        recordHastProperty(node, context);
      }
    },
    finish: (classes, dataNames): SelectorWriterCensus => {
      if (census !== undefined) {
        return census;
      }
      for (const spread of spreads) {
        recordJsxSpread(spread, context, dataNames);
      }
      census = { classes, data: state.data, opaque: state.opaque, unresolved: state.unresolved };
      return census;
    },
  };
}
