// Policy: bus-payload-allowlist (D16) — the FIELD-NAME arm of the bus-payload
// firewall. A bus event is room-public (chat bus fans to every subscriber of an OPEN room) / per-user /
// durable-inbox; D16 requires credentials/secrets be TYPE-LEVEL UNREPRESENTABLE in bus payloads. The
// dep-cruiser `bus-contract-no-credentials` rule shuts the resolve-time path (a bus module can't import the
// secret-bearing `@orb/contracts/credentials` shapes). This policy is the compile-adjacent backstop: it
// judges the field NAMES of the bus event UNION members and reports a credential-SMELLING one. A producer
// that adds `apiKey`/`password`/`secret` to a bus member trips here even if the field's type is an innocent
// `string`.
//
// FAMILY `bus-payload` — the shared reader is `lib/bus-payload-fact.ts` (`busPayloadFact`), a `defineFact`
// provider that performs the ONE transitive walk of every live wire-event union's own type identity. The
// sibling is `bus-payload-allowlist-health`, which owns every arm of the same walk that has NO reviewed
// door. The split axis is AUTHORITY, which is the only axis a split may take: this policy's exceptions are
// reviewed grants, and the sibling's fail-closed verdicts are unsuppressible.
//
// POPULATION PORT: an INTENTIONAL CORRECTION, legacy at 1692583d6, and it is FORCED. The legacy descriptor
// declared `scanRoot: (p) => BUS_FILES.has(p)` — eight exact files — yet REPORTED at the declaring site,
// which for an inherited credential is an imported CARRIER file outside those eight (its own `mustFlag[2]`
// is that row). Under this contract a finding must anchor inside the policy's own effective population
// (`lib/policy-pass-context.ts`), so the eight-file population would make the legacy module's own founding
// arm a runtime THROW. The final declares `@contracts`, which is the smallest root containing every carrier
// a wire contract may legally have (the package cake puts cross-boundary shapes there and nowhere else).
// The ROOT DISPATCH is unchanged and still keyed on the same eight exact paths — `BUS_FILES` moved to the
// provider byte-identical — so the set of scanned EVENTS is the legacy set exactly; what widened is the set
// of files a finding may be anchored in, which is the correction the legacy behaviour already required.
// The provider's population and both consumers' are the SAME expression on purpose: a consumer narrower
// than its provider is handed nodes it may not NAME, which is the `ctx.relativePath` throw (guide §3).
//
// AUTHORITY IS `reviewed-grant`, AND THAT IS THE CONVERSION'S REAL WORK. The legacy descriptor was
// `markerImmune: true` with ONE gate-owned `SANCTIONED_FIELDS` table (`credentialId`, a branded
// `UserCredentialId`) and a hand-rolled two-sided stale sweep over it. Both halves are now central: the row
// is an exact `(subject, operation)` grant in `lib/reviewed-grants.ts` with `why` and `endsWhen`, and the
// legacy stale arm is the engine's own `stale-reviewed-grant` alarm — which is strictly stronger, because it
// alarms on a complete run without the gate needing a real-tree anchor to know whether it may speak.
// `markerImmune` retires with the grammar it immunised: a reviewed-grant policy has NO inline door at all,
// so no marker can silence a credential finding or a fail-closed token, which is exactly what the flag
// bought. The two marker-immunity rows in the legacy family test are retired with it; their successor is
// the authority declaration itself, which is checked by the loader rather than by a fixture.
//
// FINDING GRANULARITY IS THE GRANT GRANULARITY, WHICH IS A CLASSIFIED §4.6 DIFFERENCE. A reviewed grant is
// strictly 1:1 (§12.5): a row matching N > 1 candidates suppresses NOTHING and alarms `over-broad`. The
// legacy table keyed on the field NAME and licensed EVERY occurrence of it, so porting it occurrence-by-
// occurrence would make `credentialId` unlicensable the day a second bus member spells it. So the subject is
// the FIELD NAME and `lib/reviewed-grant-findings.ts` aggregates: one finding per distinct smelling name,
// anchored at its first declaring site, with every site's line named in the message. Nothing is lost — the
// fix still points at the code — and the grant is 1:1 by construction. This is #1939's precedent, which
// §12.5 generalises.
//
// SANCTIONED FIELD: `credentialId` (user-bus `credentialsChanged`) is a branded `UserCredentialId` — an ID,
// not a secret. D16's SAFE pattern is exactly id-only re-read: the subscriber re-reads canon by id, never
// trusting event-carried data. It is a GRANT with its D-cite, never a weakened predicate.
//
// REAL-PAYLOAD SWEEP (2026-07-17, re-derived 2026-09-01 under the transitive reader): the ONLY
// credential-word hit in bus scope is `credentialId` (granted). The raw invite `token` lives on REQUEST
// schemas (`redeemInviteSchema`/`previewInviteSchema`, inbound `/join/:token`), never on a bus/notification
// payload (those carry `inviteId`, an id). No actual secret-bearing bus field exists today; D16 holds.
//
// MARKER CENSUS 0 = 0 = 0 (measured 2026-09-13, positive controls 132 files carrying `@orb-gate-ignore` and
// 774 carrying `@orb-waive`): the tree carries ZERO `@orb-gate-ignore bus-payload-allowlist` markers outside
// this family's own test fixtures, which §8 step 6 excludes by name. `markerImmune` was doing its job —
// there was never a live marker to translate, and the flag's retirement orphans nothing.
//
// DECLARED LIMITS, each named with the row that holds it, all owned by the shared reader and documented in
// its header: (1) a NAMED alias of an open shape is not resolved (`mustPass[4]`); (2) a notification
// property VALUE that is a bare imported identifier is not descended; (3) an arms ARRAY not spelled as an
// array literal is refused rather than resolved; (4) a distributed template's indexed access into a NAMED
// map contributes the field name and stops (`mustPass[6]`). Reversing (1) or (4) is the whole-graph-crawler
// ruling #948 declined.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `bus-payload-allowlist` descriptor at c810fee0749e37333042645e1a061b257e289627, the parent of the conversion
// `a196a35d7` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `1692583d6`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,558 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 8 and final `population` admits 105.
// legacy − final = ∅. final − legacy = 97 `@contracts` sources beyond the eight `BUS_FILES` — carrier files a finding
// may now anchor in; the dispatch roots stay the eight. Controls: inside: no virtual sibling fits the exact-path
// population, so the real shared member `packages/contracts/src/automation/index.ts` is the control, admitted by
// both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { defineGate } from "../contract/policy.ts";
import { busPayloadFact, smellToken } from "../lib/bus-payload-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const CHAT_BUS = "packages/contracts/src/chat/bus.ts";
const USER_BUS = "packages/contracts/src/user-bus/index.ts";
const EVENTS = "packages/contracts/src/events/index.ts";
const NOTIFICATIONS = "packages/contracts/src/notifications/index.ts";
const RPG_BUS = "packages/contracts/src/rpg/bus.ts";
const WORKLOADS = "packages/contracts/src/workloads/events.ts";

