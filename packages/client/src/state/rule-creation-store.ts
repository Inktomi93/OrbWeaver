import type { AutomationRuleCreationId, AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { createPersistedStore } from "./create-persisted-store.ts";
import { activeDurableLocalUserId, durableLocalReadyFor } from "./durable-local.ts";

const creationSchema = z.strictObject({
  requestId: typeIdSchema(ID_PREFIX.automationRuleCreation),
  chatId: typeIdSchema(ID_PREFIX.chat).nullable(),
  ruleId: typeIdSchema(ID_PREFIX.automationRule).nullable(),
  checkpoint: z
    .strictObject({
      modelVersion: z.number().int(),
      baseline: z.string(),
      predecessor: z.string().nullable(),
      draftJson: z.string(),
    })
    .nullable()
    .catch(null)
    .default(null),
});
const stateSchema = z.strictObject({
  sessions: z.array(creationSchema.nullable().catch(null)).transform((sessions) => sessions.filter((session) => session !== null)),
});
export type RuleCreation = z.infer<typeof creationSchema>;

const useRuleCreationStore = createPersistedStore<z.infer<typeof stateSchema>>("rule-creations", () => ({ sessions: [] }), {
  version: 1,
  migrate: (value) => stateSchema.safeParse(value).data ?? { sessions: [] },
  partialize: (state) => state,
});

/** Pending identities are isolated by the durable-local verified-user namespace. */
export function useRuleCreations(): readonly RuleCreation[] {
  return useRuleCreationStore((state) => state.sessions);
}

/** Whether `owner` is the signed-in account and its local drafts have loaded: the one gate every creation
 *  read and write, the rule cache echo and the editor's entry points ask. */
export function ruleDraftOwnerCurrent(owner: UserId): boolean {
  return activeDurableLocalUserId() === owner && durableLocalReadyFor(owner);
}

/** The active verified namespace is the only readable creation namespace. */
export function readRuleCreation(identity: string): RuleCreation | undefined {
  const owner = activeDurableLocalUserId();
  if (owner === null || !ruleDraftOwnerCurrent(owner)) {
    return;
  }
  return useRuleCreationStore.getState().sessions.find((session) => session.requestId === identity);
}

/** A queued write must not follow a later sign-in into another user's namespace. */
export function assertRuleDraftOwner(owner: UserId): void {
  if (!ruleDraftOwnerCurrent(owner)) {
    throw new Error("This editing session ended when the signed-in account changed. Reopen the rule to continue.");
  }
}

/** Persist the request identity before any network write can start. */
export function beginRuleCreation(chatId: ChatId | null, owner: UserId): RuleCreation {
  assertRuleDraftOwner(owner);
  const creation: RuleCreation = { requestId: mintTypeId(ID_PREFIX.automationRuleCreation), chatId, ruleId: null, checkpoint: null };
  useRuleCreationStore.setState((state) => ({ sessions: [...state.sessions, creation] }), false, "rule-creation/begin");
  return creation;
}

/** Acknowledgment changes the mutation target, never the form's request-keyed epoch. */
export function acknowledgeRuleCreation(
  requestId: AutomationRuleCreationId,
  ruleId: AutomationRuleId,
  owner: UserId,
  checkpoint: RuleCreation["checkpoint"],
): void {
  assertRuleDraftOwner(owner);
  useRuleCreationStore.setState(
    (state) => ({ sessions: state.sessions.map((session) => (session.requestId === requestId ? { ...session, ruleId, checkpoint } : session)) }),
    false,
    "rule-creation/acknowledge",
  );
}

/** The canonical mirror has adopted the checkpoint; keep the target but retire transition metadata. */
export function clearRuleRecoveryCheckpoint(requestId: AutomationRuleCreationId, owner: UserId): void {
  assertRuleDraftOwner(owner);
  useRuleCreationStore.setState(
    (state) => ({ sessions: state.sessions.map((session) => (session.requestId === requestId ? { ...session, checkpoint: null } : session)) }),
    false,
    "rule-creation/clear-checkpoint",
  );
}

/** Forget one scope's acknowledged sessions that hold no draft: the rule exists and nothing local is left to
 *  recover. An unacknowledged session keeps its key whatever its draft says, because its create may have landed. */
export function pruneCompletedRuleCreations(chatId: ChatId | null, owner: UserId, hasDraft: (requestId: AutomationRuleCreationId) => boolean): void {
  assertRuleDraftOwner(owner);
  useRuleCreationStore.setState(
    (state) => ({
      sessions: state.sessions.filter((session) => session.chatId !== chatId || session.ruleId === null || hasDraft(session.requestId)),
    }),
    false,
    "rule-creation/prune",
  );
}

/** Remove only a deliberately completed/discarded session; unacknowledged failures retain their key. */
export function forgetRuleCreation(requestId: AutomationRuleCreationId, owner: UserId): void {
  assertRuleDraftOwner(owner);
  useRuleCreationStore.setState((state) => ({ sessions: state.sessions.filter((session) => session.requestId !== requestId) }), false, "rule-creation/forget");
}
