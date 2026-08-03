// domain/discovery/verbs/distill — the write-half producer. A guided-decode `summarize` pass turns each
// character's card into filterable `character_summaries` facets and stages the distilled labels as
// `source:'auto', status:'pending'` tag suggestions (the Accept/Reject review queue). Idempotent: upsert
// by `characterId`; tag staging never downgrades an already-accepted tag back to pending.
//
// TWO FAILURE POSTURES, one pass (the `opts.characterId` narrow is the switch):
//   • the BATCH (a sweep, no `characterId`) CONTAINS a per-card failure — one bad card must never abort the
//     other 500, so the pass commits everything valid and REPORTS `failed` in its counts. Never throws.
//   • the ON-DEMAND single card (`suggestCharacterTags`, the editor's "Suggest tags") THROWS. That pass IS
//     one card, so containing its failure returned a 200 carrying `{distilled: 0, failed: 1}` that no client
//     reads — the button went quiet and told the user nothing (the exact lying-empty-state the typed errors
//     in `contract/errors.ts` exist to kill). Both arms are pinned by tests; don't collapse them.
//
// THE CONTENT FLOOR runs through the same switch (owner ruling 2026-08-03): a card with no writing beyond its
// name is NOT distillable — the payload schema requires genre/tone/setting/pitch/overview/3-8 tags, so every
// facet would be invented and staged as a pending tag suggestion. On-demand it is `CardNotDistillableError`
// (after the ownership belt, never before); in the batch it is a counted `DistillStats.skipped`, which the
// `distill-characters` workload reports as progress — an uncounted skip is how a silent sweep lies.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { ResponseFormat, SummarizeOptions } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn } from "@orb/server/kit/structured-turn";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import type { DiscoveryContext } from "../context";
import { CardNotDistillableError, DistillFailedError } from "../contract/errors";
import type { DistillCharactersOptions } from "../contract/params";
import type { CharacterDistillation, DistillStats } from "../contract/results";
import type { DiscoveryService, DistillCharactersDeps } from "../contract/service";
import { readCardDistillTargets } from "../persistence/card-reads";
import { traceStructuredRetry } from "../substrate/structured-retry-trace";

/** Bind the distill pass over the DI bundle (the verb-naming factory the service composes). Projects the
 *  context's sub-deps onto the standalone {@link distillCharacters} — the workload runner reaches the same
 *  pass through the service method this returns. */
export function createDistill(ctx: DiscoveryContext): DiscoveryService["distillCharacters"] {
  return (opts) =>
    distillCharacters(
      ctx.db,
      {
        now: ctx.now,
        summarize: ctx.summarize,
        summarizerModel: ctx.summarizerModel,
        attachCardTagByName: ctx.attachCardTagByName,
        resolveUserPresetParams: ctx.resolveUserPresetParams,
        resolveUserProse: ctx.resolveUserProse,
      },
      opts,
    );
}

/** @internal — the genre grammar enum (barrel re-export is internal to discovery/). */
const GENRES = [
  "fantasy",
  "science-fiction",
  "modern",
  "historical",
  "horror",
  "romance",
  "slice-of-life",
  "adventure",
  "mystery",
  "comedy",
  "drama",
  "supernatural",
  "other",
] as const;

/** @internal — the tone grammar enum (barrel re-export is internal to discovery/). */
const TONES = ["dark", "lighthearted", "romantic", "comedic", "gritty", "wholesome", "melancholic", "tense", "whimsical", "sensual"] as const;

/** @internal — the distill-pass structured-output payload (D79). The zod schema is BOTH the wire grammar (via
 *  the one projection rule) and the runtime validator inside runStructuredTurn — the genre/tone enums and the
 *  tag-count bounds the guided-decode grammar used to carry, now enforced once. */
const MAX_SUBGENRES = 3;
const MIN_TAGS = 3;
const MAX_TAGS = 8;
const DISTILL_PAYLOAD = z.object({
  genre: z.enum(GENRES),
  subGenres: z.array(z.string()).max(MAX_SUBGENRES),
  tone: z.enum(TONES),
  setting: z.string(),
  tags: z.array(z.string()).min(MIN_TAGS).max(MAX_TAGS),
  elevatorPitch: z.string(),
  overview: z.string(),
});
const DISTILL_RESPONSE_FORMAT: ResponseFormat = { name: "character_distillation", schema: projectJsonSchema(DISTILL_PAYLOAD) };

