// domain/import/loader/collect — profile-dir collector. Walks a staged ST profile through the injected
// ImportFsPort, reads/hashes/parses PNG cards + chat JSONL + settings.json personas,
// and pairs them into per-character bundles. Every read goes through an open `ImportDirectory`, never a path.
//
// Layout: <profileDir>/characters/*.png, /chats/<charDir>/*.jsonl, /settings.json, /User Avatars/*.png,
// /worlds/*.json, /OpenAI Settings/*.json (chat-completion presets), /groups/*.json + /group chats/*.jsonl.
// Cards and chat dirs pair by slugifyHandle. Every non-happy path is recorded in CollectResult, never silent.

import { characterHandleSchema, deriveCharacterHandle } from "@orb/contracts/character";
import type { ImportDirectory, ImportFsPort, StProfileHandledEntry } from "@orb/contracts/import";
import { chatDirCardCandidates, ST_SETTINGS_FILE, stProfileEntryDisposition } from "@orb/contracts/import";
import type { RegexScriptCard } from "@orb/contracts/regex";
import { regexScriptCardSchema } from "@orb/contracts/regex";
import type { CharacterHandle } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { chatContentHash, parseChatJsonl } from "#primitives/serde/chat";
import { portableParseError } from "#primitives/serde/lib";
import { parseThemeFile, THEME_SCHEMA_KIND } from "#primitives/serde/theme";
import { parseWorldBookFile } from "#primitives/serde/world-info";
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
} from "../contract/collection.ts";
import { ImportInfraFailureError, ProfileImportLimitError } from "../contract/errors.ts";
import { ST_POWER_USER_KEY, stAppearancePatch } from "../substrate/appearance.ts";
import { ST_BACKGROUND_DIR, stBackgroundMime, stBackgroundName } from "../substrate/background.ts";
import { importFileHash, parseCardPng, parsedCardImportHash, parsedCardTextHash } from "../substrate/card.ts";
import { parseStGroupFile } from "../substrate/group.ts";
import { parseStPersonas } from "../substrate/persona.ts";
import { parseStPresetFile, parseStSettingsPreset, ST_PRESET_DIR, ST_PRESET_SETTINGS_KEY } from "../substrate/preset.ts";
import { parseStTags } from "../substrate/tags.ts";

// Ceiling so a hostile staging dir with a million empty entries can't pin the loop.
const MAX_DIR_ENTRIES = 100_000;
// Beyond this a chat file is recorded in skippedChats, never silent.
const MAX_JSONL_BYTES = 67_108_864;
const PNG_EXT = /\.png$/i;
const JSONL_EXT = /\.jsonl$/i;
const JSON_EXT = /\.json$/i;

interface Group {
  card?: CollectedCard;
  chats: CollectedChat[];
  /** The ORIGINAL chats/ directory name (first writer wins) — the orphan wave's provenance + name-fallback
   *  signal; the slugified handle key loses the author's own casing/underscores ("Clover_Owl"). */
  dirName?: string;
}

/** One profile directory with its own listing, which says what each plane really is. */
type DirectoryEntries = Awaited<ReturnType<ImportDirectory["list"]>>;

interface ListedProfile {
  readonly dir: ImportDirectory;
  readonly entries: DirectoryEntries;
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
  readonly missingPersonaAvatars: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  /** Top-level profile entries the importer does not process (assets/backgrounds/extensions/presets/…). */
  readonly unhandled: string[];
  /** settings.json top-level sections the importer does not process (only `power_user.personas` is read). */
  readonly unhandledSettings: string[];
  /** Directories whose listing hit `MAX_DIR_ENTRIES` — the ceiling TRUNCATES, so everything past it was
   *  never examined. Recorded (never silent): a huge `characters/` or `chats/<dir>/` used to lose its tail
   *  while the report read normal. */
  readonly truncatedDirs: { dir: string; kept: number; total: number }[];
}

/** The flat profile-level dir holding EVERY group's transcripts (ST does not sub-directory them per group the
 *  way solo chats are; a group's own `chats[]` list is the only thing that says which leaves are its own). */
const GROUP_CHATS_DIR = "group chats" satisfies StProfileHandledEntry;
const GROUPS_DIR = "groups" satisfies StProfileHandledEntry;
const WORLDS_DIR = "worlds" satisfies StProfileHandledEntry;
const CHARACTERS_DIR = "characters" satisfies StProfileHandledEntry;
const CHATS_DIR = "chats" satisfies StProfileHandledEntry;
const AVATARS_DIR = "User Avatars" satisfies StProfileHandledEntry;
/** The ST profile subdirectory holding saved UI themes. */
const ST_THEME_DIR = "themes" satisfies StProfileHandledEntry;

