// verb: planStProfileExport — the owner's library laid out as a SillyTavern user directory. It reads the per-kind
// streams the library backup reads and re-shapes each kind into the file one of SillyTavern's import doors takes
// (`ST_EXPORT_DOORS`). The plan it returns is both the dry run's answer and the zip's content and report, so the
// preview and the report are one value.
//
// SECURITY: every path segment built from a stored name goes through SillyTavern's own filename rule
// (`stSanitizeFilename`) and then a case-folded collision suffix, so no name leaves its directory and no two files
// share a path on a case-insensitive disk. Character folders use the card's file stem, which is a portable handle
// (no separator) through the same rule; chat and group files use the chat id, whose alphabet holds no separator.
//
// A ROOM WITH MORE THAN ONE SEAT, OR WITH A GROUP CONFIG, IS A SILLYTAVERN GROUP: `groups/<id>.json` naming its
// members by card filename (`src/endpoints/groups.js` `/all` reads it, `public/scripts/group-chats.js`
// `createGroup` is its shape) with its transcript in the flat `group chats/` folder (`src/endpoints/chats.js`
// `/group/get`). It never lands as its first member's solo chat.

import { CHARACTER_HANDLE_WIRE_KEY, characterHandleSchema, portableCharacterHandle } from "@orb/contracts/character";
import { storedGroupConfigSchema } from "@orb/contracts/chat";
import type { ImportPreviewKind, StExportLeft } from "@orb/contracts/import";
import { clipImportText, ST_EXPORT_DOORS, ST_EXPORT_PROFILE_DIR, stChatPresetStem } from "@orb/contracts/import";
import type { PortableExportNotes, PortableKind } from "@orb/contracts/portability";
import { exportStChatCompletionPreset, parsePresetFile } from "@orb/contracts/preset";
import { toRegexScriptCardWire } from "@orb/contracts/regex";
import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import { parseJsonText } from "@orb/kit/json";
import { readCardChunk } from "@orb/kit/png-card-chunk";
import { CHAT_BUNDLE_EXT, parseChatBundleFile } from "#primitives/serde/chat-bundle";
import { parseDocumentFile } from "#primitives/serde/databank";
import { parseGallery } from "#primitives/serde/gallery";
import { parsePersonaBackup } from "#primitives/serde/persona";
import { readPresetFileScripts } from "#primitives/serde/preset";
import { parseRegexScriptFile } from "#primitives/serde/regex";
import { ST_POWER_USER_KEY, stPowerUserOf } from "#primitives/serde/st-appearance";
import { parseTagLibrary } from "#primitives/serde/tag";
import { parseThemeFile, stThemeToJson } from "#primitives/serde/theme";
import { parseUserSettingsBackup } from "#primitives/serde/user-settings";
import { buildStWorldFile, parseWorldBookFile } from "#primitives/serde/world-info";
import { stSanitizeFilename } from "#primitives/st-filename";
import type { StProfileEntry, StProfilePlan, StProfileSource } from "../contract/st-profile.ts";

// The kinds SillyTavern keeps nothing of. Each owned file of them is named in the report.
const NO_HOME_KINDS = ["imagery", "spend"] as const satisfies readonly PortableKind[];

const CARD_CHUNKS = ["ccv3", "chara"] as const;
const HASH_LENGTH = 64;
const FALLBACK_NAMES = {
  world: "World",
  persona: "Persona",
  document: "Document",
  chat: "Chat",
  preset: "Preset",
  theme: "Theme",
  background: "Background",
} as const;
const TXT_EXT = ".txt";
const PNG_EXT = ".png";
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

// A stored handle in the portable alphabet, or null when the text is no handle.
function portableHandle(text: unknown): string | null {
  const handle = characterHandleSchema.safeParse(text).data;
  return handle === undefined ? null : portableCharacterHandle(handle);
}