const MAX_CARD_CHARS = 6000;
// Stays under the libSQL bound-variable cap (each upsert binds ~2x the column count).
const DISTILL_BATCH_CHUNK = 500;
// Caps the per-card RETRY fan-out. Validation failure is CORRELATED, not independent: a hosted summarize
// model that ignores the json_schema constraint fails EVERY card in the batch identically, so a naive
// `Promise.all` over the whole (500+) library would fire N parallel retry calls at once — the exact per-key
// 429 storm the OpenRouter backend serializes to avoid. Parsing in bounded waves holds concurrent retries to
// this many. The happy path pays nothing: a card whose batch reply parses first-try makes no extra call.
const DISTILL_RETRY_CONCURRENCY = 8;

/** The ONE resolution every call of a pass shares: the sampling posture + the resolved system prose. Carried
 *  as a unit so the bounded per-card RETRY provably runs the same pass the batch call did. */
interface DistillPass {
  readonly sampleOpts: SummarizeOptions;
  readonly system: string;
}

/** One distilled label queued for staging — the row's own owner (D23) + the character it tags. */
interface StagedLabel {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tag: string;
}

/**
 * Distill each targeted character's current card into `character_summaries` + staged `pending` tag suggestions.
 * `opts.characterId`/`opts.ownerId` narrow to ONE owned card (the on-demand editor button); absent = the
 * whole-library batch. Returns the pass summary. Exported standalone (the `distill-characters` workload runner
 * + the service factory both call it) — the factory thin-wraps it with `ctx`'s injected deps.
 */
async function distillCharacters(db: Db, deps: DistillCharactersDeps, opts: DistillCharactersOptions = {}): Promise<DistillStats> {
  const { signal } = opts;
  // The on-demand arm: this pass is ONE named card the caller is waiting on, so a failure is theirs to see.
  const onDemand = opts.characterId !== undefined;
  signal?.throwIfAborted();
  const targets = await readCardDistillTargets(db, {
    ...(opts.characterId !== undefined ? { characterId: opts.characterId } : {}),
    ...(opts.ownerId !== undefined ? { ownerId: opts.ownerId } : {}),
  });
  // The on-demand narrow resolved NO ROW — foreign / deleted / synthetic. Collapses to NOT_FOUND so a
  // stranger's rejection is indistinguishable from a miss (the cross-tenant sweep enforces exactly this): any
  // verdict about the CARD's content would confirm the card exists, so this belt runs before all of them.
  if (onDemand && targets.length === 0) {
    throw new DomainNotFoundError("character", opts.characterId ?? "");
  }
  // THE CONTENT FLOOR (owner ruling 2026-08-03). A card with nothing but a name is not distillable: the
  // payload schema REQUIRES genre/tone/setting/pitch/overview/3-8 tags, so the model would invent every facet
  // from the name and the invented tags would stage as pending suggestions. `text` can never be empty (it
  // always opens with `Name:`), so the readiness verdict is the read's own `hasContent` — not a length check.
  const ready = targets.filter((t) => t.hasContent);
  const skipped = targets.length - ready.length;
  // The on-demand card is the ONE card the caller is waiting on; skipping it silently would answer 200 with
  // `{distilled: 0}` — the same lying-empty-state `DistillFailedError` exists to kill. Refuses AFTER the
  // ownership belt above, never before: a verdict about the card's content on an unowned id is an existence
  // oracle (contract/errors.ts). The BATCH never throws here — its name-only cards ride `skipped` out.
  if (onDemand && ready.length === 0) {
    throw new CardNotDistillableError();
  }
  if (ready.length === 0) {
    return { scanned: targets.length, distilled: 0, failed: 0, skipped, tagsStaged: 0 };
  }

  // The side-gen sampling ladder: the `distill` floor (temp 0.2, 512 out — near-deterministic guided decode)
  // ← the card owner's default-preset params. The whole-library batch has no single owner (a mixed-owner run),
  // so the preset rung applies ONLY to a per-owner narrow (`opts.ownerId`); the batch stays on the floor. The
  // structured-output `responseFormat` is orthogonal to sampling and always rides.
  const presetParams = opts.ownerId !== undefined ? await deps.resolveUserPresetParams(opts.ownerId) : undefined;
  const sampleOpts: SummarizeOptions = {
    responseFormat: DISTILL_RESPONSE_FORMAT,
    ...toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES.distill, presetParams)),
  };
  // The system prompt is a PROSE-1 slot on the SAME owner rung as the sampling above: an owner-narrowed run
  // reads that host's override, the mixed-owner library batch reads `{}` ⇒ the shipped prompt.
  const distillSystem = resolveProseText("discovery.distill.system", opts.ownerId !== undefined ? await deps.resolveUserProse(opts.ownerId) : {});

  signal?.throwIfAborted();
  // One batched call fills the role's parallel-slot pipeline; `ready[i]` pairs 1:1 with `result.items[i]`.
  const result = await deps.summarize(
    ready.map((t) => ({
      systemPrompt: distillSystem,
      userPrompt: t.text.slice(0, MAX_CARD_CHARS),
    })),
    sampleOpts,
  );

  const writes = await buildDistillWrites(deps, ready, result.items, {
    db,
    model: deps.summarizerModel,
    now: deps.now(),
    sampleOpts,
    system: distillSystem,
  });
  // The on-demand card produced nothing usable (double schema failure, or a provider fault on its retry —
  // `parseOneDistill` contains both). Nothing was committed, so there is no partial state to reconcile: the
  // caller gets a retryable refusal instead of a success carrying zeros.
  if (onDemand && writes.failed > 0) {
    throw new DistillFailedError("The summarizer returned nothing usable for that card. Try again.");
  }
  signal?.throwIfAborted();
  await commitSummaries(db, writes.stmts);
  // Stage AFTER summaries commit — a failed tag attach must not roll back the facets.
  const tagsStaged = await stageSuggestions(deps, writes.stagedLabels, signal);

  return {
    scanned: targets.length,
    distilled: writes.stmts.length,
    failed: writes.failed,
    skipped,
    tagsStaged,
  };
}