// The top-level profile names the importer DOES consume are `ST_PROFILE_HANDLED_ENTRIES` in
// `@orb/contracts/import` — the one home both the browser planner and this collector read, so what the
// picker skips and what the report names agree. Every other entry is reported as unhandled so a
// whole-folder import never silently drops a plane.
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

// Sorted so collision disambiguation is deterministic — readdir order is filesystem-dependent. A listing
// that breaches the ceiling is TRUNCATED and RECORDED on `truncatedDirs`: the cap protects the loop from a
// hostile staging dir, but a silent slice is exactly the "reports success over an incomplete import" shape
// this collector's header forbids. The port's own failures arrive typed here too (the dir EXISTS but is
// unreadable ⇒ `ImportInfraFailureError`, never a raw errno escaping the domain).
async function listDir(dir: ImportDirectory, state: CollectState): Promise<DirectoryEntries> {
  let entries: DirectoryEntries;
  // The catch RE-THROWS — `rethrowInfraFailure` maps an
  // infra fault to the typed error and the trailing `throw` re-raises anything else unchanged (a missing dir
  // is the PORT's null at open, so nothing is swallowed here).
  try {
    entries = await dir.list();
  } catch (error) {
    rethrowInfraFailure(error, dir.path, "readdir");
    throw error;
  }
  const sorted = entries.toSorted((a, b) => a.name.localeCompare(b.name));
  if (sorted.length <= MAX_DIR_ENTRIES) {
    return sorted;
  }
  state.truncatedDirs.push({ dir: dir.path, kept: MAX_DIR_ENTRIES, total: sorted.length });
  return sorted.slice(0, MAX_DIR_ENTRIES);
}

/** `fs.readFile` for the BULK staged readers (cards, chat files, worlds, presets, themes, backgrounds,
 *  groups) — the ones with NO best-effort fallback of their own. They used to call the port bare, so an
 *  EACCES/EIO propagated as a raw errno: the caller saw "collection failed" with no path and no operation,
 *  which is precisely the claim {@link ImportInfraFailureError} exists to make. A non-infra error (a
 *  race-deleted `ENOENT`, anything `.code`-less) re-raises UNCHANGED — this wrapper only types the fault. */
async function readStagedFile(fs: ImportFsPort, dir: ImportDirectory, name: string): Promise<Uint8Array> {
  // The catch RE-THROWS in both arms (typed infra error,
  // else the original) — nothing is swallowed.
  try {
    return await dir.readFile(name);
  } catch (error) {
    rethrowInfraFailure(error, fs.join(dir.path, name), "readFile");
    throw error;
  }
}

/** {@link readStagedFile}'s `stat` twin — the chat-size gate reads a file's size before deciding to read it. */
async function statStagedFile(fs: ImportFsPort, dir: ImportDirectory, name: string): Promise<{ readonly size: number }> {
  // The catch RE-THROWS in both arms.
  try {
    return await dir.stat(name);
  } catch (error) {
    rethrowInfraFailure(error, fs.join(dir.path, name), "stat");
    throw error;
  }
}

/** Open one plane of `parent`, typing its infrastructure faults. Null is the port's absent plane. */
async function openPlane(fs: ImportFsPort, parent: ImportDirectory, name: string): Promise<ImportDirectory | null> {
  // The catch RE-THROWS in both arms.
  try {
    return await parent.openDirectory(name);
  } catch (error) {
    rethrowInfraFailure(error, fs.join(parent.path, name), "readdir");
    throw error;
  }
}

function rethrowProfileLimit(error: unknown): void {
  if (error instanceof ProfileImportLimitError) {
    throw error;
  }
}

/** True when `error` carries a Node fs `.code` other than `ENOENT` — the documented "missing" shape every
 *  best-effort collector below is allowed to fold into its no-value fallback. `ENOENT` and a `.code`-less
 *  error (a `JSON.parse` `SyntaxError` — the corrupt-FORMAT case) both stay swallowed; anything else
 *  (`EACCES`, `EISDIR`, `EIO`, `ELOOP`, a permission/hardware/mount fault) is an INFRASTRUCTURE failure. */
