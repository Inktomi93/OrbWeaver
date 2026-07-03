# Orbweaver — Spine: Config, Settings, and Serialization

> **Status: planning (authoritative detail).** This is the CANONICAL cross-cutting Spine document for
> spine threads §7.2 (settings/config) and §7.3 (serialization) — cited elsewhere as "spine §7.2/§7.3"
> / `AGENTS-2-Spine.md` §7.2/§7.3, which points here.

## Settings / config / the env FOUR natures (spine §7.2)

The four natures confirmed, and the headline: **a fourth nature has NO home today.**

- **(a) true env** — boot/secret/identity (the one `process.env` reader; keep, with the
  `superRefine` boot-fatality per `AUTH_MODE`). Sub-nature **(a/seed)**: env that writes a DB row once
  then goes inert (`OPENROUTER_API_KEY` → labeled credential) — the cleanest env→DB pattern; **keep as the model.**
- **(b) runtime toggles → AppSettings** (env floor, DB override wins, via `layer()` + a versioned blob).
  **Stranded today (env-only, should be AppSettings):** `IMPORT_DEFAULT_SOURCE`, `RATE_LIMIT_*`,
  `VLLM_*_CONCURRENCY`. Also: "env is the floor" is only **half-true** — `envDefaults()` mixes
  env-mirrored toggles with born-in-DB defaults (floor for 3 of 7 fields).
- **(c) agent-sdk runtime config — THE homeless nature.** ~13 isolation pins + an 11-key reserved-denylist
  - the 3-mode credential firewall (200+ lines, **security-load-bearing, rebuilt every turn**), today
    hardcoded literals in `providers/claude-sdk/env.ts`, called "env" only because it _emits_ env vars.
    Target: **extract into a named backend-internal config of the claude-sdk strategy** — NOT a settings
    tier. (This is the credential firewall that must never leak the sub — handle with care.)
- **(d) generation params** — `UserIntent`/preset, translated per-backend. **CLAUDE.md claim verified
  TRUE:** reasoning is typed SDK Options, not env (`effort`/`thinking`); only `maxOutputTokens`/
  `maxContextTokens`/compaction ride env, and they're preset-sourced (env-_shaped_ only at the wire).
- **Tangle to undo:** `claudeRuntimeEnv()` mixes (c)+(d) in one object; `OPENROUTER_API_KEY` wears 3 hats
  (secret/seed/live-client-read); `UserIntent.advanced.claudeEnv` is a preset (d) field reaching into (c),
  gated by a runtime denylist not a type. **Keep:** all 3 tiers share ONE `defineVersionedConfig`
  primitive; memory tuning is correctly split write-side (AppSettings) vs read-side (UserSettings).

## Serialization / serde core (spine §7.3)

Recon **corrected the first read** — two of the "3 card shapes" are a _justified_ emit/read pair, and the
PNG codec is _not_ scattered. The real findings:

- **Card shape — LOCKED: unify into ONE fully-modeled canonical card in `contracts`.** (User: "we can
  support them now in full.") Recon found three shapes — the V3 emit schema (`export/contract/card-v3.ts`),
  the permissive `ParsedCard`/`RawCard` reader (`import/card.ts`), and the disjoint app-CRUD schema
  (`shared/character/character-schema.ts`) — with `creator`/`character_version`/`regex_scripts`/
  `extensions` surviving **only via the `raw` blob** (so app-authored cards drop them). Target: model the
  **FULL card as typed fields/columns** (promote creator/cardVersion/regex_scripts/extensions/book) so
  app-authored AND imported cards round-trip identically. The permissive `RawCard` reader stays — but
  only as a **tolerant input adapter that normalizes INTO the one canonical model**, not a parallel lossy
  shape; `raw` is reserved for genuinely-unknown vendor extras, not for fields we now model. Kills the §6
  lossiness + the shape-C disjointness in one move.
- **PNG codec:** only **two sites** (a pure read half in `card.ts`, a pure write half in `export/png.ts`)
  — a read/write pair, not duplication. The chunk-walk loop + `isPng` + `PNG_SIGNATURE` are copied, and
  a 3rd `isPng` is inline in `http/import.ts`. Target: ONE `kit/png-card-chunk` engine
  (`readCardChunk(bytes)→string` / `writeCardChunk(png, jsonString)→bytes`) — **string-based, so the
  codec never imports the card type** (the layer-cake caveat). First lift the read half out of `card.ts`
  (away from the server logger + mappers).
- **The REAL strandings:** the **preset ST-mapper** (`shared/prompt/st-preset.ts` + `preset-file.ts`) is
  client-only, **zero server consumers**, never touches import/export — the clearest stranded mapper. And
  **regex-script "mapping" doesn't exist** — card `regex_scripts` are raw-blob passthrough only (parsed,
  never columned), despite a real `regexScriptSchema` existing.
- **Triplication (textbook):** the ST numeric role-map `{0:system,1:user,2:assistant}` is written **4×**
  (`persona.ts`, `lore.ts`, `card-v3.ts` inverse, `card.ts` inline). One bimap in `contracts`/`kit`.
- **Lossiness to FIX (not just tidy):** `creator`/`character_version`/`regex_scripts` survive only via
  the `raw` blob → an **app-authored** card (no `raw`) drops them on export. Accepted tags diverge from
  proposed (`proposedTags` re-exports, accepted `character_tags` junction doesn't). Promote those to
  typed columns.
- Target: SHAPES → `contracts` (the emit/read pairs + ST preset shape co-located); CODEC → pure `kit`
  (string-based); per-entity MAPPERS consolidated & shared by import+export (role-map, WI-entry mapper,
  card pair); the import↔assets bulk glue (duplicated in `http/import.ts` + `import-st.ts`) → one
  composition-layer helper. **Already clean (don't touch):** the parse/write split, the shared
  chat-writer, idempotency hashing.
