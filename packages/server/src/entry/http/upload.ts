// The multipart ingest registrar. Two mutating byte-ingest routes; app.ts resolves the Principal and
// derives the CSRF signal but does not gate on it, so each route enforces the belts itself: auth first
// (401 before the body is read) → CSRF (403 on a cookie mutation missing the custom header) → a
// hono/body-limit stream cap (413 over-size, rejected before the whole body is buffered).
//   • POST /api/assets/upload — a single asset file → assets.store({ enforceMagic:true, maxBytes }).
//   • POST /api/poses/import — one OR many BYO OpenPose skeletons → assets.importPoses (honest-partial batch).
//   • POST /api/import — character-card file(s) → delegates to entry/import/run-profile-import.
//
// The import route accepts already-extracted card files; a profile ZIP / dir collection is a later wave.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { assetKindSchema } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AssetsService } from "#domain/assets";
import type { DatabankService } from "#domain/databank";
import { hasCsrfHeader } from "#infra/auth";
import type { ImportAssetPort, ImportCharacterPort, ImportFile, ImportTagPort, ImportWorldInfoPort, ProfileImportResult } from "../import";
import { runProfileImport } from "../import";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const FALLBACK_MIME = "application/octet-stream";
const ASSET_UPLOAD_ROUTE = "/api/assets/upload";
const POSE_IMPORT_ROUTE = "/api/poses/import";
const IMPORT_ROUTE = "/api/import";
const DATABANK_UPLOAD_ROUTE = "/api/databank/upload";
const UPLOAD_FIELD = "file";
const KIND_FIELD = "kind";
const NAME_FIELD = "name";
const CATEGORY_FIELD = "category";
const TAGS_FIELD = "tags";
// The `.png` (etc.) extension stripped from the uploaded filename → the pose's default name (the verb
// re-normalizes + falls back to "untitled" on a blank).
const FILENAME_EXT_RE = /\.[^./\\]+$/;

const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
// A single asset (avatar/gallery image). Also passed as the store's maxBytes belt, so an over-cap single
// field is rejected before the CAS write even if it slips the body cap.
const ASSET_UPLOAD_MAX_MIB = 64;
const ASSET_UPLOAD_MAX_BYTES = ASSET_UPLOAD_MAX_MIB * BYTES_PER_MIB;
const IMPORT_MAX_MIB = 256;
const IMPORT_MAX_BYTES = IMPORT_MAX_MIB * BYTES_PER_MIB;
// A single source document (txt/md/pdf/html). The design's upload size cap (databank-design/02 §6, LEAN
// 20 MB); also the store's maxBytes belt on the CAS write.
const DATABANK_UPLOAD_MAX_MIB = 20;
const DATABANK_UPLOAD_MAX_BYTES = DATABANK_UPLOAD_MAX_MIB * BYTES_PER_MIB;
// A BYO pose BATCH — N skeleton PNGs (each runs tens–hundreds of KB; the verb caps each item at 16 MiB). The
// body cap is the whole-batch belt; a per-item over-cap is refused inside importPoses (honest-partial).
const POSE_IMPORT_MAX_MIB = 128;
const POSE_IMPORT_MAX_BYTES = POSE_IMPORT_MAX_MIB * BYTES_PER_MIB;

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

/** The pose-import verb slice the `/api/poses/import` route consumes — the full {@link AssetsService} is
 *  passed at compose, narrowed here to just the byte-ingest verb (bytes ride a multipart route, not tRPC). */
export interface ImportPosesPort {
  readonly importPoses: AssetsService["importPoses"];
}

export interface UploadDeps {
  /** Serves the asset-upload `store`, the import avatar-store (`ImportAssetPort`), and the BYO pose byte-ingest. */
  readonly assets: UploadAssetsPort & ImportAssetPort & ImportPosesPort;
  readonly character: ImportCharacterPort;
  readonly tag: ImportTagPort;
  /** So an imported card's `character_book` actually lands (without it embedded books are dropped). */
  readonly worldInfo: ImportWorldInfoPort;
  /** PD-136: the doc-ingest façade — the databank producer's binary front door (bytes → extract → chunk). */
  readonly databank: Pick<DatabankService, "upload">;
}

interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Auth-first + CSRF gate, run as middleware before the body-limit belt so an anonymous/cross-site caller
 *  is rejected before a single body byte is read. */
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
    const stored = await deps.assets.store({
      principal,
      bytes: await fileBytes(file),
      kind: kind.data,
      mime: file.type.length > 0 ? file.type : FALLBACK_MIME,
      enforceMagic: true,
      maxBytes: ASSET_UPLOAD_MAX_BYTES,
    });
    return c.json(stored);
  });

  // PD-136 the doc-ingest façade: a single source document → databank.upload (CAS store → extract → row →
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

  // BYO pose import (comfyui-control §4.12.2): N skeleton PNGs (single = a one-item batch) → assets.importPoses.
  // Same belts as the asset route (auth → CSRF → body cap). Per-file name defaults to the uploaded filename
  // (ext stripped); one `category` + `tags` (comma-list) apply to the whole batch. Magic-sniff + the 16-MiB
  // per-item cap run inside the verb, which is honest-partial (a bad skeleton drops with a reason, never the batch).
  app.post(POSE_IMPORT_ROUTE, authCsrfGuard, bodyCap(POSE_IMPORT_MAX_BYTES), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const form = await c.req.formData();
    const files = form.getAll(UPLOAD_FIELD).filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return c.json({ error: `no "${UPLOAD_FIELD}" pose uploads` }, BAD_REQUEST);
    }
    const categoryField = form.get(CATEGORY_FIELD);
    const category = typeof categoryField === "string" ? categoryField : "";
    const tagsField = form.get(TAGS_FIELD);
    const tags =
      typeof tagsField === "string"
        ? tagsField
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [];
    const items = await Promise.all(
      files.map(async (file) => ({
        bytes: await fileBytes(file),
        mime: file.type.length > 0 ? file.type : FALLBACK_MIME,
        name: file.name.replace(FILENAME_EXT_RE, ""),
        category,
        ...(tags.length > 0 ? { tags } : {}),
      })),
    );
    return c.json(await deps.assets.importPoses({ principal, items }));
  });

  app.post(IMPORT_ROUTE, authCsrfGuard, bodyCap(IMPORT_MAX_BYTES), async (c) => {
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
