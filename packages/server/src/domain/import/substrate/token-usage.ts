// domain/import/substrate/token-usage — the one pure resolver for imported row-text token accounting.
// An inspected source count wins and remains measured; otherwise the existing kit estimator measures the
// raw imported text and the result stays visibly estimated. This module never manufactures dollar cost.

import type { ImportedTokenUsageResolution, VariantMetadata } from "@orb/contracts/chat";
import { VARIANT_METADATA_TOKEN_COUNT_KEY } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";

/** Accept only the exact ST shape established by the inspected export/source versions. The blob arrives
 *  PARSED (§5.3c class 3), so the key is already `number | undefined` and this guard is about the VALUE — a
 *  negative or fractional count is not a token count — never about the type. */
export function recordedTokenCountFromMetadata(metadata: VariantMetadata | null): number | null {
  const count = metadata?.[VARIANT_METADATA_TOKEN_COUNT_KEY] ?? Number.NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function onRoleAxis(role: MessageRole, count: number, tokenProvenance: ImportedTokenUsageResolution["tokenProvenance"]): ImportedTokenUsageResolution {
  return role === "assistant" ? { tokensIn: null, tokensOut: count, tokenProvenance } : { tokensIn: count, tokensOut: null, tokenProvenance };
}

/** Resolve one imported row. The caller supplies a source count only after inspecting its format. */
export function resolveImportedTokenUsage(args: {
  readonly role: MessageRole;
  readonly content: string;
  readonly recordedTokenCount: number | null;
}): ImportedTokenUsageResolution {
  const { role, content, recordedTokenCount } = args;
  return onRoleAxis(role, recordedTokenCount ?? estimateTokens(content), recordedTokenCount === null ? "estimated" : "measured");
}
