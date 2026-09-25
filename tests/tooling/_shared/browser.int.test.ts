import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { closeProbeSession, launchProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import { readBrowserAcceleration } from "@orb/tooling/_shared/browser-acceleration";
import type { LocalStorageSeed } from "@orb/tooling/_shared/browser-contract";
import { MOBILE_DEVICE, readBrowserEnvironment } from "@orb/tooling/_shared/browser-environment";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { currentRunMarker } from "@orb/tooling/_shared/run-marker";
import { chromium } from "@playwright/test";
import { afterAll, vi } from "vitest";
import type { ChromiumIdentity } from "../../support/chromium-processes.ts";
import {
  chromiumDescendantIdentities,
  identityKey,
  leakChromiumArgs,
  livingChromiumIdentities,
  terminateChromiumIdentities,
  watchChromiumDescendants,
} from "../../support/chromium-processes.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// THE FILE-LEVEL CEILING (#1232 residue, measured 2026-09-03). vitest.config.ts states the law for this
// lane in as many words: its own `testTimeout` is a BACKSTOP and "every file in this lane sets its own
// `vi.setConfig` from `scaledBudget(...)`". This file declared scaled ceilings for its CHILD PROCESSES
// and never for the TESTS, so every arm here drove a real Chromium under the parallel lane's unscaled 5 s
// default and timed out under whole-suite contention while passing standalone. A per-test annotation is
// not the fix — the arms without one are exactly the ones that flaked.
// 2x this file's 30 s child ceiling, so a test always outlives the CLI it is waiting on.
vi.setConfig({ testTimeout: scaledBudget(60_000), hookTimeout: scaledBudget(60_000) });

// 3-up: tests/tooling/_shared → repo root (re-derived at the P2 relocation — the depth-derived-root class).
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../../tooling/src/snap/cli.ts", import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), "orb-snap-browser-"));
const RUN_ID = `snap_browser_${process.pid}`;
const REPORT_SNAPS = join(ROOT, "reports", "snaps");
const REPORT_TRACES = join(ROOT, "reports", "traces");

interface SnapRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runSnap(args: readonly string[]): SnapRun {
  const result = spawnSync(process.execPath, [SNAP_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: scaledBudget(30_000),
  });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

async function runSnapAsync(args: readonly string[]): Promise<SnapRun> {
  const result = await spawnNiced(process.execPath, [SNAP_CLI, ...args], { cwd: ROOT, timeoutMs: scaledBudget(30_000) });
  return { status: result.code, stdout: result.stdout, stderr: result.stderr };
}

function fixture(name: string, body: string): string {
  const path = join(TEMP, `${name}.html`);
  writeFileSync(path, `<!doctype html><html><body>${body}</body></html>`);
  return path;
}

function manifest(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPORT_SNAPS, `${name}.json`), "utf8")) as Record<string, unknown>;
}

afterAll(() => {
  rmSync(TEMP, { recursive: true, force: true });
  for (const suffix of [
    "active",
    "hidden",
    "warning",
    "error",
    "scenario",
    "disabled",
    "watch",
    "checkpoint",
    "map_duplicates",
    "map_executable",
    "map_svg",
    "map_targets",
    "map_aria_hidden",
    "map_multi_text_node",
    "map_include_hidden_boundary",
    "wait_for_text",
    "wait_for_portal",
    "wait_for_selector_missing",
    "wait_for_selector_present",
    "deadcss_markers",
    "paint_settle",
  ]) {
    rmSync(join(REPORT_SNAPS, `${RUN_ID}_${suffix}.json`), { force: true });
    rmSync(join(REPORT_TRACES, `${RUN_ID}_${suffix}.zip`), { force: true });
    rmSync(join(REPORT_TRACES, `${RUN_ID}_${suffix}.har`), { force: true });
    rmSync(join(REPORT_SNAPS, `${RUN_ID}_${suffix}.png`), { force: true });
  }
});

test("a real Chromium process is disconnected after a driven body throws", async () => {
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });

  await expect(withProbeSession(session, () => Promise.reject(new Error("planted live drive failure")))).rejects.toThrow("planted live drive failure");
  expect(session.browser.isConnected()).toBe(false);
});

