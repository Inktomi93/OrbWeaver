// The multimodal caption step (doc 02 §3) — INTERNAL (not an ImageryService member; the §9 reject list bans a
// second captioner front door). Reads the subject's avatar and captions it through the ONE vision op
// (captionImage → the summarize-with-images lane, D45/D47-6). Returns `null` when there is nothing to caption
// (no subject, or the subject has no avatar) — the caller (resolvePrompt) then FALLS BACK to text extraction,
// because multimodal is a QUALITY upgrade to the same intent, not a hard requirement (failing the whole
// generation over a cosmetic gap punishes the user). A factory (createCaptionAvatar) so resolvePrompt receives
// it INJECTED at service.ts (verb-to-verb value deps are wired at the composition root — domain-no-cross-verb).

import { PromptExtractionFailedError } from "../contract/errors";
import type { CaptionAvatar, ImageryContext } from "../contract/service";
import { processReply } from "../substrate/process-reply";

export function createCaptionAvatar(ctx: ImageryContext): CaptionAvatar {
  return async (args) => {
    if (args.subjectCharacterId === undefined) {
      return null;
    }
    const card = await ctx.getCard(args.caller, args.subjectCharacterId);
    if (card.avatarAssetId === null) {
      return null;
    }
    const { bytes, mime } = await ctx.readAsset(args.caller, card.avatarAssetId);
    // The caption instruction is the caller's per-mode override ⊕ the shipped catalog default (⑫).
    const instruction = await ctx.resolveCaptionInstruction(args.caller, args.mode);
    const { text, costUsd } = await ctx.captionImage({ caller: args.caller, bytes, mime, instruction });
    const prompt = processReply(text);
    if (prompt.length === 0) {
      throw new PromptExtractionFailedError(`imagery: the vision caption for mode "${args.mode}" produced no usable keywords`);
    }
    return { prompt, costUsd };
  };
}
