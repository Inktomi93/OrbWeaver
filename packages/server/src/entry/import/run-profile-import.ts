import type { Principal } from "@orb/contracts/identity";
import type { CardImportResult } from "@orb/contracts/import";
import type { ImportAssetPort } from "#domain/assets";
import { createImportAvatarStore } from "#domain/assets";
import type { ImportCharacterPort } from "#domain/character";
import { createCharacterImportOps } from "#domain/character";
import type { ImportFile, RestoreCharacterBookResult } from "#domain/import";
import { buildImportContext, createImportService, importCardBatch } from "#domain/import";
import type { ImportCardScripts } from "#domain/regex";
import type { ImportTagPort } from "#domain/tag";
import { createImportedCardTag } from "#domain/tag";
import type { ImportWorldInfoPort } from "#domain/world-info";

// @orb-waive no-inline-package-interface(ProfileImportDeps): baselined when the gate landed; burn-down item 952.
export interface ProfileImportDeps {
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly assets: ImportAssetPort;
  readonly tag: ImportTagPort;
  /** When composed, embedded card lorebooks import to world_books/character_books. */
  readonly worldInfo?: ImportWorldInfoPort;
  /** When composed, a card's embedded regex scripts land as library rows attached to the character — the same
   *  lift the profile-dir driver and the bundle restore compose, so no door drops a card's scripts. */
  readonly importCardScripts?: ImportCardScripts;
  readonly files: readonly ImportFile[];
}

/** What the #1598 RESTORE door needs: the same card-import wiring, plus the ONE card file whose embedded
 *  lorebook the owner is asking to re-assert. `worldInfo` is REQUIRED here (unlike the batch import, whose
 *  card-only arm legitimately skips embedded books) — a restore with no lorebook write op could only refuse. */
// @orb-waive no-inline-package-interface(CardLorebookRestoreDeps): baselined when the gate landed; burn-down item 952.
export interface CardLorebookRestoreDeps extends Omit<ProfileImportDeps, "files" | "worldInfo"> {
  readonly worldInfo: ImportWorldInfoPort;
  readonly file: ImportFile;
}

export type { ImportFile } from "#domain/import";

/** The card-only per-owner `ImportContext`, in ONE place: both card doors (the batch import and the #1598
 *  lorebook restore) compose the identical wiring, so a port that lands on one arm can never be missing from
 *  the other. */
function cardImportService(deps: Omit<ProfileImportDeps, "files">): ReturnType<typeof createImportService> {
  const { principal, character, assets, tag, worldInfo, importCardScripts } = deps;
  return createImportService(
    buildImportContext({
      principal,
      characterOps: createCharacterImportOps(principal, character),
      storeAsset: createImportAvatarStore(principal, (args) => assets.store(args)),
      attachCardTag: createImportedCardTag(principal.userId, (args) => tag.attachCardTagByName(args)),
      ...(worldInfo !== undefined
        ? { importLorebook: worldInfo.importLorebook, hasPrimaryBook: worldInfo.hasPrimaryBook, linkCarriedBooks: worldInfo.linkCarriedBooks }
        : {}),
      ...(importCardScripts !== undefined ? { importCardScripts } : {}),
    }),
  );
}

/**
 * Re-assert one uploaded card file's embedded lorebook over the character those bytes imported as (#1598 —
 * the explicit, owner-asked-for half of the non-destructive re-upload). Never throws for a bad/unmatched
 * card: the verb returns the refusal the route renders.
 */
export async function runCardLorebookRestore(deps: CardLorebookRestoreDeps): Promise<RestoreCharacterBookResult> {
  const { file, ...wiring } = deps;
  return await cardImportService(wiring).restoreCharacterBook({
    card: { bytes: file.bytes, ...(file.filename !== undefined && { filename: file.filename }) },
  });
}

export function runProfileImport(deps: ProfileImportDeps): Promise<CardImportResult> {
  return importCardBatch({ service: cardImportService(deps), files: deps.files });
}
