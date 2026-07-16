// domain/discovery/verbs/analyze — the SEMANTIC-understanding half over the distilled library:
//   • compareCharactersDeep — the `catalog.compareCharacters` facet diff (owner-belted, no doubling) DECORATED
//     with a grounded LLM narrative over that same diff (guided-decode summarize).
//   • askCard — answer a free-text question about ONE owned/distilled character from its recent PLAYED scenes
//     (the SEMANTIC messages projection: message_variants.content only, NEVER an economics column).
// Both owner-belt via `characters.ownerId` (a foreign/undistilled character short-circuits to null before any
// summarize call). Analytics ≠ retrieval — this file calls no search verb.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context";
import type { AskCardAnswer, CharacterComparison, CharacterComparisonDeep, ComparisonNarrative } from "../contract/results";
import type { AnalyzeDeps, DiscoveryService } from "../contract/service";
import { readCharacterMessageSamples } from "../persistence/message-reads";
import { readOwnedCardFacet } from "../persistence/summary-reads";
import { sliceJsonObject } from "../substrate/json-extract";

// The recent-scene grounding window for askCard — enough context to answer without dragging a whole history.
const ASK_SAMPLE_LIMIT = 12;
const NARRATIVE_MAX_TOKENS = 400;
const ANSWER_MAX_TOKENS = 400;
const ANALYZE_TEMPERATURE = 0.3;
// Trim each grounding scene so a batch of them stays inside the summarizer window (defensive, not a truncation
// contract — the messages projection has no length guarantee).
const SCENE_MAX_CHARS = 1200;

export function createAnalyze(ctx: DiscoveryContext, deps: AnalyzeDeps): Pick<DiscoveryService, "compareCharactersDeep" | "askCard"> {
  return {
    compareCharactersDeep: (userId, idA, idB) => compareCharactersDeep(ctx, deps, { userId, idA, idB }),
    askCard: (userId, characterId, question) => askCard(ctx, userId, characterId, question),
  };
}

const COMPARE_SYSTEM = `You compare two roleplay characters for a user browsing their own library. You are given a precomputed facet diff (genres, tones, shared vs distinct tags). Ground your read in ONLY that diff — do not invent traits.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"summary":"...","overlap":"...","distinction":"..."}

- summary: ONE sentence — how alike these two are overall.
- overlap: what they genuinely share (from the shared genre/tone/tags).
- distinction: what sets them apart (from the distinct tags + differing genre/tone).`;

const NARRATIVE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    overlap: { type: "string" },
    distinction: { type: "string" },
  },
  required: ["summary", "overlap", "distinction"],
} as const;

/** null when the ids are equal or either card isn't owned/distilled (delegates the belt + diff to
 *  {@link compareCharacters}). Otherwise decorates the diff with a grounded LLM narrative. */
async function compareCharactersDeep(
  ctx: DiscoveryContext,
  deps: AnalyzeDeps,
  args: { userId: UserId; idA: CharacterId; idB: CharacterId },
): Promise<CharacterComparisonDeep | null> {
  const base = await deps.compareCharacters(args.userId, args.idA, args.idB);
  if (base === null) {
    return null;
  }
  const result = await ctx.summarize([{ systemPrompt: COMPARE_SYSTEM, userPrompt: buildComparePrompt(base) }], {
    jsonSchema: NARRATIVE_SCHEMA,
    maxTokens: NARRATIVE_MAX_TOKENS,
    temperature: ANALYZE_TEMPERATURE,
  });
  return { ...base, narrative: parseNarrative(result.items[0]?.text) };
}

function buildComparePrompt(cmp: CharacterComparison): string {
  const line = (c: CharacterComparison["a"]): string =>
    `${c.name} — genre: ${c.genre ?? "?"}, tone: ${c.tone ?? "?"}${c.pitch !== null && c.pitch !== "" ? `, pitch: ${c.pitch}` : ""}`;
  return [
    `A: ${line(cmp.a)}`,
    `B: ${line(cmp.b)}`,
    `Same genre: ${cmp.sameGenre}. Same tone: ${cmp.sameTone}.`,
    `Shared tags: ${cmp.sharedTags.join(", ") || "(none)"}`,
    `Only A: ${cmp.onlyA.join(", ") || "(none)"}`,
    `Only B: ${cmp.onlyB.join(", ") || "(none)"}`,
  ].join("\n");
}

/** Tolerant parse of the narrative reply — a non-JSON reply falls back to the raw text as `summary` (never a
 *  throw; the diff is still the source of truth). */
function parseNarrative(raw: string | undefined): ComparisonNarrative {
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const obj = raw === undefined ? null : sliceJsonObject(raw);
  if (obj === null) {
    return { summary: str(raw), overlap: "", distinction: "" };
  }
  return {
    summary: str(obj["summary"]),
    overlap: str(obj["overlap"]),
    distinction: str(obj["distinction"]),
  };
}

const ASK_SYSTEM = `You answer a user's question about ONE of their roleplay characters, using ONLY the recent scenes provided. Do not invent facts not present in the scenes.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"answer":"...","grounded":true}

- answer: a direct answer to the question, drawn from the scenes.
- grounded: true if the scenes actually support the answer; false if they don't and you had to guess or the scenes were empty.`;

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, grounded: { type: "boolean" } },
  required: ["answer", "grounded"],
} as const;

/** null when the character isn't owned/distilled. Otherwise answers from the recent PLAYED scenes. */
async function askCard(ctx: DiscoveryContext, userId: UserId, characterId: CharacterId, question: string): Promise<AskCardAnswer | null> {
  const card = await readOwnedCardFacet(ctx.db, userId, characterId);
  if (card === undefined) {
    return null;
  }
  const samples = await readCharacterMessageSamples(ctx.db, userId, characterId, ASK_SAMPLE_LIMIT);
  const result = await ctx.summarize([{ systemPrompt: ASK_SYSTEM, userPrompt: buildAskPrompt(card.name, question, samples) }], {
    jsonSchema: ANSWER_SCHEMA,
    maxTokens: ANSWER_MAX_TOKENS,
    temperature: ANALYZE_TEMPERATURE,
  });
  const parsed = parseAnswer(result.items[0]?.text);
  return {
    characterId,
    question,
    answer: parsed.answer,
    grounded: parsed.grounded,
    sampledMessages: samples.length,
  };
}

function buildAskPrompt(name: string, question: string, samples: readonly { content: string }[]): string {
  const scenes = samples.length === 0 ? "(no played scenes)" : samples.map((s, i) => `Scene ${i + 1}:\n${s.content.slice(0, SCENE_MAX_CHARS)}`).join("\n\n");
  return `Character: ${name}\n\nQuestion: ${question}\n\nRecent scenes:\n${scenes}`;
}

/** Tolerant parse — a non-JSON reply falls back to raw text as `answer`, `grounded=false`. */
function parseAnswer(raw: string | undefined): { answer: string; grounded: boolean } {
  const obj = raw === undefined ? null : sliceJsonObject(raw);
  if (obj === null) {
    return { answer: typeof raw === "string" ? raw.trim() : "", grounded: false };
  }
  return {
    answer: typeof obj["answer"] === "string" ? (obj["answer"] as string).trim() : "",
    grounded: obj["grounded"] === true,
  };
}
