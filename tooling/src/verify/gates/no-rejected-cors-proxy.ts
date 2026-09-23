// Policy: no-rejected-cors-proxy (D61 / B5a) — the `corsproxy.io` half of the old
// `no-raw-egress` module, split off because its AUTHORITY is different. Routing egress through the
// named-rejected third-party CORS proxy was decided against in D61; there is no home that may do it and
// no occurrence that could earn a marker, so the policy is HARD and carries no suppression door at all.
// The raw-`fetch` half is `no-raw-egress` (reviewed-grant), and one descriptor cannot hold both.
//
// The subject is a LITERAL, not an identity: the point of the rule is that the host cannot be SPELLED in
// server source, in a string or in any part of a template. THAT SENTENCE IS A CLAIM THE ROWS CARRY, not
// prose: `STRING_KINDS` subscribes five literal node kinds and each one has its own `mustFlag` row —
// `StringLiteral` (mF0), `TemplateHead` (mF1), `NoSubstitutionTemplateLiteral` (mF2), `TemplateMiddle`
// (mF3) and `TemplateTail` (mF4) — so dropping a kind from the list reds a row rather than silently
// narrowing the ban to the spellings someone happened to fixture. Comments are outside the subject because
// only literal nodes are delivered — a header explaining why the proxy is banned must stay writable.
//
// POPULATION PORT: byte-identical to the legacy `no-raw-egress` scan root, `packages/server/src` = `@server`.
// The host is banned in SERVER source because that is where egress happens; a `corsproxy.io` string in the
// client is a different question this policy does not answer, and `mustPass[2]` is the row that dies if the
// population is ever widened.
//
// §4.6 SPLIT DIFFERENTIAL (#2000, committed at `tests/tooling/verify/gates/split-arm-parity.test.ts`).
// LEGACY-SIDE COVERAGE OF THIS ARM: 1 of the parent's 9 examples — `no-raw-egress` mustFlag[1], a
// StringLiteral. The other four subscribed literal kinds had ZERO legacy coverage, so their rows are
// CONSTRUCTED from `STRING_KINDS` rather than replayed. ONE finding difference, and it is deliberate:
// legacy subscribed `CallExpression` for its fetch half and then ran a TEXT test over every non-fetch
// call, so a call whose source text carried the host was reported TWICE — once on the call node, once on
// the literal inside it. Dropping that subscription makes the site ONE finding. Populations are equal;
// the only tool-error delta is the runtime refusing a fixture that admits zero `@server` paths.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-raw-egress` descriptor at 5dd83aaa42c85c361d321fe56bf13063c93edf17, the parent of the conversion `4885cde80`;
// this module did not exist there, so it is measured against the module it was carved from, `no-raw-egress` (blob
// read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,263 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,492
// and final `population` admits 1,492. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
//
// FAMILY `no-raw-egress` — a SPLIT (by authority) from the excluded-lane `no-raw-egress`, and the string is NOT
// backed by a shared `lib/` dependency: measured, this module imports nothing from `lib/`. That is the §2 /
// `policy-family-readers` (#2187) finding shape, recorded rather than dressed as a reader.
import type { Node as MorphNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const CORSPROXY = "corsproxy.io";

const STRING_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
];

const MESSAGE =
  "`corsproxy.io` spelled in server source — the NAMED-REJECTED third-party CORS proxy (D61 B5a). Egress " +
  "never routes through it: a third party would see every URL, header and body the server sends. See " +
  "docs/adr/0061-marinara-borrow-dispositions.md (B5a).";
const FIX = "delete the proxy host; route the request through `safeFetch` (infra/network) directly to the real origin.";

/** The TemplateHead proof row's fixture source. It must carry a real interpolation, so the placeholder
 *  rule is suppressed on the one line that holds it. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a proof string — a real TemplateHead node is exactly what the row exercises.
const TEMPLATE_FIXTURE = "export const proxy = (url: string): string => `https://corsproxy.io/?url=${url}`;\n";

/** The TemplateMiddle row's fixture: two interpolations, so the host lands in a quasi that is neither the
 *  head nor the tail — the only spelling that exercises `SyntaxKind.TemplateMiddle`. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a proof string — a real TemplateMiddle node is exactly what the row exercises.
const TEMPLATE_MIDDLE_FIXTURE = "export const proxy = (scheme: string, url: string): string => `${scheme}://corsproxy.io/?url=${url}`;\n";

/** The TemplateTail row's fixture: one interpolation with the host AFTER it, so the host lands in the
 *  closing quasi — `SyntaxKind.TemplateTail`. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a proof string — a real TemplateTail node is exactly what the row exercises.
const TEMPLATE_TAIL_FIXTURE = "export const proxy = (scheme: string): string => `${scheme}://corsproxy.io/?url=`;\n";

/** The offset of the banned host inside this literal's own authored text, or -1. */
function bannedOffset(node: MorphNode): number {
  return node.getText().indexOf(CORSPROXY);
}

