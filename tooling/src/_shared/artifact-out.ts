// The `--out` FILING layer (#1164): which file an instrument's artifact lands in, and which RUN owns it.
// One layer above ./artifacts.ts (run slots + the reports/ path home + the RESULT line), which it imports
// and never imports back. Split out when the two layers together passed the tooling-size cap — the seam is
// real, not cosmetic: `artifacts.ts` answers "where do runs live", this answers "where does THIS artifact go".
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import { artifactFilePath } from "./artifact-naming.ts";
import type { InstrumentCurrentScope } from "./artifact-scope.ts";
import { instrumentCurrentScopeSchema } from "./artifact-scope.ts";
import type { RunAlias, RunSlot } from "./artifacts.ts";
import { openRunSlot, print, publishRunSlot, REPO_ROOT, reportsPath } from "./artifacts.ts";

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

export interface InstrumentArtifactLimitEvent {
  readonly kind: string;
  readonly path: string;
  readonly original: number | null;
  readonly retained: number | null;
  readonly omitted: number | null;
}

export interface InstrumentArtifactLimitReceipt {
  readonly source: string;
  readonly complete: boolean;
  readonly policy: Readonly<Record<string, number>> | null;
  readonly events: readonly InstrumentArtifactLimitEvent[];
}

export const INSTRUMENT_ARTIFACT_ROLES = ["primary", "raw-fallback"] as const;
export const instrumentArtifactRoleSchema = z.enum(INSTRUMENT_ARTIFACT_ROLES);
export type InstrumentArtifactRole = z.infer<typeof instrumentArtifactRoleSchema>;

export const INSTRUMENT_ARTIFACT_COMPLETENESS = ["complete", "bounded", "unknown"] as const;
export const instrumentArtifactCompletenessSchema = z.enum(INSTRUMENT_ARTIFACT_COMPLETENESS);
export type InstrumentArtifactCompleteness = z.infer<typeof instrumentArtifactCompletenessSchema>;

const nonnegativeCountSchema = z.number().int().nonnegative();
const nullableCountSchema = nonnegativeCountSchema.nullable();
/** A limit receipt's quantities are MEASUREMENTS IN THE UNIT THE EVENT'S `kind`/`path` NAMES, not counts:
 *  bytes (`byte-cap`), frames, rows, retainer depth — and MILLISECONDS, because the filmstrip's
 *  `duration-cap` writes `original: now - startedAt` against a real clock and `retained`/`policy.durationMs`
 *  in the same unit (snap/lib/filmstrip-buffer.ts). Integer-ness was never a property of the field, only of
 *  the units that happen to be discrete, so demanding `.int()` here made a CORRECT over-cap
 *  `snap --filmstrip` run exit 2 with `malformed artifact declaration` on `original: 15837.811772000005`
 *  (#1643). Finite + nonnegative is the real invariant — zod 4's `z.number()` already rejects NaN/Infinity —
 *  and it is what the shape's two other homes always spelled (`_shared/browser-evidence-ring.ts`,
 *  `snap/contract/heap.ts`). `records` stays a COUNT: a record is discrete by construction. */
const limitQuantitySchema = z.number().nonnegative();
const nullableLimitQuantitySchema = limitQuantitySchema.nullable();
/** THE ONE SCHEMA HOME for `InstrumentArtifactLimitEvent`/`InstrumentArtifactLimitReceipt` (#1652) — the
 *  ring (`browser-evidence-ring.ts`) and the heap contract (`snap/contract/heap.ts`) import these two
 *  rather than re-spelling them, so a negative `omitted` or an empty `kind`/`path` refuses at all three
 *  readers instead of only here. Before #1652 they diverged on sign and emptiness (bare `z.number()`/
 *  `z.string()` at the other two homes) — a defect the "one home" claim after #1643 (fractional quantities)
 *  did not actually close, because #1643 fixed only the ONE axis it was about. */
export const artifactLimitEventSchema = z.object({
  kind: z.string().min(1),
  path: z.string().min(1),
  original: nullableLimitQuantitySchema,
  retained: nullableLimitQuantitySchema,
  omitted: nullableLimitQuantitySchema,
});
export const artifactLimitReceiptSchema = z.object({
  source: z.string().min(1),
  complete: z.boolean(),
  policy: z.record(z.string().min(1), limitQuantitySchema).nullable(),
  events: z.array(artifactLimitEventSchema),
});

export interface InstrumentArtifactMetadata {
  readonly producer: string;
  readonly producerArm: string | null;
  readonly channel: string;
  readonly mediaType: string;
  readonly schema: string | null;
  readonly role: InstrumentArtifactRole;
  readonly completeness: InstrumentArtifactCompleteness;
  readonly completenessDetail: string;
  /** Current writers must decide each axis; ambiguous null triples are reader-only legacy bytes. */
  readonly scope: InstrumentCurrentScope;
  readonly records: number | null;
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}

