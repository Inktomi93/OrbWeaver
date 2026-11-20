// verb: the SillyTavern profile export — the owner's library laid out as a SillyTavern user directory. It reads the
// per-kind backup streams for the small kinds and its own metadata reads for cards, rooms, personas and blobs, and
// re-shapes each kind into the file one of SillyTavern's import doors takes (`ST_EXPORT_DOORS`).
//
// BOUNDED: one generator yields every entry in zip order with a lazy body. The zip reads each body only when it writes
// that entry, under the response's pull, so the export holds one body at a time; the dry run reads no body at all (no
// card PNG, no blob, no transcript, no document text). A body whose row is gone by write time is left out and named as
// unreadable, and a body over the zip's entry cap is named as past the zip's limit, so the zip's report can name more
// than the dry run's. An entry's `written` registers it in the settings file and the transcripts only once the zip
// holds it.
//
// SECURITY: every path segment built from a stored name goes through SillyTavern's own filename rule
// (`stExportFilename`), is clipped to the name byte limit with its collision suffix, and is compared after the volume
// fold (`volumeFold`), so no name leaves its directory and no two files share a path on a Windows or macOS disk. Card files use the card's portable handle; chat and group files use the
// chat id, whose alphabet holds no separator; gallery files use the content hash.
//
// A ROOM WITH MORE THAN ONE SEAT, OR WITH A GROUP CONFIG, IS A SILLYTAVERN GROUP: `groups/<id>.json` naming its
// members by card filename (`src/endpoints/groups.js` `/all` reads it, `public/scripts/group-chats.js`
// `createGroup` is its shape) with its transcript in the flat `group chats/` folder (`src/endpoints/chats.js`
// `/group/get`). It never lands as its first member's solo chat.

import { portableCharacterHandle } from "@orb/contracts/character";
import type { ImportPreviewKind, StExportFile, StExportLeft, StExportReport } from "@orb/contracts/import";
import { clipImportText, ST_EXPORT_DOORS, ST_EXPORT_PROFILE_DIR, ST_EXPORT_REPORT_FILE, stChatPresetStem } from "@orb/contracts/import";
import type { PortableExportNotes, PortableKind } from "@orb/contracts/portability";
import { exportStChatCompletionPreset, parsePresetFile } from "@orb/contracts/preset";
import { toRegexScriptCardWire } from "@orb/contracts/regex";
import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterHandle } from "@orb/kit/ids";
import { IMAGE_EXTENSION_BY_MIME } from "@orb/kit/image-sniff";
import { parseJsonText } from "@orb/kit/json";
import type { StAttachedFile } from "#primitives/serde/databank";
import { stAttachmentEntry } from "#primitives/serde/databank";
import { parseGallery } from "#primitives/serde/gallery";
import { parsePersonaBackup } from "#primitives/serde/persona";
import { readPresetFileScripts } from "#primitives/serde/preset";
import { parseRegexScriptFile } from "#primitives/serde/regex";
import { ST_POWER_USER_KEY, stPowerUserOf } from "#primitives/serde/st-appearance";
import { parseTagLibrary } from "#primitives/serde/tag";
import { parseThemeFile, stThemeToJson } from "#primitives/serde/theme";
import { parseUserSettingsBackup } from "#primitives/serde/user-settings";
import { buildStWorldFile, parseWorldBookFile } from "#primitives/serde/world-info";
import { stClipStem, stExportFilename } from "#primitives/st-filename";
import { volumeFold } from "#primitives/volume-fold";
import type { HostChatRef } from "../contract/results.ts";
import type { StEntrySource, StProfileEntry, StProfileSource, StProfileZipFile, StStreamedKind, StZipLimits } from "../contract/st-profile.ts";

// The kinds SillyTavern keeps nothing of. Each owned file of them is named in the report.
const NO_HOME_KINDS = ["imagery", "spend"] as const satisfies readonly StStreamedKind[];

