// Importing applies author-shipped tags; model suggestions keep their separate approval flow.
import type { AttachCardTagByNameOp } from "@orb/contracts/tag";
import type { UserId } from "@orb/kit/ids";
import type { AttachImportedCardTag } from "../contract/import-tag.ts";

export function createImportedCardTag(ownerId: UserId, attach: AttachCardTagByNameOp): AttachImportedCardTag {
  return ({ characterId, tagName }): ReturnType<AttachImportedCardTag> => attach({ ownerId, characterId, tagName, source: "card", status: "accepted" });
}
