// Gate: ui-primitive-structure (core/UI-Primitives-and-Reuse.md §13.7) — the
// structure gate @orb/ui shipped without, which is why it drifted. Eight clauses (5 AST, 3
// filesystem) turning each measured divergence into a build failure. See the contract for the WHY
// of each; this file is the enforcer. DECLARED LIMIT: clause 5 (and its stale arm) skip COMMENT spans
// (issue #117) and NARRATION spans — a test title / an expect() message is prose, so `#483` there is an
// issue citation, not a color (issue #507) — and its color-function arm needs a channel DIGIT, so a
// format-only `/^oklch\(/` passes. Every other string scans, interpolated titles included.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile, Node as TsMorphNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { CheckContext, Violation } from "../contract/harness.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { testNarrationSpans } from "../lib/test-narration.ts";

/** A NODE-anchored hit — never a `{file,line,message}` Finding literal (finding-overload-provenance): the
 *  node carries its own position, and `token` folds the per-occurrence detail the gate's static `message`
 *  can't. */
interface Hit {
  readonly node: TsMorphNode;
  readonly token: string;
}

const UI_SRC = "/packages/ui/src/";
const PRIMITIVES = "packages/ui/src/primitives";

// §2.4 variants-exempt satellites UNDER primitives/ (icons = the lucide barrel; virtual-list AND
// message-list = sealed TanStack Virtual wrappers — row styling is 100% owned by the caller's
// renderItem, so there's no skin for a tv() to own; file-trigger = headless render-prop, zero visual
// chrome of its own — the caller's OWN trigger element carries the skin). code-editor/content/markdown/
// lib/layout/stream live outside primitives/.
const VARIANTS_EXEMPT = new Set(["icons", "virtual-list", "message-list", "aria-announcer", "file-trigger"]);
// §4.1 the ONLY test-exempt primitive (a trivial re-export).
const TEST_EXEMPT = new Set(["icons", "aria-announcer"]);
// §4.3 clause 6 — drawer-local providers are the sole inline-provider allowlist (fail-closed: every
// OTHER identifier ending in "Provider" inside a .ct.tsx/.fixtures.tsx is a re-drift).
const PROVIDER_ALLOW = new Set(["DrawerProvider", "DrawerVirtualKeyboardProvider"]);

// Clause 8 — the two overlay sub-families (contract clause 8, verified 2026-07-02).
const ANCHORED = new Set(["popover", "menu", "select", "autocomplete", "tooltip"]);
const MODAL = new Set(["dialog", "alert-dialog", "drawer"]);

const GATE_SELF = "tooling/src/verify/gates/ui-primitive-structure.ts";
/** Real-tree anchor (GATE-AUTHORING.md §4.5): a primitive every real run has and no example builds (the
 *  examples all invent `thing`/`x`-shaped dirs). */
const ANCHOR_PRIMITIVE = "button";
const STALE_DIR = (table: string, name: string): string =>
  `stale ${table} row — \`${name}\` is not a primitive directory any more (ratchet down): the exemption ` +
  "names nothing, and it would silently re-attach to a future primitive that reuses the name. Delete the " +
  `row in ${GATE_SELF}.`;
const STALE_PROVIDER = (tag: string): string =>
  `stale PROVIDER_ALLOW row — \`<${tag}>\` appears in no .ct.tsx/.fixtures.tsx any more, so the inline-` +
  "provider allowlist is a standing grant on a NAME (ratchet down): clause 6 is fail-closed by design, and " +
  `a dead row is the one hole in it. Delete the row in ${GATE_SELF}.`;
const STALE_COLOR = (name: string, reason: string): string =>
  `stale COLOR_LITERAL_TEST_EXEMPT row — \`${name}\` ${reason} (ratchet down): the row claims this test ` +
  "exercises hostile color VALUES as data; when that stops being true it is just a file exempted from the " +
  `assert-via-TOKENS rule for free. Delete the row in ${GATE_SELF}.`;

