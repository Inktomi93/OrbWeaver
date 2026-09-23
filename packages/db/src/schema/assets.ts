// schema/assets — the content-addressed asset INDEX (producer: domain/assets). Per ledger D21 assets are
// PER-USER (single-owned), reversing neo's global+hash-deduped model: every row carries `ownerId` (FK
// users) and the dedup key is the COMPOSITE `unique(owner_id, hash)` — a user's two characters sharing an
// avatar collapse to one of THEIR blobs; cross-user physical dedup is dropped on purpose (no shared bytes,
// no existence oracle, no leak). The CAS bytes live in `infra/storage` keyed `<owner>/<ab>/<cd>/<hash>`;
// this table is the metadata index the domain keeps coherent with the blob store.
//
// `kind` DERIVES the canonical `ASSET_KINDS` tuple from `@orb/contracts/assets` (the ONE home — the db
// enum, the upload route, and the client all derive from it; §7.5 `no-inline-union-redecl`); the column
// never re-spells the union, and a tuple-built CHECK enforces it at the SQL level (a test-mirror pins db
// === contracts).

import { ASSET_KINDS } from "@orb/contracts/assets";
import type { AssetId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { users } from "./users.ts";

// CHECK list derived from the canonical tuple (NOT re-spelled): `kind in ('card', 'avatar', 'export')`.
const ASSET_KIND_CHECK_LIST = checkList(ASSET_KINDS);

export const assets = sqliteTable(
  "assets",
  {
    // TypeID PK (`asset_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<AssetId>().primaryKey(),
    // The single-owned partition key (D21). User hard-delete cascades their blobs' index rows.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ASSET_KINDS }).notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    // sha-256 of the blob bytes = the CAS key. A card PNG's hash doubles as `characters.importHash`.
    hash: text("hash").notNull(),
    // A STORED byte-fact: `isAnimated(bytes)` computed ONCE at store time so the
    // gallery grid + variant pipeline read it without re-sniffing. GIF ⇒ true, APNG (acTL), animated WebP.
    // Drives `resolveVariant`'s bailout (don't downscale an animated asset — sharp drops animation).
    animated: integer("animated", { mode: "boolean" }).notNull().default(false),
    // The other STORED byte-facts from the same store-time sniff: header-parsed pixel dimensions, so a
    // render surface can RESERVE the image's true box before the bytes arrive (#625, the reservation half
    // of #622) without decoding anything. NULLABLE on purpose and NOT a defect: a non-image asset (a zip,
    // a pdf), an unrecognized signature, and a truncated header all legitimately have no dimensions — the
    // render side falls back to the `auto 16 / 9` placeholder, which is correct, just not reserved.
    // Pre-#625 rows are NULL for the same reason (no backfill: the fallback already handles them).
    width: integer("width"),
    height: integer("height"),
    uploadedAt: integer("uploaded_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // D21 — within-user dedup: the SAME bytes can exist once per owner (was a bare global `hash` unique).
    uniqueIndex("assets_owner_hash_unique").on(table.ownerId, table.hash),
    check("assets_kind_check", sql.raw(`kind in (${ASSET_KIND_CHECK_LIST})`)),
    // #1378 item 1 — the PHYSICAL floor under what the writers already refuse to produce. `size` is a
    // buffer length and `width`/`height` are header-parsed pixel counts; a negative one is not a small
    // image, it is a corrupt row, and a zero-dimension one is an image with no pixels. NULL stays legal
    // for the dimensions (a zip, a pdf, an unrecognized signature — see the column comment); the CHECK
    // constrains only the values that ARE present, which is what `is null or` buys.
    check("assets_measurements_check", sql.raw("size >= 0 and (width is null or width > 0) and (height is null or height > 0)")),
  ],
);
