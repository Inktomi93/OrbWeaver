// Concurrent dev origins must not replace each other's optimizer output; restarting one origin reuses its cache.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

test("distinct dev ports own disjoint optimizer caches and same-port restarts reuse completed output", { timeout: scaledBudget(30_000) }, async ({
  repoRoot,
  scratch,
}) => {
  const driver = join(scratch, "cache-ownership.mjs");
  const clientRoot = join(repoRoot, "packages", "client");
  writeFileSync(
    driver,
    `
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { createServer, resolveConfig } from ${JSON.stringify(pathToFileURL(join(clientRoot, "node_modules", "vite", "dist", "node", "index.js")).href)};
const scratch = ${JSON.stringify(scratch)};
const fixture = join(scratch, "fixture");
await mkdir(join(fixture, "node_modules", "cache-probe"), { recursive: true });
await writeFile(join(fixture, "node_modules", "cache-probe", "package.json"), JSON.stringify({ name: "cache-probe", main: "index.cjs" }));
await writeFile(join(fixture, "node_modules", "cache-probe", "index.cjs"), "module.exports = { value: 1 };\\n");
const configs = [];
for (const [index, port] of [5181, 5182, 5181].entries()) {
  process.env.VITE_PORT = String(port);
  const { default: config } = await import(${JSON.stringify(pathToFileURL(join(clientRoot, "vite.config.ts")).href)} + "?cache-owner=" + index);
  configs.push(await resolveConfig({ ...config, configFile: false, root: ${JSON.stringify(clientRoot)}, plugins: [], logLevel: "silent" }, "serve"));
}
const servers = [];
async function optimize(config, force) {
  const server = await createServer({
    configFile: false, root: fixture, plugins: [], logLevel: "silent",
    cacheDir: join(scratch, "caches", basename(config.cacheDir)),
    optimizeDeps: { noDiscovery: true, include: ["cache-probe"], force },
    server: { middlewareMode: true, watch: null },
  });
  servers.push(server);
  const optimizer = server.environments.client.depsOptimizer;
  await optimizer.init();
  await optimizer.metadata.discovered["cache-probe"]?.processing;
  const output = optimizer.metadata.optimized["cache-probe"].file;
  await readFile(output);
  return { output, hash: optimizer.metadata.browserHash };
}
try {
  const first = await optimize(configs[0], false);
  const sentinel = join(scratch, "caches", basename(configs[0].cacheDir), "deps", "owner-sentinel");
  await writeFile(sentinel, "first owner");
  await optimize(configs[1], true);
  const peerPreserved = existsSync(sentinel);
  const reused = await optimize(configs[2], false);
  console.log(JSON.stringify({ caches: configs.map(config => config.cacheDir), peerPreserved, stableReuse: first.hash === reused.hash && existsSync(sentinel) }));
} finally {
  await Promise.all(servers.map(server => server.close()));
}
`,
  );
  const result = await spawnNiced("node", [driver], { cwd: repoRoot, timeoutMs: scaledBudget(30_000) });
  expect(result.code, result.stderr).toBe(0);
  const observed = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "") as {
    readonly caches: readonly string[];
    readonly peerPreserved: boolean;
    readonly stableReuse: boolean;
  };
  expect(observed.peerPreserved, result.stdout).toBe(true);
  expect(observed.caches[0]).not.toBe(observed.caches[1]);
  expect(observed.caches[0]).toBe(observed.caches[2]);
  expect(observed.stableReuse).toBe(true);
});
