// The shared WIRE-SHAPE reader behind the `bus-payload` family (D16) — one transitive walk of every live
// bus-event union's own type identity, producing the field census both family members judge.
//
// WHY IT IS A PROVIDER AND NOT A READER EACH SIBLING CALLS. The walk is the expensive part (measured 7.9 s
// over the real corpus as a legacy `visit` hook), and the family SPLITS on authority: the credential-field
// arm has a reviewed door and the fail-closed arm has none. Two policies calling one reader would walk the
// corpus twice; a `defineFact` provider is instantiated once and fed in the same physical walk
// (gate-runtime-standardization.md §3).
//
// WHAT THE PROVIDER PUBLISHES, AND WHAT IT DELIBERATELY DOES NOT. It publishes the FIELD census, the
// fail-closed REFUSALS, the roots it resolved and the roots that contributed nothing — all as fact DATA. Its
// own receipt states only what it MEASURED (the authored files it walked) with `unresolved: 0`, because
// `receiptFailures` turns a provider's `unresolved > 0` into a FACT TOOL ERROR that withholds every
// consumer — which would preempt the very `-health` policy whose whole job is to report those refusals
// (§12.3, the #1953/#1955 shape). Emptiness and holes are FIELDS here, never receipt counters.
//
// THE MEMBER SET IS THE NAMED EVENT'S OWN TYPE IDENTITY, AND IT IS TRANSITIVE (#948, 2026-09-01). The
// reader resolves what the named event IS: its `extends` bases, its intersection constituents, and its
// union ARMS that alias another declaration — following each through imports to the declaring file. Those
// members are on the wire exactly as a locally-spelled one is, so a credential can no longer hide behind an
// imported base interface or an aliased arm.
//
// THE BOUNDARY THAT STAYS NON-TRANSITIVE, AND WHY: a NAMED type a field REFERENCES is not resolved.
// `{ view?: MessageView }` contributes the field name `view` and stops — MessageView is separately homed,
// carries content/economics rather than secrets, and is scanned by its own home's rules. The line is
// identity-vs-containment: what the event IS is on the wire under the event's own name; what a field
// REFERENCES is a different shape with a different owner. Widening past it would make this a whole-graph
// type crawler with no natural edge. What a field SPELLS INLINE is on the near side of that line and IS
// read: an inline `{ … }` literal's keys ride the wire under the event's own name.
//
// A MAPPED-TYPE DISTRIBUTION IS RESOLVED, NOT REFUSED (#1047). `{ [K in <union>]: <template> }[<union>]` is
// the house §5.5 spelling of a per-key arm set (`WorkloadEvent`'s `succeeded`), and the INDEX ERASES THE
// MAPPED KEYS: the wire fields are the TEMPLATE's own members, identical for every arm. So the reader
// resolves the constraint into its finite member set and walks the template ONCE; the mapped key itself is
// never a field. It distributes ONLY when both the constraint and the index resolve to finite string-literal
// sets (an inline union, an alias chain, or `(typeof <TUPLE>)[number]` read through `lib/tuple-read.ts` —
// the one home for that question, #942) and the index is a non-empty SUBSET of the constraint. Everything
// else keeps the open-key-space refusal: a `string`/`keyof`/generic constraint, an `as` key remapping, an
// out-of-constraint index, and — one level down, by its own unmodelled-shape arm — a CONDITIONAL template,
// the one shape that would make reading the template once a lie about the other arms.
//
// AN OPEN KEY SPACE IS REFUSED, NOT SKIPPED (#1024). An index signature, a mapped type, a `Record<…>`, an
// `unknown`/`any` field declares NO key vocabulary anywhere, so — unlike a referenced payload — there is no
// other home whose rules could ever scan what rides inside it, and the field-NAME predicate is structurally
// blind to it. `getProperties()` silently omits index signatures, which is exactly how that shape stayed
// invisible. Every member of a walked declaration that is not a plain named property is REPORTED by kind.
//
// THE NOTIFICATION ZOD ARM RESOLVES IMPORTED SCHEMA OBJECTS (#1025), the same leak family as #948 on the
// schema side. Sanctioned, all through RELATIVE imports only: an imported `z.object` identifier used as an
// arm, `.extend({…})`/`.merge(x)` chains, and `{ ...base.shape }` spreads. Everything else in an ARM
// position is REFUSED (`unsupported-shape:z.<method>` / `unresolved-schema:<Name>`) — which is also how
// `.loose()`/`.passthrough()`/`.catchall()` are refused, the zod spelling of the same open key space.
//
// BOTH READER POSITIONS FAIL CLOSED, NOT JUST THE IDENTITY ONE (#1066). There are TWO walkers —
// `walkTypeNode` for the event's IDENTITY and `walkFieldType` for what a FIELD spells — and they used to
// fail in opposite directions. The field walker now has exactly four terminal answers and no fifth: WALK the
// wrappers/containers, READ an inline object literal or a provable §5.5 distribution, STOP at a NAMED
// reference, or REFUSE. Only a provably KEYLESS kind (`FIELD_KEYLESS_KINDS`) passes in silence, and that set
// is WIDER than the identity walker's on purpose — `chatId: string` is a field, never an event identity.
//
// THE ZOD SCHEMA BUILDER IS READ BY MEMBER, NOT BY NODE KIND (#2353). `scanSchemaExpr` keyed its callee on
// `PropertyAccessExpression`, so `z["object"]({ … })` fell through to the strict-position refusal and the
// notification schema's whole arm list contributed ZERO wire keys — the credential-key search then ran over
// an empty population and the policy's own `mustFlag` fixtures stopped flagging under the bracket
// respelling. Every builder hop (`object`/`extend`/`merge`/the key-neutral methods) and the `{ ...base.shape }`
// spread now resolve through `lib/symbol-reference.ts#readMemberAccess`.
//
// THE RESOLUTION FENCE IS THE POPULATION FENCE, AND THAT IS A CONVERSION NARROWING (#1584). The legacy
// reader accepted any declaration under the repo root outside `node_modules`; this one accepts only a
// declaration the provider's own population ADMITTED, and refuses everything else as `unresolved-base:`.
// Strictly stricter, and it is forced: a policy may only anchor a finding inside its own population
// (`lib/policy-pass-context.ts`), so a member declared outside it could not be REPORTED at all — the
// alternative to the fence is a runtime throw on a wire shape nobody can read, which is the same verdict
// said less usefully.
import type {
  IndexedAccessTypeNode,
  InterfaceDeclaration,
  Node as MorphNode,
  SourceFile,
  TypeAliasDeclaration,
  TypeReferenceNode,
  UnionTypeNode,
  VariableDeclaration,
} from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { MemberRead } from "../contract/symbol-reference.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readMemberAccess } from "./symbol-reference.ts";
import { readTupleDeclaration } from "./tuple-read.ts";

