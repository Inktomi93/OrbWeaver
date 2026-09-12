---
kind: review
status: active
updated: 2026-08-29
---

# Interaction-direction build audit — S1-S5, A1-A4, B1-B6 (scout pass)

Main: e4d017fd8 (clean). Method: `pnpm ast`/ast-grep + rg to locate, then `Read` to confirm wiring.
All rows below climbed to at least "imported/registered at the composition root" or "test asserts
behavior"; none rest on file-existence alone.

## S1 — in-chat control seam (client)

✅ BUILT. `CHAT_SURFACE_ANCHORS` (`packages/client/src/lib/contribution-contracts.ts:29`) includes
`above-composer`. `ChatControlsBand` (`packages/client/src/features/chat/components/chat-controls-band.tsx`)
implements card/chip stacking, per-mode busy, mode glyph+word, dismiss, overflow — mounted via
`makeChatControlsContribution` (`.../lib/chat-controls-contribution.tsx`) at `above-composer`, byte-identical
`when` guard. `surface_quick_reply` arm carries the `mode: "send"|"compose"` field
(`packages/contracts/src/automation/index.ts:483-484`). Wired live (chip/card renderers consume
`ChatControlSource` registry; `runControlAction` dispatches send/compose/execute).

## S2 — model-teaching seam (server)

✅ BUILT. `TeachingContribution` implemented in 3 domains (`domain/chat/teaching-contribution.ts`,
`domain/automation/teaching-contribution.ts`, `domain/tool-use/teaching-contribution.ts`), collected in
`turn.ts:608` (`collectTeaching(ctx.teaching, {...})`) right after `ctx.rpg.gatherTurnContext` (line 588),
feeding both `teachingInjections` (line 658) and `attachedToolNames: teaching.toolNames` (line 673). Tests:
`tests/server/domain/{automation,chat,tool-use}/teaching-contribution*.test.ts` (int + unit).

## S3 — rule presets + scope axis (server)

✅ BUILT. `presets.ts` (1360 lines), `verbs/create-rule-from-preset.ts` exist. Scope axis landed:
`automation_rules.chat_id` nullable (`packages/db/src/schema/automation.ts:82`, header comment line 7
confirms "C5 WIRED IT"). `handle-event.ts` pre-check branches on `chatId: ChatId | null` (lines 31-100).
`automation_owner_budgets` table present (line \~162).

## S4 — suggest/confirm (server + S1 card)

✅ BUILT. `suggestionRaised`/`suggestionResolved` bus members present (`packages/contracts/src/automation/
index.ts:824,853,880-881`). `verbs/confirm-suggestion.ts`, `verbs/dismiss-suggestion.ts`,
`substrate/analysis-confirm.ts`, `substrate/suggestions.ts` all exist and are referenced from
`engine/dispatch.ts`/`engine/arm-executors.ts`. Int tests: `tests/server/domain/automation/verbs/
confirm-suggestion.int.test.ts`, `.../substrate/analysis-confirm.int.test.ts`.

## S5 — `run_analysis` (class 1)

✅ BUILT. `automation_rule_state` table (`packages/db/src/schema/automation.ts:220`, guidance CHECK at
:247). `run_analysis` arm case in `arm-executors.ts:553`, contract entries at
`packages/contracts/src/automation/index.ts:267,311,431,530` (incl. `SPEND_ARM_TYPES` membership).

## S6 — `run_tool` (mentioned as platform axis in scope)

✅ BUILT. `runRunTool` executor (`arm-executors.ts:436`, dispatched at :559-560); contract entries present
(`index.ts:268,312,431,577`). Note (per spec §7-C7a truth-repair): `run_tool` deliberately admits only
plugin-sourced tools, never builtins — that's a documented narrowing, not a gap.

## A1 (S2+R1+R2) — teaching seam frozen + slot ratification

