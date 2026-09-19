// Low-level AST-resolution helpers for the bus-payload-shape reader, extracted from bus-payload-fact.ts
// (tooling-size, #1584 residue). Pure name/alias/union resolution over CollectorState — no walk*/scan*
// dispatch, which stays in the front door. The front door imports these; this leaf imports nothing back.
import type { IndexedAccessTypeNode, Node as MorphNode, TypeAliasDeclaration, TypeReferenceNode, UnionTypeNode, VariableDeclaration } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { IndexedRead, NamedTypeDecl } from "../contract/bus-payload-fact.ts";
import { readTupleDeclaration } from "./tuple-read.ts";

/** One wire field. `origin` is where it was declared RELATIVE TO THE NAMED EVENT: `local` = spelled inside
 *  the named declaration itself; `inherited` = reached through a base / intersection constituent / aliased
 *  arm. Deduped by the declaring member, so a carrier shared by two events is one member.
 *
 *  `node` IS THE NAME NODE, NOT THE PROPERTY. `report.node` validates its position token against the
 *  reported node's own text at the declared offset, and a property signature's offset-0 slice is
 *  `readonly`, never the field name — so reporting the property with `{ token: name, offset: 0 }` THROWS
 *  (measured 2026-09-13 across five rows of this family). The name node's text IS the field name, so the
 *  derived coordinate is correct by construction and the finding points at the name a reader must change. */
export interface BusPayloadField {
  readonly name: string;
  readonly node: MorphNode;
  readonly origin: "local" | "inherited";
}

/** One fail-closed verdict: a part of a wire shape this reader could not establish. Under D16 that IS the
 *  violation, which is why it is DATA here and a finding in the `-health` policy rather than a tool error. */
export interface BusShapeRefusal {
  readonly node: MorphNode;
  /** The SHAPE LABEL (`unresolved-base:<Name>`, `unsupported-shape:<Kind>`, `unresolved-schema:<Name>`).
   *  It is a discriminator, never a source coordinate: these strings appear in no source file, so the
   *  consumer carries them in the MESSAGE and lets the sink derive the position (guide §2.1 — a legacy
   *  position was a discriminator LABEL, and this contract redefines a position as authored text). */
  readonly token: string;
}

/** A root that resolved and taught the reader nothing, with the name node its finding anchors on. */
export interface BusEmptyRoot {
  readonly name: string;
  readonly node: MorphNode;
}

/** How many alias hops the constraint resolver follows before refusing — a cycle/pathology fence. */
const CONSTRAINT_HOPS = 6;

export interface CollectorState {
  readonly admitted: ReadonlySet<string>;
  readonly fields: BusPayloadField[];
  readonly refusals: BusShapeRefusal[];
  readonly resolvedRoots: Set<string>;
  readonly emptyRoots: BusEmptyRoot[];
  readonly walkedDecls: Set<string>;
  readonly seenMembers: Set<string>;
  readonly carriers: Set<string>;
  events: number;
  local: number;
  inherited: number;
  refPayloads: number;
  namedArms: number;
  revisits: number;
  distributions: number;
}

export function nodeKey(node: MorphNode): string {
  return `${node.getSourceFile().getFilePath()}#${node.getPos()}`;
}

/** Every fail-closed refusal goes through here so the per-root alarm can see it. */
export function refuse(state: CollectorState, at: MorphNode, token: string): void {
  state.refusals.push({ node: at, token });
}

/** What a root's walk has contributed so far — the alarm compares this before and after. */
export function contributionMark(state: CollectorState): string {
  return `${state.local + state.inherited}/${state.namedArms}/${state.revisits}/${state.refusals.length}`;
}

/** Count + judge one wire field, deduped by its DECLARING member so a carrier shared by two roots is one
 *  member. `anchor` is the NAME node (see `BusPayloadField`): the property is the dedupe identity, the name
 *  is the reportable coordinate, and conflating them is what made five rows throw. */
export function recordMember(
  member: { readonly prop: MorphNode; readonly anchor: MorphNode; readonly name: string },
  origin: "local" | "inherited",
  state: CollectorState,
): void {
  const { prop, anchor, name } = member;
  const key = nodeKey(prop);
  if (state.seenMembers.has(key)) {
    return;
  }
  state.seenMembers.add(key);
  if (origin === "local") {
    state.local += 1;
  } else {
    state.inherited += 1;
    state.carriers.add(prop.getSourceFile().getFilePath());
  }
  state.fields.push({ name, node: anchor, origin });
}

/** A property whose TYPE references another named shape — the boundary this reader deliberately does NOT
 *  cross. Counted so the receipt states how much was left un-descended ON PURPOSE, rather than leaving the
 *  non-transitive rule as an unmeasured claim. */
