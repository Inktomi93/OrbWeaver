// GenerateContent usage is parsed before the SDK's absent-field → zero conversion. Its reported total
// includes prompt, candidates and thoughts; modality lists are partial and cannot substitute for totals.
import type { TokenDetails, TokenUsage } from "@orb/contracts/inference";
import { modalitySchema } from "@orb/contracts/inference";
import { z } from "zod";

const count = z.number().int().nonnegative().optional().catch(undefined);
const modalityCount = z.object({ modality: z.string(), tokenCount: z.number().int().nonnegative() });
const rawUsageSchema = z.object({
  promptTokenCount: count,
  candidatesTokenCount: count,
  thoughtsTokenCount: count,
  totalTokenCount: count,
  cachedContentTokenCount: count,
  toolUsePromptTokenCount: count,
  promptTokensDetails: z.array(modalityCount).optional().catch(undefined),
  candidatesTokensDetails: z.array(modalityCount).optional().catch(undefined),
});
const responseIdentitySchema = z.object({ modelVersion: z.string().min(1).optional() });

export function googleServedModelOf(body: unknown): string | null {
  const parsed = responseIdentitySchema.safeParse(body);
  return parsed.success ? (parsed.data.modelVersion ?? null) : null;
}

export function googleTokenUsageOf(raw: unknown): TokenUsage {
  const parsed = rawUsageSchema.safeParse(raw);
  const usage = parsed.success ? parsed.data : undefined;
  const prompt = usage?.promptTokenCount;
  const total = usage?.totalTokenCount;
  const candidates = usage?.candidatesTokenCount;
  const thoughts = usage?.thoughtsTokenCount;
  const toolPrompt = usage?.toolUsePromptTokenCount;
  // SDK input includes the separately reported tool-use prompt. Do not subtract prompt alone when that
  // extra input is present: only the explicit candidates/thoughts sum proves output in that case.
  const derivedOutput =
    total !== undefined && prompt !== undefined && total >= prompt && (toolPrompt === undefined || toolPrompt === 0) ? total - prompt : null;
  return {
    tokensIn: prompt === undefined ? null : prompt + (toolPrompt ?? 0),
    tokensOut: candidates !== undefined && thoughts !== undefined ? candidates + thoughts : derivedOutput,
    reasoningTokens: thoughts ?? null,
    cacheReadTokens: usage?.cachedContentTokenCount ?? null,
    // GenerateContent reports implicit reads, not cache-creation billing. Explicit cache storage is a
    // separate endpoint and must not become an invented write charge on this generation.
    cacheWriteTokens: parsed.success ? 0 : null,
  };
}

export function googleTokenDetailsOf(raw: unknown): TokenDetails | null {
  const parsed = rawUsageSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const { promptTokensDetails, candidatesTokensDetails } = parsed.data;
  const details = {
    ...(promptTokensDetails === undefined ? {} : { input: modalityCountsOf(promptTokensDetails) }),
    ...(candidatesTokensDetails === undefined ? {} : { output: modalityCountsOf(candidatesTokensDetails) }),
  };
  return Object.keys(details).length > 0 ? details : null;
}

function modalityCountsOf(counts: readonly z.infer<typeof modalityCount>[]): NonNullable<TokenDetails["input"]> {
  return counts.flatMap((detail) => {
    // DOCUMENT is PDF/file input in the shared vocabulary. UNSPECIFIED is not a modality fact;
    // dropping only that entry preserves every known member of this explicitly partial list.
    const modality = modalitySchema.safeParse(detail.modality === "DOCUMENT" ? "file" : detail.modality.toLowerCase());
    return modality.success ? [{ modality: modality.data, tokens: detail.tokenCount }] : [];
  });
}