const CT_TEST_RE = /\/tests\/ui\/.*\.ct\.tsx$/u;
const CT_OR_FIXTURE_RE = /\/tests\/ui\/.*\.(?:ct|fixtures)\.tsx$/u;
const VARIANTS_SPEC_RE = /(?:^|\/)variants$/u;
// The `\\?` before each `\(` also catches the REGEX form `oklch\(…\)` (an escaped paren in a regex
// literal) — diff.ct.tsx once smuggled color literals as match-regexes that the bare `oklch(` missed.
// The VALUE LOOKAHEAD (issue #507) keeps that mechanism while narrowing it to what the clause is for: a
// color FUNCTION carrying no channel digits at all (`/^oklch\(/`, asserting the computed FORMAT an arm
// produces) is not a hardcoded color — it cannot go stale on a palette change. A smuggled
// `/^oklch\(0\.5/` still carries digits and still fires.
const COLOR_LITERAL_RE = /(?:oklch|\brgba?)\\?\((?=[^)\n]*\d)|#[0-9a-fA-F]{3,8}\b/u;

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function camelCase(kebab: string): string {
  return kebab.replace(/-(?<letter>[a-z])/gu, (_m, c: string) => c.toUpperCase());
}

function primitiveDirs(root: string): string[] {
  const base = join(root, PRIMITIVES);
  if (!existsSync(base)) {
    return [];
  }
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Clause 1 — the trio (`<name>.tsx` + `index.ts` + `variants.ts`) unless variants-exempt. (fs) */
function clauseTrio(root: string): Violation[] {
  const out: Violation[] = [];
  for (const name of primitiveDirs(root)) {
    if (VARIANTS_EXEMPT.has(name)) {
      continue;
    }
    const dir = join(root, PRIMITIVES, name);
    for (const required of [`${name}.tsx`, "index.ts", "variants.ts"]) {
      if (!existsSync(join(dir, required))) {
        out.push({
          file: `${PRIMITIVES}/${name}/`,
          line: 0,
          message: `missing ${required} — a styled primitive is EXACTLY {name}.tsx + index.ts + variants.ts (UI-Primitives-and-Reuse.md §13.7), or add it to the variants-exempt allowlist.`,
        });
      }
    }
  }
  return out;
}

/** Clause 4 — co-located CT test per styled primitive (except icons). (fs) */
function clauseTest(root: string): Violation[] {
  const out: Violation[] = [];
  for (const name of primitiveDirs(root)) {
    if (TEST_EXEMPT.has(name)) {
      continue;
    }
    const test = join(root, "tests/ui/primitives", name, `${name}.ct.tsx`);
    if (!existsSync(test)) {
      out.push({
        file: `${PRIMITIVES}/${name}/`,
        line: 0,
        message: `no co-located CT — expected tests/ui/primitives/${name}/${name}.ct.tsx (UI-Primitives-and-Reuse.md §13.7).`,
      });
    }
  }
  return out;
}

function isTvCall(decl: VariableDeclaration): boolean {
  const init = decl.getInitializer();
  return init !== undefined && Node.isCallExpression(init) && init.getExpression().getText() === "tv";
}

/** Clause 2a — each primitive variants.ts exports exactly one `tv()` const. FILE-LEVEL by nature (no tv
 *  export at all is nothing to anchor a node on) — kept in its OWN function, deliberately not sharing scope
 *  with a position-API call, so finding-overload-provenance's node-position-in-scope arm cannot mistake this
 *  literal for one (GATE-AUTHORING.md §1). */
function clauseVariantsCount(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
  for (const name of primitiveDirs(ctx.root)) {
    if (VARIANTS_EXEMPT.has(name)) {
      continue;
    }
    const abs = join(ctx.root, PRIMITIVES, name, "variants.ts");
    const sf = ctx.project.getSourceFile(abs);
    if (sf === undefined) {
      continue; // clause 1 already reports a missing variants.ts
    }
    const tvExports = sf.getVariableDeclarations().filter((d) => d.isExported() && isTvCall(d));
    if (tvExports.length !== 1) {
      const expected = `${camelCase(name)}Variants`;
      out.push({
        file: relPath(ctx.root, abs),
        line: 1,
        message: `variants.ts must export exactly one tv() const (found ${tvExports.length}); the one styled primitive per dir owns one styling contract named ${expected} (UI-Primitives-and-Reuse.md §13.7).`,
      });
    }
  }
  return out;
}

/** Clause 2b — the one `tv()` export is named `{camelName}Variants`. NODE-anchored (the declaration). */
function clauseVariantsNamingHits(ctx: CheckContext): Hit[] {
  const out: Hit[] = [];
  for (const name of primitiveDirs(ctx.root)) {
    if (VARIANTS_EXEMPT.has(name)) {
      continue;
    }
    const abs = join(ctx.root, PRIMITIVES, name, "variants.ts");
    const sf = ctx.project.getSourceFile(abs);
    if (sf === undefined) {
      continue;
    }
    const tvExports = sf.getVariableDeclarations().filter((d) => d.isExported() && isTvCall(d));
    const only = tvExports[0];
    if (tvExports.length !== 1 || only === undefined) {
      continue; // clauseVariantsCount already reports this
    }
    const expected = `${camelCase(name)}Variants`;
    const actual = only.getName();
    if (actual !== expected) {
      out.push({ node: only, token: `tv-export-name:${actual}` });
    }
  }
  return out;
}

/** Clause 3 — no index.ts re-exports from ./variants (variants stays internal, §2.2). NODE-anchored. */
function clauseNoLeakHits(ctx: CheckContext): Hit[] {
  const out: Hit[] = [];
  for (const sf of ctx.project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!path.includes(UI_SRC)) {
      continue;
    }
    if (!path.endsWith("/index.ts")) {
      continue;
    }
    for (const exp of sf.getExportDeclarations()) {
      const spec = exp.getModuleSpecifierValue();
      if (spec !== undefined && VARIANTS_SPEC_RE.test(spec)) {
        out.push({ node: exp, token: "variants-leak" });
      }
    }
  }
  return out;
}

