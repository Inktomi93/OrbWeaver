// The shared bus DEFINITION model: which unions exist, which carry a belt, which are derived sub-unions of
// a belted root, and where each belted union's CONSUMER belt lives. Every question is answered from
// resolved types and declaration identity, which is what retires the three name tables the legacy
// `bus-definition-belts` gate carried (BELT_EXEMPT, SERVER_INTERNAL_REACH, and a text search of the gate
// corpus for a const name).
//
// It is a SECOND provider rather than fields on `busProducerFact`: the producer fact carried consumer and
// coverage fields once, and they both refused real belts and made every producer run pay for data no
// producer policy read (the bus family's #1584 conversion record). Separate providers keep the populations honest — producers
// are a contracts/server question, definitions reach the client too.
import type { CallExpression, Node as MorphNode, SourceFile, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BusBeltShape, BusDefinitionFact, BusUnionDefinition } from "../contract/bus-definition-fact.ts";
import type { BusDeclarationIdentity, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import type { GateFactContext, GateFactHooks } from "../contract/fact.ts";
import { defineFact } from "../contract/fact.ts";
import {
  BUS_UNION_SUFFIX,
  beltUnionNode,
  busAnchor,
  busDeclarationIdentity,
  busIdentityKey,
  busRefusal,
  callableDeclaration,
  canonicalTypeAlias,
  EVENT_TYPES_SUFFIX,
  NAMED_BUS_UNIONS,
  typeDiscriminators,
} from "./bus-fact-read.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";

const DISCRIMINATOR = "type";

interface DefinitionState {
  readonly aliases: TypeAliasDeclaration[];
  readonly belts: VariableDeclaration[];
  readonly clientMaps: MorphNode[];
  readonly neverGuards: MorphNode[];
  readonly serverCalls: CallExpression[];
  /** local name to imported name, for server import specifiers: an aliased guard keeps its candidacy. */
  readonly serverImports: Map<string, string>;
}

function newState(): DefinitionState {
  return { aliases: [], belts: [], clientMaps: [], neverGuards: [], serverCalls: [], serverImports: new Map() };
}

function isBusUnionAlias(node: TypeAliasDeclaration): boolean {
  return node.isExported() && (node.getName().endsWith(BUS_UNION_SUFFIX) || NAMED_BUS_UNIONS.has(node.getName()));
}

/** A CONSUMER-belt candidate: a mapped type or `Record<…>` keyed by some `X["type"]`. The union identity is
 *  resolved later from the indexed object's TYPE — the legacy reader compared the object node's TEXT to a
 *  union NAME, which a re-export, an alias or a namespace qualification defeats. */
function indexedTypeSubject(node: MorphNode | undefined): MorphNode | undefined {
  if (node === undefined || !Node.isIndexedAccessTypeNode(node)) {
    return;
  }
  const index = node.getIndexTypeNode();
  if (!Node.isLiteralTypeNode(index)) {
    return;
  }
  const literal = index.getLiteral();
  return Node.isStringLiteral(literal) && literal.getLiteralText() === DISCRIMINATOR ? node.getObjectTypeNode() : undefined;
}

function clientMapSubject(node: MorphNode): MorphNode | undefined {
  if (Node.isMappedTypeNode(node)) {
    return indexedTypeSubject(node.getTypeParameter().getConstraint());
  }
  // The type-argument test first: most `TypeReference` nodes in a client tree have none, and reading the
  // name's source text for every one of them is the difference between a cheap walk and a slow one.
  if (!Node.isTypeReference(node) || node.getTypeArguments().length === 0) {
    return;
  }
  return node.getTypeName().getText() === "Record" ? indexedTypeSubject(node.getTypeArguments()[0]) : undefined;
}

/** `assertNeverEvent(event)`-shaped exhaustiveness guards, found by their DECLARED `never` parameter rather
 *  than by name. A call to one only type-checks when the checker has narrowed its argument to `never`,
 *  which is the exhaustiveness proof itself. */
function isNeverGuardParameter(node: MorphNode): boolean {
  return Node.isParameterDeclaration(node) && node.getTypeNode()?.getKind() === SyntaxKind.NeverKeyword;
}

function collectNode(context: GateFactContext, state: DefinitionState, node: MorphNode, sourceFile: SourceFile): void {
  const path = context.relativePath(sourceFile);
  const inContracts = path.startsWith("packages/contracts/src/");
  if (inContracts && Node.isTypeAliasDeclaration(node) && isBusUnionAlias(node)) {
    state.aliases.push(node);
  }
  if (inContracts && Node.isVariableDeclaration(node) && node.getName().endsWith(EVENT_TYPES_SUFFIX) && beltUnionNode(node) !== undefined) {
    state.belts.push(node);
  }
  if (path.startsWith("packages/client/src/") && clientMapSubject(node) !== undefined) {
    state.clientMaps.push(node);
  }
  if (path.startsWith("packages/server/src/")) {
    if (isNeverGuardParameter(node)) {
      state.neverGuards.push(node);
    }
    if (Node.isCallExpression(node) && node.getArguments().length === 1 && Node.isIdentifier(node.getExpression())) {
      state.serverCalls.push(node);
    }
    if (Node.isImportSpecifier(node)) {
      state.serverImports.set((node.getAliasNode() ?? node.getNameNode()).getText(), node.getName());
    }
  }
}

function beltShape(context: GateFactContext, declaration: VariableDeclaration, unresolved: BusUnresolvedIdentity[]): BusBeltShape | undefined {
  const initializer = declaration.getInitializerOrThrow();
  const authored = readStaticAuthoredValue(Node.isSatisfiesExpression(initializer) ? initializer.getExpression() : initializer);
  if (authored.kind === "unresolved") {
    unresolved.push(busRefusal({ context, stage: "belt", reason: authored.reason, detail: authored.detail, node: authored.node }));
    return;
  }
  const anchor = busAnchor(context, declaration);
  const identity = { exportName: declaration.getName(), path: context.relativePath(declaration.getSourceFile()), anchor };
  if (authored.value.kind === "object") {
    return { ...identity, shape: "object", members: authored.value.properties.map(({ key }) => key) };
  }
  if (authored.value.kind !== "tuple") {
    unresolved.push(
      busRefusal({
        context,
        stage: "belt",
        reason: "unsupported",
        detail: `${declaration.getName()} is neither an object nor a tuple belt`,
        node: declaration,
      }),
    );
    return;
  }
  return {
    ...identity,
    shape: "tuple",
    members: authored.value.elements.flatMap((element) => (element.kind === "scalar" && typeof element.value === "string" ? [element.value] : [])),
  };
}

interface MutableDefinition {
  readonly union: BusDeclarationIdentity;
  readonly anchor: BusUnionDefinition["anchor"];
  readonly discriminators: string[];
  belt: BusBeltShape | null;
  readonly beltedRoots: BusDeclarationIdentity[];
  readonly clientTotalMaps: string[];
  readonly exhaustiveConsumers: string[];
}

function unionDefinitions(context: GateFactContext, state: DefinitionState, unresolved: BusUnresolvedIdentity[]): MutableDefinition[] {
  const definitions: MutableDefinition[] = [];
  for (const alias of state.aliases) {
    const discriminators = [...typeDiscriminators(alias.getType(), alias)].toSorted((left, right) => left.localeCompare(right));
    if (discriminators.length === 0) {
      unresolved.push(
        busRefusal({ context, stage: "union", reason: "unsupported", detail: `${alias.getName()} resolves no "type" discriminator`, node: alias }),
      );
      continue;
    }
    definitions.push({
      union: busDeclarationIdentity(context, alias),
      anchor: busAnchor(context, alias),
      discriminators,
      belt: null,
      beltedRoots: [],
      clientTotalMaps: [],
      exhaustiveConsumers: [],
    });
  }
  return definitions;
}

function attachBelts(
  context: GateFactContext,
  state: DefinitionState,
  byUnion: ReadonlyMap<string, MutableDefinition>,
  unresolved: BusUnresolvedIdentity[],
): void {
  for (const declaration of state.belts) {
    const unionNode = beltUnionNode(declaration);
    const alias = unionNode === undefined ? undefined : canonicalTypeAlias(unionNode.getType());
    const definition = alias === undefined ? undefined : byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
    if (definition === undefined) {
      unresolved.push(
        busRefusal({
          context,
          stage: "belt",
          reason: "missing",
          detail: `${declaration.getName()} does not resolve one discovered Union["type"] belt`,
          node: declaration,
        }),
      );
      continue;
    }
    if (definition.belt !== null) {
      unresolved.push(
        busRefusal({ context, stage: "belt", reason: "ambiguous", detail: `${definition.union.exportName} has more than one event belt`, node: declaration }),
      );
      continue;
    }
    definition.belt = beltShape(context, declaration, unresolved) ?? null;
  }
}

function attachClientMaps(context: GateFactContext, state: DefinitionState, byUnion: ReadonlyMap<string, MutableDefinition>): void {
  for (const node of state.clientMaps) {
    const subject = clientMapSubject(node);
    const alias = subject === undefined ? undefined : canonicalTypeAlias(subject.getType());
    const definition = alias === undefined ? undefined : byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
    if (definition !== undefined) {
      definition.clientTotalMaps.push(`${context.relativePath(node.getSourceFile())}:${node.getStartLineNumber()}`);
    }
  }
}

/** Candidate call names derived from the guard DECLARATIONS themselves plus their local import aliases —
 *  the family's ratified prefilter shape. Resolving every one-argument server call would cost more than
 *  the whole fact. */
function guardDeclarations(state: DefinitionState): readonly MorphNode[] {
  const declarations: MorphNode[] = [];
  for (const parameter of state.neverGuards) {
    const owner = parameter.getParent();
    if (Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner)) {
      declarations.push(owner);
    }
  }
  return declarations;
}

