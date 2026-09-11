// domain/import/loader/collect — profile-dir collector. Walks a staged ST profile through the injected
// ImportFsPort (domain-no-node-fs), reads/hashes/parses PNG cards + chat JSONL + settings.json personas,
// and pairs them into per-character bundles. Pure over the injected port — fixture-testable.
//
// Layout: <profileDir>/characters/*.png, /chats/<charDir>/*.jsonl, /settings.json, /User Avatars/*.png,
// /worlds/*.json, /OpenAI Settings/*.json (chat-completion presets), /groups/*.json + /group chats/*.jsonl.
// Cards and chat dirs pair by slugifyHandle. Every non-happy path is recorded in CollectResult, never silent.

import type { RegexScriptCard } from "@orb/contracts/regex";
import { regexScriptCardSchema } from "@orb/contracts/regex";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { parseChatJsonl } from "#kit/serde/chat";
import { ImportInfraFailureError, ProfileImportLimitError } from "../contract/errors.ts";
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
  /** The ORIGINAL chats/ directory name (first writer wins) — the orphan wave's provenance + name-fallback
   *  signal; the slugified handle key loses the author's own casing/underscores ("Bonnie_Cow"). */
  dirName?: string;
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
  /** Directories whose listing hit `MAX_DIR_ENTRIES` — the ceiling TRUNCATES, so everything past it was
   *  never examined. Recorded (never silent): a huge `characters/` or `chats/<dir>/` used to lose its tail
   *  while the report read normal. */
  readonly truncatedDirs: { dir: string; kept: number; total: number }[];
}

/** The flat profile-level dir holding EVERY group's transcripts (ST does not sub-directory them per group the
 *  way solo chats are; a group's own `chats[]` list is the only thing that says which leaves are its own). */
const GROUP_CHATS_DIR = "group chats";
const GROUPS_DIR = "groups";

// The top-level profile names the importer DOES consume — everything else in a user profile dir is reported
// as unhandled so a whole-folder import never silently drops a plane (quick replies, extensions, …).
// The CHAT-COMPLETION preset dir is handled; the three TEXT-completion families deliberately are not (owner
// ruling — orb has no text-completion mode), so they keep reporting as unhandled with that reason.
// `themes/` and `backgrounds/` are handled too (owner rulings: backgrounds ARE orb's media library; a
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

// Sorted so collision disambiguation is deterministic — readdir order is filesystem-dependent. A listing
// that breaches the ceiling is TRUNCATED and RECORDED on `truncatedDirs`: the cap protects the loop from a
// hostile staging dir, but a silent slice is exactly the "reports success over an incomplete import" shape
// this collector's header forbids. The port's own failures arrive typed here too (the dir EXISTS but is
// unreadable ⇒ `ImportInfraFailureError`, never a raw errno escaping the domain).
async function listDir(fs: ImportFsPort, dir: string, state: CollectState): Promise<{ name: string; kind: string }[]> {
  let entries: readonly { name: string; kind: string }[];
  // The catch RE-THROWS — `rethrowInfraFailure` maps an
  // infra fault to the typed error and the trailing `throw` re-raises anything else unchanged (a missing dir
  // is the PORT's `[]`, so nothing is swallowed here).
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    rethrowInfraFailure(error, dir, "readdir");
    throw error;
  }
  const sorted = entries.toSorted((a, b) => a.name.localeCompare(b.name));
  if (sorted.length <= MAX_DIR_ENTRIES) {
    return sorted;
  }
  state.truncatedDirs.push({ dir, kept: MAX_DIR_ENTRIES, total: sorted.length });
  return sorted.slice(0, MAX_DIR_ENTRIES);
}

/** `fs.readFile` for the BULK staged readers (cards, chat files, worlds, presets, themes, backgrounds,
 *  groups) — the ones with NO best-effort fallback of their own. They used to call the port bare, so an
 *  EACCES/EIO propagated as a raw errno: the caller saw "collection failed" with no path and no operation,
 *  which is precisely the claim {@link ImportInfraFailureError} exists to make. A non-infra error (a
 *  race-deleted `ENOENT`, anything `.code`-less) re-raises UNCHANGED — this wrapper only types the fault. */
async function readStagedFile(fs: ImportFsPort, path: string): Promise<Uint8Array> {
  // The catch RE-THROWS in both arms (typed infra error,
  // else the original) — nothing is swallowed.
  try {
    return await fs.readFile(path);
  } catch (error) {
    rethrowInfraFailure(error, path, "readFile");
    throw error;
  }
}

