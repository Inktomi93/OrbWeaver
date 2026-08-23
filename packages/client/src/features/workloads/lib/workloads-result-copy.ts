// workloads-result-copy — kind → a HUMAN one-line summary of a succeeded row's stored `result` blob. DOM-free.
//
// The row used to print the blob VERBATIM: a catalog refresh finished and the user read
// `{"models":337,"agentSdkModels":4}`. Our JSON is not copy. Every kind gets a sentence instead
// ("337 models · 4 via Agent SDK"), and nothing here can ever emit a serialized object.
//
// THE REGISTRY IS THE CONTRACT'S OWN VOCABULARY. `WORKLOAD_RESULT_RENDERERS` is a mapped Record over
// `WorkloadKind` (a new kind is a tsc error here — the §5.5 dispatch discipline) and each renderer is typed
// against that kind's `WorkloadResultByKind` entry, so the copy cannot drift from the shape the OWNING domain
// actually writes.
//
// TWO HONEST FALLBACKS, never raw JSON:
//   • a kind whose entry is `null` — a kind can land before its copy does, and an unwritten renderer must
//     degrade to a sentence, not to a leak;
//   • a blob this build can no longer read — the durable `result` column outlives a shape change (the class
//     the poison row exists for), so a renderer that finds no readable field returns `null` and falls back.
// The phrase builders therefore take `unknown`: the blob is a persisted boundary, not a value this build made.

import type { AnalyticsEmptyReason } from "@orb/contracts/discovery";
import type { WorkloadKind, WorkloadResultByKind } from "@orb/contracts/workloads";

/** What a succeeded row says when no renderer can speak for its result. */
const RESULT_SUMMARY_FALLBACK = "Finished — this run reported no readable summary.";

const PART_SEPARATOR = " · ";

/** A PLURALIZING phrase: `"1 model"` / `"337 models"`. `null` when the blob has no readable number there. */
function count(value: unknown, singular: string, plural = `${singular}s`): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return `${value} ${value === 1 ? singular : plural}`;
}

/** The same, dropped at zero — silence beats `"0 skipped"` in a one-line summary. */
function countIfAny(value: unknown, singular: string, plural = `${singular}s`): string | null {
  return value === 0 ? null : count(value, singular, plural);
}

/** An INVARIANT-label phrase: `"12 embedded"`, `"40 written"` — a past participle takes no plural. */
function tally(value: unknown, label: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return `${value} ${label}`;
}

/** The same, dropped at zero. */
function tallyIfAny(value: unknown, label: string): string | null {
  return value === 0 ? null : tally(value, label);
}

/** Read one field of a NESTED blob object without trusting it to be there — an older shape must degrade to
 *  the fallback, never throw inside a render. */
function field(source: unknown, key: string): unknown {
  return typeof source === "object" && source !== null ? (source as Record<string, unknown>)[key] : undefined;
}

/** Join the phrases a renderer could actually build; NO readable phrase means no summary (→ the fallback). */
function summarize(parts: readonly (string | null)[]): string | null {
  const kept = parts.filter((part): part is string => part !== null);
  return kept.length === 0 ? null : kept.join(PART_SEPARATOR);
}

type WorkloadResultRenderer<K extends WorkloadKind> = (result: WorkloadResultByKind[K]) => string | null;

/** index — an embed pass: what it wrote, and what it skipped as already current. */
const indexSummary: WorkloadResultRenderer<"index"> = (result) =>
  summarize([tally(result.embedded, "embedded"), tallyIfAny(result.skipped, "already up to date")]);

/**
 * Why an analytics pass wrote nothing, in the user's terms — an exhaustive `Record` over the contract's own
 * union (§5.5), so a new reason is a tsc error here rather than a silent fall-through to "0 rows · 0 written".
 *
 * THE SENTENCE NAMES THE FIX, not just the state. A pass that could not run is only useful if the row says
 * what would let it run (issue #166: `compute-themes` reported a green "0 rows · 0 written" for a corpus with
 * no memory digests at all, and nothing on the row hinted that the missing input was memory).
 */
