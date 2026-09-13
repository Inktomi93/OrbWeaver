// Policy: policy-proof-expectations — the §4.1 expectation half of the soundness enforcer (#1971; family
// `policy-soundness`, reader `lib/policy-descriptor-read.ts`; work row #1968 — `hard`/`error` since the owner ruled
// `hard` + `warning` a contradiction, #2025, 2026-09-12: its findings BLOCK, never downgraded back). `expectationFailure`
// in `ops/policy-conformance.ts` returns early once ONE effective finding exists, and `count` is the
// only field it compares exactly; `line`/`token`/`messageIncludes` run through `findings.some(…)`. So:
//
//   C a `mustFlag` row with no `expect.count` asserts only "at least one finding" — it passes when the policy
//     flags the WRONG node or flags eight where one was meant (wave-1 D1: `server-layout` `mustFlag[0]`
//     tolerated 8 findings from two arms under a one-finding `why`). §4.1: "Name `count` always."
//     THE ONE DECLARED EXEMPTION (#2001, owner 2026-09-12): `expect: { countFrom: "<DRIVER>" }`, for the
//     measured class where the finding count is a module-level registry's cardinality the fixture cannot
//     control — pinning a literal there makes a legitimate registry addition a RED PROOF. It is EXACT: the
//     named driver must resolve at module scope in this very module (the same question `verifyPolicyProofs`
//     asks at runtime, through the shared `declaresModuleName`), and — tighter than the ruling, because the
//     alternative is a row asserting nothing — the row must still carry `token`/`line`/`messageIncludes`.
//   M a present `messageIncludes` that is not statically readable, or one that cannot discriminate — the substring sits inside the static text of the
//     module's ONLY message source (a tautology: it matches every finding the policy can emit), or inside the
//     static text of TWO OR MORE sources (wave-1 D3: `ui-exports-map-complete`'s `"not"` lives in both the
//     wrong-target and the dead-target message). §4.1: "Before reaching for `messageIncludes`, check that the
//     module emits more than one message."
//   U a `mustFlag` row that is not a statically readable object literal (a call result, an unresolvable
//     spread) — §12.1 says every self-proof row declares its fixture explicitly, and a row this reader cannot
//     see is a row no reader can check for `count`. Zero on the corpus at mint; pinned so it stays zero.
//
// THE MESSAGE CENSUS (arm M's denominator) counts every text a finding of this module can carry: the
// descriptor `message` when any report site omits an override; every `message:` / `unreadableMessage:`
// property in the module body (the two names the runtime and the one shared reporter,
// `lib/reviewed-grant-findings.ts:57`, read from); and every STRING-typed argument of a call that receives
// the context or its sink (`lib/tenancy-scope.ts:97` reports a message it was handed positionally). A
// source this reader cannot read makes the module UNJUDGED on arm M — a declared limit, never a guess, and
// exactly the conservative direction for discrimination. A present unreadable expectation is separately
// reported: an unknown substring cannot silently acquire the optional field's absence semantics.
//
// A conditional message is TWO SOURCES, one per branch (#2055) — the census reads through
// `messageAlternatives`, never through the folded `staticSegments` union. One `ctx.report` spelled
// `found.unreadable ? UNREADABLE : MESSAGE` emits one text or the other and never a text carrying both, so
// folding them made a substring that lives in exactly one branch read as matching the module's ONLY source:
// TAUTOLOGY, on three live #2041 rows whose `messageIncludes` is the only thing telling their fail-closed arm
// from its sibling, and whose remedy as written ("drop it") would have deleted that discriminator from a HARD
// arm. Splitting keeps the FINDING direction intact — a substring in BOTH branches is still two hits, still
// SHARED — which is the pair of rows that pins it. The same widening is what makes D3 reachable: the substring
// is judged against every text one site can emit, one text at a time.
//
// THE CALL HALF (#2040). A message COMPOSED BY A CALL was text the census could not see, and a partially-read
// source was counted as if it had been read whole — so a substring that also lives in the invisible piece read
// as `discriminates` and the row's claim shipped unenforced under a green enforcer. Two changes, one in each
// direction: (1) `staticSegments` now reads THROUGH a call whose callee is a function or arrow with a single
// return expression — authored text, arguments not substituted, so every piece it yields is still certain;
// (2) `discriminates` is now claimable only when every NON-HITTING source was read WHOLE, because that verdict
// is a claim of ABSENCE and a partially-read source cannot support one. Everything else a call can be — a
// method, `JSON.stringify`, a value formatter — still reads as an UNREADABLE source and makes the module
// UNJUDGED, which is the refusal, never a guess (§12.3).
//
// Hard/error since #2025: a proof row cannot waive the check on its own honesty. Historical warning debt
// at mint does not authorize downgrading the current contract.
//
// FAMILY `policy-soundness` — the shared reader is `lib/policy-descriptor-read.ts` (`proofRowsOf`,
// `filesContentsOf`, `discriminationOf` and the `staticSegments` machinery). `discriminationOf` is the one
// worth naming: whether a `messageIncludes` actually DISCRIMINATES is computed once, for every member, so a
// row cannot read as pinning an arm here and as pinning nothing next door.
// POPULATION PORT: NONE — no legacy population exists to port, because this module was BORN FINAL, in the
// commit that created the family (`fe8c9cc84`, "the §5b soundness enforcer — four final meta-policies over
// the gate corpus"). `git show fe8c9cc84^:<this file>` refuses with "exists on disk, but not in
// fe8c9cc84^"; that refusal IS the receipt (the `scrubber-factory-home` precedent). Its population was
// authored against the gate corpus from the start, `_proof/` fixtures fenced out.
import type { CallExpression, ObjectLiteralExpression, PropertyAssignment, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate, POLICY_EXPECTATION_IDENTITY_KEYS } from "../contract/policy.ts";
import type { StaticSegments } from "../contract/policy-descriptor-read.ts";
import {
  contextParameterOf,
  declaresModuleName,
  descriptorProperty,
  descriptorValue,
  discriminationOf,
  finalDescriptorOf,
  isContextRooted,
  isMessageProperty,
  isStringTyped,
  messageAlternatives,
  objectLiteralOf,
  proofRowsOf,
  reportSiteMessage,
  reportSiteOf,
  staticText,
} from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-proof-expectations.ts";

