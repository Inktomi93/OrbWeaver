// The dry run's preview, built off the collect result. Every name is hostile file content: it is clipped here,
// and a skip names a path relative to the profile, never the staging directory. A skip's reason is written here,
// one per kind of skip; the importer's own detail stays in the report and the logs.

import type { ImportKindCounts, ImportPreview, ImportPreviewItem, ImportPreviewKind, ImportPreviewList, ImportPreviewSkip } from "@orb/contracts/import";
import { IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_TEXT_MAX } from "@orb/contracts/import";
import type { CollectedChat } from "../contract/collection.ts";
import type { ImportOwnership, ProfileCollected } from "../contract/profile-directory.ts";
import type { GroupRefusal } from "./group.ts";
import { partitionGroups } from "./group.ts";

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
function chatItems(owner: string, chats: readonly CollectedChat[], held: ReadonlySet<CollectedChat>): ImportPreviewItem[] {
  return chats.map((chat) => listed(chat, held, item(chat.sourceFile, `${owner}: ${chat.importedFrom.replace(JSONL_EXT, "")}`)));
}

function skip(source: string, reason: string): ImportPreviewSkip {
  return { source: clip(source), reason: clip(reason) };
}

const GROUP_SKIP_REASONS: Readonly<Record<GroupRefusal, string>> = {
  "no-member": "none of this group's member cards are in the folder",
  "no-transcript": "this group has no readable chat file",
};

/** The groups a run refuses, which the preview lists as skips. */
export function refusedGroups(collected: ProfileCollected): ReturnType<typeof partitionGroups>["refused"] {
  return partitionGroups(
    collected.groups,
    collected.bundles.map((bundle) => bundle.filename),
  ).refused;
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
    ...collected.unreadableGroups.map((file) => skip(file, "not a readable group")),
    ...refusedGroups(collected).map(({ group, refusal }) => skip(group.sourceFile, GROUP_SKIP_REASONS[refusal])),
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

/** The item for a collected entry, flagged when the owner already holds that very entry. */
function listed<Entry>(entry: Entry, held: ReadonlySet<Entry>, base: ImportPreviewItem): ImportPreviewItem {
  return held.has(entry) ? { ...base, inLibrary: true as const } : base;
}

/** Every item the folder holds, by kind. The one enumeration both the preview's lists and the run's counts take;
 *  a group the run refuses is a skip, and so are its transcripts. */
function kindItems(collected: ProfileCollected, owned: ImportOwnership): Readonly<Record<ImportPreviewKind, readonly ImportPreviewItem[]>> {
  const { importable } = partitionGroups(
    collected.groups,
    collected.bundles.map((bundle) => bundle.filename),
  );
  return {
    characters: collected.bundles.map((bundle) => listed(bundle, owned.characters, item(bundle.filename, bundle.cardName))),
    chats: [
      ...collected.bundles.flatMap((bundle) => chatItems(bundle.cardName, bundle.chats, owned.chats)),
      ...importable.flatMap((group) => chatItems(group.parsed.name, group.chats, owned.chats)),
      ...collected.orphanBundles.flatMap((orphan) => chatItems(orphan.dirName, orphan.chats, owned.chats)),
    ],
    personas: collected.personas.map((persona) => {
      const base = item(persona.parsed.avatarFile, persona.parsed.name);
      return listed(persona, owned.personas, persona.avatarBytes === undefined ? { ...base, withoutArt: true as const } : base);
    }),
    worlds: collected.worlds.map((world) => listed(world, owned.worlds, item(world.book.name, world.book.name))),
    presets: collected.presets.map((preset) => listed(preset, owned.presets, item(preset.sourceFile, preset.parsed.name))),
    themes: collected.themes.map((theme) => listed(theme, owned.themes, item(theme.sourceFile, theme.parsed.name))),
    backgrounds: collected.backgrounds.map((background) => listed(background, owned.backgrounds, item(background.filename, background.name))),
    groups: importable.map((group) => listed(group, owned.groups, item(group.sourceFile, group.parsed.name))),
    orphans: collected.orphanBundles.map((orphan) => listed(orphan, owned.orphans, item(orphan.dirName, orphan.dirName))),
  };
}

const NOTHING_OWNED: ImportOwnership = {
  characters: new Set(),
  chats: new Set(),
  personas: new Set(),
  worlds: new Set(),
  presets: new Set(),
  themes: new Set(),
  backgrounds: new Set(),
  groups: new Set(),
  orphans: new Set(),
};

/** How many items of each kind the folder holds: the numbers the preview lists carry and a real run reports. */
export function countImportKinds(collected: ProfileCollected): ImportKindCounts {
  const items = kindItems(collected, NOTHING_OWNED);
  return {
    characters: items.characters.length,
    chats: items.chats.length,
    personas: items.personas.length,
    worlds: items.worlds.length,
    presets: items.presets.length,
    themes: items.themes.length,
    backgrounds: items.backgrounds.length,
    groups: items.groups.length,
    orphans: items.orphans.length,
  };
}

/** `owned` holds, per kind, the collected entries the owner already has. */
export function buildImportPreview(collected: ProfileCollected, owned: ImportOwnership): ImportPreview {
  const skipped = skippedItems(collected);
  const items = kindItems(collected, owned);
  return {
    kinds: {
      characters: listOf(items.characters),
      chats: listOf(items.chats),
      personas: listOf(items.personas),
      worlds: listOf(items.worlds),
      presets: listOf(items.presets),
      themes: listOf(items.themes),
      backgrounds: listOf(items.backgrounds),
      groups: listOf(items.groups),
      orphans: listOf(items.orphans),
    },
    skipped: { total: skipped.length, items: skipped.slice(0, IMPORT_PREVIEW_LIST_MAX) },
  };
}
