// Visitor-fed registry facts; this module owns no Project, walk, path predicate, or binding resolver.

import { resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ReferenceFact, ReferenceUnresolvedReason } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { ArrowFunction, FunctionDeclaration, FunctionExpression, Node as MorphNode, ReturnStatement, TypeNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { StaticAuthoredValue } from "../../floor/code-facts/static-authored-value-contract.ts";
import type { TypeProjectionPlan } from "../../floor/code-facts/type-projection-contract.ts";
import { typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import type { GateFact, GateFactContext } from "../contract/fact.ts";
import { defineFact } from "../contract/fact.ts";
import type {
  JsxTagFact,
  RegistryDefinitionFact,
  RegistryDefinitionKind,
  RegistryDefinitionKindFacts,
  RegistryTypeDeclaration,
  RegistryTypeOrigin,
  RegistryTypeTargetFact,
} from "../contract/registry-fact.ts";
import { REGISTRY_DEFINITION_KINDS } from "../contract/registry-fact.ts";
import { nativeAuthoredValue, nativeTypeProjection, prepareNativeAuthoredValue, prepareNativeTypeProjection } from "./native-value-projection.ts";

const TYPE_ORIGIN_PLAN: TypeProjectionPlan = { facets: ["type-identity"], properties: [] };
const EXPORT_PLAN: TypeProjectionPlan = { facets: ["declaration-export"], properties: [] };

const TYPE_NAMES = {
  section: "SectionDefinition",
} as const satisfies Readonly<Record<RegistryDefinitionKind, string>>;

const REGISTRY_DEFINITION_VISITOR_KINDS = [
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ReturnStatement,
] as const;

type FactoryNode = FunctionDeclaration | ArrowFunction | FunctionExpression;

interface Candidate {
  readonly declaration: MorphNode;
  readonly shape: "const" | "factory";
  readonly typeNode: TypeNode;
  readonly value: MorphNode | FactoryNode | undefined;
}

interface MutableRegistryFacts {
  readonly targets: Map<RegistryDefinitionKind, RegistryTypeDeclaration[]>;
  readonly candidates: Candidate[];
  readonly returns: Map<object, ReturnStatement[]>;
}

function kindForName(name: string): RegistryDefinitionKind | undefined {
  return REGISTRY_DEFINITION_KINDS.find((kind) => TYPE_NAMES[kind] === name);
}

function isRegistryType(node: MorphNode): node is RegistryTypeDeclaration {
  return (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) && kindForName(node.getName()) !== undefined;
}

function typeOrigin(typeNode: TypeNode, ctx: GateFactContext): ReferenceFact<RegistryTypeOrigin> {
  const origin = typeProjectionFacet(nativeTypeProjection(ctx, typeNode, TYPE_ORIGIN_PLAN), "type-identity");
  if (origin.kind === "unresolved") {
    return origin;
  }
  const declarations = origin.value.declarations.filter(
    (candidateDeclaration): candidateDeclaration is RegistryTypeDeclaration =>
      Node.isInterfaceDeclaration(candidateDeclaration) || Node.isTypeAliasDeclaration(candidateDeclaration),
  );
  if (declarations.length === 0) {
    return unresolved("missing", typeNode, [], `type ${typeNode.getText()} has no interface or type-alias declaration`);
  }
  if (declarations.length !== 1) {
    return unresolved("ambiguous", typeNode, declarations, `type ${typeNode.getText()} resolves to ${declarations.length} declarations`);
  }
  const declaration = declarations[0];
  if (declaration === undefined) {
    return unresolved("missing", typeNode, [], `type ${typeNode.getText()} has no declaration`);
  }
  return {
    kind: "resolved",
    value: { exportedName: declaration.getName(), declaration },
    trace: { declarations, origin: declaration },
  };
}

function unresolved<T>(reason: ReferenceUnresolvedReason, node: MorphNode, declarations: readonly MorphNode[], detail: string): ReferenceFact<T> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations, origin: node } };
}