const FALLBACK_NAMES = {
  world: "World",
  persona: "Persona",
  document: "Document",
  chat: "Chat",
  preset: "Preset",
  theme: "Theme",
  background: "Background",
} as const;
// A handle SillyTavern's filename rule empties (a Windows device name such as `con`) files under this prefix.
const CARD_FALLBACK_PREFIX = "card-";
const TXT_EXT = ".txt";
const PNG_EXT = ".png";
const JSONL_EXT = ".jsonl";
const UNKNOWN_EXT = "bin";
const JSON_INDENT = 2;
const ENCODER = new TextEncoder();
// SillyTavern's group defaults (`public/scripts/group-chats.js`): the stock group avatar, the NATURAL activation
// strategy, the SWAP and APPEND generation modes.
const ST_DEFAULT_GROUP_AVATAR = "img/ai4.png";
const ST_GROUP_ACTIVATION = { natural: 0, list: 1, manual: 2, pooled: 3 } as const;
const ST_GENERATION_SWAP = 0;
const ST_GENERATION_APPEND = 1;
const MS_PER_SECOND = 1000;
// ST's background setting has no `classic` here; orb's four fits are ST's by the same names.
const BACKGROUND_FROM_ASSET = "asset";

function json(value: unknown): Uint8Array {
  return ENCODER.encode(JSON.stringify(value, null, JSON_INDENT));
}

const held = (bytes: Uint8Array) => (): Promise<Uint8Array> => Promise.resolve(bytes);

// A stored handle in the portable alphabet, or null when the text is no handle.
function portableHandle(text: string | null): CharacterHandle | null {
  return text === null ? null : portableCharacterHandle(text);
}

// One directory's names, compared as a Windows or macOS volume compares them, each within the byte limit with its
// collision suffix and extension.
function namer(): (base: string, fallback: string, ext: string) => string {
  const taken = new Set<string>();
  return (base, fallback, ext) => {
    const stem = stExportFilename(base) || fallback;
    let name = `${stClipStem(stem, ext)}${ext}`;
    for (let n = 2; taken.has(volumeFold(name)); n += 1) {
      const tail = ` (${String(n)})${ext}`;
      name = `${stClipStem(stem, tail)}${tail}`;
    }
    taken.add(volumeFold(name));
    return name;
  };
}

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function extOf(mime: string): string {
  return IMAGE_EXTENSION_BY_MIME[mime] ?? UNKNOWN_EXT;
}

interface StTag {
  readonly id: string;
  readonly name: string;
  readonly ["folder_type"]: string;
  readonly ["sort_order"]: number;
  readonly ["is_hidden_on_character_card"]: boolean;
  readonly color: string;
  readonly color2: string;
  readonly ["create_date"]: number;
}

// SillyTavern's settings file, holding only what the export carries. SillyTavern fills every other setting with its
// default.
interface StSettings {
  readonly personas: Record<string, string>;
  readonly personaDescriptions: Record<string, { readonly description: string; readonly title: string }>;
  readonly attachments: Readonly<Record<string, unknown>>[];
  readonly characterAttachments: Partial<Record<string, Readonly<Record<string, unknown>>[]>>;
  readonly galleryFolders: Record<string, string>;
  readonly tags: StTag[];
  readonly tagMap: Partial<Record<string, string[]>>;
  readonly regex: unknown[];
  powerUser: Record<string, unknown>;
  background: Record<string, unknown> | null;
}

class PlanBuilder {
  readonly left: StExportLeft[] = [];
  /** Each card's handle with its file name under `characters/`, the key SillyTavern pairs everything with. */
  readonly cards = new Map<CharacterHandle, string>();
  /** Each written Data Bank file by the document's import hash, for the chats it is attached to. */
  readonly documents = new Map<string, StAttachedFile>();
  readonly settings: StSettings = {
    personas: {},
    personaDescriptions: {},
    attachments: [],
    characterAttachments: {},
    galleryFolders: {},
    tags: [],
    tagMap: {},
    regex: [],
    powerUser: {},
    background: null,
  };
  readonly notes: PortableExportNotes = (note) => {
    this.leave(note.kind, note.item, "unreadable");
  };

  entry(kind: ImportPreviewKind, relative: string, source: StEntrySource | null, bytes: StProfileEntry["bytes"]): StProfileEntry {
    return { path: `${ST_EXPORT_PROFILE_DIR}${relative}`, kind, door: ST_EXPORT_DOORS[kind], source, bytes };
  }

  leave(kind: PortableKind, item: string, reason: StExportLeft["reason"]): void {
    this.left.push({ kind, item: clipImportText(item), reason });
  }