const ANALYTICS_EMPTY_COPY: Record<AnalyticsEmptyReason, string> = {
  "no-digests": "No memory digests to read — run the memory backfill first",
  // A SEPARATE sentence, not a variant of the one above: the backfill has already run here, so repeating its
  // instruction would send the user to a job that changes nothing (issue #558).
  "no-solo-digests": "Only group-room digests to read — story themes come from solo chats",
  // A THIRD job, not a third phrasing of the backfill: the similarity passes read the embeddings the INDEX
  // pass writes, so pointing at memory here would send the user somewhere that cannot help (issue #561).
  "no-embeddings": "Nothing embedded to compare — run the embeddings index first",
  "no-cards": "No characters to read yet",
};

/** The five discovery analytics passes: rows read, rows written — or the stated refusal when the pass had no
 *  input at all (which is NOT the same event as a run that changed nothing). */
const analyticsSummary: WorkloadResultRenderer<"compute-themes"> = (result) =>
  result.emptyReason === undefined ? summarize([count(result.scanned, "row"), tally(result.written, "written")]) : ANALYTICS_EMPTY_COPY[result.emptyReason];

/** A maintenance sweep: what it looked at, what it touched, and whether it was allowed to touch anything. */
const maintenanceSummary: WorkloadResultRenderer<"assets-gc"> = (result) =>
  summarize([count(result.scanned, "item"), tally(result.changed, "changed"), result.dryRun ? "dry run — nothing written" : null]);

/** A backfill sweep (group characters): chats read, chats filled in. */
const backfillSummary: WorkloadResultRenderer<"group-character-backfill"> = (result) =>
  summarize([count(result.scanned, "chat"), tally(result.changed, "updated")]);

/** The memory sweep reports two passes plus the chats it isolated and skipped. */
const memoryBackfillSummary: WorkloadResultRenderer<"memory-backfill"> = (result) =>
  summarize([
    count(field(result.segments, "changed"), "segment"),
    count(field(result.digests, "changed"), "digest"),
    countIfAny(result.failed, "chat skipped", "chats skipped"),
  ]);

/** The integrity walk: the three fault counts — a clean walk says so rather than listing three zeroes. */
const fsckSummary: WorkloadResultRenderer<"assets-fsck"> = (result) => {
  const faults = summarize([
    countIfAny(result.danglingRows, "dangling row"),
    countIfAny(result.corruptBlobs, "corrupt blob"),
    countIfAny(result.orphanBlobs, "orphan blob"),
  ]);
  if (faults !== null) {
    return faults;
  }
  // All three read as zero (not as an unreadable blob) — that is the good outcome, and it deserves words.
  return count(result.danglingRows, "dangling row") === null ? null : "No faults found.";
};

/** A bundle import's per-entity tallies. */
const bundleImportSummary: WorkloadResultRenderer<"import-bundle"> = (result) =>
  summarize([tally(result.imported, "imported"), tallyIfAny(result.skipped, "skipped"), tallyIfAny(result.failed, "failed")]);

/** The stats rollup rebuild: owners swept, character rollups rewritten. */
const reconcileStatsSummary: WorkloadResultRenderer<"reconcile-stats"> = (result) =>
  summarize([count(result.owners, "owner"), count(result.characters, "character")]);

/** The catalog refresh: two INDEPENDENT lanes — a `null` lane FAILED and must say so, never read as zero. */
const catalogRefreshSummary: WorkloadResultRenderer<"refresh-model-catalog"> = (result) =>
  summarize([
    result.models === null ? "model list unavailable" : count(result.models, "model"),
    result.agentSdkModels === null ? "Agent SDK list unavailable" : tally(result.agentSdkModels, "via Agent SDK"),
  ]);

/** A databank ingest/reindex pass, in vector-layer terms the user can act on. */
const ingestSummary: WorkloadResultRenderer<"databank-ingest"> = (result) =>
  summarize([
    count(result.documents, "document"),
    count(result.chunksUpserted, "chunk written", "chunks written"),
    countIfAny(result.chunksNoop, "chunk unchanged", "chunks unchanged"),
    countIfAny(result.chunksPruned, "chunk pruned", "chunks pruned"),
    tallyIfAny(result.reExtracted, "re-extracted"),
    countIfAny(Array.isArray(result.failed) ? result.failed.length : null, "document failed", "documents failed"),
  ]);

