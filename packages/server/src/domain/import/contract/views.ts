// domain/import/contract/views — import-local parser/loader return contracts for the ST-profile waves.
// Pure-type file: the ST interchange is validated structurally inside the parsers (null-on-unparseable).
// Card-path types stay in contract/params.ts + contract/results.ts.

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { AssetId, CharacterHandle, CharacterId } from "@orb/kit/ids";
import type { ParsedChat } from "#kit/serde/chat";

/** name is the key an imported chat's user_name maps against (case-insensitively) to attribute messages. */
export interface ParsedPersona {
  readonly name: string;
  readonly description: string;
  readonly avatarFile: string;
  readonly isDefault: boolean;
  readonly metadata: Record<string, unknown> | null;
}

export interface ParsedPersonas {
  readonly personas: ParsedPersona[];
  readonly defaultAvatarFile: string | null;
}

const FS_DIR_ENTRY_KINDS = ["file", "directory", "other"] as const;
type FsDirEntryKind = (typeof FS_DIR_ENTRY_KINDS)[number];

interface FsDirEntry {
  readonly name: string;
  readonly kind: FsDirEntryKind;
}

/** Injected filesystem surface (domain-no-node-fs keeps node:fs out of the domain; real impl at
 *  entry/import/run-profile-dir-import.ts — `createNodeFsImportPort`). */
export interface ImportFsPort {
  /** Must resolve to [] (never throw) for a missing/unreadable dir — a profile may carry only one subdir. */
  readonly readdir: (dir: string) => Promise<readonly FsDirEntry[]>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly stat: (path: string) => Promise<{ readonly size: number }>;
  readonly join: (...parts: string[]) => string;
}

export interface CollectedChat {
  readonly parsed: ParsedChat;
  readonly importedFrom: string;
  readonly importHash: string;
}

/** domain/import can't reach domain/assets — cardBytes/filename ride through to the driver that stores them. */
export interface CollectedCard {
  readonly handle: CharacterHandle;
  readonly cardBytes: Uint8Array;
  readonly filename: string;
  readonly chats: CollectedChat[];
}

export interface CollectedPersona {
  readonly parsed: ParsedPersona;
  readonly avatarBytes?: Uint8Array;
}

/** One ST-native `worlds/*.json` standalone lorebook, already parsed to the canonical shape (`book.name` is
 *  the filename stem). Imported UNATTACHED as an owner library book — a card's OWN embedded book is a separate
 *  path (`CollectedCard` → the primary attach). */
export interface CollectedWorld {
  readonly book: BulkImportLorebookInput;
}

/** Every non-happy-path is recorded (never silent) so the operator can audit a wrong pairing/dropped card. */
export interface CollectResult {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  /** ST-native standalone lorebooks from `<profileDir>/worlds/*.json` (parsed; unparseable ones in `unreadableWorlds`). */
  readonly worlds: CollectedWorld[];
  readonly orphanChatDirs: string[];
  readonly unreadableCards: string[];
  /** A `worlds/*.json` that did not parse as an ST world-info file (recorded, never silent). */
  readonly unreadableWorlds: string[];
  /** Top-level profile entries the importer does not process (assets/backgrounds/presets/themes/…). */
  readonly unhandled: string[];
  /** settings.json top-level sections the importer does not process (only `power_user.personas` is read). */
  readonly unhandledSettings: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  /** Their chats attach to the first card holding the base handle. */
  readonly collidedCards: { readonly file: string; readonly handle: CharacterHandle }[];
  /** Matched by the second-chance fuzzy pairing (trailing-digit / main_<Name>_spec_vN). */
  readonly fuzzyPairedDirs: { readonly chatDir: string; readonly handle: CharacterHandle }[];
}

export interface ImportPersonaInput {
  readonly parsed: ParsedPersona;
  readonly avatarAssetId?: AssetId | null;
}

/** One card the bulk import SKIPPED (per-card isolation) — the source file + the concise refusal reason. */
export interface ImportSkippedCard {
  readonly file: string;
  readonly reason: string;
}

/** The whole-folder import's accounting of what landed and what did NOT — the source of the written report.
 *  Every "not imported" plane is here so a self-host owner can see exactly what a whole-profile import left
 *  behind (skipped cards, unreadable/oversized files, and the ST planes the importer does not process). */
export interface ImportReport {
  readonly scanned: number;
  readonly changed: number;
  /** Cards skipped by per-card isolation (validation defect repair could not fix), with the reason each. */
  readonly skippedCards: readonly ImportSkippedCard[];
  readonly unreadableCards: readonly string[];
  readonly unreadableWorlds: readonly string[];
  readonly skippedChats: readonly string[];
  readonly orphanChatDirs: readonly string[];
  readonly skippedCharacters: readonly string[];
  /** Top-level ST profile entries the importer does not process (assets/backgrounds/presets/themes/…). */
  readonly unhandled: readonly string[];
  /** settings.json sections the importer does not process (only personas are read). */
  readonly unhandledSettings: readonly string[];
}

/** ONE bundle-shaped chat file: `filename` is `<character-handle>/<leaf>.jsonl` (the directory IS the
 *  re-link key — chat ids are not preserved across a box). */
export interface ImportChatFileInput {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** ST chat headers don't reliably carry the character name, so there's no safe auto-match. */
export interface ImportChatsInput {
  readonly characterId: CharacterId;
  readonly chats: CollectedChat[];
}
