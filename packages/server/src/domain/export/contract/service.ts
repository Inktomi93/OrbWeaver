// domain/export/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • ExportContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                     no-context-returntype; the conventional re-export home is context.ts, mirroring
//                     every other domain). The bundle is ASSEMBLED at the entry composition root and
//                     handed to `createExportService`; export sideways-imports none of its deps
//                     (domain-no-cross-feature — the infra handles arrive type-only here).
//   • ExportService   the verb interface (the front door re-exports the type).
//
// SCOPE (4c W3 — the character-card OUT half of the shared serde core): `exportCharacter` only. The chat
// transcript verb (`exportChat` + `ExportChatFormat` + the JSONL/TXT builders + `ExportedText`) needs the
// chat domain (P5) — see FLAG[PD-42] below; it is NOT in this slice.
//
// `exportCharacter` is OWNER-SCOPED off `principal.userId` (§7.1 — never a `users` read; the
// `no-direct-users-read` chokepoint). It gates through `fetchOwned` on the single-owned `characters` row
// (D23); a non-owner / missing character returns `null` (the entry HTTP layer maps that to 404). There is
// NO error class and NO `errors.ts` (export.md §8-slot — verbs return null).
//
// Export is INJECTION-LIGHT (export.md §"the injection model"): the bulk serializer reads `@orb/db` schema
// DIRECTLY (sanctioned — same as import) and composes the lower-tier serde core. Its only runtime deps are
// `db`, `cas`, and the `imageTransform` op.
//
// FLAG[PD-44]: `buildCardV3` / `exportBookEntry` are TEMPORARILY rolled local in
// `substrate/card-serde.ts` because the shared serde home (`@orb/server/kit/serde/card` +
// `.../world-entry`) is still an empty `.gitkeep` (the sibling import agent owns its creation). When that
// lands, the local serde + its input types (`ExportCardFields` / `ExportWorldEntry`) MUST consolidate onto
// `@orb/server/kit/serde` (export.md Movement table) — there must be exactly one card emitter.
//
// FLAG[image-inject]: export.md's literal text says `sharp` stays INLINE in `export-character.ts` for the
// initial port, with a DEFERRED criterion to extract "iff a SECOND domain needs image transcode." That
// criterion is ALREADY met — `infra/image` (the sealed sharp adapter, D6) exists and `domain/assets`
// consumes it — so this slice follows the doc's own resolution: it injects `imageTransform` (exactly as
// assets does) rather than re-importing the heavy native `sharp` into a domain verb (which would also
// breach the infra seal). Flagged because it deviates from the doc's literal "inline" wording.

import type { Db } from "@orb/db";
import type { ImageTransformOptions } from "#infra/image";
import type { Cas } from "#infra/storage";
import type { ExportCharacterParams } from "./params";
import type { ExportedCard } from "./results";

/**
 * The DI bundle every export verb closes over (wired at `service.ts`). Explicit interface (not
 * `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle. Export reads `@orb/db` schema DIRECTLY (the sanctioned bulk-serializer
 *     pattern, export.md Movement) — there is no `persistence/` indirection (each verb is one big
 *     entity-specific read).
 *   - `cas` — the per-user content-addressed BYTE store (`infra/storage`, injected DOWN). The avatar blob
 *     is read with a single `cas.read` attempt (the TOCTOU-safe pattern — export.md Esoteric).
 *   - `imageTransform` — the `sharp` adapter op (`infra/image`, D6). Used to transcode a non-PNG avatar
 *     (jpg/webp) → PNG before the card JSON is embedded. The op strips all metadata; the width is omitted
 *     (no resize — the avatar is embedded at its source size). See FLAG[image-inject] above.
 */
export interface ExportContext {
  readonly db: Db;
  readonly cas: Cas;
  readonly imageTransform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
}

export interface ExportService {
  /** Read the owner's live character card (flat `characters` row + attached books + ACCEPTED tags) and
   *  emit a V3 character-card PNG: the card JSON embedded as `chara`(V2)+`ccv3`(V3) tEXt chunks in the
   *  avatar (transcoded to PNG when needed), or a 256×256 placeholder when there is no avatar. Returns
   *  `{ bytes, filename }`, or `null` when the character doesn't exist OR isn't the caller's (the two
   *  collapse — no foreign-existence leak; the HTTP layer maps null → 404). */
  readonly exportCharacter: (params: ExportCharacterParams) => Promise<ExportedCard | null>;
}

// FLAG[PD-42]: `exportChat` (chat transcript → ST JSONL / TXT), the `ExportChatFormat = "jsonl" | "txt"`
// canonical union, the `ExportedText { text; filename }` result, and the `ExportChatMeta`/`ExportMessage`/
// `ExportVariant` builder-input shapes (export.md §"exportChat" + §8-slot `contract/params.ts` +
// `substrate/chat-jsonl.ts`) all require the chat domain (messages / variants / participant active-persona
// resolution), which is built WHOLE in P5 (D16). Gated `requireHost` (D29). NOT built in this W3 slice.
