# Barrel root-fix — what landed, what is sanctioned, and the amputation worklist

Lane record for the BARREL ROOT-FIX row (`docs/history/retro-workboard-2026-08-14.md`). The refactor itself is a
**zero-behavior-change** conversion of `export * from` into explicit named re-exports. This file
carries the two things that outlive the commit: the **sanctioned stars** (with their law cites, so a
future lane does not "finish the job" and break a gate-enforced invariant), and the
**newly-private-able worklist** the conversion made derivable for the first time.

## 1. Measurement (re-derived, not inherited)

The board's "56" was a 5-day-old count. Re-measured on the lane tree:

| | `export * from` sites | files |
| - | - | - |
| before | **57** | 9 |
| after | **28** | 2 |
| converted | **29** | 8 |

Both `ast-grep` languages agree (`-l ts` = 57 matches, `-l tsx` = 0 — no `.tsx` barrel uses a star),
corroborated by a literal `rg`. There are **no** `export * as ns from` and **no** `export type * from`
sites anywhere in `packages/*/src`.

## 2. The 28 surviving stars are SANCTIONED — do not convert them

Both live in `@orb/db` and both re-export the drizzle schema barrel. For these, "a new symbol becomes
silently public" is not the bug — it is the **required** behavior, and it is gate-enforced.

**`packages/db/src/schema/index.ts` (27 stars).** Its own header: *"EVERY schema file MUST be
re-exported here: a file missing from this barrel is silently dropped from `typeof schema`, so its
tables vanish from migrations AND from the drizzle relational query API."* Backed by
`Tier-1-DB.md` invariant 7 + rule 2, and by the `db-structure` gate
(`scripts/check/gates/db-structure.ts`), whose `fix` string literally prescribes
``add `export * from "./<name>";` ``. Three modules namespace-import it, including
`packages/db/src/client/index.ts`, which does `import * as schema` to type
`Db = LibSQLDatabase<typeof schema>`.

**`packages/db/src/index.ts:21` — `export * from "./schema/index.ts"`.** Same surface, same argument.

Why converting would be a **regression** even though it would still pass the gate: the gate matches
export-declaration *module specifiers*, so named re-exports satisfy it. But the gate is **file**-granular,
not **symbol**-granular. Under a star, adding a table to an existing schema file is automatically live.
Under named re-exports, forgetting to add the new table's name silently drops it from `typeof schema`,
from migrations, and from the relational query API — with **no gate that can see it**. That converts a
gate-enforced invariant into a convention. Left starred deliberately.

## 3. What the lane actually bought (honest liveness statement)

**knip's view is unchanged, in both directions.** It was 0 findings before and 0 findings after.
Two-sided probe, cache cleared (`rm -rf node_modules/.cache/knip`; note `--cache` is opt-in and there
is no `--no-cache` flag):

- an export imported by nothing, planted in `packages/client/src/lib/index.ts` and
  `packages/server/src/infra/providers/index.ts` → knip exit 0, **neither named**;
- the same probe in the sibling modules `packages/client/src/lib/notify.ts` and
  `packages/server/src/infra/providers/diagnostics.ts` → knip exit 1, **both named with `path:line`**.

So knip's unused-export lens is live in both workspaces and is simply **not applied to these
`index.ts` files** — knip already treats them as entry files, and entry exports are excluded from
unused-export reporting. knip could never see through these barrels, and it still cannot.

The real wins are elsewhere, and they are not knip's to report:

- the public surface of each barrel is now **enumerable in source** — you read the file and know it;
- every name is **attributable to its defining module** by the language service and `pnpm ast`;
- **tree-shaking** stops pulling a whole module in for one symbol;
- a new symbol is **no longer silently public** — someone must add a line, which is reviewable.

**The one lever that would make barrels knip-legible is `--include-entry-exports`.** It is boarded as
its own whole-repo posture lane, not applied here: it would surface the §4 worklist *and* every other
entry export across all five workspaces at once, which is an owner-visible noise-versus-value tradeoff,
not a lane default.

## 4. The newly-private-able worklist (the amputation follow-up)

