---
kind: design-options
status: draft
updated: 2026-08-08
scope: tag-experience taste calls (4) + guidedActions.prompt contract cap (1)
mode: investigate-only — no code touched
---

# Parked options: tag taste-calls + the guided-prompt contract cap

Investigate-only lane. Every item below was RE-VERIFIED against the current tree (the tag surfaces moved
this session — `fb3cf32af` shipped the audit's top-3 WANTs: sort mode, suggest-existing picker, three-state
exclusion). Receipts are `path:line`. Coverage limits stated per item.

**Standing context that changed since the 2026-08-03 audit:** the audit's three ranked WANTs are DONE.
`fb3cf32af` (`feat(tag): sort mode, suggest-existing picker, three-state tag exclusion`) landed the sort
mode, the `TagPickerDialog` autocomplete, and the three-state filter chips. So the four items below are the
residue the audit explicitly parked as **owner taste calls**, not the engineering it recommended — plus one
contract cap a separate prose-geometry pass surfaced.

---

## 1. TAGDIG taste calls (4)

### 1a. Standalone tag-only backup/restore button

**Current state (re-verified).** The tag library IS backed up — but only as part of the whole-profile
portability bundle, never as a standalone door.

- Export/import verbs exist and are real: `createTagLibraryExport` (`packages/server/src/domain/tag/index.ts:19`
  → `verbs/export.ts`), `createTagLibraryImport` (`verbs/import.ts:56` logs `action: "tag.importLibrary"`).
- They are wired ONLY into the portability compose layer: `entry/compose/portability.ts:131-150` builds a
  `PortableEntity{ kind: "tag", dir: "tags/", ext: ".json" }` whose `exportAll` writes `tags.json` into the
  bundle. That is the sole consumer.
- The tag tRPC router has NO standalone export/import procedure. `transport/trpc/routers/tag.ts:11-102`
  enumerates every procedure: `createTag`, `listTags`, `updateTag`, `removeTag`, `mergeTags`,
  `listTagsWithUsage`, `listPendingSuggestions`, `pruneUnusedTags`, `setTagOrder`, `attachTag`, `detachTag`,
  `bulkAttachTag` — no `exportLibrary`/`importLibrary`. So a tag-only backup button would need a NEW router
  procedure (or a NEW HTTP route) plus a client affordance; the verbs alone don't reach the browser.

The audit's finding holds exactly on today's tree: capability exists at the bundle tier, no tag-only door.

**Options.**
1. **SKIP (status quo).** The whole-profile bundle already carries `tags.json` on every full export; the
   disaster-recovery case is covered wholesale. A tag-only button is a convenience ST needed because it has
   NO bundle mechanism — we do.
2. **Build a tag-only export/import button.** New `tag.exportLibrary`/`importLibrary` tRPC procedures (or
   reuse the existing verbs behind an HTTP route like the portability runner does), plus a button in the tag
   roster header. Cost: a router surface + a file-picker affordance + the new-router sweep classification.
3. **Expose it only as a "download tags.json" read (no restore).** Half-door: export without the risky
   import-merge path. Cheaper, but a backup you can't restore standalone is a weak affordance.

**RECOMMENDATION: SKIP (option 1).** This is the do-it-right-once answer precisely BECAUSE the capability
already exists one tier up — building a second, narrower door is duplication, not completeness. The bundle
is the general mechanism; a tag-only button is a special case of it with its own router surface, its own
import-merge semantics to get right, and its own failure modes, all to save a user from exporting a bundle
they can already export. The forward-thinking shape is "one portability mechanism, all entities ride it,"
which we already have — adding per-entity doors erodes that. Flag to owner only if a "share my tag taxonomy
with a friend without shipping my whole profile" use-case is real; that is the ONE thing the bundle can't do
and it's a sharing feature, not a backup one. If that lands, build option 2, not 3.

*Coverage limit:* did not read the portability HTTP runner's route table in full — confirmed the tRPC router
has no tag export/import procedure and that portability.ts is the verbs' only compose consumer; did not
exhaustively prove no other entry surface calls the verbs (grepped `createTagLibraryExport` → 2 hits: the
`index.ts` re-export and `portability.ts:27` import).