/** {@link readStagedFile}'s `stat` twin — the chat-size gate reads a file's size before deciding to read it. */
async function statStagedFile(fs: ImportFsPort, path: string): Promise<{ readonly size: number }> {
  // The catch RE-THROWS in both arms.
  try {
    return await fs.stat(path);
  } catch (error) {
    rethrowInfraFailure(error, path, "stat");
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

/** The shared catch-arm guard for every best-effort staged-file read below (#763): a `ProfileImportLimitError`
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
  for (const ent of await listDir(fs, charsDir, state)) {
    if (ent.kind !== "file" || !PNG_EXT.test(ent.name)) {
      continue;
    }
    const bytes = await readStagedFile(fs, fs.join(charsDir, ent.name));
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
    // The card's `extensions.world` NAME-LINK (a lorebook NAME, not an id — 35 of 313 corpus cards carry
    // one). It stays in the extensions residue too (lossless); this copy is the driver's attach key.
    const worldRaw = parsed.card.extensions?.["world"];
    const worldName = typeof worldRaw === "string" && worldRaw.trim().length > 0 ? worldRaw : null;
    group(state, handle).card = { handle, cardBytes: bytes, filename: ent.name, cardName: parsed.card.name, worldName, chats: [] };
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
  group(state, handle).dirName ??= dirName;
  for (const fileEnt of await listDir(fs, dirPath, state)) {
    if (fileEnt.kind !== "file" || !JSONL_EXT.test(fileEnt.name)) {
      continue;
    }
    const filePath = fs.join(dirPath, fileEnt.name);
    const sz = await statStagedFile(fs, filePath);
    if (sz.size > MAX_JSONL_BYTES) {
      state.skippedChats.push(fs.join(dirName, fileEnt.name));
      continue;
    }
    const bytes = await readStagedFile(fs, filePath);
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
  for (const ent of await listDir(fs, worldsDir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const bytes = await readStagedFile(fs, fs.join(worldsDir, ent.name));
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
  for (const ent of await listDir(fs, dir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(ST_PRESET_DIR, ent.name);
    const bytes = await readStagedFile(fs, fs.join(dir, ent.name));
    const parsed = parseStPresetFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (parsed === null) {
      state.unreadablePresets.push(sourceFile);
      continue;
    }
    state.presets.push({ parsed, sourceFile });
  }
}

// ST saved UI THEMES: `<profileDir>/themes/*.json`. Each converts to the orb palette its colours safely map
// to — flattened and oklch-converted before entering Orb's total ThemeScope derivation (`substrate/theme.ts`).
// A refusal always carries its reason (unreadable or colour-less), never a silent drop. A missing dir yields
// nothing.
async function collectThemes(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const dir = fs.join(profileDir, ST_THEME_DIR);
  for (const ent of await listDir(fs, dir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(ST_THEME_DIR, ent.name);
    const bytes = await readStagedFile(fs, fs.join(dir, ent.name));
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
  for (const ent of await listDir(fs, dir, state)) {
    if (ent.kind !== "file") {
      continue;
    }
    const sourceFile = fs.join(ST_BACKGROUND_DIR, ent.name);
    const mime = stBackgroundMime(ent.name);
    if (mime === null) {
      state.skippedBackgrounds.push({ file: sourceFile, reason: "not an importable image/video file (unrecognized extension)" });
      continue;
    }
    const bytes = await readStagedFile(fs, fs.join(dir, ent.name));
    state.backgrounds.push({ filename: sourceFile, name: stBackgroundName(ent.name), mime, bytes });
  }
}

/** The LIVE `oai_settings` blob — the selected preset PLUS the author's unsaved edits, so dropping it would
 *  lose real tuning. Named `OpenAI (active)`, which never collides with a file preset. A missing/corrupt
 *  settings.json contributes nothing (the same best-effort posture as tags/personas). */
async function collectSettingsPreset(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  let settingsRaw: unknown;
  const settingsPath = fs.join(profileDir, "settings.json");
  // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates any real infra
  // fault (permission/disk); only a missing/corrupt settings.json falls through here, the documented
  // best-effort posture above (same as tags/personas) — nothing is dropped, there is nothing to collect.
  try {
    const bytes = await fs.readFile(settingsPath);
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
  readonly profileDir: string;
  readonly leaves: readonly string[];
  readonly groupName: string;
  readonly wallClockZone: string | undefined;
}): Promise<Pick<CollectedGroup, "chats" | "missingChatLeaves">> {
  const { fs, profileDir, leaves, groupName, wallClockZone } = args;
  const dir = fs.join(profileDir, GROUP_CHATS_DIR);
  const chats: CollectedChat[] = [];
  const missingChatLeaves: string[] = [];
  for (const leaf of leaves) {
    const fileName = `${leaf}.jsonl`;
    const filePath = fs.join(dir, fileName);
    let bytes: Uint8Array;
    // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
    // faults; a missing/unreadable leaf is recorded on `missingChatLeaves` (the function header: "a claimed
    // leaf with no readable/parseable file is recorded on the group, never silent"), never dropped.
    try {
      const sz = await statStagedFile(fs, filePath);
      if (sz.size > MAX_JSONL_BYTES) {
        missingChatLeaves.push(fileName);
        continue;
      }
      bytes = await fs.readFile(filePath);
    } catch (error) {
      rethrowInfraFailure(error, filePath, "readFile");
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
    chats.push({ parsed, importedFrom: fileName, importHash: importFileHash(bytes) });
  }
  return { chats, missingChatLeaves };
}

// ST groups: `<profileDir>/groups/*.json`. Members stay UNRESOLVED here (card filenames) — the filename →
// characterId mapping only exists after the character wave, so the driver owns the resolve.
async function collectGroups(fs: ImportFsPort, profileDir: string, state: CollectState, wallClockZone: string | undefined): Promise<void> {
  const groupsDir = fs.join(profileDir, GROUPS_DIR);
  for (const ent of await listDir(fs, groupsDir, state)) {
    if (ent.kind !== "file" || !JSON_EXT.test(ent.name)) {
      continue;
    }
    const sourceFile = fs.join(GROUPS_DIR, ent.name);
    const bytes = await readStagedFile(fs, fs.join(groupsDir, ent.name));
    const parsed = parseStGroupFile(bytes, ent.name.replace(JSON_EXT, ""));
    if (parsed === null) {
      state.unreadableGroups.push(sourceFile);
      continue;
    }
    const { chats, missingChatLeaves } = await collectGroupChats({ fs, profileDir, leaves: parsed.chatLeaves, groupName: parsed.name, wallClockZone });
    state.groups.push({ parsed, sourceFile, chats, missingChatLeaves });
  }
}

// Enumerate what the importer does NOT process: every top-level profile entry outside HANDLED_ENTRIES, plus
// every settings.json top-level section outside HANDLED_SETTINGS. Feeds the import report so a whole-folder
// import is honest about what it left behind (presets, quick replies, themes, extension configs, …).
async function collectUnhandled(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  for (const ent of await listDir(fs, profileDir, state)) {
    if (!HANDLED_ENTRIES.has(ent.name)) {
      state.unhandled.push(ent.kind === "directory" ? `${ent.name}/` : ent.name);
    }
  }
  const settingsPath = fs.join(profileDir, "settings.json");
  // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
  // faults; a missing/corrupt settings.json is documented below as nothing-to-report (personas collection
  // records its own absence separately).
  try {
    const bytes = await fs.readFile(settingsPath);
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
async function collectAppearance(fs: ImportFsPort, profileDir: string): Promise<Record<string, unknown>> {
  const settingsPath = fs.join(profileDir, "settings.json");
  // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
  // faults; only a missing/corrupt settings.json falls through, documented above as "yields `{}` — nothing
  // is patched."
  try {
    const bytes = await fs.readFile(settingsPath);
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
async function readSettingsJson(fs: ImportFsPort, profileDir: string): Promise<unknown> {
  const settingsPath = fs.join(profileDir, "settings.json");
  // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
  // faults; documented above — "null on a missing/corrupt file, never a throw," the shared best-effort
  // posture every side-collector below relies on.
  try {
    const bytes = await fs.readFile(settingsPath);
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
async function collectGlobalRegexScripts(fs: ImportFsPort, profileDir: string): Promise<{ scripts: RegexScriptCard[]; malformed: number }> {
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
async function collectCharLore(fs: ImportFsPort, profileDir: string): Promise<Map<string, string[]>> {
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
async function countUserPlanes(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<{ databankFiles: number; galleryImages: number }> {
  let databankFiles = 0;
  for (const ent of await listDir(fs, fs.join(profileDir, "user", "files"), state)) {
    if (ent.kind === "file") {
      databankFiles += 1;
    }
  }
  let galleryImages = 0;
  const imagesDir = fs.join(profileDir, "user", "images");
  for (const ent of await listDir(fs, imagesDir, state)) {
    if (ent.kind === "file") {
      galleryImages += 1;
      continue;
    }
    if (ent.kind !== "directory") {
      continue;
    }
    for (const sub of await listDir(fs, fs.join(imagesDir, ent.name), state)) {
      if (sub.kind === "file") {
        galleryImages += 1;
      }
    }
  }
  return { databankFiles, galleryImages };
}

// Best-effort: the ST library-tag assignments (`settings.tags` + `tag_map`) resolved to per-entity tag names.
// A missing/corrupt settings.json yields an empty map. The driver attaches these to each imported character
// by matching the card filename against the map key (ST's `tag_map[character.avatar]`).
async function collectTags(fs: ImportFsPort, profileDir: string): Promise<ReadonlyMap<string, readonly string[]>> {
  const settingsPath = fs.join(profileDir, "settings.json");
  // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
  // faults; only a missing/corrupt settings.json falls through, documented above as "yields an empty map."
  try {
    const bytes = await fs.readFile(settingsPath);
    return parseStTags(JSON.parse(new TextDecoder().decode(bytes))).byEntityKey;
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return new Map();
  }
}

// Best-effort: a missing/corrupt settings.json yields []; a missing avatar yields an avatar-less persona.
async function collectPersonas(fs: ImportFsPort, profileDir: string): Promise<CollectedPersona[]> {
  let settingsRaw: unknown;
  const settingsPath = fs.join(profileDir, "settings.json");
  // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
  // faults; documented above — "a missing/corrupt settings.json yields []."
  try {
    const bytes = await fs.readFile(settingsPath);
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    rethrowInfraFailure(error, settingsPath, "readFile");
    return [];
  }
  const { personas } = parseStPersonas(settingsRaw);
  const avatarsDir = fs.join(profileDir, "User Avatars");
  const out: CollectedPersona[] = [];
  for (const parsed of personas) {
    let avatarBytes: Uint8Array | undefined;
    const avatarPath = fs.join(avatarsDir, parsed.avatarFile);
    // @orb-waive caught-failure-ownership(error): `rethrowInfraFailure` escalates real infra
    // faults; documented above — "a missing avatar yields an avatar-less persona" (the `out.push` below
    // branches on `avatarBytes !== undefined`).
    try {
      avatarBytes = await fs.readFile(avatarPath);
    } catch (error) {
      rethrowInfraFailure(error, avatarPath, "readFile");
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
    truncatedDirs: [],
  };

  await collectCards(fs, profileDir, state);
  await collectWorlds(fs, profileDir, state);
  await collectPresetDir(fs, profileDir, state);
  await collectSettingsPreset(fs, profileDir, state);
  await collectThemes(fs, profileDir, state);
  await collectBackgrounds(fs, profileDir, state);
  await collectGroups(fs, profileDir, state, wallClockZone);
  await collectUnhandled(fs, profileDir, state);

  const chatsDir = fs.join(profileDir, "chats");
  for (const dirEnt of await listDir(fs, chatsDir, state)) {
    if (dirEnt.kind === "directory") {
      await collectChatsForDir({ fs, chatsDir, dirName: dirEnt.name, state, wallClockZone });
    }
  }

  const fuzzyPairedDirs = fuzzyPair(state);
  const personas = await collectPersonas(fs, profileDir);
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
      // The orphan wave's input: the transcripts WITH their evidence (dir name + parsed headers) — before
      // 2026-08-15 these chats were counted, named in the report, and then thrown away. The map key IS the
      // collect-time handle (the same castId seam `collectChatsForDir` minted it through).
      orphanBundles.push({ dirName: g.dirName ?? handle, handle: castId<CharacterHandle>(handle), chats: g.chats });
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
    skippedChats: state.skippedChats,
    skippedCharacters: state.skippedCharacters,
    collidedCards: state.collidedCards,
    unhandled: state.unhandled,
    unhandledSettings: state.unhandledSettings,
    truncatedDirs: state.truncatedDirs,
    fuzzyPairedDirs,
  };
}
