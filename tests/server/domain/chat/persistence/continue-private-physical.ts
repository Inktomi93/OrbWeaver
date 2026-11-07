// Native paid, signed/tool generations precede actual game-policy and membership changes.
import type { TurnOutcome } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { imageRoom, nativeText, nativeTool } from "../engine/inline-image-physical.ts";

export const PRIVATE_PREFIX = 'Before.<lie truth="host-secret"/>After.';
export const PRIVATE_BODY = `${PRIVATE_PREFIX}Done.`;
export const VISIBLE_BODY = "Before.After.Done.";
export const PRIVATE_REASONING = "reason-private.";
export const ADDITION = "A.A-end.";
export const ADDITION_REASONING = "RA.";
const INTENT: UserIntent = { replyMedia: "text+image", carryReasoning: "conversation", effort: "low", thinkingBudgetTokens: 1024 };

// Exchanges in pairs (tool call, then its closing text): the paid base turn, its continuation, and the next continuation.
const PRIVATE_SCRIPT = [
  [{ text: PRIVATE_REASONING, thought: true, thoughtSignature: "reason-private-signature" }, nativeText(PRIVATE_PREFIX, "base-private"), nativeTool()],
  [nativeText("Done.", "base-end-private")],
  [{ text: ADDITION_REASONING, thought: true, thoughtSignature: "addition-reason-private-signature" }, nativeText("A.", "a-private"), nativeTool()],
  [nativeText("A-end.", "a-end-private")],
];

const PRIVATE_NEXT_SCRIPT = [[nativeText("B.", "b-private"), nativeTool()], [nativeText("B-end.", "b-end-private")]];

export interface PrivateContinuation {
  readonly image: Awaited<ReturnType<typeof imageRoom>>;
  readonly held: Awaited<ReturnType<typeof freshHeldDb>>;
  readonly chatId: ChatId;
  readonly slot: TurnOutcome["messages"][number];
  readonly before: typeof messageVariants.$inferSelect;
  readonly early: Principal;
  readonly late: Principal;
  readonly nextContinuation: () => Promise<TurnOutcome>;
}

export interface PrivateRoom extends AsyncDisposable {
  /** Continue a fresh chat of this room; every call gets its own slot, membership, script and, when asked, game. */
  readonly continuation: (withGame: boolean) => Promise<PrivateContinuation>;
}

/** Boot the held database, the composed root, the priced connection and the enabled guest once, so a case pays only for its own chat.
 *  @remarks The guest host is a spawned process whose boot dominates a case's wall time under load. */
export async function privateRoom(): Promise<PrivateRoom> {
  await using construction = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: construction.use registers disposal; construction.move transfers it to the returned lifetime.
  const held = construction.use(await freshHeldDb());
  const image = construction.use(
    await imageRoom([], true, {
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
    }),
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
  /** Create private channels and nonzero recorded economics through their actual public producers. */
  const continuation = async (withGame: boolean): Promise<PrivateContinuation> => {
    const chat = await image.openChat(PRIVATE_SCRIPT);
    const chatId = chat.chatId;
    const join = async (): Promise<Principal> => {
      const actor = await h.root.principalFor((await h.root.actor()).id);
      const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId, input: { invitedHandle: actor.handle } });
      await h.root.services.chat.acceptInvite({ principal: actor, inviteId: invite.invite.id });
      return actor;
    };
    const generated = await h.root.services.chat.generate({ principal: h.owner, chatId, intent: INTENT });
    const slot = generated.messages[0];
    if (slot === undefined) {
      throw new Error("the paid native generation produced no real assistant slot");
    }
    const continueSlot = async (): Promise<TurnOutcome> =>
      await h.root.services.chat.continueTurn({
        principal: h.owner,
        chatId,
        messageId: slot.id,
        intent: INTENT,
      });
    const nextContinuation = async (): Promise<TurnOutcome> => {
      image.script(PRIVATE_NEXT_SCRIPT);
      return await continueSlot();
    };
    await continueSlot();
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
        chatId,
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
    await h.root.services.chat.commitMessage({ principal: h.owner, chatId, content: "A later reader joins after this line." });
    const late = await join();
    if (withGame) {
      await h.root.services.rpg.createGame({ principal: h.owner, chatId, mode: "lite" });
      await h.root.services.rpg.updateConfig({ principal: h.owner, chatId, patch: { deception: true } });
      await h.root.settleBackground();
    }
    return { image, held, chatId, slot, before, early, late, nextContinuation };
  };
  const lifetime = construction.move();
  return { continuation, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