---

### 1b. Import-time Ask/All/Existing/None vs the always-queue model

**Current state (re-verified).** Ours is a durable pending-suggestion queue, not a one-shot import dialog.
No Ask/All/Existing/None setting exists.

- Card tags arrive staged, not applied: the seeder "attaches them as card/pending suggestions after create"
  (`packages/server/src/domain/character/seeder/cards.ts:6`).
- The chokepoint is `attachCardTagByName` (`domain/tag/verbs/attach-card-tag-by-name.ts:16`): it defaults
  `source = "manual", status = "accepted"`, and the card path calls it with `source: "card", status:
  "pending"` — landing rows in the review queue rather than live usage. It "never downgrades an
  already-accepted row" (`:5`).
- There is an LLM auto-distill PRODUCER we have and ST has none of: `domain/discovery/verbs/distill.ts`
  generates tag suggestions (capped `MAX_TAGS = 8`, `:85`) — it stages, it doesn't apply.
- No `tag_import_setting`-equivalent enum or "remember my choice" fast-path exists anywhere in the tag or
  character surfaces (the audit's `NEEDS-OWNER` row; still absent).

So the model is: everything (card-embedded AND LLM-distilled) sits in the queue, the user triages via
Accept/Reject. ST's model is: decide once at import time with a remembered Ask/All/Existing/None policy.

**Options.**
1. **KEEP ours (always-queue).** Strictly more capable than ST's ask-once modal — a durable queue with
   provenance (`source` × `status`) survives past the import moment; ST's decision is lost once the modal
   closes.
2. **Add an ST-style "always accept card tags without review" fast-path** on top of the queue: a persisted
   user setting that flips card-sourced tags straight to `accepted`, skipping the queue for users who trust
   their imports. Additive; the queue stays for distilled tags.
3. **Collapse to ST's ask-once modal.** Would DELETE the durable queue we already built. A regression.

**RECOMMENDATION: KEEP ours (option 1), note it as a deliberate divergence.** This is the do-it-right-once
model already — a durable provenance-tracked queue is the maximal shape; ST's ask-once modal is the lossy
one. Option 2 is a reasonable future affordance IF the owner finds triage fatigue real at scale (auto-accept
card tags, keep the queue for LLM-distilled ones, since those are the genuinely-unreviewed novel tags). But
it's an ADD, never a replace — recommend deferring option 2 until triage fatigue is observed, not building
it speculatively. Do NOT do option 3 under any circumstances; it discards shipped capability for parity with
a weaker design.

*Coverage limit:* read the seeder's staging comment and the `attachCardTagByName` verb; did not trace the
full real-character-card import path (`entry/import/*`) line-by-line to prove no fast-path setting is read
there — grepped the tag/character surfaces for a `tag_import_setting`-class enum and found none. The
anti-troll cap on card-EMBEDDED tags (distinct from the distill `MAX_TAGS=8`) remains a separate security
question the audit flagged, out of this taste-call's scope.

---

### 1c. Whether Manual / `sortOrder` RETIRES now that A–Z / Most-Used shipped

**Current state (re-verified).** Manual mode is LIVE and owner-ruled to stay. This is the sharpest item —
the code header records an explicit ruling that must be surfaced, not silently re-litigated.

- The comparator home records the ruling verbatim: `packages/client/src/lib/tag-sort.ts:9-10` —
  *"MANUAL IS NOT RETIRED (owner ruling 2026-08-03): `sortOrder` keeps its three server-side readers and its
  drag affordance. The two derived modes JOIN it — they do not replace it."*
- Three sort modes are live: `TAG_SORT_MODES = ["used", "alpha", "manual"]` (`tag-sort.ts:17`), default
  `"used"` (`:21`).
- `sortOrder`'s server-side readers still exist (the "three readers" the ruling protects):
  - `domain/tag/persistence/queries.ts:39` — the roster query orders `sortOrder is null, sortOrder, name`.
  - `domain/tag/verbs/set-order.ts` + `queries.ts:150-156` — `setTagOrder` writes `position i → sortOrder i`.
  - `domain/tag/verbs/export.ts:24` + `import.ts:46` — `sortOrder` rides the tag-library backup file.
  - (also `kit/serde/tag/index.ts:30,48,62,72` carries it across the serde boundary, and
    `domain/character/persistence/queries.ts:387,396` orders the character-detail tag list by it.)
- The ≤30 drag-cap the owner ruled leave-as-is: `tag-collection-rows.tsx:74-76` — `windowed = tags.length >
  COLLECTION_LARGE_GROUP`; `draggable = !windowed && sortMode === "manual"`. Above the cap the roster is a
  read-only `VirtualList`; manual mode still SORTS (by `sortOrder`) but offers no drag handle.
- The roster already SAYS this out loud (side-eye P1/P2 fixes, header `tag-collection-rows.tsx:27-33`): the
  `tagOrderHint` explains that above the cap manual is inert, and the Select shares its line with the hint.

**The RETIRE question (separate from the drag-cap the owner already ruled):** at ~400 tags manual is
near-unreachable as a *drag* affordance (capped ≤30), and above the cap its OUTPUT is pixel-identical to A–Z
(every `sortOrder` is null → the comparator tiebreaks on name, `tag-sort.ts:39`). So does `sortOrder`/manual
earn its keep, or is it dead weight?

**Options.**
1. **KEEP manual (status quo, owner-ruled).** It's a real affordance for a SMALL library (≤30 tags: full
   drag-reorder), and `sortOrder` has five live server readers plus a place in the backup file. Retiring it
   is a schema+wire+backup-format change, not a UI tweak.
