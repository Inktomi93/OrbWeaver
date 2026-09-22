// domain/discovery/verbs/analyze — the SEMANTIC-understanding half over the distilled library:
//   • compareCharactersDeep — the `catalog.compareCharacters` facet diff (owner-belted, no doubling) DECORATED
//     with a grounded LLM narrative over that same diff (guided-decode summarize).
//   • askCard — answer a free-text question about ONE owned/distilled character from its recent PLAYED scenes
//     (the SEMANTIC messages projection: message_variants.content only, NEVER an economics column).
// Both owner-belt via `characters.ownerId` (a foreign/undistilled character short-circuits to null before any
// summarize call). Analytics ≠ retrieval — this file calls no search verb.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { ResponseFormat, StructuredOptions } from "@orb/contracts/role-clients";
import { runStructuredTurn, StructuredOutputError } from "@orb/inference";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { z } from "zod";
import type { DiscoveryContext } from "../context.ts";
import type { AskCardAnswer, CharacterComparison, CharacterComparisonDeep, ComparisonNarrative } from "../contract/results.ts";
import type { AnalyzeDeps, DiscoveryService } from "../contract/service.ts";
import { readCharacterMessageSamples } from "../persistence/message-reads.ts";
import { readOwnedCardFacet } from "../persistence/summary-reads.ts";
import { traceStructuredRetry } from "../substrate/structured-retry-trace.ts";

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
  const rc = await ctx.roleClientsFor(args.userId);
  const sampleOpts: StructuredOptions = {
    responseFormat: NARRATIVE_RESPONSE_FORMAT,
    ...resolveSideGenSampling(SIDE_GEN_POSTURES.analyze, await ctx.resolveUserPresetParams(args.userId)),
  };
  // The system prompt is a PROSE-1 slot resolved on the SAME caller rung as the sampling above — the library
  // being compared is this user's own. No override ⇒ the shipped prompt, byte for byte.
  const system = resolveProseText("discovery.compare.system", await ctx.resolveUserProse(args.userId));
  // NO RETRY DRIFT: `prompt`/`system`/`sampleOpts` are all resolved ABOVE and merely CLOSED OVER, so
  // `runStructuredTurn`'s bounded second attempt sends the same pass the first did — only the appended
  // `correction` differs. Resolving any of them INSIDE this closure would re-read the settings/preset rung
  // mid-turn and let the retry drift (the `DistillPass` bundle, 49616a67, is the same invariant where the
  // retry is a separate function).
  const run = async (correction?: string): Promise<string> => {
    const result = await rc.structured([{ systemPrompt: system, userPrompt: correction === undefined ? prompt : `${prompt}\n\n${correction}` }], sampleOpts);
    return result.items[0]?.text ?? "";
  };
  let narrative: ComparisonNarrative;
  // @orb-waive caught-failure-ownership(err): narrow rethrow — only a validation failure
  // (`StructuredOutputError`) degrades to `narrative.degraded: true` (surfaced to the caller as data); any
  // engine/infra error rethrows below unhandled. Ends if a new caller needs a validation failure to propagate.
  try {
    const p = await runStructuredTurn({ payloadSchema: NARRATIVE_PAYLOAD, run, onRetry: traceStructuredRetry("compare-narrative") });
    narrative = { summary: p.summary.trim(), overlap: p.overlap.trim(), distinction: p.distinction.trim(), degraded: false };
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) {
      throw err; // an engine/infra error propagates; only a validation failure degrades (the diff is truth)
    }
    // The degrade travels as DATA (`degraded`) — the raw reply is still worth showing, but a renderer has to
    // be able to tell it apart from a narrative the model actually produced.
    narrative = { summary: err.raw.trim(), overlap: "", distinction: "", degraded: true };
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
  const rc = await ctx.roleClientsFor(userId);
  const sampleOpts: StructuredOptions = {
    responseFormat: ANSWER_RESPONSE_FORMAT,
    ...resolveSideGenSampling(SIDE_GEN_POSTURES.analyze, await ctx.resolveUserPresetParams(userId)),
  };
  const system = resolveProseText("discovery.ask.system", await ctx.resolveUserProse(userId));
  // NO RETRY DRIFT — the compare-narrative invariant above, same shape: everything the retry sends is
  // resolved once, outside this closure.
  const run = async (correction?: string): Promise<string> => {
    const result = await rc.structured([{ systemPrompt: system, userPrompt: correction === undefined ? prompt : `${prompt}\n\n${correction}` }], sampleOpts);
    return result.items[0]?.text ?? "";
  };
  let answer: string;
  let grounded: boolean;
  let degraded: boolean;
  // @orb-waive caught-failure-ownership(err): narrow rethrow — only a validation failure
  // (`StructuredOutputError`) degrades to `degraded: true` (surfaced to the caller as data); any engine/infra
  // error rethrows below unhandled. Ends if a new caller needs a validation failure to propagate.
  try {
    const p = await runStructuredTurn({ payloadSchema: ANSWER_PAYLOAD, run, onRetry: traceStructuredRetry("ask-card") });
    answer = p.answer.trim();
    grounded = p.grounded;
    degraded = false;
  } catch (err) {
    if (!(err instanceof StructuredOutputError)) {
      throw err; // an engine/infra error propagates; a validation failure degrades to raw text
    }
    answer = err.raw.trim();
    // `grounded` is the MODEL'S claim and a failed parse produced none, so it holds its safe floor — the
    // separate `degraded` flag is what says WHY, so the caller never renders our parse failure as the model
    // calling its own answer speculative.
    grounded = false;
    degraded = true;
  }
  return { characterId, question, answer, grounded, degraded, sampledMessages: samples.length };
}

function buildAskPrompt(name: string, question: string, samples: readonly { content: string }[]): string {
  const scenes = samples.length === 0 ? "(no played scenes)" : samples.map((s, i) => `Scene ${i + 1}:\n${s.content.slice(0, SCENE_MAX_CHARS)}`).join("\n\n");
  return `Character: ${name}\n\nQuestion: ${question}\n\nRecent scenes:\n${scenes}`;
}
