---
kind: review
status: archived
updated: 2026-08-30
---

# Correctness investigation — three findings (lane cb-correctinvest, 2026-08-24/25)

Charge: investigate three handed-down findings — confirm or refute against the tree, fix nothing
except a confirmed lying gate (per the fix-tools-as-found-lying rule). Verdicts: **all three
CONFIRMED.** Finding 2 (the lying gate) was FIXED and landed this session per the brief's
authorization (commit `4ef58f4888da36a5c60263d9a7a31e54ed74fb4b`, board #701). Findings 1 (#700)
and 3 (#702) are reported with fix shapes for dispatch, per the orchestrator's mid-run instruction.

---

## FINDING 1 — CONFIRMED (P1 product): confirming/dismissing a suggestion never retires the client card

**Site:** `packages/client/src/features/automation/components/suggestion-card-mount.tsx:80` (the
`asks` state) — with the seam spanning
`packages/client/src/features/automation/lib/apply-automation-bus-event.ts:62-82` (the fold),
`packages/client/src/features/automation/lib/suggestion-mutations.ts` (the writes),
`packages/server/src/domain/automation/verbs/confirm-suggestion.ts` and
`.../verbs/dismiss-suggestion.ts` (the take), and
`packages/contracts/src/automation/index.ts:781-807` (the bus union).

**Defect (one sentence):** the server's take-once claim/drop deletes the ask from the in-RAM store,
but NOTHING on the client removes the corresponding card from the mount's `asks` state — no bus
event exists for retirement, no local optimistic removal is wired, and there is no query to refetch.

**The exhaustive enumeration (why nothing retires it):** the `asks` list changes through exactly
four channels, all read from the mount in full:

1. `applyAutomationBusEvent` (line 84) — the TOTAL map over `AutomationBusEvent`. Its six arms:
   `suggestionRaised` (replaces per source-slot), `ruleAutoDisabled` (drops that rule's asks), and
   `quickReplySurfaced` / `ruleFired` / `ruleErrored` / `rulesChanged` — all identity for asks
   (`apply-automation-bus-event.ts:78-81`). The union
   (`contracts/src/automation/index.ts:781-807`) has **no** `suggestionResolved`/taken/dismissed
   member. Confirm emits only `ruleFired`/`ruleErrored` (`confirm-suggestion.ts:179,226`) — no-op
   arms; the plugin-origin confirm path and the **dismiss verb emit nothing at all**
   (`dismiss-suggestion.ts:29-41` — no `ctx.notify` anywhere).
2. The TTL timer (mount lines 92-100) — prunes at `expiresAt`, i.e. up to
   `AUTOMATION_SUGGESTION_TTL_MS = 1_800_000` (30 min, `substrate/suggestions.ts:30`) after raise.
3. `onSocketLive` reconnect clear (line 86).
4. The mutations (`useConfirmSuggestion`/`useDismissSuggestion`) are `busDriven: true` with no
   invalidation and no callbacks — `createEntityMutation` (`data/create-entity-mutation.ts`) touches
   only query cache/toasts, never this component state. The mount's `run`/`dismiss` closures call
   `.mutate()` bare (lines 130, 136) with no per-call `onSuccess`.

**The implementation's own comment asserts the missing behavior:** `suggestion-mutations.ts:8` —
"the card's disappearance is the SOURCE's own state transition (the ask was taken — the take is what
the mutation just did), not a refetch." No such transition exists in the source. Likewise
`dismiss-suggestion.ts:6-8` claims "the host's other tab … stops offering it on its next reconcile"
— but the room is `resumable: false` (no replay), so the only "reconcile" is a socket drop/reconnect
or the TTL; on a healthy socket the other tab holds the dead card the full 30 minutes too.

**Failure scenario (inputs/state → wrong outcome):** host clicks "Do it" (or dismiss) → verb
succeeds, ask deleted server-side → mutation resolves → the card REMAINS rendered and re-enabled
(`confirm.isPending` returns false, so the action button is clickable again). A second click throws
`SuggestionNotFoundError` → the errorToast "Couldn't run that — the suggestion is no longer
available" fires on the host's OWN just-confirmed action. The card sits until TTL/reconnect/re-fire.
Worse, the band renders `cards.at(-1)` — the NEWEST — only (`chat-controls-band.tsx:50,245`; spec
§2 law 5, `docs/design/interaction-direction-spec.md:103-104`), so a dead newest card MASKS every
older still-pending card behind "+N pending", and the count itself includes the dead card (a lie).
Cost: the host answers a card and it visibly refuses to leave; other live asks are hidden for up to
30 minutes; double-clicks generate refusal toasts on successful actions.

**Fix shape — two arms, both small; recommend BOTH (A now, B with it or as immediate follow-up):**

- **ARM A (acting tab, minimal):** local removal in the mount. The factory already forwards per-call
  `MutateOptions` (`create-entity-mutation.ts:98-101` documents exactly this channel):
  `box.confirm.mutate({ suggestionId: ask.id }, { onSuccess: () => setAsks((prev) => prev.filter((a) => a.id !== ask.id)) })`
  — same for dismiss; also remove on the typed not-found error (the ask is equally gone
  server-side when the refusal is `SuggestionNotFoundError`). This is precisely the state
  transition `suggestion-mutations.ts:8` already claims to exist. It does NOT fix the host's other
  tab/device.
- **ARM B (all tabs, honest):** a new host-only bus member (e.g.
  `{ type: "suggestionResolved"; chatId; suggestionId }`) emitted at the claim
  (`confirm-suggestion.ts:240-243`) and the drop (`dismiss-suggestion.ts:37-39`). Coupled sites (the
  new-bus-member landing set): the `AutomationBusEvent` union + `AUTOMATION_BUS_EVENT_TYPES`
  producer belt (`contracts/src/automation/index.ts:828+`), the client fold arm (tsc forces it —
  the mapped type at `apply-automation-bus-event.ts:58` fails until armed:
  `(asks, event) => asks.filter((a) => a.id !== event.suggestionId)`), and the transport member
  filter is default-deny so no transport edit (spec §3-S4:291-294). NOTE: spec §3-S4 ruled "one NEW
  host-only `AutomationBusEvent` member" (the raise) — a retirement member is a spec DELTA and
  should get its one-line spec/ledger note rather than land silently. Consider whether the
  handoff-void (`voidChat`) and plugin-void paths should also emit, since they leave the same dead
  cards on every attached tab; `ruleAutoDisabled` already covers the rule-void case.

Refetch is NOT an arm: a pending ask has no query behind it (RULED F1, in-RAM), which the mutations
file states correctly.

---

## FINDING 2 — CONFIRMED and FIXED (P2 lying gate): clause C accepted an action name inside a string literal as coverage

**Site:** `tooling/src/verify/gates/test-presence-client.ts:186-191` (`readIfExists` →
`blankTsCommentsInText`) + `:148-150` (`actionReferencedInMirror`, a regex over that text).

**Defect:** the clause-C mirror corpus was comment-blanked only; string literals survived, and the
by-name matcher `(?:[^\w]|^)NAME<typeargs>?\s*\(` matches a name inside a string — so a vitest
description like `it("calls revealContextPanel( …")` SUPPRESSED the missing-coverage violation. The
permissive direction: a false ✓ forever (GATE-AUTHORING.md §5 — "a store action 'driven' by a
parked call in its mirror" is the named class; strings are the same channel wearing quotes).

**Evidence (this session, red-first):**

- **Planted control vs the UNMODIFIED gate** (scratch harness driving the real `gate.run` over a
  materialized fixture root — `reports/stickler/scratch/cb-correctinvest-gate-control.ts`):
  - Control A — mirror's only occurrence of `gStrOnlyAction` inside a string literal → **NOT
    flagged** (the lie).
  - Control B — real call → not flagged (correct).
  - Control C — no reference at all → **flagged** (proves the harness judged; the zero was real).
- **Mechanism receipt:** `tooling/src/verify/lib/comment-spans.ts` `blankTsCommentsInText` blanks
  comment trivia only (read in full) — strings reach the regex.
- **Live-tree impact sweep** (`reports/stickler/scratch/cb-correctinvest-live-diff.ts`): 35 stores,
  123 actions judged; **0** actions pass ONLY via string prose today — the lie was latent, and the
  fix creates no new reds.

**The fix (landed, commit `4ef58f4888da36a5c60263d9a7a31e54ed74fb4b`):**

- `tooling/src/verify/lib/comment-spans.ts`: new door `blankTsCommentsAndStringsInText` — comments
  PLUS string-prose token kinds blanked (StringLiteral, NoSubstitutionTemplateLiteral,
  TemplateHead/Middle/Tail, JsxText, RegularExpressionLiteral), length/newline-preserving; template
  interpolation EXPRESSIONS are separate AST nodes and survive, so a real call inside `${…}` still
  counts.
- `test-presence-client.ts`: `readIfExists` routes through the new door; the posture comment now
  declares the string direction; two committed pin rows — a `mustFlag` (string-literal-only
  occurrence must RED; the founding lie) and a `mustPass` (interpolated real call still counts; the
  declared limit written down).
- **Post-fix receipts:** Control A flags / B passes / C flags; single-gate `verifyGateProofs` = 0
  failures; full `gate-conformance.int.test.ts` green (2/2); `check-gates.int.test.ts` 7/7;
  `node scripts/ts7.cjs --noEmit -p tooling/tsconfig.json` exit 0; `pnpm check:structure` exit 0
  with `✓ test-presence-client · scanned 5694/5694 files`, zero tree findings. One accepted
  warn-level biome `noTemplateCurlyInString` on the new fixture string (it must contain a literal
  `${…}` — that IS the fixture).

**Same-class candidates NOT touched (scoped out, for triage):** the only other permissive-direction
consumers of `blankTsCommentsInText` are `surface-in-a-container.ts:50,72` and
`surface-a11y-focus.ts:74` — both match JSX/structure shapes where a string-carried match is
implausible but not impossible; worth a one-line look when either gate is next touched.

**Discovered en route (reported mid-run, fixed by the orchestrator on main):**
`gate-conformance.int.test.ts` was RED AT HEAD independent of this lane — `ui-primitive-structure`'s
stale #507 "template-title-not-blanked" limit row survived that fence's own 2026-08-24 improvement.
Receipt: single-gate conformance failed identically with this lane's files restored to HEAD copies
(backup/restore, both restored).

---

## FINDING 3 — CONFIRMED (P2 correctness): image edit swallows post-success resolve failure

**Site:** `packages/client/src/features/imagery/components/image-edit-body.tsx:71-92` — the
`runEdit` chain; the swallow is `.catch(() => undefined)` at line 91.

**Defect:** after `imagery.editImage` SUCCEEDS (the asset is minted server-side), a rejection from
`queryClient.fetchQuery(trpc.assets.resolveBlobRefs…)` (line 83) falls into the outer
`.catch(() => undefined)` and produces nothing — no toast, no hand-off, no error state.

**Why the catch is half-right, which is what hides it:** `useEditImage` carries
`errorToast: "Couldn't edit the image."` (`use-imagery-mutations.ts:37-41`), and the factory wires
it via mutation `meta` → the global MutationCache handler (`create-entity-mutation.ts:127`), so a
`mutateAsync` REJECTION is toasted and the outer catch correctly only silences the duplicate
unhandled-rejection. But the resolve step runs INSIDE the `.then`, is not a mutation error, and has
no other handler. The sibling arm proves the gap is an oversight, not a policy: a resolve that
RESOLVES but returns no row is handled with exactly the right message (lines 84-88 — "Edited image
saved / It's in your gallery"), while a resolve that REJECTS gets silence. The file header's own law
("surfaced, never swallowed") is violated on this path.

**Failure scenario:** host clicks "Generate edit" → server edits, mints the new owned asset, returns
`{ images: [{assetId}], warnings }` → `resolveBlobRefs` fails (transient network drop, server
hiccup — precisely the window after a long generation) → the promise rejects into `() => undefined`.
The user sees the button return to "Generate edit" with the modal unchanged: no lightbox, no toast,
no error. The edit LOOKS failed while it actually succeeded — the natural next action is clicking
Generate again, paying for a SECOND edit of the same instruction. Cost: silent inconsistency +
plausible double image spend.

**Fix shape:** wrap the resolve step in its own try/catch and reuse the existing partial-success
arm's message shape, keeping the distinction the brief names: the edit DID succeed, only the display
failed. E.g. inside the `.then`:

```ts
let refs;
try {
  refs = await queryClient.fetchQuery(trpc.assets.resolveBlobRefs.queryOptions({ assetIds: [first.assetId] }));
} catch {
  toast.add({ title: "Edited image saved", description: "Couldn't open it here — it's in your gallery." });
  return;
}
```

Outer `.catch(() => undefined)` stays (it now covers only the mutation-rejection arm the global
errorToast already surfaces). No message change for the `ref === undefined` arm.

---

## Verified clean (what my silence covers)

- **Finding 1:** read IN FULL: `suggestion-card-mount.tsx`, `apply-automation-bus-event.ts`,
  `suggestion-mutations.ts`, `create-entity-mutation.ts`, `confirm-suggestion.ts`,
  `dismiss-suggestion.ts`, `substrate/suggestions.ts`; the bus union + belt region of
  `contracts/src/automation/index.ts` (lines ~740-835); spec §2 law 5 + §3-S1/S4 regions; the band's
  card renderer region (`chat-controls-band.tsx` via grep receipts at :50/:245). Confirmed the fold
  is the mount's ONLY ask-writer besides the timer/reconnect, and the union carries no retire
  member (grep receipt over the contract file). NOT read in full: `chat-controls-band.tsx` beyond
  the cards/overflow region, `use-chat-controls.tsx`, the transport `stream/sources/automation.ts`
  (its default-deny member filter is asserted by the contract header + spec, not re-derived).
- **Finding 2:** gate + comment-spans read IN FULL; GATE-AUTHORING.md read IN FULL;
  gates-and-tooling.md read; every `blankTsCommentsInText` consumer enumerated (grep, 4 sites).
  Controls and battery receipts as listed above. The live-diff sweep re-implements clause C's
  name-collection loop faithfully (same regex, same TEST_KINDS, same `_ct-stories.tsx` corpus join)
  — divergence risk acknowledged but the BASELINE side of the diff came from the real gate.
- **Finding 3:** read IN FULL: `image-edit-body.tsx`, `use-imagery-mutations.ts`,
  `create-entity-mutation.ts`. Confirmed the meta→MutationCache errorToast path covers only the
  mutation rejection. NOT verified rendered (no browser probe — the defect is a code-path absence;
  a rendered repro would need a fault-injected resolveBlobRefs).
- Whole-tree: `pnpm check:structure` exit 0 post-fix (zero findings, all gates ✓ with denominators).

## Unconfirmed / out-of-scope observations (not findings)

- The dismiss verb header's multi-device "next reconcile" claim (`dismiss-suggestion.ts:6-8`)
  over-promises until Finding 1's ARM B exists — folded into Finding 1, listed here so the comment
  gets corrected with the fix.
- Host-handoff (`voidChat`) and plugin-void server-side sweeps also leave dead cards on attached
  tabs (same 30-min window) — same family as Finding 1, lower frequency; fold into ARM B's scope
  decision.
- `surface-in-a-container` / `surface-a11y-focus` string-blindness — same class as Finding 2,
  implausible carrier, noted above.

## Proposed memory lesson (orchestrator owns the write)

- Index line: `- [busDriven over RAM-only state has no retire channel](busdriven-ram-only-needs-local-retire.md) — no query, no bus member ⇒ mutation success must retire the local fold's row itself`
- Body: A `busDriven: true` mutation whose subject lives ONLY in server RAM + a live-only bus room
  (no query, no replay) has NO reconciliation channel for the client's local fold — the bus covers
  raises but nobody emits the retire. **Why:** automation suggestion cards persisted up to 30 min
  after confirm/dismiss (#700); the mutations file even documented the intended local transition
  that was never wired. **How to apply:** when reviewing a `busDriven` mutation, ask "which bus
  member (or local state write) removes what this verb just consumed?" — if the answer is a comment,
  it's a defect.

---

## Issue summaries (paste-ready)

**#700 (Finding 1 — dead client card):** CONFIRMED P1. Confirm/dismiss deletes the ask server-side
but NOTHING retires the client card: the bus union has no retire member (dismiss emits nothing;
confirm emits only ruleFired/ruleErrored — identity arms in the client fold), the mutations carry no
callbacks, and there is no query to refetch — the card survives until TTL (30 min), reconnect, or a
same-source re-raise, stays CLICKABLE (second click = "no longer available" errorToast on the host's
own successful action), and as `cards.at(-1)` it masks all older pending cards behind a lying "+N
pending". Fix shape: ARM A — per-call `onSuccess` (+ typed-not-found error) local removal in
`suggestion-card-mount.tsx` (the factory already forwards MutateOptions; this is the transition
`suggestion-mutations.ts:8` already claims exists); ARM B — a new host-only `suggestionResolved`
bus member emitted at claim/drop (union + producer belt + tsc-forced fold arm; no transport edit;
one-line spec delta to §3-S4's "one NEW member"). Recommend A+B. Report:
`docs/history/reviews/stickler/2026-08-25-correctness-investigation-three-findings.md`.

**#701 (Finding 2 — lying gate):** CONFIRMED and FIXED, commit
`4ef58f4888da36a5c60263d9a7a31e54ed74fb4b`. test-presence-client clause C read the comment-blanked
mirror text, so an action name inside a string literal (a vitest description) satisfied the by-name
matcher — permissive false ✓. Red-first planted control against the unmodified gate (string-only ref
unflagged; no-ref control flagged, harness valid); live sweep 35 stores/123 actions showed ZERO
current maskings (latent lie, no new reds). Fix: new `blankTsCommentsAndStringsInText` door in
comment-spans.ts (template interpolations survive) + gate wired through it + committed mustFlag/
mustPass pin rows. Post-fix: both controls correct, full conformance 2/2, check-gates 7/7, tooling
ts7 clean, `check:structure` exit 0 (`scanned 5694/5694`). Closeable. Report: same path as #700.

**#702 (Finding 3 — image-edit swallow):** CONFIRMED P2. After `imagery.editImage` succeeds, a
REJECTION from `queryClient.fetchQuery(assets.resolveBlobRefs…)` (`image-edit-body.tsx:83`) falls
into `.catch(() => undefined)` (line 91): no toast, no hand-off — the edit looks failed while the
asset exists, inviting a paid duplicate edit. The outer catch is only correct for the mutation
rejection (globally toasted via meta errorToast); the resolve step has no handler, while the
resolved-but-empty sibling arm (lines 84-88) already carries the right message. Fix shape: try/catch
around the fetchQuery only, toasting the existing partial-success wording ("Edited image saved —
couldn't open it here; it's in your gallery"), keeping the "edit done, display failed" vs "edit
failed" distinction. Report: same path as #700.