export function countReferencedPayload(prop: MorphNode, state: CollectorState): void {
  const typeNode = N.isPropertySignature(prop) ? prop.getTypeNode() : undefined;
  if (typeNode === undefined) {
    return;
  }
  if (N.isTypeReference(typeNode) || typeNode.getDescendantsOfKind(SyntaxKind.TypeReference).length > 0) {
    state.refPayloads += 1;
  }
}

/** Resolve a type NAME to EVERY declaration it names inside the provider's OWN population. Pure language
 *  service resolution: same-file names and relative imports resolve; a specifier the harness project cannot
 *  resolve (a package subpath / `#alias`) yields an EMPTY list, which the caller refuses rather than
 *  swallows. A definition outside the admitted set is deliberately NOT accepted — see the header's
 *  resolution-fence paragraph.
 *
 *  ALL declarations, not the first (#1030 F2): TypeScript MERGES same-named interfaces, so a carrier can be
 *  declared twice and `getDefinitionNodes()` returns both. A `find()` walked one of them and the members of
 *  the other — which are on the wire exactly the same — were never scanned. `walkedDecls` already dedupes,
 *  so walking every declaration costs one visit each. */
export function resolveNamedTypes(nameNode: MorphNode, state: CollectorState): readonly NamedTypeDecl[] {
  const definitions = N.isIdentifier(nameNode) ? nameNode.getDefinitionNodes() : [];
  return definitions.filter(
    (def): def is NamedTypeDecl => (N.isInterfaceDeclaration(def) || N.isTypeAliasDeclaration(def)) && state.admitted.has(def.getSourceFile().getFilePath()),
  );
}

/** Strip parentheses off a type node so the shape underneath is reachable (the type-node twin of
 *  `ast-read.ts`'s `unwrapExpression`). */
function unwrapType(typeNode: MorphNode): MorphNode {
  let current = typeNode;
  while (N.isParenthesizedTypeNode(current)) {
    current = current.getTypeNode();
  }
  return current;
}

/** The tuple's members, or an EMPTY set when `tuple-read` refuses it. Its THROW becomes the family's own
 *  loud refusal (the caller refuses on a zero-member vocabulary) rather than an exit-2 tool error: under D16
 *  a wire shape the reader cannot establish IS the violation, not a broken checker. */
function tupleMembersOrEmpty(decl: VariableDeclaration): ReadonlySet<string> {
  // @orb-waive caught-failure-ownership(catch): the failure IS owned and surfaced — tuple-read THROWS to say "I cannot establish this vocabulary", and the empty set returned here makes `literalUnionMembers` answer undefined, which makes `readIndexedAccess` answer `unprovable`, which REFUSES `unsupported-shape:MappedType` at the member. Converting it to a D16 finding rather than an exit-2 tool error is the ruling in this module's header: an unprovable bus shape is the violation, not a broken checker. Ends if this return value stops feeding a fail-closed refusal.
  try {
    return readTupleDeclaration(decl).members;
  } catch {
    return new Set<string>();
  }
}

/** `(typeof <TUPLE>)[number]` — the house spelling of a vocabulary union (§5.5). Resolved through
 *  `tuple-read.ts`, the ONE home for "which string members does this `as const` tuple actually have" (#942),
 *  so a member that moved behind a spread is still counted. */
function tupleUnionMembers(node: IndexedAccessTypeNode, state: CollectorState): ReadonlySet<string> | undefined {
  if (node.getIndexTypeNode().getKind() !== SyntaxKind.NumberKeyword) {
    return;
  }
  const query = unwrapType(node.getObjectTypeNode());
  if (!N.isTypeQuery(query)) {
    return;
  }
  const name = query.getExprName();
  if (!N.isIdentifier(name)) {
    return;
  }
  const decl = name
    .getDefinitionNodes()
    .find(
      (def): def is VariableDeclaration =>
        N.isVariableDeclaration(def) && state.admitted.has(def.getSourceFile().getFilePath()) && def.getInitializer() !== undefined,
    );
  if (decl === undefined) {
    return;
  }
  const members = tupleMembersOrEmpty(decl);
  return members.size > 0 ? members : undefined;
}

/** Every arm of a union position, merged — undefined the moment ONE arm is unreadable, because a
 *  partially-read vocabulary is a smaller denominator wearing a resolved answer's clothes. */
function unionMembers(node: UnionTypeNode, state: CollectorState, hops: number): ReadonlySet<string> | undefined {
  const members = new Set<string>();
  for (const part of node.getTypeNodes()) {
    const partMembers = literalUnionMembers(part, state, hops + 1);
    if (partMembers === undefined) {
      return;
    }
    for (const member of partMembers) {
      members.add(member);
    }
  }
  return members.size > 0 ? members : undefined;
}

/** The alias a NAME resolves to, when it resolves to exactly ONE type alias in the population. One or
 *  nothing: two same-named declarations is the ambiguity a reader must not silently pick from (#1030 F2, in
 *  the direction where a wrong guess WIDENS the green). */