test("the shared launch publishes an explicit acceleration backend and feature receipt", async () => {
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  await withProbeSession(session, async () => {
    const acceleration = await readBrowserAcceleration(session.browser);
    expect(acceleration.backend).not.toBe("unknown");
    expect(acceleration.gpuCompositing).not.toBe("");
    expect(acceleration.rasterization).not.toBe("");
  });
});

test("a full mobile descriptor is distinguishable from a viewport-only desktop context", async () => {
  const viewport = { width: 430, height: 740 };
  const desktop = await launchProbeSession({
    headless: true,
    viewport,
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  const mobile = await launchProbeSession({
    headless: true,
    viewport,
    device: MOBILE_DEVICE,
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });

  try {
    await desktop.page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><main>desktop</main>');
    await mobile.page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><main>mobile</main>');
    const desktopEvidence = await readBrowserEnvironment(desktop.page, desktop.environmentContract);
    const mobileEvidence = await readBrowserEnvironment(mobile.page, mobile.environmentContract);
    const viewportOnlyFake = await readBrowserEnvironment(desktop.page, mobile.environmentContract);

    expect(desktop.environmentContract).toMatchObject({
      requested: { device: null, viewport },
      applied: { deviceScaleFactor: 1, hasTouch: false, isMobile: false },
    });
    expect(mobile.environmentContract).toMatchObject({
      requested: { device: MOBILE_DEVICE, viewport },
      applied: { deviceScaleFactor: 3, hasTouch: true, isMobile: true },
    });
    expect(desktopEvidence).toMatchObject({
      actual: {
        device: { kind: "desktop" },
        viewport,
        pointer: "fine",
        hover: "hover",
        hasTouch: false,
        maxTouchPoints: 0,
        deviceScaleFactor: 1,
        isMobile: false,
      },
      mismatches: [],
    });
    expect(mobileEvidence).toMatchObject({
      actual: {
        device: { kind: "named", name: MOBILE_DEVICE },
        viewport,
        pointer: "coarse",
        hover: "none",
        hasTouch: true,
        deviceScaleFactor: 3,
        isMobile: true,
      },
      mismatches: [],
    });
    expect(viewportOnlyFake.actual).toMatchObject({
      device: { kind: "unmatched" },
      viewport,
      pointer: "fine",
      hover: "hover",
      hasTouch: false,
      isMobile: null,
    });
    expect(viewportOnlyFake.mismatches).toEqual(
      expect.arrayContaining([
        "DPR expected 3 but observed 1",
        "touch expected present but maxTouchPoints=0",
        "pointer expected coarse but observed fine",
        "hover expected none but observed hover",
      ]),
    );
  } finally {
    await closeProbeSession(desktop);
    await closeProbeSession(mobile);
  }
});

test("media evidence proves contrast and CDP-only reduced transparency in both directions", async () => {
  const reduced = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: "dark",
    reducedMotion: true,
    contrast: "more",
    reducedTransparency: true,
    localStorage: [],
  });
  const reset = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: "light",
    reducedMotion: false,
    contrast: "no-preference",
    reducedTransparency: false,
    localStorage: [],
  });

  try {
    await reduced.page.setContent("<main>reduced media</main>");
    await reset.page.setContent("<main>reset media</main>");
    const reducedEvidence = await readBrowserEnvironment(reduced.page, reduced.environmentContract);
    const resetEvidence = await readBrowserEnvironment(reset.page, reset.environmentContract);

    expect(reducedEvidence).toMatchObject({
      actual: { colorScheme: "dark", reducedMotion: true, contrast: "more", reducedTransparency: true },
      mismatches: [],
    });
    expect(resetEvidence).toMatchObject({
      actual: { colorScheme: "light", reducedMotion: false, contrast: "no-preference", reducedTransparency: false },
      mismatches: [],
    });
    // String-body evaluate — a node-world test cannot type an in-page callback (type-worlds #1351).
    expect(await reset.page.evaluate<boolean>('matchMedia("(prefers-reduced-transparency: reduce)").matches')).toBe(false);
  } finally {
    await closeProbeSession(reduced);
    await closeProbeSession(reset);
  }
});

