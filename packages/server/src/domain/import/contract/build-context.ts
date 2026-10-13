import type { Principal } from "@orb/contracts/identity";
import type { ImportContext } from "./service.ts";

/** Already-bound owner operations; the import coordinator owns no foreign persistence or role mint. */
export interface ImportContextWiring
  extends Pick<ImportContext, "storeAsset" | "attachCardTag" | "importLorebook" | "hasPrimaryBook" | "linkCarriedBooks" | "importCardScripts" | "profile"> {
  readonly principal: Principal;
  readonly characterOps: Pick<ImportContext, "createCharacter" | "findByImportHash" | "findByHandle" | "findByName" | "attachImportedArt">;
}