function isInfraFailure(error: unknown): boolean {
  if (!(error instanceof Error && "code" in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" && code !== "ENOENT";
}

/** The shared catch-arm guard for every best-effort staged-file read below: a `ProfileImportLimitError`
 *  always rethrows (pre-existing), and now an fs INFRASTRUCTURE failure rethrows too — tagged with the
 *  affected `path` + `operation` so the caller sees WHERE the import broke instead of silently continuing
 *  with an incomplete result that still reports success. A genuinely missing file or an unparseable
 *  (corrupt-format) one falls through unchanged — the caller's existing "treat as absent/default" fallback
 *  is the documented behavior for THOSE two cases, and this function must not touch it. */
function rethrowInfraFailure(error: unknown, path: string, operation: string): void {
  rethrowProfileLimit(error);
  // An ALREADY-typed failure from a nested wrapper rides through untouched. Without this the collectors that
  // own a documented fallback (the group-chat leaf, a persona avatar) would fold an inner
  // `ImportInfraFailureError` into "missing" — `isInfraFailure` keys on `.code`, and this error's own coded
  // shape is `import_infra_failure`, so the second pass would either re-wrap it or swallow it as absent.
  if (error instanceof ImportInfraFailureError) {
    throw error;
  }
  if (isInfraFailure(error)) {
    throw new ImportInfraFailureError(operation, path, error);
  }
}

// A plane the profile listing says is a directory, opened for resolving names read from file content. Later names
// select only what this listing held.
async function listedPlane(fs: ImportFsPort, profile: ListedProfile, plane: string): Promise<ImportDirectory | null> {
  return profile.entries.some((ent) => ent.name === plane && ent.kind === "directory") ? await openPlane(fs, profile.dir, plane) : null;
}

// The files a plane holds. A name from file content only selects an entry this listing already returned and never
// reaches the filesystem itself, so a climb, an absolute path or a separator has nothing to match. A linked file is
// never a "file" entry, so it stays out of reach.
async function planeFiles(plane: ImportDirectory | null, state: CollectState): Promise<ReadonlySet<string>> {
  if (plane === null) {
    return new Set();
  }
  const entries = await listDir(plane, state);
  return new Set(entries.filter((ent) => ent.kind === "file").map((ent) => ent.name));
}

// Numeric suffix instead of silently overwriting the first card on a slug collision. THE seam where a
// filename-derived slug becomes a card handle: it parses here, so every downstream position stays branded.
function disambiguate(state: CollectState, base: string): CharacterHandle {
  const parsed = characterHandleSchema.parse(base);
  let handle = parsed;
  let n = 2;
  while (state.byHandle.get(handle)?.card !== undefined) {
    handle = deriveCharacterHandle(parsed, `-${n}`);
    n += 1;
  }
  return handle;
}

async function collectCards(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<void> {
  await using charsDir = await openPlane(fs, profileDir, CHARACTERS_DIR);
  if (charsDir === null) {
    return;
  }
  for (const ent of await listDir(charsDir, state)) {
    if (ent.kind !== "file" || !PNG_EXT.test(ent.name)) {
      continue;
    }
    const bytes = await readStagedFile(fs, charsDir, ent.name);
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
    const handle = disambiguate(state, slugifyHandle(stem));
    // The card's `extensions.world` NAME-LINK (a lorebook NAME, not an id — 35 of 313 corpus cards carry
    // one). It stays in the extensions residue too (lossless); this copy is the driver's attach key.
    const worldRaw = parsed.card.extensions?.["world"];
    const worldName = typeof worldRaw === "string" && worldRaw.trim().length > 0 ? worldRaw : null;
    group(state, handle).card = {
      handle,
      cardBytes: bytes,
      contentHash: parsedCardImportHash(parsed),
      textHash: parsedCardTextHash(parsed),
      filename: ent.name,
      cardName: parsed.card.name,
      worldName,
      chats: [],
    };
  }
}

async function collectChatsForDir(args: {
  readonly fs: ImportFsPort;
  readonly chatsDir: ImportDirectory;
  readonly dirName: string;
  readonly state: CollectState;
  readonly wallClockZone: string | undefined;
}): Promise<void> {
  const { fs, chatsDir, dirName, state, wallClockZone } = args;
  const handle = characterHandleSchema.parse(slugifyHandle(dirName));
  if (state.skippedHandles.has(handle)) {
    return;
  }
  await using chatDir = await openPlane(fs, chatsDir, dirName);
  group(state, handle).dirName ??= dirName;
  if (chatDir === null) {
    return;
  }
  for (const fileEnt of await listDir(chatDir, state)) {
    if (fileEnt.kind !== "file" || !JSONL_EXT.test(fileEnt.name)) {
      continue;
    }
    const sz = await statStagedFile(fs, chatDir, fileEnt.name);
    if (sz.size > MAX_JSONL_BYTES) {
      state.skippedChats.push(fs.join(dirName, fileEnt.name));
      continue;
    }
    const bytes = await readStagedFile(fs, chatDir, fileEnt.name);
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
      sourceFile: fs.join(CHATS_DIR, dirName, fileEnt.name),
      importHash: chatContentHash(parsed),
      fileHash: importFileHash(bytes),
    });
  }
}

async function collectChats(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState, wallClockZone: string | undefined): Promise<void> {
  await using chatsDir = await openPlane(fs, profileDir, CHATS_DIR);
  if (chatsDir === null) {
    return;
  }
  for (const dirEnt of await listDir(chatsDir, state)) {
    if (dirEnt.kind === "directory") {
      await collectChatsForDir({ fs, chatsDir, dirName: dirEnt.name, state, wallClockZone });
    }
  }
}

// A chat dir whose slug minus an ST folder-name decoration matches a card (`chatDirCardCandidates`, the one
// rule the browser planner also pairs by). First candidate wins.
function fuzzyPair(state: CollectState): void {
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined || g.chats.length === 0) {
      continue;
    }
    for (const base of chatDirCardCandidates(handle)) {
      const target = state.byHandle.get(base);
      if (target?.card !== undefined && !state.skippedHandles.has(base)) {
        target.chats.push(...g.chats);
        g.chats = [];
        break;
      }
    }
  }
}

