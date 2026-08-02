# 2026-08-03 — THE LIFECYCLE + PORTABILITY MODEL (stickler design review)

> **Charge (owner, near-verbatim):** "variable CRUD and import/export riding the seams of its
> appropriate domains — we REWRITE the same thing multiple times per domain, we have shape drift or
> possible shape drift, I don't really understand how serde and portability fit into it all, agents
> keep telling me my xyz thingy is MISSING import etc, I thought I made a DI seam skimmer but maybe
> it didn't get built all the way for everything? world-info, tags, personas, characters, chats,
> themes — a lot of things have CRUD and import/export and I think it's scattered — or maybe not?"
> **Posture:** design review over the standing main tree (no diff under review — the gate battery
> was not run for this review, per the 2026-08-03 regex-model precedent; every claim below is
> receipted from files read/swept THIS session). Review-and-propose only; nothing was changed.

---

## §0 The answers up front (then the receipts)

1. **"I thought I made a DI seam skimmer but maybe it didn't get built all the way" — you DID, and
   it IS built all the way for the plane it owns.** `entry/compose/portability.ts::buildPortabilityRegistry`
   is the seam: a DI registry that skims every domain's export/import verbs into 10 `PortableEntity`
   descriptors, consumed by an entity-agnostic delivery core (zip stream down, staged-archive up).
   All 10 registered kinds are DONE and round-trip-pinned
   (`tests/server/entry/import/bundle-round-trip.suite.int.test.ts`). The governing spec is a
   SHIPPED master doc: `docs/architecture/history/export-import-portability.md` (2026-07-11,
   "do it right once" — the uniform 5-part template §1, the registry §2, the delivery core §3,
   rulings R1–R10).
2. **What it does NOT cover is where every "xyz is MISSING import" report comes from.** The registry
   owns exactly ONE plane: the whole-bundle backup/restore. Three planes sit outside it with no
   completeness enforcement: (a) **families born after the spec** (databank is owned canon and is
   simply absent from `PORTABLE_KINDS` — a full-account backup silently drops it, F1); (b) **the
   single-entity doors** (per-family transport routes + client affordances — world-info has BOTH
   verbs built and ZERO doors, F2); (c) **the client lifecycle chrome** (the ruled band=Import /
   kebab=Export anatomy landed for characters/chats/preset and nowhere else, F3).
3. **"We rewrite the same thing multiple times per domain" — true at the serde-file tier, false at
   the delivery tier.** The delivery core, ordering, isolation, caps, and outcome shape are written
   ONCE. But the orb-native JSON serde skeleton (envelope schema + `decodeJson` + drop-bad-rows
   loop + `TextEncoder(JSON.stringify(wire, null, 2))`) is hand-cloned across theme/tag/gallery
   (+ a user-settings variant) — CPD-receipted clone pairs — and the per-family POLICIES (envelope
   key, version gating, parse strictness, error shape, restore/dedup semantics) have drifted
   because no shared spine pins them (§2 F4–F8).
4. **PortableEnvelope was the never-consumed unified envelope — confirmed by archaeology.** Born in
   `b808f760` inside `@orb/contracts/portability` explicitly as the R8 uniform per-file envelope
   ("Each entity narrows schemaKind to its own literal in its serde"); no serde ever imported it —
   each re-spelled `{schemaKind, schemaVersion}` structurally, world-info spelled the key
   `version`, persona shipped with no envelope at all. Deleted as a born-dead orphan in `cfa2049f`
   (export-rot dispositions doc, row D). The deletion was correct under the rot rules; the
   NON-UNIFORMITY it evidences is the live defect (F4).

---

## §1 THE CENSUS — every entity family, full lifecycle surface

Column key: **CRUD** = the live verb set (tRPC unless noted) · **1-EXPORT** = single-entity export
door (server + client affordance + format) · **1-IMPORT** = same for import · **BUNDLE** = the
`PortableEntity` descriptor (`entry/compose/portability.ts`) + backup-pane checkbox
(`features/workloads/lib/portability-model.ts:14-28`) · **SERDE** = codec home · **CHROME** = client
placement vs the ruled anatomy (workboard `docs/retro-workboard.md:1263`: "band=Import, kebab=Export,
rooms/editors carry zero lifecycle chrome" — ruled 08-02 with the characters+chats lane; **not yet a
D-entry**).

### §1a The ten registered kinds