/** The bus event UNION declarations, by their one-home paths. The provider reads these files and picks out
 *  the named declarations below — it does NOT flag every property in these large contract files.
 *
 *  #1030 F4 admitted the rpg ROOM stream (`RpgBusEvent`, fanned to every subscriber of an open room exactly
 *  like `ChatBusEvent`) and the automation bus; #1047 admitted the workloads lifecycle stream once its
 *  `succeeded.result` stopped being `unknown`. */
export const BUS_FILES: ReadonlySet<string> = new Set([
  "packages/contracts/src/chat/bus.ts",
  "packages/contracts/src/user-bus/index.ts",
  "packages/contracts/src/notifications/index.ts",
  "packages/contracts/src/events/index.ts",
  "packages/contracts/src/world-info/index.ts",
  "packages/contracts/src/rpg/bus.ts",
  "packages/contracts/src/automation/index.ts",
  "packages/contracts/src/workloads/events.ts",
]);

/** The type-alias / interface declaration names that ARE bus event payload shapes (the ROOTS of the member
 *  walk). This list is a ROOT set, not the member denominator: an arm/base that is NOT named here is reached
 *  transitively and scanned all the same, which is why `PersonaUpdatedEvent`/`WorldInfoUpdatedEvent` (live
 *  `DomainEvent` arms) need no row. */
export const BUS_DECL_NAMES: ReadonlySet<string> = new Set([
  "ChatBusEvent",
  "UserBusEvent",
  "WiBusEvent",
  "DomainEvent",
  "CharacterUpdatedEvent",
  "AssetCreatedEvent",
  "RpgBusEvent",
  "AutomationBusEvent",
  "WorkloadEvent",
]);

export const NOTIFICATION_SCHEMA_NAME = "notificationEventSchema";

/** Real-tree anchor in its RENAME-PROOF form: a COUNT, not a file list. A real run loads the whole
 *  `@contracts` package; a conformance mini-project loads a handful. An all-bus-homes-loaded guard would
 *  have been the trap it exists to catch — rename ONE bus home and the guard abstains exactly when its
 *  declarations went missing. */
export const REAL_CORPUS_MIN = 40;

/** The credential-smell tokens (lowercased substring match on a field name). `key` catches apiKey/secretKey;
 *  `credential` catches credentialId. Substring, not `\b`-word — camelCase field names have no word boundary
 *  before an embedded token (`apiKey`, `xApiKey`). */
const SMELL_TOKENS = ["secret", "token", "apikey", "password", "credential", "key"] as const;