export const gate = defineGate({
  id: "no-rejected-cors-proxy",
  family: "no-raw-egress",
  authority: "hard",
  severity: "error",
  // `@inference` ADDED 2026-09-20 (lane cb-gate-reach, the §12 EXTRACTION AUDIT of
  // `docs/design/orbweaver-inference-package.md`). ~104 source files left `packages/server/src/infra/providers/`
  // for the new `@orb/inference` workspace package, and every `@server`-scoped policy stopped judging them the
  // day they moved, silently. This is the HARD half of D61/B5a — no home may spell the rejected third-party CORS proxy, and there is no
  // waiver door at all. Its sibling `no-raw-egress` is widened in the same commit for the same reason: the
  // tree's egress surface is inside this package now. Measured at the widening: ZERO findings.
  population: { in: ["@server", "@inference"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: STRING_KINDS,
        visit: (node): void => {
          const offset = bannedOffset(node);
          if (offset >= 0) {
            ctx.report.node(node, { token: CORSPROXY, offset, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/x.ts": 'export const proxy = "https://corsproxy.io/?url=";\n' },
      expect: { count: 1, token: CORSPROXY },
      why: "the founding shape — the rejected proxy spelled as a string literal anywhere in server source",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/tpl.ts": TEMPLATE_FIXTURE },
      expect: { count: 1, token: CORSPROXY },
      why: "the TEMPLATE spelling: the host lives in the head quasi, which is a different node kind and the same ban",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/backtick.ts": "export const proxy = `https://corsproxy.io/?url=`;\n" },
      expect: { count: 1, token: CORSPROXY },
      why: "THE BACKTICK SPELLING WITH NO INTERPOLATION is a `NoSubstitutionTemplateLiteral`, not a `StringLiteral` — a fourth node kind, subscribed by `STRING_KINDS` and, before this row, proven by nothing. Dropping that member from the list turns this row red",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/middle.ts": TEMPLATE_MIDDLE_FIXTURE },
      expect: { count: 1, token: CORSPROXY },
      why: '`TemplateMiddle` — the host in a quasi that is neither head nor tail, which is the literal reading of the header\'s "in any part of a template". Dropping `TemplateMiddle` from `STRING_KINDS` turns this row red and leaves every other row green',
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/tail.ts": TEMPLATE_TAIL_FIXTURE },
      expect: { count: 1, token: CORSPROXY },
      why: '`TemplateTail` — the host in the closing quasi, the fifth and last subscribed kind. With this row the header\'s "in any part of a template" is a pinned claim rather than a sentence: every member of `STRING_KINDS` now has exactly one row that dies without it',
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/ok.ts": 'export const origin = "https://example.test/?url=";\n' },
      why: "an unrelated origin literal is not the banned host",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/why.ts": "// D61 rejected routing egress through a third-party CORS proxy.\nexport const proxy = null;\n" },
      why: "A COMMENT NAMING THE BAN IS NOT A VIOLATION — only literal nodes are delivered, so the header that explains the ruling stays writable. Written as a row because a text scan would have flagged it",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/lib/anchor.ts": 'export const origin = "https://example.test/";\n',
        "packages/client/src/features/x/proxy.ts": 'export const proxy = "https://corsproxy.io/?url=";\n',
      },
      why: "THE POPULATION FENCE: the identical literal from `mustFlag[0]`, moved to `@client`, produces nothing — this policy judges SERVER source, which is where egress happens. The server anchor is load-bearing: a fixture holding only the client file admits zero paths and the run comes back a `[population]` TOOL ERROR rather than a finding. Widen `population` to `@authored` and this is the row that dies",
    },
  ],
});