  /** The SillyTavern id of a tag, minted the first time a name is seen. */
  tagId(name: string): string {
    const owned = this.settings.tags.find((stTag) => stTag.name === name);
    if (owned !== undefined) {
      return owned.id;
    }
    const tag = {
      id: `tag-${String(this.settings.tags.length + 1)}`,
      name,
      ["folder_type"]: "NONE",
      ["sort_order"]: this.settings.tags.length,
      ["is_hidden_on_character_card"]: false,
      color: "",
      color2: "",
      ["create_date"]: 0,
    };
    this.settings.tags.push(tag);
    return tag.id;
  }
}

// The tag library as SillyTavern's `tags` (`public/scripts/tags.js` `newTag`), ahead of the cards, so a tag keeps
// its colours and order and a card's own tag that is no library tag is minted after it.
async function planTags(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  for await (const file of source.files("tag", plan.notes)) {
    const library = parseTagLibrary(file.bytes);
    if (!library.ok) {
      plan.leave("tag", stemOf(file.filename), "unreadable");
      continue;
    }
    for (const tag of library.value.tags) {
      plan.settings.tags.push({
        id: `tag-${String(plan.settings.tags.length + 1)}`,
        name: tag.name,
        ["folder_type"]: tag.folderType,
        ["sort_order"]: tag.sortOrder ?? plan.settings.tags.length,
        ["is_hidden_on_character_card"]: tag.isHiddenOnCard,
        color: tag.color ?? "",
        color2: tag.color2 ?? "",
        ["create_date"]: 0,
      });
    }
  }
}

async function* planCharacters(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  await planTags(source, plan);
  const name = namer();
  for (const card of await source.cards()) {
    const handle = portableCharacterHandle(card.handle);
    const cardFile = name(handle, `${CARD_FALLBACK_PREFIX}${handle}`, PNG_EXT);
    plan.cards.set(handle, cardFile);
    if (card.tags.length > 0) {
      plan.settings.tagMap[cardFile] = [...new Set(card.tags.map((tag) => plan.tagId(tag)))];
    }
    yield plan.entry("characters", `characters/${cardFile}`, { kind: "character", item: handle }, () => source.card(card.characterId, plan.notes));
  }
}

// Each document's Data Bank file under `user/files/`, listed where SillyTavern lists it: the global list, a card's
// list, or a chat header (`planChats`). A document none of those lists has no SillyTavern home.
async function* planDocuments(source: StProfileSource, plan: PlanBuilder, chatHashes: ReadonlySet<string>): AsyncGenerator<StProfileEntry> {
  const name = namer();
  for (const document of await source.documents()) {
    const cards = document.characterHandles.flatMap((handle) => plan.cards.get(handle) ?? []);
    if (!document.global && cards.length === 0 && !chatHashes.has(document.importHash)) {
      plan.leave("databank", document.name, "no-sillytavern-home");
      continue;
    }
    const stored = name(document.name.toLowerCase().endsWith(TXT_EXT) ? stemOf(document.name) : document.name, FALLBACK_NAMES.document, TXT_EXT);
    const body = async (): Promise<Uint8Array | null> => {
      const text = await source.documentText(document.documentId);
      return text === null ? null : ENCODER.encode(text);
    };
    // The attachment entry carries the written file's size, so it is listed once the zip holds the file.
    const written = (bytes: Uint8Array): void => {
      const attached: StAttachedFile = { file: stored, name: document.name, size: bytes.byteLength, created: document.createdAt };
      plan.documents.set(document.importHash, attached);
      const entry = stAttachmentEntry(attached);
      if (document.global) {
        plan.settings.attachments.push(entry);
      }
      for (const card of cards) {
        plan.settings.characterAttachments[card] = [...(plan.settings.characterAttachments[card] ?? []), entry];
      }
    };
    yield { ...plan.entry("documents", `user/files/${stored}`, { kind: "databank", item: document.name }, body), written };
  }
}