/** The licensed act, stable across edits to the subject — the operation half of every grant row. */
const OPERATION = "bus-payload-field";

const MESSAGE =
  "a bus-event payload field name smells like a credential/secret — bus events are room-public / durable " +
  "(D16): credentials/secrets are TYPE-LEVEL UNREPRESENTABLE on the wire. Carry a branded ID and have the " +
  "subscriber re-read canon by id; never place a secret on a bus member. If this field IS a safe id/scalar, " +
  "add an exact reviewed grant with its D-cite — do NOT weaken the predicate. THE MEMBER SET IS TRANSITIVE " +
  "OVER THE EVENT'S OWN TYPE IDENTITY (its `extends` bases, intersection constituents and aliased union " +
  "arms), so a field may be reported at its DECLARING site in an imported carrier file; a NAMED type a " +
  "field REFERENCES is deliberately NOT resolved (a referenced payload like MessageView is separately " +
  "homed), while what a field spells INLINE is read. See docs/adr/0016-d16.md.";

const UNREADABLE =
  "a bus-event payload field could not be identified at all — the wire shape is unreadable, which under D16 is itself the violation. See docs/adr/0016-d16.md.";

const FIX =
  "carry a branded id (re-read canon by id) instead of a secret; or, for a proven-safe id/scalar, add an exact `(subject, operation)` row to tooling/src/verify/lib/reviewed-grants.ts with its D-cite, `why` and `endsWhen`.";