test("the process census sees a live Chromium process before cleanup", async () => {
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    const live = chromiumDescendantIdentities(process.pid);
    expect(live).not.toEqual([]);
  } finally {
    await closeProbeSession(session);
  }
});

test("captured Chromium identities survive reparenting without becoming a false clean", async () => {
  const profile = join(TEMP, "reparented-leak-profile");
  // THE MARKER IS STAMPED (#1926): this fixture deliberately detaches a real chromium to simulate a
  // reparented leak, and relies on its own `terminateChromiumIdentities` cleanup below. That cleanup is
  // NOT the only safety net — if this test process is ever SIGKILLed/OOM-killed between the spawn and its
  // `finally`, the marker gives `_shared/run-marker.ts`'s abandoned-run sweep a real reaping path, exactly
  // as any production launch already has. Proven both ways in browser-run-marker.suite.int.test.ts.
  const leakArgs = leakChromiumArgs(profile, currentRunMarker());
  const leakScript = `const { spawn } = require("node:child_process");
const chromium = spawn(process.argv[1], JSON.parse(process.argv[2]), {
  detached: true,
  stdio: "ignore",
});
chromium.unref();
setTimeout(() => process.exit(0), 500);`;
  const witness = watchChromiumDescendants(process.pid);
  let captured: readonly ChromiumIdentity[] = [];
  try {
    const result = await spawnNiced(process.execPath, ["-e", leakScript, chromium.executablePath(), JSON.stringify(leakArgs)], {
      cwd: TEMP,
      timeoutMs: scaledBudget(5000),
    });
    expect(result.code, result.stderr).toBe(0);
    captured = witness.stop();
    const living = livingChromiumIdentities(captured);
    const descendantKeys = new Set(chromiumDescendantIdentities(process.pid).map(identityKey));
    const stillDescendants = living.filter((identity) => descendantKeys.has(identityKey(identity)));

    expect(captured.length).toBeGreaterThan(0);
    expect(living.length).toBeGreaterThan(0);
    expect(stillDescendants).toEqual([]);
  } finally {
    terminateChromiumIdentities(captured);
    await expect.poll(() => livingChromiumIdentities(captured), { timeout: scaledBudget(5000) }).toEqual([]);
  }
});

