// Visitor-fed registry facts; this module owns no Project, walk, path predicate, or binding resolver.

import { resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { ReferenceFact, ReferenceUnresolvedReason } from "@orb/tooling/_shared/reference-fact-contract";
import type { ArrowFunction, FunctionDeclaration, FunctionExpression, Node as MorphNode, ReturnStatement, TypeNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateFact } from "../contract/fact.ts";
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
import type { StaticAuthoredValue } from "../contract/static-authored-value.ts";
import { readStaticAuthoredValue, resolveAuthoredComposite } from "./static-authored-value.ts";

const TYPE_NAMES = {
  section: "SectionDefinition",
  modal: "ModalDefinition",
  "home-tile": "HomeTileContribution",
  "config-group": "ConfigGroupDefinition",
  collection: "CollectionContribution",
  "config-section": "ConfigSectionContribution",
  chrome: "ChromeEntry",
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

function isExportedType(node: MorphNode): node is RegistryTypeDeclaration {
  return (Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)) && node.isExported() && kindForName(node.getName()) !== undefined;
}

function typeOrigin(typeNode: TypeNode): ReferenceFact<RegistryTypeOrigin> {
  const type = typeNode.getType();
  const symbol = type.getAliasSymbol() ?? type.getSymbol();
  if (symbol === undefined) {
    return unresolved("missing", typeNode, [], `type ${typeNode.getText()} has no canonical symbol`);
  }
  const declarations = symbol
    .getDeclarations()
    .filter(
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
): {
  readonly object: ReferenceFact<import("ts-morph").ObjectLiteralExpression>;
  readonly authoredValue: ReferenceFact<StaticAuthoredValue>;
} {
  if (node === undefined) {
    const missing = unresolved<never>("missing", fallback, [fallback], "registry definition has no authored value");
    return { object: missing, authoredValue: missing };
  }
  const authoredValue = readStaticAuthoredValue(node);
  // Object PROVENANCE and field READABILITY are independent facts. Every live registry definition carries
  // imported icons, components, and hooks, so the complete JSON-like value legitimately refuses; inheriting
  // that refusal as a provenance refusal made this fact report zero members for section/modal/home-tile/
  // config-group on the real tree while their definitions were all sitting at their sanctioned paths.
  const stable = resolveAuthoredComposite(node);
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

function candidateValue(candidate: Candidate, returns: ReadonlyMap<object, readonly ReturnStatement[]>): ReturnType<typeof authoredObject> {
  if (candidate.shape === "const") {
    return authoredObject(candidate.value, candidate.declaration);
  }
  const factory = candidate.value;
  if (!(factory !== undefined && (Node.isFunctionDeclaration(factory) || Node.isArrowFunction(factory) || Node.isFunctionExpression(factory)))) {
    return authoredObject(undefined, candidate.declaration);
  }
  const expression = factoryExpression(factory, returns);
  if (expression.kind === "unresolved") {
    return { object: expression, authoredValue: expression };
  }
  return authoredObject(expression.value, candidate.declaration);
}

function targetFact(kind: RegistryDefinitionKind, targets: ReadonlyMap<RegistryDefinitionKind, readonly RegistryTypeDeclaration[]>): RegistryTypeTargetFact {
  const declarations = targets.get(kind) ?? [];
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
 *  REPORTS it (`modal-registry-completeness` "Unreadable definition"). Scoring it as a receipt `unresolved`
 *  made the provider refuse over exactly the population the policy was built to accuse, so the fail-closed
 *  arms could never fire (three `mustFlag` rows, #1953). Every consumer's own receipt already declares this
 *  same census — `members: <view>.definitions.length, unresolved: 0`. */
function factsFor(kind: RegistryDefinitionKind, state: MutableRegistryFacts): RegistryDefinitionKindFacts {
  const target = targetFact(kind, state.targets);
  const definitions: RegistryDefinitionFact[] = [];
  if (target.kind === "resolved") {
    for (const candidate of state.candidates) {
      if (candidate.shape === "factory" && kind !== "section") {
        continue;
      }
      const origin = typeOrigin(candidate.typeNode);
      if (origin.kind === "unresolved" || !sameDeclaration(origin.value.declaration, target.value.declaration)) {
        continue;
      }
      const value = candidateValue(candidate, state.returns);
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

function noteVariable(node: VariableDeclaration, state: MutableRegistryFacts): void {
  const initializer = node.getInitializer();
  if (initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
    const typeNode = initializer.getReturnTypeNode();
    if (typeNode !== undefined) {
      state.candidates.push({ declaration: node, shape: "factory", typeNode, value: initializer });
    }
    return;
  }
  const typeNode = node.getTypeNode();
  if (typeNode !== undefined) {
    state.candidates.push({ declaration: node, shape: "const", typeNode, value: initializer });
  }
}

function noteTarget(node: RegistryTypeDeclaration, state: MutableRegistryFacts): void {
  const kind = kindForName(node.getName());
  if (kind === undefined) {
    return;
  }
  const existing = state.targets.get(kind) ?? [];
  existing.push(node);
  state.targets.set(kind, existing);
}

function noteFunction(node: FunctionDeclaration, state: MutableRegistryFacts): void {
  const typeNode = node.getReturnTypeNode();
  if (typeNode !== undefined) {
    state.candidates.push({ declaration: node, shape: "factory", typeNode, value: node });
  }
}

function noteReturn(node: ReturnStatement, state: MutableRegistryFacts): void {
  const factory = closestFactory(node);
  if (factory === undefined) {
    return;
  }
  const existing = state.returns.get(factory.compilerNode) ?? [];
  existing.push(node);
  state.returns.set(factory.compilerNode, existing);
}

function visitRegistryNode(node: MorphNode, state: MutableRegistryFacts): void {
  if (isExportedType(node)) {
    noteTarget(node, state);
  } else if (Node.isVariableDeclaration(node)) {
    noteVariable(node, state);
  } else if (Node.isFunctionDeclaration(node)) {
    noteFunction(node, state);
  } else if (Node.isReturnStatement(node)) {
    noteReturn(node, state);
  }
}

/** Create one invocation-local collector and feed it only nodes delivered by the shared dispatcher. */
function createRegistryDefinitionFacts(): {
  readonly visit: (node: MorphNode) => void;
  readonly forKind: (kind: RegistryDefinitionKind) => RegistryDefinitionKindFacts;
} {
  const state: MutableRegistryFacts = { targets: new Map(), candidates: [], returns: new Map() };
  return {
    visit: (node): void => visitRegistryNode(node, state),
    forKind: (kind) => factsFor(kind, state),
  };
}

/** One PROVIDER per registry kind, because a provider is the runtime's atomic failure unit.
 *
 *  WHY NOT ONE PROVIDER OVER ALL SEVEN KINDS: it was, until 2026-09-11. A single provider emitted ONE
 *  receipt whose `members`/`unresolved` were sums across every kind, and a fact receipt refuses on
 *  `unresolved > 0` (`lib/policy-pass.ts` `factReceiptFailures`). `factsFor` scores an absent registry TYPE
 *  as one unresolved, so any invocation whose population legitimately declares only some of the seven types
 *  — every isolated conformance fixture, and any real scope narrower than the whole client — summed to a
 *  nonzero refusal and withheld EVERY consumer, including the ones reading a kind that resolved perfectly.
 *  That is how 95 proof rows across eight policies went dark for five days (#1953).
 *
 *  The fix is not a weaker refusal and not reading an unresolved kind as absent (the gate-runtime guide
 *  §12.3: unsupported syntax "never returns absence"; `factsFor` cannot tell "unreferenced" from "renamed",
 *  so collapsing them would blind the rename tripwire). Per-subject failure semantics require per-subject
 *  PROVIDERS: a policy declares only the kinds it reads, only those instantiate, and only their own failure
 *  withholds it. §12.3's one-walk guarantee is unaffected — the pass instantiates each unique provider once
 *  and feeds them all in the same physical walk, and the per-kind scoring work is identical to the seven
 *  `forKind` calls the aggregate already made.
 *
 *  AND THE RECEIPT IS THE OTHER HALF OF THAT FIX, landed 2026-09-11 (#1962). #1953 split the provider per
 *  kind but did not change WHAT each one counts: `members: facts.members` plus `unresolved: facts.unresolved`
 *  is still a CENSUS, so each per-kind provider went on refusing its own empty corpus — `members === 0`
 *  (`lib/policy-pass.ts:631`) for a kind that declares no definition, `unresolved > 0` (`:635`) for one whose
 *  registry TYPE is missing or ambiguous — and `withholdFactDependents` (`:679`) still dropped that kind's
 *  consumers BEFORE `evaluate`. A receipt states the denominator the provider WALKED, never what it found
 *  (§12.3). It now states `ctx.files.length`.
 *
 *  THE RENAME TRIPWIRE SURVIVES, one phase later and per consumer. `target` is delivered on the fact, and a
 *  missing or ambiguous registry TYPE yields zero definitions (`factsFor` admits a definition only through a
 *  RESOLVED target), so every consumer's own `members: <view>.definitions.length` receipt refuses — the
 *  sanctioned blindness door `chrome-registry-completeness`'s header already names. Measured 2026-09-11: no
 *  gate module reads `view.target`, so §12.3's discriminator ("if no consumer expresses its dependency
 *  through the provider's `unresolved`, the provider must not publish one") applies exactly, and the pins are
 *  in `tests/tooling/verify/lib/registry-fact.test.ts`. */
function defineRegistryDefinitionFact(kind: RegistryDefinitionKind): GateFact<RegistryDefinitionKindFacts> {
  return defineFact({
    id: `registry-definitions-${kind}`,
    population: "@client",
    analysis: "types",
    resources: [],
    create: (ctx) => {
      const collector = createRegistryDefinitionFacts();
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
  modal: defineRegistryDefinitionFact("modal"),
  "home-tile": defineRegistryDefinitionFact("home-tile"),
  "config-group": defineRegistryDefinitionFact("config-group"),
  collection: defineRegistryDefinitionFact("collection"),
  "config-section": defineRegistryDefinitionFact("config-section"),
  chrome: defineRegistryDefinitionFact("chrome"),
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
