// The per-node recurrence walk over an authored annotation's value graph, and `resolveTypeValueOrigins` —
// the public entry point that turns that graph into declaration identities, with explicit unresolved
// candidates for a recursively-transported or opaque value position. Drives the containment lattice
// (type-member-origin-containment.ts) and the constructor-summary fixed point (type-member-origin-
// recurrence.ts); neither of those siblings imports back from here.
import type { ReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { Type, TypeNode } from "ts-morph";
import { Node, TypeFlags } from "ts-morph";
import type { Containment, TypeIdentityOrigin } from "../contract/type-member-origin.ts";
import type { ConstructorSummary, TransportContext } from "./type-member-origin-containment.ts";
import {
  annotationChildren,
  dataMemberAnnotation,
  genericArguments,
  genericTarget,
  opaqueType,
  suppliedArgumentContains,
  typeExpressionContains,
  valueTypeEdges,
} from "./type-member-origin-containment.ts";
import { annotationReferenceOrigin, resolved, symbolDeclarations, unprovenTypeIdentity, unresolved } from "./type-member-origin-core.ts";
import { constructorSummaries, recurrenceSignature } from "./type-member-origin-recurrence.ts";

interface RecurrenceFrame {
  readonly target: object;
  readonly roots: readonly Type[];
  readonly relations: Map<object, Map<object, Containment>>;
  readonly signatures: Set<string>;
}

/** The actual data path already re-entered a constructor. Its source definition must independently name
 *  that same target before changing instantiation is refused; a parameter's spelling alone cannot do so. */
function dataDefinitionReenters(definition: TypeNode, target: object, activeDeclarations: ReadonlySet<object>): boolean {
  // A finite input like Readonly<{ child: Readonly<Row> }> names the constructor in caller-authored
  // data, not in that constructor's recursive definition. Only active generic declarations can recur.
  if (!definition.getAncestors().some((ancestor) => activeDeclarations.has(ancestor.compilerNode))) {
    return false;
  }
  const seen = new Set<object>();
  const pending = [definition];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (Node.isTypeReference(node) && genericTarget(node.getType()) === target) {
      return true;
    }
    if (!seen.has(node.compilerNode)) {
      seen.add(node.compilerNode);
      pending.push(...annotationChildren(node));
    }
  }
  return false;
}

interface RecurrenceAncestor {
  readonly type: Type;
  readonly definitionStart: number;
  readonly frame?: RecurrenceFrame;
}

interface RecurrenceStep {
  readonly type: Type;
  readonly ancestors: readonly RecurrenceAncestor[];
  readonly definitions: readonly TypeNode[];
}

function activeGenericDeclarations(ancestors: readonly RecurrenceAncestor[]): ReadonlySet<object> {
  return new Set(
    ancestors.flatMap((ancestor) => {
      const symbol = ancestor.type.getAliasSymbol() ?? ancestor.type.getSymbol();
      return genericTarget(ancestor.type) === undefined ? [] : (symbol?.getDeclarations() ?? []).map((declaration) => declaration.compilerNode);
    }),
  );
}

function recurrenceAncestor(step: RecurrenceStep, target: object): RecurrenceAncestor | undefined {
  const activeDeclarations = activeGenericDeclarations(step.ancestors);
  return [...step.ancestors]
    .reverse()
    .find(
      (ancestor) =>
        genericTarget(ancestor.type) === target &&
        !suppliedArgumentContains(ancestor.type, step.type) &&
        step.definitions.slice(ancestor.definitionStart).some((definition) => dataDefinitionReenters(definition, target, activeDeclarations)),
    );
}

function repeatedCandidateRoots(type: Type, frame: RecurrenceFrame, context: TransportContext): readonly Type[] {
  const dataParameters = context.summaries.get(frame.target)?.possible ?? new Set<number>();
  const argumentsAtBoundary = genericArguments(type);
  return frame.roots.filter((root) =>
    [...dataParameters].some((index) => {
      const argument = argumentsAtBoundary[index];
      return argument !== undefined && typeExpressionContains(argument, root, context) !== "no";
    }),
  );
}

