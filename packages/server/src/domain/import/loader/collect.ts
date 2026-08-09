// domain/import/loader/collect — profile-dir collector. Walks a staged ST profile through the injected
// ImportFsPort (domain-no-node-fs), reads/hashes/parses PNG cards + chat JSONL + settings.json personas,
// and pairs them into per-character bundles. Pure over the injected port — fixture-testable.
//
// Layout: <profileDir>/characters/*.png, /chats/<charDir>/*.jsonl, /settings.json, /User Avatars/*.png,
// /worlds/*.json, /OpenAI Settings/*.json (chat-completion presets), /groups/*.json + /group chats/*.jsonl.
// Cards and chat dirs pair by slugifyHandle. Every non-happy path is recorded in CollectResult, never silent.

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { parseChatJsonl } from "#kit/serde/chat";
import type {
  CollectedBackground,
  CollectedCard,
  CollectedChat,
  CollectedGroup,
  CollectedPersona,
  CollectedPreset,
  CollectedTheme,
  CollectedWorld,
  CollectResult,
  ImportFsPort,
} from "../contract/views.ts";
import { ST_POWER_USER_KEY, stAppearancePatch } from "../substrate/appearance.ts";
import { ST_BACKGROUND_DIR, stBackgroundMime, stBackgroundName } from "../substrate/background.ts";
import { importFileHash, parseCardPng } from "../substrate/card.ts";
import { parseStGroupFile } from "../substrate/group.ts";
import { parseStPersonas } from "../substrate/persona.ts";
import { parseStPresetFile, parseStSettingsPreset, ST_PRESET_DIR, ST_PRESET_SETTINGS_KEY } from "../substrate/preset.ts";
import { parseStTags } from "../substrate/tags.ts";
import { parseStThemeFile, ST_THEME_DIR } from "../substrate/theme.ts";
import { parseStWorldFile } from "../substrate/world.ts";

// Ceiling so a hostile staging dir with a million empty entries can't pin the loop.
const MAX_DIR_ENTRIES = 100_000;
// Beyond this a chat file is recorded in skippedChats, never silent.
const MAX_JSONL_BYTES = 67_108_864;
const PNG_EXT = /\.png$/i;
const JSONL_EXT = /\.jsonl$/i;
const JSON_EXT = /\.json$/i;
const TRAILING_DIGITS = /\d+$/;
const TRAILING_HYPHENS = /-+$/;
const SPEC_WRAPPER = /^main-(.+)-spec-v\d+$/;

interface Group {
  card?: CollectedCard;
  chats: CollectedChat[];
}

interface CollectState {
  readonly byHandle: Map<string, Group>;
  readonly skip: ReadonlySet<string>;
  readonly skippedHandles: Set<string>;
  readonly worlds: CollectedWorld[];
  readonly presets: CollectedPreset[];
  readonly themes: CollectedTheme[];
  readonly backgrounds: CollectedBackground[];
  readonly groups: CollectedGroup[];
  readonly unreadableWorlds: string[];
  readonly unreadablePresets: string[];
  readonly refusedThemes: { file: string; reason: string }[];
  readonly skippedBackgrounds: { file: string; reason: string }[];
  readonly unreadableGroups: string[];
  readonly unreadableCards: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  readonly collidedCards: { file: string; handle: CharacterHandle }[];
  /** Top-level profile entries the importer does not process (assets/backgrounds/extensions/presets/…). */
  readonly unhandled: string[];
  /** settings.json top-level sections the importer does not process (only `power_user.personas` is read). */
  readonly unhandledSettings: string[];
}

/** The flat profile-level dir holding EVERY group's transcripts (ST does not sub-directory them per group the
 *  way solo chats are; a group's own `chats[]` list is the only thing that says which leaves are its own). */
const GROUP_CHATS_DIR = "group chats";
const GROUPS_DIR = "groups";

