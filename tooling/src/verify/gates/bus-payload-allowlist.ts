// Gate: bus-payload-allowlist (Core-Laws-and-Precedents.md D16) — the FIELD-NAME arm of the bus-payload
// firewall. A bus event is room-public (chat bus fans to every subscriber of an OPEN room) / per-user /
// durable-inbox; D16 requires credentials/secrets be TYPE-LEVEL UNREPRESENTABLE in bus payloads. The
// dep-cruiser `bus-contract-no-credentials` rule shuts the resolve-time path (a bus module can't import the
// secret-bearing `@orb/contracts/credentials` shapes). This gate is the compile-adjacent backstop: it reads
// the field names of the bus event UNION members (the named declarations below) and flags a
// credential-SMELLING field name. A producer that adds `apiKey`/`password`/`secret` to a bus member trips
// here even if the field's type is an innocent `string`.
//
// THE MEMBER SET IS THE NAMED EVENT'S OWN TYPE IDENTITY, AND IT IS TRANSITIVE (#948, 2026-09-01). The
// reader resolves what the named event IS: its `extends` bases, its intersection constituents, and its
// union ARMS that alias another declaration — following each through imports to the declaring file. Those
// members are on the wire exactly as a locally-spelled one is, so a credential can no longer hide behind an
// imported base interface or an aliased arm (the audit's confirmed construction:
// docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md). A flagged field is reported at
// its DECLARING site, which may be an imported carrier file outside the five bus homes.
//
// THE BOUNDARY THAT STAYS NON-TRANSITIVE, AND WHY: a NAMED type a field REFERENCES is not resolved.
// `{ view?: MessageView }` contributes the field name `view` and stops — MessageView is separately homed,
// carries content/economics rather than secrets, and is scanned by its own home's rules. The line is
// identity-vs-containment: what the event IS is on the wire under the event's own name; what a field
// REFERENCES is a different shape with a different owner. Widening past it would make this gate a
// whole-graph type crawler with no natural edge. What a field SPELLS INLINE is on the near side of that
// line and IS read: an inline `{ … }` literal's keys ride the wire under the event's own name.
//
// AN OPEN KEY SPACE IS REFUSED, NOT SKIPPED (#1024, 2026-09-01). The contract headers this gate backs
// (`contracts/chat/bus.ts`, `contracts/user-bus/index.ts`) state the invariant as "no `unknown`/`Record`/
// index field". ONLY `ChatBusEvent` has a type-level pin for it (`tests/contracts/chat/index.test-d.ts` —
// planted control 2026-09-01: an index signature on one arm reds `BusMemberKeys` AND `RawStringKeys`).
// `UserBusEvent`, `DomainEvent`, `WiBusEvent` and `notificationEventSchema` have NO such pin, so for those
// four THIS GATE IS THE SOLE ENFORCER of the invariant their own headers state.
// An index signature, a mapped type, a `Record<…>`, an `unknown`/`any` field declares NO key
// vocabulary anywhere, so — unlike a referenced payload — there is no other home whose rules could ever
// scan what rides inside it, and the field-NAME predicate is structurally blind to it. `getProperties()`
// silently omits index signatures, which is exactly how that shape stayed invisible. Every member of a
// walked declaration that is not a plain named property is now REPORTED by kind.
//
// THE NOTIFICATION ZOD ARM RESOLVES IMPORTED SCHEMA OBJECTS (#1025, 2026-09-01), the same leak family as
// #948 on the schema side: an arm assembled from a schema declared in another file used to contribute NO
// keys at all (measured: `local=0 inherited=0` for a wholly-imported union). Sanctioned, all through
// RELATIVE imports only: an imported `z.object` identifier used as an arm, `.extend({…})`/`.merge(x)`
// chains, and `{ ...base.shape }` spreads. Everything else in an ARM position is REPORTED
// (`unsupported-shape:z.<method>` / `unresolved-schema:<Name>`) — which is also how `.loose()`/
// `.passthrough()`/`.catchall()` are refused, the zod spelling of the same open key space. A property
// VALUE is walked permissively: a leaf validator contributes no key, and a REFERENCED schema is the zod
// twin of the non-transitive boundary above.
//
// FAIL-CLOSED, NEVER SILENT: a base/arm the reader cannot resolve to a declaration in this workspace, or a
// type shape it does not model, is REPORTED (`unresolved-base:` / `unsupported-shape:` tokens) — the gate
// cannot prove no credential hides there, and under D16 an unprovable bus shape is itself the violation. A
// named declaration that resolves to NOTHING across the loaded corpus reds the §4.6 blindness arm, so a
// rename can never turn this gate into a silent no-op.
//   THE LOUD REFUSAL IS A DECISION, NOT A BUG TO EXEMPT AWAY. The gate harness is pure-AST by law (no
//   tsconfig, no `@orb/*`/`#alias` resolution — Core-Tooling-Law + the harness bootstrap), so a base
//   imported through a package subpath or a `#alias` specifier does NOT resolve and therefore REDS. That is
//   the correct D16 answer, not a false positive: a bus member is a closed object literal of branded ids,
//   and a base this gate cannot read is a wire shape nobody can read either. Do NOT widen the resolver by
//   guessing at a same-named declaration elsewhere in the workspace (an ambiguous or wrong match would walk
//   the wrong members and hand back a confident green) and do NOT add an exemption row. Spell the member
//   inline, or import the base RELATIVELY so its declaration is provable.
//
// SANCTIONED FIELDS: `credentialId` (user-bus `credentialsChanged`) is a branded `UserCredentialId` — an
// ID, not a secret. D16's SAFE pattern is exactly id-only re-read: the subscriber re-reads canon by id,
// never trusting event-carried data. It is listed below with its cite, NOT excused by weakening the word
// predicate.
//
// REAL-PAYLOAD SWEEP (2026-07-17, re-derived 2026-09-01 under the transitive reader): the ONLY
// credential-word hit in bus scope is `credentialId` (sanctioned). The raw invite `token` lives on REQUEST
// schemas (`redeemInviteSchema`/`previewInviteSchema`, inbound `/join/:token`), never on a bus/notification
// payload (those carry `inviteId`, an id). The 2026-09-01 re-derivation added `PersonaUpdatedEvent` /
// `WorldInfoUpdatedEvent` to the scanned set — live `DomainEvent` arms that the old name-keyed reader never
// saw — and deleted four dead `Crew*` names the 2026-07-25 rollback had purged. No actual secret-bearing bus
// field exists today; D16 holds.
//
// DECLARED LIMITS, each with a `mustPass` row: (1) a NAMED alias of an open shape (`type Meta =
// Record<string, string>` used as a field type) is not resolved — that is the non-transitive boundary
// above, and reversing it is a ruling, not an omission; `Record` itself is matched BY NAME because the
// name is global and unambiguous. (2) A notification property VALUE that is a bare imported identifier is
// the same referenced-payload case and is not descended. (3) An arms ARRAY that is not spelled as an array
// literal is reported rather than resolved.
import type { InterfaceDeclaration, Node, PropertyAccessExpression, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

// The bus event UNION declarations, by their one-home paths. The gate reads these files and picks out the
// named declarations below — it does NOT flag every property in these large contract files.
const BUS_FILES = new Set([
  "packages/contracts/src/chat/bus.ts",
  "packages/contracts/src/user-bus/index.ts",
  "packages/contracts/src/notifications/index.ts",
  "packages/contracts/src/events/index.ts",
  "packages/contracts/src/world-info/index.ts",
]);

// The type-alias / interface declaration names that ARE bus event payload shapes (the ROOTS of the member
// walk). A field reachable from any of these through the event's own type identity is on-the-wire. The
// notification zod schema is matched separately (see below). This list is a ROOT set, not the member
// denominator: an arm/base that is NOT named here is reached transitively and scanned all the same, which
// is why `PersonaUpdatedEvent`/`WorldInfoUpdatedEvent` (live `DomainEvent` arms) need no row.
const BUS_DECL_NAMES = new Set(["ChatBusEvent", "UserBusEvent", "WiBusEvent", "DomainEvent", "CharacterUpdatedEvent", "AssetCreatedEvent"]);
const NOTIFICATION_SCHEMA_NAME = "notificationEventSchema";

// The credential-smell tokens (lowercased substring match on a field name). `key` catches apiKey/secretKey;
// `credential` catches credentialId (sanctioned below). Substring, not \b-word — camelCase field names have
// no word boundary before an embedded token (`apiKey`, `xApiKey`).
const SMELL_TOKENS = ["secret", "token", "apikey", "password", "credential", "key"] as const;

// Sanctioned field names: a credential-word field that is provably an ID / safe scalar, each with its cite.
// This list is the ONLY sanctioned exit — the predicate is NEVER weakened to let a field through.
// TWO-SIDED (GATE-AUTHORING.md §4.4): a row that matched no scanned bus field this run is RED. A dead
// sanction here is the loaded-gun case at its worst — the name stays granted, so the day a REAL secret is
// spelled `credentialId` on a bus member it ships silently.
const SANCTIONED_FIELDS: ExemptionTable = {
  // user-bus `credentialsChanged.credentialId` — a branded UserCredentialId (an id, not a secret). D16's
  // safe id-only re-read pattern; the subscriber re-reads canon by id.
  credentialId: {
    why: "a branded UserCredentialId — an id, not a secret (Core-Laws-and-Precedents.md D16's id-only re-read pattern). Ends when the user-bus stops carrying the id at all.",
  },
};

const GATE_SELF = "tooling/src/verify/gates/bus-payload-allowlist.ts";
/** Real-tree anchor (GATE-AUTHORING.md §4.5): a bus union home that is never an example subject here. */
const ANCHOR = "packages/contracts/src/world-info/index.ts";
const STALE_PREFIX =
  "stale SANCTIONED_FIELDS row — no scanned bus payload declares this field any more, so the sanction is a " +
  "standing grant on a NAME (ratchet down): the day a real secret is spelled that way on a bus member it " +
  "would ship silently. Delete the row: ";
const BLIND_PREFIX =
  "blindness tripwire (GATE-AUTHORING.md §4.6) — this gate dispatches on EXACT declaration names, and this " +
  "one resolves to NOTHING across the five bus homes on the real tree. A rename/move turns the whole arm " +
  "into a silent no-op that reports a healthy denominator forever. Re-derive the name (or delete it if the " +
  "payload is genuinely gone): ";
/** The sanctioned field names actually seen on a bus payload this run — the stale arm's truth set. */
const seenSanctioned = new Set<string>();
/** The named roots (+ the notification schema) this run actually resolved — the blindness arm's truth set. */
const seenRoots = new Set<string>();
/** Declarations already walked this pass (cycle + double-count guard), keyed `<file>#<pos>`. */
const walkedDecls = new Set<string>();
/** Member property nodes already counted/judged this pass — a carrier reached from two roots is one field. */
const seenMembers = new Set<string>();

/** The per-pass member census — the semantic denominator this gate declares through `ctx.scan`, so a drop
 *  is visible even when the file count is unchanged (the audit's prevention program #1). */
const census = { events: 0, local: 0, inherited: 0, carriers: new Set<string>(), refPayloads: 0, namedArms: 0 };

/** A real run loads the whole workspace; a conformance mini-project loads a handful. The blindness sweep is
 *  a WHOLE-CORPUS claim, so it self-guards on this — §4.5's real-tree anchor in its RENAME-PROOF form: a
 *  count, not a file list. An all-five-bus-files-loaded guard would have been the trap it exists to catch —
 *  rename ONE bus home and the guard abstains exactly when its declarations went missing. */
const REAL_CORPUS_MIN = 40;

const UNRESOLVED_TOKEN = "unresolved-base:";
const UNSUPPORTED_TOKEN = "unsupported-shape:";
const UNRESOLVED_SCHEMA_TOKEN = "unresolved-schema:";

const MESSAGE =
  "a bus-event payload field name smells like a credential/secret — bus events are room-public / durable " +
  "(D16): credentials/secrets are TYPE-LEVEL UNREPRESENTABLE on the wire. Carry a branded ID and have the " +
  "subscriber re-read canon by id; never place a secret on a bus member. If this field IS a safe id/scalar, " +
  "add it to SANCTIONED_FIELDS with its D-cite — do NOT weaken the predicate. THE MEMBER SET IS TRANSITIVE " +
  "OVER THE EVENT'S OWN TYPE IDENTITY (its `extends` bases, intersection constituents and aliased union " +
  "arms), so a field may be reported at its DECLARING site in an imported carrier file; a NAMED type a " +
  "field REFERENCES is deliberately NOT resolved (a referenced payload like MessageView is separately " +
  "homed), while what a field spells INLINE is read. A token spelled `unresolved-base:<Name>`, " +
  "`unresolved-schema:<Name>` or `unsupported-shape:<Kind>` is the " +
  "FAIL-CLOSED arm: the reader could not resolve that part of the event's identity, so it cannot prove no " +
  "credential hides behind it — keep a bus member a closed object literal (or a base declared in this " +
  "workspace). AN OPEN KEY SPACE IS ALSO REFUSED: an index signature, a mapped type, a `Record<…>` or an " +
  "`unknown`/`any` field declares no key vocabulary at all, so nothing anywhere can scan what rides " +
  "inside it — spell the keys out. See Core-Laws-and-Precedents.md D16 and " +
  "tooling/src/verify/gates/bus-payload-allowlist.ts.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** The lowercased credential-token a field name matches, or undefined. */
function smellToken(fieldName: string): string | undefined {
  const lower = fieldName.toLowerCase();
  return SMELL_TOKENS.find((t) => lower.includes(t));
}

/** Stable identity for a node across one pass (a declaration or a property signature). */
function nodeKey(node: Node): string {
  return `${node.getSourceFile().getFilePath()}#${node.getPos()}`;
}

/** Report a property node whose name smells, unless it is a sanctioned field. */
function checkFieldName(name: string, node: Node, ctx: GateRunCtx): void {
  if (smellToken(name) === undefined) {
    return;
  }
  if (name in SANCTIONED_FIELDS) {
    seenSanctioned.add(name);
    return;
  }
  ctx.report(node, { token: name, offset: 0 });
}

/** Count + judge one wire field. `origin` is where it was declared RELATIVE TO THE NAMED EVENT: `local` =
 *  spelled inside the named declaration itself; `inherited` = reached through a base / intersection
 *  constituent / aliased arm. Deduped by node, so a carrier shared by two events is one member. */
function recordMember(prop: Node, name: string, origin: "local" | "inherited", ctx: GateRunCtx): void {
  const key = nodeKey(prop);
  if (seenMembers.has(key)) {
    return;
  }
  seenMembers.add(key);
  if (origin === "local") {
    census.local += 1;
  } else {
    census.inherited += 1;
    census.carriers.add(relPath(ctx.root, prop.getSourceFile().getFilePath()));
  }
  checkFieldName(name, prop, ctx);
}

/** A property whose TYPE references another named shape — the boundary this gate deliberately does NOT
 *  cross. Counted so the receipt states how much was left un-descended ON PURPOSE, rather than leaving the
 *  non-transitive rule as an unmeasured claim. */
function countReferencedPayload(prop: Node): void {
  const typeNode = N.isPropertySignature(prop) ? prop.getTypeNode() : undefined;
  if (typeNode === undefined) {
    return;
  }
  if (N.isTypeReference(typeNode) || typeNode.getDescendantsOfKind(SyntaxKind.TypeReference).length > 0) {
    census.refPayloads += 1;
  }
}

/** Type-node kinds that cannot declare a named field, so passing over them hides nothing. Everything else
 *  the walker does not model is REPORTED, never skipped. */
const MEMBERLESS_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.LiteralType,
  SyntaxKind.UndefinedKeyword,
  SyntaxKind.NeverKeyword,
  SyntaxKind.VoidKeyword,
]);