// One group room as SillyTavern's group file (`public/scripts/group-chats.js` `createGroup`).
function stGroupFile(room: HostChatRef, chatLeaf: string, plan: PlanBuilder): Record<string, unknown> {
  const config = room.groupConfig;
  const handles = room.handles.map((handle) => portableCharacterHandle(handle));
  return {
    id: chatLeaf,
    name: room.title ?? handles.join(", "),
    members: handles.map((handle) => plan.cards.get(handle) ?? `${handle}${PNG_EXT}`),
    ["avatar_url"]: ST_DEFAULT_GROUP_AVATAR,
    ["allow_self_responses"]: config?.allowSelfResponses ?? false,
    hideMutedSprites: false,
    ["activation_strategy"]: config === null || config.policy === "smart" ? ST_GROUP_ACTIVATION.natural : ST_GROUP_ACTIVATION[config.policy],
    ["generation_mode"]: config?.output === "narrator" ? ST_GENERATION_APPEND : ST_GENERATION_SWAP,
    ["disabled_members"]: [],
    fav: room.starred,
    ["chat_id"]: chatLeaf,
    chats: [chatLeaf],
    ["auto_mode_delay"]: Math.round((config?.autoModeDelayMs ?? 0) / MS_PER_SECOND),
  };
}

async function* planChats(source: StProfileSource, plan: PlanBuilder, chatHashes: ReadonlyMap<string, readonly string[]>): AsyncGenerator<StProfileEntry> {
  const namers = new Map<string, ReturnType<typeof namer>>();
  const groupName = namer();
  for (const room of await source.rooms()) {
    // A transcript gone or left out at write time is named once, and its group file is left out with it.
    let carried = false;
    const transcript = async (): Promise<Uint8Array | null> => {
      // The Data Bank files the zip already holds: every document entry is written before the first transcript.
      const attachments = (chatHashes.get(room.chatId) ?? []).flatMap((hash) => plan.documents.get(hash) ?? []);
      const text = await source.transcript(room.chatId, attachments);
      return text === null ? null : ENCODER.encode(text.text);
    };
    const markCarried = (): void => {
      carried = true;
    };
    const item = { kind: "chat", item: room.title ?? room.chatId } as const;
    if (room.isGroup) {
      const leaf = stemOf(groupName(room.chatId, FALLBACK_NAMES.chat, JSONL_EXT));
      const group = json(stGroupFile(room, leaf, plan));
      yield { ...plan.entry("groups", `group chats/${leaf}${JSONL_EXT}`, item, transcript), written: markCarried };
      yield plan.entry("groups", `groups/${leaf}.json`, null, () => Promise.resolve(carried ? group : null));
      continue;
    }
    const handle = portableCharacterHandle(room.handle);
    const dir = stemOf(plan.cards.get(handle) ?? `${stExportFilename(handle) || `${CARD_FALLBACK_PREFIX}${handle}`}${PNG_EXT}`);
    const name = namers.get(dir) ?? namer();
    namers.set(dir, name);
    yield plan.entry("chats", `chats/${dir}/${name(room.chatId, FALLBACK_NAMES.chat, JSONL_EXT)}`, item, transcript);
  }
}

async function* planWorlds(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  const name = namer();
  for await (const file of source.files("world-info", plan.notes)) {
    const book = parseWorldBookFile(file.bytes, stemOf(file.filename));
    if (!book.ok) {
      plan.leave("world-info", stemOf(file.filename), "unreadable");
      continue;
    }
    const world = buildStWorldFile(book.value);
    yield plan.entry("worlds", `worlds/${name(book.value.name, FALLBACK_NAMES.world, ".json")}`, { kind: "world-info", item: book.value.name }, held(world));
  }
}

// Each preset as SillyTavern's chat-completion preset file, its scripts inside it.
async function* planPresets(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  const name = namer();
  for await (const file of source.files("preset", plan.notes)) {
    const raw = parseJsonText(new TextDecoder("utf-8").decode(file.bytes));
    const preset = parsePresetFile(raw);
    if (!preset.ok) {
      plan.leave("preset", stemOf(file.filename), "unreadable");
      continue;
    }
    const scripts = readPresetFileScripts(raw)?.scripts ?? [];
    const { preset: stPreset, left } = exportStChatCompletionPreset(preset.config, scripts.map(toRegexScriptCardWire));
    for (const { field } of left) {
      plan.leave("preset", `${preset.name}: ${field}`, "no-sillytavern-field");
    }
    const relative = `OpenAI Settings/${name(stChatPresetStem(preset.name), FALLBACK_NAMES.preset, ".json")}`;
    yield plan.entry("presets", relative, { kind: "preset", item: preset.name }, held(json(stPreset)));
  }
}

