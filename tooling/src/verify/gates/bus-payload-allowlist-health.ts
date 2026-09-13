// Policy: bus-payload-allowlist-health (Core-Laws-and-Precedents.md D16) — the UNSUPPRESSIBLE half of the
// bus-payload firewall: every way the shared wire-shape reader can fail to ESTABLISH a bus member's shape,
// plus the two tripwires that catch the reader going blind.
//
// FAMILY `bus-payload` — identical to its sibling `bus-payload-allowlist`, and the shared reader is
// `lib/bus-payload-fact.ts` (`busPayloadFact`), which performs the walk once for both. THE SPLIT AXIS IS
// AUTHORITY, which is the only axis §12.1 admits: the sibling's exceptions are reviewed grants over
// individual field names, and NOTHING here has a door at all. A fail-closed verdict says "I cannot prove no
// credential hides behind this shape", and under D16 an unprovable bus shape IS the violation — there is no
// per-site permission that could honestly license one, because the thing being licensed is unknown by
// construction. That is why the legacy descriptor was `markerImmune` and why this half is `hard`.
//
// WHAT IT REPORTS. Three classes, all from the shared fact's DATA rather than from a second walk:
//
//   1. FAIL-CLOSED SHAPE REFUSALS — `unresolved-base:<Name>` (a base/arm the reader cannot resolve to a
//      declaration inside `@contracts`), `unresolved-schema:<Name>` (its zod twin), and
//      `unsupported-shape:<Kind|word>` (an index signature, a `Record<…>`, an `unknown`/`any` field, a
//      mapped type whose key space is not a finite string-literal union, a `.loose()`/`.catchall()` arm, a
//      conditional field type, and every type-node kind added to the language after the walker was written).
//      An OPEN KEY SPACE is the sharpest of these: it declares no key vocabulary in ANY home, so — unlike a
//      referenced payload — nothing anywhere could ever scan what rides inside it.
//   2. THE EMPTY-ROOT ALARM (#1030 F3) — a named root that resolved, yielded no member, deferred to no other
//      named root, revisited nothing and was not refused out loud taught the reader NOTHING. A schema or type
//      refactor can hollow a root out without renaming it, which the blindness sweep cannot see because the
//      name still resolves, and which every other arm reads as a healthy green.
//   3. THE BLINDNESS SWEEP (§4.6) — a root NAME that resolves to nothing across the whole corpus. The family
//      dispatches on EXACT declaration names, so a rename or a move turns an entire arm into a silent no-op
//      that reports a healthy denominator forever.
//
// WHY THE LOUD REFUSAL IS A DECISION, NOT A BUG TO EXEMPT AWAY. A base imported through a package subpath or
// a `#alias` specifier does not resolve, and therefore REDS. That is the correct D16 answer: a bus member is
// a closed object literal of branded ids, and a base this reader cannot read is a wire shape nobody can read
// either. Do NOT widen the resolver by guessing at a same-named declaration elsewhere (an ambiguous or wrong
// match would walk the wrong members and hand back a confident green), and do NOT mint a grant. Spell the
// member inline, or import the base RELATIVELY so its declaration is provable.
//
// THE TWO TRIPWIRES HAVE DIFFERENT GUARDS, AND THAT IS THE POINT (ported byte-identically from the legacy
// `finalize`). The empty-root alarm needs NO corpus anchor: it judges only roots this run actually RESOLVED,
// so a mini-project declaring one root is judged on that root alone. The blindness sweep is a WHOLE-CORPUS
// claim and abstains below `REAL_CORPUS_MIN` — a COUNT, not a file list, because an
// all-bus-homes-loaded guard would be the trap it exists to catch: rename ONE bus home and the guard
// abstains exactly when its declarations went missing.
//
// POPULATION PORT: identical to the sibling's — `@contracts`, the same expression as the provider's, for the
// same forced reason (a consumer narrower than its provider is handed nodes it may not NAME).
//
// THREE ANCHOR MOVES, each forced and each classified (§4.6 category 6 — an anchor move is a receipt, not
// metadata; nothing binds to any of these, because this policy is `hard` and the marker census below is
// zero on both sides):
//
//   a. THE SHAPE LABELS LEFT THE POSITION AND ENTERED THE MESSAGE. Under the legacy engine a marker's
//      position was compared by plain string equality against the finding's own reported token
//      (`lib/gate-ignore.ts:180`), so `unresolved-base:UnknowableBase` — a string appearing in no source
//      file — was a legal DISCRIMINATOR LABEL. This contract redefines a position as AUTHORED TEXT at the
//      finding's exact offset, and `report.node` THROWS otherwise; all seven refusal rows threw on the
//      first run. The label is now the message's `Shape:` clause and every row discriminates on it.
//   b. THE EMPTY-ROOT ALARM ANCHORS ON THE ROOT'S OWN DECLARATION. The legacy `finalize` reported it at the
//      gate's own source file, which no `@contracts` population contains. An empty root RESOLVED, so it HAS
//      a declaration — and that declaration is exactly what a reader must re-derive.
//   c. THE BLINDNESS SWEEP USES `lib/absent-subject-anchor.ts#subjectAnchor`. Its subject is a NAME that
//      resolves to nothing, so it owns no node and no path; the rule's one home picks the first present bus
//      home (else the lowest admitted path) and the missing name moves into the message, where it was
//      always the load-bearing half.
//
// AUTHORITY `hard`, severity `error`. Marker census 0 = 0 = 0 (measured 2026-09-13; the only
// `@orb-gate-ignore bus-payload-allowlist` occurrences on the tree are this family's own test fixtures,
// which §8 step 6 excludes by name, and the legacy descriptor was `markerImmune` so none of them ever bit).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `bus-payload-allowlist` descriptor at c810fee0749e37333042645e1a061b257e289627, the parent of the conversion
// `a196a35d7`; this module did not exist there, so it is measured against the module it was carved from,
// `bus-payload-allowlist` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,558 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// `scanRoot` admits 8 and final `population` admits 105. legacy − final = ∅. final − legacy = 97 `@contracts` sources
// beyond the sibling's eight `BUS_FILES` — the same forced carrier widening. Controls: inside: no virtual sibling
// fits the exact-path population, so the real shared member `packages/contracts/src/automation/index.ts` is the
// control, admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { BUS_DECL_NAMES, BUS_FILES, busPayloadFact, NOTIFICATION_SCHEMA_NAME, REAL_CORPUS_MIN } from "../lib/bus-payload-fact.ts";

