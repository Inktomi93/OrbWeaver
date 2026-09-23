// Gate: no-media-queries-in-features (UI-Architecture-and-Layout.md §4b) — a viewport breakpoint variant
// (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`, their `min-`/`max-` twins, and the arbitrary `min-[…]:`/`max-[…]:` forms)
// is banned in client/ui source: a feature adapts to its CONTAINER, not the viewport. The ONE legal home for
// viewport `@media` is `features/app-shell`, and that home is a POPULATION exclusion (`notUnder`) rather than
// a visit-time predicate — the non-lossy port of the legacy `scanRoot`'s subtraction, pinned by the
// `allowed in app-shell` mustPass row (delete the `notUnder` and that row goes red).
//
// FAMILY: tailwind-class-token. Shared lexical tokenization owns authored offsets; this policy
// owns the viewport vocabulary and its existing population. Pointer conversion uses the same reader.
//
// THE SCAN IS UNFENCED, AND THE MESSAGE SAYS SO (#1954 class, re-derived 2026-09-11). The visitor reads EVERY
// string literal and EVERY template text span in the declared population — there is no `className` carrier
// fence and no `features/` path fence, so the legacy message's "in a feature className" was a context clause
// the code never applied (the same defect `no-raw-container-widths` carried; the same resolution — make the
// message context-free and PIN the unfenced scan with a non-JSX `mustFlag` row — is applied here).
//
// THE SUBSTITUTED TEMPLATE WAS A LIVE ESCAPE, AND THE MESSAGE WAS WRONG IN BOTH DIRECTIONS (#1960). A
// template WITH a substitution is not one node: it parses into `TemplateHead`/`TemplateMiddle`/`TemplateTail`
// token nodes, NONE of which is a `NoSubstitutionTemplateLiteral` — so `` `md:flex-row ${v}` `` passed
// silently while the message promised every untagged template was read. The mirror error: a TAGGED template
// (`` tv`md:flex-row` ``) carries an ordinary `NoSubstitutionTemplateLiteral` and always DID flag, while the
// word "untagged" said it did not. Both halves are fixed here: the visitor subscribes to the three template
// span kinds as well, and the message now describes tagging (irrelevant) and substitution (each static span
// read on its own) as the code actually treats them. A class token whose banned VARIANT is composed across
// the substitution (`` `${prefix}:flex-row` ``) is the remaining declared limit — a syntax policy never sees
// an interpolated value — and it has its own `mustPass` row.
//
// THE REPORTED POSITION is supplied, not derived: the shared class-token reader hands the sink the offending
// whitespace-delimited class token and its offset inside the literal SPAN, so a waiver names THAT token
// (`md:flex-row`), never the whole string and never the bare variant. `fix` states the spelling. On a
// substituted template the offset is relative to the span token that carries the text, which is the node the
// finding anchors on — so the waiver position stays the class token either way.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-media-queries-in-features` descriptor at d6f36904fa6946238678e61760888aaf62ba0c93, the parent of the conversion
// `99b7429e2` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,351 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,621 and final `population` admits 1,621. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/client/src/features/app-shell/anchors/__cbbhr_out_region-anchor.tsx` (virtual) rejected by both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readTailwindClassTokens } from "../lib/tailwind-class-token.ts";

const MESSAGE =
  "viewport breakpoint variant (sm:/md:/lg:/xl:/2xl:, their min-/max- twins, or an arbitrary min-[…]:/max-[…]:) in a packages/{client,ui}/src string literal — a feature adapts to its CONTAINER, not the viewport: use a `@container` variant (@md:) or `<Container size>`. Viewport `@media` lives only in features/app-shell. The scan is UNFENCED: every string literal and every template literal in the population is read — tagged or not, and a substituted template one static span at a time — not only a className. See docs/law/UI-Architecture-and-Layout.md §4b.";

