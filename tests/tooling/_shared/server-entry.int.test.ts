import { existsSync } from "node:fs";
import { join } from "node:path";
import { SERVER_ENTRY_IN_PACKAGE, SERVER_ENTRY_REL } from "@orb/tooling/_shared/server-entry";
import { serverSpawnPlan } from "../../../tooling/src/dev/index.ts";
import { buildProdSpawnPlan } from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

// Every launcher runs the one server entry. A moved entry must fail here, not in whichever launcher nobody ran.

test("the server entry exists in this checkout", ({ repoRoot }) => {
  expect(existsSync(join(repoRoot, SERVER_ENTRY_REL))).toBe(true);
});

test("pnpm start and pnpm dev both spawn that one file", ({ repoRoot }) => {
  const entry = join(repoRoot, SERVER_ENTRY_REL);
  const prod = buildProdSpawnPlan({ repoRoot, nodePath: "node", baseEnv: {}, logPath: join(repoRoot, "prod.log") });
  expect(prod.args).toEqual([entry]);
  const dev = serverSpawnPlan({
    nodePath: "node",
    server: { name: "@orb/server", dir: join(repoRoot, "packages", "server"), workspaceDeps: [] },
    watchRoots: [],
    cwd: repoRoot,
    env: {},
  });
  expect(dev.args.at(-1)).toBe(entry);
  expect(entry.endsWith(SERVER_ENTRY_IN_PACKAGE)).toBe(true);
});