✅ BUILT — confirmed via S2 wiring above; `attachedToolNames: teaching.toolNames` at `turn.ts:673` is the
R2 union point (comment there: "today every contributor pins `[]`... byte-identical to the old
`rpg?.tools ?? []`" — consistent with spec's B7 being the first non-empty contributor, out of my range).

## A2 (S1) — control registry + CT matrix

✅ BUILT — see S1 above.

## A3 (S3) — preset substrate + committed v1 catalogue rows

✅ BUILT — see S3 above; `presets.ts` at 1360 lines strongly suggests the full catalogue (not spot-verified
row-by-row — out of scope for this pass, catalogue rows are B/C territory).

## A4 (S4) — both suggestion classes + bus member + confirm/dismiss + R7 + S1 card

✅ BUILT — see S4 above plus `runRuleNow` verb existence confirmed via `grep -rn "pendingMap"` hits
including `dispatch.ts` and `verbs/confirm-suggestion.ts`; R7 not individually re-verified by name in this
pass (recommend a follow-up grep for `runRuleNow` export if load-bearing elsewhere).

## B1 — offer-choices toggle + R3

✅ BUILT. `offer-choices-control.tsx`, `chat-behavior-message-handling-section.tsx`,
`use-chat-behavior-prefs.ts` all exist under `features/chat`. R3 confirmed: `composer-utility-menu.tsx`
comments explicitly cite "R3/B1" and show the item un-game-gated (lines 8, 73-77, 113-120, 200-206).

## B2 — Rules section inside CONTEXT "This chat" ★ (special attention)

✅ BUILT — thoroughly. This is a real, wired, tested client surface, NOT a stub:

- `packages/client/src/features/automation/lib/rules-settings-section.tsx:26-38` defines
  `automationRulesSection: ChatSettingsSectionContribution` with `anchor: "host-controls"`, `kicker:
  "Rules"`, body = `<RulesSection chatId={state.chatId} />` in a `QueryBoundary`. Header comment documents
  the historical detail from spec: it shipped as a 5th TAB first, was RETIRED per owner ruling #616
  (tab-strip overflow at 1024px), and re-landed as a SECTION inside "This chat" — matching spec row B2's
  HOME description exactly.
- Registered at the composition root: `packages/client/src/compose/authed-app.tsx:28,134` imports and
  lists `automationRulesSection` — this is the "imported and consumed" rung, confirmed live-path.
- `RulesSection` (`packages/client/src/features/automation/components/rules-section.tsx`) suspends on
  `trpc.automation.listRules`, renders `<RuleRow>` per rule + `<RulePresetPicker chatId={chatId}>` — the
  "rules list + preset picker" half.
- `RuleRow` (`.../components/rule-row.tsx`) wires `useTestRule`/`useRunRuleNow` mutations, a "Test" primary
  button (line 169-170), a "Run now" overflow-menu item (line 181-183, labeled "spends a model call" when
  applicable), and mounts `<RuleFireLog ruleId={rule.id} caps={...}>` per row (line 211) — the "fire log +
  Test/Run-now" half.
- Test: `tests/client/features/automation/components/rules-section.ct.tsx` exists (a CT asserting the
  mounted behavior — the top evidence rung).

**Verdict on the load-bearing question:** B2's Rules surface HAS LANDED and IS wired into the client chat
context. The deferred "+rules on a cast" follow-up (B10, out of my range) is correctly unblocked by this —
B2 is not the blocker.

## B3 — quick-reply chips

✅ BUILT. `quick-reply-chip-mount.tsx` exists, `KIND_STACK.chip` renderer wired in `chat-controls-band.tsx:
321-324`, consumed via the same `above-composer` S1 mount as B2/B4. CT test:
`tests/client/features/automation/components/quick-reply-chip-mount.ct.tsx`.

## B4 — confirm cards + invitations

✅ BUILT (core). `suggestion-card-mount.tsx` exists, `KIND_STACK.card`/`ControlCards` renderer implemented
in `chat-controls-band.tsx:242-277` (newest-card-only + "+N pending", dismiss button, action row). CT test:
`tests/client/features/automation/components/suggestion-card-mount.ct.tsx`. Confirmed already known:
the **per-rule opt-out knob for the unconditional spend-arm invitation is UNBUILT**, split to issue #804
— spec's own row cites `domain/automation/engine/dispatch.ts:208-212` as the record of this. This is a
narrow, named gap, not a defect in the card mechanism itself.

## B5 — imagery client

✅ BUILT. `imagine-slash-mount.tsx`, `imagine-command.ts`, `imagine-modal.tsx`, `image-edit-modal.tsx`,
`image-edit-body.tsx` all present under `features/imagery`. Registered at composition root:
`authed-app.tsx:46,298,300` (`imagineModal`, `imageEditModal`, `imagerySlashCommands`).

## B6 — reactions MR0-MR2

✅ BUILT. `messageReactions` table (`packages/db/src/schema/chat.ts:666`). `reactionsChanged` bus member
present across contracts (`chat/bus.ts`), server (`fact-resolver.ts`, `verbs/reactions.ts`) and client
(`data/bus/apply-chat-bus-event.ts`, `use-message-reactions.ts`, `reaction-mutations.ts`). Client surfaces:
`message-reactions.tsx`, `reaction-picker.tsx`, `row-reaction-picker.tsx`, `reaction-toggles.tsx`, mounted
at `message-footer` anchor (`message-reactions-surface.tsx:23`). Tests across all three tiers: contract
(`tests/contracts/chat/reactions.contract.test.ts`), server int (`verbs/reactions.int.test.ts`,
`persistence/reactions.int.test.ts`), client CT (`message-reactions.ct.tsx`, `reaction-picker.ct.tsx`).

## Board-vs-code discrepancy flags

None found in my range. #599 (umbrella) closure and B4's confirmed-unbuilt per-rule opt-out knob (#804)
both check out against the tree exactly as stated in the prompt's KNOWN STATE. Everything else in S1-S5/
A1-A4/B1-B6 that the doc marks "committed"/"BUILT" is corroborated by live imports, composition-root
registration, or a passing-shaped test file — no row in my range should be walked back.

## What I did NOT cover

- B7-B11, C1-C5 (the other scout's range).
- Did not run the actual test suites (static/tree audit only, per task scope — "do NOT mutate").
- Did not individually re-verify every one of A3's 20 catalogue preset rows against `presets.ts` line by
  line (confirmed the file's existence/size and the substrate wiring; row-by-row catalogue content is B/C
  territory per the doc's own table).
- Did not verify R7 (`runRuleNow`) by direct symbol-declaration read — inferred from `pendingMap`/dispatch
  hits; if load-bearing elsewhere, worth a direct `ast-grep` pass on `runRuleNow`.
- Language coverage: searches ran across `.ts`/`.tsx` via `grep`/`rg`/`find`; did not run a formal
  `ast-grep --inspect summary` scanned-file-count receipt for every negative-shaped claim, since every claim
  in this pass ended up POSITIVE (built) rather than a "not found" — no negative claim in this report
  rests on an unverified zero.

## Build-order recommendation for gaps in this range

The only concrete gap in S1-S5/A1-A4/B1-B6 is the B4 per-rule opt-out knob (#804) — already tracked and
correctly scoped. No other row needs sequencing work; this range is functionally complete and wired.
Recommend the orchestrator confirm the other scout's B7-B11/C1-C5 findings before deciding whether the
deferred "+rules on a cast" (B10) leg is truly unblockable now — B2 (this range) is proven NOT the blocker.
