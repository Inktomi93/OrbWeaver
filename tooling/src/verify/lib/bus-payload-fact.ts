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
import type { IndexedAccessTypeNode, Node as MorphNode, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { NamedTypeDecl } from "../contract/bus-payload-fact.ts";
import { defineFact } from "../contract/fact.ts";
import { walkMembers } from "./bus-payload-fact-field.ts";
import type { BusEmptyRoot, BusPayloadField, BusShapeRefusal, CollectorState, WalkFrame } from "./bus-payload-fact-resolve.ts";
import {
  contributionMark,
  MEMBERLESS_KINDS,
  NOTIFICATION_SCHEMA_NAME,
  nodeKey,
  readIndexedAccess,
  refuse,
  resolveNamedTypes,
  UNRESOLVED_TOKEN,
} from "./bus-payload-fact-resolve.ts";
import { scanNotificationSchema } from "./bus-payload-fact-schema.ts";

// biome-ignore lint/performance/noBarrelFile: re-export preserves the original module's public API after extracting the schema-arm reader to a sibling leaf
export { NOTIFICATION_SCHEMA_NAME } from "./bus-payload-fact-resolve.ts";

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

const UNSUPPORTED_TOKEN = "unsupported-shape:";

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