function soleAliasFor(node: TypeReferenceNode, state: CollectorState): TypeAliasDeclaration | undefined {
  const decls = resolveNamedTypes(node.getTypeName(), state);
  const [only] = decls;
  return decls.length === 1 && only !== undefined && N.isTypeAliasDeclaration(only) ? only : undefined;
}

/** The FINITE set of string members a type position enumerates, or undefined when this reader cannot
 *  establish it. Sanctioned spellings and no others: an inline string-literal union, an alias chain of them,
 *  and `(typeof <TUPLE>)[number]`. */
function literalUnionMembers(typeNode: MorphNode | undefined, state: CollectorState, hops: number): ReadonlySet<string> | undefined {
  if (typeNode === undefined || hops > CONSTRAINT_HOPS) {
    return;
  }
  const node = unwrapType(typeNode);
  if (N.isLiteralTypeNode(node)) {
    const literal = node.getLiteral();
    return N.isStringLiteral(literal) ? new Set([literal.getLiteralText()]) : undefined;
  }
  if (N.isUnionTypeNode(node)) {
    return unionMembers(node, state, hops);
  }
  if (N.isIndexedAccessTypeNode(node)) {
    return tupleUnionMembers(node, state);
  }
  return N.isTypeReference(node) ? literalUnionMembers(soleAliasFor(node, state)?.getTypeNode(), state, hops + 1) : undefined;
}

/** Read the §5.5 MAPPED-TYPE DISTRIBUTION. It distributes only when BOTH the constraint and the index
 *  resolve to finite string-literal sets and the index is a non-empty SUBSET of the constraint. Everything
 *  else is UNPROVABLE and fails closed.
 *
 *  AND A CONDITIONAL TEMPLATE IS REFUSED HERE, not one level down. `K extends … ? A : B` is the one shape
 *  whose FIELD NAMES vary per arm, which is exactly what makes reading the template once sound; the identity
 *  walker would refuse it by kind, but the FIELD walker is permissive about unmodelled type nodes, so the
 *  only place the refusal holds for BOTH positions is the decision to distribute at all. */
export function readIndexedAccess(node: IndexedAccessTypeNode, state: CollectorState): IndexedRead {
  const object = unwrapType(node.getObjectTypeNode());
  if (!N.isMappedTypeNode(object)) {
    return { kind: "referenced" };
  }
  const template = object.getTypeNode();
  if (template === undefined || object.getNameTypeNode() !== undefined || N.isConditionalTypeNode(unwrapType(template))) {
    return { kind: "unprovable" };
  }
  const constraint = literalUnionMembers(object.getTypeParameter().getConstraint(), state, 0);
  const index = literalUnionMembers(node.getIndexTypeNode(), state, 0);
  if (constraint === undefined || index === undefined || index.size === 0) {
    return { kind: "unprovable" };
  }
  for (const member of index) {
    if (!constraint.has(member)) {
      return { kind: "unprovable" };
    }
  }
  return { kind: "distributed", template };
}

export const NOTIFICATION_SCHEMA_NAME = "notificationEventSchema";

export const UNRESOLVED_TOKEN = "unresolved-base:";
export const UNSUPPORTED_TOKEN = "unsupported-shape:";
export const UNRESOLVED_SCHEMA_TOKEN = "unresolved-schema:";

/** zod builders that neither add a key nor admit an unknown one, so an ARM may chain through them. Anything
 *  else in an arm position is refused — which is how `.loose()`/`.passthrough()`/`.catchall()` are refused. */
export const SCHEMA_KEY_NEUTRAL_METHODS: ReadonlySet<string> = new Set(["strict", "readonly", "describe", "brand", "meta", "register"]);

/** One frame of the walk: who is asking, and where a shapeless verdict is anchored. There is no depth cap
 *  and none is needed — `walkedDecls` makes every declaration walkable exactly once per pass, so a cycle
 *  terminates and a long chain costs one visit per link. */
/** Type-node kinds that cannot declare a named field, so passing over them hides nothing. Everything else
 *  the walker does not model is REPORTED, never skipped. IDENTITY position only — a bus event's identity is
 *  a union of object shapes, so a bare `string` arm there is a shape to refuse, not a value to allow. */
export const MEMBERLESS_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.LiteralType,
  SyntaxKind.UndefinedKeyword,
  SyntaxKind.NeverKeyword,
  SyntaxKind.VoidKeyword,
]);

export interface WalkFrame {
  readonly state: CollectorState;
  /** `local` = spelled inside the named event; `inherited` = reached through a base/constituent/alias. */
  readonly origin: "local" | "inherited";
  /** The node a `missing-type-node` verdict anchors on (the declaration that owns this type position). */
  readonly owner: MorphNode;
}
