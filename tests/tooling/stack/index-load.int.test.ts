// @subject tooling/src/stack/index.ts
// The stack index is the one door the snap CLI reads its port and fixture constants through, so importing it loads no command module
// and not the server network adapter; a command loads on its first call.
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { scaledBudget } from "../_load-budget.ts";

const toUrl = (relative: string): string => pathToFileURL(new URL(relative, import.meta.url).pathname).href;
const INDEX_URL = toUrl("../../../tooling/src/stack/index.ts");
const DRAIN_VERDICT_URL = toUrl("../../../tooling/src/stack/lib/drain-verdict.ts");
const RUN_BUDGET_MS = scaledBudget(30_000);
const COMMAND_DIR = "/tooling/src/stack/ops/";
const STATIC_COMMAND = "/tooling/src/stack/ops/setup.ts";
const SERVER_NETWORK_DIR = "/packages/server/src/infra/network/";

// Records every module URL the loader reads, imports the index, snapshots the list, then imports the one module that does need the
// server network adapter: the control that the recorder sees that adapter at all.
const CHILD = [
  'import { registerHooks } from "node:module";',
  "const loaded = [];",
  "registerHooks({ load(url, context, nextLoad) { loaded.push(url); return nextLoad(url, context); } });",
  `await import(${JSON.stringify(INDEX_URL)});`,
  "const afterIndex = [...loaded];",
  `await import(${JSON.stringify(DRAIN_VERDICT_URL)});`,
  "process.stdout.write(JSON.stringify({ afterIndex, afterDrain: loaded }));",
].join("\n");

test("importing the stack index loads no command module and not the server network adapter", { timeout: RUN_BUDGET_MS }, async ({ plantedTree }) => {
  const root = await plantedTree({ "child.mjs": CHILD });
  const res = await spawnNiced(process.execPath, [`${root}/child.mjs`]);
  expect(res.code).toBe(0);
  const { afterIndex, afterDrain } = JSON.parse(res.stdout) as { readonly afterIndex: readonly string[]; readonly afterDrain: readonly string[] };

  expect(afterIndex.some((url) => url.endsWith("/tooling/src/stack/lib/stack-plan.ts"))).toBe(true);
  expect(afterIndex.filter((url) => url.includes(COMMAND_DIR) && !url.endsWith(STATIC_COMMAND))).toEqual([]);
  expect(afterIndex.filter((url) => url.includes(SERVER_NETWORK_DIR))).toEqual([]);
  expect(afterDrain.some((url) => url.includes(SERVER_NETWORK_DIR))).toBe(true);
});
