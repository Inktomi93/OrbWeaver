---
kind: review
status: draft
updated: 2026-08-29
---

# Board re-derivation: RUNNING-column rows, main @ e4d017fd8

## #777 — plugin surface-state chatId keying — DONE-ON-MAIN

Commit `200bd6a4d` (ancestor of main). `packages/server/src/domain/plugin/substrate/surface-state.ts`
keys the Map by `${pluginId}:${surfaceId}` or `${pluginId}:${surfaceId}:${chatId}` (stateKey(),
line 55-57), file header explicitly labeled "the chatId dimension is row 777". `get-surface-state.ts:32-35`
and `invoke-ui-action.ts:68-74` both thread `chatId` through membership auth (`resolveChatAuthority`).
Rung: called in a live path (verb → store → transport router).
RECOMMENDATION: verify-and-close.

## #784 — U4 Tier-C containment: pump re-arm (F2) + client realm pin (F3) — DONE-ON-MAIN

Commit `a68d95fe2` (ancestor of main), title matches row description exactly: "the pump re-arm (F2),
the client realm allow-list pin (F3), and the folded advisories (#784, #679)". Commit body states
both F2 and F3 are red-first proven (BOOT\_LOOP\_GUEST CT, closed-set realm allow-list against real worker).
Rung: tested (CT arms named in commit body).
RECOMMENDATION: verify-and-close.

## #599 — interaction direction program A1-A4/B1-B10/C1-C5 — DONE (per spec doc; not a code claim)

Doc: `docs/design/interaction-direction-spec.md`. §7 phase table:

- A1-A4: all "committed"/pins green.
- B1-B10: all "committed"/"BUILT"/"merge-window(landed)" except B4's R5 sub-item explicitly
  "recorded-unbuilt" (an opt-out knob, not the row itself) and B11 (room Activity tab, #687) which
  is listed as a row but not confirmed landed in the table read.
- C1-C5: ALL FIVE rows read "committed" in the §7 table (line 592-596): C1 "committed (RULED F7,
  direct steer)", C2 "committed (confirm-first)", C3 "committed (confirm-first)", C4 "committed
  (the platform shape)", C5 "committed (the platform ruling)" — C5 additionally cross-referenced at
  line 455 as "C5 LANDED — livingLibrary global scope... `packages/db/src/migrations/0000_baseline.sql:54`".
  Line 625: "all the optional stuff COMMITTED — no deferred class remains (phases U0-U8...)"; line 675:
  "NOTHING in this spec is owner-pending."
  Rung: doc-declared (self-reported "committed" status) + spot db/schema cross-refs cited in the doc
  itself; I did not independently re-verify every B-row's code presence — only the C-series was asked
  for and both the C-series table AND the reactions (B6/B7, see #23 below) and roster (B10, see #26
  below) chunks I DID independently verify are consistent with "committed".
  RECOMMENDATION: verify-and-close (C-series specifically); the two named open threads (B4's R5 opt-out
  knob, B11 Activity tab) are the honest residue — not blockers to closing this row if it tracks "the
  direction is shipped", but worth a follow-up row if B11 is wanted.

## #751 — caught-failure-ownership gate + evidence requirement — DONE-ON-MAIN

`docs/reviews/caught-failure-ownership/population.json`: totals.sites=407, enforced=404,
byVerdict.unproven=0 (zero unproven sites). Gate at
`tooling/src/verify/gates/caught-failure-ownership.ts` exists; its `@orb-gate-ignore
caught-failure-ownership(...)` marker convention is used live across \~20+ files in
`tooling/src/verify/**` (grep sample: monotonic-tests.ts, ratchet-row-integrity.ts, pass.ts,
history.ts, program-routing.ts, boot-chunk-ratchet.ts, db-baseline-parity.ts, etc.), each carrying a
stated reason + an "Ends if..." falsifiability clause — the gate's own authoring contract.
Rung: gate declared, exported, and its markers are consumed/enforced across the codebase (called
in a live path — every marked file is a real coupled site the gate scans).
RECOMMENDATION: verify-and-close.

## #23 — message reactions sprint — DONE-ON-MAIN (open arm: per-rule opt-out knob is elsewhere, B4)

- Schema: `packages/db/src/migrations/0000_baseline.sql:337` `CREATE TABLE message_reactions`
  (+ unique index :353, + `reactionsChanged` in both `automation_rules_trigger_type_check` (line 94)
  and `chat_events_type_check` (line 183)).
- Contracts: `packages/contracts/src/chat/reactions.ts`, keys `charactersCanReact` (metadata.ts:292)
  and `reactionsEnabled` (metadata.ts:300, reactions.ts:93) both present with header commentary
  matching the row's cited key names exactly.
- Domain: `packages/server/src/domain/chat/verbs/reactions.ts` exports `createReactions` (→
  `toggleReaction`/`listReactions` — NOT literally named `listChatReactions` as the task cited, but
  same capability) and `createReactAsCharacter`; `persistence/reactions.ts` alongside it.
- Client: `message-reactions.tsx`, `row-reaction-picker.tsx`, `reaction-picker.tsx`,
  `reaction-toggles.tsx`, `use-message-reactions.ts`, `reaction-mutations.ts` all present under
  `packages/client/src/features/chat/`.
- Landed commits on main: `99b6ba2c6` (MR0-MR2 canon plane), `24169def4` (B7 finish — segment/tool/
  toggle tests), both ancestors of main.
  Rung: declared → exported → imported (client hooks/components) → tested (commit messages cite
  dedicated test additions).
  RECOMMENDATION: verify-and-close. Note: the per-rule confirm-first opt-out knob for spend arms is
  recorded-unbuilt but lives under B4 (#599), not this row.

## #26 — complete saved rosters — DONE-ON-MAIN

`packages/server/src/domain/roster-preset/` has full CRUD verb set: `verbs/get.ts`, `create.ts`,
`update.ts`, `remove.ts`, `list.ts`, `apply-to-chat.ts`, plus `service.ts`/`context.ts`/
`contract/{service,params,errors}.ts`. Wired at `entry/compose/roster-preset.ts` and
`transport/trpc/routers/roster-preset.ts`. Contracts at `packages/contracts/src/roster-preset/index.ts`
and `packages/contracts/src/chat/roster.ts`. Client feature at
`packages/client/src/features/roster-preset/index.ts`. Landed commits ancestors of main:
`d760c3bad` (B10 reconciliation — saved CASTS nomenclature), `9ed9686e8`, `b39ec367b`,
`ad25c977f`, `3996c1c88` (doc re-attest).
Rung: declared → exported → imported (compose + router + client) → the B10 reconciliation commit
implies stickler-reviewed completion (F2/F3/F5/F6 findings cleared per `b39ec367b`).
One caveat: a live sibling worktree (`.claude/worktrees/agent-a78592ab1c61b2b1e`, branch
`wt/agent-a78592ab1c61b2b1e`) has a checked-out copy of these same roster-preset files, but its
recent commits (`ff8ba2f7c`, `9e6254a49`, `c7dbfa525`...) are card-atlas/gates work, not roster
work — not evidence of open roster work, just a stale/reused worktree.
RECOMMENDATION: verify-and-close.

## Not covered

- Did not re-verify B1-B3, B5, B8-B9 code presence for #599 — only C1-C5 (as asked) plus B6/B7/B10
  (via #23/#26) were independently checked; the rest is doc-declared only.
- No ast-grep language-count receipts pulled (rg/Read/git log sufficed for these six rows; all
  claims are either commit-ancestry facts or direct file reads, not absence claims needing a
  scanned-file count).
- Did not run any test suites — this is a static/tree re-derivation only.
