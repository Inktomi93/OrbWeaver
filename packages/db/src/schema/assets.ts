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
import { users } from "./users";

// CHECK list derived from the canonical tuple (NOT re-spelled): `kind in ('card', 'avatar', 'export')`.
// A CHECK is static DDL and cannot carry bound parameters, so it is built as a raw fragment.
const ASSET_KIND_CHECK_LIST = ASSET_KINDS.map((kind) => `'${kind}'`).join(", ");

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
    // A STORED byte-fact (gallery-design §3, G2): `isAnimated(bytes)` computed ONCE at store time so the
    // gallery grid + variant pipeline read it without re-sniffing. GIF ⇒ true, APNG (acTL), animated WebP.
    // Drives `resolveVariant`'s bailout (don't downscale an animated asset — sharp drops animation).
    animated: integer("animated", { mode: "boolean" }).notNull().default(false),
    uploadedAt: integer("uploaded_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // D21 — within-user dedup: the SAME bytes can exist once per owner (was a bare global `hash` unique).
    uniqueIndex("assets_owner_hash_unique").on(table.ownerId, table.hash),
    check("assets_kind_check", sql.raw(`kind in (${ASSET_KIND_CHECK_LIST})`)),
  ],
);
