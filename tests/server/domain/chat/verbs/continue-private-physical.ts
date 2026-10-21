// Native paid, signed/tool generations precede actual game-policy and membership changes.
import type { TurnOutcome } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { closeDb, messageVariants } from "@orb/db";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { eq } from "drizzle-orm";
import { imageRoom, nativeText, nativeTool } from "../engine/inline-image-physical.ts";

export const PRIVATE_PREFIX = 'Before.<lie truth="host-secret"/>After.';
export const PRIVATE_BODY = `${PRIVATE_PREFIX}Done.`;
export const VISIBLE_BODY = "Before.After.Done.";
export const PRIVATE_REASONING = "reason-private.";
export const ADDITION = "A.A-end.";
export const ADDITION_REASONING = "RA.";
const INTENT: UserIntent = { replyMedia: "text+image", carryReasoning: "conversation", effort: "low", thinkingBudgetTokens: 1024 };

/** Create private channels and nonzero recorded economics through their actual public producers. */
export async function privateContinuation(withGame: boolean): Promise<
  AsyncDisposable & {
    readonly image: Awaited<ReturnType<typeof imageRoom>>;
    readonly held: Awaited<ReturnType<typeof freshHeldDb>>;
    readonly slot: TurnOutcome["messages"][number];
    readonly before: typeof messageVariants.$inferSelect;
    readonly early: Principal;
    readonly late: Principal;
    readonly nextContinuation: () => Promise<TurnOutcome>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const held = await freshHeldDb();
  construction.defer(() => closeDb(held.db));
  const image = construction.use(
    await imageRoom(
      [
        [{ text: PRIVATE_REASONING, thought: true, thoughtSignature: "reason-private-signature" }, nativeText(PRIVATE_PREFIX, "base-private"), nativeTool()],
        [nativeText("Done.", "base-end-private")],
        [{ text: ADDITION_REASONING, thought: true, thoughtSignature: "addition-reason-private-signature" }, nativeText("A.", "a-private"), nativeTool()],
        [nativeText("A-end.", "a-end-private")],
        [nativeText("B.", "b-private"), nativeTool()],
        [nativeText("B-end.", "b-end-private")],
      ],
      true,
      {
        db: held.db,
        cachedContentTokenCount: 0,
        usageMetadata: new Map<number, NonNullable<ReturnType<NonNullable<NonNullable<Parameters<typeof imageRoom>[2]>["usageMetadata"]>["get"]>>>([
          [
            2,
            {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
              totalTokenCount: 14,
              cachedContentTokenCount: 0,
              promptTokensDetails: [{ modality: "TEXT", tokenCount: 10 }],
            },
          ],
          [
            3,
            {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
              totalTokenCount: 14,
              cachedContentTokenCount: 0,
              promptTokensDetails: [{ modality: "TEXT", tokenCount: 10 }],
            },
          ],
          [4, { candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0, candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 0 }] }],
          [5, { candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0, candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 0 }] }],
        ]),
      },
    ),
  );
  const { h } = image;
  const chatBinding = (await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "chat")?.binding;
  if (chatBinding?.connectionId === undefined || chatBinding.connectionId === null) {
    throw new Error("the native private fixture has no actual chat binding");
  }
  const connection = await h.root.services.connection.get({ principal: h.owner, connectionId: chatBinding.connectionId });
  await h.root.services.connection.update({
    principal: h.owner,
    connectionId: connection.id,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...connection.declared,
        generation: { ...connection.declared?.generation, reasoning: { mode: "budget", enabled: true, budgetRange: { min: 0, max: 8192 }, replay: "signed" } },
        features: { ...connection.declared?.features, pricing: { inputPerMTok: 10_000, outputPerMTok: 20_000 } },
      }),
    },
  });
  const join = async (): Promise<Principal> => {
    const actor = await h.root.principalFor((await h.root.actor()).id);
    const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: actor.handle } });
    await h.root.services.chat.acceptInvite({ principal: actor, inviteId: invite.invite.id });
    return actor;
  };
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: INTENT });
  const slot = generated.messages[0];
  if (slot === undefined) {
    throw new Error("the paid native generation produced no real assistant slot");
  }
  const nextContinuation = async (): Promise<TurnOutcome> =>
    await h.root.services.chat.continueTurn({
      principal: h.owner,
      chatId: h.chatId,
      messageId: slot.id,
      intent: INTENT,
    });
  await nextContinuation();
  await h.root.settleBackground();
  const continued = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
  const baseTool = continued?.metadata?.continuationTools?.before[0];
  const additionTool = continued?.metadata?.continuationTools?.after[1];
  if (baseTool === undefined || additionTool === undefined) {
    throw new Error("the native continuation produced no distinct base and addition tool occurrences");
  }
  for (const [record, action] of [
    [baseTool, "hide"],
    [additionTool, "delete"],
  ] as const) {
    await h.root.services.chat.editToolCall({
      principal: h.owner,
      chatId: h.chatId,
      messageId: slot.id,
      variantId: slot.selectedVariantId,
      toolCallId: record.toolCallId,
      turnId: record.turnId,
      callOrdinal: record.callOrdinal,
      action,
    });
  }
  const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
  if (before === undefined) {
    throw new Error("the native paid continuation lost its selected row");
  }
  const early = await join();
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "A later reader joins after this line." });
  const late = await join();
  if (withGame) {
    await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
    await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { deception: true } });
    await h.root.settleBackground();
  }
  const lifetime = construction.move();
  return { image, held, slot, before, early, late, nextContinuation, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
