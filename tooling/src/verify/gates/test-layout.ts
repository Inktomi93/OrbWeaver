// Gate: test-layout (core/Core-0-Architecture-and-Structure.md §5 / core/Spine-Testing.md) — the central test mirror.
// Every test under tests/ must prefix-swap to a real source file: tests/<pkg>/<path>.<kind> ↔
// packages/<pkg>/src/<path>.<ext>. Exempts the two non-mirror trees tests/support/ + tests/e2e/.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";

const PKGS = new Set(["kit", "contracts", "db", "server", "client", "ui", "showcase-plugins"]);
// Most-specific suffixes first (so `.int.test.ts` isn't mis-stripped as `.test.ts`).
const KINDS = [
  ".suite.int.test.ts",
  ".suite.test.ts",
  ".suite.ct.tsx",
  ".int.test.ts",
  ".contract.test.ts",
  ".test-d.ts",
  ".ct.tsx",
  ".test.tsx",
  ".test.ts",
] as const;

function relPath(base: string, abs: string): string {
  return abs.startsWith(base) ? abs.slice(base.length + 1) : abs;
}

interface SrcLoc {
  readonly root: string;
  readonly pkg: string;
  readonly sub: string;
  readonly base: string;
  readonly ext: string;
}

function srcExistsFor(loc: SrcLoc): boolean {
  const file = join(loc.root, "packages", loc.pkg, "src", loc.sub, `${loc.base}${loc.ext}`);
  const dirIndex = join(loc.root, "packages", loc.pkg, "src", loc.sub, loc.base, `index${loc.ext}`);
  return existsSync(file) || existsSync(dirIndex);
}

function violationFor(root: string, rel: string, name: string): Violation | undefined {
  const segs = rel.split("/");
  const pkg = segs[0];
  // Non-mirror trees: support/ (fixtures), e2e/ (full-stack Playwright). tooling/ is CONDITIONAL since
  // the @orb/tooling tree exists (docs/architecture/core/Core-Tooling-Law.md §4.7): tests/tooling/<dir>/ MIRRORS
  // tooling/src/<dir>/ when that src dir exists; flat files + dirs with no src twin stay exempt (they
  // test root configs, the guard, and research-zone scripts).
  if (pkg === "support" || pkg === "e2e") {
    return;
  }
  if (pkg === "tooling") {
    return toolingViolationFor(root, rel, segs, name);
  }
  const kind = KINDS.find((k) => name.endsWith(k));
  if (kind === undefined) {
    return;
  }
  if (pkg === undefined || !PKGS.has(pkg)) {
    return {
      file: `tests/${rel}`,
      line: 0,
      message: "test outside a package mirror — expected tests/{kit,contracts,db,server,client}/… or tests/{support,e2e,tooling}/",
    };
  }
  // (A `.parity.test.ts` KIND sat here until 2026-08-22 — the neo differential oracle, mirror-exempt because
  // it validated a cross-repo SURFACE rather than one source module. It went out with the oracle, #428.)
  //
  // Cross-cutting PROPERTY suites (`.suite.test.ts` / `.suite.int.test.ts`) validate a behaviour that spans
  // MANY source modules — a security-containment matrix, a cross-writer drift-equality — not one module, so
  // they are exempt from the 1:1 source-mirror (they still sit under a valid package
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

/** The tooling mirror arm (§4.7): tests/tooling/<dir>/<path>.<kind> ↔ tooling/src/<dir>/<path>.ts
 *  (file or dir-index), suite kinds exempt — but ONLY for dirs that exist under tooling/src/. */
function toolingViolationFor(root: string, rel: string, segs: readonly string[], name: string): Violation | undefined {
  // tooling/<dir>/<file> — anything shorter is a flat tests/tooling file (the exempt non-mirror tier).
  const MirrorMinSegs = 3;
  const toolDir = segs[1];
  if (toolDir === undefined || segs.length < MirrorMinSegs) {
    return;
  }
  if (!existsSync(join(root, "tooling", "src", toolDir))) {
    return; // no src twin — a root-config / research-zone test dir
  }
  const kind = KINDS.find((k) => name.endsWith(k));
  if (kind === undefined || kind.startsWith(".suite.")) {
    return;
  }
  const base = name.slice(0, -kind.length);
  const sub = segs.slice(1, -1).join("/");
  const file = join(root, "tooling", "src", sub, `${base}.ts`);
  const dirIndex = join(root, "tooling", "src", sub, base, "index.ts");
  if (existsSync(file) || existsSync(dirIndex)) {
    return;
  }
  return {
    file: `tests/${rel}`,
    line: 0,
    message: `mirror miss — no source for tooling/src/${sub}/${base}.ts (a tooling test prefix-swaps to its tool's module — docs/architecture/core/Core-Tooling-Law.md §4.7)`,
  };
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanTestLayout(root: string): Violation[] {
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
}

export const gate: GateDescriptor = {
  name: "test-layout",
  docRow: "core/Core-0-Architecture-and-Structure.md §5 (core/Spine-Testing.md)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a test under tests/ does not prefix-swap to a real source file — every test mirrors packages/<pkg>/src/<path> (tests/support, tests/e2e, tests/tooling are the exempt non-mirror trees). See core/Core-0-Architecture-and-Structure.md §5.",
  fix: "place the test at tests/<pkg>/<path>.<kind> mirroring its packages/<pkg>/src/<path> source, or move it under tests/{support,e2e,tooling}.",
  run: (ctx) => {
    for (const v of scanTestLayout(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: { "tests/server/domain/orphan.test.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "mirror miss" },
      why: "a test with no packages/server/src/domain/orphan.ts source — a mirror miss (§5)",
    },
    {
      files: {
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/ghost.test.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "tooling/src/snapx/ghost.ts" },
      why: "a tooling test whose tool dir exists but whose module does not — the §4.7 tooling mirror bites",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/real.ts": "export const s = 1;\n",
        "tests/server/domain/real.test.ts": "export const x = 1;\n",
      },
      why: "a test whose path prefix-swaps to a real source module — a valid mirror, passes",
    },
    {
      files: {
        "tests/server/security/containment.suite.int.test.ts": "export const x = 1;\n",
      },
      why: "a cross-cutting .suite.int.test.ts under a valid pkg with NO single-source mirror — the property-suite exemption, passes",
    },
    {
      files: {
        "tooling/src/snapx/cli.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const x = 1;\n",
      },
      why: "a tooling test that prefix-swaps to a real tooling/src module — the §4.7 mirror hit, passes",
    },
    {
      files: { "tests/tooling/flat-config.test.ts": "export const x = 1;\n" },
      why: "a FLAT tests/tooling file (root-config / research-zone subject) — the exempt non-mirror tier, passes",
    },
  ],
};
