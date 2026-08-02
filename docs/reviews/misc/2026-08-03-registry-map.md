# Registry map — first pass (2026-08-03, scout census; gaps marked)

> The repo's registries: where dynamic dispatch/contribution is table-driven, how each table is
> kept COMPLETE, and where hardcoded parallel edit-sites should become registries next. First-pass
> skeleton — rows marked ⚠ were located but not opened; a second scout pass owes candidates 3-5.

## 1 · Census

| Registry | Home | Keys | Enforcement |
|---|---|---|---|
| Chat verb→authority matrix | `server/domain/chat/substrate/auth/matrix.ts:43` (`CHAT_VERB_AUTHORITY`) + `:161` surfaces | `keyof ChatService` / `ChatNonVerbSurface` | **exhaustive-by-type** (satisfies Record) |
| Search scope instructions | `server/domain/search/substrate/instructions.ts:18` | `SearchTarget` | **exhaustive-by-type** (self-documented :7) |
| Admin guard | `server/domain/admin/guard.ts:17` | `GlobalAction` | **exhaustive-by-type** |
| Content-class policy | `contracts/chat/content-classes.ts:44` | `ContentSpanKind` | **exhaustive-by-type** + gate `content-part-seam` |
| Chart theme | `ui/charts/chart/use-chart-theme.ts:59` | chart color keys | **exhaustive-by-type** |
| Kit macro registry+metadata | `kit/macro/{registry,builtin-metadata}.ts` | macro name | **completeness-tested** pair (D51 composed volatile) |
| Chrome zones / section groups | `client/state/chrome-registry.ts:19` · `section-registry.ts:17,:32` | zone/group id | **gate** `chrome-registry-completeness` |
| Settings pane/section registries | `client/state/settings-pane-registry.ts:18` + providers | pane/section id | partition/claims validation (⚠ shape not re-read) |
| Home tiles | `client/lib/home-tile-contracts.ts:13` | tile id | tile gate (existing) |
| Imagery prompt templates | `contracts/imagery/index.ts:42,:71` | ExtractionMode/CaptionMode | ⚠ unclassified |
| Automation prose slots | `contracts/automation/prose.ts:16` | ProseSlotId | Partial-Record (deliberate?) ⚠ |
| Preset quality tables | `contracts/preset/index.ts:53,:65` | Quality | ⚠ unclassified |
| Gate registry | `scripts/check/loader.ts:65` — glob-discovered, "the loader IS the registry" | gate file | fail-closed descriptor validation |
| Verify stage registry | `scripts/verify/registry.ts:103` | stage name | ⚠ **no completeness test found — candidate (d)** |
| ⚠ Not opened this pass | workloads axes/params · TEMPLATE_DEFS full shape · plugin manifest/lifecycle tables | | |

## 2 · Enforcement classes

(a) **exhaustive-by-type** — `satisfies Record<union,…>`, tsc forces a row per member (house
Record-not-switch rule). (b) **completeness-tested** — a test binds registry↔metadata (kit macro
= the gold standard). (c) **gate-enforced** — a check stage walks it. (d) **UNENFORCED** — a new
member can be silently forgotten. Every (d) row is a finding.

## 3 · Candidates (next registries) — first-pass verdicts

1. **BINDING_VIEWS → real table** (S): a size-1 `ReadonlySet` at `preset-readout.tsx:116` whose
   own comment (:142) names it an interim stopgap awaiting materialized carrier rows. Rides the
   boarded D8-residue item.
2. **Verify stage REGISTRY completeness check** (S): small, central, apparently untested.
3. **AssembleTrace** — seed claim ("three literal producers") CONTRADICTED first-pass: looks like
   ONE file with multiple write sites (`assemble.ts:520,:665` + helpers :194,:200,:297). Re-scout
   before citing.
4. **Content-class wire** — seed claim ("table + hardcoded switch, edit both") possibly STALE:
   the `content-part-seam` gate exists. Verify what the gate actually checks before treating as
   open debt.
5. ⚠ NOT REACHED: rpg writable-field ~7 sites · bus-event +5 sites · new-domain SERVICE_KEYS ·
   fresh switch-over-shared-union sweep — second scout pass owed.

## Exemption-liveness posture (probed same day, related)

biome suppressions self-clean natively (`suppressions/unused` fires in check — probed). Custom
gates: ~31 of ~77 exemption-carrying gates have stale-entry arms (gold standards:
`bus-coverage.ts` STALE_MESSAGE · `dialog-via-composite.ts:99` · `firehose-import-allowlist.ts:90`
keyed-name blindness guard). NOT yet two-sided: ast.ts `@server-only`/`@test-fixture` tags,
`@public` (ratchet arm ordered two-sided from birth, Lane LENS), the remaining gate allowlists —
retrofit sweep boarded.