test("a context-initialization failure leaves no owned Chromium process behind", async () => {
  const witness = watchChromiumDescendants(process.pid);
  const initFailure = new Error("planted init-script setup failure");
  const localStorage = new Proxy<LocalStorageSeed[]>([], {
    get(target, property, receiver) {
      if (property === "length") {
        throw initFailure;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const failure = await launchProbeSession({
    headless: true,
    viewport: { width: 320, height: 240 },
    colorScheme: null,
    reducedMotion: false,
    localStorage,
  }).catch((error: unknown) => error);
  expect(failure).toBe(initFailure);
  const observed = witness.stop();
  expect(observed.length).toBeGreaterThan(0);
  const survivors = livingChromiumIdentities(observed);
  expect(survivors).toEqual([]);
});

test("a snap capture failure leaves no owned Chromium process behind", async () => {
  const witness = watchChromiumDescendants(process.pid);
  const result = await runSnapAsync([
    "--file",
    fixture("capture-failure", "<main>capture failure</main>"),
    "--out",
    "/proc/orbweaver-planted-unwritable-shot.png",
    "--no-failure-evidence",
  ]);
  expect(result.status).not.toBe(0);
  const observed = witness.stop();
  expect(observed.length).toBeGreaterThan(0);
  const survivors = livingChromiumIdentities(observed);
  expect(survivors).toEqual([]);
});

test("a scenario capture failure leaves no owned Chromium process behind", async () => {
  const witness = watchChromiumDescendants(process.pid);
  const page = fixture("scenario-capture-failure", "<main>scenario capture failure</main>");
  const scenarioPath = join(TEMP, "scenario-capture-failure.json");
  writeFileSync(
    scenarioPath,
    JSON.stringify({
      name: "planted scenario failure",
      checkpoints: [{ name: "unwritable", args: ["--file", page, "--out", "/proc/orbweaver-planted-unwritable-scenario.png"] }],
    }),
  );
  const result = await runSnapAsync(["--scenario", scenarioPath, "--no-failure-evidence"]);
  expect(result.status).not.toBe(0);
  const observed = witness.stop();
  expect(observed.length).toBeGreaterThan(0);
  const survivors = livingChromiumIdentities(observed);
  expect(survivors).toEqual([]);
});

test("snap excludes React Activity-style hidden DOM unless the operator opts in", () => {
  const page = fixture("activity", '<main><button>Active</button><section style="display:none"><button>Inactive</button></section></main>');
  const activeName = `${RUN_ID}_active`;
  const active = runSnap(["--file", page, "--no-shot", "--map", "--expect-count", "button=1", "--json", "--no-failure-evidence", "--out", activeName]);

  expect(active.status, active.stdout + active.stderr).toBe(0);
  expect(active.stdout).toContain("assertion-fails=0");
  const activeCapture = (manifest(activeName)["captures"] as Record<string, unknown>[])[0];
  expect(activeCapture?.["mapResult"]).toEqual([
    expect.objectContaining({ role: "main", actionability: "locator-only" }),
    expect.objectContaining({ role: "button", name: "Active", actionability: "actionable" }),
  ]);

  const hiddenName = `${RUN_ID}_hidden`;
  const hidden = runSnap([
    "--file",
    page,
    "--no-shot",
    "--map",
    "--include-hidden",
    "--expect-count",
    "button=2",
    "--json",
    "--no-failure-evidence",
    "--out",
    hiddenName,
  ]);

  expect(hidden.status, hidden.stdout + hidden.stderr).toBe(0);
  const hiddenCapture = (manifest(hiddenName)["captures"] as Record<string, unknown>[])[0];
  expect(hiddenCapture?.["mapResult"]).toEqual([
    expect.objectContaining({ role: "main", actionability: "locator-only" }),
    expect.objectContaining({ role: "button", name: "Active", actionability: "actionable" }),
    expect.objectContaining({ role: "button", name: "Inactive", visibility: "hidden", actionability: "locator-only" }),
  ]);
});

test("snap maps repeated accessible names to distinct executable selectors", () => {
  const page = fixture("map-duplicates", '<button aria-label="Save">One</button><button aria-label="Save">Two</button>');
  const name = `${RUN_ID}_map_duplicates`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ selector: string }> }>)[0];
  expect(capture?.mapResult.map((entry) => entry.selector)).toEqual(['[aria-label="Save"]:visible >> nth=0', '[aria-label="Save"]:visible >> nth=1']);
});

test("snap maps the browser-computed name, excluding aria-hidden avatar initials", () => {
  const page = fixture("map-aria-hidden", '<button><span aria-hidden="true">DD</span><span>Diana</span></button>');
  const name = `${RUN_ID}_map_aria_hidden`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ name: string }> }>)[0];
  expect(capture?.mapResult).toContainEqual(expect.objectContaining({ name: "Diana" }));
});

test("snap concatenates a multi-text-node accessible name with no separator, matching the real accname algorithm", () => {
  const page = fixture("map-multi-text-node", "<button>Couldn't load <span>corpus</span>.</button>");
  const name = `${RUN_ID}_map_multi_text_node`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ name: string }> }>)[0];
  expect(capture?.mapResult).toContainEqual(expect.objectContaining({ name: "Couldn't load corpus." }));
});

test("--include-hidden computes a real name for a control nested inside an aria-hidden container, not an empty one (the closest() overreach bug)", () => {
  const page = fixture("map-include-hidden-boundary", '<div aria-hidden="true"><button id="inner">Ghost</button></div><button id="outer">Visible</button>');
  const name = `${RUN_ID}_map_include_hidden_boundary`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--include-hidden", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ name: string }> }>)[0];
  // Old code's unbounded `closest()` from the text node's parent found the div's aria-hidden ABOVE the
  // button and blanked its name to "" for every descendant, not just the div itself.
  expect(capture?.mapResult).toContainEqual(expect.objectContaining({ name: "Ghost" }));
  expect(capture?.mapResult).toContainEqual(expect.objectContaining({ name: "Visible" }));
});

