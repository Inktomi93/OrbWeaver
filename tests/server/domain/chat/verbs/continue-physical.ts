// Native signed tool exchanges create the restore snapshot; the only extra seam is a held database driver.

import type { TurnOutcome } from "@orb/contracts/chat";
import { closeDb, messageVariants } from "@orb/db";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { imageRoom, nativeText, nativeTool } from "../engine/inline-image-physical.ts";

/** Produce continuation state through real generation and guest execution, never a hand-built snapshot. */
export async function signedContinuation(): Promise<
  AsyncDisposable & {
    readonly image: Awaited<ReturnType<typeof imageRoom>>;
    readonly held: Awaited<ReturnType<typeof freshHeldDb>>;
    readonly slot: TurnOutcome["messages"][number];
    readonly before: typeof messageVariants.$inferSelect;
  }
> {
  await using construction = new AsyncDisposableStack();
  const held = await freshHeldDb();
  construction.defer(() => closeDb(held.db));
  const image = construction.use(
    await imageRoom(
      [[nativeTool()], [nativeText("Base.", "base-private")], [nativeTool()], [nativeText("A.", "a-private")], [nativeTool()], [nativeText("B.", "b-private")]],
      true,
      { db: held.db },
    ),
  );
  const outcome = await image.turn();
  const slot = outcome.messages[0];
  if (slot === undefined) {
    throw new Error("the native tool generation created no assistant slot");
  }
  await image.h.root.services.chat.continueTurn({
    principal: image.h.owner,
    chatId: image.h.chatId,
    messageId: slot.id,
    intent: { replyMedia: "text+image", carryReasoning: "conversation" },
  });
  await image.h.root.settleBackground();
  const before = await held.db.select().from(messageVariants).where(eq(messageVariants.id, slot.selectedVariantId)).get();
  if (before === undefined) {
    throw new Error("the continued native slot lost its actual selected variant");
  }
  const lifetime = construction.move();
  return { image, held, slot, before, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
