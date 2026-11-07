// Native and SillyTavern import vocabulary and shared folder-layout admission.
// The planner and HTTP boundary classify the same paths before selecting their import behavior.

import { trimEndWhile } from "@orb/kit/strings";
import { z } from "zod";
import { PORTABLE_DIRECTORIES } from "../portability/index.ts";
import { encodePersonaCollisionChoices, PERSONA_COLLISION_CHOICES, PERSONA_COLLISION_FIELD } from "./persona-collision.ts";

export type { CardImportResult, FailedCard, ImportedCard } from "./card-result.ts";
export { cardImportResultSchema } from "./card-result.ts";
export type { ChatImportResult } from "./chat-result.ts";
export { chatImportResultSchema } from "./chat-result.ts";
export type { CardLorebookRestoreResult } from "./lorebook-restore.ts";
export { cardLorebookRestoreResultSchema } from "./lorebook-restore.ts";
export type { PersonaCollision, PersonaCollisionChoice, PersonaCollisionChoices, PersonaDifference } from "./persona-collision.ts";
export {
  DEFAULT_PERSONA_COLLISION_CHOICE,
  decodePersonaCollisionChoices,
  encodePersonaCollisionChoices,
  PERSONA_COLLISION_FIELD,
  personaCollisionChoiceFor,
  personaCollisionChoicesSchema,
  personaCollisionReviewSchema,
} from "./persona-collision.ts";
export type { ImportPreview, ImportPreviewItem, ImportPreviewKind, ImportPreviewList, ImportPreviewSkip } from "./preview.ts";
export { IMPORT_PREVIEW_KINDS, IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_TEXT_MAX, importPreviewSchema, mergeImportPreviews } from "./preview.ts";
export type { ImportStarted } from "./started.ts";
export { importStartedSchema } from "./started.ts";

/** The ST per-profile credentials file. Never uploaded, never staged, never imported. */
export const ST_SECRETS_FILE = "secrets.json";

/** The ST per-profile settings file — the one ST marker a profile always carries. */
export const ST_SETTINGS_FILE = "settings.json";

