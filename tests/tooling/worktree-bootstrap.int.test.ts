import { spawnSync } from "node:child_process";
import { mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "../support/tool-fixtures.ts";

const INVENTORY_ROWS = 200_000;

test("worktree bootstrap drains a large inventory before linking from its first checkout", async ({ fakeBin, repoRoot, scratch }) => {
  const mainRoot = join(scratch, "main");
  const laneRoot = join(scratch, "lane");
  await mkdir(laneRoot, { recursive: true });
  await mkdir(mainRoot, { recursive: true });
  await writeFile(join(mainRoot, ".env"), "ORBIT=ready\n", "utf8");

  await fakeBin(
    "git",
    `process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(141);
  throw error;
});
const args = process.argv.slice(2);
if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
  process.stdout.write(${JSON.stringify(`${laneRoot}\n`)});
} else if (args[0] === "worktree" && args[1] === "list" && args[2] === "--porcelain") {
  const rows = new Array(${String(INVENTORY_ROWS + 1)});
  rows[0] = ${JSON.stringify(`worktree ${mainRoot}\n\n`)};
  for (let index = 0; index < ${String(INVENTORY_ROWS)}; index += 1) {
    rows[index + 1] = \`worktree /synthetic/\${String(index).padStart(6, "0")}\\n\\n\`;
  }
  process.stdout.write(rows.join(""));
} else {
  process.exitCode = 64;
}
`,
  );
  await fakeBin("pnpm", "process.exitCode = 0;\n");

  const oldPipeline = spawnSync("bash", ["-o", "pipefail", "-c", "git worktree list --porcelain | awk '/^worktree /{print $2; exit}'"], {
    cwd: laneRoot,
    encoding: "utf8",
  });
  expect(oldPipeline.status).toBe(141);
  expect(oldPipeline.stdout).toBe(`${mainRoot}\n`);

  const repairedBootstrap = spawnSync("bash", [join(repoRoot, "scripts/worktree-bootstrap.sh")], {
    cwd: laneRoot,
    encoding: "utf8",
  });
  expect(repairedBootstrap.status).toBe(0);
  expect(repairedBootstrap.stderr).toBe("");
  expect(await readlink(join(laneRoot, ".env"))).toBe(join(mainRoot, ".env"));
  expect(repairedBootstrap.stdout).toContain(`linked .env → ${mainRoot}/.env`);
  expect(repairedBootstrap.stdout).toContain("worktree-bootstrap: done — deps + hooks ready");
});

test("an install failure stops bootstrap before provisioning local configuration", async ({ fakeBin, repoRoot, scratch }) => {
  await fakeBin("git", `process.stdout.write(${JSON.stringify(`${scratch}\n`)});`);
  await fakeBin("pnpm", "process.exitCode = 7;");
  const result = spawnSync("bash", [join(repoRoot, "scripts/worktree-bootstrap.sh")], { cwd: scratch, encoding: "utf8" });
  expect(result.status).toBe(7);
  expect(result.stdout).not.toContain("done");
});

test("bootstrap links local settings and syncs a SQLite backup in an external checkout", async ({ fakeBin, repoRoot, scratch }) => {
  const mainRoot = join(scratch, "main checkout");
  const laneRoot = join(scratch, "codex O'Brien checkout");
  await mkdir(join(mainRoot, ".claude"), { recursive: true });
  await mkdir(join(mainRoot, ".codegraph"), { recursive: true });
  await mkdir(laneRoot, { recursive: true });
  await writeFile(join(mainRoot, ".claude/settings.local.json"), "{}\n");
  await writeFile(join(laneRoot, ".env"), "LOCAL=preserved\n");
  const database = join(mainRoot, ".codegraph/codegraph.db");
  const seed = new DatabaseSync(database);
  seed.exec("CREATE TABLE witness (value TEXT); INSERT INTO witness VALUES ('main-index');");
  seed.close();
  await fakeBin(
    "git",
    `process.stdout.write(process.argv.includes("--show-toplevel") ? ${JSON.stringify(`${laneRoot}\n`)} : ${JSON.stringify(`worktree ${mainRoot}\n\nworktree ${laneRoot}\n`)});`,
  );
  await fakeBin("pnpm", "process.exitCode = 0;");
  await fakeBin(
    "codegraph",
    `import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(join(process.argv[3], ".codegraph/codegraph.db"), { readOnly: true });
const row = db.prepare("SELECT value FROM witness").get();
writeFileSync(join(process.argv[3], "synced.txt"), row.value + "\\n");
db.close();
`,
  );
  const result = spawnSync("bash", [join(repoRoot, "scripts/worktree-bootstrap.sh")], { cwd: laneRoot, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  expect(await readlink(join(laneRoot, ".claude/settings.local.json"))).toBe(join(mainRoot, ".claude/settings.local.json"));
  expect(await readFile(join(laneRoot, ".env"), "utf8")).toBe("LOCAL=preserved\n");
  expect(await readFile(join(laneRoot, "synced.txt"), "utf8")).toBe("main-index\n");
  await fakeBin("codegraph", "process.exitCode = 9;");
  const failedSync = spawnSync("bash", [join(repoRoot, "scripts/worktree-bootstrap.sh")], { cwd: laneRoot, encoding: "utf8" });
  expect(failedSync.status).toBe(9);
  expect(failedSync.stdout).not.toContain("done");
});
