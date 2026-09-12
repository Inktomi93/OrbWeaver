// Policy: policy-proof-expectations — the §4.1 expectation half of the soundness enforcer (#1971; family
// `policy-soundness`, reader `lib/policy-descriptor-read.ts`; debt row #1968). `expectationFailure`
// (`ops/policy-conformance.ts:184-216`) returns early once ONE effective finding exists, and `count` is the
// only field it compares exactly; `line`/`token`/`messageIncludes` run through `findings.some(…)`. So:
//
//   C a `mustFlag` row with no `expect.count` asserts only "at least one finding" — it passes when the policy
//     flags the WRONG node or flags eight where one was meant (wave-1 D1: `server-layout` `mustFlag[0]`
//     tolerated 8 findings from two arms under a one-finding `why`). §4.1: "Name `count` always."
//   M a `messageIncludes` that cannot discriminate — the substring sits inside the static text of the
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
// exactly the conservative direction: an unreadable module produces no finding here, ever.
//
// A conditional (`cond ? "no entry at all" : \`"${t}", not …\``) contributes BOTH branches, which is what makes
// D3 reachable: the substring must be judged against every text one site can emit.
//
// Warning, not error: 60 rows across 20 modules carry no `count` at mint (#1968 owns the burn-down), and the
// finding is the row, so each repair is local. Hard: a proof row cannot waive the check on its own honesty.
import type { CallExpression, ObjectLiteralExpression, PropertyAssignment, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { StaticSegments } from "../contract/policy-descriptor-read.ts";
import {
  contextParameterOf,
  descriptorProperty,
  descriptorValue,
  discriminationOf,
  finalDescriptorOf,
  isContextRooted,
  isMessageProperty,
  isStringTyped,
  objectLiteralOf,
  proofRowsOf,
  reportSiteMessage,
  reportSiteOf,
  staticSegments,
  staticText,
} from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-proof-expectations.ts";

const MESSAGE =
  "a `mustFlag` proof row is under-specified (gate-runtime-standardization.md §4.1): it carries no `expect.count` (the only " +
  "field the conformance runner compares exactly — without it the row passes on the WRONG node and on N findings where one " +
  "was meant), or its `messageIncludes` discriminates nothing, or the row is not a statically readable object literal.";
const NO_COUNT_MESSAGE =
  "`mustFlag` row carries no `expect.count` — `expectationFailure` (ops/policy-conformance.ts) returns early once one finding " +
  "exists, so this row passes when the policy flags the wrong node or flags several where one was meant. Name `count` always (§4.1).";
const TAUTOLOGY_MESSAGE =
  "`messageIncludes` matches every finding this policy can emit — the module has ONE message source and the substring sits in its " +
  "static text, so the row's discrimination claim is empty; `count` (and `token`/`line`) carry the row. Drop it or add a second message shape (§4.1).";
const SHARED_MESSAGE =
  "`messageIncludes` is contained in the static text of MORE THAN ONE of this module's message sources, so it cannot tell the arm the " +
  'row is about from its sibling (the `"not"`-matches-both-arms shape). Pick a substring only the intended message carries.';
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
  readonly sources: readonly (readonly string[])[];
  readonly unreadable: number;
}

interface CensusState {
  readonly sources: Map<string, readonly string[]>;
  unreadable: number;
  /** Some report site omits its message, so the descriptor's own `message` is a live source. */
  bare: boolean;
}

function addText(state: CensusState, text: StaticSegments | undefined): void {
  if (text === undefined || text.segments.length === 0) {
    state.unreadable += 1;
  } else {
    state.sources.set(JSON.stringify(text.segments), text.segments);
  }
}

function censusSite(state: CensusState, call: CallExpression): void {
  const provenance = reportSiteMessage(call);
  if (provenance.kind === "policy") {
    state.bare = true;
  } else {
    addText(state, provenance.kind === "override" ? provenance.text : undefined);
  }
}

/** A call that receives the context or its sink may report on the module's behalf with the strings it was
 *  handed (`lib/tenancy-scope.ts:97`); every string-typed argument is a possible message. */
function censusEscape(state: CensusState, call: CallExpression): void {
  for (const argument of call.getArguments()) {
    if (isStringTyped(argument)) {
      addText(state, staticSegments(argument));
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
      addText(state, staticSegments(initializer));
    }
  }
  if (state.bare) {
    const own = descriptorValue(descriptor, "message");
    addText(state, own === undefined ? undefined : staticSegments(own));
  }
  return { sources: [...state.sources.values()], unreadable: state.unreadable };
}

/** Arms C and M over ONE `mustFlag` row. */
function judgeRow(ctx: GatePolicyContext, row: ObjectLiteralExpression, census: MessageCensus): void {
  const expectation = objectLiteralOf(descriptorValue(row, "expect"));
  if (expectation === undefined || expectation.getProperty("count") === undefined) {
    ctx.report.node(row, { message: NO_COUNT_MESSAGE });
  }
  const includes = expectation === undefined ? undefined : descriptorProperty(expectation, "messageIncludes");
  const substring = includes === undefined ? undefined : staticText(includes.getInitializer());
  if (includes === undefined || substring === undefined) {
    return;
  }
  const verdict = discriminationOf(substring, census.sources, census.unreadable);
  if (verdict === "tautology") {
    ctx.report.node(includes, { token: "messageIncludes", offset: 0, message: TAUTOLOGY_MESSAGE });
  } else if (verdict === "shared") {
    ctx.report.node(includes, { token: "messageIncludes", offset: 0, message: SHARED_MESSAGE });
  }
}

function judgeModule(ctx: GatePolicyContext, descriptor: ObjectLiteralExpression, walk: ModuleWalk): void {
  const rows = proofRowsOf(descriptorValue(descriptor, "mustFlag"));
  for (const node of rows.unreadable) {
    ctx.report.node(node, { message: UNREADABLE_ROW_MESSAGE });
  }
  const census = messageCensus(descriptor, walk);
  for (const row of rows.rows) {
    judgeRow(ctx, row, census);
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

export const gate = defineGate({
  id: "policy-proof-expectations",
  family: "policy-soundness",
  authority: "hard",
  severity: "warning",
  workItem: 1968,
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
            judgeModule(ctx, descriptor, walkOf(walks, sourceFile));
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
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: (ctx) => ({ visitors: [{ kinds: [1], visit: (node) => ctx.report.node(node) }] }),\n  mustFlag: rows(),`,
          'function rows(): unknown[] {\n  return [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }];\n}\n',
        ),
      ),
      expect: { count: 1, token: "rows", messageIncludes: "not a statically readable" },
      why: "U a row set produced by a CALL cannot be read by any reader — §12.1's explicit-fixture rule, pinned at zero live cases",
    },
  ],
  mustPass: [
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
      why: "M the conditional's OTHER branch: `no entry at all` appears in one branch of one site and nowhere else, so it discriminates — the same module D3's row lives in, judged correctly on its honest sibling row",
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
      files: familyFixture(
        'export const gate = { name: "probe", docRow: "x", message: "m", mustFlag: [{ files: { "x.ts": "x" }, why: "w" }], mustPass: [1] };\n',
      ),
      why: "SCOPE: a legacy descriptor's examples run through the legacy runtime, whose expectation shape is its own — this family reads the final contract only",
    },
  ],
});