/** Value-position type keywords that carry an UNCONSTRAINED value — an open key space by another spelling
 *  (the contract headers' "no `unknown`" half). Reported by their own word, not by SyntaxKind name. */
const OPEN_VALUE_KINDS: ReadonlyMap<SyntaxKind, string> = new Map([
  [SyntaxKind.UnknownKeyword, "unknown"],
  [SyntaxKind.AnyKeyword, "any"],
]);

/** The one global type NAME that IS an open key space. Matched by name rather than resolved, because
 *  `Record` is a global lib alias — the workspace resolver would answer "outside the run root" for it and
 *  the finding would read `unresolved-base:Record`, which names the wrong defect. */
const OPEN_RECORD_NAME = "Record";

type NamedTypeDecl = InterfaceDeclaration | TypeAliasDeclaration;

/** Resolve a type NAME to its declaration in this workspace. Pure language-service resolution over the
 *  shared pure-AST project: same-file names and relative imports resolve; a specifier the harness project
 *  cannot resolve (a package subpath / `#alias`) returns undefined, which the caller reports rather than
 *  swallows. A definition outside the run's root (or inside node_modules) is deliberately NOT accepted —
 *  a vendored shape is not a wire contract this gate can adjudicate. */
function resolveNamedType(nameNode: Node, root: string): NamedTypeDecl | undefined {
  const definitions = N.isIdentifier(nameNode) ? nameNode.getDefinitionNodes() : [];
  return definitions.find((def): def is NamedTypeDecl => {
    if (!(N.isInterfaceDeclaration(def) || N.isTypeAliasDeclaration(def))) {
      return false;
    }
    const path = def.getSourceFile().getFilePath();
    return path.startsWith(root) && !path.includes("/node_modules/");
  });
}

