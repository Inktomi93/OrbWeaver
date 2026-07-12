// domain/export/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • ExportContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                     no-context-returntype; the conventional re-export home is context.ts, mirroring
//                     every other domain). The bundle is ASSEMBLED at the entry composition root and
//                     handed to `createExportService`; export sideways-imports none of its deps
//                     (domain-no-cross-feature — the infra handles arrive type-only here).
//   • ExportService   the verb interface (the front door re-exports the type).
//
// SCOPE: the two verbs — `exportCharacter` (the character-card OUT half of the shared serde core) and
// `exportChat` (PD-42 — the chat transcript OUT: ST JSONL interchange / TXT; the builders live in the ONE
// chat serde core `#kit/serde/chat`, W0a).
//
// `exportCharacter` is OWNER-SCOPED off `principal.userId` (§7.1 — never a `users` read; the
// `no-direct-users-read` chokepoint). It gates through `fetchOwned` on the single-owned `characters` row
// (D23); a non-owner / missing character returns `null` (the entry HTTP layer maps that to 404). There is
// NO error class and NO `errors.ts` (deliberate — verbs return null).
//
// Export is INJECTION-LIGHT (deliberate): the bulk serializer reads `@orb/db` schema
// DIRECTLY (sanctioned — same as import) and composes the lower-tier serde core. Its only runtime deps are
// `db`, `cas`, and the `imageTransform` op.
//
// PD-44 (resolved): `buildCardV3` / `exportBookEntry` (+ the `ExportCardFields` / `ExportWorldEntry` input
// shapes) now live in the shared serde core (`@orb/server/kit/serde/card`) next to the `cardFromJson` IN
// adapter — one card emitter, composed DOWN by `exportCharacter` (never re-implemented here).
//
// SHARP PLACEMENT (PD-74 resolved): the jpg/webp→png transcode is the
// INJECTED `infra/image` `imageTransform` op (D6, exactly as assets consumes it) — export never imports
// the heavy native `sharp` (the infra seal). The extract criterion ("a SECOND domain needs image
// transcode") was already met when this slice was built.

import type { Db } from "@orb/db";
import type { ImageTransformOptions } from "#infra/image";
import type { Cas } from "#infra/storage";
import type { ExportCharacterParams, ExportChatParams } from "./params";
import type { ExportedCard, ExportedText } from "./results";

/**
 * The DI bundle every export verb closes over (wired at `service.ts`). Explicit interface (not
 * `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle. Export reads `@orb/db` schema DIRECTLY (the sanctioned bulk-serializer
 *     pattern) — there is no `persistence/` indirection (each verb is one big entity-specific read).
 *   - `cas` — the per-user content-addressed BYTE store (`infra/storage`, injected DOWN). The avatar blob
 *     is read with a single `cas.read` attempt (the TOCTOU-safe pattern).
 *   - `imageTransform` — the `sharp` adapter op (`infra/image`, D6). Used to transcode a non-PNG avatar
 *     (jpg/webp) → PNG before the card JSON is embedded. The op strips all metadata; the width is omitted
 *     (no resize — the avatar is embedded at its source size). See "SHARP PLACEMENT" above (PD-74).
 */
export interface ExportContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
}

// The chat transcript format union's declaration home is params.ts (keeps contract/ acyclic); the
// canonical import surface stays here + the front door.
export type { ExportChatFormat } from "./params";

export interface ExportService {
  /** Read the owner's live character card (flat `characters` row + attached books + ACCEPTED tags) and
   *  emit a V3 character-card PNG: the card JSON embedded as `chara`(V2)+`ccv3`(V3) tEXt chunks in the
   *  avatar (transcoded to PNG when needed), or a 256×256 placeholder when there is no avatar. Returns
   *  `{ bytes, filename }`, or `null` when the character doesn't exist OR isn't the caller's (the two
   *  collapse — no foreign-existence leak; the HTTP layer maps null → 404). */
  readonly exportCharacter: (params: ExportCharacterParams) => Promise<ExportedCard | null>;
  /** Read the chat + messages + variants + the persona/character names and emit the ST-compatible JSONL
   *  interchange (default) or a human-readable TXT transcript (PD-42). HOST-gated (D29 — chats are
   *  membership-scoped, D18; export resolves the host from the loaded roster itself, the sanctioned
   *  bulk-serializer read): a non-host caller / missing chat returns `null` (the two collapse — no
   *  foreign-existence leak; the HTTP layer maps null → 404). */
  readonly exportChat: (params: ExportChatParams) => Promise<ExportedText | null>;
}
