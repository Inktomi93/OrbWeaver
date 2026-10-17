// Canon accounting follows retained owner/voice facts, independently of request authority and funding.
import type {
  ApplyStatsDelta,
  BumpStatsCanonVersion,
  ResolveRetainedChatAccountingScope,
  ResolveRetainedChatRebase,
  SettleRetainedChatRebase,
} from "@orb/contracts/stats";
import type { chats, Db, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import type { SQL } from "drizzle-orm";

type ApplyStatsDeltaOp = ApplyStatsDelta<BatchStmt[], Db>;

export interface ChatAccountingContext {
  readonly db: Db;
  readonly now: () => number;
  readonly applyStatsDelta: ApplyStatsDeltaOp;
  readonly applyCharacterStatsDelta: ApplyStatsDeltaOp;
  readonly resolveRetainedChatAccountingScope: ResolveRetainedChatAccountingScope<SQL>;
  readonly settleRetainedChatRebase: SettleRetainedChatRebase<Parameters<ApplyStatsDeltaOp>[0], Db>;
  readonly resolveRetainedChatRebase: ResolveRetainedChatRebase<
    typeof chats.$inferSelect,
    typeof messages.$inferSelect,
    typeof messageVariants.$inferSelect,
    SQL
  >;
  readonly bumpStatsCanonVersion: BumpStatsCanonVersion<BatchStmt[], Db>;
}

/** Retained canon writes do not receive room rekey or character-only accounting operations. */
export type RetainedCanonContext = Pick<
  ChatAccountingContext,
  "db" | "now" | "applyStatsDelta" | "resolveRetainedChatAccountingScope" | "bumpStatsCanonVersion"
>;