const CHAT_BUS = "packages/contracts/src/chat/bus.ts";
const USER_BUS = "packages/contracts/src/user-bus/index.ts";
const EVENTS = "packages/contracts/src/events/index.ts";
const NOTIFICATIONS = "packages/contracts/src/notifications/index.ts";

const MESSAGE =
  "a bus-event wire shape could not be ESTABLISHED, so this family cannot prove no credential hides behind " +
  "it — and under D16 an unprovable bus shape is itself the violation. A token spelled " +
  "`unresolved-base:<Name>`, `unresolved-schema:<Name>` or `unsupported-shape:<Kind>` is the FAIL-CLOSED " +
  "arm: keep a bus member a closed object literal with named keys, or a base/schema declared RELATIVELY " +
  "inside @orb/contracts. AN OPEN KEY SPACE IS ALSO REFUSED: an index signature, a `Record<…>`, an " +
  "`unknown`/`any` field, or a mapped type whose key space is not a finite string-literal union declares no " +
  "key vocabulary at all, so nothing anywhere can scan what rides inside it — spell the keys out. The house " +
  "`{ [K in <union>]: <template> }[<union>]` distribution IS read (its index erases the keys, so the wire " +
  "fields are the template's), provided the union resolves. See Core-Laws-and-Precedents.md D16.";

const EMPTY_ROOT_PREFIX =
  "this bus root resolved to ZERO wire members — it yielded no field, deferred to no other named root, and " +
  "was not refused out loud, so the family scanned an EMPTY denominator for it while every other arm stayed " +
  "green (#1030 F3: a schema/type refactor can hollow a root out without renaming it, which the blindness " +
  "sweep cannot see because the name still resolves). Re-derive the root's shape: ";

const BLIND_PREFIX =
  "blindness tripwire (§4.6) — this family dispatches on EXACT declaration names, and this one resolves to " +
  "NOTHING across the bus homes on the real tree. A rename/move turns the whole arm into a silent no-op " +
  "that reports a healthy denominator forever. Re-derive the name (or delete it if the payload is genuinely " +
  "gone): ";

const FIX =
  "spell the bus member as a closed object literal with named keys (or a base/schema declared RELATIVELY inside @orb/contracts) so the wire shape is readable — never an index signature, a `Record<…>`, an `unknown` field, or a `.loose()`/`.catchall()` schema arm. For a tripwire finding, re-derive the root set in tooling/src/verify/lib/bus-payload-fact.ts.";

