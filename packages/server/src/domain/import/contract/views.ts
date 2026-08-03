// domain/import/contract/views — import-local parser/loader return contracts for the ST-profile waves.
// Pure-type file: the ST interchange is validated structurally inside the parsers (null-on-unparseable).
// Card-path types stay in contract/params.ts + contract/results.ts.

import type { AssetId, CharacterId } from "@orb/kit/ids";
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
  readonly handle: string;
  readonly cardBytes: Uint8Array;
  readonly filename: string;
  readonly chats: CollectedChat[];
}

export interface CollectedPersona {
  readonly parsed: ParsedPersona;
  readonly avatarBytes?: Uint8Array;
}

/** Every non-happy-path is recorded (never silent) so the operator can audit a wrong pairing/dropped card. */
export interface CollectResult {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  readonly orphanChatDirs: string[];
  readonly unreadableCards: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  /** Their chats attach to the first card holding the base handle. */
  readonly collidedCards: { readonly file: string; readonly handle: string }[];
  /** Matched by the second-chance fuzzy pairing (trailing-digit / main_<Name>_spec_vN). */
  readonly fuzzyPairedDirs: { readonly chatDir: string; readonly handle: string }[];
}

export interface ImportPersonaInput {
  readonly parsed: ParsedPersona;
  readonly avatarAssetId?: AssetId | null;
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
