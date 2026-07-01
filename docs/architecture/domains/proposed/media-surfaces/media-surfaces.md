# Proposed: media-surfaces — gallery · server thumbnails/animated-detect · token-counter

> **Status: PROPOSAL FLAG[PD-55], not law.** This is the evidence base for a yes/no, not a spec. Nothing here is
> committed until it graduates to a ledger D-entry + a real `docs/architecture/domains/<name>.md`. Do NOT
> build from this doc. Provenance: source-level read of ST `public/scripts/extensions/{gallery,token-counter}/`
> + ST server `src/endpoints/{thumbnails,image-metadata,images}.js`, neo-tavern, and the orbweaver substrate
> (`domain/assets`, `infra/image`, `kit/tokens`) on 2026-06-28. Cross-refs: `domains/assets.md`,
> `reports/sillytavern-feature-gap.md` §2 + §4 + §7, `structure.md`, `client.md` (Phase-6).

## 0. TL;DR — the homes, and why this is "media-surfaces" not three domains

The header framing holds: **none of the three is a domain.** All three are thin surfaces over substrate that
already exists. The one-home call is to NOT mint anything — they live as (a) a read verb on `assets`, (b)
additions to the already-built `assets.resolveVariant` + `infra/image` variant pipeline, and (c) a pure
Phase-6 client panel over `@orb/kit/tokens`. "media-surfaces" is a **doc grouping** for three cheap related
surfaces, not a proposed package/domain. If any single one needs a home it's `assets`, never a new domain.

| Surface | Proposed home | New domain? | New db? | Born-compliant-before-Phase-5? |
|---|---|---|---|---|
| Gallery | a `listOwned` read verb in `domain/assets` + a Phase-6 `@orb/ui` grid | **No** | No (v1) — see §5.1 for the one real open call | the verb + its view shape (cheap, additive) |
| Thumbnails | **already built**: `assets.resolveVariant` + `infra/image`; add a small ladder rung | **No** | No | none new (pipeline exists) |
| Animated-detect | a pure byte-sniff in `assets/substrate/mime.ts` (sibling to `sniffMime`) | **No** | No | the sniff fn + a `resolveVariant` bailout |
| Token-counter | **pure Phase-6 client** over `@orb/kit/tokens` `n` | **No** | No | none — zero server |

---

## 1. Gallery

### What it is + how ST does it
A per-character image-grid browser: thumbnails of the images a user has collected for a character, with
upload (drag-drop / file picker), sort, delete, and per-character folder overrides.

- Client: `extensions/gallery/index.js` — `showCharGallery` (`index.js:308`) → `getGalleryItems`
  (`index.js:112`) POSTs `/api/images/list` with `{folder, sortField, sortOrder, type}`; renders via the
  vendored `nanogallery2` jQuery lib (`initGallery`, `index.js:214`). Upload = `uploadFile` (`index.js:350`)
  → `saveBase64AsFile`. Folder model: `extensionSettings.gallery.folders[char.avatar]` overrides the
  default folder (the char name) — `getGalleryFolder` (`index.js:101`), `updateGalleryFolder`
  (`index.js:569`). Slash surfaces `/show-gallery` + `/list-gallery` (`index.js:754`).
- Server: images are **loose files** under `user/images/<folder>/` — NOT content-addressed, no dedup, no db.
  `/api/images/list` walks the folder (`src/endpoints/images.js`); virtual folders + per-image metadata
  (hash/aspectRatio/isAnimated/dominantColor) live in a JSON sidecar `image-metadata.json`
  (`src/endpoints/image-metadata.js`).

**The mismatch that drives the call:** ST's gallery is a *file-library* concept (arbitrary user uploads,
folders, per-image sidecar metadata). Orbweaver's `assets` is a **content-addressed index** of
system-managed blobs whose `kind ∈ {card, avatar, export}` (`@orb/contracts/assets` `ASSET_KINDS`) — there
is today no "user media library" concept and no character↔media association. So "gallery" is two different
products: a cheap read-view over what `assets` already holds, or a real curated-media feature that needs new
owned state. See §5.1.

