// transport/trpc/routers/imagery — the client-facing surface of the imagery LEAF (imagery-design/04 §8).
// These three verbs do NOT post to chat (that stays `chat.generateImage`, which owns message authorship);
// they are the direct imagery ops the I5 client consumes: the studio's img2img/edit (`editImage`), the
// preview-before-spend surface (`extractPrompt`), and the gallery-detail + regenerate provenance read
// (`readProvenance`). Thin: validate → `caller: ctx.auth` → `ctx.services.imagery.<verb>` → the global
// error map turns the kit domain errors (`ImageEditUnsupportedError` → BAD_REQUEST, `GenerationFailedError`
// → SERVICE_UNAVAILABLE, `ImageryNotConfiguredError` → BAD_REQUEST) into their tRPC codes. All three take
// owner-A ids and are classified in the cross-tenant sweep (a stranger hits the domain's owner join → a
// leak-free NOT_FOUND). Wire inputs are inline (not exported types); the result shapes flow to the client
// via tRPC `inferOutput`, so no contract result type is duplicated here.

import { assetIdSchema } from "@orb/contracts/assets";
import { promptTemplateModeSchema, sizePresetSchema } from "@orb/contracts/imagery";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

// The edit instruction cap mirrors the generation prompt cap (imagery-design/02 §7 — the verbatim edit
// instruction rides the same 2000-char ceiling as a resolved prompt).
const MAX_INSTRUCTION_CHARS = 2000;
const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 4;

// The extraction modes (`free` has nothing to extract — imagery-design/02 §2); derived from the contract
// tuple via `.exclude`, never re-spelled (`no-inline-union-redecl`).
const extractionModeSchema = promptTemplateModeSchema.exclude(["free"]);

export const imageryRouter = t.router({
  // The img2img/edit studio (imagery-design/02 §4): edit an OWNED asset by instruction. Only the owned-asset
  // source arm is exposed on the wire — an uploaded source rides `uploadAsset` first (→ an id), never bytes
  // over tRPC (the SSRF/size posture, doc 04 §7). Throws `ImageEditUnsupportedError` (→ BAD_REQUEST) when the
  // resolved generateImage model lacks `input.imageEdit` — the client shows the capability refusal.
  editImage: authedProcedure
    .input(
      z.object({
        sourceAssetId: assetIdSchema,
        instruction: z.string().trim().min(1).max(MAX_INSTRUCTION_CHARS),
        n: z.number().int().min(MIN_IMAGE_COUNT).max(MAX_IMAGE_COUNT).optional(),
        size: sizePresetSchema.optional(),
        chatId: brandedId<ChatId>().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.imagery.editImage({
        caller: ctx.auth,
        source: { assetId: input.sourceAssetId },
        instruction: input.instruction,
        ...(input.n === undefined ? {} : { n: input.n }),
        ...(input.size === undefined ? {} : { size: input.size }),
        ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
      }),
    ),

  // The preview-before-spend surface: resolve the prompt for a mode WITHOUT generating, so the user reviews
  // (and edits) it, then generates with it as a verbatim `prompt`. Spends the summarize-role shaper call.
  extractPrompt: authedProcedure
    .input(
      z.object({
        chatId: brandedId<ChatId>(),
        mode: extractionModeSchema,
        subjectCharacterId: brandedId<CharacterId>().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.imagery.extractPrompt({
        caller: ctx.auth,
        chatId: input.chatId,
        mode: input.mode,
        ...(input.subjectCharacterId === undefined ? {} : { subjectCharacterId: input.subjectCharacterId }),
      }),
    ),

  // The durable provenance of a generated image (prompt/model/cost/mode) — the gallery detail + the
  // regenerate affordance's source prompt. Owner-scoped through the `assets` join; `null` when the asset has
  // no provenance row or isn't the caller's.
  readProvenance: authedProcedure
    .input(z.object({ assetId: assetIdSchema }))
    .query(({ ctx, input }) => ctx.services.imagery.readProvenance({ caller: ctx.auth, assetId: input.assetId })),
});
