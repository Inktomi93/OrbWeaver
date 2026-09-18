// domain/embeddings/indexer/caption — the ONE avatar-analysis call for the image-captioned lens. Shared by
// `onAssetCreated` and the bulk asset pass so the prompt/grammar/behaviour never drifts between the on-write
// and catch-up paths. Homed in indexer/ (it calls the injected summarize role op), not substrate/.
//
// IT RETURNS A SENTENCE **AND** A STRUCTURED BREAKDOWN, from ONE look at one image (issue #164). Before
// 2026-08-18 this asked for prose only and the caller stored `caption_meta: { model }` — so the fourteen
// facet paths `domain/discovery/image-analytics` reads had no producer at all, every facet distribution came
// back empty on a 101-image corpus, and `visualArchetypes` fell through to labelling PORTRAIT clusters with
// CARD-TEXT genre/tone (three of eight families rendered the identical "wholesome slice-of-life"). Splitting
// the breakdown into a second call would double the GPU cost of every avatar on a whole-corpus backfill, and
// the two answers are one perception of one image; they ride together.
//
// THE FACETS ARE GRAMMAR-ENFORCED, NEVER PROMPT-PARSED. `imageBreakdownSchema` → `projectJsonSchema` →
// `responseFormat` is the D79 structured-output path (vLLM compiles it to guided decoding), so the closed
// vocabularies in `@orb/contracts/embeddings` are a CONSTRAINT on the decode rather than a request the model
// may ignore. A "reply in JSON please" prompt that gets regex-scraped is exactly how a facet column ends up
// full of one-off strings that no histogram or drill can use.
//
// FAILURE IS THE EXISTING SKIP, NOT A HALF ROW. `runStructuredTurn` already spends one bounded retry with the
// zod issues appended; if that also fails we return an EMPTY caption, which the store verb treats as
// skip-don't-write (else the bytes-hashed row would be poisoned permanently) and the next sweep retries the
// asset. We never write a caption without its facets: a captioned-but-facetless row is precisely the state
// the backfill pre-check in `verbs/embed-assets` uses to find work, so inventing more of them would make the
// catch-up pass unable to see its own backlog.

import { imageBreakdownSchema } from "@orb/contracts/embeddings";
import type { ResponseFormat, RoleClients } from "@orb/contracts/role-clients";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn } from "@orb/server/kit/structured-turn";
import { getLog } from "#foundation/observability";
import type { AvatarAnalysis } from "../contract/results.ts";

const ANALYSIS_SYSTEM_PROMPT = [
  "You are an image analyst for a roleplay character library. Look at the image and return ONE JSON object.",
  "`caption` is a single concise sentence describing the visible subject, style and notable details — no preamble.",
  "Every other field is a classification: choose the closest allowed value, never invent one.",
  "Judge only what is VISIBLE. Do not infer story, personality or narrative genre from the picture.",
  "For a frame with no figure in it (an object, a scene, a logo, a placeholder) use the not-applicable / none values rather than guessing a body.",
  "`tags` are 3-8 short subject keywords (what is depicted), lowercase.",
].join(" ");

const ANALYSIS_USER_PROMPT = "Describe and classify this image.";

const ANALYSIS_RESPONSE_FORMAT: ResponseFormat = { name: "image_breakdown", schema: projectJsonSchema(imageBreakdownSchema) };

/** The side-gen posture FLOOR for avatar analysis (#1816): near-deterministic because this is a
 *  classification, and a warm sampler on a closed vocabulary only adds jitter between two equally-allowed
 *  labels. `maxOutputTokens` fits the sentence plus sixteen short fields. The floor defers to the owner's
 *  preset params through `resolveSideGenSampling` when available. */
const ANALYSIS_FLOOR: SideGenSampling = { temperature: 0.2, maxOutputTokens: 512 };

const skipped = (model: string): AvatarAnalysis => ({ caption: "", captionMeta: { model } });

/**
 * Analyse ONE avatar through the vision-capable summarize role: a caption plus the grammar-enforced facet
 * breakdown, in one call. Returns the skip shape (empty caption, facetless meta) when the structured turn
 * fails both attempts — the store verb then writes nothing and the next sweep tries the asset again.
 *
 * `presetParams` is the owner's default-preset sampling params (the top rung of the side-gen posture
 * ladder). Pass `undefined` when no preset context is available — the floor stands alone.
 */
export async function analyzeAvatarImage(roleClients: RoleClients, bytes: Uint8Array, presetParams?: SideGenSampling | undefined): Promise<AvatarAnalysis> {
  const model = roleClients.summarizerModel;
  const posture = toSummarizeOptions(resolveSideGenSampling(ANALYSIS_FLOOR, presetParams));
  const run = async (correction?: string): Promise<string> => {
    const userPrompt = correction === undefined ? ANALYSIS_USER_PROMPT : `${ANALYSIS_USER_PROMPT}\n\n${correction}`;
    const result = await roleClients.summarize([{ systemPrompt: ANALYSIS_SYSTEM_PROMPT, userPrompt, images: [bytes] }], {
      responseFormat: ANALYSIS_RESPONSE_FORMAT,
      ...posture,
    });
    return result.items[0]?.text ?? "";
  };
  try {
    const { caption, ...facets } = await runStructuredTurn({ payloadSchema: imageBreakdownSchema, run });
    // A validated-but-blank caption is still the skip signal, and shipping its facets without it would leave
    // a row the backfill pre-check reads as complete while the captioned lens has no text to embed.
    if (caption.trim().length === 0) {
      getLog().warn({ model }, "embeddings indexer: avatar analysis returned an empty caption — asset skipped, will retry next sweep");
      return skipped(model);
    }
    return { caption, captionMeta: { model, ...facets } };
  } catch (error) {
    // THE SKIP HAS TO BE AUDIBLE. A backend that cannot serve this schema at all (no guided decoding on the
    // summarize role, a family that drops `responseFormat`) fails EVERY asset identically, and the sweep's
    // own counts cannot say so — the raw lens still lands, so a whole-corpus analysis failure reports as a
    // tidy "0 embedded, N skipped". This line is the difference between a diagnosable outage and a silent one.
    getLog().warn({ model, err: error }, "embeddings indexer: avatar analysis failed schema validation twice — asset skipped, will retry next sweep");
    return skipped(model);
  }
}
