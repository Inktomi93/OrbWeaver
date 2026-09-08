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
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { afterAll, beforeAll, vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// 3-up: tests/tooling/_shared → repo root (re-derived at the P2 relocation — the depth-derived-root class).
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../tooling/src/snap/cli.ts", import.meta.url));
// LOAD-SCALED, not fixed (#1040) — the same fixed-ceiling defect as its appearance.int sibling, and the
// same remedy: a real browser drive's wall clock is the box's to set. No rate arms here (every assertion
// is a DOM/byte fact), so this file scales its budget and never withholds. It runs in the parallel tooling project.
const RUN_TIMEOUT_MS = scaledBudget(60_000, 4);
vi.setConfig({ testTimeout: RUN_TIMEOUT_MS, hookTimeout: RUN_TIMEOUT_MS });

/** The stub account: Hearth selected, exactly the shape `config.theme` has on the wire. */
const STORED_THEME = { selectedThemeId: "theme_00000000000000000000000001" };
/** The stub library `settings.listThemes` answers with — the seed rows a name resolves against. */
const LIBRARY = [
  { id: "theme_00000000000000000000000001", name: "Hearth", isSeed: true },
  { id: "theme_00000000000000000000000003", name: "Light", isSeed: true },
];

/** The seed palettes that OWN a generated `[data-theme]` block, from the one generated source the blocks
 *  are emitted from. The page below applies the app's own rule (`dataThemeOf`) rather than a name list of
 *  its own: Hearth is a seed too, and it stamps NOTHING because it IS the base `@theme` ramp. */
const BLOCK_OWNING_SEEDS = Object.keys(SEED_THEME_VALUE_SETS);
const EMPTY_ORB_CONSOLE = "<script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128})};</script>";

// The page reads the SAME batched GET the app's httpBatchLink sends (settings SECOND, so an element-0 patch
// would fail this), then runs THE APP'S OWN TWO-HOP CHAIN: the selection it read is resolved to its theme
// ROW through a CHAINED `settings.getTheme` (use-selected-theme.ts), and only then does `[data-theme]` get
// stamped — `dataThemeOf`'s rule, seed-and-owns-a-block, lowercased.
//
// THE ORDER IS THE CONTRACT, not decoration (#1227/#1250): the app HOLDS readiness across that chain (the
// boot-critical read, #282) precisely so nothing samples the default palette in the gap, so `data-app-ready`
// is set LAST here. Before this, the stub set readiness immediately and never stamped at all — which is why
// snap's theme-stamp gate refused it: the fixture, not the gate, was the thing that had drifted from the app.
const PAGE_HTML = `<!doctype html><html><body><main>stub</main>${EMPTY_ORB_CONSOLE}<script>
const BLOCK_OWNERS = ${JSON.stringify(BLOCK_OWNING_SEEDS)};
fetch("/api/trpc/persona.list,settings.getUserSettings?batch=1&input=%7B%7D")
  .then((r) => r.json())
  .then(async (body) => {
    const config = body[1].result.data.config;
    const selected = config.theme.selectedThemeId;
    document.documentElement.dataset.selected = String(selected);
    document.documentElement.dataset.density = String(config.appearance.density);
    document.documentElement.dataset.sibling = String(body[0].result.data.rows);
    if (selected) {
      const input = encodeURIComponent(JSON.stringify({ 0: { id: selected } }));
      const rows = await fetch("/api/trpc/settings.getTheme?batch=1&input=" + input).then((r) => r.json());
      const row = rows[0].result.data;
      const stamp = row && row.isSeed ? String(row.name).toLowerCase() : null;
      if (stamp && BLOCK_OWNERS.includes(stamp)) {
        document.documentElement.setAttribute("data-theme", stamp);
      }
    }
    document.documentElement.setAttribute("data-app-ready", "");
  });
</script></body></html>`;

let server: Server;
let base = "";
let mutations = 0;
let listThemeReads = 0;
/** The CHAINED row read the page makes, mirroring `use-selected-theme`. Counted separately from
 *  `listThemeReads` on purpose: that counter is the receipt that the SHIM resolved the name by asking the
 *  app, and a page that also read `listThemes` would silently launder it. */
let getThemeReads = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method !== "GET") {
      mutations += 1;
      res.writeHead(405).end();
      return;
    }
    if (url.startsWith("/api/trpc/settings.getTheme")) {
      getThemeReads += 1;
      const row = LIBRARY.find((entry) => url.includes(entry.id)) ?? null;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ result: { data: row } }]));
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
  // …and the flip REACHED THE PAINT: the chained row read ran and the palette the shell selects on is the
  // one that was asked for. A selection that never becomes a `[data-theme]` stamp is the #1227 defect — a
  // run that samples the DEFAULT palette while reporting the theme on its RESULT line.
  expect(getThemeReads).toBeGreaterThan(0);
  expect(light.stdout).toContain('\\"theme\\":\\"light\\"');

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
