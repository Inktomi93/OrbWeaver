// Policy: scroll-container-positioned — a VERTICAL scroll container's own class string must also establish a
// containing block (`relative`/`absolute`/`fixed`/`sticky`). MECHANISM + measurement: the header of
// tests/support/browser/scroll-containing-block.ts — a `position:static` scroller establishes no containing block,
// so every `position:absolute` descendant (and `sr-only` IS absolute, which is why every Base UI form
// primitive plants one) resolves its containing block further UP and contributes its static position to that
// ANCESTOR's scrollable area. The user scrolls past the last row into blank space (owner dogfood 2026-08-13,
// settings screen; 11 escapees measured on the preset editor; 36 client scrollers fixed as a class, 469be29d6).
// The runtime instrument is `readPhantomScrollers`; this policy is its STATIC half — the instrument can only see
// a scroller a story actually mounts, and the class is written at authoring time.
//
// THE UNIT IS THE LITERAL, DELIBERATELY. The rule is "the class string that declares the scroll declares the
// containing block" — locally provable, one home, and `relative` on an already-positioned or inert box costs
// nothing. Composing the position from a DIFFERENT literal (a tv() base slot, a `cn()` argument two calls
// away) is exactly the drift this ossifies against: a variant refactor can drop the base and no reader of the
// scrolling literal can tell.
//
// DELIBERATELY UNFENCED (no `className=`/`cn()` carrier ancestry, the no-hover-display-swap precedent): the
// trigger token is self-identifying — no English sentence carries `overflow-y-auto` — so scanning EVERY
// string/template literal is strictly wider with no false positives, and it reaches the class strings that
// live in `variants.ts` slot tables and in bare `const` fragments (POPUP_SURFACE, MODAL_SURFACE) that a
// carrier fence cannot see. Comments are not literals and never enter.
//
// DECLARED LIMITS (each has a mustPass row): `overflow-x-*` alone is out of scope (the instrument's
// `isScroller` is overflowY-only, and a horizontal strip does not grow a vertical blank tail);
// `overflow-hidden`/`overflow-y-hidden` clip and have no scrollable area to inflate; a VARIANT-scoped
// position (`md:relative`) satisfies the policy although it only holds at that breakpoint; a class string
// ASSEMBLED at runtime carries no matchable token in its source.
//
// DECLARED NON-NARROWING, measured 2026-09-11 (§4.1's fourth outcome, UNFALSIFIABLE — earned by a
// constructed-fixture attempt, not by an argument): `splitVariants`' bracket/paren DEPTH tracking cannot
// change any verdict this policy reaches. A naive `token.split(":")` differs from it only in the terminal
// segment, and only when the TRUE terminal itself contains a colon — in which case the naive terminal is a
// proper suffix of it. Every member of both closed vocabularies (`overflow-auto|-scroll|-y-auto|-y-scroll`,
// `relative|absolute|fixed|sticky`) is colon-free, and a token whose naive terminal EQUALS one of them must
// end in `:<member>` at top level, which the depth-tracking splitter yields identically. Attempts run and
// measured clean: `[@media(hover:hover)]:relative` (naive terminal `relative`, same verdict),
// `[&:hover]:overflow-y-auto`, `[x:relative]` (naive terminal `relative]`, no match either way). The clause
// STAYS — it is the correct computation and the shared-reader candidate below — and no proof row claims to
// enforce it. In `no-hover-display-swap` the same code IS discriminating, because that policy reads the
// variant SEGMENTS (`segments.slice(0, -1).some(isHoverVariant)`); this one reads only the terminal.
//
// FINAL-CONTRACT CONVERSION (#1584). LEGACY SHA: 174cc2961 (the descriptor this policy replaces, byte-for-byte
// the pre-conversion module). The legacy ALLOWLIST/stale-arm ratchet retired with NO ROWS TO PORT — the table
// was `{}` from this gate's own landing commit, which fixed every live instance (the `packages/ui` primitives
// the 469be29d6 client sweep did not reach), and the `begin`/`finalize`/`fileLoaded` real-tree anchor existed
// only to police rows that never existed. A future legitimate unpositioned scroller is suppressed with
// `@orb-waive scroll-container-positioned(<position>): <reason>` at the exact offending class token, not a
// re-grown file table. MARKER CENSUS: zero legacy `@orb-gate-ignore scroll-container-positioned` markers on the
// tree (0 raw across `packages/**`, `tooling/**`, `tests/**`), so zero to translate and none dropped.
// POPULATION PORT: byte-identical. The legacy `scanRoot` was
// `p.includes("packages/client/src/") || p.includes("packages/ui/src/")`; `["@client", "@ui"]` resolves to
// exactly `packages/client/src/` + `packages/ui/src/` (`contract/population.ts`).
// FAMILY: singleton `scroll-container-positioned` — this policy owns its own class-token classifier
// (`splitVariants`/`terminalUtility`/`unpositionedScrollToken`) and shares no `lib/` reader with a sibling
// today. That is a DECLARED singleton, not a happy one: `no-hover-display-swap` carries a byte-similar
// `splitVariants`, and `no-off-token-radius-shadow`/`ui-size-via-variant` carry near-twins over their own
// utility vocabularies — four independent consumers of one "split a class-string literal into whitespace
// tokens, strip the variant chain and the `!` modifier, match the terminal EXACTLY" computation. That is a
// real shared-`lib/` reader candidate (§12.4's two-or-more-consumers reopening condition), deliberately NOT
// built here: it is a change to shared `lib/` across four final modules and belongs to its own lane, not to a
// conversion running beside three siblings. Recorded so the next reader does not mistake the duplication for
// an oversight.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "vertical scroll container with NO positioning class in the same class string — it establishes no " +
  "containing block, so every `position:absolute` descendant under it (`sr-only` IS absolute: Base UI's " +
  "bounds announcers, hidden inputs, status lines, AriaAnnouncer) resolves further up and dumps its static " +
  "position into an ANCESTOR's scrollable area. The surface then scrolls past its last row into blank " +
  "space (owner dogfood 2026-08-13; 11 escapees measured on the preset editor). Mechanism + runtime " +
  "instrument: tests/support/browser/scroll-containing-block.ts.";