async function* planThemes(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  const name = namer();
  for await (const file of source.files("theme", plan.notes)) {
    const parsed = parseThemeFile(file.bytes, stemOf(file.filename));
    if (!parsed.ok) {
      plan.leave("theme", stemOf(file.filename), "unreadable");
      continue;
    }
    for (const stored of parsed.value.themes) {
      const { theme, left } = stThemeToJson(stored.name, stored.override);
      // Theme CSS targets this app's own markup, which SillyTavern never renders.
      for (const token of stored.css === null ? left : [...left, "css"]) {
        plan.leave("theme", `${stored.name}: ${token}`, "no-sillytavern-field");
      }
      yield plan.entry(
        "themes",
        `themes/${name(String(theme["name"]), FALLBACK_NAMES.theme, ".json")}`,
        { kind: "theme", item: stored.name },
        held(json(theme)),
      );
    }
  }
}

// Global scripts are SillyTavern's `extension_settings.regex`. A scoped script travels on the card or preset it runs
// on, which carries its own list; the library row itself has no SillyTavern home.
async function planRegex(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  for await (const file of source.files("regex", plan.notes)) {
    const script = parseRegexScriptFile(file.bytes);
    if (!script.ok) {
      plan.leave("regex", stemOf(file.filename), "unreadable");
      continue;
    }
    const { global, ...card } = script.value;
    if (!global) {
      plan.leave("regex", card.name, "rides-its-card-or-preset");
      continue;
    }
    plan.settings.regex.push(toRegexScriptCardWire({ ...card, id: `regex-${String(plan.settings.regex.length + 1)}` }));
  }
}

// Every non-default setting outside what SillyTavern's `power_user` and background carry, by name.
const APPEARANCE_NAMESPACE = "appearance";

function differs(value: unknown, fallback: unknown): boolean {
  return JSON.stringify(value) !== JSON.stringify(fallback);
}

function leaveSettings(plan: PlanBuilder, settings: Readonly<Record<string, unknown>>, carried: ReadonlySet<string>): void {
  for (const [namespace, value] of Object.entries(settings)) {
    const defaults = Object.entries(DEFAULT_USER_SETTINGS).find(([name]) => name === namespace)?.[1];
    if (namespace !== APPEARANCE_NAMESPACE) {
      if (differs(value, defaults)) {
        plan.leave("user-settings", namespace, "no-sillytavern-home");
      }
      continue;
    }
    const fallbacks = new Map<string, unknown>(Object.entries(isPlainObject(defaults) ? defaults : {}));
    const uncarried = Object.entries(isPlainObject(value) ? value : {}).filter(([key, setting]) => !carried.has(key) && differs(setting, fallbacks.get(key)));
    for (const [key] of uncarried) {
      plan.leave("user-settings", `${namespace}.${key}`, "no-sillytavern-field");
    }
  }
}

// The background library as SillyTavern's `backgrounds/`, and the chosen one as its `background` setting
// (`public/scripts/backgrounds.js` `loadBackgroundSettings`), set when its file is written.
async function* planBackgrounds(
  source: StProfileSource,
  plan: PlanBuilder,
  appearance: AppearanceSettings,
  carried: Set<string>,
): AsyncGenerator<StProfileEntry> {
  for (const key of ["backgroundLibrary", "backgroundImageKind", "backgroundAssetId", "backgroundAssetHash", "backgroundAssetMime", "backgroundFit"]) {
    carried.add(key);
  }
  const name = namer();
  const mimes = await source.blobMimes(appearance.backgroundLibrary.map((entry) => entry.assetHash));
  for (const entry of appearance.backgroundLibrary) {
    const mime = mimes.get(entry.assetHash);
    if (mime === undefined) {
      plan.leave("user-settings", entry.name, "unreadable");
      continue;
    }
    const stored = name(stemOf(entry.name), FALLBACK_NAMES.background, `.${extOf(mime)}`);
    const chosen = appearance.backgroundImageKind === BACKGROUND_FROM_ASSET && appearance.backgroundAssetHash === entry.assetHash;
    const written = (): void => {
      if (chosen && plan.settings.background === null) {
        plan.settings.background = { name: stored, url: `url("backgrounds/${encodeURIComponent(stored)}")`, fitting: appearance.backgroundFit };
      }
    };
    yield { ...plan.entry("backgrounds", `backgrounds/${stored}`, { kind: "user-settings", item: entry.name }, () => source.blob(entry.assetHash)), written };
  }
}

