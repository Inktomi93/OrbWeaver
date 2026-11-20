// The download registrar: the character card PNG/JSON, the chat transcript (jsonl/txt/orb), and the owner's
// full/filtered portability bundle streamed as a zip. GET downloads carry no CSRF requirement.
//
// WHAT THE GATE ACTUALLY IS ("all routes are owner/host-gated
// reads" would read as "a credential is required", which is not what ships). Each route
// requires a RESOLVED PRINCIPAL and nothing more: `null` ⇒ 401, otherwise the downstream verb scopes the read
// to that principal (not-owned / not-host / missing all collapse to 404). WHO the principal is is decided
// upstream, once, by the auth mode (`entry/app.ts`'s per-request middleware → `entry/auth/seam.ts`
// `resolvePrincipal`) — and under `AUTH_MODE=single-user` that resolution mints the owner-fallback principal
// unconditionally (`via:"fallback"`, `infra/auth.resolve`'s `ownerFallbackAllowed`). So a cookie-less request
// to this door returns 200 in single-user mode, correctly: in that deployment the fallback owner IS the
// principal. An origin is not a credential, which is why the DEBUG gate treats `via:"fallback"` as one only
// on a non-production box (`seam.ts` `debugGateCredentialed`) — these routes deliberately gate on
// nothing extra, because they serve the owner their own rows. Do not read "owner-gated" here as an
// authentication claim.
//
// The library route iterates the injected `PortabilityRegistry`:
// for each requested kind it pulls that entity's exportAll(ownerId) and packs each file into one streamed
// zip. Owner-scoped by construction. A verb returning null (not-owned/missing) maps to 404 uniformly. A row an entity
// cannot carry as stored is named in the zip's export report (`PORTABLE_EXPORT_REPORT_FILE`), never a broken stream.

import type { Principal } from "@orb/contracts/identity";
import type { StExportRefusal } from "@orb/contracts/import";
import { ST_EXPORT_DRY_RUN_QUERY, ST_EXPORT_FORMAT, ST_EXPORT_RUNNING_CODE } from "@orb/contracts/import";
import type { ExportPersonaOp, ListPersonasOp } from "@orb/contracts/persona";
import type { PortabilityRegistry, PortableExportNote, PortableExportReport, PortableFile, PortableKind } from "@orb/contracts/portability";
import { PORTABILITY_ROUTES, PORTABLE_EXPORT_REPORT_FILE, PORTABLE_KINDS, WHOLE_LIBRARY_ONLY_KINDS } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { ExportCardFormat, ExportChatFormat, ExportService, StPersonaFile, StProfileSource } from "#domain/export";
import { createBundlePaths, stProfileDryRun, stProfileZip } from "#domain/export";
import type { Logger, TraceRing } from "#foundation/observability";
import type { ZipEntry } from "#infra/storage";
import { packZip, ZIP_WRITE_LIMITS } from "#infra/storage";
import { isStoredConfigUnreadable, refuseExportNote } from "#primitives/stored-config";
import type { PrincipalEnv } from "./contract/request-env.ts";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;
const CONFLICT = 409;
const PNG_MIME = "image/png";
const JSONL_MIME = "application/x-ndjson";
const TXT_MIME = "text/plain; charset=utf-8";
const JSON_MIME = "application/json; charset=utf-8";
const ZIP_MIME = "application/zip";
const FORMAT_QUERY = "format";
const KINDS_QUERY = "kinds";
const LIBRARY_FILENAME = "orbweaver-library.zip";
const ST_PROFILE_FILENAME = "orbweaver-sillytavern.zip";
const DRY_RUN_VALUE = "1";
const ST_EXPORT_RUNNING_ERROR = "an export is already running";
const JSON_REPORT_INDENT = 2;
const HEAD_METHOD = "HEAD";
const DRY_RUN_HEADERS = { "Content-Type": JSON_MIME } as const;