test("--wait-for does not treat matching rendered text as a missing CSS selector", { timeout: scaledBudget(15_000) }, () => {
  const page = fixture("wait-for-selector-missing", "<p>button</p>");
  const name = `${RUN_ID}_wait_for_selector_missing`;
  const result = runSnap(["--file", page, "--no-shot", "--wait-for", "button", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout).toContain("steps-failed=1");
});

test("--wait-for accepts a rendered CSS selector", () => {
  const page = fixture("wait-for-selector-present", "<button>button</button>");
  const name = `${RUN_ID}_wait_for_selector_present`;
  const result = runSnap(["--file", page, "--no-shot", "--wait-for", "button", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("steps-failed=0");
});

test("--wait-for treats an explicit text selector as rendered text", () => {
  const page = fixture(
    "wait-for-text",
    "<button onclick=\"setTimeout(()=>{const result=document.querySelector('#result'); result.textContent='Fetch and add'; result.style.display='block'},800)\">Search</button><p id=\"result\" style=\"display:none\">Fetch and add</p>",
  );
  const name = `${RUN_ID}_wait_for_text`;
  const result = runSnap([
    "--file",
    page,
    "--no-shot",
    "--click",
    "text=Search",
    "--wait-for",
    "text=Fetch and add",
    "--expect-text",
    "#result=Fetch and add",
    "--json",
    "--no-failure-evidence",
    "--out",
    name,
  ]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("steps-failed=0");
});

test("--wait-for's visible check finds a full-bleed portal control nested under a zero-size ancestor", () => {
  const page = fixture(
    "wait-for-portal",
    '<div style="width:0;height:0;overflow:visible"><div style="position:fixed;inset:0"><button id="portal-action">Portal action</button></div></div>',
  );
  const name = `${RUN_ID}_wait_for_portal`;
  const result = runSnap(["--file", page, "--no-shot", "--wait-for", "#portal-action", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("steps-failed=0");
});

// ── #550: the --wait-for lie, pinned from BOTH ends ──────────────────────────────────────────────
// A side-eye run waited on `--wait-for 'choose who speaks next'`, got a 10s timeout, and filed a
// rendering defect — while the same run's --eval read that exact tooltip text back. The phrase was a CSS
// TYPE-selector chain for tags that cannot exist. The suspected cause (a portal/top-layer blind spot) was
// FALSE, and the three tests below are what makes each half impossible to reintroduce. Honest labels:
// only the FIRST is a defect proof (red against HEAD — same 10s timeout, same `locator('choose who
// speaks next')` call log). The other two PASSED before the fix: they are fences, one pinning that
// the top layer was never the problem, one pinning that the refusal did not blanket-pass prose waits.
const TOP_LAYER_TOOLTIP_HTML =
  '<button id="trigger">Generate reply</button><div id="portal-root"></div>' +
  "<script>const root=document.getElementById('portal-root');" +
  'root.innerHTML=\'<div id="tip" role="tooltip" popover="manual">Generate reply — choose who speaks next</div>\';' +
  "document.getElementById('tip').showPopover();</script>";

test("a bare prose --wait-for phrase is REFUSED before boot, never a 10-second false 'not rendered'", () => {
  const result = runSnap([
    "--file",
    fixture("wait-for-prose", "<p>anything</p>"),
    "--no-shot",
    "--wait-for",
    "choose who speaks next",
    "--no-failure-evidence",
  ]);

  expect(result.stdout).toContain("ARG ERROR");
  expect(result.stdout).toContain("can never match");
  expect(result.stdout).toContain('--wait-for "text=choose who speaks next"');
  // The old behaviour: a browser booted, the locator waited 10s, and the run reported a STEP FAILURE —
  // indistinguishable from text the app genuinely never rendered.
  expect(result.stdout).not.toContain("steps-failed=1");
  expect(result.status, result.stdout + result.stderr).toBe(EXIT.misuse);
});

test("--wait-for text= reaches a tooltip rendered in the TOP LAYER (the portal hypothesis, refuted)", { timeout: scaledBudget(30_000) }, () => {
  const result = runSnap([
    "--file",
    fixture("wait-for-top-layer", TOP_LAYER_TOOLTIP_HTML),
    "--no-shot",
    "--wait-for",
    "text=choose who speaks next",
    "--no-failure-evidence",
  ]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("steps-failed=0");
});

test("--wait-for text= for genuinely ABSENT text still fails — the refusal never blanket-passes prose", { timeout: scaledBudget(30_000) }, () => {
  const result = runSnap([
    "--file",
    fixture("wait-for-absent-text", TOP_LAYER_TOOLTIP_HTML),
    "--no-shot",
    "--wait-for",
    "text=choose who speaks previous",
    "--no-failure-evidence",
  ]);

  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout).toContain("steps-failed=1");
});

test("snap omits semantic plumbing that is not an agent target", () => {
  const page = fixture(
    "map-targets",
    '<main><div role="generic">plumbing</div><ul role="list"><li role="listitem">row</li></ul><section role="region" aria-label="Workspace"><button>Act</button></section></main>',
  );
  const name = `${RUN_ID}_map_targets`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ role: string; name: string; actionability: string }> }>)[0];
  expect(capture?.mapResult).toEqual([
    expect.objectContaining({ role: "main", actionability: "locator-only" }),
    expect.objectContaining({ role: "region", name: "Workspace" }),
    expect.objectContaining({ role: "button", name: "Act" }),
  ]);
});

test("snap recognizes labeled SVGs as image targets instead of minting a roleless DOM path", () => {
  const page = fixture("map-svg", '<button aria-label="Open game">Game <svg aria-label="Game chat"><path /></svg></button>');
  const name = `${RUN_ID}_map_svg`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ role: string; name: string; source: string }> }>)[0];
  expect(capture?.mapResult).toContainEqual(expect.objectContaining({ role: "img", name: "Game chat", source: "semantic" }));
  expect(result.stdout).toContain("map-dom-fallbacks=0");
});

