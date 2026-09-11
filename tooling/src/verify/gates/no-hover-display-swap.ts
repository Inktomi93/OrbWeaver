// Gate: no-hover-display-swap — a HOVER-keyed DISPLAY utility is a hit-test OSCILLATOR, banned in
// `packages/{client,ui}/src`. The law + its measurement live at packages/client/src/components/row-reveal.ts
// (ROW_REVEAL_SWAP's header): a display swap keyed on hover REMOVES a box from layout while the pointer is
// stationary, the surrounding line/row reflows, a hover boundary slides across the cursor, hover recomputes,
// the box comes back, and the surface flips at frame rate. MEASURED on the preset list (2026-08-02, real
// mouse): ~1,727 pointerover/out pairs, ~85 crossings/sec, with ZERO DOM mutations — pure CSS, no React
// involved, and invisible to every CT (a synthetic pointer does not re-hit-test on a layout shift, which is
// exactly why this has to be a STATIC gate and not a component test).
//
// The sanctioned shape is RESERVE THE BOX, SWAP THE PAINT: `invisible` (visibility — reserves the box) or
// `opacity-0`/`opacity-100`, per ROW_REVEAL / ROW_REVEAL_SWAP.
//
// LEGAL BY CONSTRUCTION — a MEDIA-state display swap (`pointer-coarse:hidden`, `pointer-fine:flex`, a
// breakpoint) keys on a DEVICE CLASS, not on pointer POSITION: it cannot change while the pointer moves, so
// it cannot oscillate. Those tokens carry no hover variant and never match here.
//
// Keyed PER TOKEN on the variant chain, so both spellings of the swap are caught: the one-token form
// (`group-hover/row:hidden`) and the two-token form (`hidden group-hover:flex` — the second token is
// hover-keyed + display, so the pair is caught through it).
//
// DELIBERATELY UNFENCED — unlike `no-off-token-radius-shadow` (whose `shadow`/`rounded-lg` are ordinary
// English, forcing a className/`cn()`-carrier fence), this gate's shape REQUIRES a hover variant prefix, and
// `group-hover:hidden` is not a sentence anyone writes. So it reads EVERY string/template literal under the
// scan root. That is not a stylistic choice: the carrier fence measurably missed a live offender on this
// tree (`list-row.tsx`'s `const subtitleSwap = … ? "" : "group-hover:hidden …"` — a class string assigned to
// a variable before reaching a slot fn, which no `className=`/`cn(` ancestry can see).
//
// DECLARED BLIND SPOTS (the literal-shape reader's honest limits, same class as `ui-size-via-variant`'s):
// a class string ASSEMBLED at runtime (`` `group-hover:${expr}` ``, a variant map keyed by prop) carries no
// matchable token in its source, and a hover-keyed display swap written in hand-authored CSS
// (`.x:hover { display: none }`) is out of scope — `sanctioned-css-homes` already path-closes product CSS, and the
// ui/client stylesheets are `motion-token-purity`'s scan surface, not this one.
//
// FINAL-CONTRACT CONVERSION (#1584): the legacy ALLOWLIST/stale-arm ratchet retired with NO ROWS TO
// PORT — it had been EMPTY since the gate's own landing commit migrated every live instance onto the
// reserved-box posture. A future legitimate hover-keyed display swap is suppressed with `@orb-waive
// no-hover-display-swap(<position>): <reason>` at the exact offending token, not a re-grown file table.
// FAMILY: singleton — this policy owns its own local variant/token classifier
// (`isHoverVariant`/`splitVariants`/`isHoverDisplaySwap`); it shares no `lib/` reader with any sibling
// gate today. `no-off-token-radius-shadow` and `ui-size-via-variant` repeat the same "split a
// class-string node into whitespace tokens, strip the variant chain, classify the terminal segment"
// SHAPE with their own regex vocabularies — a real MERGE candidate for a future lane, not forced here
// (each classifies a disjoint token vocabulary and `ui-size-via-variant` is blocked on the `packages/**`
// fence — see this lane's report).
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "hover-keyed DISPLAY utility — a hit-test oscillator. A display swap driven by hover removes a box from " +
  "layout under a stationary pointer; the line/row reflows, the hover boundary slides across the cursor, " +
  "and the surface flips at frame rate (~85 crossings/sec measured on the preset list, 2026-08-02, with " +
  "ZERO DOM mutations — pure CSS, invisible to every CT). See packages/client/src/components/row-reveal.ts.";