// The top-level profile names the importer DOES consume — everything else in a user profile dir is reported
// as unhandled so a whole-folder import never silently drops a plane (quick replies, extensions, …).
// The CHAT-COMPLETION preset dir is handled; the three TEXT-completion families deliberately are not (owner
// ruling 2026-08-08 — orb has no text-completion mode), so they keep reporting as unhandled with that reason.
// `themes/` and `backgrounds/` graduated 2026-08-08 (owner rulings: backgrounds ARE orb's media library; a
// theme converts to the orb palette it safely maps to) — their old "no domain home" report reasons are gone.
const HANDLED_ENTRIES: ReadonlySet<string> = new Set([
  "characters",
  "chats",
  "worlds",
  "User Avatars",
  "settings.json",
  GROUPS_DIR,
  GROUP_CHATS_DIR,
  ST_PRESET_DIR,
  ST_THEME_DIR,
  ST_BACKGROUND_DIR,
]);
// The settings.json sections the importer reads: `power_user` (personas + the viewer `appearance` ergonomics
// + the GENERATION knobs that fold onto the live preset) + `tags`/`tag_map` (library tags, attached to
// imported characters by their card filename) + `oai_settings` (the LIVE chat-completion preset — the
// selected one WITH the author's unsaved edits). Every other top-level key is reported as an unimported
// setting (the three text-completion blobs, world_info_settings globals, horde config, extension state, …).
const HANDLED_SETTINGS: ReadonlySet<string> = new Set([ST_POWER_USER_KEY, "tags", "tag_map", ST_PRESET_SETTINGS_KEY]);

function group(state: CollectState, handle: CharacterHandle): Group {
  const existing = state.byHandle.get(handle);
  if (existing !== undefined) {
    return existing;
  }
  const fresh: Group = { chats: [] };
  state.byHandle.set(handle, fresh);
  return fresh;
}

// Sorted so collision disambiguation is deterministic — readdir order is filesystem-dependent.
async function listDir(fs: ImportFsPort, dir: string): Promise<{ name: string; kind: string }[]> {
  const ents = await fs.readdir(dir);
  const capped = ents.length > MAX_DIR_ENTRIES ? ents.slice(0, MAX_DIR_ENTRIES) : ents;
  return capped.toSorted((a, b) => a.name.localeCompare(b.name));
}

// Numeric suffix instead of silently overwriting the first card on a slug collision. THE seam where a
// filename-derived slug becomes a card handle — castId here, so every downstream position stays branded.
function disambiguate(state: CollectState, base: string, file: string): CharacterHandle {
  let handle = castId<CharacterHandle>(base);
  let n = 2;
  while (state.byHandle.get(handle)?.card !== undefined) {
    handle = castId<CharacterHandle>(`${base}-${n}`);
    n += 1;
  }
  if (handle !== base) {
    state.collidedCards.push({ file, handle });
  }
  return handle;
}

async function collectCards(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const charsDir = fs.join(profileDir, "characters");
  for (const ent of await listDir(fs, charsDir)) {
    if (ent.kind !== "file" || !PNG_EXT.test(ent.name)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: cards are read + hashed sequentially — a bounded, one-time collection scan, not a hot path.
    const bytes = await fs.readFile(fs.join(charsDir, ent.name));
    const stem = ent.name.replace(PNG_EXT, "");
    const parsed = await parseCardPng(bytes, stem);
    if (parsed === null) {
      state.unreadableCards.push(ent.name);
      continue;
    }
    if (state.skip.has(parsed.card.name.trim().toLowerCase())) {
      state.skippedHandles.add(slugifyHandle(stem));
      state.skippedCharacters.push(parsed.card.name);
      continue;
    }
    const handle = disambiguate(state, slugifyHandle(stem), ent.name);
    group(state, handle).card = { handle, cardBytes: bytes, filename: ent.name, cardName: parsed.card.name, chats: [] };
  }
}

async function collectChatsForDir(args: {
  readonly fs: ImportFsPort;
  readonly chatsDir: string;
  readonly dirName: string;
  readonly state: CollectState;
  readonly wallClockZone: string | undefined;
}): Promise<void> {
  const { fs, chatsDir, dirName, state, wallClockZone } = args;
  const handle = castId<CharacterHandle>(slugifyHandle(dirName));
  if (state.skippedHandles.has(handle)) {
    return;
  }
  const dirPath = fs.join(chatsDir, dirName);
  for (const fileEnt of await listDir(fs, dirPath)) {
    if (fileEnt.kind !== "file" || !JSONL_EXT.test(fileEnt.name)) {
      continue;
    }
    const filePath = fs.join(dirPath, fileEnt.name);
    // biome-ignore lint/performance/noAwaitInLoops: chats are stat+read+parsed sequentially — a one-time collection scan bounded by the dir cap, not a hot path.
    const sz = await fs.stat(filePath);
    if (sz.size > MAX_JSONL_BYTES) {
      state.skippedChats.push(fs.join(dirName, fileEnt.name));
      continue;
    }
    const bytes = await fs.readFile(filePath);
    const parsed = parseChatJsonl(new TextDecoder().decode(bytes), {
      fileName: fileEnt.name,
      charDirName: dirName,
      // ST wrote these wall clocks against ITS box's local zone (`humanizedDateTime`); the driver injects it.
      ...(wallClockZone !== undefined ? { wallClockZone } : {}),
    });
    if (parsed === null) {
      continue;
    }
    group(state, handle).chats.push({
      parsed,
      importedFrom: fileEnt.name,
      importHash: importFileHash(bytes),
    });
  }
}

// A chat dir whose slug minus an ST folder-name decoration uniquely matches a card. First candidate wins.
function fuzzyPair(state: CollectState): { chatDir: string; handle: CharacterHandle }[] {
  const fuzzyPairedDirs: { chatDir: string; handle: CharacterHandle }[] = [];
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined || g.chats.length === 0) {
      continue;
    }
    const candidates = [handle.replace(TRAILING_DIGITS, "").replace(TRAILING_HYPHENS, ""), SPEC_WRAPPER.exec(handle)?.[1]].filter(
      (b): b is string => b !== undefined && b.length > 0 && b !== handle,
    );
    for (const base of candidates) {
      const target = state.byHandle.get(base);
      if (target?.card !== undefined && !state.skippedHandles.has(base)) {
        target.chats.push(...g.chats);
        g.chats = [];
        fuzzyPairedDirs.push({ chatDir: handle, handle: castId<CharacterHandle>(base) });
        break;
      }
    }
  }
  return fuzzyPairedDirs;
}

