// `@orb/contracts/chat` — the bounded canon seam import's token-usage catch-up drives. Import owns source
// interpretation; chat owns every message_variants read/write. These shapes are the cross-domain contract.

import type { MessageVariantId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { TokenProvenance, VariantMetadata } from "./messages.ts";

export interface ImportedTokenUsageCandidate {
  readonly variantId: MessageVariantId;
  readonly ownerId: UserId;
  readonly role: MessageRole;
  readonly content: string;
  /** The variant's PARSED sidecar (§5.3c class 3) — read for {@link VARIANT_METADATA_TOKEN_COUNT_KEY} only.
   *  Closed rather than a bag so `recordedTokenCountFromMetadata` names a typed field or stops compiling. */
  readonly metadata: VariantMetadata | null;
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
