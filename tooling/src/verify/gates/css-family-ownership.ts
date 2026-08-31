// Gate: css-family-ownership (#951 / client-architecture-lockdown.md §4.3 and §4.7).
// `sanctioned-css-homes` proves WHERE repository CSS may exist. This gate proves that a legal path is
// not a dumping-ground license: density, generated values, universal UI mechanisms, client mechanisms,
// and shell structure retain their dependency direction inside that closed set.
//
// The wall is syntax/provenance based. It deliberately has no `@orb-css-family` comment DSL and no
// property-keyword classifier: either would let an author bless the wrong rule with the right word.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankCssComments } from "../lib/comment-spans.ts";
import { parseCssRules } from "../lib/css-rules.ts";
import { repoRel } from "../lib/pass.ts";

const THEME = "packages/ui/src/styles/theme.css";
const UI_GLOBALS = "packages/ui/src/styles/globals.css";
const TIERS = "packages/ui/src/styles/tiers.css";
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const SHELL = "packages/client/src/features/app-shell/surfaces/shell.css";
const PRODUCT_STYLESHEETS = [THEME, UI_GLOBALS, TIERS, CLIENT_GLOBALS, SHELL] as const;
const AUTHORED_STYLESHEETS = [UI_GLOBALS, TIERS, CLIENT_GLOBALS, SHELL] as const;

type ProductStylesheet = (typeof PRODUCT_STYLESHEETS)[number];

interface DirectDeclaration {
  readonly prop: string;
  readonly value: string;
  readonly line: number;
}

interface StylesheetCensus {
  readonly rel: ProductStylesheet;
  readonly raw: string;
  readonly rules: ReturnType<typeof parseCssRules>;
  readonly directTheme: readonly DirectDeclaration[];
  readonly declarations: number;
}

interface HookOwners {
  readonly ui: boolean;
  readonly client: boolean;
}

const DENSITY_SPACING = new Set(["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"]);
const DENSITY_SELECTORS = new Set(['[data-density="comfortable"]', '[data-density="compact"]']);
const CLIENT_BLUR_FILL = new Set(["--blur-fill-chrome", "--blur-fill-dense"]);
const CLIENT_COLORIZATION = new Set(["--color-border", "--color-sidebar-border"]);
const LOCAL_FADE_STOP_RE = /^--fade-(?:start|end|top|bottom)-stop$/u;
const KEYFRAME_STEP_RE = /^(?:from|to|\d+%(?:\s*,\s*\d+%)*)$/u;
const CSS_CLASS_RE = /\.([_a-zA-Z][\w-]*)/gu;
const DATA_SLOT_RE = /\[data-slot="([^"]+)"\]/gu;
const KNOWN_DENSITY_FLOOR = '[data-slot="list-row-subtitle"][data-subtitle-step="label"]';
const CLASS_TOKEN_RE = /^[A-Za-z_][\w-]*$/u;
const EXPECTED_RUNTIME_WRITERS = {
  density: DENSITY_SPACING.size * DENSITY_SELECTORS.size,
  blur: CLIENT_BLUR_FILL.size * 2,
  colorization: CLIENT_COLORIZATION.size * 2,
  fade: 12,
} as const;
const EXPECTED_DIRECT_CLIENT_UI_MECHANISMS = {
  "slot:dialog-popup": 1,
  "slot:alert-dialog-popup": 1,
  "slot:message-list-scroll": 3,
} as const;
const SOURCE_OWNERS = [
  { prefix: "packages/ui/src/", owner: "ui" },
  { prefix: "packages/client/src/", owner: "client" },
] as const;

const MESSAGE =
  "a declaration is inside a sanctioned CSS path but belongs to another semantic family (#951 / client-architecture-lockdown.md §4.3): legal path is not responsibility";

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    line += text.charCodeAt(index) === 10 ? 1 : 0;
  }
  return line;
}