| Family | CRUD | 1-EXPORT | 1-IMPORT | BUNDLE | SERDE | CHROME |
| - | - | - | - | - | - | - |
| **character** | `character.create/get/list/update/remove/duplicate/bulkRemove/bulkArchive/bulkAdd(Remove)CardTag/snapshot/listSnapshots/restore` (`routers/character.ts`) | `GET /api/export/character/:id` → PNG, V2/V3 round-trip (`entry/http/export.ts:24,90-101`; verb `domain/export/verbs/export-character.ts`) — row kebab (`0a8d248c`) | `POST /api/import` multipart cards (`entry/http/upload.ts`, D3) — band Import dialog | `character` descriptor (portability.ts:280-296) | `kit/serde/card` (tolerant `cardFromJson` + strict `buildCardV3` + `cardContentHash`, one file) | **RULED ANATOMY LANDED** (`0a8d248c`: band Import ghost + New primary; kebab Export card; editor CONTEXT-menu export REMOVED) |
| **chat** | `startChat/listChats/getChat/updateTitle/star/archive/delete` + message verbs (`routers/chat.ts:433-557`) | `GET /api/export/chat/:id?format=jsonl\|txt` (`export.ts:25,103-120`, host-gated per D29) — row kebab, both formats | `POST /api/import/chat` — a THIN ARM over the `chat` descriptor (`entry/http/import-chat.ts` header: "the same importFile the bundle core calls… can never drift") — band Import dialog | `chat` descriptor (portability.ts:313-347, `chats/<host-handle>/<id>.jsonl`) | `kit/serde/chat` (`parseChatJsonl`/`buildChatJsonl`/`buildChatTxt`, ST interchange) | **RULED ANATOMY LANDED** (`0a8d248c`; room ⋯ "Download transcript" removed; CT pins editor/room ABSENCE) |
| **persona** | `persona.create/list/get/update/remove/duplicate/setActivePersona/createFromCharacter/connect…` (`routers/persona.ts`) | tRPC `persona.export` → client `downloadJson` (`persona-editor.tsx:87-94`) — **button in the EDITOR** | tRPC `persona.import` (idempotent same-name merge) — **in `persona-settings-surface.tsx:33-61`, a settings surface** | `persona` descriptor (portability.ts:236-268) | `kit/serde/persona` — **NO envelope** (`personaBackupSchema = createPersonaSchema.omit({avatarAssetId})`, `contracts/persona/index.ts:72`); the only serde that THROWS on invalid | **DRIFT — F3**: Export=editor, Import=settings surface; no band/kebab; violates the ruled one-home |
| **tag** | `tag.createTag/listTags/updateTag/removeTag/mergeTags/pruneUnusedTags/setTagOrder/attachTag/detachTag/bulkAttachTag/listPendingSuggestions` (`routers/tag.ts`) | **NONE** (whole-library `tags.json` only, via bundle `kinds=tag`) | **NONE** | `tag` descriptor (portability.ts:159-178) | `kit/serde/tag` (skeleton clone — §2 F7) | **NONE** — `features/tag/*` has zero import/export chrome (swept) |
| **world-info** | `worldInfo.listBooks/getBook/createBook/updateBook/removeBook/duplicateBook` + entry CRUD + `attachToCharacter/Global/Persona/Chat` (`routers/world-info.ts`) | **verb EXISTS per-book** (`createExportWorldBook({ownerId, bookId})`, consumed ONLY by portability.ts:215-227) — **NO route, NO chrome** | **verb EXISTS** (`createImportWorldBook`) — **NO route, NO chrome** | `world-info` descriptor (one file per book) | `kit/serde/world-info` — envelope key **`version`**, not `schemaVersion` (index.ts:36); whole-file-fails-on-one-bad-entry strictness | **NONE** — `features/world-info/*` zero lifecycle chrome (swept); **F2** |
| **preset** | `preset.create/list/get/update/remove/resetToDefault/resolveEffective` (`routers/preset.ts`) | client-side: cached row → `buildPresetFile` → browser download (`preset-library-surface.tsx:88-95`, "Same bytes as the bundle arm") — **list kebab** (O-16 one-home) | tRPC `preset.importFile` — "thin arm over the ONE ImportPreset verb the profile bundle uses" (`routers/preset.ts:86-90`, G6) — **band Import** ghost + ST-import arm (`preset-list-header.tsx`) | `preset` descriptor (portability.ts:200-213) | codec in `@orb/contracts/preset` (`buildPresetFile`/`parsePresetFile` :1786-1823) — the R4-relocate to `kit/serde/preset` is now DEAD: the client export door made the contracts home LOAD-BEARING | **RULED ANATOMY LANDED** (§16.1 + O-16, B2 `5d71e287`) |
| **theme** | `settings.listThemes/getTheme/createTheme/duplicateTheme/updateTheme/removeTheme` (`routers/settings.ts:69-89`; theme is settings-owned per D114) | **NONE per-theme** — even the VERB is whole-namespace (`createExportTheme` → one `themes.json` of ALL owned themes, `export-theme.ts:15-25`) | **NONE** (bundle only) | `theme` descriptor (portability.ts:180-188) | `kit/serde/theme` (skeleton clone) | **NONE** — `theme-row-menu.tsx` has zero import/export (swept) |
| **user-settings** | `settings.getUserSettings/updateUserSettingsSection` (section-patch writes) | via backup-pane "Settings" checkbox (`kinds=user-settings`) | via bundle only (per-namespace MERGE, R7) | `user-settings` descriptor (portability.ts:190-198) | `kit/serde/user-settings` — the SECRETS FENCE (closed allowlist `SHARE_SAFE_SETTINGS_NAMESPACES`, :33-46; `routing`/credential-adjacent structurally unrepresentable) | Backup & Restore pane (`backup-settings-surface.tsx`) — the appropriate home for a namespace blob |
| **gallery** | `assets.addToGallery/removeFromGallery/listGallery` (`routers/assets.ts:21-30`) | bundle only (`kinds=gallery`, one `gallery/…json` of curation rows; character travels by HANDLE) | bundle only | `gallery` descriptor (portability.ts:149-157) | `kit/serde/gallery` (skeleton clone) | none — media curation, backup-pane plane; acceptable |
| **assets** | upload route + `assets.listOwned` + variant resolution | bundle only (blob transport; ALWAYS appended to a partial export — `portability-model.ts:30-37`) | bundle only (hash-verified restore under original id) | `assets` descriptor (portability.ts:141-147) | `substrate/portable-asset-file` filename codec (opaque bytes) | backup pane; per-blob download exists as `/blob/:hash` (D21) — fine |

