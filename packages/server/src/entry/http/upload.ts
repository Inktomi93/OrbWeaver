// The multipart ingest registrar. Two mutating byte-ingest routes; app.ts resolves the Principal and
// derives the CSRF signal but does not gate on it, so each route enforces the belts itself: auth first
// (401 before the body is read) → CSRF (403 on a cookie mutation missing the custom header) → a
// hono/body-limit stream cap (413 over-size, rejected before the whole body is buffered).
//   • POST /api/assets/upload — a single asset file → assets.store({ enforceMagic:true, maxBytes }).
//   • POST /api/import — character-card file(s) → delegates to entry/import/run-profile-import.
//   • POST /api/import/restore-card-lorebook — ONE card file → re-asserts its embedded lorebook over the
//     character those bytes imported as (#1598; a plain re-upload keeps the owner's edited book instead).
//
// The import route accepts already-extracted card files; a profile ZIP / dir collection is a later wave.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { assetKindSchema } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import { ASSET_UPLOAD_MAX_BYTES, DATABANK_UPLOAD_MAX_BYTES, IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { DatabankService } from "#domain/databank";
import { hasCsrfHeader } from "#infra/auth";
import type { ImportAssetPort, ImportCharacterPort, ImportFile, ImportTagPort, ImportWorldInfoPort, ProfileImportResult } from "../import/index.ts";
import { runCardLorebookRestore, runProfileImport } from "../import/index.ts";
import type { PrincipalEnv } from "./blob.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const FALLBACK_MIME = "application/octet-stream";
const ASSET_UPLOAD_ROUTE = "/api/assets/upload";
const IMPORT_ROUTE = "/api/import";
// The #1598 RESTORE door: an ordinary re-upload through IMPORT_ROUTE now KEEPS an edited primary book, so
// "put the card's own lorebook back" is this separate, explicitly-asked-for route.
const LOREBOOK_RESTORE_ROUTE = "/api/import/restore-card-lorebook";
const DATABANK_UPLOAD_ROUTE = "/api/databank/upload";
const UPLOAD_FIELD = "file";
const KIND_FIELD = "kind";
const NAME_FIELD = "name";

const IMAGE_MIME_PREFIX = "image/";

/** The `assets` front-door slice the asset-upload route consumes (the full {@link StoredAsset} result —
 *  a superset of {@link ImportAssetPort}'s `{assetId}`, so one handle serves both routes). */
export interface UploadAssetsPort {
  readonly store: (params: {
    readonly principal: Principal;
    readonly bytes: Uint8Array;
    readonly kind: AssetKind;
    readonly mime: string;
    readonly enforceMagic?: boolean;
    readonly maxBytes?: number;
  }) => Promise<StoredAsset>;
}

export interface UploadDeps {
  /** Serves the asset-upload `store` and the import avatar-store (`ImportAssetPort`). */
  readonly assets: UploadAssetsPort & ImportAssetPort;
  readonly character: ImportCharacterPort;
  readonly tag: ImportTagPort;
  /** So an imported card's `character_book` actually lands (without it embedded books are dropped). */
  readonly worldInfo: ImportWorldInfoPort;
  /** The databank producer's binary front door (bytes → extract → chunk). */
  readonly databank: Pick<DatabankService, "upload">;
  /** The admin-tunable effective `maxImageBytes` — the asset route clamps an IMAGE-kind upload to the tighter
   *  of the route cap and this (the same per-request accessor the character/imagery asset stores use). A
   *  non-image kind (document/plugin) keeps the fixed route cap. */
  readonly maxImageBytes: () => number;
  /** The admin-tunable effective `maxDatabankBytes` — the databank route rejects (413) a document over this
   *  (already ≤ the static route belt; an override may only TIGHTEN). Read per request so a retune applies live. */
  readonly maxDatabankBytes: () => number;
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Auth-first + CSRF gate, run as middleware before the body-limit belt so an anonymous/cross-site caller
 *  is rejected before a single body byte is read.
 *
 *  CSRF keys on the AMBIENT-credential arms, `via !== "header"` (#300): both `cookie` (the browser auto-sends
 *  the session cookie) and `fallback` (the loopback owner arm — the browser "auto-sends" its loopback socket)
 *  are forgeable by a cross-site page, so a mutation on either MUST carry the custom `x-orb-csrf` header a
 *  cross-origin `fetch` cannot set without a preflight the app never grants. Only `via:"header"` (a trusted
 *  proxy asserts the identity) is exempt. This route needs the explicit fallback gate BECAUSE multipart
 *  form-data is a CORS-"simple" content-type — no preflight — so the peer-gate alone still leaves a loopback
 *  web origin (a browser on the box tricked into POSTing to 127.0.0.1) able to drive an owner write. tRPC is
 *  NOT in this bucket: it requires JSON, which forces a preflight, so its belt keys on `cookie` only (see
 *  transport/trpc/trpc.ts). */
const authCsrfGuard: MiddlewareHandler<PrincipalEnv> = async (c, next) => {
  const principal = c.get("principal");
  if (principal === null) {
    return c.body(null, UNAUTHORIZED);
  }
  if (principal.via !== "header" && !hasCsrfHeader(c.req.raw.headers)) {
    return c.body(null, FORBIDDEN);
  }
  return await next();
};

/** A `hono/body-limit` belt that returns a 413 (rather than throwing an HTTPException, which the app's
 *  observability onError would flatten to a 500). */
function bodyCap(maxBytes: number): ReturnType<typeof bodyLimit> {
  return bodyLimit({ maxSize: maxBytes, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) });
}

