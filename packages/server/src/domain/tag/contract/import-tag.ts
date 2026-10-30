import type { AttachCardTagByNameParams } from "@orb/contracts/tag";

export type AttachImportedCardTag = (params: Pick<AttachCardTagByNameParams, "characterId" | "tagName">) => Promise<boolean>;
