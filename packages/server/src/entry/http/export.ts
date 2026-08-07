// The download registrar. All routes are owner/host-gated reads (GET downloads carry no CSRF
// requirement): the character card PNG, the chat transcript (jsonl/txt), and the owner's full/filtered
// portability bundle streamed as a zip. The library route iterates the injected `PortabilityRegistry`:
// for each requested kind it pulls that entity's exportAll(ownerId) and packs each file into one streamed
// zip. Owner-scoped by construction. A verb returning null (not-owned/missing) maps to 404 uniformly.

import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { ExportCardFormat, ExportChatFormat, ExportService } from "#domain/export";
import type { ZipEntry } from "#infra/storage";
import { packZip } from "#infra/storage";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;
const PNG_MIME = "image/png";
const JSONL_MIME = "application/x-ndjson";
const TXT_MIME = "text/plain; charset=utf-8";
const JSON_MIME = "application/json; charset=utf-8";
const ZIP_MIME = "application/zip";
const CHARACTER_ROUTE = "/api/export/character/:characterId";
const CHAT_ROUTE = "/api/export/chat/:chatId";
const LIBRARY_ROUTE = "/api/export/library";
const FORMAT_QUERY = "format";
const KINDS_QUERY = "kinds";
const LIBRARY_FILENAME = "orbweaver-library.zip";

const CHAT_FORMATS: ReadonlySet<string> = new Set<ExportChatFormat>(["jsonl", "txt"]);
const CARD_FORMATS: ReadonlySet<string> = new Set<ExportCardFormat>(["png", "json"]);
const PORTABLE_KIND_VALUES: readonly string[] = PORTABLE_KINDS;

export interface ExportDeps {
  readonly export: Pick<ExportService, "exportCharacter" | "exportChat">;
  readonly registry: PortabilityRegistry;
}

/** The result of parsing the `kinds` query: the set to export (null = all), or the first bad token. */
interface ParsedKinds {
  readonly kinds: ReadonlySet<PortableKind> | null;
  readonly invalid: string | null;
}

function parseKinds(raw: string | undefined): ParsedKinds {
  if (raw === undefined || raw.length === 0) {
    return { kinds: null, invalid: null };
  }
  const requested = new Set<PortableKind>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (!PORTABLE_KIND_VALUES.includes(trimmed)) {
      return { kinds: null, invalid: trimmed };
    }
    requested.add(trimmed as PortableKind);
  }
  return { kinds: requested, invalid: null };
}

/** Stream every requested entity's files as zip entries. Owner-scoped: `ownerId` is the only owner each
 *  `exportAll` sees. */
async function* libraryEntries(registry: PortabilityRegistry, kinds: ReadonlySet<PortableKind> | null, ownerId: Principal["userId"]): AsyncGenerator<ZipEntry> {
  for (const entity of registry) {
    if (kinds !== null && !kinds.has(entity.kind)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the export is intentionally sequential — one entity's owner-scoped rows stream at a time (bounded memory).
    for await (const file of entity.exportAll(ownerId)) {
      yield { path: `${entity.dir}${file.filename}`, bytes: file.bytes };
    }
  }
}

interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

function serveDownload(body: Uint8Array | string, mime: string, filename: string): Response {
  // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
  // new Uint8Array(body) copies into a concrete ArrayBuffer view — same pattern as egress.ts.
  return new Response(body instanceof Uint8Array ? new Uint8Array(body) : body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Register the download routes on `app`. A downstream verb `null` (not-owned/not-host, or missing) → 404. */
export function registerExport(app: Hono<PrincipalEnv>, deps: ExportDeps): void {
  app.get(CHARACTER_ROUTE, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    // O-5: the format axis the chat door already had. Absent ⇒ png (the ST-parity card).
    const formatRaw = c.req.query(FORMAT_QUERY);
    if (formatRaw !== undefined && !CARD_FORMATS.has(formatRaw)) {
      return c.json({ error: `invalid "${FORMAT_QUERY}" — expected png or json` }, BAD_REQUEST);
    }
    const format = formatRaw as ExportCardFormat | undefined;
    const characterId = castId<CharacterId>(c.req.param("characterId"));
    const card = await deps.export.exportCharacter({ principal, characterId, format });
    if (card === null) {
      return c.body(null, NOT_FOUND);
    }
    return serveDownload(card.bytes, format === "json" ? JSON_MIME : PNG_MIME, card.filename);
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

  app.get(LIBRARY_ROUTE, (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const { kinds, invalid } = parseKinds(c.req.query(KINDS_QUERY));
    if (invalid !== null) {
      return c.json({ error: `invalid "${KINDS_QUERY}" token: ${invalid}` }, BAD_REQUEST);
    }
    const stream = packZip(libraryEntries(deps.registry, kinds, principal.userId));
    return new Response(stream, {
      headers: {
        "Content-Type": ZIP_MIME,
        "Content-Disposition": `attachment; filename="${LIBRARY_FILENAME}"`,
      },
    });
  });
}
