// The dry run's preview, built off the collect result. Every name is hostile file content: it is clipped here.
// An entry or a skip is named by its source: the profile directory it sits in and its path inside that profile,
// never the staging directory, so two profiles of one upload that share a relative path stay two entries and two
// skips. Two directory names that clip alike are shown under distinct labels. A skip at the upload's root, beside the
// profiles, has no profile. An entry a run writes nothing for says why (the owner holds it, or an earlier entry of the
// upload lands it), so the entries without a flag are the ones a run writes. Each entry also carries digests of the
// keys its owner compares it by, which the client's merge reads to find equal content across uploads. A skip's reason is written here, one per
// kind of skip; the importer's own detail stays in the report and the logs.

import type {
  ImportAnswer,
  ImportKindCounts,
  ImportPreview,
  ImportPreviewItem,
  ImportPreviewKind,
  ImportPreviewList,
  ImportPreviewSkip,
  ImportReuse,
} from "@orb/contracts/import";
import { IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_TEXT_MAX } from "@orb/contracts/import";
import { sha256Hex } from "#primitives/content-hash";
import type { CollectedChat, CollectedGroup, CollectResult } from "../contract/collection.ts";
import type { ImportOwnership, ProfileCollected } from "../contract/profile-directory.ts";
import type { GroupRefusal } from "./group.ts";
import { partitionGroups } from "./group.ts";

const JSONL_EXT = /\.jsonl$/iu;

function clip(text: string): string {
  return text.slice(0, IMPORT_PREVIEW_TEXT_MAX).toWellFormed();
}

/** One profile directory's result under the name the preview shows it by. */
interface LabeledProfile {
  readonly label: string;
  readonly result: CollectResult;
}

/** The names the profiles are shown by: clipped, and distinct. Two directory names that clip alike would read as one
 *  profile and merge their entries, so the later one takes the next free ordinal. */
function labelProfiles(profiles: ProfileCollected["profiles"]): readonly LabeledProfile[] {
  const taken = new Set<string>();
  return profiles.map(({ name, result }) => {
    let label = clip(name);
    for (let ordinal = 2; taken.has(label); ordinal += 1) {
      const suffix = ` (${String(ordinal)})`;
      label = `${clip(name.slice(0, IMPORT_PREVIEW_TEXT_MAX - suffix.length))}${suffix}`;
    }
    taken.add(label);
    return { label, result };
  });
}

/** An item before its dry-run answer joins it: where it sits and what it is named. */
type ItemBase = Omit<ImportPreviewItem, "identities">;

function item(profile: string, path: string, name: string): ItemBase {
  return { source: { profile: clip(profile), path: clip(path) }, name: clip(name) };
}

function listOf(items: readonly ImportPreviewItem[]): ImportPreviewList {
  return { total: items.length, items: items.slice(0, IMPORT_PREVIEW_LIST_MAX) };
}

/** What an item's keys are on the wire: digests, so the preview never carries the file content a key is built from.
 *  An item with more keys than a list holds (a group with that many transcripts) has none and cannot be compared. */
function keyDigests(answer: ImportAnswer | undefined): string[] {
  const keys = answer?.keys ?? [];
  return keys.length > IMPORT_PREVIEW_LIST_MAX ? [] : keys.map((key) => sha256Hex(key));
}

/** Chat files repeat their names across characters and a card's name need not be unique, so a chat's source is its path. */
function chatItems(profile: string, owner: string, chats: readonly CollectedChat[], judged: ReadonlyMap<CollectedChat, ImportAnswer>): ImportPreviewItem[] {
  return chats.map((chat) => listed(chat, judged, item(profile, chat.sourceFile, `${owner}: ${chat.importedFrom.replace(JSONL_EXT, "")}`)));
}

/** A skip at the upload's root, beside the profiles, has no profile. */
function skip(profile: string | null, path: string, reason: string): ImportPreviewSkip {
  return { source: { profile: profile === null ? null : clip(profile), path: clip(path) }, reason: clip(reason) };
}

const GROUP_SKIP_REASONS: Readonly<Record<GroupRefusal, string>> = {
  "no-member": "none of this group's member cards are in the folder",
  "no-transcript": "this group has no readable chat file",
};

/** The groups a run refuses, which the preview lists as skips. A member resolves against every profile's cards:
 *  the run seats a group by card filename across the whole upload. */
export function refusedGroups(collected: ProfileCollected): ReturnType<typeof partitionGroups>["refused"] {
  return partitionGroups(
    collected.groups,
    collected.bundles.map((bundle) => bundle.filename),
  ).refused;
}

function profileSkips({ label, result }: LabeledProfile, refused: ReadonlyMap<CollectedGroup, GroupRefusal>): ImportPreviewSkip[] {
  const at = (path: string, reason: string): ImportPreviewSkip => skip(label, path, reason);
  const planeFiles = [
    { count: result.databankFileCount, plane: "user/files/", one: "Data Bank file", many: "Data Bank files" },
    { count: result.galleryImageCount, plane: "user/images/", one: "gallery image", many: "gallery images" },
  ];
  return [
    ...result.unreadableCards.map((file) => at(file, "not a readable character card")),
    ...result.invalidCards.map(({ file, reason }) => at(file, reason)),
    ...result.skippedChats.map((file) => at(file, "the chat file is over the size limit")),
    ...result.groups.flatMap((group) => group.missingChatLeaves).map((leaf) => at(leaf, "a group lists this chat, but its file is missing or unreadable")),
    ...result.unreadableGroups.map((file) => at(file, "not a readable group")),
    ...result.groups.flatMap((group) => {
      const refusal = refused.get(group);
      return refusal === undefined ? [] : [at(group.sourceFile, GROUP_SKIP_REASONS[refusal])];
    }),
    ...result.unreadableWorlds.map((file) => at(file, "not a readable world book")),
    ...result.unreadablePresets.map((file) => at(file, "not a readable preset")),
    ...result.refusedThemes.map(({ file }) => at(file, "this theme could not be converted")),
    ...result.skippedBackgrounds.map(({ file }) => at(file, "not an image or video file")),
    ...result.truncatedDirs.map(({ dir, kept, total }) =>
      at(dir.split(/[\\/]/u).at(-1) ?? dir, `only the first ${String(kept)} of ${String(total)} entries are read`),
    ),
    ...planeFiles
      .filter(({ count }) => count > 0)
      .map(({ count, plane, one, many }) => at(plane, `${String(count)} ${count === 1 ? one : many} not imported yet`)),
    ...[...new Set(result.unhandled)].map((entry) => at(entry, "SillyTavern data that does not import")),
    ...[...new Set(result.unhandledSettings)].map((entry) => at(entry, "a SillyTavern setting that does not import")),
  ];
}

