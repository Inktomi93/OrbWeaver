import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execPath } from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { COMPOSED_ENV_REFUSAL } from "../../scripts/probes/_composed-env.ts";

const ENV_KEY = "ORB_ENV_NO_FILE";
const GUARD = "scripts/probes/_composed-env.ts";
/** Entries that compose the server graph, directly or through a statically imported composed probe. */
const COMPOSED_ENTRIES = ["scripts/probes/caching/run.ts", "scripts/probes/openrouter/run.ts", "scripts/probes/composed-chat-funding.ts"] as const;
const CHILD_TIMEOUT_MS = 90_000;

/** Run node in `cwd` whose `.env` declares the key, with the key unset in the child's own environment. */
function runBesideEnvFile(cwd: string, args: readonly string[]): SpawnSyncReturns<string> {
  writeFileSync(join(cwd, ".env"), `${ENV_KEY}=1\n`);
  return spawnSync("env", ["-u", ENV_KEY, execPath, ...args], { cwd, encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
}

test("a .env that declares ORB_ENV_NO_FILE does not admit a composed probe", { timeout: CHILD_TIMEOUT_MS * 3 }, ({ scratch, repoRoot }) => {
  const caching = runBesideEnvFile(scratch, [join(repoRoot, "scripts/probes/caching/run.ts"), "--report"]);
  expect(caching.stderr).toContain(COMPOSED_ENV_REFUSAL);
  expect(caching.status).not.toBe(0);

  const funding = pathToFileURL(join(repoRoot, "scripts/probes/composed-chat-funding.ts")).href;
  const imported = runBesideEnvFile(scratch, ["--input-type=module", "--eval", `await import(${JSON.stringify(funding)});`]);
  expect(imported.stderr).toContain(COMPOSED_ENV_REFUSAL);
  expect(imported.status).not.toBe(0);
});

// Modules evaluate in import order, so only a first import runs before the server env loader can.
test("every composed probe entry imports the process-env guard first", ({ repoRoot }) => {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const first = COMPOSED_ENTRIES.map((entry) => {
    const specifier = project.addSourceFileAtPath(join(repoRoot, entry)).getImportDeclarations()[0]?.getModuleSpecifierValue() ?? "";
    return relative(repoRoot, resolve(repoRoot, dirname(entry), specifier));
  });
  expect(first).toEqual(COMPOSED_ENTRIES.map(() => GUARD));
});
