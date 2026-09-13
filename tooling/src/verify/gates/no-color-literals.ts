// Gate: no-color-literals (D43, UI-Architecture-and-Layout.md, UI-Gates-and-Lessons.md §11.4). Three
// patterns — a named non-token color, a Tailwind palette scale, an arbitrary hex — banned anywhere they
// can reach the DOM as a class.
//
// THE SCAN IS UNFENCED FOR ALL THREE PATTERNS (decided 2026-09-11, #1954): the visitor subscribes to every
// StringLiteral / NoSubstitutionTemplateLiteral in the population and applies no className/cn() ancestry
// test to any pattern. That is deliberate, not an oversight — in this repo the majority of class strings
// never appear in a `className=` attribute at all: they live in `tv()` variant maps, `cva`-style records,
// `cn()` argument lists and plain exported constants, and a JSX-carrier fence would blind the gate to
// exactly that surface. The header used to single PALETTE_RE out as "UNFENCED" while MESSAGE_NON_TOKEN and
// MESSAGE_HEX asserted the hit was "in className" — a context nothing ever verified. The messages are now
// context-free; the unfenced behaviour is pinned by the non-JSX mustFlag row below.
//
// THAT SENTENCE USED TO CITE A REAL-TREE PIN, AND THE CITATION IS DEAD (#1974, 2026-09-11). It named
// tests/tooling/gate-ignore-grammar.repo.int.test.ts, "whose whole six-case probe rests on this gate
// biting a bare exported `bg-black` class constant under packages/ui/src". That suite exercises the LEGACY
// `@orb-gate-ignore` engine, and marker routing is FENCED (docs/design/gate-runtime-standardization.md
// §7): its carriers must be LEGACY gates BY REQUIREMENT. This module converted at `99b7429e2`, left the
// legacy roster, and took that pin with it — the suite went RED, unrun for days because tests/tooling/**
// is `--full`-only (#1842), and has since been re-pointed at a still-legacy carrier. This module's own
// receipt is its `defineGate` proof rows on `structure:policy-conformance` plus its family test; do not
// re-add a real-tree citation to a suite whose subject is the engine this policy no longer uses.
//
// FAMILY: a declared SINGLETON under its own id. It shares its "split a class string into whitespace
// fragments and classify each" SHAPE with `no-raw-container-widths` and `no-off-token-radius-shadow`, but
// each owns a private, disjoint token vocabulary and none shares a `lib/` reader — a shape is not a family.
// POPULATION PORT: BYTE-IDENTICAL. The legacy descriptor at `d6f36904f` (the commit before the conversion
// at `99b7429e2`) scanned `p.startsWith("packages/client/src") || p.startsWith("packages/ui/src")`, which
// is exactly `["@client", "@ui"]`; nothing is added and nothing is subtracted.
//
// §4.6 DIFFERENTIAL — LANDED AS A COMMITTED TEST 2026-09-13 (#2273):
// `tests/tooling/verify/gates/no-color-literals-parity.test.ts`. `99b7429e2` stated none and this module
// is on NO close-by-rule roster, so §4.6 (#2000) left it silent; the replay is the record, and it is the
// NON-VACUOUS arm rather than a real-corpus count, because the legacy descriptor at `d6f36904f` is a pure
// AST visitor with ZERO filesystem reach and `tests/support/legacy-differential.ts` therefore accepts it.
//   · FINDINGS. 5 on the LEGACY side across 4 of the 6 legacy examples, 5 on the FINAL side, same files,
//     same lines, same tokens, one per offending fragment — so neither of §4.6's vacuity shapes applies.
//   · POPULATIONS. 1 = 1 on every example. · TOOL ERRORS. Empty on both engines, every example.
//   · THE ONE CLASSIFIED DIFFERENCE IS A STRENGTHENING NOBODY HAD RECORDED, and it is not the #1991
//     policy-level-message story: `lib/pass.ts:243`'s NODE report path pushes `{file, line, column, token}`
//     and structurally DISCARDS a per-finding message, so the legacy module's `MESSAGE_PALETTE` and
//     `MESSAGE_NON_TOKEN` were UNREACHABLE DEAD TEXT — every finding it ever emitted, whichever arm fired,
//     carried the gate-level `MESSAGE_HEX`. The three arms are distinct only on this side of the
//     conversion. The class is EMPTY on today's legacy roster: a two-method census of the 39 surviving
//     legacy gate modules returns zero, with this frozen blob as the positive control that finds the shape.
//   · CLOSE-BY-RULE, MEASURED: `tier3-close-by-rule.test.ts` refuses this module on EXACTLY ONE clause —
//     clause 6's LABEL half, one re-authored `why` on `mustPass[1]`. All twelve legacy fixture payload
//     literals are carried byte-for-byte and every other clause passes. Do NOT re-author that `why` back
//     to buy roster membership: the replay is strictly stronger than the row would have been.
//
// The cost is accepted: a non-class string that happens to spell `bg-black` or `text-red-500` is a false
// positive. This policy is ORDINARY precisely so that case has a door — `@orb-waive no-color-literals(<the
// offending token>): <reason>` — and the position token is the offending class fragment, not the literal.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