function unsupportedClosedOutputs(summary: ConstructorSummary | undefined): readonly Type[] {
  return summary === undefined || !summary.unsupported ? [] : [...summary.outputs.values()];
}

function advanceRecurrence(
  step: RecurrenceStep,
  edges: readonly Type[],
  location: TypeNode,
  summaries: ReadonlyMap<object, ConstructorSummary>,
): { readonly frame?: RecurrenceFrame; readonly repeatedRoots: readonly Type[]; readonly stop: boolean } {
  const target = genericTarget(step.type);
  if (target === undefined || summaries.get(target)?.recursive !== true) {
    return { repeatedRoots: [], stop: false };
  }
  const frame = recurrenceAncestor(step, target)?.frame;
  if (frame === undefined) {
    const roots = genericArguments(step.type);
    const relations = new Map<object, Map<object, Containment>>();
    const context = { location, relations, summaries };
    return {
      frame: { target, roots, relations, signatures: new Set([recurrenceSignature(step.type, edges, roots, context)]) },
      repeatedRoots: [],
      stop: false,
    };
  }
  const context = { location, relations: frame.relations, summaries };
  const signature = recurrenceSignature(step.type, edges, frame.roots, context);
  if (!frame.signatures.has(signature)) {
    frame.signatures.add(signature);
    return { frame, repeatedRoots: [], stop: false };
  }
  return {
    frame,
    repeatedRoots: [...repeatedCandidateRoots(step.type, frame, context), ...unsupportedClosedOutputs(summaries.get(frame.target))],
    stop: true,
  };
}

/** Stable recursive types terminate by compilerType identity. A changed generic instantiation needs a
 *  separate boundary: an active data definition that recursively names its target is unsupported rather
 *  than expanded indefinitely. Finite supplied-argument nesting remains supported. No hop/time cap. */
function annotationValueGraph(annotation: TypeNode): {
  readonly types: readonly Type[];
  readonly projections: readonly ReferenceFact<TypeIdentityOrigin>[];
  readonly annotations: readonly TypeNode[];
  readonly recursiveTypes: ReadonlySet<object>;
} {
  const types = new Map<object, Type>();
  const projections: ReferenceFact<TypeIdentityOrigin>[] = [];
  const annotations = new Map<object, TypeNode>();
  const recursiveTypes = new Set<object>();
  const summaries = constructorSummaries(annotation);
  const pending: RecurrenceStep[] = [{ type: annotation.getType(), ancestors: [], definitions: [] }];
  for (let step = pending.pop(); step !== undefined; step = pending.pop()) {
    const { type, ancestors, definitions } = step;
    if (types.has(type.compilerType)) {
      continue;
    }
    types.set(type.compilerType, type);
    if (opaqueType(type)) {
      continue;
    }
    const edges = valueTypeEdges(type, annotation);
    const recurrence = advanceRecurrence(
      step,
      edges.types.map(({ type: edge }) => edge),
      annotation,
      summaries,
    );
    for (const root of recurrence.repeatedRoots) {
      recursiveTypes.add(root.compilerType);
    }
    if (recurrence.stop) {
      continue;
    }
    const ancestor: RecurrenceAncestor = {
      type,
      definitionStart: definitions.length,
      ...(recurrence.frame === undefined ? {} : { frame: recurrence.frame }),
    };
    const nextAncestors = [...ancestors, ancestor];
    pending.push(...edges.types.map((edge) => ({ type: edge.type, ancestors: nextAncestors, definitions: [...definitions, ...edge.definitions] })));
    projections.push(...edges.projections);
    for (const member of edges.annotations) {
      annotations.set(member.compilerNode, member);
    }
  }
  return { types: [...types.values()], projections, annotations: [...annotations.values()], recursiveTypes };
}

function annotationAliasBodies(origin: TypeIdentityOrigin, visited: Set<object>): readonly ReferenceFact<TypeNode>[] {
  const bodies: ReferenceFact<TypeNode>[] = [];
  for (const declaration of origin.declarations) {
    if (visited.has(declaration.compilerNode)) {
      continue;
    }
    visited.add(declaration.compilerNode);
    if (Node.isInterfaceDeclaration(declaration)) {
      // In particular retain index annotations whose opaque element leaves no property declaration.
      bodies.push(
        ...declaration
          .getMembers()
          .flatMap(dataMemberAnnotation)
          .map((member) => resolved(member, declaration, [declaration])),
      );
      continue;
    }
    if (!Node.isTypeAliasDeclaration(declaration)) {
      continue;
    }
    const body = declaration.getTypeNode();
    bodies.push(
      body === undefined
        ? unresolved("missing", declaration, `type alias ${declaration.getName()} has no authored body`)
        : resolved(body, declaration, [declaration]),
    );
  }
  return bodies;
}

