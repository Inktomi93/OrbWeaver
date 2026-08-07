# Dogfood Bug Tracking — live

> **⛔ DEV HALTED** — further feature work is blocked until this doc is cleared.
> Issues sourced from: owner dogfood 2026-08-03 · NB multi-user report · JF multi-user report ·
> RPG card-engine investigation 2026-08-04.
>
> **CAMPAIGN LIVE (2026-08-07, owner-ordered):** this doc is the active priority — every open row
> fixed or adjudicated, every ✅ row's owed test written, verifier + side-eye passes before the halt
> lifts. Rulings banked 2026-08-07: **EMPTYGEN-REASONING = arm 1, RECOVER-don't-discard**
> (question-tool). Overnight-ladder defaults (logged, reversible): **weather vocab gains `indoors`**
> (the exact token the model sent; `dusk` stays excluded per the standing taste ruling) ·
> **existing `persona_id = NULL` rows are ACCEPTED** — RATIFIED by the owner 2026-08-08 (question-tool);
> no retroactive repair, the Traveler floor + fail-closed guard are the permanent posture. ALSO RULED
> 2026-08-08: **card images — teach truth-repair arm** (cards are self-contained markup+CSS; the teach
> no longer invites data: URIs the CSP eats — landed in reminder.ts, 43/43; the trust-gated image
> doorway via a self-CSP card-frame route is boarded owner-timed).

**Severity:** (M) correctness/behavior · (S) cosmetic/recoverable · (L) tooling/design gap
**Status:** 🔴 open · 🟡 partial · ✅ fixed
**Effort:** XS ≤30 min · S ≤2h · M half-day · L multi-day
**Reporters:** owner · NB (guest) · JF (guest) · investigation (code trace)
**Scout coverage:** ✓ = confirmed with scannedFileCount receipt · ⚠ = unverified lead

---

## ═══ CRITICAL — Multi-User / Persona ═══

### INVITE-JOIN-NULL-PERSONA — invite-link joiners seat with NULL persona (M ✅ FIXED, both halves)

**BOTH halves fixed, and the "unverified serious half" was REAL.**

**The seat (`chat/verbs/invites.ts`).** `redeemInvite` and `acceptInviteById` now run the SAME seed chain
`startChat` runs for the founding host row — `resolveCurrentPersona ?? resolveDefaultPersona` — threaded through
`redeemInviteAtomic`/`acceptInviteByIdAtomic` → `upsertMemberOnJoin`. A joiner who owns no persona at all still
seats `null`; that is the honest floor, never the room's anchor.

**The prompt (NULL-BINDS-ANCHOR) — CONFIRMED, and the mechanism was an ENCODING collision.**
`entry/compose/chat.ts` `activePersonaIdFor` ended `return args.triggerPersonaId ?? args.anchorPersonaId`, and
`turn.ts` passed `membership.activePersonaId` at all six LIVE-HUMAN sites. So "a live human whose seat holds no
persona" was indistinguishable from the drain/auto contract's "deliberately no triggering human ⇒ bind to the
ANCHOR" — and every invite-joined member's `{{user}}` (and SHAPE's `speakers.user`) resolved to the HOST's
persona. The model was told the host said everything the member said.

Fixed by giving the missing state a REAL ARM instead of a sentinel: `TurnTrigger` (`chat/contract/foreign.ts`)
is now a discriminated union — `{kind:"human", userId, personaId|null}` · `{kind:"none"}` · absent — dispatched
exhaustively (a fourth kind fails tsc). The `human` arm NEVER reaches the anchor. `kind:"none"` ⇒ ANCHOR is
byte-faithful, so the D51 pin semantics are untouched.

**Plus the LEGACY-row half the seat fix cannot reach.** A member's already-written `persona_id = NULL` row still
borrowed `speakers.user` on a turn the HOST triggered. `assembly/shape.ts` `userRowAuthorName` now mirrors the
CLIENT's own fail-closed rule (`features/chat/lib/attribution.ts` `resolveUserAttribution`): a null-stamped user
row may borrow this turn's `{{user}}` ONLY when it is that human's OWN row (`authorUserId === ctx.triggerUserId`,
a new field on `AssembleContext`); everyone else takes the unresolved-persona floor. Unknown author or unknown
trigger ⇒ floor. So the accepted NULL rows assemble honestly without repair.

**Migration: unchanged** — existing NULL rows are ACCEPTED (owner-ladder default). No backfill.

**Tests:** 4 seating pins at the VERB (`tests/.../verbs/invites.int.test.ts`) — RED-FIRST verified (3 of the 4
fail against the frozen HEAD source: `expected null to be 'persona_joiner_current'`); 5 `activePersonaIdFor` arms
incl. "a human with NO seat persona floors to nothing — NEVER the anchor"; 4 `toShapeCanon` null-stamp guard pins
incl. an end-to-end wire assertion that exactly ONE line is spoken as the host.

⚠️ **Fixture correction worth knowing** (the CARD-KEEP-ZERO class, again): 19 existing fixtures built user rows
with NO `authorUserId` and contexts with no trigger — a room nobody wrote in. Production always stamps both
(`persistUserMessage` writes `principal.userId`; import writes the owner). The fixtures were fixed, not the
guard. The existing pin *"a null-stamp user row still falls back to the active persona"* stays GREEN and is now
true for a STATED reason: it is the trigger's OWN row.

*(original report below)*

### INVITE-JOIN-NULL-PERSONA — original report (M 🔴) ✓

**Reporter:** NB (guest), owner · **Scout:** 237 .ts + 105 .tsx scanned

#### What's broken

Users who join via an invite link enter the room with `active_persona_id = NULL` on their seat.
Their message rows persist `persona_id = NULL`. **The host path is unaffected** — this is invite-join only.

Two downstream symptoms:

- **Render (SEAT-BORN-NULL):** rows show "Traveler" instead of the joiner's persona. Client render
  was fixed in `d167e0ff0` — `resolveUserAttribution` now floors NULL to `DEFAULT_USER_ATTRIBUTION`
  ("Traveler"). Fixed client-side.
- **Prompt contamination (NULL-BINDS-ANCHOR):** the server assembles the prompt from those NULL rows.
  Whether the server-side attribution path also has the anchor-guard is **unverified** — the scout
  only reached client code. If the server still resolves NULL → anchor (host persona), the model is
  told the host said everything the member said. This is the serious half.

#### Root cause

Both invite redemption verbs pass no `activePersonaId` to `upsertMemberOnJoin`. The parameter is
already threaded to the DB write — the call sites simply don't pass it.

#### Evidence

- `chat/verbs/invites.ts:180` — `redeemInvite` → `redeemInviteAtomic` (`persistence/invites.ts:81`) — no `activePersonaId`
- `chat/verbs/invites.ts:243` — `acceptInviteById` → `acceptInviteByIdAtomic` (`persistence/invites.ts:131`) — no `activePersonaId`
- `persistence/participant.ts:93-102` — `upsertMemberOnJoin` accepts `activePersonaId?: PersonaId | null`
- `client/features/chat/lib/attribution.ts:119-138` — client NULL floor confirmed ("Traveler")
- `chat/contract/views.ts:123,130` — `viewerUserId` + `viewerActivePersonaId` present in `ChatDetail`

#### Advice

**Fix (2 sites, same change):** use the house pattern from `start-chat.ts:377-378` — both
`ctx.resolveCurrentPersona` and `ctx.resolveDefaultPersona` are already in scope on `ctx: ChatContext`
in `invites.ts`. Before each atomic call:

```ts
const activePersonaId =
  (await ctx.resolveCurrentPersona(joinerUserId)) ??
  (await ctx.resolveDefaultPersona(joinerUserId));
```

Pass `activePersonaId` into `redeemInviteAtomic`/`acceptInviteByIdAtomic` → `upsertMemberOnJoin`,
which writes it directly to the `chat_participants` row (`participant.ts:101,112`).

**Unverified owed:** check `assemble-gather.ts` for the server-side NULL persona resolution path
used when building the prompt cast. If it still resolves NULL → anchor, that path also needs the
"never fall back to anchor for a seat the anchor-holder does not hold" guard.

**Migration owed:** rows already stamped `persona_id = NULL` in existing sessions. Decision needed:
repair retroactively or accept that existing NULL rows render "Traveler" going forward.

**Effort:** S (2 call sites + verify server attribution path)

---

### MEMBER-PERSONA-SWITCH — member has no affordance to swap persona in-room (S ⚪ NOT REPRODUCIBLE IN CODE) ✓

**REFUSED WITH A RECEIPT: there is no gate to remove.** The row's advice was "find the gate in
`persona-panel-surface.tsx` or its mount site and remove it". Swept, and every link in the chain is ungated:

- `personaChrome` (`features/persona/lib/persona-chrome.tsx`) declares **no `useVisible`**, and `rail.tsx`
  reads `entry.useVisible?.() ?? true` — so the chip renders for every viewer. Same entry projects into the
  mobile "You" sheet via `mobile: "sheet"`.
- `persona-panel-surface.tsx` contains **zero** `viewerIsHost`/`isHost` references (whole-file read).
- `persona-this-chat-section.tsx` gates exactly ONE control on `chat.viewerIsHost` — the anchor **Re-pin**,
  which is correctly host-only. The "Playing as" switch is ungated and viewer-scoped.

**What WAS missing is coverage, and that is now closed.** Every pre-existing arm of that CT mounted
`viewerIsHost: true`, so the member seat had none — a gate could have appeared on it silently, exactly as one
exists on the anchor. Two arms added (`persona-this-chat-section.ct.tsx`): a MEMBER sees the Playing-as switch
and it fires `persona.setActivePersona` for their own seat; a MEMBER gets no Re-pin. **Both pass on unmodified
source** — which is the receipt that the client half was never the defect.

**D122 is already enforced server-side, at the verb** (`domain/persona/verbs/set-active.ts`):
`requireChatAuthorOrHost` → `requireAuthorOrHost` → `requireParticipant`, which loads the caller's **PRESENT**
`chat_participants` row (`leftSeq IS NULL`) and 404s otherwise; and a non-null `personaId` must be owned by the
TARGET. So "playing a persona consents its presentation surface, gated on the owner's PRESENT membership" holds
by construction. No new enforcement was added — adding one would have been a second home for a live rule.

**If the owner still sees this live**, the remaining candidates are OUTSIDE this row's stated scope: whether a
member reaches the app shell at all on the deployment, or a stale client. Needs a live repro to go further.

*(original report below)*

### MEMBER-PERSONA-SWITCH — original report (S 🔴) ✓

**Reporter:** owner · **Scout:** 850 files scanned (464 .tsx + 386 .ts)

#### What's broken

A member cannot change which persona they play once inside a room. The host can swap freely;
members have no surface to do so. Per owner ruling: **same swap mechanism, not a new UI**.

#### Root cause

The swap surface (`PersonaThisChatSection`) is **viewer-scoped and ungated** — it already works
for any participant, including members. But it is only MOUNTED in the persona panel surface, which
may not be accessible to members in the room context. This is a mount/visibility gap, not a
permission or backend gap.

#### Evidence

- `domain/persona/verbs/set-active.ts:13-32` — `requireChatAuthorOrHost` defaults `target` to `principal.userId` — members can self-update ✓
- `features/persona/hooks/use-chat-persona.ts:1-43` — `useSetChatActivePersona({ chatId, personaId })` — no host guard ✓
- `features/persona/components/persona-this-chat-section.tsx:69` — **one call site, ungated**
  - `setActive.mutate` is ungated — available to any participant
  - `setAnchor` (re-pin) IS gated on `chat.viewerIsHost` (`:151`) — only the anchor gate is host-only
- `features/persona/surfaces/persona-panel-surface.tsx:158` — mounts `PersonaThisChatSection`
  - **Desktop:** popover from `rail.end` avatar chip at bottom of nav rail
  - **Mobile:** inlined in "You" bottom sheet drawer (`presentation: "sheet"`)
- `PersonaThisChatSection` takes **zero props** — no `userId`/`participantId`, reads `chat.viewerActivePersonaId` — viewer-scoped only ✓

#### Advice

**Not dual-homed. The component is viewer-scoped and already works for members server-side.**
The only question: does the persona panel (and its avatar chip / "You" sheet entry point) render
for members the same way it does for the host? If the panel mount is gated on `isHost` higher
up in `persona-panel-surface.tsx` or its parent, removing that gate is the fix. No new component
needed, no new picker, no backend change.

Verify: does a member see the avatar chip in `rail.end` and the "You" drawer on mobile?
If not, find the gate in `persona-panel-surface.tsx` or its mount site and remove it.

**D122 constraint:** playing a persona in a room consents its PRESENTATION SURFACE to that room,
gated on the owner's PRESENT membership. Enforce on `setActive.mutate` call or at the verb layer.

**Effort:** XS — remove a gate or add a mount condition, no new code

---

## ═══ RPG / Card Engine ═══

> **Diagnostic tell for this cluster:** ghost row shows a "forming" chip (scanner only needs a
> completed open line), then the settled row collapses to plain text. **The failure is downstream
> of the fence** — in trust routing or render, not the model.

---

### CARD-KEEP-ZERO — teach worked example gets stubbed by `cardKeepLastX = 0` (M ✅ FIXED)

**Fixed at the wire seam, where the instruction/content distinction lives.** `resolveFullCards`
(`domain/chat/engine/pipeline.ts`): a card in a row the assembly AUTHORED this turn is instruction, not
stored content — it never stubs and never consumes the keep-last-X window. Stored cards obey the window
exactly as before.

The discriminator is `messageId` presence, which is load-bearing and verified: `assembly/shape.ts:312,321`
stamps `messageId: m.id` on every canon row it emits (both the assistant and the user/narrator branch),
while a spliced injection and the synthetic regen/continue turn are id-less by construction. Same
discriminator `isUserAttachment` already reads two functions down.

This fixes BOTH failure directions: at the default `keepLastX = 0` the teach example no longer collapses to
`[card: Crossing sign]` before sending (F2b's measured intervention now actually ships on every game — for
the first time), and at `keepLastX >= 1` the example no longer WINS the window and stubs the model's real
cards. **The default is safe again; `cardKeepLastX = 3` is no longer needed as a workaround.**

**Test added** (`tests/.../pipeline.test.ts`): "a card in an INJECTED (id-less) row never stubs and never
consumes the keep-last-X window" — asserts the authored example rides whole at X=0 AND that at X=1 the
newest STORED card still gets the slot.

⚠️ **Fixture correction, worth knowing:** the existing pipeline fixture built `MessageView` rows via
`as unknown as MessageView` with **no `id`**, so its canon rows modelled synthetic ones and five card tests
went red on a correct change. Fixed the fixture (canon rows now carry an id, matching `shape.ts`) rather
than weakening the discriminator — the production code was the evidence, not the fixture.

**Verified:** typecheck clean · `pnpm check` PASS · 103 pipeline tests pass.

*(original report below)*

### CARD-KEEP-ZERO — original report (M 🔴) ✓

**Reporter:** investigation · **Scout:** 285 files scanned

#### What's broken

Every new game ships without the card worked example. The model has never seen a real card block
in history, so it improvises — and improvised output degrades the fence (see CARD-FENCE-LENIENT).

#### Root cause

`buildWireHistory` tokenizes all fitted rows including `ctx.chatInjections` without exemption.
With `cardKeepLastX = 0` (the default), `WIRE_PART_HANDLERS.card` stubs every card span — including
the `:::card` worked example inside the teach injection. The injection is instruction, not content,
but the pipeline treats it identically to a history row.

