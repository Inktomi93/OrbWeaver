---
kind: review
status: active
updated: 2026-08-31
---

# Gate member discovery / re-home audit

Committed-source baseline: `9b0e6debb9562f654b58e20efdb86e4107ea62b4` (2026-08-31). This is a
read-only audit. Concurrent untracked architecture/research/review documents were excluded from source
truth and were not opened except for the specifically requested Appearance finding. No product, tooling,
Project field, issue, commit, or remote was mutated by this lane.

## Current-state reconciliation (2026-08-31)

This report's findings remain baseline evidence, not current implementation status. **#934 is now closed:**
`19ed6321f` teaches `knob-wire-coverage` to follow the declared imported Appearance schema source, retains
all 125 local leaves, adds all 41 Appearance leaves, reports
`contracts=1 sources=2 leaves=166 appearanceLeaves=41`, and plants imported unread/consumed controls. Cold
verification independently proved the 166-leaf union and exact seven-tuple/41-key ownership set, plus loud
missing-binding, cycle, unsupported-expression, and zero-population errors. The other two current escapes
(#942 and #943) and the ranked latent program (#944–#948) remain open.

## Verdict

**Twenty-four active gates have a confirmed physical-declaration / semantic-member split weakness.**
Three have already lost members on the current tree:

1. `knob-wire-coverage` omits all 41 imported Appearance leaves.
2. `no-parallel-section-map` reads only the direct `"topbar.trail"` element of `CHROME_ZONES` and omits
   the three spread `RAIL_ZONES` members.
3. `contract-verb-presence` omits the five verbs inherited from imported
   `WorkloadScheduleService`.

The other 21 are latent but mechanically demonstrated by their readers: they obtain a non-empty set from
the declaration file and therefore stay green when some members move behind an import, spread, inherited
interface, or imported initializer. Their permanent examples plant only inline declarations. This is the
same false-negative direction as #448: the gate still visits files, still has a subject, and still reports a
healthy workspace-file denominator while its semantic denominator shrinks.

The loader and runner cannot detect this class. A descriptor only owes non-empty `mustFlag` and `mustPass`
arrays (`tooling/src/verify/lib/loader.ts:41-55`); scan health counts files visited, while semantic units are
optional declarations (`tooling/src/verify/contract/gate.ts:74-103`,
`tooling/src/verify/lib/pass.ts:97-161`). None of the vulnerable gates declares its member-source count.

## Evidence and search boundary

- The gate corpus is 233 tracked `tooling/src/verify/gates/*.ts` files. The loader globs that exact corpus
  and validates every descriptor (`tooling/src/verify/lib/loader.ts:79-103`).
- Structural TS and TSX sweeps were run separately. The spread-declaration sweep scanned 3,071 TS files and
  771 TSX files with zero skipped files. Literal cross-checks covered every named source below.
- `rg -n "interface ... extends|export const ... = ..."` returned zero current imported/spread matches for
  `INSTRUMENT_TOOLS`, both warning tuples, `SECTION_IDS`, `CHAT_VERB_AUTHORITY`, the named bus interfaces,
  and `MessageKindPolicy`. The schema cross-check found no spread column object under
  `packages/db/src/schema/**`; the only schema spread is the unrelated
  `AUTOMATION_FIRE_STORAGE_OUTCOMES` tuple.
- The control case is `query-freshness-coverage`: it explicitly follows the split sibling seam
  (`tooling/src/verify/gates/query-freshness-coverage.ts:307-355`) and permanently plants an imported
  `invalidation-reads.ts` positive (`:607-614`). That is the minimum proof shape missing below.
- \#448 intentionally moved Appearance into `settings/appearance.ts`; its issue/closure evidence establishes
  the re-home but contains no `knob-wire-coverage` re-attestation. The full Appearance audit independently
  counted 41 lost leaves.

## Current escaped coverage

### P1 — `knob-wire-coverage`: 41 Appearance leaves are absent

`tooling/src/verify/gates/knob-wire-coverage.ts:69,109-171,360-400,514-540,585-592` fixes the settings
source to `settings/index.ts`, then reads only local interfaces, tuples, object literals, and descendant
`z.object` calls. `settings/index.ts` imports `appearanceSettingsSchema`; its 41 properties live in
`settings/appearance.ts`, so Arm C never receives them.

Failure: add and persist `appearance.dialogBackdropStrength` with an editor but no carrier. Arm C stays
green. Earliest repair: the existing gate; resolve each schema expression through imports/composition and
declare the resulting leaf count. Exact planted control: `settings/index.ts` imports
`appearanceSettingsSchema` from `./appearance.ts` and inserts it into `appSettingsSchema`; the sibling adds
`ghostAppearance: z.number()` with no read, and the fixture must report `ghostAppearance`.

### P1 — `no-parallel-section-map`: three live chrome zones are absent

`tooling/src/verify/gates/no-parallel-section-map.ts:83-103` finds tuple declarations project-wide but
reads only direct array elements. Current `packages/client/src/state/chrome-registry.ts:21` declares
`CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]`; `section-registry.ts:36` owns
`["rail.nav", "rail.brand", "rail.end"]`. The gate therefore sees one of four members. Its fixtures at
`:413-493` use flat inline tuples and cannot catch this.

Failure: create a parallel two-key map over `rail.nav` and `rail.brand`; neither key is in the gate's chrome
vocabulary, so the map escapes. Earliest repair: the tuple reader in this gate (or a narrow shared tuple
resolver). Exact planted control: `section-registry.ts` exports `RAIL_ZONES = ["rail.nav",
"rail.brand", "rail.end"]`; `chrome-registry.ts` imports it and exports
`CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]`; a non-door file plants a two-member `rail.nav` /
`rail.brand` map and must red.

### P1 — `contract-verb-presence`: five inherited workload verbs are absent

`tooling/src/verify/gates/contract-verb-presence.ts:193-221,229-251` enumerates only
`service.ts`'s local `iface.getMembers()`. Current
`packages/server/src/domain/workloads/contract/service.ts:12,97` imports and extends
`WorkloadScheduleService`; its five verbs are declared in
`packages/server/src/domain/workloads/contract/schedule.ts:52-57`. They are not gate subjects even though
they are part of `WorkloadService`.

Failure: delete every behavioral schedule-verb test; the gate remains green for those inherited verbs.
Earliest repair: enumerate the resolved interface type/symbol members, preserving the declaring node for
diagnostics. Exact planted control: `contract/verbs.ts` exports
`HubVerbService { inherited(): void }`; `contract/service.ts` imports it and declares
`HubService extends HubVerbService { local(): void }`; the test invokes only `local()`, and the fixture must
report `hub.inherited`.

## Latent semantic-member gates

Every row below is a confirmed false-negative construction, not a naming guess. “Current” states whether
the committed source has already used the escaping shape.

| Gate and reader | Exact failure scenario | Current | Earliest repair and required imported/re-exported planted control |
| - | - | - | - |
| `tooling-instrument-proof` — `tooling/src/verify/gates/tooling-instrument-proof.ts:69-88` | `INSTRUMENT_TOOLS = [...CORE_INSTRUMENTS, "snap"]` records only `snap`; an imported tool owes no proof pair. | No. Current tuple is flat. | Resolve spread identifiers. Plant `core.ts` exporting `CORE_INSTRUMENTS=["ghost"]`, import/spread it in `_shared/instruments.ts`, omit ghost proofs, require red for `ghost`. |
| `warning-code-coverage` — `tooling/src/verify/gates/warning-code-coverage.ts:51-61,166-174` | Either warning tuple spreads an imported base plus one emitted local code; the base code is never checked for an emitter. | No. Both tuples are flat. | Resolve tuple spreads/imports per channel. Plant `provider-codes.ts` exporting `BASE=["never_emitted"]`, spread into `WARNING_CODES` beside one emitted code, require `never_emitted`. Repeat for the chat channel or parameterize the same proof. |
| `duplicate-action-doors` — `tooling/src/verify/gates/duplicate-action-doors.ts:80-89` | `SECTION_IDS=[...CORE_SECTION_IDS,"home"]` omits imported section planes; duplicate fallback doors in an imported section evade the section-plane rule. | No; `SECTION_IDS` is flat. | Resolve the tuple graph. Plant `core-section-ids.ts` with `CORE_SECTION_IDS=["chats"]`, re-export/spread it from the sanctioned home, then plant duplicate chat fallback doors and require the chat-plane finding. |
| `chat-viewer-plane-canon-reads` — `tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts:119-143` | `CHAT_VERB_AUTHORITY={...BASE_AUTHORITY, listMessages:"member"}` omits every imported verb while remaining non-empty. | No; matrix is flat. | Resolve object spreads/import aliases. Plant `base-matrix.ts` with `replayChatEvents:"member"`, spread it into the live matrix with one local verb, omit the replay canon read, require `replayChatEvents`. |
| `message-kind-policy-coverage` — `tooling/src/verify/gates/message-kind-policy-coverage.ts:55-64` | `MessageKindPolicy extends CoreMessageKindPolicy` sees only local axes; an inherited multi-arm axis has no required reader. | No inherited policy today. | Use resolved interface type properties and their declarations. Plant `policy-base.ts` with a multi-arm `CoreMessageKindPolicy.memory` union (`ingest` and `exclude`), extend it in the home with one locally-read axis, omit memory's reader, require `memory`. |
| `bus-payload-allowlist` — `tooling/src/verify/gates/bus-payload-allowlist.ts:111-145,178-194` | A named bus interface extends an imported carrier containing `apiKey`; `getProperties()` inspects only local declarations, so the credential field ships. A union arm alias outside `BUS_DECL_NAMES` has the same effect. | No matching inherited named bus event found. | Resolve inherited members of each named wire type while preserving the rule's declared non-transitive boundary for ordinary referenced payloads. Plant `secret-carrier.ts` exporting `{ apiKey:string }`, import/extend it from `CharacterUpdatedEvent`, require `apiKey`. |
| `section-factory-contribution-bundle` — `tooling/src/verify/gates/section-factory-contribution-bundle.ts:9-13,50-82` | Two parameters typed through imported aliases of `ContributorRegistry<X>` are not recognized; the subject remains non-empty, so the existing blindness tripwire stays green. | No known current escape; this is an explicitly declared limit and an existing `mustPass`, which currently blesses the false-negative shape. | Resolve parameter types to the registry symbol, not text. Plant `types.ts` exporting aliases `A=ContributorRegistry<X>` and `B=ContributorRegistry<Y>`, import them into a two-parameter factory, require the bundle finding. |

## Imported definition-object gates

These gates scan the whole project or the correct co-location path, but silently skip a typed declaration
whose initializer is an imported identifier. The physical filename remains sanctioned, so every
co-location/path check stays green while the semantic definition lives elsewhere.

| Gate and reader | Exact failure scenario | Current | Earliest repair and planted control |
| - | - | - | - |
| `section-registry-completeness` — `tooling/src/verify/gates/section-registry-completeness.ts:116-132` | A sanctioned `*-section.tsx` exports `xSection: SectionDefinition = importedDefinition`; duplicate id/planned-body checks skip it. | No identified imported initializer. | Fail closed on non-literal definitions or resolve the initializer. Plant `x-definition.ts` with duplicate id `dup`; import it into `x-section.tsx` beside another `dup`, require duplicate-id. |
| `modal-registry-completeness` — `tooling/src/verify/gates/modal-registry-completeness.ts:158-173` | Imported modal initializer hides duplicate id, singleton placement, planned reason, and surface reachability. | No identified imported initializer. | Plant `x-definition.ts` exporting an unreachable `surface` modal, import it into `x-modal.tsx`, require `surface modal unreachable`. |
| `chrome-registry-completeness` — `tooling/src/verify/gates/chrome-registry-completeness.ts:89-104` | Imported chrome initializer hides duplicate id, unknown zone, and missing rail mobile fate. | No identified imported initializer. | Plant an imported `ChromeEntry` with `zone:"rail.nav"` and no `mobile`, bind it in `x-chrome.tsx`, require missing-mobile. |
| `config-group-completeness` — `tooling/src/verify/gates/config-group-completeness.ts:249-284,307-315` | Imported group/collection/contribution initializers hide duplicate ids, collection lifecycle data, orphan references, and contribution body tags. | No identified imported initializer. | Plant imported `CollectionContribution` with no `create`, bind it from a sanctioned `*-collection.tsx`, require the no-create finding. A second fixture must cover an imported group duplicate because it exercises a different accumulator. |
| `placeholder-copy-registry` — `tooling/src/verify/gates/placeholder-copy-registry.ts:43-80` | An imported section initializer makes the placeholder disappear; duplicate/empty copy is not judged and there is no subject-count tripwire. | No identified imported initializer. | Plant two imported section objects with the same placeholder and bind them from two sanctioned section files; require the duplicate pair. |
| `modal-body-not-placeholder` — `tooling/src/verify/gates/modal-body-not-placeholder.ts:43-65` | A sanctioned modal binding imports an object whose function body renders `<SectionPlaceholder>`; the gate sees a non-literal initializer and returns. | No identified imported initializer. | Plant `definition.tsx` exporting the placeholder-rendering object; bind it as `ModalDefinition` in `x-modal.tsx`; require the modal-name finding. |

The earliest safe repair for these six is usually **fail closed**, not arbitrary graph expansion: their law
already says the definition is co-located, and an imported initializer means the law cannot be established.
If builders are a sanctioned authoring shape, each gate instead needs an explicit resolver and a builder
fixture; silently returning is never a valid third arm.

## Imported Drizzle column-object gates

No current table uses an imported/spread column object, but eight active gates silently lose facts when
`sqliteTable("x", importedColumns, ...)` replaces an inline object. The shared reader explicitly returns an
empty column set for a non-literal second argument (`tooling/src/_shared/schema-read.ts:41-54`). This is
safe only for consumers that fail closed on empty columns.

| Gate and reader | Escaping member | Current | Earliest repair and exact planted control |
| - | - | - | - |
| `asset-refs-fk-coverage` — `tooling/src/verify/gates/asset-refs-fk-coverage.ts:90-121,163-189` | Imported `assetId` FK is absent from FK-to-assets reconciliation. | No. | `x-columns.ts` exports `{assetId:text(...).references(()=>assets.id)}`; `x.ts` imports it into `sqliteTable`; registries empty; require “registered in NEITHER”. |
| `fk-columns-indexed` — via `tooling/src/_shared/schema-read.ts:41-54`, consumed at `tooling/src/verify/gates/fk-columns-indexed.ts:56-65` | Imported FK is absent, so no index obligation exists. The gate header already admits this quiet direction at `:31-38`. | No. | Imported `chatId` FK plus no extras index must red. This fixture must replace the current inline-only controls, not become a `mustPass`. |
| `json-column-write-parity` — `tooling/src/verify/gates/json-column-write-parity.ts:78-99` | Imported `mode:"json"` column is absent while other live JSON columns keep the global nonzero tripwire satisfied. | No. | Imported `selection` JSON column plus one key-wise and one whole-record writer must report a straddle; include a second inline JSON column so zero-result logic cannot accidentally supply the red. |
| `lifecycle-portability` — `tooling/src/verify/gates/lifecycle-portability.ts:311-328` | Imported `ownerId` is absent from initializer text, so owner-stamped canon is not required to be carried/classified. | No. | Imported `{ownerId:text("owner_id")}` in a new table with neither carrier nor `NON_PORTABLE_CANON` row must report uncovered. |
| `no-untyped-soft-ref` — `tooling/src/verify/gates/no-untyped-soft-ref.ts:66-94,115-153` | New imported `widgetId` without FK is absent; because it has no allowlist row, the stale arm cannot expose the omission. | No. | Imported `{widgetId:text("widget_id")}` in `sqliteTable` must report the soft ref. |
| `ownerid-registry` — `tooling/src/verify/gates/ownerid-registry.ts:64-91,111-127` | New unallowlisted table's imported `ownerId` is absent; existing allowlist rows keep their own stale checks satisfied. | No. | Imported `{ownerId:text("owner_id")}` in `not_allowlisted` must report the ownership stamp. |
| `schema-banned-shapes` — `tooling/src/verify/gates/schema-banned-shapes.ts:147-178,229-243` | Imported banned column names and imported schema fields are absent; table-name/import bans still work. | No. | Imported columns object containing a listed banned column (for example `chats.activePresetId`) must report its D-cited ban; separately import/compose the banned app-settings field because that reader has a different source shape. |
| `schema-branding` — `tooling/src/verify/gates/schema-branding.ts:58-74` | Imported unbranded primary-key id or FK produces zero `Column` records. | No. | Imported `{id:text("id").primaryKey()}` in a table must report unbranded PK; an imported unbranded FK to a branded target is the opposite leg and should be a second control. |

The narrow repair is a shared `schema-read` resolver for a local/imported object-literal binding, with
cycle/unsupported-shape failure surfaced as evidence. Gates not using that helper should adopt it only when
their semantic subject is the table's columns. This is not a reason to centralize unrelated contract,
settings, or UI-definition discovery.

## Correct path-law and fail-closed controls

The sweep deliberately did **not** classify every exact path or local AST walk as a defect:

- `feature-owns-definition`, `home-tile-registry-completeness`, `ui-primitive-structure`, and
  `wire-schema-vocab-one-home` enforce physical homes/filenames. A move is the violation; following it would
  defeat the rule.
- `fk-ondelete-stated` scans every `.references()` call in schema files, including calls in an imported
  column helper; an imported options object fails closed.
- `table-explicit-primary-key` sees a table with non-literal columns as keyless and reds.
- `table-scoping-class` omits a non-literal table shape from `seen`, then its two-direction registry
  finalizer reds the missing table.
- `freeze-provenance-write-pairing` has fixed subject tripwires; moving a guarded column does not yield a
  silent clean.
- `query-freshness-coverage` is the positive control: it follows the sanctioned imported sibling and owns
  the exact split fixture.

One adjacent drift is not a re-home blindness finding but should be repaired with the chrome work:
`chrome-registry-completeness.ts:19` hand-copies the zone set as
`["rail.nav", "rail.end", "topbar.trail"]`, while the live vocabulary includes `rail.brand`
(`section-registry.ts:36`, `chrome-registry.ts:21`). The gate would reject a legitimate `rail.brand`
`ChromeEntry`. It should derive the real tuple rather than keep a second list.

## Repair priority — consequence × realistic movement, not one undifferentiated batch

The 24 constructions are confirmed weaknesses, but they do **not** all deserve equal urgency. The durable
program is #941; its children deliberately carry different priorities.

| tier | gates / work items | why now or later |
| - | - | - |
| **A — P1, escaped on the audited tree** | `knob-wire-coverage` (#934, closed), `no-parallel-section-map` + chrome vocabulary (#942), `contract-verb-presence` (#943) | The supported split already existed and the denominator was wrong. #934 is repaired and cold-confirmed; #942/#943 remain current escapes. |
| **B — P1, latent but trust/data-integrity consequence is high and the composition is realistic** | inherited named bus payload fields (#948); imported Drizzle column objects across eight integrity gates (#945) | Interface inheritance and schema modularization are ordinary growth shapes. A miss can expose credentials or remove FK/ownership/branding obligations. Security review owns #948. |
| **C — P2, cheap fail-closed prevention at an existing co-location law** | six imported definition-initializer gates (#944) | Current source has no escape and the law generally forbids moving the definition. Fail closed rather than build speculative graph resolution; resolve only a builder shape the law explicitly sanctions. |
| **D — P2, latent vocabulary/composition shapes with no current movement pressure** | instrument/warning/section/chat/policy/contribution member readers (#947); optional runner semantic-population receipt (#946) | The construction is real, but current declarations are flat/local and no planned re-home was found. Land when a shared resolver is already being built or before the relevant source is modularized; do not block product/config work on the whole batch. |

This ranking does not erase the lower tiers: their issues keep the evidence, exact fixtures, and wake
condition durable. It prevents “24 vulnerable” from becoming “rewrite 24 gates immediately” while still
making the current/high-consequence holes impossible to forget.

## Prevention program

No repo-wide abstraction is justified. Three narrow mechanisms cover the evidence:

1. **Semantic-source manifest per gate.** Every member-coverage gate declares the symbol(s) whose resolved
   members form its denominator and reports `{source, resolved members, count}` through `ctx.scan`. A drop
   in member count is visible even when workspace file count is unchanged.
2. **One exact split positive per supported composition shape.** Imported interface inheritance, tuple/object
   spread, imported initializer, and imported Drizzle columns are different shapes; a gate supports the
   ones its source law allows and fails closed on the rest. Inline-only positives are insufficient.
3. **Reuse only at true shared seams.** Extend `schema-read` for Drizzle columns. A small symbol/import
   resolver can serve tuple/object-member gates if their semantics match. Keep settings/Zod composition,
   service type members, and co-located definition law in their owning gates.

The earliest repair order is the three current escapes first, then credential/wire and schema integrity
(`bus-payload-allowlist`, DB gates), then remaining semantic registries. The loader contract should also
gain an optional semantic-member scan declaration requirement for coverage gates, but that cannot replace
the planted imported controls: a confidently wrong count is still wrong.

## Commands and receipts

- `git ls-files tooling/src/verify/gates/*.ts | wc -l` → `233`.
- `ast-grep run -p 'const $A = [...$B, $$$REST]' -l ts packages tooling --inspect summary` → scanned
  `3071`, skipped `0`.
- Same command with `-l tsx` → scanned `771`, skipped `0`.
- `rg -n "\.\.\." packages/db/src/schema packages/server/src/domain/assets/persistence/asset-refs.ts`
  → no schema column-object spread; one unrelated automation outcome tuple.
- Literal source cross-check for the named tuple/interface/matrix sources → zero imported/spread matches
  except the live `CHROME_ZONES` spread established above.
- `gh issue view 448 --comments` → issue and closure read; no gate re-attestation named.
- No `pnpm check` or product test command was run, per assignment.
