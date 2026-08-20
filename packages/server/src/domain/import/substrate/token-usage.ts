// domain/import/substrate/token-usage — the one pure resolver for imported row-text token accounting.
// An inspected source count wins and remains measured; otherwise the existing kit estimator measures the
// raw imported text and the result stays visibly estimated. This module never manufactures dollar cost.

import type { ImportedTokenUsageResolution } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";

/** Accept only the exact ST shape established by the inspected export/source versions. */
export function recordedTokenCountFromMetadata(metadata: Record<string, unknown> | null): number | null {
  const value = metadata?.["token_count"];
  const count = typeof value === "number" ? value : Number.NaN;
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