/** One frame of the identity walk: who is asking, and where a shapeless verdict is anchored. There is no
 *  depth cap and none is needed — `walkedDecls` makes every declaration walkable exactly once per pass, so
 *  a cycle terminates and a long chain costs one visit per link. */
interface WalkFrame {
  readonly ctx: GateRunCtx;
  /** `local` = spelled inside the named event; `inherited` = reached through a base/constituent/alias. */
  readonly origin: "local" | "inherited";
  /** The node a `missing-type-node` verdict anchors on (the declaration that owns this type position). */
  readonly owner: Node;
}

/** Follow one reference in the named event's IDENTITY position (a heritage base, an intersection
 *  constituent, an aliased union arm). A reference to another NAMED root is skipped — that root is walked
 *  from its own declaration, so following it here would only double-count. */
function followIdentityRef(nameNode: Node, at: Node, ctx: GateRunCtx): void {
  const name = nameNode.getText();
  if (BUS_DECL_NAMES.has(name)) {
    census.namedArms += 1;
    return;
  }
  const decl = resolveNamedType(nameNode, ctx.root);
  if (decl === undefined) {
    ctx.report(at, { token: `${UNRESOLVED_TOKEN}${name}`, offset: 0 });
    return;
  }
  walkDecl(decl, "inherited", ctx);
}

