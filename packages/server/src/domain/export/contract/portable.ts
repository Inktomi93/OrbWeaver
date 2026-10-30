import type { ExportDocument, ListOwnedDocumentIds } from "@orb/contracts/databank";
import type { ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { ExportPersonaOp, ListPersonasOp } from "@orb/contracts/persona";
import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { ExportPresets } from "@orb/contracts/preset";
import type { ExportRegexScripts } from "@orb/contracts/regex";
import type { ExportWorldBook, ListOwnedBookIds } from "@orb/contracts/world-info";
import type { CharacterId, UserId } from "@orb/kit/ids";
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
  readonly persona: { readonly list: ListPersonasOp; readonly export: ExportPersonaOp };
  readonly exportService: Pick<ExportService, "exportCharacter" | "exportChatBundle" | "listHostChats">;
  readonly listCharacterIds: (ownerId: UserId) => Promise<readonly CharacterId[]>;
  readonly resolveOwnerPrincipal: ResolveHostPrincipalOp;
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