test("snap proves map selectors against the live accessible tree and falls back when a semantic guess lies", () => {
  const longName = "A deliberately long control name that must remain complete inside the executable selector even when terminal output clips it";
  const page = fixture(
    "map-executable",
    `<label for="query">Actual query label</label><input id="query" placeholder="Misleading placeholder"><button>${longName}</button><button aria-label='Say "hi"'>Quote</button><div style="display:none"><button aria-label="Save">Hidden</button></div><button aria-label="Save">Visible</button>`,
  );
  const name = `${RUN_ID}_map_executable`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ name: string; selector: string; source: string }> }>)[0];
  const entries = capture?.mapResult ?? [];
  expect(entries.find((entry) => entry.name === longName)?.selector).toContain(longName);
  expect(entries.find((entry) => entry.name === longName)?.source).toBe("semantic");
  expect(entries.find((entry) => entry.name === "Actual query label")).toMatchObject({ source: "semantic" });
  expect(entries.find((entry) => entry.name === "Misleading placeholder")).toBeUndefined();
  expect(entries.find((entry) => entry.name === 'Say "hi"')).toMatchObject({ selector: '[aria-label="Say \\"hi\\""]:visible', source: "semantic" });
  expect(entries.find((entry) => entry.name === "Save")).toMatchObject({ selector: '[aria-label="Save"]:visible', source: "semantic" });
  expect(result.stdout).toContain("map-dom-fallbacks=0");
});

test("snap evaluates bare arrows and already-invoked arrow IIFEs exactly once", () => {
  const page = fixture("eval-functions", '<main data-value="works">eval</main>');
  const result = runSnap([
    "--file",
    page,
    "--no-shot",
    "--eval",
    '()=>document.querySelector("main")?.dataset.value',
    "--eval",
    '(()=>document.querySelector("main")?.dataset.value)()',
    "--no-failure-evidence",
  ]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout.match(/"works"/gu)).toHaveLength(2);
});

test("snap dead-CSS scan ignores third-party marker classes without hiding real dead tokens", () => {
  const page = fixture("deadcss-markers", '<main class="echarts-for-react definitely-dead">chart</main>');
  const name = `${RUN_ID}_deadcss_markers`;
  const result = runSnap(["--file", page, "--no-shot", "--json", "--no-failure-evidence", "--out", name]);

  // A real dead token is now a contractual nonzero verdict; the manifest remains the proof that the
  // third-party marker itself was excluded rather than hidden by a broad clean expectation.
  expect(result.status, result.stdout + result.stderr).toBe(1);
  const capture = (manifest(name)["captures"] as Array<{ deadCss: Array<{ token: string }> }>)[0];
  expect(capture?.deadCss.map((entry) => entry.token)).toEqual(["definitely-dead"]);
});