// One directory's names, folded the way a case-insensitive disk folds them.
function namer(): (base: string, fallback: string, ext: string) => string {
  const taken = new Set<string>();
  return (base, fallback, ext) => {
    const stem = stSanitizeFilename(base) || fallback;
    let name = `${stem}${ext}`;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) {
      name = `${stem} (${String(n)})${ext}`;
    }
    taken.add(name.toLowerCase());
    return name;
  };
}

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

// An asset file's extension, through the filename rule; the descriptor names it after its last dot.
function assetExt(filename: string): string {
  return stSanitizeFilename(filename.slice(filename.lastIndexOf(".") + 1));
}

// What an exported card says of itself on its own card chunk: its handle and its tag names.
async function cardFacts(png: Uint8Array): Promise<{ readonly handle: string | null; readonly tags: readonly string[] }> {
  for (const keyword of CARD_CHUNKS) {
    const chunk = await readCardChunk(png, keyword);
    if (chunk !== null) {
      const card: unknown = JSON.parse(chunk);
      const data = isPlainObject(card) ? card["data"] : null;
      const tags = isPlainObject(data) && Array.isArray(data["tags"]) ? data["tags"].filter((tag): tag is string => typeof tag === "string") : [];
      return { handle: portableHandle(isPlainObject(data) ? data[CHARACTER_HANDLE_WIRE_KEY] : null), tags };
    }
  }
  return { handle: null, tags: [] };
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
  readonly attachments: Record<string, unknown>[];
  readonly characterAttachments: Partial<Record<string, Record<string, unknown>[]>>;
  readonly galleryFolders: Record<string, string>;
  readonly tags: StTag[];
  readonly tagMap: Partial<Record<string, string[]>>;
  readonly regex: unknown[];
  powerUser: Record<string, unknown>;
  background: Record<string, unknown> | null;
}

type AssetUse = (file: { readonly filename: string; readonly bytes: Uint8Array }) => void;

// One use of a blob, and what the export reports when the store no longer holds it.
interface WantedAsset {
  readonly use: AssetUse;
  readonly missing: () => void;
}

class PlanBuilder {
  readonly entries: StProfileEntry[] = [];
  readonly left: StExportLeft[] = [];
  /** Each card's handle with its file name under `characters/`, the key SillyTavern pairs everything with. */
  readonly cards = new Map<string, string>();
  /** Each wanted blob's content hash with what each use does with its bytes. */
  readonly assets = new Map<string, WantedAsset[]>();
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

  add(kind: ImportPreviewKind, relative: string, bytes: () => Promise<Uint8Array>): void {
    this.entries.push({ path: `${ST_EXPORT_PROFILE_DIR}${relative}`, kind, door: ST_EXPORT_DOORS[kind], bytes });
  }

  addBytes(kind: ImportPreviewKind, relative: string, bytes: Uint8Array): void {
    this.add(kind, relative, () => Promise.resolve(bytes));
  }

  leave(kind: PortableKind, item: string, reason: StExportLeft["reason"]): void {
    this.left.push({ kind, item: clipImportText(item), reason });
  }

  want(hash: string, missing: () => void, use: AssetUse): void {
    this.assets.set(hash, [...(this.assets.get(hash) ?? []), { use, missing }]);
  }