/** R6 — the chat door's THIRD container: the orb-native bundle. Not an `ExportChatFormat` member, because
 *  that union is the ST INTERCHANGE's two text shapes and this one is neither text nor ST — it is the same
 *  payload an account backup carries, served for one room. Kept on the same `?format=` axis so a caller has
 *  one question to ask ("which container?"), not two doors to know about. */
const CHAT_FORMAT_ORB = "orb";
const ORB_BUNDLE_MIME = "application/json; charset=utf-8";

const CHAT_FORMATS: ReadonlySet<string> = new Set<ExportChatFormat>(["jsonl", "txt"]);
const CARD_FORMATS: ReadonlySet<string> = new Set<ExportCardFormat>(["png", "json"]);
const PORTABLE_KIND_VALUES: readonly string[] = PORTABLE_KINDS;
const WHOLE_LIBRARY_ONLY_VALUES: readonly string[] = WHOLE_LIBRARY_ONLY_KINDS;

export interface ExportDeps {
  readonly logger: Logger;
  readonly traces: TraceRing;
  readonly export: Pick<
    ExportService,
    | "exportCharacter"
    | "exportChat"
    | "exportChatBundle"
    | "listHostChats"
    | "listStCards"
    | "ownedBlobMimes"
    | "readOwnedBlob"
    | "listChatDocumentHashes"
    | "listStDocuments"
    | "readStDocumentText"
  >;
  readonly registry: PortabilityRegistry;
  /** The owner's personas with their avatar hashes: the backup's persona file carries no avatar. */
  readonly listPersonas: ListPersonasOp;
  readonly exportPersona: ExportPersonaOp;
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
    // A whole-library-only kind is the owner's own record; a partial export never carries it.
    if (!PORTABLE_KIND_VALUES.includes(trimmed) || WHOLE_LIBRARY_ONLY_VALUES.includes(trimmed)) {
      return { kinds: null, invalid: trimmed };
    }
    requested.add(trimmed as PortableKind);
  }
  return { kinds: requested, invalid: null };
}

/** The library route's request, read once so a HEAD and a GET answer the same request. */
type LibraryRequest = { readonly stProfile: true; readonly dryRun: boolean } | { readonly stProfile: false; readonly kinds: ReadonlySet<PortableKind> | null };

function parseLibraryRequest(
  format: string | undefined,
  rawKinds: string | undefined,
  dryRun: string | undefined,
): LibraryRequest | { readonly error: string } {
  if (format === ST_EXPORT_FORMAT) {
    // A SillyTavern profile is the whole library: SillyTavern pairs chats with their cards by folder.
    if (rawKinds !== undefined) {
      return { error: `"${KINDS_QUERY}" does not apply to the ${ST_EXPORT_FORMAT} format` };
    }
    return { stProfile: true, dryRun: dryRun === DRY_RUN_VALUE };
  }
  const { kinds, invalid } = parseKinds(rawKinds);
  if (invalid !== null) {
    return { error: `invalid "${KINDS_QUERY}" token: ${invalid}` };
  }
  return { stProfile: false, kinds };
}

function libraryHeaders(request: LibraryRequest): Readonly<Record<string, string>> {
  if (!request.stProfile) {
    return zipHeaders(LIBRARY_FILENAME);
  }
  return request.dryRun ? DRY_RUN_HEADERS : zipHeaders(ST_PROFILE_FILENAME);
}

/** Stream every requested entity's files as zip entries under distinct paths, so the archive also restores as a
 *  folder. Owner-scoped: `ownerId` is the only owner each `exportAll` sees. A row an entity cannot carry as stored
 *  never breaks the stream: the entity reports it, and the report closes the archive. */
async function* libraryEntries(registry: PortabilityRegistry, kinds: ReadonlySet<PortableKind> | null, ownerId: Principal["userId"]): AsyncGenerator<ZipEntry> {
  const bundlePath = createBundlePaths();
  const notes: PortableExportNote[] = [];
  for (const entity of registry) {
    if (kinds !== null && !kinds.has(entity.kind)) {
      continue;
    }
    for await (const file of entity.exportAll(ownerId, (note) => notes.push(note))) {
      yield { path: bundlePath(`${entity.dir}${file.filename}`), bytes: file.bytes };
    }
  }
  if (notes.length > 0) {
    const report: PortableExportReport = { notes };
    yield { path: bundlePath(PORTABLE_EXPORT_REPORT_FILE), bytes: new TextEncoder().encode(JSON.stringify(report, null, JSON_REPORT_INDENT)) };
  }
}