/** Walk a declaration's MEMBER list. A member that is not a plain named property — an index signature, a
 *  method/call/construct signature, a computed name — is a wire key the field-name predicate structurally
 *  cannot read, so it is REPORTED by kind (#1024). `getProperties()` used to be the reader here, and it
 *  omits index signatures silently: that omission was the blind spot. */
function walkMembers(members: readonly Node[], frame: WalkFrame): void {
  for (const member of members) {
    if (!N.isPropertySignature(member)) {
      frame.ctx.report(member, { token: `${UNSUPPORTED_TOKEN}${member.getKindName()}`, offset: 0 });
      continue;
    }
    if (N.isComputedPropertyName(member.getNameNode())) {
      frame.ctx.report(member, { token: `${UNSUPPORTED_TOKEN}ComputedName`, offset: 0 });
      continue;
    }
    countReferencedPayload(member);
    recordMember(member, member.getName(), frame.origin, frame.ctx);
    walkFieldType(member.getTypeNode(), frame);
  }
}

/** Judge a wire field's OWN spelled type: refuse an open key space, and descend an INLINE object literal
 *  (spelled inside the event, so its keys ride the wire under the event's own name). A NAMED reference is
 *  never resolved — that is the non-transitive boundary, and `Record` is the one name matched literally. */
function walkFieldType(typeNode: Node | undefined, frame: WalkFrame): void {
  if (typeNode === undefined) {
    return;
  }
  if (N.isParenthesizedTypeNode(typeNode)) {
    walkFieldType(typeNode.getTypeNode(), frame);
    return;
  }
  if (N.isArrayTypeNode(typeNode)) {
    walkFieldType(typeNode.getElementTypeNode(), frame);
    return;
  }
  if (N.isTypeOperatorTypeNode(typeNode)) {
    walkFieldType(typeNode.getTypeNode(), frame);
    return;
  }
  if (N.isUnionTypeNode(typeNode) || N.isIntersectionTypeNode(typeNode)) {
    for (const constituent of typeNode.getTypeNodes()) {
      walkFieldType(constituent, frame);
    }
    return;
  }
  if (N.isTypeLiteral(typeNode)) {
    walkMembers(typeNode.getMembers(), frame);
    return;
  }
  if (N.isMappedTypeNode(typeNode)) {
    frame.ctx.report(typeNode, { token: `${UNSUPPORTED_TOKEN}MappedType`, offset: 0 });
    return;
  }
  if (N.isTypeReference(typeNode)) {
    if (typeNode.getTypeName().getText() === OPEN_RECORD_NAME) {
      frame.ctx.report(typeNode, { token: `${UNSUPPORTED_TOKEN}${OPEN_RECORD_NAME}`, offset: 0 });
    }
    return;
  }
  const openValue = OPEN_VALUE_KINDS.get(typeNode.getKind());
  if (openValue !== undefined) {
    frame.ctx.report(typeNode, { token: `${UNSUPPORTED_TOKEN}${openValue}`, offset: 0 });
  }
}

/** Walk a type NODE in an identity position, recording its direct members and following its references. */
function walkTypeNode(typeNode: Node | undefined, frame: WalkFrame): void {
  if (typeNode === undefined) {
    frame.ctx.report(frame.owner, { token: `${UNSUPPORTED_TOKEN}missing-type-node`, offset: 0 });
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
    followIdentityRef(typeNode.getTypeName(), typeNode, frame.ctx);
    return;
  }
  if (MEMBERLESS_KINDS.has(typeNode.getKind())) {
    return;
  }
  frame.ctx.report(typeNode, { token: `${UNSUPPORTED_TOKEN}${typeNode.getKindName()}`, offset: 0 });
}