const MESSAGE =
  "a `mustFlag` proof row is under-specified (gate-runtime-standardization.md §6.1): it carries no `expect.count` (the only " +
  "field the conformance runner compares exactly — without it the row passes on the WRONG node and on N findings where one " +
  "was meant), or its `messageIncludes` discriminates nothing, or the row is not a statically readable object literal. " +
  "A `countFrom` token: the row DECLARES a registry-driven count, and the declaration is not exact — the named driver does not resolve in " +
  "this module, or the row carries no identity field beside it.";
const NO_COUNT_MESSAGE =
  "`mustFlag` row carries no `expect.count` — `expectationFailure` (ops/policy-conformance.ts) returns early once one finding " +
  "exists, so this row passes when the policy flags the wrong node or flags several where one was meant. Name `count` always (§4.1).";
const TAUTOLOGY_MESSAGE =
  "`messageIncludes` matches every finding this policy can emit — the module has ONE message source and the substring sits in its " +
  "static text, so the row's discrimination claim is empty; `count` (and `token`/`line`) carry the row. Drop it or add a second message shape (§4.1).";
const SHARED_MESSAGE =
  "`messageIncludes` is contained in the static text of MORE THAN ONE of this module's message sources, so it cannot tell the arm the " +
  'row is about from its sibling (the `"not"`-matches-both-arms shape). Pick a substring only the intended message carries.';
const UNREADABLE_INCLUDES_MESSAGE =
  "`expect.messageIncludes` is present but not statically readable — the source reader cannot check this discriminator. " +
  "Use an exact static string or the shared reader's supported immutable derivation (gate-runtime-standardization.md §6.1).";
const COUNT_FROM_UNRESOLVED_MESSAGE =
  "`expect.countFrom` names a driver this module declares NOWHERE at module scope — the declared exemption names nothing, so the row is " +
  "back to asserting only `at least one finding` while wearing an exemption's clothes. Name the module-level constant (or import) whose " +
  "cardinality actually drives the count (#2001, gate-runtime-standardization.md §6.1).";
const COUNT_FROM_BARE_MESSAGE =
  "`expect.countFrom` replaces `count` but this row carries NO other identity field — `token`, `line` or `messageIncludes` — so it asserts " +
  "nothing at all, which is strictly worse than the literal it replaces. A registry-driven row still names WHICH node or WHICH arm (#2001, gate-runtime-standardization.md §6.1).";
