---
kind: spec
status: active
updated: 2026-07-03
---

# Orbweaver — `gallery` (media surfaces)

> **Status: COMMITTED (D49, full scope). Promoted from `proposed/media-surfaces/`. Phase 7 (server) / Phase 6 (client).**
> Authoritative expansion of D49 item (2). The ledger D-entry wins on any conflict with this doc.
> Source proposal: `proposed/media-surfaces/media-surfaces.md`.
> **Authoritative build design: [`../proposed/gallery-design.md`](../proposed/gallery-design.md) — wins on detail; this file remains the committed decision record.**

---

## 0. What this IS (and isn't)

**None of these three surfaces is a new domain.** They are thin additions to substrate that already exists:

| Surface                            | Home                                                                            | New domain?             | New DB?                 |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| Gallery v1                         | `listOwned` read verb in `domain/assets` + Phase-6 `@orb/ui` grid               | **No**                  | No                      |
| Gallery v2 (curated per-character) | `"gallery"` `AssetKind` + `gallery_items` table                                 | **No** (still `assets`) | **Yes — one new table** |
| Server thumbnails                  | already built: `assets.resolveVariant` + `infra/image`; add a small ladder rung | **No**                  | No                      |
| Animated-detect                    | pure byte-sniff in `assets/substrate/mime.ts`                                   | **No**                  | No                      |
| Token-counter panel                | pure Phase-6 client over `@orb/kit/tokens` `n`                                  | **No**                  | No                      |

This doc (originally homed under the now-gutted `domains/`) describes additions to `domain/assets` and
client surfaces, not a separate domain.

---

## 1. Gallery

### 1.1 How ST does it (source-grounded)

Per-character image-grid browser. Client (`extensions/gallery/index.js`) POSTs `/api/images/list` with
folder/sort, renders via `nanogallery2` jQuery lib. Upload = `saveBase64AsFile`. Server: images are **loose
files** under `user/images/<folder>/` — NOT content-addressed, no dedup, no DB. Virtual folders + per-image
metadata (hash/aspectRatio/isAnimated/dominantColor) live in a JSON sidecar `image-metadata.json`.

**The mismatch:** ST's gallery is a _file-library_ concept (arbitrary user uploads, folders, sidecar metadata).
Orbweaver's `assets` is a content-addressed index whose `kind ∈ {card, avatar, export}` — no "user media
library" concept exists yet. Gallery v1 is a pure read-view over what `assets` already holds; v2 is a real
curated-media feature that needs new owned state.

**neo:** cut entirely. orbweaver is a ground-up re-introduction.

### 1.2 Gallery v1 — a read verb in `domain/assets`