/** Register `POST /api/assets/upload` + `POST /api/import` on `app`. Each: auth-first → CSRF → body cap → handler. */
export function registerUpload(app: Hono<PrincipalEnv>, deps: UploadDeps): void {
  app.post(ASSET_UPLOAD_ROUTE, authCsrfGuard, bodyCap(ASSET_UPLOAD_MAX_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const form = await c.req.formData();
    const file = form.get(UPLOAD_FIELD);
    if (!(file instanceof File)) {
      return c.json({ error: `missing "${UPLOAD_FIELD}" upload` }, BAD_REQUEST);
    }
    const kind = assetKindSchema.safeParse(form.get(KIND_FIELD));
    if (!kind.success) {
      return c.json({ error: `invalid "${KIND_FIELD}" — expected an AssetKind` }, BAD_REQUEST);
    }
    const mime = file.type.length > 0 ? file.type : FALLBACK_MIME;
    // An image upload obeys the TIGHTER of the route cap and the admin-tunable maxImageBytes; a non-image
    // kind (document/plugin bundle) keeps the fixed route cap. Keyed on the mime family the store's magic
    // sniff verifies anyway, so the cap matches the bytes actually being stored.
    const maxBytes = mime.startsWith(IMAGE_MIME_PREFIX) ? Math.min(ASSET_UPLOAD_MAX_BYTES, deps.maxImageBytes()) : ASSET_UPLOAD_MAX_BYTES;
    const stored = await deps.assets.store({
      principal,
      bytes: await fileBytes(file),
      kind: kind.data,
      mime,
      enforceMagic: true,
      maxBytes,
    });
    return c.json(stored);
  });

  // The databank doc-upload route: a single source document → databank.upload (CAS store → extract → row →
  // enqueue ingest). Same belts as the asset route (auth → CSRF → body cap). `name` field falls back to the
  // uploaded filename; the store's own `maxBytes`/magic-sniff run inside databank.upload's assets.store call.
  app.post(DATABANK_UPLOAD_ROUTE, authCsrfGuard, bodyCap(DATABANK_UPLOAD_MAX_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const form = await c.req.formData();
    const file = form.get(UPLOAD_FIELD);
    if (!(file instanceof File)) {
      return c.json({ error: `missing "${UPLOAD_FIELD}" upload` }, BAD_REQUEST);
    }
    // The static bodyCap belt is the route ceiling; the admin override may only TIGHTEN below it, enforced
    // per-request against the effective cap (a File carries its byte size, so no full read is needed to reject).
    if (file.size > deps.maxDatabankBytes()) {
      return c.body(null, PAYLOAD_TOO_LARGE);
    }
    const nameField = form.get(NAME_FIELD);
    const name = typeof nameField === "string" && nameField.length > 0 ? nameField : file.name;
    const result = await deps.databank.upload({
      principal,
      bytes: await fileBytes(file),
      mime: file.type.length > 0 ? file.type : FALLBACK_MIME,
      name: name.length > 0 ? name : "document",
    });
    return c.json(result);
  });

  // #1598 — the explicit restore. ONE card file, the same belts as the batch import (auth → CSRF → body cap).
  // Every refusal (unreadable card, no embedded book, no character imported from these exact bytes) comes back
  // as the verb's own operator-facing sentence with a 400, never a throw: the door renders what the domain said.
  app.post(LOREBOOK_RESTORE_ROUTE, authCsrfGuard, bodyCap(IMPORT_MAX_TOTAL_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const form = await c.req.formData();
    const file = form.get(UPLOAD_FIELD);
    if (!(file instanceof File)) {
      return c.json({ error: `missing "${UPLOAD_FIELD}" card upload` }, BAD_REQUEST);
    }
    const outcome = await runCardLorebookRestore({
      principal,
      character: deps.character,
      assets: deps.assets,
      tag: deps.tag,
      worldInfo: deps.worldInfo,
      file: { bytes: await fileBytes(file), filename: file.name },
    });
    return outcome.ok ? c.json(outcome) : c.json(outcome, BAD_REQUEST);
  });

  app.post(IMPORT_ROUTE, authCsrfGuard, bodyCap(IMPORT_MAX_TOTAL_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const form = await c.req.formData();
    const files: ImportFile[] = await Promise.all(
      form
        .getAll(UPLOAD_FIELD)
        .filter((entry): entry is File => entry instanceof File)
        .map(async (file) => ({ bytes: await fileBytes(file), filename: file.name })),
    );
    if (files.length === 0) {
      return c.json({ error: `no "${UPLOAD_FIELD}" card uploads` }, BAD_REQUEST);
    }
    const result: ProfileImportResult = await runProfileImport({
      principal,
      character: deps.character,
      assets: deps.assets,
      tag: deps.tag,
      worldInfo: deps.worldInfo,
      files,
    });
    return c.json(result);
  });
}
