# Orbweaver — `serialization-core`: ONE serde core, import + export share it

> **Status: planning (authoritative detail).** Serde is the cross-cutting thread §7.3 — the place where
> the canonical model meets the ST/V3 wire, in BOTH directions. This doc consolidates the serde thread
> (import IN + export OUT + the card/WI-entry/role mappers + the PNG codec) into **ONE canonical core +
> gates**, so a round-trip (import → export → reimport) is a one-file invariant rather than a cross-domain
> test contract. The two consuming domains carry the detail: `domains/import.md` (the IN consumer —
> tolerant parsers, the canon write, the events shift, the bulk-loop unification) and `domains/export.md`
> (the OUT half — assembly + db reads + packaging, the lossiness fix, the proposedTags round-trip).
> `domains/character.md` §7.3 owns the canonical-card schema (already typed — see below). Authoritative
> upstream: `_FANOUT-BRIEF.md` §7.3 (the serde recon — it CORRECTED the first read), `structure.md` §7
> (the gate set), `reports/shared-dissolution.md` §1–§5 (the serde homes, CITE-authoritative).
> `domains.md` carries the summary.

## 0. The principle — ONE serde core, shared by import + export

neo-tavern carries **two drifting mappers**: export's card emitter and import's card reader are independent
code coupled only by round-trip tests; the ST role-map is written **4×**; the WI-entry mapping is
hand-duplicated import-vs-export; the PNG chunk-walk is copied (read half in `import/card.ts`, write half
in `export/png.ts`, a 3rd inline `isPng` in `http/import.ts`). The recon **corrected the first read**: the
"3 card shapes" are a *justified* emit/read pair, not gratuitous duplication, and the PNG codec is a
read/write pair — not scatter. The steady clone already lifted the mappers into `_shared/serde` + the codec
into `_shared/png-card-codec`. **Orbweaver finishes the job** by giving each a real layer-cake home + a gate.

> **Orbweaver: the card↔wire mapping, the WI-entry mapping, the PNG codec, and the ST role bimap each
> live in exactly ONE module, consumed by both directions.** `import` is the IN consumer (tolerant);
> `export` is the OUT consumer (strict). The emit/read halves live **adjacent** in one serde module so
> "what `buildCardV3` emits re-parses cleanly through `cardFromJson`" is a one-file invariant.

The canonical card is **ONE fully-modeled shape** in `@orb/contracts/character`. Its Zod schema validates
BOTH the wire (tRPC CRUD) AND the import normalizer — one schema, two front doors. The tolerant `RawCard`
reader **stays**, but only as an **input adapter that normalizes INTO the canonical model**, never a
parallel lossy shape. The `raw` blob is **gone** — `creator`/`cardVersion`/`regexScripts`/`extensions` are
typed columns now, so `raw` is reserved for genuinely-unknown vendor extras (residual `extensions`), if ever.

## 1. The layout — four homes, one direction each

| Concern | neo-tavern (drifting) | orbweaver home | Why this tier |
|---|---|---|---|
| **Canonical card** | 3 shapes; `creator`/`cardVersion`/`regex_scripts`/`extensions` survive only via `raw` | `@orb/contracts/character` — `CharacterCard`, `characterCardV3Schema`, `CHARA_CARD_V3_SPEC` | Cross-boundary: server emits, client renders forms, the import normalizer validates. `contracts` is the only tier client + server both depend on. |
| **Card mapper** | `buildCardV3` (export) ≠ `cardFromJson` (import), test-coupled | `@orb/server/kit/serde/card` — `cardFromJson` (IN) + `buildCardV3` (OUT) adjacent | Server-only pure (no client consumer), uses zod internally → `server/kit`, not `kit`. |
| **WI-entry mapper** | hand-duplicated import vs export | `@orb/server/kit/serde/world-entry` — `loreEntryColumns`/`loreEntryMetadata` (IN) + `exportBookEntry` (OUT) | Same serde core; both directions adjacent. |
| **PNG codec** | chunk-walk copied 2× + inline `isPng` 3rd | `@orb/kit/png-card-chunk` — `isPng`/`readCardChunk`/`writeCardChunk` (+`crc32`/`makeChunk`/`PNG_SIGNATURE`) | **String-based, so it NEVER imports the card type** → isomorphic-pure → `kit`. Operates on `Uint8Array` + an isomorphic base64/latin1 codec — **NO `node:buffer`** (the kit-purity gate forbids all `node:*`; see §3). |
| **ST role bimap** | written 4× (`persona.ts`, `lore.ts`, `card-v3.ts`, `card.ts`) | `@orb/kit/world-info` — `injectionRoleFromSt`/`injectionRoleToSt` | ONE bimap `{0:system,1:user,2:assistant}`; the most cross-shared union (character+persona+world-info). Verified single-homed in steady (`world-info-schema.ts:80/88`). |
| **`resolveCharacterDepthPrompt`** | `shared/character/character-schema.ts` | `@orb/server/kit/serde` | **CORRECTED 2026-06-25** (verified): TWO server consumers — `export/verbs/export-character.ts` AND `chat/assembly/context.ts` — so a `character/substrate` home would force a cross-feature import. Server-only, uses zod → `server/kit`. Fold the unknown→`{prompt,depth,role}` coercion into the canonical card / serde so the export verb stops calling it directly. |

