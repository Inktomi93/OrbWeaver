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
    `#!/usr/bin/env bash
if [ "$1 $2" = "rev-parse --show-toplevel" ]; then
  printf '%s\\n' '${laneRoot}'
elif [ "$1 $2 $3" = "worktree list --porcelain" ]; then
  printf 'worktree %s\\n\\n' '${mainRoot}'
  for ((i = 0; i < ${INVENTORY_ROWS}; i += 1)); do
    printf 'worktree /synthetic/%06d\\n\\n' "$i"
  done
else
  exit 64
fi
`,
  );
  await fakeBin("pnpm", "#!/usr/bin/env bash\nexit 0\n");

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