// ST-native standalone lorebooks: `<profileDir>/worlds/*.json`. Each is parsed to the canonical book shape
// (name = filename stem); an unparseable file is recorded, never silent. A missing `worlds/` dir yields [].
async function collectWorlds(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const worldsDir = fs.join(profileDir, "worlds");
  for (const ent of await listDir(fs, worldsDir)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: worlds are read + parsed sequentially — a one-time collection scan bounded by the dir cap, not a hot path.
    const bytes = await fs.readFile(fs.join(worldsDir, ent.name));
    const book = parseStWorldFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (book === null) {
      state.unreadableWorlds.push(ent.name);
      continue;
    }
    state.worlds.push({ book });
  }
}

// ST saved CHAT-COMPLETION presets: `<profileDir>/OpenAI Settings/*.json`. Each is mapped to the orb-native
// portable shape by the substrate (through the already-shipped `importStChatCompletionPreset`); an unparseable
// file is recorded, never silent. A missing dir yields nothing (the port resolves [] for a missing dir).
async function collectPresetDir(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const dir = fs.join(profileDir, ST_PRESET_DIR);
  for (const ent of await listDir(fs, dir)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(ST_PRESET_DIR, ent.name);
    // biome-ignore lint/performance/noAwaitInLoops: preset files are read + parsed sequentially during the one-time collection scan, not a hot path.
    const bytes = await fs.readFile(fs.join(dir, ent.name));
    const parsed = parseStPresetFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (parsed === null) {
      state.unreadablePresets.push(sourceFile);
      continue;
    }
    state.presets.push({ parsed, sourceFile });
  }
}

// ST saved UI THEMES: `<profileDir>/themes/*.json`. Each converts to the orb palette its colours SAFELY map
// to — flattened, oklch-converted, and run through orb's own derivation-safety gate (`substrate/theme.ts`).
// A refusal always carries its reason (unreadable, colour-less, or a base surface orb cannot derive a legible
// foreground from), never a silent drop. A missing dir yields nothing.
async function collectThemes(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const dir = fs.join(profileDir, ST_THEME_DIR);
  for (const ent of await listDir(fs, dir)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(ST_THEME_DIR, ent.name);
    // biome-ignore lint/performance/noAwaitInLoops: theme files are read + parsed sequentially during the one-time collection scan, not a hot path.
    const bytes = await fs.readFile(fs.join(dir, ent.name));
    const result = parseStThemeFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (!result.ok) {
      state.refusedThemes.push({ file: sourceFile, reason: result.reason });
      continue;
    }
    state.themes.push({ parsed: result.parsed, sourceFile });
  }
}