2. **Drop manual as a SELECTABLE MODE but keep the `sortOrder` column.** Remove `"manual"` from
   `TAG_SORT_MODES` and the Select; keep the column read by the character-detail query and the backup file.
   The drag affordance goes; the stored order becomes vestigial-but-harmless.
3. **Fully retire `sortOrder`.** Drop the column, the `setTagOrder` verb + router procedure, the drag arm,
   and the backup-file field. Squash the schema (pre-launch, `0000_baseline.sql`). Maximal deletion.

**RECOMMENDATION: KEEP manual (option 1) — but this is OWNER-RULED, and the finding must be stated as a
FORK, not a silent decision.** The code header (`tag-sort.ts:9-10`) records an explicit 2026-08-03 ruling
that manual is not retired and the derived modes JOIN it. That ruling is evidence the orchestrator/owner
owns, not a veto this lane overrides — but the RETIRE question is genuinely live and the header itself
doesn't foreclose re-asking it. My engineering read: option 1 is correct BECAUSE the do-it-right-once model
is "one ordering axis with three modes, drag is a mode-scoped affordance that degrades honestly at scale" —
which is exactly what shipped, complete with the hint that tells the user when manual is inert. Retiring
manual would DELETE a real small-library affordance to save nothing (a nullable int column and an inert
comparator branch cost approximately zero), and would remove `sortOrder` from the tag-backup format, which is
a portability regression. The ≤30-tag drag case is a legitimate use (a curated favorites library), not dead
code. **If the owner wants to revisit:** option 2 (drop the mode, keep the column) is the reversible
middle — it removes the "manual is pixel-identical to A–Z above 30" confusion the side-eye pass had to paper
over with a hint, at the cost of the small-library drag affordance. Option 3 (full retire) is not worth the
schema/backup churn pre-launch for a column that costs nothing to keep. **Fork stated: header says keep;
engineering agrees keep; the reversible alternative if taste changes is option 2.**

*Coverage limit:* enumerated `sortOrder` readers via `ast-grep '$X.sortOrder' -l ts` (scanned=1250) +
literal grep; the "three server-side readers" in the header undercounts by today's tree (I count five
distinct read sites — the header's number predates the serde + character-query sites, or counts by
subsystem). That's a doc-freshness note, not a contradiction of the ruling.

---

### 1d. Folder OPEN (collapsible) vs CLOSED drilldown for character-library tag grouping

