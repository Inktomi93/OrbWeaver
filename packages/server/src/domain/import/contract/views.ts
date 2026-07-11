// domain/import/contract/views — the PARSER return contracts (§7.4 — one type home) for the ST-profile
// waves (PD-77): the pure substrate parsers (`substrate/chat.ts` + `substrate/persona.ts`) produce these,
// the chat/persona writers consume them, the loader (`loader/collect.ts`) bundles them, and the front door
// re-exports the set for the driver + tests. Pure-type file (no `z.object`): the ST interchange is
// validated structurally INSIDE the parsers (null-on-unparseable), not by a parallel import wire schema.
//
// SCOPE (PD-77): the chats/personas/loader waves. The card-path types stay in `contract/params.ts` +
// `contract/results.ts` (the built 4c-W3 slice).

import type { AssetId, CharacterId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

// ── chat parser (substrate/chat.ts) ────────────────────────────────────────────────────────────────────

/** RAG/analytics relevance class of an imported chat (the `classify` output). Import EVERYTHING, but the
 *  memory-backfill (PD-78) enqueues over `real_conversation` chats ONLY. `greeting_only` = no user turn;
 *  `all_empty_msgs` = only system/blank lines; `header_only` = no message lines at all. The ONE tuple home
 *  (§7.5 string-union dispatch — declared once, `ChatBucket` derives it). */
export const CHAT_BUCKETS = [
  "header_only",
  "all_empty_msgs",
  "greeting_only",
  "real_conversation",
] as const;
export type ChatBucket = (typeof CHAT_BUCKETS)[number];

/** One swipe in a message's variant pool (0-based `idx` after the empty-slot drop + re-index). The
 *  economics ride off `swipe_info[originIdx].extra`; `metadata` is the lossless full `swipe_info[idx]`
 *  sidecar (→ `message_variants.metadata`). */
export interface ParsedVariant {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly genStarted: number | null;
  readonly genFinished: number | null;
  readonly metadata: Record<string, unknown> | null;
}

/** One parsed chat message. `content` is `mes` (the RENDERED text — authoritative; can diverge from the
 *  active swipe). The economics are the PRIMARY generation's (`extra.*`) — the writer stamps them on the
 *  message's first/selected `message_variants` row (D26 — the slot carries no content/economics).
 *  `variants` is the multi-swipe pool (empty when ≤1 real generation); `activeVariantIdx` is `swipe_id`
 *  remapped onto the drop-filtered pool (null when out of range / no swipes). */
export interface ParsedChatMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly sendDate: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly genStarted: number | null;
  readonly genFinished: number | null;
  readonly ttftMs: number | null;
  readonly metadata: Record<string, unknown> | null;
  readonly activeVariantIdx: number | null;
  readonly variants: ParsedVariant[];
}

/** One parsed ST chat `.jsonl`. `createDate` is the FILENAME date first (survives ST re-save/migration),
 *  then the header `create_date`, then null. `parentRef` is the normalized `chat_metadata.main_chat` (the
 *  real branch edge; falls back to the filename lineage). `bucket` is the memory-backfill gate (PD-78).
 *  `sourceMetadata` is the full `chat_metadata` (lossless → the chat metadata sidecar). */
export interface ParsedChat {
  readonly characterName: string;
  readonly userName: string | null;
  readonly createDate: number | null;
  readonly isBranch: boolean;
  readonly parentRef: string | null;
  readonly notePrompt: string | null;
  readonly bucket: ChatBucket;
  readonly sourceMetadata: Record<string, unknown> | null;
  readonly messages: ParsedChatMessage[];
}

// ── persona parser (substrate/persona.ts) ───────────────────────────────────────────────────────────────

/** One persona parsed from a profile's `settings.json` (`power_user.personas[avatarFile]`). `name` is the
 *  key an imported chat's `user_name` maps against (case-insensitively) to attribute its user messages.
 *  `avatarFile` pairs the persona to its `User Avatars/<file>` bytes (loader). `metadata` is the persona
 *  blob (`descriptionPosition` + optional at-depth `inject`) translated from ST's numeric position/depth/
 *  role — null when the descriptor is absent (→ the persona default `in_prompt`). */
export interface ParsedPersona {
  readonly name: string;
  readonly description: string;
  readonly avatarFile: string;
  readonly isDefault: boolean;
  readonly metadata: Record<string, unknown> | null;
}

