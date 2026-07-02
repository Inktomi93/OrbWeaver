# 03 — The flow, the wire, rings, the client, the build plan (B5b)

> **Status: COMMITTED (D61, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The browse → preview → import flow over doc 02's adapters and doc 01's guard.

---

## 1. The wire contracts (`@orb/contracts/hub` — client + transport consume via tRPC)

```ts
export const hubSearchParamsSchema = z.object({
  hub: z.enum(HUB_KEYS),
  query: z.string().max(200).default(""),
  sort: z.enum(HUB_SORT_KEYS).default("downloads"),
  page: z.number().int().min(1).max(200).optional(),   // paging: "page" hubs
  cursor: z.string().max(512).optional(),               // paging: "cursor" hubs (opaque)
  tags: z.array(z.string().max(64)).max(10).default([]),
  excludeTags: z.array(z.string().max(64)).max(10).default([]),
  creator: z.string().max(100).optional(),
  includeNsfw: z.boolean().default(false),               // §5 — an explicit opt-in, never a default
});

export const hubCardSummarySchema = z.object({
  hub: z.enum(HUB_KEYS),
  ref: z.string(),                    // opaque hub card id (doc 02 §3)
  name: z.string(),
  tagline: z.string().default(""),    // short description/creator's pitch
  creator: z.string().nullable(),
  tags: z.array(z.string()),
  downloadCount: z.number().int().nullable(),
  rating: z.enum(["sfw", "nsfw", "unknown"]),
  tokenCount: z.number().int().nullable(),  // hubs that report it (chub does)
  updatedAt: z.number().int().nullable(),   // epoch-ms when the hub reports it
  hasLorebook: z.boolean().nullable(),
  /** ALREADY-IMPORTED marker: the characterId when this card's bytes-hash is in the actor's
   *  library (importHash match via character.findByImportHash, PD-43) — null otherwise.
   *  Stamped by the VERB, never the adapter (adapters are stateless). */
  importedCharacterId: typeIdSchema(ID_PREFIX.character).nullable(),
});

export const hubSearchPageSchema = z.object({
  hits: z.array(hubCardSummarySchema),
  nextPage: z.number().int().optional(),
  nextCursor: z.string().optional(),
  totalCount: z.number().int().nullable(), // hubs that report it
});

export const hubCardRefParamsSchema = z.object({ hub: z.enum(HUB_KEYS), ref: z.string().max(512) });

export const hubCardDetailSchema = hubCardSummarySchema.extend({
  description: z.string(),            // the hub's long-form listing text (NOT the card body)
  greetingPreview: z.string().nullable(),
  avatarRef: z.string(),              // feeds the §3 proxy route, never a raw external URL
});

// preview: the PARSED canonical card — the same CharacterCard the import reader returns
// (@orb/contracts/character); the client renders it with the existing card-sheet components.
export const hubCardPreviewSchema = z.object({
  card: characterCardSchema,
  tokenEstimate: z.number().int(),    // @orb/kit/tokens n() over the assembled card text
  bookEntryCount: z.number().int(),
  importedCharacterId: typeIdSchema(ID_PREFIX.character).nullable(),
});

export const hubImportResultSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  created: z.boolean(),               // false = importHash dedup hit (idempotent re-import)
});
```

**Enforcer:** all shapes live here (`no-inline-types`); the tRPC router derives its
input/output from these schemas — the client never hand-redeclares them (§8.2's named leak
pattern, avoided at birth).

## 2. The verb surface (`HubService`) + the flow

```ts
HubService = {
  listHubs(): Promise<{ key: HubKey; capabilities: HubCapabilities; enabled: boolean }[]>
  search(params: HubSearchParams & HubActorParams): Promise<HubSearchPage>
  getCard(params: HubCardRefParams & HubActorParams): Promise<HubCardDetail>
  previewCard(params: HubCardRefParams & HubActorParams): Promise<HubCardPreview>
  importCard(params: HubCardRefParams & HubActorParams): Promise<HubImportResult>
  // + searchGifs / importGif (migrated verbatim — doc 02 §5)
}
```

- **`search`** — gate on the AppSettings enable (§4) → dispatch `ctx.hubs[params.hub].search`
  (normalized params; capability-undeclared params zod-rejected at the wire) → stamp
  `importedCharacterId` per hit via ONE batched `findByImportHash` call over the page's refs?
  No — the hash isn't known until bytes are fetched; **the summary-stage marker instead matches
  on `importedFrom` prefix** (`hub:<key>:<ref>` — the provenance stamp §2.1) via the injected
  `findByImportedFrom` lookup (a `character` read verb, one indexed query per page). The
  BYTES-hash check runs at preview/import time where bytes exist.
- **`getCard`** — adapter passthrough + the same marker.
- **`previewCard`** — `adapter.fetchCardBytes` (safeFetch-bound) → the **import domain's pure
  reader** `parseCardPng`/`parseCardJson` (already exported from import's front door for the
  bulk driver + tests — `domains/import.md` §"Public surface"; reused READ-ONLY, zero writes) →
  `HubCardPreview`. **Never a second parser** — a hub card that the import reader can't parse
  fails preview exactly as it would fail import (the honest signal). `cardContentHash`/token
  estimate computed on the parsed card; `importHash` (sha256 of bytes) checked via injected
  `findByImportHash` for the already-imported marker.
- **`importCard`** — `adapter.fetchCardBytes` → the injected **`importCardBytes`** op: the SAME
  entry-composed single-card driver the HTTP card-upload route uses (store the PNG via
  `assets.store` → `import.importCharacter` with the parsed card — the store-then-import glue
  that lives at the composition layer per `domains/import.md` §"The bulk driver is NOT in the
  domain"). Provenance rides through it (§2.1). Idempotency is import's existing
  `(ownerId, handle) + cardContentHash` + `importHash` machinery — a re-import returns
  `created: false`, never a duplicate. Import's event emission (`character.updated` + backfill
  enqueue) fires exactly as for any import — hub-imported cards auto-index like everything else.

### 2.1 Provenance (D37/PD-43 — the columns already exist)

`importedFrom = "hub:<key>:<ref>"` (e.g. `hub:chub:Anonymous/seraphina-xyz`) and
`importHash = sha256(bytes)` ride the existing `character.create` provenance params
(`domains/character.md`; PD-43 built `findByImportHash`). The `hub:` prefix format is minted in
`domain/hub/substrate/provenance.ts` (ONE formatter + ONE matcher — no inline string-building at
call sites). A NEW small `character` read verb **`findByImportedFrom(ownerId, values[])`** backs
the §2 summary markers (an indexed `IN` lookup; lands with H4, one-line delta to
`domains/character.md`'s verb table).

### 2.2 Cross-feature composition (the injection model)

| Op injected into `HubContext` | Provided by | Used for |
|---|---|---|
| `hubs` (the `HUB_ADAPTERS` bundle, each pre-bound with its `HubIo`) | `infra/network/hubs` via compose | search/getCard/fetchCardBytes/fetchAvatar |
| `importCardBytes(bytes, provenance, actor)` | `entry/` (the single-card import driver) | `importCard` — the ONE import path |
| `findByImportHash` / `findByImportedFrom` | `character` domain | already-imported markers + idempotent re-import UX |
| `storeAsset` + `addToGallery` | `assets` domain | the migrated `importGif` (doc 02 §5) |
| `isHubEnabled(key)` | `settings` (AppSettings read) | §4 kill switch |

`domain/hub` imports NO sibling front door — everything above is compose-wired
(`domain-no-cross-feature` backstop).

---

## 3. The avatar proxy + the caching story

Hub thumbnails/avatars are **server-proxied**, not client-direct:

- **WHY proxy (vs the gif-picker's direct-load precedent):** the gif picker renders provider
  URLs directly because the user explicitly queried that one provider and its media host is a
  single CSP `img-src` append (gallery §5). A hub browse grid loads 48 thumbnails per page from
  per-hub CDNs — direct loads leak the user's IP + full browse pattern to four vendors' CDNs as
  a side effect of scrolling, require N CSP appends, and (chub) sometimes need the quirk headers
  a browser won't send. Marinara proxies for the same reasons (+ CORS). *Rejected:* client-direct
  with CSP appends — the privacy leak scales with the grid, not with an explicit user action.
- **The route:** `transport/http` `GET /api/hub/:hub/avatar/*` (session-authed like `/blob` —
  never anonymous; a hub-disabled 404s) → `adapter.fetchAvatar` (safeFetch + `isAllowedImageBuffer`
  — doc 01's `FetchImageOp`, 10 MB/dimension caps) → bytes with the SNIFFED mime (never the
  remote header).
- **Caching — DECIDED: an ephemeral in-process LRU + browser cache; never CAS.** The transport
  route holds a size-bounded LRU (lean: 64 MB, TTL 24 h, keyed `hub:ref`) and serves
  `Cache-Control: private, max-age=86400`. WHY not CAS: `assets` is the user's OWNED index
  (D21 — per-user, private) — writing thousands of remote thumbnails into it pollutes the owned
  library, implies ownership/gallery semantics, and survives long after the browse session; a
  thumbnail cache is infrastructure, not canon. WHY `private` not marinara's `public, max-age`:
  the route is session-authed and D21's posture (`asset-owner-gated`: `Cache-Control: private`)
  is the house rule for authed byte responses — a shared proxy cache must not serve one user's
  fetches to another. The IMPORTED card's real avatar does land in CAS — via the normal import
  path, as the character's avatar asset, exactly once.

---

## 4. Rings, limits, and the kill switch

- **Who may browse/import — LEAN: any authenticated user (global `user` ring).** Characters are
  single-owned; a hub import creates rows owned by the ACTOR — nobody else's state is touched,
  so there is nothing for `host` (chat-scoped) or `admin` to gate. WHY lean and not
  admin-gated: the surface is the same trust class as "upload a card PNG" (already any-user);
  gating browse on admin would just push users back to manual downloads. *Rejected:* per-chat
  ring involvement — the hub flow never touches a chat.
- **The operator kill switch:** AppSettings `hub.enabledHubs: HubKey[]` (default: all v1 hubs)
  + `hub.enabled: boolean` master (default ON) — nature-(b) runtime toggles
  (`Spine-Config-and-Serialization.md` §7.2); an operator who wants zero third-party egress
  flips one switch and every hub verb + the avatar route return `hub-disabled`. Admin-gated
  write (the normal AppSettings surface).
- **Rate limits** (the DB-backed `transport/rate-limit`, per-user; leans, tuned at build):
  `hub.search`/`getCard` 30/min · `previewCard` 12/min · `importCard` 6/min · avatar proxy
  120/min (cache hits don't debit). WHY per-user at transport: the hubs are shared third-party
  resources — one user's scripted scraping must not get the server's IP blocked for everyone;
  transport is the established limiter home (AGENTS-1 `_shared` table: `rate-limit.ts →
  transport`).

## 5. NSFW / content-flag passthrough (surface, don't launder)

- Every summary/detail carries the normalized `rating` (doc 02 §3). The client renders it as a
  badge and a filter toggle; `includeNsfw` defaults **false** and is passed to hubs that support
  server-side filtering (`nsfwFilter` capability); for hubs without it, the verb post-filters
  `rating === "nsfw"` hits when `includeNsfw` is false (`"unknown"` hits PASS with the unknown
  badge — filtering them would silently hide ~everything on non-flagging hubs; the badge is the
  honest signal).
- On import, hub tags (including content-warning tags) ride the normal card-tag path —
  `character_tags` rows `status:'pending'` (import's existing junction reshape) — nothing is
  stripped or auto-accepted.

---

## 6. Client sketch (Phase 6/7 — the `features/hub` slice, the library-browse register)

**Surface:** a "Browse Hubs" view beside the local library (sibling, not a tab of it — doc 02
§1's "two browse surfaces are siblings"). Layout per `UI-Architecture-and-Layout.md`; components
from `@orb/ui`.

- **Hub tabs** from `listHubs()` — one tab per enabled hub, capability-driven controls (sort
  menu shows that hub's `sorts`; tag/creator filters render only when flagged). A hub erroring
  (`hub-unavailable`) marks ITS tab with an inline error state; other tabs are unaffected
  (per-hub isolation is a UI contract, not just a server one).
- **Search row:** query box (debounced), sort select, tag include/exclude chips, creator filter,
  the NSFW toggle (off by default, persisted per-user in UserSettings `hub.includeNsfw`).
- **Result grid:** TanStack-Virtual grid of `HubCardSummary` cards — proxied avatar
  (`/api/hub/:hub/avatar/…`), name, creator, download count, token count, rating badge, tag
  chips, and the **"In library" check** when `importedCharacterId` is set (links to the local
  character). Infinite scroll via `nextPage`/`nextCursor`.
- **Detail drawer** (click a card): `getCard` immediately (hub metadata) + `previewCard` lazily
  (the parsed canonical card rendered with the EXISTING character-sheet components — the same
  renderer the local library uses, fed a `CharacterCard` instead of a row; description/
  personality/scenario/greetings/book size/token estimate). Preview failure = the import-parse
  error surfaced verbatim ("this card won't import, and here's why" — the honest pre-flight).
- **Import button** → `importCard` → success toast with "Open character" (routes to the local
  character view); `created: false` → "Already in your library" with the same link. Failure
  states: `rejected-content` (guard), `hub-unavailable`, rate-limited — each a distinct toast.
- **States:** per-tab loading skeletons, empty-query default feed (the hub's default sort),
  error-with-retry per tab, the disabled state when the operator kill switch is off (the whole
  surface hidden — capability-driven nav, the D16 invite-surface precedent).

Zero client math beyond rendering; every displayed fact arrives on the wire shapes (§1).

---

## 7. Build plan (S/M/L chunks; every chunk lands green on its own)

| # | Chunk | Scope → checkpoint | Size | Depends on |
|---|---|---|---|---|
| H1 | **the guard** (doc 01; = gallery G6, ONE work item) | `@orb/kit/image-sniff` + hardened `safeFetch` + `image-guard.ts` + the op types; checkpoint: doc 01 §6 suite green with `EGRESS_FIREWALL=false` | **M** | none — unblocks G7, databank scrapers, D44 server fetches |
| H2 | hub leaf + contracts + chub adapter | `@orb/contracts/hub` + `domain/hub` skeleton + `HUB_ADAPTERS` registry + the chub adapter + `search`/`getCard`/`listHubs` + AppSettings keys + rate limits; checkpoint: live chub search behind the kill switch, §8 unit tests green | **M** | H1 |
| H3 | the remaining v1 adapters | wyvern + chartavern + pygmalion modules (data-driven); checkpoint: capability matrix honest per hub, pygmalion flow **build-verified** (doc 02 §4 — drop to deferred if closed) | **M** | H2 |
| H4 | preview + import handoff | `previewCard` (import reader reuse) + `importCard` + `importCardBytes` compose op + provenance + `findByImportedFrom`; checkpoint: §8 round-trip test green | **M** | H2; import domain (BUILT) |
| H5 | avatar proxy + LRU | the transport route + cache + `FetchImageOp` wiring; checkpoint: §8 proxy tests | **S** | H2 |
| H6 | the client surface | §6, incl. the preview drawer over the existing card-sheet components | **L** | Phase 6 foundation; H2–H5 |
| H7 | gif migration | `verbs/gifs.ts` + injected assets ops (doc 02 §5); supersedes gallery G7's home line | **M** | H1; gallery G3 (the `"gallery"` kind); H2 |

## 8. Test plan

- **Adapter goldens (per hub):** canned upstream JSON → exact `HubSearchPage`/`HubCardDetail`
  mapping (sort/param spelling asserted on the OUTGOING request via a recording fake `HubIo`);
  rating normalization incl. the `"unknown"` arm; upstream 500/timeout → `hub-unavailable`.
- **Registry exhaustiveness:** compile-level — a `HubKey` without an adapter fails `tsc`
  (the mapped-type Record IS the test); plus a runtime smoke that every adapter's `hosts` is
  non-empty (compose binds allowlists from it).
- **Verb gating:** kill switch off → every verb + the avatar route rejects; capability-undeclared
  sort/filter rejected at zod; B's search never sees A's `importedCharacterId` markers
  (owner-scoped lookup).
- **Preview/import round-trip:** a fixture `chara_card_v2.png` served by a fake adapter →
  `previewCard` returns the canonical card (byte-for-byte the import reader's output) with zero
  DB writes; `importCard` creates the character with `importedFrom`/`importHash` stamped, emits
  `character.updated` (the import invariant), and a SECOND `importCard` returns
  `created: false` with the same id.
- **Guard integration:** an adapter response redirecting the card download off the hub's host
  set is blocked (doc 01's hop re-validation, exercised through the real op); an HTML-200
  "card" fails `previewCard` with the parse error, never a crash.
- **Avatar proxy:** non-image upstream → 415-class rejection (never served); LRU hit serves
  without an upstream call (recording fake); `Cache-Control: private` asserted; kill switch +
  auth gating.

## 9. Cross-refs

`domains/import.md` (the pure readers + the composition-layer driver + provenance invariants) ·
`domains/character.md` + PD-43 (`findByImportHash`; the new `findByImportedFrom` delta) ·
`domains/assets.md`/D21 (why the proxy cache is not CAS; `Cache-Control: private`) ·
`gallery-design.md` §5/§6/§8 (G6 = H1; the G7 home delta) · `databank-design` (scraper consumers
of H1) · doc 01/02 · `Core-Laws-and-Precedents.md` D37 · `Spine-Config-and-Serialization.md`
§7.2 (the AppSettings nature).