// Files legitimately testing arbitrary/hostile COLOR VALUES as data (the D44 clamp mechanism, or a
// primitive whose entire job is accepting a caller-supplied color) — never a design-token color, so
// the "assert via TOKENS" rule doesn't apply. theme-scope originated this exemption; color-field is
// the same shape (its clamp-rejection tests need literal url()/expression() attempts and its
// commit tests need literal hex — see ui-primitive-carve-out-work-order.md item 13). sandbox-frame
// joined 2026-07 — its hostile-themeTokens CT reuses theme-scope's `isSafeColor` clamp and needs the
// same literal-hex/url() rejection inputs.
const COLOR_LITERAL_TEST_EXEMPT = new Set(["theme-scope.ct.tsx", "color-field.ct.tsx", "sandbox-frame.ct.tsx"]);

// Clause 5's POSITION FENCE (issue #507). The color scan is a TEXT scan, so it judges a string by its
// spelling alone — and `#483` in `test("#483 …")` is an issue citation the whole repo writes, read as a
// 3-digit hex. Two lanes routed around it by rewording titles. The fence is a POSITION predicate, not a
// looser regex: a string literal sitting in a test's own NARRATION — the title argument of a test-like
// call, or `expect()`'s message argument — is prose, never a style value. Everything else still scans,
// including a bare `const c = "#abc"` and a color in a toHaveCSS/style argument.
function narrationSpans(sf: SourceFile): readonly { readonly pos: number; readonly end: number }[] {
  return sf.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap(testNarrationSpans);
}

/** The text clause 5 and its stale arm BOTH judge: comments blanked (issue #117) then narration blanked
 *  (issue #507). Blanking is length-preserving, so `i + 1` stays the real line. */
function colorScanText(sf: SourceFile): string {
  let text = blankTsComments(sf);
  // Descending, so an earlier blank can never move a later span's offsets.
  for (const span of [...narrationSpans(sf)].sort((a, b) => b.pos - a.pos)) {
    const blanked = text.slice(span.pos, span.end).replace(/[^\n]/gu, " ");
    text = text.slice(0, span.pos) + blanked + text.slice(span.end);
  }
  return text;
}

/** Clause 5 — no token-color literals in any .ct.tsx (§4.2); the exempt set tests the mechanism. */
function clauseNoColorLiterals(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
  for (const sf of ctx.project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!CT_TEST_RE.test(path)) {
      continue;
    }
    if ([...COLOR_LITERAL_TEST_EXEMPT].some((name) => path.endsWith(`/${name}`))) {
      continue;
    }
    colorScanText(sf)
      .split("\n")
      .forEach((text, i) => {
        if (COLOR_LITERAL_RE.test(text)) {
          out.push({
            file: relPath(ctx.root, path),
            line: i + 1,
            message: "hardcoded color literal in a .ct.tsx — assert toHaveCSS(prop, TOKENS[path].value) instead (UI-Primitives-and-Reuse.md §13.7).",
          });
        }
      });
  }
  return out;
}

function jsxElements(sf: SourceFile): { tag: string; line: number }[] {
  const opens = sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
  const selfs = sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
  return [...opens, ...selfs].map((el) => ({
    tag: el.getTagNameNode().getText(),
    line: el.getStartLineNumber(),
  }));
}

