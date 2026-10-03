// The single-transcript import registrar: POST /api/import/chat takes one-or-many bare `.jsonl` chat files
// (the exact bytes GET /api/export/chat hands back, and SillyTavern's own chat files) and lands each into
// the owner's library. A THIN ARM over the portability registry's `chat` descriptor — the same `importFile`
// the bundle core calls, so the single-file door and the bundle door can never drift in parse, dedup, or
// collision semantics (the preset `importFile` precedent).
//
// A bare upload reaches the descriptor under its own filename, with no handle directory: the descriptor
// re-links an ST transcript by the display name its header carries, the name the user sees. A transcript
// naming a character this account doesn't have is a per-file failure with the reason, never a silent orphan.
//
// Belts mirror the sibling ingest routes: auth (401 before the body is read) → CSRF (403 on a cookie
// mutation missing the custom header) → a hono/body-limit total cap (413). Per-file failures are ISOLATED
// into `failed[]` (one bad transcript never fails the batch), matching POST /api/import's card contract.

import type { ImportWindow } from "@orb/contracts/chat";
import type { PortabilityRegistry, PortableEntity } from "@orb/contracts/portability";
import { IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { ChatId, UserId } from "@orb/kit/ids";
import { bodyLimit } from "hono/body-limit";
import type { SettleImportMemory } from "#domain/import";
import { hasCsrfHeader } from "#infra/auth";
import type { registerImportBundle } from "./import.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CHAT_ROUTE = "/api/import/chat";
const UPLOAD_FIELD = "file";
const CHAT_KIND = "chat";
const IMPORT_FAILED = "import failed";

/** The principal-carrying Hono app the sibling `/api/import/*` registrars take — DERIVED from one of them
 *  rather than re-declaring its env (one home for the shape; a re-spell would also re-spell Hono's
 *  framework-fixed `Variables` key). */
type ImportApp = Parameters<typeof registerImportBundle>[0];

export interface ImportChatDeps {
  /** The composed registry — its `chat` descriptor IS the import path (resolved once at registration). */
  readonly registry: PortabilityRegistry;
  /** The server clock the batch's memory scope opens on (the same clock the chat write stamps its claims with). */
  readonly now: () => number;
  readonly settleImportMemory: SettleImportMemory;
}

/** One transcript that landed (or deduped). `created:false` = the chat was already present (no write). */
interface ImportedChat {
  readonly filename: string;
  readonly created: boolean;
}

/** One transcript that could not be imported — the operator-facing reason, isolated rather than thrown. */
interface FailedChat {
  readonly filename: string;
  readonly error: string;
}

/** The `POST /api/import/chat` response body: the REAL per-file outcome (the client summary derives from it). */
export interface ChatImportResult {
  readonly imported: readonly ImportedChat[];
  readonly failed: readonly FailedChat[];
  /** The span in which the batch wrote real conversations (null = none) — the scope handle of the client's
   *  "Build memory for imported chats" offer. */
  readonly memoryScope: ImportWindow | null;
}

/**
 * Route every uploaded transcript through the chat descriptor, one at a time, collecting each file's
 * isolated outcome. SEQUENTIAL by construction — a promise CHAIN rather than an await-in-loop — because two
 * transcripts naming the same character must not race the descriptor's handle lookup and dedup reads.
 */
async function importAll(chat: PortableEntity, ownerId: UserId, files: readonly File[], deps: ImportChatDeps): Promise<ChatImportResult> {
  const from = deps.now();
  const imported: ImportedChat[] = [];
  const failed: FailedChat[] = [];
  const memoryChatIds: ChatId[] = [];
  await files.reduce<Promise<void>>(async (chain, file) => {
    await chain;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const outcome = await chat.importFile(ownerId, { filename: file.name, bytes });
    if (outcome.ok) {
      imported.push({ filename: file.name, created: outcome.created === true });
      memoryChatIds.push(...(outcome.memoryChatIds ?? []));
    } else {
      failed.push({ filename: file.name, error: outcome.error ?? IMPORT_FAILED });
    }
  }, Promise.resolve());
  return { imported, failed, memoryScope: await deps.settleImportMemory({ ownerId, from, memoryChatIds }) };
}

/** Register `POST /api/import/chat` on `app`: auth → CSRF → body cap → per-file delegate to the registry's
 *  `chat` descriptor. Throws at registration if the registry has no chat descriptor (a composition bug). */
export function registerImportChat(app: ImportApp, deps: ImportChatDeps): void {
  const chat: PortableEntity | undefined = deps.registry.find((entity) => entity.kind === CHAT_KIND);
  if (chat === undefined) {
    throw new Error("portability registry has no chat descriptor");
  }

  app.post(
    CHAT_ROUTE,
    // Auth-first + CSRF, ahead of the body-limit belt so an anonymous/cross-site caller is rejected before a
    // body byte is read (the sibling upload routes' belt order). Inline, so the ctx types come off `app`.
    // CSRF keys on the ambient-credential arms `via !== "header"` (cookie + the loopback owner fallback) —
    // this is a CORS-"simple" multipart route with no preflight (#300; see upload.ts's authCsrfGuard WHY-block).
    async (c, next) => {
      const principal = c.get("principal");
      if (principal === null) {
        return c.body(null, UNAUTHORIZED);
      }
      if (principal.via !== "header" && !hasCsrfHeader(c.req.raw.headers)) {
        return c.body(null, FORBIDDEN);
      }
      return await next();
    },
    bodyLimit({ maxSize: IMPORT_MAX_TOTAL_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }),
    async (c) => {
      const principal = c.get("principal");
      if (principal === null) {
        return c.body(null, UNAUTHORIZED);
      }
      const form = await c.req.formData();
      const files = form.getAll(UPLOAD_FIELD).filter((entry): entry is File => entry instanceof File);
      if (files.length === 0) {
        return c.json({ error: `no "${UPLOAD_FIELD}" transcript uploads` }, BAD_REQUEST);
      }
      return c.json(await importAll(chat, principal.userId, files, deps));
    },
  );
}