/** Walk one declaration's members + its identity references. Deduped so a shared carrier is walked once. */
function walkDecl(decl: NamedTypeDecl, origin: "local" | "inherited", ctx: GateRunCtx): void {
  const key = nodeKey(decl);
  if (walkedDecls.has(key)) {
    return;
  }
  walkedDecls.add(key);
  const frame: WalkFrame = { ctx, origin, owner: decl };
  if (N.isTypeAliasDeclaration(decl)) {
    walkTypeNode(decl.getTypeNode(), frame);
    return;
  }
  walkMembers(decl.getMembers(), frame);
  for (const clause of decl.getHeritageClauses()) {
    for (const base of clause.getTypeNodes()) {
      followIdentityRef(base.getExpression(), base, ctx);
    }
  }
}

/** Scan a NAMED bus root (`type ChatBusEvent = …` / `interface CharacterUpdatedEvent { … }`). */
function scanBusDecl(decl: NamedTypeDecl, ctx: GateRunCtx): void {
  seenRoots.add(decl.getName());
  census.events += 1;
  walkDecl(decl, "local", ctx);
}

/** zod builders that neither add a key nor admit an unknown one, so an ARM may chain through them. Anything
 *  else in an arm position is reported — which is how `.loose()`/`.passthrough()`/`.catchall()` are refused. */
const SCHEMA_KEY_NEUTRAL_METHODS: ReadonlySet<string> = new Set(["strict", "readonly", "describe", "brand", "meta", "register"]);

/** Resolve an identifier naming a schema const to its INITIALIZER, in this workspace only — the value-side
 *  twin of `resolveNamedType`: a relative import resolves, a package-subpath/`#alias` specifier does not
 *  (the harness is pure-AST by law), and the caller REPORTS that rather than swallowing it. */
function resolveSchemaInit(nameNode: Node, root: string): Node | undefined {
  const definitions = N.isIdentifier(nameNode) ? nameNode.getDefinitionNodes() : [];
  const decl = definitions.find((def): def is VariableDeclaration => {
    if (!N.isVariableDeclaration(def)) {
      return false;
    }
    const path = def.getSourceFile().getFilePath();
    return path.startsWith(root) && !path.includes("/node_modules/") && def.getInitializer() !== undefined;
  });
  return decl?.getInitializer();
}

/** A `{ ...base.shape }` spread — the third sanctioned imported shape, RESOLVED. Any other spread is
 *  reported: it would otherwise be dropped silently, the same omission `getProperties()` makes. */
function scanSchemaSpread(prop: Node, expression: Node, frame: WalkFrame): void {
  const spread = unwrapExpression(expression);
  if (N.isPropertyAccessExpression(spread) && spread.getName() === "shape") {
    scanSchemaExpr(spread.getExpression(), true, { ...frame, origin: "inherited" });
    return;
  }
  frame.ctx.report(prop, { token: `${UNSUPPORTED_TOKEN}Spread`, offset: 0 });
}

/** Record the wire keys one `z.object({ … })` literal declares. */
function scanSchemaObject(obj: Node, frame: WalkFrame): void {
  if (!N.isObjectLiteralExpression(obj)) {
    frame.ctx.report(obj, { token: `${UNSUPPORTED_TOKEN}${obj.getKindName()}`, offset: 0 });
    return;
  }
  for (const prop of obj.getProperties()) {
    if (N.isSpreadAssignment(prop)) {
      scanSchemaSpread(prop, prop.getExpression(), frame);
      continue;
    }
    if (!(N.isPropertyAssignment(prop) || N.isShorthandPropertyAssignment(prop))) {
      frame.ctx.report(prop, { token: `${UNSUPPORTED_TOKEN}${prop.getKindName()}`, offset: 0 });
      continue;
    }
    if (N.isComputedPropertyName(prop.getNameNode())) {
      frame.ctx.report(prop, { token: `${UNSUPPORTED_TOKEN}ComputedName`, offset: 0 });
      continue;
    }
    recordMember(prop, prop.getName(), frame.origin, frame.ctx);
    const value = N.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (value !== undefined) {
      scanSchemaExpr(value, false, frame);
    }
  }
}

/** Resolve an ARM/value identifier to the schema it names (#1025). Unresolvable ⇒ REPORTED in an arm
 *  position; a bare identifier in a property VALUE is the zod twin of the non-transitive boundary. */
function scanSchemaIdentifier(expr: Node, strict: boolean, frame: WalkFrame): void {
  if (!strict) {
    return;
  }
  const init = resolveSchemaInit(expr, frame.ctx.root);
  if (init === undefined) {
    frame.ctx.report(expr, { token: `${UNRESOLVED_SCHEMA_TOKEN}${expr.getText()}`, offset: 0 });
    return;
  }
  const key = nodeKey(init);
  if (walkedDecls.has(key)) {
    return;
  }
  walkedDecls.add(key);
  scanSchemaExpr(init, true, { ...frame, origin: "inherited" });
}

/** Dispatch one `<recv>.<method>(…)` schema builder. An unmodeled method in an ARM position is REPORTED —
 *  which is how `.loose()`/`.passthrough()`/`.catchall()` are refused (they admit unknown keys). */