async function* planUserSettings(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  for await (const file of source.files("user-settings", plan.notes)) {
    const settings = parseUserSettingsBackup(file.bytes);
    if (!settings.ok) {
      plan.leave("user-settings", stemOf(file.filename), "unreadable");
      continue;
    }
    const { appearance } = settings.value;
    const carried = new Set<string>();
    if (appearance !== undefined) {
      const ergonomics = stPowerUserOf(appearance);
      plan.settings.powerUser = { ...plan.settings.powerUser, ...ergonomics.powerUser };
      for (const key of ergonomics.carried) {
        carried.add(key);
      }
      yield* planBackgrounds(source, plan, appearance, carried);
    }
    leaveSettings(plan, settings.value, carried);
  }
}

// A persona is a SillyTavern persona only through its avatar file (`User Avatars/`), so one with no image is left. Its
// settings entry is written with its avatar.
async function* planPersonas(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  const personas: { readonly name: string; readonly description: string; readonly title: string; readonly hash: string }[] = [];
  for await (const { file, avatarHash } of source.personas(plan.notes)) {
    const backup = parsePersonaBackup(file.bytes);
    if (!backup.ok) {
      plan.leave("persona", stemOf(file.filename), "unreadable");
      continue;
    }
    const persona = backup.value;
    if (avatarHash === null) {
      plan.leave("persona", persona.name, "persona-without-art");
      continue;
    }
    personas.push({ name: persona.name, description: persona.description, title: persona.title ?? "", hash: avatarHash });
  }
  const mimes = await source.blobMimes(personas.map(({ hash }) => hash));
  const name = namer();
  for (const persona of personas) {
    const mime = mimes.get(persona.hash);
    if (mime === undefined) {
      plan.leave("persona", persona.name, "persona-without-art");
      continue;
    }
    const avatar = name(persona.name, FALLBACK_NAMES.persona, `.${extOf(mime)}`);
    const written = (): void => {
      plan.settings.personas[avatar] = persona.name;
      plan.settings.personaDescriptions[avatar] = { description: persona.description, title: persona.title };
    };
    yield { ...plan.entry("personas", `User Avatars/${avatar}`, { kind: "persona", item: persona.name }, () => source.blob(persona.hash)), written };
  }
}

// A gallery item's blob and the card whose folder holds it, or null with the item named.
function galleryPicture(
  item: { readonly assetHash: string | null; readonly subjectCharacterHandle: string | null },
  plan: PlanBuilder,
): { readonly hash: string; readonly card: string } | null {
  const handle = portableHandle(item.subjectCharacterHandle);
  const card = handle === null ? undefined : plan.cards.get(handle);
  if (item.assetHash === null) {
    plan.leave("gallery", handle ?? "", "unreadable");
    return null;
  }
  if (card === undefined) {
    plan.leave("gallery", item.assetHash, "no-sillytavern-home");
    return null;
  }
  return { hash: item.assetHash, card };
}

// SillyTavern keeps a gallery per character (`user/images/<folder>/`), so a picture with no character's folder has
// no home there.
async function* planGallery(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  const pictures: { readonly hash: string; readonly card: string }[] = [];
  for await (const file of source.files("gallery", plan.notes)) {
    const gallery = parseGallery(file.bytes);
    if (!gallery.ok) {
      plan.leave("gallery", stemOf(file.filename), "unreadable");
      continue;
    }
    pictures.push(...gallery.value.items.flatMap((item) => galleryPicture(item, plan) ?? []));
  }
  const mimes = await source.blobMimes(pictures.map(({ hash }) => hash));
  for (const { hash, card } of pictures) {
    const mime = mimes.get(hash);
    if (mime === undefined) {
      plan.leave("gallery", hash, "unreadable");
      continue;
    }
    const folder = stemOf(card);
    const written = (): void => {
      plan.settings.galleryFolders[card] = folder;
    };
    yield { ...plan.entry("gallery", `user/images/${folder}/${hash}.${extOf(mime)}`, { kind: "gallery", item: hash }, () => source.blob(hash)), written };
  }
}

async function planLeftKinds(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  for (const kind of NO_HOME_KINDS) {
    for await (const file of source.files(kind, plan.notes)) {
      plan.leave(kind, stemOf(file.filename), "no-sillytavern-home");
    }
  }
}