Derived with ts-morph across the whole `tsconfig.json` program (3,480 files), which covers every
consumer — a sweep of `tests/e2e/*.spec.ts` (the only tree outside that program) found **zero**
importers of any of these barrels.

These names are re-exported by a barrel that **no consumer imports through it**. They were kept in this
lane so the commit stays byte-identical in public API; a follow-up lane shrinks the surface on a fixed
tree, with review.

> **Tier A is a worklist, not a delete list.** Several entries are protected by their own module's
> header law — `packages/contracts/src/rpg/index.ts` states *"KISS/YAGNI SUSPENDED: the full-mode shape
> ships as DATA from day one so full grafts add siblings, never re-spell"*, which covers the
> `RPG_*`/`Rpg*` shape data below. Each Tier-A name needs an individual verdict (delete · keep with
> `/** @public */` · keep with a header cite), not a blanket sweep. `RPG_STATE_TRACKING_GUIDE` was
> the known `no-hardcoded-model-prose` ARM B "dead prose" case, which independently corroborated that
> this list finds real residue — and it is RESOLVED (2026-08-08, the row-27 WIRE ruling): the constant
> is gone, its bytes are the `rpg.extract.stateTrackingGuide` prose slot, and its barrel line with it.

Totals: **135** names are re-exported by a barrel that NO consumer imports through it — Tier A **85**, Tier B **50**.
(136/86 at the audit; `RPG_STATE_TRACKING_GUIDE` was struck when row 27 was wired.)

### Tier A — reachable by NOTHING (dropping the barrel line makes them dead code)

**`packages/client/src/lib/index.ts`** — 15

- `packages/client/src/lib/registry-contracts.ts` — `AnalyticsContextState (type)`, `CHAT_CONTEXT_TAB_IDS`, `CharacterChatsProjectionView (type)`, `CharacterContextState (type)`, `ChatContextState (type)`, `ChatContextTabId (type)`, `CommittedChatContext (type)`, `ContextEmptyArm (type)`, `ContextRegionView (type)`, `ContextTabStrip (type)`, `DraftChatContext (type)`, `ResolvedContextTab (type)`, `ResolvedContextTabs (type)`, `VOID_STATE`
- `packages/client/src/lib/use-focus-on-mount.ts` — `useFocusOnMount`

**`packages/contracts/src/prose/index.ts`** — 5

- `packages/contracts/src/prose-slot/index.ts` — `ProseHome (type)`, `ProseMacroMode (type)`, `ProseResolution (type)`, `proseOverrideSchema`, `proseSlotIdSchema`

**`packages/contracts/src/rpg/index.ts`** — 44 (45 at the audit; `RPG_STATE_TRACKING_GUIDE` struck 2026-08-08)

- `packages/contracts/src/rpg/actor.ts` — `RpgActorIdentityTextField (type)`, `rpgInventoryItemSchema`, `rpgRelationshipSchema`
- `packages/contracts/src/rpg/ambient.ts` — `RpgWeatherType (type)`, `TimeOfDay (type)`, `rpgWeatherTypeSchema`
- `packages/contracts/src/rpg/config.ts` — `RPG_CARD_KEEP_LAST_DEFAULT`, `RPG_DELIVERY_PATHS`, `RPG_FOLD_FALLBACK_REASONS`
- `packages/contracts/src/rpg/enums.ts` — `RpgCheckpointTrigger (type)`, `RpgCyoaChoiceBehavior (type)`, `RpgTrackerShape (type)`, `RpgTrackerSubject (type)`, `RpgTrackerWrite (type)`, `rpgCyoaChoiceBehaviorSchema`, `rpgRelationshipKindSchema`
- `packages/contracts/src/rpg/extraction-prompt.ts` — `ExtractionPlanePrompt (type)`
- `packages/contracts/src/rpg/extraction.ts` — `RpgExtractionDrop (type)`, `RpgExtractionDropPlane (type)`, `RpgExtractionSalvage (type)`, `RpgMalformedToolCall (type)`, `RpgPopulate (type)`, `RpgPopulateSalvage (type)`, `RpgPopulateSheet (type)`, `RpgToolRoundToolName (type)`, `rpgPopulateSheetSchema`
- `packages/contracts/src/rpg/mode.ts` — `RpgModeCapabilityAxis (type)`, `RpgModePolicy (type)`
- `packages/contracts/src/rpg/profile.ts` — `RPG_SEED_HP_MAX`, `RpgStatResolution (type)`, `rpgStatAttributeDefSchema`, `rpgStatResolutionSchema`
- `packages/contracts/src/rpg/snapshot.ts` — `RpgPlotAct (type)`, `rpgPlotActSchema`, `rpgQuestObjectiveSchema`
- `packages/contracts/src/rpg/tools.ts` — `RPG_JOURNAL_TYPE_FALLBACK`, `RPG_QUEST_ACTIONS`, `RollDiceArgs (type)`, `RpgQuestAction (type)`
- `packages/contracts/src/rpg/tracker.ts` — `RPG_TRACKER_COLOR_RE`, `RpgTrackerAppliesTo (type)`, `RpgTrackerCarrierKind (type)`, `rpgTrackerAppliesToSchema`, `trackerAppliesToCarrier`

