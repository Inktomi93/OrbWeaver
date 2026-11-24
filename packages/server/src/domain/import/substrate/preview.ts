// The dry run's preview, built off the collect result. Every name is hostile file content: it is clipped here.
// An entry or a skip is named by its source: the profile directory it sits in and its path inside that profile,
// never the staging directory, so two profiles of one upload that share a relative path stay two entries and two
// skips. Clipping is for display: an entry's identity is the digest of its whole source, so two paths that clip alike
// stay two entries, and two directory names that clip alike are shown under distinct labels. A skip at the upload's root, beside the
// profiles, has no profile. An entry a run writes nothing for says why (the owner holds it, or an earlier entry of the
// upload lands it), so the entries without a flag are the ones a run writes. A kind's lists are capped but its counts
// are taken over every entry, so a flag lost past the cap never reads as a write. Each entry also carries digests of the
// keys its owner compares it by, which the client's merge reads to find equal content across uploads, and a digest of its
// source, which lets the merge count an entry that two uploads of one folder both hold once. A skip's reason is written here, one per
// kind of skip; the importer's own detail stays in the report and the logs.

import type { ImportAnswer, ImportKindCounts, ImportPreview, ImportPreviewItem, ImportPreviewKind, ImportPreviewSkip } from "@orb/contracts/import";
import { clipImportText, IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_TEXT_MAX, importPreviewListOf } from "@orb/contracts/import";
import { sha256Hex } from "#primitives/content-hash";
import type { CollectedChat, CollectedGroup, CollectedPreset, CollectResult } from "../contract/collection.ts";
import type { ImportOwnership, ProfileCollected } from "../contract/profile-directory.ts";
import type { GroupRefusal } from "./group.ts";
import { partitionGroups } from "./group.ts";

const JSONL_EXT = /\.jsonl$/iu;

/** One profile directory's result under its own name and the name the preview shows it by. */
interface LabeledProfile {
  readonly name: string;
  readonly label: string;
  readonly result: CollectResult;
}

/** The names the profiles are shown by: clipped, and distinct. Two directory names that clip alike would read as one
 *  profile, so the later one takes the next free ordinal. */
function labelProfiles(profiles: ProfileCollected["profiles"]): readonly LabeledProfile[] {
  const taken = new Set<string>();
  return profiles.map(({ name, result }) => {
    let label = clipImportText(name);
    for (let ordinal = 2; taken.has(label); ordinal += 1) {
      const suffix = ` (${String(ordinal)})`;
      label = `${clipImportText(name.slice(0, IMPORT_PREVIEW_TEXT_MAX - suffix.length))}${suffix}`;
    }
    taken.add(label);
    return { name, label, result };
  });
}

/** An entry's identity: a digest of its whole source, so two paths that clip alike stay two entries. A JSON tuple keeps
 *  a hostile profile or path from reading as the other half of the key. */
function sourceDigestOf(profile: string | null, path: string): string {
  return sha256Hex(JSON.stringify([profile, path]));
}

/** An item before its dry-run answer joins it: where it sits and what it is named. */
type ItemBase = Omit<ImportPreviewItem, "identities">;

function item(profile: LabeledProfile, path: string, name: string): ItemBase {
  return { source: { profile: profile.label, path: clipImportText(path) }, sourceDigest: sourceDigestOf(profile.name, path), name: clipImportText(name) };
}

/** What an item's keys are on the wire: digests, so the preview never carries the file content a key is built from.
 *  An item with more keys than a list holds (a group with that many transcripts) has none and cannot be compared. */
function keyDigests(answer: ImportAnswer | undefined): string[] {
  const keys = answer?.keys ?? [];
  return keys.length > IMPORT_PREVIEW_LIST_MAX ? [] : keys.map((key) => sha256Hex(key));
}

/** Chat files repeat their names across characters and a card's name need not be unique, so a chat's source is its path. */
function chatItems(
  profile: LabeledProfile,
  owner: string,
  chats: readonly CollectedChat[],
  judged: ReadonlyMap<CollectedChat, ImportAnswer>,
): ImportPreviewItem[] {
  return chats.map((chat) => listed(chat, judged, item(profile, chat.sourceFile, `${owner}: ${chat.importedFrom.replace(JSONL_EXT, "")}`)));
}

