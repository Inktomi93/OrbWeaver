---
kind: spec
status: active
updated: 2026-07-03
---

# Gallery & Media Surfaces — the build design

> **Status: COMMITTED (D49 item 2, full scope; gallery v2 reserved under FLAG[PD-55]).** The ledger
> D49 entry is the decision record and wins on any conflict; `domains/gallery.md` remains the
> committed decision record and this doc is its authoritative build-grade expansion (wins on
> detail). Also folds in the marinara residue row **B4** (gif external-search proxy —
> `Marinara-Residue-Non-RPG.md` §1) and homes the **B5a** remote-fetch prerequisite paragraph (§6).
> Server bits are additive to the BUILT `domain/assets` (Phase 4c); client bits are Phase 6;
> v2 + gif import are Phase 7. Source evidence: the ST source audit in the retired
> `proposed/media-surfaces/media-surfaces.md` (git history at the promotion commit).

---

## 0. What this IS (and isn't)

**None of these surfaces is a new domain.** They are thin additions to substrate that already exists:

| Surface                            | Home                                                                            | New domain?             | New DB?                 |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------- | ----------------------- |
| Gallery v1                         | `listOwned` read verb in `domain/assets` + Phase-6 `@orb/ui` grid               | **No**                  | No                      |
| Gallery v2 (curated per-character) | `"gallery"` `AssetKind` + `gallery_items` table                                 | **No** (still `assets`) | **Yes — one new table** |
| Server thumbnails                  | already built: `assets.resolveVariant` + `infra/image`; add a small ladder rung | **No**                  | No                      |
| Animated-detect                    | pure byte-sniff in `assets/substrate/mime.ts`                                   | **No**                  | No                      |
| Token-counter panel                | pure Phase-6 client over `@orb/kit/tokens` `n`                                  | **No**                  | No                      |
| Gif search + import (B4)           | two verbs in `domain/assets` over an `infra/network` adapter (§5)               | **No**                  | No                      |