/** The lowercased credential-token a field name matches, or undefined. */
export function smellToken(fieldName: string): string | undefined {
  const lower = fieldName.toLowerCase();
  return SMELL_TOKENS.find((t) => lower.includes(t));
}

const UNRESOLVED_TOKEN = "unresolved-base:";
const UNSUPPORTED_TOKEN = "unsupported-shape:";
const UNRESOLVED_SCHEMA_TOKEN = "unresolved-schema:";

/** One wire field. `origin` is where it was declared RELATIVE TO THE NAMED EVENT: `local` = spelled inside
 *  the named declaration itself; `inherited` = reached through a base / intersection constituent / aliased
 *  arm. Deduped by the declaring member, so a carrier shared by two events is one member.
 *
 *  `node` IS THE NAME NODE, NOT THE PROPERTY. `report.node` validates its position token against the
 *  reported node's own text at the declared offset, and a property signature's offset-0 slice is
 *  `readonly`, never the field name — so reporting the property with `{ token: name, offset: 0 }` THROWS
 *  (measured 2026-09-13 across five rows of this family). The name node's text IS the field name, so the
 *  derived coordinate is correct by construction and the finding points at the name a reader must change. */
interface BusPayloadField {
  readonly name: string;
  readonly node: MorphNode;
  readonly origin: "local" | "inherited";
}

/** One fail-closed verdict: a part of a wire shape this reader could not establish. Under D16 that IS the
 *  violation, which is why it is DATA here and a finding in the `-health` policy rather than a tool error. */
interface BusShapeRefusal {
  readonly node: MorphNode;
  /** The SHAPE LABEL (`unresolved-base:<Name>`, `unsupported-shape:<Kind>`, `unresolved-schema:<Name>`).
   *  It is a discriminator, never a source coordinate: these strings appear in no source file, so the
   *  consumer carries them in the MESSAGE and lets the sink derive the position (guide §2.1 — a legacy
   *  position was a discriminator LABEL, and this contract redefines a position as authored text). */
  readonly token: string;
}

/** A root that resolved and taught the reader nothing, with the name node its finding anchors on. */
interface BusEmptyRoot {
  readonly name: string;
  readonly node: MorphNode;
}

export interface BusPayloadFact {
  readonly fields: readonly BusPayloadField[];
  readonly refusals: readonly BusShapeRefusal[];
  /** The named roots (+ the notification schema) this run actually resolved — the blindness arm's truth set. */
  readonly resolvedRoots: ReadonlySet<string>;
  /** Roots whose walk contributed NOTHING at all: no member, no deferral to another named root, no revisit
   *  and no refusal. A schema/type refactor can hollow a root out without renaming it, which the blindness
   *  arm cannot see because the name still resolves (#1030 F3). Each carries its own DECLARATION NAME NODE:
   *  an empty root RESOLVED, so unlike the blindness arm's missing subject it has a node to anchor on, and
   *  anchoring there puts the finding on the declaration a reader must re-derive. */
  readonly emptyRoots: readonly BusEmptyRoot[];
  /** How many authored files the provider's population admitted — the blindness arm's corpus guard. */
  readonly corpusFiles: number;
  /** True when the anchor bus home was loaded: the stale/liveness arms' single-file guard. */
  readonly anchorLoaded: boolean;
  readonly census: BusPayloadCensus;
  readonly receipt: { readonly source: string; readonly members: number };
}

/** The per-pass member census — the semantic denominator the family declares, so a drop is visible even when
 *  the file count is unchanged. `revisits` counts identity references to a declaration ALREADY walked this
 *  pass (a carrier two roots share) — a real contribution for the per-root alarm, even though it adds no new
 *  member. `distributions` counts the §5.5 mapped-type arms this reader RESOLVED (#1047): the day that
 *  number falls to zero while the spelling is still on the tree, the reader stopped reaching a live union's
 *  members. */
interface BusPayloadCensus {
  readonly events: number;
  readonly local: number;
  readonly inherited: number;
  readonly carriers: number;
  readonly refPayloads: number;
  readonly namedArms: number;
  readonly revisits: number;
  readonly distributions: number;
}

/** Real-tree anchor (§4.5): a bus union home that is never an example subject in the family's own rows. */
const BUS_ANCHOR_FILE = "packages/contracts/src/world-info/index.ts";

const PROVIDER_RECEIPT_SOURCE = "bus-payload-shape";

/** Type-node kinds that cannot declare a named field, so passing over them hides nothing. Everything else
 *  the walker does not model is REPORTED, never skipped. IDENTITY position only — a bus event's identity is
 *  a union of object shapes, so a bare `string` arm there is a shape to refuse, not a value to allow. */