// Standalone lorebooks: `<profileDir>/worlds/*.json`, the ST grammar or an orb export, through the ONE
// world-info serde (an ST file takes the filename stem as its name); an unparseable file is recorded, never
// silent. A missing `worlds/` dir yields [].
async function collectWorlds(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<void> {
  await using worldsDir = await openPlane(fs, profileDir, WORLDS_DIR);
  if (worldsDir === null) {
    return;
  }
  for (const ent of await listDir(worldsDir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const bytes = await readStagedFile(fs, worldsDir, ent.name);
    const book = parseWorldBookFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (!book.ok) {
      state.unreadableWorlds.push(ent.name);
      continue;
    }
    state.worlds.push({ book: book.value });
  }
}

// ST saved CHAT-COMPLETION presets: `<profileDir>/OpenAI Settings/*.json`. Each is mapped to the orb-native
// portable shape by the substrate (through `tryImportStChatCompletionPreset`); an unparseable
// file is recorded, never silent. A missing dir yields nothing (the port resolves [] for a missing dir).
async function collectPresetDir(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<void> {
  await using dir = await openPlane(fs, profileDir, ST_PRESET_DIR);
  if (dir === null) {
    return;
  }
  for (const ent of await listDir(dir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(ST_PRESET_DIR, ent.name);
    const bytes = await readStagedFile(fs, dir, ent.name);
    const parsed = parseStPresetFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (parsed === null) {
      state.unreadablePresets.push(sourceFile);
      continue;
    }
    state.presets.push({ parsed, sourceFile });
  }
}

// Saved UI THEMES: `<profileDir>/themes/*.json`, through the ONE theme serde (an ST theme converts to the
// orb palette its colours safely map to; an orb export reads back as itself). A refusal always carries its
// reason, never a silent drop. A missing dir yields nothing.
async function collectThemes(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<void> {
  await using dir = await openPlane(fs, profileDir, ST_THEME_DIR);
  if (dir === null) {
    return;
  }
  for (const ent of await listDir(dir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(ST_THEME_DIR, ent.name);
    const bytes = await readStagedFile(fs, dir, ent.name);
    const result = parseThemeFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (!result.ok) {
      state.refusedThemes.push({ file: sourceFile, reason: result.detail ?? portableParseError(THEME_SCHEMA_KIND, result.reason) });
      continue;
    }
    for (const theme of result.value.themes) {
      state.themes.push({ parsed: { name: theme.name, override: theme.override, unmapped: result.stTheme?.unmapped ?? [] }, sourceFile });
    }
  }
}

// ST app BACKGROUNDS: `<profileDir>/backgrounds/*`. The bytes ride through to the driver (the domain cannot
// reach `domain/assets`); a non-media extension is recorded with its reason rather than guessed at. A missing
// dir yields nothing.
async function collectBackgrounds(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<void> {
  await using dir = await openPlane(fs, profileDir, ST_BACKGROUND_DIR);
  if (dir === null) {
    return;
  }
  for (const ent of await listDir(dir, state)) {
    if (ent.kind !== "file") {
      continue;
    }
    const sourceFile = fs.join(ST_BACKGROUND_DIR, ent.name);
    const mime = stBackgroundMime(ent.name);
    if (mime === null) {
      state.skippedBackgrounds.push({ file: sourceFile, reason: "not an importable image/video file (unrecognized extension)" });
      continue;
    }
    const bytes = await readStagedFile(fs, dir, ent.name);
    state.backgrounds.push({ filename: sourceFile, name: stBackgroundName(ent.name), mime, bytes });
  }
}

/** The LIVE `oai_settings` blob — the selected preset PLUS the author's unsaved edits, so dropping it would
 *  lose real tuning. Named `OpenAI (active)`, which never collides with a file preset. A missing/corrupt
 *  settings.json contributes nothing (the same best-effort posture as tags/personas). */
async function collectSettingsPreset(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<void> {
  let settingsRaw: unknown;
  const settingsPath = fs.join(profileDir.path, ST_SETTINGS_FILE);
  // `rethrowInfraFailure` escalates any real infra
  // fault (permission/disk); only a missing/corrupt settings.json falls through here, the documented
  // best-effort posture above (same as tags/personas) — nothing is dropped, there is nothing to collect.
  try {
    const bytes = await profileDir.readFile(ST_SETTINGS_FILE);
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return;
  }
  const parsed = parseStSettingsPreset(settingsRaw);
  if (parsed !== null) {
    state.presets.push({ parsed, sourceFile: `settings.json#${ST_PRESET_SETTINGS_KEY}` });
  }
}

// One group's transcripts: the leaves ITS OWN `chats[]` claims, read out of the flat profile-level
// `group chats/` dir. A claimed leaf with no readable/parseable file is recorded on the group, never silent.
async function collectGroupChats(args: {
  readonly fs: ImportFsPort;
  /** The open `group chats/` plane, or null when the profile has none. */
  readonly plane: ImportDirectory | null;
  /** The plane's own files: `leaves` come from a group file, so they may only select one of these. */
  readonly files: ReadonlySet<string>;
  readonly leaves: readonly string[];
  readonly groupName: string;
  readonly wallClockZone: string | undefined;
}): Promise<Pick<CollectedGroup, "chats" | "missingChatLeaves">> {
  const { fs, plane, files, leaves, groupName, wallClockZone } = args;
  const chats: CollectedChat[] = [];
  const missingChatLeaves: string[] = [];
  for (const leaf of leaves) {
    const fileName = `${leaf}.jsonl`;
    if (plane === null || !files.has(fileName)) {
      missingChatLeaves.push(fileName);
      continue;
    }
    let bytes: Uint8Array;
    // the catch pushes the leaf onto `missingChatLeaves`, which
    // `collectGroupChats` returns and `mergeRecords` copies to the report's `missingGroupChats`. Infra faults
    // rethrow first. Ends if `missingChatLeaves` stops being returned.
    try {
      const sz = await statStagedFile(fs, plane, fileName);
      if (sz.size > MAX_JSONL_BYTES) {
        missingChatLeaves.push(fileName);
        continue;
      }
      bytes = await plane.readFile(fileName);
    } catch (error) {
      rethrowInfraFailure(error, fs.join(plane.path, fileName), "readFile");
      missingChatLeaves.push(fileName);
      continue;
    }
    // `charDirName` is the GROUP name — the header-fallback ST writes as literal "unused" in a group file.
    // The zone rides in for the SAME reason the solo path threads it: a group transcript's `create_date` and
    // every `send_date` are ST's zone-less LOCAL wall clocks, so reading them as UTC lands the whole room at
    // the writing box's offset (measured: -6h on a Denver snapshot).
    const parsed = parseChatJsonl(new TextDecoder().decode(bytes), {
      fileName,
      charDirName: groupName,
      ...(wallClockZone !== undefined ? { wallClockZone } : {}),
    });
    if (parsed === null) {
      missingChatLeaves.push(fileName);
      continue;
    }
    chats.push({
      parsed,
      importedFrom: fileName,
      sourceFile: fs.join(GROUP_CHATS_DIR, fileName),
      importHash: chatContentHash(parsed),
      fileHash: importFileHash(bytes),
    });
  }
  return { chats, missingChatLeaves };
}

// ST groups: `<profileDir>/groups/*.json`. Members stay UNRESOLVED here (card filenames) — the filename →
// characterId mapping only exists after the character wave, so the driver owns the resolve.
async function collectGroups(fs: ImportFsPort, profile: ListedProfile, state: CollectState, wallClockZone: string | undefined): Promise<void> {
  await using plane = await listedPlane(fs, profile, GROUP_CHATS_DIR);
  const files = await planeFiles(plane, state);
  await using groupsDir = await openPlane(fs, profile.dir, GROUPS_DIR);
  if (groupsDir === null) {
    return;
  }
  for (const ent of await listDir(groupsDir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(GROUPS_DIR, ent.name);
    const bytes = await readStagedFile(fs, groupsDir, ent.name);
    const parsed = parseStGroupFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (parsed === null) {
      state.unreadableGroups.push(sourceFile);
      continue;
    }
    const { chats, missingChatLeaves } = await collectGroupChats({ fs, plane, files, leaves: parsed.chatLeaves, groupName: parsed.name, wallClockZone });
    state.groups.push({ parsed, sourceFile, chats, missingChatLeaves });
  }
}

// Enumerate what the importer does NOT process: every top-level profile entry the contracts tuple omits, plus
// every settings.json top-level section outside HANDLED_SETTINGS. Feeds the import report so a whole-folder
// import is honest about what it left behind (presets, quick replies, themes, extension configs, …).
async function collectUnhandled(fs: ImportFsPort, profile: ListedProfile, state: CollectState): Promise<void> {
  for (const ent of profile.entries) {
    if (!stProfileEntryDisposition(ent.name, ent.kind === "directory").handled) {
      state.unhandled.push(ent.kind === "directory" ? `${ent.name}/` : ent.name);
    }
  }
  const settingsPath = fs.join(profile.dir.path, ST_SETTINGS_FILE);
  // `rethrowInfraFailure` escalates real infra
  // faults; a missing/corrupt settings.json is documented below as nothing-to-report (personas collection
  // records its own absence separately).
  try {
    const bytes = await profile.dir.readFile(ST_SETTINGS_FILE);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed === "object" && parsed !== null) {
      for (const key of Object.keys(parsed)) {
        if (!HANDLED_SETTINGS.has(key)) {
          state.unhandledSettings.push(key);
        }
      }
    }
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    // No/corrupt settings.json — nothing to report from it (personas collection records its own absence).
  }
}

/** Best-effort: the orb `appearance` patch this profile's `power_user` section carries (the VIEWER half of
 *  what ST bundles into a theme file). A missing/corrupt settings.json yields `{}` — nothing is patched. */
async function collectAppearance(fs: ImportFsPort, profileDir: ImportDirectory): Promise<Record<string, unknown>> {
  const settingsPath = fs.join(profileDir.path, ST_SETTINGS_FILE);
  // `rethrowInfraFailure` escalates real infra
  // faults; only a missing/corrupt settings.json falls through, documented above as "yields `{}` — nothing
  // is patched."
  try {
    const bytes = await profileDir.readFile(ST_SETTINGS_FILE);
    return stAppearancePatch(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return {};
  }
}

/** Object-descent helper for the settings.json side-reads below: `descend(x, "a", "b")` = `x.a.b` when every
 *  hop is a plain object, else null — the tolerant read these best-effort collectors share. */
function descend(raw: unknown, ...keys: string[]): unknown {
  let cur: unknown = raw;
  for (const key of keys) {
    if (typeof cur !== "object" || cur === null) {
      return null;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Best-effort settings.json read shared by the two side-collectors below (tags/personas already own their
 *  copies of this posture): null on a missing/corrupt file, never a throw. */
async function readSettingsJson(fs: ImportFsPort, profileDir: ImportDirectory): Promise<unknown> {
  const settingsPath = fs.join(profileDir.path, ST_SETTINGS_FILE);
  // `rethrowInfraFailure` escalates real infra
  // faults; documented above — "null on a missing/corrupt file, never a throw," the shared best-effort
  // posture every side-collector below relies on.
  try {
    const bytes = await profileDir.readFile(ST_SETTINGS_FILE);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return null;
  }
}

/** ST's GLOBAL regex scripts — `extension_settings.regex`, the regex extension's "run on every chat" list
 *  (orb's identical semantic is the `global_regex_scripts` attachment). Each candidate parses through the
 *  ONE ST card-wire schema; a malformed one is COUNTED (the report prints it), never silent. A
 *  missing/corrupt settings.json yields zeroes — the same best-effort posture as tags/personas. */
async function collectGlobalRegexScripts(fs: ImportFsPort, profileDir: ImportDirectory): Promise<{ scripts: RegexScriptCard[]; malformed: number }> {
  const list = descend(await readSettingsJson(fs, profileDir), "extension_settings", "regex");
  const scripts: RegexScriptCard[] = [];
  let malformed = 0;
  for (const candidate of Array.isArray(list) ? list : []) {
    const parsed = regexScriptCardSchema.safeParse(candidate);
    if (parsed.success) {
      scripts.push(parsed.data);
    } else {
      malformed += 1;
    }
  }
  return { scripts, malformed };
}

/** One charLore entry's (stem, books) pair, or null when it carries no usable binding. */
function charLoreBinding(entry: unknown): { stem: string; books: string[] } | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const e = entry as Record<string, unknown>;
  const stem = typeof e["name"] === "string" ? e["name"].trim() : "";
  const books = Array.isArray(e["extraBooks"]) ? e["extraBooks"].filter((b): b is string => typeof b === "string" && b.trim().length > 0) : [];
  return stem.length > 0 && books.length > 0 ? { stem, books } : null;
}

/** ST's per-character EXTRA lorebook bindings — `world_info_settings.world_info.charLore`, each
 *  `{ name: <card filename stem>, extraBooks: <book NAMES> }` (SillyTavern `world-info.js` keys the entry
 *  by `getCharaFilename`, the avatar filename sans extension). Book names resolve at the driver against
 *  the owner's imported/standing library; the card's own `extensions.world` is the PRIMARY channel and
 *  rides `CollectedCard.worldName`. A missing/corrupt settings.json yields an empty map. */
async function collectCharLore(fs: ImportFsPort, profileDir: ImportDirectory): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const charLore = descend(await readSettingsJson(fs, profileDir), "world_info_settings", "world_info", "charLore");
  for (const entry of Array.isArray(charLore) ? charLore : []) {
    const binding = charLoreBinding(entry);
    if (binding !== null) {
      out.set(binding.stem, binding.books);
    }
  }
  return out;
}

/** Count the ST Data Bank + character-gallery planes so the report can NAME them with counts — these were
 *  fully silent before (buried under the `user/` "misc user files" line). `user/files/` holds Data Bank
 *  attachment bytes (orb counterpart: `domain/databank`); `user/images/<character>/` holds the per-character
 *  gallery (orb counterpart: the assets gallery verbs). BOTH are EMPTY on the real corpus, so the write
 *  waves are a named follow-up — this count line is what guarantees a future profile that carries data can
 *  never again lose it silently. */
async function countUserPlanes(fs: ImportFsPort, profileDir: ImportDirectory, state: CollectState): Promise<{ databankFiles: number; galleryImages: number }> {
  await using userDir = await openPlane(fs, profileDir, "user");
  if (userDir === null) {
    return { databankFiles: 0, galleryImages: 0 };
  }
  await using filesDir = await openPlane(fs, userDir, "files");
  const databankFiles = filesDir === null ? 0 : (await listDir(filesDir, state)).filter((ent) => ent.kind === "file").length;
  let galleryImages = 0;
  await using imagesDir = await openPlane(fs, userDir, "images");
  for (const ent of imagesDir === null ? [] : await listDir(imagesDir, state)) {
    if (ent.kind === "file") {
      galleryImages += 1;
      continue;
    }
    if (ent.kind !== "directory" || imagesDir === null) {
      continue;
    }
    await using characterDir = await openPlane(fs, imagesDir, ent.name);
    if (characterDir !== null) {
      galleryImages += (await listDir(characterDir, state)).filter((sub) => sub.kind === "file").length;
    }
  }
  return { databankFiles, galleryImages };
}

// Best-effort: the ST library-tag assignments (`settings.tags` + `tag_map`) resolved to per-entity tag names.
// A missing/corrupt settings.json yields an empty map. The driver attaches these to each imported character
// by matching the card filename against the map key (ST's `tag_map[character.avatar]`).
async function collectTags(fs: ImportFsPort, profileDir: ImportDirectory): Promise<ReadonlyMap<string, readonly string[]>> {
  const settingsPath = fs.join(profileDir.path, ST_SETTINGS_FILE);
  // `rethrowInfraFailure` escalates real infra
  // faults; only a missing/corrupt settings.json falls through, documented above as "yields an empty map."
  try {
    const bytes = await profileDir.readFile(ST_SETTINGS_FILE);
    return parseStTags(JSON.parse(new TextDecoder().decode(bytes))).byEntityKey;
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return new Map();
  }
}

// Best-effort: a missing/corrupt settings.json yields []; a missing avatar yields an avatar-less persona, recorded.
async function collectPersonas(fs: ImportFsPort, profile: ListedProfile, state: CollectState): Promise<CollectedPersona[]> {
  let settingsRaw: unknown;
  const settingsPath = fs.join(profile.dir.path, ST_SETTINGS_FILE);
  // `rethrowInfraFailure` escalates real infra
  // faults; documented above — "a missing/corrupt settings.json yields []."
  try {
    const bytes = await profile.dir.readFile(ST_SETTINGS_FILE);
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return [];
  }
  const { personas } = parseStPersonas(settingsRaw);
  await using avatarsDir = await listedPlane(fs, profile, AVATARS_DIR);
  // `personas` keys come from settings.json, so a name may only select a file this listing holds.
  const avatarFiles = await planeFiles(avatarsDir, state);
  const out: CollectedPersona[] = [];
  for (const parsed of personas) {
    if (avatarsDir === null || !avatarFiles.has(parsed.avatarFile)) {
      state.missingPersonaAvatars.push(parsed.avatarFile);
      out.push({ parsed });
      continue;
    }
    let avatarBytes: Uint8Array | undefined;
    // `rethrowInfraFailure` escalates real infra
    // faults; documented above — "a missing avatar yields an avatar-less persona" (the `out.push` below
    // branches on `avatarBytes !== undefined`).
    try {
      avatarBytes = await avatarsDir.readFile(parsed.avatarFile);
    } catch (error) {
      rethrowInfraFailure(error, fs.join(avatarsDir.path, parsed.avatarFile), "readFile");
      avatarBytes = undefined;
    }
    out.push(avatarBytes !== undefined ? { parsed, avatarBytes } : { parsed });
  }
  return out;
}

export async function collectBundlesFromDir(
  fs: ImportFsPort,
  profileDir: ImportDirectory,
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
    missingPersonaAvatars: [],
    skippedChats: [],
    skippedCharacters: [],
    unhandled: [],
    unhandledSettings: [],
    truncatedDirs: [],
  };

  const profile: ListedProfile = { dir: profileDir, entries: await listDir(profileDir, state) };
  await collectCards(fs, profileDir, state);
  await collectWorlds(fs, profileDir, state);
  await collectPresetDir(fs, profileDir, state);
  await collectSettingsPreset(fs, profileDir, state);
  await collectThemes(fs, profileDir, state);
  await collectBackgrounds(fs, profileDir, state);
  await collectGroups(fs, profile, state, wallClockZone);
  await collectUnhandled(fs, profile, state);

  await collectChats(fs, profileDir, state, wallClockZone);

  fuzzyPair(state);
  const personas = await collectPersonas(fs, profile, state);
  const tagsByEntityKey = await collectTags(fs, profileDir);
  const appearance = await collectAppearance(fs, profileDir);
  const globalRegex = await collectGlobalRegexScripts(fs, profileDir);
  const extraBooksByCardStem = await collectCharLore(fs, profileDir);
  const userPlanes = await countUserPlanes(fs, profileDir, state);

  const bundles: CollectedCard[] = [];
  const orphanChatDirs: string[] = [];
  const orphanBundles: CollectResult["orphanBundles"] = [];
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined) {
      bundles.push({ ...g.card, chats: g.chats });
    } else if (g.chats.length > 0) {
      orphanChatDirs.push(handle);
      // The orphan wave's input: the transcripts WITH their evidence (dir name + parsed headers) — without
      // it these chats would be counted, named in the report, and then thrown away. The map key IS the
      // collect-time handle (the same parse `collectChatsForDir` minted it through).
      orphanBundles.push({ dirName: g.dirName ?? handle, handle: characterHandleSchema.parse(handle), chats: g.chats });
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
    globalRegexScripts: globalRegex.scripts,
    malformedGlobalRegexScripts: globalRegex.malformed,
    extraBooksByCardStem,
    databankFileCount: userPlanes.databankFiles,
    galleryImageCount: userPlanes.galleryImages,
    orphanChatDirs,
    orphanBundles,
    unreadableCards: state.unreadableCards,
    unreadableWorlds: state.unreadableWorlds,
    unreadablePresets: state.unreadablePresets,
    refusedThemes: state.refusedThemes,
    skippedBackgrounds: state.skippedBackgrounds,
    unreadableGroups: state.unreadableGroups,
    missingPersonaAvatars: state.missingPersonaAvatars,
    skippedChats: state.skippedChats,
    skippedCharacters: state.skippedCharacters,
    unhandled: state.unhandled,
    unhandledSettings: state.unhandledSettings,
    truncatedDirs: state.truncatedDirs,
  };
}
