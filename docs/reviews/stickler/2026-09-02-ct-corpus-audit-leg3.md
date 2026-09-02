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
| Leg 3 (this commit) | 6 | ~1,395 | none confirmed |
| **Campaign total** | **75 / 469** | ~47,035 | ceiling P3 |

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
