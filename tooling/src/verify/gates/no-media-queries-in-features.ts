// Gate: no-media-queries-in-features (UI-Architecture-and-Layout.md §4b) — a viewport breakpoint variant
// (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`, their `min-`/`max-` twins, and the arbitrary `min-[…]:`/`max-[…]:` forms)
// is banned in client/ui source: a feature adapts to its CONTAINER, not the viewport. The ONE legal home for
// viewport `@media` is `features/app-shell`, and that home is a POPULATION exclusion (`notUnder`) rather than
// a visit-time predicate — the non-lossy port of the legacy `scanRoot`'s subtraction, pinned by the
// `allowed in app-shell` mustPass row (delete the `notUnder` and that row goes red).
//
// FAMILY: SINGLETON (`no-media-queries-in-features`). The concept has a real sibling —
// `no-pointer-variants-in-features` bans the device-CAPABILITY variants this module's `MEDIA_QUERY_RE` never
// matched, and its own header names this gate as its twin — but that module is still a LEGACY `GateDescriptor`
// with no `family` field, and the two share no `lib/` reader today (it consumes `lib/sanctioned-home.ts`; this
// one consumes nothing). There is no family to join yet; the merge point is that module's conversion, and the
// shared string to adopt then is a decision for that lane, not a name minted unilaterally here.
//
// THE SCAN IS UNFENCED, AND THE MESSAGE SAYS SO (#1954 class, re-derived 2026-09-11). The visitor reads EVERY
// `StringLiteral`/`NoSubstitutionTemplateLiteral` in the declared population — there is no `className` carrier
// fence and no `features/` path fence, so the legacy message's "in a feature className" was a context clause
// the code never applied (the same defect `no-raw-container-widths` carried; the same resolution — make the
// message context-free and PIN the unfenced scan with a non-JSX `mustFlag` row — is applied here). The
// behaviour is the byte-identical legacy behaviour; only the claim changed.
//
// THE REPORTED POSITION is supplied, not derived: `bannedMediaQueryTokens` hands the sink the offending
// whitespace-delimited class token and its offset inside the literal, so a waiver names THAT token
// (`md:flex-row`), never the whole string and never the bare variant. `fix` states the spelling.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "viewport breakpoint variant (sm:/md:/lg:/xl:/2xl:, their min-/max- twins, or an arbitrary min-[…]:/max-[…]:) in a packages/{client,ui}/src string literal — a feature adapts to its CONTAINER, not the viewport: use a `@container` variant (@md:) or `<Container size>`. Viewport `@media` lives only in features/app-shell. The scan is UNFENCED: every string literal and untagged template in the population is read, not only a className. See docs/architecture/core/UI-Architecture-and-Layout.md §4b.";

const MEDIA_QUERY_RE = /^(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\]]+\]):/u;
const WHITESPACE_RE = /\s+/u;

interface BannedMediaQuery {
  readonly token: string;
  readonly offset: number;
}

function bannedMediaQueryTokens(nodeText: string): BannedMediaQuery[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedMediaQuery[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && MEDIA_QUERY_RE.test(part)) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

export const gate = defineGate({
  id: "no-media-queries-in-features",
  family: "no-media-queries-in-features",
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
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node) => {
          const hits = bannedMediaQueryTokens(node.getText());
          for (const hit of hits) {
            ctx.report.node(node, hit);
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
