---
kind: spec
status: shipped
updated: 2026-07-11
---

# Export / Import — the uniform portability subsystem (master)

> **SHIPPED / AS-BUILT (2026-07-11).** Nate approved a COMPLETE, uniform export/import portability
> subsystem covering EVERY entity — "do it right once." The failure mode is 8 divergent implementations;
> this doc makes them ONE template + ONE delivery core + a per-entity registry. Grounded in the
> already-built pairs (card · chat · persona · lorebook). A per-item audit confirmed every non-deferred
> item in this doc is genuinely implemented.
>
> Absorbed `export-deferred-surfaces.md` (bulk zip export → §3 delivery core) and the FORWARD plan of
> `import-st-profile-waves.md` (now the ST-IMPORT ADAPTER LANE, §5). Both docs were retired and their
> \~12 code citations repointed here (R9, audit R9, 2026-07-11).

## §1 — the uniform per-entity TEMPLATE (the do-it-right-once shape)

Every portable entity is the SAME five parts. Learn one, build six. A new entity = fill the five slots +
register (§2); it NEVER touches the delivery core (§3).

| Part | What | Home | Rule |
| - | - | - | - |
| 1. serde | `build<E>(canonical) → bytes` + `parse<E>(bytes) → canonical \| null`, BOTH halves adjacent, a `schemaKind`+`version` envelope, a round-trip pin | `server/kit/serde/<E>` (server-only — the delivery model is byte upload/download; the client never parses portable files) | ONE home; build+parse can't diverge (the card/chat precedent) |
| 2. export verb | reads the OWNER's rows → canonical → `build<E>` → `{filename, bytes}` | the OWNING domain (`<E>/verbs/export.ts`) | owner-scoped (`principal.userId`); pure read + serde |
| 3. import verb | `parse<E>(bytes) → canonical` → write | the OWNING domain (`<E>/verbs/import.ts`) | idempotent (a per-entity dedup key); writes its OWN tables |
| 4. Option-B write op | a cross-domain bulk-write op | the OWNING domain's `persistence/import-write.ts` | ONLY when a FOREIGN aggregator (the `import`-ST lane, §5) writes into this entity — self-contained backup skips it (the verb is already in the owner) |
| 5. registry entry | `{ kind, dir, ext, exportAll, importFile }` composed from 1–3 at the entry root | `entry/compose` | the delivery core (§3) iterates it |

**The round-trip pin is MANDATORY per entity** (`build(parse(build(x))) === build(x)` in the serde's
mirror test) — the structural guarantee against the two halves drifting. It is the acceptance test for a
"done" entity.

**Two write modes (both covered by the template):**

- **(a) Self-contained backup** — a single owner-scoped entity: the export/import verbs live IN the owning
  domain and write their own tables directly (part 4 not needed). persona-backup, preset, theme,
  user-settings, standalone-tag, standalone-world-info.
- **(b) Aggregated / ST-profile import** — the `import` domain orchestrates writes into MANY domains at
  once (it can't write cross-domain), so each target domain exposes an Option-B owned bulk-write op (part
  4\) that `import` calls through a contract-typed injected op. chat/persona/lorebook bulk ops (BUILT).

**Serde location rule (uniform, not divergent):** default `server/kit/serde/<E>`. The ONE exception is an
entity whose file the CLIENT must also parse (none today under the upload/download delivery model) → its
serde would live in `@orb/contracts/<E>` (client-reachable). Preset's existing codec sits in
`contracts/preset` for legacy reasons (§4 preset; R4-relocate).

## §2 — the shared entity REGISTRY (the do-it-right-once mechanism)

The delivery core (§3) is ENTITY-AGNOSTIC. Each entity REGISTERS a `PortableEntity` descriptor; the core
iterates the registry. Adding an entity = add a descriptor, never edit the core.

```ts
// @orb/contracts/portability — the registry contract the delivery core consumes (AS-BUILT). The kind union
// gained `gallery` (curation rows) + `assets` (the CAS blob transport — audit A-1) beyond the original 8.
export type PortableKind =
  | "character" | "chat" | "persona" | "world-info" | "preset" | "theme" | "user-settings" | "tag"
  | "gallery" | "assets";

/** One portable file inside a bundle: its relative path + bytes. */
export interface PortableFile {
  readonly filename: string; // relative to `dir`, e.g. "Aria.png" / "my-preset.json"
  readonly bytes: Uint8Array;
}

/** The per-file import result the core aggregates into the bundle report (never throws for one bad file —
 *  isolated, operator-auditable, like the card `failures[]`). */
export interface PortableImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean; // false = deduped/replaced (idempotent re-import)
  readonly error?: string;
}
```

