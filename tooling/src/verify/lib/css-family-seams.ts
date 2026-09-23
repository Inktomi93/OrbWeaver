// THE PER-SHEET CENSUS AND THE CLOSED RUNTIME-WRITER SEAMS — the fact-shaped half of the six-home policy
// that the ordinary ownership arm and the hard health arm both read (`css-family-policy.ts`): which
// declarations each product sheet carries, and which generated-token writes a sanctioned runtime seam
// covers. Split out at the size cap (2026-09-18); the report arms stay in `css-family-policy.ts`, and this
// module imports nothing from it.
import type { CssFamilyReport } from "../contract/css-family.ts";
import { CLIENT_GLOBALS, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import type { CssDeclarationFact, CssFacts, CssSelectorFact } from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { CLIENT_BLUR_FILL, CLIENT_COLORIZATION, DENSITY_SELECTORS, DENSITY_SPACING, LOCAL_FADE_STOP_RE, MESSAGE } from "./css-family-census.ts";

/** One product stylesheet, with the two derived quantities the ownership arms ask for. */
export interface SheetCensus {
  readonly rel: string;
  readonly file: AuthoredCssFile;
  /** Declarations authored DIRECTLY in the generated `@theme` block — custom properties only, the exact
   *  predicate the retired hand parser implemented (`^\s*(--[\w-]+)\s*:`). */
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

export function census(inventory: CssFacts): readonly SheetCensus[] {
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

export function selectorsOf(inventory: CssFacts, rel: string): readonly CssSelectorFact[] {
  return inventory.selectors.filter((selector) => selector.file === rel);
}

export function declarationsOf(inventory: CssFacts, rel: string): readonly CssDeclarationFact[] {
  return inventory.declarations.filter((declaration) => declaration.file === rel);
}

/** THE CLOSED RUNTIME-WRITER SEAMS, as MEMBER SETS rather than counts — and the difference is the whole
 *  §12.5 question (#2305, the 2026-09-13 CSS-family verifier review ledger row 4).
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

export const RUNTIME_WRITER_SEAMS: Readonly<Record<"density" | "blur" | "colorization", RuntimeWriterSeam>> = {
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

export function reportGeneratedWriters(sheet: SheetCensus, scan: GeneratedWriterScan): void {
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
