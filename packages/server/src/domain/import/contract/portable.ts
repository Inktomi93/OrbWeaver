import type { Principal } from "@orb/contracts/identity";
import type { PortableEntity } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { ImportDocument } from "#domain/databank";
import type { PersonaService } from "#domain/persona";
import type { ImportRegexScript } from "#domain/regex";
import type { TagLibraryImportResult } from "#domain/tag";
import type { ImportContextWiring } from "./build-context.ts";
import type { ImportProfileDeps } from "./service.ts";

export interface OwnerImportDeps {
  readonly resolveOwnerPrincipal: (ownerId: UserId) => Promise<Principal>;
  readonly contextFor: (principal: Principal) => ImportContextWiring;
  readonly wallClockZone: () => string;
  readonly profile: Pick<
    ImportProfileDeps,
    "now" | "bulkImportChats" | "bulkImportPersonas" | "enqueueImportIndex" | "reconcileStats" | "findPersonaByName" | "attachChatTagByName" | "importRpgGame"
  >;
}
export interface PortableImportDeps extends OwnerImportDeps {
  readonly tags: (ownerId: UserId, bytes: Uint8Array) => Promise<TagLibraryImportResult>;
  readonly regex: ImportRegexScript;
  readonly document: ImportDocument;
  readonly persona: Pick<PersonaService, "import">;
}
export interface PortableImports {
  readonly tag: PortableEntity["importFile"];
  readonly regex: PortableEntity["importFile"];
  readonly databank: PortableEntity["importFile"];
  readonly persona: PortableEntity["importFile"];
  readonly character: PortableEntity["importFile"];
  readonly chat: PortableEntity["importFile"];
}