const FIX =
  "add `relative` to the SAME class string that carries the overflow token (`absolute`/`fixed`/`sticky` " +
  "count too). One class; inert on a box that has no absolute descendants. Verify with " +
  "`readPhantomScrollers` from tests/support/browser/scroll-containing-block.ts in a CT — a clean document " +
  "returns []. A deliberate unpositioned scroller is waived with `// @orb-waive " +
  "scroll-container-positioned(<position>): <reason>` on the line above, where <position> is the OFFENDING " +
  "SCROLL CLASS TOKEN exactly as authored, variants and `!` included (`overflow-y-auto`, " +
  "`md:overflow-y-auto`, `overflow-y-auto!`) — never the whole class string and never the element.";

/** Utilities that make a box scroll VERTICALLY. `overflow-auto`/`overflow-scroll` set both axes, so they are
 *  in; `overflow-x-*` sets only the horizontal axis and is out (the declared limit). */
const VERTICAL_SCROLL_UTILITIES: ReadonlySet<string> = new Set(["overflow-auto", "overflow-scroll", "overflow-y-auto", "overflow-y-scroll"]);

/** Utilities that establish a containing block for an absolutely-positioned descendant. `static` is the
 *  absence of one and is deliberately NOT here. */
const POSITION_UTILITIES: ReadonlySet<string> = new Set(["relative", "absolute", "fixed", "sticky"]);

const WHITESPACE_RE = /\s+/u;
/** Tailwind v4's IMPORTANT modifier in both registered spellings — it changes PRECEDENCE, not the property
 *  (the `ui-size-via-variant` blind-spot precedent: the matcher that skipped `!` under-reported by 14). */
const IMPORTANT_RE = /^!|!$/gu;

/** Split a class token into `[…variants, utility]` on TOP-LEVEL colons only — a colon inside an arbitrary
 *  variant's brackets/parens (`[@media(hover:hover)]:relative`) belongs to that variant. */
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

/** The utility a class token resolves to, variants and `!` stripped. */
function terminalUtility(token: string): string {
  const segments = splitVariants(token);
  return (segments.at(-1) ?? token).replace(IMPORTANT_RE, "");
}

/** Strip a literal's delimiters: StringLiteral is `"text"`, NoSubstitutionTemplateLiteral is \`text\`,
 *  TemplateHead is \`text$\{, TemplateMiddle is \}text$\{, TemplateTail is \}text\` — one char
 *  off each end in every case. */
function stripDelimiters(text: string): string {
  return text.slice(1, -1);
}

/** The first vertical-scroll token in this literal that the literal does NOT balance with a positioning
 *  token, plus its 0-based offset into the enclosing NODE's text. ONE finding per literal: the fix is a
 *  single class, so N scroll tokens in one string are one defect, not N — which is also what makes the
 *  site waivable, since two findings sharing a carrier AND a token are unsuppressible by any marker. */
