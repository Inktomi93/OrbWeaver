---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — leg 3 (HI-band remainder part 2 + the two rewritten config surfaces)

Lane `cb-ct-audit-3`, #1229. Continues
[leg 1](2026-09-02-ct-corpus-audit-leg1.md) (Phase A over all 469 `.ct.tsx` + 24 full-reads) and
[leg 2](2026-09-02-ct-corpus-audit-leg2.md) (45 full-reads, helper-await population drained). Phase A is
DONE and is not repeated here; this leg is Phase B deep reading only.

Base: worktree `agent-a87ee00daf7b8dc6a` off main @ `8a7500279` (which carries the #1254 `kill(-1)` fix).

**Charge:** the 13-file HI-band remainder part 2 (leg 2 §5), then the two config surfaces leg 2 could not
audit because the collections fold was pending — both were REWRITTEN by that fold (`config-content-surface`
1006 ln, `config-list-surface` 1225 ln on this base) and are therefore fresh subjects;
`config-welcome.ct.tsx` was DELETED by the fold and is not hunted.

**Rubric** (leg 1 §2): (a) HONESTY — every assert can fail and asserts something real; (b) PREMISE
CURRENCY — the mounted surface/selectors/role names still exist in that shape on today's src; (c) COVERAGE
— load-bearing behavior with no pin (top gaps only); (d) HARNESS CORRECTNESS. Defect taxonomy hunted:
stale premise · luck-based coverage · decorative pins · double-casts through `unknown` · oneshot live-read
asserts · literal `reports/` writes · accname substring traps · stand-in children · tabs/panels
accumulating · shared-render-tree reads · **the ONESHOT-OK adjacency window** (the marker must sit on
`expect.line` or `expect.line-1`; a wrapped two-line marker covers nothing) · any test or helper spawning
the external `kill` binary (#1254).

## 1. Running coverage

| Leg | Full-read files | Lines | Findings |
| - | - | - | - |
| Leg 1 | 24 | ~26,100 | F1 (#1240) · F2 (#1241) · F3 (#1242) |
| Leg 2 | 45 | ~19,540 | none |
| Leg 3 (this commit) | 12 | ~8,298 | none confirmed |
| **Campaign total** | **81 / 469** | ~53,938 | ceiling P3 |

## 2. Findings

None confirmed yet this leg.

## 3. Per-file verdicts — chunk 1 (6 files, all CLEAN)

### 3.1 `tests/ui/primitives/textarea/textarea.ct.tsx` (112 ln) — CLEAN

Seal coverage is real behavior, not shape: `onValueChange` delivers Base UI's `eventDetails` (the exact
thing a hand-spelled `(value: string) => void` signature deletes), Field registration proven through
`getByLabel` resolution rather than a class list, `data-invalid` + destructive border read against
`resolvedTokenColor` (never a literal), and the maxRows ceiling asserted as line-box arithmetic against the
RESOLVED `lineHeight` with the not-a-clip control (`scrollHeight > clientHeight`) beside it. All six
ONESHOT-OK markers sit on `expect.line-1` — adjacency window satisfied.

Nit (not a finding): in "rows sets a min-height floor", `const box = await control.boundingBox()` is
captured BEFORE the `expect.poll` that settles `minHeight`, then compared to the post-poll value at the
end. If the floor were still resolving, the stale box makes the assert RED, not falsely green — the safe
direction — but reading the box after the poll would be strictly better.

### 3.2 `tests/client/features/credentials/components/credential-key-row.ct.tsx` (97 ln) — CLEAN

Confirm-gating proven in both directions on every destructive verb (remove, mark-revoked), the fired arm
pinned by `lastInput().credentialId` against the story's minted id rather than by a bare count, and the
custom-provider arm pins the HONEST probe (`credentials.testHealth` fired, `credentials.fetchModels` NOT —
the retired reachability shortcut). The retry arm asserts the recorder count AND the responder's own
`attempts` counter, i.e. the round trip really happened twice. Premises verified live:
`credential-key-row.tsx:129` mints ``aria-label={`Remove the ${label} key`}`` (so the CT's odd-reading
"Remove the prod key key" is the true composed name), `:110`/`:120` mint the two testids, `:96` swaps
Test→Retry, `:166` prints "Test failed — try again".

Weaker-than-house note (observation, not a finding): the two cancel-fires-nothing zeros
(`:26` polled zero, `:44` bare `expect(trpc.count(…)).toBe(0)`) barrier on `await expect(dialog)
.toBeHidden()`. That IS a retrying rendered barrier and the alertdialog's exit transition is a real
window, so this is not the leg-1 F2 shape (F2 had no rendered consequence at all) — but the strictly
stronger form is the file's own downstream pattern: follow the cancel with the REAL confirm and assert the
count is exactly 1 (an ordering proof), which the file already does two lines later. No change demanded.

### 3.3 `tests/client/features/plugin/lib/tool-card.ct.tsx` (198 ln) — CLEAN — exemplary

The byte-identity fallback proof is the strongest shape available for "the contribution changed nothing":
each arm carries a SECOND record (the registered `draw`) whose rendered card is the settle barrier proving
`plugin.listSurfaces` resolved, both operands are captured strings taken after their own barrier with the
mounts already unmounted, and the equality is followed by a non-vacuity control
(`expect(baseline).toContain(REVEAL)`) that kills the empty-string-both-sides pass. The impersonation wall
is asserted as the group's accessible name (`"Oracle Deck — Draw"`), and the name-not-resolved arm proves a
card is never drawn unattributed. `$state` bindings are asserted against THIS call's result document, and
the meter is checked as a real `role="meter"` with `aria-valuenow`, not as text containing a number.

### 3.4 `tests/ui/primitives/input/input.ct.tsx` (255 ln) — CLEAN — instrument-grade

Two framebuffer pins (#522 unset date tone, #541b picker glyph) with the reason for NOT using computed
style measured and recorded in-file (chromium returns the HOST colour for `::-webkit-datetime-edit`), a
reading-region constant derived from a first-attempt failure that was structurally incapable of failing
(the indicator painted 255 in both arms), PLATE as the modal luminance with the p50-lands-on-a-glyph lesson
cited, and positive controls on BOTH arms so a decode that found no ink reds instead of passing. The
`transitionDuration === "0s"` fence explicitly rejects the `transitionProperty` form because `all` makes
that check un-failable — the corpus's cleanest statement of the un-failable-oracle class. The `layout=inline`
arm is relational (shorter/tighter/one type step down) plus a live `--spacing-field` probe. `page.screenshot`
is in-memory (`clip`, no `path`) — not the #1201 class.

### 3.5 `tests/client/features/notifications/components/notification-bell.ct.tsx` (406 ln) — CLEAN

Drives the production path over the real socket harness. Highlights: the LIVE-arrival test builds a
deterministic race gate (hold the EventSource response until the first `notifications.list` has rendered)
with the TanStack "in-flight query marked stale instead of refetched" mechanism documented — a race that
would otherwise only bite under contention; the per-row pending test proves the double-click is singular
while the SIBLING stays actionable (the per-row state claim, not a global one); the Decline test is keyed
off the dismiss FLAG rather than a call counter with the observed row-detached-mid-click flake recorded;
the `roomFailed` frame is proven to reach `onError` (a toast) and NOT `onEvent`; `STREAM_MUTATION_ROUTES`
is imported from the bus's own fixture module so the two directions cannot drift. The one double-cast
carries a `FABRICATION-OK` with a true reason (the stubbed wire object IS what the browser parses).

Observation (not a finding): the socket-count pin ends
`await expect.poll(() => socket.attachedChannels()).toEqual(["notifications"]); expect(socket.connects())
.toBe(1);` — both reads are NODE-side recorder reads, so the barrier is not browser-side. A duplicate
subscription would open its connection at mount, i.e. before/alongside the attach, so the pin still catches
the regression it was written for; a strictly stronger form would poll that `connects()` STAYS 1 across a
window. Also the only one-shot in the file with no ONESHOT-OK marker (the gate does not see it: the
argument is not an `await`ed live read).

### 3.6 `tests/client/features/refinery/surfaces/refinery-list-surface.ct.tsx` (326 ln) — CLEAN

The identity-rides-the-summary pin is a real defect proof: the card is placed OUTSIDE any page the client
could fetch and the row must still name itself, with `trpc.count("character.list") === 0` closing the
"there is no join left to break" claim — and its ONESHOT reason is the strongest form in this chunk (the
roster is a SUSPENSE surface, so a query it still owed would have suspended the row that is the barrier).
The #307 duplicate-door pin discriminates on the picker search box's COUNT (1 vs 2) and adds the
not-a-no-op half (`toBeFocused`), so the fix cannot be satisfied by deadening the CTA. #308 is an explicit
NETWORK re-derivation of a claim the motion audit made from a RENDER census — the audit's prescription is
refuted in-file rather than obeyed. The no-verdict arm keys on `RefineryChip`'s own testid with the reason
the old bare `[data-tone]` selector became unable to state anything (#1097) recorded, and it asserts BOTH
channels (`data-hint-tone` feature value, `data-tone` recipe value) on the same element. Premises verified
live: `refinery-chip.tsx:43` stamps `data-hint-tone`, `lib/list-pane-title-id.ts:25` is
`"orb-list-pane-title"`, `list-pane-header.tsx:92` stamps `data-slot="list-pane-title"`.

## 3b. Per-file verdicts — chunk 2 (3 files, all CLEAN)

### 3b.1 `tests/ui/primitives/virtual-list/virtual-list.ct.tsx` (431 ln) — CLEAN

Windowing is asserted as a BOUND with both ends (rows rendered > 0 AND < 100; a deep item absent from the
DOM), the overscan branches are distinguished by two disjoint bounds rather than a cross-test comparison
(playwright-ct mounts one root per test — stated in-file), and every geometry claim goes through
`expect(fn).toPass()` retrying helpers whose predicates include the non-vacuity floor
(`geometry.length > 1`, `visible.length > 1`) plus a real overlap/ownership test via `elementFromPoint`.
The reset-scope pair is the strongest work in the file: `requestAnimationFrame` is replaced by a harness
whose `drain()` returns the RESIDUE so a half-drained state fails loudly instead of proceeding, the
landing frame is named by capturing `pendingIds()` at the moment it is scheduled (the comment states
exactly why "the newest pending frame" would be false), and the unmount arm proves the stale landing wrote
nothing to the detached node AND that no page error fired. Premises verified live:
`virtual-list.tsx:159-160` still calls `assertBoundedScrollHeight`, whose message in
`packages/ui/src/lib/virtual-gap.ts:48-55` still contains "no bounded height"; `data-more` is toggled at
`virtual-list.tsx:185,225`; `data-slot="virtual-list-viewport"` at `:231`.

Coverage note: `onEndApproach`'s positive arm asserts `not.toHaveText("0")` rather than an exact count —
deliberate and stated in-file (a re-fire as rows settle from estimated to measured size is legal), and the
negative arm is exact.

### 3b.2 `tests/client/features/chat/components/composer-guided-cluster.ct.tsx` (513 ln) — CLEAN

`expectNoReconnect` is a model absence proof: a POSITIVE `page.waitForRequest` that must TIME OUT (the
stub pins the EventSource retry to 200ms, so a live subscription would have re-opened several times inside
the window) PLUS the stub's own connect counter still reading 1 — two methods, the way the standing law
demands. The dead-engine zombie class is pinned on the mechanism that actually caused it (a RETRYABLE tRPC
code is not an error to `httpSubscriptionLink`), the Stop arm proves the unsubscribe over a window LONGER
than the pinned retry and asserts the deliberate divergence from ST (a cancel KEEPS the partial and toasts
nothing), and the wait-reason pins were RE-POINTED at the surviving carrier (the Base UI tooltip popup)
when `title` was dropped, with the reason for the move and the `focusableWhenDisabled` +
`data-disabled:pointer-events-auto` mechanism that keeps a disabled control's tooltip reachable recorded
in-file — the #1207 stale-premise class handled correctly rather than by deleting the claim. Wire claims
are asserted on the DECODED input (`gameSteer` KIND, `rewriteToggles` in CATALOG order proven by flipping a
later member FIRST) with the never-send-template-bytes fence
(`.not.toContain("cut filler")`). `hoverOpenSubmenu`'s bounded retry is justified by a board-diagnosed
hover-intent miss (menu open + submenu collapsed screenshots), not by a slow-machine timeout, and
`expectPopupSettled` pins the popup's `opacity: 1` as the transition's own end signal.

Two idiom notes (neither a defect): (a) the recurring
`const readInputAtAssertion = async () => trpc.lastInput(...) as T; const input = trpc.lastInput(...) as T;`
pair declares `input` only so `typeof input` resolves — the eager read's value is discarded, which reads
like a live one-shot but is inert; (b) the progressive-fill assertions (`toHaveValue(PARTIAL)` then the
full string) can only fail RED if two deltas ever land in one frame — the safe direction, and the
EventSource-task mechanism is argued in-file.

### 3b.3 `tests/tooling/design-audit-walker.ct.tsx` (1,027 ln) — CLEAN — the corpus's best instrument suite

Every one of the ~20 walker rules is pinned in BOTH directions in the SAME mount: the defect fires and the
healthy twin stays silent WHILE PRESENT in the census (the "silence is only evidence when the control was
looked at" law is spelled out and enforced — e.g. the below-fold healthy control must be IN `tapTargets`
before its non-finding means anything). Withheld verdicts are asserted as COUNTED
(`censusReach.frameTruncated`, `withheld.pseudoBoxUnmeasurable`) rather than as silence, and #987's
settlement identity (`candidates === judged + withheld + excluded`) is re-asserted over the widened census
— an instrument that cannot print a clean zero by accident. `smallestSide` throws with the whole census in
the message so a zero reads "the walker never SAW the control", never "the number is fine". Exemption
scoping is pinned as a two-halved predicate with BOTH negative halves (slot-only would licence every list
row; state-only would licence any selected box). The two-unit reading-measure test (#1183) asserts the
ratio band 1.2–2.0 with the measured provenance, so a rule reading one unit for the other cannot pass. No
`reports/` write, no double-cast, no stale premise found.

## 3c. Per-file verdicts — chunk 3, the three big chat/character surfaces (3 files, all CLEAN)

### 3c.1 `tests/client/features/chat/components/composer.ct.tsx` (1,426 ln) — CLEAN

The #531 phone-composer pins are the strongest RANGE-property work in the campaign: the expected row count
is DERIVED from the measured home widths (`needed <= barWidth ? 1 : 2`) rather than restated as a pixel
budget, and the file records WHY the obvious derivation is wrong — packing against the bar's own resolved
`column-gap` (24px `section`) rated the two-row render correct and "went green on the defect (measured: it
did)", so the packing gap is the homes' own `field` gap. Three widths x the live-drafting Stop arm, each
re-measuring the whole geometry contract (44px floor, painted-centre ownership via `elementFromPoint`,
containment in composer AND viewport, pairwise non-overlap, row-major order, one truthful nearest
`role="group"` owner per control, no horizontal scroll on the composer or the document). #206's mechanism is
preserved verbatim while its ROW-COUNT clause is retired — the "the ruling survives, its INPUT changed"
idiom, stated in-file. The reason-carrier move (native `title` to the Base UI tooltip popup) is the #1207
stale-premise class handled correctly: same four controls, same four strings, re-pointed at the surviving
carrier with the `focusableWhenDisabled` mechanism recorded. Clear-on-commit is proven in all four windows
(held send + driven commit signal; failure keeps the draft; POST-commit failure does NOT resurrect it;
in-flight send idles the wand). Drag/paste gestures assert the honest refusal BY NAME and the
mixed-batch-is-not-all-or-nothing arm, and the both-text-and-image paste proves `!defaultPrevented` — the
only observable of a synthetic paste's default action.

Verified premise for the one assertion that could have been un-failable: #366's
`expect(focused.carrierShadow).not.toBe("none")` discriminates only if the carrier has no resting shadow —
`composer-drop-target.tsx:41` puts `shadow-glow`/`ring-2` behind `focus-within:` exclusively, so at rest the
computed `box-shadow` is `none` and the pin is failable.

### 3c.2 `tests/client/features/character/surfaces/character-library-surface.ct.tsx` (1,951 ln) — CLEAN — the campaign's best surface suite

Its founding premise is the one that matters: the stub is INPUT-AWARE (`characterListResponder` decodes
cursor/search/chips) precisely because "a fixed-array responder would let every search/filter assertion pass
while the client filtered a <=150-row window, which is precisely the defect that shipped". Every server-lens
pin is therefore a real defect proof — a match placed BEYOND the loaded page is found; the chip narrows the
REQUEST (asserted on the decoded wire, with `lastCollectionInput` telling the paged read apart from the
favorites `starred` page and the band's `limit: 1` census). The eviction pin's detector is chosen against
its own blind spot ("is row 1 in the DOM" cannot tell eviction from virtualization, so the oracle is the
foot-of-list `N of M loaded` readout). The two chrome fences (264px resting / 300px open) carry their
MEASURED provenance AND record an owner-ruled REFUSAL (ARM B, the reserved glyph cell, 262.5 to 293.4) so a
future "fix" reds instead of silently spending the budget — a fence documenting a refusal is the rarest and
most useful shape in the corpus. The #502 gated-read pin is the model for a zero: the settled-by-
construction argument names the last two things the pane paints, and the POSITIVE CONTROL (open the
disclosure, the read fires) is in the same mount. Persisted-state pins seed localStorage via
`addInitScript` + `reload()` (the correct recipe — an effect-landed seed cannot pin first-commit behavior)
and the W5 arm distinguishes the FIRST request (may legally carry the dead id) from the settled one.
`resolvedPx`/`resolvedColor` probes resolve tokens from the same document, never literals — including
`--spacing-touch-target`, which is pointer-conditional by construction so a literal would pin one pointer
class.

### 3c.3 `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx` (1,555 ln) — CLEAN

Two structural strengths worth naming. (a) `ChatListBandAndSurfaceStory` exists BECAUSE the band feeds a
different shell slot: "a header-only story and a surface-only story each pass while the pair lies" — the
mount is chosen to make the defect observable, which is the coupled-surface lesson most CTs miss. (b) the
#1180 warm-up pin asserts the WHOLE input array and says why: one equality carries "the hovered room
warmed", "no other room warmed" and "mount warmed nothing", and it explicitly rejects the separate
non-retrying zero-read (named as the DEF-14 class). The eviction proof is the scroll-BACK, again chosen
against the virtualization blind spot. `evictionPoll()`/`scrollPoll()` are FUNCTIONS with the reason
recorded (Playwright's `pollAgainstDeadline` shifts the interval array it is handed, so a shared const is
drained by its first use and later polls silently fall back to 1000ms) — a harness trap most files would
have hit. Empty-state honesty is pinned per AXIS (#541a: search+month offers both exits and each one really
widens the scope, verified by the copy that follows), and the search-empty vs library-empty confusion is
fenced with its live-drive provenance. The `aria-pressed` vs `aria-current` distinction between the chats
strip (toggles a filter) and the character favorites strip (opens an editor) is asserted with the reason,
and the P1 trailing-zone split measures the text column against `PANE_WIDTH - LEADING_BUDGET_PX` rather
than a bare number so it tracks the portrait step.
