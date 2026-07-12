// Gate: no-off-token-radius-shadow (design-enforcement.md §3, DC8 rollup-audit blind spot). The bracket
// gate (`no-arbitrary-tw-values`) only catches arbitrary VALUES (`rounded-[3px]`); a DEFAULT-SCALE
// Tailwind radius/shadow utility (`rounded-lg`, `shadow-md`, bare `shadow`) resolves against Tailwind's
// stock scale, NOT the DTCG theme — which defines its OWN closed radius vocabulary (`base`/`control`/
// `card`/`full`, theme.css `--radius-*`) and shadow vocabulary (`glow`/`overlay`/`prose`, `--shadow-*`).
// A `rounded-lg`/`shadow-md` in `packages/{client,ui}/src` silently renders Tailwind's stock gray-shadow/
// generic-radius scale instead of the themed one — the exact class of drift `no-color-literals` closes
// for raw hex but this axis had no equivalent belt (verified gate blind spot; command-palette-surface.tsx
// passed `no-arbitrary-tw-values` clean while shipping `rounded-lg`/`shadow-md`).
//
// SHAPE: unlike no-arbitrary-tw-values (whose bracket shape `-\[...\]` is a near-zero-false-positive
// signal in ANY string), a bare `shadow` or `rounded-lg` is an ordinary ENGLISH WORD/UI-copy token too
// ("Prose shadow" settings label, a `keywords: [...]` search-index entry) — so this gate scopes to only
// the class-string call sites the token family targets: a JSX `className=` attribute, or a string/
// template arg inside `cn(...)`/`clsx(...)`/`cva(...)`/`tv(...)`. Within those sites it walks every
// string/template-literal PART, including interpolated-template segments (TemplateHead/Middle/Tail —
// `tv()` slot values freely interpolate motion fragments, e.g.
// `` `rounded-card ... shadow-lg ${OVERLAY_MOTION.modalPopup}` ``; the no-arbitrary-tw-values precedent
// of skipping interpolated templates entirely would silently miss every overlay primitive here), splits
// on whitespace into class tokens, strips variant modifiers (keep the terminal `:`-segment, so
// `hover:shadow-lg` still flags), and flags a terminal segment that is EXACTLY `rounded-<scale>` or
// `shadow-<scale>` (or bare `shadow`) where `<scale>` is a Tailwind DEFAULT-scale name (`sm|md|lg|xl|
// 2xl|3xl|inner` for shadow; `sm|md|lg|xl|2xl|3xl|4xl` for radius) — never the THEMED names
// (`rounded-base/control/card/full`, `shadow-glow/overlay/prose`), which pass straight through
// untouched. `rounded-none`/`shadow-none` are a deliberate "opt out of radius/shadow entirely" keyword
// (dialog.tsx's `full` presentation, the lightbox's flush popup) — NOT a magic value, so `none` is
// excluded from the banned scale. `drop-shadow-*` (a filter utility, a different CSS property/namespace
// entirely) is out of scope.
//
// ALLOWLIST (file-level, the no-arbitrary-tw-values / no-raw-interactive-intrinsics BURN_DOWN
// precedent): a file lands here with the value + reason when the drift is real pre-existing debt, not
// a new offense. An allowlisted file that has gone CLEAN is RED ("stale entry — remove it"); a NEW
// offender not in the allowlist is RED immediately.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const CLIENT_SRC_DIR = "/packages/client/src/";
const UI_SRC_DIR = "/packages/ui/src/";

/** Current legit off-token files → reason. EMPTY: the whole overlay-primitive family (dialog/menu/
 *  popover/tooltip/alert-dialog/drawer/toast/selection-bar/macro-textarea + the chat command-palette
 *  surface) was retuned off `shadow-md`/`shadow-lg` onto the DTCG `--shadow-overlay` token (DC8/§11.3
 *  retrofit wave). No genuinely-valid off-token site remains; a NEW offender is RED on sight. */
const ALLOWLIST: Record<string, string> = {};

const MESSAGE =
  "off-token default-scale radius/shadow utility (design-enforcement.md §3, DC8) — resolves against " +
  "Tailwind's stock scale, not the DTCG theme: use a themed radius (rounded-base/control/card/full) " +
  "or shadow (shadow-glow/overlay/prose), per tokens.json.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO off-token radius/shadow utility any more — the offender was reworked onto a " +
  "themed token (ratchet down): delete the stale row in no-off-token-radius-shadow.ts: ";

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

