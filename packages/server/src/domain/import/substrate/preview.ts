// The dry run's preview, built off the collect result. Every name is hostile file content: it is clipped here,
// and a skip names a path relative to the profile, never the staging directory.

import type { ImportPreview, ImportPreviewItem, ImportPreviewList, ImportPreviewSkip } from "@orb/contracts/import";
import { IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_TEXT_MAX } from "@orb/contracts/import";
import type { CollectedChat } from "../contract/collection.ts";
import type { ProfileCollected } from "../contract/profile-directory.ts";
import { unhandledReason } from "./report.ts";

const JSONL_EXT = /\.jsonl$/iu;
const NOT_IMPORTED = "SillyTavern data with no import";

function clip(text: string): string {
  return text.slice(0, IMPORT_PREVIEW_TEXT_MAX).toWellFormed();
}

function item(source: string, name: string): ImportPreviewItem {
  return { source: clip(source), name: clip(name) };
}

function listOf(items: readonly ImportPreviewItem[]): ImportPreviewList {
  return { total: items.length, items: items.slice(0, IMPORT_PREVIEW_LIST_MAX) };
}

/** Chat files repeat their names across characters, so the owner folder keeps each source distinct. */
function chatItems(owner: string, chats: readonly CollectedChat[]): ImportPreviewItem[] {
  return chats.map((chat) => item(`${owner}/${chat.importedFrom}`, `${owner}: ${chat.importedFrom.replace(JSONL_EXT, "")}`));
}

function skip(source: string, reason: string): ImportPreviewSkip {
  return { source: clip(source), reason: clip(reason) };
}

function skippedItems(collected: ProfileCollected): ImportPreviewSkip[] {
  const unhandled = [...new Set([...collected.unhandled, ...collected.unhandledSettings])];
  const planeFiles = [
    { count: collected.databankFileCount, plane: "user/files/", reason: "Data Bank files are not imported yet" },
    { count: collected.galleryImageCount, plane: "user/images/", reason: "character gallery images are not imported yet" },
  ];
  return [
    ...collected.unreadableCards.map((file) => skip(file, "not a readable character card")),
    ...collected.skippedChats.map((file) => skip(file, "the chat file is over the size limit")),
    ...collected.missingGroupChats.map((leaf) => skip(leaf, "a group lists this chat, but its file is missing or unreadable")),
    ...collected.unreadableGroups.map((file) => skip(file, "not a readable group")),
    ...collected.unreadableWorlds.map((file) => skip(file, "not a readable world book")),
    ...collected.unreadablePresets.map((file) => skip(file, "not a readable preset")),
    ...collected.refusedThemes.map(({ file, reason }) => skip(file, reason)),
    ...collected.skippedBackgrounds.map(({ file, reason }) => skip(file, reason)),
    ...collected.truncatedDirs.map(({ dir, kept, total }) =>
      skip(dir.split("/").at(-1) ?? dir, `only the first ${String(kept)} of ${String(total)} entries are read`),
    ),
    ...planeFiles.filter(({ count }) => count > 0).map(({ count, plane, reason }) => skip(plane, `${String(count)} ${reason}`)),
    ...unhandled.map((name) => skip(name, unhandledReason(name) ?? NOT_IMPORTED)),
  ];
}

/** `inLibrary` holds the card filenames the owner already has. */
export function buildImportPreview(collected: ProfileCollected, inLibrary: ReadonlySet<string>): ImportPreview {
  const skipped = skippedItems(collected);
  return {
    kinds: {
      characters: listOf(
        collected.bundles.map((bundle) => ({
          ...item(bundle.filename, bundle.cardName),
          ...(inLibrary.has(bundle.filename) ? { inLibrary: true as const } : {}),
        })),
      ),
      chats: listOf([
        ...collected.bundles.flatMap((bundle) => chatItems(bundle.cardName, bundle.chats)),
        ...collected.groups.flatMap((group) => chatItems(group.parsed.name, group.chats)),
        ...collected.orphanBundles.flatMap((orphan) => chatItems(orphan.dirName, orphan.chats)),
      ]),
      personas: listOf(collected.personas.map(({ parsed }) => item(parsed.avatarFile, parsed.name))),
      worlds: listOf(collected.worlds.map(({ book }) => item(book.name, book.name))),
      presets: listOf(collected.presets.map(({ parsed, sourceFile }) => item(sourceFile, parsed.name))),
      themes: listOf(collected.themes.map(({ parsed, sourceFile }) => item(sourceFile, parsed.name))),
      backgrounds: listOf(collected.backgrounds.map(({ filename, name }) => item(filename, name))),
      groups: listOf(collected.groups.map(({ parsed }) => item(parsed.name, parsed.name))),
      orphans: listOf(collected.orphanBundles.map(({ dirName }) => item(dirName, dirName))),
    },
    skipped: { total: skipped.length, items: skipped.slice(0, IMPORT_PREVIEW_LIST_MAX) },
  };
}