function authoredObject(
  node: MorphNode | undefined,
  fallback: MorphNode,
  ctx: GateFactContext,
): {
  readonly object: ReferenceFact<import("ts-morph").ObjectLiteralExpression>;
  readonly authoredValue: ReferenceFact<StaticAuthoredValue>;
} {
  if (node === undefined) {
    const missing = unresolved<never>("missing", fallback, [fallback], "registry definition has no authored value");
    return { object: missing, authoredValue: missing };
  }
  const projection = nativeAuthoredValue(ctx, node);
  const authoredValue = projection.value;
  // Object PROVENANCE and field READABILITY are independent facts. Every live registry definition carries
  // imported icons, components, and hooks, so the complete JSON-like value legitimately refuses; inheriting
  // that refusal as a provenance refusal would report zero members for definitions sitting at their
  // sanctioned paths.
  const stable = projection.composite;
  if (stable.kind === "unresolved") {
    return { object: stable, authoredValue };
  }
  if (!Node.isObjectLiteralExpression(stable.value)) {
    return {
      object: unresolved("unsupported", stable.value, stable.trace.declarations, `${stable.value.getKindName()} is not an authored object literal`),
      authoredValue,
    };
  }
  return { object: { kind: "resolved", value: stable.value, trace: stable.trace }, authoredValue };
}

function closestFactory(node: MorphNode): FactoryNode | undefined {
  return node.getFirstAncestor(
    (ancestor): ancestor is FactoryNode => Node.isFunctionDeclaration(ancestor) || Node.isArrowFunction(ancestor) || Node.isFunctionExpression(ancestor),
  );
}

function factoryExpression(factory: FactoryNode, returns: ReadonlyMap<object, readonly ReturnStatement[]>): ReferenceFact<MorphNode> {
  const body = factory.getBody();
  if (body === undefined) {
    return unresolved("missing", factory, [factory], "section factory has no body");
  }
  if (!Node.isBlock(body)) {
    return { kind: "resolved", value: body, trace: { declarations: [factory], origin: body } };
  }
  const statements = returns.get(factory.compilerNode) ?? [];
  if (statements.length === 0) {
    return unresolved("missing", factory, [factory], "section factory has no return statement");
  }
  if (statements.length !== 1) {
    return unresolved("ambiguous", factory, [factory, ...statements], `section factory has ${statements.length} return statements`);
  }
  const expression = statements[0]?.getExpression();
  return expression === undefined
    ? unresolved("missing", statements[0] ?? factory, [factory], "section factory return has no expression")
    : { kind: "resolved", value: expression, trace: { declarations: [factory], origin: expression } };
}

function candidateValue(
  candidate: Candidate,
  returns: ReadonlyMap<object, readonly ReturnStatement[]>,
  ctx: GateFactContext,
): ReturnType<typeof authoredObject> {
  if (candidate.shape === "const") {
    return authoredObject(candidate.value, candidate.declaration, ctx);
  }
  const factory = candidate.value;
  if (!(factory !== undefined && (Node.isFunctionDeclaration(factory) || Node.isArrowFunction(factory) || Node.isFunctionExpression(factory)))) {
    return authoredObject(undefined, candidate.declaration, ctx);
  }
  const expression = factoryExpression(factory, returns);
  if (expression.kind === "unresolved") {
    return { object: expression, authoredValue: expression };
  }
  return authoredObject(expression.value, candidate.declaration, ctx);
}

function targetFact(
  kind: RegistryDefinitionKind,
  targets: ReadonlyMap<RegistryDefinitionKind, readonly RegistryTypeDeclaration[]>,
  ctx: GateFactContext,
): RegistryTypeTargetFact {
  const declarations = (targets.get(kind) ?? []).filter((node) => typeProjectionFacet(nativeTypeProjection(ctx, node, EXPORT_PLAN), "declaration-export"));
  if (declarations.length === 1 && declarations[0] !== undefined) {
    return { kind: "resolved", value: { exportedName: TYPE_NAMES[kind], declaration: declarations[0] } };
  }
  return {
    kind: "unresolved",
    reason: declarations.length === 0 ? "missing" : "ambiguous",
    detail:
      declarations.length === 0 ? `exported ${TYPE_NAMES[kind]} declaration is absent` : `exported ${TYPE_NAMES[kind]} has ${declarations.length} declarations`,
    declarations,
  };
}

