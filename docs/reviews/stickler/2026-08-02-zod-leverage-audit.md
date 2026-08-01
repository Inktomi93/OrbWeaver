# Zod leverage audit — 2026-08-02 (stickler, repo-wide, zod 4.4.3)

Owner charge (verbatim): "see what all [zod] has got in the latest and make sure we are using zod to
its fullest everywhere rather than just bitching out and using it lazily."

**Bottom line: this repo is NOT using zod lazily.** The stored-blob tier (`.catch()` self-heal +
`.prefault({})` sections + `.default()` everywhere), the per-boundary strict/loose/strip posture, the
loose-zod + strict-projection extraction pattern, and the conservative-or-refuse JSON-Schema lift are
v4-fluent and deliberate. What the audit found instead: **three stale claims about zod's behavior
baked into comments/law** (the installed 4.4.3 no longer behaves as the comments say), **one
error-surface miss** (prettifyError), and a short list of S-sized modernization respellings. The big
API absences (codec, fromJSONSchema, brand, templateLiteral, xor, int32) are all CORRECTLY absent —
each one would trade away a documented design property.

Census (this session, ast-grep 0.45.0, `-l ts` + `-l tsx` merged, packages+scripts+tests):
`z.object` 591 · `z.enum` 187 · `z.literal` 85 · `z.discriminatedUnion` 19 · `z.union` 13 ·
`z.record` 45 · `.loose()` 28 · `.strict()` 5 · `z.looseObject` 2 · `z.partialRecord` 1 ·
`z.strictObject` 0 · `.default()` 494 · `.prefault()` 22 · `.catch()` pervasive ·
`z.coerce.*` 27 (all in foundation/env) · `.transform()` 20 · `.superRefine()` 8 · `.refine()` 4 ·
`z.toJSONSchema` 4 (1 prod home + 3 tests) · real `.describe()` 4 (earlier 26-count was
playwright-`test.describe` pollution) · `.meta()` 0 (the 1 tsx hit is a slot-variant call) ·
codec/invertCodec/templateLiteral/stringbool/stringFormat/fromJSONSchema/xor/brand/
treeifyError/prettifyError/flattenError/globalRegistry: **0**.

Probe receipts live in `reports/stickler/scratch/zod-probe.ts` (runtime) and
`reports/stickler/scratch/strict-type-probe.ts` + `tsconfig.json` (tsgo type-level, verified against a
planted-error control). Zod surface verified against
`node_modules/zod/v4/classic/schemas.d.ts` + `v4/core/schemas.d.ts`, version 4.4.3.

---

## Findings (severity-ranked)

### F1 · MEDIUM-HIGH — the D79 kit header claims a strictness the zod parse does not have

**`packages/kit/src/json-schema/index.ts:3-5`** — header: *"pins additionalProperties:false on every
object node so a model inventing extra keys **fails our parse** rather than slipping through
downstream."* The second half is false. v4 `z.object` is **strip**-mode: extra keys are silently
removed and the parse SUCCEEDS.