// Read when it is written, after every entry before it, so it names only the avatars, background and galleries the
// zip holds.
function settingsFile({ settings }: PlanBuilder): Uint8Array {
  return json({
    [ST_POWER_USER_KEY]: { ...settings.powerUser, personas: settings.personas, ["persona_descriptions"]: settings.personaDescriptions },
    ...(settings.background === null ? {} : { background: settings.background }),
    tags: settings.tags,
    ["tag_map"]: settings.tagMap,
    ["extension_settings"]: {
      regex: settings.regex,
      attachments: settings.attachments,
      ["character_attachments"]: settings.characterAttachments,
      gallery: { folders: settings.galleryFolders },
    },
  });
}

// Every entry in zip order. Cards come first because every later kind files by card; documents come before chats,
// whose headers list the files attached to them.
async function* planEntries(source: StProfileSource, plan: PlanBuilder): AsyncGenerator<StProfileEntry> {
  yield* planCharacters(source, plan);
  const chatHashes = await source.chatDocumentHashes();
  yield* planDocuments(source, plan, new Set([...chatHashes.values()].flat()));
  yield* planChats(source, plan, chatHashes);
  yield* planWorlds(source, plan);
  yield* planPresets(source, plan);
  yield* planThemes(source, plan);
  await planRegex(source, plan);
  yield* planUserSettings(source, plan);
  yield* planPersonas(source, plan);
  yield* planGallery(source, plan);
  await planLeftKinds(source, plan);
  yield plan.entry("personas", "settings.json", null, () => Promise.resolve(settingsFile(plan)));
}

function listed({ path, kind, door }: StExportFile): StExportFile {
  return { path, kind, door };
}

/** The SillyTavern export's dry run: every file it would write with the door that takes it, and every row it leaves
 *  behind with why. It reads no card, blob or transcript body. */
// The zip writer refuses an entry over its byte cap and an archive past its entry cap. A row the zip cannot hold is
// named and left out instead, so one large row never fails the whole export. The settings file, the report and a
// group file after its transcript have no row of their own to name, so the entry cap keeps room for them.
const UNNAMED_ENTRIES_RESERVED = 3;

// Whether the zip is too full for this row: the dry run and the zip judge by the same count.
function pastEntryCap(entry: StProfileEntry, count: number, limits: StZipLimits): entry is StProfileEntry & { readonly source: StEntrySource } {
  return entry.source !== null && count + UNNAMED_ENTRIES_RESERVED >= limits.maxEntries;
}

/** What the SillyTavern export would carry and leave, with no stored body read. A body too large for the zip is known
 *  only when the zip reads it, so only the zip's report names it. */
export async function stProfileDryRun(source: StProfileSource, limits: StZipLimits): Promise<StExportReport> {
  const plan = new PlanBuilder();
  const files: StExportFile[] = [];
  for await (const entry of planEntries(source, plan)) {
    if (pastEntryCap(entry, files.length, limits)) {
      plan.leave(entry.source.kind, entry.source.item, "past-zip-limit");
      continue;
    }
    files.push(listed(entry));
  }
  return { files, left: plan.left };
}

/** The SillyTavern export's zip files, one body read per pull, then its report at the zip root. The report names the
 *  files written, and a body gone by write time among the rows left behind. */
export async function* stProfileZip(source: StProfileSource, limits: StZipLimits): AsyncGenerator<StProfileZipFile> {
  const plan = new PlanBuilder();
  const files: StExportFile[] = [];
  for await (const entry of planEntries(source, plan)) {
    if (pastEntryCap(entry, files.length, limits)) {
      plan.leave(entry.source.kind, entry.source.item, "past-zip-limit");
      continue;
    }
    const bytes = await entry.bytes();
    if (bytes === null) {
      if (entry.source !== null) {
        plan.leave(entry.source.kind, entry.source.item, "unreadable");
      }
      continue;
    }
    if (bytes.byteLength > limits.maxEntryBytes && entry.source !== null) {
      plan.leave(entry.source.kind, entry.source.item, "past-zip-limit");
      continue;
    }
    entry.written?.(bytes);
    files.push(listed(entry));
    yield { path: entry.path, bytes };
  }
  const report: StExportReport = { files, left: plan.left };
  yield { path: ST_EXPORT_REPORT_FILE, bytes: json(report) };
}