/** Clause 6 — no inline `<*Provider>` in a .ct.tsx/.fixtures.tsx (drawer-local allowlisted). */
function clauseNoInlineProvider(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
  for (const sf of ctx.project.getSourceFiles()) {
    if (!CT_OR_FIXTURE_RE.test(sf.getFilePath())) {
      continue;
    }
    for (const { tag, line } of jsxElements(sf)) {
      if (tag.endsWith("Provider") && !PROVIDER_ALLOW.has(tag)) {
        out.push({
          file: relPath(ctx.root, sf.getFilePath()),
          line,
          message: `inline <${tag}> in a test — global providers live in CtProviders (beforeMount); only drawer-local providers are allowlisted (UI-Primitives-and-Reuse.md §13.7).`,
        });
      }
    }
  }
  return out;
}

/** Clause 7 — no inline glyph <svg> in a ui component outside the charts/** data-viz allowlist. */
function clauseNoInlineSvg(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
  for (const sf of ctx.project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!path.includes(UI_SRC)) {
      continue;
    }
    if (!path.endsWith(".tsx")) {
      continue;
    }
    if (path.includes("/charts/")) {
      continue;
    }
    for (const { tag, line } of jsxElements(sf)) {
      if (tag === "svg") {
        out.push({
          file: relPath(ctx.root, path),
          line,
          message:
            "inline <svg> glyph — use the lucide seal via <Icon> from @orb/ui/icons; raw SVG is legal only in charts/** (UI-Primitives-and-Reuse.md §13.7).",
        });
      }
    }
  }
  return out;
}

/** Clause 8 (modal half) — a modal must use Backdrop + Popup and must NOT be anchored. */
function checkModal(name: string, rel: string, has: (part: string) => boolean): Violation[] {
  const out: Violation[] = [];
  if (!(has("Backdrop") && has("Popup"))) {
    out.push({
      file: rel,
      line: 1,
      message: `modal overlay '${name}' must use .Backdrop + .Popup (UI-Primitives-and-Reuse.md §13.7).`,
    });
  }
  if (has("Positioner")) {
    out.push({
      file: rel,
      line: 1,
      message: `modal overlay '${name}' must NOT have a .Positioner — modals are centered/edge-docked, not anchored (UI-Primitives-and-Reuse.md §13.7).`,
    });
  }
  return out;
}

/** Clause 8 — overlay anatomy: anchored need a Positioner; modals need a Backdrop and NO Positioner. */
function clauseOverlayAnatomy(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
  for (const name of primitiveDirs(ctx.root)) {
    const anchored = ANCHORED.has(name);
    const modal = MODAL.has(name);
    if (!(anchored || modal)) {
      continue;
    }
    const abs = join(ctx.root, PRIMITIVES, name, `${name}.tsx`);
    const sf = ctx.project.getSourceFile(abs);
    if (sf === undefined) {
      continue;
    }
    // CODE, not file text (issue #117/#132): a seal's header routinely names the parts it does and does
    // not render (`.Positioner`, `.Popup`), so a file-text read both invents parts and satisfies the
    // requirement for them.
    const text = blankTsComments(sf);
    const has = (part: string): boolean => text.includes(`.${part}`);
    const rel = relPath(ctx.root, abs);
    if (anchored && has("Popup") && !has("Positioner")) {
      out.push({
        file: rel,
        line: 1,
        message: `anchored overlay '${name}' has a .Popup but no .Positioner — trigger-anchored floats need Portal→Positioner→Popup (UI-Primitives-and-Reuse.md §13.7).`,
      });
    }
    if (modal) {
      out.push(...checkModal(name, rel, has));
    }
  }
  return out;
}

/** Clause 9 — every styled primitive's `<name>.tsx` carries at least one `data-slot` locator (§2.3).
 * The CT-locator surface the audit found drifting: a slot-less part forces xpath/parent-hop tests.
 * Single-element primitives still tag their root (`data-slot="button"`), so a locator beats matching
 * by role when several are on screen. variants-exempt sealed wrappers (icons/virtual-list/message-list)
 * are skipped — their skin is the wrapped lib. */
function clauseDataSlot(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
  for (const name of primitiveDirs(ctx.root)) {
    if (VARIANTS_EXEMPT.has(name)) {
      continue;
    }
    const abs = join(ctx.root, PRIMITIVES, name, `${name}.tsx`);
    const sf = ctx.project.getSourceFile(abs);
    if (sf === undefined) {
      continue; // clause 1 already reports the missing .tsx
    }
    // CODE, not file text: a comment explaining the data-slot locator law would satisfy this clause
    // for a primitive that stamps no locator at all — the permissive direction.
    if (!blankTsComments(sf).includes("data-slot")) {
      out.push({
        file: relPath(ctx.root, abs),
        line: 1,
        message: 'no data-slot locator — every primitive part carries data-slot="<name>-<part>" (the CT locator surface, UI-Primitives-and-Reuse.md §13.7).',
      });
    }
  }
  return out;
}

