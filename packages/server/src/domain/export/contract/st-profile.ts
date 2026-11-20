// The SillyTavern profile export's shapes: what the plan reads and the entries it yields.

import type { StExportFile } from "@orb/contracts/import";
import type { PortableExportNotes, PortableFile, PortableKind } from "@orb/contracts/portability";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { StAttachedFile } from "#primitives/serde/databank";
import type { ExportedText, HostChatRef, StCardRef } from "./results.ts";

/** The kinds the plan reads as backup streams: each file is metadata or a small text, read one at a time. Cards,
 *  chats, personas and blobs have reads of their own, so no stream of a whole kind's bodies is ever opened. */
export type StStreamedKind = Exclude<PortableKind, "character" | "chat" | "persona" | "assets">;

/** One persona's backup file with the content hash of its avatar (null for none), paired by persona id. */
export interface StPersonaFile {
  readonly file: PortableFile;
  readonly avatarHash: string | null;
}

/** What the plan reads, all under one owner. A body read (`card`, `transcript`, `blob`) happens only when the zip
 *  writes that entry, and answers null when its row is gone by then. */
export interface StProfileSource {
  readonly files: (kind: StStreamedKind, note: PortableExportNotes) => AsyncIterable<PortableFile>;
  readonly cards: () => Promise<readonly StCardRef[]>;
  readonly card: (characterId: CharacterId, note: PortableExportNotes) => Promise<Uint8Array | null>;
  readonly rooms: () => Promise<readonly HostChatRef[]>;
  readonly transcript: (chatId: ChatId, attachments: readonly StAttachedFile[]) => Promise<ExportedText | null>;
  /** The import hash of each owned document attached to each hosted chat. */
  readonly chatDocumentHashes: () => Promise<ReadonlyMap<ChatId, readonly string[]>>;
  readonly personas: (note: PortableExportNotes) => AsyncIterable<StPersonaFile>;
  /** The mime of each listed blob the owner holds; one it does not hold is absent. */
  readonly blobMimes: (hashes: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  readonly blob: (hash: string) => Promise<Uint8Array | null>;
}

/** What the report names when an entry's body is gone at write time; null when another entry's line covers it. */
export interface StEntrySource {
  readonly kind: PortableKind;
  readonly item: string;
}

/** One file of the profile tree, its body read only when the zip writes it. */
export interface StProfileEntry extends StExportFile {
  readonly source: StEntrySource | null;
  readonly bytes: () => Promise<Uint8Array | null>;
}

/** One file of the zip: a profile entry's body, or the report. */
export interface StProfileZipFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}
