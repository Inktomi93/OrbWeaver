// Gate: no-raw-typography-in-features (UI-Architecture-and-Layout.md) — raw font-size utilities are banned
// in client/ui source; compose from the layout primitives + intent tokens instead.
//
// THE ALLOWLIST IS A TIER PERMISSION, NOT A BURN-DOWN LIST: `packages/ui/src/layout/` and
// `packages/ui/src/markdown/` are the primitives that IMPLEMENT the intent tokens, so they may spell the
// raw utility. SCAN-AND-ALLOWLIST (tooling/src/verify/gates/GATE-AUTHORING.md §3, 2026-08-22): those homes are SCANNED and exempted
// by cited rows, not scoped out of the population, and the RENAME TRIPWIRE is the ONE shared implementation
// (lib/sanctioned-home.ts) instead of a hand-rolled sweep re-spelled in four sibling gates. The tripwire is
// a SEPARATE policy in this same family (`typography-tier-home-health`) because the occurrence check below
// is per-file/incremental-safe while the tripwire needs the entire declared population to know whether a
// home resolved to zero files — one `execution` value cannot serve both.
//
// THE CARRIER FENCE IS REAL, AND THE MESSAGE'S "in className" IS THEREFORE EARNED (re-derived 2026-09-11,
// #1954, against the `no-color-literals` finding that a header may not claim a context its visitor never
// applies). `inClassCarrier` below IS applied on every hit, and it admits two carriers: a `className` JSX
// attribute and a class-composer call (`cn`/`clsx`/`cva`/`tv`) — so the `tv()` variant maps that made an
// ancestry fence wrong for `no-color-literals` are INSIDE this fence, not blinded by it. The fence is pinned
// in both directions: the `cn(…)` mustFlag row proves the composer arm bites, and the bare-constant mustPass
// row proves an uncarried string does not. Deleting either leaves the header's claim unproven. RE-VERIFIED
// 2026-09-11 (#1584 pristine pass) by the two-command narrowing test the claim asks for: with
// `inClassCarrier(node)` deleted from the visitor, `mustPass[2]` goes red and conformance reports 1 failure.
// The message now names BOTH admitted carriers rather than only the attribute, because a `cn(…)` argument is
// not a `className` and the mustFlag row above proves that arm bites.
//
// THE REPORTED POSITION is the WHOLE QUOTED LITERAL (`token: text, offset: 0` — `text` is `node.getText()`,
// which INCLUDES the quotes), so a waiver names `"text-sm"`, quotes and all; `fix` states the spelling.
//
// The legacy `no-raw-typography-in-features` descriptor (d6f36904fa6946238678e61760888aaf62ba0c93) ran a
// hand-rolled allowlist sweep before this migration moved the raw-CSS-literal-in-features family onto
// the shared `lib/sanctioned-home.ts` reader. That sha is the CONVERSION PARENT, verified rather than
// assumed: `git log -S 'defineGate({' --reverse -- <this file>` gives `99b7429e2`, and
// `git rev-parse 99b7429e2^` IS `d6f36904fa6946238678e61760888aaf62ba0c93`, whose blob has `defineGate`
// count 0. It is spelled here in the 40-char form without a caret, which is one of the spellings a
// length-pinned census pattern drops.
//
// FAMILY `raw-typography-tier` — a two-member SPLIT family with TWO shared `lib/` modules that are
// different kinds of thing, as the `-health` twin's header states in full: the shared READER is
// `lib/sanctioned-home.ts` (`sanctionedHome` here, `unresolvedSanctionedHomeKeys` there) and the shared
// TABLE is `lib/raw-typography-tier.ts#TIER_IMPLEMENTATION_HOMES`. The table moved out of THIS module on 2026-09-12
// because the twin used to import it from here, which #2096 / §12.3 banned.
// POPULATION PORT: byte-identical. The legacy `scanRoot: (p) => SCOPE_REGEX.test(`/${p}`)` with
// `SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//` becomes `["@client", "@ui"]` =
// `packages/client/src/` + `packages/ui/src/`. The only change is that a regex matching the segment
// ANYWHERE in a path becomes two anchored roots, and that distinction is empty on this tree: 1324 tracked
// paths contain `packages/client/src/` and the same 1324 begin with it; 399 and 399 for
// `packages/ui/src/`. The sanctioned tier home stays SCANNED rather than scoped out, exactly as
// legacy had it — an excluded home carries its exemption silently through a rename.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-raw-typography-in-features` descriptor at d6f36904fa6946238678e61760888aaf62ba0c93, the parent of the
// conversion `99b7429e2` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,351 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// `scanRoot` admits 1,685 and final `population` admits 1,685. legacy − final = ∅. final − legacy = ∅. Controls:
// inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { TIER_IMPLEMENTATION_HOMES } from "../lib/raw-typography-tier.ts";
import { sanctionedHome } from "../lib/sanctioned-home.ts";

