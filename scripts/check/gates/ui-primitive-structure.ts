// Gate: ui-primitive-structure (core/UI-Primitives-and-Reuse.md §13.7) — the
// structure gate @orb/ui shipped without, which is why it drifted. Eight clauses (5 AST, 3
// filesystem) turning each measured divergence into a build failure. See the contract for the WHY
// of each; this file is the enforcer.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { CheckContext, Violation } from "../harness.ts";

const UI_SRC = "/packages/ui/src/";
const PRIMITIVES = "packages/ui/src/primitives";

// §2.4 variants-exempt satellites UNDER primitives/ (icons = the lucide barrel; virtual-list AND
// message-list = sealed TanStack Virtual wrappers — row styling is 100% owned by the caller's
// renderItem, so there's no skin for a tv() to own; file-trigger = headless render-prop, zero visual
// chrome of its own — the caller's OWN trigger element carries the skin). code-editor/content/markdown/
// lib/layout/stream live outside primitives/.
const VARIANTS_EXEMPT = new Set([
  "icons",
  "virtual-list",
  "message-list",
  "aria-announcer",
  "file-trigger",
]);
// §4.1 the ONLY test-exempt primitive (a trivial re-export).
const TEST_EXEMPT = new Set(["icons", "aria-announcer"]);
// §4.3 clause 6 — drawer-local providers are the sole inline-provider allowlist (fail-closed: every
// OTHER identifier ending in "Provider" inside a .ct.tsx/.fixtures.tsx is a re-drift).
const PROVIDER_ALLOW = new Set(["DrawerProvider", "DrawerVirtualKeyboardProvider"]);

// Clause 8 — the two overlay sub-families (contract clause 8, verified 2026-07-02).
const ANCHORED = new Set(["popover", "menu", "select", "autocomplete", "tooltip"]);
const MODAL = new Set(["dialog", "alert-dialog", "drawer"]);

const CT_TEST_RE = /\/tests\/ui\/.*\.ct\.tsx$/u;
const CT_OR_FIXTURE_RE = /\/tests\/ui\/.*\.(?:ct|fixtures)\.tsx$/u;
const VARIANTS_SPEC_RE = /(?:^|\/)variants$/u;
// The `\\?` before each `\(` also catches the REGEX form `oklch\(…\)` (an escaped paren in a regex
// literal) — diff.ct.tsx once smuggled color literals as match-regexes that the bare `oklch(` missed.
const COLOR_LITERAL_RE = /oklch\\?\(|\brgba?\\?\(|#[0-9a-fA-F]{3,8}\b/u;

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
  return (
    init !== undefined && Node.isCallExpression(init) && init.getExpression().getText() === "tv"
  );
}

/** Clause 2 — each primitive variants.ts exports exactly one `tv()` named `{camelName}Variants`. */
function clauseVariantsNaming(ctx: CheckContext): Violation[] {
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
    const expected = `${camelCase(name)}Variants`;
    const only = tvExports[0];
    if (tvExports.length !== 1 || only === undefined) {
      out.push({
        file: relPath(ctx.root, abs),
        line: 1,
        message: `variants.ts must export exactly one tv() const (found ${tvExports.length}); the one styled primitive per dir owns one styling contract named ${expected} (UI-Primitives-and-Reuse.md §13.7).`,
      });
      continue;
    }
    const actual = only.getName();
    if (actual !== expected) {
      out.push({
        file: relPath(ctx.root, abs),
        line: only.getStartLineNumber(),
        message: `tv export is '${actual}' — must be '${expected}' ({camelName}Variants, UI-Primitives-and-Reuse.md §13.7).`,
      });
    }
  }
  return out;
}

/** Clause 3 — no index.ts re-exports from ./variants (variants stays internal, §2.2). */
function clauseNoLeak(ctx: CheckContext): Violation[] {
  const out: Violation[] = [];
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
        out.push({
          file: relPath(ctx.root, path),
          line: exp.getStartLineNumber(),
          message:
            "index.ts re-exports './variants' — the cva is internal; never leak it through the public front door (UI-Primitives-and-Reuse.md §13.7).",
        });
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
const COLOR_LITERAL_TEST_EXEMPT = new Set([
  "theme-scope.ct.tsx",
  "color-field.ct.tsx",
  "sandbox-frame.ct.tsx",
]);

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
    sf.getFullText()
      .split("\n")
      .forEach((text, i) => {
        if (COLOR_LITERAL_RE.test(text)) {
          out.push({
            file: relPath(ctx.root, path),
            line: i + 1,
            message:
              "hardcoded color literal in a .ct.tsx — assert toHaveCSS(prop, TOKENS[path].value) instead (UI-Primitives-and-Reuse.md §13.7).",
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

/** Clause 6 — no inline <*Provider> in a .ct.tsx/.fixtures.tsx (drawer-local allowlisted). */
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
    const text = sf.getFullText();
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
    if (!sf.getFullText().includes("data-slot")) {
      out.push({
        file: relPath(ctx.root, abs),
        line: 1,
        message:
          'no data-slot locator — every primitive part carries data-slot="<name>-<part>" (the CT locator surface, UI-Primitives-and-Reuse.md §13.7).',
      });
    }
  }
  return out;
}

/** The 9-clause scan (5 fs + 4 AST) shared by the legacy Check and the single-pass `run` descriptor. */
function scanUiPrimitiveStructure(ctx: CheckContext): Violation[] {
  return [
    ...clauseTrio(ctx.root),
    ...clauseVariantsNaming(ctx),
    ...clauseNoLeak(ctx),
    ...clauseTest(ctx.root),
    ...clauseNoColorLiterals(ctx),
    ...clauseNoInlineProvider(ctx),
    ...clauseNoInlineSvg(ctx),
    ...clauseOverlayAnatomy(ctx),
    ...clauseDataSlot(ctx),
  ];
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — an fs+AST structure gate via `run`, fsBacked) ────────────────
// ui-primitive-structure reads the real fs (readdirSync of primitives/, existsSync of the trio + CT) in 5
// clauses AND the AST (variants naming / no-leak / color literals / inline provider / inline svg / overlay
// anatomy / data-slot) via the shared Project. A `run` descriptor over ctx reuses the exact 9-clause scan,
// `fsBacked` so conformance materializes the primitive dir + CT fixtures into a real temp dir (the AST
// clauses read the same temp-dir Project). Distinct per-clause messages → per-occurrence overrides. Ported
// BYTE-IDENTICAL — the §2.4 comment-range upgrade is a SEPARATE intended change, NOT part of this port.
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
    for (const v of scanUiPrimitiveStructure({ root: ctx.root, project: ctx.project })) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        // A styled primitive dir missing its variants.ts + index.ts (only the .tsx) AND no co-located CT.
        "packages/ui/src/primitives/thing/thing.tsx":
          'export const Thing = () => <div data-slot="thing" />;\n',
      },
      expect: { messageIncludes: "missing" },
      why: "a primitive dir missing its trio (no index.ts / variants.ts) and no co-located CT — §13.7 violations",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/primitives/thing/thing.tsx":
          'export const Thing = () => <div data-slot="thing" />;\n',
        "packages/ui/src/primitives/thing/index.ts": 'export { Thing } from "./thing";\n',
        "packages/ui/src/primitives/thing/variants.ts":
          'import { tv } from "#lib";\nexport const thingVariants = tv({ base: "block" });\n',
        "tests/ui/primitives/thing/thing.ct.tsx": "export const t = 1;\n",
      },
      why: "a complete styled primitive (trio + correctly-named tv() + data-slot + co-located CT) — the §13.7 shape, passes",
    },
  ],
};
