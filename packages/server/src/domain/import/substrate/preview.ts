// The dry run's preview, built off the collect result. Every name is hostile file content: it is clipped here,
// and a skip names a path relative to the profile, never the staging directory. A skip's reason is written here,
// one per kind of skip; the importer's own detail stays in the report and the logs.

import type { ImportPreview, ImportPreviewItem, ImportPreviewList, ImportPreviewSkip } from "@orb/contracts/import";
import { IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_TEXT_MAX } from "@orb/contracts/import";
import type { CollectedChat } from "../contract/collection.ts";
import type { ProfileCollected } from "../contract/profile-directory.ts";

const JSONL_EXT = /\.jsonl$/iu;

function clip(text: string): string {
  return text.slice(0, IMPORT_PREVIEW_TEXT_MAX).toWellFormed();
}

function item(source: string, name: string): ImportPreviewItem {
  return { source: clip(source), name: clip(name) };
}

function listOf(items: readonly ImportPreviewItem[]): ImportPreviewList {
  return { total: items.length, items: items.slice(0, IMPORT_PREVIEW_LIST_MAX) };
}

/** Chat files repeat their names across characters and a card's name need not be unique, so a chat's source is its path. */
function chatItems(owner: string, chats: readonly CollectedChat[]): ImportPreviewItem[] {
  return chats.map((chat) => item(chat.sourceFile, `${owner}: ${chat.importedFrom.replace(JSONL_EXT, "")}`));
}

function skip(source: string, reason: string): ImportPreviewSkip {
  return { source: clip(source), reason: clip(reason) };
}

function skippedItems(collected: ProfileCollected): ImportPreviewSkip[] {
  const planeFiles = [
    { count: collected.databankFileCount, plane: "user/files/", one: "Data Bank file", many: "Data Bank files" },
    { count: collected.galleryImageCount, plane: "user/images/", one: "gallery image", many: "gallery images" },
  ];
  return [
    ...collected.unreadableCards.map((file) => skip(file, "not a readable character card")),
    ...collected.skippedChats.map((file) => skip(file, "the chat file is over the size limit")),
    ...collected.missingGroupChats.map((leaf) => skip(leaf, "a group lists this chat, but its file is missing or unreadable")),
    ...collected.missingPersonaAvatars.map((name) => skip(name, "this persona's avatar file is missing, so it would import without one")),
    ...collected.unreadableGroups.map((file) => skip(file, "not a readable group")),
    ...collected.unreadableWorlds.map((file) => skip(file, "not a readable world book")),
    ...collected.unreadablePresets.map((file) => skip(file, "not a readable preset")),
    ...collected.refusedThemes.map(({ file }) => skip(file, "this theme could not be converted")),
    ...collected.skippedBackgrounds.map(({ file }) => skip(file, "not an image or video file")),
    ...collected.truncatedDirs.map(({ dir, kept, total }) =>
      skip(dir.split("/").at(-1) ?? dir, `only the first ${String(kept)} of ${String(total)} entries are read`),
    ),
    ...planeFiles
      .filter(({ count }) => count > 0)
      .map(({ count, plane, one, many }) => skip(plane, `${String(count)} ${count === 1 ? one : many} not imported yet`)),
    ...[...new Set(collected.unhandled)].map((name) => skip(name, "SillyTavern data that does not import")),
    ...[...new Set(collected.unhandledSettings)].map((name) => skip(name, "a SillyTavern setting that does not import")),
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
      groups: listOf(collected.groups.map(({ parsed, sourceFile }) => item(sourceFile, parsed.name))),
      orphans: listOf(collected.orphanBundles.map(({ dirName }) => item(dirName, dirName))),
    },
    skipped: { total: skipped.length, items: skipped.slice(0, IMPORT_PREVIEW_LIST_MAX) },
  };
}
