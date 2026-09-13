// #2230: the real baseline dispatch must compare generator bytes, never a declaration count.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runBaseline } from "@orb/tooling/verify";
import { THEME } from "../../../../../tooling/src/verify/contract/css-family.ts";
import { TOKEN_CONTRACT_PATHS } from "../../../../../tooling/src/verify/contract/resource-artifact.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

function plantTheme(root: string, repoRoot: string): string {
  for (const relative of [...Object.values(TOKEN_CONTRACT_PATHS), THEME]) {
    const destination = join(root, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(join(repoRoot, relative)));
  }
  return join(root, THEME);
}

test("same-count hand edits are stale, check never writes, and the baseline restores exact bytes", async ({ scratch, repoRoot }) => {
  const theme = plantTheme(scratch, repoRoot);
  const committed = readFileSync(theme, "utf8");
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(0);
  const edited = committed.replace("@theme {", "@theme {/* hand edit */");
  expect(edited).not.toBe(committed);
  writeFileSync(theme, edited);
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(1);
  expect(readFileSync(theme, "utf8")).toBe(edited);
  expect(await runBaseline(scratch, ["theme-css"])).toBe(0);
  expect(readFileSync(theme, "utf8")).toBe(committed);
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(0);
});

test("a new valid token makes the old output stale and regenerates without a count edit", async ({ scratch, repoRoot }) => {
  const theme = plantTheme(scratch, repoRoot);
  const basePath = join(scratch, TOKEN_CONTRACT_PATHS.base);
  const base = JSON.parse(readFileSync(basePath, "utf8")) as Record<string, unknown>;
  base["q11-probe"] = { $type: "dimension", $value: { value: 1, unit: "px" } };
  writeFileSync(basePath, JSON.stringify(base));
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(1);
  expect(await runBaseline(scratch, ["theme-css"])).toBe(0);
  expect(readFileSync(theme, "utf8")).toContain("--q11-probe: 1px;");
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(0);
});

test("missing generated CSS is drift and regeneration recreates it", async ({ scratch, repoRoot }) => {
  const theme = plantTheme(scratch, repoRoot);
  rmSync(theme);
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(1);
  expect(await runBaseline(scratch, ["theme-css"])).toBe(0);
  expect(await runBaseline(scratch, ["theme-css", "--check"])).toBe(0);
});

test("unreadable generator input refuses before writing any output", async ({ scratch, repoRoot }) => {
  const theme = plantTheme(scratch, repoRoot);
  const committed = readFileSync(theme, "utf8");
  writeFileSync(join(scratch, TOKEN_CONTRACT_PATHS.base), "invalid JSON");
  await expect(Promise.resolve().then(() => runBaseline(scratch, ["theme-css", "--check"]))).rejects.toThrow("JSON");
  await expect(Promise.resolve().then(() => runBaseline(scratch, ["theme-css"]))).rejects.toThrow("JSON");
  expect(readFileSync(theme, "utf8")).toBe(committed);
});

test("the CLI awaits theme freshness and classifies clean, drift, and failed derivation", { timeout: scaledBudget(30_000) }, async ({
  scratch,
  repoRoot,
  runCli,
}) => {
  const theme = plantTheme(scratch, repoRoot);
  const clean = await runCli("verify", ["baseline", "theme-css", "--check"], { cwd: scratch });
  await expect(clean).toExitWith(0);
  expect(clean.stdout).toContain(THEME);
  writeFileSync(theme, "/* stale */\n");
  const stale = await runCli("verify", ["baseline", "theme-css", "--check"], { cwd: scratch });
  await expect(stale).toExitWith(1);
  expect(stale.stdout).toContain("byte-for-byte");
  writeFileSync(join(scratch, TOKEN_CONTRACT_PATHS.base), "invalid JSON");
  const failed = await runCli("verify", ["baseline", "theme-css", "--check"], { cwd: scratch });
  await expect(failed).toExitWith(2);
  expect(failed.stderr).toContain("JSON");
  expect(readFileSync(theme, "utf8")).toBe("/* stale */\n");
});
