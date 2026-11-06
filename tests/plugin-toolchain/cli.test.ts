import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";

test("the author guide and the JSON map name the source file each runtime world is authored in", async ({ repoRoot }) => {
  const cli = join(repoRoot, "packages/plugin-toolchain/src/cli.ts");
  const json = await spawnNiced(process.execPath, [cli, "support", "--format", "json"], { cwd: repoRoot });
  await expect(json).toExitWith(0);
  const sources = z.object({ runtimes: z.record(z.string(), z.object({ sourceEntry: z.string() })) }).parse(JSON.parse(json.stdout));
  expect(Object.fromEntries(Object.entries(sources.runtimes).map(([world, runtime]) => [world, runtime.sourceEntry]))).toEqual({
    main: "main.ts",
    ui: "ui.ts",
    frame: "frame.ts",
  });
  const guide = await spawnNiced(process.execPath, [cli, "support", "--format", "markdown"], { cwd: repoRoot });
  await expect(guide).toExitWith(0);
  const worlds = guide.stdout.split("## Runtime worlds")[1]?.split("\n## ")[0] ?? "";
  const rows = worlds.split("\n").filter((line) => line.startsWith("| `"));
  expect(rows.map((row) => row.split("|")[2]?.trim())).toEqual(["`main.ts`", "`ui.ts`", "`frame.ts`"]);
});

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