const RADIUS_SCALE_RE = /^rounded-(?:sm|md|lg|xl|2xl|3xl|4xl)$/u;
const SHADOW_SCALE_RE = /^shadow(?:-(?:sm|md|lg|xl|2xl|3xl|inner))?$/u;
const WHITESPACE_RE = /\s+/u;

/** Is this whitespace-split class token a banned off-token radius/shadow default-scale utility
 *  (terminal segment after stripping variant modifiers)? */
function isBannedScale(token: string): boolean {
  const terminal = token.split(":").at(-1) ?? token;
  return RADIUS_SCALE_RE.test(terminal) || SHADOW_SCALE_RE.test(terminal);
}

/** Strip a template-literal part's delimiters: TemplateHead is `` `text${ ``, TemplateMiddle is
 *  `` }text${ ``, TemplateTail is `` }text` ``, NoSubstitutionTemplateLiteral is `` `text` `` — one
 *  backtick-or-brace char off each end in every case. */
function stripTemplateDelimiters(text: string): string {
  return text.slice(1, -1);
}

const CLASS_STRING_CALLEES: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);

/** Is this literal/template-part a class-string carrier — a JSX `className=` attribute value, or a
 *  string/template arg (at any nesting depth, e.g. inside a `tv({slots:{...}})` object literal) inside
 *  a `cn`/`clsx`/`cva`/`tv` call? Scoped this way (not "every string in the file") because `shadow` and
 *  `rounded-lg` are ordinary English/UI-copy tokens too ("Prose shadow" label, a `keywords: [...]`
 *  search entry) — unlike the bracket shape `no-arbitrary-tw-values` scans unscoped. */
function isClassStringSite(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const call = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (call === undefined) {
    return false;
  }
  const callee = call.getExpression().getText();
  return CLASS_STRING_CALLEES.has(callee);
}

/** Lines of every banned off-token radius/shadow class token in every class-string-site string/
 *  template-literal PART of this file (a `tv()` slot value freely interpolates, e.g.
 *  `` `... shadow-lg ${motion}` `` — a plain string/no-substitution scan alone would miss it). */
function offenceLines(sf: SourceFile): number[] {
  const lines: number[] = [];
  for (const kind of [
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
    SyntaxKind.TemplateHead,
    SyntaxKind.TemplateMiddle,
    SyntaxKind.TemplateTail,
  ] as const) {
    for (const lit of sf.getDescendantsOfKind(kind)) {
      if (!isClassStringSite(lit)) {
        continue;
      }
      const text = stripTemplateDelimiters(lit.getText());
      const tokens = text.split(WHITESPACE_RE);
      if (tokens.some(isBannedScale)) {
        lines.push(lit.getStartLineNumber());
      }
    }
  }
  return lines;
}

/** The offender scan: new-offender violations + which allowlisted files still carry a banned scale
 *  utility. */
function scanSrc(
  project: CheckContext["project"],
  allowlist: Record<string, string>,
): { violations: Violation[]; seenAllowlisted: Set<string> } {
  const violations: Violation[] = [];
  const seenAllowlisted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!(path.includes(CLIENT_SRC_DIR) || path.includes(UI_SRC_DIR))) {
      continue;
    }
    const rel = clientRel(path);
    const lines = offenceLines(sf);
    if (rel in allowlist) {
      if (lines.length > 0) {
        seenAllowlisted.add(rel);
      }
      continue;
    }
    for (const line of lines) {
      violations.push({ file: rel, line, message: MESSAGE });
    }
  }
  return { violations, seenAllowlisted };
}

/** The ratchet-down arm: an allowlisted file that never surfaced a banned scale utility (absent OR clean). */
function staleEntries(
  allowlist: Record<string, string>,
  seenAllowlisted: ReadonlySet<string>,
): Violation[] {
  return Object.keys(allowlist)
    .filter((rel) => !seenAllowlisted.has(rel))
    .map((rel) => ({
      file: "scripts/check/gates/no-off-token-radius-shadow.ts",
      line: 1,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-off-token-radius-shadow.ts`,
    }));
}

/** Factory (the createNoArbitraryTwValues precedent): the self-test drives BOTH ratchet arms with an
 *  injected registry. */
export function createNoOffTokenRadiusShadow(allowlist: Record<string, string>): Check {
  return {
    name: "no-off-token-radius-shadow",
    run: ({ project }): Violation[] => {
      const { violations, seenAllowlisted } = scanSrc(project, allowlist);
      return [...violations, ...staleEntries(allowlist, seenAllowlisted)];
    },
  };
}

export const noOffTokenRadiusShadow: Check = createNoOffTokenRadiusShadow(ALLOWLIST);