**`packages/db/src/index.ts`** — 2

- `packages/db/src/client/index.ts` — `BaselineCheck (type)`, `optimizeDb`

**`packages/db/src/kit/index.ts`** — 5

- `packages/db/src/kit/batch.ts` — `DbBatchInput (type)`
- `packages/db/src/kit/db-errors.ts` — `CONSTRAINT_KINDS`, `ConstraintKind (type)`, `ConstraintViolation (type)`
- `packages/db/src/kit/fetch-owned.ts` — `OwnedColumns (type)`

**`packages/server/src/infra/providers/index.ts`** — 14

- `packages/server/src/infra/providers/contract/index.ts` — `AGENT_DIALOG_KINDS`, `AgentDialogKind (type)`, `AgentMcpHttpServer (type)`, `AgentMcpSseServer (type)`, `AgentMcpStdioServer (type)`, `BACKEND_KEYS`, `ChatApi (type)`, `CostDetails (type)`, `DYNAMIC_CONTEXT_CHANNELS`, `ModelCapability (type)`, `NormalizedFinishReason (type)`, `PROVIDER_ROLES`, `ProviderErrorInit (type)`, `WARNING_CODES`

### Tier B — alive via a DIRECT sibling import; only the barrel line is surplus (zero-risk drop)

**`packages/contracts/src/prose/index.ts`** — 6

- `LEGACY_PROSE_BASE_VERSION` (index.ts) ← 1 direct importer(s)
- `PROSE_COUNTER_AT` (index.ts) ← 1 direct importer(s)
- `proseOverrideFromLegacy` (index.ts) ← 1 direct importer(s)
- `ProseSlotDef (type)` (index.ts) ← 6 direct importer(s)
- `resolveProseFrom` (index.ts) ← 1 direct importer(s)
- `spliceProseTokens` (index.ts) ← 1 direct importer(s)

**`packages/contracts/src/rpg/index.ts`** — 14

- `RPG_CYOA_CHOICE_BEHAVIORS` (enums.ts) ← 2 direct importer(s)
- `RPG_DATE_MODES` (config.ts) ← 1 direct importer(s)
- `RPG_EXTRACTION_CONTEXTS` (config.ts) ← 1 direct importer(s)
- `RPG_EXTRACTION_WINDOW_TOKENS_MAX` (config.ts) ← 1 direct importer(s)
- `RPG_EXTRACTION_WINDOW_TOKENS_MIN` (config.ts) ← 1 direct importer(s)
- `RPG_HINT_MAX` (tracker.ts) ← 2 direct importer(s)
- `RPG_RECONCILE_EVERY_BEATS_MAX` (config.ts) ← 1 direct importer(s)
- `rpgCastRefSchema` (actor.ts) ← 1 direct importer(s)
- `RpgGameMode (type)` (enums.ts) ← 2 direct importer(s)
- `RpgGameStatus (type)` (enums.ts) ← 1 direct importer(s)
- `RpgToolName (type)` (tools.ts) ← 1 direct importer(s)
- `RpgTrackerCarrierClass (type)` (enums.ts) ← 1 direct importer(s)
- `RpgTrackerWriteGroup (type)` (tracker.ts) ← 1 direct importer(s)
- `rpgWeatherLabelSchema` (ambient.ts) ← 1 direct importer(s)

