// Vite's native initial scan must see the source-consumed UI package's satellites before a browser crawls them.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

test("the initial native scan includes UI satellites while keeping UI source outside the prebundle", { timeout: scaledBudget(60_000) }, async ({
  repoRoot,
  scratch,
}) => {
  const driver = join(scratch, "scan.mjs");
  const clientRoot = join(repoRoot, "packages", "client");
  writeFileSync(
    driver,
    `
import { createServer } from ${JSON.stringify(pathToFileURL(join(clientRoot, "node_modules", "vite", "dist", "node", "index.js")).href)};
import config from ${JSON.stringify(pathToFileURL(join(clientRoot, "vite.config.ts")).href)};
const server = await createServer({ ...config, configFile: false, root: ${JSON.stringify(clientRoot)}, cacheDir: ${JSON.stringify(join(scratch, "cache"))}, plugins: [], logLevel: "error", server: { middlewareMode: true, watch: null } });
try {
  const optimizer = server.environments.client.depsOptimizer;
  await optimizer.scanProcessing;
  console.log(JSON.stringify({ ids: Object.keys(optimizer.metadata.discovered), excluded: optimizer.options.exclude }));
} finally {
  await server.close();
}
`,
  );
  const result = await spawnNiced("node", [driver], { cwd: repoRoot, timeoutMs: scaledBudget(60_000) });
  expect(result.code, result.stderr).toBe(0);
  const observed = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "") as { readonly ids: readonly string[]; readonly excluded: readonly string[] };
  expect(observed.ids).toEqual(
    expect.arrayContaining([
      "@base-ui/react/accordion",
      "@base-ui/react/combobox",
      "@base-ui/react/fieldset",
      "@base-ui/react/progress",
      "@base-ui/react/scroll-area",
      "diff",
    ]),
  );
  expect(observed.excluded).toContain("@orb/ui");
  expect(observed.ids.some((id) => id === "@orb/ui" || id.startsWith("@orb/ui/"))).toBe(false);
});