const UNREADABLE_ROW_MESSAGE =
  "a proof row is not a statically readable object literal — §12.1 requires every self-proof row to declare its fixture explicitly; " +
  "a row assembled at runtime cannot be checked for `expect.count` by any reader.";
const FIX =
  "add `expect: { count: <n>, … }` to every `mustFlag` row (plus `token`/`line` when the `why` claims WHICH node); keep `messageIncludes` " +
  "only where the module emits more than one message and the substring appears in exactly one of them; spell rows as object literals.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

interface ModuleWalk {
  readonly calls: CallExpression[];
  readonly messageProperties: PropertyAssignment[];
}

interface MessageCensus {
  readonly sources: readonly StaticSegments[];
  readonly unreadable: number;
}

interface CensusState {
  readonly sources: Map<string, StaticSegments>;
  unreadable: number;
  /** Some report site omits its message, so the descriptor's own `message` is a live source. */
  bare: boolean;
}

/** Sources are DEDUPED by their segments, as they always were. When two sites spell the same text and only one
 *  of them was read whole, the merged source keeps the WEAKER `complete` — the reader never claims to have seen
 *  more than it did (#2040). */
function addText(state: CensusState, text: StaticSegments | undefined): void {
  if (text === undefined || text.segments.length === 0) {
    state.unreadable += 1;
  } else {
    const key = JSON.stringify(text.segments);
    const existing = state.sources.get(key);
    state.sources.set(key, existing === undefined ? text : { segments: text.segments, complete: existing.complete && text.complete });
  }
}

/** Each ALTERNATIVE is its own source (#2055) — a site whose message is `cond ? A : B` contributes two, and
 *  an alternative this reader could not read contributes one unreadable source. */
function addTexts(state: CensusState, texts: readonly StaticSegments[]): void {
  for (const text of texts) {
    addText(state, text);
  }
}

function censusSite(state: CensusState, call: CallExpression): void {
  const provenance = reportSiteMessage(call);
  if (provenance.kind === "policy") {
    state.bare = true;
  } else if (provenance.kind === "override") {
    addTexts(state, provenance.texts);
  } else {
    addText(state, undefined);
  }
}

/** A call that receives the context or its sink may report on the module's behalf with the strings it was
 *  handed (`lib/tenancy-scope.ts:97`); every string-typed argument is a possible message. */
function censusEscape(state: CensusState, call: CallExpression): void {
  for (const argument of call.getArguments()) {
    if (isStringTyped(argument)) {
      addTexts(state, messageAlternatives(argument));
    }
  }
}

/** Every text a finding of this module can carry, or how many it could not read. */
function messageCensus(descriptor: ObjectLiteralExpression, walk: ModuleWalk): MessageCensus {
  const state: CensusState = { sources: new Map(), unreadable: 0, bare: false };
  const contextSymbol = contextParameterOf(descriptor);
  for (const call of walk.calls) {
    if (reportSiteOf(call) !== undefined) {
      censusSite(state, call);
    } else if (contextSymbol !== undefined && call.getArguments().some((argument) => isContextRooted(argument, contextSymbol))) {
      censusEscape(state, call);
    }
  }
  for (const property of walk.messageProperties) {
    const initializer = property.getInitializer();
    if (property.getParent() !== descriptor && initializer !== undefined) {
      addTexts(state, messageAlternatives(initializer));
    }
  }
  if (state.bare) {
    const own = descriptorValue(descriptor, "message");
    if (own === undefined) {
      addText(state, undefined);
    } else {
      addTexts(state, messageAlternatives(own));
    }
  }
  return { sources: [...state.sources.values()], unreadable: state.unreadable };
}

/** The identity fields a row can carry BESIDE its count — what tells one arm's findings from another's — read
 *  off the contract's one vocabulary, never re-spelled here (#2111). */
const IDENTITY_FIELDS = POLICY_EXPECTATION_IDENTITY_KEYS;

/** ARM C's declared exemption (#2001): `countFrom` names the module-level driver whose cardinality the fixture
 *  cannot control, and it is EXACT — the name must resolve in this very module, and the row must still say
 *  WHICH node or arm it is about. The second requirement is deliberately TIGHTER than the owner's ruling,
 *  which accepted `countFrom` and required only that the constant resolve: without an identity field the
 *  exemption leaves the row asserting nothing, which is worse than the literal `count` it replaces. */