- Probe: `z.object({targetRef, hpDelta}).safeParse({targetRef:"You", hpDelta:2, junk:"…"})` →
  `success: true`, junk gone (zod-probe #1). `z.strictObject` on the same payload →
  `unrecognized_keys` failure (probe #2).
- The real parse boundaries this claim covers: `domain/tool-use/verbs/register.ts:30`
  (`def.argsSchema.safeParse`), `register-plugin-tool.ts:79-82`,
  `contracts/rpg/extraction.ts:429/441/505/531` (tool-round fold + salvage) — all plain `z.object`,
  all strip.
- Failure scenario: on a NON-grammar-enforcing wire the `additionalProperties:false` pin is advisory
  only — and the folded D112 wire is exactly that (`contracts/rpg/extraction.ts:340-343`: "wire tools
  are sent without `strict`, so no folded wire grammar-enforces these enums today"). A model that
  invents a key (`{"targetRef":"Kael","mana":-3}` instead of a `trackerDeltas` entry) gets a
  SUCCESS ToolCallRecord while its write silently vanished — a quiet fork of the D112(3)
  "banned-silent-fork observability" doctrine, invisible to `malformedToolCalls`/`salvageExtraction`
  drop lists (the call parsed fine).
- What I am NOT claiming: that strictObject is the fix. Strict rejection would drop the WHOLE call
  over a junk key, against the EXT-4a salvage philosophy (drop as little as possible). The defect as
  confirmed is **the comment claims behavior the code doesn't have** (docs-are-law accuracy). The
  behavioral question — strip silently vs. log-stripped-keys vs. reject — is an owner call; if
  loud-strip is wanted, an unrecognized-key entry in the existing drop/heal observability is the
  doctrine-consistent shape, not strictObject.
- Sizing: S (comment correction) / M (observability of stripped keys, owner-gated).

### F2 · MEDIUM — the documented reason for avoiding `z.strictObject` is stale on 4.4.3

**`packages/contracts/src/preset/index.ts:201-204`** — *"We use `.strict()` on a plain `z.object`
rather than `z.strictObject` because in Zod v4 `z.strictObject` inflates the inferred type with an
index-signature tag that propagates through `.optional()` and trips
`noPropertyAccessFromIndexSignature`."*

- Installed reality: `core/schemas.d.ts:600-607` — `$strict = { out: {}; in: {} }`, byte-identical to
  `$strip`. No index signature, no tag.
- Type-level proof: `reports/stickler/scratch/strict-type-probe.ts` typechecks CLEAN under
  `strict` + `noPropertyAccessFromIndexSignature` + `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes` (repo's own `scripts/ts7.cjs`): dot access on the inferred type,
  propagation through `.optional()` inside an outer object, AND excess-property rejection all behave.
  Control: a planted `const x: number = "s"` in the same project was caught (TS2322), so the clean
  run is a real verdict, not a no-op.
- Cost of the stale note: it actively steers future authors away from the direct spelling
  (`z.strictObject(...)`) with a false claim; the repo's 0 strictObject / 5 `.strict()` split is a
  fossil of a fixed upstream issue. `.strict()` is marked "legacy compat, consider strictObject" in
  the installed d.ts (`classic/schemas.d.ts:464-467`).
- Fix: rewrite the comment to "historical: pre-4.x strictObject inflated inference; fixed — either
  spelling is fine now"; optionally respell the 5 `.strict()` sites (`preset/index.ts:205`,
  `chat/metadata.ts:38,112,174`, `databank/index.ts:105`) — pure spelling, zero runtime change.
- Sizing: S.

### F3 · MEDIUM — the banked law's mechanism is half-stale: `.brand()` no longer throws in toJSONSchema

The `[tool-schema-no-branded-transform]` law ("z.toJSONSchema THROWS on .transform()/branded"),
cited at **`packages/contracts/src/rpg/tools.ts:2-3`** ("a branded id throws in `z.toJSONSchema`")
and **`extraction.ts:16-17`**:

- Probe 4b: `z.toJSONSchema(z.string().transform(...))` → **still throws** ("Transforms cannot be
  represented in JSON Schema"). The law's effect stands.
- Probe 4c: `z.toJSONSchema(z.string().brand<"X">())` → **does NOT throw** on 4.4.3 (brand is
  type-level-only now).
- Why it matters: the repo's actual id schemas are projection-toxic via `.transform()`
  (`kit/ids/index.ts:222-235` `typeIdSchema` uses `.transform`), NOT via `.brand()` (the repo uses
  its own phantom `Branded<B>`, zod `.brand()` count = 0). A future author who tests `.brand()`
  against the "branded throws" claim will find it projects fine and may conclude the whole law is
  dead — while the transform half is the live toxin. Re-word the law/comments to name `.transform()`
  as the mechanism; note `.brand()` projects on 4.4.3 but stays unused (F9).
- Sizing: S (comment + orchestrator memory correction — surface to the memory owner; I write no
  memory).

### F4 · MEDIUM-LOW — hand-flattened ZodError loses the path where zod ships the fix

**`packages/contracts/src/preset/index.ts:1865`** — `parsePresetFile`'s user-facing refusal:
``` `…isn't a valid prompt config: ${result.error.issues[0]?.message ?? "schema mismatch"}` ```
Message WITHOUT path. Probe 7: message alone = "Too small: expected string to have >=1 characters";
`z.prettifyError` yields the same + `→ at config.sections[0].id`. An operator importing a 500-section
preset gets a refusal that names no field. Same class: **`domain/automation/substrate/validate.ts:38`**
(`issues[0]?.message ?? "unknown"`).

- `z.prettifyError` / `treeifyError` / `flattenError`: 0 uses repo-wide (swept).
- NOT in scope: the model-facing `path.join(".") + ": " + message` join sites
  (`tool-use/verbs/register.ts:33`, `register-plugin-tool.ts:81`, `kit/structured-turn/index.ts:66`,
  `contracts/rpg/extraction.ts:489-491`, and the persona/world-info write-guard re-emits) — those
  already carry paths in a deliberate model-readable convention; leave them.
- Risk check: no test pins the `parsePresetFile` error copy (swept `"isn't a valid prompt config"`
  across tests → 0 hits). Low risk; re-sweep at build time.
- Sizing: S (two call sites).

### F5 · LOW-MEDIUM — `z.stringbool` replaces seven hand-rolled env boolean codecs (with pinned params)

**`packages/server/src/foundation/env/index.ts:184-187, 192-195, 214-217, 221-224, 257-260, 274-277,
286-289`** — seven knobs spelled `z.enum(["true","false"]).default("…").transform((v) => v === "true")`
(VLLM_SLEEP_MODE, VLLM_DEBUG_REQUESTS, VLLM_DISABLED, CORPUS_AUTOINDEX, EGRESS_FIREWALL,
FORWARD_AUTH_VERIFY_JWT, CREDENTIALS_KEY_AUTO).

- `z.stringbool(...)` is the purpose-built codec. **Caveat, probed:** the default config is
  case-INSENSITIVE and accepts `1/0/yes/no/on/off` (probe 5b), and even with
  `{truthy:["true"],falsy:["false"]}` it still accepted `"TRUE"` (probe 5 — case defaults
  insensitive). Today's enum is a LOUD boot refusal on any spelling but lowercase `true/false`. A
  drop-in without `case:"sensitive"` silently WIDENS the accepted vocabulary. The byte-identical
  spelling is `z.stringbool({truthy:["true"], falsy:["false"], case:"sensitive"}).default(<bool>)`.
- Buys: 7×4 lines → 7×1; declares intent. Risks: none if params are pinned; posture drift if not.
- NOT candidates: `RPG_TRACE`/`WIRE_CAPTURE`/`E2E_HARNESS` (`on/off`) and `STACK_ENGINES` (`yes/no`)
  — deliberate string vocabularies compared as strings at consumers; converting to boolean is churn.
  The test/script `=== "1"` checks (`tests/…local-light/*.int.test.ts:17-22`,
  `tests/e2e/support/*`, `scripts/check/*.ts:192/59`) are dev tooling — KISS applies there by
  doctrine; leave them.
- Sizing: S.

### F6 · LOW — `@orb/kit/json` hand-rolls what `z.json()` ships

**`packages/kit/src/json/index.ts:8-12`** — hand-declared `JsonValue` + `z.lazy` recursive union.
zod 4.4.3 ships `z.json()` (`classic/schemas.d.ts:750-766`) — the identical recursive union with a
`util.JSONType` output. Swap = less hand-kept recursion; keep exporting `JsonValue` as an alias so
consumers (settings KV, `routers/settings.ts:12`) don't churn.
**Anti-target:** `contracts/preset/index.ts:551-556`'s look-alike `jsonValueSchema` must NOT swap —
its per-level `FORBIDDEN_KEYS` superRefine is the Layer-1 prototype-pollution guard (documented,
load-bearing). Sizing: S.

### F7 · LOW — union-discipline classification (all 13 `z.union` sites) + modern respellings

Discriminable (DU candidate):
- `contracts/connection/index.ts:357-360` `chatSendAvailabilitySchema` — discriminated on the
  `available` boolean literal; v4 DU supports boolean-literal discriminators. Low stakes (a
  server-emitted verdict; error quality irrelevant) — optional polish.

Modern-literal / nullable respellings (same semantics, current API):
- `contracts/regex/index.ts:40-42` — `z.union([z.literal(a), z.literal(b), z.literal(c)])` →
  multi-value `z.literal([a, b, c])` (4.x, `classic/schemas.d.ts:585`).
- `contracts/credentials/index.ts:50-71` — `z.union([obj.loose(), z.null()])` → `obj.loose().nullable()`.
- `contracts/preset/index.ts:246` — `z.union([z.string(), z.null()])` → `z.string().nullable()`.

Correctly undiscriminated (verified, leave alone): `preset/index.ts:648` promptSectionSchema (both
marker arms share `type:"marker"` — documented at :647), `preset/index.ts:553` (json union),
`preset/index.ts:1002` (string|boolean|string[]), `rpg/tools.ts:60,162` + `rpg/tracker.ts:101`
(number|string), `rpg/tracker.ts:51` (enum|array), `kit/json/index.ts:11` (see F6),
`kit/json-schema/lift.ts:176` (dynamic member list — must stay `z.union`).

**xor: zero candidates.** The one xor-shaped semantic (`trackerSetSchema` value/items,
`rpg/tools.ts:58-62`) is DELIBERATELY tolerant — "both omitted is a no-op the applier drops" — the
model-facing salvage posture; xor's fail-on-both/none would fight it.

### F8 · verdict — unknown-key posture at trust boundaries: ALREADY-RIGHT (per-boundary, documented)

Classified the z.object mass by boundary:
- **tRPC inputs** (~24 routers): strip. Benign wire tolerance for owner-scoped CRUD; the repo already
  escalates to `.strict()` exactly where a stray key is a BUG, with the WHY written at each site:
  `chat/metadata.ts:29-44` (roomOverrides — `.strict()` REJECTS the retired `authorsNote` key, an
  enforcer), `chat/metadata.ts:174-190` (guidedSteerSchema — the F6 trust boundary),
  `chat/metadata.ts:111-122` (narrator arm — makes `narrator ⇒ no cardScope` unrepresentable),
  `databank/index.ts:105` (chatDocumentVisibility), `preset/index.ts:205` (userIntentSchema — a
  typo'd knob is a real bug, with `.catch({})` at :1038 bounding the blast radius to the params
  field). This is the design, not laziness.
- **Import parsers**: preset import = lift-walk then STRICT structural validation with loud refusal
  (`preset/index.ts:1833-1871`) vs. the READ path's lenient degrade (`parsePromptConfig`, :1316-1320)
  — the strict/lenient split is documented as load-bearing (:1424-1428). Card import = deliberately
  tolerant multi-spec funnel (V1/Pygmalion/V2/V3) with residual preservation
  (`server/kit/serde/card/index.ts` whole file; `characterCardV3DataSchema` is `.loose()`,
  `contracts/character/index.ts:271-311`, so the residual passthrough survives the strict OUT parse).
- **Model-output parses**: loose-zod + strict-projection (D112(3)) — by design; see F1 for the one
  comment that misstates it.
- **Provider wire**: `.loose()` throughout (`infra/providers/backends/kit/wire-schemas.ts` — 10
  sites, `infra/network/openai-models.ts:14`, `server/kit/serde/chat/index.ts:112-139` raw views) —
  correct forward-compat tolerance.
- **env**: strip over `process.env` — required (hundreds of foreign keys).
- **Stored blobs**: `.catch()` self-heal + `.prefault({})` + closed-vocab key-strip preprocess
  (`contracts/prose-slot/index.ts:115-122` — `z.preprocess` + `z.partialRecord` + per-key
  `.catch(undefined)`) — exemplary v4.
No blanket change recommended. The one thing F2 unlocks: NEW strict boundaries can use
`z.strictObject` directly.

### F9 · verdict — id vocabulary: zod `.brand()` / `templateLiteral` CORRECTLY-ABSENT

- Cross-id safety already exists via the house phantom brand (`kit/ids/index.ts:11-18` `Branded<B>`,
  `TypeIdOf<P>`) with RUNTIME prefix validation at boundaries (`typeIdSchema`, :222-235 — rejects a
  `chat_…` where a `persona_…` is expected). zod `.brand()` offers the same static-only guarantee
  with a different phantom shape; adopting it would fork the brand vocabulary out of its one home for
  zero added safety. (Post-F3 it would no longer break toJSONSchema — still no reason.)
- The projection constraint boundary, restated precisely: `typeIdSchema` (transform-based) remains
  projection-toxic and stays OFF tool/extraction schemas — which the law already mandates and
  `tools.ts` obeys (every model-facing ref is a NAME the server alias-resolves).
- **Actor-ref keys are never parsed back.** Swept `character:`/`user:`/`cast:` literals + actorRefKey
  consumers: `actorRefKey` (contracts/rpg/actor.ts:29-37) is a WRITE-only projection used as Map/lock
  keys; the only other producer is the documented 3-line local mirror
  (`domain/rpg/substrate/delta.ts:54-66`, kept import-free on purpose). No inverse parse exists →
  `z.templateLiteral` would validate strings nobody parses. The settings claim path
  (`client/src/state/settings-pane-registry.ts:118`) is a TYPE-level template literal — compile-time
  only, no runtime validation target. (templateLiteral itself works as advertised — probe 8 — if an
  inverse parse is ever born, it's the tool.)

### F10 · verdict — serde seams vs `z.codec`: CORRECTLY-ABSENT everywhere

- **Card serde** (`server/kit/serde/card/index.ts`, read whole): a MANY-spec→one tolerant IN funnel
  (V1/Pygmalion/V2/V3 normalize, placeholder strip :238-284, best-book selection :470-486, residual
  isolation :177-235) + a strict OUT emitter with deliberate asymmetric lossiness (pending tags not
  serialized, multilingual notes folded). `encode(decode(x)) ≠ x` BY DESIGN for V1/Pygmalion input —
  a codec would misrepresent the seam as a bijection. The round-trip property that matters
  (hash-mirror) is pinned by determinism tests + co-location, which the header documents.
- **PNG chunk** (`kit/png-card-chunk`): byte surgery (CRC, tEXt/zTXt) under kit purity — a codec
  wrapper adds a layer, not leverage.
- **Wire seam-mappers** (server/kit law): asymmetric renames+derives; the mapper file IS the one
  home; a codec would still live there and express less than the current explicit halves.
- No `invertCodec` site. If a future seam is a TRUE symmetric pair through one schema, codec is the
  tool (probe 9 confirms the machinery works); today none qualifies.

### F11 · LOW (probe-first) — string formats: one live candidate, the rest correctly hand-rolled

- **Candidate**: `contracts/plugin/manifest.ts:36` `NET_HOST_RE = /^[a-z0-9.-]+$/` — the SSRF
  allowlist's host shape. `z.hostname()` (top-level, `classic/schemas.d.ts:302`) is a real RFC
  hostname validator; the current charset regex accepts junk like `-.-` or `...`. Since the manifest
  header calls the biconditional "the SSRF allowlist's integrity", stricter is directionally right —
  but I did NOT probe the exact acceptance delta (e.g. IPv4-literals, trailing dots) → probe before
  swapping (pre-launch, so narrowing is cheap).
- Already using formats where they exist: `z.url()` at `foundation/env/index.ts:293` (OIDC_ISSUER) +
  the databank scrape/params surfaces.
- **CREDENTIALS_KEY correctly unvalidated in env** (`env/index.ts:283-284` vs
  `infra/crypto/key.ts:7-13, 27-46`): the hex-or-base64 + exact-32-bytes decode DEGRADES to a
  disabled box, deliberately never boot-throws — moving validation into the env schema would flip a
  documented degrade posture into a boot fatality. Leave it.
- No zod equivalent exists for: the oklch/hex color grammar (`rpg/tracker.ts:38-39`), plugin semver,
  slugs, the `asset_…`-shape lenient settings field (gate-annotated), the ST date stamps
  (`serde/chat/index.ts:187-189`). All correctly hand-rolled.
- `.email()/.uuid()` absences are honest: no email or UUID validation surface exists in this codebase
  (identity is OIDC-claim-driven; ids are TypeIDs).

### F12 · verdict — metadata/registry/toJSONSchema flow: ALREADY-RIGHT; fromJSONSchema CORRECTLY-ABSENT

- Projection is single-homed (`projectJsonSchema`, D79) and consumed by both tool args and
  structured-output formats; contract tests pin projection-cleanness (`tests/contracts/rpg/*.contract.test.ts:35/61/98`).
- Tool descriptions are per-GAME rendered templates attached at the WIRE-tool level
  (`entry/compose/rpg.ts:717-746`, `buildRpgToolDescriptions`); moving them into `.describe()`/
  `.meta()` would either freeze the R2 per-game rendering or make the cached projection volatile —
  exactly the F4-CACHE hazard (`extraction.ts:321-343`). Deliberately not schema-carried.
- The 4 real `.describe()` sites (`settings/index.ts:72,94,103` memory knobs;
  `plugin/manifest.ts:50`) are inert annotations — harmless (consumer not traced; see unconfirmed).
- **`z.fromJSONSchema` must NOT replace the hand lift** (`kit/json-schema/lift.ts`, read whole): the
  lift is a TRUST BOUNDARY — conservative-or-refuse with a typed `JsonSchemaLiftError` naming
  construct+path, a closed `LIFTABLE_JSON_SCHEMA` subset, a depth cap, and a projection-clean-only
  output. `fromJSONSchema` is permissive full-draft lifting; swapping would silently WIDEN the
  untrusted guest surface and lose the typed refusals. Strongest correctly-absent verdict in the
  audit.
- `z.globalRegistry`/`z.registry`: 0 uses, no surfaced need.

### F13 · verdict — patch verbs & `exactOptional`: not build-now

- No superjson anywhere (swept; the sole mention is a comment saying "raw JSON, no superjson" —
  `contracts/chat/producers.ts:4`): explicit `undefined` cannot arrive over the tRPC wire, so
  `exactOptional()`'s runtime rejection buys nothing at those boundaries. Merge-clear
  ({}=no-op, null=clear) is enforced where it lives: the opaque-with-reason patch intakes
  (`routers/settings.ts:24-31`, `contracts/rpg/inputs.ts:139-144`) + `deepMergePlain` + whole-blob
  re-validation at the write seam (`domain/settings/verbs/update-user-settings-section.ts:29-40`).
- The TYPE-level story is real but latent: house law prefers `x?: T` under
  `exactOptionalPropertyTypes` (Spine-TypeScript §4) while `.optional()` infers `x?: T | undefined`;
  `.exactOptional()` (probe 6: rejects explicit undefined; infers the house shape) is available
  where an inferred type must feed a hand-authored exactOptional interface. No live friction site
  found this session → adopt on demand, not as a sweep (~500 `.optional()` sites; sizing L for
  nothing).
- rpg editSnapshot is mid-reshape by the R1/R2 lane — its patch is an opaque `z.record` at the wire
  with domain-side legality; nothing here to build now. **Coordinate any patch-schema change with
  that lane.**

### F14 · verdict — `.superRefine` vs `.check`, `.overwrite`: no migration

`superRefine` carries NO `@deprecated` tag in the installed 4.4.3 d.ts (`classic/schemas.d.ts:39`,
`:743`) — the "v4 deprecates it" premise doesn't hold for this version; the 8 sites (incl. the
env AUTH_MODE boot-fatality the Spine cites as law) stay. `.overwrite()`: relevant only for
same-type normalizations that must stay projection-safe; the tool path already bans transforms and
carries none, and the remaining `.transform` sites are either off-projection (typeIdSchema at tRPC
edges) or the F5 env booleans. Zero candidates.

### F15 · verdict — numeric honesty: ALREADY-RIGHT

`.int()` + explicit min/max bounds are pervasive and real (the 198 grep count is genuine zod here;
bounds live beside one-home constants). `int32/uint32/int64/float64` serve cross-language schema
fidelity this stack doesn't have (SQLite dynamic typing; JS numbers; no 32-bit wire field found).
`z.coerce.*`: all 27 sites are foundation/env string→number — the right tool, none misused.

### F16 · LOW — minor idiom notes (verify-before-touching)

- `personaMetadataWriteSchema` / `entryMetadataWriteSchema`
  (`contracts/persona/index.ts:31-38`, `contracts/world-info/index.ts:69-76`): a
  `z.record(...).superRefine(re-parse through the loose schema, re-emit issues as code:"custom")` —
  the loose schema alone expresses the same validation in one hop (loose objects already pass
  unknown keys through); the re-emit also drops the original issue codes. The opaque
  `Record<string, unknown>` OUTPUT type may be the point (DB column assignability) — if so, keep;
  if not, this is a one-hop simplification. LOW; confirm the output-type dependency first.
- `contracts/kit` settings tier: for the record, the `.prefault({})`-per-section +
  `.catch()`-per-knob + `DEFAULT_USER_SETTINGS = schema.parse({})` architecture
  (`contracts/src/settings/index.ts:375-879`) is the most v4-fluent surface in the repo — the
  owner's "27 .prefault — someone knows 4.x" hunch confirmed, and it's the settings tier.

---

## Build-program sketch (staged; each stage independently landable)

1. **Stage A — truth repairs (S, land first, zero runtime change).**
   a. `kit/json-schema/index.ts` header: state the real behavior (pin = grammar-level prevention on
      enforcing wires; zod parse is strip — extra keys are silently dropped, not failed) [F1].
   b. `preset/index.ts:201-204`: mark the strictObject workaround historical/fixed [F2].
   c. `rpg/tools.ts:2-3` + `extraction.ts:16-17`: name `.transform()` as the projection toxin; note
      `.brand()` projects on 4.4.3 [F3]. Surface the memory correction to the orchestrator.
2. **Stage B — error surface (S).** `z.prettifyError` at `parsePresetFile` (preset/index.ts:1865)
   and `automation/substrate/validate.ts:38`. Re-sweep for error-copy pins first (none found today).
3. **Stage C — modern respellings (S, optional polish, contract-tests green).**
   `z.literal([...])` at regex/index.ts:40; `.nullable()` at credentials:50/preset:246; `z.json()`
   for kit/json (alias `JsonValue` preserved) [F6/F7]; optionally strictObject respellings of the 5
   `.strict()` sites [F2].
4. **Stage D — owner-gated (S-M).**
   a. stringbool with `{truthy:["true"],falsy:["false"],case:"sensitive"}` for the 7 env booleans
      [F5].
   b. Probe `z.hostname()` vs `NET_HOST_RE` acceptance delta; swap if strictly-narrower is
      acceptable for the plugin SSRF allowlist [F11].
   c. Decide the strip-observability question at the tool-arg boundary (log-stripped-keys vs status
      quo) [F1 behavioral half].
5. **Not-programs (correctly absent — do not build):** zod `.brand()` adoption, codec/invertCodec,
   fromJSONSchema, templateLiteral for actor keys, xor, int32/uint32, `.overwrite()` migration,
   superRefine→check migration, exactOptional sweep.

---

## Verified clean / verification log

**Read WHOLE:** `.claude/agent-doctrine.md` · `docs/architecture/core/AGENTS.md` ·
`Core-Laws-and-Precedents.md` · `Spine-TypeScript-and-Patterns.md` ·
`Spine-Config-and-Serialization.md` · `contracts/src/rpg/{actor,extraction,tools,tracker,inputs}.ts` ·
`contracts/src/{persona,portability}/index.ts` · `contracts/src/chat/metadata.ts` ·
`contracts/src/preset/index.ts` (all 1872 lines, two passes) ·
`kit/src/{json,ids}/index.ts` · `kit/src/json-schema/{index,lift}.ts` ·
`server/src/foundation/env/index.ts` · `server/src/kit/serde/card/index.ts` ·
`server/src/domain/tool-use/verbs/{register,execute-tool-calls}.ts` ·
`server/src/domain/preset/verbs/{import,import-file}.ts` ·
`server/src/domain/settings/verbs/update-user-settings-section.ts` ·
`server/src/transport/trpc/routers/rpg.ts` · `server/src/infra/crypto/key.ts` ·
`~/.claude/skills/code-recon/SKILL.md` · zod `classic/{schemas,external,coerce,iso,parse,compat,errors,from-json-schema}.d.ts`.

**Read TARGETED (regions only):** `contracts/src/settings/index.ts` (:60-110, :360-900 — NOT read:
:1-60, :900-end incl. the lift chain + app-settings tier) · `contracts/src/world-info/index.ts`
(:40-90 only) · `contracts/src/{connection,credentials,regex,databank,character}/index.ts` (union/
strict/loose windows only) · `server/src/kit/serde/chat/index.ts` (:100-145 — the remaining ~450
lines unread) · `server/src/kit/structured-turn/index.ts` (:50-80) ·
`infra/providers/backends/kit/wire-schemas.ts` (:1-70) · `infra/network/openai-models.ts` (:1-25) ·
`domain/import/substrate/card.ts` (:1-60) · `domain/rpg/substrate/delta.ts` (:40-70) ·
`domain/automation/substrate/validate.ts` (:30-45) · `tool-use/verbs/register-plugin-tool.ts`
(:70-95) · `contracts/plugin/manifest.ts` (:40-80) · `routers/settings.ts` (:1-60) ·
`stats/contract/params.ts` (:1-30) · `kit/injection/index.ts` (:35-63) · `prose-slot/index.ts`
(:95-140). **NOT read at all:** the other 22 tRPC routers' bodies (posture inferred from the
rpg+settings pattern + the census), `serde/{persona,tag,theme,user-settings,world-info,gallery}`,
`png-card-chunk/index.ts` body, client-side zod consumers (client has ~0 schema definitions — 0
z.object in packages tsx), the settings lift chain, `compose/rpg.ts` beyond the description window.

**Sweeps (ast-grep 0.45.0, `-l ts` AND `-l tsx` merged per the recon skill; scripts in
`reports/stickler/scratch/zod-sweep{,2}.sh`, `zod-sites{,2}.sh`):** the full constructor census; the
method census; file:line site lists for unions/strict/loose/coerce/refines/describe/meta/
toJSONSchema/lazy/preprocess/prefault/regex/DUs; ZodError issue consumers; actor-key literal
producers/parsers; superjson; ClaimPath; deepMergePlain homes; E2E_ALLOW_DEV_TARGET / `=== "1"` env
reads; error-copy pins in tests. Grep pollution identified and excluded: tsx `.describe` =
playwright, `.meta`/`.check` = slot variants, `.parse/.encode/.url()` counts carry non-zod receivers.

**Probes (runtime + type-level, this session):** `zod-probe.ts` (9 numbered receipts: strip vs
strictObject, toJSONSchema on plain/transform/brand, stringbool acceptance incl. the
case-insensitivity trap, exactOptional, prettifyError, templateLiteral, codec) and
`strict-type-probe.ts` via `scripts/ts7.cjs` under the repo's strict flags, validated against a
planted-error control (TS2322 caught → the clean pass is a real verdict).

**NOT run: whole-tree `pnpm check`/`pnpm test`.** This is a read-only audit in an isolated agent
worktree with ZERO source changes (`git status`: only gitignored `reports/` scratch + this report);
the doctrine bans whole-tree batteries in lanes and reserves them for the orchestrator's quiesced
tree — running one here would measure main's baseline, not this audit.

## Unconfirmed suspicions (low priority — NOT findings)

- `z.hostname()` vs `NET_HOST_RE` exact acceptance delta not probed (IPv4 literals, trailing dots).
- The `memoryDefaultsSchema` `.describe()` strings' consumer not traced (may be doc-only).
- Whether the persona/world-info write-guard's opaque `Record<string,unknown>` OUTPUT type is
  load-bearing for DB-column assignability (decides F16's simplification).
- Whether any in-process (non-wire) caller passes explicit `undefined` into a patch param where
  absent≠undefined would matter (not swept exhaustively; JSON boundaries are immune).