/** One distill target (a card ready to distill). */
interface DistillTarget {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly text: string;
}

/** Parse every reply, pairing `ready[i]`↔`items[i]`, into upsert statements + the flattened staged-label queue;
 *  a card that fails twice (or whose retry hits an infra error) counts `failed`. Each item runs through the ONE
 *  structured-turn helper (D79): the batch reply is the first attempt, a per-item retry re-summarizes with the
 *  issues. Split out to keep {@link distillCharacters} under the complexity cap. */
async function buildDistillWrites(
  deps: DistillCharactersDeps,
  ready: readonly DistillTarget[],
  items: readonly { readonly text: string }[],
  meta: { readonly db: Db; readonly model: string; readonly now: number; readonly sampleOpts: SummarizeOptions; readonly system: string },
): Promise<{ stmts: BatchItem<"sqlite">[]; stagedLabels: StagedLabel[]; failed: number }> {
  // The RESOLVED PASS — the sampling posture + the resolved system prose, carried together so a retry can
  // never re-resolve either and drift from the batch call.
  const pass: DistillPass = { sampleOpts: meta.sampleOpts, system: meta.system };
  // Parse in bounded waves — the first attempt reuses the already-fetched batch text (free), but a correlated
  // schema failure sends every card to a retry summarize call at once; the wave size is that fan-out's bound.
  const parsed: (CharacterDistillation | null)[] = [];
  for (let i = 0; i < ready.length; i += DISTILL_RETRY_CONCURRENCY) {
    const wave = ready.slice(i, i + DISTILL_RETRY_CONCURRENCY);
    // biome-ignore lint/performance/noAwaitInLoops: bounded-concurrency waves — each wave's per-card retries run in parallel, then the loop advances; that IS the concurrency bound.
    const waveParsed = await Promise.all(wave.map((target, j) => parseOneDistill(deps, target, items[i + j]?.text ?? "", pass)));
    parsed.push(...waveParsed);
  }
  const stmts: BatchItem<"sqlite">[] = [];
  const stagedLabels: StagedLabel[] = [];
  let failed = 0;
  for (let i = 0; i < ready.length; i += 1) {
    const target = ready[i];
    const distillation = parsed[i];
    if (target === undefined) {
      continue;
    }
    if (distillation === null || distillation === undefined) {
      failed += 1;
      continue;
    }
    stmts.push(upsertSummary(meta.db, { characterId: target.characterId, parsed: distillation, model: meta.model, now: meta.now }));
    for (const tag of distillation.tags) {
      stagedLabels.push({ ownerId: target.ownerId, characterId: target.characterId, tag });
    }
  }
  return { stmts, stagedLabels, failed };
}

