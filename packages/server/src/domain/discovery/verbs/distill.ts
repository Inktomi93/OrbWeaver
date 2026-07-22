// domain/discovery/verbs/distill — the write-half producer. A guided-decode `summarize` pass turns each
// character's card into filterable `character_summaries` facets and stages the distilled labels as
// `source:'auto', status:'pending'` tag suggestions (the Accept/Reject review queue). Idempotent: upsert
// by `characterId`; tag staging never downgrades an already-accepted tag back to pending.

import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { runStructuredTurn } from "@orb/server/kit/structured-turn";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import type { DiscoveryContext } from "../context";
import type { DistillCharactersOptions } from "../contract/params";
import type { CharacterDistillation, DistillStats } from "../contract/results";
import type { DiscoveryService, DistillCharactersDeps } from "../contract/service";
import { readCardDistillTargets } from "../persistence/card-reads";

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

const DISTILL_SYSTEM = `You distill a roleplay character card into a compact, FILTERABLE summary so a large library can be browsed at a glance.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"genre":"...","subGenres":["..."],"tone":"...","setting":"...","tags":["..."],"elevatorPitch":"...","overview":"..."}

- genre: the single best-fit primary genre (you will be constrained to a fixed list).
- subGenres: 0-3 secondary genres/modes.
- tone: the dominant tone (constrained to a fixed list).
- setting: a short phrase for the world/place ("modern urban fantasy", "feudal Japan").
- tags: 3-8 concrete, distinctive theme/content tags someone would filter by (not generic words).
- elevatorPitch: ONE sentence, broad strokes — who this character is and the hook.
- overview: 2-3 sentences — the character's premise, dynamic, and what RP with them is like. Concrete, no fluff.`;

const MAX_CARD_CHARS = 6000;
const DISTILL_MAX_TOKENS = 512;
const DISTILL_TEMPERATURE = 0.2;
// Stays under the libSQL bound-variable cap (each upsert binds ~2x the column count).
const DISTILL_BATCH_CHUNK = 500;
// Caps the per-card RETRY fan-out. Validation failure is CORRELATED, not independent: a hosted summarize
// model that ignores the json_schema constraint fails EVERY card in the batch identically, so a naive
// `Promise.all` over the whole (500+) library would fire N parallel retry calls at once — the exact per-key
// 429 storm the OpenRouter backend serializes to avoid. Parsing in bounded waves holds concurrent retries to
// this many. The happy path pays nothing: a card whose batch reply parses first-try makes no extra call.
const DISTILL_RETRY_CONCURRENCY = 8;

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
  signal?.throwIfAborted();
  const targets = await readCardDistillTargets(db, {
    ...(opts.characterId !== undefined ? { characterId: opts.characterId } : {}),
    ...(opts.ownerId !== undefined ? { ownerId: opts.ownerId } : {}),
  });
  const ready = targets.filter((t) => t.text.trim().length > 0);
  if (ready.length === 0) {
    return { scanned: targets.length, distilled: 0, failed: 0, tagsStaged: 0 };
  }

  signal?.throwIfAborted();
  // One batched call fills the role's parallel-slot pipeline; `ready[i]` pairs 1:1 with `result.items[i]`.
  const result = await deps.summarize(
    ready.map((t) => ({
      systemPrompt: DISTILL_SYSTEM,
      userPrompt: t.text.slice(0, MAX_CARD_CHARS),
    })),
    {
      responseFormat: DISTILL_RESPONSE_FORMAT,
      maxTokens: DISTILL_MAX_TOKENS,
      temperature: DISTILL_TEMPERATURE,
    },
  );

  const writes = await buildDistillWrites(deps, ready, result.items, {
    db,
    model: deps.summarizerModel,
    now: deps.now(),
  });
  signal?.throwIfAborted();
  await commitSummaries(db, writes.stmts);
  // Stage AFTER summaries commit — a failed tag attach must not roll back the facets.
  const tagsStaged = await stageSuggestions(deps, writes.stagedLabels, signal);

  return {
    scanned: targets.length,
    distilled: writes.stmts.length,
    failed: writes.failed,
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
  meta: { readonly db: Db; readonly model: string; readonly now: number },
): Promise<{ stmts: BatchItem<"sqlite">[]; stagedLabels: StagedLabel[]; failed: number }> {
  // Parse in bounded waves — the first attempt reuses the already-fetched batch text (free), but a correlated
  // schema failure sends every card to a retry summarize call at once; the wave size is that fan-out's bound.
  const parsed: (CharacterDistillation | null)[] = [];
  for (let i = 0; i < ready.length; i += DISTILL_RETRY_CONCURRENCY) {
    const wave = ready.slice(i, i + DISTILL_RETRY_CONCURRENCY);
    // biome-ignore lint/performance/noAwaitInLoops: bounded-concurrency waves — each wave's per-card retries run in parallel, then the loop advances; that IS the concurrency bound.
    const waveParsed = await Promise.all(wave.map((target, j) => parseOneDistill(deps, target, items[i + j]?.text ?? "")));
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
 *  commit every valid card — one bad card can never abort the whole batch (HEAD's post-summarize resilience). */
async function parseOneDistill(deps: DistillCharactersDeps, target: DistillTarget, batchText: string): Promise<CharacterDistillation | null> {
  const run = (correction?: string): Promise<string> => (correction === undefined ? Promise.resolve(batchText) : retryDistillOne(deps, target, correction));
  try {
    const p = await runStructuredTurn({ payloadSchema: DISTILL_PAYLOAD, run });
    return { genre: p.genre, tone: p.tone, setting: p.setting, subGenres: p.subGenres, tags: p.tags, elevatorPitch: p.elevatorPitch, overview: p.overview };
  } catch {
    return null;
  }
}

/** Re-summarize ONE card with the zod issues appended — the structured-turn helper's bounded retry. */
async function retryDistillOne(deps: DistillCharactersDeps, target: DistillTarget, correction: string): Promise<string> {
  const res = await deps.summarize([{ systemPrompt: DISTILL_SYSTEM, userPrompt: `${target.text.slice(0, MAX_CARD_CHARS)}\n\n${correction}` }], {
    responseFormat: DISTILL_RESPONSE_FORMAT,
    maxTokens: DISTILL_MAX_TOKENS,
    temperature: DISTILL_TEMPERATURE,
  });
  return res.items[0]?.text ?? "";
}

/** Commit the summary upserts in bounded (chunked) `db.batch`es — N parses, one round-trip per chunk. */
async function commitSummaries(db: Db, stmts: readonly BatchItem<"sqlite">[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += DISTILL_BATCH_CHUNK) {
    const chunk = stmts.slice(i, i + DISTILL_BATCH_CHUNK);
    if (chunk.length === 0) {
      continue;
    }
    // @orb-gate-ignore no-await-db-in-loop bounded per-chunk batch — deliberate backpressure over the libSQL bound-variable cap (mirrors every bulk-write in the slice).
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
    // @orb-gate-ignore no-await-db-in-loop the tag attach is a metered resolve-or-create chokepoint (per-name unique race guard) — staged sequentially, not fanned out.
    // biome-ignore lint/performance/noAwaitInLoops: the tag attach is a metered resolve-or-create chokepoint — staged sequentially, not fanned out.
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