### The emit/read pairs (the shared core), per entity

| Pair | One home | import (IN) uses | export (OUT) uses |
|---|---|---|---|
| `cardFromJson` ⟷ `buildCardV3` | `@orb/server/kit/serde/card` | `parseCardPng`/`parseCardJson` wrap `cardFromJson` | `exportCharacter` calls `buildCardV3` |
| `loreEntryColumns`/`loreEntryMetadata` ⟷ `exportBookEntry` | `@orb/server/kit/serde/world-entry` | character writer | export verb |
| `readCardChunk` ⟷ `writeCardChunk` | `@orb/kit/png-card-chunk` | `readCardChunk` (decode) | `writeCardChunk` (encode) |
| `CharacterCard` + `characterCardV3Schema` | `@orb/contracts/character` | parser return type | emit/validate |
| `injectionRoleFromSt` ⟷ `injectionRoleToSt` | `@orb/kit/world-info` | serde + persona parser | serde |

The two consuming domains keep only their **own** halves: import keeps the tolerant byte/format parsers
(`parseCardPng`/`parseChatJsonl`/`parseStPersonas` + `cardContentHash`); export keeps the OUT assembly
(which rows to read, how to fold variants) + the chat interchange builders (`buildChatJsonl`/`buildChatTxt`)
+ packaging (`basePng`, the download slug). **Both read `@orb/db` schema directly** — sanctioned
bulk-serializer access, not a sibling front-door reach (see `character.md` Movement).

### The canonical card is ALREADY done — preserve, don't re-derive

**STATUS: the full-card promotion is DONE in the steady clone, not pending.**
`creator`/`cardVersion`/`regexScripts`/`extensions` are typed columns on `character_versions`
(`db/schema/character.ts:137-140`) and the `raw` blob is dropped — so an app-authored card already
round-trips identically to an imported one. `import.md` + `export.md` both independently confirmed this
against the code; the earlier "promote (pending)" framing was stale recon. **Orbweaver's job is to
preserve this**: keep the schema in `@orb/contracts/character`, keep one schema validating both the wire
and the import normalizer, and reconcile any doc that still lists a lossy `raw` column. (Any rewrite that
re-introduces `raw`-only provenance is a regression — it silently drops fields on app-authored cards.)

### The import-emits-events shift (the consumer-side change serde unlocks)

