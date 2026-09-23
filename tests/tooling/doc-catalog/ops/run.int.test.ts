// Drive the real CLI against copied, unmodified production modules in an isolated Git tree. THE PIN the
// owner asked for: a legacy document's prose edit reds NOTHING in `check:doc-catalog`, because the
// inventory carries no content hash; what still reds is a document with no row, a row with no document,
// and frontmatter debt outside the ratchet — each with its control.
import { cpSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFixtureGit } from "../../../../tooling/src/_shared/git-fixture.ts";
import { spawnNiced } from "../../../../tooling/src/_shared/proc.ts";
import type { CatalogDocumentRow } from "../../../../tooling/src/doc-catalog/index.ts";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GOOD = "docs/design/good.md";
const CATALOG = "docs/catalog/catalog.json";
const RECEIPT = "docs/catalog/receipts/design.json";
const STATE = "docs/catalog/state.json";
const VALID = "---\nkind: review\nstatus: active\nupdated: 2026-09-13\n---\n\n# Subject\n\nThe original prose.\n";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, ["-c", "commit.gpgsign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args]).trim();
}

// Package links mirror pnpm's installed dependency resolution; the fixture owns real node_modules
// directories and copied production source, so REPO_ROOT and every write stay inside the fixture.
function linkPackages(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source)) {
    if (name.startsWith(".")) {
      continue;
    }
    const from = join(source, name);
    const to = join(target, name);
    if (name.startsWith("@")) {
      linkPackages(from, to);
    } else {
      symlinkSync(realpathSync(from), to, "dir");
    }
  }
}

function setup(root: string, repoRoot: string): void {
  for (const path of ["tooling/src/doc-catalog", "tooling/src/_shared"]) {
    cpSync(join(repoRoot, path), join(root, path), { recursive: true });
  }
  linkPackages(join(repoRoot, "node_modules"), join(root, "node_modules"));
  linkPackages(join(repoRoot, "tooling/node_modules"), join(root, "tooling/node_modules"));
  mkdirSync(join(root, "node_modules/.bin"));
  symlinkSync(join(repoRoot, "node_modules/.bin/biome"), join(root, "node_modules/.bin/biome"));
  for (const path of ["docs/design", "docs/catalog/receipts"]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(root, "biome.json"), '{"formatter":{"enabled":true}}\n');
  writeFileSync(join(root, "docs/catalog/lanes.json"), JSON.stringify({ schemaVersion: 2, lanes: [{ id: "design", patterns: ["docs/design/**/*.md"] }] }));
  writeFileSync(join(root, STATE), JSON.stringify({ schemaVersion: 2, allowed: { missingFrontmatter: [], invalidFrontmatter: [], malformedFrontmatter: [] } }));
  writeFileSync(join(root, RECEIPT), JSON.stringify({ schemaVersion: 2, lane: "design", entries: [{ path: GOOD, authority: "review" }] }));
  writeFileSync(join(root, GOOD), VALID);
  git(root, "init", "-q");
  git(root, "add", "docs");
  git(root, "commit", "-qm", "fixture documents");
}

function run(root: string, mode: string): Promise<CliResult> {
  return spawnNiced(
    "env",
    ["-u", "GIT_DIR", "-u", "GIT_WORK_TREE", "-u", "GIT_INDEX_FILE", process.execPath, join(root, "tooling/src/doc-catalog/cli.ts"), "catalog", mode],
    { cwd: root },
  );
}

function artifacts(root: string): readonly Buffer[] {
  return [CATALOG, RECEIPT, STATE].map((path) => readFileSync(join(root, path)));
}

test("a legacy document's prose edit reds nothing in check:doc-catalog and changes no catalog artifact", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot);
  await expect(await run(scratch, "--write")).toExitWith(0);
  git(scratch, "add", "docs");
  git(scratch, "commit", "-qm", "inventory");
  const before = artifacts(scratch);
  const rows = (JSON.parse(readFileSync(join(scratch, CATALOG), "utf8")) as { documents: CatalogDocumentRow[] }).documents;
  expect(rows).toEqual([{ path: GOOD, lane: "design", frontmatter: { fields: { kind: "review", status: "active" } }, receipt: { authority: "review" } }]);

  // THE PLANTED EDIT: new prose and a review-date bump, the two edits the old receipt model turned red.
  writeFileSync(join(scratch, GOOD), VALID.replace("The original prose.", "Rewritten prose, twice as long, on a new day.").replace("2026-09-13", "2026-09-23"));
  const result = await run(scratch, "--check");
  await expect(result).toExitWith(0);
  expect(result.stdout).toContain("1 documents; frontmatter debt 0 missing, 0 invalid, 0 malformed");
  expect(artifacts(scratch)).toEqual(before);
});

test("what still reds: a document with no row, a row with no document, and frontmatter debt outside the ratchet", async ({ scratch, repoRoot }) => {
  setup(scratch, repoRoot);
  await expect(await run(scratch, "--write")).toExitWith(0);
  writeFileSync(join(scratch, "docs/design/new.md"), VALID);
  git(scratch, "add", "docs/design/new.md");
  const unrowed = await run(scratch, "--check");
  await expect(unrowed).toExitWith(1);
  expect(unrowed.stderr).toContain("docs/design/new.md: missing receipt entry — run pnpm doc-catalog:sync");
  expect(unrowed.stderr).toContain(`${CATALOG}: generated catalog is stale; run pnpm doc-catalog:write`);

  await expect(await run(scratch, "--sync")).toExitWith(0);
  await expect(await run(scratch, "--check")).toExitWith(0);
  expect(JSON.parse(readFileSync(join(scratch, RECEIPT), "utf8"))).toEqual({
    schemaVersion: 2,
    lane: "design",
    entries: [
      { path: GOOD, authority: "review" },
      { path: "docs/design/new.md", authority: "unclassified" },
    ],
  });

  git(scratch, "rm", "-qf", "docs/design/new.md");
  const orphanRow = await run(scratch, "--check");
  await expect(orphanRow).toExitWith(1);
  expect(orphanRow.stderr).toContain("docs/design/new.md: receipt exists for an untracked document");

  writeFileSync(join(scratch, GOOD), VALID.replace("status: active", "status: confirmed"));
  const debt = await run(scratch, "--check");
  await expect(debt).toExitWith(1);
  expect(debt.stderr).toContain(`invalidFrontmatter: new debt path ${GOOD} is not in the ratchet allowance`);
});
