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
| Leg 3 | 15 | ~12,258 | none confirmed |
| **Campaign total** | **84 / 469** | ~57,898 | ceiling P3 |

Leg 3 read, in order: `textarea`, `credential-key-row`, `tool-card`, `input`, `notification-bell`,
`refinery-list-surface` (chunk 1) · `virtual-list`, `composer-guided-cluster`, `design-audit-walker`
(chunk 2) · `composer`, `character-library-surface`, `chat-list-surface` (chunk 3) · `home-surface`,
`config-content-surface`, `config-list-surface` (chunk 4). **The HI band (61 files) is now DRAINED.**

## 2. Findings

**None.** Fifteen files, ~12,258 lines, every file read whole — zero confirmed defects, and the
severity ceiling for the whole campaign stays at leg 1's P3. Taxonomy sweep receipts over exactly these
15 files (`grep` over the file list, printed counts):

- literal `reports/` writes / `screenshot({ path` — **0** (the three `reports/` hits in
  `character-library-surface.ct.tsx:998,1171,1480` are PROSE citations of review artefacts in comments,
  not writes). `input.ct.tsx` calls `page.screenshot({ clip })` with no `path` — an in-memory decode,
  not the #1201 class.
- `kill` spawns (#1254) — **0** (the single hit,
  `home-surface.ct.tsx:637`, is the English word in a comment).
- `as unknown as` double-casts — **4 total, 4 marked**: `notification-bell.ct.tsx:50` (raw wire fixture)
  and `config-content-surface.ct.tsx:555,577,592` (in-page `globalThis` scaffolding). Every marker sits
  on the cast's line or the line above it, and every reason is true.
- `test.skip` / `.fixme` / `.todo` / `.only` — **0**. `biome-ignore` / `eslint-disable` — **0**.
- ONESHOT-OK adjacency — every marker encountered sits on `expect.line-1`; no wrapped two-line marker
  found in this shard.

Three sub-finding OBSERVATIONS are recorded inline at §3.2, §3.5 and §3d.2 (two weaker-than-house
zero-read barriers and one stale constant NAME), plus two style nits at §3.1 and §3b.2. None is a
defect; none needs a row unless the orchestrator wants the polish.

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
\#1180 warm-up pin asserts the WHOLE input array and says why: one equality carries "the hovered room
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

## 3d. Per-file verdicts — chunk 4, home + the two rewritten config surfaces (3 files, all CLEAN)

### 3d.1 `tests/client/features/home/surfaces/home-surface.ct.tsx` (1,730 ln) — CLEAN — the campaign's most instrument-grade file

Four things in it are the best examples of their kind in the corpus so far.