/** The full `parseStPersonas` result: the personas + the `default_persona` avatarFile (or null). */
export interface ParsedPersonas {
  readonly personas: ParsedPersona[];
  readonly defaultAvatarFile: string | null;
}

// ── loader fs port (the injected filesystem surface — `node:fs`/`node:path` live at the composition tier) ──

/** A directory entry's kind (mapped from `node:fs` `Dirent` at the composition tier). */
export const FS_DIR_ENTRY_KINDS = ["file", "directory", "other"] as const;
export type FsDirEntryKind = (typeof FS_DIR_ENTRY_KINDS)[number];

/** One directory entry: its base name + kind. */
export interface FsDirEntry {
  readonly name: string;
  readonly kind: FsDirEntryKind;
}

/** The injected filesystem surface `collectBundlesFromDir` needs (the `domain-no-node-fs` gate keeps
 *  `node:fs` out of the domain — the real impl is built at `entry/`). All paths are absolute (via `join`). */
export interface ImportFsPort {
  /** List a directory's entries; MUST resolve to `[]` (never throw) for a missing/unreadable dir — a
   *  profile may carry only `characters/` or only `chats/`. */
  readonly readdir: (dir: string) => Promise<readonly FsDirEntry[]>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  /** Stat a file (only `size` — the per-file byte cap). */
  readonly stat: (path: string) => Promise<{ readonly size: number }>;
  /** Join path segments (the composition tier's `node:path.join`). */
  readonly join: (...parts: string[]) => string;
}

// ── loader (loader/collect.ts) ──────────────────────────────────────────────────────────────────────────

/** One collected chat file: its parse + the provenance/dedup keys (the byte hash is `chats.importHash`). */
export interface CollectedChat {
  readonly parsed: ParsedChat;
  readonly importedFrom: string;
  readonly importHash: string;
}

/** One collected character bundle: the card bytes + its paired chat files. The card is stored + imported by
 *  the entry driver (domain/import can't reach domain/assets — the avatar store is injected), so the raw
 *  `cardBytes` + `filename` ride through to the driver, which drives the built `importCharacter` per card. */
export interface CollectedCard {
  readonly handle: string;
  readonly cardBytes: Uint8Array;
  readonly filename: string;
  readonly chats: CollectedChat[];
}

/** One collected persona: its parse + the `User Avatars/<file>` bytes when present (the driver stores the
 *  avatar asset + sets `avatarAssetId`; domain/import can't reach domain/assets). */
export interface CollectedPersona {
  readonly parsed: ParsedPersona;
  readonly avatarBytes?: Uint8Array;
}

/** The profile-dir collector result (`collectBundlesFromDir`). Every non-happy-path is RECORDED (never
 *  silent) so the operator can audit a wrong pairing / a dropped card. */
export interface CollectResult {
  readonly bundles: CollectedCard[];
  readonly personas: CollectedPersona[];
  /** Chat dirs whose handle matched no card — their chats are dropped (no character to attach to). */
  readonly orphanChatDirs: string[];
  /** PNGs with no parseable card data. */
  readonly unreadableCards: string[];
  /** Chat `.jsonl` files skipped for exceeding the per-file byte cap (path-qualified). */
  readonly skippedChats: string[];
  /** Cards excluded by the `IMPORT_SKIP_CHARACTERS` skip-list (the card AND all its chats dropped). */
  readonly skippedCharacters: string[];
  /** Cards whose slugified handle collided with an earlier card's — imported under a numeric-suffixed
   *  handle (their chats attach to the FIRST card holding the base handle). */
  readonly collidedCards: { readonly file: string; readonly handle: string }[];
  /** Chat dirs matched by the second-chance fuzzy pairing (trailing-digit / `main_<Name>_spec_vN`). */
  readonly fuzzyPairedDirs: { readonly chatDir: string; readonly handle: string }[];
}

// ── persona-attach carry (the avatar asset id the driver sets after storing `avatarBytes`) ──────────────

/** A persona ready to write: the parse + the (optionally) stored avatar asset id. The driver stores
 *  `CollectedPersona.avatarBytes` → `avatarAssetId` before calling `importPersonas`. */
export interface ImportPersonaInput {
  readonly parsed: ParsedPersona;
  readonly avatarAssetId?: AssetId | null;
}

/** Standalone chat import (`importChats`): attach loose JSONL chats to an EXISTING character (chosen
 *  explicitly — ST chat headers don't reliably carry the character name, so there's no safe auto-match). */
export interface ImportChatsInput {
  readonly characterId: CharacterId;
  readonly chats: CollectedChat[];
}
