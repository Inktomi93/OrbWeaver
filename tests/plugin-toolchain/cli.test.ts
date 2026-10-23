import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";

test("support output writes or checks one destination and refuses competing destinations", async ({ repoRoot, scratch }) => {
  const cli = join(repoRoot, "packages/plugin-toolchain/src/cli.ts");
  const destination = join(scratch, "support.json");
  const stdout = await spawnNiced(process.execPath, [cli, "support", "--format", "json"], { cwd: repoRoot });
  await expect(stdout).toExitWith(0);
  const written = await spawnNiced(process.execPath, [cli, "support", "--format", "json", "--write", destination], { cwd: repoRoot });
  await expect(written).toExitWith(0);
  expect(await readFile(destination, "utf8")).toBe(stdout.stdout);
  const checked = await spawnNiced(process.execPath, [cli, "support", "--format", "json", "--check", destination], { cwd: repoRoot });
  await expect(checked).toExitWith(0);
  const refused = await spawnNiced(process.execPath, [cli, "support", "--write", destination, "--check", destination], { cwd: repoRoot });
  await expect(refused).toExitWith(3);
  expect(refused.stderr).toContain("orb-plugin support accepts only one of --write or --check");
  expect(await readFile(destination, "utf8")).toBe(stdout.stdout);
});
