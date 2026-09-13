// Gate: verify-registry-parity (Core-Enforcement-Active-Gates.md) — every package.json script
// matching the verification shape (check*|test*|lint*|typecheck*|depcruise*|e2e*|cpd*|format*|knip*) must
// be reachable from the `pnpm verify` stage registry (tooling/src/verify/lib/registry.ts) — either it IS
// a registry stage's `pnpm <script>` argv, or it's on the small alias/writer allowlist. The mirror arm:
// every registry stage argv and non-stage exception must name a script that exists in package.json. RESOURCE (GATE-AUTHORING
// migration): the root `package.json` comes from the closed `package-metadata` ResourceHost fact;
// `REGISTRY` is a plain in-memory module import, not a filesystem read.
// WHERE A BROKEN RESOURCE REFUSES — not here (mirrors `server-layout.ts`'s header). A declared resource
// that comes back missing/empty/unresolved/malformed makes `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) THROW during the POPULATION phase, and the receipt phase withholds
// every consumer, both before `create`/`evaluate` run (guide §3's acquisition-refusal rule). This module owns no not-ready
// branch: it reads the package metadata through `readyResourceValue`, whose throw is an assertion that the
// runtime's own refusal already held.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13).
// HAND-DERIVED: the scratch replay cannot import this legacy module (its import-time reads resolve against the
// archive root and throw), so the sets were derived by reading the blob. Legacy `verify-registry-parity` descriptor
// at cdfe100d0b62f477912eb5caa526bd3bff207ac2, the parent of the conversion `9377887c0` (blob read with `git show`:
// no `scanRoot`, `fsBacked: true`, no `defineGate`). With no `scanRoot` the legacy harness dispatched all 7,355
// harness candidates at that tree and its `run` read none of them — its subject came from `existsSync`/`readFileSync`
// of the root `package.json`; the final `population` is `{ of: "none" }` and the subject is the declared
// `package-metadata` (root) resource. legacy − final = all 7,355 dispatched-and-unread candidates, retired with that
// read. final − legacy = ∅. Controls: equality cannot pass vacuously — the legacy side is non-empty and the final
// side is empty by declaration, and the resource subject has its own refusal pins.
//
// FAMILY: a declared SINGLETON under its own id. Its one non-primitive dependency is the verify stage registry
// declaration `lib/registry.ts#REGISTRY`, and no other policy imports it; `readyResourceValue` is the corpus-wide
// resource primitive.
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { PackageMetadata } from "../contract/resource-config.ts";
import { REGISTRY } from "../lib/registry.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const PKG_REL = "package.json";
// The verification-shaped script-name prefixes (§3.6). A script whose name matches must be in the registry.
// `knip` joined 2026-07-17: `knip:prod` (the production-strict view) dangled UNWIRED for four days while
// the registry doc claimed it live — precisely the forgotten-script class this gate exists to kill; the
// prefix gap made the gate blind to it.
const VERIFY_SHAPE_RE = /^(?:check|test|lint|typecheck|depcruise|e2e|cpd|format|knip)/u;

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
  "depcruise:affected", // the git-affected SCOPING variant (depcruise --affected) — a standalone dev tool, not a tier
  "cpd:report", // html ARTIFACT twin of the cpd gate
  "check:show", // the report INSPECTOR (a read-only viewer, not a gate)
]);

const ROOT_DEP = (name: string): string =>
  `the repo-root package.json declares a runtime dependency "${name}" — the root is a PRIVATE monorepo ` +
  "root that is NEVER prod-installed, so a `dependencies` entry here is a category error: nothing installs " +
  "it and a runtime `import` of it from a package would not resolve. Script runners and tooling (tsx, " +
  "biome, …) are devDependencies. Move it to devDependencies, or into the workspace package that imports it.";

/** The set of package.json script names a registry stage invokes via its whole-scope `pnpm <script>` argv.
 *  A stage whose argv isn't `pnpm <script>` (a raw bin) contributes nothing here. */
function registryScriptNames(): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stage of REGISTRY) {
    if (stage.argv[0] === "pnpm" && typeof stage.argv[1] === "string") {
      names.add(stage.argv[1]);
    }
  }
  return names;
}

/** Complete script membership for isolated root-manifest proofs, derived from both production sets. */
function fixtureScripts(names: Iterable<string> = new Set([...registryScriptNames(), ...NON_STAGE_ALLOWLIST])): Record<string, string> {
  return Object.fromEntries([...names].map((name) => [name, "x"]));
}

const MISSING_ROW = (script: string): string =>
  `package.json script "${script}" is verification-shaped but is not a \`pnpm verify\` stage — place it ` +
  "in a tier in tooling/src/verify/lib/registry.ts (even `manual` with a reason), or add it to the gate's " +
  "NON_STAGE_ALLOWLIST if it is a writer/artifact-generator, not a verification stage.";

const DEAD_ROW = (script: string): string =>
  `the \`pnpm verify\` registry names a stage \`pnpm ${script}\` but package.json has no "${script}" ` +
  "script — remove the registry row or restore the script (tooling/src/verify/lib/registry.ts).";

const STALE_EXCEPTION = (script: string): string =>
  `stale NON_STAGE_ALLOWLIST entry "${script}": package.json has no such script — remove the exception from verify-registry-parity.ts or restore the script.`;

