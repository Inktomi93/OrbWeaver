# CRITIQUE — adversarial review of the three Chat-tab pitches

```
kind: tournament-critique   reviewer: adversarial   date: 2026-07-09
verified against: the worktree at HEAD (packages/server, packages/client, packages/ui, packages/contracts),
  FINAL-Chats-Landing-Room-and-Context-UX.md, the UI-law quartet, BRIEF.md §4b (owner steers — added
  mid-tournament; the pitches predate them, so §4b enforcement is applied here retroactively and each
  finding says so where relevant), and neo-tavern's group-config surface
  (/home/inktomi/inktomi-stack/development/neo-tavern/src/shared/settings/group-config.ts).
verdicts: findings only — no ranking, no winner. Every finding carries a "revision instruction."
```

Legend: **FATAL** = the claim/flow as written is false or unbuildable and load-bearing. **MAJOR** = wrong,
uncharged, or incoherent in a way that materially weakens the pitch. **MINOR** = fix in a paragraph.

---

## 1. Pitch — GREENFIELD ("The Director's Table")

### FATAL

**G-F1. The flagship's marquee example rests on a false mechanism claim.** §3 step 3: *"`@Aria respond —
colder…` → fires `chat.generate({guided:…})` **with Aria force-summoned (the @mention override)**."*
False. The @mention hard-override runs ONLY in the **send** path, over the human post content —
`packages/server/src/domain/chat/verbs/turn.ts` L514: `forcedIds: resolveMentionsVia(content,
room.castNames)`, with the comment "Only HUMAN trigger text drives @mention — `content` is the human
post." The `generate` verb (turn.ts \~L872–900) runs **no arbitration and no mention parse at all** — it
targets `speakerCharacterId ?? primaryCharacterId(room)`. A `guided.input` string never reaches
`resolveMentionsVia`. **Revision instruction:** the UX survives with a one-line mechanism swap — Direction
resolves `@Name` tokens **client-side** against the roster and passes `speakerCharacterId` to `generate`
(the exact parameter SPEAK-AS already uses). Rewrite §3 to cite that mechanism; stop citing
`select-speakers.ts` for anything Direction fires through `generate`. (Bonus: client-side resolution is
*stronger* — no name-collision parse, and the "@ opens the cast picker" UI you already describe implies
it.)

**G-F2. "The scene's memory — compaction checkpoints as a timeline" is unbuildable on the data model.**
§2 CONTEXT / §4(f) promise a dossier band of "compaction checkpoints as a timeline." There is exactly ONE
checkpoint per chat, stored as two columns that are **overwritten** as the checkpoint advances:
`chats.compactSummary` + `chats.compactedAtSeq` (`packages/server/src/domain/chat/verbs/compaction.ts`
header — "compaction summarizes the history AFTER the current checkpoint … and advances the checkpoint").
No history table, no list read. A "timeline" is an uncharged server ask (a checkpoint-history table +
read) in a pitch whose §7 claims near-zero asks. **Revision instruction:** either (a) rescope the band to
the truth — ONE current checkpoint (summary + boundary seq), which is still useful and matches FINAL-Chats
§6.1's "show the resulting checkpoint as the boundary divider's tooltip detail" — or (b) charge the
timeline honestly in §7. Note BRIEF §4b: a broader *checkpoint system* is an owner-lukewarm separate idea;
if you want it, pitch it AS that separate idea, clearly severed from per-message fork.

### MAJOR

**G-M1. "Live now" pinning is underivable from the signals you cite.** §2 LIST claims the Live group is
"derived from the user-bus `chatsChanged` + presence, no new store." There is no presence signal anywhere:
`UserBusEvent` is a coarse "thing changed" fan (`packages/contracts/src/user-bus/index.ts` L41–55 —
`{type:"chatsChanged"; chatId?}`, no actor, no streaming state, no presence), and the per-chat SSE
attaches only to the OPEN chat, so "a turn is streaming" in *another* room is invisible to the client.
"Someone else is currently present" does not exist as data. This is an **uncharged server ask** (a
presence/streaming fan on the user bus) inside a §7 that brags "None required." **Revision instruction:**
charge it — and note that post-§4b, a presence ask *serving multi-human* is REWARDED, not penalized. This
is your cheapest path to genuine §4b over-delivery; asking is better than deriving fiction.

**G-M2. The dossier's "0 clicks / ambient" claim depends on a defaults change you never file.** The built
default is CONTEXT **collapsed** for chats (`packages/client/src/features/app-shell/lib/rail-slots.ts`
L108: `chats: { list: "docked", context: "collapsed" }`), and the map's own header says the
"docked-for-active-chat" behavior needs a runtime seed a later lane must add. Your §5 row "See what the
model saw last turn → **0**" and the whole "ambient glance" thesis presume CONTEXT is open; your §8 claims
"Law-amendment asks: **None**." Pitch B filed an amendment for exactly this map. **Revision instruction:**
file the same class of amendment (a composition-aware or seeded default for Chats CONTEXT) or re-score the
row as 1 click. Also state the focus-mode story: with both panels collapsed (immersive-ST is first-class,
FINAL-Chats §13), the dossier is gone — "ambient" must degrade gracefully, say how.

**G-M3. The `narrate` verb token has no backing capability.** §3 step 2 lists Direction's verbs as
"`respond · continue · reroll · impersonate · summon · narrate`." `GUIDED_ACTION_KINDS` is
`response · swipe · impersonate · rewrite · opening · continue`
(`packages/contracts/src/preset/index.ts` L180–187) — no `narrate`, and no narrator-post verb exists
(rpg's `postNarratorMessage` is an unbuilt future seam, FINAL-Chats §14). One-sixth of your grammar is
vapor in a pitch whose central boast is "zero new server verbs." **Revision instruction:** cut `narrate`
or define it honestly as `generate` against the narrator-mode synthetic group character (only valid when
`group.output === "narrator"`) — and if that's the definition, say when the token is hidden.

**G-M4. The cast strip is keyboard-dead and its predecessor is unaccounted for.** §1/§3: "click a face to
summon, **hold to mute, drag to weight**." Hold and drag have no keyboard equivalent anywhere in the pitch
— the house baseline is keyboard-operable everywhere (UI-Arch §4a BASELINE; §4.3 rule 4 demands
`:focus-within` parity), and your §5 counts "cast strip hold → mute = 1" as a headline win. Hold/drag are
also undiscoverable (no affordance signals them) and collide with touch scrolling at coarse pointers.
Separately: your CONTENT anatomy is `[stage | Direction line | composer]` — the built room is
`[cast bar | thread | selection bar | composer]` (`chat-room-surface.tsx`), and §6's kept/replaced
inventory never mentions `chat-cast-bar.tsx` or the host `+` → `AddMemberPopover`. Is the cast bar deleted
in favor of the Direction-line strip? Where does add-member live? **Revision instruction:** (a) give every
strip gesture a keyboard + coarse-pointer path (a seat's Enter/menu opening the same actions is fine);
(b) account for the cast bar and AddMemberPopover explicitly in §6.

**G-M5. §4b roster-size disclosure + the full group-controls inventory (owner steer — audit failed).**
Your merged "Cast & turn-taking" section names "roster mute/weight/force + group policy" (§2) and
"policy/output/nudge" (§4f). The REAL group-controls surface — per the owner-designated neo-tavern
reference (`group-config.ts`: output narrator⇄per-speaker DU, policy ×5, `speakerTags`, `groupNudge`,
`cardScope` merged/scoped, auto-mode `maxTurns`/`delayMs`/`allowSelfResponses`) and the built Group tab
(FINAL-Chats §7: + member-card visibility + the auto-mode cost warning) — is bigger. Your pitch never
inventories where each lands in the merged section, and never states the §4b rule: **group controls
reveal only when roster > 1 and hide for solo** (the built tabs are host-AND->1-gated; your consolidated
editor's gating is unstated, so a solo chat could show turn-taking machinery — a §4b defect). **Revision
instruction:** enumerate the full control set inside "Cast & turn-taking" (re-housing the dual-mode
`GroupConfigForm`/`RosterPanel` bodies is fine — say so), and state the roster>1 reveal rule for the
section AND for the Direction-line cast strip.

**G-M6. §4b under-ambition (owner steer).** Your multi-human content is almost entirely inherited
FINAL-Chats Wave B; the one *original* multi-human idea (Live pinning, human seats in the strip) is the
part that's underivable (G-M1). Post-§4b, "zero server asks" is no longer a virtue where an ask would
serve dual-device/multi-human. **Revision instruction:** own at least one server-ask-backed multi-human or
dual-device experience (the presence fan from G-M1 is the obvious one — it powers Live pinning, cast-strip
human presence, AND a "your other device is viewing" affordance in one ask).

### MINOR

- **G-m1. Click-economy asymmetry.** "Reroll with a steer — today 3+ (open wand → type → pick)" vs yours
  "1 gesture (⌘. `reroll — darker` Enter)". Today is 2 clicks + typing (steer types into the composer,
  wand consumes it — `composer-wand.tsx` header); yours is 1 keystroke + typing + Enter. Typing is charged
  to the incumbent and comped for you. The real win is "hands never leave the keyboard" — say that, and
  count gestures symmetrically.
- **G-m2. The `z.any()` framing is half-right.** The WIRE is `z.any()` (`routers/chat.ts` L64/89/96…) but
  the domain contract is already the closed, typed `GuidedSteer` (`domain/chat/contract/params.ts`
  L56–74). Risk #5's "if the guided contract ever tightens" misplaces the risk: the type exists; what's
  missing is a zod wire schema. Reframe: Direction should *push for* the wire schema, not fear it.
- **G-m3. The Direction line's rest state is a permanently reserved hint band** between thread and
  composer — standing chrome for a whisper (rule 9). Consider zero-height at rest with the hint living in
  the composer placeholder (which already teaches continue-on-empty).
- **G-m4. Two-input semantics under-specified** (you flag it as risk #1 — correctly). Add the missing
  spec: what happens to a non-empty composer draft when ⌘. fires? (Today's wand *consumes* the composer
  text as the steer; Direction changes the model — state the new rule so a builder doesn't guess.)
- **G-m5. "⌥ from here" is mystery meat as named.** An option-key-flavored label on a per-message action
  needs a visible, named affordance in the reveal row (and its keyboard path). The composition itself
  (fork's `throughSeq` + a guided generate — both verbs real) is sound; also note it lands in a NEW chat
  (fork is a deep copy, D27), so the gesture navigates — say so in the flow.

### Genuinely strong — do not cut

- The **read/write frequency split of CONTEXT** (glance dossier vs one config door) is the sharpest
  structural idea in the tournament — fix its receipts (G-F2, G-M2), don't amputate it.
- Promoting the guided substrate is well-founded: `use-guided-actions.ts` + typed `GuidedSteer` +
  router-exposed `generate/swipe/continueTurn/impersonate` all verify.
- The `⌥ from here` **composition** (fork + steer in one gesture) is genuinely novel and buildable.
- Holding every FINAL-Chats §10 target while concentrating wins in the steering loop is the right
  economy shape.
- The self-aware risk list (§10) — especially naming the two-input confusion yourself — is the honesty
  bar the other pitches should match.

---

## 2. Pitch — DISCORD ("a room you hang out in")

### FATAL

None found. Every load-bearing code claim verified: `ChatSummary` fields + the "unread chrome" comment
(`domain/chat/contract/views.ts` L45–70); no `lastReadSeq`/unread field anywhere in the chat contract or
schema (confirmed by sweep); `SECTION_PANEL_DEFAULTS` at `rail-slots.ts` L107–113 with
`chats: {context:"collapsed"}`; the invite/membership cluster on `contract/service.ts` L268–293 (dark);
`previewAssembly` is the router's real name; `turnStarted` DOES carry `speakerCharacterId`
(`packages/contracts/src/chat/index.ts` L672–683) so the "generating" shimmer is a lifecycle read, not a
token subscriber; `isAtEnd`/`scrollToEnd` are real on the `message-list` seal
(`packages/ui/src/primitives/message-list/message-list.tsx` L80, whose own comment even anticipates a
"'N new messages' readout"); the world-info router deferral comment reads exactly as cited. This is the
cleanest receipts sheet of the three.

### MAJOR

**D-M1. The flagship's keyboard interaction model is unspecified.** The Members panel is the pitch's
center of gravity, and it stacks per-row hover-action clusters (kick / handoff / mute / expand-to-slider /
force-turn / overflow). "Hover actions keyboard-parity via `:focus-within`" (§8) is a principle, not a
model: how does a keyboard user traverse rows vs actions-within-a-row (roving tabindex? per-row menu?),
where does focus land after a kick removes the row, how does the talkativeness slider's
"expand-on-hover" open from the keyboard, and what do coarse pointers see (always-on actions bloat row
height ×N members)? For a flagship, this is a build-blocking hole. **Revision instruction:** specify the
row interaction contract (recommend: row = one focusable unit, Enter/menu opens a per-row Menu carrying
ALL actions — which also solves coarse-pointer density), and the post-destructive-action focus rule.

**D-M2. Your steering story is the weakest of the three — and two rivals converged on it.** You keep the
wand untouched and add only @-autocomplete. That's defensible (your bet is membership legibility), but
post-revision you'll be judged against two pitches whose whole thesis is steering promotion. **Revision
instruction:** state a position. Either steal cheaply (your `@`-Combobox naturally extends to a verb-token
row — one component, no new verbs) or explicitly refuse with a reason ("steering promotion is a second
flagship; one pitch, one bet"). Silence reads as a gap, not a choice.

**D-M3. Own the @-mention-in-canon tradeoff.** The `@Name` the autocomplete inserts is SENT and PERSISTED
as message content — the parse is server-side over the stored human post (turn.ts L514), so "@Aria" lands
in the transcript and in the assembled prompt, i.e. meta-text inside the fiction. The FINAL endorses
teaching @mention, so this isn't your invention — but your pitch *amplifies* it into a taught reflex
without saying where the token goes. **Revision instruction:** one paragraph — how the sent row renders
the token (plain text is honest; a styled chip must not alter stored content, D26), and copy that warns
it's part of the message ("this appears in your message").

**D-M4. You charge `lastReadSeq` but leave its dual-device story implicit — which is the §4b reward zone
you're best positioned to claim.** Your ask is the only one in the tournament that *incidentally* serves
same-user-two-devices (read-state must be server-side precisely because localStorage lies across devices —
you say this). But the mechanics stop at "mark-read on room-open + scroll-to-tail." Cross-device
reconciliation (device A reads at the tail; device B's LIST pip must clear via a bus fan — which event,
which invalidation row?) is unspecced, and it's the difference between "a Discord idiom" and "the product
goal served." **Revision instruction:** spec the fan (the natural shape: mark-read emits user-bus
`chatsChanged {chatId}` or a sibling read-state event → the existing invalidation seam refreshes
`listChats`), and claim the dual-device credit §4b explicitly offers you.

### MINOR

- **D-m1. Accent budget.** Recency emphasis = "brighter title + an accent left-edge tick" per touched row.
  N accent ticks in a docked LIST can breach the ≤10% accent rule (§4.3 rule 9) on a busy inbox. Use a
  non-accent emphasis (title weight/foreground step) or cap the tick to the single most-recent row.
- **D-m2. `listInvites` is even cheaper than you charged.** True that it's absent from the service
  contract — but `listInvitesForChat` already exists at
  `packages/server/src/domain/chat/persistence/invites.ts` L30. The ask is a contract row + router row
  over a built read. Good news; correct the "does not exist even on the service" framing to "exists in
  persistence, needs the service+router rows."
- **D-m3. Amendment mechanism nit.** The `SECTION_PANEL_DEFAULTS` header (rail-slots.ts L99–106) already
  anticipates this change but as a one-time *seed* ("a later chat lane seeds that override via
  `setPanelMode` when a chat commits"), while you propose a resolve-seam *derivation*. Yours is arguably
  better (composition-aware, no phantom persisted override) — but name the divergence so the ledger
  amendment supersedes the code comment cleanly.
- **D-m4. "Members" noun** — you flagged it yourself; fine as-is with the one-string fallback.

### Genuinely strong — do not cut

- **The unread split (ships-now recency vs honestly-charged `lastReadSeq`)** is the tournament's model
  example of server-ask honesty — post-§4b it converts from "soft underbelly" (your words) to your
  strongest §4b asset. Keep it and extend it (D-M4).
- **The refuse-list (§6)** — rejecting guild nesting, character presence-dots, reactions, voice — is
  exactly the "adapt honestly where it doesn't fit" the lens demanded. Keeping Preview front-and-center
  as the non-Discord superpower is the right call.
- **The flagship's §4b compliance is the best of the three:** Members default is group-scoped, solo keeps
  the DM register, single-user installs feature-detect the whole surface away, and the amendment is filed
  honestly with a 1-click degradation path.
- The jump pill and the generating shimmer both ride verified built signals (`isAtEnd`,
  `turnStarted.speakerCharacterId`) — zero-cost wins, keep.

---

## 3. Pitch — IMMERSION ("The Stage and the Wings")

### FATAL

None strictly — the verb receipts are the most precise of the three (see "strong"). The two findings
below are each one honesty-paragraph away from clean, but both currently misstate what a builder would
build.

### MAJOR

**I-M1. Stage-as-default is a silent defaults-law change filed under "Law-amendment asks: None."** Your
Stage posture flips the Chats LIST default from `docked` to `overlay`-when-a-chat-is-open.
`SECTION_PANEL_DEFAULTS` (`rail-slots.ts` L107–113, `chats: { list: "docked", … }`) is the documented
§4.1/§4.2-rule-3 law surface ("LIST docked for the collection-first sections"), and its header says
state-dependent behavior needs a deliberately-added runtime seed. Pitch B filed an amendment for a
*smaller* change to the same map; you claim none. BRIEF §4 is explicit: silent violation disqualifies —
"the mechanism already exists" (§8's defense) doesn't cover changing the *default*, which is the part
that's law. **Revision instruction:** file the amendment (one map/seam change, same shape as Pitch B's),
including the interaction between the two: your Stage collapses CONTEXT at the exact moment Pitch B's
amendment docks it — the owner will decide between opposed defaults, so state your side's case against
theirs (solo immersion vs group legibility; note they scope to groups, you don't scope at all — consider
composition-scoping Stage too).

**I-M2. "Set the mood" mutates a GLOBAL synced pref from a room-scoped-looking control.** The chatStyle
is one account-wide synced value (`use-chat-style.ts` — `UserSettings.appearance.chatStyle`, "the §12.1
PERSISTENCE rule"; the same skin renders in every chat). A "Set the mood" control in a ROOM header
reads as scene-scoped; flipping it for a banter scene silently restyles every other chat, on every device.
Also §2.4's "make the *default* for a new immersive user land on an immersive skin" quietly re-decides a
user-pref default — that's an owner ruling, not a designer decision (UI-Theming §12.1: axes are user
settings). **Revision instruction:** either label the control's true scope in the popover ("changes your
chat style everywhere"), or take your own §8 fallback (a shortcut opening Appearance pre-focused) and
make it the primary spec, and move the default-skin change to an explicit owner ask.

**I-M3. Branch-from-variant is a two-verb sequence, and fork drops the humans — say both.** The tray's
per-row "Branch-from-here (`forkChat({throughSeq})` at that variant)" won't do what it says with one verb:
fork copies every variant and **remaps `selectedVariantId` to the copied *selected* variant**
(`domain/chat/verbs/fork.ts` header) — branching *at a non-selected variant* requires
`selectVariant` → `forkChat` (or a post-fork select in the new chat). Sequence it explicitly. And the same
header's `FLAG[fork-humans]`: **other human participants are NOT copied** — the forker becomes sole host
of a private copy. In a multi-human room your Branch quietly leaves the people behind; the confirm copy
must say so ("Branches into a private copy — others aren't carried over"). Neither is fatal — both verbs
are live and the composition works — but as written a builder ships a wrong pointer and a silent social
surprise.

**I-M4. Fiction-voiced labels vs rule 10 ("same action, same home, identical label + icon everywhere").**
"Try that again" (Direct) is the same verb as the swipe chevron's regenerate; "Take it further" is the
same verb as the Send button's continue-on-empty "Continue" morph (FINAL-Chats §6.4). Two labels per verb
across entry points is precisely what rule 10 bans, and it taxes the migrating ST user your §1 claims to
serve (they hunt "Regenerate," not prose). **Revision instruction:** pick one — re-voice the verb
EVERYWHERE (chevron tooltip, Continue morph, menu rows) so the fiction voice IS the canonical label, or
keep canonical labels and demote the fiction copy to the item's description line.

**I-M5. The two-input model change is unstated.** Today the wand **consumes the composer's draft text as
the steer** and clears it (`composer-wand.tsx` header: "the composer's CURRENT DRAFT TEXT becomes the
guidance param … the composer clears"; the trigger even gates on a non-empty draft). Your Direct popover
carries its own "Steer the scene…" input — so what happens to a non-empty composer draft when Direct
opens/fires? Preserved? Consumed? Blocked (today's gate inverted)? Greenfield flags this class of problem
as its #1 risk; you inherit it without noticing. **Revision instruction:** one rule, stated ("Direct never
touches the composer draft; its steer is its own field" is probably right — then delete the wand's
non-empty-draft gate from your spec deliberately).

**I-M6. §4b under-ambition (owner steer — the pitch's own §10.6 concedes it).** "I add immersion voice,
not new mechanics" (§4.4) is the compliance-checkbox posture §4b now penalizes; "Server asks: **None**"
is worn as a badge in a tournament where asks serving dual-device/multi-human are now REWARDED. You have
zero dual-device content and zero original multi-human design. **Revision instruction:** add at least one
owned experience in the reward zone that fits your direction — candidates that are immersion-native:
membership events staged as scene beats is already yours, so go further (e.g., an in-fiction join moment:
the joiner's `/join` preview styled as "stepping through the curtain" with the room's theme tokens — a
real design contribution over FIX #1), or a presence-derived stage cue. Or argue explicitly why immersion
should NOT spend there — but argue it, don't skip it.

### MINOR

- **I-m1. The boundary-divider re-voice fights the component's own restraint.** The built divider is a
  hairline whose comment says the restraint is deliberate ("no copy … never competes with the reading
  surface" — `message-row-parts.tsx` L388–405; the micro-caps text is "In context from here"). "· the
  scene remembers from here ·" is longer and cutesier. If you re-voice, keep it ≤ the current length and
  micro-caps.
- **I-m2. Swipe-bloom keyboard path unstated** — the counter must be a real button; the tray needs arrow
  nav + Enter-select/Branch. (Base UI popover gives focus containment; the ROW model is yours to spec.)
- **I-m3. "`listInvites` … all OFF the router"** implies it exists below the router; it isn't on the
  service contract at all (FINAL FIX #4 is net-new; the persistence read exists — see D-m2). Tighten.
- **I-m4. Click-table generosity.** "Steer the next reply: today = wand menu → item → type" — today the
  steer is typed FIRST (composer), then 2 clicks. Yours is 1 open + type in the popover. That's \~even,
  not a win; the honest claim is "same cost, no fourth-wall break."

### Genuinely strong — do not cut

- **The verb receipts are the tournament's most precise:** `GuidedSteer`/`GuidedPlacement` semantics
  (params.ts L56–74), `GUIDED_ACTION_KINDS` (contracts/preset L180), placement-not-history, the #27
  router exposures, tail-gating — every one checks out on disk.
- **The swipe-bloom** is the best cheap steal in the tournament: `listMessageVariants` + `selectVariant`
  - `forkChat` all live, it's ST's proven power move, and it's one component. Fix I-M3's sequencing and
    ship it.
- **Stage/Studio names an existing mechanism** (panel modes + the clamp overlay) instead of inventing
  one — the right instinct; it just needs its amendment filed (I-M1).
- **The directed opening as scene-creation front door** (§4.2 step 4) is real (`opening:"generate"` +
  `guided:{action:"opening"}` verified in `use-guided-actions.ts`'s draft path) and is the most
  RP-native use of the guided substrate any pitch found.
- The honest closing self-assessment ("my net-new is small — the win is less chrome") is credible;
  don't inflate it in revision — fix §4b ambition with *targeted* additions (I-M6), not bulk.

---

## 4. Cross-pitch

### 4.1 The director convergence — signal or trap?

Greenfield's **Direction line** and Immersion's **Direct popover** independently promote the SAME built
substrate (`use-guided-actions.ts` + typed `GuidedSteer` + the #27 router exposures). **Verdict: the
convergence is SIGNAL about WHERE the value is, and a trap about HOW MUCH.** Signal: the wand demonstrably
under-voices real, verified capability (a typed steer channel riding every turn verb, hidden behind a
dropdown that requires knowing the composer-text-becomes-steer trick) — two designers finding it
independently means the domain wants steering promoted. Trap: neither promotion is a flagship by itself —
Immersion admits its version is "the wand menu with new words" (§10.1), and Greenfield's version needed a
false mechanism claim (G-F1) and a phantom verb (G-M3) to look bigger than it is. The revision-round
question for both is not *whether* to promote steering but *how much structure it deserves*: a popover
re-voice (cheap, honest, small) vs an inline command grammar (bigger, needs the two-input model solved).
The pitch that pairs a right-sized steering promotion with a strong SECOND leg (membership legibility,
read-first context, unread state) will beat a steering-only story.

### 4.2 Defects ALL THREE share

1. **Dual-device is designed by nobody.** It is HALF the stated product goal (§4b: "dual-device +
   multi-human are THE product goal") and no pitch designs a single same-user-two-devices experience.
   Discord's `lastReadSeq` is the only ask that even *incidentally* serves it (and leaves the
   reconciliation implicit — D-M4). Every revision must either add one dual-device experience or state
   why its direction defers it.
2. **Multi-human = inherited Wave B, plus voice.** All three consume FINAL-Chats §8/CREATE-B as "already
   planned" work. Legitimate reuse — but only Discord adds original multi-human design on top. Post-§4b,
   "I placed the FINAL's multi-human where the FINAL says" is table stakes, not credit.
3. **Nobody surfaces fork's multi-human semantics.** `FLAG[fork-humans]` (verbs/fork.ts): a fork is a
   private copy — other humans are NOT carried, forker becomes host. All three keep per-message fork
   (correctly, per §4b steer 1 — no pitch conflates it with checkpoints, good) but none tells the USER
   what forking a shared room means. One confirm-copy sentence, each.
4. **The roster-size disclosure RULE is stated by nobody** (it's a §4b add, so this is expected — but the
   revision must fix it). Discord comes closest by construction (group-scoped defaults, size-gated
   sections); Greenfield outright fails it for the merged editor + cast strip (G-M5); Immersion inherits
   the built gates passively. Each revision: one explicit sentence per group control — "hidden at
   roster ≤ 1" — audited against the neo-tavern reference inventory (output DU · policy ×5 · speakerTags ·
   groupNudge · cardScope · auto-mode trio · mute · talkativeness · force-turn · add/order).
5. **Steering rows in every click table count typing asymmetrically** (Greenfield worst — G-m1;
   Immersion — I-m4; Discord's table is honest but has no steering row at all, which is its own tell —
   D-M2). Count gestures the same way in both columns.

### 4.3 Steal list (allowed in revision)

| Taker | Steal | From | Why it fits |
| - | - | - | - |
| Greenfield | the jump-to-present pill (`isAtEnd` is free) + the charged-ask honesty pattern for its presence fan (G-M1) | Discord | zero-cost; converts its worst uncharged claim into its best §4b asset |
| Greenfield | the swipe-bloom tray | Immersion | the dossier/Direction design has no variant story; this is the mouse-first power path it lacks |
| Discord | a right-sized steering position — the `@`-Combobox growing verb tokens, or an explicit refusal | Greenfield/Immersion | closes its only structural gap (D-M2) without a second flagship |
| Discord | the swipe-bloom tray | Immersion | pure composition, register-compatible (Discord users know hover galleries) |
| Immersion | the filed-amendment discipline + composition-scoped defaults | Discord | cures I-M1 and sharpens Stage (scope Stage's collapse to solo; let groups keep legibility) |
| Immersion | the read-first "what the model saw" glance (right-sized: last-turn digest, ONE checkpoint) | Greenfield | Casey's curation job is immersion-adjacent (the prompter's booth should *show* the script), and Studio has room for it |

### 4.4 One process note for all three

Every pitch cites FINAL-Chats FIX #1–#5/CREATE waves as "already sanctioned, charged to that lane." True
— but if the tournament winner becomes the build doc, those waves become THIS lane's critical path. Each
revision should mark which FIX rows its flagship is *blocked* on (vs merely enhanced by), so the owner can
see the real build order. (Discord's flagship blocks on FIX #1/#2; Greenfield's Direction blocks on
nothing but its dossier blocks on the trace-summary ask; Immersion's flagship blocks on nothing — worth
saying out loud, it's a genuine schedule advantage.)
