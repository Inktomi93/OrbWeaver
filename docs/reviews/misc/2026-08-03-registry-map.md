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

## 3 · Candidates — SECOND PASS RESOLVED (2026-08-03, scout 2; ranked)

1. **Content-class wire — REOPENED, real unenforced debt.** v1 wrongly marked it resolved:
   `content-part-seam.ts` is a sanctioned-importer allowlist on the `ChatContentPart` SYMBOL —
   nothing to do with `CONTENT_CLASS_POLICY`. The live behavior is `pipeline.ts:794-818`
   `spanToWirePart`, an if/else chain on `span.kind` that does NOT read the policy table — the
   table is documentation the pipeline ignores. The dual-edit-site memory stands. Fix shape:
   pipeline dispatches THROUGH the table (or a Record derived from it) + a binding test.
2. **`CharacterFacetId` switch duplication** (NEW, class-d-leaning): the same closed union
   switched to pick JSX per facet in BOTH `character-facet-editor.tsx:92` and
   `character-facet-inspector.tsx:115`; no completeness gate; textbook
   `Record<CharacterFacetId, ComponentType>` collapse (assertNever presence unconfirmed in
   inspector).
3. **BINDING_VIEWS → real table** (S, unchanged — rides D8 residue).
4. **Verify stage REGISTRY completeness check** (S, unchanged, class (d)).
5. ~~AssembleTrace~~ **DROPPED — confirmed single-home**: one construction site
   (`assemble.ts:518-520` freshTrace); every other touch mutates the same object by reference.
   The old "three producers" memory claim is refuted twice over.
6. **Coupled-site families (real but NOT quick registry wins — convention/test-enforced,
   conversion = large cross-package refactor):** rpg writable-field = **13 files verified** on a
   real commit (`745ed3dc` — the ~7 memory is an UNDERCOUNT; mitigating gate:
   field-reachability suite) · bus event-member (+5 mechanism architecturally unchanged,
   producer-side gate live w/ `deferred:{}` empty; exact count unverified this pass) ·
   new-domain: `SERVICE_KEYS` is NOT a type — it's a hardcoded array in
   `tests/server/entry/compose/services.test.ts:35-77`, a **7th, check-invisible coupled site**
   (node-battery-only).

## 3b · GAP-3 classifications (all resolved — every unopened row is enforced)

workloads axes/params = (a) satisfies-Record ×2 · plugin host-v1:216 = (a) · TEMPLATE_DEFS =
(a) via the `Exclude<RegistryTemplateId, …>` nonempty-type trick (:868-870) · imagery templates
= (a) fully-annotated Records · automation prose slots `Partial<Record>` = **deliberate,
double-direction**: 5 domain shards each `satisfies Partial<Record<ProseSlotId,…>>` (bad id
fails) + `prose/index.ts:29-38` composes the full `Record` (missing slot fails) — class (a)
both ways. The verify-stage REGISTRY remains the one suspected (d) in the census.

## Exemption-liveness posture (probed same day, related)

biome suppressions self-clean natively (`suppressions/unused` fires in check — probed). Custom
gates: ~31 of ~77 exemption-carrying gates have stale-entry arms (gold standards:
`bus-coverage.ts` STALE_MESSAGE · `dialog-via-composite.ts:99` · `firehose-import-allowlist.ts:90`
keyed-name blindness guard). NOT yet two-sided: ast.ts `@server-only`/`@test-fixture` tags,
`@public` (ratchet arm ordered two-sided from birth, Lane LENS), the remaining gate allowlists —
retrofit sweep boarded.
