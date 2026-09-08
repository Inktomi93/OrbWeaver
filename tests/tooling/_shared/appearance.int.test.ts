// The appearance shim, proven where it actually lives: a REAL browser run of the snap CLI against a stub
// origin that answers the batched `settings.getUserSettings` GET the app makes. The pure merge semantics are
// pinned in probe-appearance.test.ts; what this file proves is the part no unit can see —
//   • the interception reaches the RENDERED state (the page's own read of the response changes),
//   • the shim writes NOTHING (the origin's stored settings are byte-identical afterwards, and it never
//     receives a mutation — that is the whole point: probes must not edit the owner's account),
//   • sibling procedures in the same batch come through untouched.
// Stub origin rather than the dev stack so the proof runs anywhere and never depends on the owner's row.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// 3-up: tests/tooling/_shared → repo root (re-derived at the P2 relocation — the depth-derived-root class).
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../tooling/src/snap/cli.ts", import.meta.url));
// LOAD-SCALED, not fixed (#1040). This file is a REAL browser drive and it sat on a hard 60s ceiling that
// took no notice of the box: six drives in one battery (2026-09-01) blew it under sibling-lane load and
// surfaced as generic timeouts indistinguishable from assertion reds. Load stretches a wall clock roughly
// linearly, which is exactly the case `scaledBudget` covers — the measured-RATE case it does NOT cover is
// `labelRateLoad` (#1616), and this file has no rate arms: every assertion here is a DOM/byte fact. Cap 4
// matches the other heavy tooling suites. The file runs in the parallel tooling project.
const RUN_TIMEOUT_MS = scaledBudget(60_000, 4);
vi.setConfig({ testTimeout: RUN_TIMEOUT_MS, hookTimeout: RUN_TIMEOUT_MS });

/** The stub account: reduced motion ON and comfortable density, exactly the shape the owner's row has. */
const STORED = { reducedMotion: true, density: "comfortable", blurSurfaces: ["panels", "composer", "modals"] };
const EMPTY_ORB_CONSOLE = "<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128})};</script>";

// The page reads the SAME batched GET the app's httpBatchLink sends (two procedures, settings SECOND — so a
// shim that patched element 0 would fail this), then stamps what it read onto <html>. data-app-ready is set
// so snap's readiness wait resolves immediately.
const PAGE_HTML = `<!doctype html><html><body><main>stub</main>${EMPTY_ORB_CONSOLE}<script>
fetch("/api/trpc/persona.list,settings.getUserSettings?batch=1&input=%7B%7D")
  .then((r) => r.json())
  .then((body) => {
    const appearance = body[1].result.data.config.appearance;
    document.documentElement.dataset.reducedMotion = String(appearance.reducedMotion);
    document.documentElement.dataset.density = String(appearance.density);
    document.documentElement.dataset.sibling = String(body[0].result.data.rows);
    document.documentElement.setAttribute("data-app-ready", "");
  });
</script></body></html>`;
const NO_SETTINGS_HTML = `<!doctype html><html data-app-ready><body><main>no settings request</main>${EMPTY_ORB_CONSOLE}</body></html>`;