export const gate = defineGate({
  id: "bus-payload-allowlist-health",
  family: "bus-payload",
  authority: "hard",
  severity: "error",
  population: "@contracts",
  analysis: "types",
  execution: "entire-population",
  facts: [busPayloadFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busPayloadFact);
      // A CONSTANT, never the census (§12.3 rule 2, #1966): this policy's whole job is to report an EMPTY or
      // holed denominator, so receipting the census would turn its own finding into a receipt refusal and it
      // would never reach its report. `members: 1` says "I measured one thing: the shared wire-shape fact".
      ctx.receipt({ kind: "population", source: "bus-payload-allowlist-health", members: 1, unresolved: 0 });
      // THE SHAPE LABEL RIDES THE MESSAGE, NEVER THE POSITION. `unresolved-base:UnknowableBase` and its
      // siblings are DISCRIMINATORS that appear in no source file, and `report.node` validates its position
      // token against the reported node's own text — so passing one as a token THROWS under this contract
      // (measured across all seven refusal rows). The legacy engine compared a position by plain string
      // equality against the finding's own reported token, which is why these worked there and why they are
      // the guide's 9-of-10 migration obligation rather than a defect in the legacy author's work.
      for (const refusal of fact.refusals) {
        ctx.report.node(refusal.node, { message: `${MESSAGE} Shape: ${refusal.token}.` });
      }
      // An EMPTY root RESOLVED, so unlike the blindness arm's subject it HAS a declaration to anchor on —
      // and that declaration is the thing a reader must re-derive. The legacy `finalize` anchored both
      // tripwires on the gate's own source file, which no `@contracts` population contains.
      for (const root of fact.emptyRoots) {
        ctx.report.node(root.node, {
          message: `${EMPTY_ROOT_PREFIX}"${root.name}" — the root set lives in tooling/src/verify/lib/bus-payload-fact.ts`,
        });
      }
      // The blindness sweep is a WHOLE-CORPUS claim, so it needs the whole-corpus guard — a COUNT rather than
      // an anchor file, because a name must RED even when the bus HOME that used to declare it is the thing
      // that moved.
      if (fact.corpusFiles < REAL_CORPUS_MIN) {
        return;
      }
      // AN ABSENCE VERDICT CANNOT ANCHOR ON ITS OWN SUBJECT: the root NAME resolves to nothing, so there is
      // no node and no path it owns. `subjectAnchor` is the one home for that rule — the first present bus
      // home, else the lowest admitted path — and the missing NAME moves into the message where it was
      // always the load-bearing half.
      const present = new Set(ctx.files.map((file) => ctx.relativePath(file)));
      const anchorFor = subjectAnchor(present, [...BUS_FILES]);
      for (const name of [...BUS_DECL_NAMES, NOTIFICATION_SCHEMA_NAME]) {
        if (!fact.resolvedRoots.has(name)) {
          ctx.report.file(anchorFor(name), {
            line: 1,
            column: 1,
            message: `${BLIND_PREFIX}"${name}" — the root set lives in tooling/src/verify/lib/bus-payload-fact.ts`,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: { [EVENTS]: 'export interface CharacterUpdatedEvent extends UnknowableBase {\n  readonly type: "character.updated";\n}\n' },
      expect: { count: 1, messageIncludes: "Shape: unresolved-base:UnknowableBase." },
      why: "FAIL-CLOSED: a base this population cannot resolve is REPORTED, never skipped — the family cannot prove no credential hides behind it, and a silent skip is exactly the false-green the transitive reader exists to kill",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; chatId: string; [k: string]: string };\n' },
      expect: { count: 1, messageIncludes: "Shape: unsupported-shape:IndexSignature." },
      why: "THE OPEN-KEY-SPACE ARM (#1024): `getProperties()` EXCLUDES index signatures, so this member was invisible to the field-name predicate — an unnamed key space on a room-public event is a credential nothing can see",
    },
    {
      mode: "types",
      files: { [USER_BUS]: 'export type UserBusEvent = { type: "x"; meta: Record<string, string> };\n' },
      expect: { count: 1, messageIncludes: "Shape: unsupported-shape:Record." },
      why: "the same open key space spelled as a FIELD TYPE — `Record<string, …>` declares no key vocabulary in any home, so no other home's rules can ever scan what rides inside it (unlike a referenced payload)",
    },
    {
      mode: "types",
      files: {
        [NOTIFICATIONS]:
          'import { z } from "zod";\nimport { farBase } from "@orb/contracts/elsewhere";\nexport const notificationEventSchema = z.discriminatedUnion("type", [farBase]);\n',
      },
      expect: { count: 1, messageIncludes: "Shape: unresolved-schema:farBase." },
      why: "FAIL-CLOSED on the schema side, the twin of `unresolved-base:`: a package-subpath specifier resolves to no declaration this population admitted, so the reader cannot prove no credential hides in that arm",
    },
    {
      mode: "types",
      files: {
        [NOTIFICATIONS]:
          'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("x") }).loose()]);\n',
      },
      expect: { count: 1, messageIncludes: "Shape: unsupported-shape:z.loose." },
      why: "the zod spelling of an open key space — `.loose()`/`.passthrough()`/`.catchall()` admit unknown keys, which is exactly what the notifications header promises the wire does NOT do",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { [K in string]: { readonly type: "x" } }[string];\n' },
      expect: { count: 1, messageIncludes: "Shape: unsupported-shape:MappedType." },
      why: "THE FAIL-CLOSED HALF of the distribution arm: a constraint that is not a finite string-literal union enumerates no arms, so the reader cannot prove the template it would read is the whole wire shape — it refuses instead of distributing",
    },
    {
      mode: "types",
      files: {
        [CHAT_BUS]: 'type Flag = true;\nexport type ChatBusEvent = { type: "x"; payload: Flag extends true ? { apiKey: string } : { safe: string } };\n',
      },
      expect: { count: 1, messageIncludes: "Shape: unsupported-shape:ConditionalType." },
      why: "THE FIELD WALKER FAILS CLOSED (#1066): measured on the legacy gate this exact source produced ZERO findings while the control `payload: { apiKey: string }` reported `apiKey` — the identity walker refused an unmodelled kind out loud and the field walker fell through in silence, so one shape was loud in one reader position and invisible in the other",
    },
    {
      mode: "types",
      files: { [NOTIFICATIONS]: 'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", []);\n' },
      expect: { count: 1, messageIncludes: "ZERO wire members" },
      why: "THE EMPTY-DENOMINATOR ARM (#1030 F3): the name still resolves, so the blindness sweep stays quiet by construction — a refactor that hollows a root out is invisible to every other arm, and a family scanning nothing reports a healthy green forever",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [CHAT_BUS]:
          'export type ChatBusEvent = { type: "turnStarted"; chatId: string; view?: MessageView };\nexport interface MessageView {\n  readonly n: number;\n}\n',
      },
      why: "a NAMED reference a field spells is the non-transitive boundary, not an unreadable shape: it STOPS, silently, and is not a refusal. The row that dies if the boundary is turned into a fail-closed arm",
    },
    {
      mode: "types",
      files: {
        [CHAT_BUS]:
          'export type ChatBusEvent = { type: "x"; chatId: string; n: number; ok: boolean; big: bigint; s: symbol; none: null; maybe: undefined; nope: never; tag: `wi.${string}` };\n',
      },
      why: "THE KEYLESS SET (#1066): a field legitimately spells a SCALAR where an event's identity never does, and a scalar declares no wire key — so `FIELD_KEYLESS_KINDS` is deliberately wider than the identity walker's `MEMBERLESS_KINDS`. Without this row the fail-closed widening would red every honest payload on the tree, which is how a fail-closed arm turns into a gate nobody can keep green",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'type Bag = Record<string, unknown>;\nexport type ChatBusEvent = { type: "x"; payload: Bag["anything"] };\n' },
      why: "DECLARED LIMIT (4) in its open-alias spelling, written down rather than assumed: indexing a NAMED alias stops at the name exactly as limit (1) does, so an open bag is refused only when spelled INLINE. #1066 closed the unmodelled-kind hole around this limit; it did not reverse the limit, which is a ruling",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "x"; payload: readonly ({ chatId: string } | { bookId: string })[] };\n' },
      why: "THE WRAPPERS ARE WALKED, NOT REFUSED: `readonly`, an array element type and a union's parts each carry no key of their own, so descending them is the correct answer and refusing them would red every honest payload that spells a list",
    },
    {
      mode: "types",
      files: { [CHAT_BUS]: 'export type ChatBusEvent = { type: "wi.updated"; bookId: string };\n' },
      why: "THE BLINDNESS SWEEP ABSTAINS below REAL_CORPUS_MIN: a conformance mini-project loads a handful of files, so every OTHER root name here is legitimately 'missing' and the whole-corpus claim stays quiet. Its bite on a real-sized corpus — and its silence on a healthy one — are proven in tests/tooling/verify/gates/bus-payload-family.test.ts, which is the only substrate that can carry a padded corpus",
    },
    {
      mode: "types",
      files: {
        [NOTIFICATIONS]:
          'import { z } from "zod";\nexport const notificationEventSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("invite"), inviteId: z.string() }).strict()]);\n',
      },
      why: "the KEY-NEUTRAL zod builders (`.strict()`/`.readonly()`/`.describe()`/`.brand()`/`.meta()`/`.register()`) neither add a key nor admit an unknown one, so an arm may chain through them — the row that dies if the neutral set is emptied and every honest schema arm becomes `unsupported-shape:z.strict`",
    },
  ],
});
