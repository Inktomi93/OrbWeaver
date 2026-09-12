---
kind: review
status: active
updated: 2026-08-29
---

# #599 rederive — B4 (per-rule opt-out) and B11 (Activity tab + listChatActivity)

Verified against main at `e4d017fd8`, code-first (docs/spec used only to locate, not to conclude).

## B4 — per-rule opt-out knob for interaction-direction confirm-first behavior

**Verdict: ⛔ UNBUILT.**

The spec's own catalogue row states it plainly and the code agrees:
`docs/design/interaction-direction-spec.md:518` — "the per-rule opt-out knob is recorded-unbuilt
(`domain/automation/engine/dispatch.ts:208-212`)".

Read `packages/server/src/domain/automation/engine/dispatch.ts:208-222` in full: `inviteOnRefusal`
gates the rate-refusal invitation on `invitesOnRefusal(actions)` — a check against the ACTION
SHAPE (whether the rule carries a spend arm), not a per-rule stored flag. The comment at line 211
states directly: "the per-rule opt-out is recorded-unbuilt — `substrate/suggestions.ts::invitesOnRefusal`".

Searched for any opt-out/knob field on the rule or preset contracts:

- `packages/contracts/src/automation/index.ts` — grepped `confirmFirst|opt.*out|optOut|perRule`:
  only `confirmFirst` (a boolean SUGGESTIBLE-arm flag, `:445,470,501,504,512`, gated on ARM TYPE
  via `SuggestibleAction`/`SuggestibleArmType`, `:609-624`) exists. No opt-out field.
- No `domain/automation/**` verb reads/writes an opt-out column; no `packages/db` schema column
  for it (not searched exhaustively for db but the dispatch-level comment is the load-bearing
  admission — the feature owner's own record says unbuilt).
- No `packages/client/src/features/automation/**` UI control for it (none found by name; not
  expected to exist since the underlying field doesn't).

**Rung reached: not declared.** No field, no persistence, no read path, no UI. The single
authoritative in-code comment (`dispatch.ts:211`) closes the question directly — this is not an
inference from absence, it is the implementer's own contemporaneous note.

## B11 — Activity tab + `listChatActivity`

**Verdict: ✅ BUILT — both halves, full ladder to "called in a live path."**

### Server half

- Verb: `packages/server/src/domain/automation/verbs/list-chat-activity.ts:14-19` —
  `createListChatActivity` implements `AutomationService["listChatActivity"]`, host-gated
  (`requireChatHost`) and reads the SAME `automation_fires` store via `listFiresForChat`.
- Contract: `packages/server/src/domain/automation/contract/service.ts:150` —
  `readonly listChatActivity: (params: ListChatActivityParams) => Promise<FireView[]>;`
- Composed into the service: `packages/server/src/domain/automation/service.ts:54` —
  `listChatActivity: createListChatActivity(ctx),`
- Wired into the trpc router: `packages/server/src/transport/trpc/routers/automation.ts:164-167` —
  `listChatActivity: authedProcedure...` calling `ctx.services.automation.listChatActivity({...})`.

Rung: declared → exported → composed → **called in a live transport path** (a real trpc procedure).

### Client half

- Component: `packages/client/src/features/automation/components/room-activity-log.tsx:41-79` —
  `RoomActivityLog` calls `trpc.automation.listChatActivity.queryOptions(...)` via
  `useSuspenseQuery` — a real client call against the wired proc above.
- Tab def: `packages/client/src/features/automation/lib/activity-context-tab.tsx:22-35` —
  `automationActivityTab: ContextTabDef<ChatContextState>` — host-only (`when: s.isHost`), renders
  `<RoomActivityLog chatId={s.chatId} />` inside a `QueryBoundary`.
- Exported: `packages/client/src/features/automation/index.ts:26` —
  `export { automationActivityTab } from "./lib/activity-context-tab.tsx";`
- **Registered at the composition root** (the live path, not just an export sitting unconsumed):
  `packages/client/src/compose/authed-app.tsx:119-124` — `automationActivityTab` is a member of
  `chatContextContributors = createContributorRegistry<ContextTabDef<ChatContextState>>(
  "chat-context", [...])`, the actual chat CONTEXT-strip tab registry consumed by the chat surface.

Rung: declared → exported → imported → **registered in the live composition-root registry that
renders the chat context strip.** This is the top of the ladder for a UI contribution seam.

## Consequence for #599

**Close + file 1 follow-up**, not "close clean": B11 is fully landed (both halves, live-path
verified). B4's per-rule opt-out knob is genuinely unbuilt — confirmed by the implementer's own
in-code note at `dispatch.ts:211`, not merely doc-declared. File a follow-up issue for the B4
per-rule opt-out knob and close #599 against everything else, citing this file.

## Scope not covered

- Did not exhaustively grep `packages/db/src/schema/automation.ts` for a dormant/unused opt-out
  column (the dispatch.ts:211 comment is treated as the authoritative admission since it is the
  one consuming site and it's dated/contemporaneous with the spec row).
- Did not run `pnpm ast`/ast-grep (unavailable check not performed) — used `grep`/`Read` only;
  both B4 negative and B11 positive claims are corroborated by direct code reads at exact lines,
  which is a stronger receipt than a structural-search count for this narrow, already-located
  question.
