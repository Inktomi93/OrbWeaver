import type { AttachCardTagByNameOp, AttachCardTagByNameParams } from "@orb/contracts/tag";

export type AttachSeedCardTag = (params: Pick<AttachCardTagByNameParams, "ownerId" | "characterId" | "tagName">) => ReturnType<AttachCardTagByNameOp>;
