// Optional planes remain absent, not fabricated no-ops; bound owner factories retain their admission rules.
import type { ImportContextWiring } from "../contract/build-context.ts";
import type { ImportContext } from "../contract/service.ts";

export function buildImportContext(wiring: ImportContextWiring): ImportContext {
  const { principal, characterOps, storeAsset, attachCardTag, importLorebook, hasPrimaryBook, linkCarriedBooks, importCardScripts, profile } = wiring;
  return {
    ownerId: principal.userId,
    ...characterOps,
    storeAsset,
    attachCardTag,
    ...(importLorebook !== undefined ? { importLorebook } : {}),
    ...(hasPrimaryBook !== undefined ? { hasPrimaryBook } : {}),
    ...(linkCarriedBooks !== undefined ? { linkCarriedBooks } : {}),
    ...(importCardScripts !== undefined ? { importCardScripts } : {}),
    ...(profile !== undefined ? { profile } : {}),
  };
}
