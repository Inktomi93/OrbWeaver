// Gate: scroll-container-positioned — a VERTICAL scroll container's own class string must also establish a
// containing block (`relative`/`absolute`/`fixed`/`sticky`). MECHANISM + measurement: the header of
// tests/support/ct/scroll-containing-block.ts — a `position:static` scroller establishes no containing block,
// so every `position:absolute` descendant (and `sr-only` IS absolute, which is why every Base UI form
// primitive plants one) resolves its containing block further UP and contributes its static position to that
// ANCESTOR's scrollable area. The user scrolls past the last row into blank space (owner dogfood 2026-08-13,
// settings screen; 11 escapees measured on the preset editor; 36 client scrollers fixed as a class, 469be29d6).
// The runtime instrument is `readPhantomScrollers`; this gate is its STATIC half — the instrument can only see
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
// position (`md:relative`) satisfies the gate although it only holds at that breakpoint; a class string
// ASSEMBLED at runtime carries no matchable token in its source.
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** Scrollers that legitimately cannot carry a positioning class → why, and what would end the exemption.
 *  Two-sided: a row whose file no longer carries an unpositioned vertical scroller is RED. EMPTY — every
 *  live instance was fixed in this gate's landing commit (the `packages/ui` primitives the 469be29d6 client
 *  sweep did not reach). */
const ALLOWLIST: ExemptionTable = {};

const MESSAGE =
  "vertical scroll container with NO positioning class in the same class string — it establishes no " +
  "containing block, so every `position:absolute` descendant under it (`sr-only` IS absolute: Base UI's " +
  "bounds announcers, hidden inputs, status lines, AriaAnnouncer) resolves further up and dumps its static " +
  "position into an ANCESTOR's scrollable area. The surface then scrolls past its last row into blank " +
  "space (owner dogfood 2026-08-13; 11 escapees measured on the preset editor). Mechanism + runtime " +
  "instrument: tests/support/ct/scroll-containing-block.ts.";