```ts
// server-side descriptor (composed at entry/compose from each domain's export/import verb + serde).
export interface PortableEntity {
  readonly kind: PortableKind;
  /** The bundle subdirectory (e.g. "characters/", "presets/") — the ONLY per-entity routing key on upload. */
  readonly dir: string;
  /** The file extension the core round-trips (".png" / ".jsonl" / ".json"). */
  readonly ext: string;
  /** Stream the OWNER's rows → portable files (lazy — the core zips as it pulls; bounded memory). NO signal
   *  param (as-built): cancellation is the DRIVER's job (it stops pulling) — an AbortSignal cannot live in
   *  this isomorphic DOM/node-free contract, the same reason the provider request shapes keep it server-side. */
  readonly exportAll: (ownerId: UserId) => AsyncIterable<PortableFile>;
  /** Import ONE file into the owner's library (idempotent; the domain's import verb + serde). Never throws
   *  for a malformed file — returns `{ok:false, error}` so one bad entry can't abort the bundle. No signal
   *  param (the driver checks its own cancellation between files). */
  readonly importFile: (ownerId: UserId, file: PortableFile) => Promise<PortableImportOutcome>;
}

/** The registry the delivery core iterates. Assembled ONCE at entry/compose; adding an entity appends here. */
export type PortabilityRegistry = readonly PortableEntity[];
```

The core does exactly two things over the registry:

- **download** (`exportAll`): for each requested `kind` (or ALL), pull `exportAll(ownerId)` → write each
  file under `<dir>/<filename>` into the zip stream. One entity → a single-entity file/zip; all → the
  full-account bundle.
- **upload** (`importFile`): unzip → for each entry, route by its top `<dir>` to the matching descriptor's
  `importFile`. Unknown dirs are recorded + skipped (never fatal). Per-file outcomes aggregate into a
  bundle report.

**Ordering hazard (the ONE core-level rule):** some entities reference others (chats seat characters +
personas; character books attach to characters). On a full-bundle import the core imports in a fixed
DEPENDENCY ORDER declared by `PORTABLE_IMPORT_ORDER` (AS-BUILT): `assets → user-settings → tag → persona →
world-info → character → gallery → preset → theme → chat`. (`assets` FIRST so every FK/inline `asset:<id>`
re-links to a live blob; characters before chats; personas before chats; tags/world-info before characters
so card-tag / embedded-book attach resolves; gallery after character + assets, the rows it references.)
This is the ONLY cross-entity knowledge in the core, and it's data (array order), not branching.

## §3 — the delivery core (built ONCE, entity-agnostic) — security-executor owns the IMPL

The implementation (untrusted-archive handling) is routed to security-executor; THIS doc fixes the
contract it consumes (§2) + the belts it must honor. Pieces:

- **`infra/storage/zip.ts`** (AS-BUILT) — the ONE streaming zip home: `packZip(AsyncIterable<ZipEntry>) →
  ReadableStream` (download) PAIRS with `extractZip(bytes | ReadableStream) → StagedArchive` (upload — the
  decompressed entries STAGE to a temp DISK dir, read back one at a time, so a full all-blobs bundle never
  buffers whole in RAM). Belt battery: per-entry declared-size cap BEFORE decompression + streamed byte
  counter (lying-header guard) + declared-vs-actual + CRC + method allowlist (encrypted reject) + zip-slip
  guard + ZIP64 reject + aggregate-decompressed DISK cap. NEVER a second zip impl (the one-home principle).
- **PD-94** — the untrusted multipart routes (`POST /api/import`, `POST /api/assets/upload`) enforce a
  `hono/body-limit` cap; `POST /api/import/bundle` tightens the extract caps (256 MiB compressed / 10 GiB
  aggregate-decompressed DISK cap — raised from the RAM-era 1 GiB now that `assets` carries every blob).
- **HTTP (`entry/http`)** (AS-BUILT) — download: `GET /api/export/library?kinds=…` (owner-scoped, streamed
  zip; `kinds` omitted = everything). upload: `POST /api/import/bundle` (auth-FIRST before the body is read —
  the 401-before-buffer belt; CSRF-before-body; extract to the `IMPORT_STAGING_DIR` staging root; run
  `runBundleImport`). DONE\[workload]: the workload-backing (single-active lock + progress + no
  request-timeout) IS built — the route returns `202 {workloadId}` backed by
  `domain/workloads/runners/import-bundle.ts`. The existing single-entity routes
  (`GET /api/export/{character,chat}/…`, `POST /api/import` — cards) stay as thin front-ends; the
  `POST /api/import/zip` route the ST lane §5 imagined does NOT exist (a ZIP bundle is the
  `/api/import/bundle` path).