**`packages/server/src/infra/providers/index.ts`** — 30

- `AccountCredits (type)` (index.ts) ← 1 direct importer(s)
- `AccountCreditsRequest (type)` (index.ts) ← 2 direct importer(s)
- `AgentMcpServerHealth (type)` (index.ts) ← 1 direct importer(s)
- `AgentMcpServerSpec (type)` (index.ts) ← 1 direct importer(s)
- `ChatHistoryMessage (type)` (index.ts) ← 4 direct importer(s)
- `ChatUsage (type)` (index.ts) ← 3 direct importer(s)
- `ContextUsage (type)` (index.ts) ← 3 direct importer(s)
- `CredentialHealth (type)` (index.ts) ← 2 direct importer(s)
- `DynamicContextChannel (type)` (index.ts) ← 2 direct importer(s)
- `EndpointInspection (type)` (index.ts) ← 1 direct importer(s)
- `FetchAgentSdkModelsRequest (type)` (index.ts) ← 2 direct importer(s)
- `FetchCatalogRequest (type)` (index.ts) ← 2 direct importer(s)
- `FirewallRequest (type)` (index.ts) ← 1 direct importer(s)
- `GeneratedImage (type)` (index.ts) ← 1 direct importer(s)
- `GenerationCost (type)` (index.ts) ← 1 direct importer(s)
- `ImageGenerateResult (type)` (index.ts) ← 3 direct importer(s)
- `ModelCatalogEntry (type)` (index.ts) ← 1 direct importer(s)
- `ProbeRequest (type)` (index.ts) ← 2 direct importer(s)
- `ProviderDeps (type)` (index.ts) ← 9 direct importer(s)
- `ProviderDiagnostics (type)` (index.ts) ← 1 direct importer(s)
- `ProviderRole (type)` (index.ts) ← 1 direct importer(s)
- `RateLimitSnapshot (type)` (index.ts) ← 1 direct importer(s)
- `RerankHit (type)` (index.ts) ← 1 direct importer(s)
- `ResolvedReasoning (type)` (index.ts) ← 4 direct importer(s)
- `ResolvedSampling (type)` (index.ts) ← 2 direct importer(s)
- `ResolvedWarning (type)` (index.ts) ← 6 direct importer(s)
- `ResponseFormat (type)` (index.ts) ← 3 direct importer(s)
- `SummarizeRequestItem (type)` (index.ts) ← 2 direct importer(s)
- `SummarizeResultItem (type)` (index.ts) ← 2 direct importer(s)
- `VerifyAuthRequest (type)` (index.ts) ← 3 direct importer(s)

## 5. Verification receipts

Zero-behavior-change was proven two ways, each with a positive control:

- **Type surface** — a ts-morph dump of every exported name across all 9 barrels, with its plane
  (`type`/`value`) *and its defining file*, taken before (files restored from `HEAD` via
  `git show HEAD:<f>`) and after: **959 symbols, byte-identical**. Positive control: a planted dropped
  export is detected. Declared limit, found by the control: this instrument is **blind to a value
  demoted into `export type {}`** (the declaration still resolves) — which is why the second proof exists.
- **Runtime value plane** — the 7 node-loadable barrels imported for real and `Object.keys()` diffed
  before/after: **453 value exports, identical**, each with its `typeof`. This is the proof that closes
  the blind spot above. `packages/client/src/lib` is browser-only (React) and is covered instead by the
  client typecheck plus the conversion rule itself, which classifies a name as type-only **only** for a
  `TypeAliasDeclaration`/`InterfaceDeclaration` — a value can never be misfiled into the type plane.

Floors, all green: `pnpm typecheck` (per-package) · `typecheck:graph` · `typecheck:tests-dom` ·
`check:structure` · `depcruise packages` (2,817 modules, 15,525 dependencies, no violations) ·
`biome check` + `eslint` on the 8 touched files · `knip` · `pnpm vitest run --project unit
--project contract` cold (605 files, 6,569 tests).