const MEMBERLESS_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.LiteralType,
  SyntaxKind.UndefinedKeyword,
  SyntaxKind.NeverKeyword,
  SyntaxKind.VoidKeyword,
]);

/** The FIELD position's keyless set — deliberately WIDER than `MEMBERLESS_KINDS` (#1066). A field
 *  legitimately spells a scalar where an event's identity never does, and a scalar declares no wire key, so
 *  passing over one hides nothing. A template literal is a string by construction: its interpolations are
 *  types, never wire keys. */
const FIELD_KEYLESS_KINDS: ReadonlySet<SyntaxKind> = new Set([
  ...MEMBERLESS_KINDS,
  SyntaxKind.StringKeyword,
  SyntaxKind.NumberKeyword,
  SyntaxKind.BooleanKeyword,
  SyntaxKind.BigIntKeyword,
  SyntaxKind.SymbolKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.TemplateLiteralType,
]);

/** Value-position type keywords that carry an UNCONSTRAINED value — an open key space by another spelling
 *  (the contract headers' "no `unknown`" half). Reported by their own word, not by SyntaxKind name. */
const OPEN_VALUE_KINDS: ReadonlyMap<SyntaxKind, string> = new Map([
  [SyntaxKind.UnknownKeyword, "unknown"],
  [SyntaxKind.AnyKeyword, "any"],
]);

/** The one global type NAME that IS an open key space. Matched by name rather than resolved, because
 *  `Record` is a global lib alias — the workspace resolver would answer "outside the population" for it and
 *  the finding would read `unresolved-base:Record`, which names the wrong defect. */
const OPEN_RECORD_NAME = "Record";

/** zod builders that neither add a key nor admit an unknown one, so an ARM may chain through them. Anything
 *  else in an arm position is refused — which is how `.loose()`/`.passthrough()`/`.catchall()` are refused. */
const SCHEMA_KEY_NEUTRAL_METHODS: ReadonlySet<string> = new Set(["strict", "readonly", "describe", "brand", "meta", "register"]);

/** How many alias hops the constraint resolver follows before refusing — a cycle/pathology fence. */
const CONSTRAINT_HOPS = 6;

type NamedTypeDecl = InterfaceDeclaration | TypeAliasDeclaration;