/** A skip at the upload's root, beside the profiles, has no profile. */
function skip(profile: LabeledProfile | null, path: string, reason: string): ImportPreviewSkip {
  return {
    source: { profile: profile?.label ?? null, path: clipImportText(path) },
    sourceDigest: sourceDigestOf(profile?.name ?? null, path),
    reason: clipImportText(reason),
  };
}

const GROUP_SKIP_REASONS: Readonly<Record<GroupRefusal, string>> = {
  "no-member": "none of this group's member cards are in the folder",
  "no-transcript": "this group has no readable chat file",
};

/** The groups a run refuses, which the preview lists as skips. A member resolves against its own profile's cards,
 *  as the run seats it. */
export function refusedGroups(collected: ProfileCollected): ReturnType<typeof partitionGroups>["refused"] {
  return partitionGroups(collected.profiles).refused;
}

function profileSkips(profile: LabeledProfile, refused: ReadonlyMap<CollectedGroup, GroupRefusal>): ImportPreviewSkip[] {
  const { result } = profile;
  const at = (path: string, reason: string): ImportPreviewSkip => skip(profile, path, reason);
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
    ...result.skippedDocuments.map(({ file, reason }) => at(file, reason)),
    ...result.skippedGalleryImages.map(({ file, reason }) => at(file, reason)),
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

/** The item for a collected entry, with its keys and flagged with why a run writes nothing for that very entry, when
 *  it writes none. */
function listed<Entry>(entry: Entry, judged: ReadonlyMap<Entry, ImportAnswer>, base: ItemBase): ImportPreviewItem {
  const answer = judged.get(entry);
  const keyed = { ...base, identities: keyDigests(answer) };
  return answer === undefined || answer.reuse === null ? keyed : { ...keyed, reuse: answer.reuse };
}

/** A preset's item with what its run does with its own scripts and the fields it leaves behind, each clipped and
 *  capped as a list is. */
function presetItem(profile: LabeledProfile, preset: CollectedPreset, owned: ImportOwnership): ImportPreviewItem {
  const base = listed(preset, owned.presets, item(profile, preset.sourceFile, preset.parsed.name));
  const plan = owned.presetScripts.get(preset) ?? [];
  const regexScripts = preset.parsed.regexScripts.slice(0, Math.min(plan.length, IMPORT_PREVIEW_LIST_MAX)).map((script, i) => {
    const named = { name: clipImportText(script.name) };
    const verdict = plan[i];
    if (verdict === undefined) {
      return named;
    }
    if ("refused" in verdict) {
      return { ...named, refused: clipImportText(verdict.refused) };
    }
    return verdict.reuse === null ? named : { ...named, reuse: verdict.reuse };
  });
  // A script the parse refused is never lifted, so it follows the lifted ones, wherever the preset lands.
  const parseRefused = (owned.presets.get(preset)?.keys.length ?? 0) > 0 ? preset.parsed.refusedScripts : [];
  const scriptList = [...regexScripts, ...parseRefused.map(({ name, reason }) => ({ name: clipImportText(name), refused: clipImportText(reason) }))].slice(
    0,
    IMPORT_PREVIEW_LIST_MAX,
  );
  const leftOut = preset.parsed.unmapped
    .slice(0, IMPORT_PREVIEW_LIST_MAX)
    .map(({ field, reason }) => ({ field: clipImportText(field), reason: clipImportText(reason) }));
  // Only a preset the run creates gains the sections; a reused one holds them already.
  const lands = owned.presets.get(preset)?.reuse === null;
  const addedSections = lands ? preset.parsed.addedSections.map(clipImportText) : [];
  return {
    ...base,
    ...(scriptList.length > 0 ? { regexScripts: scriptList } : {}),
    ...(leftOut.length > 0 ? { leftOut } : {}),
    ...(addedSections.length > 0 ? { addedSections } : {}),
  };
}

/** The items one profile directory holds. `importable` holds the groups the run seats, each against its own profile. */
function profileKindItems(
  profile: LabeledProfile,
  importable: ReadonlySet<CollectedGroup>,
  owned: ImportOwnership,
): Readonly<Record<ImportPreviewKind, readonly ImportPreviewItem[]>> {
  const { result } = profile;
  const groups = result.groups.filter((group) => importable.has(group));
  return {
    characters: result.bundles.map((bundle) => listed(bundle, owned.characters, item(profile, bundle.filename, bundle.cardName))),
    chats: [
      ...result.bundles.flatMap((bundle) => chatItems(profile, bundle.cardName, bundle.chats, owned.chats)),
      ...groups.flatMap((group) => chatItems(profile, group.parsed.name, group.chats, owned.chats)),
      ...result.orphanBundles.flatMap((orphan) => chatItems(profile, orphan.dirName, orphan.chats, owned.chats)),
    ],
    personas: result.personas.map((persona) => {
      const base = item(profile, persona.parsed.avatarFile, persona.parsed.name);
      return listed(persona, owned.personas, owned.personasWithoutArt.has(persona) ? { ...base, withoutArt: true as const } : base);
    }),
    worlds: result.worlds.map((world) => listed(world, owned.worlds, item(profile, world.sourceFile, world.book.name))),
    presets: result.presets.map((preset) => presetItem(profile, preset, owned)),
    themes: result.themes.map((theme) => listed(theme, owned.themes, item(profile, theme.sourceFile, theme.parsed.name))),
    backgrounds: result.backgrounds.map((background) => listed(background, owned.backgrounds, item(profile, background.filename, background.name))),
    groups: groups.map((group) => listed(group, owned.groups, item(profile, group.sourceFile, group.parsed.name))),
    orphans: result.orphanBundles.map((orphan) => listed(orphan, owned.orphans, item(profile, orphan.dirName, orphan.dirName))),
    documents: result.documents.map((document) => listed(document, owned.documents, item(profile, document.sourceFile, document.name))),
    gallery: result.galleryImages.map((image) => listed(image, owned.gallery, item(profile, image.sourceFile, `${image.cards[0].cardName}: ${image.name}`))),
  };
}

/** Every item the folder holds, by kind, profile by profile. The one enumeration both the preview's lists and the
 *  run's counts take; a group the run refuses is a skip, and so are its transcripts. */
function kindItems(collected: ProfileCollected, owned: ImportOwnership): Readonly<Record<ImportPreviewKind, readonly ImportPreviewItem[]>> {
  const importable = new Set(partitionGroups(collected.profiles).importable);
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
    documents: gather("documents"),
    gallery: gather("gallery"),
  };
}

