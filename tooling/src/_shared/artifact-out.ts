// The `--out` FILING layer (#1164): which file an instrument's artifact lands in, and which RUN owns it.
// One layer above ./artifacts.ts (run slots + the reports/ path home + the RESULT line), which it imports
// and never imports back. Split out when the two layers together passed the tooling-size cap — the seam is
// real, not cosmetic: `artifacts.ts` answers "where do runs live", this answers "where does THIS artifact go".
import { readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { RunAlias, RunSlot } from "./artifacts.ts";
import { artifactFilePath, openRunSlot, print, publishRunSlot, REPO_ROOT, reportsPath } from "./artifacts.ts";

// ── THE RENDERED INSTRUMENTS' RUN (#1164) ────────────────────────────────────────────────────────────
// #1029 slotted the VERDICT instruments (verify, structure, test, ct) and deliberately left the
// `--out`-keyed families — `snaps/`, `design-audit/`, `traces/`, `recordings/`, `perf-meter/`,
// `motion-audit/` — writing straight into their fixed shared dirs, on the reasoning that a caller names
// those artifacts. Measured 2026-09-02 (#1164): lane-unique `--out` names are a BRIEF CONVENTION, not a
// mechanism. Two side-eye lanes on one checkout both took the default name and produced a `root.png`
// neither could claim; a third read a sibling's `design-audit` report as its own (#1114 R-3).
//
// THE MECHANISM is #1029's, with ONE difference that the `--out` keying forces. A verdict instrument
// publishes a FIXED alias set (`reports/verify.json`, …) known before the run; a rendered instrument's
// alias set is whatever it wrote, so `finishInstrumentRun` ENUMERATES the slot and publishes one pointer
// per artifact file. That keeps `reports/snaps/` a real DIRECTORY of per-artifact pointers rather than
// one directory symlink — which is required, not cosmetic: CT specs and e2e specs write PNGs straight
// into `reports/snaps/` with Playwright (`page.screenshot({ path })`), and file comments across
// `packages/` cite individual shots by path as durable evidence.
//
// RETENTION is therefore reference-aware (`pruneRuns` in ./artifacts.ts): a slot any published pointer
// still resolves into is never pruned. Without that the 10-run ring would delete the evidence corpus out
// from under the pointers inside one side-eye session.
//
// A CRASHED run publishes NOTHING — its slot keeps the bytes and its `.inflight` marker outlives its pid,
// which is exactly the `abandonedRuns` tell. A RED run publishes normally: a failing verdict is still a
// complete artifact, and the failure shot is the receipt the reviewer came for.

/** Kinds that are a persistent CORPUS rather than one run's output, and are never slotted: `baselines/`
 *  is `snap --baseline`'s golden store, READ by a later `--diff` run — slotting it would file a golden
 *  inside a ring that prunes, and the next diff would report NO-BASELINE. */
const UNSLOTTED_KINDS = new Set(["baselines"]);

interface ActiveRun {
  readonly slot: RunSlot;
  readonly root: string;
  /** An ADOPTED slot belongs to ANOTHER process (the session client that opened it): this process resolves
   *  its artifacts into it and never publishes it — the owner does, at its own finish. */
  readonly adopted: boolean;
}

let activeRun: ActiveRun | null = null;

export interface InstrumentRunOptions {
  /** The explicit-slot form (docs/design/1208-instrument-substrate.md §3.7): adopt a slot dir another
   *  process opened instead of opening one. The session daemon's per-call shape. */
  readonly slotDir?: string;
}

/** A slot descriptor for a dir ANOTHER process opened — no marker written, nothing censused: the OPENER
 *  owns both. Two callers: the daemon's per-call adoption, and the session sweep settling a dead
 *  session's slot through `publishRunSlot(root, slot, [])`. */
export function adoptRunSlot(root: string, instrument: string, slotDir: string): RunSlot {
  return { instrument, runId: basename(slotDir), dir: slotDir, relDir: relative(root, slotDir), racing: [] };
}

/** Open THIS process's instrument run. Every `artifactDir`/`artifactFile` call after it lands in the
 *  run's own slot instead of the shared `reports/<kind>/`. `root` is the checkout the artifacts belong
 *  to — the repo root for a real invocation, a planted tree for a test. With `slotDir` the run is an
 *  ADOPTION of a slot the caller's client opened (one slot per call, whoever writes into it). */
export function beginInstrumentRun(instrument: string, root: string = REPO_ROOT, options: InstrumentRunOptions = {}): RunSlot {
  if (activeRun !== null) {
    throw new Error(`INSTRUMENT ERROR: a run of "${activeRun.slot.instrument}" is already open — one process is one run (${activeRun.slot.relDir})`);
  }
  const slotDir = options.slotDir;
  const slot = slotDir === undefined ? openRunSlot(root, instrument) : adoptRunSlot(root, instrument, slotDir);
  activeRun = { slot, root, adopted: slotDir !== undefined };
  return slot;
}

/** The slot this process is writing into right now, or null outside a run — what a session client hands
 *  the daemon to adopt. */
export function activeRunSlot(): RunSlot | null {
  return activeRun?.slot ?? null;
}

/** The directory `artifactDir(kind)` creates — split out so `artifactFilePath` and the run layer agree
 *  on one resolution. */
function artifactDirPath(kind: string): string {
  const run = activeRun;
  if (run === null || UNSLOTTED_KINDS.has(kind)) {
    return reportsPath(run === null ? REPO_ROOT : run.root, kind);
  }
  return join(run.slot.dir, kind);
}

/** Every artifact FILE in the slot, as `<kind>/<…>` aliases (dot-prefixed entries — the in-flight marker,
 *  Playwright's `.video-*` staging dir — are not artifacts). */
function slotArtifactAliases(slot: RunSlot): readonly RunAlias[] {
  const aliases: RunAlias[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(slot.dir, rel), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(child);
      } else {
        aliases.push({ alias: child, target: child });
      }
    }
  };
  walk("");
  return aliases;
}