// The top-level profile entries the importer reads. Every other entry is reported, not imported.
const ST_PROFILE_HANDLED_ENTRIES = [
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

const TEXT_COMPLETION_TEMPLATES = "text-completion templates, which Orbweaver does not use";
const TEXT_COMPLETION_PRESETS = "text-completion presets, which Orbweaver does not use";
const TEXT_COMPLETION_LIVE = "the live text-completion preset, which Orbweaver does not use";

/** Why each unhandled top-level profile plane has no importer. A directory name ends in `/`. A plane absent
 *  here renders bare in the report, so a new ST plane shows up instead of vanishing. */
export const ST_PROFILE_UNHANDLED_REASONS: ReadonlyMap<string, string> = new Map([
  ["movingUI/", "saved window layout"],
  ["context/", TEXT_COMPLETION_TEMPLATES],
  ["instruct/", TEXT_COMPLETION_TEMPLATES],
  ["sysprompt/", TEXT_COMPLETION_TEMPLATES],
  ["reasoning/", "the saved reasoning-format templates (the one in use is already carried by your preset)"],
  ["TextGen Settings/", TEXT_COMPLETION_PRESETS],
  ["NovelAI Settings/", TEXT_COMPLETION_PRESETS],
  ["KoboldAI Settings/", TEXT_COMPLETION_PRESETS],
  ["QuickReplies/", "quick-reply buttons, which rely on SillyTavern scripts"],
  ["assets/", "extension assets such as portraits and audio"],
  ["vectors/", "SillyTavern's search index, which Orbweaver rebuilds itself"],
  ["extensions/", "installed extensions, which are code and not your data"],
  ["backups/", "SillyTavern's chat backups; your live chats import"],
  ["thumbnails/", "cached avatar thumbnails, which Orbweaver makes itself"],
  ["_cache/", "SillyTavern's internal cache"],
  ["user/", "SillyTavern's image-generation workflows"],
  [ST_SECRETS_FILE, "your API keys, which never leave this browser; add them again in Orbweaver"],
  ["stats.json", "usage statistics, which Orbweaver counts itself"],
  ["content.log", "SillyTavern's log file"],
  ["image-metadata.json", "thumbnail details for images, which Orbweaver works out itself"],
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

/** The ST credentials file by its last path segment, in any case: a Windows or macOS profile may carry any
 *  spelling of the name. Every door drops it before staging. */
export function isStSecretsFile(relPath: string): boolean {
  return relPath.split("/").at(-1)?.toLowerCase() === ST_SECRETS_FILE;
}

const DIGITS = "0123456789";
const SPEC_WRAPPER = /^main-(.+)-spec-v\d+$/u;

/** The card slugs a chat directory's slug may belong to when no card carries it exactly: the slug minus
 *  an ST folder-name decoration (a trailing number, the `main-<name>-spec-v2` wrapper), in the order the
 *  pairing tries them. The browser planner and the server collector pair by this ONE rule. */
export function chatDirCardCandidates(slug: string): string[] {
  const candidates = [trimEndWhile(trimEndWhile(slug, DIGITS), "-"), SPEC_WRAPPER.exec(slug)?.[1]];
  return candidates.filter((c): c is string => c !== undefined && c.length > 0 && c !== slug);
}

export type { ImportDirectory, ImportFsPort } from "./filesystem.ts";

/** The sniff outcome: the importer to route to + the staging-path prefix that normalizes the tree, or a
 *  typed reject carrying the top-level names found (so the caller can tell the user what it saw). The importer consumes the classification before any staging write. */
export type TreeLayout =
  | { readonly kind: "st"; readonly stagePrefix: string }
  | { readonly kind: "orb"; readonly stagePrefix: string }
  | { readonly kind: "reject"; readonly found: readonly string[] };

interface TreeChild {
  readonly files: Set<string>;
  readonly dirs: Set<string>;
}

/** The top-level shape derived from a set of relative paths, plus a one-level-down child index used only to
 *  recognize a multi-profile ST root (a parent dir whose subdirs are each an ST profile). */
interface TreeShape {
  readonly topFiles: Set<string>;
  readonly topDirs: Set<string>;
  /** For each top-level dir: the names of its immediate child files + child dirs (for multi-profile detection). */
  readonly childrenByDir: Map<string, TreeChild>;
}

/** An ST-only per-profile directory marker. */
const ST_AVATARS_DIR = "User Avatars";
/** Directories shared by both the ST profile layout and the orb bundle vocabulary — never a sole decider. */
const ST_CONTENT_DIRS = new Set(["characters", "chats"]);
const ST_SHARED_DIRS = new Set([...ST_CONTENT_DIRS, "themes", "assets"]);
const NATIVE_DIRECTORIES: ReadonlySet<string> = new Set(Object.values(PORTABLE_DIRECTORIES).map((dir) => dir.slice(0, -1)));
/** Synthetic wrapper a single picked ST profile is re-nested under so the profile LOOP sees one profile subdir. */
const ST_SINGLE_PROFILE_PREFIX = "profile/";

function buildShape(paths: readonly string[]): TreeShape {
  const topFiles = new Set<string>();
  const topDirs = new Set<string>();
  const childrenByDir = new Map<string, TreeChild>();
  for (const path of paths) {
    const segments = path.split("/");
    const [top] = segments;
    if (top === undefined || top.length === 0) {
      continue;
    }
    if (segments.length === 1) {
      topFiles.add(top);
      continue;
    }
    topDirs.add(top);
    const child = childrenByDir.get(top) ?? { files: new Set<string>(), dirs: new Set<string>() };
    const second = segments[1];
    if (second !== undefined && second.length > 0) {
      if (segments.length === 2) {
        child.files.add(second);
      } else {
        child.dirs.add(second);
      }
    }
    childrenByDir.set(top, child);
  }
  return { topFiles, topDirs, childrenByDir };
}

/** Recognize an ST profile without treating its shared themes or unsupported extension assets as native-only data. */
function looksLikeStProfile(child: TreeChild, orbOnlyDirs: ReadonlySet<string>): boolean {
  for (const dir of child.dirs) {
    if (orbOnlyDirs.has(dir)) {
      return false;
    }
  }
  if (child.files.has(ST_SETTINGS_FILE) || child.dirs.has(ST_AVATARS_DIR)) {
    return true;
  }
  for (const shared of ST_CONTENT_DIRS) {
    if (child.dirs.has(shared)) {
      return true;
    }
  }
  return false;
}

/**
 * Classify wrapper-stripped paths against native registry directories, without trailing slashes.
 * Explicit ST profile markers permit known ST planes but refuse exclusively native data.
 */
export function sniffTreeLayout(paths: readonly string[], nativeDirs: ReadonlySet<string> = NATIVE_DIRECTORIES): TreeLayout {
  const orbOnlyDirs = new Set([...nativeDirs].filter((dir) => !ST_SHARED_DIRS.has(dir)));
  const shape = buildShape(paths);
  const orbAtTop = [...shape.topDirs].some((d) => orbOnlyDirs.has(d));
  const stStrongAtTop = shape.topFiles.has(ST_SETTINGS_FILE) || shape.topDirs.has(ST_AVATARS_DIR);
  const stSharedAtTop = [...ST_CONTENT_DIRS].some((d) => shape.topDirs.has(d));

  // A native-only entity plane beside ST-only profile markers is ambiguous.
  if (orbAtTop && stStrongAtTop) {
    return { kind: "reject", found: sortedTop(shape) };
  }
  if (orbAtTop) {
    return { kind: "orb", stagePrefix: "" };
  }
  // A single picked ST profile: its own contents sit at the tree top → re-nest under a synthetic wrapper.
  if (stStrongAtTop || stSharedAtTop) {
    return { kind: "st", stagePrefix: ST_SINGLE_PROFILE_PREFIX };
  }
  // A multi-profile ST root (the picked `data/`-style dir): subdirs are each an ST profile, none orb-shaped.
  if (shape.topDirs.size > 0) {
    const anyProfile = [...shape.topDirs].some((d) => {
      const child = shape.childrenByDir.get(d);
      return child !== undefined && looksLikeStProfile(child, orbOnlyDirs);
    });
    const anyOrb = [...shape.childrenByDir.values()].some((child) => [...child.dirs].some((dir) => orbOnlyDirs.has(dir)));
    if (anyProfile && !anyOrb) {
      return { kind: "st", stagePrefix: "" };
    }
  }
  return { kind: "reject", found: sortedTop(shape) };
}

// The layouts a client may declare for one upload batch of a folder it split across several uploads.
const TREE_LAYOUT_DECLARATIONS = ["orb"] as const;
export const treeLayoutDeclarationSchema = z.enum(TREE_LAYOUT_DECLARATIONS);
export type TreeLayoutDeclaration = z.infer<typeof treeLayoutDeclarationSchema>;

/** The repeated multipart field carrying each folder file, its relative path as the part filename. */
export const TREE_FILE_FIELD = "file";

/** The multipart field naming a batch's declared layout. Without it the server sniffs the batch alone. */
export const TREE_LAYOUT_FIELD = "layout";

/** The tree upload's dry-run field: a SillyTavern upload carrying it reports what it holds and writes nothing. */
export const TREE_DRY_RUN_FIELD = "dryRun";
export const TREE_DRY_RUN_VALUE = "true";

// RFC 2046 caps a multipart boundary at 70 characters. A delimiter line is `--`, the boundary and CRLF; the
// close delimiter adds a trailing `--`.
const MULTIPART_BOUNDARY_MAX_CHARS = 70;
const DASHES = "--";
const CRLF_BYTES = "\r\n".length;
const MULTIPART_DELIMITER_BYTES = DASHES.length + MULTIPART_BOUNDARY_MAX_CHARS + CRLF_BYTES;
const MULTIPART_CLOSE_BYTES = MULTIPART_DELIMITER_BYTES + DASHES.length;
// Form encoding percent-escapes `"`, CR and LF in a name or filename and turns a lone line break in a value
// into CRLF; no UTF-16 unit takes more than three UTF-8 bytes. No unit therefore encodes to more than three.
const ENCODED_BYTES_PER_UNIT = 3;
const DISPOSITION_HEADER = 'Content-Disposition: form-data; name=""';
const FILENAME_PARAMETER = '; filename=""';
const CONTENT_TYPE_HEADER = "Content-Type: ";
// The part type a browser sends for a file it has no type for.
const UNTYPED_FILE_PART_TYPE = "application/octet-stream";

function encodedBytes(text: string): number {
  return ENCODED_BYTES_PER_UNIT * text.length;
}

// The delimiter line, the headers, the blank line and the CRLF after the value.
function partFramingBytes(name: string, file: TreeUploadPart | null): number {
  const disposition = DISPOSITION_HEADER.length + encodedBytes(name) + (file === null ? 0 : FILENAME_PARAMETER.length + encodedBytes(file.path)) + CRLF_BYTES;
  const type = file === null ? 0 : CONTENT_TYPE_HEADER.length + encodedBytes(file.type === "" ? UNTYPED_FILE_PART_TYPE : file.type) + CRLF_BYTES;
  return MULTIPART_DELIMITER_BYTES + disposition + type + CRLF_BYTES + CRLF_BYTES;
}

/** One file a tree upload sends: its relative path, which is the part filename, and its browser-assigned type. */
export interface TreeUploadPart {
  readonly path: string;
  readonly type: string;
}

/**
 * An upper bound on the bytes one file part adds to a tree upload's multipart body beside the file's own bytes.
 * The served tree cap limits the whole body, so a planner charges every file it packs this much on top of its size.
 */
export function treeUploadPartFramingBytes(part: TreeUploadPart): number {
  return partFramingBytes(TREE_FILE_FIELD, part);
}

/**
 * An upper bound on the bytes every tree upload's multipart body carries whatever files it holds: a layout
 * declaration, the dry-run field, any choice for each persona collision, and the close delimiter. A planner reserves this once per upload.
 */
export function treeUploadFixedFramingBytes(personaCollisionKeys: readonly string[]): number {
  const layout = Math.max(...TREE_LAYOUT_DECLARATIONS.map((value) => partFramingBytes(TREE_LAYOUT_FIELD, null) + encodedBytes(value)));
  const longestChoice = PERSONA_COLLISION_CHOICES.reduce((longest, value) => (value.length > longest.length ? value : longest));
  const collisions = personaCollisionKeys.reduce(
    (sum, key) => sum + partFramingBytes(PERSONA_COLLISION_FIELD, null) + encodedBytes(encodePersonaCollisionChoices({ [key]: longestChoice })[0] ?? ""),
    0,
  );
  const dryRun = partFramingBytes(TREE_DRY_RUN_FIELD, null) + encodedBytes(TREE_DRY_RUN_VALUE);
  return layout + dryRun + collisions + MULTIPART_CLOSE_BYTES;
}

/**
 * Admit one wrapper-stripped upload batch. An undeclared batch is sniffed alone. A declared native batch is
 * one slice of a larger backup, so it need not carry a native-only directory, but it is admitted only when
 * every entry sits under a canonical native directory. That excludes both SillyTavern-only markers
 * (`settings.json` is a top-level file and `User Avatars` is no native directory). Anything else is refused,
 * never routed to the SillyTavern importer.
 */
export function admitTreeBatch(
  paths: readonly string[],
  declared: TreeLayoutDeclaration | null,
  nativeDirs: ReadonlySet<string> = NATIVE_DIRECTORIES,
): TreeLayout {
  switch (declared) {
    case null:
      return sniffTreeLayout(paths, nativeDirs);
    case "orb": {
      const shape = buildShape(paths);
      const native = shape.topFiles.size === 0 && shape.topDirs.size > 0 && [...shape.topDirs].every((dir) => nativeDirs.has(dir));
      return native ? { kind: "orb", stagePrefix: "" } : { kind: "reject", found: sortedTop(shape) };
    }
  }
}

function sortedTop(shape: TreeShape): string[] {
  return [...shape.topDirs, ...shape.topFiles].sort((a, b) => a.localeCompare(b));
}
