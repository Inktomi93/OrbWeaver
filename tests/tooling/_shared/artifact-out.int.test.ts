// THE RENDERED INSTRUMENTS' RUN SLOTS (#1164) — the planted-control proof that two concurrent runs of one
// rendered instrument (snap/design-audit/record/motion-audit/perf-meter) keep BOTH sets of artifacts, that
// the published `reports/<kind>/<name>` pointer only ever names a COMPLETE run, and that the retention ring
// never deletes evidence a live pointer still names.
//
// THE DEFECT. #1029 slotted the VERDICT instruments and left these writing into fixed shared dirs, on the
// reasoning that a caller NAMES those artifacts with `--out`. Measured 2026-09-02: the naming is a BRIEF
// CONVENTION, not a mechanism — two side-eye lanes on one checkout both took the default name and produced
// a `root.png` neither could claim. Proven against HEAD's own module before the fix, with the same shape as
// the first case below: two children calling `artifactFile("snaps", "root", ".png")` and writing their
// pixels raced to ONE file, and the slower writer's shot was simply gone.
//
// WHY A SPAWNED CHILD, NOT AN IN-PROCESS CALL: the class is a race between two PROCESSES over one path (the
// #1029 sibling file makes the same argument for the verdict instruments). The child drives the REAL seam —
// `withInstrumentRun` + `artifactFile`, exactly what an instrument's cli.ts and ops do — against a PLANTED
// root, so no case here touches the repo's own reports/ tree.
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { artifactFile, beginInstrumentRun, finishInstrumentRun } from "@orb/tooling/_shared/artifact-out";
import { expect, test } from "../../support/tool-fixtures.ts";

/** A snap-shaped run: resolve the artifact path up front (snap resolves `out` before it launches the
 *  browser), "capture" for `delayMs`, write the pixels, publish. `--out` is the SAME name in both children
 *  — the collision the lanes actually hit. */
const INSTRUMENT_CHILD = `import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [artifacts, root, id, delayMs] = process.argv.slice(2);
const A = await import(pathToFileURL(artifacts).href);
await A.withInstrumentRun("snap", async () => {
  const shot = await A.artifactFile("snaps", "root", ".png");
  const trace = await A.artifactFile("traces", "root", ".zip");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(delayMs));
  writeFileSync(shot, "pixels-from-" + id);
  writeFileSync(trace, "trace-from-" + id);
  return 0;
}, root);
`;

const CHILD = "instrument-child.mjs";

/** The same child, with the artifact NAME as an argument — the retention case needs many runs that either
 *  do or do not keep an older run's pointer alive. */
const NAMED_CHILD = `import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [artifacts, root, name] = process.argv.slice(2);
const A = await import(pathToFileURL(artifacts).href);
await A.withInstrumentRun("snap", async () => {
  writeFileSync(await A.artifactFile("snaps", name, ".png"), "pixels-" + name);
  return 0;
}, root);
`;

const NAMED = "named-child.mjs";

/** Every `<runId>/snaps/root.png` this instrument's slots hold, as `runId → bytes`. */
function slotShots(root: string): Record<string, string> {
  const base = join(root, "reports", "runs", "snap");
  return Object.fromEntries(
    readdirSync(base)
      .filter((name) => existsSync(join(base, name, "snaps", "root.png")))
      .map((name) => [name, readFileSync(join(base, name, "snaps", "root.png"), "utf8")]),
  );
}

test("two concurrent snap-shaped runs that took the SAME --out name both keep their artifacts", { timeout: 60_000 }, async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree({ [CHILD]: INSTRUMENT_CHILD });
  const artifacts = join(repoRoot, "tooling", "src", "_shared", "artifact-out.ts");
  const { spawnNiced } = await import("@orb/tooling/_shared/proc");
  const child = join(root, CHILD);
  const [a, b] = await Promise.all([
    spawnNiced(process.execPath, [child, artifacts, root, "run-A", "800"]),
    // Starts inside A's capture window and finishes FIRST: pre-fix, A's write landed on top of B's.
    spawnNiced(process.execPath, [child, artifacts, root, "run-B", "400"]),
  ]);
  expect([a.code, b.code]).toEqual([0, 0]);

  // BOTH sets of pixels survive, in slots keyed by run identity — the half the fixed path could not give.
  const shots = slotShots(root);
  expect(Object.values(shots).sort()).toEqual(["pixels-from-run-A", "pixels-from-run-B"]);

  // The classic path every reader (side-eye, a skill, a file comment citing a shot) opens is now a pointer
  // INTO one of those slots, and what it names is a COMPLETE artifact of ONE run — never a mix.
  const link = readlinkSync(join(root, "reports", "snaps", "root.png"));
  expect(link).toContain("runs/snap/");
  const publishedShot = readFileSync(join(root, "reports", "snaps", "root.png"), "utf8");
  expect(Object.values(shots)).toContain(publishedShot);
  // Same run, every kind: the trace pointer resolves to the SAME run's slot as the shot, so a reader never
  // pairs one run's pixels with another's trace.
  expect(readFileSync(join(root, "reports", "traces", "root.zip"), "utf8")).toBe(publishedShot.replace("pixels", "trace"));
});