export interface InstrumentArtifactDeclaration extends InstrumentArtifactMetadata {
  readonly v: 1;
  readonly kind: string;
  readonly path: string;
  readonly relativePath: string | null;
  readonly publishedPath: string | null;
}

export const instrumentArtifactDeclarationSchema = z.object({
  v: z.literal(1),
  kind: z.string().min(1),
  path: z.string().min(1).refine(isAbsolute, "artifact path must be absolute"),
  relativePath: z.string().min(1).nullable(),
  publishedPath: z.string().min(1).refine(isAbsolute, "published artifact path must be absolute").nullable(),
  producer: z.string().min(1),
  producerArm: z.string().min(1).nullable(),
  channel: z.string().min(1),
  mediaType: z.string().min(1),
  schema: z.string().min(1).nullable(),
  role: instrumentArtifactRoleSchema,
  completeness: instrumentArtifactCompletenessSchema,
  completenessDetail: z.string().min(1),
  scope: instrumentCurrentScopeSchema,
  records: nullableCountSchema,
  limits: z.array(artifactLimitReceiptSchema),
}) satisfies z.ZodType<InstrumentArtifactDeclaration>;

const ARTIFACT_DECLARATIONS_DIR = ".artifacts";

/** Persist allocation-time identity in the slot so adopted session writers cross the process boundary.
 * Completion reconciles this declaration against actual bytes; a failed write never becomes an artifact. */
async function declareArtifact(run: ActiveRun, kind: string, path: string, metadata: InstrumentArtifactMetadata): Promise<void> {
  const relativePath = relative(run.slot.dir, path);
  const insideSlot = relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
  const declaration: InstrumentArtifactDeclaration = {
    v: 1,
    kind,
    path,
    relativePath: insideSlot ? relativePath : null,
    publishedPath: insideSlot ? reportsPath(run.root, relativePath) : null,
    ...metadata,
  };
  const declarationsDir = join(run.slot.dir, ARTIFACT_DECLARATIONS_DIR);
  await mkdir(declarationsDir, { recursive: true });
  const key = createHash("sha256").update(path).digest("hex");
  await writeFile(join(declarationsDir, `${key}.json`), `${JSON.stringify(declaration, null, 2)}\n`, "utf8");
}

/** Register a file path a producer already owns (for example Playwright's screenshot/trace writer). */
export async function registerInstrumentArtifact(kind: string, path: string, metadata: InstrumentArtifactMetadata): Promise<void> {
  if (activeRun !== null) {
    await declareArtifact(activeRun, kind, path, metadata);
  }
}

export interface InstrumentRunOptions {
  /** The explicit-slot form: adopt a slot dir another
   *  process opened instead of opening one. The session daemon's per-call shape. */
  readonly slotDir?: string;
  /** A tool-owned terminal writer that runs after `main` settles but before the slot is published. This
   *  is where Snap writes its immutable run index: it can inventory the complete slot and the index is
   *  itself present before `.inflight` is removed. The shared layer deliberately does not know the
   *  index schema. */
  readonly complete?: (receipt: InstrumentRunCompletion) => Promise<void>;
}

export interface InstrumentRunCompletion {
  readonly slot: RunSlot;
  readonly root: string;
  /** `null` only when `main` threw before returning an exit code. */
  readonly exit: number | null;
  readonly error: unknown | null;
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

/** The one door a rendered instrument's cli.ts uses (policy `tooling-artifact-run-slot`): open the run,
 *  NAME it on stdout with the racing census, run, and publish whatever it wrote. The slot is announced at
 *  the START — a run's artifacts are findable while it is still going, and the RESULT line stays last. */
export async function withInstrumentRun(
  instrument: string,
  main: () => Promise<number>,
  root: string = REPO_ROOT,
  options: InstrumentRunOptions = {},
): Promise<number> {
  const slot = beginInstrumentRun(instrument, root, options);
  print(`run slot     ${slot.relDir}`);
  if (slot.racing.length > 0) {
    print(`CONCURRENT   other live ${instrument} run(s) on this checkout: ${slot.racing.join(", ")} — each keeps its own slot`);
  }
  let exit: number | null = null;
  let failure: unknown | null = null;
  try {
    exit = await main();
    return exit;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await options.complete?.({ slot, root, exit, error: failure });
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
export async function artifactFile(kind: string, out: string, ext: string, metadata?: InstrumentArtifactMetadata): Promise<string> {
  const path = artifactFilePath(await artifactDir(kind), out, ext);
  await mkdir(dirname(path), { recursive: true });
  if (metadata !== undefined) {
    await registerInstrumentArtifact(kind, path, metadata);
  }
  return path;
}