/** The refinery library sweep: what it scored, and — separately — what it declined to score and what broke.
 *  `skipped` and `failed` are DIFFERENT facts (already-scored vs nothing-usable-came-back), so neither is
 *  allowed to hide inside the other. */
const scoreSweepSummary: WorkloadResultRenderer<"refine-score-sweep"> = (result) =>
  summarize([count(result.scanned, "card"), tally(result.scored, "scored"), tallyIfAny(result.skipped, "skipped"), tallyIfAny(result.failed, "failed")]);

/** Imported token settlement: distinguish exact recovery from honest estimates and CAS skips. */
const tokenUsageBackfillSummary: WorkloadResultRenderer<"import-token-usage-backfill"> = (result) =>
  summarize([
    count(result.scanned, "variant"),
    countIfAny(result.exactRecovered, "exact count recovered", "exact counts recovered"),
    countIfAny(result.legacyPromoted, "legacy count marked measured", "legacy counts marked measured"),
    tallyIfAny(result.estimated, "estimated"),
    tallyIfAny(result.compareAndSetSkipped, "changed concurrently"),
    result.dryRun ? "dry run — nothing written" : null,
  ]);

/** An inert v2 stub: `deferred:true` is not "zero work done", it is "this pass does not exist yet". */
const deferredSummary: WorkloadResultRenderer<"reconcile-world-state"> = () => "Nothing to do — this pass isn't implemented yet.";

/**
 * kind → its result renderer, or `null` for a kind whose copy is not written yet (→ the generic fallback).
 * Exhaustive over `WorkloadKind` by construction.
 *
 * The value type is SPELLED OUT rather than `WorkloadResultRenderer<K>`: a renderer shared by several kinds
 * (the five analytics passes, the three maintenance sweeps, both databank passes) must be assignable to each
 * of their slots, and TS compares two references to the same generic alias by TYPE ARGUMENT — `"csls"` vs
 * `"compute-themes"` — instead of structurally, even though both resolve to the identical shape.
 */
const WORKLOAD_RESULT_RENDERERS: { readonly [K in WorkloadKind]: ((result: WorkloadResultByKind[K]) => string | null) | null } = {
  index: indexSummary,
  "distill-characters": analyticsSummary,
  "compute-themes": analyticsSummary,
  "memory-backfill": memoryBackfillSummary,
  "group-character-backfill": backfillSummary,
  "compute-cooccurrence": analyticsSummary,
  "find-duplicates": analyticsSummary,
  csls: analyticsSummary,
  "assets-backfill": maintenanceSummary,
  "assets-gc": maintenanceSummary,
  "assets-fsck": fsckSummary,
  "import-st": maintenanceSummary,
  "import-bundle": bundleImportSummary,
  "import-token-usage-backfill": tokenUsageBackfillSummary,
  "reconcile-stats": reconcileStatsSummary,
  "refresh-model-catalog": catalogRefreshSummary,
  "reconcile-world-state": deferredSummary,
  "databank-ingest": ingestSummary,
  "databank-reindex": ingestSummary,
  "refine-score-sweep": scoreSweepSummary,
};

/**
 * The one-line summary a succeeded row shows for its stored result — human copy or nothing, NEVER the blob.
 * `null` = the run reported no result at all (the row stays a bare "Succeeded").
 */
export function workloadResultSummary(kind: WorkloadKind, result: unknown): string | null {
  if (result === null || result === undefined || typeof result !== "object" || Object.keys(result).length === 0) {
    return null;
  }
  // THE ONE cast, at the ONE seam: the row's `kind` selects the renderer, and the server wrote this blob from
  // that same kind's contribution, so `WorkloadResultByKind` IS the pairing — nothing else can pick for it.
  const render = WORKLOAD_RESULT_RENDERERS[kind] as ((value: object) => string | null) | null;
  return (render === null ? null : render(result)) ?? RESULT_SUMMARY_FALLBACK;
}
