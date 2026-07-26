// domain/discovery/verbs/analyze — the SEMANTIC-understanding half over the distilled library:
//   • compareCharactersDeep — the `catalog.compareCharacters` facet diff (owner-belted, no doubling) DECORATED
//     with a grounded LLM narrative over that same diff (guided-decode summarize).
//   • askCard — answer a free-text question about ONE owned/distilled character from its recent PLAYED scenes
//     (the SEMANTIC messages projection: message_variants.content only, NEVER an economics column).
// Both owner-belt via `characters.ownerId` (a foreign/undistilled character short-circuits to null before any
// summarize call). Analytics ≠ retrieval — this file calls no search verb.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { ResponseFormat, SummarizeOptions } from "@orb/contracts/role-clients";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import { z } from "zod";
import type { DiscoveryContext } from "../context";
import type { AskCardAnswer, CharacterComparison, CharacterComparisonDeep, ComparisonNarrative } from "../contract/results";
import type { AnalyzeDeps, DiscoveryService } from "../contract/service";
import { readCharacterMessageSamples } from "../persistence/message-reads";
import { readOwnedCardFacet } from "../persistence/summary-reads";

// The recent-scene grounding window for askCard — enough context to answer without dragging a whole history.
const ASK_SAMPLE_LIMIT = 12;
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

// The structured-output payload (D79) — the zod schema is BOTH the wire constraint (via the one projection
// rule) and the runtime validator inside runStructuredTurn.
const NARRATIVE_PAYLOAD = z.object({ summary: z.string(), overlap: z.string(), distinction: z.string() });
const NARRATIVE_RESPONSE_FORMAT: ResponseFormat = { name: "comparison_narrative", schema: projectJsonSchema(NARRATIVE_PAYLOAD) };

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
  const prompt = buildComparePrompt(base);
  // The side-gen sampling ladder: the `analyze` floor (temp 0.3, 400 out — a short grounded answer) ← the
  // caller's default-preset params. The structured-output `responseFormat` is orthogonal and always rides.
  const sampleOpts: SummarizeOptions = {
    responseFormat: NARRATIVE_RESPONSE_FORMAT,
    ...toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES.analyze, await ctx.resolveUserPresetParams(args.userId))),
  };
  const run = async (correction?: string): Promise<string> => {
    const result = await ctx.summarize(
      [{ systemPrompt: COMPARE_SYSTEM, userPrompt: correction === undefined ? prompt : `${prompt}\n\n${correction}` }],
      sampleOpts,
    );
    return result.items[0]?.text ?? "";
  };
  let narrative: ComparisonNarrative;
  try {
    const p = await runStructuredTurn({ payloadSchema: NARRATIVE_PAYLOAD, run });
    narrative = { summary: p.summary.trim(), overlap: p.overlap.trim(), distinction: p.distinction.trim() };
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) {
      throw err; // an engine/infra error propagates; only a validation failure degrades (the diff is truth)
    }
    narrative = { summary: err.raw.trim(), overlap: "", distinction: "" };
  }
  return { ...base, narrative };
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

const ASK_SYSTEM = `You answer a user's question about ONE of their roleplay characters, using ONLY the recent scenes provided. Do not invent facts not present in the scenes.

Respond with ONLY a JSON object of this exact shape (no prose, no markdown, no <think>):
{"answer":"...","grounded":true}

- answer: a direct answer to the question, drawn from the scenes.
- grounded: true if the scenes actually support the answer; false if they don't and you had to guess or the scenes were empty.`;

const ANSWER_PAYLOAD = z.object({ answer: z.string(), grounded: z.boolean() });
const ANSWER_RESPONSE_FORMAT: ResponseFormat = { name: "card_answer", schema: projectJsonSchema(ANSWER_PAYLOAD) };

/** null when the character isn't owned/distilled. Otherwise answers from the recent PLAYED scenes. */
async function askCard(ctx: DiscoveryContext, userId: UserId, characterId: CharacterId, question: string): Promise<AskCardAnswer | null> {
  const card = await readOwnedCardFacet(ctx.db, userId, characterId);
  if (card === undefined) {
    return null;
  }
  const samples = await readCharacterMessageSamples(ctx.db, userId, characterId, ASK_SAMPLE_LIMIT);
  const prompt = buildAskPrompt(card.name, question, samples);
  // The side-gen sampling ladder: the `analyze` floor ← the caller's default-preset params (the `askCard`
  // half of the analyze pair — identical posture to the compare narrative). `responseFormat` always rides.
  const sampleOpts: SummarizeOptions = {
    responseFormat: ANSWER_RESPONSE_FORMAT,
    ...toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES.analyze, await ctx.resolveUserPresetParams(userId))),
  };
  const run = async (correction?: string): Promise<string> => {
    const result = await ctx.summarize(
      [{ systemPrompt: ASK_SYSTEM, userPrompt: correction === undefined ? prompt : `${prompt}\n\n${correction}` }],
      sampleOpts,
    );
    return result.items[0]?.text ?? "";
  };
  let answer: string;
  let grounded: boolean;
  try {
    const p = await runStructuredTurn({ payloadSchema: ANSWER_PAYLOAD, run });
    answer = p.answer.trim();
    grounded = p.grounded;
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) {
      throw err; // an engine/infra error propagates; a validation failure degrades to ungrounded raw text
    }
    answer = err.raw.trim();
    grounded = false;
  }
  return { characterId, question, answer, grounded, sampledMessages: samples.length };
}

function buildAskPrompt(name: string, question: string, samples: readonly { content: string }[]): string {
  const scenes = samples.length === 0 ? "(no played scenes)" : samples.map((s, i) => `Scene ${i + 1}:\n${s.content.slice(0, SCENE_MAX_CHARS)}`).join("\n\n");
  return `Character: ${name}\n\nQuestion: ${question}\n\nRecent scenes:\n${scenes}`;
}
