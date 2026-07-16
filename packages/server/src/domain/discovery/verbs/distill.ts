// domain/discovery/verbs/distill — the write-half producer. A guided-decode `summarize` pass turns each
// character's card into filterable `character_summaries` facets and stages the distilled labels as
// `source:'auto', status:'pending'` tag suggestions (the Accept/Reject review queue). Idempotent: upsert
// by `characterId`; tag staging never downgrades an already-accepted tag back to pending.

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { BatchItem } from "drizzle-orm/batch";
import type { DiscoveryContext } from "../context";
import type { DistillCharactersOptions } from "../contract/params";
import type { CharacterDistillation, DistillStats } from "../contract/results";
import type { DiscoveryService, DistillCharactersDeps } from "../contract/service";
import { readCardDistillTargets } from "../persistence/card-reads";
import { sliceJsonObject } from "../substrate/json-extract";

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

/** @internal — JSON-schema grammar driver for the distill pass. */
const CHARACTER_DISTILL_SCHEMA = {
  type: "object",
  properties: {
    genre: { enum: [...GENRES] },
    subGenres: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 3 },
    tone: { enum: [...TONES] },
    setting: { type: "string" },
    tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
    elevatorPitch: { type: "string" },
    overview: { type: "string" },
  },
  required: ["genre", "subGenres", "tone", "setting", "tags", "elevatorPitch", "overview"],
} as const;

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
      jsonSchema: CHARACTER_DISTILL_SCHEMA,
      maxTokens: DISTILL_MAX_TOKENS,
      temperature: DISTILL_TEMPERATURE,
    },
  );

  const writes = buildDistillWrites(db, ready, result.items, {
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

/** Parse every reply, pairing `ready[i]`↔`items[i]`, into upsert statements + the flattened staged-label queue;
 *  a non-parsing reply counts `failed`. Split out to keep {@link distillCharacters} under the complexity cap. */
function buildDistillWrites(
  db: Db,
  ready: readonly {
    readonly characterId: CharacterId;
    readonly ownerId: UserId;
    readonly text: string;
  }[],
  items: readonly { readonly text: string }[],
  meta: { readonly model: string; readonly now: number },
): { stmts: BatchItem<"sqlite">[]; stagedLabels: StagedLabel[]; failed: number } {
  const stmts: BatchItem<"sqlite">[] = [];
  const stagedLabels: StagedLabel[] = [];
  let failed = 0;
  for (let i = 0; i < ready.length; i += 1) {
    const target = ready[i];
    const item = items[i];
    if (target === undefined || item === undefined) {
      continue;
    }
    const parsed = parseDistill(item.text);
    if (parsed === null) {
      failed += 1;
      continue;
    }
    stmts.push(
      upsertSummary(db, {
        characterId: target.characterId,
        parsed,
        model: meta.model,
        now: meta.now,
      }),
    );
    for (const tag of parsed.tags) {
      stagedLabels.push({ ownerId: target.ownerId, characterId: target.characterId, tag });
    }
  }
  return { stmts, stagedLabels, failed };
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

/** @internal — parse ONE distillation reply into facets (tolerant JSON slice), or `null` (a null result =
 *  the pass counts the character `failed`). Consumed by {@link distillCharacters} + the co-located test. */
function parseDistill(raw: string): CharacterDistillation | null {
  const obj = sliceJsonObject(raw);
  if (obj === null) {
    return null;
  }
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
  return {
    genre: str(obj["genre"]),
    tone: str(obj["tone"]),
    setting: str(obj["setting"]),
    subGenres: arr(obj["subGenres"]),
    tags: arr(obj["tags"]),
    elevatorPitch: str(obj["elevatorPitch"]),
    overview: str(obj["overview"]),
  };
}