> **RULED + BUILT 2026-08-09 (owner): OPEN, CLOSED deferred.** `folderType` now has a live reader —
> `character-list-view.ts`'s `groupStartsOpen` decides each categorized group's FIRST paint, and
> `character-categorized-list.tsx` passes it to `Collapsible defaultOpen`: an OPEN tag's group starts
> expanded, a plain (`NONE`) tag's starts collapsed behind its name + count, and the Uncategorized bucket
> (no tag, nothing to configure) always starts expanded. The user's own toggle wins from then on
> (`defaultOpen`, not `open`). CLOSED's hide-until-entered drilldown is DEFERRED by the same ruling and is
> deliberately NOT scaffolded: it lands in the same collapsed-by-default arm as NONE, the folder-type
> Select's description says so out loud, and the exhaustive switch makes building it a decision at one
> site. The write-only state described below is the PRE-2026-08-09 record.

**Current state at the time of writing (pre-ruling).** `folderType` was WRITE-ONLY. The enum and the
editor existed; nothing read the field to change list behavior.

- The field is authored: `tag-member-surface.tsx:182,185` — a Select bound to `patchStyle({ folderType })`,
  reading `tag.folderType`. That is the ONLY read, and it's the editor reading back its own written value.
- The DB column and contract exist: `packages/db/src/schema/tag.ts:87` (`folder_type` enum,
  `.default(DEFAULT_FOLDER_TYPE)`), `packages/contracts/src/tag/index.ts:50,65`.
- NO consumer branches on it: `grep folderType|CLOSED|drilldown|breadcrumb|isBogus` across
  `packages/client/src/features/character/**` (ts+tsx, excluding dist) → **zero hits**. The categorized list
  (`character-list-view.ts`'s `groupByTag`) groups by tag name and never reads `folderType`. There is no
  open/closed behavior, no drilldown navigation, no back button, no breadcrumb.

So today `folderType` is a stored-but-inert label. ST's version is a full navigation model (open/closed +
drilldown + breadcrumb via `isBogusFolder`/`chooseBogusFolder`).

**Options.**
1. **Build OPEN as a real behavior.** A tag-group section in the categorized list can collapse/expand.
   Additive to the existing `groupByTag` categorized model — the section header gains a disclosure control,
   the members hide/show. `folderType`'s OPEN value starts meaning something (expanded by default);
   NONE/CLOSED can map to a collapsed-by-default section for now. Cheap, no navigation-model change.
2. **Build CLOSED drilldown too.** CLOSED = hide members until the folder is "entered" via drilldown, with
   a back button / breadcrumb. This CHANGES the browsing model from "scan everything at once" to
   "navigate into folders."
3. **Drop `folderType` entirely.** It's write-only dead weight; if we're not going to read it, retire the
   enum + column + editor Select (pre-launch schema squash).

**RECOMMENDATION: build OPEN (option 1), defer CLOSED (option 2) as a separate owner decision — matches the
audit.** This is the do-it-right-once answer for a REASON: OPEN is additive to the categorized-list model we
already have and arguably better than ST's — the "scan everything, groups are collapsible" model fits a
library you browse by attribute, whereas CLOSED/drilldown (hide-until-entered) FIGHTS that model, trading
scannability for a file-system metaphor tags don't need. Building OPEN makes `folderType` finally mean
something (its OPEN value drives default-expanded), which also resolves the write-only-field smell without
the deletion of option 3. CLOSED is a genuine navigation-model fork — it's not "more of OPEN," it's a
different browsing paradigm — so it earns its own owner decision rather than riding OPEN's coattails. Do NOT
drop `folderType` (option 3): OPEN gives it a real reader, and the column already exists across schema +
contract + editor. **If OPEN is deferred too,** then option 3 becomes the honest move — a write-only field
that will never be read is debt, and "we might build folders someday" is not a reader.

*Coverage limit:* proved zero `folderType` consumers in `features/character/**` (the list surface) via
grep; read `tag-sort.ts` + `tag-collection-rows.tsx` in full; did NOT read `groupByTag`'s implementation
line-by-line (the audit did — it groups by name, no `folderType` branch), and did not survey every possible
list surface outside `features/character` for a stray reader (the field's only non-editor read would have to
live in the character list, which is where I looked).