function sameDeclaration(left: RegistryTypeDeclaration, right: RegistryTypeDeclaration): boolean {
  return left.compilerNode === right.compilerNode;
}

/** Score one kind's census.
 *
 *  WHAT COUNTS AS UNRESOLVED: only the registry TYPE. An identified definition whose authored object the
 *  value reader cannot follow (a builder call, a mutated local) is RESOLVED DATA, not a missing subject —
 *  it arrives as an `unresolved` ReferenceFact on `object`, and every consumer judges that fail-closed and
 *  REPORTS it as an unreadable definition. Scoring it as a receipt `unresolved`
 *  made the provider refuse over exactly the population the policy was built to accuse, so the fail-closed
 *  arms could never fire (three `mustFlag` rows, #1953). Every consumer's own receipt already declares this
 *  same census — `members: <view>.definitions.length, unresolved: 0`. */
function factsFor(kind: RegistryDefinitionKind, state: MutableRegistryFacts, ctx: GateFactContext): RegistryDefinitionKindFacts {
  const target = targetFact(kind, state.targets, ctx);
  const definitions: RegistryDefinitionFact[] = [];
  if (target.kind === "resolved") {
    for (const candidate of state.candidates) {
      const origin = typeOrigin(candidate.typeNode, ctx);
      if (origin.kind === "unresolved" || !sameDeclaration(origin.value.declaration, target.value.declaration)) {
        continue;
      }
      const value = candidateValue(candidate, state.returns, ctx);
      definitions.push({
        kind,
        shape: candidate.shape,
        declaration: candidate.declaration,
        typeOrigin: origin.value,
        ...value,
      });
    }
  }
  return {
    source: TYPE_NAMES[kind],
    target,
    definitions,
    members: definitions.length,
    unresolved: target.kind === "unresolved" ? 1 : 0,
  };
}

function noteVariable(node: VariableDeclaration, state: MutableRegistryFacts, ctx: GateFactContext): void {
  const initializer = node.getInitializer();
  if (initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
    const typeNode = initializer.getReturnTypeNode();
    if (typeNode !== undefined) {
      state.candidates.push({ declaration: node, shape: "factory", typeNode, value: initializer });
      prepareNativeTypeProjection(ctx, typeNode, TYPE_ORIGIN_PLAN);
      const body = initializer.getBody();
      if (!Node.isBlock(body)) {
        prepareNativeAuthoredValue(ctx, body);
      }
    }
    return;
  }
  const typeNode = node.getTypeNode();
  if (typeNode !== undefined) {
    state.candidates.push({ declaration: node, shape: "const", typeNode, value: initializer });
    prepareNativeTypeProjection(ctx, typeNode, TYPE_ORIGIN_PLAN);
    if (initializer !== undefined) {
      prepareNativeAuthoredValue(ctx, initializer);
    }
  }
}

function noteTarget(node: RegistryTypeDeclaration, state: MutableRegistryFacts, ctx: GateFactContext): void {
  const kind = kindForName(node.getName());
  if (kind === undefined) {
    return;
  }
  const existing = state.targets.get(kind) ?? [];
  existing.push(node);
  state.targets.set(kind, existing);
  prepareNativeTypeProjection(ctx, node, EXPORT_PLAN);
}

function noteFunction(node: FunctionDeclaration, state: MutableRegistryFacts, ctx: GateFactContext): void {
  const typeNode = node.getReturnTypeNode();
  if (typeNode !== undefined) {
    state.candidates.push({ declaration: node, shape: "factory", typeNode, value: node });
    prepareNativeTypeProjection(ctx, typeNode, TYPE_ORIGIN_PLAN);
  }
}

