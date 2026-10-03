// @orb/contracts/import — the SillyTavern profile-folder vocabulary both ends of the folder import read: the
// browser planner skips what the server would only report, and the server collector and report name the
// same planes with the same reasons, so the two sides can never disagree about what was left behind.

/** The ST per-profile credentials file. Never uploaded, never staged, never imported. */
export const ST_SECRETS_FILE = "secrets.json";

/** The ST per-profile settings file — the one ST marker a profile always carries. */
export const ST_SETTINGS_FILE = "settings.json";

/** The top-level profile entries the importer reads. Every other entry is reported, not imported. */
export const ST_PROFILE_HANDLED_ENTRIES = [
  "characters",
  "chats",
  "worlds",
  "User Avatars",
  ST_SETTINGS_FILE,
  "groups",
  "group chats",
  "OpenAI Settings",
  "themes",
  "backgrounds",
] as const;

export type StProfileHandledEntry = (typeof ST_PROFILE_HANDLED_ENTRIES)[number];

const TEXT_COMPLETION_TEMPLATES = "text-completion templates — text-completion is out of product scope (owner ruling)";
const TEXT_COMPLETION_PRESETS = "text-completion preset files — orb has no text-completion mode (owner ruling)";
const TEXT_COMPLETION_LIVE = "live text-completion preset — orb has no text-completion mode (owner ruling)";

/** Why each unhandled top-level profile plane has no importer. A directory name ends in `/`. A plane absent
 *  here renders bare in the report, so a new ST plane shows up instead of vanishing. */
export const ST_PROFILE_UNHANDLED_REASONS: ReadonlyMap<string, string> = new Map([
  ["movingUI/", "saved UI layout state — no domain home"],
  ["context/", TEXT_COMPLETION_TEMPLATES],
  ["instruct/", TEXT_COMPLETION_TEMPLATES],
  ["sysprompt/", TEXT_COMPLETION_TEMPLATES],
  ["reasoning/", "saved reasoning-format template library — the ACTIVE template already folds onto the live preset; the library is out of product scope"],
  ["TextGen Settings/", TEXT_COMPLETION_PRESETS],
  ["NovelAI Settings/", TEXT_COMPLETION_PRESETS],
  ["KoboldAI Settings/", TEXT_COMPLETION_PRESETS],
  ["QuickReplies/", "STscript quick-reply buttons — orb has no STscript executor (orb automation is CEL-based, D46)"],
  ["assets/", "ST extension assets (portraits, audio) — no supported importer"],
  ["vectors/", "ST's own vector store — orb re-embeds locally after import, so a foreign index never travels"],
  ["extensions/", "third-party extension INSTALLS (code, not state) — out of scope"],
  ["backups/", "ST's own chat backups — the live chats import; a backup copy would duplicate them"],
  ["thumbnails/", "ST's cached avatar thumbnails — orb derives its own"],
  ["_cache/", "ST's internal cache — not canon"],
  [
    "user/",
    "user/files (Data Bank) + user/images (character gallery) ARE walked and counted (see the Data Bank / gallery section); user/workflows is ST's stock ComfyUI workflow pair — orb has no ComfyUI workflow store",
  ],
  [ST_SECRETS_FILE, "API keys — never uploaded and never imported (credentials are entered per-install)"],
  ["stats.json", "usage stats — recomputed locally, not import canon"],
  ["content.log", "ST install log — not canon"],
  ["image-metadata.json", "ST gallery/background thumbnail metadata — orb derives its own media metadata at CAS-store time"],
]);

/** Why each unhandled `settings.json` section has no importer (ST snake_case section names). */
export const ST_SETTINGS_UNHANDLED_REASONS: ReadonlyMap<string, string> = new Map([
  ["textgenerationwebui_settings", TEXT_COMPLETION_LIVE],
  ["nai_settings", TEXT_COMPLETION_LIVE],
  ["kai_settings", TEXT_COMPLETION_LIVE],
  [
    "world_info_settings",
    "global world-info activation knobs have no orb home; the per-character charLore bindings ARE read (see the world name-link section) and per-book WI is imported",
  ],
  ["horde_settings", "Horde backend config — no import canon"],
  [
    "extension_settings",
    "extension state — READ for regex (global scripts import; see the regex section; regex_presets/character_allowed_regex have no orb counterpart) and INVENTORIED for the Data Bank index (attachments/character_attachments); the rest is out of scope",
  ],
  ["background", "which background was SELECTED — selection state; the background IMAGES themselves import"],
  ["proxies", "connection proxy config — no import canon"],
  ["selected_proxy", "selected proxy — no import canon"],
  ["firstRun", "ST first-run flag — install state, not canon"],
  ["accountStorage", "ST per-account browser-storage mirror — session state, not canon"],
  ["currentVersion", "the ST version stamp that wrote this profile — provenance, nothing to import"],
  ["username", "the ST account's own display name — orb identity is per-install (personas ARE imported)"],
  ["active_character", "which character was open when ST last saved — selection state, not canon"],
  ["active_group", "which group was open when ST last saved — selection state (the GROUPS themselves import)"],
  ["user_avatar", "which persona avatar was selected — selection state (the personas + avatars themselves import)"],
  ["amount_gen", "legacy top-level response length — superseded by the per-family preset blobs"],
  ["max_context", "legacy top-level context size — superseded by the per-family preset blobs"],
  ["main_api", "which backend ST was pointed at — orb connections are configured per-install, never imported"],
  ["swipes", "the swipes-enabled UI toggle — a client preference; the swipe DATA itself imports with each chat"],
]);

/** The reason a top-level profile entry is not imported, or null when the importer reads it. `name` is the
 *  bare entry name; `isDirectory` selects the `name/` spelling the reason map uses. */
export function stProfileEntryDisposition(
  name: string,
  isDirectory: boolean,
): { readonly handled: true } | { readonly handled: false; readonly reason: string | null } {
  if ((ST_PROFILE_HANDLED_ENTRIES as readonly string[]).includes(name)) {
    return { handled: true };
  }
  return { handled: false, reason: ST_PROFILE_UNHANDLED_REASONS.get(isDirectory ? `${name}/` : name) ?? null };
}

/** The ST credentials file by its last path segment — the one name every door drops before staging. */
export function isStSecretsFile(relPath: string): boolean {
  return relPath.split("/").at(-1) === ST_SECRETS_FILE;
}

const TRAILING_DIGITS = /\d+$/u;
const TRAILING_HYPHENS = /-+$/u;
const SPEC_WRAPPER = /^main-(.+)-spec-v\d+$/u;

/** The card slugs a chat directory's slug may belong to when no card carries it exactly: the slug minus
 *  an ST folder-name decoration (a trailing number, the `main-<name>-spec-v2` wrapper), in the order the
 *  pairing tries them. The browser planner and the server collector pair by this ONE rule. */
export function chatDirCardCandidates(slug: string): string[] {
  const candidates = [slug.replace(TRAILING_DIGITS, "").replace(TRAILING_HYPHENS, ""), SPEC_WRAPPER.exec(slug)?.[1]];
  return candidates.filter((c): c is string => c !== undefined && c.length > 0 && c !== slug);
}
