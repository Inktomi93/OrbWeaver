// Tool output lands under `<repo>/reports/<kind>/` (root-anchor gitignored) + the RESULT-line
// convention: report lines to stdout via `print`; the LAST line is a stable `RESULT <tool> key=value …`
// machine line (`tail -1` / `grep ^RESULT`). Exit codes are the CALLER's (_shared/exit-contract.ts).
// Since #1029 a RUN writes into its own slot and publishes those `reports/…` paths as `latest`
// pointers when it finishes — the layout's one home is
// docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md §3.3b, and the slot machinery below is its
// mechanism. The `--out`-keyed FILING doors that ride on it live in ./artifact-out.ts (one layer up,
// so this module never imports back down).
import { lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { emitLine } from "./log.ts";
import type { PrunedRun, RetentionCandidate } from "./run-retention.ts";
import { pidAlive, readPrunedRuns, recordPrunedRuns, selectPrunable } from "./run-retention.ts";

// _shared lives at tooling/src/_shared/ — three levels up is the repo root.
export const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** The stdout payload channel. Routed through log.ts's tee so a session daemon can stream a request's
 *  lines to its caller without a second print path (the daemon's own stdout — its log — still gets them). */
export function print(s: string): void {
  emitLine(s);
}

export type ResultPair = readonly [key: string, value: string | number];

/** Print the blank separator + the final `RESULT <tool> k=v …` machine line (pairs in order). */
export function printResult(tool: string, pairs: readonly ResultPair[]): void {
  const kv = pairs.map(([k, v]) => `${k}=${v}`).join(" ");
  print("");
  print(`RESULT ${tool} ${kv}`);
}

// ── the verify harness's ROOT-LEVEL artifacts ────────────────────────────────────────────────────────
// A handful of artifacts are files AT `reports/` rather than under a `reports/<kind>/` dir, because the
// constitution names them by exactly those paths as the read-don't-rerun surfaces (AGENTS.md §4:
// `reports/verify.json`, `reports/check-structure.json`, `reports/verify/<stage>.log`,
// `reports/ct-flaky.json`). They ride the SAME home as every other artifact — the `reports` literal has one
// spelling in this repo and it is here (gate: tooling-shared-plumbing arm C).

/** The ABSOLUTE path of a report artifact under `<root>/reports/…`. `root` is explicit (never REPO_ROOT)
 *  because the verify harness runs against the caller's cwd, which is the worktree it is judging. */
export function reportsPath(root: string, ...segments: readonly string[]): string {
  return join(root, "reports", ...segments);
}

/** The REPO-RELATIVE spelling of the same path — what an artifact records about itself so a reader can
 *  open it from anywhere in the repo (`reports/verify/lint-biome.log`). */
export function reportsRelPath(...segments: readonly string[]): string {
  return join("reports", ...segments);
}

/** `reportsPath`, with the directory created. Sync because its callers are inside a synchronous run
 *  entrypoint whose next statement writes the file. */
export function ensureReportsDir(root: string, ...segments: readonly string[]): string {
  const dir = reportsPath(root, ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── RUN IDENTITY + PER-RUN ARTIFACT SLOTS (#1029) ────────────────────────────────────────────────────
// THE DEFECT THIS CLOSES (owner ruling 2026-09-01: "all reports need to be able to be ran concurrently").
// Every instrument wrote its artifact to ONE fixed path, so two runs on one checkout — two lanes, a lane
// and the orchestrator, a `pnpm check` and the `check:structure` a sibling started — clobbered each other:
// measured live, `reports/check-structure.json` flipped from a complete 248-gate verdict to another run's
// in-flight stub inside 30s, and the read-the-artifact-not-the-pipe law assumes the artifact is YOURS.
//
// THE MECHANISM. A run writes ONLY inside its own slot `reports/runs/<instrument>/<runId>/`, where the run
// id is `<checkout>-<pid>-<timestamp>` (the owner's second ruling: "unique markers inherit the worktree
// name"). At completion — and only then — it publishes the well-known paths the constitution names
// (`reports/verify.json`, `reports/check-structure.json`, `reports/verify/`, …) as RELATIVE SYMLINKS into
// that slot, swapped by `rename` so a concurrent reader sees the old complete run or the new one, never a
// torn or in-flight artifact. Readers therefore keep their existing spelling: the documented path IS the
// `latest` pointer. A launcher that knows its own run id reads its OWN slot instead (`runFile`).
//
// WHAT REPLACES THE FIXED-PATH IN-FLIGHT STUB (#410, contract/run-manifest.ts). The stub survives — it is
// written into the slot, not over the published pointer — and the "this run died" tell that used to come
// from finding `complete:false` at the fixed path now comes from `abandonedRuns`: a slot whose `.inflight`
// marker is still there and whose pid is GONE. That distinction is strictly finer than the old one, which
// could not tell a killed run from a live sibling's.

/** The marker a slot carries while its run is in flight; deleted at publish. Its presence + a DEAD pid is
 *  the killed-run tell (`abandonedRuns`); its presence + a LIVE pid is a concurrent writer. */
const INFLIGHT_MARKER = ".inflight";
/** The alias list a publish leaves in its slot, so `pruneRuns` can ask "does any pointer still resolve
 *  here?" without walking `reports/`. Dot-prefixed: the `--out` layer's alias enumerator skips it. */
const PUBLISHED_MANIFEST = ".published";
// Retention — HOW LONG a slot lives and the ledger of the ones that went — is ./run-retention.ts (#1341).
const RUNS_SEGMENT = "runs";
// DOT-FREE on purpose: a run id becomes a path SEGMENT and, for the doc-catalog scratch, part of a
// filename a `*.json` glob has to match — a stray dot from the timestamp's milliseconds turns a
// `catalog.tmp.*.json` config row into a silent non-match (paid once, 2026-09-01).
const RUN_ID_UNSAFE_RE = /[^a-zA-Z0-9_-]+/gu;

/** The CHECKOUT a run is judging: `main` for the primary checkout, the worktree directory's basename for a
 *  lane worktree (`agent-ac04b6aea89a434f7`). Derived from the KIND of the `.git` entry — a linked
 *  worktree's is a FILE holding a `gitdir:` pointer, the primary checkout's is a DIRECTORY — so it is one
 *  stat and never shells out (child_process has ONE door, `_shared/proc.ts`, and it is not this module). */
export function checkoutName(root: string): string {
  // @orb-waive caught-failure-ownership(catch): a missing `.git` entry means this root is not a checkout at all (a planted fixture tree), which is a legitimate NAME, not a failure — the fallback IS the answer and it is returned to the caller. Ends if a non-checkout root must be refused instead of named.
  try {
    return statSync(join(root, ".git")).isDirectory() ? "main" : basename(root);
  } catch {
    return basename(root); // not a checkout at all — a planted fixture tree keeps its own name
  }
}

const runIds = new Map<string, string>();

/** This process's run id for `root` — `<checkout>-<pid>-<timestamp>`, minted ONCE per (process, root) so
 *  every artifact one invocation writes carries the same identity. */
export function runId(root: string): string {
  const existing = runIds.get(root);
  if (existing !== undefined) {
    return existing;
  }
  const stamp = new Date().toISOString().replaceAll(RUN_ID_UNSAFE_RE, "-");
  const id = `${checkoutName(root).replaceAll(RUN_ID_UNSAFE_RE, "-")}-${process.pid}-${stamp}`;
  runIds.set(root, id);
  return id;
}

/** One invocation's private artifact directory, plus who else is writing this instrument right now. */
export interface RunSlot {
  readonly instrument: string;
  readonly runId: string;
  /** ABSOLUTE path of `reports/runs/<instrument>/<runId>/`. */
  readonly dir: string;
  /** The repo-relative spelling of `dir`, for an artifact recording where it lives. */
  readonly relDir: string;
  /** Run ids of OTHER runs of this instrument that were in flight (live pid) when this slot opened — named
   *  on stderr and in the artifact, so a race is never silently last-write-wins. */
  readonly racing: readonly string[];
}

/** A slot left behind by a run that never published: the marker is there and its pid is gone. */
export interface AbandonedRun {
  readonly runId: string;
  readonly dir: string;
  readonly startedAt: string;
}

interface InflightMarker {
  readonly runId: string;
  readonly pid: number;
  readonly checkout: string;
  readonly startedAt: string;
}

function instrumentRunsDir(root: string, instrument: string): string {
  return reportsPath(root, RUNS_SEGMENT, instrument);
}

function readMarker(dir: string): InflightMarker | null {
  // @orb-waive caught-failure-ownership(catch): an absent or unparseable in-flight marker means "this slot is not in flight" — the ONLY question this reader asks — and `null` is that answer at every call site (the racing census, the prune filter, the abandoned-run scan). Ends if any caller starts treating null as "in flight".
  try {
    return JSON.parse(readFileSync(join(dir, INFLIGHT_MARKER), "utf-8")) as InflightMarker;
  } catch {
    return null;
  }
}

function runDirs(root: string, instrument: string): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): no runs directory yet means this instrument has never run here — an empty list is the truthful census, and every caller (racing, prune, abandoned) reads it as "no other slots". Ends if a missing directory must be created or refused here rather than by openRunSlot.
  try {
    return readdirSync(instrumentRunsDir(root, instrument), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Open this invocation's slot: create it, drop the in-flight marker, and census the OTHER runs of this
 *  instrument that are live right now. Nothing published, nothing pruned — that is `publishRunSlot`. */
export function openRunSlot(root: string, instrument: string): RunSlot {
  const id = runId(root);
  const dir = join(instrumentRunsDir(root, instrument), id);
  mkdirSync(dir, { recursive: true });
  const racing = runDirs(root, instrument)
    .filter((name) => name !== id)
    .map((name) => readMarker(join(instrumentRunsDir(root, instrument), name)))
    .filter((m): m is InflightMarker => m !== null && pidAlive(m.pid))
    .map((m) => `${m.runId} (pid ${m.pid}, started ${m.startedAt})`);
  const marker: InflightMarker = { runId: id, pid: process.pid, checkout: checkoutName(root), startedAt: new Date().toISOString() };
  writeFileSync(join(dir, INFLIGHT_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  return { instrument, runId: id, dir, relDir: reportsRelPath(RUNS_SEGMENT, instrument, id), racing };
}

/** Transfer an already-open slot's in-flight marker to this process without minting another run id. */
export function transferRunSlotOwnership(root: string, slot: RunSlot): RunSlot {
  const marker: InflightMarker = {
    runId: slot.runId,
    pid: process.pid,
    checkout: checkoutName(root),
    startedAt: new Date().toISOString(),
  };
  writeFileSync(join(slot.dir, INFLIGHT_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
  return slot;
}

/** An absolute path inside the slot, with its parent directory created. */
export function runFile(slot: RunSlot, ...segments: readonly string[]): string {
  const path = join(slot.dir, ...segments);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/** Replace `absPath` with a RELATIVE symlink to `target` atomically: create the link at a unique temp name
 *  in the same directory, then `rename` over the alias (POSIX rename of a symlink is atomic). A stale REAL
 *  file/dir at the alias — every pre-#1029 artifact is one — is removed first; that one-time swap is the
 *  only non-atomic moment in the layout, and it happens once per alias per checkout. */
function publishSymlink(absPath: string, target: string): void {
  const tmp = `${absPath}.tmp.${process.pid}`;
  // @orb-waive caught-failure-ownership(catch): the pre-clean of a leftover temp link from an earlier crashed publish; ENOENT is the normal case, and a real failure surfaces immediately at the symlinkSync below (EEXIST), which is NOT caught. Ends if the symlink call is made tolerant of an existing path.
  try {
    unlinkSync(tmp);
  } catch {
    /* no leftover temp link from an earlier crash — the normal case */
  }
  symlinkSync(target, tmp);
  // @orb-waive caught-failure-ownership(catch): nothing at the alias yet (the first publish) or a concurrent publisher removed it — both mean "no stale REAL file to clear", and the renameSync below still lands the pointer atomically and DOES throw if it cannot. Ends if the rename stops being the load-bearing step.
  try {
    // lstat, never stat: `stat` FOLLOWS the link, so a symlink already at the alias would read as a real
    // file and be rm'd on every publish — the rename alone replaces a link.
    if (!lstatSync(absPath).isSymbolicLink()) {
      rmSync(absPath, { recursive: true, force: true });
    }
  } catch {
    /* nothing at the alias yet (the first publish), or another publisher raced us — the rename still lands */
  }
  renameSync(tmp, absPath);
}

/** An alias to publish: the well-known repo path (relative to `reports/`) and the artifact inside the slot
 *  it should resolve to (relative to the slot dir; `.` publishes the slot dir itself). */
export interface RunAlias {
  readonly alias: string;
  readonly target: string;
}

/** Finish the run: publish every `latest` alias atomically, drop the in-flight marker, and prune the ring.
 *  Called ONLY when the artifacts in the slot are complete — that is what makes the published path safe to
 *  read without knowing whose run wrote it. */
export function publishRunSlot(root: string, slot: RunSlot, aliases: readonly RunAlias[]): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): the marker is already gone when a run publishes twice (the supervisor's single-project arm) — the post-condition "this slot is no longer in flight" holds either way. Ends if publishing twice must become an error.
  try {
    unlinkSync(join(slot.dir, INFLIGHT_MARKER));
  } catch {
    /* already gone — publishing twice is not an error */
  }
  const published: string[] = [];
  for (const { alias, target } of aliases) {
    // An artifact the run never wrote is NOT published: a dangling pointer reads as "missing" to every
    // reader, which is worse than leaving the previous COMPLETE run's pointer in place (and the launcher's
    // own exit code is the verdict about THIS run either way).
    if (target !== "." && !exists(join(slot.dir, target))) {
      continue;
    }
    const absAlias = reportsPath(root, alias);
    mkdirSync(dirname(absAlias), { recursive: true });
    // Relative from the alias's own directory, so the whole reports/ tree stays relocatable.
    const rel = join(
      ...alias
        .split("/")
        .slice(0, -1)
        .map(() => ".."),
      RUNS_SEGMENT,
      slot.instrument,
      slot.runId,
    );
    publishSymlink(absAlias, target === "." ? rel : join(rel, target));
    published.push(alias);
  }
  writeFileSync(join(slot.dir, PUBLISHED_MANIFEST), `${JSON.stringify(published, null, 2)}\n`);
  pruneRuns(root, slot);
  return published;
}

/** The aliases a slot published, or an empty list for a slot that never got that far. */
function publishedAliases(dir: string): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): an absent or unparseable manifest means "this slot published nothing a pointer could still resolve into" — the ONE question the retention reader asks — and the empty list is that answer at its single call site. Ends if a caller starts needing to distinguish "never published" from "manifest lost".
  try {
    return JSON.parse(readFileSync(join(dir, PUBLISHED_MANIFEST), "utf-8")) as readonly string[];
  } catch {
    return [];
  }
}

/** The run id a published pointer currently resolves into (`../runs/<instrument>/<runId>/…`), or null
 *  when nothing readable is at the alias. Read as a LINK — never followed — so a pointer a later run
 *  re-aimed answers with that later run's id, which is exactly the retention question. */
function pointerRunId(root: string, alias: string, instrument: string): string | null {
  // @orb-waive caught-failure-ownership(catch): a removed or replaced alias is the NEGATIVE answer to "does this pointer still resolve into that slot?" — null is that answer at the one call site (the retention filter). Ends if the caller starts acting on WHY the alias is unreadable.
  try {
    const target = readlinkSync(reportsPath(root, alias)).replaceAll("\\", "/");
    const marker = `${RUNS_SEGMENT}/${instrument}/`;
    const at = target.indexOf(marker);
    return at === -1 ? null : (target.slice(at + marker.length).split("/")[0] ?? null);
  } catch {
    return null;
  }
}

/** Is any `latest` pointer still resolving INTO this slot? The `--out`-keyed families publish one pointer
 *  per artifact NAME, so pointers from many runs are live at once — pruning by age alone would delete the
 *  evidence a live pointer names and leave it dangling (#1164). */
function slotIsReferenced(root: string, instrument: string, runIdOfSlot: string, dir: string): boolean {
  return publishedAliases(dir).some((alias) => pointerRunId(root, alias, instrument) === runIdOfSlot);
}

/** Does this path exist (without following a link)? `existsSync` answers FALSE for a dangling symlink, and
 *  "a link is there" is exactly what the publish check needs to know. */
function exists(path: string): boolean {
  // @orb-waive caught-failure-ownership(catch): this IS an existence predicate — the throw is the negative answer and is returned as `false` to the one caller (publishRunSlot's "did the run write this artifact?" check). Ends if the caller starts needing WHY the path is unreadable.
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A slot's last-modified instant, or null when the slot VANISHED between the directory listing and this
 *  read. THE DEFECT THIS CLOSES (#1029 adversarial verification, 2026-09-02): every other per-slot read in
 *  the prune chain — `readMarker`, `publishedAliases`, `pointerRunId` — already answers "gone" with a
 *  value, but this one called `statSync(...).mtimeMs` bare after a multi-syscall filter chain. A SIBLING
 *  publisher pruning the same stale slot inside that window threw ENOENT out of `publishRunSlot`, BEFORE
 *  the instrument returned its verdict — so a green (or honestly red) run exited 2 with a raw stack and
 *  lost its history entry. Reproduced 12/15 trials at 2 concurrent publishers over a 12-slot ring; all
 *  five instrument families share the call site. A vanished slot is nothing to prune. */
function slotMtime(dir: string): number | null {
  // @orb-waive caught-failure-ownership(catch): a slot removed by a CONCURRENT publisher's prune between the listing and this stat is the expected racing case, and `null` is the answer its one caller acts on — the row is dropped, because a slot that is already gone is nothing to prune. Ends if the caller starts needing to distinguish a vanished slot from an unreadable one (a permission error worth reporting).
  try {
    return statSync(dir).mtimeMs;
  } catch {
    return null;
  }
}

/** `PrunedRun` is homed in ./run-retention.ts and re-exported here: this module is the run-slot door every
 *  instrument imports, and a reader answering "the cited run is gone" arrives through `prunedRuns`. */
export type { PrunedRun } from "./run-retention.ts";

/** The runs of this instrument the ring deleted on this checkout, oldest first — so `--reports` can answer a
 *  citation that no longer resolves with `PRUNED <id> <when>` instead of omitting it (#1341). */
export function prunedRuns(root: string, instrument: string): readonly PrunedRun[] {
  return readPrunedRuns(instrumentRunsDir(root, instrument));
}

/** Delete what retention says may go. A slot still in flight, the one just published, and any slot a
 *  published pointer resolves into never become candidates — `latest` can never name a removed run. The
 *  POLICY (age floor first, count cap second) and the ledger are ./run-retention.ts's. */
function pruneRuns(root: string, slot: RunSlot): void {
  const base = instrumentRunsDir(root, slot.instrument);
  const candidates = runDirs(root, slot.instrument)
    .filter((name) => name !== slot.runId)
    .filter((name) => {
      const marker = readMarker(join(base, name));
      return marker === null || !pidAlive(marker.pid);
    })
    .filter((name) => !slotIsReferenced(root, slot.instrument, name, join(base, name)))
    .map((name) => ({ runId: name, at: slotMtime(join(base, name)) }))
    // A slot a racing publisher already removed drops out here; the `rmSync(force)` below is likewise
    // indifferent to one vanishing between this filter and the delete.
    .filter((row): row is RetentionCandidate => row.at !== null);
  const prunedAt = new Date().toISOString();
  const pruned: PrunedRun[] = [];
  for (const stale of selectPrunable(candidates, Date.now())) {
    rmSync(join(base, stale.runId), { recursive: true, force: true });
    pruned.push({ runId: stale.runId, prunedAt, ranAt: new Date(stale.at).toISOString() });
  }
  recordPrunedRuns(base, pruned);
}

/** Slots of this instrument whose run DIED — the marker survived a process that is gone. This is the #410
 *  killed-run tell after the fixed-path stub retired: a reader that finds one newer than the published
 *  pointer is looking at a run that never became a verdict. Newest first. */
export function abandonedRuns(root: string, instrument: string): readonly AbandonedRun[] {
  const base = instrumentRunsDir(root, instrument);
  return runDirs(root, instrument)
    .map((name) => ({ name, marker: readMarker(join(base, name)) }))
    .filter((e): e is { name: string; marker: InflightMarker } => e.marker !== null && !pidAlive(e.marker.pid))
    .map((e) => ({ runId: e.marker.runId, dir: join(base, e.name), startedAt: e.marker.startedAt }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

const LEADING_SLASH_RE = /^\//u;
const NON_SLUG_RE = /[^a-zA-Z0-9_-]+/gu;

/** Default artifact basename for a route: `/chats/abc?x=1` → `chats_abc_x_1`, `/` → `root`. */
export function routeSlug(route: string): string {
  return route.replace(LEADING_SLASH_RE, "").replace(NON_SLUG_RE, "_") || "root";
}

// The extensions a probe artifact BASE may already carry. `--out shot.png` names the same artifact as
// `--out shot`, and its JSON manifest sibling is `shot.json`, never `shot.png.json`.
const ARTIFACT_EXT_RE = /\.(?:png|json|zip|har|webm|cpuprofile)$/iu;
// `./x` and `../x` are the shell's own spelling of "a path relative to where I am standing".
const EXPLICIT_RELATIVE_RE = /^\.\.?\//u;

/** Does this `--out` value name a filesystem PATH the caller chose, rather than an artifact BASE NAME to
 *  be filed under `reports/<kind>/`? Absolute and explicitly-relative (`./`, `../`) values are paths; a
 *  bare name — including one with inner directories (`chat/room`) — stays inside the artifact dir. */
export function isOutPath(out: string): boolean {
  return isAbsolute(out) || EXPLICIT_RELATIVE_RE.test(out);
}

/** The final file path for an `--out` value + the extension this artifact is written with. PURE (the
 *  caller supplies the already-created `reports/<kind>/` dir) so the whole naming contract is unit-testable.
 *
 *  THE DEFECT THIS EXISTS FOR (2026-08-17): every call site spelled `join(await artifactDir(k), name + ext)`
 *  by hand, so `--out /abs/shot.png` — a path a lane pasted from its own scratch dir — was JOINED UNDER the
 *  reports dir and re-suffixed: `reports/snaps/abs/shot.png.png`. The run still exited 0, so the caller
 *  believed the file it named existed. A refusal would have been honest; landing where NAMED is better. */
export function artifactFilePath(baseDir: string, out: string, ext: string): string {
  const target = isOutPath(out) ? resolve(process.cwd(), out) : (baseAnchoredOut(baseDir, out) ?? join(baseDir, out));
  return `${target.replace(ARTIFACT_EXT_RE, "")}${ext}`;
}

/** A bare-relative `--out` ALREADY spelled from the repo root INTO this kind's dir (`reports/snaps/foo.png`)
 *  names the very file the prefixing would produce — so its `reports/<kind>/` prefix is STRIPPED instead of
 *  being prefixed AGAIN into `reports/snaps/reports/snaps/foo.png` (#209, 2026-08-18; a lane pasted back the
 *  path snap itself had just printed). The check is a prefix strip rather than a `resolve(baseDir, "..", "..")`
 *  because since #1164 `baseDir` may be a RUN SLOT (`reports/runs/snap/<runId>/snaps`), where two levels up is
 *  not the repo root and the old form silently stopped recognizing the very path snap prints. It stays PURE —
 *  no `process.cwd()`. A bare name that lands anywhere else (`home/tiles`, another kind's dir) is still an
 *  artifact BASE and keeps the prefix. */
function baseAnchoredOut(baseDir: string, out: string): string | null {
  const prefix = `reports/${basename(baseDir)}/`;
  const spelled = out.replaceAll("\\", "/");
  return spelled.startsWith(prefix) ? join(baseDir, spelled.slice(prefix.length)) : null;
}

/** The `reports/<kind>/` KEY for an `--out` value: identity for a bare name, and the sanitized basename
 *  for a path-shaped one. Kind-dir siblings (traces, HARs, baselines) are keyed BY NAME and stay in their
 *  own family — routing the shot to `/tmp/x.png` must not scatter a trace into `/tmp`, nor re-create the
 *  double-join inside `reports/traces/`. */
export function artifactKey(out: string): string {
  return routeSlug(basename(out).replace(ARTIFACT_EXT_RE, ""));
}