/** The names a guard call can be spelled with: the guard declarations' own names plus any local import
 *  alias bound to one. Reading the TYPE of every one-argument server call instead costs more than the rest
 *  of the fact combined (measured: 46 s down to single digits), and a name derived from the declarations is a
 *  candidate filter, never the verdict — every candidate is still proven by declaration identity below. */
function guardNames(state: DefinitionState, declarations: readonly MorphNode[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const declaration of declarations) {
    const owner = Node.isFunctionDeclaration(declaration) ? declaration : declaration.getParent();
    const name = Node.isFunctionDeclaration(owner) || Node.isVariableDeclaration(owner) ? owner.getName() : undefined;
    if (name !== undefined) {
      names.add(name);
    }
  }
  for (const [local, imported] of state.serverImports) {
    if (names.has(imported)) {
      names.add(local);
    }
  }
  return names;
}

function guardBody(declaration: MorphNode | undefined): MorphNode | undefined {
  if (declaration === undefined) {
    return;
  }
  return Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : declaration;
}

/** The exhaustively-consumed union at one `never`-argument guard call: the SUBJECT's declared type, which
 *  is the whole union, while the argument's own flow type at the call is `never` — the checker's proof
 *  that every member was handled before it. */
function exhaustedUnion(call: CallExpression, guards: ReadonlySet<object>): ReadonlySet<string> | undefined {
  const argument = call.getArguments()[0];
  if (argument === undefined || !argument.getType().isNever()) {
    return;
  }
  const target = guardBody(callableDeclaration(call));
  if (target === undefined || !guards.has(target.compilerNode)) {
    return;
  }
  const declared = argument.getSymbol()?.getValueDeclaration();
  return declared === undefined ? undefined : typeDiscriminators(declared.getType(), declared);
}