function scanSchemaCall(expr: Node, callee: PropertyAccessExpression, strict: boolean, frame: WalkFrame): void {
  const method = callee.getName();
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
    scanSchemaExpr(callee.getExpression(), strict, frame);
    scanSchemaObject(args[0] ?? expr, { ...frame, origin: "local" });
    return;
  }
  if (method === "merge") {
    scanSchemaExpr(callee.getExpression(), strict, frame);
    scanSchemaExpr(args[0] ?? expr, strict, { ...frame, origin: "inherited" });
    return;
  }
  if (SCHEMA_KEY_NEUTRAL_METHODS.has(method) || !strict) {
    scanSchemaExpr(callee.getExpression(), strict, frame);
    return;
  }
  frame.ctx.report(expr, { token: `${UNSUPPORTED_TOKEN}z.${method}`, offset: 0 });
}

/** Walk one schema expression, recording every wire key it contributes.
 *
 *  `strict` marks an ARM position — the event's own identity, where an unmodeled shape is REPORTED and an
 *  identifier is RESOLVED through the workspace (#1025). A property VALUE is walked non-strictly: a leaf
 *  validator contributes no key. Cycles/repeats are fenced by `walkedDecls`, shared with the type walk. */
function scanSchemaExpr(node: Node, strict: boolean, frame: WalkFrame): void {
  const expr = unwrapExpression(node);
  if (N.isIdentifier(expr)) {
    scanSchemaIdentifier(expr, strict, frame);
    return;
  }
  const callee = N.isCallExpression(expr) ? expr.getExpression() : undefined;
  if (callee !== undefined && N.isPropertyAccessExpression(callee)) {
    scanSchemaCall(expr, callee, strict, frame);
    return;
  }
  if (strict) {
    frame.ctx.report(expr, { token: `${UNSUPPORTED_TOKEN}${expr.getKindName()}`, offset: 0 });
  }
}

/** The arms of a `z.discriminatedUnion`/`z.union` — each is an ARM position (strict). A non-literal arms
 *  argument is reported rather than resolved (a declared limit: the arms list is spelled inline today). */
function scanSchemaArms(arms: Node, frame: WalkFrame): void {
  if (!N.isArrayLiteralExpression(arms)) {
    frame.ctx.report(arms, { token: `${UNSUPPORTED_TOKEN}non-literal-arms`, offset: 0 });
    return;
  }
  for (const arm of arms.getElements()) {
    scanSchemaExpr(arm, true, frame);
  }
}

/** Scan the notification zod schema: every arm's property keys are wire fields, including the keys an
 *  IMPORTED schema object contributes through a direct arm, an `.extend`/`.merge` chain, or a `.shape`
 *  spread (#1025). An arm shape this reader cannot enumerate is reported, never skipped. */
function scanNotificationSchema(init: Node, ctx: GateRunCtx): void {
  seenRoots.add(NOTIFICATION_SCHEMA_NAME);
  census.events += 1;
  scanSchemaExpr(init, true, { ctx, origin: "local", owner: init });
}

