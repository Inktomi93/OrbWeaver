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
//
// "RETRY NEXT SWEEP" IS FOR A FAILURE ABOUT THIS IMAGE — NEVER FOR ONE ABOUT THE MODEL (#2422). Two verdicts
// are the same for every asset in the corpus, so they are decided BEFORE the call and remembered for the
// process (`substrate/avatar-analysis-availability`):
//   - the resolved summarize model declares no image input (`roleClients.summarizerVision`) — nobody may hand
//     it a picture, so the analysis is skipped without spending a call;
//   - the backend answered `model_unavailable` (a vLLM 404 "The model `...` does not exist", the classified
//     `ProviderError.kind`) — the model this process resolves is not the one the engine serves.
// Before this, either state cost ONE provider call per asset per sweep, forever - and the first of those calls
// WAKES a sleeping local engine, so a boot bought a GPU wake plus N 404s for zero rows. The vision fact alone
// cannot prevent that wake on our own engine: D143(c) makes the vllm capability descriptor err PERMISSIVE
// (`input.vision` is advertised unconditionally, because per-checkpoint modality is undetectable on that
// wire), so the local arm is caught by the backend's own refusal instead - once.

import { imageBreakdownSchema } from "@orb/contracts/embeddings";
import { acceptsImageInput } from "@orb/contracts/inference";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { ResponseFormat, RoleClients } from "@orb/contracts/role-clients";
import { ProviderError } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn } from "@orb/server/kit/structured-turn";
import { getLog } from "#foundation/observability";
import type { AvatarAnalysis } from "../contract/results.ts";
import { announceAvatarAnalysisSkip, avatarAnalysisUnservable, markAvatarAnalysisUnservable } from "../substrate/avatar-analysis-availability.ts";

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
 *  labels. The floor defers to the owner's preset params through `resolveSideGenSampling` when available. */
const ANALYSIS_FLOOR: SideGenSampling = SIDE_GEN_POSTURES.caption;

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
  // The CAPTION lens is a `structured` call WITH an image input (inference program §7.5-1): it names its task
  // and reads the vision requirement off the resolved capability — `accepts(cap, "input", "image")`.
  const resolved = await roleClients.resolved("structured");
  if (resolved === null) {
    return skipped("(no-connection)");
  }
  const model = resolved.model;
  if (avatarAnalysisUnservable(model)) {
    // Already answered by the backend this process. Silent: the loud line was logged when it latched.
    return skipped(model);
  }
  if (resolved.capability.kind !== "generation" || !acceptsImageInput(resolved.capability.generation)) {
    if (announceAvatarAnalysisSkip(model)) {
      getLog().warn(
        { model },
        "embeddings indexer: the resolved summarize model declares no image input - avatar analysis skipped for this model (no provider call made)",
      );
    }
    return skipped(model);
  }
  const posture = toSummarizeOptions(resolveSideGenSampling(ANALYSIS_FLOOR, presetParams));
  const run = async (correction?: string): Promise<string> => {
    const userPrompt = correction === undefined ? ANALYSIS_USER_PROMPT : `${ANALYSIS_USER_PROMPT}\n\n${correction}`;
    const result = await roleClients.structured([{ systemPrompt: ANALYSIS_SYSTEM_PROMPT, userPrompt, images: [bytes] }], {
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
    // THE MODEL ITSELF IS NOT THERE - a verdict about the MODEL, identical for every asset, so it latches for
    // the process and no later asset spends a call (or a wake) to rediscover it (#2422). The latch is the
    // short-circuit at the top of this function; reaching this arm a second time means a CONCURRENT asset was
    // already in flight when the first one latched, which is a bounded handful, never the whole sweep.
    const unservable = error instanceof ProviderError && error.kind === "model_unavailable";
    const latched = unservable && markAvatarAnalysisUnservable(model);
    // THE SKIP HAS TO BE AUDIBLE, AND IT IS ONE UNCONDITIONAL LINE ON PURPOSE. A backend that cannot serve
    // this schema at all (no guided decoding on the summarize role, a family that drops `responseFormat`)
    // fails EVERY asset identically, and the sweep's own counts cannot say so — the raw lens still lands, so
    // a whole-corpus analysis failure reports as a tidy "0 embedded, N skipped". This line is the difference
    // between a diagnosable outage and a silent one, and it is the catch's OWNER under
    // `caught-failure-ownership`: a guarded early exit ahead of the governed log would leave the
    // model-unavailable arm an unproven absorb, because the walk credits the first top-level statement.
    getLog().warn(
      { model, err: error, unservable, latched },
      "embeddings indexer: avatar analysis failed — asset skipped, will retry next sweep (unservable=true means the summarize backend does not serve this model at all and analysis is now disabled for it until restart; point the summarize role at the model the engine serves)",
    );
    return skipped(model);
  }
}