test("snap records warnings, fails strict warnings, and always fails console errors", { timeout: scaledBudget(30_000) }, () => {
  const warningPage = fixture("warning", "<main>warning</main>");
  const warningName = `${RUN_ID}_warning`;
  const advisory = runSnap([
    "--file",
    warningPage,
    "--no-shot",
    "--eval",
    'console.warn("slow render")',
    "--json",
    "--no-failure-evidence",
    "--out",
    warningName,
  ]);

  expect(advisory.status, advisory.stdout + advisory.stderr).toBe(0);
  expect(advisory.stdout).toContain("console-warnings=1");
  expect((manifest(warningName)["console"] as unknown[]).length).toBe(1);

  const strict = runSnap(["--file", warningPage, "--no-shot", "--eval", 'console.warn("slow render")', "--strict-console", "--out", warningName]);
  expect(strict.status, strict.stdout + strict.stderr).toBe(1);
  expect(strict.stdout).toContain("console-warnings=1");
  expect(readFileSync(join(REPORT_TRACES, `${warningName}.zip`))).not.toHaveLength(0);
  expect(readFileSync(join(REPORT_TRACES, `${warningName}.har`))).not.toHaveLength(0);

  const errorPage = fixture("error", "<main>error</main>");
  const errorName = `${RUN_ID}_error`;
  const error = runSnap(["--file", errorPage, "--no-shot", "--eval", 'console.error("broken render")', "--no-failure-evidence", "--out", errorName]);

  expect(error.status, error.stdout + error.stderr).toBe(1);
  expect(error.stdout).toContain("console-errors=1");
});

test("checkpoint mode retains boot diagnostics but judges only the interaction window", () => {
  const page = fixture(
    "checkpoint",
    '<button type="button" onclick="console.warn(\'interaction warning\')">Warn</button><script>console.warn("boot warning")</script>',
  );
  const name = `${RUN_ID}_checkpoint`;
  const bootOnly = runSnap(["--file", page, "--no-shot", "--checkpoint", "--strict-console", "--json", "--no-failure-evidence", "--out", name]);

  expect(bootOnly.status, bootOnly.stdout + bootOnly.stderr).toBe(0);
  expect(bootOnly.stdout).toContain("console-warnings=0");
  expect(bootOnly.stdout).toContain("boot-console-warnings=1");
  const bootReport = manifest(name);
  expect((bootReport["console"] as unknown[]).length).toBe(1);
  expect((bootReport["evidence"] as { console: unknown[] }).console.length).toBe(0);

  const interaction = runSnap([
    "--file",
    page,
    "--no-shot",
    "--checkpoint",
    "--click",
    "button",
    "--strict-console",
    "--json",
    "--no-failure-evidence",
    "--out",
    name,
  ]);

  expect(interaction.status, interaction.stdout + interaction.stderr).toBe(1);
  expect(interaction.stdout).toContain("console-warnings=1");
  expect(interaction.stdout).toContain("boot-console-warnings=1");
  const interactionReport = manifest(name);
  expect((interactionReport["console"] as unknown[]).length).toBe(2);
  expect((interactionReport["evidence"] as { console: unknown[] }).console.length).toBe(1);
});