1. **The polarity is PROVEN, never assumed** (#1128). The light arm resolves `--color-background` and
   `--color-foreground` through a canvas (oklch-authored, so a regex probe returns nothing) and asserts
   which of the pair is lighter BEFORE any pixel is judged — with the reason stated: "a light arm whose
   scope failed to invert is a SECOND DARK ARM wearing a label", i.e. it would retire the demanding half
   of the matrix and still read as coverage. That is the exact luck-based-coverage class, pre-empted.
2. **The instrument is chosen against every instrument that would lie.** The fold-fade contrast pin uses
   `pixelExtremaContrast` because a mask is paint: snap `--contrast`, the whole design-audit contrast
   family, axe, and even `pixelContrast` (which composites ancestor OPACITY, a property a mask never
   touches) all report the control PASSING. Its own positive control — `Start a temp chat`, one block
   above the band, which must read full ink in every cell — is what proves the sampler is reading ink
   rather than a uniformly dimmed page.
3. **A biconditional, not a floor** (#1121). The hero art band MUST paint where the host clears
   `--reading-measure-min` and MUST be zero where it does not, both directions asserted in one loop, with
   the 1280 arm recorded as a MEASURED REFUSAL (capping the hero's prose at ~54ch to reserve a strip puts
   the one paragraph the surface exists to show under the minimum measure).
4. **The must-not-fire poll is the inverted form** (#188): `expect.poll(...).toBe(2).then(() => true,
   () => false)` watched over a window the POSITIVE arm calibrates, with the reason for not writing
   `expect.poll(...).toBe(1)` spelled out (it would match on its first sample, before the old code's
   invalidation had even been raised).

Also: the #835 read-less-tile pin is honestly labelled a FENCE that passes against the unmodified tree,
with the live mover left unattributed and the three ruled-out hypotheses listed (remembered box, web
fonts, growing registry); the #177 and #499 tests `console.info` their measurement tables ON PASS as the
re-measure protocol's own instrument; the #1145 prose pin asserts the LAW's unit (average glyph advance)
rather than the token's `ch`, re-derives the ratio at three widths and three appearance arms, and its
`CH_QUANTIZATION_SLACK` carries the measurement behind the number; and H16 is a printed REFUSAL rather
than a fix, with only the width-invariant property (the wrap may re-flow, it may not drop a destination)
actually asserted.

### 3d.2 `tests/client/features/config/surfaces/config-content-surface.ct.tsx` (1,006 ln, post-fold) — CLEAN

Fresh subject (the collections fold rewrote it; `config-welcome.ct.tsx` is gone). **This file now carries
the campaign's own taxonomy exhibit**: the #1203 P0 hook-count crash class — the one leg 1 named as
"luck-based coverage" because Tags→Regex survived on EQUAL optional-hook counts — is pinned at :857 as a
class sweep, not a happy path: preview-declaring → rosters and back, then the SAME pair through the other
declaring library, both directions, with `page.on("pageerror")` collected from the first navigation and
asserted empty. The reason is stated: "a white-screened shell can still satisfy a naive 'the old text is
gone' assertion", and the LIST landmark surviving is asserted too because the crash escaped every route
boundary. That is the correct repair of the exact defect shape this campaign was chartered to hunt.

The rest holds the same bar: the no-row-clips SWEEP walks every settings-shaped group (9 of 13 bands,
collection groups skipped with the reason) and counts `swept` so a silently-skipping loop cannot pass; the
click-jump pin uses a MutationObserver to record EVERY row that ever gains `aria-current` and asserts the
list is exactly `["Effects"]` (an intermediate flicker reds); the scroll-spy pin re-issues its synthetic
scroll per poll tick and explains why an IDENTICAL `scrollTop` fires no event; the `when`-gated Host
Claude and Distribute sections are asserted from BOTH sides on the same screen (one predicate, three
consumers); and the deep-link-to-gated-group race (the viewer probe resolving after the target) is a real
defect proof.

Naming nit (observation, not a finding): the `EMPTY_BAND` constant is `[data-config-group="regex"]` and
is now reused by the POPULATED-collection tests at `:789`/`:896`, where regex is stubbed with rows — the
name says "empty" where the fixture is not. Cosmetic only; the selector is correct in every use.

### 3d.3 `tests/client/features/config/surfaces/config-list-surface.ct.tsx` (1,225 ln, post-fold) — CLEAN

Also a fresh subject. Its founding choice is the right one and is stated as an owner ruling: the tags
fixture is FOUR HUNDRED rows "because that is the owner's real library and every decision here —
collapsed by default, the count-driven filter, the windowed rows — exists for that size. A five-row toy
would pass while the shipped surface stalled."

Strongest shapes: the retired launcher landing (#1210) took SIX tests with it and the file says so and
what replaced them, rather than leaving orphan pins; the parity anchor at `:1059` is LABELLED
GREEN-BEFORE with its job stated (make the canonical order a claim about the RENDERED pane rather than a
literal two tests agree on); the WCAG 2.5.3 band-name pin asserts the MECHANISM (announced string ==
visible string once whitespace is discounted) instead of three frozen strings, with the receipt for why
the first fix's comma was wrong (axe `label-content-name-mismatch` 1 node → 4); the two-homes census
buckets every button/switch by `role|name` across the three panes in ONE `page.evaluate` and is explicit
that it re-spells the duplicate-action-door lens because that lens is blind at the default collapsed
state; the band-height sweep resolves `--spacing-control-sm` live (pointer-conditional, so a literal 32
would ratify one pointer class), proves the pointer arm is active first, drops zero-boxed bands so the
LENGTH is a real measured count, and asserts `new Set(heights)` is a singleton; and the width claims are
stated at BOTH ends of the docked range (271px both-panels-open and 307px default) with the one demotion
(the busiest scent at 271px) recorded as measured rather than quietly dropped.

Premise note: `CONFIG_MODIFIED_MARK` is deliberately RE-SPELLED rather than imported, with the reason
in-file ("a test may not import a source constant and then assert it against itself") — the correct call,
and the literal matches `config-copy.ts`'s marker on today's tree.

## 4. Verified clean — what this leg's silence covers

- Full read of all 15 files, whole files, top to bottom, no sampling.
- The taxonomy sweep receipts in §2 (counts printed over exactly this file list).
- Premise spot-checks against today's `packages/**/src` for every claim whose truth depended on it:
  `credential-key-row.tsx:96,110,120,129,166` (names + testids + copy) · `refinery-chip.tsx:43`
  (`data-hint-tone`) · `lib/list-pane-title-id.ts:25` + `list-pane-header.tsx:92` (the landmark id and
  its slot) · `virtual-list.tsx:159-160,185,225,231` + `lib/virtual-gap.ts:36-56` (the tripwire message,
  `data-more`, the viewport slot) · `composer-drop-target.tsx:41` (the focus-within-only shadow that
  makes composer's #366 ring pin failable).
- **No test was RUN this leg** — 0 of the 6-run budget, matching legs 1 and 2. Every verdict is
  read-derived or source-corroborated; nothing here depended on execution, and a CT run in a lane is
  single-flight per checkout (a second `ct:scoped` into one worktree clobbers the first).

**Not covered:** the 385 un-read files' internals; anything about these 15 files that only a RUN could
show (flake rates, timing under contention); `tests/e2e/**`.

## 5. Shard map for leg 4 (updated)

**HI band: DRAINED** (61/61 read across legs 1-3). Remaining population:

- **MID band — 74 files.** Leg 1's Appendix A lists them with scores; roughly 20 were already read
  opportunistically in legs 1-2 because they overlapped the helper-await population (`web-weave-touch`,
  `code-editor`, `lane-run-control`, `accessible-name-quality.suite`, `context-tabs-panel`,
  `assembly-preview-panel`, `corpus-content`, `databank-detail-surface`, `workloads-group`,
  `injections-manager`, `analytics-overview-surface`, `image-detail-body`, `message-media-block`,
  `room-overrides-form`, `form-identity.suite`, `preset-structure-tabs`, `character-create-actions`,
  `section-drill-in`, `grid`/`touch-floor`). **Leg 4 should take the MID remainder by AREA, ~15-20 files
  per chunk**, in this order (largest coupled clusters first, because the cold read of an area is the
  expensive part): (a) chat components — `settings-context-tab` (1229), `message-list-surface` (1304),
  `chat-controls-band`, `members-panel`, `message-content`, `ghost-message-row`, `home-recents-tile-body`,
  `prose-settings-section`, `appearance-message-style-section`, `composer-guided-buttons`,
  `chats-section`; (b) discovery + databank — `corpus-home-surface` (1127), `corpus-search-results`,
  `corpus-list-surface`, `databank-library-surface`; (c) ui primitives — `switch` (560), `select`,
  `macro-textarea`, `toggle`, `text`, `icon`, `command`, `popover`, `drawer`, `table`, `avatar-stack`,
  `selection-bar`, `stream-text`, `art-bleed`, `weave-veil`, `stack`, `layer`; (d) the rest —
  `tracker-blocks` (879), `workloads-jobs-section` (770), `actions-view`, `face-strip`, `roster-picker`,
  `persona-*`, `character-*`, `regex-tab`, `schema-editor-dialog`, `turn-tool-calls-disclosure`,
  `motion-flaggers`/`motion-stats`/`long-task-tracer`, `plugin-scripted-surface`,
  `connections-roles-section`, `use-invalidation`, `create-entity-mutation`, `use-orb-socket`,
  `use-user-bus`.
- **LO band — 334 files.** Batch by DIRECTORY at low depth, 60-80 per leg (leg 1's recommendation stands
  and this leg's evidence supports it: the register holds at every score band read so far). Suggested
  batching: `tests/ui/primitives/**` first (the largest cluster, and the most formulaic — seal CTs),
  then `tests/client/features/chat/components/**`, then the remaining feature dirs alphabetically.

At the observed rate (leg 1: 24 files, leg 2: 45, leg 3: 15 large ones) a full drain of MID needs ~2 legs
and LO ~5, i.e. **the campaign is roughly 7 legs from complete**. Lines, not files, are the real cost:
this leg's 15 files were 12.3k lines against leg 2's 45 files at 19.5k.

## 6. Proposed memory lessons (orchestrator owns the write — do NOT write these from a lane)

1. `- [prove the polarity](contrast-matrix-must-prove-its-polarity-arm.md) — a light-arm contrast matrix
   that does not ASSERT the scope inverted is a second dark arm wearing a label: it silently retires the
   demanding half and still reads as coverage` · body: `home-surface.ct.tsx` resolves
   `--color-background`/`--color-foreground` through a canvas (oklch defeats a regex probe) and asserts
   which is lighter BEFORE judging a pixel. **Why:** the light arm is the demanding one — a 16.9:1
   near-black-on-near-white pair needs alpha >= 0.60 to hold 4.5:1 against 0.48 for the dark arm.
   **How to apply:** any two-polarity rendered matrix owes a polarity assertion in the same test.
2. `- [instrument-blind by construction](mask-paint-is-invisible-to-every-computed-style-probe.md) — a
   CSS mask dims live controls while snap --contrast, design-audit, axe AND pixelContrast all report
   PASS; only a framebuffer extrema read sees it` · body: #1128. `pixelContrast` composites ancestor
   OPACITY, which a mask never touches, so it is blind here too — the honest question of a gradient is an
   upper bound over the control's own box. **How to apply:** when a fade/mask/gradient overlaps a
   control, reach for `pixelExtremaContrast`, and give the decode a positive control OUTSIDE the band.
3. `- [class sweep, not happy path](hook-count-crash-needs-both-directions-per-pair.md) — the #1203
   optional-hook P0 hid behind a pair with EQUAL hook counts; the repair pin sweeps every declaring/
   non-declaring pair in BOTH directions and asserts page errors empty` · body:
   `config-content-surface.ct.tsx:857`. A white-screened shell satisfies a naive "the old text is gone"
   assertion, so the claim must be `pageerror` + the surviving LIST landmark, not the pane alone.
   **How to apply:** any registry whose members declare OPTIONAL hooks needs an N-pair sweep, not one
   route.
4. `- [green-before pins get labelled](anchor-pins-must-say-they-are-anchors.md) — a pin that passes
   against the unmodified tree is an ANCHOR or a FENCE, and saying so in-file is what stops the next
   reader reading it as a defect proof` · body: three independent files in this shard do it well
   (`config-list-surface.ct.tsx:1055` parity anchor, `home-surface.ct.tsx:703` read-less-tile fence with
   its ruled-out hypotheses, `config-content-surface.ct.tsx:468` the #549 fence). **How to apply:** state
   which of the three a new pin is — defect proof, fence, or anchor — and for a fence, what it is
   guarding against.

## 7. Issue summary (for #1229 — paste verbatim)

> **CT corpus audit leg 3 (cb-ct-audit-3, stickler): the HI band is DRAINED.** 15 files / ~12,258 lines
> read whole — the HI-band remainder part 2 (textarea, credential-key-row, tool-card, input,
> notification-bell, refinery-list-surface, virtual-list, composer-guided-cluster, design-audit-walker,
> composer, character-library-surface, chat-list-surface, home-surface) plus the two config surfaces the
> collections fold REWROTE (config-content-surface 1006 ln, config-list-surface 1225 ln — fresh subjects;
> config-welcome.ct.tsx was deleted by that fold). **Verdict: fifteen CLEAN, zero findings**, campaign
> ceiling unchanged at leg 1's P3. Sweep receipts over exactly these files: 0 literal `reports/` writes
> (3 hits are prose citations), 0 `kill` spawns (#1254), 4 `as unknown as` casts all FABRICATION-OK-marked
> and honest, 0 skip/fixme/only, 0 suppressions, every ONESHOT-OK marker inside the adjacency window.
> Premises spot-checked against today's src for every claim that depended on one (5 files, path:line in
> §4). Notable: `config-content-surface.ct.tsx:857` now carries the repair pin for the #1203 luck-based-
> coverage P0 — a both-directions class sweep with `pageerror` collection, exactly the shape leg 1's
> taxonomy asked for; `home-surface.ct.tsx` proves its light-polarity arm inverted before judging a pixel
> and reads the framebuffer because a mask is invisible to every computed-style contrast instrument we
> own. Three sub-finding observations recorded (two weaker-than-house zero-read barriers, one stale
> constant name) — none is a defect. Campaign total **84/469 files full-read**; leg-4 shard map (MID 74
> by area, LO 334 by directory at 60-80/leg, ~7 legs to complete) in §5. Report:
> `docs/reviews/stickler/2026-09-02-ct-corpus-audit-leg3.md`.