const FIX =
  "reserve the box and swap the PAINT: `invisible`/`visible` (visibility keeps the box) or " +
  "`opacity-0` → `opacity-100`, per ROW_REVEAL / ROW_REVEAL_SWAP in packages/client/src/components/row-reveal.ts. " +
  "A device-class swap (`pointer-coarse:hidden`, `pointer-fine:flex`, a breakpoint) stays legal — it cannot " +
  "change while the pointer moves.";

/** Every Tailwind utility that sets `display` — the ones that move a box in or out of layout. Exact
 *  terminal match, never a prefix: `table-auto`/`table-fixed` are table-LAYOUT (not display) and must pass,
 *  as must `flex-1`/`grid-cols-3`/`inline-size-*`. */
const DISPLAY_UTILITIES: ReadonlySet<string> = new Set([
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "table",
  "inline-table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row-group",
  "table-row",
  "flow-root",
  "list-item",
  "contents",
  "hidden",
]);

// `hover`, `group-hover`, `peer-hover`, each with an optional `/name` group label, and each with the `not-`
// negation prefix (`not-hover:hidden` is the same oscillator read backwards). ANCHORED — `hover-tip` (a
// data-attribute name) and `group-focus-within` must not match.
const HOVER_VARIANT_RE = /^(?:not-)?(?:group-|peer-)?hover(?:\/[A-Za-z0-9_-]+)?$/u;
// An ARBITRARY variant that hand-writes the pseudo-class (`[&:hover]:hidden`, `[@media(hover:hover)]` is
// NOT this — it has no `&`). Keyed on the selector form so the bracket escape hatch is closed too.
const ARBITRARY_HOVER_VARIANT_RE = /^\[&[^\]]*:hover[^\]]*\]$/u;
const WHITESPACE_RE = /\s+/u;
// The Tailwind IMPORTANT modifier in BOTH spellings the v4 engine registers (`!hidden` + `hidden!`) — it
// changes PRECEDENCE, not the property, so stripping it is required (the `ui-size-via-variant` precedent:
// the `!` form is the worse one, it wins by force).
const IMPORTANT_RE = /^!|!$/gu;

function isHoverVariant(variant: string): boolean {
  return HOVER_VARIANT_RE.test(variant) || ARBITRARY_HOVER_VARIANT_RE.test(variant);
}

/** Split a class token into `[…variants, utility]` on TOP-LEVEL colons only — a colon inside an arbitrary
 *  variant's brackets/parens (`[&:hover]:hidden`, `[@media(hover:hover)]:flex`) belongs to that variant, and
 *  a naive `token.split(":")` shreds it into segments that match nothing. */
function splitVariants(token: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      out.push(token.slice(start, i));
      start = i + 1;
    }
  }
  out.push(token.slice(start));
  return out;
}

/** Is this whitespace-split class token a hover-keyed display swap — a `display` utility whose variant
 *  chain contains a hover key? */
function isHoverDisplaySwap(token: string): boolean {
  const segments = splitVariants(token);
  const terminal = (segments.at(-1) ?? token).replace(IMPORTANT_RE, "");
  if (!DISPLAY_UTILITIES.has(terminal)) {
    return false;
  }
  return segments.slice(0, -1).some(isHoverVariant);
}

/** A single offending token + its 0-based char offset into the ENCLOSING NODE's text (one past the leading
 *  delimiter). Per-occurrence granularity: a className with N swap tokens yields N findings, each landing
 *  the caret on its own token. */
interface SwapToken {
  readonly token: string;
  readonly offset: number;
}

/** Strip a template-literal part's delimiters: TemplateHead is \`text$\{, TemplateMiddle is
 *  \}text$\{, TemplateTail is \}text\`, NoSubstitutionTemplateLiteral is \`text\` — one
 *  backtick-or-brace char off each end in every case (StringLiteral: one quote). */
function stripDelimiters(text: string): string {
  return text.slice(1, -1);
}

function swapTokens(nodeText: string): SwapToken[] {
  const stripped = stripDelimiters(nodeText);
  const out: SwapToken[] = [];
  let cursor = 0;
  for (const part of stripped.split(WHITESPACE_RE)) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && isHoverDisplaySwap(part)) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