export const gate = defineGate({
  id: "bus-payload-allowlist",
  family: "bus-payload",
  authority: "reviewed-grant",
  severity: "error",
  population: "@contracts",
  analysis: "types",
  // The verdict quantifies over every live wire-event union at once — a subset of `@contracts` can carry a
  // carrier without its root, or a root without its carrier, and either way composes a wrong answer.
  execution: "entire-population",
  facts: [busPayloadFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busPayloadFact);
      // `members` is what the SHARED WALK measured — the wire fields it established — which is this
      // policy's own denominator, so a census that shrank while the corpus did not is visible on the run
      // line instead of being inferred from silence.
      ctx.receipt({ kind: "population", source: "bus-payload-allowlist", members: fact.fields.length, unresolved: 0 });
      const candidates: ReviewedGrantCandidate[] = fact.fields
        .filter((field) => smellToken(field.name) !== undefined)
        .map((field) => ({ subject: field.name, operation: OPERATION, node: field.node, token: field.name, offset: 0 }));
      reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string; apiKey: string };\n' },
      expect: { count: 1, token: "apiKey", messageIncludes: "TYPE-LEVEL UNREPRESENTABLE" },
      // THE REVIEWED-GRANT IDENTITY WITNESS (#2189, §4.3). This policy's whole exception door is the FIELD NAME
      // as `subject` plus the one `bus-payload-field` `operation` — which is what makes the live `credentialId`
      // row grantable at all — so the row proves that pair is bindable: the same fixture re-runs with one
      // generated grant naming exactly these authored strings, and holds only at `grantedFindings` 1 /
      // `effectiveFindings` 0 / `authorityAlarms` 0. Driven 2026-09-13 before it was written: this fixture's raw
      // finding carries `subject: "apiKey"`, `operation: "bus-payload-field"`. The subject is `apiKey` rather
      // than `credentialId` on purpose — the claim is that the policy's EMITTED identity can reach the central
      // door, not that this particular field deserves a grant, which `why`/`endsWhen` and owner review own.
      //
      // BOTH STRINGS ARE AUTHORED LITERALS, AND `OPERATION` IS DELIBERATELY NOT REUSED HERE — measured by this
      // row's own planted break (#2189, 2026-09-13). Written first as `operation: OPERATION`, the cut that
      // renames the module constant moved the EMITTED and the AUTHORED value together and the row stayed GREEN,
      // which is the same tautology as deriving the identity from the finding: the central table still spells
      // `bus-payload-field`, so a rename would break every real grant while this proof reported success. With
      // the literal, that cut reds.
      grant: { subject: "apiKey", operation: "bus-payload-field" },
      why: "a ChatBusEvent member carrying `apiKey` — the exact D16 leak the firewall forbids",
    },
    {
      mode: "types",
      files: { [EVENTS]: 'export interface CharacterUpdatedEvent {\n  type: "character.updated";\n  secretToken: string;\n}\n' },
      expect: { count: 1, token: "secretToken", messageIncludes: "credential/secret" },
      why: "a DomainEvent member interface with a `secretToken` field — the INTERFACE arm, whose members are walked from the declaration rather than from a type node",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/secret-carrier.ts": "export interface SecretCarrier {\n  readonly apiKey: string;\n}\n",
        [EVENTS]:
          'import type { SecretCarrier } from "./secret-carrier.ts";\nexport interface CharacterUpdatedEvent extends SecretCarrier {\n  readonly type: "character.updated";\n}\n',
      },
      expect: { count: 1, token: "apiKey" },
      why: "THE INHERITED ARM (#948): the credential is declared in an IMPORTED carrier the named wire event `extends` — a local-declaration reader saw a clean event while `apiKey` shipped on the wire. Reported at its declaring site, which is ALSO the row that forces the `@contracts` population: the carrier is outside the eight bus homes the legacy `scanRoot` admitted",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/leaked-arm.ts": 'export interface LeakedArm {\n  readonly type: "leaked";\n  readonly sessionToken: string;\n}\n',
        [EVENTS]:
          'import type { LeakedArm } from "./leaked-arm.ts";\nexport interface CharacterUpdatedEvent {\n  readonly type: "character.updated";\n}\nexport type DomainEvent = CharacterUpdatedEvent | LeakedArm;\n',
      },
      expect: { count: 1, token: "sessionToken" },
      why: "THE ALIASED-ARM ARM (#948): a union arm that is an imported alias outside the root name set is still the event's own identity — its fields are on the wire and are scanned",
    },
    {
      mode: "types",
      files: {
        [NOTIFICATIONS]:
          'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [\n  z.object({ type: z.literal("invite"), password: z.string() }),\n]);\n',
      },
      expect: { count: 1, token: "password", messageIncludes: "credential/secret" },
      why: "a notification z.object arm with a `password` key — the zod-schema root flags too, and it is the only root whose members are VALUE nodes rather than type members",
    },
    {
      mode: "types",
      files: {
        [NOTIFICATIONS]:
          'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [\n  z["object"]({ type: z["literal"]("invite"), password: z["string"]() }),\n]);\n',
      },
      expect: { count: 1, token: "password", messageIncludes: "credential/secret" },
      why: 'THE SAME ARM, BRACKET-SPELLED (#2353). `scanSchemaExpr` required a `PropertyAccessExpression` callee, so `z["object"]({ … })` was not a builder at all: the arm refused, the union contributed ZERO wire keys, and the credential search ran over an empty population while the policy reported nothing. A reader that stops RECOGNISING a schema stops judging it — the widening is in `lib/bus-payload-fact.ts` through `readMemberAccess`, never in this policy',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/notifications/leaky-base.ts":
          'import { z } from "zod";\nexport const leakyBase = z.object({ type: z.literal("leak"), apiKey: z.string() });\n',
        [NOTIFICATIONS]:
          'import { z } from "zod";\nimport { leakyBase } from "./leaky-base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [leakyBase]);\n',
      },
      expect: { count: 1, token: "apiKey" },
      why: "THE IMPORTED-INITIALIZER ARM (#1025): the arm is a schema declared in another file — a literal-`z.object`-only reader scanned ZERO keys for this whole union while the credential shipped on the durable inbox wire",
    },
    {
      mode: "types",
      files: { [RPG_BUS]: 'export type RpgBusEvent = { type: "gameChanged"; chatId: string; sessionSecret: string };\n' },
      expect: { count: 1, token: "sessionSecret" },
      why: "THE WIDENED POPULATION (#1030 F4): the rpg ROOM stream fans to every subscriber of an open room exactly like ChatBusEvent, and sat outside BOTH D16 arms — this row is what proves the home is really scanned rather than merely listed",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/merged-carrier.ts":
          "export interface MergedCarrier {\n  readonly emittedAt: number;\n}\nexport interface MergedCarrier {\n  readonly apiKey: string;\n}\n",
        [EVENTS]:
          'import type { MergedCarrier } from "./merged-carrier.ts";\nexport interface CharacterUpdatedEvent extends MergedCarrier {\n  readonly type: "character.updated";\n}\n',
      },
      expect: { count: 1, token: "apiKey" },
      why: "THE MERGED-DECLARATION ARM (#1030 F2): TypeScript merges same-named interfaces and `getDefinitionNodes()` returns both — a `find()` walked the first and the second declaration's members shipped unscanned",
    },
    {
      mode: "types",
      files: {
        [WORKLOADS]:
          'export type WorkloadEvent = { [K in "index" | "assets-gc"]: { readonly type: "succeeded"; readonly kind: K; readonly apiKey: string } }["index" | "assets-gc"];\n',
      },
      expect: { count: 1, token: "apiKey" },
      why: "THE MAPPED-TYPE DISTRIBUTION IS READ, NOT WAVED THROUGH (#1047): the reader resolves the arm set and scans the TEMPLATE's members, so a credential spelled inside the §5.5 distribution is reported. Without this row the admission of the workloads home would be a green that scanned nothing",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; payload: { [K in "a" | "b"]: { readonly apiKey: string } }["a" | "b"] };\n' },
      expect: { count: 1, token: "apiKey" },
      why: "the FIELD-position twin of the distribution: an inline distribution's keys ride the wire under the event's own name exactly like an inline object literal's, and this position passed SILENTLY before #1047",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; payload: [first: { apiKey: string }] };\n' },
      expect: { count: 1, token: "apiKey" },
      why: "a TUPLE element is a field position (#1066): an inline object literal spelled there rides the wire exactly like an array's element type, and the walker never descended one before",
    },
    {
      mode: "types",
      files: {
        [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; apiKey: string; sessionToken: string };\n',
        [USER_BUS]: 'export type UserBusEvent = { type: "y"; apiKey: string };\n',
      },
      // TWO findings, not three: the grant identity is the FIELD NAME, so both `apiKey` sites aggregate into
      // ONE reportable occurrence and `sessionToken` is its own. This row IS the §4.6 granularity claim — it
      // reds the moment the aggregation is removed, which is the moment `credentialId` stops being grantable.
      expect: { count: 2, messageIncludes: "line(s)" },
      why: "THE 1:1 GRANT IDENTITY: a reviewed grant matching N > 1 candidates licenses NOTHING (§12.5), so the policy reports ONE finding per distinct smelling NAME with every site's line in the message. Without the aggregation the sanctioned `credentialId` row becomes unlicensable the day a second bus member spells it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "turnStarted"; chatId: string; model: string; source: string };\n' },
      why: "no credential-smell field (model/source/chatId are safe scalars/ids) — passes",
    },
    {
      mode: "types",
      files: {
        [CHAT_BUS]:
          'export interface MessageView {\n  cacheReadTokens: number;\n  maxOutputTokens: number;\n}\nexport type ChatBusEvent = { type: "turnStarted"; chatId: string };\n',
      },
      why: "MessageView is NOT a bus-union declaration name and nothing's identity reaches it — its `*Tokens` economics fields stay out of scope beside a measured, safe bus root. The row dies if the ROOT NAME dispatch widens into a whole-file scan; an empty bus population is a refusal, not this passing control",
    },
    {
      mode: "types",
      files: {
        [CHAT_BUS]:
          'export interface MessageView {\n  readonly cacheReadTokens: number;\n  readonly apiKey: string;\n}\nexport type ChatBusEvent = { type: "messageCommitted"; chatId: string; view?: MessageView };\n',
      },
      why: "THE PRESERVED NON-TRANSITIVE BOUNDARY: a field's TYPE is not descended. `view` is the wire field; MessageView's own members belong to MessageView's home. Widening past this makes the family a whole-graph crawler with no natural edge",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/base-event.ts": "export interface StampedEvent {\n  readonly emittedAt: number;\n}\n",
        [EVENTS]:
          'import type { StampedEvent } from "./base-event.ts";\nexport interface CharacterUpdatedEvent extends StampedEvent {\n  readonly type: "character.updated";\n  readonly characterId: string;\n}\n',
      },
      why: "SANCTIONED INHERITANCE: an imported base carrying only non-secret fields is resolved, counted as an inherited member, and passes — the transitive reader widens what is SEEN, never what is flagged",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'type Meta = Record<string, string>;\nexport type ChatBusEvent = { type: "x"; chatId: string; meta: Meta };\n' },
      why: "A DECLARED LIMIT (#1024): a NAMED alias of an open shape is not resolved — resolving a field's named type is the non-transitive boundary #948 ruled on. The open-shape REFUSAL for the inline spelling belongs to the `-health` sibling, so this policy is silent here for two independent reasons and the row states both",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/notifications/base.ts":
          'import { z } from "zod";\nexport const inboxBase = z.object({ recipientUserId: z.string(), chatId: z.string() });\n',
        [NOTIFICATIONS]:
          'import { z } from "zod";\nimport { inboxBase } from "./base.ts";\nexport const notificationEventSchema = z.discriminatedUnion("type", [inboxBase.extend({ inviteId: z.string() })]);\n',
      },
      why: "THE GREEN TWIN of the imported-initializer arm: an imported base carrying only ids is RESOLVED, counted as an inherited member with its carrier, and passes — the resolver widens what is SEEN, never what is flagged",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/workloads/axes.ts":
          'export const WORKLOAD_KINDS = ["index", "assets-gc"] as const;\nexport type WorkloadKind = (typeof WORKLOAD_KINDS)[number];\n',
        "packages/contracts/src/workloads/result.ts":
          'export interface WorkloadResultByKind {\n  index: { readonly apiKey: string };\n  "assets-gc": { readonly scanned: number };\n}\n',
        [WORKLOADS]:
          'import type { WorkloadKind } from "./axes.ts";\nimport type { WorkloadResultByKind } from "./result.ts";\nexport type WorkloadEvent = {\n  [K in WorkloadKind]: { readonly type: "succeeded"; readonly kind: K; readonly result: WorkloadResultByKind[K] };\n}[WorkloadKind];\n',
      },
      why: "A DECLARED LIMIT (#1047), the live `WorkloadEvent` shape: the constraint is resolved through the `(typeof TUPLE)[number]` axis and the template's members are scanned, but `result`'s indexed access into the NAMED `WorkloadResultByKind` is a shape the field REFERENCES — its `apiKey` belongs to that map's own home, exactly like `MessageView`'s",
    },
    {
      mode: "types",
      files: {
        [CHAT_BUS]:
          'export type ChatBusEvent = { type: "x"; chatId: string; n: number; ok: boolean; big: bigint; s: symbol; none: null; maybe: undefined; nope: never; tag: `wi.${string}` };\n',
      },
      why: "THE OTHER DIRECTION of the #1066 widening: a field legitimately spells a SCALAR where an event's identity never does, and a scalar declares no wire key. Without this row the sibling's fail-closed arm would red every honest payload on the tree",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/settings/index.ts": "export type SomeOtherThing = { apiKey: string };\n",
        [CHAT_BUS]: 'export type ChatBusEvent = { type: "turnStarted"; chatId: string };\n',
      },
      why: "SCOPE: a non-bus contract file is inside the POPULATION (carriers live there) but contributes no bus fields. A safe bus root supplies the measured population; dropping root dispatch and treating every contract as the subject would expose SomeOtherThing.apiKey and fail this row",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        [CHAT_BUS]: "export interface MessageView {\n  cacheReadTokens: number;\n  maxOutputTokens: number;\n}\n",
        "packages/contracts/src/settings/index.ts": "export type SomeOtherThing = { apiKey: string };\n",
      },
      expect: { messageIncludes: 'population "bus-payload-allowlist" resolved zero members' },
      why: "Contract files and a bus home can be present while no bus root contributes a field. The policy must withhold its empty denominator; a clean pass here would claim a firewall verdict without measuring a wire field",
    },
  ],
});