### §1b The families the task names that are NOT registered kinds

| Family | State | Lifecycle surface | Gap class |
| - | - | - | - |
| **regex (scripts)** | NO domain — three embedded carriers (`UserSettings.regex.scripts` · `PromptConfig.regexScripts` · `characters.regexScripts`), per D53 | CRUD = three different editors at three capability levels; portability = rides the CARD serde (`kit/serde/card` reads V2 root + V3 `extensions.regex_scripts`, re-emits on export) and the preset file; owner-global scripts ride the user-settings… **no — `regex` is FENCED OUT of the user-settings allowlist** (`kit/serde/user-settings/index.ts:32` — "Fenced out: … regex"), so owner-global regex scripts do NOT travel in a backup at all | The whole reshape is spec'd in `docs/reviews/stickler/2026-08-03-regex-model.md` (cited, not redone): R1–R6 lift the carriers into a `domain/regex` library + junctions, R4 = card lift/re-embed. **Rider for THIS review:** the regex program's R2 must also mint a `regex` `PortableEntity` (serde + descriptor + `PORTABLE_IMPORT_ORDER` slot before `character`) or the new library becomes the next databank (F1's class) |
| **databank** | **BUILT domain** (`domain/databank` — created `6359a4ea`, AFTER the 2026-07-11 portability spec; router live: `createFromText/scrapeWeb/scrapeYoutube/scrapeWiki/get/list/rename/remove/reindex/attachGlobal/attachToChat/attachToCharacter/…`) | `documents` is TOP-LEVEL OWNED CANON, D23 KEEP (`db/src/schema/databank.ts:47-90` — `ownerId` stamped, `extractedText` IS the canon) + 3 scope junctions | **F1 — absent from `PORTABLE_KINDS` entirely.** No serde, no verbs, no descriptor, no doors. A full-account backup loses the whole library |

### §1c Owner-authored families with NO portable arm at all (the census beyond the charge's list)

- `automation_rules` + `global_variables` (`db/src/schema/automation.ts:68,193` — both ownerId-stamped
  owner-authored artifacts) — not portable.
- `plugins` / `plugin_kv` — not portable.
- `rpg_games` + snapshots/sheets/journal (chat-anchored campaign state) — not portable, and CANNOT
  ride the chat arm: the chat serde is the ST-jsonl interchange (messages + `note_prompt` +
  `main_chat` only), so a full backup→restore loses every rpg campaign, all `chat_injections`, room
  overrides, chat-attached books, and `chat_tags` re-links (chat ids are not preserved). All of
  these families were born AFTER the portability spec froze its 10-kind list.
- `user_credentials` / the `routing` settings namespace — **deliberately OUT** (spec R10: "secrets
  never leave the box", re-enter-keys posture; the user-settings allowlist fences `routing`). Ruled,
  not a gap.

### §1d The serde/verbs/portability LAYER ANSWER (the owner's "how do serde and portability fit")

Five tiers, one direction — this IS coherent as designed; nothing here is scattered:

1. **`server/kit/serde/<E>`** (+ the preset codec in `contracts/preset`, + `kit/png-card-chunk`):
   PURE byte↔canonical codecs, both directions in one file so build/parse can't drift; round-trip
   pins mandatory (all 8 mirrored under `tests/server/kit/serde/`). Zero I/O, zero db.
2. **The owning domain's export/import VERBS** (`persona/verbs/export.ts`, `settings/verbs/import-theme.ts`,
   `preset/verbs/import.ts`, `world-info/verbs/{export,import}.ts`, `assets/verbs/*-gallery.ts`):
   gather-rows→serde (export) and serde→idempotent-write (import), owner-scoped.
3. **`domain/import` + `domain/export`** (the AGENTS.md §6 domains): the CROSS-domain aggregators
   only — card import fans out to character/tags/world-info/assets via injected ports; chat/character
   export aggregates junctions. Single-family verbs do NOT live here (only `export-character.ts` +
   `export-chat.ts` under `domain/export/verbs/`).
4. **`entry/compose/portability.ts`** (+ `portability-runner.ts`): the composition seam — assembles
   the verbs into the 10 descriptors; `portability-runner` builds the shared profile-import slice
   ONCE for both the descriptors and the ST profile importer.
5. **The doors**: `entry/http/export.ts` (3 GET routes: character PNG, chat jsonl/txt, library zip
   with `?kinds=`), `entry/http/{import,import-chat,import-tree,upload}.ts` (bundle 202-workload,
   single transcript, hostile-tree ingest, bare cards), plus two tRPC doors (preset.importFile,
   persona.export/import).

**Is the descriptor pattern general or preset-only?** GENERAL — all ten kinds ride it, and the
"single door = thin arm over the descriptor/verb" move has now been executed twice (preset G6
`importFile`, chat `POST /api/import/chat`) with the anti-drift rationale written into both file
headers. §16.1's ruling is the generalizable law; it just hasn't been ratified beyond preset+chat.

---

## §2 CONFIRMED FINDINGS

Ranked by consequence. All confirmed by direct reading/sweeps this session; receipts inline.

- **F1 (P1) — Databank is missing from portability entirely; "backup everything" silently loses an
  owned-canon family.** `PORTABLE_KINDS` (`contracts/portability/index.ts:10-24`) has no `databank`
  member; no `kit/serde/databank`, no export/import verbs, no descriptor. `documents` is top-level
  owned canon whose `extractedText` IS the canon (`schema/databank.ts` header). Failure scenario: a
  user takes a full `GET /api/export/library` backup, restores on a fresh box → the entire databank
  library (documents, names, scopes, extracted text) is gone; source blobs restore as unreferenced
  CAS entries via the `assets` arm (and `documents.sourceAssetId` is SET NULL semantics anyway).
  This violates the shipped spec's own contract ("covering EVERY entity — do it right once", doc
  header) — the spec froze at 10 kinds 2026-07-11, databank landed later (`6359a4ea`), and NOTHING
  enforces registry completeness against the schema's set of owned-canon producers. Root cause is
  structural, and it will recur (regex library, any new family) until R1 (§5) lands.
