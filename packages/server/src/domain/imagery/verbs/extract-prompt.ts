// The two-step, step 1 (doc 02 §2) — PUBLIC. `createExtractPrompt` is the preview-before-spend verb;
// `createResolvePrompt` builds the shared resolution the orchestrator's step 3 also uses (one dispatch, no
// drift). The dispatch: multimodal mode → the injected captionAvatar (avatar-absent falls back to text
// extraction of the sibling mode); extraction mode → extractText (chat's quiet shaper over recent history,
// macros resolved chat-side). Empty after processReply → PromptExtractionFailedError (§7 — the caller owns the
// empty-is-error decision). captionAvatar arrives INJECTED (verb-to-verb value deps wire at service.ts); the
// `CaptionAvatar` import here is TYPE-only, which domain-no-cross-verb permits.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { PromptExtractionFailedError } from "../contract/errors";
import type { ExtractionMode, ExtractPromptParams } from "../contract/params";
import type { ExtractedPrompt } from "../contract/results";
import type { CaptionAvatar, ImageryContext, ImageryService, ResolvePrompt } from "../contract/service";
import { extractionFallbackFor, isMultimodalMode } from "../substrate/mode";
import { processReply } from "../substrate/process-reply";
import { PROMPT_TEMPLATES } from "../substrate/templates";

/** The text-extraction branch: chat's quiet shaper reads recent canon under the mode's template, then normalize. */
async function extractText(
  ctx: ImageryContext,
  args: { readonly caller: Principal; readonly chatId: ChatId; readonly mode: ExtractionMode; readonly subjectCharacterId: CharacterId | undefined },
): Promise<{ readonly prompt: string; readonly costUsd: number | null }> {
  const { text, costUsd } = await ctx.extractQuiet({
    caller: args.caller,
    chatId: args.chatId,
    instruction: PROMPT_TEMPLATES[args.mode],
    ...(args.subjectCharacterId !== undefined ? { subjectCharacterId: args.subjectCharacterId } : {}),
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
      const captioned = await deps.captionAvatar({ caller: args.caller, mode: args.mode, subjectCharacterId: args.subjectCharacterId });
      if (captioned !== null) {
        return { prompt: captioned.prompt, source: "captioned", costUsd: captioned.costUsd };
      }
      const fell = await extractText(ctx, {
        caller: args.caller,
        chatId: args.chatId,
        mode: extractionFallbackFor(args.mode),
        subjectCharacterId: args.subjectCharacterId,
      });
      return { prompt: fell.prompt, source: "extracted", costUsd: fell.costUsd };
    }
    const extracted = await extractText(ctx, {
      caller: args.caller,
      chatId: args.chatId,
      mode: args.mode,
      subjectCharacterId: args.subjectCharacterId,
    });
    return { prompt: extracted.prompt, source: "extracted", costUsd: extracted.costUsd };
  };
}

export function createExtractPrompt(_ctx: ImageryContext, deps: { readonly resolvePrompt: ResolvePrompt }): ImageryService["extractPrompt"] {
  return async (p: ExtractPromptParams): Promise<ExtractedPrompt> => {
    const resolved = await deps.resolvePrompt({ caller: p.caller, chatId: p.chatId, mode: p.mode, subjectCharacterId: p.subjectCharacterId });
    return { prompt: resolved.prompt, mode: p.mode, source: resolved.source, costUsd: resolved.costUsd };
  };
}
