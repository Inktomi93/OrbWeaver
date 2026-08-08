# Tool-coverage audit — the 7 rpg tools vs stored state (2026-08-01)

**Audited commit:** `22cf37ea` (main, post-Tracker-stage-1). **Method:** code-recon skill (ast-grep
outline + full-file reads + `grep -a` two-method confirmation on every negative claim).
**Snapshot posture:** [[audit-lists-are-snapshots]] — re-sweep before acting on any row.

## The tool set (derived)

`RPG_LITE_TOOL_NAMES` (`packages/contracts/src/rpg/tools.ts:17-32`): `update_party ·
update_inventory · update_scene · set_tracker · upsert_quest · add_journal_entry · roll_dice`
(roll_dice zero-state, excluded). All three delivery paths (reliable structured `runExtraction`,
cheap `runToolRound`, R1 folded terminal-tools) converge on the same
`toolCallsToExtraction`/`extractionToStateDelta` fold (`entry/compose/rpg.ts:539,721,793,885`;
`tools/apply.ts:511`).

## Ranked findings

1. **Journal `label` = write-only rot.** Model-writable (`tools.ts:194`), stored
   (`db/schema/rpg.ts:216`), served (`views.ts:139`, `list-journal.ts:16`) — never rendered:
   `rpg-journal-tab.tsx:230-233` builds ChronicleRow from `{type,title,content}` only; the file's
   header comment claims otherwise. → **routed to TRK stage 2** (RV-6 rebuild of that tab).
2. **Reliable-mode whole-object `safeParse` (`compose/rpg.ts:517`) drops ALL SIX planes on one bad
   nested field**, while cheap/folded validate per call and lose only the one call — the "reliable"
   path is the most fragile of the three. Compounded by (3). → **EXT-4a** on the board.
3. **`journal[].type`/`content` sit in the same xgrammar nested-array required-non-enforcement blind
   spot that bit `title`** (title was made optional/healed; these weren't; `requireField` is
   scene-only — 4 call sites, `extraction.ts:246-257`). → **EXT-4b**.
4. **Quest objective completion is model-inexpressible:** `upsert_quest.update` carrying
   `objectives: string[]` (`tools.ts:174`) remints all flags `completed:false`
   (`apply.ts:387,416`); the host hand-edit verb preserves ids/completed, the model surface can't.
   → **EXT-4c**.
5. **Max-override amendment site map** (for the in-flight stage-2 lane): `contracts/rpg/tracker.ts:90-97`
   (value schema + the "NO max HERE" comment), `tracker.ts:249` (`trackerReading`),
   `tools/apply.ts:132-154` (`applyTrackerWrites` clamp); `tools.ts:57-61` deliberately does NOT gain
   a max arg (max stays host-authored).

## Verified-clean rows (receipts in transcript)

- inventory `location`: writable (`tools.ts:106` → `apply.ts:213`) AND read back
  (`rpg-inventory-tab.tsx:116-147`).
- weather `type`+`label`: writable (`tools.ts:79-82` → `apply.ts:348`), read via `rpgWeatherText`
  everywhere (reminder, macro-view, delta, scene tab, header, ambient strip).
- tracker `list.items`: set-arm only, by design (list trackers are `write:"set"`).
- R6 grouped schemas keep tracker key enums / `removeCondition` enum / scene establish-fields
  REQUIRED (`extraction.ts:194-241,246-257`).

## Documented-by-design absences (not drops)

item `type`/`icon` (host/display-only, `actor.ts:39-51`, `apply.ts:214`) · condition
`stat`/`turnsLeft` (full-engine fields, `actor.ts:55-58`, `apply.ts:181`) · hp `max` (host-only,
`apply.ts:159`) · relationship-change journal beats derived, never model-authored
(`apply.ts:557-582`).

## Not covered

Scene-tab read-back of plot/calendarDate/appearance/outfit/thoughts (spot-checks only) ·
`fieldLocks` × tool-write interaction · live xgrammar probes (rests on the repo's own measured
precedent) · worktree branches.