const NOTHING_OWNED: ImportOwnership = {
  characters: new Map(),
  chats: new Map(),
  personas: new Map(),
  worlds: new Map(),
  presets: new Map(),
  presetScripts: new Map(),
  themes: new Map(),
  backgrounds: new Map(),
  groups: new Map(),
  orphans: new Map(),
  documents: new Map(),
  gallery: new Map(),
  personasWithoutArt: new Set(),
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
    documents: items.documents.length,
    gallery: items.gallery.length,
  };
}

/** `owned` holds, per kind, the collected entries a run writes nothing for: the owner has them, or an earlier entry
 *  of the upload lands them. */
export function buildImportPreview(collected: ProfileCollected, owned: ImportOwnership): ImportPreview {
  const skipped = skippedItems(collected);
  const items = kindItems(collected, owned);
  return {
    kinds: {
      characters: importPreviewListOf(items.characters),
      chats: importPreviewListOf(items.chats),
      personas: importPreviewListOf(items.personas),
      worlds: importPreviewListOf(items.worlds),
      presets: importPreviewListOf(items.presets),
      themes: importPreviewListOf(items.themes),
      backgrounds: importPreviewListOf(items.backgrounds),
      groups: importPreviewListOf(items.groups),
      orphans: importPreviewListOf(items.orphans),
      documents: importPreviewListOf(items.documents),
      gallery: importPreviewListOf(items.gallery),
    },
    skipped: { total: skipped.length, items: skipped.slice(0, IMPORT_PREVIEW_LIST_MAX) },
  };
}