/** Close the run: publish one `latest` pointer per artifact the run wrote, atomically, and return them.
 *  Called on EVERY completed run, red or green — see the header note on red-vs-crashed. */
export function finishInstrumentRun(): readonly string[] {
  const run = activeRun;
  if (run === null) {
    return [];
  }
  activeRun = null;
  // An adopted slot is published by its OWNER when ITS main returns — publishing here would race the
  // owner's own enumeration and mint pointers mid-run.
  if (run.adopted) {
    return [];
  }
  return publishRunSlot(run.root, run.slot, slotArtifactAliases(run.slot));
}

/** The one door a rendered instrument's cli.ts uses (gate: tooling-shared-plumbing arm G): open the run,
 *  NAME it on stdout with the racing census, run, and publish whatever it wrote. The slot is announced at
 *  the START — a run's artifacts are findable while it is still going, and the RESULT line stays last. */
export async function withInstrumentRun(instrument: string, main: () => Promise<number>, root: string = REPO_ROOT): Promise<number> {
  const slot = beginInstrumentRun(instrument, root);
  print(`run slot     ${slot.relDir}`);
  if (slot.racing.length > 0) {
    print(`CONCURRENT   other live ${instrument} run(s) on this checkout: ${slot.racing.join(", ")} — each keeps its own slot`);
  }
  try {
    return await main();
  } finally {
    finishInstrumentRun();
  }
}

/** Resolve (and create) this run's `<kind>/` artifact directory.
 *
 *  With an instrument run open (`beginInstrumentRun`, #1164) that is the run's OWN slot dir — the
 *  published `reports/<kind>/<artifact>` pointers are minted from it at finish. With no run open — a
 *  library caller, a test, a CT screenshot path — it is `reports/<kind>/` exactly as it always was. */
export async function artifactDir(kind: string): Promise<string> {
  const dir = artifactDirPath(kind);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** `artifactFilePath` + the directory it needs. `kind` is the `reports/<kind>/` family the artifact
 *  belongs to; a path-shaped `out` escapes it by design, and gets its own parent dir created. */
export async function artifactFile(kind: string, out: string, ext: string): Promise<string> {
  const path = artifactFilePath(await artifactDir(kind), out, ext);
  await mkdir(dirname(path), { recursive: true });
  return path;
}
