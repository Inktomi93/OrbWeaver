import type { AttachCardTagByNameParams } from "./params.ts";
import type { TagService } from "./service.ts";

export type ImportTagPort = Pick<TagService, "attachCardTagByName">;
export type AttachImportedCardTag = (params: Pick<AttachCardTagByNameParams, "characterId" | "tagName">) => Promise<boolean>;
