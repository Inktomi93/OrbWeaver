import { createImportAvatarStore } from "#domain/assets";
import type { ImportCharacterPort } from "#domain/character";
import { createCharacterImportOps } from "#domain/character";
import type { ImportReport, ProfileDirImportDeps as ProfileDirectoryDeps } from "#domain/import";
import { runProfileDirectory } from "#domain/import";
import { createImportedCardTag } from "#domain/tag";

/** The graph supplies character binders while the import owner decides the run. */
// @orb-waive no-inline-package-interface(ProfileDirImportDeps): baselined when the gate landed; burn-down item 952.
export interface ProfileDirImportDeps extends Pick<ProfileDirectoryDeps, Exclude<keyof ProfileDirectoryDeps, "contextFor">> {
  readonly character: ImportCharacterPort;
}

export function runProfileDirImport(deps: ProfileDirImportDeps): Promise<ImportReport> {
  const { character, ...ownerOps } = deps;
  return runProfileDirectory({
    ...ownerOps,
    contextFor: (principal, store) => ({
      principal,
      characterOps: createCharacterImportOps(principal, character),
      storeAsset: createImportAvatarStore(principal, store),
      attachCardTag: createImportedCardTag(principal.userId, deps.attachCardTag),
    }),
  });
}
