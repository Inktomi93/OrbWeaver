// `@orb/contracts/chat` — the bounded canon seam import's token-usage catch-up drives. Import owns source
// interpretation; chat owns every message_variants read/write. These shapes are the cross-domain contract.

import type { MessageVariantId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { TokenProvenance } from "./messages.ts";

export interface ImportedTokenUsageCandidate {
  readonly variantId: MessageVariantId;
  readonly ownerId: UserId;
  readonly role: MessageRole;
  readonly content: string;
  readonly metadata: Record<string, unknown> | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokenProvenance: TokenProvenance;
}

export interface ImportedTokenUsageResolution {
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly tokenProvenance: Exclude<TokenProvenance, "unrecorded">;
}

export type ListImportedTokenUsageCandidates = (args: {
  /** Restrict the sweep to chats whose present host seat resolves to this user; null scans every host. */
  readonly hostUserId: UserId | null;
  readonly afterVariantId: MessageVariantId | null;
  readonly limit: number;
}) => Promise<readonly ImportedTokenUsageCandidate[]>;

/** Returns false when the row stopped matching the candidate before the CAS landed. */
export type CompareAndSetImportedTokenUsage = (args: {
  readonly candidate: ImportedTokenUsageCandidate;
  readonly resolution: ImportedTokenUsageResolution;
}) => Promise<boolean>;
