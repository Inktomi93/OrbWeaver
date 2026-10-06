import type { RetainedChatRebaseSnapshot, RetainedChatRekeys } from "@orb/contracts/stats";
import type { characters, chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";

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
