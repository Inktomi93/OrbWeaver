---
kind: review
status: draft
updated: 2026-08-29
---

# Interaction-direction build audit — B7-B11, C1-C5, preset catalogue, cast/rules-apply

Scout pass against `main` (e4d017fd8-era tree), authority = `docs/design/interaction-direction-spec.md`.
Method: ast/rg + Read, full ladder per row. See per-row receipts below.

## B7 — reactions MR3-MR5 + first tool-attach — ✅ BUILT (full ladder)

- Speaker-span anchor: `packages/kit/src/speaker-label/index.ts:64`.
- Toggles wired end-to-end: schema `packages/contracts/src/chat/metadata.ts:292,300`, settings defaults
  `packages/contracts/src/settings/index.ts:697,704`, resolver `packages/server/src/domain/chat/verbs/reactions.ts:90-95`,
  verb gating `:222,268,300`, service doc `packages/server/src/domain/chat/contract/service.ts:313-378`.
- S2 attach contribution: `packages/server/src/domain/chat/teaching-contribution.ts:203,226-233` — gates
  tool-name emission on BOTH `reactionsEnabled && charactersCanReact`, called in a live path (chat's
  `buildTurnContext`).
- react tool + verb + persistence all present (`packages/server/src/domain/chat/verbs/reactions.ts`,
  `persistence/reactions.ts`). Test asserts behavior: contract exact-tuple pins referenced in spec are
  reachable (not independently re-run here — static verification only, no test execution performed).

## B8 — checks (dice) — ✅ BUILT

- `rollDice` verb: `packages/server/src/domain/rpg/verbs/roll-dice.ts:33-46`, exported on
  `RpgService.rollDice` (`contract/service.ts:848`), wired at trpc `packages/server/src/transport/trpc/routers/rpg.ts:93`,
  and as an rpg tool (`domain/rpg/tools/index.ts:213-216`). Called-in-a-live-path rung reached (trpc router).
  Client-side chip/tool-renderer surfaces not independently re-verified in this pass — flag as unconfirmed rung
  for the S1-mount/tool-renderer half specifically (server side is solid).

## B9 — clocks — ✅ BUILT (full ladder, client + server + wire)

- Widget: `SegmentedClock` declared+exported `packages/ui/src/charts/meter/segmented-clock.tsx:55`,
  consumed at `packages/client/src/features/automation/components/clock-meter.tsx:72`.
- Mount: thread-flank contribution `packages/client/src/features/automation/lib/clock-meter-surface.tsx:24`
  (`anchor: "thread-flank"`).
- Vars read proc: `getRuntimeVariables` — declared `chat-lifecycle.ts:498`, exported on `ChatService`
  (`contract/service.ts:305`), auth-matrixed `substrate/auth/matrix.ts:129`, wired at trpc
  `transport/trpc/routers/chat.ts:620-621`. Full ladder: declared→exported→wired-to-transport.
- `clockFires` preset present (`domain/automation/contract/presets.ts:610`).

## B10 — saved casts (#26) — 🔧 PARTIAL, receipted

- Cast domain (characters/anchor persona/group config) BUILT full ladder:
  `packages/db/src/schema/roster-preset.ts` (rosterPresets + rosterPresetMembers tables, no rule/knob
  columns anywhere in the file — read in full), `packages/server/src/domain/roster-preset/**`
  (create/update/apply-to-chat/remove/list verbs, 757 LOC total, all read), client surfaces present
  (`packages/client/src/features/roster-preset/**`, `new-chat-picker-surface.tsx`, `authed-app.tsx`
  "Start from saved cast" wiring).
