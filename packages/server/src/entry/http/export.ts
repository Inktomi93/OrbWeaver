// entry/http/export — the download registrar (core/Tier-5-Entry.md §layout "http/"; PD-109;
// `docs/architecture/proposed/export-deferred-surfaces.md`). Two routes, both OWNER/HOST-gated reads
// (mirrors `blob.ts`'s posture — GET downloads carry no CSRF requirement, D-doc "Carried decisions"):
//   • GET /api/export/character/:characterId — the V3 card PNG (`exportCharacter`).
//   • GET /api/export/chat/:chatId?format=jsonl|txt — the chat transcript (`exportChat`, default jsonl).
// Composes the `#domain/export` front door ONLY (the entry → domain front-door rule; dep-cruiser
// backstop) — this registrar owns no business logic, just param parsing + content-type/filename framing.
// A verb returning `null` (not-owned/not-host and missing collapse identically — no foreign-existence
// leak, per the verbs' own contract) maps to 404, same as `blob.ts`'s `getMetadata` miss.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { ExportChatFormat, ExportService } from "#domain/export";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;
const PNG_MIME = "image/png";
const JSONL_MIME = "application/x-ndjson";
const TXT_MIME = "text/plain; charset=utf-8";
const CHARACTER_ROUTE = "/api/export/character/:characterId";
const CHAT_ROUTE = "/api/export/chat/:chatId";
const FORMAT_QUERY = "format";

const CHAT_FORMATS: ReadonlySet<string> = new Set<ExportChatFormat>(["jsonl", "txt"]);

/** The `export` front-door slice this registrar consumes (the two download verbs, unchanged shape). */
export interface ExportDeps {
  readonly export: Pick<ExportService, "exportCharacter" | "exportChat">;
}

/** The request-context shape `app.ts` populates: the resolved caller (or `null` when anonymous). */
interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/** Build the binary/text download response (content-type + filename-safe attachment disposition). */
function serveDownload(body: Uint8Array | string, mime: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Register the two download routes on `app`. The caller is read from the request context (`app.ts`
 *  resolves it); a downstream verb `null` (not-owned/not-host, or missing) → 404. */
export function registerExport(app: Hono<PrincipalEnv>, deps: ExportDeps): void {
  app.get(CHARACTER_ROUTE, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const characterId = castId<CharacterId>(c.req.param("characterId"));
    const card = await deps.export.exportCharacter({ principal, characterId });
    if (card === null) {
      return c.body(null, NOT_FOUND);
    }
    return serveDownload(card.bytes, PNG_MIME, card.filename);
  });

  app.get(CHAT_ROUTE, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const formatRaw = c.req.query(FORMAT_QUERY);
    if (formatRaw !== undefined && !CHAT_FORMATS.has(formatRaw)) {
      return c.json({ error: `invalid "${FORMAT_QUERY}" — expected jsonl or txt` }, BAD_REQUEST);
    }
    const format = formatRaw as ExportChatFormat | undefined;
    const chatId = castId<ChatId>(c.req.param("chatId"));
    const transcript = await deps.export.exportChat({ principal, chatId, format });
    if (transcript === null) {
      return c.body(null, NOT_FOUND);
    }
    const mime = (format ?? "jsonl") === "jsonl" ? JSONL_MIME : TXT_MIME;
    return serveDownload(transcript.text, mime, transcript.filename);
  });
}
