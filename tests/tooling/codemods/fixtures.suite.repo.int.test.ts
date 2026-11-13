// Every codemod's fixture directories, run through `codemod jssg test` against the script they prove. The language
// follows the fixture extensions: `--language typescript` skips `.tsx`, and CSS has its own grammar. A
// `tests-crossfile/` case needs cross-file resolution, which `jssg test` lacks, so `jssg run` rewrites a copy of its
// `input/` with the copy as the semantic workspace, and the result must equal its `expected/` file for file.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";

const ROOT = join(import.meta.dirname, "../../..");
const CODEMODS = join(ROOT, "tooling/src/codemods");
const CODEMOD_BIN = join(ROOT, "node_modules/.bin/codemod");
const FIXTURE_PREFIX = "tests";
const CROSS_FILE = "tests-crossfile";
// A refusal case has an `input/` the codemod must fail on and an `error.txt` holding a fragment of its message.
const REFUSALS = "tests-refusals";
// `plugin-node-sources/tests-schemas/` proves the second script of that codemod, not its transform.
const SCRIPT_BY_FIXTURES: Readonly<Record<string, string>> = { "tests-schemas": "scripts/node-schemas.ts" };
const TRANSFORM = "scripts/codemod.ts";

function languageOf(fixtures: string): "css" | "tsx" | "typescript" {
  const files = readdirSync(fixtures, { recursive: true, encoding: "utf8" });
  if (files.some((file) => file.endsWith(".css"))) {
    return "css";
  }
  return files.some((file) => file.endsWith(".tsx")) ? "tsx" : "typescript";
}

const suites = readdirSync(CODEMODS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((codemod) =>
    readdirSync(join(CODEMODS, codemod.name))
      .filter((name) => name.startsWith(FIXTURE_PREFIX) && name !== CROSS_FILE && name !== REFUSALS)
      .map((fixtures) => ({ name: `${codemod.name}/${fixtures}`, dir: join(CODEMODS, codemod.name), fixtures })),
  )
  .sort((a, b) => a.name.localeCompare(b.name));

const crossFileCases = readdirSync(CODEMODS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((codemod) => {
    const cases = join(CODEMODS, codemod.name, CROSS_FILE);
    const names = readdirSync(join(CODEMODS, codemod.name)).includes(CROSS_FILE) ? readdirSync(cases) : [];
    return names.map((name) => ({ name: `${codemod.name}/${CROSS_FILE}/${name}`, dir: join(CODEMODS, codemod.name), fixture: join(cases, name) }));
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const refusalCases = readdirSync(CODEMODS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((codemod) => {
    const cases = join(CODEMODS, codemod.name, REFUSALS);
    const names = readdirSync(join(CODEMODS, codemod.name)).includes(REFUSALS) ? readdirSync(cases) : [];
    return names.map((name) => ({ name: `${codemod.name}/${REFUSALS}/${name}`, dir: join(CODEMODS, codemod.name), fixture: join(cases, name) }));
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Every file under a directory, by its path relative to that directory. */
function contents(dir: string): Record<string, string> {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  return Object.fromEntries(
    files.map((entry) => [join(entry.parentPath, entry.name).slice(dir.length + 1), readFileSync(join(entry.parentPath, entry.name), "utf8")]),
  );
}

test("the fixture population holds the second-script suite", () => {
  expect(suites.map(({ name }) => name)).toContain("plugin-node-sources/tests-schemas");
});

forEachNonEmpty(suites, "codemod fixture suites", ({ name, dir, fixtures }) => {
  test(`codemod fixtures pass: ${name}`, { timeout: 60_000 }, () => {
    const script = join(dir, SCRIPT_BY_FIXTURES[fixtures] ?? TRANSFORM);
    const run = spawnSync(CODEMOD_BIN, ["jssg", "test", "-l", languageOf(join(dir, fixtures)), script, join(dir, fixtures)], { cwd: ROOT, encoding: "utf8" });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
  });
});

forEachNonEmpty(crossFileCases, "codemod cross-file cases", ({ name, dir, fixture }) => {
  test(`codemod cross-file case rewrites its input to its expected tree: ${name}`, { timeout: 60_000 }, () => {
    const work = mkdtempSync(join(tmpdir(), "codemod-crossfile-"));
    try {
      cpSync(join(fixture, "input"), work, { recursive: true });
      const args = ["--disable-analytics", "jssg", "run", "--language", languageOf(work), "--target", work, "--semantic-workspace", work];
      const run = spawnSync(CODEMOD_BIN, [...args, "--allow-fs", "--no-interactive", "--allow-dirty", join(dir, TRANSFORM)], { cwd: ROOT, encoding: "utf8" });
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
      expect(contents(work)).toStrictEqual(contents(join(fixture, "expected")));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

forEachNonEmpty(refusalCases, "codemod refusal cases", ({ name, dir, fixture }) => {
  test(`codemod refuses its input with the named reason: ${name}`, { timeout: 60_000 }, () => {
    const work = mkdtempSync(join(tmpdir(), "codemod-refusal-"));
    try {
      cpSync(join(fixture, "input"), work, { recursive: true });
      const args = ["--disable-analytics", "jssg", "run", "--language", languageOf(work), "--target", work, "--allow-fs", "--no-interactive", "--allow-dirty"];
      const run = spawnSync(CODEMOD_BIN, [...args, join(dir, TRANSFORM)], { cwd: ROOT, encoding: "utf8" });
      expect(run.status, `${run.stdout}${run.stderr}`).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toContain(readFileSync(join(fixture, "error.txt"), "utf8").trim());
      expect(contents(work)).toStrictEqual(contents(join(fixture, "input")));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
