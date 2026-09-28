import { spawnSync } from "node:child_process";
import { mkdir, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