  /** A card's file name, or the handle's own when the library holds no card for it. */
  cardFile(handle: string): string {
    return this.cards.get(handle) ?? `${stSanitizeFilename(handle)}${PNG_EXT}`;
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

async function planCharacters(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const name = namer();
  const cardTags: (readonly [string, readonly string[]])[] = [];
  for await (const file of source.files("character", plan.notes)) {
    const { handle, tags } = await cardFacts(file.bytes);
    const cardFile = name(handle ?? stemOf(file.filename), FALLBACK_NAMES.chat, PNG_EXT);
    if (handle !== null) {
      plan.cards.set(handle, cardFile);
    }
    cardTags.push([cardFile, tags]);
    plan.addBytes("characters", `characters/${cardFile}`, file.bytes);
  }
  // Library tags first, so a tag keeps its colours and order; a card's own tag that is no library tag is minted.
  await planTags(source, plan);
  for (const [cardFile, tags] of cardTags) {
    if (tags.length > 0) {
      plan.settings.tagMap[cardFile] = [...new Set(tags.map((tag) => plan.tagId(tag)))];
    }
  }
}

// The tag library as SillyTavern's `tags` (`public/scripts/tags.js` `newTag`).
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

interface GroupRoom {
  readonly chatId: string;
  readonly name: string;
  readonly handles: readonly string[];
  readonly starred: boolean;
  readonly group: unknown;
}

// The rooms that are groups, read off the library's own chat bundles; the descriptor names each `<handle>/<chatId>`.
async function groupRooms(source: StProfileSource, plan: PlanBuilder): Promise<GroupRoom[]> {
  const rooms: GroupRoom[] = [];
  for await (const file of source.files("chat", plan.notes)) {
    const chat = parseChatBundleFile(file.bytes);
    const leaf = file.filename.slice(file.filename.lastIndexOf("/") + 1);
    const chatId = leaf.endsWith(CHAT_BUNDLE_EXT) ? leaf.slice(0, -CHAT_BUNDLE_EXT.length) : stemOf(leaf);
    if (!chat.ok) {
      continue;
    }
    const group = chat.value.metadata?.["group"];
    if (chat.value.characterHandles.length > 1 || group !== undefined) {
      const handles = chat.value.characterHandles.flatMap((handle) => portableHandle(handle) ?? []);
      rooms.push({ chatId, name: chat.value.title, handles, starred: chat.value.starred, group });
    }
  }
  return rooms;
}

// One group room as SillyTavern's group file (`public/scripts/group-chats.js` `createGroup`).
function stGroupFile(room: GroupRoom, chatLeaf: string, plan: PlanBuilder): Record<string, unknown> {
  const config = storedGroupConfigSchema.safeParse(room.group).data;
  const narrator = config?.output === "narrator";
  return {
    id: chatLeaf,
    name: room.name || room.handles.join(", "),
    members: room.handles.map((handle) => plan.cardFile(handle)),
    ["avatar_url"]: ST_DEFAULT_GROUP_AVATAR,
    ["allow_self_responses"]: config?.allowSelfResponses ?? false,
    hideMutedSprites: false,
    ["activation_strategy"]: config === undefined || config.policy === "smart" ? ST_GROUP_ACTIVATION.natural : ST_GROUP_ACTIVATION[config.policy],
    ["generation_mode"]: narrator ? ST_GENERATION_APPEND : ST_GENERATION_SWAP,
    ["disabled_members"]: [],
    fav: room.starred,
    ["chat_id"]: chatLeaf,
    chats: [chatLeaf],
    ["auto_mode_delay"]: Math.round((config?.autoModeDelayMs ?? 0) / MS_PER_SECOND),
  };
}

function transcript(source: StProfileSource, chatId: Parameters<StProfileSource["exportChat"]>[0]): () => Promise<Uint8Array> {
  return async () => ENCODER.encode((await source.exportChat(chatId))?.text ?? "");
}

async function planChats(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const rooms = new Map((await groupRooms(source, plan)).map((room) => [room.chatId, room]));
  const namers = new Map<string, ReturnType<typeof namer>>();
  const groupName = namer();
  for (const { chatId, handle } of await source.listHostChats()) {
    const room = rooms.get(chatId);
    if (room !== undefined) {
      const leaf = stemOf(groupName(chatId, FALLBACK_NAMES.chat, ".jsonl"));
      plan.addBytes("groups", `groups/${leaf}.json`, json(stGroupFile(room, leaf, plan)));
      plan.add("groups", `group chats/${leaf}.jsonl`, transcript(source, chatId));
      continue;
    }
    const dir = stemOf(plan.cardFile(portableCharacterHandle(handle)));
    const name = namers.get(dir) ?? namer();
    namers.set(dir, name);
    plan.add("chats", `chats/${dir}/${name(chatId, FALLBACK_NAMES.chat, ".jsonl")}`, transcript(source, chatId));
  }
}

async function planWorlds(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const name = namer();
  for await (const file of source.files("world-info", plan.notes)) {
    const book = parseWorldBookFile(file.bytes, stemOf(file.filename));
    if (!book.ok) {
      plan.leave("world-info", stemOf(file.filename), "unreadable");
      continue;
    }
    plan.addBytes("worlds", `worlds/${name(book.value.name, FALLBACK_NAMES.world, ".json")}`, buildStWorldFile(book.value));
  }
}

// Each preset as SillyTavern's chat-completion preset file, its scripts inside it.
async function planPresets(source: StProfileSource, plan: PlanBuilder): Promise<void> {
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
    plan.addBytes("presets", `OpenAI Settings/${name(stChatPresetStem(preset.name), FALLBACK_NAMES.preset, ".json")}`, json(stPreset));
  }
}

async function planThemes(source: StProfileSource, plan: PlanBuilder): Promise<void> {
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
      plan.addBytes("themes", `themes/${name(String(theme["name"]), FALLBACK_NAMES.theme, ".json")}`, json(theme));
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
// (`public/scripts/backgrounds.js` `loadBackgroundSettings`).
function planBackgrounds(plan: PlanBuilder, appearance: AppearanceSettings, carried: Set<string>): void {
  const name = namer();
  for (const entry of appearance.backgroundLibrary) {
    plan.want(
      entry.assetHash,
      () => plan.leave("user-settings", entry.name, "unreadable"),
      (file) => {
        const stored = name(stemOf(entry.name), FALLBACK_NAMES.background, `.${assetExt(file.filename)}`);
        plan.addBytes("backgrounds", `backgrounds/${stored}`, file.bytes);
        if (
          appearance.backgroundImageKind === BACKGROUND_FROM_ASSET &&
          appearance.backgroundAssetHash === entry.assetHash &&
          plan.settings.background === null
        ) {
          plan.settings.background = { name: stored, url: `url("backgrounds/${encodeURIComponent(stored)}")`, fitting: appearance.backgroundFit };
        }
      },
    );
  }
  for (const key of ["backgroundLibrary", "backgroundImageKind", "backgroundAssetId", "backgroundAssetHash", "backgroundAssetMime", "backgroundFit"]) {
    carried.add(key);
  }
}

async function planUserSettings(source: StProfileSource, plan: PlanBuilder): Promise<void> {
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
      planBackgrounds(plan, appearance, carried);
    }
    leaveSettings(plan, settings.value, carried);
  }
}