test("snap reports the WCAG exemption for an inactive control instead of failing its deliberate dimming", () => {
  const page = fixture("disabled", '<button type="button" disabled style="color:#555;background:#666;opacity:.5">Save</button>');
  const name = `${RUN_ID}_disabled`;
  const result = runSnap(["--file", page, "--no-shot", "--contrast", "button", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("SKIPPED  inactive control (WCAG contrast exemption)");
});

test("scenario checkpoints share one browser context and emit one aggregate manifest", () => {
  const page = fixture(
    "scenario",
    '<main></main><script>const visits=Number(localStorage.getItem("visits")??0)+1;localStorage.setItem("visits",String(visits));document.querySelector("main").textContent="visits:"+visits</script>',
  );
  const scenarioPath = join(TEMP, "scenario.json");
  writeFileSync(
    scenarioPath,
    JSON.stringify({
      name: "shared context",
      defaults: ["--no-shot"],
      checkpoints: [
        { name: "first", args: ["--file", page, "--expect-text", "main=visits:1"] },
        { name: "second", args: ["--file", page, "--expect-text", "main=visits:2"] },
      ],
    }),
  );
  const name = `${RUN_ID}_scenario`;
  const result = runSnap(["--scenario", scenarioPath, "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("checkpoints=2");
  const report = manifest(name);
  expect((report["captures"] as unknown[]).length).toBe(2);
  const checkpoints = (report["scenario"] as { checkpoints: Array<{ name: string; screenshot: string | null }> }).checkpoints;
  expect(checkpoints.map((checkpoint) => checkpoint.name)).toEqual(["first", "second"]);
  expect(checkpoints.every((checkpoint) => checkpoint.screenshot === null)).toBe(true);
});

/** A PNG's pixel height, read straight out of the IHDR chunk (bytes 20-23, big-endian). `scale: "css"` in
 *  snap's SHOT_BASE means one PNG pixel is one CSS pixel, so a full-page shot's height IS the document
 *  height at the moment of capture — the cheapest possible witness to WHICH FRAME was captured. */
function pngHeight(path: string): number {
  return readFileSync(path).readUInt32BE(20);
}

test("the primary capture waits out a repaint that is still in flight when the shot is taken (#123)", () => {
  // THE DEFECT: `settlePage` waits a fixed window, the evidence phase then runs for however long it
  // takes, and the shot fires at whatever frame that lands on — nothing checks that the surface has
  // stopped moving. A reflow still in flight at that moment (an image finishing its decode, a
  // virtualized list re-measuring) is missing from the PNG while the run's own text evidence already
  // describes the settled surface.
  //
  // Reproduced without a single wall-clock dependency: `grow()` adds 400px per ANIMATION FRAME for six
  // frames, and the trailing --eval kicks it off in the capture phase — it returns immediately, so the
  // reflow is provably mid-flight when captureShot is entered. Frame-driven, so it cannot race a slow
  // machine the way a setTimeout fixture would.
  const page = fixture(
    "paint-settle",
    '<main style="height:300px">grow</main><script>function grow(n){if(n===0)return;' +
      'document.querySelector("main").style.height=(300+(7-n)*400)+"px";requestAnimationFrame(()=>grow(n-1));}</script>',
  );
  const name = `${RUN_ID}_paint_settle`;
  const result = runSnap(["--file", page, "--full", "--eval", "grow(6)", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  // Six 400px steps off a 300px base = 2700px. Pre-fix the shot landed one frame into the chain (~700px);
  // the paint-settle holds until two consecutive frames report the same geometry, so the PNG carries the
  // finished layout. `>=` not `===`: the document can be taller than <main> (margins/scrollbars), and the
  // assertion that matters is that the five missing steps are present.
  expect(pngHeight(join(REPORT_SNAPS, `${name}.png`))).toBeGreaterThanOrEqual(2700);
});

test("watch durably records every poll, dedupes unchanged terminal noise, and mints no screenshots with --no-shot", () => {
  const page = fixture("watch", '<main>steady</main><script>setTimeout(()=>{document.querySelector("main").textContent="changed"},60)</script>');
  const name = `${RUN_ID}_watch`;
  const result = runSnap(["--file", page, "--no-shot", "--watch", "180", "--every", "30", "--eval", "document.body.textContent", "--json", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("(no shot — --no-shot)");
  expect(result.stdout).toContain("unchanged tick(s) omitted");
  const report = manifest(name);
  const watch = report["watch"] as { totalMs: number; intervalMs: number; ticks: Array<{ shot: string | null; evals: unknown[] }> };
  expect(watch.totalMs).toBe(180);
  expect(watch.intervalMs).toBe(30);
  expect(watch.ticks.length).toBeGreaterThanOrEqual(3);
  expect(watch.ticks.every((tick) => tick.shot === null && tick.evals.length === 1)).toBe(true);
  expect(() => readFileSync(join(REPORT_SNAPS, `${name}.png`))).toThrow();
});
