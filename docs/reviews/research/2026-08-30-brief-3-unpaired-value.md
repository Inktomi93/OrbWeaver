---
kind: review
status: active
updated: 2026-08-30
---

# Brief 3 — the unpaired value: why `contract-field-liveness` is a lens, and what no lens can see

Research lane `nate-research` (worktree `wt/nate-research` @ `7f574337a`), 2026-08-30. Read-only; nothing
on the tree changed. Every load-bearing claim carries a `path:line` or a command receipt taken in this
session; every negative claim states its scanned-file count and a second method.

## 0. The answer in four sentences

1. **The lens is not a gate because its true-positive class is rare and its residual output is
   by-construction undecidable.** At build it found 2 defects under 70 hits (2.9%); today it reports 46 hits
   over 3,388 fields, and after classification **0 of the 46 is a live defect** — every one is a producer
   shape a key index cannot see, a producer that is off-tree by design (a guest plugin, a foreign card file,
   a tRPC caller), or a cited dormancy. A ratchet over it would carry 46 ratified rows to catch a shape that
   has recurred **zero** times since the audit.
2. **The instances this brief attributed to the family are five different classes, and the lens's class is
   only one of them.** #622 (`dims`) is a *partial producer set on an optional field*; #320/#321 are
   *accepted-never-applied knobs* (a dropped hop in a pass-through chain); #650 and the audit's F4 are
   *server-projected, client-never-read*; #610 is a wrong-principal read; #619/#637 are Brief 2's inert
   instruments. None of the five is a field with no producer.
3. **The two data-loss bugs (#471, #837) are not liveness bugs at all.** Both are a WRITE whose value derived
   from a READ that had a degraded/emptied arm. Their fixes are seams (`requireIntactStoredConfig`,
   `resetWithoutPersisting`) whose totality is true today and rests on a file-header sentence: **233 gate
   files reference neither seam**, and the "total over future callers" claim is enforced by nothing.
4. **The complete write↔read pairing set has 14 tiers; 9 have an instrument, 5 have none** (§4). The two
   un-instrumented tiers that actually produced this month's rows are *degraded-read→write* and
   *server-View-field→client-read* — the latter measured here at **24 candidates across 313 fields**, with
   `MessageView.ttftMs` / `finishReason` / `cacheReadTokens` / `cacheWriteTokens` confirmed unrendered by two
   methods.

## 1. What the lens is (receipts)

`pnpm ast contract-field-liveness` — `tooling/src/ast/ops/fields.ts:16`, collectors in
`tooling/src/ast/lib/fields.ts`, fences in `tooling/src/ast/lib/field-seeds.ts`. A field is a hit when NO
production file spells its name as an object-literal key, shorthand, assignment target (`x.f =` / `x["f"] =`),
accessor/method member, JSX `name="…"` attribute, `setFieldValue("…")` argument, or a computed key resolving
through a `const X = "…"` (`fields.ts:176-230`), and the field's own zod chain carries no `.default()`
(`fields.ts:292-305`). Model-projected schemas (`projectJsonSchema`/`z.toJSONSchema`/tool `argsSchema`) are
fenced and COUNTED (`field-seeds.ts:76-87`). Reader attribution is name-global, never type-resolved
(`fields.ts:332-334`).

The header states why it never gates, verbatim (`fields.ts:20-21`): *"a key-based index cannot see every
producer, so acting on a line without reading the call sites deletes live code."* The audit that minted it
(`docs/history/reviews/misc/2026-08-18-silent-reader-audit.md` §8) routed it to a lens on the `stringy`
precedent ("the verdict is a human's"); the #210 triage (`docs/reviews/misc/2026-08-19-lens-triage-210.md`
§0) measured 57 LIVE / 11 DORMANT / 2 DEFECT / 0 DEAD and wrote *"the lens is unusable as a standing
instrument until §4's F1/F2 land"* — they landed (#267), and the run dropped 70 → 46.

## 2. The 46 hits today, classified (receipt: `nr-cfl.txt`, run on `7f574337a`)

Command: `pnpm ast contract-field-liveness --max 300` → `contract fields:3388 … scanned=104 matches=46
status=complete`, 17 further hits excluded by the model-projected fence across 8 schemas.