At `keep ≥ 1`: the example wins the recency window and the model's real cards get stubbed instead.
Both directions break cards.

#### Evidence

- `contracts/src/rpg/config.ts:26` — `RPG_CARD_KEEP_LAST_DEFAULT = 0`
- `pipeline.ts:437-476` — `runTurnPipeline` passes `ctx.chatInjections` into `shapeTurn → fitted.history`
- `pipeline.ts:922` — `buildWireHistory` tokenizes all fitted rows, no injection guard
- `pipeline.ts:822` — `resolveFullCards` called with `cardKeepLastX ?? 0`
- `pipeline.ts:852` — `WIRE_PART_HANDLERS.card` stubs when keep = 0

#### Advice

Use the existing `messageId === undefined` marker — it already identifies non-canon rows
(injections + synthetic turns) in the pipeline, and `WireRow` already carries `messageId?`.

**Fix:** in `resolveFullCards` (`pipeline.ts:822`), exclude rows where `!row.messageId` from the
card-keep stubbing pass. They're instructions, not content — exempting ALL injections is correct.
No new field, no type change.

Alternative (more surgical): set `origin: "game-state"` on the RPG teach injection in
`gather.ts:170` (the `origin` field already exists on `ChatInjection` — RPG just doesn't set it).
Carry `origin` through `spliceInChatInjections` → `WireRow` and check it in `resolveFullCards`.
This exempts only RPG-injections, but requires threading a new field onto `WireRow`.

**Prefer the `messageId === undefined` path** — it's the existing house distinction, zero new types.

**Effort:** S

---

### CARD-TEACH-RECENCY — teach block buried too far from end of prompt (M ✅ LANDED ON A MEASURED A/B)

**Landed, and the A/B says something more honest than "it worked".** Order is now
`state → delta → RPG_STEERING_LICENSE → teachingBlocks() → steeringNote` (`domain/rpg/substrate/reminder.ts`).

**Deterministic half — measured on the real `buildLiteReminder`, same input both arms:**

| | teach → end | on a reconcile beat | license → end | delta→license adjacent | reminder length |
| - | - | - | - | - | - |
| BEFORE (HEAD) | 307 | 590 | 45 | **no** | 1604 |
| AFTER (this lane) | **45** | **328** | 1115 | **yes** | 1604 |

Identical byte length — a pure reorder, nothing added or removed.

**LIVE half — 20 real hosted turns, `anthropic/claude-sonnet-5`, 10 scripted card OPPORTUNITIES per arm, the
production `buildLiteReminder` with only the block order flipped between runs (`card-teach-probe.ts`, $0.30):**

| arm | emitted/opp | RENDERED/opp | eaten | recitation | refusal-talk | avg chars |
| - | - | - | - | - | - | - |
| BEFORE | 10/10 | 10/10 | 0 | 0 | 0 | 1772 |
| AFTER | 10/10 | 10/10 | 0 | 0 | 0 | 1786 |

**The honest reading: the A/B cannot distinguish the two orders, because there is no headroom left to
measure.** With `CARD-KEEP-ZERO` fixed the worked example actually ships, and emission is saturated at 10/10 in
both arms (the probe's scenario puts a visual artifact in focus every single turn, so the ceiling is by
construction). So the recency ARGUMENT is neither confirmed nor refuted here.

What the A/B *does* prove is the thing worth proving: **moving the license off the end costs nothing
measurable** — no drop in emission, no card eaten by the tokenizer, no recitation, no refusal. That was the
stated risk ("recency cuts both ways… `:519-521` is explicit that the license wants its delta referent
nearby"). With the risk measured at zero, the tie-break falls to the deterministic half: the reorder RESTORES
the `delta → license` adjacency the file's own comment exists to demand. It is landed on that, not on a
recency win it did not earn.

**Verified:** reminder suite 43 pass (four order assertions inverted, plus a NEW pin that the delta and the
license are adjacent with nothing spliced between them — the half a pure recency argument would have missed),
field-reachability 64 pass, `pnpm typecheck` clean.

### CARD-TEACH-RECENCY — original report (M 🔴) ✓

**Reporter:** investigation · **Scout:** 285 files scanned

#### What's broken

The teach block (the model's card-writing instruction) ends 244–1,031+ chars from the end of the
system prompt depending on what fires. Models weight recency heavily; this distance explains why
cards stop appearing without a manual depth-0 nudge.

#### Root cause

`buildLiteReminder` assembles blocks in the wrong order. Teach sits before the steering license,
so license + steering note + reconcile note bury it.

#### Evidence

`buildLiteReminder` (`domain/rpg/substrate/reminder.ts:475`) current order:

1. State block (`:512`)
2. Delta block (`:525`)
3. `teachingBlocks()` (`:531`) ← **too early**
4. `RPG_STEERING_LICENSE` (`:533`)
5. `steeringNote` (`:535`) — up to 500 chars
6. `reconcileNote` appended by `gather.ts:169` — 283 chars on reconcile beats

Teach distance to end: **244 chars min · 777 typical · 1,031+ chars on reconcile beats**

⚠️ **Line numbers re-verified 2026-08-04** (`:513` state · `:525` delta · `:531` teach · `:533` license ·
`:537` note · `:540` join) — order unchanged, entry still live.

⚠️ **One claim in the original is now FALSE, corrected here:** it argued the code "violates the file's own
stated intent" via a `:519` comment asking for `delta → license` adjacency. The comment at `:527-530` now
*documents the current order* — *"the config-gated TEACHING blocks … after the state/delta, before the
license"* — and the delta block's own comment (`:519-521`) explains the delta sits *"BETWEEN the absolute
state and the license so the license's 'let the change land in the fiction' has its referent."*

**So `delta → license` adjacency is a deliberate design the teach block currently breaks, and the proposed
reorder would RESTORE it** — the opposite of the original framing, same resulting fix. The recency argument
stands on its own regardless.

#### Advice

Reorder to: `state → delta → RPG_STEERING_LICENSE → teachingBlocks() → steeringNote`
(reconcile note stays appended by gather). This:

- Puts teach in the last \~244 chars before the user turn
- Restores the `delta → license` adjacency `:519-521` explains the delta exists for
- Is a 3-line reorder with no logic change

**Do not land this blind.** Recency cuts both ways — moving the teach last also moves the *license* off the
end, and `:519-521` is explicit that the license wants its delta referent nearby. Both orders are defensible;
this one is untested. Fire a turn before and after and compare, now that `CARD-KEEP-ZERO` means the teach
example actually ships.

**Effort:** XS (edit) + a live A/B before believing it

---

### CARD-FENCE-LENIENT — improvised card syntax degrades to literal text (S ✅ ADJUDICATED — do NOT widen the grammar)

**Adjudicated 2026-08-07 on measured specimens (lane DOG-ENGINE). Verdict: no grammar change. The entry's
premise is HALF right, and the half that is right is already covered.**

**Corpus 1 — 20 FRESH post-fix emissions** (the CARD-TEACH A/B's live turns, hosted Sonnet-5):

| | count |
| - | - |
| card OPENS | 20 |
| …matching the strict grammar `:::card title="…"` | **6** |
| …carrying a **trailing `>`** (`:::card title="Note on 4B's Door">`) | **14 (70%)** |
| card CLOSES | 20 (**20 strict**, zero deviation) |
| quote-wrapped fences (the specimen this entry was filed on) | **0** |
| cards the REAL tokenizer rendered | **20/20** |

**So improvisation did NOT die — 70% of opens are off-strict-grammar — and closing this as "premise-resolved"
would have been wrong.** But the single deviation class the models actually produce is the trailing `>`, which
**F2a already tolerates**, and the proof is that all 20 rendered through the production tokenizer. The
leniency we have is exactly matched to the deviation that occurs in the wild.

**Corpus 2 — the retained wire capture** (`captures.jsonl`, 49 request captures 2026-08-04→08-05, 22 distinct
assistant turns): **one** card emission, strict-grammar, zero deviations. The quote-wrapped specimen appears
nowhere. (⚠️ **Instrument note, and it nearly produced a false zero:** wire `content` is a PARTS ARRAY, so a
first pass that stringified it escaped every newline into one line and reported "0 fence lines" across the
whole corpus. The corrected extractor found 57 messages carrying `:::card`. A positive control is what caught
it — see `[[instruments lie — verify the verifier]]`.)

**Recommendation:** close. Widening a line-anchored grammar on zero occurrences of the deviation it would
absorb costs tokenizer strictness for nothing. Re-open only if a fence class OTHER than trailing-`>` is
recorded rendering as literal text.

### CARD-FENCE-LENIENT — original report (S 🔴) ⚠

**Reporter:** investigation · **Scout:** not dispatched — one specimen only

#### What's broken

Without the teach example, Sonnet improvises and quote-wraps the fence:
`":::card title="…"` and `:::"`. Grammar is line-anchored so the whole block degrades to literal
text. `F2a` covers only trailing `>` on the open line.

#### Root cause

Fence grammar is insufficiently lenient for LLM-typical deviations. One specimen measured.

#### Advice

**Mine more specimens before widening the grammar.** CARD-KEEP-ZERO + CARD-TEACH-RECENCY fix
the root cause (model sees the example, stops improvising). Fence leniency is a fallback, not
the primary fix. One data point is not enough to know which deviations are common.

**Effort:** S (after sufficient specimen data)

---

### ~~SEED-TRIPLICATE~~ — **RETRACTED 2026-08-04, NOT A BUG. Do not act on this.**

Filed and withdrawn within the hour. Kept as a worked example of the failure mode this doc's own
`[[board-rows-state-their-evidence]]` rule exists to prevent — a row written from a partial read.

**The claim:** 35 character rows / 13 distinct names ⇒ the default pack was seeded three times by three
boots, and the seeder's idempotency check was broken.

**The reality (owner's hypothesis, confirmed):** there are **three users**, and the default-character pack
is seeded **per user** — `entry/boot/seed-default-characters.ts` says so in its own first line: *"Per-user
first-run seed of the default-character pack. At boot seeds the deployment owner once; new users get it via
the app's first-authed-request hook."* The three owner ids match the three `user_settings` rows exactly:

```
character_01kz5a66er…  owner=01kz5a6644…  handle=kohaku
character_01kz5a0znv…  owner=01kz5a0zcn…  handle=kohaku
character_01kz59zqbh…  owner=01kz59zq24…  handle=kohaku
```

Same handle, three owners — exactly what `characters_owner_handle_unique` on `(ownerId, handle)` is designed
to permit. Working as intended. The "three tight id clusters" cited as evidence of three boots were three
USERS being seeded at first sight, minutes apart.

**The actual defect was in the instrument, and it is FIXED.** `characterPolicySweep` returned every owner's
characters while omitting `ownerId` and `handle`, so a legitimately per-tenant table read as duplicate rows.
Both columns are now in the projection, with the reason recorded at the function. The reasoning error was
inferring a WRITE-path bug (a re-running seeder) from a READ that had no tenant column in it — one query for
`ownerId` would have settled it before anything was filed.

**Standing lesson:** a cross-tenant sweep that omits the tenant column is a misreading waiting to happen.
Check the owner before believing a duplicate.

---

### CARD-TRUST-INVERTED — the tier mapping was inverted against D44 (M ✅ FIXED `9f30b7045`)

**Fixed.** `render-trust.ts` now owns the card tier (the one trust authority), granted by EITHER consent
axis: a per-character `trustHtml` opt-in, OR the room's immersive-HTML switch. The rpg toggle is what makes
the engine TEACH the model to emit `:::card` fences, so a room that asks for cards and then renders them
inert is a toggle that lies — the host flipping it IS the consent (owner ruling). Non-rpg users are covered
by the per-character axis, so neither audience is second-class.

Tier A now renders through `InertCard`: the card frame, a "Plain view" badge, and the reason + remedy as
VISIBLE TEXT (not a hover tooltip) — the twin of `MessageMedia`'s click-to-load gate. Previously it emitted
bare unstyled HTML into the prose flow: the content never vanished, its IDENTITY did.

Coverage: both tiers pinned in `message-content.ct.tsx` (30/30), 4 new resolver tests, and the CT stories
now build their row policy through the REAL resolver — a hand-built literal could never disagree with the
resolver it was meant to test, which is how this survived.

**Verified:** `pnpm check` PASS · 30 CT · 13 render-trust · live on prod.

*(the adjudication that produced the fix is kept below — it is the record of a wrong re-diagnosis being
corrected against the law, and worth not repeating)*

### CARD-TRUST-INVERTED — the adjudication (原 M 🔴) ✓ **ORIGINAL DIAGNOSIS WAS RIGHT**

**Reporter:** investigation · **Adjudicated against D44 on 2026-08-04.** This entry was re-diagnosed mid-session
as "not inverted, Tier-A is deliberate" and that re-diagnosis was **WRONG** — it reasoned from a code comment
and from the instinct "sandbox the untrusted", instead of from the law. Constitution: *docs-are-law over your
instinct AND the prompt*. The original entry stands.

#### The law

Three docs agree, and no ledger entry supersedes them:

- **Tier A = the DEFAULT, for UNTRUSTED content.** *"Tier A (default, main DOM): a tight INERT sanitized
  allowlist via Streamdown — the untrusted policy… **Forbidden in Tier A:** `<script>` · `on*` · `<style>` ·
  inline `style=` · `<iframe>`…"* (`UI-Theming-and-Content.md` §12.2). `UI-Gates-and-Lessons.md:243` names
  `untrusted` "the DEFAULT" and maps it to the Tier-A allowlist.
- **Tier B = the OPT-IN TRUST tier.** *"Tier B (**opt-in per-character trust**): elaborate self-contained
  HTML+CSS mini-UI → `@orb/ui/sandbox-frame`"* (§12.2) and *"Tier B (opt-in trust): raw CSS only inside the
  sandboxed-iframe card"* (§12.1).

So: `trustHtml: true` ⇒ **tierB** ⇒ `ImmersiveCard`. Untrusted ⇒ **tierA** ⇒ inert sanitized markdown.

#### What the code does

`message-content.tsx:92` maps it **exactly backwards**:

```ts
cardTrust: render.trust === "trusted" ? "tierA" : "tierB"
```

Both directions are wrong, and not symmetrically:

- **Trusted content is DEMOTED.** Tier A forbids `<style>` and discards the card's css by law, so a trusted
  card cannot render as a card there — it degrades to unstyled inline HTML. This is the reported bug.
- **Untrusted content is PROMOTED.** It receives the elaborate sandboxed mini-UI that D44 reserves for an
  explicit per-character opt-in. Not a safety hole (the sandbox is the isolated path) but it hands out a
  capability the law gates.

The comments at `:48-50` and `:88` describe the inverted behaviour as if intended. They are the rationalisation,
not the spec — a file comment does not outrank the D-ledger.

#### Why it went unnoticed: the test hole

`tests/client/features/chat/components/message-content.ct.tsx` covers cards thoroughly — tierB chrome, sandbox
CSP on both external-media settings, view-raw, expand-lightbox, transcript collapse. **Every one of those tests
mounts `trust="untrusted"`.** There is ZERO card coverage at `trust="trusted"`. The suite exercises only the
path the inversion happens to leave working.

#### Live impact (prod, 2026-08-04)

`GET /api/_debug/config/characters` — the deployment floor is `{"trustHtml": true}`, so all 35 characters
(every one storing `null` = inherit) resolve TRUSTED ⇒ tierA ⇒ **not one card has ever reached `ImmersiveCard`
on this deployment.** Model-independent: it would fail identically on vLLM. The vLLM-vs-OpenRouter difference
was in card EMISSION (`CARD-KEEP-ZERO`); this is the render half.

#### The fix

1. **`message-content.tsx:92` — flip the mapping** to `render.trust === "trusted" ? "tierB" : "tierA"`. The
   `renderBlock` branch below it (`block.trust === "tierB" ? <ImmersiveCard> : <Markdown untrusted>`) is already
   correct and does not move.
2. **Rewrite the `:48-50` and `:88` comments** — they currently teach the inversion to the next reader.
3. **CT at BOTH tiers** — mount a card fence trusted AND untrusted, assert immersive chrome vs inert markdown.
   This is the missing pin, and the reason the defect survived.
4. **`characterPolicySweep`'s `cardTier` derivation flips with it** (`foundation/observability/debug/inspect/
   config.ts`) — it currently reports `trustHtml ? "tierA" : "tierB"`, mirroring the bug.

**⚠️ Product decision this forces (owner's call):** after the fix, an UNTRUSTED character's cards render as
inert Tier-A markdown, not immersive chrome — because Tier B is opt-in by law. Deployments that never set
`trustHtml` therefore lose immersive cards they currently get. That is D44 working as designed, but it is a
visible change. Either accept it (cards are an opt-in richness) or flip the shipped default for `trustHtml`.
**This deployment is unaffected — its global is already `true`, so the fix simply turns cards on.**

**Effort:** XS (the flip) + S (the two-tier CT coverage)

### CARD-EXTERNAL-MEDIA — `block-external-media` kills inline-only cards (M ✅ ADJUDICATED — NOT REPRODUCED)

**Audited 2026-08-07 (lane DOG-ENGINE). The sandbox CSP is correct: the restriction is external-only, and
inline content paints with the flag OFF.**

The frame policy (`ui/content/sandbox-frame/srcdoc.ts`) at `allowExternalMedia=false` is
`default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; font-src 'self'` — `'self'`
resolves to the EMBEDDER's origin even through the frame's opaque origin, so same-origin `/api/blob/<hash>`
card images and inline `<style>` both work. The flag adds `https:` to `img-src`/`media-src` and touches
nothing else. The reported symptom is best explained by **CARD-TRUST-INVERTED**, which this entry itself names
as a dependency ("cards don't reach `ImmersiveCard` at all until \[it] is fixed") and which shipped in
`9f30b7045`.

**Why the existing coverage could not have told us:** the two pre-existing CTs read the CSP STRING off the
`srcdoc` attribute and never look inside the frame — a card that ships a perfect policy and paints NOTHING
passes both. `done ≠ rendered`. **Two new CTs reach THROUGH the iframe** (`message-content.ct.tsx`, 32 pass):
inline-only content is visible with external media BLOCKED and occupies real geometry (\`boundingBox().height

> 0`, not a zero-height ghost), and a card mixing local text with an external `<img>\` keeps its local half —
> the exact "don't degrade local content" property this entry asks for.

**Deliberately NOT changed — two directives, each with a reason:**

- **`blob:`** — the entry advised adding it. It would be **dead config**: app blobs are `/api/blob/<hash>`
  (same-origin, `'self'`), the only `URL.createObjectURL` producers are the composer and the JSON download
  (neither reaches a card), and a null-origin frame cannot resolve a parent-created blob URL anyway. Adding a
  directive that can never match teaches the next reader that it does something.
- **`data:`** — ⚠️ **REAL RESIDUAL HOLE, and it root-causes to an owner-ruled law, so it is reported rather
  than fixed.** The card teach tells the model *"Embed everything inline (no external scripts/fonts/images)"*,
  and the natural way to embed an image inline is a `data:` URI — which the prod document CSP drops
  (`security-headers.ts`: `imgSrc: [SELF, BLOB, ...mediaHosts]`, `data:` in dev only). **Both policies must
  allow a fetch for a card image to paint**, so permitting `data:` in the frame alone changes nothing; closing
  it means loosening the DOCUMENT `img-src`, which D44 forbids and this doc's own `D44-GRAIN-TEXTURE` row
  states verbatim: *"Setting is `img-src 'self' blob:` — blocking `data:` is **correct per D44**"* and *"**Do
  NOT loosen `img-src`**."* **Owner call:** model-authored cards cannot carry inline raster/SVG images at all
  under D44. Either that is accepted (cards are HTML+CSS art, not image containers) or the teach should stop
  inviting inline images. Not a lane decision.

### CARD-EXTERNAL-MEDIA — original report (M 🔴) ✓

**Reporter:** investigation · **Scout:** 285 files scanned
**Depends on:** CARD-TRUST-INVERTED (cards must reach `ImmersiveCard` first)

#### What's broken

With `block-external-media` enabled, cards with zero external references still fail to render.

#### Root cause

`<ImmersiveCard allowExternalMedia={allowExternal}>` uses the flag to set sandbox CSP. When
`false`, the sandbox may be too restrictive even for local-only content. Cards don't reach
`ImmersiveCard` at all until CARD-TRUST-INVERTED is fixed — these two bugs interact.

#### Evidence

- `render-trust.ts:48-55` — reads `policy.forbidExternalMedia` → `allowExternal: !policy.forbidExternalMedia`
- `message-row.tsx:18` → `message-content.tsx:35` → `message-content.tsx:59`, `rpg-scene-cards.tsx:47`
- `<ImmersiveCard allowExternalMedia={allowExternal}>`

#### Advice

Fix CARD-TRUST-INVERTED first. Then audit `ImmersiveCard`'s sandbox CSP with `allowExternalMedia=false`
— it should permit `blob:` and `self` for inline-only cards. `block-external-media` should restrict
external URLs, not degrade local content render.

**Effort:** XS–S (after trust fix)

---

### INJECT-NAMED-AS-PLAYER — the rpg injection was delivered as the PLAYER's words (M ✅ FIXED `34bdc39f3`)

**Fixed via the marker, exactly as this entry advised.** `spliceInChatInjections` marks a demoted row
`speakerless`; `applyNamesBehavior` honours it and CONSUMES it (a wire row must not carry an internal
assembly flag). A `role:"user"` injection is deliberately unmarked — that one IS authored in the user's voice.

**Deliberately NOT changed — the merge.** Splitting the note out of the user turn was implemented and then
reverted: it produces consecutive same-role rows, which is precisely what the squash exists to prevent and
what strict backends reject (the entry's own Perplexity/`PROMPT_PLACEHOLDER` note). The owner ruling was
"do not name-stamp the merged-in parts", not "do not merge". The existing regression pin
("byte-identical demote — the note folds into the adjacent user tail") caught the overreach.

**Verified:** `pnpm check` PASS · 258 assembly tests · end-to-end pin asserts exactly ONE speaker label in
the turn under `namesBehavior:"content"`, and that no wire row leaks `speakerless`.

*(original report below)*

### INJECT-NAMED-AS-PLAYER — original report (M 🔴) ✓

**Reporter:** owner (live), investigation · **Evidence:** wire capture, `chat_01kz6qesv6fk6bq1gmr8kc0wcf`

#### What's broken

On any connection without mid-conversation system support (the OpenRouter/Sonnet chat-completions
path — i.e. the normal hosted path), the entire rpg instruction channel reaches the model prefixed
with the player's speaker name and merged into the player's own turn:

```
Nate: so you are seeing our conversation history …

Nate: [Note from system: # Game state
Trackers: HP (physical health — damage lowers it…
```

Game state, the card teach, the steering license and the reconcile note are all delivered as if
**the player said them**. Measured: final user message 3,037 chars, 2× `Nate:` labels, 1× `[Note from`.

#### Root cause

The system-row naming guard exists but cannot fire, because the demote happens upstream of naming.

1. `assembly/injections.ts:82-94` — `resolveSpliceRole` demotes a `role:"system"` in\_chat injection to
   `user` (with `[Note from system: …]` framing) whenever the backend can't take mid-conversation
   system. It records `originalRole:"system"`, uses it for framing, then **drops it**.
2. `assembly/shape.ts:213` — `runSquash(applyNamesBehavior(injected, …))` — **names first, squash second.**
3. `assembly/names.ts:26` — `applyNamesBehavior` guards system rows explicitly:
   `if (m.role === "system") { return {...}; }` with the comment *"System rows carry no speaker — never
   label them (a `Name:` prefix or a completion `name` field would misattribute the system channel to a
   participant)."* The row is no longer `system`, so it falls through to
   `m.authorName ?? speakers.user` → `"Nate"`, and mode `content` emits `` `${author}: ${m.content}` ``.
4. `runSquash` then merges the adjacent same-role rows with a **blank-line** separator, producing two
   `Nate:`-labelled blocks in one turn.

The file's own comment describes precisely the failure it now produces.

#### Evidence

- `domain/chat/assembly/injections.ts:82-94` — the demote, and `originalRole` recorded then dropped
- `domain/chat/assembly/shape.ts:213` — name-then-squash ordering
- `domain/chat/assembly/names.ts:26` — the guard keyed on `role === "system"`
- Wire capture: newest turn on `chat_01kz6qesv6fk6bq1gmr8kc0wcf`, roles
  `system, assistant, user, assistant, user, assistant, user` — final user row carries both blocks

#### Advice

**Owner ruling:** when merging rows, do **not** name-stamp the merged-in parts, and do not
blank-line-separate the sections.

**Reference implementation — SillyTavern** (`SillyTavern/public/scripts/openai.js:3862`,
`squashSystemMessages`, called once at `:1608` after the whole prompt is populated):

```js
const shouldSquash = (message) => {
    return !excludeList.includes(message.identifier) && message.role === 'system' && !message.name;
};

if (shouldSquash(message)) {
    if (lastMessage && shouldSquash(lastMessage)) {
        lastMessage.content += '\n' + message.content;
```

Three differences from ours, all load-bearing:

1. **Sections stay separate MESSAGES until a final squash pass.** Each prompt-manager entry is its own
   message object in `this.messages.collection` with its own `identifier`; separation is a message
   boundary, not a string join. Ours is joined inside `buildLiteReminder` (`reminder.ts:540`
   `blocks.join("\n\n")`), so the structure is destroyed before anything downstream can see it — the
   same root cause as `RPG-NO-PROMPT-DEBUG`. ST can display its sections because it still has them.
2. **Single `\n` between squashed sections**, not a blank line. We use `\n\n`
   (`assembly/injections.ts:64-75` `squashSystemNotes`, and `runSquash`).
3. **`!message.name` is part of the squash predicate.** A message carrying a name is NEVER squashed.
   Combined with `role === 'system'`, ST can only ever merge *nameless system* messages into each
   other — it is structurally incapable of gluing a named message into a merged block, or of merging
   anything into a user turn.

Point 3 is the precedent. ST needs no guard against name-stamping merged content because a name
*disqualifies* a message from merging at all. Our pipeline does the inverse — demote system→user, drop
the marker, name-stamp as the player, then merge — three individually-defensible steps landing
somewhere ST made unreachable by construction.

**ST's SERVER-side merge modes** (`SillyTavern/src/prompt-converters.js`) — the deeper precedent, and it
supersedes the separator claim above. There are TWO separate passes with DIFFERENT separators: the client
`squashSystemMessages` (`openai.js:3862`) joins with `'\n'`; the server `mergeMessages` (`:823`, joining at
`:891`) uses `'\n\n'`. **Our `\n\n` matches ST's server merge** — the separator is not the defect.

> \[!NOTE]
> AMENDED — this two-pass reading is incomplete; the FIX above (the `speakerless` marker) is unaffected.
> For a Claude request there is a THIRD pass, `convertClaudeMessages` (`prompt-converters.js:197`, sole call
> site `chat-completions.js:233`), which runs ALWAYS and merges same-role rows again by concatenating
> content BLOCK ARRAYS with **no separator at all** (`:349`). So "our `\n\n` matches ST" is true of stage 2
> and says nothing about the final Claude wire, where the join is structural rather than textual (measured:
> golden `custom_squash_claude_strict` carries the card and `"Hello!"` as two adjacent un-joined text blocks
> in one user message). Full three-stage model, mode table, and receipts:
> `docs/design/st-message-shaping-atlas.md` §Wire identity.

Eight modes, one function, four booleans (`postProcessPrompt:79-102`, `PROMPT_PROCESSING_TYPE:15`):

| mode | strict | placeholders | single | tools |
| - | - | - | - | - |
| `''` none | — | — | — | — (no-op) |
| `merge` / `claude` (deprecated) | ✗ | ✗ | ✗ | ✗ |
| `merge_tools` | ✗ | ✗ | ✗ | ✓ |
| `semi` | ✓ | ✗ | ✗ | ✗ |
| `semi_tools` | ✓ | ✗ | ✗ | ✓ |
| `strict` | ✓ | ✓ | ✗ | ✗ |
| `strict_tools` | ✓ | ✓ | ✗ | ✓ |
| `single` | ✓ | ✗ | ✓ | ✗ |

- **merge** — squash consecutive same-role only.
- **semi** — merge + force every mid-prompt system message to `user` (`:935-937`).
- **strict** — semi + splice a `PROMPT_PLACEHOLDER` user turn so the prompt satisfies Claude's
  system→user alternation (`:939-945`).
- **single** — collapse the entire prompt into ONE `user` message, name-prefixing assistant/user lines
  on the way in (`:868-882`).

**THE ORDERING — this is the actual fix shape.** `mergeMessages` runs:

```js
// PASS 1 — names resolved from each message's OWN `name` field
if (message.name && message.role !== 'system') {      // system NEVER gets a prefix
    message.content = `${message.name}: ${message.content}`;
}
delete message.name;                                   // ← name is GONE

// PASS 2 — squash consecutive same-role with '\n\n'

// PASS 3 — only now, if strict:
if (i > 0 && mergedMessages[i].role === 'system') mergedMessages[i].role = 'user';
return mergeMessages(mergedMessages, names, { strict: false, ... });   // re-merge
```

Names are applied and **deleted before system→user demotion happens at all**. When strict demotes and
recurses, pass 1 re-runs — but `name` is already gone, so nothing can attach one. A demoted system
message is *structurally incapable* of acquiring a speaker name.

Ours runs the same three steps inverted: demote (`injections.ts:82-94`) → name (`shape.ts:213`) → squash.
So `INJECT-NAMED-AS-PLAYER` is **an ordering inversion, not a missing guard** — resolve names before
demotion and `names.ts:26`'s guard becomes unnecessary rather than unreachable.

**ST's TOOL handling across merge modes** (ast-grep, `scannedFileCount=95` over `SillyTavern/src`):

1. **`tools` is a DEMOTION SWITCH, not a feature flag** (`prompt-converters.js:865`, `:882-884`):
   ```js
   if (message.role === 'tool' && !tools) { message.role = 'user'; }
   ...
   delete message.name;
   if (!tools) { delete message.tool_calls; delete message.tool_call_id; }
   ```
   A tool-incapable backend gets tool RESULTS as user turns with call metadata stripped — the same
   demote-rather-than-drop posture ST applies to system messages.

2. **Tool messages are structurally exempt from squashing** — the squash predicate (`:890`) carries
   `&& message.role !== 'tool'`, so consecutive tool results never merge. This is the THIRD hard
   exclusion in the function, alongside `!message.name` and the client pass's `excludeList`
   (`openai.js:3863`). **ST's merge is built from disqualifiers, not guards** — the architectural
   lesson for us.

3. **Mode is hardcoded per backend**, not a user knob, except on the generic custom path:

   | backend | mode | site |
   | - | - | - |
   | DeepSeek (`sendDeepSeekRequest`) | `SEMI_TOOLS` | `endpoints/backends/chat-completions.js:1084` |
   | MiniMax (`sendMinimaxRequest`) | `MERGE_TOOLS` | `:1591` |
   | Perplexity | `STRICT` (no tools) | `:2353` |
   | custom / OpenAI-compatible | user-selected `custom_prompt_post_processing` | `:2173` |
   | `/process` endpoint | caller-specified `request.body.type` | `:2907` |

4. **Tools SUPPRESS assistant prefill** (`addAssistantPrefix:67-73`):

   ```js
   const hasAnyTools = (Array.isArray(tools) && tools.length > 0) || prompt.some(x => x.role === 'tool');
   if (!hasAnyTools && prompt[prompt.length - 1].role === 'assistant') { ... }
   ```

   **Applies to us — CONFIRMED REACHABLE (`pnpm ast ident assistantPrefill`, 26 hits / 12 files).**
   `chat/engine/pipeline.ts:449` sets `assistantPrefill: args.connection.capability.turns?.assistantPrefill === true`
   — a pure capability read, **with no tools check anywhere in the chain**. `assembly/shape.ts:224` then
   computes `needsContinuation = endsOnAssistant && input.assistantPrefill !== true`, so a prefill-capable
   connection deliberately ends the prompt on an assistant row while the folded turn attaches its 6 tools.
   That is precisely what ST refuses at `addAssistantPrefix:71`.

   Not hypothetical — `tests/server/domain/connection/catalog/turns.test.ts:90-93` pins the compat wire:
   `anthropic/claude-opus-4-5` → **true**, `claude-haiku-4-5` → **true**,
   `anthropic/claude-sonnet-4-6` → false, `claude-opus-4-8` → false. So a folded game on an
   OpenRouter connection running opus-4-5 or haiku-4-5 ships **tools + prefill together**. The
   Sonnet-5 path this investigation used is `false`, which is why it never surfaced here.

   **Owed:** gate `assistantPrefill` on the absence of wire tools (ST's `hasAnyTools` shape), or
   establish that our backends tolerate prefill-with-tools. Untested either way.

**Related latent risk:** Perplexity is given `STRICT` specifically so the `PROMPT_PLACEHOLDER` splice
guarantees system→user alternation. We have no equivalent, and our demote path can emit
system-then-non-user sequences. Worth checking whether any hosted backend we support enforces
alternation strictly enough to reject one.

Carry the `originalRole:"system"` marker through the splice onto the row, then have
`applyNamesBehavior` apply the same skip it already applies to real system rows. **The marker is the
fix.** Re-ordering to squash-then-name would remove the duplicate label but NOT fix attribution — the
note would still sit inside a `Nate:`-prefixed turn.

**Why it matters beyond cards:** an instruction attributed to the player is a far weaker signal than a
system instruction. Plausibly explains why the owner's manual imperative nudge outperformed the real
teach block (same "Nate:" voice — a direct order beats a permissive aside from the same speaker). NOT
proven to be the sole cause of card non-emission; CARD-KEEP-ZERO was independently real.

**Note on provenance:** Sonnet independently reported this about its own context ("a single user-role
turn labeled Nate containing two concatenated messages… no assistant turn separating them") and the
wire confirmed it verbatim. Model self-reports are normally unreliable — verify against the wire
regardless; this one happened to be correct and checkable.

**Effort:** S

---

### EMPTYGEN-UNLOGGED — "model returned no text" is invisible in server observability (M ✅ FIXED)

**Fixed:** `domain/chat/engine/engine.ts` — `assertGeneratedContent` now takes the pipeline result and emits
`chat.generation.empty` (warn) BEFORE the throw, carrying `finishReason`, `stopReason`, `toolRecords`,
`reasoningChars`, `tokensOut`, `maxOutputTokens`, `reasoningEffort`. Those are exactly the fields that
discriminate a tool-only completion from a provider that returned nothing — the distinction that previously
required asking the operator what they saw in the browser. Comment records that `toolRecords` reads 0 on a
folded turn by construction, so `finishReason` is the tell there.

**Verified:** typecheck clean; engine + foundation suites 366 passed.

**Gate/test to write:** ✅ `tests/server/domain/chat/engine/engine.int.test.ts` — "EMPTYGEN-UNLOGGED: the
refusal is OBSERVABLE — a warn fires carrying the populated finishReason".

*(original report below)*

### EMPTYGEN-UNLOGGED — original report (M 🔴) ✓

**Reporter:** investigation · **Evidence:** `grep -c emptyGeneration .cache/stack/prod.log` → **0**; `/api/_debug/errors` → empty

`assertGeneratedContent` (`domain/chat/engine/engine.ts:1026-1030`) throws `CHAT_OP_CODES.emptyGeneration`,
which surfaces to the client through tRPC and is **never logged server-side**. The failure exists only in
the browser console. Combined with the wire-capture ring recording **requests only**, an empty-generation
failure leaves NO server-side artifact: no `stop_reason`, no `finishReason`, no response body, no error
entry. Diagnosing one is currently impossible after the fact.

**Advice:** log the refusal at `engine.ts:1028` with the turn's `finishReason`, output-token count, and
whether tool calls were present. Consider capturing response metadata (not bodies) alongside `WIRE_CAPTURE`.
This blocked root-causing `EMPTYGEN-REASONING` below.

**Effort:** S

---

### TOOLCALLS-INVISIBLE — tool calls and their args are not visible anywhere to the user (M ✅ FIXED — arm A built)

**The user-facing half now exists.** On a folded turn the row carries a collapsed disclosure —
`Game actions on this turn — N` — listing each call by name with a verdict badge (`recorded` /
`partly recorded` / `not recorded`) and, when something was lost, the failing field as **visible text**
(never a hover tooltip: `SCENE-DROPPED` cost a live session hours precisely because that reason was
nowhere a human could read it).

**D112 is intact.** chat still never resolves, executes or persists a terminal tool's calls — the record is
rpg's own (`rpg_turn_tool_calls`, one row per producing variant), written by the contributor the clause
already hands the calls to. `message_variants.tool_calls` was NOT touched; it is the right shape and the
wrong owner.

Mechanics worth knowing:

- **ONE projection, three readers.** `recordToolCalls` (`contracts/rpg/extraction.ts`) composes the two
  existing loss lenses into the per-call verdict; the compose WARN, the R-OBS ring and the durable row all
  call it, so the log, the trace and the surface cannot disagree about what was lost.
- **Written BEFORE the staged-nothing return.** A turn whose calls ALL dropped writes no snapshot — and is
  exactly the turn a user is asking "why did nothing happen?" about. A record gated on a successful write
  would have shown only the turns that already worked.
- **Its own bus member (`turnToolCallsRecorded`), not `snapshotPatched`.** Same reason: the all-dropped turn
  emits no snapshot event, so riding it would leave the failing case stale until an unrelated later turn.
- **Swipe-correct with no refetch.** Keyed by `variantId` (the `rpg_snapshots` keying one plane over); the
  client indexes the window once and each row looks up its own `selectedVariantId`.
- **Applicability, not a mode** (`[[no-separate-reduced-modes]]`): mounted through the chat `message-footer`
  surface anchor — the seam's first real tenant — with `when` = assistant row and a `null` body when this
  variant has no record. A non-game chat renders nothing; no flag, no branch.
- **MEMBER-gated, deliberately.** Its host-only siblings (`getConfigView`/`revealHidden`) gate to keep
  something FROM a member; a tool call is the record of a turn everyone at the table watched. The
  cross-tenant belt therefore carries the whole load and the proc is classified **PROBED**.

**Verified:** `pnpm typecheck` · `typecheck:graph` · `typecheck:tests-dom` all 0 · `check:structure` PASS
(it caught four real gaps on the way — a re-spelled verdict union, a missing freshness driver, a missing
table-scoping row, a missing verb mirror test; all fixed, none allowlisted) · `check:db-baseline` 218/218
after the squashed regen · knip 0 · depcruise 0 (2,777 modules) · **1,075 vitest** across rpg + compose +
contracts + transport (incl. the cross-tenant sweep with the new proc, and 4 composed-real turns: recorded /
all-dropped / quiet / non-folded) · **20 CT** (5 new).

*(original report below)*

### TOOLCALLS-INVISIBLE — original report (M 🟡 PARTIAL)

**Partially addressed:** tool calls + raw args are now readable server-side at
`GET /api/_debug/wire/outcomes` (see `WIRE-OUTCOMES` below) — enough to DEBUG, since that surface also
carries `finishReason`. **The user-facing half is untouched:** nothing in the transcript or the RPG panel
shows what fired, so during normal play the majority of what a folded turn does is still invisible.

**As of 2026-08-07 the folded turn's calls are ALSO in the rpg flight recorder** — `RPG_TRACE=on` →
`GET /api/_debug/rpg/traces?turnId=…` returns the per-call names, the args verbatim, and an
`applied`/`salvaged`/`dropped` verdict per call (see `RPG-TRACE-DEAD`). Still an operator surface, not a
user one — but the DATA now exists in a queryable, per-turn, correlatable form, which is what the user-facing
build reads from.

#### ⚖️ RULING FORK — recorded 2026-08-07, adjudicated on the ladder

The obvious fix (persist the folded calls as `ToolCallRecord`s so the existing `message-tool-calls.tsx`
renders them) is a DIRECT reversal of D112's TERMINAL-tools law. Verbatim,
`domain/chat/contract/context.ts:517-522`:

> TERMINAL tools the contributor mounts on THIS turn (the R1 folded-extraction seam). STRUCTURAL — these are
> plain `WireTool`s; chat never learns what they mean. They differ from `tools` (registry names) in exactly
> one way, and it is the whole point: chat attaches them with `tool_choice:"auto"`, **NEVER RESOLVES,
> EXECUTES, OR RECURSES on them, and never persists their calls as `ToolCallRecord`s** — the co-emitted
> `tool_calls` are handed straight back to the contributor on `RpgTurnContext.terminalToolCalls`.

Three arms were put up; the ruling is **arm A**:

- **A — RPG-OWNED per-variant call record. ✅ RULED, AND BUILT 2026-08-07 (see the row header).** rpg persists the calls IT folded, in an
  rpg-owned row keyed by `variantId`, read through an rpg verb and surfaced as a collapsed row disclosure /
  rpg-panel affordance. This does not touch D112's mechanism — the clause's own text says the calls are
  *"handed straight back to the contributor"*, and the CONTRIBUTOR recording its own is the law working, not
  the law reversed. chat still never learns, resolves, or persists. Satisfies the owner's literal ask (names
  - args). §13.10 naming applies; CT against a real folded turn's calls; applicability-gated, not a
    separate mode (`[[no-separate-reduced-modes]]`).
- **B — snapshot-DIFF "what this turn changed".** Zero new persistence: the flush already writes a
  clone-forward snapshot keyed to `variantId`/`messageId` and journal entries stamped with both
  (`domain/rpg/chat-ops/flush.ts::writeFlush`), so per-turn change is derivable by diffing adjacent
  snapshots. **NOTED as an owner-taste follow-up, not built and never a substitute for A** — it may well be
  the better product surface long-term (state changes read better than tool jargon), but it is not what was
  asked for, and shipping it as if it were would be quiet non-compliance.
- **C — reverse the ruling.** REFUSED. Cheapest by far and reuses the whole renderer; nobody in the lane has
  standing to reverse a recorded owner law.

**⚠️ NOT reachable by writing `message_variants.toolCalls`.** That column is typed
`readonly ToolCallRecord[]` and is exactly the right SHAPE, which makes it the trap: it is CHAT's column,
read by the existing `message-tool-calls.tsx`, so filling it from rpg is arm C wearing arm A's clothes — it
changes what `MessageView.toolCalls` MEANS for every reader. Arm A needs rpg-owned storage.

#### Arm A — the build (designed 2026-08-07, NOT built; boarded as a follow-up)

Scope is honestly half-day-plus — a `[[new-domain-coupled-sites]]`-class change — which is why it was
designed rather than rushed at the tail of a lane. The blueprint:

1. **Storage (rpg-owned).** A `rpg_turn_tool_calls` row per folded turn, keyed by `variantId` (the
   swipe-correct key — `[[rpg-state-anchor-slots]]`: the snapshot + journal already key there, so a swipe
   surfaces the SELECTED variant's calls with no extra work) + `messageId` + `gameId`. Payload = the same
   projection the flight recorder already builds: name · args verbatim · `applied`/`salvaged`/`dropped`
   verdict · issue paths. Pre-launch ⇒ SQUASH into `0000_baseline.sql`, never an incremental migration.
2. **Write site — exactly one.** `buildFoldTurnToolCalls` (`entry/compose/rpg.ts`) already computes the
   verdicts for its own warn and, since this commit, for the trace: `toTraceCalls` is the projection to
   reuse, so the log, the ring and the durable row cannot disagree about what was lost.
3. **Read.** An rpg verb (`listTurnToolCalls({ chatId, variantId })`), participant-gated through rpg's own
   `guard.ts` — NOT host-only: this is what the model did in a room you are IN. New tRPC proc ⇒ it owes a
   `PROBED`/`EXEMPT` classification row (`[[new-router-needs-sweep-classification]]`).
4. **Surface.** A collapsed-by-default disclosure on the message row, APPLICABILITY-gated (present when the
   variant has calls; absent otherwise) — not a mode and not a setting, per `[[no-separate-reduced-modes]]`.
   §13.10 naming: the trigger's accessible name leads with stable identity (`Tool calls on this turn — N`),
   volatile detail suffixed. A `dropped` call must READ as dropped on the row: this is the surface where
   `SCENE-DROPPED` would have been visible to the owner in the moment instead of after 12 occurrences.
5. **Proof.** A CT mounting a real folded turn's calls (applied + salvaged + dropped in one row, since the
   mixed case is the one worth seeing), plus the persistence + verb tests, plus a composed-real int test
   asserting the write rides the SAME projection as the warn.

Until it lands, the data is reachable by an operator at `/api/_debug/rpg/traces?turnId=…` with
`RPG_TRACE=on`.

*(original report below)*

### TOOLCALLS-INVISIBLE — original report (M 🔴) ✓

**Reporter:** owner (live)

The user cannot see which tools were called on a turn, or with what arguments — not in the transcript, not
in a debug surface. On the `folded` path every turn carries 6 terminal tools, so the majority of what the
model *does* each turn is invisible. Compounds `EMPTYGEN-UNLOGGED`: with the refusal unlogged server-side
and tool calls unrendered client-side, a tool-only completion presents as "it thought for a while and then
errored" with no way to see what actually happened.

**Advice:** render tool calls + args on the row (collapsed by default), or expose them in the RPG panel /
assembly-preview surface. Note `folded` tool calls deliberately land NO `ToolCallRecord` on the variant
(`compose/rpg.ts` — the char turn is tool-less by design), so the transcript genuinely has nothing to read;
the wire seam or the flush is where the data exists.

**Effort:** M

---

### EMPTYGEN-REASONING — reasoning turns fail with "model returned no text" (M ✅ FIXED — RECOVER arm landed)

**Fixed as ruled: RECOVER, don't discard.** `domain/chat/engine/recover-narrative.ts` — on a completion with
ZERO prose whose terminal tool calls landed, the engine re-runs THIS turn ONCE with the tools removed and the
`chat.recovery.narrativeContinuation` prose slot as the trailing user row, then commits pass 2's narrative
carrying **pass 1's `terminalToolCalls`** forward to the rpg flush. The state writes survive; the turn is no
longer thrown away for missing its second half.

Gate is narrow on purpose — prose-less **AND** terminal calls landed. `terminalToolCalls` is read, never
`toolRecords` (a folded turn lands no `ToolCallRecord` by construction, so `toolRecords` is 0 on exactly the
turns that need recovering). A model that returned nothing at all is a provider fault and still fails on ONE
wire call: retrying a dead upstream is how it becomes double the spend. One attempt by construction — the
recovery pass rides tool-less, so it cannot itself produce the trigger shape.

**And the error now names what happened** (`emptyGenerationMessage`): a `length`-shaped finish names the
budget and the lever ("the model used its output limit of 4096 tokens before writing any of the reply — raise
the preset's max output tokens (with reasoning on, that limit covers the model's thinking too)"); a
`tool_calls`-shaped one says the model answered with tool calls and no story text; anything else keeps the
generic string. The single indistinguishable sentence is what cost this project a multi-day misdiagnosis.

**Verified:** 6 new engine tests (`engine.int.test.ts`, 58 pass) proving the commit, the tool-call carry-over
to the rpg flush, the tool-less+ask shape of pass 2 (exactly TWO wire calls, never a loop), the
recovery-also-empty refusal, the no-tool-calls control, and the length-cut message. **Red-first receipt:** run
against `git show HEAD` source, 5 of the 6 fail with real assertions naming the OLD behaviour verbatim
(`the model returned no text — nothing was written`) and zero build errors; the 6th is the no-regression
control that passes both sides. `pnpm typecheck` clean (instrument probed with a deliberate error first).

> ### ⚠️ THE MECHANISM BELOW WAS FALSIFIED — superseded 2026-08-07 by lane DOG-ENGINE, receipts inline
>
> The nuance block's PRIME SUSPECT — "our own idle-timeout treating reasoning SILENCE as a dead stream" —
> **is not the cause, on three independent counts.** The owner's OBSERVATIONS in it are data and stand; the
> explanation of why does not.
>
> 1. **Threshold mismatch.** `infra/providers/backends/kit/idle-timeout.ts:13` — `IDLE_TIMEOUT_MS = 180_000`.
>    Not 15s, not 30s. Swept every call site (`ast-grep -p 'turnAbortSignal($$$A)' -l ts packages`,
>    scannedFileCount=1995, plus a raw `idleMs` grep): FOUR call sites, ZERO overrides — vllm
>    `surfaces/chat.ts:206` passes the constant explicitly, openrouter `chat-completions.ts:176`,
>    openrouter `responses.ts:390` and `custom-byo/runners/chat.ts:370` take the default. No 15s/30s-shaped
>    threshold exists anywhere in the provider or chat path.
> 2. **The timer is not blind to reasoning.** `chat-completions.ts:179` — `onChunk: idle.reset`. It resets on
>    every RECEIVED CHUNK, before any kind-discrimination: reasoning deltas, content deltas and provider
>    keepalive frames all reset it equally. The "reasoning deltas don't count as activity" mechanism does not
>    exist in the code.
> 3. **Wrong error class regardless.** An idle abort surfaces as an AbortError → ProviderError from the
>    runner's catch. It cannot produce "the model returned no text" — that is `CHAT_OP_CODES.emptyGeneration`
>    from `assertGeneratedContent`, and `engine.ts:1018-1020` states in-code that an abort never reaches that
>    guard at all ("the pipeline throws and `executeTurn`'s catch commits nothing").
>
> **What the 14.9s / 15.8s / 30.6s durations actually are: the length of the REASONING PHASE.** Ragged, not
> clustered — the same argument `MAXTOKENS-SUPERSEDED` already makes ("variable, so NOT a timeout") applies
> against the idle theory too. The unified reading, which needs no new mechanism: reasoning streams and the
> client renders it (`delta.kind === "reasoning"` is forwarded at `chat-completions.ts:183`, so the operator
> genuinely SEES text appearing) → the model concludes its tool calls discharge the beat → tool calls emit →
> zero prose → VER-1b refuses → the whole turn is discarded. "Died mid-turn while reasoning, early, suddenly"
> **is the rendered reasoning stream ending.** The doc's ORIGINAL root cause (tool-only completion) was right.
>
> **Corpus note:** `/api/_debug/wire/outcomes` could not confirm it either way — the retained spill
> (`.cache/wire-capture/captures.jsonl`, 348 outcomes) holds 48 real 2026 outcomes, **all `reasoningEffort:
> "none"` with `contentChars > 0`, newest 2026-08-05T07:26Z.** Zero failing turns are recorded: the failures
> predate `WIRE-OUTCOMES` shipping. That absence is itself the argument for having built it.
>
> *(the original ruling + nuance block is preserved verbatim below — the owner's observations are the data)*

### EMPTYGEN-REASONING — the original ruling + nuance block (M 🔴 → RULED) ✓ ROOT-CAUSED

> **OWNER RULED 2026-08-07 (question-tool): option 1 — RECOVER rather than discard.** On a
> prose-less completion whose tool calls parsed: apply the state writes, then issue a short
> continuation for the narrative. Matches the observed tool-calls-land-last ordering. In build
> (lane DOG-ENGINE); EMPTYGEN-UNLOGGED's warn already ships.
>
> **⚠ OWNER NUANCE (2026-08-07): the live failures were MID-TURN deaths — "failing turns mid turn
> while the model was reasoning and it would just all of a sudden end" — on BOTH Gemini and Sonnet 5,
> EARLY in the turn, and NOT the length cap ("wasn't max tokens… we even set max output really
> high").** So the mid-turn class is neither tool-only (no tools called yet) nor budget exhaustion.
> **PRIME SUSPECT, unproven: our own idle-timeout treating reasoning SILENCE as a dead stream.** The
> recorded failure durations — 14.9s / 15.8s / 30.6s — cluster at 15s/30s-shaped thresholds, and a
> model whose reasoning deltas are hidden/sparse on the wire (provider-dependent — exactly what
> varies between Gemini/Sonnet skins) produces exactly that: wire silence during thinking → idle
> timer fires → sudden early death. DIAGNOSIS FIRST for lane DOG-ENGINE: read
> `backends/kit/idle-timeout.ts` (does the timer count reasoning deltas as activity? what are its
> thresholds?), correlate `/api/_debug/wire/outcomes` finishReason/duration on the failing turns,
> and only then fix per class: idle-blind-to-reasoning ⇒ reasoning deltas (and provider keepalives)
> reset the timer + a generous reasoning-phase floor; `tool_calls`-shaped ⇒ the ruled RECOVER path;
> a TRUE `length` cut ⇒ the reasoning-aware reserve. Every arm replaces the generic "returned no
> text" with an error naming what actually happened.

**Reporter:** owner (live) · **Confirmed:** the rendered paragraph was **reasoning text**, not message body

#### Root cause — tool-only completion

The model emits thinking + tool calls and **zero prose**; `assertGeneratedContent` correctly refuses to
commit an empty variant. This is the known open item **VER-1(b)** reproducing live: *"`auto` permits
prose-less completions and the engine has no empty-content guard."*

Why reasoning is the trigger: with `effort: "none"` the model writes prose; with `effort: "medium"` it
deliberates and concludes the tool calls discharge the turn. Matches the observed windows exactly —
`effort: "medium"` failed, `effort: "none"` did not.

#### The design assumption this breaks

`chat-ops/gather.ts:180-182` justifies the folded path with a measured claim: *"the tool DESCRIPTIONS teach
the write surface (measured: a hosted strong model co-emits narrative AND 1–3 strict tool calls on 6/6
turns)."* **That 6/6 was measured with reasoning off.** Reasoning-on invalidates the premise, and folded
attaches 6 tools with `tool_choice: "auto"` on every turn — so the exposure is every reasoning turn on a
folded game, not an edge case.

Compare `foldGuarded` (`compose/rpg.ts:1604`): the local vLLM engine is withheld from folding precisely
because it goes mute under tool attachment (`content: null` on 36/36 tool-attached turns). Hosted+reasoning
is a **second wire class with the same failure mode**, and nothing detects it.

#### Observed ordering (owner, live) — tool calls land LAST

Tool calls are emitted at the **end** of the turn: the pause the owner sees after a message finishes
rendering is the tool-call emission. That is D112's TERMINAL-tools design working as intended, and it
sharpens the failure: the sequence is reasoning → tool calls → *no prose* → `assertGeneratedContent`
throws → **the entire turn is discarded, valid tool calls included.** The state writes were almost
certainly good; they are thrown away with the empty prose. This makes option 1 below the natural fix
rather than a salvage hack.

#### Advice

Options, roughly ordered:

1. **Recover rather than discard** — on a prose-less completion whose tool calls parsed, apply the state
   write and issue a short continuation for the narrative, instead of throwing away the whole turn.
2. **Extend the fold guard** to reasoning-enabled hosted connections (cheapest; costs the fold's benefit).
3. **Re-measure the 6/6 co-emission claim with reasoning on** and let the number decide 1 vs 2. This is the
   honest prerequisite — the current premise is measured, just not under this condition.

Whichever lands, `EMPTYGEN-UNLOGGED` should ship with it, or the next occurrence is equally undiagnosable.

**Effort:** M

---

### MAXTOKENS-SUPERSEDED — earlier `maxOutputTokens` theory, retained as a note (S ⚪) ⚠ NOT THE CAUSE

#### What's observed

With reasoning enabled, `chat.send` / `chat.generate` fail with `the model returned no text — nothing was
written`. Durations 14.9s / 15.8s / 30.6s — variable, so not a fixed timeout. Owner reports **a paragraph
of content renders before the failure**. Owner also suspects markdown/code fences in reasoning as a factor
and reports the 30s case may be a separate issue from the shorter ones.

#### Why the obvious theory does NOT hold

An earlier pass here attributed this to `maxOutputTokens` (4096 on the failing preset) capping
thinking+text together and starving the response. **That is not supported:**

- `assertGeneratedContent` is **zero-content only** — `engine.ts:1019` states *"A PARTIAL generation is real
  content the user may want and commits normally."* Budget exhaustion mid-sentence would COMMIT a partial,
  not refuse it. A rendered paragraph followed by this error is inconsistent with the theory.
- 4096 tokens is ample for a normal reply; the owner rejects the output-length framing.

Leaving the request-shape facts on record without the causal claim: the failing window ran
`reasoning: {"effort":"medium"}`, `max_completion_tokens: 4096`, `tool_choice: "auto"`, 6 tools, `stream: true`
(wire captures, chat `chat_01kz6qesv6fk6bq1gmr8kc0wcf`). Turns at 16:16+ with `effort: "none"` did not fail.

#### The discriminating question (unanswered)

Was the rendered paragraph **reasoning/thinking text** or **message body**?

- **Reasoning** ⇒ the model emitted thinking + tool calls and zero prose ⇒ tool-only completion. This is the
  known open item VER-1(b) (*"`auto` permits prose-less completions and the engine has no empty-content
  guard"*) and the `folded` path attaches 6 tools with `tool_choice: "auto"` on every turn.
- **Message body** ⇒ text existed and was lost between stream and commit ⇒ a distinct and more serious bug.

Resolving this needs `EMPTYGEN-UNLOGGED` fixed first, or a live repro with the response observed.

**Effort:** unknown until root-caused

---

### MAXTOKENS-CAPS-THINKING — `maxOutputTokens` semantics on reasoning wires (S 🔴) ⚠ UNVERIFIED LEAD

**Reporter:** owner (live) · **Evidence:** wire captures, `chat_01kz6qesv6fk6bq1gmr8kc0wcf`

#### What's broken

With reasoning enabled, turns fail with `the model returned no text — nothing was written`
(`chat.send` / `chat.generate`, durations 14.9s–30.6s — variable, so NOT a timeout). Wire captures across
the failing window:

| capture window | `reasoning` | `max_completion_tokens` | outcome |
| - | - | - | - |
| 16:10–16:13 | `{"effort":"medium"}` | **4096** | empty-generation failures |
| 16:16 onward | `{"effort":"none"}` | 4096 | fine |

On Sonnet 5 (and every current reasoning model) `max_completion_tokens` is a hard cap on **thinking +
response text together**. At 4096 with medium effort the model can exhaust the budget mid-reasoning and
emit zero text.

#### Root cause

`packages/contracts/src/preset/index.ts:175-181` — `DEFAULT_MAX_OUTPUT_TOKENS = 2048`, documented as:

> The RESPONSE-LENGTH default (ST `openai_max_tokens`), reserved for the completion… Deliberately a small
> response length… Users tune it per preset; **the exact number isn't load-bearing.**

That comment predates reasoning models and is now **false**. `maxOutputTokens` is not a response-length
knob on a reasoning wire — it is also the thinking budget, and nothing in the reserve path accounts for
that. `assertGeneratedContent` (`domain/chat/engine/engine.ts:1026-1030`) is working correctly: it refuses
to commit an empty variant so the prior reply survives. The error is the guard firing, not the defect.

#### Evidence

- `contracts/src/preset/index.ts:181` — `DEFAULT_MAX_OUTPUT_TOKENS = 2048` + the "not load-bearing" comment
- `domain/chat/engine/engine.ts:1026-1030` — `assertGeneratedContent` throws `CHAT_OP_CODES.emptyGeneration`
- Wire captures above (request bodies only — the ring does **not** record responses, so `stop_reason` on
  the failing turns was NOT observed; budget exhaustion is inferred from the request shape + timing)

#### Advice

1. **Owner workaround:** raise `maxOutputTokens` in the preset. Sonnet 5 supports 128K output; 32K–64K is
   the sane range for a streaming turn with reasoning on. 4096 is a rounding error against medium effort.
2. **Real fix:** when the resolved connection has reasoning enabled, `maxOutputTokens` must reserve
   thinking headroom rather than being treated as response length — either a floor, a derived
   reasoning-aware reserve, or a loud warning when the value is implausible for the effort level.
   The `fitBudget` reserve and the runner's wire `max_tokens` read the same constant, so both move together.
3. Update the `:175-181` comment — it is actively misleading now.

**Ruled out:** the owner's hypothesis that markdown/code fences in reasoning cause it. Not refuted outright
(no response capture), but budget exhaustion explains every observation. Revisit only if it recurs at 64K.

**Effort:** S (workaround XS)

---

### SCENE-DROPPED — every `update_scene` call is discarded; the scene plane never establishes (M ✅ FIXED — salvage + vocabulary)

**Collateral damage FIXED; the vocabulary hole is still open (owner ruling).**

`salvageArgs` in `contracts/src/rpg/extraction.ts` — EXT-4a's drop-as-little-as-possible extended from
undeclared KEYS to invalid VALUES. On a failed parse, retry once with the offending TOP-LEVEL fields removed;
if the remainder parses, it applies. Coarse on purpose (a nested issue drops that whole top-level field, no
schema introspection to drift). Required fields need no special case — removing one cannot parse, so the call
drops exactly as before. **Salvaging everything away is a DROP, not a salvage** (an all-optional schema would
otherwise "rescue" every bad call into an empty no-op patch and report a write that never happened).

Wired into `toolCallsToExtraction` for BOTH arms (scene + the array planes). `malformedToolCallDetails` now
skips a salvaged call so the predicate keeps mirroring the fold — the file's own no-drift rule.

New third loss class: `salvagedToolCallFields` → logged as `salvagedFields`, e.g. `update_scene.weather`.
That is a closed enum announcing it has a hole in it.

Measured on the real failing shape:

```
scene applied: {"location":"Throne Room","timeOfDay":"afternoon","recentEvent":"Nate arrived"}
malformed: []            salvaged fields: ["update_scene.weather"]
required-field failure still drops: ["update_party"]   salvaged: []
```

**Verified:** typecheck clean · `pnpm check` PASS · 229 contract/compose tests pass with their ORIGINAL
expectations unchanged (the tightened empty-remainder rule is why — a good sign the semantic is right).

**✅ VOCABULARY HOLE CLOSED 2026-08-07 (lane DOG-ENGINE, owner ladder).** `WEATHER_TYPES` gains `indoors` —
the exact token the live model reached for, on both failing chats. Homed in `@orb/kit/weather` (the ONE axis
home, D54), so it reaches the tool schema, the projected/xgrammar-visible schema, the extraction prompt, the
scene tab and the ambient strip by identity — no second spelling anywhere.

It is **not a ninth kind of sky**: it is "no sky is visible from here", which is a fact ABOUT the sky and so
belongs on this axis rather than in `location`. The extraction prompt was edited in the same commit to match —
it previously told the model *"weather is the WORLD'S weather: the sky, never the room… OMIT weather rather
than forcing the nearest"*, which would have made `indoors` **a member the model is instructed never to use.**
Both prompt sites now name the third case (enclosed-with-no-sky is WRITABLE) while keeping the omit rule for a
genuinely unnameable sky — two different states the copy must not collapse. `dusk` stays excluded from
`TIME_OF_DAY` (standing taste ruling): that one is a near-synonym of `evening`, a different problem from a
state the vocabulary cannot express at all.

**Waystone coupled site (⚠ a visual decision the owner may want to retune):** `WEATHER_RECIPES` is an
exhaustive Record, so the widening forced a ninth air-layer recipe. `indoors` paints **no** air layers (clouds
/ particles / bands would assert weather nobody in the fiction can observe), the heaviest wash in the table,
and `celestialOpacity: 0.1` — deliberately not `0`, because the HOUR is still true indoors and the dial's
primary job does not stop at a door.

**Receipt — the symptom dying, at the seam that produced it** (`extraction.contract.test.ts`): the verbatim
live payload `{location:"Throne Room", timeOfDay:"afternoon", recentEvent:"Nate arrived",
weather:{type:"indoors", label:"dim infernal ambiance"}}` now returns `salvagedFields: []` and
`malformedToolCalls: []`, and the whole call applies including both halves of the weather. The same test pins
that salvage still WORKS (`{type:"sideways"}` still drops field-wise, not call-wise) — widening a vocabulary
must not be mistaken for loosening a grammar.

**Verified:** `pnpm typecheck` clean · contracts rpg 72 + ambient 10 + waystone 18 pass. The waystone suite's
two "all eight weathers" invariants were AMENDED, not weakened: `clear` and `indoors` are now a named
`DECKLESS_WEATHERS` pair (deckless for OPPOSITE reasons — unveiled vs occluded sky), the per-member cloud
signature is asserted over the decked members, and `indoors` gains direct assertions on the two axes that
actually carry its 64px read (heaviest wash, dimmest surviving celestial).

**⚠ LIVE RECEIPT OWED — structurally unavailable from a lane.** The doc asked for the symptom dying on a live
indoor-scene turn; the dev stack runs the MAIN tree, so it cannot exercise a worktree's widening. Fire one
indoor-scene turn after merge and confirm `salvagedFields` no longer names `update_scene.weather`.

**Gate/test — ✅ BOTH HALVES NOW LIVE** (`tests/contracts/rpg/extraction.contract.test.ts`). Lane DOG-VERIFY
wrote the property pair: "every `RPG_WEATHER_TYPES` member (as imported) parses through the write schema"
(write ⊆ render — always holds), plus a `test.todo` FAILING-PIN for the REVERSE direction (indoor render vs
write) declared to flip green when this lane landed `"indoors"`. **It has been flipped from `todo` to a live
test and it passes** — that pin is the cleanest statement of what was broken: the reminder could RENDER an
indoor scene the tool schema could not WRITE. The sibling's salvage pin ("an invalid OPTIONAL field costs only
that field, not the whole call") stays green alongside it.

The general class — every closed enum reachable from a tool arg can express what the reminder can RENDER — is
now pinned for WEATHER specifically. Generalizing it across every `RPG_*` enum is still owed.

*(original report below)*

### SCENE-DROPPED — original report (M 🔴) ✓

**Reporter:** owner (live) · **Evidence:** 12/12 drops in `prod.log`; wire captures; schema probe

#### What's broken

`rpg.extraction.unparseable · droppedTools: ["update_scene"]` — **12 occurrences, 12 for 12, two different
chats, both server sessions, always and only `update_scene`.** On the Charlotte chat the consequence is
visible in every wire capture:

| reminder block | present? | rides |
| - | - | - |
| `Party:` / `carrying:` / `conditions:` | yes, every turn | `update_party`, `update_inventory` |
| `Scene:` | **never** | `update_scene` |
| `Recent beats:` | **never** | `update_scene` (`recentEvent`) |

Same turns, same call batch: the other tools land, this one always dies. So it is not the wire, not JSON
parsing, not model competence — it is this tool's schema. **One invalid optional field discards the whole
call**, taking `location`, `timeOfDay`, `weather`, `presentUpsert`/`presentRemove`, `plot` **and
`recentEvent`** with it. That is why the game has no scene AND no recent-beats block.

#### Root cause (candidate fields — both confirmed rejecting, actual payload not captured)

`contracts/src/rpg/tools.ts:87-90` — `weather.type: z.enum(RPG_WEATHER_TYPES)` =
`clear|cloudy|rain|storm|snow|fog|wind|ash`. **Every member is outdoor weather; there is no interior
value.** Both live scenes are indoors (a castle throne room, a room with a window), so the model has no
legal value to send. The strain is visible in what DID get stored: `label: "unclear, indoors — dim infernal
ambiance"` on one chat, and `"watching the storm roll in through the window"` pushed into a free-text party
status on the other — the model routing weather through prose because the structured path keeps being
thrown away.

Second candidate, same shape: `timeOfDay: z.enum(TIME_OF_DAY)` deliberately excludes `dusk`
(`ambient.ts:69-76`, owner ruling) — a word models reach for constantly.

Probe (`updateSceneArgsSchema.safeParse`) confirming both reject:

```
FAIL weather type indoors -> weather.type: Invalid option: expected one of "clear"|…|"ash"
FAIL timeOfDay dusk       -> timeOfDay: Invalid option: expected one of "dawn"|…|"midnight"
```

#### The design contradiction

`compose/rpg.ts:748-755` documents the posture this violates: `z.strictObject` was rejected **because**
"it would have cost the whole call, against EXT-4a's drop-as-little-as-possible." An invalid enum *value*
does exactly the thing the design refused to do for an undeclared *key*. The salvage precedent already
exists (`strippedToolCallKeys` drops the offending key and applies the rest) — it just does not cover
invalid values.

#### Advice

1. **Widen the vocabulary** (owner ruling, same class as the `dusk` decision): add an interior/none weather
   member, or let `type` fall back to `label` when it does not match. An enum the fiction cannot land inside
   is a write surface with a hole in it.
2. **Per-field salvage:** on an invalid OPTIONAL field, drop that field and apply the rest. `location` and
   `recentEvent` must not die because `weather` was wrong.
3. ✅ **DONE — diagnose it in one line.** `malformedToolCalls` returned names only, discarding
   `r.error.issues`; see `TOOLDROP-BLIND` below.

**Gate/test to write:** a property test that every `RPG_*` closed enum reachable from a tool arg can express
the states the reminder can RENDER (an indoor scene renders, so an indoor scene must be writable); and a
unit test that an invalid optional field costs only that field, not the call.

**Effort:** S (salvage) + owner ruling (vocabulary)

---

### TOOLDROP-BLIND — the drop detector discarded the reason (S ✅ FIXED)

**Fixed:** `contracts/src/rpg/extraction.ts` — `malformedToolCalls` ran `schema.safeParse(args)` and returned
**names only**, so the warn could never say WHY. 12 identical `update_scene` drops cost hours before a
hand-written schema probe found the field.

Added `malformedToolCallDetails` (+ `RpgMalformedToolCall`) returning the failing path, the expectation, and
**the value the model actually sent**; `malformedToolCalls` is now `.map`ped off it so the two cannot drift
(the file's own ONE-home rule). `compose/rpg.ts` logs it as `droppedIssues`. Output:

```
update_scene.weather.type: Invalid option: expected one of "clear"|… — sent "indoors"
update_scene.arguments: not valid JSON
```

**Verified:** typecheck clean; `pnpm check` green; `tests/contracts/rpg/extraction.contract.test.ts` +
`tests/server/entry/compose/rpg.int.test.ts` 125 passed (the names contract is unchanged).

**Gate/test to write:** ✅ `tests/contracts/rpg/extraction.contract.test.ts` — "TOOLDROP-BLIND: droppedIssues
names the field, the reason, and the value the model SENT" + "TOOLDROP-BLIND: non-JSON arguments carry their
own single issue, not a field path".

---

## ═══ RPG / Engine Gaps ═══

### EXTRACT-BUDGET-DEAD — Extraction Depth + Window knobs dead under folded mode (M ✅ FIXED — option 1)

**Fixed, option 1.** `extractionContext` + `extractionWindowTokens` are APPLICABILITY-omitted when
`extractionMode === "folded"` (`features/rpg/components/rpg-host-scalars.tsx`). **`reconcileEveryBeats` stays
visible** — it gates `FOLDED_RECONCILE_NOTE` and works, exactly as the row insists.

Re-verified on today's tree, not taken on faith: `buildFoldedTurnBuilder` (`entry/compose/rpg.ts`) reads
`config.trackers` and nothing else, and `buildExtractionUserPrompt`'s callers (`buildRunExtraction`,
`buildRunToolRound`, `buildRunResyncExtraction`) are all non-folded.

The section's GLOSS swaps too rather than leaving a header over one control: on the folded arm it says the state
calls ride the turn the model is already writing, so there is no window to size — an empty-looking section with
false copy above it would have been the same lie in a smaller font.

**Reporter:** investigation · **Scout:** 303 files scanned

#### What's broken

UI exposes extraction depth and window budget controls described as governing folded mode economics.
Both knobs are ignored when folded. The UI copy is false advertising.

#### Root cause

`buildFoldedTurnBuilder` reads only `config.trackers`. `buildExtractionUserPrompt`'s 3 callers
are all non-folded. Note: `reconcileEveryBeats` in the same section IS live.

#### Evidence

- `entry/compose/rpg.ts:1064` — `buildFoldedTurnBuilder` — reads trackers only
- `entry/compose/rpg.ts:373` — `buildExtractionUserPrompt` — 3 callers, all non-folded:
  - `:642` `buildRunExtraction`, `:990` `buildRunToolRound`, `:1239` `buildRunResyncExtraction`
- `entry/compose/rpg.ts:1077` — `foldTurnToolCalls` — does not call `buildExtractionUserPrompt`

#### Advice

Option 1 (cheap, honest): hide the `extractionContext` and `extractionWindowTokens` fields in the UI when `extractionMode === "folded"` (in `packages/client/src/features/rpg/components/rpg-host-scalars.tsx`), because folded mode has no separate window size. **Crucial:** leave `reconcileEveryBeats` visible, as that setting STILL WORKS in folded mode (it gates the `FOLDED_RECONCILE_NOTE`).
Option 2 (correct): wire the context knobs into `buildFoldedTurnBuilder` so it limits the transcript it mounts tools onto. Non-trivial.

Recommend option 1 immediately; option 2 as a future enhancement.

**Effort:** XS (hide UI) or L (wire the path)

---

### RUNTIME-VARS-DEAD — `runtimeVariables` UI controls are dead ends (M ⚪ PREMISE FALSE ON THIS TREE) ✓

**REFUSED WITH A RECEIPT — the row's premise does not hold on today's tree, so there is nothing to wire.**

The row says *"Chat carries `prompt/tense/narration/length/guidelines`. UI allows setting them."* Those five
names **do not exist anywhere in `packages/`** (literal sweep; the only `tense` hits are the greeting-studio's
transform AXIS and a discovery TONE word, and every `guidelines` hit is the preset `rating-guidelines` section).
There is no fixed five-variable set to reference from a template.

What the cited evidence actually is:

- `chat/substrate/runtime-variables.ts` is the **`{{setvar}}` fold** — the deterministic replay of each message's
  `variable_delta`. Its keys are whatever the story wrote, not a fixed vocabulary.
- `assemble-gather.ts`'s `mergedVariables` is `resolveChoiceVariables(promptConfig.variables, …)` ⊕ that fold —
  i.e. the PRESET-DECLARED **ChoiceBlock** names, which a preset author picks.

**And that plane is NOT unconsumed.** `{{getvar::X}}` is registered (`kit/src/macro/registry.ts:646`), and
`kit/src/macro/evaluator.ts:125-134` additionally resolves a bare `{{NAME}}` straight out of `ctx.env`
case-insensitively — *"this is what makes a ChoiceBlock variable named POV usable as `{{POV}}`"*. The room answers
those knobs in the Picks pane (`chat.getVariablePicks`/`chat.setVariables`), and the preset section reads them.
The infrastructure has consumers; what it has no consumer for is a five-name vocabulary that was never built.

**Owed if the capability is still wanted:** an owner decision on whether those five are a REAL feature (a fixed
per-chat prose-control set), which would be a new design, not a template edit.

**Reporter:** investigation · **Scout:** 303 files scanned

#### What's broken

Chat carries `prompt/tense/narration/length/guidelines`. UI allows setting them. None reach any
RPG extraction prompt or preset section. The controls do nothing.

#### Root cause

Variables reach `ctx.variableValues` via `assemble-gather.ts:318`. But no preset section template
references `{{getvar::tense}}` etc., and neither `buildExtractionUserPrompt` nor `buildLiteReminder`
read them. Infrastructure wired; consumers don't exist.

#### Evidence

- `chat/substrate/runtime-variables.ts:35` — stored in DB ✓
- `assemble-gather.ts:318` — in macro env ✓
- `domain/rpg/substrate/reminder.ts:475` — `buildLiteReminder` — no runtime var consumption
- `contracts/src/preset/index.ts` — no `{{getvar::...}}` macros for these vars

#### Advice

Macro syntax confirmed: `{{getvar::X}}` — same system as `{{char}}`, `{{input}}` etc., registered
in `@orb/kit/macro` (`kit/src/macro/registry.ts`). Real example: `prose.ts:23` uses `{{char}}`
and `{{input}}` in `preset.guided.opening`.

The runtime variables (`prompt`/`tense`/`narration`/`length`/`guidelines`) reach `ctx.variableValues`
via `assemble-gather.ts:318`. Add them to the relevant preset section templates:

```
{{getvar::tense}}  {{getvar::narration}}  {{getvar::length}}  etc.
```

**Confirm the exact key names first** — the variable keys in `ctx.variableValues` come from the chat
record's `runtimeVariables`; verify the stored key names match what you'd write in the template
before shipping. One preset section with a `{{getvar::tense}}` reference and a test chat with
`tense` set will confirm it in under 5 minutes.

No code change needed if keys match — pure preset template edit.

**Effort:** XS (preset template) or S (direct injection)

---

### RPG-TRACE-DEAD — `RPG_TRACE` is scaffolding only (S ✅ FIXED — R-OBS ported + wired end to end)

**The shell now has a recorder behind it.** `domain/rpg/trace.ts` (the bounded per-process ring) +
`domain/rpg/contract/trace.ts` (the event shapes), ported from `legacy-main:43d5169fd` hunk-by-hunk and
RE-CUT to today's tree; `createServices` mints ONE when tracing is on and threads its `sink` through
`RpgComposeDeps.trace`; `lifecycle.ts` hands the read half to `createApp`, which registers
`/api/_debug/rpg/traces` only when it exists (the route's own pre-existing contract).

**Four phases, chosen for today's failure classes rather than the legacy tree's:**

| phase | answers | carries |
| - | - | - |
| `mount` | what the turn was ABLE to write | the terminal tool names (R1) |
| `tool` | what the model CALLED and what survived the schema | args VERBATIM + a per-call `applied`/`salvaged`/`dropped` verdict + the failing paths |
| `flush` | which delivery vehicle actually ran | `path` + `fallbackReason` (R1) |
| `bus` | what reached the live panel | the event type |

The legacy `staging`/`domain-event` phases were DROPPED (their boundary no longer decides anything —
today's flush is one `writeFlush` with its own backstop) and `flush` replaces them. The `tool` phase gained
the verdict + raw args specifically because of `SCENE-DROPPED`/`TOOLDROP-BLIND` above: a trace that recorded
only successes would have been blind to all 12 of those drops.

`mount`/`tool`/`flush` join on one `ChatTurnId` — the `?turnId=` filter the route already exposed. A
`mount`/`bus` event carries none and is EXCLUDED from a turn-filtered read rather than silently matched
(pinned, because "show me this turn" quietly answering with another turn's evidence is worse than nothing).

**OFF is byte-identical**, not merely cheap: every emit site is `deps.trace?.(…)` and an optional CALL
short-circuits its ARGUMENT, so an untraced turn never constructs an event object. Pinned by an untraced
composed-real turn landing identical state.

⚠️ **Brief-premise correction:** it is `RPG_TRACE=on`, **not** `RPG_TRACE=true` — the env schema is
`z.enum(["on","off"])`, so `true` fails the parse at boot. The env default-off pin
(`tests/server/foundation/env/index.test.ts`) is unchanged and green.

**Verified:** `pnpm typecheck` · `typecheck:graph` · `typecheck:tests-dom` all 0 · `check:structure` PASS ·
`check-gates.int` 3/3 · knip 0 · depcruise 0 (2,772 modules) · 730 tests over rpg + observability + env +
compose + app, incl. the composed-real "a folded turn records its mount, its calls, its flush path and its
bus emits" (real db, real chat ops, real fold — the recorder sees a real dropped call with its raw args) and
a route-level test driving the REAL recorder end to end (the stub-only coverage was the original gap).

**Gate/test to write:** none owed — the two-sided arm is covered (route absent when unwired / 200 with real
content when wired) and the `feature-structure` allowlist row for `rpg/trace.ts` came back WITH the file
(that row was one of the four the gate's own stale-arm catch deleted in the purge — the two-sided rule
working in both directions).

*(original report below)*

### RPG-TRACE-DEAD — original report (S 🔴) ✓

**Reporter:** investigation · **Scout:** 303 files scanned

#### What's broken

`RPG_TRACE=true` does nothing. Debug route 404s. Inspector never registered.

#### Root cause

`R-OBS` was built on legacy-main (`43d5169fd`) and purged in the rebuild. Shell only survived.

#### Evidence

- `foundation/env/index.ts:157` — declared
- `entry/compose/services.ts:169` — `ServicesDeps.rpgTrace` declared, unwired everywhere
- `foundation/observability/debug/routes.ts:285` — route skipped (`rpgTrace === undefined`)
- `routes.ts:128` — `RpgTraceInspector` — never implemented or registered

#### Advice

Port is \~195 lines plus re-siting emit calls. Worth doing alongside RPG-NO-PROMPT-DEBUG.
Sequence: prompt debug view first (immediate diagnostic value), trace system second.

**Effort:** L

---

### RPG-NO-PROMPT-DEBUG — no prompt order/depth debug view (L ✅ FIXED — the delivered wire rows)

**⚠️ ROW TRUTH-REPAIRED 2026-08-07. "No prompt debug view" was STALE and mis-aimed a lane.** A host-gated
prompt debug panel already existed and already leveraged both verbs:

- `client/features/chat/components/assembly-preview-panel.tsx` — the CONTEXT panel's **Preview** tab
  (`useSuspenseQueries` over `chat.previewAssembly` + `chat.getShapeTrace`, both `requireHost`).
- `client/features/chat/components/assembly-preview-diagnostics.tsx` — the collapsed **Diagnostics** drawer:
  the BUILD trace (static/dynamic section ORDER, world-info activated, per-field override sources), the
  in-history injections **with role @ depth**, and the SHAPE trace.
- 13 CTs already covering it.

**The real gap was narrower and sharper: the ORDERED DELIVERED WIRE ROWS.** `ShapeTrace` is content-free by
design (PD-132) and projected **stage COUNTS only** (`10 → 11 → 9 → 9`) — so the one thing a host could not
see was *which* row is which, in what order, in whose voice. That is exactly what was being reconstructed by
hand from wire captures.

#### The fix

`ShapeTrace.rows` — a content-free ordered projection of the DELIVERED wire history, one entry per row:
`role` · `name` (the speaker, when the row carries one) · `source` · `chars`. Rendered in the existing
Diagnostics drawer as `Wire rows — N delivered`, each line `<n>. <role> · <speaker>` with
`<provenance> · <n> chars`. No new verb, no new route, no new panel mount — it rides the reads and the host
gate that already existed.

Two calls worth knowing:

- **The non-canon arm is `assembled`, not "injected".** The id-less rows are not all injections: the
  group/continuation nudge and the synthetic user turn a regen/continue appends are id-less too. Naming the
  arm after one of its three producers would be a surface that lies about the other two.
- **There is a third arm, `merged`, and it is the point.** The squash keeps the FIRST row's extras, so an
  injection folded into the player's canon turn would otherwise have reported as plain `canon` — hiding the
  exact row worth seeing. `assembly/role-squash.ts` now exports `squashRuns` (the adjacency rule, ONE home —
  `squashSameRole` is that plus the content join) and SHAPE walks the same runs, so a mixed row reports
  `merged` provably rather than by guess.

**This is the lens `INJECT-NAMED-AS-PLAYER` lived behind.** A demoted system note delivered in the player's
voice is invisible in a stage count; here it is a `user` row wearing the player's name with `assembled` (or
`merged`) provenance. Pinned by name in `tests/server/domain/chat/assembly/shape.test.ts`.

Note the rows are **pre-FIT** (SHAPE runs before the context trim) — the surface says so rather than
implying the window kept them all.

**Verified:** RED-first (2 failing / 13 passing against unmodified source) → 15/15 CT
(`tests/client/features/chat/components/assembly-preview-panel.ct.tsx`) · 5 new SHAPE tests · 674 tests over
assembly + `verbs/read.int` + the chat router + the engine pipeline · all three typecheck programs 0.

**Effort:** was M — the panel existed; the projection was S.

---

## ═══ RPG / Stats ═══

### RPG-STAT-ENTRY-REVERTS — manual stat values revert to 1 on blur (M ✅ FIXED)

**Fixed with an `optimistic` block on `usePatchSheet` through the house `createEntityMutation` factory** — no raw
`onMutate`, exactly as advised. The cell re-renders from the CACHE on blur, so the write lands in the paint that
closes edit mode instead of a round-trip later.

**Two corrections to the advice, both load-bearing:**

1. `readKey` takes a query **KEY**, not a `queryFilter` (the factory snapshots and restores exactly that entry so
   a rejected write rolls the cell back) — the snippet said `queryFilter`.
2. The tracker view has **no `old.actor`** — it is `old.actors[]`, keyed by `actorRefKey(actorRef)`. The update
   maps the one named actor.

**Widened deliberately:** the patch applies EVERY sheet field (`className`/`flavor`/`level`/`trackerGrants`/
`trackerRevokes`, attributes MERGED key-wise), not just `attributes`. Those are the same click-to-edit gesture
against the same stale read; covering one would have left the defect alive under the other four controls.

**Gotcha for the next reader:** the client's tsc program infers `patchSheet`'s `actorRef` ids as `unknown`
through `inferInput` (transform-backed TypeIDs; the graph program resolves them fine — the two programs
genuinely disagree). `wireActorRefKey` re-brands via `castId(String(…))` and delegates to the ONE `actorRefKey`
projection rather than growing a second key home.

**Reporter:** owner · **Scout:** 306 files scanned

#### What's broken

Type `20` into a stat field, click into another stat — first reverts to **1**. Hand-authored
sheets cannot be filled in.

#### Root cause

The stat input reads `actor.sheet.attributes[key] ?? profile.range.min` (default: 1) as its
controlled value. On blur, `patchSheet` fires via `writeHandState` — but the component closes
edit mode and re-renders from the stale server state BEFORE the mutation propagates. The field
flashes the edited value, then snaps back to the server value (or the range min if the key is
absent). Reverting to exactly `1` confirms the `?? profile.range.min` default is what wins.

#### Evidence

- `rpg-character-detail.tsx:204,208` — `AttributeGrid` reads `actor.sheet.attributes[def.key] ?? profile.range.min`
- `tracker-value.tsx:66-145` — input reads from local `draft` state; `onBlur` invokes `patchSheet`
- `rpg-character-detail.tsx:367` — `patchSheet` → `writeHandState`
- `snapshot-edit.ts:116` — `writeHandState` writes server state
- On blur: component closes edit mode → re-renders from stale `actor.sheet.attributes` before mutation returns

#### Advice

Use the project's **`createEntityMutation` optimistic block** — the same pattern already used by
`useUpdateCharacter` (`character/hooks/use-character-mutations.ts:35-54`) and `useSetUserMacroValues`
(`chat/hooks/use-context-panel-mutations.ts:74-87`). Do NOT reach for raw `onMutate`.

**Fix:** add an `optimistic` block to `usePatchSheet` (`features/rpg/hooks/use-rpg-mutations.ts:44`):

```ts
optimistic: {
  readKey: (trpc, vars) => trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId }),
  update: (old, vars) => ({
    ...old,
    actor: {
      ...old.actor,
      sheet: {
        ...old.actor.sheet,
        attributes: { ...old.actor.sheet.attributes, ...vars.patch.attributes },
      },
    },
  }),
}
```

`createEntityMutation` bakes in the full 4-phase TanStack flow (`cancelQueries` → snapshot →
`setQueryData` → rollback on error). `onSettled` already invalidates `trpc.rpg.getTrackerView`
so the server value settles correctly after the mutation. No changes needed in `tracker-value.tsx`
or `rpg-character-detail.tsx` — the display value will reflect the optimistic write immediately
on blur.

**Effort:** S — one `optimistic` block in `use-rpg-mutations.ts`

---

## ═══ Server / Lifecycle / Observability ═══

### DRAIN-UNBOUNDED — one open browser tab could hold a shutdown indefinitely (M ✅ FIXED)

**Reporter:** owner + investigation · **Measured:** a prod shutdown stalled **\~6 minutes** on a single
connection (17:13:20 → 17:19:12), released only when the tab happened to reconnect.

#### What was broken

`entry/lifecycle.ts` shutdown called `server.close(cb)` and awaited it. `close()` stops accepting new
connections and then waits for **every existing connection to end** — and the app's own SSE stream never
ends. So the connection the app depends on for live updates is exactly the one that blocks its own deploy.
No deadline existed anywhere. Confirmed live: a single `ESTAB` socket from the Caddy container
(`ss -tnp` → `fd=39`) with the process parked in `shutdown: draining`.

A client must not be able to hold a deploy hostage.

#### Fix

`drainHttpServer` — bounded drain:

1. `close()` (stop accepting),
2. `closeIdleConnections()` immediately — keep-alive sockets with nothing in flight, no reason to wait,
3. race the close against `SHUTDOWN_DRAIN_MS` (10s), and on deadline `closeAllConnections()` so `close()`
   can settle. The force logs a **warn** naming the deadline, because that is precisely the case where a
   client saw a truncated stream.

`ServerType` is a union including the http2 servers, which do not carry those two methods — hence a
`connectionCloser()` capability probe rather than a cast; absent, the drain degrades to the old unbounded
wait (honest: there is no supported way to force those sockets from here).

**Verified:** typecheck clean. Fast path (0 open connections) shuts down in **1s**, no regression.
✅ **The forced path was subsequently PROVED in production** — a real shutdown with a held-open SSE
stream released at the deadline instead of hanging:

```
18:01:56.032  shutdown: draining
18:02:06.034  drain deadline hit — force-closing remaining connections   ← 10.002s
18:02:06.044  shutdown: complete
```

(An earlier attempt with a *synthetic* socket failed to reproduce — the server closed it before the
deadline. The live SSE stream is what actually holds it.)

**Gate/test to write:** ✅ `tests/server/entry/lifecycle.test.ts` — "a held-open stream (an in-flight
response that never ends) is force-closed at the deadline, and the warn fires". `drainHttpServer` is now an
exported function (`entry/lifecycle.ts`, `drainMs` param) so the test drives it directly against a real open
socket instead of only being provable live. **The earlier synthetic-socket miss above is explained**: a raw
socket that never SENDS a request is `closeIdleConnections()`'s idle case and gets dropped immediately — the
reproduction needs a request actually IN FLIGHT (the server writes a response head + a chunk and never
`.end()`s), which is what an SSE stream is and what the new test does.

**Effort:** done (test owed)

---

### WIRE-OUTCOMES — the wire ring recorded requests only; responses were invisible (M ✅ FIXED)

**Why it mattered:** with request-only capture, a prose-less turn, a tool-terminated turn and a provider
that returned nothing are indistinguishable after the fact. It produced a wrong root cause during this
session (see `MAXTOKENS-SUPERSEDED`) — inferring from request shape is exactly the failure mode.

**Added** (`foundation/observability/debug/wire-capture.ts`):

- `recordTurnOutcome` + `recentTurnOutcomes` + `GET /api/_debug/wire/outcomes` — finish/stop reason, token
  counts, reasoning + content LENGTHS, and **tool-call names with raw args** (raw, because the malformed
  cases are the ones worth seeing and those do not parse). Metadata only, never reply text.
- ONE call site: `engine.ts` `captureTurnOutcome`, after the pipeline resolves and **before** the
  empty-generation guard, so a REFUSED turn still leaves the record explaining it. Deliberately not threaded
  through the five per-surface `captureWire` sinks — those fire at SEND time, so an outcome there would mean
  pre/post correlation in every runner for data the engine already holds.
- **Spill to disk** — both arms append to `.cache/wire-capture/captures.jsonl`, size-capped at 32 MiB with
  one rotation (64 MiB ceiling), best-effort (a spill failure never touches the request path). The ring is
  256 slots and in-memory; a restart previously erased exactly the evidence being chased. It did.

**Known gating asymmetry (documented in the file):** the request sink is compose-injected (env OR the
`wireCapture` force flag); the outcome arm self-gates on `isWireCaptureEnabled()` since it has no compose
seam. An int test forcing capture via the flag records requests but NOT outcomes — set `WIRE_CAPTURE=on`.

**Verified:** typecheck clean; `pnpm check` green; engine + foundation 366 passed; both routes return 200
live; spill file written.

**Gate/test to write:** ✅ `tests/server/foundation/observability/debug/wire-capture.suite.test.ts` —
"with capture ON: an outcome is recorded for a REFUSED (zero-content) turn and reads back" + "GATING
ASYMMETRY: with capture OFF, recordTurnOutcome self-gates to a no-op — recordWireCapture does NOT (compose
decides)" + "spill rotates at the byte cap: exceeding it renames the current file before the next append"
(mocked `node:fs/promises` — writing 32 MiB for real would be slow/brittle).

---

### ENV-BLEEDS-INTO-TESTS — the repo `.env` makes `pnpm test` show false reds on an operator machine (M ✅ FIXED)

**Fixed via option 1 below — the file load itself is skipped under test, not patched per-test.**
`foundation/env/index.ts` `loadEnvFileWithOverride` early-returns when `ORB_ENV_NO_FILE` is set, and
`vitest.config.ts` sets `ORB_ENV_NO_FILE: "1"` in the global `env:` block. Tests now see only what they
set; **production env loading is byte-unchanged** (the new gate is a separate variable from the existing
`ORB_ENV_NO_OVERRIDE`, so no prod path changed behaviour).

Chosen over option 2 deliberately: option 2 is correct but must be re-applied by every future test author
forever, which is how this class recurs. Option 1 removes the divergence by construction.

**Verified:** the 3 failures below pass with the operator's live `AUTH_MODE=oidc` still armed —
`tests/server/foundation` 139 pass, `tests/server/entry/app.test.ts` 20/20.

**Gate/test to write:** ✅ `tests/server/foundation/env/index.test.ts` — "ORB\_ENV\_NO\_FILE skips the .env load
ENTIRELY — a real file's values never reach env, even unset keys" (pins the MECHANISM directly, a real `.env`
file that would otherwise fill several keys) + "ORB\_ENV\_NO\_FILE is what `pnpm test` actually runs under…"
(asserts the real `vitest.config.ts` global `env:` block, so a future revert of that block goes red here). A
mechanical "no test reads an operator var" sweep is not definable — any test may legally read `env.<X>`, that
is what the module is for; the honest, load-bearing arm is that the gate making the operator's ambient env
irrelevant is actually armed for every test process, which these two pin directly.

*(original report below)*

### ENV-BLEEDS-INTO-TESTS — original report (M 🔴)

**Broader than the wire-capture case below — that was one instance of a class.** The env module loads the
repo `.env` before parsing, and under VITEST it does not override already-set vars but DOES fill unset ones.
So every test asserting a schema default silently asserts *the operator's local configuration* instead.

**Measured on a full-suite run (10,089 tests): 3 failures, all of them this.** None touched by the session's
changes — `git status` clean on `entry/app.ts` and `infra/auth/`:

| failing test | asserts | what `.env` supplies |
| - | - | - |
| `entry/app.test.ts` → auth config projection | `mode: "single-user"` | `AUTH_MODE=oidc` |
| `entry/app.test.ts` → `/join/:token` 404 | 404 (not multi-human capable) | oidc ⇒ capable ⇒ 302 |
| `infra/auth/config.test.ts` → jwksAllowlist | `[]` fail-closed | `OIDC_ISSUER` ⇒ `["authentik.inktomi.tech"]` |

**Proof, not inference:** `AUTH_MODE=single-user pnpm vitest run tests/server/entry/app.test.ts` → **20/20
pass**. The tests are correct; the ambient environment is the variable.

**Why it matters more than the count suggests:** a red that is not a regression trains everyone to discount
reds. It already cost this session real time twice — once on wire-capture, once here — and it means the
battery's verdict is not reproducible between a clean checkout and a working machine.

#### Advice

Pick one, repo-wide:

1. **Don't load `.env` under test** (`VITEST` already gates the override arm — extend it to skip the file
   load entirely). Cleanest: tests then see only what they set.
2. Or make every default-asserting test use the cwd-isolated `reimportEnvWith({})` harness that already
   exists in `tests/server/foundation/env/index.test.ts` — correct but must be applied per test forever.

(1) is the fix; (2) is what the wire-capture entry below did as a local patch.

**Gate/test to write:** the battery should be reproducible — a CI-vs-local divergence check, or simply
option 1 which removes the divergence by construction.

**Effort:** S

---

### WIRECAPTURE-ENV-FAILS-TESTS — `WIRE_CAPTURE=on` in `.env` makes a unit test fail (S ✅ FIXED — one instance of ENV-BLEEDS-INTO-TESTS above)

**Fixed by splitting the two claims that were tangled in one assertion.**

- `tests/.../debug/wire-capture.test.ts` asserted a bare `toBe(false)` on the ambient `env`, so a local
  `.env` flipped it red. Now asserts the **relationship** — `isWireCaptureEnabled() === (env.WIRE_CAPTURE === "on")`
  — which is the part that unit test can honestly own.
- The real prod-safety claim (**default off**) moved to `tests/server/foundation/env/index.test.ts`, which
  already has a cwd-isolated re-import harness (`reimportEnvWith({})` against an empty env in an empty dir).
  Covers `WIRE_CAPTURE`, `RPG_TRACE`, and `DEBUG_TOKEN` together — a default silently flipped to `on` would
  ship capture into prod, so it is pinned where no local file can mask it.

Deliberately did **not** invent an env-module export just to satisfy a test.

**Verified:** `tests/server/foundation` 113 pass with flags OFF *and* with `WIRE_CAPTURE=on RPG_TRACE=on`
armed — the exact false-red is gone and the guarantee is stronger than before.

*(original report below)*

### WIRECAPTURE-ENV-FAILS-TESTS — original report (S 🔴)

`tests/server/foundation/observability/debug/wire-capture.test.ts` asserts `isWireCaptureEnabled() === false`
("env default is off under the test env"), but the test env loads `.env` — so **while the debug flags are
armed, `pnpm test` shows a false red that looks like a code regression.** Cost real confusion during this
session before being traced to the flag rather than the change.

**Advice:** scope debug env flags out of the test env (or have the test set the value it asserts). Until
then, unset `WIRE_CAPTURE` before a battery run.

**Effort:** XS

---

## ═══ Assets / UI ═══

### BARE-HASH ASSET 404s — RPG actor avatars bypass `blobUrl()` (S ✅ FIXED)

**Fixed at both sites** — `rpg-character-detail.tsx` and `rpg-status-tab.tsx` now wrap `actor.avatar` through
`blobUrl()` before it reaches `<Avatar src>`, the same pattern `message-row-parts.tsx` already uses.

**Reporter:** owner, NB (guest) · **Scout:** 306 files scanned

#### What's broken

8 requests to `/<sha256>` (root path) on load, all 404. Renders as missing images in RPG scenes.

#### Root cause

Server resolves raw avatar sha256 into `actor.avatar`. Two RPG components pass that hash directly
as `src` to `<Avatar>` without going through `blobUrl()`. The Avatar component emits it as a root
path, causing the 404.

#### Evidence

- `chat/verbs/resolve-rpg-roster.ts:32,39` — server sets `actor.avatar` to raw sha256
- `features/rpg/components/rpg-character-detail.tsx:244` — passes `src: actor.avatar` directly to `<Avatar>`
- `features/rpg/components/rpg-status-tab.tsx:169` — same bypass

#### Advice

Wrap `actor.avatar` through `blobUrl()` at both sites before passing to `<Avatar>`. Same pattern
as `message-row-parts` which already does this correctly. Two-line fix, two sites.

**Effort:** XS

---

### DRAFT-PHASE ROW AVATAR — avatar absent from message rows in draft state (S ✅ FIXED — root cause verified)

**Root cause VERIFIED, and it is not quite what the row guessed.** It is not a missing data thread: the hashes
were already in hand. `DraftGreetingThread` (`features/chat/surfaces/message-list-surface.tsx`) fetches each
founding character with `trpc.character.get`, builds `characterNamesById` off that payload — and stops.
`resolveAssistantAttribution` takes a row's portrait from the live `participants` (a draft has none: nothing is
seated yet) and falls back to `characterAvatarsById`, which this thread never passed. So every draft greeting
rendered initials while the topbar, reading the SAME `character.get` payload two components away, showed the
portrait. "Self-heals on commit" is the roster arriving, not a race.

**Fix:** build `characterAvatarsById` from the already-fetched cards and pass it — the producer that was
missing, off the same query. One line + the prop.

**Reporter:** owner · **Scout:** not dispatched

#### What's broken

Character avatar absent from message rows while chat is DRAFT. Appears on commit. Self-heals.
Owner confirmed separate from BARE-HASH ASSET 404s.

#### Root cause (unverified)

Draft context carries `cast` IDs, not participant views — row attribution has no `avatarHash`.
Header reads draft cast directly and shows it; message rows don't.

#### Advice

Check whether draft-phase message rows can resolve avatar hashes from the draft cast the same
way the header does. May be a missing data thread in draft context.

**Effort:** S

---

### D44-GRAIN-TEXTURE — `data:` SVG noise texture violates CSP (S ✅ FIXED)

**Fixed as advised:** the turbulence SVG now lives at `packages/client/public/grain.svg` and `globals.css`
references `url("/grain.svg")` — the house pattern (`index.html`'s `/favicon.svg`), no ESM asset import.
`img-src 'self' blob:` is UNTOUCHED; the comment at the rule now says so, so the next reader does not "fix" the
CSP instead.

**Reporter:** owner · **Source:** `packages/client/src/styles/globals.css:170`

#### What's broken

Console CSP error on every load under `html[data-texture="grain"]`. Setting is `img-src 'self' blob:`
— blocking `data:` is **correct per D44**.

#### Advice

The project has zero ESM asset imports — `import url from './grain.svg?url'` is not the pattern.
The house pattern is a `public/` path string, same as `favicon.svg` (`index.html:15` → `href="/favicon.svg"`).
`packages/client/public/` already exists with `favicon.svg` and `backgrounds/`.

**Fix:** drop `grain.svg` into `packages/client/public/` and update `globals.css:170`:

```css
background-image: url('/grain.svg');
```

Alternative: CSS-only grain via `filter: url(#noise)` with an inline `<svg>` filter element in
the HTML — `img-src` doesn't govern SVG filters, only `<img>` and CSS `url()` with external
resources. But the `public/` path is simpler and already the established pattern here.
**Do NOT loosen `img-src`.**

**Effort:** XS

---

### CREDENTIAL-STORAGE-SILENT-FAIL — `CREDENTIALS_KEY` unset silently disables key storage (S ✅ FIXED — option 2)

**Fixed, option 2 (the operator-friendly arm): the UI refuses the INPUT, not the save.**

`add` has always refused with a coded `credentials_disabled` — so the failure was honest but far too late: by
then the user has handed a live provider key to a form that cannot keep it, and the refusal reads as a transient
error rather than "this deployment was never configured to store keys".

- **Server exposes the fact, honestly and minimally:** `credentials.storageStatus` (`{ enabled }`) — param-free
  and row-free, a DEPLOYMENT capability identical for every authed caller, reading only `ctx.box.enabled`. No
  secrets logic touched; the verb cannot encrypt or decrypt (its unit test proves that by giving it throwing
  crypto arms and asserting a green result).
- **UI asks before it collects:** `AddCredentialDialog` reads it and, when storage is off, renders the refusal —
  a titled empty state naming the remedy (`CREDENTIALS_KEY`, or `CREDENTIALS_KEY_AUTO` to have the server mint
  and persist one) with a Close action, INSTEAD of the key field.
- A test pins the pairing: `storageStatus().enabled === false` is exactly when `add` throws `credentials_disabled`
  — if those two ever drift, the UI either refuses on a deployment that would have saved fine, or collects a key
  on one that cannot.

**Reporter:** owner

#### What's broken

"Save API key" appears functional but persists nothing. Boot WARNs only; app comes up healthy.

#### Advice

Option 1: boot-fatal when `CREDENTIALS_KEY` absent and credentials expected.
Option 2: credentials UI detects storage-disabled state and refuses input with an error message.
Option 2 is more operator-friendly.

**Effort:** XS

---

## ═══ Mobile UI ═══

### MOBILE-THEME-SELECTOR — theme selector clipped on mobile (S ✅ FIXED — option 2, and the root cause was NOT the dialog)

**Reproduced at 320px before touching anything** (`pnpm snap / --viewport 320x800` + `__orb.nav.openModal('theme')`,
polled to settled): the theme LIST rows render fine at that width — what is sheared is the band above them. The
`Themes` label + `Reset to Hearth` + `New theme` sit in one non-wrapping `Row justify-between`, and the primary
was reduced to a \~10px orange sliver against the dialog edge. That is the reported "clipped and shrunken".

**So the row's stated root cause (`DialogPopup size="md"`'s max-width) is wrong** — widening the dialog (option 1)
would have moved the symptom without touching the rigidity, and the list proves the width itself is adequate.

**Fixed with option 2, responsive reflow:** the band wraps (`flex-wrap` + `gap-row`, `min-w-0` on the label), so
the two verbs drop to their own line instead of being clipped. Works at any viewport; no dialog size change.

**Reporter:** JF (guest) · **Scout:** 306 files scanned

#### What's broken

Theme selector panel visually clipped and shrunken at mobile viewport widths.

#### Root cause

`DialogPopup` defaults to `size="md"` which applies `max-w-(--width-dialog-md)` (a fixed max-width).
On mobile this constrains the container below the theme picker's natural width, clipping layout elements.

#### Evidence

- `app-shell/components/modal-host.tsx:91` — mounts the dialog
- `ui/src/primitives/dialog/variants.ts:23` — `size="md"` → `max-w-(--width-dialog-md)` fixed max-width
- `features/settings/surfaces/theme-picker-surface.tsx:52,57` — theme picker inside a `<Container>` inside the dialog, wrapped with `overflow-y-auto`
- `features/settings/components/theme-editor.tsx:72` — editor component inside that surface

#### Advice

Two options:

1. **Use a wider dialog size** for the theme picker on mobile (`size="lg"` or `size="full"`)
2. **Make the picker responsive** inside the current container — it should reflow to fit the
   available width rather than assuming a minimum. The `overflow-y-auto` wrapper suggests the
   design expects scrolling; the clipping may be horizontal overflow not being handled.

Prefer option 2 (responsive reflow) — it's layout-correct and works at any viewport. Option 1
is a workaround that fixes one dialog size but not the underlying layout rigidity.

**Effort:** XS–S

---

## ═══ Fixed (this session) ═══

| Bug | Fix | Commit |
| - | - | - |
| MEMBERS-TAB-DEADLOCK | `membersTabJustified` host arm; 2 tests | ✅ `0c4f1755f` |
| PERSONA-MISATTRIBUTION render | Reads `chatDetail.viewerUserId/viewerActivePersonaId`; "Traveler" floor; 3 tests | ✅ `d167e0ff0` |
| CSP eval violation (Zod) | Zod jitless before schema builds | ✅ `0993abf7f` |
| OWNER SEAT | Pinned `OWNER_HANDLES`; swapped roles; seeded placeholder → admin | ✅ live |
| CARD-KEEP adjacent: non-game chats un-stubbed | `cardKeepLastX` ABSENT ⇒ no window, threaded end-to-end (a non-rpg chat's immersive cards ride the wire whole — was silently the strictest setting) | ✅ lane CARDKEEP `9b591f09`, merged 2026-08-07 |

---

## ═══ Standing Context ═══

### Owner ruling — group mode is NOT a separate mode

Group is the SAME surfaces with permission/applicability differences (`[[no-separate-reduced-modes]]`).
Any fix described as "add a group-chat X" is mis-specified — the answer is always "the existing X
applies to this seat."

### QWEN3-VL-8B-INSTRUCT — vendor-recommended sampling

| | text generation | vision-language |
| - | - | - |
| temperature | **1.0** | 0.7 |
| top\_p | **1.0** | 0.8 |
| top\_k | **40** | 20 |
| repetition\_penalty | **1.0** | 1.0 |
| presence\_penalty | **2.0** | 1.5 |
| max output | **32,768** | 16,384 |

Greedy decoding disabled. Context 256K (expandable to 1M). `flash_attention_2` recommended.
Per `[[gen-settings-are-preset-owned]]` these are a preset recommendation, never feature-forced.
