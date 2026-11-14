// domain/chat/persistence/anchor — the room pin as `ChatDetailData` carries it: the pin's standing from the
// human-seat lens (`substrate/participants-humans.ts`), plus the owner lookup a held pin needs.

import type { AnchorState } from "@orb/contracts/chat";
import type { Handle, PersonaId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import { resolveAnchorState } from "../substrate/participants-humans.ts";
import { loadPersonaOwnerId } from "./identity.ts";

/** The room's pin as `ChatDetailData` carries it: how it stands, and for a `held` pin the handle of the player
 *  whose persona it is. A live pin's player is on the roster already, so only a held one is looked up. */
export interface ResolvedAnchor {
  readonly state: AnchorState;
  readonly ownerHandle: Handle | null;
}

export async function resolveAnchor(
  ctx: Pick<ChatContext, "db" | "resolveUserEnabled" | "verifyPersonaOwned" | "resolveUserPublics">,
  participants: Parameters<typeof resolveAnchorState>[1],
  anchorPersonaId: PersonaId | null,
): Promise<ResolvedAnchor> {
  const state = await resolveAnchorState(ctx, participants, anchorPersonaId);
  if (state !== "held" || anchorPersonaId === null) {
    return { state, ownerHandle: null };
  }
  const ownerId = await loadPersonaOwnerId(ctx.db, anchorPersonaId);
  const publics = ownerId === null ? null : await ctx.resolveUserPublics(ownerId, anchorPersonaId);
  return { state, ownerHandle: publics?.handle ?? null };
}