Today import stops at row INSERT and emits NOTHING (verified: zero `emit`/`bus`/`publish` in
`domain/import` or `http/import.ts`), so imported content never auto-indexes. **In orbweaver import is a
canon-write that emits `character.updated`** (via an injected `emit` op) + **enqueues a memory backfill**
for the `real_conversation`-bucketed chats. The embeddings indexer (`onCharacterUpdated → embeddings.store
(kind='card', lens='card-text', …)`) and the memory backfill subscribe — so card text auto-indexes on
import, the central fix. Import never reaches into `embeddings`/`workloads` sideways; it receives `emit` +
`enqueueBackfill` ops on its context, wired at the composition root. (Full detail: `import.md` §"two locked
shifts" (1).)

### The bulk-loop unification

Two bulk loops drive import today — the HTTP zip route and the `import-st` job runner. Steady ALREADY
unified the INNER per-character `store→import→failures[]` loop into `importCollectedProfile`; both callers
drive it. The residual drift is the OUTER driver: the zip route does `extractZip`+`findProfileDir`; the job
runner does `reloadAppConfig`+`reconcileStats`. **Target: ONE composition-layer driver at
`entry/import/run-profile-import.ts`** (collect → store → import → reconcile/emit); the HTTP route + job
runner become thin adapters (parse request / report progress). This is an `entry/` composition concern, not
a domain unit — only `entry/` may import two domain front doors (`domain/import` + `domain/assets`).

### Already clean — do not touch

The **parse/write split**, the **shared chat-writer** (`importChatsIntoVersion`), and **idempotency
hashing** (`cardContentHash` over semantic fields, not PNG bytes) are correct as-is. Carry them forward.

## 2. Esoteric / load-bearing (do not flatten)

1. **PNG dual-chunk write** (`writeCardChunk`, verified `png-card-codec.ts:100-146`): the card JSON is
   embedded as **BOTH** a `chara` (V2) and a `ccv3` (V3) `tEXt` chunk — **V2 first, V3 second, both before
   IEND**. A V2-only importer reads `chara`; a V3-aware importer prefers `ccv3`. The V2 chunk is the same
   blob with top-level `spec`/`spec_version` stripped. CRC-32 poly **`0xedb88320`** (table built once);
   keyword null-separated from a **base64** value; the `keyword\0value` layout round-trips byte-for-byte
   through **latin1** (base64 is ASCII, so a pure latin1↔bytes map works over `Uint8Array` with no
   `node:buffer`). Stale `chara`/`ccv3` chunks are dropped on write. **Throws** if the base isn't a PNG or
   has no IEND. Do not "simplify" to a single chunk — the dual write is the cross-tool compatibility
   convention.
2. **Round-trip-pinned `buildCardV3 → cardFromJson`**: the strict OUT emitter's output must re-parse
   cleanly through the permissive IN adapter. This is the one invariant that makes import→export→reimport
   lossless — and why the two halves live adjacent in one serde module.
3. **The `constant → scopeMode:"always"` WI round-trip** (`world-entry-serde`): `loreEntryMetadata` derives
   `scopeMode:"always"` from ST's `constant: true` (the runtime reads `scopeMode`, not `constant` — a keyed
   constant entry would otherwise silently demote to keyword scope); `extensions.{position:4, depth, role}`
   → `metadata.inject` (role via the bimap). `exportBookEntry` is the exact inverse — the metadata blob is
   spread as the base so a round-trip doesn't strip fields the typed columns don't cover; typed columns
   override the keys they own. Byte-identical round-trip is test-pinned. This is the one place the at-depth
   encoding is written.