function unpositionedScrollToken(nodeText: string): { readonly token: string; readonly offset: number } | undefined {
  const stripped = stripDelimiters(nodeText);
  const parts: { readonly part: string; readonly at: number }[] = [];
  let cursor = 0;
  for (const part of stripped.split(WHITESPACE_RE)) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0) {
      parts.push({ part, at });
    }
  }
  const scroller = parts.find((p) => VERTICAL_SCROLL_UTILITIES.has(terminalUtility(p.part)));
  if (scroller === undefined || parts.some((p) => POSITION_UTILITIES.has(terminalUtility(p.part)))) {
    return;
  }
  return { token: scroller.part, offset: scroller.at + 1 };
}

export const gate = defineGate({
  id: "scroll-container-positioned",
  family: "scroll-container-positioned",
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
          const hit = unpositionedScrollToken(node.getText());
          if (hit !== undefined) {
            ctx.report.node(node, hit);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/pane.tsx": `export const G = <div className="min-h-0 flex-1 overflow-y-auto" />;\n` },
      expect: { count: 1, token: "overflow-y-auto" },
      why: "the founding shape — the settings/preset-editor defect: a bare feature scroller with no containing block, so every sr-only box under it inflates an ancestor's scroll area",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/dialog/variants.ts": `export const surfaceVariants = tv({ slots: { popup: "flex max-h-full flex-col overflow-y-auto overscroll-contain" } });\n`,
      },
      expect: { count: 1, token: "overflow-y-auto" },
      why: "the tailwind-variants SLOT carrier — the class string lives in a variants.ts table, never on a className= attribute, which is why the carrier fence is refused",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/lib/popup-surface.ts": `export const POPUP_SURFACE = "z-(--z-popover) max-h-(--available-height) overflow-y-auto rounded-card bg-popover";\n`,
      },
      expect: { count: 1, token: "overflow-y-auto" },
      why: "a bare shared class-string CONST two calls from any element — the unfenced arm; a className/cn() ancestry sees nothing here",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/virtual-list/virtual-list.tsx": `export const G = <div className="overflow-auto overscroll-contain" />;\n` },
      expect: { count: 1, token: "overflow-auto" },
      why: "`overflow-auto` sets BOTH axes — the vertical half is the defect, so the both-axes spelling is in scope. It is also the FIRST token in the literal, so it dies if `stripDelimiters` stops removing the opening quote",
    },
    {
      mode: "source",
      files: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: policy self-proof fixture, not a template.
        "packages/ui/src/x/variants.ts": "export const v = tv({ base: `overflow-y-scroll \\${MOTION}` });\n",
      },
      expect: { count: 1, token: "overflow-y-scroll" },
      why: "the `-scroll` spelling inside an INTERPOLATED template part — covers both the alternate utility and the TemplateHead node kind",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/responsive.tsx": `export const G = <div className="md:overflow-y-auto" />;\n` },
      expect: { count: 1, token: "md:overflow-y-auto" },
      why: "a breakpoint-scoped scroller still scrolls at that breakpoint — the variant chain is stripped before the utility is matched, and the WAIVER POSITION is the whole authored token, variants included",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/important.tsx": `export const G = <div className="overflow-y-auto!" />;\n` },
      expect: { count: 1, token: "overflow-y-auto!" },
      why: "the Tailwind v4 IMPORTANT modifier — the `ui-size-via-variant` blind spot (a matcher that skips `!` under-reported its own class by 14)",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/table-layout.tsx": `export const G = <div className="table-fixed grid-flow-row overflow-y-auto" />;\n` },
      expect: { count: 1, token: "overflow-y-auto" },
      why: "§4.1 — THE EXACT-TERMINAL FENCE ON THE POSITION SIDE, pinned. `table-fixed` CONTAINS `fixed`; relax `POSITION_UTILITIES.has(terminalUtility(p.part))` to a substring/`endsWith` test and this scroller reads as positioned and this row alone goes GREEN. The near-miss mustPass row cannot carry this claim — it also carries a real `relative`, so it passes either way",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/two-scrollers.tsx": `export const G = <div className="overflow-y-auto overflow-x-auto overflow-scroll" />;\n` },
      expect: { count: 1, token: "overflow-y-auto" },
      why: "§4.1 — ONE FINDING PER LITERAL, pinned. Two vertical-scroll utilities in one class string are ONE defect with ONE fix; replace `parts.find` with a `parts.filter` loop and this row reports 2 and goes red. It is also the waiver-granularity guard: two findings sharing a carrier AND a token are suppressible by no marker at all",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/fixed.tsx": `export const G = <div className="relative min-h-0 flex-1 overflow-y-auto" />;\n` },
      why: "the fix itself — one `relative` in the same class string, the shape 36 client scrollers were migrated onto in 469be29d6. §4.1: delete the `parts.some(POSITION_UTILITIES…)` balance test and this row reds",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/positioned.tsx": `export const G = <div className="absolute inset-0 overflow-y-auto" />;\nexport const H = <div className="fixed inset-0 overflow-auto" />;\nexport const I = <div className="sticky top-0 overflow-y-scroll" />;\n`,
      },
      why: "`absolute`/`fixed`/`sticky` each establish a containing block just as `relative` does — only `static` (the absence of any of them) is the defect",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/table/variants.ts": `export const G = <div className="w-full overflow-x-auto rounded-control" />;\n` },
      why: "DECLARED LIMIT — `overflow-x-*` is out of scope: the runtime instrument's `isScroller` reads overflowY only, and a horizontal strip grows no vertical blank tail. §4.1: add `overflow-x-auto` to VERTICAL_SCROLL_UTILITIES and this row reds",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/clipped.tsx": `export const G = <div className="overflow-hidden overflow-y-hidden" />;\n` },
      why: "a CLIP has no scrollable area to inflate — an escaped absolute box under `overflow-hidden` is a paint bug at worst, not this class",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/variant-position.tsx": `export const G = <div className="md:relative overflow-y-auto" />;\n` },
      why: "DECLARED LIMIT — a VARIANT-scoped position satisfies the policy although it only holds at that breakpoint; no live site does this and a variant-aware pairing rule would need the full media algebra. §4.1: stop calling `terminalUtility` on the POSITION side and this row reds (the raw token `md:relative` is not in POSITION_UTILITIES)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/arbitrary-variant.tsx": `export const G = <div className="[@media(hover:hover)]:relative overflow-y-auto" />;\n`,
      },
      why: '§4.1 — an ARBITRARY variant on the POSITIONING side still acquits; it dies with the `md:relative` row if `terminalUtility` stops stripping the variant chain (measured). It deliberately does NOT claim to pin the bracket-aware colon splitter: `splitVariants` is MEASURED UNFALSIFIABLE for this policy (see the header\'s DECLARED NON-NARROWING note) — a naive `token.split(":")` yields the same terminal here (`relative`), because a naive terminal can only ever be a suffix of the true one after the last colon, and no member of either closed utility set contains a colon or can be the tail of a bracketed segment',
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/near-miss.tsx": `export const G = <div className="table-fixed grid-flow-row overflow-y-auto relative" />;\n` },
      why: "`table-fixed` is table-LAYOUT, not `position:fixed` — the exact-terminal match (never a substring) keeps it out of the positioning set; its flagging twin is mustFlag[7], which is the row that actually dies if the fence is cut",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/copy.ts": `export const copy = "this pane is overflow-y-auto-driven and scrolls on its own";\n` },
      why: "the unfenced scan's safety margin: matching is EXACT-TERMINAL on whitespace-split tokens, so `overflow-y-auto-driven` is not the utility. DECLARED LIMIT the other way — a sentence carrying the bare token verbatim WOULD flag; no UI copy on this tree does, and that is the price of reaching variants.ts slot tables and bare class consts. §4.1: relax the scroller side to a substring test and this row reds",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/textarea/textarea.tsx": `export const G = <textarea className="overflow-y-auto relative" />;\n` },
      why: "DECLARED LIMIT — a `<textarea>` has no element descendants at all, so it can hold no escapee; it satisfies the rule with an inert `relative` rather than earning an exemption row (cheaper than a promise nobody can end)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/anchor.tsx": `export const G = <div className="relative overflow-y-auto" />;\n`,
        "packages/server/src/domain/x/pane.ts": `export const paneClass = "min-h-0 flex-1 overflow-y-auto";\n`,
      },
      why: "§4.1 — THE POPULATION FENCE, pinned. The identical literal that mustFlag[0] reports is invisible outside `@client`/`@ui`: this policy judges authored paint surfaces, and a server-side string that happens to spell a Tailwind utility renders nothing. Widen the population to `@authored` and this row alone reds. The `@client` file is the required IN-POPULATION ANCHOR — a fixture admitting zero paths comes back a `[population]` TOOL ERROR rather than a verdict, so the fence would be unfalsifiable without it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/waived.tsx":
          "// @orb-waive scroll-container-positioned(overflow-y-auto): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          `export const G = <div className="min-h-0 flex-1 overflow-y-auto" />;\n`,
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the reported position is the whitespace-split CLASS TOKEN itself at its own offset one past the opening delimiter, so an author waives the exact offending utility and not the className string, the element, or a sibling token. The fixture is mustFlag[0] (count 1) plus the marker line; one finding, one marker, zero effective findings and zero authority alarms. A wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
