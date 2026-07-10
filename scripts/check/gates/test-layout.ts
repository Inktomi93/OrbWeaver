// Gate: test-layout (core/Core-0-Architecture-and-Structure.md §5 / core/Spine-Testing.md) — the central test mirror.
// Every test under tests/ must prefix-swap to a real source file: tests/<pkg>/<path>.<kind> ↔
// packages/<pkg>/src/<path>.<ext>. Exempts the two non-mirror trees tests/support/ + tests/e2e/.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Check, Violation } from "../harness.ts";

const PKGS = new Set(["kit", "contracts", "db", "server", "client", "ui"]);
// Most-specific suffixes first (so `.int.test.ts` isn't mis-stripped as `.test.ts`).
const KINDS = [
  ".suite.int.test.ts",
  ".suite.test.ts",
  ".suite.ct.tsx",
  ".int.test.ts",
  ".contract.test.ts",
  ".parity.test.ts",
  ".test-d.ts",
  ".ct.tsx",
  ".test.tsx",
  ".test.ts",
] as const;

function relPath(base: string, abs: string): string {
  return abs.startsWith(base) ? abs.slice(base.length + 1) : abs;
}

type SrcLoc = {
  readonly root: string;
  readonly pkg: string;
  readonly sub: string;
  readonly base: string;
  readonly ext: string;
};

function srcExistsFor(loc: SrcLoc): boolean {
  const file = join(loc.root, "packages", loc.pkg, "src", loc.sub, `${loc.base}${loc.ext}`);
  const dirIndex = join(loc.root, "packages", loc.pkg, "src", loc.sub, loc.base, `index${loc.ext}`);
  return existsSync(file) || existsSync(dirIndex);
}

function violationFor(root: string, rel: string, name: string): Violation | undefined {
  const segs = rel.split("/");
  const pkg = segs[0];
  // Non-mirror trees: support/ (fixtures), e2e/ (full-stack Playwright), tooling/ (tests of our root
  // configs + scripts/ gates — they have no packages/<pkg>/src module to mirror).
  if (pkg === "support" || pkg === "e2e" || pkg === "tooling") {
    return;
  }
  const kind = KINDS.find((k) => name.endsWith(k));
  if (kind === undefined) {
    return;
  }
  if (pkg === undefined || !PKGS.has(pkg)) {
    return {
      file: `tests/${rel}`,
      line: 0,
      message:
        "test outside a package mirror — expected tests/{kit,contracts,db,server,client}/… or tests/{support,e2e,tooling}/",
    };
  }
  // The differential oracle (.parity.test.ts) is authored BEFORE its source (BUILD-PLAN Phase 5
  // step 1 / CHECKLIST §C1: "write the runbook + fixture FIRST") and validates an assembled
  // cross-repo SURFACE (the SHAPE prompt + cache placement vs the steady clone), not a single source
  // module — so it is exempt from the 1:1 source-mirror requirement. It still must sit under a valid
  // package tree (the pkg check above), and is opt-in/skipped until chat assembly lands.
  if (kind === ".parity.test.ts") {
    return;
  }
  // Cross-cutting PROPERTY suites (`.suite.test.ts` / `.suite.int.test.ts`) validate a behaviour that spans
  // MANY source modules — a security-containment matrix, a cross-writer drift-equality — not one module, so
  // like `.parity.test.ts` they are exempt from the 1:1 source-mirror (they still sit under a valid package
  // tree, the pkg check above). The named containment suite (agent-principal-design/07 §4) + the stats
  // drift gate (stats.md inv #3) are the first; the seat wave's seated containment re-run extends the former.
  // `.suite.ct.tsx` is the BROWSER-lane twin: a cross-cutting Playwright-CT property suite that asserts
  // one behaviour across MANY primitives (the D62 touch-target floor over the whole interactive set) — it
  // mirrors no single primitive, same exemption rationale as the node `.suite.*` twins.
  if (kind === ".suite.int.test.ts" || kind === ".suite.test.ts" || kind === ".suite.ct.tsx") {
    return;
  }
  const base = name.slice(0, -kind.length);
  const sub = segs.slice(1, -1).join("/");
  // A `.tsx`-kind test (`.ct.tsx` / `.test.tsx`) may mirror EITHER a `.tsx` component OR a `.ts`
  // module — a CT that drives a hook FACTORY (no JSX in the source, but its effect/render behavior
  // needs a real browser) mirrors a `.ts` source. A `.ts`-kind test mirrors a `.ts` source only (a
  // node test can't import a `.tsx`-only component without a renderer).
  const exts = kind.endsWith(".tsx") ? [".tsx", ".ts"] : [".ts"];
  if (exts.some((ext) => srcExistsFor({ root, pkg, sub, base, ext }))) {
    return;
  }
  return {
    file: `tests/${rel}`,
    line: 0,
    message: `mirror miss — no source for packages/${pkg}/src/${join(sub, base)}{${exts.join(",")}} (test path must prefix-swap)`,
  };
}

export const testLayout: Check = {
  name: "test-layout",
  run: ({ root }): Violation[] => {
    const violations: Violation[] = [];
    const testsDir = join(root, "tests");
    if (!existsSync(testsDir)) {
      return violations;
    }
    for (const entry of readdirSync(testsDir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      const rel = relPath(testsDir, join(entry.parentPath, entry.name));
      const v = violationFor(root, rel, entry.name);
      if (v !== undefined) {
        violations.push(v);
      }
    }
    return violations;
  },
};
