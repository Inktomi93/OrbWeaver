// Where a co-located registry definition is allowed to live: `packages/client/src/features/<owner>/lib/
// <id>-<slot>.{ts,tsx}` (client-architecture-lockdown.md §6/§6a/§6d/§8, shell-chrome-unification.md §A/§D).
//
// This is a PATH-SHAPE question about one already-resolved identity, not a corpus selector: it reads a
// repo-relative path a policy was handed, owns no glob, no filesystem access, and no regex over the tree.
// The four definition-integrity policies share it so their co-location law cannot drift apart.

const FEATURE_ROOT = ["packages", "client", "src", "features"] as const;
const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

/** The definition slot a co-located file name ends with, before its extension. */
export const DEFINITION_SLOTS = {
  section: "-section",
  modal: "-modal",
  chrome: "-chrome",
  group: "-group",
  collection: "-collection",
} as const;

export type DefinitionSlot = (typeof DEFINITION_SLOTS)[keyof typeof DEFINITION_SLOTS];

/** The feature that owns `repoRelativePath`'s definition slot, or undefined when the path is not one. */
export function definitionHomeOwner(repoRelativePath: string, slot: DefinitionSlot): string | undefined {
  const segments = repoRelativePath.split("/");
  const [packagesDir, clientDir, srcDir, featuresDir, owner, libDir, file, ...rest] = segments;
  if (
    rest.length > 0 ||
    packagesDir !== FEATURE_ROOT[0] ||
    clientDir !== FEATURE_ROOT[1] ||
    srcDir !== FEATURE_ROOT[2] ||
    featuresDir !== FEATURE_ROOT[3] ||
    libDir !== "lib" ||
    owner === undefined ||
    owner.length === 0 ||
    file === undefined
  ) {
    return;
  }
  return SOURCE_EXTENSIONS.some((extension) => file.endsWith(`${slot}${extension}`) && file.length > slot.length + extension.length) ? owner : undefined;
}

/** Is this repo-relative path the sanctioned co-located home for that definition slot? */
export function isDefinitionHome(repoRelativePath: string, slot: DefinitionSlot): boolean {
  return definitionHomeOwner(repoRelativePath, slot) !== undefined;
}
