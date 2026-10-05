// The Tier-C guest Worker as the DEV server serves it: a real vite `createServer` (middlewareMode, the client
// root, plugin-react) walks the worker's transformed import graph and reports every module that pulls in the
// react-refresh preamble — which reads `window`, so one such module crashes every scripted surface on boot.
// Runs as a child process because `vite` resolves only from `@orb/client` (the vite-workspace-source-watch
// precedent). Production builds carry no preamble; this is the dev-only half the depcruise rule cannot run.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../../../tooling/_load-budget.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../../../../../..");
const CLIENT_ROOT = join(REPO_ROOT, "packages", "client");
const RUN_BUDGET_MS = scaledBudget(90_000);
const WORKER_ENTRY = "/src/features/plugin/lib/ui-guest/ui-guest.worker.ts?worker_file&type=module";

function driverSource(): string {
  return `import { createServer } from ${JSON.stringify(join(CLIENT_ROOT, "node_modules/vite/dist/node/index.js"))};
import react from ${JSON.stringify(join(CLIENT_ROOT, "node_modules/@vitejs/plugin-react/dist/index.js"))};

const server = await createServer({
  configFile: false,
  root: ${JSON.stringify(CLIENT_ROOT)},
  logLevel: "silent",
  plugins: [react()],
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});
const environment = server.environments.client;
const IMPORT_RE = /(?:from\\s*|import\\s*\\(?\\s*)"([^"]+)"/g;
const seen = new Set();
const refreshed = [];
const queue = [process.argv[2]];
while (queue.length > 0) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const result = await environment.transformRequest(url);
  if (result === null) continue;
  for (const [, spec] of result.code.matchAll(IMPORT_RE)) {
    if (spec === "/@react-refresh") {
      refreshed.push(url);
      continue;
    }
    // Third-party and vite-internal modules are pre-bundled, never refresh-wrapped; asset and CSS requests
    // carry no imports. Only source modules can bring the preamble in.
    if (!spec.startsWith("/") || spec.startsWith("/node_modules/") || spec.startsWith("/@id/") || spec.startsWith("/@vite/") || spec.includes("?url") || spec.includes(".css")) continue;
    queue.push(spec);
  }
}
await server.close();
console.log(JSON.stringify({ walked: seen.size, refreshed }));
`;
}

async function refreshedModules(entry: string): Promise<{ readonly walked: number; readonly refreshed: readonly string[] }> {
  const base = mkdtempSync(join(tmpdir(), "orb-guest-dev-"));
  const driver = join(base, "driver.mjs");
  writeFileSync(driver, driverSource());
  try {
    const result = await spawnNiced("node", [driver, entry], { cwd: REPO_ROOT, timeoutMs: RUN_BUDGET_MS });
    expect(result.code, result.stderr || result.stdout).toBe(0);
    return JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "") as { readonly walked: number; readonly refreshed: readonly string[] };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("CONTROL: the client #lib barrel's dev graph does carry the react-refresh preamble", { timeout: RUN_BUDGET_MS }, async () => {
  expect((await refreshedModules("/src/lib/index.ts")).refreshed.length).toBeGreaterThan(0);
});

test("the scripted-surface guest Worker's dev graph loads no module with the react-refresh preamble", { timeout: RUN_BUDGET_MS }, async () => {
  const { walked, refreshed } = await refreshedModules(WORKER_ENTRY);
  // A walk that never left the entry would pass vacuously.
  expect(walked).toBeGreaterThan(1);
  expect(refreshed).toEqual([]);
});