// The SillyTavern export reads the small kinds through the same per-kind streams the library zip reads, and cards,
// rooms, personas and blobs through reads of their own, all under the same one owner.
function stProfileSource(deps: ExportDeps, principal: Principal): StProfileSource {
  return {
    async *files(kind, note): AsyncGenerator<PortableFile> {
      for (const entity of deps.registry.filter((candidate) => candidate.kind === kind)) {
        yield* entity.exportAll(principal.userId, note);
      }
    },
    cards: async () => deps.export.listStCards({ principal }),
    card: async (characterId, note) => (await deps.export.exportCharacter({ principal, characterId, note }))?.bytes ?? null,
    rooms: () => deps.export.listHostChats({ principal }),
    transcript: (chatId, attachments) => deps.export.exportChat({ principal, chatId, format: "jsonl", attachments }),
    documents: () => deps.export.listStDocuments({ principal }),
    documentText: (documentId) => deps.export.readStDocumentText({ principal, documentId }),
    chatDocumentHashes: () => deps.export.listChatDocumentHashes({ principal }),
    async *personas(note): AsyncGenerator<StPersonaFile> {
      for (const persona of await deps.listPersonas({ principal })) {
        yield { file: await deps.exportPersona({ principal, personaId: persona.id, note }), avatarHash: persona.avatarHash };
      }
    },
    blobMimes: (hashes) => deps.export.ownedBlobMimes({ principal, hashes }),
    blob: (hash) => deps.export.readOwnedBlob({ principal, hash }),
  };
}

// One SillyTavern export or dry run per owner at a time: each reads the whole library, so a second waits for nothing
// and is refused. The hold is taken before the response is built and given back when the run ends, by any path.
interface ExportHolds {
  /** The release for the owner's new hold, or null while the owner already holds one. */
  readonly take: (ownerId: UserId) => (() => void) | null;
}

function createExportHolds(): ExportHolds {
  const running = new Set<UserId>();
  return {
    take(ownerId): (() => void) | null {
      if (running.has(ownerId)) {
        return null;
      }
      running.add(ownerId);
      return () => {
        running.delete(ownerId);
      };
    },
  };
}

// The zip's files, the hold given back when the stream ends, is cancelled, or fails in the source or in the writer
// (`packZip` returns the iterator on cancel and on a refused entry).
async function* heldZip(files: AsyncIterable<ZipEntry>, release: () => void): AsyncGenerator<ZipEntry> {
  try {
    yield* files;
  } finally {
    release();
  }
}

async function serveStProfile(deps: ExportDeps, holds: ExportHolds, principal: Principal, dryRun: boolean): Promise<Response> {
  const release = holds.take(principal.userId);
  if (release === null) {
    const refusal: StExportRefusal = { code: ST_EXPORT_RUNNING_CODE, error: ST_EXPORT_RUNNING_ERROR };
    return Response.json(refusal, { status: CONFLICT });
  }
  const source = stProfileSource(deps, principal);
  if (dryRun) {
    try {
      return Response.json(await stProfileDryRun(source, ZIP_WRITE_LIMITS), { headers: DRY_RUN_HEADERS });
    } finally {
      release();
    }
  }
  const profile = packZip(heldZip(stProfileZip(source, ZIP_WRITE_LIMITS), release), deps.logger, deps.traces);
  return new Response(profile, { headers: zipHeaders(ST_PROFILE_FILENAME) });
}

