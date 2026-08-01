// The single-transcript import registrar: POST /api/import/chat takes one-or-many bare `.jsonl` chat files
// (the exact bytes GET /api/export/chat hands back, and SillyTavern's own chat files) and lands each into
// the owner's library. A THIN ARM over the portability registry's `chat` descriptor — the same `importFile`
// the bundle core calls, so the single-file door and the bundle door can never drift in parse, dedup, or
// collision semantics (the preset `importFile` precedent).
//
// The descriptor routes a chat by its bundle path `<character-handle>/<leaf>.jsonl`; a bare upload has no
// directory, so this route derives the handle from the transcript's OWN header (`character_name` →
// `slugifyHandle`, the same derivation card import uses to mint a handle) and synthesizes that path. A
// transcript naming a character this account doesn't have is a per-file failure with the reason, never a
// silent orphan — the descriptor's own `findByHandle` is what refuses it.
//
// Belts mirror the sibling ingest routes: auth (401 before the body is read) → CSRF (403 on a cookie
// mutation missing the custom header) → a hono/body-limit total cap (413). Per-file failures are ISOLATED
// into `failed[]` (one bad transcript never fails the batch), matching POST /api/import's card contract.

import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry, PortableEntity } from "@orb/contracts/portability";
import { IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { slugifyHandle } from "@orb/kit/slug";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { hasCsrfHeader } from "#infra/auth";
import { parseChatJsonl } from "#kit/serde/chat";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const CHAT_ROUTE = "/api/import/chat";
const UPLOAD_FIELD = "file";
const CHAT_KIND = "chat";
const UNNAMED_ERROR = "the transcript's header names no character — import it inside a bundle instead";
const UNPARSEABLE_ERROR = "not a valid chat .jsonl file";

export interface ImportChatDeps {
  /** The composed registry — its `chat` descriptor IS the import path (resolved once at registration). */
  readonly registry: PortabilityRegistry;
}

/** One transcript that landed (or deduped). `created:false` = the chat was already present (no write). */
export interface ImportedChat {
  readonly filename: string;
  readonly created: boolean;
}

/** One transcript that could not be imported — the operator-facing reason, isolated rather than thrown. */
export interface FailedChat {
  readonly filename: string;
  readonly error: string;
}

/** The `POST /api/import/chat` response body: the REAL per-file outcome (the client summary derives from it). */
export interface ChatImportResult {
  readonly imported: readonly ImportedChat[];
  readonly failed: readonly FailedChat[];
}

interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

const DEC = new TextDecoder();

/** Auth-first + CSRF gate, ahead of the body-limit belt so an anonymous/cross-site caller is rejected
 *  before a body byte is read (the sibling upload routes' belt order). */
const authCsrfGuard: MiddlewareHandler<PrincipalEnv> = async (c, next) => {
  const principal = c.get("principal");
  if (principal === null) {
    return c.body(null, UNAUTHORIZED);
  }
  if (principal.via === "cookie" && !hasCsrfHeader(c.req.raw.headers)) {
    return c.body(null, FORBIDDEN);
  }
  return await next();
};

/** The descriptor path a bare transcript maps to: `<handle>/<leaf>`, where the handle comes from the
 *  transcript's own `character_name`. `null` = the file isn't a parseable chat, or names nobody. */
function descriptorPath(bytes: Uint8Array, filename: string): { readonly path: string } | { readonly error: string } {
  // Parsed TWICE (here for the routing name, again inside the descriptor for the content). The alternative —
  // a second import entry point taking a resolved characterId — is the parallel path this route exists to
  // avoid; a transcript is small and the parse is pure.
  const parsed = parseChatJsonl(DEC.decode(bytes), { fileName: filename, charDirName: "" });
  if (parsed === null) {
    return { error: UNPARSEABLE_ERROR };
  }
  // Guard the NAME, not the slug: `slugifyHandle("")` answers its "unnamed" fallback, which would route an
  // anonymous transcript at whatever character happens to hold that handle.
  if (parsed.characterName.trim().length === 0) {
    return { error: UNNAMED_ERROR };
  }
  return { path: `${slugifyHandle(parsed.characterName)}/${filename}` };
}

/** Register `POST /api/import/chat` on `app`: auth → CSRF → body cap → per-file delegate to the registry's
 *  `chat` descriptor. Throws at registration if the registry has no chat descriptor (a composition bug). */
export function registerImportChat(app: Hono<PrincipalEnv>, deps: ImportChatDeps): void {
  const chat: PortableEntity | undefined = deps.registry.find((entity) => entity.kind === CHAT_KIND);
  if (chat === undefined) {
    throw new Error("portability registry has no chat descriptor");
  }

  app.post(CHAT_ROUTE, authCsrfGuard, bodyLimit({ maxSize: IMPORT_MAX_TOTAL_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const form = await c.req.formData();
    const files = form.getAll(UPLOAD_FIELD).filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return c.json({ error: `no "${UPLOAD_FIELD}" transcript uploads` }, BAD_REQUEST);
    }

    const imported: ImportedChat[] = [];
    const failed: FailedChat[] = [];
    for (const file of files) {
      // biome-ignore lint/performance/noAwaitInLoops: transcripts import sequentially — each is one atomic write with its own isolated failure, exactly like the card batch.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const routed = descriptorPath(bytes, file.name);
      if ("error" in routed) {
        failed.push({ filename: file.name, error: routed.error });
        continue;
      }
      const outcome = await chat.importFile(principal.userId, { filename: routed.path, bytes });
      if (outcome.ok) {
        imported.push({ filename: file.name, created: outcome.created === true });
      } else {
        failed.push({ filename: file.name, error: outcome.error ?? "import failed" });
      }
    }
    return c.json({ imported, failed } satisfies ChatImportResult);
  });
}