// ST app BACKGROUNDS: `<profileDir>/backgrounds/*`. The bytes ride through to the driver (the domain cannot
// reach `domain/assets`); a non-media extension is recorded with its reason rather than guessed at. A missing
// dir yields nothing.
async function collectBackgrounds(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const dir = fs.join(profileDir, ST_BACKGROUND_DIR);
  for (const ent of await listDir(fs, dir)) {
    if (ent.kind !== "file") {
      continue;
    }
    const sourceFile = fs.join(ST_BACKGROUND_DIR, ent.name);
    const mime = stBackgroundMime(ent.name);
    if (mime === null) {
      state.skippedBackgrounds.push({ file: sourceFile, reason: "not an importable image/video file (unrecognized extension)" });
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: background files are read sequentially during the one-time collection scan, not a hot path.
    const bytes = await fs.readFile(fs.join(dir, ent.name));
    state.backgrounds.push({ filename: sourceFile, name: stBackgroundName(ent.name), mime, bytes });
  }
}

/** The LIVE `oai_settings` blob — the selected preset PLUS the author's unsaved edits, so dropping it would
 *  lose real tuning. Named `OpenAI (active)`, which never collides with a file preset. A missing/corrupt
 *  settings.json contributes nothing (the same best-effort posture as tags/personas). */
async function collectSettingsPreset(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  let settingsRaw: unknown;
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return;
  }
  const parsed = parseStSettingsPreset(settingsRaw);
  if (parsed !== null) {
    state.presets.push({ parsed, sourceFile: `settings.json#${ST_PRESET_SETTINGS_KEY}` });
  }
}

// One group's transcripts: the leaves ITS OWN `chats[]` claims, read out of the flat profile-level
// `group chats/` dir. A claimed leaf with no readable/parseable file is recorded on the group, never silent.
async function collectGroupChats(
  fs: ImportFsPort,
  profileDir: string,
  leaves: readonly string[],
  groupName: string,
): Promise<Pick<CollectedGroup, "chats" | "missingChatLeaves">> {
  const dir = fs.join(profileDir, GROUP_CHATS_DIR);
  const chats: CollectedChat[] = [];
  const missingChatLeaves: string[] = [];
  for (const leaf of leaves) {
    const fileName = `${leaf}.jsonl`;
    const filePath = fs.join(dir, fileName);
    let bytes: Uint8Array;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a group's transcripts are stat+read sequentially during the one-time collection scan.
      const sz = await fs.stat(filePath);
      if (sz.size > MAX_JSONL_BYTES) {
        missingChatLeaves.push(fileName);
        continue;
      }
      bytes = await fs.readFile(filePath);
    } catch {
      missingChatLeaves.push(fileName);
      continue;
    }
    // `charDirName` is the GROUP name — the header-fallback ST writes as literal "unused" in a group file.
    const parsed = parseChatJsonl(new TextDecoder().decode(bytes), { fileName, charDirName: groupName });
    if (parsed === null) {
      missingChatLeaves.push(fileName);
      continue;
    }
    chats.push({ parsed, importedFrom: fileName, importHash: importFileHash(bytes) });
  }
  return { chats, missingChatLeaves };
}

// ST groups: `<profileDir>/groups/*.json`. Members stay UNRESOLVED here (card filenames) — the filename →
// characterId mapping only exists after the character wave, so the driver owns the resolve.
async function collectGroups(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const groupsDir = fs.join(profileDir, GROUPS_DIR);
  for (const ent of await listDir(fs, groupsDir)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(GROUPS_DIR, ent.name);
    // biome-ignore lint/performance/noAwaitInLoops: group definitions are read sequentially during the one-time collection scan.
    const bytes = await fs.readFile(fs.join(groupsDir, ent.name));
    const parsed = parseStGroupFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (parsed === null) {
      state.unreadableGroups.push(sourceFile);
      continue;
    }
    const { chats, missingChatLeaves } = await collectGroupChats(fs, profileDir, parsed.chatLeaves, parsed.name);
    state.groups.push({ parsed, sourceFile, chats, missingChatLeaves });
  }
}

// Enumerate what the importer does NOT process: every top-level profile entry outside HANDLED_ENTRIES, plus
// every settings.json top-level section outside HANDLED_SETTINGS. Feeds the import report so a whole-folder
// import is honest about what it left behind (presets, quick replies, themes, extension configs, …).
async function collectUnhandled(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  for (const ent of await listDir(fs, profileDir)) {
    if (!HANDLED_ENTRIES.has(ent.name)) {
      state.unhandled.push(ent.kind === "directory" ? `${ent.name}/` : ent.name);
    }
  }
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed === "object" && parsed !== null) {
      for (const key of Object.keys(parsed)) {
        if (!HANDLED_SETTINGS.has(key)) {
          state.unhandledSettings.push(key);
        }
      }
    }
  } catch {
    // No/corrupt settings.json — nothing to report from it (personas collection records its own absence).
  }
}

/** Best-effort: the orb `appearance` patch this profile's `power_user` section carries (the VIEWER half of
 *  what ST bundles into a theme file). A missing/corrupt settings.json yields `{}` — nothing is patched. */
async function collectAppearance(fs: ImportFsPort, profileDir: string): Promise<Record<string, unknown>> {
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    return stAppearancePatch(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return {};
  }
}