### What neo kept/cut
**Cut.** No gallery extension, no `/api/images/*`, no loose-file media library in neo-tavern (grep: zero
hits). orbweaver inherited the narrowed scope.

---

## 2. Server thumbnails + animated-image detection

### What it is + how ST does it
- **Thumbnails:** `src/endpoints/thumbnails.js` — `generateThumbnail` (`thumbnails.js:103`) +
  `processSingleImage` (`thumbnails.js:198`) use **Jimp** (`src/jimp.js`, WASM codecs) to `cover`/`resize`
  an original to a fixed dimension, write a cached file, and serve via `publicRouter.get('/')`
  (`thumbnails.js:249`) at `/thumbnail?type=&file=&animated=`. Cache is keyed by filename with an
  mtime-freshness check (`thumbnails.js:126`).
- **Animated detection** (`src/endpoints/image-metadata.js`): pure byte-sniffs — `isAnimatedApng`
  (`image-metadata.js:65`, looks for the `acTL` chunk in the first 200 bytes), `isAnimatedWebP`
  (`image-metadata.js:74`, looks for `ANIM`/`ANMF`), and GIF is always animated (`generateImageMetadata`
  `image-metadata.js:121`). The thumbnail path **bails on animated** — `generateThumbnail` returns a null
  path so the route serves the original (Jimp can't process animated WebP). The flag is also surfaced to the
  client for backgrounds (`src/endpoints/backgrounds.js:29`).

### What neo kept/cut
**Cut.** No server thumbnail pipeline, no Jimp, no animated-detect in neo (grep: zero hits).

### The orbweaver reality: this is ~90% already built
orbweaver's `infra/image` adapter (`createImageAdapter`, D6) already does decode → auto-orient → resize →
re-encode-to-webp + strips EXIF/GPS (`packages/server/src/infra/image/index.ts`), and `domain/assets`
already wraps it as the **thumbnail pipeline**: `resolveVariant` (`verbs/resolve-variant.ts`) does snap →
cache-read → transform-via-injected-op → cache-put over the `BLOB_WIDTHS` ladder
(`substrate/variant-policy.ts`). That **is** server thumbnailing — sharp, not Jimp. "Add server thumbnails"
is therefore: (1) add a small thumbnail-sized rung to `BLOB_WIDTHS`; (2) teach `resolveVariant` to bail to
the original when the source is animated (the ST behavior). No new infra, no new home.

---

## 3. Token-counter panel

### What it is + how ST does it
`extensions/token-counter/index.js` — `doTokenCounter` (`index.js:12`) opens a popup with a textarea; on
input it debounce-counts via `getTextTokens`/`getTokenCountAsync` (`../../tokenizers.js`) and `drawChunks`
(`index.js:50`) renders the **per-token chunks + token IDs** colorized. A `/count` slash command
(`index.js:112`) sums the whole chat. The chunk/ID display is **tokenizer-zoo-dependent** (per-model
SentencePiece/tiktoken decode).

### What neo kept/cut
**Kept the estimator, cut the zoo.** neo has no token-counter *extension*, but `TokenCounter`
(`src/client/features/_shared/token-counter.tsx`) is an inline badge that calls `estimateTokens` from
`shared/_kit/tokens` — the OpenRouter "QuadChars" zero-dep estimator. That estimator is now orbweaver's
`@orb/kit/tokens` `n` (`estimateTokens`), already consumed by `character/substrate/card-tokens.ts`,
`buddy/substrate/view.ts`, and the openrouter chat-completions runner.

### The orbweaver constraint (respect it)
Orbweaver **rejects the per-model tokenizer zoo** (`kit/tokens` header; gap-register §1 `tokenizer zoo
BY-DESIGN-OUT`; §6). So the panel CANNOT show real token IDs/chunks. It is an **estimate** (`n(text)`) plus,
optionally, the provider-`usage` truth captured post-turn (already in chat). That is a feature, not a
regression — the estimate is the honest cross-model number.

---

## 4. orbweaver substrate to lean on (exact files/types)

| Need | Lean on | Path |
|---|---|---|
| List a user's blobs | `domain/assets` (add `listOwned` verb + view) | `packages/server/src/domain/assets/` |
| Owner-scoped reads | existing `metadataForOwnedHash` pattern (the `ownerId` predicate is in the WHERE) | `domain/assets/persistence/queries.ts` |
| Blob URL on the client | `blobUrl(hash)` + `BLOB_ROUTE` | `@orb/contracts/assets` |
| Thumbnail generation | `resolveVariant` (snap→cache→transform→webp) | `domain/assets/verbs/resolve-variant.ts` |
| Variant width ladder | `BLOB_WIDTHS` / `snapBlobWidth` | `domain/assets/substrate/variant-policy.ts` |
| Image decode/resize/strip | `ImageAdapter.transform` / `.probe` (db-free, sharp-only) | `infra/image/index.ts` |
| Magic-byte sniff (sibling to add animated-detect next to) | `sniffMime` | `domain/assets/substrate/mime.ts` |
| Token estimate (isomorphic) | `n` (`estimateTokens`) | `@orb/kit/tokens` |
| Inline badge prior art | neo `TokenCounter` | neo `src/client/features/_shared/token-counter.tsx` |

---

## 5. Proposed homes in the cake (per surface)

### 5.1 Gallery — a read verb in `assets`, NOT a domain

**Do not mint a domain.** A grid of "my images" is a read view; minting a `gallery` domain would duplicate
ownership, the `assets` table, and the blob route for zero owned state. Two scoped options:

- **v1 (recommended — pure read view):** add `listOwned` to `domain/assets` (owner-scoped off
  `principal.userId`, optional `kind` filter, paged/sorted by `uploadedAt`) + a Phase-6 `@orb/ui` grid that
  renders `blobUrl(hash)` thumbnails via `?w=` (the existing variant pipeline). No db change. This surfaces
  exactly what assets already holds (a user's cards/avatars). It is "a gallery" only in the literal sense —
  it does not give ST's *curated per-character media collections*.

- **v2 (only if curated per-character media is actually wanted — the ONE real db call):** ST-style galleries
  (arbitrary uploads, per-character, foldered) need **new owned state**, and that is the only part of this
  whole proposal that is not nearly-free. The born-compliant shape, respecting D24 (no polymorphic tables)
  and the two ownership categories (D18/D23):
  - a new `ASSET_KINDS` member `"gallery"` (one-home: add to the tuple in `@orb/contracts/assets`; the db
    CHECK + client derive from it — `no-inline-union-redecl`), AND
  - a per-type association so a gallery image can belong to a character: a nullable `subjectCharacterId`
    FK on a dedicated `gallery_items` table (single-owned: `ownerId` + `fetchOwned`), **not** a polymorphic
    `(entityType, entityId)` ref. This table, not `assets`, owns the user↔image↔character curation; `assets`
    stays the byte index. ST's "virtual folders" map to a future `tag`-junction, not a new store.

  v2 is MODERATE→PAINFUL and should be its own ledger call. **Recommendation: ship v1; defer v2 until there's
  a real product need for curated media** (don't build the folder/association machinery speculatively — the
  one place global KISS still applies is not-yet-needed owned state).

**Gates:** the `listOwned` verb rides the existing assets gates (owner-scoped query in `persistence/`,
`test-presence` for the verb, `types-in-contract` for the view). v2 adds: the `gallery_items` FK +
cascade-on-character-delete, and the avatar-ref-registry coverage test would extend to gallery refs so GC
doesn't silently reap curated images (`assets.md` invariant #4 / esoterica #6).

### 5.2 Thumbnails — additions to the existing variant pipeline (no new home)

`infra/image` is **already db-free** (it imports only `sharp` + node types; takes `Uint8Array`, returns
`Uint8Array` — confirmed against the "infra is db-free / infra-no-db" rule). The thumbnail pipeline is
`assets.resolveVariant` over `BLOB_WIDTHS`. Proposed change set, all additive:

1. Add a thumbnail rung (e.g. a small width) to `BLOB_WIDTHS` in `domain/assets/substrate/variant-policy.ts`
   so the gallery grid asks for `?w=<thumb>` and gets a cached webp. The ladder already bounds the variant
   keyspace (DoS defense — `assets.md` esoterica #2), so a new rung is a one-line policy change.
2. Animated bailout in `resolveVariant`: if the source is animated, skip the transform and return the
   original bytes (ST's behavior — sharp's webp encoder would otherwise drop the animation). Needs §5.3.

No infra change, no new verb, no db. Keeps sharp out of `entry/` (already true).

### 5.3 Animated-detect — a pure sniff in `assets/substrate/mime.ts` (NOT infra, NOT sharp)

Animation detection is **pure byte inspection** — it needs no sharp and no I/O, so it does NOT belong in
`infra/image`. It is the exact sibling of the existing `sniffMime` (`domain/assets/substrate/mime.ts`):
GIF ⇒ always; APNG ⇒ `acTL` chunk present; WebP ⇒ `ANIM`/`ANMF` chunk present (ST's `isAnimatedApng` /
`isAnimatedWebP`, `image-metadata.js:65,74`). Propose `isAnimated(bytes): boolean` next to `sniffMime`.

- **Promotion criterion (mirrors `sniffMime`'s deferred kit-promotion):** keep it in `assets/substrate` while
  only the server consumes it; promote to `@orb/kit/assets` iff the client ever needs to pre-detect an
  animated upload before sending (e.g. to warn it won't be thumbnailed). Same call already recorded for
  `sniffMime` in `assets.md`.
- Note: `infra/image`'s sharp `probe` *could* report animation (sharp exposes `pages`), but routing a pure
  4-byte-signature check through a sharp decode is wasteful and couples a policy decision to infra. Keep the
  sniff pure and domain-side; `resolveVariant` calls it to decide whether to bail.

### 5.4 Token-counter — pure Phase-6 client, zero server

No domain, no verb, no db, no contract. The panel is a Phase-6 `@orb/ui` surface that calls
`n` (`@orb/kit/tokens`) directly on the client — `kit` is isomorphic and already client-importable, and neo
already did exactly this (`token-counter.tsx`). The provider-`usage` truth (the only server-side number) is
already captured in the chat turn; the panel can show it alongside the estimate when counting live chat, but
that's reading existing chat data, not a new server surface. **No tokenizer zoo, no chunk/ID display** (the
one ST feature deliberately dropped — gap-register §1/§6).

---

## 6. Contract / query shapes (sketch — illustrative, not final)

```typescript
// 5.1 — domain/assets: a new owner-scoped read verb. View lives in contract/views.ts.
interface AssetListItem {            // contract/views.ts (read-model the client gets)
  readonly assetId: AssetId;
  readonly hash: string;            // → blobUrl(hash) + ?w= for the thumb
  readonly kind: AssetKind;
  readonly mime: string;
  readonly size: number;
  readonly uploadedAt: number;
  readonly animated: boolean;       // from the §5.3 sniff (lets the grid skip ?w= for animated)
}
interface ListOwnedParams extends AssetsActorParams {   // principal scopes ownership
  readonly kind?: AssetKind;        // optional filter
  readonly limit: number;
  readonly cursor?: number;         // uploadedAt-keyed paging
}
// AssetsService.listOwned: (params: ListOwnedParams) => Promise<AssetListItem[]>

// 5.3 — domain/assets/substrate/mime.ts (pure, sibling of sniffMime)
function isAnimated(bytes: Uint8Array): boolean;   // GIF | APNG acTL | WebP ANIM/ANMF

// 5.2 — domain/assets/substrate/variant-policy.ts (one-line policy add)
// const BLOB_WIDTHS = [ <thumb>, ...existing ] as const;

// 5.4 — Phase-6 client only; no contract. Direct kit call:
import { n } from "@orb/kit/tokens";
const estimate = n(pastedText);     // advisory; provider `usage` is the post-turn truth
```

Thumbnail "request" shape: there is **no new request type** — it's the existing blob route with the variant
query (`blobUrl(hash) + "?w=<thumb>"`), already the client's avatar pattern.

---

## 7. Born-compliant-before-Phase-5 vs pure Phase-6 client

| Bit | When | Why |
|---|---|---|
| `assets.listOwned` verb + `AssetListItem` view | with the assets GC/backfill wave (server) | a domain verb + view; cheap, additive, no schema change |
| `isAnimated` sniff + `resolveVariant` animated bailout | same assets wave | server substrate; pairs with the thumbnail ladder rung |
| `BLOB_WIDTHS` thumbnail rung | same assets wave | one-line policy |
| Gallery v2 (`"gallery"` kind + `gallery_items` table) | **only if greenlit** — born-compliant in the contracts/db pass | new owned state must be born in `0000_baseline`; do NOT bolt on later |
| Gallery grid UI | Phase-6 client | pure `@orb/ui` over `listOwned` + `blobUrl` |
| Token-counter panel | Phase-6 client | pure `@orb/ui` over `kit/tokens`; zero server |

The honest summary: **almost nothing is born-compliant-gated.** The only thing that MUST be decided before
the db baseline freezes is gallery v2's owned state — and the recommendation is to defer it.

---

## 8. Difficulty + sequencing + open questions

- **Token-counter:** TRIVIAL. Pure client, substrate exists. Land any time in Phase-6.
- **Thumbnails + animated-detect:** TRIVIAL→MODERATE. The pipeline exists; this is a ladder rung + a pure
  sniff + a bailout branch. Land with the assets GC/backfill wave (it touches `assets` substrate anyway).
- **Gallery v1 (read view):** MODERATE. One verb + a Phase-6 grid. Land after the assets verb wave + Phase-6.
- **Gallery v2 (curated media):** MODERATE→PAINFUL, **needs a ledger call** — it's the only new owned state.

Sequencing: animated-detect + thumbnail rung → `assets.listOwned` → Phase-6 grid; token-counter is
independent and can land whenever Phase-6 client work starts.

**Open questions:**
1. **Gallery scope — v1 vs v2?** Is the want "see my avatars/cards in a grid" (v1, free) or ST's curated
   per-character media library (v2, new table + kind)? This is the real decision; everything else is cheap.
   Default recommendation: v1 now, v2 deferred until a product need exists.
2. **Token-counter live-chat mode?** Show provider `usage` alongside the estimate when counting the current
   chat? Cheap (reads existing chat data) but couples the panel to chat — defer to the Phase-5/6 boundary.
3. **`isAnimated` kit promotion?** Keep domain-side until the client needs pre-send detection (matches the
   `sniffMime` deferral already on record).

---

## 9. Cross-references
- `domains/assets.md` — the CAS index/byte-store split, the variant pipeline, the avatar-ref registry, the
  deferred `sniffMime`→kit promotion (the model for `isAnimated`), D21 per-user ownership.
- `reports/sillytavern-feature-gap.md` §2 (gallery, thumbnails MODERATE), §4 (token-counter TRIVIAL), §6
  (tokenizer zoo BY-DESIGN-OUT), §7 (cheap-wins list).
- `structure.md` — the cake, the 8-slot template, `infra` db-free rule, the gate catalog.
- `client.md` / D42 — Phase-6 `@orb/ui` + Base UI (where the grid + panel surfaces live).
- `proposed/README.md` — this round's proposal set + the constitution every proposal obeys.
</content>
</invoke>
