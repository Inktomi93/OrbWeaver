// The PERMANENT PIN for the D12 arm of the ledger's banned shapes. The `@orb/contracts/sessions` ban is a
// plain module-specifier ban, so biome's native `style/noRestrictedImports` owns it completely
// (GATE-AUTHORING §10: never mirror an enabled native lint rule) — it retired out of the old
// `schema-banned-shapes` gate with the #1584 split, and this file is what keeps that move honest.
//
// WHY A PIN AND NOT A GATE ROW: biome.json is data. A silently dropped pattern row, or one narrowed to a
// single package, would leave the D12 cite enforced by nothing at all and nothing would go red — the exact
// shape the ratchet-less "ledger killed this by name" rows exist to prevent. So this asserts the ROW
// (level, group, message) AND the REACH (packages/, tooling/, tests/) AND the singular twin's cleanliness.
//
// HERMETIC on purpose (house precedent: tests/tooling/biome-browser-globals.int.test.ts): the REAL biome
// binary runs over a COPY of the REAL biome.json in a mkdtemp git root. Planting the banned import on the
// real tree would red any concurrent whole-tree biome pass, and `**/__probe*` is gitignored so biome
// (useIgnoreFile) never sees a probe planted there — measured on this tree 2026-09-05: four planted probe
// files came back "No files were processed in the specified paths".
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { CONTRACT_BANNED_SHAPES, SCHEMA_BANNED_SHAPES } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFIG_REL = "biome.json";
const RULE_CATEGORY = "lint/style/noRestrictedImports";
/** The banned specifier and the singular namespace that replaced it — the CONTRACT, restated rather than
 *  read from biome.json, so a row silently edited there reds here instead of shrinking the assertion. */
const BANNED_SPECIFIER = "@orb/contracts/sessions";
const ALLOWED_SPECIFIER = "@orb/contracts/session";
const EXPECTED_GROUP: readonly string[] = [BANNED_SPECIFIER, `${BANNED_SPECIFIER}/**`];
/** One planted importer per TREE the ban must reach. `tooling/` and `tests/` are named because a copied
 *  client/package predicate that forgot them is the recurring population defect (#1584 design §"Population
 *  vocabulary"). The deep path proves the `/**` half of the group. */
const BANNED_FILES: Readonly<Record<string, string>> = {
  "packages/server/src/pin-d12.ts": `import { X } from "${BANNED_SPECIFIER}";\nexport const a = X;\n`,
  "tooling/src/pin-d12.ts": `import { X } from "${BANNED_SPECIFIER}/rooms";\nexport const b = X;\n`,
  "tests/pin-d12.ts": `import { X } from "${BANNED_SPECIFIER}";\nexport const c = X;\n`,
};
/** The passing twin: the singular namespace D12 ruled correct. Rides the SAME invocation, so its zero is a
 *  measurement rather than a bare zero. */
const ALLOWED_FILE = "packages/server/src/pin-d12-ok.ts";
const ALLOWED_BODY = `import { X } from "${ALLOWED_SPECIFIER}";\nexport const d = X;\n`;

const BIOME_EXIT_CLEAN = 0;
const BIOME_EXIT_DIAGNOSTICS = 1;
const SPAWN_BUDGET_MS = scaledBudget(60_000);
const STDOUT_BUFFER_BYTES = 16_000_000;

interface BiomeDiagnostic {
  readonly category?: string;
  readonly message?: string;
  readonly location?: { readonly path?: string };
}

interface BiomeReport {
  readonly summary: { readonly unchanged?: number; readonly skipped?: number; readonly diagnosticsNotPrinted?: number };
  readonly diagnostics: readonly BiomeDiagnostic[];
}

interface PatternRow {
  readonly group?: readonly string[];
  readonly message?: string;
}

