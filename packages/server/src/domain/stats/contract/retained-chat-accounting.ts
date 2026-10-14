import type { RetainedChatRebaseSnapshot, RetainedChatRekeys } from "@orb/contracts/stats";
import type { characters, chatParticipants, chats, Db, messages, messageVariants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import type { SQLiteSelectBase, SQLiteSelectQueryBuilderBase, SQLiteSelectQueryBuilderHKT, SubqueryWithSelection } from "drizzle-orm/sqlite-core";

export const RETAINED_CHAT_MEMBERSHIP_ALIAS = "retained_chat_membership";
export const RETAINED_CHAT_OWNERS_ALIAS = "retained_chat_owners";

type RetainedOwnerSelection = Pick<SubqueryWithSelection<{ ownerId: typeof characters.ownerId }, typeof RETAINED_CHAT_MEMBERSHIP_ALIAS>, "ownerId">;
export type RetainedChatOwnersQuery = Omit<
  SQLiteSelectQueryBuilderBase<
    SQLiteSelectQueryBuilderHKT,
    typeof RETAINED_CHAT_MEMBERSHIP_ALIAS,
    "sync",
    void,
    RetainedOwnerSelection,
    "partial",
    Record<typeof RETAINED_CHAT_MEMBERSHIP_ALIAS, "not-null">,
    false,
    "where"
  >,
  "where"
>;
type RetainedCohortSelection = SubqueryWithSelection<RetainedChatOwnersQuery["_"]["selectedFields"], typeof RETAINED_CHAT_OWNERS_ALIAS>;
export type RetainedOwnersRead = Omit<
  SQLiteSelectBase<
    typeof RETAINED_CHAT_OWNERS_ALIAS,
    "async",
    Awaited<ReturnType<Db["run"]>>,
    Pick<RetainedCohortSelection, "ownerId">,
    "single",
    Record<typeof RETAINED_CHAT_OWNERS_ALIAS, "not-null">,
    false,
    "orderBy"
  >,
  "orderBy"
>;

export type RetainedRebaseProjection = Omit<
  RetainedChatRebaseSnapshot<typeof chats.$inferSelect, typeof messages.$inferSelect, typeof messageVariants.$inferSelect, SQL>,
  "chat" | "predicate"
> & { readonly planStillMatches: boolean };

export interface RetainedRebaseInput {
  readonly rekeys: RetainedChatRekeys;
  readonly ownerIds: readonly UserId[];
  readonly seats: readonly (typeof chatParticipants.$inferSelect)[];
  readonly slots: readonly (typeof messages.$inferSelect)[];
  readonly variants: readonly (typeof messageVariants.$inferSelect)[];
  readonly cardOwners: readonly Pick<typeof characters.$inferSelect, "id" | "ownerId">[];
}