The `ASSET_KINDS` tuple (`@orb/contracts/assets`) is the one growth point several committed designs
touch: `card | avatar | export` (built) + `"generated"` (imagery, D49 #1) + `"gallery"` (this doc,
v2) + `"document"` (databank, D49 #5) + `"sprite"` (expressions-design 01 §3) + `"plugin"`
(plugin-design 02, the bundle-in-CAS kind). One tuple, one home — every addition is a one-line
append (`no-inline-union-redecl`); the db CHECK derives from it. This is the CONSOLIDATED member
roster — a sibling design set showing a shorter tuple is illustrating its own append, not the list.

---

## 1. Gallery

### 1.1 How ST does it (source-grounded)

Per-character image-grid browser. Client (`extensions/gallery/index.js`) POSTs `/api/images/list`
with folder/sort, renders via `nanogallery2`. Server: images are **loose files** under
`user/images/<folder>/` — not content-addressed, no dedup, no DB; per-image metadata
(hash/aspectRatio/isAnimated/dominantColor) lives in a JSON sidecar. **The mismatch:** ST's gallery
is a file-library concept; orbweaver's `assets` is a content-addressed owned index. Gallery v1 is a
pure read-view over what `assets` already holds; v2 is a real curated-media feature that needs new
owned state. **neo:** cut entirely — this is a ground-up re-introduction.

### 1.2 Gallery v1 — a read verb in `domain/assets`

Add `listOwned` to `domain/assets` (owner-scoped off the actor, optional `kind` filter, keyset-paged)
plus a Phase-6 `@orb/ui` grid rendering `blobUrl(hash)` thumbnails via `?w=`. No DB change.

```ts
// domain/assets/contract/views.ts
interface AssetListItem {
  readonly assetId: AssetId;
  readonly hash: string; // → blobUrl(hash) + ?w= for the thumbnail
  readonly kind: AssetKind;
  readonly mime: string;
  readonly size: number;
  readonly uploadedAt: number;
  readonly animated: boolean; // from §3 sniff (grid skips ?w= for animated)
}
interface ListOwnedParams extends AssetsActorParams {
  readonly kind?: AssetKind;
  readonly limit: number; // clamp 1..100 at the wire (zod)
  readonly cursor?: number;   // uploadedAt of the last row of the previous page
  readonly cursorId?: AssetId; // id of that same row — the tiebreak key (pass both or neither)
}
// AssetsService.listOwned: (params) => Promise<AssetListItem[]>
```

**Paging contract (keyset, not offset).** Sort is `ORDER BY uploadedAt DESC, id DESC` — `id` is the
deterministic tiebreak because bulk import stamps many rows with the same `uploadedAt` millisecond.
The cursor is the `(uploadedAt, id)` pair of the last item of the previous page; the predicate is
`uploadedAt < :cursor OR (uploadedAt = :cursor AND id < :cursorId)`. The client derives the next
cursor from the last `AssetListItem` it holds (both fields are on the view), so the return type stays
a plain array — no page envelope. End-of-list = a short page. WHY keyset: offset paging skips or
duplicates rows when uploads/GC land between pages; WHY the two-field cursor instead of an opaque
composite string: it keeps the committed `cursor?: number` field shape and stays greppable/debuggable.
*Rejected:* offset/`page` param (drift under concurrent writes); an encoded opaque cursor (nicer API
surface, but changes the committed param type for zero behavioral gain at this scale).

**The grid's data needs — `AssetListItem` is deliberately sufficient:** `hash` (thumbnail URL),
`animated` (render the original, not a `?w=` variant), `kind` (filter chips), `mime` (format badge),
`uploadedAt` (sort + date group headers), `size` (detail tooltip), `assetId` (stable React key +
detail/curation navigation). Nothing else — no dominantColor/aspectRatio sidecar metadata (ST's);
the grid reserves square cells and lazy-loads, so aspect metadata buys nothing. Add a field only when
a real Phase-6 surface demands it. The grid virtualizes via TanStack Virtual (`UI-Lib-TanStack-Virtual.md`).

**Gates:** rides the existing assets gates — owner-scoped query in `persistence/`, `test-presence`
for the verb, `types-in-contract` for the view. Note `contract/views.ts` is a new (legal) slot file
in the assets 8-slot layout, and `AssetsService` grows from 7 verbs to 8 — `domains/assets.md` takes
a one-line delta when this lands.

**Test plan:**
- Owner-scope: seed assets for users A and B; A's `listOwned` never returns a B row (any filter).
- Kind filter: `kind: "avatar"` returns only avatars; omitted kind returns all kinds.
- Paging boundary: ≥3 rows sharing one `uploadedAt`; walk pages of 2 with `(cursor, cursorId)` and
  assert no skip, no duplicate, stable total order.

### 1.3 Gallery v2 — curated per-character media (FLAG[PD-55], reserved shape)

ST-style galleries (arbitrary uploads, per-character, foldered) need new owned state. Born-compliant
shape, committed by D49:

1. A new `ASSET_KINDS` member `"gallery"` (append to the tuple in `@orb/contracts/assets`; the DB
   CHECK derives from it — `no-inline-union-redecl`).
2. A per-type association: a `gallery_items` table with a nullable `subjectCharacterId` FK (D24 —
   no polymorphic `(entityType, entityId)` ref). **Ownership DERIVES through the required
   `assetId` FK — no stamped `ownerId` column** (Nate ruling, 2026-07-01, resolving old review
   flag 1; D23 derive-don't-stamp — the `character_tags`/`duplicate_pairs` precedent, both of
   which had `ownerId` dropped for the same reason: a required FK to an owned row makes the owner
   always derivable, and stamping creates a guardable mismatch state). D49's "single-owned
   `gallery_items`" wording is superseded by this ruling on the stamping mechanics only — the row
   remains conceptually personal curation; its owner is `assets.ownerId`, one join away.

```ts
// @orb/db/schema/gallery.ts
export const galleryItems = sqliteTable(
  "gallery_items",
  {
    id: text("id").$type<GalleryItemId>().primaryKey(),
    // NO ownerId — D23: owner derives via assets.ownerId (required FK below)
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    subjectCharacterId: text("subject_character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "set null" }), // nullable: item may be un-charactered
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("gallery_items_asset_subject_unique").on(t.assetId, t.subjectCharacterId),
    index("gallery_items_character_idx").on(t.subjectCharacterId),
  ],
);
```

(SQLite treats NULL `subjectCharacterId` rows as distinct under the unique index, so duplicate
un-charactered adds remain possible — acceptable: harmless, and `addToGallery` can upsert-guard;
a `WHERE subject_character_id IS NULL` partial unique index is the tightening if it ever matters.)

`assets` stays the byte index; `gallery_items` owns the user↔image↔character curation. ST's
"virtual folders" map to a future `tag`-junction, not a new store.

**The verb surface (three verbs, still `domain/assets`).** Wire shapes in `@orb/contracts/assets`
(the client gallery calls these via tRPC — cross-boundary per §7.4):

```ts
// @orb/contracts/assets
export const galleryAddParamsSchema = z.object({
  assetId: assetIdSchema,
  subjectCharacterId: characterIdSchema.optional(),
});
export const galleryListParamsSchema = z.object({
  subjectCharacterId: characterIdSchema.optional(), // omitted = the whole gallery
  limit: z.number().int().min(1).max(100),
  cursor: z.number().int().optional(),   // createdAt keyset — same contract as §1.2
  cursorId: galleryItemIdSchema.optional(),
});
export const galleryItemViewSchema = z.object({
  galleryItemId: galleryItemIdSchema,
  assetId: assetIdSchema,
  hash: z.string(),
  mime: z.string(),
  animated: z.boolean(),
  subjectCharacterId: characterIdSchema.nullable(),
  createdAt: z.number().int(),
});
```

```ts
// AssetsService additions (verbs/gallery.ts; persistence stays the only db writer)
addToGallery(params: GalleryAddParams & AssetsActorParams): Promise<GalleryItemView>
removeFromGallery(params: { galleryItemId: GalleryItemId } & AssetsActorParams): Promise<void>
listGallery(params: GalleryListParams & AssetsActorParams): Promise<GalleryItemView[]>
```

**`can()` posture: owner-only in v1.** `addToGallery` requires the asset AND the subject character
(when given) to be `fetchOwned` by the actor — a gallery row must never reference another user's
asset or character; `removeFromGallery` resolves the item's owner THROUGH the asset join
(`gallery_items → assets.ownerId`) and rejects a non-owner; `listGallery` ("list my gallery") is
the same join filtered on `assets.ownerId = actor` — there is no stamped owner column to scope on. WHY:
assets sit beneath the host/member permission model (D21 — single-owned, one narrow avatar
exception), and a curated gallery is personal curation, not chat state. *Rejected:* roster-member
read access to a character's gallery — that would extend the D21 avatar exception to arbitrary
blobs; if a "show my character's gallery to the room" want ever materializes, it's a new D-entry,
not a default.

**Born-compliant gate:** the `"gallery"` kind + `gallery_items` table MUST be in the db baseline
(`0000_baseline`) if v2 is greenlit while the baseline is still open — do NOT bolt on later. If
PD-55 is greenlit after the baseline freezes, it lands as a normal additive migration (the shape
above is reserved precisely so that stays clean).

**Test plan:**
- FK behavior: deleting the asset cascades the gallery row; deleting the character nulls
  `subjectCharacterId` (the item survives un-charactered).
- Ownership: `addToGallery` with another user's `assetId` (and with another user's
  `subjectCharacterId`) is rejected; B never sees A's items via `listGallery`.
- Filter: `subjectCharacterId` returns only that character's items; omitted returns all.

---

## 2. Server thumbnails — additions to the existing variant pipeline

The thumbnail pipeline is `assets.resolveVariant` (snap → cache-read → transform-via-sharp →
cache-put over the `BLOB_WIDTHS` ladder) — **already server thumbnailing**. Additions:

1. **A thumbnail rung** in `BLOB_WIDTHS` (`domain/assets/substrate/variant-policy.ts`) so the grid
   asks `?w=<thumb>` and gets a cached webp. One-line policy change; the ladder already bounds the
   variant keyspace as a DoS defense (`assets.md` esoteric #2).
2. **Animated bailout in `resolveVariant`:** if the source is animated (§3), skip the transform and
   return the original bytes (ST's behavior — sharp's webp encoder drops animation). No cache write
   for the bailout: the original IS the response; caching a byte-identical copy under a variant key
   doubles storage for nothing.

No infra change, no new verb, no DB. Keeps sharp out of `entry/`.

**Test plan:** an animated GIF requested with `?w=` returns the original bytes with the original
Content-Type and writes no variant-cache entry; a static PNG on the same path returns the resized
webp (the existing ladder tests already cover snap behavior).

---

## 3. Animated-detect — pure byte-sniff in `assets/substrate/mime.ts`

Animation detection is **pure byte inspection** — no sharp, no I/O. Sibling to the existing `sniffMime`:

```ts
// domain/assets/substrate/mime.ts
export function isAnimated(bytes: Uint8Array): boolean;
// GIF  ⇒ always animated (treat every GIF as animated — a 1-frame GIF losing its
//         bailout costs nothing; frame-counting GIF blocks costs a parser)
// APNG ⇒ acTL chunk present in the first 200 bytes
// WebP ⇒ ANIM/ANMF chunk present
// else ⇒ false
```

**Do NOT route this through `infra/image`'s sharp probe.** That couples a 4-byte-signature check to
an infra decode — wasteful and wrong. `resolveVariant` calls it to decide the §2 bailout; `store`
computes it once so `AssetListItem.animated` is a stored fact, not a per-list re-sniff.

**Promotion criterion** (mirrors the `sniffMime` deferral on record in `assets.md`): keep in
`assets/substrate` while only the server consumes it; promote to `@orb/kit/assets` iff the client
ever needs to pre-detect an animated upload before sending. (See Review flags: the §6 guard may add
an infra consumer, which is a second promotion trigger the current criterion doesn't name.)

**Test plan:** signature goldens per format — GIF87a, GIF89a, APNG-with-acTL, static PNG, animated
WebP (ANIM), static WebP, JPEG, and a truncated/garbage buffer → all assert the exact boolean.

---

## 4. Token-counter panel — pure Phase-6 client, zero server

No domain, no verb, no DB, no new contract. A Phase-6 `@orb/ui` surface calling `n`
(`@orb/kit/tokens`) directly — `kit` is isomorphic, and neo did exactly this (`token-counter.tsx`).

**No tokenizer zoo, no chunk/ID display** (BY-DESIGN-OUT, gap-register §1/§6). The panel shows the
estimate (`n(text)` — the honest cross-model number) and, optionally, the provider `usage` truth
captured post-turn (existing chat data; see §7.2).

```ts
// Phase-6 client only — direct kit call:
import { n } from "@orb/kit/tokens";
const estimate = n(pastedText); // advisory
```

**Component note (the whole test surface):** a controlled textarea + a derived number — the only
behavior worth a test is debounced recomputation on paste; `n` itself is already covered by kit
tests. Do not add more.

---

## 5. External gif search + import (residue B4, folded in)

Marinara evidence (one-line): `gifs.routes.ts` `/search` — a thin proxy over a Tenor/Giphy-style
API keyed by `getGifApiKey`; clean fetch, zero generative coupling.

**Home: two verbs in `domain/assets`, over an injected `infra/network` adapter.** WHY: D49 #2 is
explicit that gallery is not a domain — there is no other server home; the import half is a CAS
write and `assets` owns the CAS index; and the domain-verb-over-injected-network-adapter pattern has
a built precedent (`credentials.fetchModels` → `infra/network/openai-models.ts`). *Rejected:* a new
leaf (`domain/media-import` or similar) — two verbs don't earn a domain; if B5 card-hub browsing is
ever greenlit, THAT is the moment a real remote-browse leaf exists and gif search migrates into it
(the resolution criterion, recorded here so nobody half-builds the leaf for gifs alone).

> **D61 delta (2026-07-01): the criterion FIRED.** B5 is committed (`hub-browse-design/`), so the
> remote-browse leaf exists at design time and the gif verbs land DIRECTLY in `domain/hub`
> (`verbs/gifs.ts`) — no build-then-migrate. Everything else in this section carries verbatim
> (wire contracts, allowlist, one-call store+curate, the credential label, the CSP note); the only
> mechanical change is that `assets.store` + the `gallery_items` insert are reached via injected
> ops. See `hub-browse-design/02` §5.

```ts
// @orb/contracts/assets — the wire shapes
export const gifSearchParamsSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(), // provider-opaque continuation token, passed through verbatim
});
export const gifSearchHitSchema = z.object({
  id: z.string(),                 // provider item id (opaque)
  previewUrl: z.string().url(),   // small preview the picker renders
  fullUrl: z.string().url(),      // the import target
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export const gifSearchResultSchema = z.object({
  hits: z.array(gifSearchHitSchema),
  nextCursor: z.string().optional(),
});
export const gifImportParamsSchema = z.object({
  url: z.string().url(),          // must match the configured provider's media-host allowlist
  subjectCharacterId: characterIdSchema.optional(),
});
```

```ts
// AssetsService additions (verbs/gif.ts)
searchGifs(params: GifSearchParams & AssetsActorParams): Promise<GifSearchResult>
importGif(params: GifImportParams & AssetsActorParams): Promise<GalleryItemView>
```

- **`searchGifs`** calls the injected provider adapter (`infra/network/gif-search.ts` — the one
  place that knows the provider's URL shape and response mapping) and returns normalized hits. The
  provider's continuation token rides `cursor` opaquely — no keyset here because the provider owns
  the ordering. The picker renders `previewUrl` directly (external loads): the search is an explicit
  owner action in an owner-only picker, not message content, so D44's `forbidExternalMedia` (a
  message/card render gate) does not govern it; the configured provider's media host is appended to
  the CSP `img-src` allowance when the feature is enabled. *Rejected:* server-proxying every preview
  — N× SSRF-guarded fetches + bandwidth per scroll of a picker, to protect against a host the user
  explicitly queried.
- **`importGif`** validates `url` against the provider media-host allowlist → fetches via the §6
  hardened fetch → `isAllowedImageBuffer` (magic + size cap) → `assets.store(bytes, "gallery",
  sniffedMime)` (through `storeBlob`, the one coherence writer) → inserts the `gallery_items` row →
  returns the `GalleryItemView`. One verb does store + curate because the user gesture is "add this
  gif to my gallery"; *rejected:* returning `StoredAsset` and making the client call `addToGallery`
  — a two-call dance whose failure mode is a torn state (imported but not in the gallery).
- **The imported asset's kind is `"gallery"`** — the exact kind v2 reserves; gif import therefore
  lands with-or-after the v2 schema (it's Phase 7 either way, see §8). WHY: `kind` is a
  use-class/provenance axis, format lives in `mime`. *Rejected:* a new `"gif"` kind — it conflates
  encoding with classification and grows the tuple per-format (an imported animated WebP would
  falsify it immediately).
- **Provider API key — LEAN: a labeled credential in `domain/credentials`** (a `gif-search` label,
  seeded the same way as the `openrouter` label — the env→labeled-credential a/seed pattern,
  `Spine-Config-and-Serialization.md` §7.2). It is a secret against a metered third-party API, which
  is exactly what the credentials domain exists for. *Flip criterion → AppSetting:* only if the
  chosen provider's key class is genuinely non-secret (a public client key with no quota/billing
  attached) — then it's a runtime toggle, not a credential.
- **Provider choice — LEAN: Tenor** (marinara's shape; free tier exists). The adapter seam is
  provider-shaped anyway; *flip criterion:* Tenor API terms/pricing changing — swap the one
  `infra/network` adapter, the wire contract is provider-agnostic.

**Test plan:**
- Adapter mapping golden: a canned provider response maps to the normalized `GifSearchHit[]`
  (+ cursor passthrough).
- Import allowlist: a `url` outside the provider media host is rejected before any fetch.
- Import validation: an oversized buffer and a non-image buffer (HTML error page with 200 status —
  the classic) are rejected by `isAllowedImageBuffer`; nothing reaches `storeBlob`.
- Happy path: a fixture gif imports → asset row (`kind: "gallery"`, `animated: true`) + gallery row
  in one call; re-importing the same bytes dedups onto the same hash (existing `storeBlob` semantics).

---

## 6. The remote-fetch prerequisite (residue B5a — this paragraph is its home)

Any feature that fetches a remote, user-influenced URL from the server is gated on a hardened fetch
pair in `infra/network`: **`safeFetch`** (SSRF posture — deny private/link-local/loopback ranges,
host allowlist, redirect discipline: re-validate every hop, cap the chain) and
**`isAllowedImageBuffer`** (content-type/magic-signature + size validation on the returned bytes —
never trust the remote Content-Type header). This is marinara-verified practice (residue B5: six
SSRF-guarded card-hub proxies all ride exactly this pair), and orbweaver already stages half of it —
`safeFetch` exists unwired in `infra/network/egress.ts` beside the boot-time egress firewall
(`Tier-3-Infra.md`, "the hardening seam for the first user-supplied-URL feature"). The guard gates:
**this doc's §5 gif import** (the first likely wiring), **databank's scraper verbs**
(`domains/databank.md` homes scrapers on `infra/network`), **remote card-hub browsing if B5 is ever
greenlit**, and **any server-side fetch of D44 external media** (`ThemeOverride` external URLs /
`allowedMediaPrefixes` — the client-side load path stays CSP-gated per `UI-Theming-and-Content.md`
§12.3, but the moment any of those URLs is fetched server-side — proxied, thumbnailed, imported to
CAS — it rides this same guard). The guard's actual design (allowlist config shape, redirect policy,
`isAllowedImageBuffer`'s format table) is an **`infra/network` work item, not this doc's** — this
doc only names it as the prerequisite and refuses to ship §5 without it.

> **D61 delta (2026-07-01): the work item is DESIGNED** —
> **[`hub-browse-design/01-network-guard.md`](hub-browse-design/01-network-guard.md)** is its
> authoritative spec (self-enforcing SSRF posture, required host allowlist, dimension caps, the
> `@orb/kit/image-sniff` home — which also resolves §10 review flag 2). G6 below ≡ that set's H1
> (one work item, one build).

---

## 7. Decisions and leans (formerly "open questions")

1. **Gallery v2 timing — DECIDED: v1 ships in Phase 6; v2 stays FLAG[PD-55]-gated to Phase 7.** The
   want "see my avatars/cards/generated images in a grid" is fully served by v1 at zero schema cost;
   v2 spends a table + a kind and earns it only when curation (uploads that aren't avatars,
   per-character albums, the §5 gif import target) is actually wanted. *Rejected:* building v2
   speculatively into the baseline "since we're in there" — the reserved shape above makes the
   later add clean, so pre-building buys nothing (and the born-compliant gate in §1.3 covers the
   case where PD-55 is greenlit while the baseline is still open).
2. **Token-counter live-chat mode — LEAN: v1 is pasted-text estimate only.** *Flip criterion:* the
   Phase-6 chat message view model already carries provider `usage` per turn — the moment it does,
   showing usage beside the estimate is a pure read of existing client state (zero new coupling)
   and ships; if it would require a new server surface, it stays out.
3. **`isAnimated` kit promotion — DECIDED (mirrors the committed `sniffMime` deferral):** stays
   `assets/substrate` until a client pre-send consumer exists. *Rejected:* promoting now "for
   symmetry" — kit residency is earned by a second consumer, not by aesthetics.

---

## 8. Sequencing (S/M/L chunks; every chunk lands green on its own)

| # | Chunk | Scope → checkpoint | Size | Depends on |
|---|---|---|---|---|
| G1 | `listOwned` + `AssetListItem` | verb + view + keyset paging; checkpoint: §1.2 test plan green | **S** | assets domain (BUILT) |
| G2 | animated sniff + bailout + rung | `isAnimated` + `resolveVariant` bailout + `BLOB_WIDTHS` rung; checkpoint: §2 + §3 goldens green | **S** | assets domain (BUILT); same wave as G1 |
| G3 | gallery v2 schema + verbs | `"gallery"` kind + `gallery_items` + the three §1.3 verbs; checkpoint: §1.3 test plan green | **M** | **PD-55 greenlight**; the db-baseline gate (§1.3) |
| G4 | gallery grid UI | `@orb/ui` virtualized grid over `listOwned` + `blobUrl` (+ curation controls when G3 exists) | **M** | Phase 6 client; G1 (v1 mode), G3 (curation mode) |
| G5 | token-counter panel | the §4 component | **S** | Phase 6 client; nothing else |
| G6 | hardened-fetch prerequisite | wire `safeFetch` + build `isAllowedImageBuffer` — **≡ `hub-browse-design` H1 (D61), designed at `hub-browse-design/01`; ONE work item, ONE build** | **M** | none (unblocks G7, databank scrapers, B5) |
| G7 | gif search + import | `infra/network/gif-search.ts` adapter + the two §5 verbs + the credential label + picker UI — **home is `domain/hub` per the §5 D61 delta (≡ `hub-browse-design` H7)**; checkpoint: §5 test plan green | **M** | G6 (hard), G3 (the `"gallery"` kind + row), the hub leaf (`hub-browse-design` H2), credentials label seed, G4 (the picker lives in the gallery surface) |

G1+G2 are the "assets wave" pair from the committed sequencing — additive server work shippable any
time. G3 is the only schema-bearing chunk and the only one behind a flag. G7 is the only chunk with
an infra prerequisite; it must not ship with a raw `fetch()` as a stopgap.

---

## 9. Cross-refs

- `domains/gallery.md` — the committed decision record this doc expands.
- `domains/assets.md` — the CAS index/byte-store split, `storeBlob`, the variant pipeline, the
  `sniffMime`→kit deferral (the model for `isAnimated`), D21 ownership.
- `Core-Laws-and-Precedents.md` — D49 #2 · D21 · D24 · D42 · D44.
- `Core-Legacy-Migration-and-Gaps.md` §2/§4/§6; `Core-SillyTavern-Feature-Map.md` §2d (PD-55 row).
- `core/Tier-3-Infra.md` — `infra/network/egress.ts` (`safeFetch`, the staged seam §6 wires).
- `proposed/Marinara-Residue-Non-RPG.md` §1 B4/B5; `domains/databank.md` (scrapers share the §6 guard).
- `UI-Theming-and-Content.md` §12.3 — `forbidExternalMedia`/`allowedMediaPrefixes` (why §5's picker
  previews are outside that gate, and when D44 media would ride §6).

---

## 10. Review flags (arguments only — nothing above re-decides these)

1. **RESOLVED (Nate ruling, 2026-07-01) — `gallery_items` derives ownership; uniqueness added.**
   The original flag (no unique constraint; a stamped-triple unique proposed) was ruled on: the
   `ownerId` column is DROPPED (D23 derive-don't-stamp; the `character_tags`/`duplicate_pairs`
   precedent) and the constraint is `unique(assetId, subjectCharacterId)` — §1.3 carries the
   patched DDL and the superseded-D49-wording note. **The general rule this ruling sets:**
   association/curation rows anchored by a REQUIRED FK to owned canon DERIVE their owner through
   that FK; only true producers — rows that ARE the user's authored artifact with no owned anchor
   (characters, personas, presets, documents, themes) — stamp `ownerId` + `fetchOwned`.
2. **RESOLVED (D61, 2026-07-01) — the signature tables promote to `@orb/kit/image-sniff`.** The
   original flag: the committed criterion promotes `sniffMime`/`isAnimated` to `@orb/kit` only
   "iff the client needs pre-detection" — but §6's `isAllowedImageBuffer` (infra) needs the same
   magic-signature tables, and infra cannot import a domain. The guard designer's call is now
   recorded (`hub-browse-design/01` §1/§3): the pure byte-facts (signatures + dimension parsing +
   the animated sniff) live in `@orb/kit/image-sniff`; `assets/substrate/mime.ts` becomes a thin
   composition over it when G2 lands; the caps/allow-set POLICY stays in
   `infra/network/image-guard.ts` (policy doesn't live in kit).
3. **`AssetsService` verb growth.** v1+v2+B4 take the assets contract from 7 verbs to 13. Still
   one owner and one template, but if a later wave adds more media verbs, a named `gallery/`
   subsystem folder inside `domain/assets` (8-slot-legal) is the pressure valve — flagging so
   nobody proposes a new domain instead.