function nextQuote(current: string, char: string, escaped: boolean): string {
  if (current !== "") {
    return char === current && !escaped ? "" : current;
  }
  return char === '"' || char === "'" ? char : "";
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const beforeQuote = quote;
    quote = nextQuote(quote, char, text[index - 1] === "\\");
    if (beforeQuote !== "" || quote !== "") {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

/** Preserve direct text/line offsets while erasing nested blocks. A line-anchored declaration regex by
 * itself cannot distinguish a direct `@theme` declaration from one nested inside a future at-rule. */
function nestedChar(char: string, depth: number): string {
  return depth > 0 && char !== "\n" ? " " : char;
}

function blankNestedBlocks(text: string): string {
  const chars = [...text];
  let depth = 0;
  let quote = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    const beforeQuote = quote;
    quote = nextQuote(quote, char, text[index - 1] === "\\");
    if (beforeQuote !== "" || quote !== "") {
      chars[index] = nestedChar(char, depth);
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    chars[index] = nestedChar(char, depth);
    if (char === "}") {
      depth -= 1;
    }
  }
  return chars.join("");
}

/** Direct declarations of the generated `@theme` block. `parseCssRules` correctly descends through
 *  at-rules to STYLE rules, but direct declarations in an at-rule are intentionally not style rules. */
export function readDirectThemeDeclarations(raw: string): readonly DirectDeclaration[] {
  const text = blankCssComments(raw);
  const match = /@theme\s*\{/u.exec(text);
  if (match === null) {
    return [];
  }
  const open = match.index + match[0].lastIndexOf("{");
  const close = matchingBrace(text, open);
  if (close === -1) {
    return [];
  }
  const body = blankNestedBlocks(text.slice(open + 1, close));
  const out: DirectDeclaration[] = [];
  for (const declaration of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gmu)) {
    const prop = declaration[1];
    const value = declaration[2];
    if (prop !== undefined && value !== undefined) {
      out.push({ prop, value: value.trim(), line: lineAt(text, open + 1 + declaration.index + declaration[0].indexOf(prop)) });
    }
  }
  return out;
}

function readCensus(root: string): readonly StylesheetCensus[] {
  return PRODUCT_STYLESHEETS.flatMap((rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      return [];
    }
    const raw = readFileSync(abs, "utf8");
    const rules = parseCssRules(raw);
    const directTheme = rel === THEME ? readDirectThemeDeclarations(raw) : [];
    return [{ rel, raw, rules, directTheme, declarations: directTheme.length + rules.reduce((sum, rule) => sum + rule.declarations.length, 0) }];
  });
}

function finding(file: string, line: number, token: string, message: string): Finding {
  // @finding-overload-ok: CSS is filesystem text, not a ts-morph node; the depth-aware parser supplies the exact file/line/token and CSS has no @orb-gate-ignore grammar to preserve. Ends if the gate runner exposes CSS nodes with the shared suppression contract.
  return { file, line, column: 1, token, message };
}

function sourceOwner(rel: string): "ui" | "client" | undefined {
  return SOURCE_OWNERS.find((row) => rel.startsWith(row.prefix))?.owner;
}

function literalText(nodeText: string): string {
  const quote = nodeText[0];
  return (quote === '"' || quote === "'" || quote === "`") && nodeText.at(-1) === quote ? nodeText.slice(1, -1) : nodeText;
}

function recordOwner(map: Map<string, HookOwners>, hook: string, owner: "ui" | "client"): void {
  const before = map.get(hook) ?? { ui: false, client: false };
  map.set(hook, { ui: before.ui || owner === "ui", client: before.client || owner === "client" });
}

function recordClassTokens(map: Map<string, HookOwners>, text: string, owner: "ui" | "client"): void {
  for (const token of text.split(/\s+/u)) {
    if (CLASS_TOKEN_RE.test(token)) {
      recordOwner(map, `class:${token}`, owner);
    }
  }
}

/** Literal producer direction. Comments/JSDoc never enter because only syntax nodes are visited. */
function collectHookOwners(ctx: GateRunCtx): ReadonlyMap<string, HookOwners> {
  const owners = new Map<string, HookOwners>();
  for (const sf of ctx.project.getSourceFiles()) {
    const owner = sourceOwner(repoRel(ctx.root, sf.getFilePath()));
    if (owner === undefined) {
      continue;
    }
    for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
      recordClassTokens(owners, literalText(node.getText()), owner);
    }
    for (const node of sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
      recordClassTokens(owners, literalText(node.getText()), owner);
    }
    for (const attribute of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const match = /^data-slot\s*=\s*["']([^"']+)["']$/u.exec(attribute.getText());
      if (match?.[1] !== undefined) {
        recordOwner(owners, `slot:${match[1]}`, owner);
      }
    }
  }
  return owners;
}

function selectorHooks(selector: string): readonly string[] {
  const hooks: string[] = [];
  for (const match of selector.matchAll(CSS_CLASS_RE)) {
    if (match[1] !== undefined) {
      hooks.push(`class:${match[1]}`);
    }
  }
  for (const match of selector.matchAll(DATA_SLOT_RE)) {
    if (match[1] !== undefined) {
      hooks.push(`slot:${match[1]}`);
    }
  }
  return hooks;
}

function hasClientMechanismCarrier(selector: string): boolean {
  return (
    selector.includes("html[data-") || selector.includes(".shell-grid") || selector.includes("[data-has-bg-image]") || selector.includes("[data-reduced-motion")
  );
}

