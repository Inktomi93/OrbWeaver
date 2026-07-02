// Gate: ui-primitive-structure (docs/architecture/proposed/ui-primitive-contract.md §5.2) — the
// structure gate @orb/ui shipped without, which is why it drifted. Eight clauses (5 AST, 3
// filesystem) turning each measured divergence into a build failure. See the contract for the WHY
// of each; this file is the enforcer.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const UI_SRC = "/packages/ui/src/";
const PRIMITIVES = "packages/ui/src/primitives";

// §2.4 variants-exempt satellites UNDER primitives/ (icons = the lucide barrel; virtual-list AND
// message-list = sealed TanStack Virtual wrappers — row styling is 100% owned by the caller's
// renderItem, so there's no skin for a tv() to own). code-editor/content/markdown/lib/layout/stream
// live outside primitives/.
const VARIANTS_EXEMPT = new Set(["icons", "virtual-list", "message-list"]);
// §4.1 the ONLY test-exempt primitive (a trivial re-export).
const TEST_EXEMPT = new Set(["icons"]);
// §4.3 clause 6 — drawer-local providers are the sole inline-provider allowlist (fail-closed: every
// OTHER identifier ending in "Provider" inside a .ct.tsx/.fixtures.tsx is a re-drift).
const PROVIDER_ALLOW = new Set(["DrawerProvider", "DrawerVirtualKeyboardProvider"]);

// Clause 8 — the two overlay sub-families (contract clause 8, verified 2026-07-02).
const ANCHORED = new Set(["popover", "menu", "select", "autocomplete", "tooltip"]);
const MODAL = new Set(["dialog", "alert-dialog", "drawer"]);

const CT_TEST_RE = /\/tests\/ui\/.*\.ct\.tsx$/u;
const CT_OR_FIXTURE_RE = /\/tests\/ui\/.*\.(?:ct|fixtures)\.tsx$/u;
const VARIANTS_SPEC_RE = /(?:^|\/)variants$/u;
const COLOR_LITERAL_RE = /oklch\(|\brgba?\(|#[0-9a-fA-F]{3,8}\b/u;

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
          message: `missing ${required} — a styled primitive is EXACTLY {name}.tsx + index.ts + variants.ts (contract §2), or add it to the §2.4 variants-exempt allowlist.`,
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
        message: `no co-located CT — expected tests/ui/primitives/${name}/${name}.ct.tsx (contract §4.1).`,
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
        message: `variants.ts must export exactly one tv() const (found ${tvExports.length}); the one styled primitive per dir owns one styling contract named ${expected} (contract §2.1).`,
      });
      continue;
    }
    const actual = only.getName();
    if (actual !== expected) {
      out.push({
        file: relPath(ctx.root, abs),
        line: only.getStartLineNumber(),
        message: `tv export is '${actual}' — must be '${expected}' ({camelName}Variants, contract §2.1).`,
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
            "index.ts re-exports './variants' — the cva is internal; never leak it through the public front door (contract §2.2).",
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
// commit tests need literal hex — see ui-primitive-carve-out-work-order.md item 13).
const COLOR_LITERAL_TEST_EXEMPT = new Set(["theme-scope.ct.tsx", "color-field.ct.tsx"]);

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
              "hardcoded color literal in a .ct.tsx — assert toHaveCSS(prop, TOKENS[path].value) instead (contract §4.2).",
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
          message: `inline <${tag}> in a test — global providers live in CtProviders (beforeMount); only drawer-local providers are allowlisted (contract §4.3).`,
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
            "inline <svg> glyph — use the lucide seal via <Icon> from @orb/ui/icons; raw SVG is legal only in charts/** (contract §3).",
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
      message: `modal overlay '${name}' must use .Backdrop + .Popup (contract clause 8).`,
    });
  }
  if (has("Positioner")) {
    out.push({
      file: rel,
      line: 1,
      message: `modal overlay '${name}' must NOT have a .Positioner — modals are centered/edge-docked, not anchored (contract clause 8).`,
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
        message: `anchored overlay '${name}' has a .Popup but no .Positioner — trigger-anchored floats need Portal→Positioner→Popup (contract clause 8).`,
      });
    }
    if (modal) {
      out.push(...checkModal(name, rel, has));
    }
  }
  return out;
}

export const uiPrimitiveStructure: Check = {
  name: "ui-primitive-structure",
  run: (ctx): Violation[] => [
    ...clauseTrio(ctx.root),
    ...clauseVariantsNaming(ctx),
    ...clauseNoLeak(ctx),
    ...clauseTest(ctx.root),
    ...clauseNoColorLiterals(ctx),
    ...clauseNoInlineProvider(ctx),
    ...clauseNoInlineSvg(ctx),
    ...clauseOverlayAnatomy(ctx),
  ],
};