- **F2 (P2) — World-info single-book import/export: both verbs built, ZERO doors.** `createExportWorldBook`
  (per-book!) and `createImportWorldBook` are consumed ONLY by `entry/compose/portability.ts`
  (importer sweep: 2 files — the domain barrel + compose). No HTTP/tRPC route, no client affordance
  (`features/world-info/*` swept clean of lifecycle chrome). Consequence: the owner's exact
  complaint class — sharing ONE lorebook (the single most-shared ST artifact after cards) requires
  a full library-zip round-trip through the backup pane; agents inspecting the domain see finished
  verbs and report the feature as built. The dead-wire-vs-dead-ended-pair class.
- **F3 (P2) — Persona lifecycle chrome violates the ruled one-home anatomy.** Export is a button
  inside the EDITOR (`persona-editor.tsx:169-173` → `onExport` :87-94); Import lives in a settings
  surface (`persona-settings-surface.tsx:33-61`; `use-persona-mutations.ts:36` documents the split).
  The ruled anatomy (workboard :1263, owner-ratified 08-02) is band=Import, kebab=Export,
  rooms/EDITORS carry zero lifecycle chrome — landed for characters, chats (CT pins the absence)
  and preset (O-16). Persona was outside that lane's scope and never re-swept. Consequence: the
  exact inconsistency the owner is naming — four families, three different placements.
- **F4 (P2) — The R8 uniform envelope is drifted three ways, and the type that was supposed to pin
  it died unconsumed.** Ruled: spec R7/R8 — "every portable file carries `{schemaKind, schemaVersion}`".
  As built: theme/tag/gallery/user-settings comply (each re-spelling the envelope schema
  structurally); **world-info spells the version key `version`** (`kit/serde/world-info/index.ts:36`);
  **persona has NO envelope** (`personaBackupSchema`, `contracts/persona/index.ts:72` — a persona
  .json is fenced from foreign files only by its subdirectory + field shape); card/chat are foreign
  ST wire (envelope N/A, correctly). Additionally the compliant four VALIDATE `schemaVersion` as
  any positive int and then parse with v1 semantics regardless — no lift-walk, no reject-newer
  (contrast `parsePresetFile`, which consumes the version as the lift-walk key,
  `contracts/preset/index.ts:1792`). `PortableEnvelope` was minted for exactly this
  (`git show b808f760` — "Each entity narrows schemaKind to its own literal in its serde") and no
  serde ever imported it; deleted `cfa2049f` (export-rot dispositions §D). Consequence: a future
  shape change per family has no uniform forward-compat story, and cross-family tooling (the
  upload router, a future format-sniffer) cannot rely on one envelope.
- **F5 (P3) — Restore/dedup semantics drift per family with no recorded ruling.** Theme import:
  "existing names untouched" — skip (`import-theme.ts` header). Persona: "same-name persona merges
  in place" (portability.ts:261). Preset: "existing same-named preset is merged in place"
  (`preset/verbs/import.ts` header). Tag: merge on `(ownerId, lower(name))` — case-insensitive
  (spec §4 row 8). User-settings: per-namespace merge (R7 — ruled). Failure scenario: a user edits
  a theme and a preset, restores yesterday's backup expecting either restore-wins or current-wins —
  gets restore-wins for the preset and current-wins for the theme. Nothing in the ledger or the
  spec rules the per-family choice (only R7 rules user-settings).
