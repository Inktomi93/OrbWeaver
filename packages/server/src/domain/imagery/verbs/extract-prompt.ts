// The two-step, step 1 (doc 02 §2) — PUBLIC. `createExtractPrompt` is the preview-before-spend verb;
// `createResolvePrompt` builds the shared resolution the orchestrator's step 3 also uses (one dispatch, no
// drift). The dispatch: multimodal mode → the injected captionAvatar (avatar-absent falls back to text
// extraction of the sibling mode); extraction mode → extractText (chat's quiet shaper over recent history,
// macros resolved chat-side). Empty after processReply → PromptExtractionFailedError (§7 — the caller owns the
// empty-is-error decision). captionAvatar arrives INJECTED (verb-to-verb value deps wire at service.ts); the
// `CaptionAvatar` import here is TYPE-only, which domain-no-cross-verb permits.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import { ImageryNotConfiguredError, PromptExtractionFailedError } from "../contract/errors.ts";
import type { ExtractionMode, ExtractPromptParams } from "../contract/params.ts";
import type { ExtractedPrompt } from "../contract/results.ts";
import type { CaptionAvatar, ImageryContext, ImageryService, ResolvePrompt } from "../contract/service.ts";
import { extractionFallbackFor, isMultimodalMode } from "../substrate/mode.ts";
import { processReply } from "../substrate/process-reply.ts";

/** The text-extraction branch: chat's quiet shaper reads recent canon under the mode's template, then normalize.
 *  The instruction is the run-as principal's per-mode override ⊕ the shipped catalog default (⑫); the shaper
 *  clamps the canon to the caller's view and spends the run-as principal's Utility connection.
 *
 *  IT IS THE CHAT-BOUND HALF of this dispatch and says so out loud (C5): the prompt IS a reading of a room's
 *  recent messages, so a caller with no chat has nothing to extract FROM. That refusal used to live one frame
 *  up as an early guard in `generatePicture`, which meant the CAPTION modes — which read an avatar and touch
 *  no chat at all — were refused by association. Moving it here is what lets the chat-less lane use a caption
 *  mode while an extraction mode still refuses, typed, with a reason naming the mode. */
async function extractText(
  ctx: ImageryContext,
  args: {
    readonly caller: Principal;
    readonly runAs: Principal;
    readonly chatId: ChatId | undefined;
    readonly mode: ExtractionMode;
    readonly subjectCharacterId: CharacterId | undefined;
    readonly timeZone: IanaTimeZone | undefined;
  },
): Promise<{ readonly prompt: string; readonly costUsd: number | null }> {
  const chatId = args.chatId;
  if (chatId === undefined) {
    throw new ImageryNotConfiguredError(`imagery: mode "${args.mode}" builds its prompt from a chat's recent messages, and this request has no chat`);
  }
  const instruction = await ctx.resolvePromptTemplate(args.runAs, args.mode);
  const { text, costUsd } = await ctx.extractQuiet({
    caller: args.caller,
    funderUserId: args.runAs.userId,
    chatId,
    instruction,
    ...(args.subjectCharacterId !== undefined ? { subjectCharacterId: args.subjectCharacterId } : {}),
    ...(args.timeZone !== undefined ? { timeZone: args.timeZone } : {}),
  });
  const prompt = processReply(text);
  if (prompt.length === 0) {
    throw new PromptExtractionFailedError(`imagery: prompt extraction for mode "${args.mode}" produced no usable keywords`);
  }
  return { prompt, costUsd };
}

/** Build the shared prompt resolution. Multimodal → captionAvatar (with the no-avatar fallback to the sibling
 *  extraction mode); otherwise → text extraction. */
export function createResolvePrompt(ctx: ImageryContext, deps: { readonly captionAvatar: CaptionAvatar }): ResolvePrompt {
  return async (args) => {
    if (isMultimodalMode(args.mode)) {
      const captioned = await deps.captionAvatar({ caller: args.caller, runAs: args.runAs, mode: args.mode, subjectCharacterId: args.subjectCharacterId });
      if (captioned !== null) {
        return { prompt: captioned.prompt, source: "captioned", costUsd: captioned.costUsd };
      }
      const fell = await extractText(ctx, {
        caller: args.caller,
        runAs: args.runAs,
        chatId: args.chatId,
        mode: extractionFallbackFor(args.mode),
        subjectCharacterId: args.subjectCharacterId,
        timeZone: args.timeZone,
      });
      return { prompt: fell.prompt, source: "extracted", costUsd: fell.costUsd };
    }
    const extracted = await extractText(ctx, {
      caller: args.caller,
      runAs: args.runAs,
      chatId: args.chatId,
      mode: args.mode,
      subjectCharacterId: args.subjectCharacterId,
      timeZone: args.timeZone,
    });
    return { prompt: extracted.prompt, source: "extracted", costUsd: extracted.costUsd };
  };
}

export function createExtractPrompt(ctx: ImageryContext, deps: { readonly resolvePrompt: ResolvePrompt }): ImageryService["extractPrompt"] {
  return async (p: ExtractPromptParams): Promise<ExtractedPrompt> => {
    const resolved = await deps.resolvePrompt({
      caller: p.caller,
      runAs: await ctx.resolveRoomRunAs(p.caller, p.chatId, p.subjectCharacterId),
      chatId: p.chatId,
      mode: p.mode,
      subjectCharacterId: p.subjectCharacterId,
      timeZone: p.timeZone,
    });
    return { prompt: resolved.prompt, mode: p.mode, source: resolved.source, costUsd: resolved.costUsd };
  };
}