export const gate: GateDescriptor = {
  name: "bus-payload-allowlist",
  docRow: "Core-Laws-and-Precedents.md D16",
  status: "active",
  // CROSS-FILE since #948: a named event's members can be declared in an imported carrier, so a scoped run
  // over only the changed files cannot answer this gate's question (a carrier edited alone would read
  // GREEN). `whole-project` makes `scoped.ts` skip it outright instead of returning a vacuous pass.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: "carry a branded id (re-read canon by id) instead of a secret; or, for a proven-safe id/scalar, add the field to SANCTIONED_FIELDS in bus-payload-allowlist.ts with its D-cite. For an `unresolved-base:`/`unresolved-schema:`/`unsupported-shape:` token, spell the bus member as a closed object literal with named keys (or a base/schema declared RELATIVELY in this workspace) so the wire shape is readable — never an index signature, a `Record<…>`, an `unknown` field, or a `.loose()`/`.catchall()` schema arm.",
  scanRoot: (p) => BUS_FILES.has(p),
  kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.VariableDeclaration],
  visit: (node, sf, ctx) => {
    if (!BUS_FILES.has(relPath(ctx.root, sf.getFilePath()))) {
      return;
    }
    if (N.isTypeAliasDeclaration(node) || N.isInterfaceDeclaration(node)) {
      if (BUS_DECL_NAMES.has(node.getName())) {
        scanBusDecl(node, ctx);
      }
      return;
    }
    if (N.isVariableDeclaration(node) && node.getName() === NOTIFICATION_SCHEMA_NAME) {
      const init = node.getInitializer();
      if (init !== undefined) {
        scanNotificationSchema(init, ctx);
      }
    }
  },
  begin: () => {
    seenSanctioned.clear();
    seenRoots.clear();
    walkedDecls.clear();
    seenMembers.clear();
    census.events = 0;
    census.local = 0;
    census.inherited = 0;
    census.carriers.clear();
    census.refPayloads = 0;
    census.namedArms = 0;
  },
  finalize: (ctx) => {
    ctx.scan({
      unit: `wire-event member [events=${census.events} local=${census.local} inherited=${census.inherited} carriers=${census.carriers.size} refPayloadsNotFollowed=${census.refPayloads}]`,
      candidates: census.local + census.inherited,
      scanned: census.local + census.inherited,
      skipped: { "arm scanned at its own named root": census.namedArms },
    });
    if (ctx.scope.kind !== "project") {
      return;
    }
    if (fileLoaded(ctx, ANCHOR)) {
      for (const field of Object.keys(SANCTIONED_FIELDS)) {
        if (!seenSanctioned.has(field)) {
          ctx.report({
            file: GATE_SELF,
            line: 1,
            column: 0,
            message: `${STALE_PREFIX}"${field}" — delete it in tooling/src/verify/gates/bus-payload-allowlist.ts`,
          });
        }
      }
    }
    // The blindness sweep is a WHOLE-CORPUS claim, so it needs the whole-corpus anchor (REAL_CORPUS_MIN),
    // not the stale arm's single-file one: a name that resolves to nothing must RED even when the bus HOME
    // that used to declare it is the thing that moved. Proven in
    // tests/tooling/verify/gates/bus-payload-allowlist.test.ts over a padded corpus, in both directions.
    if (ctx.files.length < REAL_CORPUS_MIN) {
      return;
    }
    for (const name of [...BUS_DECL_NAMES, NOTIFICATION_SCHEMA_NAME]) {
      if (!seenRoots.has(name)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${BLIND_PREFIX}"${name}" — the root set lives in tooling/src/verify/gates/bus-payload-allowlist.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'export type ChatBusEvent = { type: "x"; chatId: string; apiKey: string };\n',
      at: "packages/contracts/src/chat/bus.ts",
      expect: { messageIncludes: "TYPE-LEVEL UNREPRESENTABLE", token: "apiKey" },
      why: "a ChatBusEvent member carrying `apiKey` — the exact D16 leak the allowlist forbids",
    },
    {
      files: 'export interface CharacterUpdatedEvent {\n  type: "character.updated";\n  secretToken: string;\n}\n',
      at: "packages/contracts/src/events/index.ts",
      expect: { messageIncludes: "credential/secret" },
      why: "a DomainEvent member interface with a `secretToken` field — flags (interface arm)",
    },
    {
      files: {
        "packages/contracts/src/events/secret-carrier.ts": "export interface SecretCarrier {\n  readonly apiKey: string;\n}\n",
        "packages/contracts/src/events/index.ts":
          'import type { SecretCarrier } from "./secret-carrier.ts";\nexport interface CharacterUpdatedEvent extends SecretCarrier {\n  readonly type: "character.updated";\n}\n',
      },
      expect: { count: 1, token: "apiKey" },
      why: "THE INHERITED ARM (#948): the credential is declared in an IMPORTED carrier the named wire event `extends` — a local-declaration reader saw a clean event while `apiKey` shipped on the wire. Reported at its declaring site, named by token",
    },
    {
      files: {
        "packages/contracts/src/events/leaked-arm.ts": 'export interface LeakedArm {\n  readonly type: "leaked";\n  readonly sessionToken: string;\n}\n',
        "packages/contracts/src/events/index.ts":
          'import type { LeakedArm } from "./leaked-arm.ts";\nexport interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport type DomainEvent = CharacterUpdatedEvent | LeakedArm;\n',
      },
      expect: { count: 1, token: "sessionToken" },
      why: "THE ALIASED-ARM ARM (#948): a union arm that is an imported alias outside the root name set is still the event's own identity — its fields are on the wire and are scanned",
    },
    {
      files: 'export interface CharacterUpdatedEvent extends UnknowableBase {\n  readonly type: "character.updated";\n}\n',
      at: "packages/contracts/src/events/index.ts",
      expect: { count: 1, token: "unresolved-base:UnknowableBase" },
      why: "FAIL-CLOSED: a base this workspace cannot resolve is REPORTED, never skipped — the gate cannot prove no credential hides behind it, and a silent skip is exactly the false-green the transitive reader exists to kill",
    },
    {
      files:
        'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [\n  z.object({ type: z.literal("invite"), password: z.string() }),\n]);\n',
      at: "packages/contracts/src/notifications/index.ts",
      expect: { messageIncludes: "credential/secret" },
      why: "a notification z.object arm with a `password` key — the zod-schema arm flags too",
    },
    {
      files: {
        [ANCHOR]: 'export type WiBusEvent = { type: "wi.updated"; bookId: string };\n',
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED_FIELDS row" },
      why: "THE STALE ARM: the anchor bus union is loaded and no scanned payload declares `credentialId` any more — the sanction has become a standing grant on a NAME, which is the loaded gun §4.4 warns about, so it ratchets down",
    },
    {
      files: 'export type ChatBusEvent = { type: "x"; chatId: string; [k: string]: string };\n',
      at: "packages/contracts/src/chat/bus.ts",
      expect: { count: 1, token: "unsupported-shape:IndexSignature" },
      why: "THE OPEN-KEY-SPACE ARM (#1024): `getProperties()` EXCLUDES index signatures, so this member was invisible to the field-name predicate — an unnamed key space on a room-public event is a credential nothing can see",
    },
    {
      files: 'export type UserBusEvent = { type: "x"; meta: Record<string, string> };\n',
      at: "packages/contracts/src/user-bus/index.ts",
      expect: { count: 1, token: "unsupported-shape:Record" },
      why: "the same open key space spelled as a FIELD TYPE — `Record<string, …>` declares no key vocabulary in any home, so no other home's rules can ever scan what rides inside it (unlike a referenced payload)",
    },
    {
      files: {
        "packages/contracts/src/notifications/leaky-base.ts":
          'import { z } from "zod";\nexport const leakyBase = z.object({ type: z.literal("leak"), apiKey: z.string() });\n',
        "packages/contracts/src/notifications/index.ts":
          'import { z } from "zod";\nimport { leakyBase } from "./leaky-base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [leakyBase]);\n',
      },
      expect: { count: 1, token: "apiKey" },
      why: "THE IMPORTED-INITIALIZER ARM (#1025): the arm is a schema declared in another file — a literal-`z.object`-only reader scanned ZERO keys for this whole union while the credential shipped on the durable inbox wire",
    },
    {
      files:
        'import { z } from "zod";\nimport { farBase } from "@orb/contracts/elsewhere";\nexport const notificationEventSchema = z.discriminatedUnion("type", [farBase]);\n',
      at: "packages/contracts/src/notifications/index.ts",
      expect: { count: 1, token: "unresolved-schema:farBase" },
      why: "FAIL-CLOSED on the schema side, the twin of `unresolved-base:`: the pure-AST harness cannot resolve a package-subpath specifier, so it cannot prove no credential hides in that arm",
    },
    {
      files: 'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("x") }).loose()]);\n',
      at: "packages/contracts/src/notifications/index.ts",
      expect: { count: 1, token: "unsupported-shape:z.loose" },
      why: "the zod spelling of an open key space — `.loose()`/`.passthrough()`/`.catchall()` admit unknown keys, which is exactly what the notifications header promises the wire does NOT do",
    },
  ],
  mustPass: [
    {
      files: 'export type UserBusEvent = { type: "credentialsChanged"; credentialId?: string };\n',
      at: "packages/contracts/src/user-bus/index.ts",
      why: "`credentialId` is the sanctioned branded-id field (D16 id-only re-read) — passes",
    },
    {
      files: 'export type ChatBusEvent = { type: "turnStarted"; chatId: string; model: string; source: string };\n',
      at: "packages/contracts/src/chat/bus.ts",
      why: "no credential-smell field (model/source/chatId are safe scalars/ids) — passes",
    },
    {
      files: "export interface MessageView {\n  cacheReadTokens: number;\n  maxOutputTokens: number;\n}\n",
      at: "packages/contracts/src/chat/bus.ts",
      why: "MessageView is NOT a bus-union declaration name and nothing's identity reaches it — its `*Tokens` economics fields are out of scope, passes",
    },
    {
      files:
        'export interface MessageView {\n  readonly cacheReadTokens: number;\n  readonly apiKey: string;\n}\nexport type ChatBusEvent = { type: "messageCommitted"; chatId: string; view?: MessageView };\n',
      at: "packages/contracts/src/chat/bus.ts",
      why: "THE PRESERVED NON-TRANSITIVE BOUNDARY: a field's TYPE is not descended. `view` is the wire field; MessageView's own members belong to MessageView's home. Widening past this makes the gate a whole-graph crawler with no natural edge — the boundary is declared, measured (`refPayloadsNotFollowed`), and pinned here",
    },
    {
      files: {
        "packages/contracts/src/events/base-event.ts": "export interface StampedEvent {\n  readonly emittedAt: number;\n}\n",
        "packages/contracts/src/events/index.ts":
          'import type { StampedEvent } from "./base-event.ts";\nexport interface CharacterUpdatedEvent extends StampedEvent {\n  readonly type: "character.updated";\n  readonly characterId: string;\n}\n',
      },
      why: "SANCTIONED INHERITANCE: an imported base carrying only non-secret fields is resolved, counted as an inherited member, and passes — the transitive reader widens what is SEEN, never what is flagged",
    },
    {
      files: "export type SomeOtherThing = { apiKey: string };\n",
      at: "packages/contracts/src/settings/index.ts",
      why: "scope: a non-bus contract file is not scanned at all — passes (no anchor here, so the stale arm also stays silent: THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: 'export type WiBusEvent = { type: "wi.updated"; bookId: string };\n',
        "packages/contracts/src/user-bus/index.ts": 'export type UserBusEvent = { type: "credentialsChanged"; credentialId?: string };\n',
      },
      why: "the row STILL EARNED, judged against the real-tree anchor: a live bus payload declares the sanctioned id field, so it is suppressed for a REASON and the stale arm stays quiet",
    },
    {
      files: {
        [ANCHOR]: 'export type WiBusEventRenamed = { type: "wi.updated"; bookId: string };\n',
        "packages/contracts/src/user-bus/index.ts": 'export type UserBusEvent = { type: "credentialsChanged"; credentialId?: string };\n',
      },
      why: "A DECLARED LIMIT, written down rather than assumed: the §4.6 blindness sweep is a WHOLE-CORPUS claim and abstains below REAL_CORPUS_MIN, so conformance's mini-projects can never drive it — every root name here is 'missing' and it stays quiet. Its bite (a renamed root REDs) and its silence on a healthy padded corpus are BOTH proven in tests/tooling/verify/gates/bus-payload-allowlist.test.ts, which is the only substrate that can carry a real corpus",
    },
    {
      files: 'type Meta = Record<string, string>;\nexport type ChatBusEvent = { type: "x"; chatId: string; meta: Meta };\n',
      at: "packages/contracts/src/chat/bus.ts",
      why: "A DECLARED LIMIT (#1024): a NAMED alias of an open shape is not resolved — resolving a field's named type is the non-transitive boundary #948 ruled on, and reversing it is a ruling rather than an omission. `Record` itself is matched BY NAME (it is a global lib alias), so the inline spelling — the one a producer actually reaches for — still REDs",
    },
    {
      files: {
        "packages/contracts/src/notifications/base.ts":
          'import { z } from "zod";\nexport const inboxBase = z.object({ recipientUserId: z.string(), chatId: z.string() });\n',
        "packages/contracts/src/notifications/index.ts":
          'import { z } from "zod";\nimport { inboxBase } from "./base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [inboxBase.extend({ inviteId: z.string() })]);\n',
      },
      why: "THE GREEN TWIN of the imported-initializer arm: an imported base carrying only ids is RESOLVED, counted as an inherited member with its carrier, and passes — the resolver widens what is SEEN, never what is flagged",
    },
  ],
};