function zipHeaders(filename: string): Readonly<Record<string, string>> {
  return { "Content-Type": ZIP_MIME, "Content-Disposition": `attachment; filename="${filename}"` };
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

// A card download has nothing else to deliver, so an entry it cannot carry as stored refuses it with the coded reason
// naming the entry; the owner repairs the entry in the World Info editor or deletes it.
async function serveCard(exporter: ExportDeps["export"], params: Omit<Parameters<ExportService["exportCharacter"]>[0], "note">): Promise<Response> {
  let card: Awaited<ReturnType<ExportService["exportCharacter"]>>;
  try {
    card = await exporter.exportCharacter({ ...params, note: refuseExportNote });
  } catch (err) {
    if (isStoredConfigUnreadable(err)) {
      return Response.json({ error: err.message, code: err.code }, { status: CONFLICT });
    }
    throw err;
  }
  if (card === null) {
    return new Response(null, { status: NOT_FOUND });
  }
  return serveDownload(card.bytes, params.format === "json" ? JSON_MIME : PNG_MIME, card.filename);
}

function transcriptMime(format: ExportChatFormat | undefined): string {
  return (format ?? "jsonl") === "jsonl" ? JSONL_MIME : TXT_MIME;
}

/** Register the download routes on `app`. A downstream verb `null` (not-owned/not-host, or missing) → 404. */
export function registerExport(app: Hono<PrincipalEnv>, deps: ExportDeps): void {
  const holds = createExportHolds();
  app.get(PORTABILITY_ROUTES.exportCharacter, async (c) => {
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
    // An id that does not parse names no character, so it answers the same 404 as a foreign one.
    const characterId = typeIdSchema(ID_PREFIX.character).safeParse(c.req.param("characterId")).data;
    if (characterId === undefined) {
      return c.body(null, NOT_FOUND);
    }
    return await serveCard(deps.export, { principal, characterId, format });
  });

  app.get(PORTABILITY_ROUTES.exportChat, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const formatRaw = c.req.query(FORMAT_QUERY);
    if (formatRaw !== undefined && formatRaw !== CHAT_FORMAT_ORB && !CHAT_FORMATS.has(formatRaw)) {
      return c.json({ error: `invalid "${FORMAT_QUERY}" — expected jsonl, txt or orb` }, BAD_REQUEST);
    }
    const chatId = typeIdSchema(ID_PREFIX.chat).safeParse(c.req.param("chatId")).data;
    if (chatId === undefined) {
      return c.body(null, NOT_FOUND);
    }
    if (formatRaw === CHAT_FORMAT_ORB) {
      // The FIDELITY container — the whole room (injections, the tag overlay, room overrides, the
      // variable/macro picks, the rpg campaign), not the ST interchange's message subset.
      const bundle = await deps.export.exportChatBundle({ principal, chatId });
      return bundle === null ? c.body(null, NOT_FOUND) : serveDownload(bundle.bytes, ORB_BUNDLE_MIME, bundle.filename);
    }
    const format = formatRaw as ExportChatFormat | undefined;
    const transcript = await deps.export.exportChat({ principal, chatId, format });
    if (transcript === null) {
      return c.body(null, NOT_FOUND);
    }
    return serveDownload(transcript.text, transcriptMime(format), transcript.filename);
  });

  app.get(PORTABILITY_ROUTES.exportLibrary, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const request = parseLibraryRequest(c.req.query(FORMAT_QUERY), c.req.query(KINDS_QUERY), c.req.query(ST_EXPORT_DRY_RUN_QUERY));
    if ("error" in request) {
      return c.json({ error: request.error }, BAD_REQUEST);
    }
    // Hono answers a HEAD by running this GET handler and dropping its body uncancelled: a stream built here would never
    // end, and a SillyTavern export's hold would stay taken until restart. A HEAD stops before the hold and the stream.
    if (c.req.method === HEAD_METHOD) {
      return new Response(null, { headers: libraryHeaders(request) });
    }
    if (request.stProfile) {
      return await serveStProfile(deps, holds, principal, request.dryRun);
    }
    const stream = packZip(libraryEntries(deps.registry, request.kinds, principal.userId), deps.logger, deps.traces);
    return new Response(stream, { headers: libraryHeaders(request) });
  });
}
