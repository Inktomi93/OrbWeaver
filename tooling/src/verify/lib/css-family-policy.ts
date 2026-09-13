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
import type { CssFamilyReport } from "../contract/css-family.ts";
import { AUTHORED_STYLESHEETS, CLIENT_GLOBALS, PRODUCT_STYLESHEETS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import type { CssDeclarationFact, CssFacts, CssSelectorFact } from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { blankCssComments } from "./comment-spans.ts";
import type { HookOwners } from "./css-family-census.ts";
import {
  CLIENT_BLUR_FILL,
  CLIENT_COLORIZATION,
  DENSITY_SELECTORS,
  DENSITY_SPACING,
  EXPECTED_DIRECT_THEME_DECLARATIONS,
  LOCAL_FADE_STOP_RE,
  lineAt,
  MESSAGE,
  themeFamilyPrefixes,
} from "./css-family-census.ts";
import { actualLayerOffsets, hasClientMechanismCarrier, isShellSelector, selectorHookSites } from "./css-family-selector-provenance.ts";
import { waivableCoordinate } from "./waivable-coordinate.ts";

export interface CssFamilyInput {
  readonly inventory: CssFacts;
  readonly report: CssFamilyReport;
}

export interface CssOwnershipInput extends CssFamilyInput {
  readonly owners: ReadonlyMap<string, HookOwners>;
}

/** One product stylesheet, with the two derived quantities the ownership arms ask for. */
interface SheetCensus {
  readonly rel: string;
  readonly file: AuthoredCssFile;
  /** Declarations authored DIRECTLY in the generated `@theme` block — custom properties only, the exact
   *  predicate the retired hand parser implemented (`^\s*(--[\w-]+)\s*:`). Measured byte-identical at 203. */
  readonly directTheme: readonly CssDeclarationFact[];
  readonly declarations: number;
}

/** The direct `@theme` declarations, from the FACTS rather than from the file — the per-declaration `file`
 *  test below is the whole fence, so an outer `file.path !== THEME` guard was mutually redundant with it
 *  (cut f24: deleting it killed zero rows, and no fixture can distinguish the two). */
function themeBlockDeclarations(facts: readonly CssDeclarationFact[]): readonly CssDeclarationFact[] {
  return facts.filter(
    (declaration) =>
      declaration.file === THEME && declaration.owner.kind === "at-rule" && declaration.owner.prelude === "@theme" && declaration.property.startsWith("--"),
  );
}

function census(inventory: CssFacts): readonly SheetCensus[] {
  return inventory.files.map((file) => {
    const directTheme = file.path === THEME ? themeBlockDeclarations(inventory.declarations) : [];
    return {
      rel: file.path,
      file,
      directTheme,
      // The DENOMINATOR is every declaration the shared parser read in this sheet, rules and at-rule
      // bodies alike. The retired reader counted at-rule bodies for `theme.css` ALONE, so a `@layer base
      // { --x: 1 }` in another home read as zero and could have made the blindness arm fire on a sheet
      // that is not blind. The correction can only ever make the tripwire quieter, never louder.
      declarations: inventory.declarations.filter((declaration) => declaration.file === file.path).length,
    };
  });
}

function selectorsOf(inventory: CssFacts, rel: string): readonly CssSelectorFact[] {
  return inventory.selectors.filter((selector) => selector.file === rel);
}

function declarationsOf(inventory: CssFacts, rel: string): readonly CssDeclarationFact[] {
  return inventory.declarations.filter((declaration) => declaration.file === rel);
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

/** THE CLOSED RUNTIME-WRITER SEAMS, as MEMBER SETS rather than counts — and the difference is the whole
 *  §12.5 question (#2305, `v-css-family-2026-09-13.md` ledger row 4).
 *
 *  THE CONVERSION'S FIRST ATTEMPT KEPT THREE CARDINALITIES and called all three "derived from declared
 *  vocabularies". Only `density` was: `DENSITY_SPACING.size * DENSITY_SELECTORS.size` is a genuine
 *  cross-product of two declared sets. `blur: CLIENT_BLUR_FILL.size * 2` and
 *  `colorization: CLIENT_COLORIZATION.size * 2` multiplied a declared set by a BARE LITERAL that named no
 *  vocabulary at all — the blur predicate admits exactly one selector (`:root`) and the colorization
 *  predicate declares no selector set — so the `2` encoded how many carriers happen to write those
 *  properties TODAY. MEASURED: adding a third legitimate `:root` blur carrier, changing no vocabulary
 *  anywhere, reddened five rows. That is the current-population ratchet §12.5 bans, wearing a derivation's
 *  clothes, and "retire the count" was half done.
 *
 *  THE HONEST PROPERTY IS COVERAGE, and it derives ENTIRELY from the declared sets: every member of a
 *  seam's vocabulary must be written AT LEAST ONCE. A legitimate new carrier adds writes and changes no
 *  coverage, so it is silent; a member that stops being written is named. Nothing counts occurrences, so
 *  there is no number for a population to drift against — and the arm got STRONGER, because it now says
 *  WHICH member is missing where the count only said the total moved. A stray carrier writing a seam
 *  property OUTSIDE its seam position is not this arm's business at all: it is a generated-family write
 *  with no seam, which `reportGeneratedWriters` reports at the declaration in the ORDINARY policy. */
interface RuntimeWriterSeam {
  /** Every member the declared vocabulary requires, each spelled as this seam's coverage key. */
  readonly members: () => readonly string[];
  /** The member this declaration covers, or `undefined` when it is not this seam's write. */
  readonly covers: (rel: string, selectorList: string, declaration: CssDeclarationFact) => string | undefined;
}

const RUNTIME_WRITER_SEAMS: Readonly<Record<"density" | "blur" | "colorization", RuntimeWriterSeam>> = {
  density: {
    members: () => [...DENSITY_SELECTORS].flatMap((selector) => [...DENSITY_SPACING].map((property) => `${selector} ${property}`)),
    covers: (rel, selectorList, declaration) =>
      rel === TIERS && DENSITY_SELECTORS.has(selectorList) && DENSITY_SPACING.has(declaration.property) ? `${selectorList} ${declaration.property}` : undefined,
  },
  blur: {
    members: () => [...CLIENT_BLUR_FILL],
    covers: (rel, selectorList, declaration) =>
      rel === CLIENT_GLOBALS && selectorList === ":root" && CLIENT_BLUR_FILL.has(declaration.property) ? declaration.property : undefined,
  },
  colorization: {
    members: () => [...CLIENT_COLORIZATION],
    covers: (rel, selectorList, declaration) =>
      rel === CLIENT_GLOBALS &&
      selectorList.includes("[data-theme-colorization]") &&
      CLIENT_COLORIZATION.has(declaration.property) &&
      declaration.value.startsWith("color-mix(")
        ? declaration.property
        : undefined,
  },
};

/** The seam and the member one declaration covers, or `undefined` for a write no seam sanctions. */
function runtimeWriter(rel: string, selectorList: string, declaration: CssDeclarationFact): { readonly seam: string; readonly member: string } | undefined {
  let found: { readonly seam: string; readonly member: string } | undefined;
  for (const [seam, { covers }] of Object.entries(RUNTIME_WRITER_SEAMS)) {
    const member = covers(rel, selectorList, declaration);
    found ??= member === undefined ? undefined : { seam, member };
  }
  return found;
}

/** THE LOCAL FADE-STOP SEAM. It is still a sanctioned runtime writer and still acquits; what retired is the
 *  hand-spelled `fade: 12` COUNT beside it, which was a current-population ratchet §12.5 bans and which no
 *  proof row ever reached (audit cut f08: `12 → 13` killed nothing). */
function isLocalFadeStop(rel: string, declaration: CssDeclarationFact): boolean {
  return (rel === UI_GLOBALS || rel === CLIENT_GLOBALS) && LOCAL_FADE_STOP_RE.test(declaration.property);
}

function isGeneratedFamily(prop: string, prefixes: ReadonlySet<string>): boolean {
  for (const prefix of prefixes) {
    if (prop.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

interface GeneratedWriterScan {
  readonly inventory: CssFacts;
  readonly prefixes: ReadonlySet<string>;
  /** seam → the members this corpus was proven to write. */
  readonly covered: Map<string, Set<string>>;
  readonly report: CssFamilyReport;
}

function reportGeneratedWriters(sheet: SheetCensus, scan: GeneratedWriterScan): void {
  const { inventory, prefixes, covered, report } = scan;
  if (sheet.rel === THEME) {
    return;
  }
  for (const declaration of declarationsOf(inventory, sheet.rel)) {
    if (!isGeneratedFamily(declaration.property, prefixes)) {
      continue;
    }
    const selectorList = declaration.owner.kind === "style-rule" ? declaration.owner.selectorList : declaration.owner.prelude;
    const writer = runtimeWriter(sheet.rel, selectorList, declaration);
    if (writer !== undefined) {
      const seen = covered.get(writer.seam) ?? new Set<string>();
      seen.add(writer.member);
      covered.set(writer.seam, seen);
      continue;
    }
    if (isLocalFadeStop(sheet.rel, declaration)) {
      continue;
    }
    report(sheet.rel, {
      line: declaration.line,
      column: declaration.column,
      token: declaration.property,
      message: `${declaration.property} mints or rewrites a generated token family outside theme.css without one of the closed runtime writer seams (density, reduced-transparency, colorization, local fade stops). ${MESSAGE}`,
    });
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
export function isDirectClientUiMechanism(hook: string, selectorList: string): boolean {
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

/** THE HARD ARMS: verdicts about the INSTRUMENT and about generated-output parity. No author absolves one. */
export function reportCssFamilyHealth({ inventory, report }: CssFamilyInput): number {
  const sheets = census(inventory);
  // THE `fullHomeSet` GUARD IS GONE, and its deletion is the conversion's answer to audit cut f04. Under the
  // legacy filesystem walk it existed because a missing sheet read as "not the real tree"; under the closed
  // `product-css` identity a corpus short of a home REFUSES at the population phase, so the guard is
  // unreachable — cut f20 killed zero rows and no fixture can reach the false arm. The parity arm below
  // keeps its own `complete` test only because it is ALSO the empty-namespace question.
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
  if (complete && theme !== undefined && theme.directTheme.length !== EXPECTED_DIRECT_THEME_DECLARATIONS) {
    report(THEME, {
      line: 1,
      column: 1,
      message: `the generated @theme block contains ${String(theme.directTheme.length)} direct declarations; the generated-output manifest expects ${String(EXPECTED_DIRECT_THEME_DECLARATIONS)}.`,
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
  // no generated output" in the voice of a missing seam member, on top of the two arms above that say it
  // once and precisely. THE INVARIANT is that sentence, not a number: the count on the right-hand side is
  // the seams' total declared membership, so it moves whenever a vocabulary does.
  //
  // Measured at the tip that wrote this comment (cut f23, fence deleted, driven against
  // `css-family-ownership-health`): `mustFlag[1]` reports 2 with the fence and 14 without — the 12 declared
  // members (8 density + 2 blur + 2 colorization) plus its own 2. The prose here said "three findings …
  // 2 with it and 5 without", which was true of the RETIRED per-seam count and was left behind by the
  // coverage rewrite five lines above (`v-css-unit-2-2026-09-13.md` ledger row 3).
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