| Class | Hits | Which | Evidence |
| - | - | - | - |
| **template-built key** (declared blind spot #1) | 8 | `statsDeltaSchema.{daily,model}Tokens{In,Out}{Measured,Estimated}Samples` | producers build the key: `` `${prefix}…${suffix}` `` at `packages/server/src/domain/chat/substrate/stats-delta.ts:66-71`; ``acc[`tokensIn${kind}`]++`` at `domain/stats/write/rebuild-from-canon.ts:237-243`. `pnpm ast literal MeasuredSamples` → 5 hits/4 files. LIVE. |
| **guest/foreign-authored key space** (F6) | 17 | 11 `plugin/ui.ts` DSL node fields (`$state`, `tiles`, `filters`, `confirmBody`, `enumValues`…), `pluginManifestSchema.{hostVersion,uiEntry,author}`, `automationActionSchema.resultVar`, `stPromptSchema.injection_*`/`forbid_overrides`, `stPresetSchema.prompt_order` | producer is the plugin guest, the manifest author, a tRPC caller (`automation.ts:32` input), or an ST preset file; readers live (`arm-executors.ts:451-460` for `resultVar`). LIVE by construction. |
| **host-built via `setProp`** (triage F2, unfixed by design) | 5 | `PluginHostV1.{registerDisplay,net,fetchAsset,registerCommand,registerFrame}` | `ctx.setProp(surface, "net", net)` — `infra/plugin-host/membrane.ts` (triage §4 F2). LIVE. |
| **cited dormancy** (INTENTIONAL-DORMANT) | 8 | `openRouterProviderRoutingSchema.{require_parameters,data_collection,max_price}`, `cardAssetSchema.uri`, `pluginBuiltAgainstSchema.{engineVersion,engineCommit}`, `rpgWeatherSchema.temperatureC`, `loreEntryProvenanceSchema.toSeq` + `UpsertLoreEntryInput.toSeq` | each cited in triage §2 with its header line. |
| **schema-composition alias** (NEW shape, unfenced) | 2 | `generationKnobSchemas.{compactionThresholdPct,compactionVerbatimTail}` | the wire field is `thresholdPct: generationKnobSchemas.compactionThresholdPct` (`packages/contracts/src/preset/index.ts:335`) — the schema is REUSED under another name; `pnpm ast ident compactionThresholdPct` → 2 hits, both in that file. LIVE, false positive. |
| **fixed reader-side defect, hit invariant under the fix** | 1 | `characterCardV3DataSchema.creator_notes_multilingual` | #266 closed 2026-08-19 with a fold at `packages/server/src/kit/serde/card/index.ts:322` (`foldMultilingualNotes(data.creator_notes_multilingual)`); the lens reports the identical line before and after because the defect was a missing READ, and its producer is a foreign card. Permanent noise. |
| **unadjudicated** | 1 | `stPresetSchema.character_id` (`preset/index.ts:2737`) | an ST `prompt_order` per-character key parsed and never read — the `use_regex` (#266 D-2) shape: a foreign-format fidelity field dropped at import. Not a liveness defect; worth one read by a human. |
| **live defect** | **0** | — | — |

So the lens's standing output is 46 rows of which 45 are structurally permanent and 1 is a question, and
none is the class it was built for. That is the whole reason it is not a gate, stated with numbers rather
than doctrine.

## 3. The instances, re-derived — five classes, not one

| Issue | What actually happened | The class | Would a gated field-liveness have caught it? |
| - | - | - | - |
| **#622** `dims` never filled → every image 16:9 | `ImageBlock.dims` is `.optional()` (`packages/contracts/src/chat/content-blocks.ts:39`); the imagery producer omitted it, the UPLOAD producer fills it (`attachment-url-provider.tsx:44` — `dims: { w: ref.width, h: ref.height }`); every other spelling is a pass-through (`dims: block.dims`, `dims: subject.dims`). Post-fix (`d0be13849`) imagery STILL omits it — 0 `dims` in `packages/server/src/domain/imagery` (20 files scanned); the primitive tolerates absence instead. | **partial producer set on an optional field** | **No.** A per-field verdict is absolved by ANY producer. The class is per-(producer, field), and omitting an optional field is legal to `tsc` by definition. |
| **#320** `retrieveK`/`rerankTo` accepted-never-applied | threaded from contracts into `buildRecallQuery`, DROPPED at the last hop (`recall/query.ts:25-34` omitted them from `MemoryQueryOptions`) | **dropped hop in a pass-through chain** | **No.** Both a producer and readers exist at every hop but one; name-global indexes see "produced" and "read". Structural typing lets a wider object flow into a narrower parameter without an excess-property error. |
| **#321** `recencyBias` dead knob + live no-op slider | declared, threaded, never read (`digests.ts:7-8` self-flag); UI slider wrote a key nothing consumed | **knob surface outside `knob-wire-coverage`'s five enumerated arms** (settings sections, AppSettings keys, format strings, chatMetadata) — `tooling/src/verify/gates/knob-wire-coverage.ts:361-473` | **No** — and the audit already named this hole for role-client knobs (§6: *"nothing covers a role-client / provider knob"*). |
| **#650** `netHosts` projected, client passes `[]` | `PluginView.netHosts`/`declaredCapabilities` landed on the server (#636); `plugin-row.tsx:174` never read them | **server-View-field → client never reads** (the audit's F4 `reasoningMs` class) | **No.** The lens fences on `packages/contracts/src` producers; `clientgap` is export-level, not field-level. |
| **#610** `can(installer, …, exec.roster)` | the CALLER's roster read where the installer's was owed | wrong-source read (authz) | No — every value had a producer and a reader. |
| **#619**, **#637** | an inert gate clause; CT stubs feeding `null` | Brief 2's class | No. |
| **#837** every `orb:*` blob reset on boot | `reset` on a `persist`-wrapped store WROTE the emptied state; `rehydrate()` then read it back (`durable-local.ts:205-237` post-fix) | **destructive read-modify-write: a write whose input was an emptied read** | No. The key was written and read every boot — that is why it hid. |
| **#471** settings blob wiped | `readUserSettings` degraded an unparseable row to defaults; the next section write persisted the defaults | **destructive RMW: a write whose input was a DEGRADED read** | No. Same shape. |

The user-facing consequence: a gate on this lens would have caught **none** of the eight rows this brief was
filed on. The families that keep recurring are the three the lens cannot express: partial producers, dropped
hops, and degraded-read→write.

## 4. The complete set of write↔read pairings, by tier, with the instrument that owns each

| # | Tier (writer ↔ reader) | Instrument | Class | Declared blind spots / what it cannot see |
| - | - | - | - | - |
| 1 | DB column ↔ workspace | `pnpm ast columns` (`ast/lib/columns.ts`, `column-reads.ts`) | CANDIDATE lens, manual | whole-row/spread writers mark 59/85 tables `write?` (audit §2); raw-SQL aliases un-attributable; `Pick<>` members invisible |
| 2 | TYPED json-column field ↔ reader | `tsc` | structural | none — measured 297 fields / 0 hits (audit §0) |
| 3 | OPEN json-column key ↔ reader | `open-json-column-key-parity` gate | ACTIVE, ratcheted (1 DOORWAY, 1 DEFERRED) | SQL-typed / tagged-template writes are OPAQUE (#793 fence); interpolated `json_extract` paths; a blob reached through an untyped hop |
| 4 | two writers of one json column | `json-column-write-parity` gate | ACTIVE | >1 helper hop; `db.run(sql\`json_set…\`)\` |
| 5 | contract field ↔ any producer | `contract-field-liveness` lens | INFORMATIONAL | the 5 declared + composition alias (§2) + **partial producer** + **dropped hop** |
| 6 | **server View/Summary field ↔ client read** | **none** (`clientgap` is export-level) | — | measured below: 24 candidates / 313 fields |
| 7 | settings knob ↔ writer & reader | `knob-wire-coverage` gate (D107) | ACTIVE, 5 enumerated arms | **any knob surface outside the five** — recall params (#320/#321), role-client sampler knobs (audit F1), imagery size presets |
| 8 | client persisted-store key ↔ reader | none for liveness; `persist-partialize-and-total-migrate` + `no-raw-zustand-persist` cover the DOOR shape only | — | (#837 was not a liveness defect) |
| 9 | registry row ↔ dispatcher | `pnpm ast regkeys` | HEURISTIC | `Object.keys` iteration, DB-sourced keys |
| 10 | bus event / warning code / message kind ↔ emitter+reducer | `bus-coverage` family + `warning-code-coverage` + `message-kind-policy-coverage` | ACTIVE ratchets | the model to copy: derived member sets, two-map exemptions, two-sided |
| 11 | tRPC procedure ↔ client consumer | `pnpm ast unwired` | lens (PD-138) | `Trpc[…]` inference spellings |
| 12 | `data-testid` ↔ test selector | `testid-liveness` gate | ACTIVE | — |
| 13 | CT stub ↔ mounted read | `ct-unfed-ratchet` (#637) | ACTIVE, runtime, liveness-marked | runtime only |
| 14 | **degraded/emptied READ → persisted WRITE** | **none** — two seams by convention | — | `requireIntactStoredConfig`: 2 prod callers (`settings/persistence/queries.ts:73,143`), **0 gate references** (233 gate files, `ast-grep -p requireIntactStoredConfig`); `resetWithoutPersisting`: the two `setState(getInitialState(), true)` doors (`create-persisted-store.ts:98`, `create-entity-draft-store.ts:133`) are reached only via the durable-local registry — 559 ts + 629 tsx client files scanned, no third |

Tier 14's totality today, measured: `user_settings` has exactly three drizzle writers — `insert` at
`queries.ts:53` (create), `update` at `queries.ts:90` (guarded), and `update` at `theme-queries.ts:154`,
which is a key-wise `json_set` heal, not a whole-blob replace. So the header's "the only two whole-blob
writers" (`queries.ts:4-9`) is TRUE — and nothing makes a fourth writer route through the guard.

### 4.1 Tier 6, measured (scratch `nr-view-fields.ts`, reusing the lens's own indexes; candidates only)

313 fields across 43 `*View`/`*Summary` owners in 104 contracts files; **24 never spelled by any client
file** (4 also never spelled by the server). Name-global, so it under-reports. Second method on two of them:
`pnpm ast ident ttftMs --in packages/client` → 0 over 1,188 files; `finishReason` → 0 over 1,188 files.

The MessageView group is the F4 class verbatim — per-turn economics the server computes and projects and
the UI never renders: `cacheReadTokens`, `cacheWriteTokens`, `finishReason`, `stopReason`, `terminalReason`,
`ttftMs`, `editedAt` (`packages/contracts/src/chat/messages.ts:189-220`). Others worth a human read:
`VariantWireView.{macroDraws,macroFreezes,rawContent}` (`assemble.ts:501-503`),
`TagAttachmentView.{tagId,targetType,taggerId}`, `RosterPresetSummary.hasGroupConfig`, `PresenceView.online`,
`InboxView.dismissedAt`, `GalleryItemView.subjectCharacterId`, `RpgConfigView.gmPresetId`,
`ParticipantView.{joinSeq,joinedAt}`, `EntryView.worldBookId`, the three `PluginAssetView`/`PluginMessageView`
fields (guest-facing, likely legitimately server-only). "Unwired ≠ worthless" (constitution §1) — each is an
intent question, not a delete signal.

## 5. What would make each un-instrumented class unrepresentable (per §2.3: every placement names its enforcer)

| Class | The move | Enforcer tier | Cost | Catches |
| - | - | - | - | - |
| **degraded-read → write** (tier 14) | an ARM on `json-column-write-parity`'s existing taint machinery: a whole-replace writer of a `defineVersionedConfig`-owned column (`writeUserConfig`, `writeAppOverride`, and any future one) must be DOMINATED in its own function body by a `requireIntactStoredConfig(...)` call; the gate already classifies writers as whole-replace vs key-wise (`json-column-write-parity.ts:10-21`) and derives the column set from the schema | gate (structural, real-tree anchor = `substrate/stored-config.ts`) | small — one arm, one `mustFlag` (a third writer with no guard), one `mustPass` (`theme-queries.ts`'s key-wise `json_set`) | the whole #471 class for every future writer |
| **persist-through reset** (tier 8/14) | a `sanctioned-home` gate arm: `setState($X.getInitialState(), true)` on a persist-minted store is legal ONLY inside the two door files, and their `reset` closures are invoked ONLY by `resetWithoutPersisting` (`durable-local.ts:220`) — a third caller of `.reset()` on a `RegisteredStore` is RED | gate (`no-raw-zustand-persist` precedent) | small | the #837 class for every future identity-boundary caller |
| **dropped hop** (#320) | ONE derived arm replacing `knob-wire-coverage`'s enumerated five: for every function whose parameter is annotated with a `contracts` shape, a declared field of that shape that the body never reads — by name, by destructure, or by spread — is a DROPPED INPUT. `pnpm ast` already has the reader shapes (`fields.ts:236-263`); the parameter's declared fields come from the type. Spread = reads all (err-alive) | lens first (candidate), ratchet second | medium — a new ast verb; precision unknown until run | #320's exact shape (`buildRecallQuery` reads `params` but not `retrieveK`), and the audit's F1 |
| **partial producer on an optional field** (#622) | not a lens question — a TYPE one. Either the field is REQUIRED (then `tsc` forces every producer) or the CONSUMING PRIMITIVE tolerates absence by contract (what #622 shipped: `auto 16/9` + `object-contain`). A per-(producer-site, optional-field) CENSUS is cheap and informational: "producers of `ImageBlock` that omit `dims`: 1 of 2" | `tsc` (required) or the primitive (tolerant) — Brief 1's territory | — | the class, by making "some producers fill it" unrepresentable |
| **server View field → client** (tier 6) | promote the scratch census to a `pnpm ast viewgap` lens (the `clientgap` verb narrowed to FIELDS): owner ∈ `*View\|*Summary`, readers restricted to `packages/client/src`, `@view-server-only: <reason>` two-sided marker for the guest-facing rows | lens (candidate) → ratchet once the 24 are triaged | small — the indexes exist; ~60 lines | #650's shape, the audit's F4, the MessageView economics above |
| **the lens's own noise** | (a) fence the composition alias (`X: schema.field` where the initializer is a `PropertyAccessExpression` on a schema const) — 2 hits; (b) print the CLASS beside each hit (template-key / guest / foreign-format / dormant-cited / unclassified) so a run is triage-free and only "unclassified" is worth a read; (c) never a ratchet: 45/46 rows would be RATIFIED with cites, which is a ledger that exists to be ignored | lens | small | the next reader's hour |

## 6. What I did not do, and why

- I did not run `pnpm ast columns` bare (one reference resolution per column; the audit's 754-column
  receipt stands and the class was bounded there).
- I did not prototype the dropped-hop lens; its precision is the open question and it is the one item here
  that is an afternoon rather than an hour.
- The tier-6 census is a scratch script (`scratchpad/nr-view-fields.ts`), not a tool; its 24 are
  candidates and two were corroborated, not all.

## 7. Issue-summary paragraph

The `contract-field-liveness` lens should stay a lens: its 46 current hits classify to 0 live defects, 45
by-construction permanent rows and 1 human question, and a ratchet over it would catch none of this month's
"unpaired value" rows because those rows are three OTHER classes — partial producer sets on optional fields
(#622), dropped hops in pass-through chains (#320/#321), and server-View fields the client never reads
(#650, and a measured 24-candidate census including `MessageView.ttftMs`/`finishReason`/`cache*Tokens`).
The two data-loss bugs (#471, #837) are a fourth class — a persisted write whose input was a degraded or
emptied read — whose fix seams are total today by a header sentence only (0 of 233 gates reference either).
Three cheap enforcers close the recurring classes: a dominance arm on `json-column-write-parity` for
versioned-config whole-blob writers, a sanctioned-home arm for `RegisteredStore.reset` callers, and a
field-level `viewgap` lens promoted from the census in this report; the dropped-hop detector is the one
medium-cost item.