function themeFamilyPrefixes(directTheme: readonly DirectDeclaration[]): ReadonlySet<string> {
  const prefixes = new Set<string>();
  for (const { prop } of directTheme) {
    const family = /^--([a-z0-9]+)-/u.exec(prop)?.[1];
    if (family !== undefined) {
      prefixes.add(`--${family}-`);
    }
  }
  return prefixes;
}

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

function reportDensityArmCompleteness(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.rel !== TIERS) {
    return;
  }
  const densityRules = row.rules.filter((rule) => rule.selectors.some((selector) => DENSITY_SELECTORS.has(selector)));
  if (densityRules.length === 0) {
    return;
  }
  for (const selector of DENSITY_SELECTORS) {
    const declarations = densityRules
      .filter((rule) => rule.selectors.includes(selector))
      .flatMap((rule) => rule.declarations)
      .filter((declaration) => DENSITY_SPACING.has(declaration.prop));
    if (declarations.length !== DENSITY_SPACING.size) {
      ctx.report(
        finding(
          TIERS,
          densityRules[0]?.line ?? 1,
          `density-arm:${selector}`,
          `${selector} must write all ${DENSITY_SPACING.size} density spacing intents; found ${declarations.length}`,
        ),
      );
    }
  }
}

function isKeyframeStep(selector: string): boolean {
  return KEYFRAME_STEP_RE.test(selector);
}

function isShellSelector(selector: string): boolean {
  return (
    isKeyframeStep(selector) ||
    selector === ":root" ||
    selector.includes(".shell-") ||
    selector.includes("[data-shell-") ||
    selector.startsWith("::view-transition-")
  );
}