function judgeCountFrom(ctx: GatePolicyContext, expectation: ObjectLiteralExpression, sourceFile: SourceFile): void {
  const property = descriptorProperty(expectation, "countFrom");
  const name = property === undefined ? undefined : staticText(descriptorValue(expectation, "countFrom"));
  if (property === undefined) {
    return;
  }
  if (name === undefined || !declaresModuleName(sourceFile, name)) {
    ctx.report.node(property, { token: "countFrom", offset: 0, message: COUNT_FROM_UNRESOLVED_MESSAGE });
  }
  if (!IDENTITY_FIELDS.some((field) => expectation.getProperty(field) !== undefined)) {
    ctx.report.node(property, { token: "countFrom", offset: 0, message: COUNT_FROM_BARE_MESSAGE });
  }
}

/** Arms C and M over ONE `mustFlag` row. */
function judgeRow(ctx: GatePolicyContext, row: ObjectLiteralExpression, census: MessageCensus, sourceFile: SourceFile): void {
  const expectation = objectLiteralOf(descriptorValue(row, "expect"));
  if (expectation !== undefined && expectation.getProperty("countFrom") !== undefined) {
    judgeCountFrom(ctx, expectation, sourceFile);
  } else if (expectation === undefined || expectation.getProperty("count") === undefined) {
    ctx.report.node(row, { message: NO_COUNT_MESSAGE });
  }
  const includes = expectation?.getProperty("messageIncludes");
  const substring = expectation === undefined ? undefined : staticText(descriptorValue(expectation, "messageIncludes"));
  if (includes === undefined) {
    return;
  }
  if (substring === undefined) {
    ctx.report.node(includes, { message: UNREADABLE_INCLUDES_MESSAGE });
    return;
  }
  const verdict = discriminationOf(substring, census.sources, census.unreadable);
  if (verdict === "tautology") {
    ctx.report.node(includes, { token: "messageIncludes", offset: 0, message: TAUTOLOGY_MESSAGE });
  } else if (verdict === "shared") {
    ctx.report.node(includes, { token: "messageIncludes", offset: 0, message: SHARED_MESSAGE });
  }
}

function judgeModule(ctx: GatePolicyContext, descriptor: ObjectLiteralExpression, walk: ModuleWalk, sourceFile: SourceFile): void {
  const rows = proofRowsOf(descriptorValue(descriptor, "mustFlag"));
  for (const node of rows.unreadable) {
    ctx.report.node(node, { message: UNREADABLE_ROW_MESSAGE });
  }
  const census = messageCensus(descriptor, walk);
  for (const row of rows.rows) {
    judgeRow(ctx, row, census, sourceFile);
  }
}

function walkOf(walks: Map<SourceFile, ModuleWalk>, sourceFile: SourceFile): ModuleWalk {
  const existing = walks.get(sourceFile);
  if (existing !== undefined) {
    return existing;
  }
  const created: ModuleWalk = { calls: [], messageProperties: [] };
  walks.set(sourceFile, created);
  return created;
}

const TWO_SOURCE_MODULE = (rowExpect: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => { ctx.report.node(node, { message: "arm A: the entry is not registered." }); ctx.report.node(node, { message: "arm B: the target does not exist." }); } }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: ${rowExpect}, why: "w" }],`,
  );

/** The D3 shape: one site whose message is a template over a CONDITIONAL, beside a second site. */
const CONDITIONAL_MODULE = (rowExpect: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node: MorphNode) => { const target = node.getText(); const detail = target === "" ? "no entry at all" : \`"\${target}", not "x"\`; ctx.report.node(node, { message: \`exports has \${detail} for the key.\` }); ctx.report.node(node, { message: \`points at "\${target}", which does not exist.\` }); } }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: ${rowExpect}, why: "w" }],`,
    'import type { Node as MorphNode } from "ts-morph";\n',
  );

/** The #2001 declared exemption, with the driver constant present or absent and the row's identity field
 *  present or absent — the four combinations ARM C's exact-exemption rule turns on. */
const REGISTRY_DRIVEN_MODULE = (rowExpect: string, prelude: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: ${rowExpect}, why: "w" }],`,
    prelude,
  );

const DRIVER = 'const PORTABLE_CANON_TABLES = ["a", "b"];\n';

/** THE #2055 SHAPE: ONE report site whose message is a CONDITIONAL. The module emits two texts from one
 *  `ctx.report`, which the census must read as TWO sources — the fold that read them as one made a substring
 *  living in a single branch match "the module's only source" and fired TAUTOLOGY. */
const ONE_SITE_CONDITIONAL_MODULE = (rowExpect: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node: MorphNode) => { const unreadable = node.getText() === ""; ctx.report.node(node, { message: unreadable ? "whether this opens a socket CANNOT be established." : "this opens a tRPC socket." }); } }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: ${rowExpect}, why: "w" }],`,
    'import type { Node as MorphNode } from "ts-morph";\n',
  );

