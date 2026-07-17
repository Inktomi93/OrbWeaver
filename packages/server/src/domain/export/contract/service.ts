// The typed API surface: ExportContext (the DI bundle) and ExportService (the verb interface). Two verbs —
// `exportCharacter` (the character-card OUT half of the shared serde core) and `exportChat` (the chat
// transcript OUT: ST JSONL interchange / TXT). Both return `null` for a not-found/foreign entity (no error
// class — the HTTP layer maps null → 404). Export reads `@orb/db` schema directly (no `persistence/`
// indirection); jpg/webp→png transcode is the injected `infra/image` op, so export never imports `sharp`.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ImageTransformOptions } from "#infra/image";
import type { Cas } from "#infra/storage";
import type { ParsedAgentAuthor } from "#kit/serde/chat";
import type { ExportCharacterParams, ExportChatParams } from "./params";
import type { ExportedCard, ExportedText } from "./results";

/** The DI bundle every export verb closes over, wired at the composition root. */
export interface ExportContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  /** Resolve an agent-authored assistant row's provenance (PD-17). Export may NOT read `users`/
   *  `agent_principals` directly (no-direct-users-read) nor consume chat's `resolveAgentSpeaker`; the compose
   *  root walks the FK chain (agent → owner → source resolver) and returns the leak-safe `{name, sourceKind}`
   *  — the soul prompt is dropped there, never reaching export. `null` ⇒ not an agent / nothing to voice
   *  (the row degrades to the character-name fallback, the pre-PD-17 behaviour). */
  readonly resolveAgentAuthor: (agentUserId: UserId) => Promise<ParsedAgentAuthor | null>;
}

// The chat transcript format union's declaration home is params.ts (keeps contract/ acyclic); the
// canonical import surface stays here + the front door.
export type { ExportChatFormat } from "./params";

export interface ExportService {
  /** Read the owner's live character card and emit a V3 character-card PNG: the card JSON embedded as
   *  `chara`(V2)+`ccv3`(V3) tEXt chunks in the avatar, or a 256×256 placeholder when there is no avatar.
   *  Returns `null` when the character doesn't exist or isn't the caller's. */
  readonly exportCharacter: (params: ExportCharacterParams) => Promise<ExportedCard | null>;
  /** Read the chat + messages + variants + persona/character names and emit the ST-compatible JSONL
   *  interchange (default) or a human-readable TXT transcript. Host-gated: a non-host caller or missing
   *  chat returns `null`. */
  readonly exportChat: (params: ExportChatParams) => Promise<ExportedText | null>;
}