---

## 2. `guidedActions.*.prompt` contract cap

**Current state (re-verified).** The guided-action prompt is UNCAPPED at both the schema and the UI, and it
reaches BOTH the DB and the model wire unbounded. Its siblings are all capped.

- The schema: `packages/contracts/src/preset/index.ts:333` —
  `prompt: z.string()` inside `guidedActionConfigSchema`. No `.max()`. This shapes all six guided actions
  (`guidedActionsSchema`, `:347-377`).
- The sibling caps in the SAME file:
  - prose slots: `PROSE_MAX_CHARS = 4000` (`contracts/src/prose-slot/index.ts:213`, `text:
    z.string().max(PROSE_MAX_CHARS)`).
  - format strings: `MAX_FORMAT_STRING_LENGTH = 10_000` (`preset/index.ts:40`), applied to every
    `formatStrings` key (`:1575-1578`).
  - section literal content / marker template: `MAX_TEXT_LENGTH = 100_000` (`:30`, `:644,671`).
  - names 200 (`:28`), questions 2000 (`:38`), choice labels/values smaller still.
  - **guided prompt: NOTHING.**
- It reaches the DB unbounded: the preset write validates through `promptConfigWriteSchema` (tRPC input,
  `transport/trpc/routers/preset.ts:27,51`), which is built on `promptConfigSchema` (`preset/index.ts:1582`)
  whose `guidedActions: guidedActionsSchema.optional()` (`:1600`) carries the uncapped `prompt`. So the
  write boundary validates everything EXCEPT the prompt length, and the config blob persists to the preset
  row.
- It reaches the model wire unbounded: `domain/chat/assembly/macros.ts:244-245` resolves
  `config.prompt` via `resolveGuidedInstruction(config.prompt, args.input, …)` and injects it into the turn
  (system block or in-chat, per `role`). Also read at `chat/verbs/read.ts:1200` and
  `entry/compose/assets-character.ts:238-244` (greeting studio).
- The UI editor ALSO doesn't bound it: `template-drill-in.tsx:117-119` renders the guided prompt via
  `<field.MacroField … />` with NO `maxLength` — unlike the prose body two functions down
  (`:172`, `maxLength={PROSE_MAX_CHARS}`). `MacroField` SUPPORTS `maxLength` (`forms/bound-fields/
  macro-field.tsx:30,56`); guided just doesn't pass it. (Note: the `formatStrings` MacroField at `:113-114`
  ALSO omits UI `maxLength` — but its SCHEMA cap at 10000 still bounds the DB. Guided has neither guard.)
- The guided DEFAULTS are prose slots (capped 4000): `OPENING_DEFAULT_PROMPT =
  PRESET_PROSE_SLOTS["preset.guided.opening"].text` etc. (`preset/index.ts:316-322`). So the shipped
  defaults fit in 4000; only a user OVERRIDE can exceed any bound.

**So the answer to "does an uncapped prompt reach a wire/DB unbounded?" is YES, both** — a user editing a
guided-action prompt can author arbitrary-length text that persists to the preset row and is spliced into
the model's system prompt with no ceiling. This is a real inconsistency, not a phantom: every other authored
text field in this contract has a deliberate cap, and this one is the lone gap.

**Options.**
1. **Cap at `MAX_FORMAT_STRING_LENGTH` (10000), guided's functional sibling.** Guided prompts and format
   strings are the SAME class — macro-carrying injection templates (`{{input}}`, `{{macros}}`) spliced into
   a turn. `formatStrings` (`continueNudge`, `impersonateNudge`, `responseNudge`, `wiFormat`) is exactly
   this shape, capped at 10000. Reusing that constant makes the two injection-template families agree.
