import type { Principal } from "@orb/contracts/identity";
import type { ImportPersonaOp } from "@orb/contracts/persona";
import type { PortableEntity } from "@orb/contracts/portability";
import type { TagLibraryImportResult } from "@orb/contracts/tag";
import type { UserId } from "@orb/kit/ids";
import type { ImportDocument } from "#domain/databank";
import type { ImportContextWiring } from "./build-context.ts";
import type { ImportProfileDeps } from "./service.ts";

export interface OwnerImportDeps {
  readonly resolveOwnerPrincipal: (ownerId: UserId) => Promise<Principal>;
  readonly contextFor: (principal: Principal) => ImportContextWiring;
  readonly wallClockZone: () => string;
  readonly profile: Pick<
    ImportProfileDeps,
    | "now"
    | "bulkImportChats"
    | "bulkImportPersonas"
    | "enqueueImportIndex"
    | "reconcileStats"
    | "findPersonaByName"
    | "attachChatTagByName"
    | "importRpgGame"
    | "findOwnedAssetIdsByHash"
  >;
}
export interface PortableImportDeps extends OwnerImportDeps {
  readonly tags: (ownerId: UserId, bytes: Uint8Array) => Promise<TagLibraryImportResult>;
  readonly regex: (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<{ readonly created: boolean }>;
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
