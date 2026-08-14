// The download registrar: the character card PNG/JSON, the chat transcript (jsonl/txt/orb), and the owner's
// full/filtered portability bundle streamed as a zip. GET downloads carry no CSRF requirement.
//
// WHAT THE GATE ACTUALLY IS (truth-repair, side-eye 2026-08-08 — this header used to say "all routes are
// owner/host-gated reads", which reads as "a credential is required" and is not what ships). Each route
// requires a RESOLVED PRINCIPAL and nothing more: `null` ⇒ 401, otherwise the downstream verb scopes the read
// to that principal (not-owned / not-host / missing all collapse to 404). WHO the principal is is decided
// upstream, once, by the auth mode (`entry/app.ts`'s per-request middleware → `entry/auth/seam.ts`
// `resolvePrincipal`) — and under `AUTH_MODE=single-user` that resolution mints the owner-fallback principal
// unconditionally (`via:"fallback"`, `infra/auth.resolve`'s `ownerFallbackAllowed`). So a cookie-less request
// to this door returns 200 in single-user mode, correctly: in that deployment the fallback owner IS the
// principal. An origin is not a credential, which is why the DEBUG gate refuses `via:"fallback"` explicitly
// (`seam.ts` `DEBUG_GATE_CREDENTIALED`) — these routes deliberately do not, because they serve the owner
// their own rows. Do not read "owner-gated" here as an authentication claim.
//
// The library route iterates the injected `PortabilityRegistry`:
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
import type { PrincipalEnv } from "./blob.ts";

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

/** R6 — the chat door's THIRD container: the orb-native bundle. Not an `ExportChatFormat` member, because
 *  that union is the ST INTERCHANGE's two text shapes and this one is neither text nor ST — it is the same
 *  payload an account backup carries, served for one room. Kept on the same `?format=` axis so a caller has
 *  one question to ask ("which container?"), not two doors to know about. */
const CHAT_FORMAT_ORB = "orb";
const ORB_BUNDLE_MIME = "application/json; charset=utf-8";

const CHAT_FORMATS: ReadonlySet<string> = new Set<ExportChatFormat>(["jsonl", "txt"]);
const CARD_FORMATS: ReadonlySet<string> = new Set<ExportCardFormat>(["png", "json"]);
const PORTABLE_KIND_VALUES: readonly string[] = PORTABLE_KINDS;

export interface ExportDeps {
  readonly export: Pick<ExportService, "exportCharacter" | "exportChat" | "exportChatBundle">;
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
    if (formatRaw !== undefined && formatRaw !== CHAT_FORMAT_ORB && !CHAT_FORMATS.has(formatRaw)) {
      return c.json({ error: `invalid "${FORMAT_QUERY}" — expected jsonl, txt or orb` }, BAD_REQUEST);
    }
    const chatId = castId<ChatId>(c.req.param("chatId"));
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
