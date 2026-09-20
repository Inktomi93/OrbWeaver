// The normalized "why did generation stop?" vocabulary — a CLOSED tuple with a SQL CHECK on
// `message_variants.finish_reason` (§5.3c class 1). Moved here from `infra/providers/contract/chat.ts` because
// a db CHECK cannot import the server. The raw upstream word rides `stop_reason` as declared-opaque
// provenance beside it; the per-wire raw→normalized fold lives in the package (`FINISH_REASON_MAP`), where
// `other` is a NAMED arm for a recognised-but-unclassified value, never a fallthrough.

import { z } from "zod";

export const NORMALIZED_FINISH_REASONS = ["stop", "length", "filter", "tool", "other"] as const;
export type NormalizedFinishReason = (typeof NORMALIZED_FINISH_REASONS)[number];
export const normalizedFinishReasonSchema = z.enum(NORMALIZED_FINISH_REASONS);
