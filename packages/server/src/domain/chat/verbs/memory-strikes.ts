// verbs: memoryView / strikeMemory / restoreMemory — the room's story memory in plain parts, and the host's strike
// and restore of one remembered item. What a strike names and what the view lists live in
// `substrate/memory-strikes.ts`; this file owns the gates and the emits.
//
// ONLY THE HOST STRIKES. A strike changes what every speaker in the room recalls, so it is room configuration, the
// same authority as the room's notes (`saveCorrection`, `deleteChatInjection`); a member reads the view, clamped to
// their history floor, and is refused the write with `not_host`.

import type { MemoryView, StrikeMemoryResult } from "@orb/contracts/chat";
import type { ChatContext } from "../contract/context.ts";
import type { EmitDurableChatEventOp } from "../contract/engine-context.ts";
import type { MemoryViewParams, RestoreMemoryParams, StrikeMemoryParams } from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import { requireHost, requireParticipant } from "../guard.ts";
import { buildMemoryView, dropMemoryStrike, writeMemoryStrike } from "../substrate/memory-strikes.ts";

export type MemoryStrikeVerbs = Pick<ChatService, "memoryView" | "strikeMemory" | "restoreMemory">;

function createMemoryView(ctx: ChatContext): ChatService["memoryView"] {
  return async ({ principal, chatId }: MemoryViewParams): Promise<MemoryView> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    return await buildMemoryView(ctx, { chatId, floor: membership.historyFloorSeq });
  };
}

/** A repeated strike on a struck item answers the standing strike and announces nothing. */
function createStrikeMemory(ctx: ChatContext, emit: EmitDurableChatEventOp): ChatService["strikeMemory"] {
  return async ({ principal, chatId, item }: StrikeMemoryParams): Promise<StrikeMemoryResult> => {
    await requireHost(ctx, principal, chatId);
    const { strikeId, inserted } = await writeMemoryStrike(ctx, { chatId, hostUserId: principal.userId, item });
    if (inserted) {
      await emit({ type: "chatUpdated", chatId });
    }
    return { strikeId };
  };
}

/** Idempotent like `deleteChatInjection`: a repeated or foreign strike id writes nothing and announces nothing. */
function createRestoreMemory(ctx: ChatContext, emit: EmitDurableChatEventOp): ChatService["restoreMemory"] {
  return async ({ principal, chatId, strikeId }: RestoreMemoryParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    if (await dropMemoryStrike(ctx, chatId, strikeId)) {
      await emit({ type: "chatUpdated", chatId });
    }
  };
}

export function createMemoryStrikes(ctx: ChatContext, deps: { readonly emit: EmitDurableChatEventOp }): MemoryStrikeVerbs {
  return {
    memoryView: createMemoryView(ctx),
    strikeMemory: createStrikeMemory(ctx, deps.emit),
    restoreMemory: createRestoreMemory(ctx, deps.emit),
  };
}