interface BiomeConfig {
  readonly linter?: {
    readonly rules?: {
      readonly style?: {
        readonly noRestrictedImports?: { readonly level?: string; readonly options?: { readonly patterns?: readonly PatternRow[] } };
      };
    };
  };
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function seedRoot(scratch: string, repoRoot: string): void {
  plant(scratch, CONFIG_REL, readFileSync(join(repoRoot, CONFIG_REL), "utf8"));
  for (const [rel, body] of Object.entries(BANNED_FILES)) {
    plant(scratch, rel, body);
  }
  plant(scratch, ALLOWED_FILE, ALLOWED_BODY);
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
}

function checkWithBiome(scratch: string, repoRoot: string, files: readonly string[]): BiomeReport {
  const res = runNicedSync(join(repoRoot, "node_modules", ".bin", "biome"), ["check", ...files, "--reporter=json"], {
    cwd: scratch,
    timeout: SPAWN_BUDGET_MS,
    maxBuffer: STDOUT_BUFFER_BYTES,
  });
  if (res.status !== BIOME_EXIT_CLEAN && res.status !== BIOME_EXIT_DIAGNOSTICS) {
    throw new Error(`biome check did not reach a verdict (status ${String(res.status)}):\n${res.stderr}`);
  }
  return JSON.parse(res.stdout) as BiomeReport;
}

function restrictedImportPaths(report: BiomeReport): readonly string[] {
  return report.diagnostics
    .filter((d) => d.category === RULE_CATEGORY)
    .map((d) => d.location?.path ?? "")
    .sort();
}

test(
  "the D12 ban reaches packages, tooling AND tests, and the singular `session` namespace stays clean",
  ({ scratch, repoRoot }) => {
    seedRoot(scratch, repoRoot);
    const planted = [...Object.keys(BANNED_FILES), ALLOWED_FILE];
    const report = checkWithBiome(scratch, repoRoot, planted);

    expect(report.summary.unchanged, "files biome actually read").toBe(planted.length);
    expect(report.summary.skipped ?? 0, "files biome skipped").toBe(0);
    expect(report.summary.diagnosticsNotPrinted ?? 0, "diagnostics the reporter withheld").toBe(0);
    // Exactly the three banned importers fire; the singular twin in the SAME run does not.
    expect(restrictedImportPaths(report)).toEqual([...Object.keys(BANNED_FILES)].sort());
    // The diagnostic must carry the D-cite, or a reader gets a ban with no ruling behind it.
    for (const diagnostic of report.diagnostics.filter((d) => d.category === RULE_CATEGORY)) {
      expect(diagnostic.message ?? "", `${diagnostic.location?.path ?? "?"} must cite D12`).toContain("D12");
    }
  },
  SPAWN_BUDGET_MS,
);

test("the row itself: one pattern group covering the specifier and its subpaths, at level error", ({ repoRoot }) => {
  // biome.json is STRICT JSON (no comments), so JSON.parse is the honest reader.
  const config = JSON.parse(readFileSync(join(repoRoot, CONFIG_REL), "utf8")) as BiomeConfig;
  const rule = config.linter?.rules?.style?.noRestrictedImports;
  expect(rule?.level).toBe("error");
  const row = (rule?.options?.patterns ?? []).find((candidate) => candidate.group?.includes(BANNED_SPECIFIER) ?? false);
  if (row === undefined) {
    throw new Error(`biome.json has no noRestrictedImports pattern row banning ${BANNED_SPECIFIER}`);
  }
  expect([...(row.group ?? [])].sort()).toEqual([...EXPECTED_GROUP].sort());
  expect(row.message, "the ban must carry its D-cite and where to contest it").toMatch(/D12/u);
});

test("the ledger vocabulary keeps both partitions non-empty and free of the retired import kind", () => {
  // The two policies read these tables; an emptied partition is a silently unarmed policy, and an `import`
  // row reappearing here would be the mirror of a native lint rule the split deliberately removed.
  expect(SCHEMA_BANNED_SHAPES.length).toBeGreaterThan(0);
  expect(CONTRACT_BANNED_SHAPES.length).toBeGreaterThan(0);
  const kinds = new Set([...SCHEMA_BANNED_SHAPES, ...CONTRACT_BANNED_SHAPES].map((shape) => shape.kind));
  expect([...kinds].sort()).toEqual(["column", "column-pattern", "interface-field", "schema-field", "table"]);
});