test("the 10-run ring never deletes evidence a published pointer still names", { timeout: 120_000 }, async ({ plantedTree, repoRoot }) => {
  // WHY THIS EXISTS: `reports/snaps/` is a CORPUS, not one verdict — file headers across packages/ cite
  // individual shots by path as durable evidence, and one side-eye session takes dozens. A ring that
  // pruned by age alone would delete the pixels a live pointer names inside a single session and leave
  // the citation dangling, which is a WORSE artifact contract than the shared dir this replaced.
  const root = await plantedTree({ [NAMED]: NAMED_CHILD });
  const artifacts = join(repoRoot, "tooling", "src", "_shared", "artifact-out.ts");
  const { spawnNiced } = await import("@orb/tooling/_shared/proc");
  const child = join(root, NAMED);
  const keepers = ["se-chars-focusring", "m-touch-topbar", "tracker-kit-scene"];
  for (const name of keepers) {
    expect((await spawnNiced(process.execPath, [child, artifacts, root, name])).code).toBe(0);
  }
  // Well past RETAINED_RUNS, every one re-aiming the SAME pointer — so each churn run un-references the
  // one before it and IS the ring's proper business.
  for (let i = 0; i < 12; i += 1) {
    expect((await spawnNiced(process.execPath, [child, artifacts, root, "churn"])).code).toBe(0);
  }

  for (const name of keepers) {
    expect(readFileSync(join(root, "reports", "snaps", `${name}.png`), "utf8")).toBe(`pixels-${name}`);
  }
  // The churn DID prune: the slots nothing points at are gone, so retention is still bounded.
  expect(readdirSync(join(root, "reports", "runs", "snap")).length).toBeLessThan(keepers.length + 12);
  expect(readFileSync(join(root, "reports", "snaps", "churn.png"), "utf8")).toBe("pixels-churn");
});

test("a reader mid-run gets the PREVIOUS complete artifact — the pointer moves only at finish", async ({ plantedTree }) => {
  // In-process and pointer-planted rather than raced: the atomicity claim is "the alias is swapped by
  // rename at publish", and a sleep-and-peek at a live child would assert it on a timer instead.
  const root = await plantedTree({ "reports/runs/snap/earlier/snaps/home.png": "pixels-from-earlier" });
  const alias = join(root, "reports", "snaps", "home.png");
  mkdirSync(join(root, "reports", "snaps"), { recursive: true });
  symlinkSync("../runs/snap/earlier/snaps/home.png", alias);

  const slot = beginInstrumentRun("snap", root);
  writeFileSync(await artifactFile("snaps", "home", ".png"), "pixels-from-this-run");
  // Mid-run: this run's pixels are on disk in its own slot, and the published path a reader opens has not
  // moved a byte. Pre-#1164 the shot was written straight over the shared path — a reader arriving here
  // got THIS run's half-written PNG under the previous run's name.
  expect(readFileSync(join(slot.dir, "snaps", "home.png"), "utf8")).toBe("pixels-from-this-run");
  expect(readFileSync(alias, "utf8")).toBe("pixels-from-earlier");

  expect(finishInstrumentRun()).toEqual(["snaps/home.png"]);
  expect(readFileSync(alias, "utf8")).toBe("pixels-from-this-run");
  expect(readlinkSync(alias)).toBe(join("..", "runs", "snap", slot.runId, "snaps", "home.png"));
});

test("a persistent CORPUS kind is never slotted — a baseline saved by one run is what the next run diffs", async ({ plantedTree }) => {
  // `snap --baseline` files a golden that a LATER `snap --diff` reads. Filing it inside a run slot would
  // put it in the pruning ring, and the next diff would report NO-BASELINE instead of a comparison.
  const root = await plantedTree({ "reports/.keep": "" });
  beginInstrumentRun("snap", root);
  const shot = await artifactFile("snaps", "home", ".png");
  const baseline = await artifactFile("baselines", "home", ".png");
  expect(shot.startsWith(join(root, "reports", "runs", "snap"))).toBe(true);
  expect(baseline).toBe(join(root, "reports", "baselines", "home.png"));
  finishInstrumentRun();
});

// ── THE PLANTED CONTROL: the pre-#1164 fixed-path writer, driven the same way, LOSES a run ─────────────

/** What every rendered instrument used to do: resolve ONE shared `reports/snaps/<out>.png` up front,
 *  capture, then write the pixels there. This is the shape, replayed by hand, that the first case above
 *  now keeps apart — without it that case would only prove two children both exited 0. */
const OLD_SHOT_WRITER = `import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [root, id, delayMs] = process.argv.slice(2);
const dir = join(root, "reports", "snaps");
mkdirSync(dir, { recursive: true });
const out = join(dir, "root.png");
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(delayMs));
writeFileSync(out, "pixels-from-" + id);
`;

test("PLANTED CONTROL: the old fixed-path shot writer loses one of two concurrent runs", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({ "old-shot.mjs": OLD_SHOT_WRITER });
  const { spawnNiced } = await import("@orb/tooling/_shared/proc");
  const writer = join(root, "old-shot.mjs");
  await Promise.all([spawnNiced(process.execPath, [writer, root, "run-A", "800"]), spawnNiced(process.execPath, [writer, root, "run-B", "400"])]);

  // ONE file, ONE run's pixels: B finished first and A wrote over it. B's shot is gone, its RESULT line
  // still names the path, and nothing in either run can tell. That is the #1164 defect.
  expect(readFileSync(join(root, "reports", "snaps", "root.png"), "utf8")).toBe("pixels-from-run-A");
  expect(readdirSync(join(root, "reports"))).toEqual(["snaps"]);
});
