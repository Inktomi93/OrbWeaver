// The dev server's watch coverage of the SIBLING workspace packages (#2462) — a ROOT-CONFIG pin, hence a
// flat `tests/tooling/` file (the `test-layout` gate's exempt non-mirror tier: `packages/client/vite.config.ts`
// is not under a `src/`, so it prefix-swaps to nothing — the same standing as `vite-fs-deny.test.ts`).
//
// WHAT BROKE. Vite watches everything outside `root` ONE PATH AT A TIME (`ensureWatchedFile` →
// `watcher.add(file)`), and a chokidar path added AS A FILE stops delivering after the second
// unlink-then-create cycle — permanently, while `getWatched()` keeps listing it. Git writes by
// unlink+create, so the second merge train to touch a given `@orb/{kit,contracts,ui}` module froze it:
// :5173 kept serving the transform computed for the first one, and no later regeneration, `touch` or merge
// could dislodge it. Measured live 2026-09-19 against the real client config (a dev server + a `/@fs/` read
// of the generated `@orb/ui` token map, 30 rewrites): cycle 1 fresh, cycles 2-30 stale; with the plugin,
// all 30 fresh.
//
// WHY THIS DRIVES A REAL DEV SERVER IN A CHILD PROCESS. The defect is not in any expression this config
// evaluates — it is in what a RUNNING watcher delivers, which only a live `createServer` plus a real
// transform can answer. `vite` is a `@orb/client` dependency and resolves from nowhere else in the
// workspace, so the driver below runs as its own node process next to the config that owns it. It uses
// `middlewareMode` (no port bound, no HTTP) over a planted temp workspace, so it touches no repo file and
// can never collide with another lane's tree; `orbWorkspaceSourceWatch(dirs)` takes its directories as a
// parameter for exactly this.
//
// THE FIRST TEST IS THE PLANTED POSITIVE CONTROL. Without the plugin the same driver MUST report a stale
// cycle — a watch-coverage pin that cannot fail is not a pin, and that arm is also what proves the harness
// (temp tree, cycle timing, transform read) is measuring anything at all.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RUN_BUDGET_MS = scaledBudget(60_000);
/** Cycles to drive: the per-file watch survives two and dies on the third, so three is the whole defect. */
const CYCLES = 3;

/** The driver: boots one dev server over a planted temp workspace and reports, per git-style rewrite of a
 *  module OUTSIDE its root, whether the server's own transform carried the new bytes. */
function driverSource(withPlugin: boolean): string {
  return `import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from ${JSON.stringify(`${REPO_ROOT}/packages/client/node_modules/vite/dist/node/index.js`)};
import { orbWorkspaceSourceWatch } from ${JSON.stringify(`${REPO_ROOT}/packages/client/vite.config.ts`)};

const base = process.argv[2];
const root = join(base, "root");
const outside = join(base, "outside");
mkdirSync(root, { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(join(root, "index.html"), "<!doctype html><html><body></body></html>\\n");
const module = join(outside, "generated.ts");
writeFileSync(module, "export const marker = 0;\\n");

const server = await createServer({
  configFile: false,
  root,
  logLevel: "silent",
  plugins: ${withPlugin ? "[orbWorkspaceSourceWatch([outside])]" : "[]"},
  server: { middlewareMode: true, fs: { allow: [base] } },
});
// Chokidar coalesces a write into one \`change\` on a short debounce; this is the settle window per cycle.
const settle = () => new Promise((done) => setTimeout(done, 400));
const environment = server.environments.client;
// Prime: the first transform is what puts the module in the graph AND what vite's own \`ensureWatchedFile\`
// adds as a FILE — the watch this plugin has to outlive.
await environment.transformRequest("/@fs" + module);
await settle();
const fresh = [];
for (let cycle = 1; cycle <= ${CYCLES}; cycle++) {
  unlinkSync(module);
  writeFileSync(module, "export const marker = " + cycle + ";\\n");
  await settle();
  const result = await environment.transformRequest("/@fs" + module);
  fresh.push(result?.code.includes("marker = " + cycle) === true);
}
await server.close();
console.log(JSON.stringify({ fresh }));
`;
}

async function servedAcrossRewrites(withPlugin: boolean): Promise<readonly boolean[]> {
  const base = mkdtempSync(join(tmpdir(), "orb-wsw-"));
  const driver = join(base, "driver.mjs");
  writeFileSync(driver, driverSource(withPlugin));
  try {
    const result = await spawnNiced("node", [driver, base], { cwd: REPO_ROOT, timeoutMs: RUN_BUDGET_MS });
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const line = result.stdout.trim().split("\n").at(-1) ?? "";
    return (JSON.parse(line) as { readonly fresh: readonly boolean[] }).fresh;
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("CONTROL: with no watch plugin, vite's per-file watch of an out-of-root module goes deaf mid-run", async () => {
  // Not an exact positional array: WHICH cycle kills it is a chokidar internal, and pinning the index would
  // make this control red on a chokidar bump that shifts it. What must stay true is that the unguarded
  // server DOES go stale within three git-style rewrites — otherwise this file is testing nothing.
  expect(await servedAcrossRewrites(false)).toContain(false);
});

test("orb:workspace-source-watch keeps every git-style rewrite of an out-of-root module served fresh", async () => {
  expect(await servedAcrossRewrites(true)).toEqual(Array.from({ length: CYCLES }, () => true));
});