/** The CARRIER FENCE (tooling/src/verify/gates/GATE-AUTHORING.md §5): only a className attribute or a class-composer call
 *  (`cn`/`clsx`/`cva`/`tv`) counts as a class string for this ambiguous token shape. */
const CLASS_COMPOSERS: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);

function inClassCarrier(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const callExpr = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return callExpr !== undefined && CLASS_COMPOSERS.has(callExpr.getExpression().getText());
}

const MESSAGE =
  "raw font-size utility in a class string (a `className` attribute or a `cn`/`clsx`/`cva`/`tv` call) — use a typography intent token (text-micro, text-label, text-body, text-hint, text-mono-tag). See docs/architecture/core/UI-Architecture-and-Layout.md.";

const TYPOGRAPHY_REGEX = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[[^\]]+\])/u;

export const gate = defineGate({
  id: "no-raw-typography-in-features",
  family: "raw-typography-tier",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "Use a typography intent token instead of raw text-size classes. A deliberate raw utility is waived with " +
    "`// @orb-waive no-raw-typography-in-features(<position>): <reason>` on a line above the offending " +
    'statement, where <position> is the WHOLE QUOTED LITERAL INCLUDING ITS QUOTES — `"text-sm"`, not text-sm ' +
    "and not the class token inside a longer string. One literal is one finding, so one marker suffices.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node, sourceFile) => {
          if (sanctionedHome(TIER_IMPLEMENTATION_HOMES, ctx.relativePath(sourceFile)) !== undefined) {
            return;
          }
          const text = node.getText();
          if (TYPOGRAPHY_REGEX.test(text) && inClassCarrier(node)) {
            ctx.report.node(node, { token: text, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="text-sm" />;' },
      expect: { count: 1, token: '"text-sm"' },
      why: "raw typography class in className",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const y = cn("text-xl", "font-bold");' },
      expect: { count: 1, token: '"text-xl"' },
      why: "raw typography class in cn",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/layout/test.tsx": 'const x = <div className="text-sm" />;' },
      why: "THE TIER-HOME TABLE ITSELF: the layout tier is now SCANNED, and its raw utility passes only because a cited TIER_IMPLEMENTATION_HOMES row covers it",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="text-body" />;' },
      why: "valid intent token",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.ts": 'export const label = "text-sm rendering of the size in prose";' },
      why: "THE CARRIER FENCE (#1954): the exact banned utility `text-sm`, in an ordinary string constant with no className attribute and no cn/clsx/cva/tv call above it, does NOT flag. This is the pin for the header's fenced claim and for the message's class-string wording — drop `inClassCarrier` and this row goes red instead of the claim silently becoming false. VERIFIED 2026-09-11: the deletion reds exactly this row.",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/test.tsx":
          '// @orb-waive no-raw-typography-in-features("text-sm"): a stand-in reason and its end condition.\nconst x = <div className="text-sm" />;\n',
      },
      why: 'THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the SUPPLIED position — the whole quoted literal `"text-sm"`, quotes included, because the report passes `token: node.getText()` — suppresses the twin of mustFlag[0]. One finding, one marker, zero effective findings and zero authority alarms; a wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`',
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div title="text-sm" />;' },
      why: 'THE className ATTRIBUTE-IDENTITY HALF (v-audit-wave4 D1): the banned utility inside a NON-className JSX attribute must not flag — `inClassCarrier` requires the attribute name to be exactly `className`, not merely `jsxAttr !== undefined`. Narrowing `=== "className"` to any JSX attribute reds this row.',
    },
    {
      mode: "source",
      files: { "packages/client/src/test.ts": 'describe("text-sm sizing helper");' },
      why: "THE CLASS_COMPOSERS-MEMBERSHIP HALF (v-audit-wave4 D1): the banned utility as an argument to an ARBITRARY call (`describe`, not `cn`/`clsx`/`cva`/`tv`) must not flag — `inClassCarrier` requires the callee to be a member of `CLASS_COMPOSERS`, not merely `callExpr !== undefined`. Widening the composer check to any call expression reds this row.",
    },
  ],
});
