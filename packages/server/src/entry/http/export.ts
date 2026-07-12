// entry/http/export — the download registrar (core/Tier-5-Entry.md §layout "http/"; PD-109;
// `docs/architecture/history/export-import-portability.md` §3). All routes are
// OWNER/HOST-gated reads (mirrors `blob.ts`'s posture — GET downloads carry no CSRF requirement, D-doc
// "Carried decisions"):
//   • GET /api/export/character/:characterId — the V3 card PNG (`exportCharacter`).
//   • GET /api/export/chat/:chatId?format=jsonl|txt — the chat transcript (`exportChat`, default jsonl).
//   • GET /api/export/library?kinds=… — the OWNER's full/filtered portability bundle, streamed as a zip
//     (the entity-agnostic delivery core, §3). Iterates the INJECTED `PortabilityRegistry`: for each
//     requested kind (or ALL) it pulls that entity's `exportAll(ownerId)` and packs each file under the
//     entity's `dir` into ONE streamed zip. Owner-scoped by construction (`principal.userId` is the only
//     owner every `exportAll` sees) — no cross-tenant read. `kinds` omitted = everything; an unknown kind
//     is a 400 (a bounded keyspace, never a silent partial). This registrar owns no business logic — the
//     descriptors do the reading/serde; it frames the zip response.
// The single-entity verbs compose the `#domain/export` front door; the library route composes the registry.
// A verb returning `null` (not-owned/not-host and missing collapse identically — no foreign-existence leak)
// maps to 404, same as `blob.ts`'s `getMetadata` miss.

import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry, PortableKind } from "@orb/contracts/portability";
import { PORTABLE_KINDS } from "@orb/contracts/portability";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { ExportChatFormat, ExportService } from "#domain/export";
import type { ZipEntry } from "#infra/storage";
import { packZip } from "#infra/storage";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;
const PNG_MIME = "image/png";
const JSONL_MIME = "application/x-ndjson";
const TXT_MIME = "text/plain; charset=utf-8";
const ZIP_MIME = "application/zip";
const CHARACTER_ROUTE = "/api/export/character/:characterId";
const CHAT_ROUTE = "/api/export/chat/:chatId";
const LIBRARY_ROUTE = "/api/export/library";
const FORMAT_QUERY = "format";
const KINDS_QUERY = "kinds";
const LIBRARY_FILENAME = "orbweaver-library.zip";

const CHAT_FORMATS: ReadonlySet<string> = new Set<ExportChatFormat>(["jsonl", "txt"]);
// The valid kind set is the PORTABLE_KINDS tuple itself (a frozen const) — membership via `.includes`, so
// there is no module-scope mutable Set (assumes-single-replica).
const PORTABLE_KIND_VALUES: readonly string[] = PORTABLE_KINDS;

/** The `export` front-door slice this registrar consumes plus the injected portability registry the library
 *  route iterates (assembled at entry/compose; a deployment with no registered entities exports an empty
 *  bundle — never an error). */
export interface ExportDeps {
  readonly export: Pick<ExportService, "exportCharacter" | "exportChat">;
  readonly registry: PortabilityRegistry;
}

/** The result of parsing the `kinds` query: the set to export (null = ALL), or the first bad token. */
interface ParsedKinds {
  readonly kinds: ReadonlySet<PortableKind> | null;
  readonly invalid: string | null;
}

/** Parse the `kinds` query into the set to export: omitted ⇒ null (ALL registered kinds); a comma list ⇒
 *  the validated set; any unrecognized token ⇒ the `invalid` flag (the route 400s). A bounded keyspace — a
 *  typo'd kind never silently narrows the export. */
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

/** Stream every requested entity's files as zip entries (path = the entity's dir + the portable filename).
 *  Owner-scoped: `ownerId` is the ONLY owner each `exportAll` sees. */
async function* libraryEntries(
  registry: PortabilityRegistry,
  kinds: ReadonlySet<PortableKind> | null,
  ownerId: Principal["userId"],
): AsyncGenerator<ZipEntry> {
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

  // GET /api/export/library?kinds=… — the owner-scoped portability bundle (auth-first; a read, so no CSRF,
  // matching the sibling downloads). The zip is STREAMED (packZip pulls each entity's exportAll lazily), so
  // a large library never fully buffers. `kinds` is validated up front (a bad token 400s before any read).
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