Add `listOwned` to `domain/assets` (owner-scoped off `principal.userId`, optional `kind` filter,
paged/sorted by `uploadedAt`) + a Phase-6 `@orb/ui` grid that renders `blobUrl(hash)` thumbnails via `?w=`.
No DB change. Surfaces exactly what assets already holds (a user's cards/avatars/generated images).

```ts
// domain/assets/contract/views.ts
interface AssetListItem {
  readonly assetId: AssetId;
  readonly hash: string; // → blobUrl(hash) + ?w= for thumbnail
  readonly kind: AssetKind;
  readonly mime: string;
  readonly size: number;
  readonly uploadedAt: number;
  readonly animated: boolean; // from §3 sniff (lets the grid skip ?w= for animated)
}
interface ListOwnedParams extends AssetsActorParams {
  readonly kind?: AssetKind;
  readonly limit: number;
  readonly cursor?: number; // uploadedAt-keyed paging
}
// AssetsService.listOwned: (params) => Promise<AssetListItem[]>
```

**Gates:** the `listOwned` verb rides the existing assets gates (owner-scoped query in `persistence/`,
`test-presence` for the verb, `types-in-contract` for the view).

### 1.3 Gallery v2 — curated per-character media (full scope, needs a ledger call on timing)

ST-style galleries (arbitrary uploads, per-character, foldered) need new owned state. Born-compliant shape:

1. A new `ASSET_KINDS` member `"gallery"` (add to the tuple in `@orb/contracts/assets`; DB CHECK derives from it — `no-inline-union-redecl`)
2. A per-type association: a `gallery_items` table (single-owned: `ownerId` + `fetchOwned`) with a nullable `subjectCharacterId` FK (D24 — no polymorphic `(entityType, entityId)` ref)

```ts
// @orb/db/schema/gallery.ts
export const galleryItems = sqliteTable(
  "gallery_items",
  {
    id: text("id").$type<GalleryItemId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    subjectCharacterId: text("subject_character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "set null" }), // nullable: gallery item may be un-charactered
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("gallery_items_owner_idx").on(t.ownerId),
    index("gallery_items_character_idx").on(t.subjectCharacterId),
  ],
);
```

`assets` stays the byte index; `gallery_items` owns the user↔image↔character curation. ST's "virtual folders"
map to a future `tag`-junction, not a new store.

**Born-compliant gate:** the `"gallery"` kind + `gallery_items` table MUST be in the db baseline
(`0000_baseline`) if v2 is greenlit — do NOT bolt on later. If timeline requires, ship v1 and add v2 born-compliant in the same db pass.

---

## 2. Server thumbnails — additions to the existing variant pipeline

The thumbnail pipeline is `assets.resolveVariant` (snap → cache-read → transform-via-sharp → cache-put over
the `BLOB_WIDTHS` ladder). This is **already server thumbnailing** with sharp. Additions:

1. **Add a thumbnail rung** to `BLOB_WIDTHS` in `domain/assets/substrate/variant-policy.ts` so the gallery
   grid asks for `?w=<thumb>` and gets a cached webp. (One-line policy change; ladder already bounds the
   variant keyspace as a DoS defense.)
2. **Animated bailout in `resolveVariant`:** if the source is animated, skip the transform and return the
   original bytes (ST's behavior — sharp's webp encoder drops animation). Needs §3.

No infra change, no new verb, no DB. Keeps sharp out of `entry/`.

---

## 3. Animated-detect — pure byte-sniff in `assets/substrate/mime.ts`

Animation detection is **pure byte inspection** — no sharp, no I/O. Sibling to the existing `sniffMime`:

```ts
// domain/assets/substrate/mime.ts
export function isAnimated(bytes: Uint8Array): boolean;
// GIF ⇒ always animated
// APNG ⇒ acTL chunk present in first 200 bytes
// WebP ⇒ ANIM/ANMF chunk present
// Otherwise ⇒ false
```

**Do NOT route this through `infra/image`'s sharp probe.** That couples a pure 4-byte-signature check to an
infra decode — wasteful and wrong. Keep the sniff pure and domain-side; `resolveVariant` calls it to decide
whether to bail.

**Promotion criterion** (mirrors the `sniffMime` deferral already on record in `assets.md`): keep in
`assets/substrate` while only the server consumes it; promote to `@orb/kit/assets` iff the client ever
needs to pre-detect an animated upload before sending.

---

## 4. Token-counter panel — pure Phase-6 client, zero server

No domain, no verb, no DB, no new contract. The panel is a Phase-6 `@orb/ui` surface that calls
`n` (`@orb/kit/tokens`) directly on the client — `kit` is isomorphic, already client-importable, and neo
already did exactly this (`token-counter.tsx`).

**No tokenizer zoo, no chunk/ID display.** The per-model tokenizer zoo is `BY-DESIGN-OUT` (gap-register §1/§6).
The panel shows:

- The estimate (`n(text)`) — the honest cross-model number
- Optionally, the provider `usage` truth captured post-turn (already in chat data — reading existing state, not a new server surface)

```ts
// Phase-6 client only — direct kit call:
import { n } from "@orb/kit/tokens";
const estimate = n(pastedText); // advisory
```

---

## 5. Sequencing

| Bit                                                    | When                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `assets.listOwned` verb + `AssetListItem` view         | with the assets GC/backfill wave (server)               |
| `isAnimated` sniff + `resolveVariant` animated bailout | same assets wave                                        |
| `BLOB_WIDTHS` thumbnail rung                           | same assets wave                                        |
| Gallery v2 (`"gallery"` kind + `gallery_items` table)  | born-compliant in the contracts/db pass if greenlit     |
| Gallery grid UI (v1)                                   | Phase-6 client (`@orb/ui` over `listOwned` + `blobUrl`) |
| Token-counter panel                                    | Phase-6 client (any time Phase-6 client work starts)    |

---

## 6. Open questions

1. **Gallery v2 timing:** Is the want "see my avatars/cards in a grid" (v1, free) or ST's curated per-character media library (v2, new table + kind)? Recommend v1 now; v2 only when there's a real product need.
2. **Token-counter live-chat mode?** Show provider `usage` alongside estimate when counting the current chat? Cheap (reads existing chat data) but couples the panel to chat — defer to Phase-5/6 boundary.
3. **`isAnimated` kit promotion?** Keep domain-side until the client needs pre-send detection.

---

## 7. Cross-refs

- `domains/assets.md` — the CAS index/byte-store split, the variant pipeline, the avatar-ref registry,
  the deferred `sniffMime`→kit promotion (the model for `isAnimated`), D21 per-user ownership
- `Core-Legacy-Migration-and-Gaps.md` §2 (gallery, thumbnails MODERATE), §4 (token-counter TRIVIAL),
  §6 (tokenizer zoo BY-DESIGN-OUT), §7 (cheap-wins list)
- `Core-0-Architecture-and-Structure.md` — the cake, 8-slot template, `infra` db-free rule, gate catalog
- `UI-Architecture-and-Layout.md` / D42 — Phase-6 `@orb/ui` + Base UI (where the grid + panel surfaces live)
- `proposed/media-surfaces/media-surfaces.md` — the full evidence base (ST source audit, neo findings)
