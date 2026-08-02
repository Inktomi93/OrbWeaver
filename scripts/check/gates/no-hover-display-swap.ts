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
// (`.x:hover { display: none }`) is out of scope — `feature-css-files` already bans feature CSS, and the
// ui/client stylesheets are `motion-token-purity`'s scan surface, not this one.
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract.ts";

/** Legitimate hover-keyed display swaps → the reason each cannot oscillate. Both-ways ratchet: a stale row
 *  (the file no longer carries one) is RED, so a migrated file can't keep a standing exemption. EMPTY —
 *  every live instance was migrated onto the reserved-box posture in the gate's own landing commit. */
const ALLOWLIST: ExemptionTable = {};

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

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry carries NO hover-keyed display utility any more — the file was migrated onto the " +
  "reserved-box posture (ratchet down): delete the stale row in no-hover-display-swap.ts: ";

/** GATE_SELF is where a stale-allowlist finding points (the gate file itself). */
const GATE_SELF = "scripts/check/gates/no-hover-display-swap.ts";

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
type SwapToken = { readonly token: string; readonly offset: number };

/** Strip a template-literal part's delimiters: TemplateHead is `` `text${ ``, TemplateMiddle is
 *  `` }text${ ``, TemplateTail is `` }text` ``, NoSubstitutionTemplateLiteral is `` `text` `` — one
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

function packageRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

const passSeenAllowlisted = new Set<string>();

export const gate: GateDescriptor = {
  name: "no-hover-display-swap",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // Sanctioned homes are SCANNED, not scoped out (the macro-resolution-home precedent): the ONLY exemption
  // is a cited ALLOWLIST row, so a moved/renamed file goes RED instead of silently carrying its exemption.
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),

  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail],

  begin: () => {
    passSeenAllowlisted.clear();
  },

  visit: (node, sf, ctx) => {
    const hits = swapTokens(node.getText());
    if (hits.length === 0) {
      return;
    }
    const rel = packageRel(sf.getFilePath());
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    for (const hit of hits) {
      ctx.report(node, hit);
    }
  },

  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return; // the stale arm is a whole-tree claim — never fire it below project scope (§4.4)
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!passSeenAllowlisted.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          // The stale-arm text genuinely varies per dead entry → a per-occurrence message override.
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-hover-display-swap.ts`,
        });
      }
    }
  },

  mustFlag: [
    {
      files: `export const G = <div className="group-hover/row:hidden" />;\n`,
      at: "packages/client/src/features/x/row.tsx",
      expect: { count: 1 },
      why: "the P0 itself — a NAMED-group hover key removing a box from layout (ROW_REVEAL_SWAP's founding defect)",
    },
    {
      files: `export const G = <div className="hidden group-hover:flex" />;\n`,
      at: "packages/client/src/features/x/cluster.tsx",
      expect: { count: 1 },
      why: "the TWO-token spelling: the base hides, the hover arm re-displays — caught through the hover-keyed token",
    },
    {
      files: `export const G = <div className="pointer-fine:group-hover/member:flex" />;\n`,
      at: "packages/client/src/features/x/member.tsx",
      expect: { count: 1 },
      why: "a media variant STACKED on a hover key still oscillates for the fine pointer it scopes to",
    },
    {
      files: `export const G = <div className="hover:hidden peer-hover:block" />;\n`,
      at: "packages/ui/src/x/x.tsx",
      expect: { count: 2 },
      why: "bare `hover:` and `peer-hover:` are the same oscillator; PER-TOKEN reporting gives two findings",
    },
    {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: gate self-proof fixture, not a template.
      files: "export const v = tv({ base: `group-hover:hidden \\${MOTION}` });\n",
      at: "packages/ui/src/x/variants.ts",
      why: "an interpolated template PART inside tv() — the variants-file carrier a plain-string scan misses",
    },
    {
      files: `export const G = <div className="not-hover:hidden" />;\n`,
      at: "packages/client/src/features/x/negated.tsx",
      why: "the negation reads the same pointer state — `not-hover:hidden` swaps display on hover just as hard",
    },
    {
      files: `export const G = <div className="[&:hover]:hidden" />;\n`,
      at: "packages/ui/src/x/arbitrary.tsx",
      why: "the ARBITRARY-variant escape hatch: a hand-written `:hover` selector — proves the bracket-aware colon splitter",
    },
    {
      files: `const swap = "group-hover:hidden";\nexport const G = <div className={swap} />;\n`,
      at: "packages/client/src/features/x/indirect.tsx",
      expect: { count: 1 },
      why: "the UNFENCED arm: a class string assigned to a variable before it reaches the element is still read — this is the live list-row.tsx offender a className/cn() carrier fence measurably missed",
    },
  ],
  mustPass: [
    {
      files: `export const G = <div className="group-hover/row:invisible group-focus-within/row:invisible pointer-coarse:hidden" />;\n`,
      at: "packages/client/src/features/x/fixed.tsx",
      why: "ROW_REVEAL_SWAP itself — visibility reserves the box, and the coarse arm is a DEVICE class that cannot change under a moving pointer",
    },
    {
      files: `export const G = <div className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100" />;\n`,
      at: "packages/client/src/features/x/reveal.tsx",
      why: "ROW_REVEAL — an opacity reveal never touches layout",
    },
    {
      files: `export const G = <div className="hidden pointer-fine:flex sm:block" />;\n`,
      at: "packages/client/src/features/x/media.tsx",
      why: "device-class + breakpoint display swaps are legal by construction — they key on the DEVICE, not the pointer's position",
    },
    {
      files: `export const G = <div className="group-hover:bg-accent group-focus-within:flex hover:opacity-100" />;\n`,
      at: "packages/client/src/features/x/paint.tsx",
      why: "a hover-keyed PAINT utility, and a focus-within-keyed display swap (keyboard focus does not slide under a stationary pointer) — neither is this gate's class",
    },
    {
      files: `export const G = <div className="group-hover:table-auto flex-1 grid-cols-3" />;\n`,
      at: "packages/ui/src/x/near-miss.tsx",
      why: "`table-auto` is table-LAYOUT and `flex-1`/`grid-cols-3` are not display utilities — the exact-terminal fence holds",
    },
    {
      files: `export const G = <div className="[@media(hover:hover)]:flex" />;\n`,
      at: "packages/ui/src/x/media-query.tsx",
      why: "`@media (hover: hover)` is a DEVICE-capability query, not a pointer-position state — the arbitrary-variant fence keys on the `[&…:hover]` SELECTOR form only",
    },
    {
      files: `export const copy = "hidden on hover";\n`,
      at: "packages/client/src/features/x/copy.ts",
      why: "UI prose — an unfenced scan is safe precisely because the flagged shape needs a hover VARIANT prefix, which no sentence carries",
    },
  ],
};