function attachExhaustiveConsumers(context: GateFactContext, state: DefinitionState, definitions: readonly MutableDefinition[]): void {
  const declarations = guardDeclarations(state);
  const guards = new Set(declarations.map((declaration) => declaration.compilerNode));
  const names = guardNames(state, declarations);
  if (guards.size === 0) {
    return;
  }
  for (const call of state.serverCalls.filter((candidate) => names.has(candidate.getExpression().getText()))) {
    const subject = exhaustedUnion(call, guards) ?? new Set<string>();
    for (const definition of subject.size === 0 ? [] : definitions) {
      if (subject.size === definition.discriminators.length && definition.discriminators.every((value) => subject.has(value))) {
        definition.exhaustiveConsumers.push(`${context.relativePath(call.getSourceFile())}:${call.getStartLineNumber()}`);
      }
    }
  }
}

function attachBeltedRoots(definitions: readonly MutableDefinition[]): void {
  const belted = definitions.filter((definition) => definition.belt !== null);
  for (const definition of definitions) {
    if (definition.belt !== null) {
      continue;
    }
    const own = new Set(definition.discriminators);
    for (const root of belted) {
      if ([...own].every((value) => root.discriminators.includes(value))) {
        definition.beltedRoots.push(root.union);
      }
    }
  }
}