- **driver** — `entry/import/run-bundle-import.ts` (AS-BUILT; the generalization of `run-profile-import.ts`):
  `extractZip` → group by dir → iterate the registry in `PORTABLE_IMPORT_ORDER` → per-file `importFile` with
  double isolation (never-throw contract + a driver try/catch) → dispose the staged archive. Cross-owner
  re-link (assets/gallery) + the per-chat `enqueueBackfill`/`reconcileStats` ride each entity's own descriptor
  (the chat descriptor's per-owner `ImportContext`), not a single post-run gate.

## §4 — the per-entity WAVE MATRIX (fresh scout, 2026-07-11) — state + exactly what each needs

All ten kinds are AS-BUILT + registered (`entry/compose/portability.buildPortabilityRegistry`); the P-8 lock
test (`tests/server/entry/import/bundle-round-trip.int.test.ts`) round-trips one of each through a fresh box.

| # | Entity | Serde | Export | Import | Owned write | STATE |
| - | - | - | - | - | - | - |
| 1 | **character** | `kit/serde/card` ✓ (build+parse+hash, round-trip pinned) | `export-character` ✓ | `import-character` ✓ | `character.create/update` (injected) ✓ | **DONE + REGISTERED** (the template's reference) |
| 2 | **chat** | `kit/serde/chat` ✓ (round-trip pinned) | `export-chat` ✓ | `import-chats` ✓ | chat bulk-op ✓ | **DONE + REGISTERED** — the `chats/<host-handle>/<file>.jsonl` handle-layout (G-3); import resolves the handle → `findByHandle` → the chat bulk-op |
| 3 | **persona** | `kit/serde/persona` ✓ (round-trip pinned) | `verbs/export.ts` ✓ | `verbs/import.ts` ✓ (idempotent-merge on `(ownerId,name)` — G-7 fixed) | persona insert/merge ✓ | **DONE + REGISTERED**. ST `settings.json` stays a SEPARATE adapter → the canonical shape (§5) |
| 4 | **world-info standalone** | `kit/serde/world-info` ✓ (round-trip pinned) | `world-info/verbs/export.ts` ✓ | `world-info/verbs/import.ts` ✓ | `createImportStandaloneLorebook` (dedup `(ownerId,name)`) ✓ | **DONE + REGISTERED** (embedded-in-card book still rides the card serde) |
| 5 | **preset** | codec `buildPresetFile`/`parsePresetFile` (contracts/preset, `schemaKind`+version envelope) ✓ | `preset/verbs/export.ts` ✓ | `preset/verbs/import.ts` ✓ | preset domain direct ✓ | **DONE + REGISTERED** (orb-NATIVE backup; the ST sampler import is R4-OUT). R4 codec-relocate to `kit/serde/preset` still OPEN (kept in contracts) |
| 6 | **theme** | `kit/serde/theme` ✓ (round-trip pinned) | `settings/verbs/export-theme.ts` ✓ | `settings/verbs/import-theme.ts` ✓ | `themes` table ✓ | **DONE + REGISTERED** (orb-native only, R7) |
| 7 | **user-settings** | `kit/serde/user-settings` ✓ (fence pinned) | `settings/verbs/export-user-settings.ts` ✓ | `settings/verbs/import-user-settings.ts` ✓ | `user_settings` blob (per-namespace MERGE) ✓ | **DONE + REGISTERED** — SECRETS FENCE (below) |
| 8 | **tag** | `kit/serde/tag` ✓ (round-trip pinned) | `tag/verbs/export.ts` ✓ | `tag/verbs/import.ts` ✓ | `tags` table (merge on `(ownerId,lower(name))`) ✓ | **DONE + REGISTERED** (orb-native only, R7) |
| 9 | **gallery** | `kit/serde/gallery` ✓ | `assets/verbs/export-gallery.ts` ✓ (subject id → HANDLE) | `assets/verbs/import-gallery.ts` ✓ (HANDLE → owner's char id) | `gallery_items` (dedup `(assetId,subject)`) ✓ | **DONE + REGISTERED** (audit A-1 curation) |
| 10 | **assets (blobs)** | opaque bytes + `substrate/portable-asset-file` filename codec ✓ | `assets/verbs/export-assets.ts` ✓ (FK registry ∪ inline `asset:<id>` refs) | `assets/verbs/import-asset.ts` ✓ (hash-verified restore under original id) | `storeBlob` (CAS + row) ✓ | **DONE + REGISTERED** — the blob transport (audit A-1; closes the SillyTavern-problem G-1) |

**W-settings secrets fence (HARD CONSTRAINT — a settings export MUST be safe to share):** the
`user-settings` serde exports a strict **ALLOWLIST** of share-safe namespaces ONLY (appearance / theme-ref
/ memory-opt-out / chat-display prefs), never the raw blob. Allowlist (not denylist) FAILS SAFE — a future
sensitive namespace is excluded by default until explicitly allowed. Explicitly FENCED OUT: `credential.*`
(`credential.source` + any connection-secret-adjacent field), anything referencing the `credentials`
domain, any auth/session field. (Raw API keys/tokens/password hashes live in the `credentials` domain —
which has NO portable entity, by design — NOT in `user_settings`, so the fence is defense-in-depth over an
already-key-free blob.) A `no-secret-in-portable` gate candidate: the user-settings serde's output type is
a closed allowlist union, so a secret field is unrepresentable (the wire-event secret-unrepresentable
precedent).

## §5 — the ST-import ADAPTER LANE (reframed `import-st-profile-waves.md`)

The ST import is NOT a parallel subsystem — it is a set of ADAPTERS from SillyTavern formats INTO the SAME
canonical shapes + owned write ops the orb-native portability uses. It feeds the registry's `importFile`
path; it never has its own write. Coverage:

- card (ST PNG/JSON) → `kit/serde/card` `cardFromJson` → character write. BUILT.
- chat (ST JSONL) → `kit/serde/chat` `parseChatJsonl` → chat bulk-op. BUILT (W0).
- persona (ST `settings.json` `power_user.personas`) → `parseStPersonas` → persona bulk-op. BUILT (W0).
- embedded lorebook (ST `character_book`) → `kit/serde/card` extract → world-info bulk-op. BUILT (W1).
- standalone `worlds/*.json` (ST) → the NEW `kit/serde/world-info` parse (W-worldinfo) → world-info write.
- preset ST sampler import → **OUT (R4)**. themes/tags/user-settings → no ST equivalent.

The as-built detail of these adapters + the Option-B write ops now lives here (§5); the retired
`import-st-profile-waves.md` code citations were repointed to this section (R9).

## §6 — build order (waves, after ratify)

1. **W-registry** — the `@orb/contracts/portability` contract (§2) + the entity-agnostic delivery core
   contract seams. (Impl of the core = security-executor.)
2. **W-persona** (consolidate serde — smallest, proves the template on an existing split pair).
3. **W-worldinfo** (standalone serde + verbs; leverages W1 + the card entry projection).
4. **W-preset** (verbs over the existing codec).
5. **W-theme**, **W-tag** (net-new, orb-native, structurally identical — build together).
6. **W-settings** (net-new + the secrets fence + the gate).
7. **Delivery core + bundle routes** (security-executor) — consumes the registry once all descriptors exist.
8. Retire `export-deferred-surfaces.md` + fold `import-st-profile-waves.md` (R9, code-commit — DONE 2026-07-11).

Each entity wave is: serde (+round-trip pin) → export verb → import verb → registry descriptor → mirror
tests. Uniform. A wave is "done" only when its round-trip pin is green.

## §7 — owner rulings to surface (ratify before building)

| # | Ruling | Recommendation |
| - | - | - |
| R1 | Adopt the uniform §1 template + §2 registry as the ONE mechanism (no per-entity divergence) | YES — the whole point |
| R2 | Per-entity files AND a full-account "backup everything" bundle — support BOTH? | YES both (the registry gives both for free: one `kind` vs all) |
| R3 | Secrets fence for user-settings = strict ALLOWLIST of share-safe namespaces (fail-safe), NOT a denylist | YES allowlist + the `no-secret-in-portable` gate |
| R4 | Themes / tags / standalone-world-info = orb-native ONLY (no ST-compat import) | YES (ST has no shareable theme/tag/standalone format; R4/R7 spirit) |
| R5 | Preset codec: RELOCATE `contracts/preset` → `kit/serde/preset` for uniformity, or KEEP in contracts (client-reachable exception)? | Relocate + verify no client consumer; else keep + document the exception |
| R6 | Standalone world-info import lands books UNATTACHED (user attaches via existing verbs); dedup `(ownerId, name)` reuse-or-replace | YES unattached |
| R7 | user-settings restore = per-namespace MERGE (restore only present share-safe namespaces), not whole-blob replace | YES merge |
| R8 | Uniform per-file envelope: every portable file carries `{schemaKind, schemaVersion}` (the `NeoPresetFile` precedent) for forward-compat lift-walks | YES uniform envelope |
| R9 | The doc rename/merge (`import-st-profile-waves.md` + `export-deferred-surfaces.md` → this master, repoint \~12 code citations) — **DONE 2026-07-11**, both docs deleted, all citations repointed | Closed |
| R10 | `credentials` has NO portable entity (secrets never leave the box) — confirm no "export my connections" is ever wanted | Confirm OUT (a re-enter-keys posture on restore) |