function skippedItems(collected: ProfileCollected): ImportPreviewSkip[] {
  const refused = new Map(refusedGroups(collected).map(({ group, refusal }) => [group, refusal]));
  return [
    ...labelProfiles(collected.profiles).flatMap((profile) => profileSkips(profile, refused)),
    ...collected.rootUnhandled.map((entry) => skip(null, entry, "SillyTavern data that does not import")),
  ];
}

const REUSE_FLAGS = {
  library: { inLibrary: true },
  upload: { repeat: true },
} as const satisfies Readonly<Record<ImportReuse, Partial<ImportPreviewItem>>>;

/** The item for a collected entry, with its keys and flagged with why a run writes nothing for that very entry, when
 *  it writes none. */
function listed<Entry>(entry: Entry, judged: ReadonlyMap<Entry, ImportAnswer>, base: ItemBase): ImportPreviewItem {
  const answer = judged.get(entry);
  const keyed = { ...base, identities: keyDigests(answer) };
  return answer === undefined || answer.reuse === null ? keyed : { ...keyed, ...REUSE_FLAGS[answer.reuse] };
}

/** The items one profile directory holds. `importable` is judged over the whole upload, so a group's verdict does not
 *  depend on which profile the walk is in. */
function profileKindItems(
  { label: name, result }: LabeledProfile,
  importable: ReadonlySet<CollectedGroup>,
  owned: ImportOwnership,
): Readonly<Record<ImportPreviewKind, readonly ImportPreviewItem[]>> {
  const groups = result.groups.filter((group) => importable.has(group));
  return {
    characters: result.bundles.map((bundle) => listed(bundle, owned.characters, item(name, bundle.filename, bundle.cardName))),
    chats: [
      ...result.bundles.flatMap((bundle) => chatItems(name, bundle.cardName, bundle.chats, owned.chats)),
      ...groups.flatMap((group) => chatItems(name, group.parsed.name, group.chats, owned.chats)),
      ...result.orphanBundles.flatMap((orphan) => chatItems(name, orphan.dirName, orphan.chats, owned.chats)),
    ],
    personas: result.personas.map((persona) => {
      const base = item(name, persona.parsed.avatarFile, persona.parsed.name);
      return listed(persona, owned.personas, persona.avatarBytes === undefined ? { ...base, withoutArt: true as const } : base);
    }),
    worlds: result.worlds.map((world) => listed(world, owned.worlds, item(name, world.sourceFile, world.book.name))),
    presets: result.presets.map((preset) => listed(preset, owned.presets, item(name, preset.sourceFile, preset.parsed.name))),
    themes: result.themes.map((theme) => listed(theme, owned.themes, item(name, theme.sourceFile, theme.parsed.name))),
    backgrounds: result.backgrounds.map((background) => listed(background, owned.backgrounds, item(name, background.filename, background.name))),
    groups: groups.map((group) => listed(group, owned.groups, item(name, group.sourceFile, group.parsed.name))),
    orphans: result.orphanBundles.map((orphan) => listed(orphan, owned.orphans, item(name, orphan.dirName, orphan.dirName))),
  };
}

/** Every item the folder holds, by kind, profile by profile. The one enumeration both the preview's lists and the
 *  run's counts take; a group the run refuses is a skip, and so are its transcripts. */
function kindItems(collected: ProfileCollected, owned: ImportOwnership): Readonly<Record<ImportPreviewKind, readonly ImportPreviewItem[]>> {
  const importable = new Set(
    partitionGroups(
      collected.groups,
      collected.bundles.map((bundle) => bundle.filename),
    ).importable,
  );
  const perProfile = labelProfiles(collected.profiles).map((profile) => profileKindItems(profile, importable, owned));
  const gather = (kind: ImportPreviewKind): readonly ImportPreviewItem[] => perProfile.flatMap((items) => items[kind]);
  return {
    characters: gather("characters"),
    chats: gather("chats"),
    personas: gather("personas"),
    worlds: gather("worlds"),
    presets: gather("presets"),
    themes: gather("themes"),
    backgrounds: gather("backgrounds"),
    groups: gather("groups"),
    orphans: gather("orphans"),
  };
}

const NOTHING_OWNED: ImportOwnership = {
  characters: new Map(),
  chats: new Map(),
  personas: new Map(),
  worlds: new Map(),
  presets: new Map(),
  themes: new Map(),
  backgrounds: new Map(),
  groups: new Map(),
  orphans: new Map(),
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

/** `owned` holds, per kind, the collected entries a run writes nothing for: the owner has them, or an earlier entry
 *  of the upload lands them. */
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