const FIX =
  "add `relative` to the SAME class string that carries the overflow token (`absolute`/`fixed`/`sticky` " +
  "count too). One class; inert on a box that has no absolute descendants. Verify with " +
  "`readPhantomScrollers` from tests/support/ct/scroll-containing-block.ts in a CT — a clean document " +
  "returns [].";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry carries NO unpositioned vertical scroller any more — it was fixed or moved (ratchet " +
  "down): delete the stale row in scroll-container-positioned.ts: ";

const GATE_SELF = "scripts/check/gates/scroll-container-positioned.ts";

/** Real-tree anchor (GATE-AUTHORING.md §4.5) — present on every real run, never on an example's path, and
 *  NOT any allowlist row's own file (that shape is blind to staleness mode B). */
const STALE_ARM_ANCHOR = "packages/ui/src/tokens/index.ts";

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

/** Strip a literal's delimiters: StringLiteral is `"text"`, NoSubstitutionTemplateLiteral is `` `text` ``,
 *  TemplateHead is `` `text${ ``, TemplateMiddle is `` }text${ ``, TemplateTail is `` }text` `` — one char
 *  off each end in every case. */
function stripDelimiters(text: string): string {
  return text.slice(1, -1);
}

/** The first vertical-scroll token in this literal that the literal does NOT balance with a positioning
 *  token, plus its 0-based offset into the enclosing NODE's text. ONE finding per literal: the fix is a
 *  single class, so N scroll tokens in one string are one defect, not N. */
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

function packageRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

const passSeenAllowlisted = new Set<string>();

export const gate: GateDescriptor = {
  name: "scroll-container-positioned",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // Sanctioned homes are SCANNED, not scoped out (§3): the only exemption is a cited ALLOWLIST row, so a
  // moved file goes RED at its new path instead of carrying the exemption silently.
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),

  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail],

  begin: () => {
    passSeenAllowlisted.clear();
  },

  visit: (node, sf, ctx) => {
    const hit = unpositionedScrollToken(node.getText());
    if (hit === undefined) {
      return;
    }
    const rel = packageRel(sf.getFilePath());
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    ctx.report(node, hit);
  },

  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      return; // a whole-tree claim — never fire it below project scope (§4.5)
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!passSeenAllowlisted.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          // The stale-arm text names the dead row → a per-occurrence message override (the gate file is the
          // anchor; there is no scanned node to read an @orb-gate-ignore from).
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/scroll-container-positioned.ts`,
        });
      }
    }
  },

  mustFlag: [
    {
      files: `export const G = <div className="min-h-0 flex-1 overflow-y-auto" />;\n`,
      at: "packages/client/src/features/x/pane.tsx",
      expect: { count: 1, token: "overflow-y-auto" },
      why: "the founding shape — the settings/preset-editor defect: a bare feature scroller with no containing block, so every sr-only box under it inflates an ancestor's scroll area",
    },
    {
      files: `export const surfaceVariants = tv({ slots: { popup: "flex max-h-full flex-col overflow-y-auto overscroll-contain" } });\n`,
      at: "packages/ui/src/primitives/dialog/variants.ts",
      expect: { count: 1 },
      why: "the tailwind-variants SLOT carrier — the class string lives in a variants.ts table, never on a className= attribute, which is why the carrier fence is refused",
    },
    {
      files: `export const POPUP_SURFACE = "z-(--z-popover) max-h-(--available-height) overflow-y-auto rounded-card bg-popover";\n`,
      at: "packages/ui/src/lib/popup-surface.ts",
      expect: { count: 1 },
      why: "a bare shared class-string CONST two calls from any element — the unfenced arm; a className/cn() ancestry sees nothing here",
    },
    {
      files: `export const G = <div className="overflow-auto overscroll-contain" />;\n`,
      at: "packages/ui/src/primitives/virtual-list/virtual-list.tsx",
      expect: { count: 1, token: "overflow-auto" },
      why: "`overflow-auto` sets BOTH axes — the vertical half is the defect, so the both-axes spelling is in scope",
    },
    {
      files: "export const v = tv({ base: `overflow-y-scroll \\\u0024{MOTION}` });\n",
      at: "packages/ui/src/x/variants.ts",
      expect: { count: 1 },
      why: "the `-scroll` spelling inside an INTERPOLATED template part — covers both the alternate utility and the TemplateHead node kind",
    },
    {
      files: `export const G = <div className="md:overflow-y-auto" />;\n`,
      at: "packages/client/src/features/x/responsive.tsx",
      expect: { count: 1 },
      why: "a breakpoint-scoped scroller still scrolls at that breakpoint — the variant chain is stripped before the utility is matched",
    },
    {
      files: `export const G = <div className="overflow-y-auto!" />;\n`,
      at: "packages/client/src/features/x/important.tsx",
      expect: { count: 1 },
      why: "the Tailwind v4 IMPORTANT modifier — the `ui-size-via-variant` blind spot (a matcher that skips `!` under-reported its own class by 14)",
    },
  ],
  mustPass: [
    {
      files: `export const G = <div className="relative min-h-0 flex-1 overflow-y-auto" />;\n`,
      at: "packages/client/src/features/x/fixed.tsx",
      why: "the fix itself — one `relative` in the same class string, the shape 36 client scrollers were migrated onto in 469be29d6",
    },
    {
      files: `export const G = <div className="absolute inset-0 overflow-y-auto" />;\nexport const H = <div className="fixed inset-0 overflow-auto" />;\nexport const I = <div className="sticky top-0 overflow-y-scroll" />;\n`,
      at: "packages/client/src/features/x/positioned.tsx",
      why: "`absolute`/`fixed`/`sticky` each establish a containing block just as `relative` does — only `static` (the absence of any of them) is the defect",
    },
    {
      files: `export const G = <div className="w-full overflow-x-auto rounded-control" />;\n`,
      at: "packages/ui/src/primitives/table/variants.ts",
      why: "DECLARED LIMIT — `overflow-x-*` is out of scope: the runtime instrument's `isScroller` reads overflowY only, and a horizontal strip grows no vertical blank tail",
    },
    {
      files: `export const G = <div className="overflow-hidden overflow-y-hidden" />;\n`,
      at: "packages/client/src/features/x/clipped.tsx",
      why: "a CLIP has no scrollable area to inflate — an escaped absolute box under `overflow-hidden` is a paint bug at worst, not this class",
    },
    {
      files: `export const G = <div className="md:relative overflow-y-auto" />;\n`,
      at: "packages/client/src/features/x/variant-position.tsx",
      why: "DECLARED LIMIT — a VARIANT-scoped position satisfies the gate although it only holds at that breakpoint; no live site does this and a variant-aware pairing rule would need the full media algebra",
    },
    {
      files: `export const G = <div className="table-fixed grid-flow-row overflow-y-auto relative" />;\n`,
      at: "packages/client/src/features/x/near-miss.tsx",
      why: "`table-fixed` is table-LAYOUT, not `position:fixed` — the exact-terminal match (never a substring) keeps it out of the positioning set",
    },
    {
      files: `export const copy = "this pane is overflow-y-auto-driven and scrolls on its own";\n`,
      at: "packages/client/src/features/x/copy.ts",
      why: "the unfenced scan's safety margin: matching is EXACT-TERMINAL on whitespace-split tokens, so `overflow-y-auto-driven` is not the utility. DECLARED LIMIT the other way — a sentence carrying the bare token verbatim WOULD flag; no UI copy on this tree does, and that is the price of reaching variants.ts slot tables and bare class consts",
    },
    {
      files: `export const G = <textarea className="overflow-y-auto relative" />;\n`,
      at: "packages/ui/src/primitives/textarea/textarea.tsx",
      why: "DECLARED LIMIT — a `<textarea>` has no element descendants at all, so it can hold no escapee; it satisfies the rule with an inert `relative` rather than earning an exemption row (cheaper than a promise nobody can end)",
    },
  ],
};
