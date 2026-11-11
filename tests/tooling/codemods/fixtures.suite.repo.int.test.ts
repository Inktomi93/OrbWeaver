// Every codemod's fixture directories, run through `codemod jssg test` against the script they prove. The language
// follows the fixture extensions: `--language typescript` skips `.tsx`, and CSS has its own grammar. A
// `tests-crossfile/` case needs cross-file resolution, which `jssg test` lacks, so `jssg run` proves it instead.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";

const ROOT = join(import.meta.dirname, "../../..");
const CODEMODS = join(ROOT, "tooling/src/codemods");
const CODEMOD_BIN = join(ROOT, "node_modules/.bin/codemod");
const FIXTURE_PREFIX = "tests";
const CROSS_FILE = "tests-crossfile";
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
      .filter((name) => name.startsWith(FIXTURE_PREFIX) && name !== CROSS_FILE)
      .map((fixtures) => ({ name: `${codemod.name}/${fixtures}`, dir: join(CODEMODS, codemod.name), fixtures })),
  )
  .sort((a, b) => a.name.localeCompare(b.name));

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