export const gate = defineGate({
  id: "no-hover-display-swap",
  family: "no-hover-display-swap",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [
          SyntaxKind.StringLiteral,
          SyntaxKind.NoSubstitutionTemplateLiteral,
          SyntaxKind.TemplateHead,
          SyntaxKind.TemplateMiddle,
          SyntaxKind.TemplateTail,
        ],
        visit: (node) => {
          for (const hit of swapTokens(node.getText())) {
            ctx.report.node(node, hit);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/row.tsx": `export const G = <div className="group-hover/row:hidden" />;\n` },
      expect: { count: 1 },
      why: "the P0 itself — a NAMED-group hover key removing a box from layout (ROW_REVEAL_SWAP's founding defect)",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/cluster.tsx": `export const G = <div className="hidden group-hover:flex" />;\n` },
      expect: { count: 1 },
      why: "the TWO-token spelling: the base hides, the hover arm re-displays — caught through the hover-keyed token",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/member.tsx": `export const G = <div className="pointer-fine:group-hover/member:flex" />;\n` },
      expect: { count: 1 },
      why: "a media variant STACKED on a hover key still oscillates for the fine pointer it scopes to",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/x.tsx": `export const G = <div className="hover:hidden peer-hover:block" />;\n` },
      expect: { count: 2 },
      why: "bare `hover:` and `peer-hover:` are the same oscillator; PER-TOKEN reporting gives two findings",
    },
    {
      mode: "source",
      files: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: gate self-proof fixture, not a template.
        "packages/ui/src/x/variants.ts": "export const v = tv({ base: `group-hover:hidden \\${MOTION}` });\n",
      },
      why: "an interpolated template PART inside tv() — the variants-file carrier a plain-string scan misses",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/negated.tsx": `export const G = <div className="not-hover:hidden" />;\n` },
      why: "the negation reads the same pointer state — `not-hover:hidden` swaps display on hover just as hard",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/arbitrary.tsx": `export const G = <div className="[&:hover]:hidden" />;\n` },
      why: "the ARBITRARY-variant escape hatch: a hand-written `:hover` selector — proves the bracket-aware colon splitter",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/indirect.tsx": `const swap = "group-hover:hidden";\nexport const G = <div className={swap} />;\n`,
      },
      expect: { count: 1 },
      why: "the UNFENCED arm: a class string assigned to a variable before it reaches the element is still read — this is the live list-row.tsx offender a className/cn() carrier fence measurably missed",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/fixed.tsx": `export const G = <div className="group-hover/row:invisible group-focus-within/row:invisible pointer-coarse:hidden" />;\n`,
      },
      why: "ROW_REVEAL_SWAP itself — visibility reserves the box, and the coarse arm is a DEVICE class that cannot change under a moving pointer",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/reveal.tsx": `export const G = <div className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100" />;\n`,
      },
      why: "ROW_REVEAL — an opacity reveal never touches layout",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/media.tsx": `export const G = <div className="hidden pointer-fine:flex sm:block" />;\n` },
      why: "device-class + breakpoint display swaps are legal by construction — they key on the DEVICE, not the pointer's position",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/paint.tsx": `export const G = <div className="group-hover:bg-accent group-focus-within:flex hover:opacity-100" />;\n`,
      },
      why: "a hover-keyed PAINT utility, and a focus-within-keyed display swap (keyboard focus does not slide under a stationary pointer) — neither is this gate's class",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/near-miss.tsx": `export const G = <div className="group-hover:table-auto flex-1 grid-cols-3" />;\n` },
      why: "`table-auto` is table-LAYOUT and `flex-1`/`grid-cols-3` are not display utilities — the exact-terminal fence holds",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/media-query.tsx": `export const G = <div className="[@media(hover:hover)]:flex" />;\n` },
      why: "`@media (hover: hover)` is a DEVICE-capability query, not a pointer-position state — the arbitrary-variant fence keys on the `[&…:hover]` SELECTOR form only",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/copy.ts": `export const copy = "hidden on hover";\n` },
      why: "UI prose — an unfenced scan is safe precisely because the flagged shape needs a hover VARIANT prefix, which no sentence carries",
    },
  ],
});