- **F6 (P3) — The orb-native JSON serde skeleton is hand-cloned, CPD-receipted.**
  `reports/cpd/jscpd-report.json`: `serde/gallery ↔ serde/theme` (14 lines) and
  `serde/gallery ↔ serde/tag` (14 lines). By reading: `decodeJson` appears verbatim ×4
  (theme:70-76, gallery:73-79, tag:77-83, user-settings:89-95); the envelope zod object ×4; the
  drop-bad-rows loop ×3; the `TextEncoder().encode(JSON.stringify(wire, null, 2))` emit ×4. Also
  `str`/`nullIfEmpty` helper clones across `serde/card:30-35`, `serde/chat:98-102`, and
  `domain/import/substrate/persona.ts` (the other two CPD hits). This is the owner's "we REWRITE
  the same thing multiple times per domain," located precisely: it is the serde-file tier, not the
  delivery tier. Consequence beyond hygiene: every new family re-derives the skeleton and gets a
  fresh chance to drift a policy (F4/F5/F7 are the harvest).
- **F7 (P3) — Parse-strictness drift: world-info fails the WHOLE file on one bad entry; its three
  siblings drop the row.** `fileEntrySchema` is strict inside `fileSchema`
  (`kit/serde/world-info/index.ts:21-40` — one mistyped entry → `safeParse` fails → null), while
  theme/tag/gallery parse rows individually and drop failures ("a single malformed row is dropped,
  never fatal" — theme:79, tag:86, gallery:82). Both behaviors are documented in their own headers,
  so each is locally deliberate — but the split is unruled, and the bundle consequence differs: one
  corrupt entry in a 200-entry book makes the whole book "not a valid file" in the import report.
- **F8 (P3) — Descriptor bodies at the composition root carry real import logic that the template
  homes in the owning domain.** Template part 3 (spec §1): "import verb: parse → write, in the
  OWNING domain." As built, `entry/compose/portability.ts` itself implements: the persona
  `importFile` (JSON.parse + error strings + the merge call, :252-268), the chat `importFile`
  (bundle-path parsing, `findByHandle` refusal copy, `parseChatJsonl`, hash, :318-347), plus two
  real DB queries (`listHostChats` :107-128, `listOwnedBookIds` :130-134) — while
  `portability-runner.ts:3` claims "Owns no business logic." Consequence: the single-door thin-arm
  pattern has nothing to delegate to for persona (a future `POST /api/import/persona` would have to
  duplicate the compose body or call compose — both wrong), and the refusal copy/error shapes for
  persona+chat live outside any domain's test mirror.
- **F9 (P3, design-gap → fork O-4) — The chat arm is the ST interchange, so post-spec chat-anchored
  state is unportable by construction.** Receipts in §1c. Not a code bug — the jsonl choice is the
  spec's ruled shape (G-3) and correct for ST parity — but the spec predates rpg/injections/
  room-overrides, and "backup everything" now quietly excludes whole planes the owner builds daily.
  Needs an owner ruling, not a patch.

---

## §3 Q1 — WHAT EXISTS AS UNIFIED MACHINERY vs per-domain rewrite

**Genuinely unified (write once, never per-family):**
- The registry contract + kinds axis + import order (`contracts/portability` — data, not branching).
- The delivery core: streamed zip down (`entry/http/export.ts:62-72` iterates the registry),
  staged-archive up with the belt battery (`infra/storage/zip.ts`, spec §3), per-file isolation
  (`PortableImportOutcome` never-throw), the 202-workload backing, the hostile-tree ingest.
- The backup-pane client (checkbox kinds, href builder, report normalizers —
  `portability-model.ts`).
- The ST profile-import slice, built once and shared (`portability-runner.ts:92-104`).

**Co-located but NOT unified (the drift surface):**
- The 8 serde files: same skeleton, hand-cloned, policies divergent (F4–F7).
- The descriptor bodies: some are thin verb wiring (theme/user-settings/preset), some carry inline
  import logic (persona/chat — F8).
- The single-entity doors: three transport styles (HTTP multipart · tRPC fileText · tRPC JSON
  object), existing for 4 of 10 families, absent for the rest (§1a).
- The client chrome: ruled anatomy on 3 families, drifted on persona, absent on 5.

**The lifecycle-audit precedent:** the characters+chats audit (owner-ordered 08-02, lane
`0a8d248c`/`5a894054`) produced per-row verb+affordance+classification tables and closed every
client gap — but the tables themselves lived in the lane report and were never committed; no
equivalent audit exists for any other family. This review's §1 census IS that table for all
families; §4 proposes making it structural so it never has to be hand-audited again.

---

## §4 Q3 — THE UNIFIED MODEL proposal: the LIFECYCLE REGISTRY

The knob-wire-coverage pattern (D107) applied to lifecycle: **every declared family has its doors
wired, OR carries a cited classification — and a family with neither is RED.**

**(a) The completeness gate (the F1 killer).** A `check` gate (ts-morph, house style) derives the
owned-canon family set from the schema (the D23 KEEP list: tables with a stamped `ownerId` that are
user-authored artifacts, plus the membership-scoped `chats`) and requires each to be EITHER a
`PORTABLE_KINDS` member OR a row in a module-const `NON_PORTABLE` registry with a reason +
classification, self-cleaning both directions (the D107 DOORWAY/DEFERRED discipline):
`credentials: RULED-OUT (R10)` · `automation/global_variables/plugins/rpg: <owner ruling, O-4>` ·
`databank: DEFERRED → R2` until built. A new domain that stamps `ownerId` and registers nothing
goes red at birth. This is the one piece that turns "agents tell me X is missing import" from a
discovered gap into a tsc/gate red.

**(b) The door table (the F2/F3 killer).** One exhaustive-by-kind declaration —
`Record<PortableKind, LifecycleDoors>` where `LifecycleDoors = { singleImport: DoorSpec | Ruled;
singleExport: DoorSpec | Ruled; chrome: "band+kebab" | "backup-pane" | Ruled }` — homed beside
`PORTABLE_KINDS`. `Ruled` = a cited bundle-only/none decision (tag and theme, if O-2 rules them
bundle-only). Exhaustiveness is tsc (a new kind must fill the row); the gate's second arm checks
each declared `DoorSpec` names a live route/proc (the registry-cite pattern). The RATIFIED LAW to
mint with it: **every single-entity door is a thin arm over the family's bundle descriptor/verbs**
(§16.1 generalized — preset G6 and `POST /api/import/chat` are the two live precedents; their
headers already state the anti-drift argument).

**(c) The serde spine (the F4–F7 killer).** ONE kit helper for the orb-native JSON families:
`defineJsonSerde({ schemaKind, schemaVersion, plural, rowSchema, toWire, fromWire, rowPolicy: "drop" | "reject-file" })`
in `server/kit/serde/lib/` — owns the envelope (schemaKind literal + version gate: accept `<=`
current, refuse newer with a typed reason), `decodeJson`, the row loop, the deterministic emit, and
re-exports the re-minted `PortableEnvelope` type (this time WITH consumers — the export-rot lesson).
Theme/tag/gallery/user-settings migrate onto it (user-settings keeps its fence projection outside
the helper); future regex + databank serdes are born on it. **Stays per-family, correctly:** card
(ST PNG/JSON multi-spec), chat (ST jsonl), preset (contracts-homed codec, now client-load-bearing —
document the exception where R4-relocate used to be tracked), assets (filename codec). Formats
genuinely differ; only the orb-native JSON skeleton is shareable.
- **Envelope repair semantics:** portable files are EXTERNAL artifacts — NO-LEGACY does NOT apply
  (it governs the db). World-info parse accepts `version` forever, emits `schemaVersion`; persona
  parse accepts envelope-less input forever, build emits the envelope.

**(d) The chrome ruling becomes a D-entry.** The band=Import / kebab=Export / zero-editor-chrome
anatomy currently lives only in the workboard (:1263). Mint it as the D-entry that also disposes
per-family placement: character/chat/preset (landed) · persona (re-home per F3) · world-info (gets
band+kebab with its doors, R4) · tag/theme (per O-2) · user-settings/gallery/assets (backup pane =
the ruled home). CT pins absence in editors/rooms (the `0a8d248c` precedent).

**(e) `entry/compose/portability.ts` evolution.** Descriptor bodies shrink back to wiring: persona
gains a real `verbs/import-file.ts` (bytes → outcome; the compose body moves in); chat's
handle-derivation + jsonl-parse move behind a chat/import-domain op; `listHostChats`/
`listOwnedBookIds` become injected domain ops (export domain / world-info respectively). The file
keeps exactly its stated job: assembling descriptors from verbs.

**(f) Where D24 + the cross-tenant sweep hook in.** Every future portable family keeps per-type FK
junctions (D24 — the gallery/world-info/tag precedent; no `(kind, id)` soft-ref manifest table is
ever needed because the bundle's cross-entity knowledge stays DATA in `PORTABLE_IMPORT_ORDER`).
Every new single-door route/proc enters the cross-tenant sweep classified PROBED/EXEMPT (the
new-router law) — the doors are exactly the owner-scoped surface the sweep exists for.

---

## §5 THE R-STAGED PROGRAM (sizes: S ≈ half-day · M ≈ 1–2 days)

- **R0 (S) — The ruling wave.** Mint the D-entry: the lifecycle anatomy (§4d), the thin-arm law
  (§4b), the per-family restore-policy table (disposing F5 — recommend merge-in-place everywhere,
  O-3), the NON_PORTABLE classifications (O-4 dispositions), and the two parked owner items' homes
  (§6 O-5/O-6). Docs only.
- **R1 (M) — The completeness + door gates** (§4a/§4b). The gate lands on a FIXED tree: its initial
  reds ARE the census gaps, each either fixed in-wave or carrying its ruled cite. Kills F1's class
  permanently.
- **R2 (M) — Databank joins portability.** `kit/serde/databank` (born on the §4c spine) +
  `databank/verbs/{export,import}.ts` + descriptor + `PORTABLE_IMPORT_ORDER` slot (after
  `character`, before `gallery`; chat junction accepted-lossy per O-4) + bundle round-trip pin.
  Fixes F1.
- **R3 (M) — The serde spine + envelope repair** (§4c). Theme/tag/gallery/user-settings onto
  `defineJsonSerde`; world-info dual-key parse; persona envelope; version gating uniform; the CPD
  pairs die. Fixes F4/F6/F7 (F7 via the explicit `rowPolicy` arm — world-info can RULE reject-file
  if that's wanted, but it becomes a declared choice).
- **R4 (S/M) — World-info doors + chrome.** `GET /api/export/world-info/:bookId` (or tRPC) + a
  book-import door, both thin arms over the existing verbs; band Import + row-kebab Export in the
  library surface. Fixes F2. Tag/theme ride the O-2 ruling (each is an S if built — the verbs exist;
  theme needs a per-theme export verb variant).
- **R5 (S) — Persona chrome re-home** (F3): Import → the persona list band, Export → the row kebab,
  editor/settings-surface chrome removed, CT absence pins. Plus the F8 verb re-homes (persona
  import-file verb, chat op) — mechanical, no behavior change.
- **R6 (owner-gated) — The fidelity arm** (F9/O-4): whatever O-4 rules for rpg/automation/plugins/
  chat-room-state portability. Not sized here; the fork decides the shape (a second orb-native chat
  format vs per-family descriptors vs accepted loss).
- **The regex program** (separate, already spec'd — regex report R0–R6) takes the rider: its R2/R4
  must register the `regex` portable entity so the completeness gate stays green by construction.

Per-family impact is fully enumerated in §1; R-stages touch exactly the cells marked NONE/DRIFT.

---

## §6 OWNER FORKS (each with a recommendation)

- **O-1 · Databank portability timing.** (a) R2 as scheduled (next portability wave); (b) defer
  until databank UX stabilizes. **Recommend (a)** — it is owned canon TODAY and every backup taken
  until then is silently incomplete; the serde is small (documents are rows + text + junctions).
- **O-2 · Tag + theme single-entity doors.** (a) RULE bundle-only (a cited `Ruled` cell — tags/themes
  are small libraries, the backup-pane checkbox already gives per-family export); (b) build doors
  (theme needs a per-theme export verb; tag a library import door). **Recommend (a) for tag,
  (b)-lite for theme** — a theme is the artifact people share one-at-a-time (the ST parity class);
  a single-theme export/import pair on the theme picker's row menu is one S lane once the spine
  (R3) exists. Tag sharing has no evidenced demand.
- **O-3 · Restore policy uniformity (F5).** (a) Unify on merge-in-place (restore-wins) everywhere;
  (b) ratify the current per-family split as deliberate, in the D-entry. **Recommend (a)** — the
  user's mental model of "restore my backup" is restore-wins; theme's skip-if-exists is the outlier
  with no recorded rationale.
- **O-4 · The post-spec unportable planes (F9/§1c).** Per family: rpg campaigns · automation rules ·
  global variables · plugins · chat room-state (injections/overrides/attached-book+tag re-links).
  Arms per family: portable descriptor / RULED-OUT with the reason / accepted-lossy rider on the
  chat arm. **Recommend:** automation rules + global variables get descriptors (owner-authored
  artifacts, exactly the tag/theme class); plugins RULED-OUT for now (installed code ≠ data);
  rpg + room-state = accepted-lossy RIDER on the chat arm's ledger entry (an orb-native
  full-fidelity chat format is a real project — decide it when multi-box migration is real, and
  say so in the registry so the gate cites it).
- **O-5 · JSON-card export format (parked owner item — its home).** The character export door grows
  the chat door's format axis: `GET /api/export/character/:id?format=png|json` — `buildCardV3`
  already produces the JSON object (the PNG route wraps it in the chunk); the kebab gains a second
  entry. Thin by construction; **recommend build** (S) in R4's wave. This disposes the parked item
  into the door table rather than a one-off.
- **O-6 · Absent-character transcript import policy (parked owner item).** Today the descriptor
  refuses ("no character with handle X on this account", portability.ts:326-328). Arms: (a) keep
  refuse; (b) mint a placeholder card; (c) **land as a CHARACTERLESS chat** — orb chats are
  first-class and characterless is a legal state (D18 rationale rider; D62 P4 "Blank chat"), speaker
  names survive per-line in the jsonl. **Recommend (c) as an explicit user choice in the import
  dialog's failure row** ("import anyway without a character"), never silent; (b) fabricates
  library canon from a transcript — the D18 rider's exact coupling smell.
- **O-7 · Ratify the thin-arm law + anatomy as the D-entry now (R0) even if build waves wait.**
  **Recommend yes** — the census shows drift accretes precisely where the ruling isn't citable
  (persona landed its doors before the anatomy existed and nobody re-swept).
- **O-8 · The serde spine's strictness default (F7).** (a) drop-row default, reject-file opt-in;
  (b) reject-file default. **Recommend (a)** — matches 3 of 4 current families and the bundle's
  isolation philosophy (one bad row should not kill a 200-row restore), with world-info free to
  declare (b) if entry integrity matters more.

---

## §7 Verified clean / how this review was grounded

- **Law read IN FULL this session:** `.claude/agent-doctrine.md` · `docs/architecture/core/AGENTS.md` ·
  `Core-Path-Registry.md` (D1–D78 + D86 + D106–D115 read; D111 skimmed via extract) ·
  `Spine-Config-and-Serialization.md` · `docs/architecture/history/export-import-portability.md`
  (the master spec, in full) · `docs/reviews/misc/2026-08-03-export-rot-dispositions.md` (in full) ·
  `docs/reviews/stickler/2026-08-03-regex-model.md` (in full) · the workboard regions covering the
  chars+chats lifecycle lane, §16.1, O-16, and the anatomy ruling (:530-560, :1190-1290, :1420-1490).
- **Code read IN FULL:** all 8 `server/src/kit/serde/*/index.ts` · `contracts/portability/index.ts`
  (current + `git show b808f760` original) · `entry/compose/portability.ts` ·
  `entry/compose/portability-runner.ts` · `entry/http/export.ts` ·
  `features/workloads/lib/portability-model.ts` · `routers/preset.ts` · headers of
  `entry/http/{import,import-chat,import-tree}.ts` · `domain/persona/verbs/export.ts` ·
  `domain/settings/verbs/{export-theme,import-theme}.ts` (heads) · `domain/preset/verbs/import.ts`
  (head) · `db/src/schema/databank.ts` (documents + junction region) · persona backup schema region
  of `contracts/persona`.
- **Sweeps run (receipts inline above):** client `api/export|api/import` call sites (10 files, all
  classified) · features-wide Import/Export chrome sweep (18 files; theme-row-menu /
  world-info-list-header / tag-create-button confirmed zero) · per-router proc inventories
  (character/chat/persona/tag/world-info/settings/assets/databank/preset) ·
  `createExportWorldBook|createImportWorldBook` consumer sweep (compose-only) · `serde/persona`
  consumer sweep (persona verbs only) · `PortableEnvelope` archaeology (`git log -S`, born
  `b808f760`, deleted `cfa2049f`) · databank domain birth (`git log --diff-filter=A`, `6359a4ea`) ·
  CPD serde pairs (`reports/cpd/jscpd-report.json`: gallery↔theme 14, gallery↔tag 14, persona-substrate↔card 7,
  persona-substrate↔chat 14) · lifecycle-audit-doc search (no durable table doc exists; the lane's
  tables were report-ephemeral — workboard summary only) · schema ownership check for
  automation/plugin/rpg families.
- **Confirmed intact (no finding):** the bundle round-trip pin exists and covers one-of-each
  (`tests/server/entry/import/bundle-round-trip.suite.int.test.ts`); all 8 serde mirror-test dirs
  exist (`tests/server/kit/serde/*`); the user-settings secrets fence is allowlist-typed +
  runtime-mirrored exactly as ruled (R3); the chars+chats ruled anatomy is landed with CT absence
  pins (`0a8d248c`); the preset importFile and chat import doors genuinely delegate to the one verb
  (headers + router read); `EXPORTABLE_KINDS` correctly hides `assets` and always appends it to
  partial exports; export routes are owner/host-gated with null→404 uniform; the ST profile-import
  slice is built once (the runner header's stated dedup, verified by reading both files).
- **NOT read (scope boundary, declared):** the delivery core internals (`infra/storage/zip.ts`
  bodies, `run-bundle-import.ts` body — the belts are security-executor territory and were audited
  at build per spec §3) · `domain/import` substrate/verb bodies beyond headers ·
  `domain/export/verbs/export-{character,chat}.ts` bodies · the workloads runner bodies · the
  serde/CT test suite bodies (presence verified, assertion strength not audited) · D116–D120 ledger
  bodies (grep-located only) · no CT/gate battery was run (design review; no diff; the standing
  tree's only uncommitted change is a snap PNG).

## §8 Unconfirmed suspicions (deliberately NOT findings)

- The persona bundle export writes `JSON.stringify(backup)` unformatted (portability.ts:243) while
  every other JSON family emits `null, 2` pretty-printed — cosmetic drift only; not verified whether
  any test pins byte-shape.
- `IMPORTED_PRESET_KIND = "roleplay"` (`preset/verbs/import.ts:15`) means a re-imported preset of a
  different kind lands re-labeled; whether `kind` should ride the preset file is a preset-domain
  question the §16.1 lane may already govern — not chased.
- The backup pane's import arm was not exercised rendered (no snap run); the census trusts the CT
  coverage cited in the workboard for the chars/chats doors and source reads elsewhere.