4. **The tolerant `RawCard` → canonical normalization** (the IN adapter's value): detection ORDER
   (`spec`/`data` → `char_name` Pygmalion → `name` V1); `selectBestCharacterBook` (most-NAMED-entries wins
   when a card embeds a book twice); `extractLorebook` (entries are dict-OR-list in the wild);
   `parseDepthPrompt` (depth defaults to ST's 4; role via the bimap). Without this, ~5–15% of a real corpus
   silently fails to import. The adapter is permissive on input but emits the ONE canonical shape.
5. **The `proposedTags` shape problem — WIRED, not dead.** Its problem is SHAPE (a parallel JSON store),
   not deadness. Per `tag.md`: the `character_versions.proposedTags` JSON column is deleted; `character_tags`
   grows a `status: 'pending' | 'accepted'` column. **Import writes pending junction rows; export reads
   `character_tags WHERE status='accepted'`** for the card's `tags`. **Consequence to flag** (the behavioral
   shift): a freshly-imported card whose tags arrived `pending` and were never accepted will NOT re-export
   its tags until accepted — the reverse of today (proposed always re-export). Intended (accepted =
   canonical), but a visible round-trip change; document for migration.
6. **The stranded ST PRESET mapper is NOT this core.** `shared/prompt/st-preset.ts` + `preset-file.ts` are
   **client-only, zero server consumers**, and never touch import/export — the clearest stranded mapper.
   Its home is `@orb/contracts/preset/serde`, NOT the serde core. Keep it out (it is a preset-config serde,
   not a canon serde).

## 3. The kit-purity caveat (why the codec is `kit` but the mappers are `server/kit`)

The cake flows one way: `kit ← contracts ← db ← server`. The **codec is `kit` BECAUSE it is string-based**:
`readCardChunk(bytes) → string` / `writeCardChunk(png, jsonString) → bytes`. It does byte surgery and never
imports the card type — so it sits below `contracts` cleanly. **If it imported the card type it could not
be kit** (kit may not import `contracts`). This is the load-bearing reason the codec interface is strings,
not `CharacterCard`. The kit-purity gate (`reports/shared-dissolution.md` §0, LOCKED) is *no
domain/contracts/db import + no `node:*` import* — NOT *no npm dep*. **RESOLVED: the steady codec imports
`node:buffer` (`Buffer.from(…, "base64"|"latin1")`, verified `png-card-codec.ts:9,77,134,140`) — that
import is ILLEGAL in `@orb/kit` under the LOCKED ruling.** The orbweaver codec drops `node:buffer` and does
its base64/latin1 over `Uint8Array` (base64 alphabet + latin1 are both ASCII → a pure byte map, isomorphic,
no npm Buffer polyfill needed). This keeps the codec in `kit` — demoting it to `server/kit` to keep
`node:buffer` would needlessly re-couple the byte engine to the server tier. The **mappers** (`cardFromJson`/`buildCardV3`/
`exportBookEntry`) DO import the card type and use zod → they live in `@orb/server/kit/serde/*` (server-only
pure, below the domains, above the codec). The **canonical card schema** is cross-boundary → `contracts`.

## 4. Invariants (gate candidates)

1. **The serde core is single-homed** — `cardFromJson`/`buildCardV3` exist ONLY in
   `@orb/server/kit/serde/card`; the WI-entry mapper ONLY in `@orb/server/kit/serde/world-entry`; the PNG
   codec ONLY in `@orb/kit/png-card-chunk`; the ST role bimap ONLY in `@orb/kit/world-info`. No second
   card↔wire mapper can exist (there is one exported symbol).
   *Enforcement: resolve-time (the modules are the only export sites) + a `serde-core` lint that fails on a
   duplicate mapper declaration.*

2. **The canonical card is the ONE shape** — `cardFromJson` normalizes INTO `@orb/contracts/character`;
   `creator`/`cardVersion`/`regexScripts`/`extensions`/`depthPrompt` are typed columns; residual
   `extensions` holds only genuinely-unknown vendor keys. No parallel lossy shape.
   *Enforcement: compile-time — promoting a known field into the residual blob is a `tsc` error (the typed
   column is the only home).*

3. **One schema validates both the wire and the import normalizer** — the `@orb/contracts/character` Zod
   schema gates tRPC CRUD AND the IN adapter's output. No disjoint app-CRUD card schema.
   *Enforcement: resolve-time (one importable schema) + lint (`no-inline-types` — no second `z.object` card
   shape outside `contracts`).*

4. **The codec is string-based and kit-pure** — `readCardChunk`/`writeCardChunk` take/return the card JSON
   as a STRING, operate on `Uint8Array`, and never import the card type OR `node:buffer`.
   *Enforcement: lint-time `kit-purity` gate (no domain/contracts import; **no `node:*` import at all** —
   `node:buffer` included).*

5. **The import↔export round-trip is lossless** — `buildCardV3` output re-parses cleanly through
   `cardFromJson`; the WI-entry `constant↔scopeMode:"always"` + at-depth `position:4` encoding round-trips
   byte-identical; the PNG dual-chunk read/write round-trips.
   *Enforcement: test-time — a round-trip identity test on the card pair + the WI-entry pair + a golden-bytes
   test on `writeCardChunk` / `readCardChunk`.*

6. **Import emits `character.updated` for every created/edited character** — no import path writes a
   `character_versions` row without emitting (so the embeddings indexer always runs) + enqueues a backfill
   for `real_conversation` chats.
   *Enforcement: test-time — a contract test asserts importing a card emits `character.updated` and enqueues
   a backfill.*

7. **Proposed tags are junction rows, not a JSON column** — import writes `character_tags` `status:'pending'`;
   export reads `status='accepted'`; no `character_versions.proposedTags` column.
   *Enforcement: compile-time — the `proposedTags` column is absent from the schema → any read/write is `tsc`
   red. (Shared with `tag.md` invariant 4.)*

8. **Bulk serializers read `@orb/db` directly; they do not inject domain services for read data** — import
   + export are the sanctioned exemptions to the front-door rule; the one composition-layer bulk driver
   (`entry/import/run-profile-import.ts`) is the only place that composes two domain front doors.
   *Enforcement: lint-time (dep-cruiser `domain-no-cross-feature` with the sanctioned-db-reader exemption);
   resolve-time (only `entry/` may import two domain front doors).*

## 5. Resolved decisions (was: open)

- **`resolveCharacterDepthPrompt` final home — RESOLVED → `@orb/server/kit/serde`.** Server-only (uses zod),
  TWO server consumers (`export/verbs/export-character.ts` + `chat/assembly/context.ts`), so a
  `character/substrate` home would force a cross-feature import. Consistent across `shared-dissolution.md`
  §5, `character.md` §7.3 movement, and `domains/chat.md`. *Deferred refinement (not blocking):* fold the
  unknown→`{prompt,depth,role}` coercion INTO the serde-out path / canonical card so the export verb reads
  the typed `depthPrompt` column and never calls the helper directly — do this iff the helper ends up with a
  single remaining caller after the serde lands; otherwise it stays a shared `server/kit/serde` helper.
- **The proposed→accepted card-tags re-export semantics — RESOLVED: export accepted-only is the target.**
  `card.tags = character_tags WHERE status='accepted'` (per `tag.md`). A freshly-imported-but-not-accepted
  card does NOT re-export its (pending) tags until the user accepts them — the reverse of today, intended
  (accepted = canonical). Pending tags are NOT included in export. This is a visible round-trip change;
  keep it documented as the behavioral-shift note (Esoteric §5) for migration, not as an open question.
- **`character.updated` vs a dedicated `import.completed` event — RESOLVED: reuse `character.updated`.** The
  embeddings indexer already subscribes to it; a bulk import firing N events is coalesced/debounced at the
  `entry/` bus (the debounce window is an `entry/` tuning detail, not a new event type). No `import.completed`.
- **`node:buffer` under the kit-purity ruling — RESOLVED: the codec uses NO `node:*`.** The steady codec's
  `node:buffer` import (verified `png-card-codec.ts:9`) is illegal in `@orb/kit` under the LOCKED gate (no
  `node:*`). The orbweaver codec does base64/latin1 over `Uint8Array` (both alphabets are ASCII → a pure
  byte map), so it stays `kit` without `node:buffer`. See §3.
- **Bulk-loop unification scope — RESOLVED: the OUTER driver collapses to
  `entry/import/run-profile-import.ts`**, with the HTTP zip route + the `import-st` job runner as thin
  adapters (parse request / report progress). The INNER `importCollectedProfile` per-character loop is
  already unified in steady; only the outer collect→store→import→reconcile/emit driver is being hoisted.

### Still open (deferred, with criteria)

- **Bulk / library zip export — DEFERRED (not in the initial port).** The symmetric counterpart to import's
  zip route (export-many-to-a-zip). *Criterion to build:* when a "download my library" surface is wanted —
  add `exportLibrary` to export's packaging layer (`export/substrate/` + a streaming `entry/http` route);
  the serde core is unchanged, only the packaging layer grows. Not a serde-core concern.

## 6. Synthesis

The serde thread is **one core with four homes**: the canonical card shape in `@orb/contracts/character`
(already fully typed — `raw` dropped, verified done), the card + WI-entry mappers in
`@orb/server/kit/serde/*` (emit/read pairs adjacent so the round-trip is a one-file invariant), the
string-based PNG codec in `@orb/kit/png-card-chunk` (kit *because* it never imports the card type), and the
ST role bimap in `@orb/kit/world-info` (one copy, was 4×). Import is the tolerant IN consumer (the `RawCard`
adapter normalizes INTO the canonical model, never a parallel lossy shape); export is the strict OUT
consumer; both read `@orb/db` directly as sanctioned bulk serializers. The two consumer-side shifts serde
unlocks: **import becomes a canon-write that emits `character.updated` + enqueues a memory backfill** (so
imported content finally auto-indexes), and the **two bulk loops collapse to one composition-layer driver**.
The gates make a second mapper impossible (one exported symbol), pin the round-trip (golden-bytes + identity
tests), and keep the codec string-pure (kit-purity). Already clean — leave alone: the parse/write split, the
shared chat-writer, idempotency hashing.