// THE THREE ARM MESSAGES ARE THE DIAGNOSTIC; THE POLICY `message` IS THE HEADER (#1991, 2026-09-11).
// This policy flags three DISJOINT patterns and reports a per-finding message for each, but it used to
// DECLARE `message: MESSAGE_HEX` — and the policy-level message is what `lib/render.ts` prints as the group
// header above a run's occurrence lines, so a palette-only or black/white-only run handed its author the
// HEX remedy. §5b.2 makes "the message is TRUE of what the code flags" unconditional, so the declared
// message is now an umbrella that is true of all three arms and names all three remedies.
//
// THE FOUR STRINGS ARE KEPT DISJOINT ON PURPOSE. `expectationFailure` matches `messageIncludes` against
// `finding.message ?? policyMessage` (ops/policy-conformance.ts), so a needle drawn from one arm must not
// appear in another — building one arm as `${OTHER} …`, or letting the umbrella quote an arm's opening
// clause verbatim, defeats the discriminator in BOTH directions and makes every arm unpinnable. The
// discriminating needles are the three opening clauses below ("named non-token color class",
// "Tailwind PALETTE-scale color class", "arbitrary hex color class"); each `mustFlag` row names its own,
// and the transplant control in the family test proves a sibling's needle does NOT match.
const MESSAGE_POLICY =
  "a hardcoded color class — all three banned shapes bypass the theme, and EACH FINDING CARRIES ITS OWN REMEDY: black/white literals (bg-black → bg-backdrop, or a token), Tailwind numeric ramps (text-red-500 → text-destructive / text-success / bg-primary), and bracket hexes (bg-[#0a0a0a] → a theme.css token). D43 / UI-Architecture-and-Layout.md / UI-Gates-and-Lessons.md §11.4.";
const MESSAGE_NON_TOKEN =
  "named non-token color class (bg-black/bg-white/…-black/…-white) — D43 / UI-Gates-and-Lessons.md §11.4: use a theme token; for overlays use bg-backdrop (a bg-black/50 scrim is invisible on a true-black theme).";
const MESSAGE_HEX =
  "arbitrary hex color class (…-[#rrggbb]) — use a design token from theme.css (bg-card, text-foreground, text-success, text-destructive, etc.). Theme switching breaks with literal hex. See docs/architecture/core/UI-Architecture-and-Layout.md.";
const MESSAGE_PALETTE =
  "Tailwind PALETTE-scale color class (e.g. text-red-500 / bg-blue-300) — D43 / UI-Architecture-and-Layout.md: a hardcoded palette scale bypasses the theme; use a semantic token (text-destructive, text-success, bg-primary, border-border, …). Theme switching + a true-black theme both break with a fixed palette step.";

const NON_TOKEN_RE = /\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b/u;
// Tailwind's built-in palette scales (the 22 named ramps × a 50–950 step) — never a semantic token, which
// has no numeric step (bg-primary, text-foreground). The `-<ramp>-<step>` shape is self-identifying, which
// is why this pattern carries the lowest false-positive cost of the three; the scan itself is unfenced for
// all three (see the module header).
const PALETTE_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b/u;
const HEX_RE = /-\[#[0-9a-fA-F]{3,8}\]/u;
const WHITESPACE_RE = /\s+/u;

interface BannedColor {
  readonly token: string;
  readonly offset: number;
  readonly message: string;
}

function bannedColorTokens(nodeText: string): BannedColor[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedColor[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0) {
      if (NON_TOKEN_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_NON_TOKEN });
      } else if (PALETTE_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_PALETTE });
      } else if (HEX_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_HEX });
      }
    }
  }
  return out;
}