function actualLayerOffsets(raw: string): readonly number[] {
  const text = blankCssComments(raw);
  return [...text.matchAll(/@layer(?=\s|\{)/gu)].map((match) => match.index);
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

function reportCensusHealth(census: readonly StylesheetCensus[], ctx: GateRunCtx): readonly DirectDeclaration[] {
  const total = census.reduce((sum, row) => sum + row.declarations, 0);
  ctx.scan({ unit: "declaration", candidates: total, scanned: total });
  if (fullHomeSet(census)) {
    for (const row of census) {
      if (row.declarations === 0) {
        ctx.report(finding(row.rel, 0, "zero-declarations", `${row.rel} produced a zero declaration census — ownership verdict would be vacuous`));
      }
    }
  }
  const theme = census.find((row) => row.rel === THEME);
  const themeDirect = theme?.directTheme ?? [];
  if (theme !== undefined && themeDirect.length === 0) {
    ctx.report(
      finding(THEME, 0, "zero-theme-values", "the generated @theme block produced zero direct declarations — token-family ownership cannot be derived"),
    );
  }
  return themeDirect;
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

function reportHomeGrammar(row: StylesheetCensus, ctx: GateRunCtx): void {
  for (const rule of row.rules) {
    if (row.rel === SHELL) {
      reportShellRootRule(rule, ctx);
    }
    for (const selector of rule.selectors) {
      if (row.rel === TIERS && !isTierSelector(selector)) {
        ctx.report(finding(TIERS, rule.line, selector, "tiers.css contains a selector outside the closed density carrier/slot grammar"));
      } else if (row.rel === SHELL && !isShellSelector(selector)) {
        ctx.report(finding(SHELL, rule.line, selector, "shell.css contains a rule not rooted in shell structure, a view transition, or a keyframe step"));
      }
    }
  }
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
  reportHomeGrammar(row, ctx);
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

function auditCssFamilies(ctx: GateRunCtx): void {
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

export const gate: GateDescriptor = {
  name: "css-family-ownership",
  docRow: "client-architecture-lockdown.md §4.3 / §4.7 (#951)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: "move the declaration to its semantic home; do not relabel it, add an allowlist, change source order, or narrow theme/custom-CSS behavior",
  run: auditCssFamilies,
  mustFlag: [
    {
      files: { [UI_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: "data-density" },
      why: "density planted in UI globals is routed to tiers.css",
    },
    {
      files: { [CLIENT_GLOBALS]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 1, token: "data-density" },
      why: "density planted in client globals is routed to tiers.css",
    },
    {
      files: { [SHELL]: '[data-density="compact"] { --spacing-row: 0.5rem; }\n' },
      expect: { count: 2, token: "data-density" },
      why: "density in shell violates both the density home and shell-root grammar",
    },
    {
      files: { [UI_GLOBALS]: "@layer base { :root { color-scheme: dark; } }\n" },
      expect: { count: 1, token: "@layer" },
      why: "an authored layer destroys the global unlayered-wins mechanism",
    },
    {
      files: {
        [THEME]: "@theme { --color-background: black; }\n",
        [SHELL]: ".shell-grid { --color-fresh-palette: oklch(0.5 0.1 40); }\n",
      },
      expect: { count: 1, token: "--color-fresh-palette" },
      why: "a new palette/value in shell is caught from the generated color namespace, even though the exact name is new",
    },
    {
      files: {
        [UI_GLOBALS]: ".client-progress { overflow: hidden; }\n",
        "packages/client/src/features/probe.tsx": 'export const probe = <div className="client-progress" />;\n',
      },
      expect: { count: 1, token: "class:client-progress" },
      why: "a class selected in UI globals but produced only by client source violates dependency direction",
    },
    {
      files: {
        [UI_GLOBALS]: '[data-slot="client-progress"] { overflow: hidden; }\n',
        "packages/client/src/features/probe.tsx": 'export const probe = <div data-slot="client-progress" />;\n',
      },
      expect: { count: 1, token: "slot:client-progress" },
      why: "the producer-direction arm covers JSX data-slot hooks, not only class strings",
    },
    {
      files: {
        [CLIENT_GLOBALS]: '[data-slot="button"] { border-radius: 1rem; }\n',
        "packages/ui/src/primitives/button.tsx": 'export const button = <button data-slot="button" />;\n',
      },
      expect: { count: 1, token: "slot:button" },
      why: "a bare client-global skin of a UI-only component belongs in the component tv() variant",
    },
    {
      files: { [TIERS]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button" },
      why: "a component skin planted in tiers.css is outside the density selector grammar",
    },
    {
      files: { [SHELL]: ".button { padding: 1rem; }\n" },
      expect: { count: 1, token: ".button" },
      why: "a component skin planted in shell.css is not rooted in the shell frame",
    },
    {
      files: { [SHELL]: ":root { color-scheme: dark; }\n" },
      expect: { count: 1, token: "color-scheme" },
      why: "the one document-root declaration in shell is the view-transition reset, not a general global-mechanism door",
    },
    {
      files: { [TIERS]: '[data-density="compact"] { --spacing-field: 0.25rem; --spacing-row: 0.375rem; --spacing-block: 0.5rem; --spacing-section: 1rem; }\n' },
      expect: { count: 1, token: 'density-arm:[data-density="comfortable"]' },
      why: "one density arm without its symmetric counterpart is a stale runtime contract, not a valid partial map",
    },
  ],
  mustPass: [
    {
      files: { [THEME]: "@theme { --color-background: black; --spacing-row: 0.5rem; }\n:root { color-scheme: dark; }\n" },
      why: "generated @theme declarations are counted as declarations and define the live generated namespaces",
    },
    {
      files: {
        [THEME]: "@theme {\n  --color-background: black;\n  @media (forced-colors: active) {\n    --probe-nested: white;\n  }\n}\n",
        [SHELL]: ".shell-grid { --probe-runtime: white; }\n",
      },
      why: "only direct @theme declarations mint generated namespaces; a nested declaration cannot widen the writer wall",
    },
    {
      files: {
        [TIERS]:
          '[data-density="comfortable"] { --spacing-field: var(--orb-density-comfortable-field); --spacing-row: var(--orb-density-comfortable-row); --spacing-block: var(--orb-density-comfortable-block); --spacing-section: var(--orb-density-comfortable-section); }\n' +
          '[data-density="compact"] { --spacing-field: var(--orb-density-compact-field); --spacing-row: var(--orb-density-compact-row); --spacing-block: var(--orb-density-compact-block); --spacing-section: var(--orb-density-compact-section); }\n',
      },
      why: "both symmetric density runtime writers belong in tiers.css and each maps all four intents",
    },
    {
      files: {
        [UI_GLOBALS]: ".scroll-fade-x { --fade-start-stop: 0%; }\n",
        "packages/ui/src/lib/scroll.ts": 'export const SCROLL_FADE_X_CLASS = "scroll-fade-x";\n',
        "packages/client/src/feature.tsx": 'export const probe = <div className="scroll-fade-x" />;\n',
      },
      why: "a universal UI mechanism with a UI-owned driver may also have client consumers",
    },
    {
      files: {
        [CLIENT_GLOBALS]: 'html[data-blur-modals] [data-slot="dialog-popup"] { backdrop-filter: blur(1rem); }\n',
        "packages/ui/src/primitives/dialog.tsx": 'export const dialog = <div data-slot="dialog-popup" />;\n',
      },
      why: "a client appearance carrier may treat a UI primitive without becoming its component skin",
    },
    {
      files: { [SHELL]: ".shell-grid { display: grid; --rail-w: 3rem; }\n:root { view-transition-name: none; }\n" },
      why: "shell-rooted geometry and the exact view-transition reset remain in the shell home",
    },
    {
      files: { [UI_GLOBALS]: "/* @layer base { .fake { color: red; } } */\n:root { font-size: 100%; }\n" },
      why: "comment text cannot manufacture an authored-layer finding",
    },
  ],
};