// A persona is a SillyTavern persona only through its avatar file (`User Avatars/`), so one with no image is left.
async function planPersonas(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const art = await source.personaArt();
  const name = namer();
  for await (const file of source.files("persona", plan.notes)) {
    const backup = parsePersonaBackup(file.bytes);
    if (!backup.ok) {
      plan.leave("persona", stemOf(file.filename), "unreadable");
      continue;
    }
    const persona = backup.value;
    const hash = art.get(persona.name) ?? null;
    if (hash === null) {
      plan.leave("persona", persona.name, "persona-without-art");
      continue;
    }
    plan.want(
      hash,
      () => plan.leave("persona", persona.name, "persona-without-art"),
      (asset) => {
        const avatar = name(persona.name, FALLBACK_NAMES.persona, `.${assetExt(asset.filename)}`);
        plan.settings.personas[avatar] = persona.name;
        plan.settings.personaDescriptions[avatar] = { description: persona.description, title: persona.title ?? "" };
        plan.addBytes("personas", `User Avatars/${avatar}`, asset.bytes);
      },
    );
  }
}

async function planDocuments(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  const name = namer();
  for await (const file of source.files("databank", plan.notes)) {
    const document = parseDocumentFile(file.bytes);
    if (!document.ok) {
      plan.leave("databank", stemOf(file.filename), "unreadable");
      continue;
    }
    const { value } = document;
    const bytes = ENCODER.encode(value.extractedText);
    const stored = name(value.name.toLowerCase().endsWith(TXT_EXT) ? stemOf(value.name) : value.name, FALLBACK_NAMES.document, TXT_EXT);
    // SillyTavern's attachment entry (`public/scripts/chats.js` `uploadFileAttachmentToServer`).
    const entry = { url: `/user/files/${stored}`, size: bytes.byteLength, name: value.name, created: value.createdAt ?? 0 };
    if (value.global) {
      plan.settings.attachments.push(entry);
    }
    for (const handle of value.characterHandles.flatMap((text) => portableHandle(text) ?? [])) {
      const card = plan.cardFile(handle);
      plan.settings.characterAttachments[card] = [...(plan.settings.characterAttachments[card] ?? []), entry];
    }
    plan.addBytes("documents", `user/files/${stored}`, bytes);
  }
}