/** A concrete transforming expression bounds candidate provenance to its own value positions. Otherwise
 *  an unknown sibling could make a proven-erased Phantom<Row> argument look unreadable. The finite prefix
 *  before a recursive boundary is still a valid scope: recursion makes only actual data candidates on that
 *  prefix unreadable, never every supplied argument. An opaque result cannot supply a bound and deliberately
 *  keeps its authored candidates unresolved. */
function candidateScopes(node: TypeNode, scopes: readonly ReadonlySet<object>[]): readonly ReadonlySet<object>[] {
  if (!(Node.isTypeReference(node) || Node.isTypeOperatorTypeNode(node) || Node.isIndexedAccessTypeNode(node) || Node.isConditionalTypeNode(node))) {
    return scopes;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a still-dependent conditional has no concrete output with which to bound its possible branches, including through an alias reference.
  if ((node.getType().getFlags() & TypeFlags.Conditional) !== 0) {
    return scopes;
  }
  const graph = annotationValueGraph(node);
  return graph.types.some(opaqueType) ? scopes : [...scopes, new Set([...graph.types.map((type) => type.compilerType), ...graph.recursiveTypes])];
}

/** Declaration candidates, not evidence of receipt. Their effective types still have to match a value
 *  position. This syntax pass preserves authored alias names that checker simplification can erase. */
function annotationCandidates(annotation: TypeNode): readonly { readonly origin: ReferenceFact<TypeIdentityOrigin>; readonly type: Type }[] {
  const candidates: { readonly origin: ReferenceFact<TypeIdentityOrigin>; readonly type: Type }[] = [];
  const pending: { readonly node: TypeNode; readonly scopes: readonly ReadonlySet<object>[]; readonly aliases: ReadonlySet<object> }[] = [
    { node: annotation, scopes: [], aliases: new Set<object>() },
  ];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const scopes = candidateScopes(next.node, next.scopes);
    pending.push(...annotationChildren(next.node).map((node) => ({ node, scopes, aliases: next.aliases })));
    if (!Node.isTypeReference(next.node)) {
      continue;
    }
    const name = next.node.getTypeName();
    const origin = annotationReferenceOrigin(Node.isQualifiedName(name) ? name.getRight() : name);
    const type = next.node.getType();
    if (next.scopes.every((scope) => scope.has(type.compilerType))) {
      candidates.push({ origin, type });
    }
    if (origin.kind === "unresolved") {
      continue;
    }
    // Eligibility depends on the path: visiting an erased argument must not consume the same alias's
    // later value path. A path-local declaration set terminates cycles without conflating those reads.
    const aliases = new Set(next.aliases);
    for (const body of annotationAliasBodies(origin.value, aliases)) {
      if (body.kind === "resolved") {
        pending.push({ node: body.value, scopes, aliases });
      } else {
        candidates.push({ origin: body, type });
      }
    }
  }
  return candidates;
}

function eligibleTypeOrigin(
  origin: ReferenceFact<TypeIdentityOrigin>,
  type: Type,
  valueTypes: ReadonlySet<object>,
  unreadableDetail: string | undefined,
): ReferenceFact<TypeIdentityOrigin> | undefined {
  const eligible = valueTypes.has(type.compilerType);
  let fact: ReferenceFact<TypeIdentityOrigin> | undefined;
  if (origin.kind === "unresolved") {
    fact = eligible || unreadableDetail !== undefined ? origin : undefined;
  } else if (eligible && !opaqueType(type) && !type.isNever()) {
    fact = origin;
  } else if (unreadableDetail !== undefined) {
    fact = unprovenTypeIdentity(origin.value, "unsupported", unreadableDetail);
  }
  return fact;
}