function noteReturn(node: ReturnStatement, state: MutableRegistryFacts, ctx: GateFactContext): void {
  const factory = closestFactory(node);
  if (factory === undefined) {
    return;
  }
  const existing = state.returns.get(factory.compilerNode) ?? [];
  existing.push(node);
  state.returns.set(factory.compilerNode, existing);
  const expression = node.getExpression();
  if (factory.getReturnTypeNode() !== undefined && expression !== undefined) {
    prepareNativeAuthoredValue(ctx, expression);
  }
}

function visitRegistryNode(node: MorphNode, state: MutableRegistryFacts, ctx: GateFactContext): void {
  if (isRegistryType(node)) {
    noteTarget(node, state, ctx);
  } else if (Node.isVariableDeclaration(node)) {
    noteVariable(node, state, ctx);
  } else if (Node.isFunctionDeclaration(node)) {
    noteFunction(node, state, ctx);
  } else if (Node.isReturnStatement(node)) {
    noteReturn(node, state, ctx);
  }
}

/** Create one invocation-local collector and feed it only nodes delivered by the shared dispatcher. */
function createRegistryDefinitionFacts(ctx: GateFactContext): {
  readonly visit: (node: MorphNode) => void;
  readonly forKind: (kind: RegistryDefinitionKind) => RegistryDefinitionKindFacts;
} {
  const state: MutableRegistryFacts = { targets: new Map(), candidates: [], returns: new Map() };
  return {
    visit: (node): void => visitRegistryNode(node, state, ctx),
    forKind: (kind) => factsFor(kind, state, ctx),
  };
}

/** One PROVIDER per registry kind, because a provider is the runtime's atomic failure unit: a fact receipt
 *  refuses on `unresolved > 0`, so a provider summing several kinds would withhold every consumer whenever its
 *  population legitimately declares only some of the registry types.
 *
 *  The receipt states the denominator the provider WALKED (`ctx.files.length`), never what it found (§12.3).
 *  The census is DELIVERED on the fact instead, and the rename tripwire fires one phase later at the
 *  consumer's own `members: <view>.definitions.length` receipt: a missing or ambiguous registry TYPE yields
 *  zero definitions, so the consumer refuses. No gate module reads `view.target`, so the provider must not
 *  publish an `unresolved` of its own; the pins are in `tests/tooling/verify/lib/registry-fact.test.ts`. */
function defineRegistryDefinitionFact(kind: RegistryDefinitionKind): GateFact<RegistryDefinitionKindFacts> {
  return defineFact({
    id: `registry-definitions-${kind}`,
    population: "@client",
    analysis: "types",
    resources: [],
    create: (ctx) => {
      const collector = createRegistryDefinitionFacts(ctx);
      let result: RegistryDefinitionKindFacts | undefined;
      return {
        visitors: [{ kinds: REGISTRY_DEFINITION_VISITOR_KINDS, visit: collector.visit }],
        finish: (): RegistryDefinitionKindFacts => {
          if (result !== undefined) {
            return result;
          }
          const facts = collector.forKind(kind);
          ctx.receipt({ kind: "population", source: `${facts.source}-sources`, members: ctx.files.length });
          result = facts;
          return result;
        },
      };
    },
  });
}

/** The closed per-kind provider table; a new `RegistryDefinitionKind` fails `tsc` here until it has one. */
export const registryDefinitionFacts = {
  section: defineRegistryDefinitionFact("section"),
} satisfies Readonly<Record<RegistryDefinitionKind, GateFact<RegistryDefinitionKindFacts>>>;

/** Normalize opening/self-closing JSX tags and resolve their canonical imported component origin. */
export function readJsxTagFact(node: MorphNode): ReferenceFact<JsxTagFact> {
  if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node))) {
    return unresolved("unsupported", node, [], `${node.getKindName()} is not a JSX element tag`);
  }
  const tagName = node.getTagNameNode();
  const origin = resolveModuleMemberOrigin(tagName);
  return origin.kind === "unresolved" ? origin : { kind: "resolved", value: { element: node, tagName, origin: origin.value }, trace: origin.trace };
}
