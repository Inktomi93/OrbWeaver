import type { GenerationUsageLeg } from "@orb/contracts/inference";
import type { ApplyStatsDelta, StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { GenerationObservationCallback } from "@orb/inference";
import type { ChatId, ChatTurnId, MessageId, MessageVariantId, UserConnectionId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";

export interface GenerationObservationContext {
  readonly db: Db;
  readonly now: () => number;
  readonly applyStatsDelta: ApplyStatsDelta<BatchStmt[], Db>;
}

/** A retained source fences late responses; absent source ids mean the room itself is the parent. */
export interface GenerationObservationParent {
  readonly chatId: ChatId;
  readonly turnId: ChatTurnId;
  readonly sourceMessageId: MessageId | null;
  readonly sourceVariantId: MessageVariantId | null;
}

export interface GenerationObservationFact {
  readonly ordinal: number;
  readonly funderUserId: UserId;
  readonly connectionId: UserConnectionId | null;
  readonly leg: GenerationUsageLeg;
}

export interface GenerationObservationGroup {
  readonly parent: GenerationObservationParent;
  readonly facts: readonly GenerationObservationFact[];
}

export interface GenerationObservationRemovalScope {
  readonly chatIds: readonly ChatId[];
  readonly messageIds?: readonly MessageId[];
  readonly variantIds?: readonly MessageVariantId[];
  readonly chatPredicate?: SQL;
}

export interface GenerationObservationSession {
  readonly onObservedResult: GenerationObservationCallback;
  readonly load: () => Promise<readonly GenerationObservationFact[]>;
  readonly transferStatements: (facts: readonly GenerationObservationFact[], predicate?: SQL) => readonly BatchStmt[];
  readonly commit: (statements: readonly BatchStmt[], facts: readonly GenerationObservationFact[], predicate?: SQL) => Promise<void>;
}

/** Entry-composed private sink; the caller already admitted the retained source operation. */
export type BeginGenerationObservation = (parent: GenerationObservationParent) => GenerationObservationCallback;

/** Prepared retained-data deltas and their exact cohort/voice write predicate. */
export interface PreparedRetainedCanonStats {
  readonly ownerIds: readonly UserId[];
  readonly predicate: SQL;
  readonly deltas: readonly StatsDelta[];
}
