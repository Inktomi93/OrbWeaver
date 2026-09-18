// The six-home declaration policy, as three PURE arm sets over one already-narrowed CSS inventory.
//
// WHAT MOVED IN THE #1584 CONVERSION.
//   * NO FILESYSTEM. `readCensus(ctx.root)` and `existsSync(join(ctx.root, "package.json"))` are gone; the
//     subject arrives as `CssFacts` from the closed `product-css` identity, and the real-tree ANCHOR that
//     existed to tell a fixture from a gutted checkout retires with them — an unloadable product identity
//     is a population-phase REFUSAL, which is a louder and earlier answer than a guard.
//   * NO SYNTHETIC COORDINATES. Every ordinary finding is anchored on the AUTHORED SLICE at its own line
//     and column (the selector arm, the declaration's property name), because `locateFinding` re-reads the
//     token out of comment-blanked source and a `cssFamilyFinding`-style `column: 1` composite binds
//     nowhere. Where a value carries a parenthesis the grammar admits none of, the COORDINATE is its
//     leading paren-free run and the whole text rides the MESSAGE (#2107 arm c).
//   * THREE AUTHORITIES, THREE POLICIES. The arms below are grouped by who may absolve them, which is what
//     guide §2 makes the split criterion: an author re-homes a declaration (ORDINARY), nobody absolves a
//     blind instrument (HARD), and a reviewer licenses a bounded direct-skin recipe (REVIEWED-GRANT).
//   * THE CENSUS AND THE SEAMS ARE A LEAF. The per-sheet census and the closed runtime-writer seams both
//     arms read are `css-family-seams.ts` (split out at the size cap 2026-09-18); the report arms stay here.
import type { CssFamilyReport } from "../contract/css-family.ts";
import { AUTHORED_STYLESHEETS, CLIENT_GLOBALS, PRODUCT_STYLESHEETS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import type { CssFacts, CssSelectorFact } from "../contract/resource-css.ts";
import { blankCssComments } from "./comment-spans.ts";
import type { HookOwners } from "./css-family-census.ts";
import { DENSITY_SELECTORS, lineAt, MESSAGE, themeFamilyPrefixes } from "./css-family-census.ts";
import type { SheetCensus } from "./css-family-seams.ts";
import { census, declarationsOf, RUNTIME_WRITER_SEAMS, reportGeneratedWriters, selectorsOf } from "./css-family-seams.ts";
import { actualLayerOffsets, hasClientMechanismCarrier, isShellSelector, selectorHookSites } from "./css-family-selector-provenance.ts";
import { waivableCoordinate } from "./waivable-coordinate.ts";

export interface CssFamilyInput {
  readonly inventory: CssFacts;
  readonly report: CssFamilyReport;
}

export interface CssOwnershipInput extends CssFamilyInput {
  readonly owners: ReadonlyMap<string, HookOwners>;
}

/** The COORDINATE for a selector-level finding: the selector's own authored text when the marker grammar
 *  can hold it, else its leading paren-free run (`:is`, `:where`). A selector with no anchorable head at
 *  all refuses LOUDLY rather than minting a finding no author could ever answer. */
function selectorCoordinate(selector: CssSelectorFact): string {
  const coordinate = waivableCoordinate(selector.authored);
  if (coordinate === undefined) {
    throw new Error(`CSS selector has no anchorable coordinate: ${selector.authored}`);
  }
  return coordinate;
}

function reportAuthoredLayers(sheet: SheetCensus, report: CssFamilyReport): void {
  if (!(AUTHORED_STYLESHEETS as readonly string[]).includes(sheet.rel)) {
    return;
  }
  const blanked = blankCssComments(sheet.file.text);
  for (const offset of actualLayerOffsets(sheet.file.text)) {
    const line = lineAt(blanked, offset);
    report(sheet.rel, {
      line,
      column: offset - blanked.lastIndexOf("\n", offset - 1),
      token: "@layer",
      message: `authored CSS contains an @layer block; the unlayered cascade is the mechanism and must remain global. ${MESSAGE}`,
    });
  }
}

function reportDensityPlacement(sheet: SheetCensus, inventory: CssFacts, report: CssFamilyReport): void {
  if (sheet.rel === TIERS) {
    return;
  }
  for (const selector of selectorsOf(inventory, sheet.rel)) {
    if (selector.selectorList.includes("[data-density")) {
      report(sheet.rel, {
        line: selector.line,
        column: selector.column,
        token: selectorCoordinate(selector),
        message: `density mapping belongs in tiers.css, never another sanctioned stylesheet. ${MESSAGE}`,
      });
    }
    if (selector.selectorList.includes("[data-surface-tier")) {
      report(sheet.rel, {
        line: selector.line,
        column: selector.column,
        token: selectorCoordinate(selector),
        message: `surface-tier mapping belongs in tiers.css, never another sanctioned stylesheet. ${MESSAGE}`,
      });
    }
  }
  for (const declaration of declarationsOf(inventory, sheet.rel)) {
    if (declaration.property.startsWith("--orb-tier-")) {
      report(sheet.rel, {
        line: declaration.line,
        column: declaration.column,
        token: declaration.property,
        message: `private --orb-tier-* mapping belongs in tiers.css. ${MESSAGE}`,
      });
    }
  }
}

function reportUiDependencyDirection(inventory: CssFacts, owners: ReadonlyMap<string, HookOwners>, report: CssFamilyReport): void {
  const reported = new Set<string>();
  for (const selector of selectorsOf(inventory, UI_GLOBALS)) {
    for (const site of selectorHookSites(selector.authored)) {
      const owner = owners.get(site.hook);
      if (owner?.client !== true || owner.ui || reported.has(site.hook)) {
        continue;
      }
      reported.add(site.hook);
      report(UI_GLOBALS, {
        line: selector.line,
        column: selector.column + site.offset,
        token: site.authored,
        message: `UI globals selects ${site.hook}, but live TS/TSX producers exist only under packages/client/src — move the mechanism to client globals or move a genuinely universal driver into @orb/ui. ${MESSAGE}`,
      });
    }
  }
}

/** THE THREE BOUNDED DIRECT-SKIN RECIPES. Membership is the PARTITION between the ordinary policy and its
 *  reviewed-grant sibling, not an exemption inside either: a hook this admits is reported by
 *  `css-family-direct-client-mechanism` under a grant identity, and by nothing else. */
function isDirectClientUiMechanism(hook: string, selectorList: string): boolean {
  if (hook === "slot:message-list-scroll") {
    return true;
  }
  return (hook === "slot:dialog-popup" || hook === "slot:alert-dialog-popup") && selectorList.startsWith("html ");
}

interface BareUiSlot {
  readonly hook: string;
  readonly selector: CssSelectorFact;
  readonly offset: number;
  readonly authored: string;
}

/** Every UI-only `data-slot` a client-globals selector skins directly, with its authored position. */
function bareUiSlots(inventory: CssFacts, owners: ReadonlyMap<string, HookOwners>): readonly BareUiSlot[] {
  const out: BareUiSlot[] = [];
  for (const selector of selectorsOf(inventory, CLIENT_GLOBALS)) {
    if (hasClientMechanismCarrier(selector.authored)) {
      continue;
    }
    for (const site of selectorHookSites(selector.authored)) {
      const owner = owners.get(site.hook);
      if (site.hook.startsWith("slot:") && owner?.ui === true && !owner.client) {
        out.push({ hook: site.hook, selector, offset: site.offset, authored: site.authored });
      }
    }
  }
  return out;
}

const SKIN_MESSAGE = (hook: string): string =>
  `client globals directly skins UI-only ${hook} without a client appearance/capability/shell carrier — put the component look in its @orb/ui tv() variant. ${MESSAGE}`;

function reportClientComponentSkins(inventory: CssFacts, owners: ReadonlyMap<string, HookOwners>, report: CssFamilyReport): void {
  for (const slot of bareUiSlots(inventory, owners)) {
    if (isDirectClientUiMechanism(slot.hook, slot.selector.selectorList)) {
      continue;
    }
    report(CLIENT_GLOBALS, {
      line: slot.selector.line,
      column: slot.selector.column + slot.offset,
      token: slot.authored,
      message: SKIN_MESSAGE(slot.hook),
    });
  }
}

function reportShellRootRule(sheet: SheetCensus, inventory: CssFacts, report: CssFamilyReport): void {
  for (const declaration of declarationsOf(inventory, sheet.rel)) {
    if (declaration.owner.kind !== "style-rule" || declaration.owner.selectorList !== ":root") {
      continue;
    }
    if (declaration.property !== "view-transition-name" || declaration.value !== "none") {
      report(SHELL, {
        line: declaration.line,
        column: declaration.column,
        token: declaration.property,
        message: `shell.css's document-root seam is only the exact view-transition-name:none reset; other document mechanisms belong in a global sheet. ${MESSAGE}`,
      });
    }
  }
}

function isShellStructuralHook(hook: string): boolean {
  return hook.startsWith("class:shell-") || hook.startsWith("attr:data-shell-");
}

function reportShellGrammar(sheet: SheetCensus, inventory: CssFacts, owners: ReadonlyMap<string, HookOwners>, report: CssFamilyReport): void {
  if (sheet.rel !== SHELL) {
    return;
  }
  reportShellRootRule(sheet, inventory, report);
  const reported = new Set<string>();
  for (const selector of selectorsOf(inventory, SHELL)) {
    if (!isShellSelector(selector.authored)) {
      report(SHELL, {
        line: selector.line,
        column: selector.column,
        token: selectorCoordinate(selector),
        message: `shell.css contains a rule not rooted in shell structure, a view transition, or a keyframe step: \`${selector.authored}\`. ${MESSAGE}`,
      });
    }
    for (const site of selectorHookSites(selector.authored)) {
      if (!isShellStructuralHook(site.hook) || owners.get(site.hook)?.client === true || reported.has(site.hook)) {
        continue;
      }
      reported.add(site.hook);
      report(SHELL, {
        line: selector.line,
        column: selector.column + site.offset,
        token: site.authored,
        message: `shell.css selects ${site.hook}, but no live packages/client JSX, canonical class producer, or DOM class writer emits it. ${MESSAGE}`,
      });
    }
  }
}

function isTierSelector(selector: string): boolean {
  return (
    selector.includes("[data-surface-tier") || DENSITY_SELECTORS.has(selector) || selector === '[data-slot="list-row-subtitle"][data-subtitle-step="label"]'
  );
}

function reportTierGrammar(sheet: SheetCensus, inventory: CssFacts, report: CssFamilyReport): void {
  if (sheet.rel !== TIERS) {
    return;
  }
  for (const selector of selectorsOf(inventory, TIERS)) {
    if (!isTierSelector(selector.authored)) {
      report(TIERS, {
        line: selector.line,
        column: selector.column,
        token: selectorCoordinate(selector),
        message: `tiers.css contains a selector outside the closed density carrier/slot grammar: \`${selector.authored}\`. ${MESSAGE}`,
      });
    }
  }
}

/** THE ORDINARY ARMS: every verdict an AUTHOR settles by moving a declaration to its semantic home. */
export function reportCssFamilyOwnership({ inventory, owners, report }: CssOwnershipInput): number {
  const sheets = census(inventory);
  const prefixes = themeFamilyPrefixes(sheets.find((sheet) => sheet.rel === THEME)?.directTheme ?? []);
  const covered = new Map<string, Set<string>>();
  for (const sheet of sheets) {
    reportAuthoredLayers(sheet, report);
    reportDensityPlacement(sheet, inventory, report);
    reportTierGrammar(sheet, inventory, report);
    reportShellGrammar(sheet, inventory, owners, report);
    reportGeneratedWriters(sheet, { inventory, prefixes, covered, report });
  }
  reportUiDependencyDirection(inventory, owners, report);
  reportClientComponentSkins(inventory, owners, report);
  return sheets.reduce((total, sheet) => total + sheet.declarations, 0);
}

/** THE REVIEWED-GRANT ARM: the three bounded recipes a client global may skin directly. Each is reported
 *  ONCE per `(carrier sheet, hook)` so the grant that licenses it is 1:1 by construction (§12.5) — a grant
 *  matching two candidates licenses NEITHER and alarms over-broad. */
export function reportDirectClientMechanisms({ inventory, owners, report }: CssOwnershipInput): number {
  const seen = new Set<string>();
  let candidates = 0;
  for (const slot of bareUiSlots(inventory, owners)) {
    if (!isDirectClientUiMechanism(slot.hook, slot.selector.selectorList) || seen.has(slot.hook)) {
      continue;
    }
    seen.add(slot.hook);
    candidates += 1;
    report(CLIENT_GLOBALS, {
      line: slot.selector.line,
      column: slot.selector.column + slot.offset,
      token: slot.authored,
      subject: CLIENT_GLOBALS,
      operation: `direct-client-mechanism:${slot.hook}`,
      message: `${SKIN_MESSAGE(slot.hook)} This one is a REVIEWED recipe: a row in lib/reviewed-grants.ts licenses it, and the row goes stale the moment the recipe stops being painted.`,
    });
  }
  return candidates;
}

/** The seam census re-counts what the ordinary policy counted, and reports NOTHING while it does: the two
 *  policies are separate owners and each computes its own denominator. */
const NO_REPORT: CssFamilyReport = () => {
  // intentionally silent: this pass counts runtime-writer seams and owns no verdict.
};

const BLIND_SHEET = (rel: string): string =>
  `${rel} produced a ZERO declaration census — every ownership verdict about this home below it is vacuous, which is instrument blindness rather than a clean sheet.`;

/** THE HARD ARMS: verdicts about the INSTRUMENT and runtime seam completeness. No author absolves one. */
export function reportCssFamilyHealth({ inventory, report }: CssFamilyInput): number {
  const sheets = census(inventory);
  // THE `fullHomeSet` GUARD IS GONE, and its deletion is the conversion's answer to audit cut f04. Under the
  // legacy filesystem walk it existed because a missing sheet read as "not the real tree"; under the closed
  // `product-css` identity a corpus short of a home REFUSES at the population phase, so the guard is
  // unreachable — cut f20 killed zero rows and no fixture can reach the false arm. The seam census
  // retains a completeness check because missing homes cannot establish writer coverage.
  for (const sheet of sheets) {
    if (sheet.declarations === 0) {
      report(sheet.rel, { line: 1, column: 1, message: BLIND_SHEET(sheet.rel) });
    }
  }
  const complete = sheets.length === PRODUCT_STYLESHEETS.length && PRODUCT_STYLESHEETS.every((rel) => sheets.some((sheet) => sheet.rel === rel));
  const theme = sheets.find((sheet) => sheet.rel === THEME);
  if (theme !== undefined && theme.directTheme.length === 0) {
    report(THEME, {
      line: 1,
      column: 1,
      message:
        "the generated @theme block produced ZERO direct declarations — token-family ownership cannot be derived, so every generated-namespace verdict is vacuous.",
    });
  }
  reportClosedSeamDrift(sheets, inventory, complete, report);
  return sheets.length;
}

/** THE CLOSED RUNTIME-WRITER SEAMS, held at PRESENCE and at no cardinality whatever.
 *
 *  What the loop below actually asks, member by member: every member of a seam's DECLARED vocabulary must be
 *  covered AT LEAST ONCE, and each uncovered member is its own finding naming that member. Occurrences are
 *  never counted — `covered` is a `Set` — so a SECOND legitimate carrier writing the same member is silent,
 *  and the only finding is a member nothing writes.
 *
 *  THE "written exactly once" THIS SENTENCE USED TO PROMISE IS EXACTLY THE THING THAT WAS WRONG (#2305,
 *  `v-css-family-2026-09-13.md` ledger row 4). While the arm held cardinalities, two of the three were
 *  `DECLARED_SET.size * <literal>` — a current-population count §12.5 bans — and a third legitimate `:root`
 *  blur carrier, changing no vocabulary anywhere, reddened five rows. Presence has no number for a
 *  population to drift against, and it says more: the message names WHICH member is missing where a total
 *  only said that a total moved. */
function reportClosedSeamDrift(sheets: readonly SheetCensus[], inventory: CssFacts, complete: boolean, report: CssFamilyReport): void {
  if (!complete) {
    return;
  }
  const prefixes = themeFamilyPrefixes(sheets.find((sheet) => sheet.rel === THEME)?.directTheme ?? []);
  // SEAM COVERAGE IS UNASKABLE WITHOUT A GENERATED NAMESPACE, and the fence keeps the verdict to the arms
  // that name the cause. `reportGeneratedWriters` only ever classifies a declaration inside a MINTED token
  // family, so a corpus whose `@theme` block resolved nothing covers no member of any seam — and without
  // this return every declared member of all three becomes its own finding, each of them saying "there is
  // no generated output" in the voice of a missing seam member. The empty-namespace arm above owns
  // that diagnosis; the resulting finding count derives from the declared member sets, never a census pin.
  if (prefixes.size === 0) {
    return;
  }
  const covered = new Map<string, Set<string>>();
  for (const sheet of sheets) {
    reportGeneratedWriters(sheet, { inventory, prefixes, covered, report: NO_REPORT });
  }
  for (const [seam, { members }] of Object.entries(RUNTIME_WRITER_SEAMS)) {
    const seen = covered.get(seam) ?? new Set<string>();
    for (const member of members()) {
      if (!seen.has(member)) {
        report(THEME, {
          line: 1,
          column: 1,
          message: `runtime writer seam ${seam} never writes ${member}, which its declared vocabulary requires; either a sanctioned runtime mechanism moved or the seam is incomplete.`,
        });
      }
    }
  }
}
