import type { AttachCardTagByNameParams } from "./params.ts";
import type { TagService } from "./service.ts";

export type AttachSeedCardTag = (
  params: Pick<AttachCardTagByNameParams, "ownerId" | "characterId" | "tagName">,
) => ReturnType<TagService["attachCardTagByName"]>;