const MEDIA_QUERY_RE = /^(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\]]+\]):/u;
export const gate = defineGate({
  id: "no-media-queries-in-features",
  family: "tailwind-class-token",
  authority: "ordinary",
  severity: "error",
  // The legacy predicate admitted @client/@ui and subtracted the whole app-shell subtree (the ONE feature
  // permitted to fork viewport @media) — `notUnder` is the non-lossy replacement for that exclusion.
  population: { in: ["@client", "@ui"], notUnder: ["packages/client/src/features/app-shell/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "use container queries (@md:) or <Container size>. A deliberate viewport variant is waived with " +
    "`// @orb-waive no-media-queries-in-features(<position>): <reason>` on a line above the offending " +
    "statement, where <position> is the OFFENDING CLASS TOKEN itself — the whole whitespace-delimited " +
    "candidate, `md:flex-row`, not the string literal and not the bare `md:` variant. Two banned tokens in " +
    "one class string are two findings with two different positions, and therefore take two markers.",
  create: (ctx) => ({
    visitors: [
      {
        // The three template SPAN kinds are the #1960 widening: a substituted template is never a
        // `NoSubstitutionTemplateLiteral`, so without them `` `md:flex-row ${v}` `` escaped the scan.
        kinds: [
          SyntaxKind.StringLiteral,
          SyntaxKind.NoSubstitutionTemplateLiteral,
          SyntaxKind.TemplateHead,
          SyntaxKind.TemplateMiddle,
          SyntaxKind.TemplateTail,
        ],
        visit: (node) => {
          const hits = readTailwindClassTokens(node.getText()).filter(({ token }) => MEDIA_QUERY_RE.test(token));
          for (const hit of hits) {
            ctx.report.node(node, { token: hit.token, offset: hit.offset });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="md:flex-row" />;\n' },
      expect: { count: 1, token: "md:flex-row" },
      why: "the founding RED: a viewport media query used in a className. `token` pins the SUPPLIED position — the whole class candidate, which is also the waiver position",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/note.ts": 'export const note = "md:flex-row is the shape to avoid";\n' },
      expect: { count: 1, token: "md:flex-row" },
      why: "THE UNFENCED SCAN, pinned (#1954 class): the visitor applies NO className carrier fence, so a banned token in an ordinary string constant flags exactly the same. This row is what makes the context-free message honest — add a carrier fence and this row goes red (planted-break receipt taken 2026-09-11)",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/arbitrary.tsx": 'export const G = <div className="min-[600px]:flex-row" />;\n' },
      expect: { count: 1, token: "min-[600px]:flex-row" },
      why: "the ARBITRARY breakpoint arm of MEDIA_QUERY_RE ((?:min|max)-\\[…\\]:), the escape hatch a named-breakpoint ban alone would leave open. Delete that alternative and this row goes red (planted-break receipt taken 2026-09-11)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/interpolated.tsx": "export const G = (v: string) => <div className={`md:flex-row${v}`} />;\n",
      },
      expect: { count: 1, token: "md:flex-row" },
      why: "#1960, THE LIVE ESCAPE: a template WITH a substitution parses as TemplateHead/Middle/Tail and is never a NoSubstitutionTemplateLiteral, so this produced ZERO findings while the message promised every untagged template was read. The banned class ABUTS the `${`, which also pins `closingWidth` — drop the two-character head/middle close and the reported token becomes `md:flex-row$` and this row goes red (planted-break receipt taken 2026-09-11)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/spans.tsx": "export const G = (a: string, b: string) => <div className={`${a} md:flex-row ${b} lg:hidden`} />;\n",
      },
      expect: { count: 2 },
      why: "#1960: the MIDDLE and TAIL spans of the same template, each read on its own — `md:flex-row` sits in the TemplateMiddle, `lg:hidden` in the TemplateTail. Two findings with distinct position tokens, therefore two separately waivable sites (§4.2's granularity predicate). Subscribe to the head alone and this row drops to 0",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/tagged.ts": "export const c = tv`md:flex-row`;\n" },
      expect: { count: 1, token: "md:flex-row" },
      why: "#1960's MIRROR half: a TAGGED template carries an ordinary NoSubstitutionTemplateLiteral, so it always DID flag — the retired message's word `untagged` claimed otherwise. This row is what makes the corrected message ('tagged or not') honest rather than merely rewritten",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/capped.tsx": 'export const G = <div className="max-lg:hidden" />;\n' },
      expect: { count: 1, token: "max-lg:hidden" },
      why: "the min-/max- PREFIXED named-breakpoint arm. Delete the `(?:max-|min-)?` prefix group and this row goes red (planted-break receipt taken 2026-09-11)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="@md:flex-row" />;\n' },
      why: "container query is allowed",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/composed.tsx": "export const G = (prefix: string) => <div className={`${prefix}:flex-row`} />;\n",
      },
      why: "#1960's DECLARED LIMIT, stated rather than hidden: each static template span is matched on its own, so a banned VARIANT composed across the substitution leaves only `:flex-row` in the tail span and nothing matches. A syntax policy never sees an interpolated value; closing this would need type evaluation, not a wider node subscription. The row exists so the corrected message's 'one static span at a time' is a pinned claim and not a hope",
    },
    {
      mode: "source",
      files: {
        // The app-shell file is excluded from the DECLARED population itself (`notUnder`), so it is never
        // visited — a companion in-population file keeps the fixture's admitted set nonempty.
        "packages/client/src/features/app-shell/x.tsx": 'export const G = <div className="md:flex-row" />;\n',
        "packages/client/src/features/y/clean.tsx": 'export const G = <div className="flex-row" />;\n',
      },
      why: "allowed in app-shell",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/waived.tsx":
          "// @orb-waive no-media-queries-in-features(md:flex-row): the proof's stand-in reason and its end condition.\n" +
          'export const G = <div className="md:flex-row" />;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the SUPPLIED position (the whole class candidate) suppresses the twin of mustFlag[0] — one finding, one marker, zero effective findings and zero authority alarms. A wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