/** ARM M, the CALL half (#2040): a message composed by a module-local TEXT FUNCTION. The call carries
 *  AUTHORED text, so the census must read through it; `subject` is a parameter and stays dynamic, exactly
 *  like an inline span. `helper` and the second site's literal vary so one shape proves both directions. */
const TEXT_FUNCTION_MODULE = (helper: string, siteB: string, rowExpect: string): string =>
  finalProbeModule(
    `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node: MorphNode) => { ctx.report.node(node, { message: armA(node.getText()) }); ctx.report.node(node, { message: "${siteB}" }); } }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: ${rowExpect}, why: "w" }],`,
    `import type { Node as MorphNode } from "ts-morph";\n${helper}`,
  );

export const gate = defineGate({
  id: "policy-proof-expectations",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const walks = new Map<SourceFile, ModuleWalk>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression, SyntaxKind.PropertyAssignment],
          visit: (node, sourceFile): void => {
            if (Node.isCallExpression(node)) {
              walkOf(walks, sourceFile).calls.push(node);
            } else if (Node.isPropertyAssignment(node) && isMessageProperty(node)) {
              walkOf(walks, sourceFile).messageProperties.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const sourceFile of ctx.files) {
          const path = ctx.relativePath(sourceFile);
          const descriptor = finalDescriptorOf(sourceFile);
          if (descriptor !== undefined) {
            judgeModule(ctx, descriptor, walkOf(walks, sourceFile), sourceFile);
          } else if (path === SELF) {
            throw new Error(BLIND);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(TWO_SOURCE_MODULE('{ count: 1, get messageIncludes() { return "not"; } }')),
      expect: { count: 1, token: "get", messageIncludes: "not statically readable" },
      why: "An accessor is a present expectation property whose value requires execution; it must not be mistaken for an absent optional discriminator.",
    },
    {
      mode: "types",
      files: familyFixture(
        TWO_SOURCE_MODULE("{ count: 1, messageIncludes: unknownText() }").replace(
          "import { defineGate }",
          "declare function unknownText(): string;\nimport { defineGate }",
        ),
      ),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "not statically readable" },
      why: "A present unreadable discriminator must be reported; silently returning would make an expectation the source reader cannot check look clean.",
    },
    {
      mode: "types",
      files: familyFixture(REGISTRY_DRIVEN_MODULE('{ countFrom, token: "x" }', 'const countFrom = "MISSING_DRIVER";\n')),
      expect: { count: 1, token: "countFrom", messageIncludes: "declares NOWHERE at module scope" },
      why: "A shorthand countFrom has exactly the same driver obligation as a property assignment; ignoring its anchor previously skipped the entire check.",
    },
    {
      mode: "types",
      files: familyFixture(
        TWO_SOURCE_MODULE("{ count: 1, messageIncludes }").replace("import { defineGate }", 'const messageIncludes = "not";\nimport { defineGate }'),
      ),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "MORE THAN ONE" },
      why: "The shorthand message discriminator appears in both report texts and must be checked through the same stable-value reader as an explicit property.",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { token: "x" }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "mode", messageIncludes: "no `expect.count`" },
      why: "C THE FOUNDING SHAPE (wave-1 D1): an `expect` with a token but no `count` asserts nothing about HOW MANY findings — the anchor is the row, whose derived position is its first key",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "mode", messageIncludes: "no `expect.count`" },
      why: "C no `expect` at all — the row asserts only that SOME finding fired",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "the only message.",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1, messageIncludes: "only message" }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "every finding" },
      why: "M THE TAUTOLOGY: one bare report site, one policy-level message — the substring matches every finding the policy can emit, and `count: 1` is doing all the work",
    },
    {
      mode: "types",
      files: familyFixture(TWO_SOURCE_MODULE('{ count: 1, messageIncludes: "not" }')),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "MORE THAN ONE" },
      why: "M THE SHARED SUBSTRING (wave-1 D3): `not` sits in both arms' static text, so the row cannot tell arm A from arm B",
    },
    {
      mode: "types",
      files: familyFixture(CONDITIONAL_MODULE('{ count: 1, messageIncludes: "not" }')),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "MORE THAN ONE" },
      why: "M D3 EXACTLY: the first site's message is a template over a CONDITIONAL whose false branch carries `not`, the second site's static text carries `not` too — reachable only because a conditional contributes both branches",
    },
    {
      mode: "types",
      files: familyFixture(REGISTRY_DRIVEN_MODULE('{ countFrom: "PORTABLE_CANON_TABLES", token: "x" }', "")),
      expect: { count: 1, token: "countFrom", messageIncludes: "declares NOWHERE at module scope" },
      why: "C THE DECLARED EXEMPTION IS EXACT (#2001): `countFrom` names a driver this module binds nowhere, so the exemption names nothing and the row is back to `at least one finding` wearing an exemption's clothes — the planted break for the new row shape (§4.7)",
    },
    {
      mode: "types",
      files: familyFixture(REGISTRY_DRIVEN_MODULE('{ countFrom: "PORTABLE_CANON_TABLES" }', DRIVER)),
      expect: { count: 1, token: "countFrom", messageIncludes: "NO other identity field" },
      why: "C TIGHTER THAN THE RULING, deliberately: the driver resolves, but the row names no `token`/`line`/`messageIncludes`, so it asserts NOTHING — strictly worse than the literal `count` it replaces. The ruling accepted `countFrom` and required only resolution; this companion requirement is the gate's, and it is why `verify-registry-parity`'s bare row gained a `token` rather than an exemption",
    },
    {
      mode: "types",
      files: familyFixture(ONE_SITE_CONDITIONAL_MODULE('{ count: 1, messageIncludes: "socket" }')),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "MORE THAN ONE" },
      why: "M THE CONDITIONAL SPLIT, FINDING DIRECTION (#2055): one site, two branch texts, and `socket` sits in BOTH — splitting the branches into two sources keeps the SHARED verdict reachable, so the arm did not go blind when the fold was removed",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: rows(),`,
          'function rows(): unknown[] {\n  return [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }];\n}\n',
        ),
      ),
      expect: { count: 1, token: "rows", messageIncludes: "not a statically readable" },
      why: "U a row set produced by a CALL cannot be read by any reader — §12.1's explicit-fixture rule, pinned at zero live cases",
    },
    {
      mode: "types",
      files: familyFixture(
        TEXT_FUNCTION_MODULE(
          "const armA = (subject: string): string => `arm A: ${subject} is not registered.`;\n",
          "arm B: the target is not registered either.",
          '{ count: 1, messageIncludes: "not registered" }',
        ),
      ),
      expect: { count: 1, token: "messageIncludes", messageIncludes: "MORE THAN ONE" },
      why: "M THE CALL-COMPOSED SHARED SUBSTRING (#2040 direction ONE): one site's message is a module-local TEXT FUNCTION whose static text also carries `not registered` — before the census read through the call this row's module was UNJUDGED and the shared substring shipped unenforced",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...familyFixture(
          TWO_SOURCE_MODULE('{ count: 1, messageIncludes: WORDS.join(",") }')
            .replace("import { defineGate }", 'import { WORDS } from "../lib/probe-words.ts";\nimport { defineGate }')
            .replace("arm A: the entry is not registered.", "arm A: alpha,beta"),
        ),
        "tooling/src/verify/lib/probe-words.ts":
          'const DEFINITION = { alpha: "first", beta: "second" };\nexport const WORDS = Object.freeze(Object.keys(DEFINITION));\n',
      },
      why: "A canonical imported frozen key sequence derives a readable discriminator without copying vocabulary; cutting the derived-text reader makes this valid row unreadable and red.",
    },
    {
      mode: "types",
      files: familyFixture(REGISTRY_DRIVEN_MODULE('{ countFrom, token: "x" }', `${DRIVER}const countFrom = "PORTABLE_CANON_TABLES";\n`)),
      why: "A shorthand countFrom whose driver exists and whose row retains identity is an admitted proof shape.",
    },
    {
      mode: "types",
      files: familyFixture(
        TWO_SOURCE_MODULE("{ count: 1, messageIncludes }").replace("import { defineGate }", 'const messageIncludes = "does not exist";\nimport { defineGate }'),
      ),
      why: "A shorthand discriminator occurring in only one report text remains valid.",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1, token: "x" }, why: "w" }],`,
        ),
      ),
      why: "the honest row: `count` names how many, `token` names which — nothing to say",
    },
    {
      mode: "types",
      files: familyFixture(TWO_SOURCE_MODULE('{ count: 1, messageIncludes: "does not exist" }')),
      why: "M NEAR-MISS: two sources, and the substring sits in exactly ONE of them — the discriminating shape `schema-branding` proved",
    },
    {
      mode: "types",
      files: familyFixture(CONDITIONAL_MODULE('{ count: 1, messageIncludes: "no entry at all" }')),
      why: "M the conditional's OTHER branch: `no entry at all` appears in one branch of one site and in no VISIBLE piece of the other, and the other site carries a dynamic span — so since #2040 this reads UNJUDGED rather than `discriminates`, and either way there is nothing to report. The same module D3's row lives in, judged quietly on its honest sibling row",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => { const flag = (node: MorphNode, message: string): void => ctx.report.node(node, { message }); return { visitors: [{ kinds: [1], visit: (node) => flag(node, "arm A") }] }; },\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1, messageIncludes: "arm A" }, why: "w" }],`,
          'import type { Node as MorphNode } from "ts-morph";\n',
        ),
      ),
      why: "M DECLARED LIMIT: the report site's message is a PARAMETER, so the module's message set is unreadable and the row is UNJUDGED — never a finding on a module this reader cannot see whole",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => { ctx.report.node(node, { message: ARM_A }); ctx.report.node(node, { message: ARM_B }); } }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1, messageIncludes: "registered" }, why: "w" }],`,
          'const ARM_A = "arm A: the entry is " + "not registered.";\nconst ARM_B = "arm B: the target does not exist.";\n',
        ),
      ),
      why: "M messages behind const aliases and a concatenation are read like inline strings — `registered` sits in exactly one of the two",
    },
    {
      mode: "types",
      files: familyFixture(REGISTRY_DRIVEN_MODULE('{ countFrom: "PORTABLE_CANON_TABLES", token: "x", line: 1 }', DRIVER)),
      why: "C THE HONEST REGISTRY-DRIVEN ROW (#2001): the driver resolves at module scope and the row still names WHICH node and WHICH arm. This is the shape the nine live rows carry — a registry addition changes the count and breaks nothing, which is the whole reason the literal was the wrong instrument",
    },
    {
      mode: "types",
      files: familyFixture(ONE_SITE_CONDITIONAL_MODULE('{ count: 1, messageIncludes: "CANNOT be established" }')),
      why: "M THE CONDITIONAL SPLIT, CLEAN DIRECTION (#2055) — the row this policy used to accuse falsely. ONE `ctx.report` whose message is `unreadable ? A : B` emits A or B and never a text carrying both, so the substring living only in A discriminates. Under the folded read it matched the module's ONLY source and fired TAUTOLOGY on three live #2041 rows whose `messageIncludes` is the sole thing telling their fail-closed arm from its sibling; the finding's own remedy would have deleted that discriminator",
    },
    {
      mode: "types",
      files: familyFixture(
        'export const gate = { name: "probe", docRow: "x", message: "m", mustFlag: [{ files: { "x.ts": "x" }, why: "w" }], mustPass: [1] };\n',
      ),
      why: "SCOPE: a legacy descriptor's examples run through the legacy runtime, whose expectation shape is its own — this family reads the final contract only",
    },
    {
      mode: "types",
      files: familyFixture(
        TEXT_FUNCTION_MODULE(
          'const armA = (): string => "arm A: the entry is missing.";\n',
          "arm B: the target does not exist.",
          '{ count: 1, messageIncludes: "does not exist" }',
        ),
      ),
      why: "M THE CALL-COMPOSED DISCRIMINATOR (#2040 direction TWO): the same call shape whose text does NOT carry the substring — read whole, the call-composed source proves ABSENCE, so the row discriminates and nothing is reported. An arm that refused every call would flag this one",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node: MorphNode) => { ctx.report.node(node, { message: node.getText() }); ctx.report.node(node, { message: "arm B: the target does not exist." }); } }] }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1, messageIncludes: "does not exist" }, why: "w" }],`,
          'import type { Node as MorphNode } from "ts-morph";\n',
        ),
      ),
      why: "M THE REFUSAL RESIDUE: a METHOD call on a node is not authored text this reader can resolve, so the source stays unreadable and the module UNJUDGED — the fence that keeps the call reader from guessing at an arbitrary call's result",
    },
  ],
});