/** Parse ONE card's distillation through the structured-turn helper (D79): the batch reply is the first
 *  attempt (already fetched — it cannot throw); a per-item retry re-summarizes that one card with the
 *  validation issues appended. Returns the facets, or `null` when the card FAILED. `null` covers BOTH a double
 *  validation failure ({@link StructuredOutputError}) AND a retry infra error (a provider 429/timeout thrown by
 *  the retry summarize call): containing it here counts just this card `failed` and lets the pass complete and
 *  commit every valid card — one bad card can never abort the whole batch (HEAD's post-summarize resilience).
 *
 *  The two causes COLLAPSE into one `null` on purpose — a per-card cause would be per-card noise in a sweep's
 *  counts, and the caller's action is identical (re-run the pass). The one place the distinction WOULD have
 *  mattered is the on-demand single-card path, and that path doesn't read this at all: it sees `failed > 0`
 *  and throws the retryable {@link DistillFailedError}, whose copy covers both causes honestly. */
async function parseOneDistill(
  deps: DistillCharactersDeps,
  target: DistillTarget,
  batchText: string,
  pass: DistillPass,
): Promise<CharacterDistillation | null> {
  const run = (correction?: string): Promise<string> =>
    correction === undefined ? Promise.resolve(batchText) : retryDistillOne(deps, target, correction, pass);
  try {
    const p = await runStructuredTurn({ payloadSchema: DISTILL_PAYLOAD, run, onRetry: traceStructuredRetry("distill-card") });
    return { genre: p.genre, tone: p.tone, setting: p.setting, subGenres: p.subGenres, tags: p.tags, elevatorPitch: p.elevatorPitch, overview: p.overview };
  } catch {
    return null;
  }
}

/** Re-summarize ONE card with the zod issues appended — the structured-turn helper's bounded retry. Rides the
 *  SAME resolved sampling posture AND the same resolved `system` prose the batch call used, so a retry can't
 *  drift from the first pass. */
async function retryDistillOne(deps: DistillCharactersDeps, target: DistillTarget, correction: string, pass: DistillPass): Promise<string> {
  const res = await deps.summarize([{ systemPrompt: pass.system, userPrompt: `${target.text.slice(0, MAX_CARD_CHARS)}\n\n${correction}` }], pass.sampleOpts);
  return res.items[0]?.text ?? "";
}

/** Commit the summary upserts in bounded (chunked) `db.batch`es — N parses, one round-trip per chunk. */
async function commitSummaries(db: Db, stmts: readonly BatchItem<"sqlite">[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += DISTILL_BATCH_CHUNK) {
    const chunk = stmts.slice(i, i + DISTILL_BATCH_CHUNK);
    if (chunk.length === 0) {
      continue;
    }
    // @orb-gate-ignore no-await-db-in-loop: bounded per-chunk batch — deliberate backpressure over the libSQL bound-variable cap (mirrors every bulk-write in the slice).
    // biome-ignore lint/performance/noAwaitInLoops: bounded per-chunk batch — deliberate backpressure, not a fan-out.
    await db.batch(chunk as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }
}

/** Stage each distilled label as a `source:'auto', status:'pending'` suggestion through the injected tag seam;
 *  returns the count NEWLY attached (idempotent + no-downgrade — a re-run/accepted tag doesn't re-count). */
async function stageSuggestions(deps: DistillCharactersDeps, stagedLabels: readonly StagedLabel[], signal: AbortSignal | undefined): Promise<number> {
  let tagsStaged = 0;
  for (const label of stagedLabels) {
    signal?.throwIfAborted();
    // biome-ignore lint/performance/noAwaitInLoops: the tag attach is a metered resolve-or-create chokepoint (per-name unique race guard) — staged sequentially, not fanned out.
    const attached = await deps.attachCardTagByName({
      ownerId: label.ownerId,
      characterId: label.characterId,
      tagName: label.tag,
      source: "auto",
      status: "pending",
    });
    if (attached) {
      tagsStaged += 1;
    }
  }
  return tagsStaged;
}

/** Build the idempotent `character_summaries` upsert for one card (keyed by `characterId`, D28). `set` omits
 *  `characterId` (the PK) — a re-run refreshes the facets in place. */
function upsertSummary(db: Db, args: { characterId: CharacterId; parsed: CharacterDistillation; model: string; now: number }): BatchItem<"sqlite"> {
  const { characterId, parsed, model, now } = args;
  const set = {
    genre: parsed.genre,
    tone: parsed.tone,
    subGenres: parsed.subGenres,
    setting: parsed.setting,
    tags: parsed.tags,
    elevatorPitch: parsed.elevatorPitch,
    overview: parsed.overview,
    model,
    computedAt: now,
  };
  return db
    .insert(characterSummaries)
    .values({ characterId, ...set })
    .onConflictDoUpdate({ target: characterSummaries.characterId, set });
}