/** The 9-clause scan (5 fs + 4 AST) the single-pass `run` descriptor reports. */
function scanUiPrimitiveStructure(ctx: CheckContext): Violation[] {
  return [
    ...clauseTrio(ctx.root),
    ...clauseVariantsCount(ctx),
    ...clauseTest(ctx.root),
    ...clauseNoColorLiterals(ctx),
    ...clauseNoInlineProvider(ctx),
    ...clauseNoInlineSvg(ctx),
    ...clauseOverlayAnatomy(ctx),
    ...clauseDataSlot(ctx),
  ];
}

/** The NODE-anchored clauses (2b/3), reported through `ctx.report(node, …)`, never the Finding overload. */
function scanUiPrimitiveStructureHits(ctx: CheckContext): Hit[] {
  return [...clauseVariantsNamingHits(ctx), ...clauseNoLeakHits(ctx)];
}

/** TWO-SIDED (GATE-AUTHORING.md §4.4): all four exemption tables ratchet DOWN. Each is keyed on a NAME —
 *  a primitive dir, a JSX identifier, a test filename — which is exactly the loaded-gun shape: a dead row
 *  keeps granting, and the next thing to take that name inherits it. Guarded on a REAL-TREE ANCHOR (§4.5):
 *  a primitive every real run has and no example builds. */
function staleExemptionRows(ctx: CheckContext): Violation[] {
  if (!existsSync(join(ctx.root, PRIMITIVES, ANCHOR_PRIMITIVE))) {
    return []; // synthetic tree — these are whole-tree claims
  }
  const out: Violation[] = [];
  const row = (message: string): Violation => ({ file: GATE_SELF, line: 1, message });
  const dirs = new Set(primitiveDirs(ctx.root));
  for (const [table, names] of [
    ["VARIANTS_EXEMPT", VARIANTS_EXEMPT],
    ["TEST_EXEMPT", TEST_EXEMPT],
  ] as const) {
    for (const name of names) {
      if (!dirs.has(name)) {
        out.push(row(STALE_DIR(table, name)));
      }
    }
  }
  const testFiles = ctx.project.getSourceFiles().filter((sf) => CT_OR_FIXTURE_RE.test(sf.getFilePath()));
  const renderedTags = new Set(testFiles.flatMap((sf) => jsxElements(sf).map((e) => e.tag)));
  for (const tag of PROVIDER_ALLOW) {
    if (!renderedTags.has(tag)) {
      out.push(row(STALE_PROVIDER(tag)));
    }
  }
  for (const name of COLOR_LITERAL_TEST_EXEMPT) {
    const sf = testFiles.find((f) => f.getFilePath().endsWith(`/${name}`));
    if (sf === undefined) {
      out.push(row(STALE_COLOR(name, "is not in the project any more")));
      continue;
    }
    // The SAME blanked text clause 5 judges: a row kept alive only by a color spelling quoted in a
    // comment — or in a test TITLE — would be a promise about a file that no longer exercises hostile
    // values.
    const lines = colorScanText(sf).split("\n");
    if (!lines.some((line) => COLOR_LITERAL_RE.test(line))) {
      out.push(row(STALE_COLOR(name, "carries no color literal any more")));
    }
  }
  return out;
}

