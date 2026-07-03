// entry/http/upload — the multipart ingest registrar (core/Tier-5-Entry.md §layout "upload.ts"). Two routes,
// both auth+CSRF-gated mutating writes (app.ts resolves the `Principal` + enforces CSRF before these run):
//   • POST /api/assets/upload  — a single asset file → `assets.store({ enforceMagic:true })` → StoredAsset.
//   • POST /api/import         — character-card file(s) → DELEGATES to `entry/import/run-profile-import`
//                                (DECISIONS-LEDGER §7 D3 — the route never re-implements the import flow).
//
// `enforceMagic:true` on the asset upload is the user-upload boundary belt (a mislabeled
// binary is rejected before it reaches CAS). The import route trusts the import flow's own card parse, so
// it does NOT enforce magic (the bytes are validated as a card, not by mime).
//
// SCOPE: the import route accepts already-extracted card FILES. A profile ZIP / dir collection (the loader
// subsystem) is a later wave — see the DEFER(promotion) FLAG[PD-77] note in run-profile-import.ts.

import type { AssetKind, StoredAsset } from "@orb/contracts/assets";
import { assetKindSchema } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { Hono } from "hono";
import type {
  ImportAssetPort,
  ImportCharacterPort,
  ImportFile,
  ImportTagPort,
  ProfileImportResult,
} from "../import";
import { runProfileImport } from "../import";

const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;
const FALLBACK_MIME = "application/octet-stream";
const ASSET_UPLOAD_ROUTE = "/api/assets/upload";
const IMPORT_ROUTE = "/api/import";
const UPLOAD_FIELD = "file";
const KIND_FIELD = "kind";

/** The `assets` front-door slice the asset-upload route consumes (the full {@link StoredAsset} result —
 *  a superset of {@link ImportAssetPort}'s `{assetId}`, so one handle serves both routes). */
export interface UploadAssetsPort {
  readonly store: (params: {
    readonly principal: Principal;
    readonly bytes: Uint8Array;
    readonly kind: AssetKind;
    readonly mime: string;
    readonly enforceMagic?: boolean;
  }) => Promise<StoredAsset>;
}

export interface UploadDeps {
  /** Serves both the asset-upload `store` and (narrowed to `ImportAssetPort`) the import avatar-store. */
  readonly assets: UploadAssetsPort & ImportAssetPort;
  /** The character create/dedup ops the import driver wires (passed through to run-profile-import). */
  readonly character: ImportCharacterPort;
  /** The tag carry op the import driver wires (the `card.tags` → card/pending junction rows). */
  readonly tag: ImportTagPort;
}

/** The request-context shape `app.ts` populates: the resolved caller (or `null` when anonymous). */
interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/** Read a `File` field's bytes (web `File` is a global on Node 24). */
async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Register `POST /api/assets/upload` + `POST /api/import` on `app`. */
export function registerUpload(app: Hono<PrincipalEnv>, deps: UploadDeps): void {
  app.post(ASSET_UPLOAD_ROUTE, async (c) => {
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
    });
    return c.json(stored);
  });

  app.post(IMPORT_ROUTE, async (c) => {
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
      files,
    });
    return c.json(result);
  });
}
