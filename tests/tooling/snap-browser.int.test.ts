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
  for (const suffix of ["active", "hidden", "warning", "error", "scenario", "disabled", "watch"]) {
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

test("snap records warnings, fails strict warnings, and always fails console errors", () => {
  const warningPage = fixture("warning", '<main>warning</main><script>console.warn("slow render")</script>');
  const warningName = `${RUN_ID}_warning`;
  const advisory = runSnap(["--file", warningPage, "--no-shot", "--json", "--no-failure-evidence", "--out", warningName]);

  expect(advisory.status, advisory.stdout + advisory.stderr).toBe(0);
  expect(advisory.stdout).toContain("console-warnings=1");
  expect((manifest(warningName)["console"] as unknown[]).length).toBe(1);

  const strict = runSnap(["--file", warningPage, "--no-shot", "--strict-console", "--out", warningName]);
  expect(strict.status, strict.stdout + strict.stderr).toBe(1);
  expect(strict.stdout).toContain("console-warnings=1");
  expect(readFileSync(join(REPORT_TRACES, `${warningName}.zip`))).not.toHaveLength(0);
  expect(readFileSync(join(REPORT_TRACES, `${warningName}.har`))).not.toHaveLength(0);

  const errorPage = fixture("error", '<main>error</main><script>console.error("broken render")</script>');
  const errorName = `${RUN_ID}_error`;
  const error = runSnap(["--file", errorPage, "--no-shot", "--no-failure-evidence", "--out", errorName]);

  expect(error.status, error.stdout + error.stderr).toBe(1);
  expect(error.stdout).toContain("console-errors=1");
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
