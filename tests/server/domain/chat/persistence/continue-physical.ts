// Native signed tool exchanges create the restore snapshot; the only extra seam is a held database driver.

import type { TurnOutcome } from "@orb/contracts/chat";
import { messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { imageRoom, nativeText, nativeTool } from "../engine/inline-image-physical.ts";

// The first four exchanges build the continuation; the last two serve one competing continuation or swipe.
const SIGNED_SCRIPT = [[nativeTool()], [nativeText("Base.", "base-private")], [nativeTool()], [nativeText("A.", "a-private")]];

/** One more signed exchange; stage it with `image.script` immediately before the turn that spends it. */
export const SIGNED_NEXT_SCRIPT = [[nativeTool()], [nativeText("B.", "b-private")]];

export interface SignedContinuation {
  readonly chatId: ChatId;
  readonly slot: TurnOutcome["messages"][number];
  readonly before: typeof messageVariants.$inferSelect;
}

export interface SignedRoom extends AsyncDisposable {
  readonly image: Awaited<ReturnType<typeof imageRoom>>;
  readonly held: Awaited<ReturnType<typeof freshHeldDb>>;
  /** Continue a fresh chat of this room; every call gets its own slot, membership and script. */
  readonly continuation: () => Promise<SignedContinuation>;
}

/** Boot the held database, the composed root and the enabled guest once, so a case pays only for its own chat.
 *  @remarks The guest host is a spawned process whose boot dominates a case's wall time under load. */
export async function signedRoom(): Promise<SignedRoom> {
  await using construction = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: construction.use registers disposal; construction.move transfers it to the returned lifetime.
  const held = construction.use(await freshHeldDb());
  const image = construction.use(await imageRoom([], true, { db: held.db }));
  const continuation = async (): Promise<SignedContinuation> => {
    const chat = await image.openChat(SIGNED_SCRIPT);
    const outcome = await chat.turn();
    const slot = outcome.messages[0];
    if (slot === undefined) {
      throw new Error("the native tool generation created no assistant slot");
    }
    await image.h.root.services.chat.continueTurn({
      principal: image.h.owner,
      chatId: chat.chatId,
      messageId: slot.id,
      intent: { replyMedia: "text+image", carryReasoning: "conversation" },
    });
    await image.h.root.settleBackground();
    const before = await held.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
    if (before === undefined) {
      throw new Error("the continued native slot lost its actual selected variant");
    }
    return { chatId: chat.chatId, slot, before };
  };
  const lifetime = construction.move();
  return { image, held, continuation, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Produce continuation state through real generation and guest execution, never a hand-built snapshot. */
export async function signedContinuation(): Promise<SignedRoom & SignedContinuation> {
  await using construction = new AsyncDisposableStack();
  const room = construction.use(await signedRoom());
  const continued = await room.continuation();
  const lifetime = construction.move();
  return { ...room, ...continued, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