export const gate = defineGate({
  id: "no-color-literals",
  family: "no-color-literals",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE_POLICY,
  fix:
    "use a design token (bg-card, text-foreground, text-success, text-destructive) — the per-finding message " +
    "names the remedy for the arm that fired. A deliberate literal is waived with " +
    "`// @orb-waive no-color-literals(<position>): <reason>` on a line above the offending statement, where " +
    "<position> is the OFFENDING CLASS FRAGMENT alone — `bg-black`, `text-red-500`, `text-[#abc]` — never the " +
    "quoted literal that contains it. One fragment is one finding, so a class string carrying two banned " +
    "fragments takes two markers.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node) => {
          const hits = bannedColorTokens(node.getText());
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
      files: { "packages/client/src/x.tsx": 'export const G = <div className="text-[#abc]" />;\n' },
      expect: { count: 1, token: "text-[#abc]", messageIncludes: "arbitrary hex color class" },
      why: "arbitrary hex color — pinned to the HEX arm's own message (#1991). Without the needle this row passed identically when the hex fixture was swapped for a palette class, because the count is 1 either way and the policy-level message was MESSAGE_HEX",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const G = <div className="bg-black" />;\n' },
      expect: { count: 1, token: "bg-black", messageIncludes: "named non-token color class" },
      why: "named non-token color — pinned to the NON-TOKEN arm's own message, which no sibling arm emits",
    },
    {
      mode: "source",
      files: { "packages/client/src/palette.tsx": 'export const G = <div className="text-red-500" />;\n' },
      expect: { count: 1, token: "text-red-500", messageIncludes: "Tailwind PALETTE-scale color class" },
      why: "a Tailwind palette scale (text-red-500) — the tighten's new arm: a fixed palette step bypasses the theme, RED. The needle is the PALETTE arm's own message, so a hex/non-token regression cannot satisfy this row",
    },
    {
      mode: "source",
      files: { "packages/ui/src/palette-multi.tsx": 'export const G = <div className="rounded-md border bg-blue-300/50 ring-emerald-600" />;\n' },
      expect: { count: 2, token: "bg-blue-300/50", messageIncludes: "Tailwind PALETTE-scale color class" },
      why: "two palette-scale tokens (bg-blue-300/50 with an opacity step + ring-emerald-600) in one className — one finding PER offending token, RED. `token` + `messageIncludes` are matched against ONE finding, so this also pins that the opacity-suffixed fragment (not the bare ramp) is the reported position",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/variants.ts": 'export const badge = { variants: { tone: { danger: "bg-red-500 text-white", ghost: "text-[#abc]" } } };\n',
      },
      expect: { count: 3, token: "bg-red-500", messageIncludes: "Tailwind PALETTE-scale color class" },
      why: "THE UNFENCED DECISION (#1954): a tv()-style variant map in a .ts file — no JSX, no className attribute, no cn() call anywhere — and ALL THREE patterns still bite (palette bg-red-500, non-token text-white, hex text-[#abc]). This is where most class strings in this repo actually live, so a className/cn ancestry fence would be a hole, not a narrowing; the messages must therefore not assert a className context. `count: 3` is what pins all three arms firing here; the per-arm message discrimination lives in the three single-pattern rows above, because one `expect` can name only one finding's message",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/ok.tsx": 'export const G = <div className="text-foreground" />;\n' },
      why: "design token",
    },
    {
      mode: "source",
      files: { "packages/client/src/ok-semantic.tsx": 'export const G = <div className="bg-primary text-muted-foreground border-border" />;\n' },
      why: "semantic theme tokens (bg-primary / text-muted-foreground / border-border) pass because they name no tailwind RAMP at all — `primary`, `muted-foreground` and `border` are not in `PALETTE_RE`'s ramp list. The row below is what proves the STEP requirement; this one would stay green with the step made optional",
    },
    {
      mode: "source",
      files: { "packages/client/src/ok-ramp-no-step.tsx": 'export const G = <div className="bg-red text-slate" />;\n' },
      why: "THE NUMERIC-STEP REQUIREMENT (`-\\d{2,3}` in `PALETTE_RE`), which the semantic-token row beside it cannot prove: these DO name tailwind ramps (`red`, `slate`) and are saved by the missing step alone. A bare ramp name with no step is not a tailwind palette utility — it is either a project token or nothing — so the palette arm must not claim it. Make the step optional and this row flags 2. The `-<ramp>-<step>` pair together is what makes this pattern self-identifying enough to carry the unfenced scan",
    },
  ],
});