let server: Server;
let base = "";
let mutations = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method !== "GET") {
      mutations += 1;
      res.writeHead(405).end();
      return;
    }
    if (url.startsWith("/api/trpc/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ result: { data: { rows: 2 } } }, { result: { data: { config: { appearance: STORED } } } }]));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(url.startsWith("/no-settings") ? NO_SETTINGS_HTML : PAGE_HTML);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

/** ASYNC on purpose: the stub origin lives in THIS process, and a `spawnSync` would block the event loop
 *  that has to answer the browser's request — every navigation then times out (measured while writing this).
 */
async function runSnap(args: readonly string[]): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> {
  return await runSnapAt("/", args);
}

async function runSnapAt(
  route: string,
  args: readonly string[],
): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(process.execPath, [SNAP_CLI, route, "--base", base, "--no-shot", "--no-failure-evidence", ...args], {
    cwd: ROOT,
    timeout: RUN_TIMEOUT_MS,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const status = await new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });
  return { status, stdout, stderr };
}

const READ_STATE = "(()=>JSON.stringify(document.documentElement.dataset))()";

test("the shim changes what the PAGE reads, and the origin's stored settings never move", async () => {
  const bare = await runSnap(["--eval", READ_STATE]);
  expect(bare.status, bare.stdout + bare.stderr).toBe(0);
  // The red arm, and the one that made this lane necessary: the account says reduce, so the app reduces.
  expect(bare.stdout).toContain('\\"reducedMotion\\":\\"true\\"');

  const shimmed = await runSnap(["--full-motion", "--eval", READ_STATE]);
  expect(shimmed.status, shimmed.stdout + shimmed.stderr).toBe(0);
  expect(shimmed.stdout).toContain('\\"reducedMotion\\":\\"false\\"');
  // An unnamed key keeps the account's real value — an override of one axis, not a synthetic blob.
  expect(shimmed.stdout).toContain('\\"density\\":\\"comfortable\\"');
  // The sibling procedure of the SAME batch is untouched.
  expect(shimmed.stdout).toContain('\\"sibling\\":\\"2\\"');

  // NON-MUTATION: the stored object is the one the origin still serves, and no write ever reached it.
  expect(STORED.reducedMotion).toBe(true);
  expect(mutations).toBe(0);
});

test("a non-motion axis renders too — one flag generalizes to every appearance setting", async () => {
  const compact = await runSnap(["--appearance", '{"density":"compact"}', "--eval", READ_STATE]);

  expect(compact.status, compact.stdout + compact.stderr).toBe(0);
  expect(compact.stdout).toContain('\\"density\\":\\"compact\\"');
  // reducedMotion was not named, so it stays the account's own value.
  expect(compact.stdout).toContain('\\"reducedMotion\\":\\"true\\"');
});

test("the manifest records WHICH arm was measured, so a report cannot be read against the wrong state", async ({ scratch }) => {
  const manifestShot = `${scratch}/orb-snap-appearance-manifest.png`;
  const manifestJson = `${scratch}/orb-snap-appearance-manifest.json`;
  const shimmed = await runSnap(["--appearance-preset", "compact", "--json", "--out", manifestShot, "--eval", READ_STATE]);
  expect(shimmed.status, shimmed.stdout + shimmed.stderr).toBe(0);

  const manifest = JSON.parse(readFileSync(manifestJson, "utf8")) as {
    environment: { appearance: Record<string, unknown> | null; appearanceApplied: boolean | null; reducedMotion: boolean };
  };

  // The app-setting arm is recorded as data; the OS media query stays its own separate field.
  expect(manifest.environment.appearance?.["density"]).toBe("compact");
  expect(manifest.environment.appearanceApplied).toBe(true);
  expect(manifest.environment.reducedMotion).toBe(false);
  expect(shimmed.stdout).toContain('\\"density\\":\\"compact\\"');
});

test("the manifest distinguishes a requested appearance patch from one never applied", async ({ scratch }) => {
  const manifestShot = `${scratch}/orb-snap-appearance-manifest.png`;
  const manifestJson = `${scratch}/orb-snap-appearance-manifest.json`;
  const shimmed = await runSnapAt("/no-settings", ["--appearance", '{"density":"compact"}', "--json", "--out", manifestShot]);
  expect(shimmed.status, shimmed.stdout + shimmed.stderr).toBe(0);
  const manifest = JSON.parse(readFileSync(manifestJson, "utf8")) as {
    environment: { appearance: Record<string, unknown> | null; appearanceApplied: boolean | null };
  };
  expect(manifest.environment.appearance).toEqual({ density: "compact" });
  expect(manifest.environment.appearanceApplied).toBe(false);
});

test("the prepaint recorder starts before the document element exists without a page error", async () => {
  const recorded = await runSnapAt("/no-settings", ["--full-motion", "--eval", "(()=>JSON.stringify(globalThis.__orbAppearancePrepaint))()"]);

  expect(recorded.status, recorded.stdout + recorded.stderr).toBe(0);
  expect(recorded.stdout).toContain('\\"phase\\":\\"init\\",\\"dataTheme\\":null');
});
