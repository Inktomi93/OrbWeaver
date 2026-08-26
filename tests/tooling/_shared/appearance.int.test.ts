// The appearance shim, proven where it actually lives: a REAL browser run of the snap CLI against a stub
// origin that answers the batched `settings.getUserSettings` GET the app makes. The pure merge semantics are
// pinned in probe-appearance.test.ts; what this file proves is the part no unit can see —
//   • the interception reaches the RENDERED state (the page's own read of the response changes),
//   • the shim writes NOTHING (the origin's stored settings are byte-identical afterwards, and it never
//     receives a mutation — that is the whole point: probes must not edit the owner's account),
//   • sibling procedures in the same batch come through untouched.
// Stub origin rather than the dev stack so the proof runs anywhere and never depends on the owner's row.
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

// 3-up: tests/tooling/_shared → repo root (re-derived at the P2 relocation — the depth-derived-root class).
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../tooling/src/snap/cli.ts", import.meta.url));
const RUN_TIMEOUT_MS = 60_000;

/** The stub account: reduced motion ON and comfortable density, exactly the shape the owner's row has. */
const STORED = { reducedMotion: true, density: "comfortable", blurSurfaces: ["panels", "composer", "modals"] };

// The page reads the SAME batched GET the app's httpBatchLink sends (two procedures, settings SECOND — so a
// shim that patched element 0 would fail this), then stamps what it read onto <html>. data-app-ready is set
// so snap's readiness wait resolves immediately.
const PAGE_HTML = `<!doctype html><html><body><main>stub</main><script>
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
const NO_SETTINGS_HTML = "<!doctype html><html data-app-ready><body><main>no settings request</main></body></html>";

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
const MANIFEST_SHOT = "/tmp/orb-snap-appearance-manifest.png";
const MANIFEST_JSON = "/tmp/orb-snap-appearance-manifest.json";

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

test("the manifest records WHICH arm was measured, so a report cannot be read against the wrong state", async () => {
  const shimmed = await runSnap(["--appearance-preset", "compact", "--json", "--out", MANIFEST_SHOT, "--eval", READ_STATE]);
  expect(shimmed.status, shimmed.stdout + shimmed.stderr).toBe(0);

  const manifest = JSON.parse(readFileSync(MANIFEST_JSON, "utf8")) as {
    environment: { appearance: Record<string, unknown> | null; appearanceApplied: boolean | null; reducedMotion: boolean };
  };
  rmSync(MANIFEST_JSON, { force: true });
  rmSync(MANIFEST_SHOT, { force: true });

  // The app-setting arm is recorded as data; the OS media query stays its own separate field.
  expect(manifest.environment.appearance?.["density"]).toBe("compact");
  expect(manifest.environment.appearanceApplied).toBe(true);
  expect(manifest.environment.reducedMotion).toBe(false);
  expect(shimmed.stdout).toContain('\\"density\\":\\"compact\\"');
});

test("the manifest distinguishes a requested appearance patch from one never applied", async () => {
  const shimmed = await runSnapAt("/no-settings", ["--appearance", '{"density":"compact"}', "--json", "--out", MANIFEST_SHOT]);
  expect(shimmed.status, shimmed.stdout + shimmed.stderr).toBe(0);
  const manifest = JSON.parse(readFileSync(MANIFEST_JSON, "utf8")) as {
    environment: { appearance: Record<string, unknown> | null; appearanceApplied: boolean | null };
  };
  rmSync(MANIFEST_JSON, { force: true });
  rmSync(MANIFEST_SHOT, { force: true });
  expect(manifest.environment.appearance).toEqual({ density: "compact" });
  expect(manifest.environment.appearanceApplied).toBe(false);
});
