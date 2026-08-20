import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { expect, test } from "../support/fixtures.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SNAP_CLI = fileURLToPath(new URL("../../scripts/probes/snap.ts", import.meta.url));
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
    timeout: 30_000,
  });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
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
    "deadcss_markers",
    "paint_settle",
  ]) {
    rmSync(join(REPORT_SNAPS, `${RUN_ID}_${suffix}.json`), { force: true });
    rmSync(join(REPORT_TRACES, `${RUN_ID}_${suffix}.zip`), { force: true });
    rmSync(join(REPORT_TRACES, `${RUN_ID}_${suffix}.har`), { force: true });
    rmSync(join(REPORT_SNAPS, `${RUN_ID}_${suffix}.png`), { force: true });
  }
});

test("snap excludes React Activity-style hidden DOM unless the operator opts in", () => {
  const page = fixture("activity", '<main><button>Active</button><section style="display:none"><button>Inactive</button></section></main>');
  const activeName = `${RUN_ID}_active`;
  const active = runSnap(["--file", page, "--no-shot", "--map", "--expect-count", "button=1", "--json", "--no-failure-evidence", "--out", activeName]);

  expect(active.status, active.stdout + active.stderr).toBe(0);
  expect(active.stdout).toContain("assertion-fails=0");
  const activeCapture = (manifest(activeName)["captures"] as Record<string, unknown>[])[0];
  expect((activeCapture?.["mapResult"] as unknown[]).length).toBe(1);

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
  expect((hiddenCapture?.["mapResult"] as unknown[]).length).toBe(2);
});

test("snap maps repeated accessible names to distinct executable selectors", () => {
  const page = fixture("map-duplicates", '<button aria-label="Save">One</button><button aria-label="Save">Two</button>');
  const name = `${RUN_ID}_map_duplicates`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ selector: string }> }>)[0];
  expect(capture?.mapResult.map((entry) => entry.selector)).toEqual(['[aria-label="Save"]:visible >> nth=0', '[aria-label="Save"]:visible >> nth=1']);
});

test("snap omits semantic plumbing that is not an agent target", () => {
  const page = fixture(
    "map-targets",
    '<main><div role="generic">plumbing</div><ul role="list"><li role="listitem">row</li></ul><section role="region" aria-label="Workspace"><button>Act</button></section></main>',
  );
  const name = `${RUN_ID}_map_targets`;
  const result = runSnap(["--file", page, "--no-shot", "--map", "--json", "--no-failure-evidence", "--out", name]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ mapResult: Array<{ role: string; name: string }> }>)[0];
  expect(capture?.mapResult).toEqual([
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
  expect(entries.find((entry) => entry.name === "Misleading placeholder")).toMatchObject({ source: "dom" });
  expect(entries.find((entry) => entry.name === "Misleading placeholder")?.selector.startsWith("body > ")).toBe(true);
  expect(entries.find((entry) => entry.name === 'Say "hi"')).toMatchObject({ selector: '[aria-label="Say \\"hi\\""]:visible', source: "semantic" });
  expect(entries.find((entry) => entry.name === "Save")).toMatchObject({ selector: '[aria-label="Save"]:visible', source: "semantic" });
  expect(result.stdout).toContain("map-dom-fallbacks=1");
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

  expect(result.status, result.stdout + result.stderr).toBe(0);
  const capture = (manifest(name)["captures"] as Array<{ deadCss: Array<{ token: string }> }>)[0];
  expect(capture?.deadCss.map((entry) => entry.token)).toEqual(["definitely-dead"]);
});

test("snap records warnings, fails strict warnings, and always fails console errors", { timeout: 30_000 }, () => {
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
      defaults: ["--no-shot", "--no-failure-evidence"],
      checkpoints: [
        { name: "first", args: ["--file", page, "--expect-text", "main=visits:1"] },
        { name: "second", args: ["--file", page, "--expect-text", "main=visits:2"] },
      ],
    }),
  );
  const name = `${RUN_ID}_scenario`;
  const result = runSnap(["--scenario", scenarioPath, "--json", "--out", name]);

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
