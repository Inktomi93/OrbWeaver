// Gate: verify-registry-parity (UNIFIED-VERIFICATION-DESIGN.md §3.6) — the structural answer to "we keep
// dropping the ball": the ball has a ledger. Every package.json script matching the VERIFICATION SHAPE
// (check*|test*|lint*|typecheck*|depcruise*|e2e*|cpd*|format*) must be reachable from the `pnpm verify`
// stage registry (scripts/verify/registry.ts) — either it IS a registry stage's `pnpm <script>` argv, or
// it's on the small ALIAS/WRITER allowlist (the `pnpm verify` alias itself, the format WRITERS, the graph
// artifact generators — things that aren't verification STAGES). Adding `test:visual-regression` to
// package.json without placing it in a tier makes a `pnpm check` run RED. The mirror arm: every registry
// stage's whole-scope `pnpm <script>` argv must name a script that EXISTS in package.json — a registry row
// pointing at a deleted script is equally RED.
//
// This gate IMPORTS the registry (a static array — the single source of truth for the tier assignment) and
// reads package.json from ctx.root (fsBacked), so conformance varies the package.json against the real
// registry: a bogus verification script reds, a fully-placed one passes.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY } from "../../verify/registry.ts";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const PKG_REL = "package.json";
// The verification-shaped script-name prefixes (§3.6). A script whose name matches must be in the registry.
const VERIFY_SHAPE_RE = /^(?:check|test|lint|typecheck|depcruise|e2e|cpd|format)/u;

// Scripts that match the shape but are NOT verification STAGES — they need no registry row:
//   • the verify entry + its check alias (the registry's HOST, not a stage);
//   • the WRITERS (lint:fix / format / format:docs — remediation, not verification, audit §1.1 #26);
//   • the depcruise ARTIFACT generators (graph/focus/reaches — mermaid outputs, not gates);
//   • cpd:report (the html artifact twin of the cpd gate);
//   • the manual probe/coverage entries the registry already lists as `manual` rows are NOT here — they
//     ARE stages (their argv is a registry row); only true non-stages live on this allowlist.
const NON_STAGE_ALLOWLIST = new Set([
  "check", // the verify --static alias (the registry's host, not a stage)
  "verify", // the entry itself
  "lint:fix", // WRITER (remediation, not verification)
  "format", // WRITER
  "format:docs", // WRITER
  "depcruise:graph", // mermaid ARTIFACT generator
  "depcruise:focus", // mermaid ARTIFACT generator
  "depcruise:reaches", // mermaid ARTIFACT generator
  "depcruise:affected", // the git-affected SCOPING variant — a sub-tool the changed tier uses, not a tier
  "cpd:report", // html ARTIFACT twin of the cpd gate
  "check:file", // a thin alias to `verify --file` (a scoped HOST, not a stage)
  "check:scope", // the scoped structure runner `structure:full`'s scopedArgv INVOKES (a sub-tool)
  "check:show", // the report INSPECTOR (a read-only viewer, not a gate)
]);

type PackageJson = { readonly scripts?: Readonly<Record<string, string>> };

/** The set of package.json script names a registry stage invokes via its whole-scope `pnpm <script>` argv.
 *  A stage whose argv isn't `pnpm <script>` (a raw bin) contributes nothing here. */
function registryScriptNames(): Set<string> {
  const names = new Set<string>();
  for (const stage of REGISTRY) {
    if (stage.argv[0] === "pnpm" && typeof stage.argv[1] === "string") {
      names.add(stage.argv[1]);
    }
  }
  return names;
}

const MISSING_ROW = (script: string): string =>
  `package.json script "${script}" is verification-shaped but is not a \`pnpm verify\` stage — place it ` +
  "in a tier in scripts/verify/registry.ts (even `manual` with a reason), or add it to the gate's " +
  "NON_STAGE_ALLOWLIST if it is a writer/artifact-generator, not a verification stage.";

const DEAD_ROW = (script: string): string =>
  `the \`pnpm verify\` registry names a stage \`pnpm ${script}\` but package.json has no "${script}" ` +
  "script — remove the registry row or restore the script (scripts/verify/registry.ts).";

/** Reconcile package.json's verification-shaped scripts against the registry, both directions. */
function reconcile(root: string): Violation[] {
  const pkgPath = join(root, PKG_REL);
  if (!existsSync(pkgPath)) {
    return [];
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson;
  const scripts = pkg.scripts ?? {};
  const registered = registryScriptNames();
  const violations: Violation[] = [];

  // Arm 1: every verification-shaped script must be a registry stage (or an allowlisted non-stage).
  for (const name of Object.keys(scripts)) {
    if (!VERIFY_SHAPE_RE.test(name)) {
      continue;
    }
    if (!(registered.has(name) || NON_STAGE_ALLOWLIST.has(name))) {
      violations.push({ file: PKG_REL, line: 0, message: MISSING_ROW(name) });
    }
  }

  // Arm 2: every registry stage's `pnpm <script>` argv must resolve to a real package.json script.
  // GUARDED on the REAL package.json — a synthetic conformance/parity example package.json (which lists
  // only a couple scripts) would otherwise flag every registry script as a "dead row". The `verify` script
  // is the registry's own host — its presence means this IS the real root package.json (the fileLoaded /
  // registry-loaded guard pattern the ratchet gates use). A synthetic example omits it → arm 2 no-ops.
  if ("verify" in scripts) {
    for (const name of registered) {
      if (!(name in scripts)) {
        violations.push({ file: PKG_REL, line: 0, message: DEAD_ROW(name) });
      }
    }
  }
  return violations;
}

// The legacy Check (report.ts's ALL_CHECKS) — kept ALONGSIDE the contract `gate` during the migration, so
// the pre-cutover `pnpm check` runs this gate too. V5's cutover removes every legacy Check uniformly.
export const verifyRegistryParity: Check = {
  name: "verify-registry-parity",
  run: ({ root }): Violation[] => reconcile(root),
};

export const gate: GateDescriptor = {
  name: "verify-registry-parity",
  docRow: "UNIFIED-VERIFICATION-DESIGN.md §3.6",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a package.json verification-shaped script (check*/test*/lint*/typecheck*/depcruise*/e2e*/cpd*/format*) has no `pnpm verify` tier — or a registry stage points at a deleted script. Every verification surface must be reachable from scripts/verify/registry.ts (the ledger that makes a forgotten script structurally impossible). UNIFIED-VERIFICATION-DESIGN.md §3.6.",
  fix: "place the script in a tier in scripts/verify/registry.ts (even `manual` + a reason), or add it to the gate's NON_STAGE_ALLOWLIST if it is a writer/artifact-generator; for a dead row, remove it or restore the script.",
  run: (ctx) => {
    for (const v of reconcile(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "package.json":
          '{ "scripts": { "test:visual-regression": "playwright test --grep @visual" } }\n',
      },
      expect: { messageIncludes: "not a `pnpm verify` stage" },
      why: "a verification-shaped script (test:*) with no registry tier — the forgotten-script failure the gate exists to make impossible",
    },
  ],
  mustPass: [
    {
      files: {
        // Only NON-verification-shaped scripts (dev/build) + an allowlisted writer → nothing to reconcile
        // against the real registry, so this passes. (A registry-registered script name here would need the
        // real package.json's whole script set; the empty-of-verify-scripts case is the honest near-miss.)
        "package.json": '{ "scripts": { "dev": "vite", "format": "biome format --write ." } }\n',
      },
      why: "no verification-shaped script beyond the allowlisted `format` writer — nothing unplaced, passes",
    },
  ],
};
