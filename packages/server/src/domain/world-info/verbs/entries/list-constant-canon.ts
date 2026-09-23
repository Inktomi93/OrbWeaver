// verb: listConstantCanon — a chat's CONSTANT ("always"-scope) lorebook canon (docs/plans/rpg/design.md: "only
// constant entries exist pre-play"). Principal-LESS: a chat's attached books are room-public prompt content
// (the caller gated membership upstream — the rpg crew gated its run), mirroring `listChatBooks`'s
// not-owner-filtered read. Projects title+content only; the persistence query resolves each entry's scope.

import type { LoreConstantCanonRow } from "@orb/contracts/world-info";
import type { WorldInfoContext } from "../../context.ts";
import type { ListConstantCanonParams } from "../../contract/params.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { listChatConstantCanon } from "../../persistence/queries.ts";

export function createListConstantCanon(ctx: WorldInfoContext): WorldInfoService["listConstantCanon"] {
  return ({ chatId }: ListConstantCanonParams): Promise<readonly LoreConstantCanonRow[]> => listChatConstantCanon(ctx.db, chatId);
}