2. **Introduce a shared `MAX_INJECTION_TEMPLATE_LENGTH` (= 10000) that BOTH `formatStrings` and
   `guidedActions` reference.** The do-it-right-once version of option 1: today `MAX_FORMAT_STRING_LENGTH` is
   mis-named if guided also uses it (guided prompts aren't format strings). One named constant for the
   "authored turn-injection template max" class, referenced by both schemas, makes the shared cap explicit
   and self-documenting.
3. **Cap at `PROSE_MAX_CHARS` (4000), matching guided's own DEFAULTS.** Guided defaults ARE prose slots
   (4000). Argument: the shipped wording fits in 4000, so an override should too. Counter: 4000 is a tighter
   bound than the functional sibling (format strings get 10000), and a power user authoring an elaborate
   steering template is a legitimate case a prose-length cap would pinch.
4. **Leave uncapped, documented reason.** Only defensible if guided prompts were genuinely a different class
   that needed unbounded length — they aren't; they're the SHORTEST class (injection nudges), so this is the
   weakest option.

**RECOMMENDATION: option 2 — introduce a shared `MAX_INJECTION_TEMPLATE_LENGTH` constant (value 10000) and
point BOTH `formatStrings` and `guidedActions.*.prompt` at it, AND wire the UI `maxLength` on the guided
`MacroField` (and, while there, the `formatStrings` `MacroField`).** This is the do-it-right-once answer to
the "single authored prompt text max" question the brief raises. The honest finding is that there is NOT one
max for the WHOLE preset — the tiered caps are deliberate and correct (a section's literal content genuinely
needs 100000; a name needs 200; you would NOT want to collapse those). But there IS a natural shared cap for
one CLASS: authored turn-injection templates. `formatStrings` and guided prompts are that class, and they
should share one named constant rather than one being capped at 10000 by an oddly-named format-strings
constant and the other being uncapped by omission. Value 10000 because it matches the existing capped
sibling (no regression for any existing format string, and generous for a steering template). The UI
`maxLength` is the second half of the fix — the prose body proves the pattern (`template-drill-in.tsx:167-172`
sources its cap from the contract and blocks typing/paste), and the guided field should do the same rather
than validate-and-reject only at save. If a lighter touch is wanted, option 1 (reuse
`MAX_FORMAT_STRING_LENGTH` as-is, no rename) is the same behavior with less churn — but the constant name
then lies about one of its two users. Do NOT pick 4000 (option 3): it under-serves the power-user steering
case and disagrees with the functional sibling. Do NOT leave uncapped (option 4): it's the one authored text
field in the contract with no ceiling, reaching both DB and model wire, and that's an inconsistency, not a
design choice.

*Coverage limit:* traced the write boundary (`promptConfigWriteSchema` → `promptConfigSchema` →
`guidedActionsSchema`) and the two model-wire read sites (`macros.ts`, `read.ts`) + the greeting-studio read
(`assets-character.ts`); confirmed the UI field omits `maxLength` and that `MacroField` supports it. Did NOT
measure an actual over-length round-trip against a live DB (the schema/wire path is proven by code, not by a
drive). Did not audit whether any OTHER preset authored-text field is similarly uncapped beyond the ones
enumerated above — the guided prompt is the one the brief named and the one the sibling-cap census surfaced.

---

## Summary table

| # | Item | Current state (receipt) | Recommendation |
|---|---|---|---|
| 1a | Tag-only backup button | bundle-only; no tag router procedure (`tag.ts:11-102`) | **SKIP** — bundle already covers it; per-entity doors erode one-mechanism portability |
| 1b | Import Ask/All/Existing/None | always-queue + provenance (`attach-card-tag-by-name.ts:16`); no setting | **KEEP ours** — strictly more capable; auto-accept fast-path only if triage fatigue is real |
| 1c | Retire manual/`sortOrder` | LIVE, owner-ruled keep (`tag-sort.ts:9-10`); 5 server readers | **KEEP** (owner-ruled fork stated); reversible middle = drop the mode, keep the column |
| 1d | Folder OPEN vs CLOSED | ~~`folderType` write-only, zero consumers~~ → **BUILT 2026-08-09** (`groupStartsOpen`) | **Build OPEN, defer CLOSED** — owner-ruled and shipped; CLOSED still deferred |
| 2 | guided prompt cap | uncapped `z.string()` (`preset/index.ts:333`); reaches DB + wire | **Shared `MAX_INJECTION_TEMPLATE_LENGTH`=10000** for formatStrings + guided; wire UI `maxLength` too |
