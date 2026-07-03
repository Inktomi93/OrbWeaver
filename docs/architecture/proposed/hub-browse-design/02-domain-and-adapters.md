---
kind: spec
status: active
updated: 2026-07-03
---

# 02 — The domain shape + the `HubAdapter` model (B5b)

> **Status: COMMITTED (D61, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Evidence base: the six marinara bot-browser route files (1,647 LOC), dissected —
> `bot-browser.routes.ts` (Chub), `-wyvern`, `-pygmalion`, `-janny`, `-datacat`, `-chartavern`.
> Liveness probes run 2026-07-01 (§4).

---

## 1. The domain-shape decision: a NEW small leaf, `domain/hub`

**DECIDED: `domain/hub`** — a thin leaf owning the remote-catalog flow (search/preview/import
handoff/capability exposure). It is the "real remote-browse leaf" whose existence
`gallery-design.md` §5 pre-recorded as the resolution criterion for gif search's home (§5 below).

**Rejected alternatives (each argued):**

- **Verbs on `discovery`** — discovery is LOCAL-library semantics over the embedding store
  (`domains/discovery.md`: themes/hubness/duplicates/distill; "embeds nothing, reads the vector
  tables read-only, computes in-RAM"). A remote catalog proxy shares zero substrate with it — no
  vectors, no rollups, no `summarize` — and the rename `corpus → discovery` was justified by
  "the name names what it does"; bolting remote IO on would re-muddy it on day one. The two
  browse surfaces (my library / the world's libraries) are siblings in the UI, not one domain.
- **Verbs on `import`** — import owns ST-format PARSING + the canon write (`domains/import.md`);
  it is the consumer at the END of the hub flow, not the flow. Giving import a remote-catalog
  client means one domain owning two jobs (reader + browser) — the exact "one folder doing two
  jobs" split trigger in the placement rule.
- **Verbs on `assets`** — the gif precedent doesn't transfer: gif import IS a CAS write (assets
  owns the index), but a hub's primary surface is catalog browse/search/preview; the eventual
  import writes `characters` rows via import's front door, touching assets only for the avatar
  blob — assets would own a flow that barely touches its tables.
- **Transport-only routes (marinara's shape)** — six hand-written Fastify files with the policy
  (sort defaults, rating handling, auth) buried in route handlers is exactly the god-route
  pattern the architecture exists to kill; transport is thin drivers calling domain front doors.

`domain/hub` earns leaf status where `media-import` didn't (the gallery §5 rejection) because it
carries a real service surface (5+ verbs), a capability model, a per-hub adapter registry, and
two committed co-tenants (card hubs + the migrating gif search). Small leaves are established
(`notifications`, `tag`).

**The 8-slot layout:**

```
domain/hub/
├── index.ts                 FRONT DOOR
├── service.ts               COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts               DI BUNDLE — explicit HubContext interface: { db?, hubs (the injected
│                              adapter-op bundle), importCardBytes, findByImportHash, storeAsset?,
│                              settings (enabledHubs read) } — NOT ReturnType<>
├── contract/
│   ├── service.ts           HubService + HubServiceDeps + injected-op types (HubOps,
│   │                          ImportCardBytesOp, FindByImportHashOp)
│   ├── params.ts            HubSearchParams · HubCardRefParams · HubImportParams (wire schemas
│   │                          re-exported from @orb/contracts/hub — §3)
│   ├── results.ts           HubSearchPage · HubCardSummary · HubCardDetail · HubImportResult ·
│   │                          HubCardPreview
│   └── errors.ts            HubError (typed: hub-disabled | hub-unavailable | card-not-found |
│                              rejected-content | already-imported*) — *soft, carries the id
├── verbs/
│   ├── search.ts            paged catalog search (capability-gated params)
│   ├── get-card.ts          full remote metadata for one card
│   ├── preview-card.ts      download bytes → import's PURE reader → canonical CharacterCard (no write)
│   ├── import-card.ts       download bytes → injected importCardBytes (the ONE import path) + provenance
│   ├── list-hubs.ts         the capability roster the client renders tabs/filters from
│   └── gifs.ts              searchGifs/importGif — MIGRATED from gallery-design §5 (§5 below)
└── substrate/
    └── provenance.ts        importedFrom/importHash formatting + the already-imported check helper
```

No `persistence/` in v1 — the domain owns **no tables** (browse state is ephemeral; imports land
in `characters` via import; the avatar cache is transport-tier, doc 03 §3). If hub-level state
ever materializes (per-user hub credentials, pinned/starred remote cards), it lands as normal
additive slots. **Enforcer:** resolve-time (no `@orb/db` import from `domain/hub` in v1 keeps the
no-tables claim structural).

---

## 2. The `HubAdapter` contract — ONE contract, data-driven modules

Marinara hardcodes six per-hub route files, each re-implementing search-param plumbing, timeout
handling, avatar proxying, and download (1,647 LOC of near-parallel prose). Orbweaver inverts it:
**one adapter interface, per-hub modules that are mostly data** (base URLs, param mapping,
response mapping, capability flags), sealed in infra behind a mapped-type registry — the
providers pattern ("infra = execution + sealed internal vocab; the domain = selection + policy",
AGENTS-3 §"Connection ↔ providers boundary") applied to hubs.

```ts
// @orb/contracts/hub — the cross-boundary vocab (client renders capabilities; server dispatches)
export const HUB_KEYS = ["chub", "wyvern", "chartavern", "pygmalion"] as const; // v1 roster — §4
export type HubKey = (typeof HUB_KEYS)[number];

export const HUB_SORT_KEYS = ["relevance", "downloads", "rating", "newest", "updated"] as const;
export type HubSortKey = (typeof HUB_SORT_KEYS)[number];

export const hubCapabilitiesSchema = z.object({
  displayName: z.string(),
  sorts: z.array(z.enum(HUB_SORT_KEYS)).nonempty(), // which of the normalized sorts this hub maps
  tagFilter: z.boolean(),          // include/exclude tag params supported
  nsfwFilter: z.boolean(),         // the hub exposes a rating filter param
  creatorFilter: z.boolean(),      // filter by author/username
  paging: z.enum(["page", "cursor"]),
});
export type HubCapabilities = z.infer<typeof hubCapabilitiesSchema>;
```

```ts
// infra/network/hubs/contract.ts — the sealed executor contract (server-only)
export interface HubIo {
  readonly fetch: SafeFetchOp;      // compose-bound to THIS hub's host set (doc 01 §4)
  readonly fetchImage: FetchImageOp;
}
export interface HubAdapter {
  readonly key: HubKey;
  readonly capabilities: HubCapabilities;
  /** The hub's egress surface AS DATA — compose reads this to bind HubIo's allowlist. */
  readonly hosts: readonly string[];
  search(params: NormalizedHubSearch, io: HubIo): Promise<HubSearchPage>;
  getCard(ref: string, io: HubIo): Promise<HubCardDetail>;
  /** The chara_card_v2.png (or the hub's card-JSON→bytes equivalent) — RAW bytes; parsing is
   *  import's reader, never the adapter's. */
  fetchCardBytes(ref: string, io: HubIo): Promise<Uint8Array>;
  fetchAvatar(ref: string, io: HubIo): Promise<{ bytes: Uint8Array; image: SniffedImage }>;
}

// infra/network/hubs/index.ts — the ONE registry (the workloads-RUNNERS gold standard, §7.5):
// a mapped-type Record, so a HubKey without an adapter (or vice versa) is a hard tsc error.
export const HUB_ADAPTERS: { readonly [K in HubKey]: HubAdapter & { key: K } };
```

**Placement rationale + enforcers:** the adapter modules
(`infra/network/hubs/{chub,wyvern,chartavern,pygmalion}.ts`) know wire shapes — URL grammar,
param spelling (`chub`'s `topics`/`excludetopics`/`special_mode`; `wyvern`'s `exploreSearch`;
`chartavern`'s cards CDN; `pygmalion`'s connect-RPC POST shape), quirk headers (chub requires a
browser `User-Agent`/`Accept` pair — bare-client requests get a 403, probe-verified §4), and
response→`HubCardSummary` mapping. That is sealed infra vocab; `domain/hub` sees only
`HubKey`/capabilities/normalized shapes (the `connection` never sees `runner` rule, verbatim).
The registry is injected into `HubContext.hubs` at compose (the `credentials.fetchModels`
precedent — domain-verb-over-injected-network-adapter, already the recorded pattern in
gallery-design §5). **Enforcers:** the mapped-type Record (compile); `no-raw-egress` (doc 01 §5
— adapters get `HubIo`, never global fetch); dep-cruiser: `domain/hub` may not import
`infra/network/hubs/*` (the op bundle is compose-injected; front-door-or-nothing).

*Rejected:* adapters as `domain/hub/adapters/` — they are external-service I/O shaping (the
definition of infra); homing them in the domain would put six vendors' wire grammar above the
infra line and make the domain the thing that knows `imagedelivery.net`. *Rejected:* a
`HubAdapter` interface with per-hub OPTIONAL methods instead of capability flags — optional
methods push `if (adapter.search)` branches into every verb; flags keep dispatch total and let
the client gray out what a hub can't do.

---

## 3. Normalization rules (the adapter's obligations)

- **Sorts:** each adapter maps the normalized `HubSortKey` set it declares → the hub's native
  param (`chub: download_count/rating/…`; `wyvern`/`chartavern`/`pygmalion`: their native
  spellings). An undeclared sort arriving at the verb is a zod reject (the client only offers
  declared sorts).
- **Paging:** normalized to `{ page?: number; cursor?: string }` per the declared `paging` mode;
  the hub's continuation token rides `cursor` opaquely (the gif-search precedent).
- **Ratings:** normalized to `rating: "sfw" | "nsfw" | "unknown"` on every summary/detail —
  mapped from the hub's own flags (chub `nsfw`/`nsfl`, wyvern/chartavern/pygmalion equivalents);
  a hub that doesn't flag content yields `"unknown"`, surfaced as such (doc 03 §5 — surface,
  don't launder).
- **Refs:** `HubCardSummary.ref` is the hub's opaque card identifier (chub `fullPath`, wyvern
  `id`, chartavern `author/slug`, pygmalion id) — treated as an opaque string by domain +
  client; only the adapter interprets it. Never parsed outside the adapter.
- **Errors:** upstream non-OK → `HubError("hub-unavailable")` with the status (no upstream body
  passthrough beyond a bounded snippet in the server log — remote HTML never reaches the client).

---

## 4. The six hubs — liveness verdicts + the v1 roster

Probed 2026-07-01 (direct HTTPS from the dev box; marinara's exact endpoints):

| Hub | Marinara file | Probe result | Verdict |
|---|---|---|---|
| **Chub** (api.chub.ai + avatars.charhub.io) | `bot-browser.routes.ts` | `/search` 403 with a bare client UA; **200 + real results** with browser `User-Agent` + `Accept` headers | **v1 SHIP.** Live; the adapter must send the browser-shaped header pair (recorded as adapter data). FLAG: the 403-on-default-UA means Chub actively bot-filters — the adapter may need header upkeep over time |
| **Wyvern** (api.wyvern.chat + imagedelivery.net) | `bot-browser-wyvern.routes.ts` | `exploreSearch/characters` **200** | **v1 SHIP.** Live, no auth, cleanest API of the six |
| **Character Tavern** (character-tavern.com/api + cards.character-tavern.com) | `bot-browser-chartavern.routes.ts` | `search/cards` **200** | **v1 SHIP.** Live unauthenticated; marinara's optional user-cookie unlock is NOT carried in v1 (§6) |
| **Pygmalion** (server.pygmalion.chat connect-RPC) | `bot-browser-pygmalion.routes.ts` | bare GET **415** (endpoint alive, expects POST+JSON per marinara's shape) | **v1 SHIP (build-verify).** Host + endpoint respond; the full POST search flow must be verified at H3 build time — if the public search has been closed since, drop to deferred (the tuple is a one-line edit) |
| **Datacat** (datacat.run — a JanitorAI mirror; avatars via ella.janitorai.com) | `bot-browser-datacat.routes.ts` | `liberator/identify` **200** (mints an anonymous session token) | **DEFERRED — product call for Nate.** API is live, but it is an unofficial scrape-mirror of another site's catalog ("liberator"); shipping it is a ToS/ethics posture question, not an engineering one. The adapter slot costs one module + one tuple member if greenlit |
| **JannyAI** (search.jannyai.com + scraped tokens) | `bot-browser-janny.routes.ts` | search host live (405 on GET — it's a POST Meilisearch) | **REJECTED for v1 (pattern, not liveness).** Marinara's integration scrapes jannyai.com HTML for a search token and falls back through **`corsproxy.io`** (a third-party proxy) — the doc-01 S3 rejected pattern. No public API = an adapter built on scraping contraptions; revisit only if a real API appears |

**The v1 roster is therefore `chub · wyvern · chartavern · pygmalion`** (the `HUB_KEYS` tuple in
§2). Adding a hub later = one adapter module + one tuple member + one capabilities row — the
mapped-type registry makes a missing piece a compile error, and nothing else changes.

---

## 5. The gif-search migration delta (honoring gallery-design §5's own criterion)

`gallery-design.md` §5 homed gif search/import on `domain/assets` explicitly *because* no
remote-browse leaf existed, and recorded the criterion: *"if B5 card-hub browsing is ever
greenlit, THAT is the moment a real remote-browse leaf exists and gif search migrates into it."*
B5 is hereby greenlit (D61), and G7 is not yet built — so gif search/import land **directly in
`domain/hub`** (`verbs/gifs.ts`), no build-then-migrate:

- The **wire contracts are unchanged** (gallery §5's `gifSearchParamsSchema` etc. move to
  `@orb/contracts/hub` verbatim; the tRPC procedures mount under the hub router).
- The **adapter** (`infra/network/gif-search.ts`) is unchanged in shape — a gif provider is NOT
  a `HubAdapter` (no cards, no preview/import-to-characters); forcing Tenor under the card-hub
  contract would be a false unification. It stays its own small adapter beside `hubs/`.
- `importGif` now reaches `assets.store` + the `gallery_items` insert via **injected ops**
  (`storeAsset`, `addToGallery`) instead of being an assets sibling verb — the standard
  cross-feature injection; everything else in gallery §5 (allowlist, `"gallery"` kind, one-call
  store+curate, the credential label, the CSP note) carries verbatim.
- `gallery-design.md` §5/§8 take a one-line home delta (recorded there), and G7's dependency
  line gains "the hub leaf (H2)".

*Rejected:* leaving gif in assets "since it was designed there" — that leaves two
remote-catalog-search homes the day hub ships, which is exactly the two-homes state the recorded
criterion existed to prevent.

---

## 6. Hub auth posture — v1 is public-endpoints-only

Marinara carries per-hub user auth (pygmalion `set-token`, chartavern `set-cookie`) held in
server-process memory — fine for its single-user posture, wrong for orbweaver (a process-global
token is cross-user state). **v1 ships only the public unauthenticated surfaces** (all four v1
hubs search + download without auth). **Flip criterion, recorded:** when authenticated hub
features are wanted (NSFW unlock, favorites), hub credentials land as per-user labeled
credentials in `domain/credentials` (`hub:<key>` labels — the exact gif-API-key pattern gallery
§5 committed), threaded to the adapter as an optional `HubIo.credential`; nothing about the
adapter contract changes. Until then the capability schema simply has no auth axis — adding one
is additive.
