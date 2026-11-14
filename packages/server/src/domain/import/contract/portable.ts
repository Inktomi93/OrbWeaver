import type { ImportDocument } from "@orb/contracts/databank";
import type { Principal, ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { ImportPersonaOp } from "@orb/contracts/persona";
import type { PortableEntity } from "@orb/contracts/portability";
import type { ImportRegexScript } from "@orb/contracts/regex";
import type { TagLibraryImportResult } from "@orb/contracts/tag";
import type { UserId } from "@orb/kit/ids";
import type { ImportContextWiring } from "./build-context.ts";
import type { ImportProfileDeps } from "./service.ts";

export interface OwnerImportDeps {
  readonly resolveOwnerPrincipal: ResolveHostPrincipalOp;
  readonly contextFor: (principal: Principal) => ImportContextWiring;
  readonly wallClockZone: () => string;
  readonly profile: Pick<
    ImportProfileDeps,
    | "now"
    | "bulkImportChats"
    | "bulkImportPersonas"
    | "enqueueImportIndex"
    | "findPersonaByName"
    | "attachChatTagByName"
    | "importRpgGame"
    | "importMemoryStrikes"
    | "findOwnedAssetIdsByHash"
    | "heldChatHashes"
    | "exportCurrentChats"
    | "adoptDefaultPersona"
  >;
}
export interface PortableImportDeps extends OwnerImportDeps {
  readonly tags: (ownerId: UserId, bytes: Uint8Array) => Promise<TagLibraryImportResult>;
  readonly regex: ImportRegexScript;
  readonly document: ImportDocument;
  readonly persona: { readonly import: ImportPersonaOp };
}
export interface PortableImports {
  readonly tag: PortableEntity["importFile"];
  readonly regex: PortableEntity["importFile"];
  readonly databank: PortableEntity["importFile"];
  readonly persona: PortableEntity["importFile"];
  readonly character: PortableEntity["importFile"];
  readonly chat: PortableEntity["importFile"];
}
