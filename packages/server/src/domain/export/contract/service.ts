// The typed API surface: ExportContext (the DI bundle) and ExportService (the verb interface). Two verbs —
// `exportCharacter` (the character-card OUT half of the shared serde core) and `exportChat` (the chat
// transcript OUT: ST JSONL interchange / TXT). Both return `null` for a not-found/foreign entity (no error
// class — the HTTP layer maps null → 404). Export reads `@orb/db` schema directly (no `persistence/`
// indirection); jpg/webp→png transcode is the injected `infra/image` op, so export never imports `sharp`.

import type { Db } from "@orb/db";
import type { ExportCardScripts } from "#domain/regex";
import type { ImageTransformOptions } from "#infra/image";
import type { Cas } from "#infra/storage";
import type { ExportCharacterParams, ExportChatParams, ListHostChatsParams } from "./params.ts";
import type { ExportedCard, ExportedText, HostChatRef } from "./results.ts";

/** The DI bundle every export verb closes over, wired at the composition root. */
export interface ExportContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  /** D121-E: the card RE-EMBED — the character's attached regex library rows projected back onto the ST card
   *  wire + the reference list a same-install re-import re-links by. Injected (cross-domain), because a
   *  card's scripts are no longer a column export could read off the flat row. */
  readonly exportCardScripts: ExportCardScripts;
}

// The chat transcript format union's declaration home is params.ts (keeps contract/ acyclic); the
// canonical import surface stays here + the front door.
export type { ExportCardFormat, ExportChatFormat } from "./params.ts";

export interface ExportService {
  /** Read the owner's live character card and emit it in the requested container: `png` (default) welds
   *  the card JSON into the avatar as `chara`(V2)+`ccv3`(V3) tEXt chunks (a 256×256 placeholder when there
   *  is no avatar); `json` emits the SAME card object unwrapped. Returns `null` when the character doesn't
   *  exist or isn't the caller's. */
  readonly exportCharacter: (params: ExportCharacterParams) => Promise<ExportedCard | null>;
  /** Read the chat + messages + variants + persona/character names and emit the ST-compatible JSONL
   *  interchange (default) or a human-readable TXT transcript. Host-gated: a non-host caller or missing
   *  chat returns `null`. */
  readonly exportChat: (params: ExportChatParams) => Promise<ExportedText | null>;
  /** Every chat the caller hosts + the handle of its primary seated character — the enumeration the bundle
   *  descriptor streams transcripts over. */
  readonly listHostChats: (params: ListHostChatsParams) => Promise<readonly HostChatRef[]>;
}
