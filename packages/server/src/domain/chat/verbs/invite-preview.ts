// The invite preview surface: room name, host handle, member count and mode label, and nothing else (no
// roster identities, no history). One assembly, wired at `service.ts` into the signed-in `previewInvite` verb
// and the signed-out pending-join preview (D254), so the two can never show different fields.

import type { GroupConfig, InvitePreview } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, GROUP_OUTPUT_LABELS, GROUP_POLICY_LABELS } from "@orb/contracts/chat";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import type { AssembleInvitePreviewOp, LoadParticipantViewsOp } from "../contract/context.ts";
import { countPresentMembers } from "../persistence/invites.ts";
import { loadChatRow } from "../persistence/queries.ts";
import { hostSeatOf } from "../substrate/participants-host.ts";

/** A human-readable room-mode label for the invite preview (output × policy), in the words the room's own Group tab
 *  uses — never the raw config values. */
function modeLabel(group: GroupConfig): string {
  return `${GROUP_OUTPUT_LABELS[group.output]} · ${GROUP_POLICY_LABELS[group.policy]}`;
}

/** Build the preview assembly. The caller has already decided the invite may be previewed; a missing room is
 *  the same leak-free NOT_FOUND an invalid token gives. */
export function createInvitePreview(ctx: Pick<ChatContext, "db">, deps: { readonly loadParticipantViews: LoadParticipantViewsOp }): AssembleInvitePreviewOp {
  return async (chatId: ChatId): Promise<InvitePreview> => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined) {
      throw new DomainNotFoundError("invite", "");
    }
    const participants = await deps.loadParticipantViews(chatId);
    const host = hostSeatOf(participants);
    if (host === undefined || host.handle === null) {
      throw new Error(`previewInvite: chat ${chatId} has no host participant`);
    }
    return {
      chatId,
      roomName: chat.title ?? "",
      hostHandle: host.handle,
      memberCount: await countPresentMembers(ctx.db, chatId),
      modeLabel: modeLabel(chat.metadata.group ?? DEFAULT_GROUP_CONFIG),
    };
  };
}