// Reads the real fs (readdirSync of primitives/, existsSync of the trio + CT) AND the AST (variants
// naming / no-leak / color literals / inline provider / inline svg / overlay anatomy / data-slot).
//
export const gate: GateDescriptor = {
  name: "ui-primitive-structure",
  docRow: "core/UI-Primitives-and-Reuse.md §13.7",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "an @orb/ui primitive violates the §13.7 structure discipline — a missing trio (name.tsx/index.ts/variants.ts), a mis-named/duplicated tv() export, a leaked ./variants re-export, a missing co-located CT, a hardcoded color literal or inline <*Provider>/<svg> in a test/component, a wrong overlay anatomy, or a missing data-slot locator (UI-Primitives-and-Reuse.md §13.7).",
  fix: "restore the trio, name the tv() `{camelName}Variants`, keep ./variants internal, add the co-located CT, assert colors via TOKENS, and give each primitive part a data-slot locator (UI-Primitives-and-Reuse.md §13.7).",
  run: (ctx) => {
    const checkCtx: CheckContext = { root: ctx.root, project: ctx.project };
    for (const v of [...scanUiPrimitiveStructure(checkCtx), ...staleExemptionRows(checkCtx)]) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    for (const hit of scanUiPrimitiveStructureHits(checkCtx)) {
      ctx.report(hit.node, { token: hit.token, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: {
        // Clause 1 — a styled primitive dir missing its variants.ts + index.ts (only the .tsx) AND no CT.
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;\n',
      },
      expect: { messageIncludes: "missing index.ts" },
      why: "clause 1 — a primitive dir missing its trio (no index.ts / variants.ts) — §13.7",
    },
    {
      files: {
        // Clause 2 — variants.ts exports a tv() with the WRONG name (`thingVariants` expected).
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;\n',
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const wrongVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      expect: { token: "tv-export-name:wrongVariants" },
      why: "clause 2 — a mis-named tv() export (must be {camelName}Variants) — §13.7",
    },
    {
      files: {
        // Clause 5's INTERPOLATION control (2026-08-24): the narration fence now reaches a template TITLE,
        // and this is the half that proves it did not go permissive. The blanking covers the template's
        // literal CHUNKS only — a color smuggled through a SUBSTITUTION is code, and code still scans.
        "tests/ui/primitives/thing/thing.ct.tsx": 'test(`the seal ${"oklch(0.5 0.1 20)"}`, () => {\n  expect(1).toBe(1);\n});\n',
      },
      expect: { messageIncludes: "hardcoded color literal" },
      why: "clause 5 — the interpolated-title fence is PROSE-only: a color literal inside a `${…}` substitution is CODE and still reds, which is the ruling the old declared limit was protecting",
    },
    {
      files: {
        // Clause 9 COMMENT POSTURE (issue #117/#132): the locator is read from CODE, so a header EXPLAINING
        // the data-slot law does not stand in for stamping one.
        "packages/ui/src/primitives/thing/thing.tsx":
          '// Every part carries data-slot="<name>-<part>" — this one is a single element, so its root takes it.\nexport const Thing = () => <div className="block" />;\n',
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      expect: { messageIncludes: "no data-slot locator" },
      why: "COMMENT POSTURE in the PERMISSIVE direction: a primitive whose comment quotes the locator law stamps NO locator, and every CT that tries to reach it fails — a file-text read hands it the pass",
    },
    {
      files: {
        // Clause 3 — a ui index.ts re-exports the internal ./variants module.
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\nexport * from "./variants";\n',
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      expect: { token: "variants-leak" },
      why: "clause 3 — index.ts leaks the internal ./variants module — §13.7",
    },
    {
      files: {
        // Clause 5 — a hardcoded color literal in a non-exempt .ct.tsx.
        "tests/ui/primitives/thing/thing.ct.tsx": 'export const c = "oklch(0.5 0.1 200)";\n',
      },
      expect: { messageIncludes: "hardcoded color literal" },
      why: "clause 5 — a token-color literal in a .ct.tsx (assert via TOKENS) — §13.7",
    },
    {
      files: {
        // Issue #117, live half: the citation comment is skipped, the AUTHORED value on the next line is not.
        "tests/ui/primitives/thing/thing.ct.tsx": '// issue #103: the monogram band\nexport const c = "#abc";\n',
      },
      expect: { count: 1, line: 2 },
      why: "issue #117 — comment blanking must not blunt clause 5: the authored `#abc` still REDs, attributed to line 2 (the value), not line 1 (the citation)",
    },
    {
      files: {
        // Issue #507, the PERMISSIVE half of the narration fence: the fence blanks the TITLE, and only the
        // title — the toHaveCSS argument on the next line is a real style value and still REDs.
        "tests/ui/primitives/thing/thing.ct.tsx":
          'test("#483 the band paints the muted pair", async () => {\n  await expect(el).toHaveCSS("color", "#abc");\n});\n',
      },
      expect: { count: 1, line: 2 },
      why: "issue #507 — the position fence must not become a regex loosening: a `#abc` in a toHaveCSS argument is exactly what clause 5 exists for, and it fires even when the same file's TITLE carries a citation",
    },
    // Issue #507's old DECLARED-LIMIT mustFlag row ("an interpolated title keeps scanning") was
    // REPEALED 2026-08-24: the fence now blanks a template's literal head/middle/tail chunks (only
    // its `${…}` interpolations stay CODE), so a citation-shaped literal in a template title no
    // longer fires. The blanked-template-title case is now a mustPass proof; the "color inside `${…}`
    // still fires" case is its sibling mustFlag row below.
    {
      files: {
        // The founding REGEX-SMUGGLING shape (diff.ct.tsx) re-proven under the #507 value lookahead: a
        // match-regex carrying channel digits is a hardcoded color wearing a regex literal's clothes.
        "tests/ui/primitives/thing/thing.ct.tsx": "const arm = /^oklch\\(0\\.5 0\\.1 200/;\nexport const a = arm;\n",
      },
      expect: { count: 1, line: 1 },
      why: "clause 5's regex arm — the value lookahead narrows the color-function match to VALUE-bearing ones without releasing the smuggled-literal shape the arm was minted for",
    },
    {
      files: {
        // Clause 6 — an inline non-allowlisted <*Provider> in a .ct.tsx.
        "tests/ui/primitives/thing/thing.ct.tsx": "export const T = () => <ThemeProvider><div /></ThemeProvider>;\n",
      },
      expect: { messageIncludes: "<ThemeProvider>" },
      why: "clause 6 — an inline provider in a test (global providers live in CtProviders) — §13.7",
    },
    {
      files: {
        // Clause 7 — an inline glyph <svg> in a ui component outside charts/**.
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <svg data-slot="thing" />;\n',
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      expect: { messageIncludes: "inline <svg> glyph" },
      why: "clause 7 — a raw <svg> glyph in a ui component (use the lucide seal) — §13.7",
    },
    {
      files: {
        // Clause 8 — a MODAL overlay (dialog) with a wrong anatomy: a .Positioner (anchored-only part).
        "packages/ui/src/primitives/dialog/dialog.tsx":
          'export const Dialog = () => <div data-slot="dialog">{Root.Backdrop}{Root.Popup}{Root.Positioner}</div>;\ndeclare const Root: Record<string, unknown>;\n',
        "packages/ui/src/primitives/dialog/index.ts": 'export { Dialog } from "./dialog";\n',
        "packages/ui/src/primitives/dialog/variants.ts": 'import { tv } from "#lib";\nexport const dialogVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/dialog/dialog.ct.tsx": "export const t = 1;\n",
      },
      expect: { messageIncludes: "must NOT have a .Positioner" },
      why: "clause 8 — a modal overlay carrying an anchored-only .Positioner — §13.7",
    },
    {
      files: {
        // Clause 9 — a styled primitive .tsx with NO data-slot locator.
        "packages/ui/src/primitives/thing/thing.tsx": "export const Thing = () => <div />;\n",
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      expect: { messageIncludes: "no data-slot locator" },
      why: "clause 9 — a primitive part with no data-slot locator (the CT locator surface) — §13.7",
    },
    {
      files: {
        // Only the ANCHOR primitive exists, complete and compliant — so every clause passes and the ONLY
        // findings are the stale rows: five variants-exempt dirs, two test-exempt dirs, two allowlisted
        // provider tags and three color-literal test files that this tree does not have.
        "packages/ui/src/primitives/button/button.tsx": 'export const Button = () => <button data-slot="button" />;\n',
        "packages/ui/src/primitives/button/index.ts": 'export { Button } from "./button";\n',
        "packages/ui/src/primitives/button/variants.ts": 'import { tv } from "#lib";\nexport const buttonVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/button/button.ct.tsx": "export const t = 1;\n",
      },
      expect: { messageIncludes: "stale VARIANTS_EXEMPT row" },
      why: "THE STALE ARMS: with the anchor primitive present the four name-keyed tables are judged, and every row that names something this tree does not have ratchets down — a dead row here is a grant waiting for a namesake to inherit it",
    },
  ],
  mustPass: [
    {
      files: {
        // The anchor + EVERY exempted name occupied: the five variants-exempt satellites, the two
        // test-exempt ones, both allowlisted providers rendered in a fixture, and all three
        // color-literal test files carrying real color literals. Nothing stale, nothing flagged.
        "packages/ui/src/primitives/button/button.tsx": 'export const Button = () => <button data-slot="button" />;\n',
        "packages/ui/src/primitives/button/index.ts": 'export { Button } from "./button";\n',
        "packages/ui/src/primitives/button/variants.ts": 'import { tv } from "#lib";\nexport const buttonVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/button/button.ct.tsx": "export const t = 1;\n",
        "packages/ui/src/primitives/icons/index.ts": "export const icons = {};\n",
        "packages/ui/src/primitives/aria-announcer/index.ts": "export const announcer = {};\n",
        "packages/ui/src/primitives/virtual-list/index.ts": "export const list = {};\n",
        "packages/ui/src/primitives/message-list/index.ts": "export const list = {};\n",
        "packages/ui/src/primitives/file-trigger/index.ts": "export const trigger = {};\n",
        "tests/ui/primitives/virtual-list/virtual-list.ct.tsx": "export const t = 1;\n",
        "tests/ui/primitives/message-list/message-list.ct.tsx": "export const t = 1;\n",
        "tests/ui/primitives/file-trigger/file-trigger.ct.tsx": "export const t = 1;\n",
        "tests/ui/primitives/drawer/drawer.fixtures.tsx":
          "export const F = () => (\n  <DrawerProvider>\n    <DrawerVirtualKeyboardProvider />\n  </DrawerProvider>\n);\n",
        "tests/ui/content/theme-scope/theme-scope.ct.tsx": 'export const hostile = "#ff0000";\n',
        "tests/ui/primitives/color-field/color-field.ct.tsx": 'export const hostile = "#00ff00";\n',
        "tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx": 'export const hostile = "rgb(1, 2, 3)";\n',
      },
      why: "all four tables STILL EARNED, judged against the real-tree anchor: every exempted name is occupied and both color-literal claims are true, so the stale arms stay quiet — this row is also the written inventory of what each exemption is FOR",
    },
    {
      files: {
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;\n',
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      why: "a complete styled primitive (trio + correctly-named tv() + data-slot + co-located CT) — the §13.7 shape, passes",
    },
    {
      files: {
        "packages/ui/src/primitives/thing/thing.tsx": 'export const Thing = () => <div data-slot="thing" />;\n',
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts": 'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx":
          "// ── issue #103: the monogram hue band ──\n/* the old spelling was rgb(1, 2, 3) — quoted here, not authored */\nexport const t = 1;\n",
      },
      why: "issue #117 (the FP class this gate fired on twice in one day): an issue-number citation and a quoted color spelling live in COMMENTS — trivia the pure-AST harness skips — so a .ct.tsx citing #103 passes",
    },
    {
      files: {
        // Issue #507 — the same FP class in a STRING, which #117 never covered: three live sites
        // (empty-state, switch, use-chart-theme) cited an issue in a test TITLE and were reworded to route
        // around the gate. A title and an expect() message are the test's own NARRATION, never a style value.
        "tests/ui/primitives/thing/thing.ct.tsx":
          'test.describe("#469 the seal", () => {\n  test("#483 the landing is a real welcome", () => {\n    expect(1, "unchanged by #424").toBe(1);\n  });\n});\n',
      },
      why: "issue #507 — the narration position fence: a `#nnn` issue citation in a test title (any test/it/describe/suite form, including a modifier chain) or in an expect() message is prose the color scan must skip, so a CT may cite its issue the way every other test file in the repo does",
    },
    {
      files: {
        // Issue #507's second half (a live site, use-chart-theme.ct.tsx): a color FUNCTION with no channel
        // digits asserts the computed FORMAT an arm produces — it cannot go stale on a palette change.
        "tests/ui/primitives/thing/thing.ct.tsx": "export const BASE_ARM = /^oklch\\(/;\nexport const MIX = /^color-mix\\(/;\n",
      },
      why: "issue #507 — the value lookahead: a format-only `oklch(`/`rgb(` match carries no color VALUE, so it is not the hardcoded literal clause 5 bans (the mustFlag row above keeps the value-bearing regex red)",
    },
    {
      files: {
        // #507's THIRD form (2026-08-24): a PARAMETERIZED title — the house idiom for a two-arm rendered
        // pin — citing its issue. Only the template's literal chunks are blanked, so this passes while the
        // mustFlag twin (an interpolated color literal in the same position) still reds.
        "tests/ui/primitives/thing/thing.ct.tsx":
          "for (const arm of [1, 2]) {\n  test(`#693 the track reads as a graphic under ${String(arm)}`, () => {\n    expect(1).toBe(1);\n  });\n}\n",
      },
      why: "the interpolated-title fence: a `#nnn` citation in a backticked, parameterized test title is the same NARRATION a quoted one is — without this a lane's only way past the gate is rewording the title, the exact routing-around #507 exists to stop",
    },
  ],
};
