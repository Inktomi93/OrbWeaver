// The THEME arm of the settings shim, proven where it actually lives: a REAL browser run of the snap CLI
// against a stub origin that answers BOTH tRPC reads the app makes — the batched `settings.getUserSettings`
// GET and the `settings.listThemes` GET the shim itself asks to turn a NAME into the account's real id. The
// pure matching rules are pinned in probe-theme.test.ts; what this file proves is the part no unit can see:
//   • `--theme Light` reaches the RENDERED state (the page's own read of the selection changes),
//   • the shim writes NOTHING (no mutation ever reaches the origin, and the stored selection is unmoved),
//   • an UNKNOWN theme WARNS loudly on stderr and renders the account's OWN theme rather than silently
//     lying about which arm was measured (the trap #225 exists to close),
//   • an un-flagged run is unchanged — the default path never patches.
// Stub origin rather than the dev stack so the proof runs anywhere and never depends on the owner's row.
import { spawn } from "node:child_process";
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
// LOAD-SCALED, not fixed (#1040) — the same fixed-ceiling defect as its appearance.int sibling, and the
// same remedy: a real browser drive's wall clock is the box's to set. No rate arms here (every assertion
// is a DOM/byte fact), so this file scales its budget and never withholds. Lane: `live-drive`.
const RUN_TIMEOUT_MS = scaledBudget(60_000, 4);
vi.setConfig({ testTimeout: RUN_TIMEOUT_MS, hookTimeout: RUN_TIMEOUT_MS });

/** The stub account: Hearth selected, exactly the shape `config.theme` has on the wire. */
const STORED_THEME = { selectedThemeId: "theme_00000000000000000000000001" };
/** The stub library `settings.listThemes` answers with — the seed rows a name resolves against. */
const LIBRARY = [
  { id: "theme_00000000000000000000000001", name: "Hearth", isSeed: true },
  { id: "theme_00000000000000000000000003", name: "Light", isSeed: true },
];

// The page reads the SAME batched GET the app's httpBatchLink sends (settings SECOND, so an element-0 patch
// would fail this) and stamps the SELECTION it read onto <html> — the stand-in for the app's real chain
// (use-selected-theme → getTheme → [data-theme]). data-app-ready satisfies snap's readiness wait.
const PAGE_HTML = `<!doctype html><html><body><main>stub</main><script>
fetch("/api/trpc/persona.list,settings.getUserSettings?batch=1&input=%7B%7D")
  .then((r) => r.json())
  .then((body) => {
    document.documentElement.dataset.selected = String(body[1].result.data.config.theme.selectedThemeId);
    document.documentElement.dataset.density = String(body[1].result.data.config.appearance.density);
    document.documentElement.dataset.sibling = String(body[0].result.data.rows);
    document.documentElement.setAttribute("data-app-ready", "");
  });
</script></body></html>`;

let server: Server;
let base = "";
let mutations = 0;
let listThemeReads = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method !== "GET") {
      mutations += 1;
      res.writeHead(405).end();
      return;
    }
    if (url.startsWith("/api/trpc/settings.listThemes")) {
      listThemeReads += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ result: { data: LIBRARY } }]));
      return;
    }
    if (url.startsWith("/api/trpc/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify([{ result: { data: { rows: 2 } } }, { result: { data: { config: { appearance: { density: "comfortable" }, theme: STORED_THEME } } } }]),
      );
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(PAGE_HTML);
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
 *  that has to answer the browser's request — every navigation then times out. */
async function runSnap(args: readonly string[]): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(process.execPath, [SNAP_CLI, "/", "--base", base, "--no-shot", "--no-failure-evidence", ...args], {
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
const LIGHT_ID = "theme_00000000000000000000000003";
const HEARTH_ID = "theme_00000000000000000000000001";

test("--theme <name> flips the SELECTION the page reads, resolved against the account's own library", async () => {
  const bare = await runSnap(["--eval", READ_STATE]);
  expect(bare.status, bare.stdout + bare.stderr).toBe(0);
  // The red arm: with no flag the account's stored theme is what renders.
  expect(bare.stdout).toContain(`\\"selected\\":\\"${HEARTH_ID}\\"`);

  const light = await runSnap(["--theme", "Light", "--eval", READ_STATE]);
  expect(light.status, light.stdout + light.stderr).toBe(0);
  expect(light.stdout).toContain(`\\"selected\\":\\"${LIGHT_ID}\\"`);
  // The name was resolved by ASKING the app, not by re-spelling a sentinel id in the probe kit.
  expect(listThemeReads).toBeGreaterThan(0);
  // A sibling procedure of the same batch, and the appearance axis nobody named, are untouched.
  expect(light.stdout).toContain('\\"sibling\\":\\"2\\"');
  expect(light.stdout).toContain('\\"density\\":\\"comfortable\\"');

  // NON-MUTATION: the stored selection is the one the origin still serves, and no write ever reached it.
  expect(STORED_THEME.selectedThemeId).toBe(HEARTH_ID);
  expect(mutations).toBe(0);
});

test("`--theme none` is the no-selection arm, and it composes with the appearance shim", async () => {
  const none = await runSnap(["--theme", "none", "--appearance", '{"density":"compact"}', "--eval", READ_STATE]);

  expect(none.status, none.stdout + none.stderr).toBe(0);
  expect(none.stdout).toContain('\\"selected\\":\\"null\\"');
  expect(none.stdout).toContain('\\"density\\":\\"compact\\"');
});

test("an unknown theme WARNS with the real list and renders the ACCOUNT'S theme — never a silent wrong arm", async () => {
  const bogus = await runSnap(["--theme", "Solarized", "--eval", READ_STATE]);

  // The run still succeeds (a probe must not die on this), but it says loudly what it measured.
  expect(bogus.status, bogus.stdout + bogus.stderr).toBe(0);
  expect(bogus.stderr).toContain("THEME SHIM WARNING");
  expect(bogus.stderr).toContain("Solarized");
  expect(bogus.stderr).toContain("Hearth, Light");
  expect(bogus.stdout).toContain(`\\"selected\\":\\"${HEARTH_ID}\\"`);
});

test("an empty --theme value is refused before a browser boots (misuse posture)", async () => {
  const misuse = await runSnap(["--theme"]);

  expect(misuse.status).toBe(3);
  expect(misuse.stdout).toContain("--theme");
});