function resolvedValueTypeOrigins(type: Type, annotation: TypeNode): readonly ReferenceFact<TypeIdentityOrigin>[] {
  if (opaqueType(type) || type.isNever()) {
    return [];
  }
  const alias = type.getAliasSymbol();
  return [alias, type.getSymbol()].flatMap((symbol) => {
    if (symbol === undefined) {
      return [];
    }
    const declarations = symbolDeclarations(symbol, annotation, `value type ${symbol.getName()}`);
    return [
      declarations.kind === "unresolved"
        ? declarations
        : resolved({ name: symbol.getName(), node: annotation, aliased: symbol === alias, declarations: declarations.value }, annotation, declarations.value),
    ];
  });
}

function appendTypeOrigin(facts: ReferenceFact<TypeIdentityOrigin>[], fact: ReferenceFact<TypeIdentityOrigin>): void {
  const duplicate = facts.some((existing) => {
    if (fact.kind === "unresolved") {
      return existing.kind === "unresolved" && existing.node.compilerNode === fact.node.compilerNode && existing.reason === fact.reason;
    }
    return (
      existing.kind === "resolved" &&
      existing.value.name === fact.value.name &&
      existing.value.declarations.length === fact.value.declarations.length &&
      existing.value.declarations.every((declaration) => fact.value.declarations.some((candidate) => candidate.compilerNode === declaration.compilerNode))
    );
  });
  if (!duplicate) {
    facts.push(fact);
  }
}

/** Declaration identities carried by an authored value type, with explicit unresolved candidates.
 *
 *  The checker owns data containment: unions/intersections, tuple/array/index elements and named property
 *  types, uniformly for ordinary objects and mappings. Written references and alias bodies retain a name
 *  only when their resolved compilerType occurs in that graph. This keeps a simplified ExemptionTable alias
 *  without treating keyof Table or an erased Phantom<Table> argument as a table value. Resolved symbols cover actual generic/indexed outputs without
 *  interpreting generics or maintaining a utility-name roster. Declaration sets remain complete.
 *
 *  An any/unknown/type-parameter value position cannot establish an authored candidate's identity. A
 *  projection may retain an interface's member provenance without its value identity. Both return
 *  unresolved facts whose trace retains that candidate's declarations; foreign provenance stays foreign.
 *  Cyclic alias syntax terminates by declaration identity, and an opaque cyclic result is a refusal, never
 *  a positive inferred from a sibling's spelling. Changed recursive instantiation through an active data
 *  definition stops that expanding edge; only canonical evidence on the finite data prefix can resolve or
 *  refuse, so an erased supplied argument stays syntax-only. A compilerType visited set alone cannot terminate that graph.
 *  Primitive results are proven non-candidates. This is not a whole-TypeScript validity check or a structural assignability test. All caches are invocation-local. */
export function resolveTypeValueOrigins(annotation: TypeNode): readonly ReferenceFact<TypeIdentityOrigin>[] {
  const graph = annotationValueGraph(annotation);
  const valueTypes = new Set(graph.types.map((type) => type.compilerType));
  let unreadableDetail: string | undefined;
  if (graph.recursiveTypes.size > 0) {
    unreadableDetail = "a recursively transported data candidate does not have a finite resolved containment graph";
  } else if (graph.types.some(opaqueType)) {
    unreadableDetail = "an opaque value type does not establish this authored candidate's identity";
  }
  const facts: ReferenceFact<TypeIdentityOrigin>[] = [];
  // Property declarations retain opaque authored candidates erased from the effective property type.
  // Each candidate still passes its own transformation scopes and the complete received data graph.
  for (const { origin, type } of [annotation, ...graph.annotations].flatMap(annotationCandidates)) {
    const fact = eligibleTypeOrigin(origin, type, valueTypes, unreadableDetail);
    if (fact !== undefined) {
      appendTypeOrigin(facts, fact);
    }
  }
  for (const type of graph.types) {
    for (const origin of resolvedValueTypeOrigins(type, annotation)) {
      appendTypeOrigin(facts, origin);
    }
  }
  for (const projection of graph.projections) {
    appendTypeOrigin(facts, projection);
  }
  return facts;
}
