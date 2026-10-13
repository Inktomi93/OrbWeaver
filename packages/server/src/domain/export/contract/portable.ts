import type { Principal } from "@orb/contracts/identity";
import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ExportDocument, ListOwnedDocumentIds } from "#domain/databank";
import type { PersonaService } from "#domain/persona";
import type { ExportPresets } from "#domain/preset";
import type { ExportRegexScripts } from "#domain/regex";
import type { ExportWorldBook, ListOwnedBookIds } from "#domain/world-info";
import type { ExportService } from "./service.ts";

type ExportOne = (ownerId: UserId) => Promise<PortableFile>;
export interface PortableExportDeps {
  readonly gallery: ExportOne;
  readonly theme: ExportOne;
  readonly userSettings: ExportOne;
  readonly tags: (ownerId: UserId) => Promise<Uint8Array>;
  readonly presets: ExportPresets;
  readonly worldBook: ExportWorldBook;
  readonly listBookIds: ListOwnedBookIds;
  readonly regex: ExportRegexScripts;
  readonly document: ExportDocument;
  readonly listDocumentIds: ListOwnedDocumentIds;
  readonly persona: Pick<PersonaService, "list" | "export">;
  readonly exportService: Pick<ExportService, "exportCharacter" | "exportChatBundle" | "listHostChats">;
  readonly listCharacterIds: (ownerId: UserId) => Promise<readonly CharacterId[]>;
  readonly resolveOwnerPrincipal: (ownerId: UserId) => Promise<Principal>;
}
export interface PortableExports {
  readonly gallery: PortableEntity["exportAll"];
  readonly tag: PortableEntity["exportAll"];
  readonly theme: PortableEntity["exportAll"];
  readonly userSettings: PortableEntity["exportAll"];
  readonly preset: PortableEntity["exportAll"];
  readonly worldInfo: PortableEntity["exportAll"];
  readonly regex: PortableEntity["exportAll"];
  readonly databank: PortableEntity["exportAll"];
  readonly persona: PortableEntity["exportAll"];
  readonly character: PortableEntity["exportAll"];
  readonly chat: PortableEntity["exportAll"];
}