async function planGallery(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  for await (const file of source.files("gallery", plan.notes)) {
    const gallery = parseGallery(file.bytes);
    for (const item of gallery.ok ? gallery.value.items : []) {
      const handle = portableHandle(item.subjectCharacterHandle);
      if (item.assetHash === null || handle === null) {
        continue;
      }
      const folder = stemOf(plan.cardFile(handle));
      plan.want(
        item.assetHash,
        () => plan.leave("gallery", item.assetHash ?? "", "unreadable"),
        (asset) => {
          plan.settings.galleryFolders[plan.cardFile(handle)] = folder;
          plan.addBytes("gallery", `user/images/${folder}/${asset.filename.slice(0, HASH_LENGTH)}.${assetExt(asset.filename)}`, asset.bytes);
        },
      );
    }
  }
}

// One pass over the blobs: an asset file's name opens with its content hash, and only wanted blobs are used. A wanted
// blob the store no longer holds is reported by the use that wanted it.
async function planAssets(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  if (plan.assets.size === 0) {
    return;
  }
  const found = new Set<string>();
  for await (const file of source.files("assets", plan.notes)) {
    const hash = file.filename.slice(0, HASH_LENGTH);
    for (const { use } of plan.assets.get(hash) ?? []) {
      use(file);
    }
    found.add(hash);
  }
  for (const [hash, wanted] of plan.assets) {
    if (!found.has(hash)) {
      for (const { missing } of wanted) {
        missing();
      }
    }
  }
}

async function planLeftKinds(source: StProfileSource, plan: PlanBuilder): Promise<void> {
  for (const kind of NO_HOME_KINDS) {
    for await (const file of source.files(kind, plan.notes)) {
      plan.leave(kind, stemOf(file.filename), "no-sillytavern-home");
    }
  }
}

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

/** The SillyTavern export of the library `source` reads: every file with the door that takes it, and every row it
 *  left behind with why. */
export async function planStProfileExport(source: StProfileSource): Promise<StProfilePlan> {
  const plan = new PlanBuilder();
  await planCharacters(source, plan);
  await planChats(source, plan);
  await planWorlds(source, plan);
  await planPresets(source, plan);
  await planThemes(source, plan);
  await planRegex(source, plan);
  await planUserSettings(source, plan);
  await planPersonas(source, plan);
  await planDocuments(source, plan);
  await planGallery(source, plan);
  await planAssets(source, plan);
  await planLeftKinds(source, plan);
  plan.addBytes("personas", "settings.json", settingsFile(plan));
  return { entries: plan.entries, report: { files: plan.entries.map(({ path, kind, door }) => ({ path, kind, door })), left: plan.left } };
}