function finishDefinitionFact(context: GateFactContext, state: DefinitionState): BusDefinitionFact {
  const unresolved: BusUnresolvedIdentity[] = [];
  const definitions = unionDefinitions(context, state, unresolved);
  const byUnion = new Map(definitions.map((definition) => [busIdentityKey(definition.union), definition]));
  attachBelts(context, state, byUnion, unresolved);
  attachClientMaps(context, state, byUnion);
  attachExhaustiveConsumers(context, state, definitions);
  attachBeltedRoots(definitions);
  const frozen: BusUnionDefinition[] = definitions
    .map((definition) => ({
      union: definition.union,
      anchor: definition.anchor,
      discriminators: Object.freeze([...definition.discriminators]),
      belt: definition.belt,
      beltedRoots: Object.freeze([...definition.beltedRoots]),
      clientTotalMaps: Object.freeze([...definition.clientTotalMaps].toSorted((left, right) => left.localeCompare(right))),
      exhaustiveConsumers: Object.freeze([...definition.exhaustiveConsumers].toSorted((left, right) => left.localeCompare(right))),
    }))
    .toSorted((left, right) => busIdentityKey(left.union).localeCompare(busIdentityKey(right.union)));
  return {
    definitions: Object.freeze(frozen),
    unresolved: Object.freeze(unresolved),
    receipt: {
      source: "bus-definition-fact",
      unions: frozen.length,
      belts: frozen.filter(({ belt }) => belt !== null).length,
      members: frozen.reduce((sum, { discriminators }) => sum + discriminators.length, 0),
      clientMaps: frozen.reduce((sum, { clientTotalMaps }) => sum + clientTotalMaps.length, 0),
      exhaustiveConsumers: frozen.reduce((sum, { exhaustiveConsumers }) => sum + exhaustiveConsumers.length, 0),
      unresolved: unresolved.length,
    },
  };
}

/** The provider receipt states the denominator this collector actually MEASURED — the authored sources it
 *  walked — and nothing about what the census FOUND. Same ruling, same reason and same date as
 *  `bus-fact.ts#PROVIDER_RECEIPT_SOURCE`; read the WHY there. The half specific to this provider: EVERY
 *  consumer already throws its own `bus definition fact is incomplete: …` before filing a receipt
 *  (`bus-definition-belts`, `bus-belt-total`, `bus-consumer-belt`, and `bus-producer-coverage`'s roster
 *  join), so a receipt-level refusal could only PREEMPT the policy message a proof row asserts — which is
 *  exactly how the roster-disagreement pin in `tests/tooling/verify/gates/bus-fact-health.test.ts` started
 *  reading a `bus-definitions` receipt refusal instead of the disagreement it exists to catch. */
const PROVIDER_RECEIPT_SOURCE = "bus-definition-sources";

function createDefinitionCollector(context: GateFactContext): GateFactHooks<BusDefinitionFact> {
  const state = newState();
  let finished: BusDefinitionFact | undefined;
  return {
    visitors: [
      {
        kinds: [
          SyntaxKind.TypeAliasDeclaration,
          SyntaxKind.VariableDeclaration,
          SyntaxKind.MappedType,
          SyntaxKind.TypeReference,
          SyntaxKind.Parameter,
          SyntaxKind.CallExpression,
          SyntaxKind.ImportSpecifier,
        ],
        visit: (node, sourceFile) => collectNode(context, state, node, sourceFile),
      },
    ],
    finish: (): BusDefinitionFact => {
      finished ??= finishDefinitionFact(context, state);
      context.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: context.files.length });
      return finished;
    },
  };
}

export const busDefinitionFact = defineFact({
  id: "bus-definitions",
  population: { in: ["@contracts", "@client", "@server"] },
  analysis: "types",
  resources: [],
  create: createDefinitionCollector,
});