interface CollectorState {
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

/** One frame of the walk: who is asking, and where a shapeless verdict is anchored. There is no depth cap
 *  and none is needed — `walkedDecls` makes every declaration walkable exactly once per pass, so a cycle
 *  terminates and a long chain costs one visit per link. */
interface WalkFrame {
  readonly state: CollectorState;
  /** `local` = spelled inside the named event; `inherited` = reached through a base/constituent/alias. */
  readonly origin: "local" | "inherited";
  /** The node a `missing-type-node` verdict anchors on (the declaration that owns this type position). */
  readonly owner: MorphNode;
}

/** Stable identity for a node across one pass (a declaration or a property signature). */
function nodeKey(node: MorphNode): string {
  return `${node.getSourceFile().getFilePath()}#${node.getPos()}`;
}

/** Every fail-closed refusal goes through here so the per-root alarm can see it. */
function refuse(state: CollectorState, at: MorphNode, token: string): void {
  state.refusals.push({ node: at, token });
}

/** What a root's walk has contributed so far — the alarm compares this before and after. */
function contributionMark(state: CollectorState): string {
  return `${state.local + state.inherited}/${state.namedArms}/${state.revisits}/${state.refusals.length}`;
}

/** Count + judge one wire field, deduped by its DECLARING member so a carrier shared by two roots is one
 *  member. `anchor` is the NAME node (see `BusPayloadField`): the property is the dedupe identity, the name
 *  is the reportable coordinate, and conflating them is what made five rows throw. */
function recordMember(
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
function countReferencedPayload(prop: MorphNode, state: CollectorState): void {
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
function resolveNamedTypes(nameNode: MorphNode, state: CollectorState): readonly NamedTypeDecl[] {
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

/** What an `X[I]` type node in a member position IS, for this reader. */
type IndexedRead =
  /** `Named[K]` — a shape the position REFERENCES, so the non-transitive boundary decides it. */
  | { readonly kind: "referenced" }
  /** A mapped type whose key space this reader cannot enumerate — an open key space, fail closed. */
  | { readonly kind: "unprovable" }
  /** `{ [K in <finite union>]: T }[<subset>]` — the arms are provable and T is their shared shape. */
  | { readonly kind: "distributed"; readonly template: MorphNode };

/** Read the §5.5 MAPPED-TYPE DISTRIBUTION. It distributes only when BOTH the constraint and the index
 *  resolve to finite string-literal sets and the index is a non-empty SUBSET of the constraint. Everything
 *  else is UNPROVABLE and fails closed.
 *
 *  AND A CONDITIONAL TEMPLATE IS REFUSED HERE, not one level down. `K extends … ? A : B` is the one shape
 *  whose FIELD NAMES vary per arm, which is exactly what makes reading the template once sound; the identity
 *  walker would refuse it by kind, but the FIELD walker is permissive about unmodelled type nodes, so the
 *  only place the refusal holds for BOTH positions is the decision to distribute at all. */
function readIndexedAccess(node: IndexedAccessTypeNode, state: CollectorState): IndexedRead {
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

/** Follow one reference in the named event's IDENTITY position (a heritage base, an intersection
 *  constituent, an aliased union arm). A reference to another NAMED root is skipped — that root is walked
 *  from its own declaration, so following it here would only double-count. */
function followIdentityRef(nameNode: MorphNode, at: MorphNode, state: CollectorState): void {
  const name = nameNode.getText();
  if (BUS_DECL_NAMES.has(name)) {
    state.namedArms += 1;
    return;
  }
  const decls = resolveNamedTypes(nameNode, state);
  if (decls.length === 0) {
    refuse(state, at, `${UNRESOLVED_TOKEN}${name}`);
    return;
  }
  for (const decl of decls) {
    walkDecl(decl, "inherited", state);
  }
}

/** Walk a declaration's MEMBER list. A member that is not a plain named property — an index signature, a
 *  method/call/construct signature, a computed name — is a wire key the field-name predicate structurally
 *  cannot read, so it is REFUSED by kind (#1024). `getProperties()` used to be the reader here, and it omits
 *  index signatures silently: that omission was the blind spot. */
function walkMembers(members: readonly MorphNode[], frame: WalkFrame): void {
  for (const member of members) {
    if (!N.isPropertySignature(member)) {
      refuse(frame.state, member, `${UNSUPPORTED_TOKEN}${member.getKindName()}`);
      continue;
    }
    if (N.isComputedPropertyName(member.getNameNode())) {
      refuse(frame.state, member, `${UNSUPPORTED_TOKEN}ComputedName`);
      continue;
    }
    countReferencedPayload(member, frame.state);
    recordMember({ prop: member, anchor: member.getNameNode(), name: member.getName() }, frame.origin, frame.state);
    walkFieldType(member.getTypeNode(), frame);
  }
}

/** The two MAPPED-TYPE shapes a field's own type can spell, judged together; true when this node was one of
 *  them and has been handled. A BARE mapped type puts its KEYS on the wire under this field, and this reader
 *  cannot judge a key vocabulary it did not author, so it stays refused. The INDEXED form erases those keys,
 *  so a provable distribution is DESCENDED. `Named[K]` — the live `result: WorkloadResultByKind[K]` — is a
 *  shape the field REFERENCES and stops at the non-transitive boundary. */
function walkFieldMappedShape(typeNode: MorphNode, frame: WalkFrame): boolean {
  if (N.isMappedTypeNode(typeNode)) {
    refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}MappedType`);
    return true;
  }
  if (!N.isIndexedAccessTypeNode(typeNode)) {
    return false;
  }
  const read = readIndexedAccess(typeNode, frame.state);
  if (read.kind === "distributed") {
    frame.state.distributions += 1;
    walkFieldType(read.template, frame);
    return true;
  }
  if (read.kind === "unprovable") {
    refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}MappedType`);
  }
  return true;
}

/** The shapes whose CONSTITUENTS are field positions in their own right — a wrapper's inner type, an array's
 *  element type, a tuple's elements, a union/intersection's parts. True when this node was one of them and
 *  every constituent has been walked. */
function walkFieldContainer(typeNode: MorphNode, frame: WalkFrame): boolean {
  const wrapper =
    N.isParenthesizedTypeNode(typeNode) ||
    N.isTypeOperatorTypeNode(typeNode) ||
    N.isRestTypeNode(typeNode) ||
    N.isOptionalTypeNode(typeNode) ||
    N.isNamedTupleMember(typeNode);
  if (wrapper) {
    walkFieldType(typeNode.getTypeNode(), frame);
    return true;
  }
  if (N.isArrayTypeNode(typeNode)) {
    walkFieldType(typeNode.getElementTypeNode(), frame);
    return true;
  }
  // A TUPLE element is a field position of its own: an inline object literal spelled there rides the wire
  // exactly like an array's element type, and it was never walked at all before #1066.
  if (N.isTupleTypeNode(typeNode)) {
    for (const element of typeNode.getElements()) {
      walkFieldType(element, frame);
    }
    return true;
  }
  if (N.isUnionTypeNode(typeNode) || N.isIntersectionTypeNode(typeNode)) {
    for (const constituent of typeNode.getTypeNodes()) {
      walkFieldType(constituent, frame);
    }
    return true;
  }
  return false;
}

/** Judge a wire field's OWN spelled type: refuse an open key space, and descend an INLINE object literal. A
 *  NAMED reference is never resolved — that is the non-transitive boundary, and `Record` is the one name
 *  matched literally. AND IT FAILS CLOSED ON EVERY OTHER KIND (#1066): a kind that is neither WALKED, READ,
 *  deliberately STOPPED nor provably KEYLESS is REFUSED as `unsupported-shape:<Kind>`. */
function walkFieldType(typeNode: MorphNode | undefined, frame: WalkFrame): void {
  if (typeNode === undefined) {
    return;
  }
  if (walkFieldContainer(typeNode, frame)) {
    return;
  }
  if (N.isTypeLiteral(typeNode)) {
    walkMembers(typeNode.getMembers(), frame);
    return;
  }
  if (walkFieldMappedShape(typeNode, frame)) {
    return;
  }
  if (N.isTypeReference(typeNode)) {
    if (typeNode.getTypeName().getText() === OPEN_RECORD_NAME) {
      refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${OPEN_RECORD_NAME}`);
    }
    return;
  }
  const openValue = OPEN_VALUE_KINDS.get(typeNode.getKind());
  if (openValue !== undefined) {
    refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${openValue}`);
    return;
  }
  if (FIELD_KEYLESS_KINDS.has(typeNode.getKind())) {
    return;
  }
  refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${typeNode.getKindName()}`);
}

/** Walk a type NODE in an identity position, recording its direct members and following its references. */
function walkTypeNode(typeNode: MorphNode | undefined, frame: WalkFrame): void {
  if (typeNode === undefined) {
    refuse(frame.state, frame.owner, `${UNSUPPORTED_TOKEN}missing-type-node`);
    return;
  }
  if (N.isUnionTypeNode(typeNode) || N.isIntersectionTypeNode(typeNode)) {
    for (const member of typeNode.getTypeNodes()) {
      walkTypeNode(member, frame);
    }
    return;
  }
  if (N.isParenthesizedTypeNode(typeNode)) {
    walkTypeNode(typeNode.getTypeNode(), frame);
    return;
  }
  if (N.isTypeLiteral(typeNode)) {
    walkMembers(typeNode.getMembers(), frame);
    return;
  }
  if (N.isTypeReference(typeNode)) {
    followIdentityRef(typeNode.getTypeName(), typeNode, frame.state);
    return;
  }
  if (N.isIndexedAccessTypeNode(typeNode)) {
    walkDistributionNode(typeNode, frame);
    return;
  }
  if (MEMBERLESS_KINDS.has(typeNode.getKind())) {
    return;
  }
  refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${typeNode.getKindName()}`);
}

/** The §5.5 distribution in an IDENTITY position — `WorkloadEvent`'s succeeded arm (#1047). A provable one
 *  is walked through its template; anything else keeps the fail-closed verdict it always had, named by its
 *  cause: `MappedType` for a key space this reader cannot enumerate, `IndexedAccessType` for an indexed
 *  NAMED shape (no mapped type to enumerate — the union arm should be spelled out). */
function walkDistributionNode(typeNode: IndexedAccessTypeNode, frame: WalkFrame): void {
  const read = readIndexedAccess(typeNode, frame.state);
  if (read.kind === "distributed") {
    frame.state.distributions += 1;
    walkTypeNode(read.template, frame);
    return;
  }
  refuse(frame.state, typeNode, `${UNSUPPORTED_TOKEN}${read.kind === "unprovable" ? "MappedType" : typeNode.getKindName()}`);
}

/** Walk one declaration's members + its identity references. Deduped so a shared carrier is walked once. */
function walkDecl(decl: NamedTypeDecl, origin: "local" | "inherited", state: CollectorState): void {
  const key = nodeKey(decl);
  if (state.walkedDecls.has(key)) {
    state.revisits += 1;
    return;
  }
  state.walkedDecls.add(key);
  const frame: WalkFrame = { state, origin, owner: decl };
  if (N.isTypeAliasDeclaration(decl)) {
    walkTypeNode(decl.getTypeNode(), frame);
    return;
  }
  walkMembers(decl.getMembers(), frame);
  for (const clause of decl.getHeritageClauses()) {
    for (const base of clause.getTypeNodes()) {
      followIdentityRef(base.getExpression(), base, state);
    }
  }
}

/** Resolve an identifier naming a schema const to its INITIALIZER, inside the population only — the
 *  value-side twin of `resolveNamedTypes`. */
function resolveSchemaInit(nameNode: MorphNode, state: CollectorState): MorphNode | undefined {
  const definitions = N.isIdentifier(nameNode) ? nameNode.getDefinitionNodes() : [];
  const decl = definitions.find(
    (def): def is VariableDeclaration =>
      N.isVariableDeclaration(def) && state.admitted.has(def.getSourceFile().getFilePath()) && def.getInitializer() !== undefined,
  );
  return decl?.getInitializer();
}

/** A `{ ...base.shape }` spread — the third sanctioned imported shape, RESOLVED. Any other spread is
 *  refused: it would otherwise be dropped silently, the same omission `getProperties()` makes. */
function scanSchemaSpread(prop: MorphNode, expression: MorphNode, frame: WalkFrame): void {
  const spread = readMemberAccess(unwrapExpression(expression));
  if (spread !== undefined && spread.name === "shape") {
    scanSchemaExpr(spread.receiver, true, { ...frame, origin: "inherited" });
    return;
  }
  refuse(frame.state, prop, `${UNSUPPORTED_TOKEN}Spread`);
}

/** Record the wire keys one `z.object({ … })` literal declares. */
function scanSchemaObject(obj: MorphNode, frame: WalkFrame): void {
  if (!N.isObjectLiteralExpression(obj)) {
    refuse(frame.state, obj, `${UNSUPPORTED_TOKEN}${obj.getKindName()}`);
    return;
  }
  for (const prop of obj.getProperties()) {
    if (N.isSpreadAssignment(prop)) {
      scanSchemaSpread(prop, prop.getExpression(), frame);
      continue;
    }
    if (!(N.isPropertyAssignment(prop) || N.isShorthandPropertyAssignment(prop))) {
      refuse(frame.state, prop, `${UNSUPPORTED_TOKEN}${prop.getKindName()}`);
      continue;
    }
    if (N.isComputedPropertyName(prop.getNameNode())) {
      refuse(frame.state, prop, `${UNSUPPORTED_TOKEN}ComputedName`);
      continue;
    }
    recordMember({ prop, anchor: prop.getNameNode(), name: prop.getName() }, frame.origin, frame.state);
    const value = N.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (value !== undefined) {
      scanSchemaExpr(value, false, frame);
    }
  }
}

/** Resolve an ARM/value identifier to the schema it names (#1025). Unresolvable ⇒ REFUSED in an arm
 *  position; a bare identifier in a property VALUE is the zod twin of the non-transitive boundary. */
function scanSchemaIdentifier(expr: MorphNode, strict: boolean, frame: WalkFrame): void {
  if (!strict) {
    return;
  }
  const init = resolveSchemaInit(expr, frame.state);
  if (init === undefined) {
    refuse(frame.state, expr, `${UNRESOLVED_SCHEMA_TOKEN}${expr.getText()}`);
    return;
  }
  const key = nodeKey(init);
  if (frame.state.walkedDecls.has(key)) {
    return;
  }
  frame.state.walkedDecls.add(key);
  scanSchemaExpr(init, true, { ...frame, origin: "inherited" });
}

/** Dispatch one `<recv>.<method>(…)` schema builder. An unmodeled method in an ARM position is REFUSED —
 *  which is how `.loose()`/`.passthrough()`/`.catchall()` are refused (they admit unknown keys). */
function scanSchemaCall(expr: MorphNode, callee: MemberRead, strict: boolean, frame: WalkFrame): void {
  const method = callee.name;
  const args = N.isCallExpression(expr) ? expr.getArguments() : [];
  if (method === "object") {
    scanSchemaObject(args[0] ?? expr, frame);
    return;
  }
  if (method === "discriminatedUnion" || method === "union") {
    scanSchemaArms(args[method === "union" ? 0 : 1] ?? expr, frame);
    return;
  }
  if (method === "extend") {
    scanSchemaExpr(callee.receiver, strict, frame);
    scanSchemaObject(args[0] ?? expr, { ...frame, origin: "local" });
    return;
  }
  if (method === "merge") {
    scanSchemaExpr(callee.receiver, strict, frame);
    scanSchemaExpr(args[0] ?? expr, strict, { ...frame, origin: "inherited" });
    return;
  }
  if (SCHEMA_KEY_NEUTRAL_METHODS.has(method) || !strict) {
    scanSchemaExpr(callee.receiver, strict, frame);
    return;
  }
  refuse(frame.state, expr, `${UNSUPPORTED_TOKEN}z.${method}`);
}

/** Walk one schema expression, recording every wire key it contributes. `strict` marks an ARM position — the
 *  event's own identity, where an unmodeled shape is REFUSED and an identifier is RESOLVED. A property VALUE
 *  is walked non-strictly: a leaf validator contributes no key. */
function scanSchemaExpr(node: MorphNode, strict: boolean, frame: WalkFrame): void {
  const expr = unwrapExpression(node);
  if (N.isIdentifier(expr)) {
    scanSchemaIdentifier(expr, strict, frame);
    return;
  }
  const callee = N.isCallExpression(expr) ? readMemberAccess(expr.getExpression()) : undefined;
  if (callee !== undefined) {
    scanSchemaCall(expr, callee, strict, frame);
    return;
  }
  if (strict) {
    refuse(frame.state, expr, `${UNSUPPORTED_TOKEN}${expr.getKindName()}`);
  }
}

/** The arms of a `z.discriminatedUnion`/`z.union` — each is an ARM position (strict). A non-literal arms
 *  argument is refused rather than resolved (a declared limit: the arms list is spelled inline today). */
function scanSchemaArms(arms: MorphNode, frame: WalkFrame): void {
  if (!N.isArrayLiteralExpression(arms)) {
    refuse(frame.state, arms, `${UNSUPPORTED_TOKEN}non-literal-arms`);
    return;
  }
  for (const arm of arms.getElements()) {
    scanSchemaExpr(arm, true, frame);
  }
}

/** Scan a NAMED bus root (`type ChatBusEvent = …` / `interface CharacterUpdatedEvent { … }`). */
function scanBusDecl(decl: NamedTypeDecl, state: CollectorState): void {
  const name = decl.getName();
  state.resolvedRoots.add(name);
  state.events += 1;
  const before = contributionMark(state);
  walkDecl(decl, "local", state);
  if (contributionMark(state) === before) {
    state.emptyRoots.push({ name, node: decl.getNameNode() });
  }
}

/** Scan the notification zod schema: every arm's property keys are wire fields, including the keys an
 *  IMPORTED schema object contributes (#1025). */
function scanNotificationSchema(decl: VariableDeclaration, init: MorphNode, state: CollectorState): void {
  state.resolvedRoots.add(NOTIFICATION_SCHEMA_NAME);
  state.events += 1;
  const before = contributionMark(state);
  scanSchemaExpr(init, true, { state, origin: "local", owner: init });
  if (contributionMark(state) === before) {
    state.emptyRoots.push({ name: NOTIFICATION_SCHEMA_NAME, node: decl.getNameNode() });
  }
}

function collectNode(state: CollectorState, node: MorphNode, relativePath: string): void {
  if (!BUS_FILES.has(relativePath)) {
    return;
  }
  if (N.isTypeAliasDeclaration(node) || N.isInterfaceDeclaration(node)) {
    if (BUS_DECL_NAMES.has(node.getName())) {
      scanBusDecl(node, state);
    }
    return;
  }
  if (N.isVariableDeclaration(node) && node.getName() === NOTIFICATION_SCHEMA_NAME) {
    const init = node.getInitializer();
    if (init !== undefined) {
      scanNotificationSchema(node, init, state);
    }
  }
}

export const busPayloadFact = defineFact({
  id: "bus-payload-shape",
  population: "@contracts",
  analysis: "types",
  resources: [],
  create: (context) => {
    const state: CollectorState = {
      admitted: new Set(context.files.map((file: SourceFile) => file.getFilePath())),
      fields: [],
      refusals: [],
      resolvedRoots: new Set<string>(),
      emptyRoots: [],
      walkedDecls: new Set<string>(),
      seenMembers: new Set<string>(),
      carriers: new Set<string>(),
      events: 0,
      local: 0,
      inherited: 0,
      refPayloads: 0,
      namedArms: 0,
      revisits: 0,
      distributions: 0,
    };
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.VariableDeclaration],
          visit: (node: MorphNode, sourceFile: SourceFile) => collectNode(state, node, context.relativePath(sourceFile)),
        },
      ],
      finish: (): BusPayloadFact => {
        // `members` is what the provider WALKED — the authored files its population admitted — never the
        // field census it built, and `unresolved` is pinned at 0 by contract: a non-zero one here would be a
        // FACT TOOL ERROR that withholds both consumers, including the `-health` policy whose entire job is
        // to report the refusals below (§12.3). The holes are DATA.
        context.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: context.files.length, unresolved: 0 });
        return {
          fields: state.fields,
          refusals: state.refusals,
          resolvedRoots: state.resolvedRoots,
          emptyRoots: state.emptyRoots,
          corpusFiles: context.files.length,
          anchorLoaded: context.files.some((file: SourceFile) => context.relativePath(file) === BUS_ANCHOR_FILE),
          census: {
            events: state.events,
            local: state.local,
            inherited: state.inherited,
            carriers: state.carriers.size,
            refPayloads: state.refPayloads,
            namedArms: state.namedArms,
            revisits: state.revisits,
            distributions: state.distributions,
          },
          receipt: { source: PROVIDER_RECEIPT_SOURCE, members: context.files.length },
        };
      },
    };
  },
});
