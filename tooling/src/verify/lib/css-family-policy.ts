// The six-home declaration policy. Parsing, source provenance, and selector provenance stay in their
// dedicated modules so this layer only decides whether a proven declaration/hook is in the right home.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProductStylesheet } from "../contract/css-family.ts";
import { AUTHORED_STYLESHEETS, CLIENT_GLOBALS, PRODUCT_STYLESHEETS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import type { GateRunCtx } from "../contract/gate.ts";
import { blankCssComments } from "./comment-spans.ts";
import type { DirectDeclaration, HookOwners, StylesheetCensus } from "./css-family-census.ts";
import {
  CLIENT_BLUR_FILL,
  CLIENT_COLORIZATION,
  DENSITY_SELECTORS,
  DENSITY_SPACING,
  EXPECTED_DIRECT_CLIENT_UI_MECHANISMS,
  EXPECTED_DIRECT_THEME_DECLARATIONS,
  EXPECTED_RUNTIME_WRITERS,
  cssFamilyFinding as finding,
  KNOWN_DENSITY_FLOOR,
  LOCAL_FADE_STOP_RE,
  lineAt,
  readCensus,
  reportDensityArmCompleteness,
  themeFamilyPrefixes,
} from "./css-family-census.ts";
import { actualLayerOffsets, hasClientMechanismCarrier, isShellSelector, selectorHooks } from "./css-family-selector-provenance.ts";
import { collectHookOwners } from "./css-family-source-provenance.ts";

function isGeneratedFamily(prop: string, prefixes: ReadonlySet<string>): boolean {
  for (const prefix of prefixes) {
    if (prop.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function runtimeWriter(rel: ProductStylesheet, selector: string, declaration: DirectDeclaration): "density" | "blur" | "colorization" | "fade" | undefined {
  if (rel === TIERS && DENSITY_SELECTORS.has(selector) && DENSITY_SPACING.has(declaration.prop)) {
    return "density";
  }
  if (rel === CLIENT_GLOBALS && selector === ":root" && CLIENT_BLUR_FILL.has(declaration.prop)) {
    return "blur";
  }
  if (
    rel === CLIENT_GLOBALS &&
    selector.includes("[data-theme-colorization]") &&
    CLIENT_COLORIZATION.has(declaration.prop) &&
    declaration.value.startsWith("color-mix(")
  ) {
    return "colorization";
  }
  return (rel === UI_GLOBALS || rel === CLIENT_GLOBALS) && LOCAL_FADE_STOP_RE.test(declaration.prop) ? "fade" : undefined;
}

function isTierSelector(selector: string): boolean {
  return selector.includes("[data-surface-tier") || DENSITY_SELECTORS.has(selector) || selector === KNOWN_DENSITY_FLOOR;
}

function reportUiDependencyDirection(census: StylesheetCensus, owners: ReadonlyMap<string, HookOwners>, ctx: GateRunCtx): void {
  const reported = new Set<string>();
  for (const rule of census.rules) {
    for (const selector of rule.selectors) {
      for (const hook of selectorHooks(selector)) {
        const owner = owners.get(hook);
        if (owner?.client !== true || owner.ui || reported.has(hook)) {
          continue;
        }
        reported.add(hook);
        ctx.report(
          finding(
            UI_GLOBALS,
            rule.line,
            hook,
            `UI globals selects ${hook}, but live TS/TSX producers exist only under packages/client/src — move the mechanism to client globals or move a genuinely universal driver into @orb/ui`,
          ),
        );
      }
    }
  }
}

function bareUiSlots(selector: string, owners: ReadonlyMap<string, HookOwners>): readonly string[] {
  if (hasClientMechanismCarrier(selector)) {
    return [];
  }
  return selectorHooks(selector).filter((hook) => {
    const owner = owners.get(hook);
    return hook.startsWith("slot:") && owner?.ui === true && !owner.client;
  });
}

function isDirectClientUiMechanism(hook: string, selector: string): boolean {
  if (hook === "slot:message-list-scroll") {
    return true;
  }
  return (hook === "slot:dialog-popup" || hook === "slot:alert-dialog-popup") && selector.startsWith("html ");
}

function reportClientComponentSkins(
  census: StylesheetCensus,
  owners: ReadonlyMap<string, HookOwners>,
  directClientCounts: Map<string, number>,
  ctx: GateRunCtx,
): void {
  for (const rule of census.rules) {
    for (const selector of rule.selectors) {
      for (const hook of bareUiSlots(selector, owners)) {
        if (isDirectClientUiMechanism(hook, selector)) {
          directClientCounts.set(hook, (directClientCounts.get(hook) ?? 0) + 1);
          continue;
        }
        ctx.report(
          finding(
            CLIENT_GLOBALS,
            rule.line,
            hook,
            `client globals directly skins UI-only ${hook} without a client appearance/capability/shell carrier — put the component look in its @orb/ui tv() variant`,
          ),
        );
      }
    }
  }
}

function reportGeneratedWriters(census: StylesheetCensus, prefixes: ReadonlySet<string>, runtimeCounts: Map<string, number>, ctx: GateRunCtx): void {
  for (const rule of census.rules) {
    for (const declaration of rule.declarations) {
      if (!isGeneratedFamily(declaration.prop, prefixes)) {
        continue;
      }
      const writer = runtimeWriter(census.rel, rule.selectorList, declaration);
      if (writer !== undefined) {
        runtimeCounts.set(writer, (runtimeCounts.get(writer) ?? 0) + 1);
        continue;
      }
      ctx.report(
        finding(
          census.rel,
          declaration.line,
          declaration.prop,
          `${declaration.prop} mints or rewrites a generated token family outside theme.css without one of the closed runtime writer seams (density, reduced-transparency, colorization, local fade stops)`,
        ),
      );
    }
  }
}

function fullHomeSet(census: readonly StylesheetCensus[]): boolean {
  return census.length === PRODUCT_STYLESHEETS.length && PRODUCT_STYLESHEETS.every((rel) => census.some((row) => row.rel === rel));
}

/** THE BLINDNESS ARM, and since #2181 it is the ONLY thing this function asks. The per-sheet count
 *  ratchet it used to carry retired with `EXPECTED_DECLARATION_CENSUS` (the recorded disposition at
 *  `exception-authority-census.md:178`); this arm never read that constant and is untouched by its
 *  removal — a sheet the parser cannot read makes every ownership verdict below it vacuous. */
function reportHomeCensus(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.declarations === 0) {
    ctx.report(finding(row.rel, 0, "zero-declarations", `${row.rel} produced a zero declaration census — ownership verdict would be vacuous`));
  }
}

function reportExactCensus(census: readonly StylesheetCensus[], ctx: GateRunCtx): void {
  if (!fullHomeSet(census)) {
    return;
  }
  for (const row of census) {
    reportHomeCensus(row, ctx);
  }
}

function reportDirectThemeCensus(theme: StylesheetCensus | undefined, complete: boolean, ctx: GateRunCtx): readonly DirectDeclaration[] {
  const themeDirect = theme?.directTheme ?? [];
  if (theme !== undefined && themeDirect.length === 0) {
    ctx.report(
      finding(THEME, 0, "zero-theme-values", "the generated @theme block produced zero direct declarations — token-family ownership cannot be derived"),
    );
  }
  if (complete && themeDirect.length !== EXPECTED_DIRECT_THEME_DECLARATIONS) {
    ctx.report(
      finding(
        THEME,
        1,
        "census:theme-direct",
        `the generated @theme block contains ${themeDirect.length} direct declarations; the generated-output manifest expects ${EXPECTED_DIRECT_THEME_DECLARATIONS}`,
      ),
    );
  }
  return themeDirect;
}

function reportCensusHealth(census: readonly StylesheetCensus[], ctx: GateRunCtx): readonly DirectDeclaration[] {
  const total = census.reduce((sum, row) => sum + row.declarations, 0);
  const complete = fullHomeSet(census);
  ctx.scan({ unit: "declaration", candidates: total, scanned: total });
  reportExactCensus(census, ctx);
  return reportDirectThemeCensus(
    census.find((row) => row.rel === THEME),
    complete,
    ctx,
  );
}

function reportAuthoredLayers(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (!(AUTHORED_STYLESHEETS as readonly string[]).includes(row.rel)) {
    return;
  }
  const blanked = blankCssComments(row.raw);
  for (const offset of actualLayerOffsets(row.raw)) {
    ctx.report(
      finding(
        row.rel,
        lineAt(blanked, offset),
        "@layer",
        "authored CSS contains an @layer block; the unlayered cascade is the mechanism and must remain global",
      ),
    );
  }
}

function reportDensityPlacement(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.rel === TIERS) {
    return;
  }
  for (const rule of row.rules) {
    if (rule.selectorList.includes("[data-density")) {
      ctx.report(finding(row.rel, rule.line, "data-density", "density mapping belongs in tiers.css, never another sanctioned stylesheet"));
    }
    if (rule.selectorList.includes("[data-surface-tier")) {
      ctx.report(finding(row.rel, rule.line, "data-surface-tier", "surface-tier mapping belongs in tiers.css, never another sanctioned stylesheet"));
    }
    for (const declaration of rule.declarations) {
      if (declaration.prop.startsWith("--orb-tier-")) {
        ctx.report(finding(row.rel, declaration.line, declaration.prop, "private --orb-tier-* mapping belongs in tiers.css"));
      }
    }
  }
}

function reportShellRootRule(rule: StylesheetCensus["rules"][number], ctx: GateRunCtx): void {
  if (rule.selectorList !== ":root") {
    return;
  }
  for (const declaration of rule.declarations) {
    if (declaration.prop !== "view-transition-name" || declaration.value !== "none") {
      ctx.report(
        finding(
          SHELL,
          declaration.line,
          declaration.prop,
          "shell.css's document-root seam is only the exact view-transition-name:none reset; other document mechanisms belong in a global sheet",
        ),
      );
    }
  }
}

function isShellStructuralHook(hook: string): boolean {
  return hook.startsWith("class:shell-") || hook.startsWith("attr:data-shell-");
}

interface ShellProvenanceContext {
  readonly ctx: GateRunCtx;
  readonly owners: ReadonlyMap<string, HookOwners>;
  readonly reported: Set<string>;
}

function reportShellProvenance(selector: string, line: number, audit: ShellProvenanceContext): void {
  const { owners, reported, ctx } = audit;
  for (const hook of selectorHooks(selector)) {
    if (!isShellStructuralHook(hook) || owners.get(hook)?.client === true || reported.has(hook)) {
      continue;
    }
    reported.add(hook);
    ctx.report(
      finding(SHELL, line, hook, `shell.css selects ${hook}, but no live packages/client JSX, canonical class producer, or DOM class writer emits it`),
    );
  }
}

function reportTierGrammar(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.rel !== TIERS) {
    return;
  }
  for (const rule of row.rules) {
    for (const selector of rule.selectors) {
      if (!isTierSelector(selector)) {
        ctx.report(finding(TIERS, rule.line, selector, "tiers.css contains a selector outside the closed density carrier/slot grammar"));
      }
    }
  }
}

function reportShellGrammar(row: StylesheetCensus, owners: ReadonlyMap<string, HookOwners>, ctx: GateRunCtx): void {
  if (row.rel !== SHELL) {
    return;
  }
  const audit: ShellProvenanceContext = { owners, reported: new Set(), ctx };
  for (const rule of row.rules) {
    reportShellRootRule(rule, ctx);
    for (const selector of rule.selectors) {
      if (!isShellSelector(selector)) {
        ctx.report(finding(SHELL, rule.line, selector, "shell.css contains a rule not rooted in shell structure, a view transition, or a keyframe step"));
      }
      reportShellProvenance(selector, rule.line, audit);
    }
  }
}

function reportHomeGrammar(row: StylesheetCensus, owners: ReadonlyMap<string, HookOwners>, ctx: GateRunCtx): void {
  reportTierGrammar(row, ctx);
  reportShellGrammar(row, owners, ctx);
}

interface StylesheetAuditContext {
  readonly prefixes: ReadonlySet<string>;
  readonly owners: ReadonlyMap<string, HookOwners>;
  readonly runtimeCounts: Map<string, number>;
  readonly directClientCounts: Map<string, number>;
  readonly ctx: GateRunCtx;
}

function auditStylesheet(row: StylesheetCensus, audit: StylesheetAuditContext): void {
  const { prefixes, owners, runtimeCounts, directClientCounts, ctx } = audit;
  reportAuthoredLayers(row, ctx);
  reportDensityPlacement(row, ctx);
  reportDensityArmCompleteness(row, ctx);
  reportHomeGrammar(row, owners, ctx);
  if (row.rel !== THEME) {
    reportGeneratedWriters(row, prefixes, runtimeCounts, ctx);
  }
  if (row.rel === UI_GLOBALS) {
    reportUiDependencyDirection(row, owners, ctx);
  } else if (row.rel === CLIENT_GLOBALS) {
    reportClientComponentSkins(row, owners, directClientCounts, ctx);
  }
}

function reportClosedSeamDrift(
  census: readonly StylesheetCensus[],
  runtimeCounts: ReadonlyMap<string, number>,
  directClientCounts: ReadonlyMap<string, number>,
  ctx: GateRunCtx,
): void {
  if (!(fullHomeSet(census) && existsSync(join(ctx.root, "package.json")))) {
    return;
  }
  for (const [writer, expected] of Object.entries(EXPECTED_RUNTIME_WRITERS)) {
    const actual = runtimeCounts.get(writer) ?? 0;
    if (actual !== expected) {
      ctx.report(
        finding(
          "tooling/src/verify/gates/css-family-ownership.ts",
          1,
          `runtime-writer:${writer}`,
          `runtime writer seam ${writer} matched ${actual}, expected ${expected}; either a sanctioned runtime mechanism moved or the executable exception is stale`,
        ),
      );
    }
  }
  for (const [hook, expected] of Object.entries(EXPECTED_DIRECT_CLIENT_UI_MECHANISMS)) {
    const actual = directClientCounts.get(hook) ?? 0;
    if (actual !== expected) {
      ctx.report(
        finding(
          "tooling/src/verify/gates/css-family-ownership.ts",
          1,
          `direct-client-mechanism:${hook}`,
          `direct client UI-mechanism seam ${hook} matched ${actual}, expected ${expected}; either the bounded recipe moved or this exception is stale`,
        ),
      );
    }
  }
}

export function auditCssFamilies(ctx: GateRunCtx): void {
  const census = readCensus(ctx.root);
  const themeDirect = reportCensusHealth(census, ctx);
  const prefixes = themeFamilyPrefixes(themeDirect);
  const owners = collectHookOwners(ctx);
  const runtimeCounts = new Map<string, number>();
  const directClientCounts = new Map<string, number>();
  for (const row of census) {
    auditStylesheet(row, { prefixes, owners, runtimeCounts, directClientCounts, ctx });
  }
  reportClosedSeamDrift(census, runtimeCounts, directClientCounts, ctx);
}