// Best-effort: the ST library-tag assignments (`settings.tags` + `tag_map`) resolved to per-entity tag names.
// A missing/corrupt settings.json yields an empty map. The driver attaches these to each imported character
// by matching the card filename against the map key (ST's `tag_map[character.avatar]`).
async function collectTags(fs: ImportFsPort, profileDir: string): Promise<ReadonlyMap<string, readonly string[]>> {
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    return parseStTags(JSON.parse(new TextDecoder().decode(bytes))).byEntityKey;
  } catch {
    return new Map();
  }
}

// Best-effort: a missing/corrupt settings.json yields []; a missing avatar yields an avatar-less persona.
async function collectPersonas(fs: ImportFsPort, profileDir: string): Promise<CollectedPersona[]> {
  let settingsRaw: unknown;
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  const { personas } = parseStPersonas(settingsRaw);
  const avatarsDir = fs.join(profileDir, "User Avatars");
  const out: CollectedPersona[] = [];
  for (const parsed of personas) {
    let avatarBytes: Uint8Array | undefined;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: avatar bytes are read sequentially during the one-time collection scan (a short persona list), not a hot path.
      avatarBytes = await fs.readFile(fs.join(avatarsDir, parsed.avatarFile));
    } catch {
      avatarBytes = undefined;
    }
    out.push(avatarBytes !== undefined ? { parsed, avatarBytes } : { parsed });
  }
  return out;
}

export async function collectBundlesFromDir(
  fs: ImportFsPort,
  profileDir: string,
  skipCharacterNames: readonly string[] = [],
  /** The zone ST's wall-clock chat dates were written in (see `ImportProfileDeps.stWallClockZone`); absent ⇒
   *  the serde's `"UTC"` default. */
  wallClockZone?: string,
): Promise<CollectResult> {
  const state: CollectState = {
    byHandle: new Map<string, Group>(),
    skip: new Set(skipCharacterNames.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)),
    skippedHandles: new Set<string>(),
    worlds: [],
    presets: [],
    themes: [],
    backgrounds: [],
    groups: [],
    unreadableWorlds: [],
    unreadablePresets: [],
    refusedThemes: [],
    skippedBackgrounds: [],
    unreadableGroups: [],
    unreadableCards: [],
    skippedChats: [],
    skippedCharacters: [],
    collidedCards: [],
    unhandled: [],
    unhandledSettings: [],
  };

  await collectCards(fs, profileDir, state);
  await collectWorlds(fs, profileDir, state);
  await collectPresetDir(fs, profileDir, state);
  await collectSettingsPreset(fs, profileDir, state);
  await collectThemes(fs, profileDir, state);
  await collectBackgrounds(fs, profileDir, state);
  await collectGroups(fs, profileDir, state);
  await collectUnhandled(fs, profileDir, state);

  const chatsDir = fs.join(profileDir, "chats");
  for (const dirEnt of await listDir(fs, chatsDir)) {
    if (dirEnt.kind === "directory") {
      // biome-ignore lint/performance/noAwaitInLoops: chat dirs are scanned sequentially (one-time collection), each its own bounded read loop.
      await collectChatsForDir({ fs, chatsDir, dirName: dirEnt.name, state, wallClockZone });
    }
  }

  const fuzzyPairedDirs = fuzzyPair(state);
  const personas = await collectPersonas(fs, profileDir);
  const tagsByEntityKey = await collectTags(fs, profileDir);
  const appearance = await collectAppearance(fs, profileDir);

  const bundles: CollectedCard[] = [];
  const orphanChatDirs: string[] = [];
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined) {
      bundles.push({ ...g.card, chats: g.chats });
    } else if (g.chats.length > 0) {
      orphanChatDirs.push(handle);
    }
  }

  return {
    bundles,
    personas,
    worlds: state.worlds,
    presets: state.presets,
    themes: state.themes,
    backgrounds: state.backgrounds,
    appearance,
    groups: state.groups,
    tagsByEntityKey,
    orphanChatDirs,
    unreadableCards: state.unreadableCards,
    unreadableWorlds: state.unreadableWorlds,
    unreadablePresets: state.unreadablePresets,
    refusedThemes: state.refusedThemes,
    skippedBackgrounds: state.skippedBackgrounds,
    unreadableGroups: state.unreadableGroups,
    skippedChats: state.skippedChats,
    skippedCharacters: state.skippedCharacters,
    collidedCards: state.collidedCards,
    unhandled: state.unhandled,
    unhandledSettings: state.unhandledSettings,
    fuzzyPairedDirs,
  };
}