export const gate = defineGate({
  id: "verify-registry-parity",
  family: "verify-registry-parity",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the root package.json is a closed ResourceHost package-metadata fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "package-metadata", id: "root" }],
  message:
    "a package.json verification-shaped script (check*/test*/lint*/typecheck*/depcruise*/e2e*/cpd*/format*/knip*) has no `pnpm verify` tier — or a registry stage or non-stage exception points at a deleted script. Every verification surface must be reachable from tooling/src/verify/lib/registry.ts (the ledger that makes a forgotten script structurally impossible). Core-Enforcement-Active-Gates.md.",
  fix: "place the script in a tier in tooling/src/verify/lib/registry.ts (even `manual` + a reason), or add it to the gate's NON_STAGE_ALLOWLIST if it is a writer/artifact-generator; for a dead registry row or stale non-stage exception, remove it or restore the script.",
  create: (ctx) => ({
    evaluate: () => {
      reconcile(ctx, readyResourceValue(ctx.resources.packageMetadata("root")));
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "package.json": JSON.stringify({
          name: "orbweaver",
          scripts: fixtureScripts([...new Set([...registryScriptNames(), ...NON_STAGE_ALLOWLIST])].filter((name) => name !== "format")),
        }),
      },
      expect: {
        count: 1,
        messageIncludes:
          'stale NON_STAGE_ALLOWLIST entry "format": package.json has no such script — remove the exception from verify-registry-parity.ts or restore the script.',
      },
      why: "a non-stage exception whose subject script was deleted must accuse independently of missing registry stages; every other required script remains present",
    },
    {
      mode: "resource",
      files: {
        "package.json": JSON.stringify({
          name: "orbweaver",
          scripts: { ...fixtureScripts(), "test:visual-regression": "playwright test --grep @visual" },
        }),
      },
      expect: { count: 1, messageIncludes: "not a `pnpm verify` stage" },
      why: "a verification-shaped script (test:*) with no registry tier — the forgotten-script failure the gate exists to make impossible",
    },
    {
      mode: "resource",
      files: {
        // Every non-stage exception remains live; only the registry-stage scripts are absent.
        "package.json": JSON.stringify({ name: "orbweaver", scripts: fixtureScripts(NON_STAGE_ALLOWLIST) }),
      },
      expect: { countFrom: "registryScriptNames", messageIncludes: "but package.json has no" },
      why: "arm 2 DEAD_ROW: every registry stage is absent while every non-stage exception remains live. The finding count follows registryScriptNames; the message distinguishes registry rows from stale exceptions",
    },
    {
      mode: "resource",
      files: {
        // A runtime `dependencies` entry on the resource-identified private monorepo root is
        // the category error (tonight's tsx lesson). Every registry stage script is also present so arm 2
        // stays clean and only the root-dep arm fires.
        "package.json": JSON.stringify({
          name: "orbweaver",
          scripts: fixtureScripts(),
          dependencies: { tsx: "^4.0.0" },
        }),
      },
      expect: { count: 1, messageIncludes: "PRIVATE monorepo root" },
      why: "arm 3: a runtime dependency on the private, never-prod-installed monorepo root — a category error (script runners are devDependencies)",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        // The complete required membership plus an unrelated dev script: writers and inspectors
        // remain non-stages, and unrelated inputs do not acquire a verification obligation.
        "package.json": JSON.stringify({
          name: "orbweaver",
          scripts: { ...fixtureScripts(), dev: "vite", format: "biome format --write .", "check:show": "node tooling/src/verify/cli.ts show" },
        }),
      },
      why: "no unplaced verification-shaped script: the allowlisted WRITER (`format`) and the allowlisted INSPECTOR (`check:show` — verification-shaped by name, read-only by nature) both pass, which is the no-over-bite half of arm 1",
    },
    {
      mode: "resource",
      files: {
        // There is NO `dependencies` key on the resource-identified root — the correct
        // shape for the private monorepo root. Every registry stage script is present so arm 2 is clean too.
        "package.json": JSON.stringify({
          name: "orbweaver",
          scripts: fixtureScripts(),
        }),
      },
      why: "arm 3 pass: all required scripts are present and the root declares no `dependencies` — the correct never-prod-installed shape",
    },
  ],
});

/** Reconcile package.json's verification-shaped scripts against the registry, both directions. */
function reconcile(ctx: GatePolicyContext, pkg: PackageMetadata): void {
  const scripts = pkg.scripts;
  const registered = registryScriptNames();

  // Arm 1: every verification-shaped script must be a registry stage (or an allowlisted non-stage).
  for (const name of Object.keys(scripts)) {
    if (!VERIFY_SHAPE_RE.test(name)) {
      continue;
    }
    if (!(registered.has(name) || NON_STAGE_ALLOWLIST.has(name))) {
      ctx.report.file(PKG_REL, { line: 1, column: 1, message: MISSING_ROW(name) });
    }
  }

  // Every non-stage exception must still name a live script, including the verify entry itself.
  for (const name of NON_STAGE_ALLOWLIST) {
    if (!(name in scripts)) {
      ctx.report.file(PKG_REL, { line: 1, column: 1, message: STALE_EXCEPTION(name) });
    }
  }

  // The resource declaration establishes root identity even when its verify script is missing.
  for (const name of registered) {
    if (!(name in scripts)) {
      ctx.report.file(PKG_REL, { line: 1, column: 1, message: DEAD_ROW(name) });
    }
  }

  // The root manifest's runtime dependencies must be empty/absent.
  for (const name of Object.keys(pkg.dependencies.runtime)) {
    ctx.report.file(PKG_REL, { line: 1, column: 1, message: ROOT_DEP(name) });
  }
}