- **The "+rules" leg specified at spec:524 ("the room's enabled PRESET IDS + KNOB VALUES re-minted on
  apply") is ABSENT.** Negative receipt: `grep -rn "ruleIds|presetId|rulePreset|automationRule"
  packages/server/src/domain/roster-preset/` returns zero automation/rule-preset hits (every `presetId`
  hit is the ROSTER preset's own id, not an automation rule-preset reference) — non-zero scanned files,
  zero matches for the automation-linkage vocabulary. Schema confirms: `roster_presets` /
  `roster_preset_members` carry only `ownerId/name/description/anchorPersonaId/groupConfig` and
  `presetId/characterId/position/talkativeness/disabled` — no `ruleIds`/`automationPresetIds`/`knobs`
  column exists.
- WHAT IT NEEDS: a schema column on `roster_presets` (e.g. `automationPresetIds: text(json)` or a junction
  table `roster_preset_rules`) carrying the enabled rule-preset ids + their knob values, a db-drop
  (merge-window, per spec's own B10 classification), and apply-time wiring in
  `verbs/apply-to-chat.ts` to re-mint those rules via `createRuleFromPreset` (S3) at apply, mirroring how
  `groupConfig` is re-parsed at apply today (`apply-to-chat.ts:38+`, same pattern, not yet extended).

## B11 — Activity tab + inbox doorway — ✅ BUILT (confirmed, matches board)

- `listChatActivity`: declared `verbs/list-chat-activity.ts:14`, exported `service.ts:54` and
  `contract/service.ts:150`. Client consumer at `packages/client/src/compose/authed-app.tsx:119` per
  prior board receipt (re-confirmed server side here).

## Member-kind union (contracts/chat/roster.ts) — confirmed as documented

`rosterMemberSpecSchema = z.discriminatedUnion("kind", [characterMemberSpecSchema])` — literally ONE arm
(`packages/contracts/src/chat/roster.ts:99`). No observer/agent/other seat kind exists anywhere in the
union; the purge is complete as of this tree. Any non-`character` seat kind is UNBUILT (no second arm
to even declare).

## Preset catalogue — 22 specified, 22 built (exact match)

Spec §4 enumerates 20 numbered rows; row 15 bundles 3 presets (storyPacing/distillLore/proseAudit) →
22 conceptual presets total. `packages/server/src/domain/automation/contract/presets.ts` declares exactly
22 `id:` entries (grep receipt, lines 343-1311), one-to-one matched by name to every spec row including
the three "BUILT" post-hoc rows (17/18/19: illustrateOnLoreReveal, reactToLoreActivation,
autoSetSceneBackground) and C5's livingLibrary (20). ENFORCER confirmed: `as const satisfies
Record<RulePresetId, ErasedRulePresetDef>` at `presets.ts:1360` — exhaustive, tsc-forced.
Verdict: ✅ BUILT, count exact, no gap.

## C1 — run\_analysis (S5 whole) — ✅ BUILT

Arm dispatch `engine/arm-executors.ts:553` (`case "run_analysis"`), dedicated executor
`engine/analysis-arm.ts` (structured pass, retry, response-format), state table `automation_rule_state`
schema `packages/db/src/schema/automation.ts:212-247` (guidance-length CHECK included), admission rows
`substrate/validate.ts:130,259`. `storyPacing` preset present. Full ladder incl. schema+dispatch+preset.

## C2 — distill-lore preset — ✅ BUILT

`distillLore` preset id at `presets.ts:823`; lore-write route shared with `insert_world_info_entry`
executor (`engine/lore-write.ts:2`, extracted "at C1" per its own header, consumed by both routes).

## C3 — prose-audit preset — ✅ BUILT

`proseAudit` preset id at `presets.ts:996`; confirm-suggestion path references `run_analysis`
armType at `verbs/confirm-suggestion.ts:175` (rewrite-card hash-guard machinery referenced in spec is
consumed by this same confirm path — not independently re-read line-by-line in this pass).

## C4 — run\_tool arm — ✅ BUILT

Executor `engine/arm-executors.ts:436` (`runRunTool`) dispatched at `:559-560` (`case "run_tool"`).
Per §7-C7a's truth-repair, this admits ONLY plugin-sourced author-owned tools (not builtins) —
confirmed as the documented narrowing, not re-verified against the executor body line-by-line here.

## C5 — owner-global lane + living-library — ✅ BUILT

- `automation_owner_budgets` table: `packages/db/src/schema/automation.ts:152,161`.
- Settings pane: `OwnerAutomationSurface` exported `features/automation/index.ts:24`, mounted at
  `features/automation/lib/automation-pane.tsx:9-15` with `OWNER_BUDGET_ANCHOR`/`OWNER_RULES_ANCHOR` —
  this is the doc's claimed "automation settings pane" now populated (no longer `placeholder: true`;
  did not re-grep for a stray leftover placeholder flag elsewhere, worth a quick follow-up if doubted).
- `livingLibrary` preset at `presets.ts:1186`.

## Build-order recommendation for the one real gap in range (B10's "+rules" leg)

1. Schema: add the rule-preset-linkage column/junction to `roster_presets` (merge-window, batch with any
   other pending db-drop to avoid a second dev-db reset) — a JSON array of `{presetId, knobs}` on
   `roster_presets` is the cheapest shape consistent with the existing `groupConfig` JSON-column precedent
   on the same table.
2. `verbs/create.ts` / `verbs/update.ts`: accept + persist the array (mirrors `groupConfig` handling
   already in the file).
3. `verbs/apply-to-chat.ts`: after `setGroupConfig`, loop the stored preset ids/knobs through
   `createRuleFromPreset` (S3's existing mint verb) into the target chat — same re-parse-at-apply
   posture spec already prescribes for `groupConfig`.
4. Client: `saved-casts-modal.tsx` / cast picker surfaces need a preset-picker sub-control to author the
   rule set at save time — not scoped/estimated here (out of this scout's depth; a UI lane's call).

## One-line verdict

The "add rules/other things to a room" capability the owner remembers is **PARTIAL**: cast-of-characters

- persona + group-config reuse is fully built and wired end-to-end (B10's character half), but the
  rule-preset ("automation behaviors") leg of a saved cast — the actual "+rules" the owner is recalling —
  has ZERO code anywhere (no schema column, no verb wiring, no client picker); it needs a merge-window
  schema drop plus apply-time re-mint wiring before it exists at all.
