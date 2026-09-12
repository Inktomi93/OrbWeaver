---
kind: review
status: draft
updated: 2026-08-24
---

# Plugin + automation JUICE — the converged ideation pass (fable generations → adversarial rounds → adjudicated)

> **Provenance.** Owner-commissioned ideation over the COMMITTED plan
> (`docs/design/interaction-direction-spec.md`) + the IA placement doc: "find the juice that makes
> it fuck" — ideas INSIDE the committed shape. The owner re-scope (bridge 011: automation is a
> PLATFORM) is folded. Three fable-tier generations; TWO completed fun-honesty passes (B1/B2);
> and — after the API-529 outage killed the first four law/cost agents — **a REAL, completed
> two-lens A-round (LAW/WALLS + FIT/COST) ran 2026-08-24 over THIS 15-survivor list**: 16 new
> findings (§3 rows 24–39), twelve survivors changed, zero killed. **Verification status,
> honestly:** every load-bearing receipt in §1 is now covered by the completed A-round's
> independent re-derivation (marked A2 where it upgraded an earlier A†/O recovery mark); the two
> claims the round could not verify are marked UNVERIFIED inline. The stale-claim lens (bridge
> 012\) ran over this doc's own claims: 12 comment/doc-sourced claims re-derived → 7 confirmed,
> **3 STALE (found in our own work, fixed below)**, 2 unverifiable.

## §1 SURVIVORS — final ranking (fun-per-effort, adjudicated through both rounds)

> **Cost-class normalization (A2-F7):** "zero-machinery" was retired — every preset idea's true
> floor is the S3 substrate row (a `Record<RulePresetId, RulePresetDef>` member + the id tuple +
> the knob projection + a create→fire int test), and S3 itself is a committed-but-unbuilt row.
> All preset ideas below say **preset-only**, meaning MARGINAL cost once A3 lands.

### 1. Welcome-back recap — as an INVITATION CARD (re-specced twice by adjudication)

- **Felt experience:** you open a room untouched for nine days. One quiet host-side card: "Recap
  where we left off? **\[Do it]**". Click, and the narrator's next turn is *"Previously — the
  vault door, half-open…"* plus ways back in. Zero spend, zero canon noise, until you ask.
- **Machinery (final form):** rule 1 on `messageCommitted` → `set_variable`
  `vars.lastBeatMs = {{expr::now.epochMs}}` (render path proven live, A2) **with an explicit high
  `maxFiresPerHour` on this counter rule** (A2: the per-rule default is 30/hr —
  `db/schema/automation.ts:51` — and an active RP hour exceeds it, freezing the stamp stale; the
  preset sets the cap, and this is now a standing preset-authoring law). Rule 2 on `chatOpened`
  (tap live, `entry/lifecycle.ts:434-436`) + the dialect-proven predicate
  `!has(vars.lastBeatMs) || int(now.epochMs) - int(vars.lastBeatMs) > N` → **an S4 class-2
  INVITATION** ("this rule wants to run — run it now?") whose confirm fires the recap
  `trigger_turn` fresh via R7. WHY the invitation instead of a chip (three A-round findings at
  once): a chip's click posts as the clicking MEMBER (the X1 director-voice defect — "Recap
  please" as your in-fiction line); `chatOpened` fires per-ATTACH, viewer-blind, and chips fan to
  the WHOLE room (`quickReplySurfaced` is the one member-visible event) so any member's reconnect
  would re-spam everyone (A1-F6); invitations are HOST-tier on the bus, replace-per-rule, and
  attribution-free by construction.
- **New:** one preset row. **Cost class:** preset-only (post-A4/B2's card surface).
- **Lives:** Rules picker (IA §2.1); the card in the S1 mount (IA §2.2).
- **Fun argument:** the highest-frequency pain in long-form RP, deleted — the one candidate for
  genuine furniture (B2).
- **Strongest objection:** host-only cards mean a member can't summon the recap in a multi-human
  room. Accepted v1: recap-on-return is dominantly a solo/host moment, and a member can always ask
  in prose.

### 2. Async table nudge — re-specced onto `messageCommitted` (A2-F1)

- **Felt experience:** play-by-post, three humans, three time zones. It's been your move for six
  hours; your phone shows "The Vault of Ash — it's your move." The row that decides whether a
  second session happens.
- **Machinery:** `messageCommitted` (NOT `turnCompleted` — its fact carries NO user identity,
  contracts:281-292, so actor exclusion was inexpressible there; `message.authorUserId` exists on
  the commit fact, :271-279) + idle predicate → `post_notification` (arm live,
  `arm-executors.ts:148-166`).
- **New (priced fully, A1+A2):** one preset row + the third `NOTIFICATION_RECIPIENTS` member
  (`all_members_except_actor`-class) whose REAL coupled sites are: the contracts tuple + zod; the
  resolver (`loadPresentHumanMemberIds` has no actor filter — CONFIRMED in code,
  `persistence/canon-reads.ts:56-64`); **converting `arm-executors.ts:160`'s binary ternary to an
  exhaustive Record/`assertNever`** (a third member silently falls into the all-members branch
  today — the §5.5 dispatch discipline); **the plugin membrane's silent downgrade at
  `membrane.ts:445`** (`args[1] === "all_members" ? "all_members" : "host"` — a guest-visible
  vocabulary widening touching `host-v1.ts:125`, `bridge.ts:70`, `domain/plugin/contract/ops.ts:
  136`). NOT a merge window (the tuple is not CHECK-derived; zero db hits — A2).
- **Cost class:** preset + one enum member with the four named code sites. **Lives:** Rules
  picker; the existing inbox.
- **Fun argument:** everything else improves a live session; this one makes the next one exist.
- **Strongest objection:** ops-flavored. Survives: the felt moment is on the phone, and
  play-by-post is where multi-human rooms live.

### 3. The needle (model-scored tension meter) + backdrop — CARRIES AN OWNER FORK

- **Felt experience:** a thin meter beside the thread climbs as the scene sharpens; past the
  line, the backdrop darkens. The model's private judgment becomes physical.
- **Machinery:** `run_analysis` (C1) scoring tension 0–10 → chat variables; the B9 thread-flank
  widget renders `vars`; backdrop rule `int(vars.tension) >= N` → `set_chat_background`.
- **New (repriced, A2):** the `setVariable` output-op member **with a value contract** (numeric
  score, capped — the first model-authored write into the `vars` plane; the P5 lore precedent
  demands the belt) + two preset rows + **the vars READ surface, which exists NOWHERE today**
  (A2-F9: no transport/client read for chat runtime vars — the sole reader on the tree is the
  plugin membrane's `getVariables`; the committed B9 widget needs this proc + invalidation
  anyway, so it prices HERE and B9 consumes it).
- **THE FORK, posed not closed (A1-F5):** F6 is an OWNER ruling (analysis state host-only, no
  UI); publishing even one score into member-visible chat vars — which **plugins holding
  `chat.read` also read** (`host-v1.ts:86-87`, A2-F8) — is a line only the owner can draw.
  Stated default: the preset ships OFF and the score-publication route exists behind it;
  "scores may cross; arcs/twists/guidance never do" is the proposed line. NEEDS-OWNER.
- **Cost class:** small new-machinery (output-op member + the vars read proc). **Lives:** meter at
  thread-flank; knobs in the Rules section.
- **Fun argument:** the one artifact on screen ALL session — anticipation between fires.
- **Strongest objection:** the fork above IS the objection; it goes to the owner with the default
  stated.

### 4. Opener chips (the staple deck) — COMPOSE-mode (re-specced, A1-F1)

- **Felt experience:** every blank-composer stall, three quiet doors: *Continue · Time skip · New
  scene*. Click one and the composer holds a seed you own and send.
- **Machinery:** `chatOpened`/`turnCompleted` + light predicates → `surface_quick_reply` in
  **compose mode** — which requires the per-choice mode the arm does NOT have today (A1-F1: the
  arm schema is `{label, sendTemplate}` only, contracts:215-221; the live send-vs-compose
  decision is a per-CHAT game knob, `choice-send-provider.tsx:41-52`). Priced: a per-choice
  `mode: "send" | "compose"` field on the arm (schema + bus payload + the S1 descriptor
  consumption) — shared with #6.
- **New:** one preset row + the shared mode field. **Cost class:** preset + the small arm-field
  addition. **Lives:** Rules picker; chips in the S1 mount — **with the aggregate note (A2-F6):**
  `QUICK_REPLY_MAX_CHOICES = 4` is PER-ARM; two chip rules on one event stack to 8 — the S1 mount
  carries a display cap + overflow, added to the committed design-note delta.
- **Fun argument:** the cheapest cure for the medium's most common stall.
- **Strongest objection (both rounds):** send-mode staples would post "Continue" as YOUR
  in-fiction line — the X1 defect; compose-mode keeps the member the author of their own words.
  The execute-mode variant (a chip invoking the guided Response action — the D111
  empty-send-generates shape) is recorded as the better future form.

### 5. Scene veil rule

- (As adjudicated previously; predicate `event.message.content.contains("((veil))")` re-derived
  live by the A-round.) One preset row; Rules picker; the safety word mechanically works.
- **Cost class:** preset-only.

### 6. Call a vote

- (As before: R7 host invocation → chips; picks are DIEGETIC member sends — the one chip class
  where member attribution is CORRECT.) **Re-priced (A1-F1):** vote chips need **send** mode
  reliably regardless of the room's cyoa knob — the same per-choice mode field #4 prices; without
  it a compose-default room drops picks into composers and the vote fizzles.
- **Cost class:** preset + (shares) the mode field. **Lives:** unchanged.

### 7. Rumor mill

- (Unchanged: a C1 `upsertLoreEntry` preset — consequences-and-hearsay from the settled span;
  confirm-first; `neutralizeMacros` per C2.) **Cost class:** preset-only (post-C1/C2). A-round
  verified its refusal-distinctness: no per-event model spend, no assembly duplication.

### 8. The callback rule (promises the story keeps)

- (Unchanged in shape: content-match counter + beat-distance threshold → guided callback turn.)
  **Re-specced detail (A1-F4):** the counter rule carries the explicit high `maxFiresPerHour`
  (the 30/hr default freeze — the same law as #1; ALSO applies to the committed clock preset,
  flagged in the delta list).
- **Cost class:** preset-only.

### 9. Cutaways

- (Unchanged: `int(chat.messageCount) % N == 0` — the coercion now landed in the committed spec
  at f9e325ef6, verified — → guided cutaway turn.) **Cost class:** preset-only.

### 10. Spotlight balance

- (Unchanged: C1 steer preset; narrator-not-players. The D93-validation provenance is
  legacy-branch-sourced — marked UNVERIFIED-legacy by the A-round, semantics unchanged.)
- **Cost class:** preset-only (post-C1).

### 11. Research familiar (plugin)

- (Shape unchanged: `events.on(messageCommitted)` + `net.fetch` allowlist + `worldInfo.
  upsertEntry`; zero model spend.) **A-round upgrades:** the "delivery filtered to
  installer-participant chats" claim is now CODE-VERIFIED and STRICTER than claimed (membership
  AND the D16 history floor AND hidden-span stripping — `substrate/plugin-subscribers.ts`);
  the refusal-distinctness argument CONFIRMED (no model spend, no assembly duplication). **Honest
  cap correction (A1-F7):** plugin event delivery has NO hourly rate belt — the membrane caps are
  per-invocation only — so this plugin performs one external egress per committed message with no
  ceiling; the plugin self-debounces v1, and an egress rate floor is named to #24.
- **TRUTH-REPAIR 2026-08-24 (lane cb-plugin-examples, #673), on the A1-F7 clause above.** Its EGRESS half
  is DEAD: a per-plugin hourly egress floor exists and is live — `PLUGIN_EGRESS_PER_HOUR = 120`
  (`domain/plugin/substrate/rate-floor.ts:42`), minted at compose into `PluginBelts.egress`
  (`entry/compose/automation-plugin.ts:365`) and CLAIMED before every fetch, before the first await, via
  `runtime.bridge.admitEgress()` (`infra/plugin-host/membrane.ts:671` → `substrate/bridge.ts:223-225`).
  Its DELIVERY half stands: nothing rate-limits event delivery itself, so a plugin still owes its own
  debounce — which is why the shipped example gates on an explicit `((lookup: …))` marker plus a
  seen-set plus a minimum fetch gap. Also stale in the same neighbourhood: the auto-disable threshold is
  THREE consecutive crashed invocations, not twenty (`activation/crash-policy.ts:18`).
- **New:** the `neutralizeMacros`-on-plugin-lore-writes host belt (a #24 line item — and yes,
  that one call IS host-side work; the row's cost is "plugin bundle + one host belt", stated
  plainly).

### 12. `run_tool` arm (the platform row)

- (Unchanged; the axes doc §3 is the design; A-round verified every cited receipt incl. the
  nullable `ToolExecutionContext`.) **One posture added (A1-low):** an unknown tool name at FIRE
  time is `arm_error`, which counts toward the 20-consecutive-errors auto-disable — so
  deactivating a plugin would silently rot then disable every rule naming its tools; the
  mint/validate design gains a pause-not-rot posture for rules referencing deactivated plugin
  tools.

### 13. Living library (owner-global rules) — REPRICED (A1-F2/F3 + A2-F3)

- **Felt experience:** unchanged — imported characters get portraits; rules that belong to YOU.
- **The honest price (replacing "cross-system widening, no schema"):** the axes §1 design
  (admission + the owner-budget MERGE-WINDOW table + the arm scope Record) PLUS the engine seam
  the axes doc under-claimed (correction folded there): `runRule` SKIPS chat-less rules today
  (`dispatch.ts:239-242`), `DispatchFrame.chatId` and `AutomationCelEnv.chat` are non-nullable
  (11 arm-executor read sites), the bus members are chat-keyed, and **`generate_image` itself is
  chat-required as built** (`AutomationImageRequest.chatId: ChatId` — though imagery's own params
  are already nullable-ready, so the widening is automation-internal). PLUS the `contentChanged`
  gate the fun-lens fold relied on is NOT in the fact — the resolver drops it
  (`fact-resolver.ts:120-122`) — so the `TriggerFact.character` widening (field + resolver arm)
  is priced here; without it the preset is the edit-burst chore the fun lens killed.
- **Cost class:** cross-system, the largest row here: one merge-window table + the engine
  nullable-seam + one fact field. Still worth it — it is the platform re-scope made real — but
  priced as what it is. **Lives:** the `automation` settings pane (axes §5.2 — correctly the
  CURRENT home post-retraction, A2-verified).

### 14. `llm.quiet` for plugins (#24-gated)

- (Shape unchanged; affinity-tracker framing per B2-F10.) **Priced additions (A2-F4):** beyond
  the tsc-forced completeness pins, TWO vitest EXACT pins invisible to `pnpm check` — the
  13-member ordered `toEqual` on `PLUGIN_CAPABILITIES` (order IS the confirm-dialog display
  order, so the new member is also a UX-ordering decision) and the `toHaveLength(20)` over
  `HOST_FUNCTION_CAPABILITY` — the behavioral suites are owed with the member.

### 15. Oracle deck (plugin tools mid-turn, #24-gated)

- (Shape unchanged.) **Felt-experience honesty (A2-F5):** a plugin CANNOT register a client
  `ToolRenderer` — the registry is first-party, door-assembled, and an unknown tool renders the
  generic `ToolCallBlock` fallback (`contribution-contracts.ts:94-103`). So v1's chip shows the
  tool name + result in the generic block: "provably fair" SURVIVES (the draw is on canon,
  visibly), the bespoke card art does NOT. The plugin-renderer plane is a recorded gap (client
  membrane — does not exist, and is NOT #24's subject), stated so nobody prices it as free.

## §2 Graveyard — unchanged from the previous revision (all kills re-held through the A-round; the

reaction-steering conditional-kill, the keyword clock, the auto-fire recap, tags-queue, mask
notice, quest-log-keyword, campaign archive, time-of-day, swipe audit, universe sync, translator,
drop-a-link, dice-outcome clocks re-record, and the standing walls).

## §3 THE ADVERSARIAL FINDINGS TABLE

Rows 1–23: the recovery-round table (previous revision) — rows 1–3, 6, 7, 22 now carry **A2**
(independently re-derived by the completed round); rows 20/21 (the two B1 cross-cutting laws)
stand. Row 23's honesty note is superseded by the header: the A-round has now genuinely run.

**Rows 24–39 — the REAL A-round (Lens 1 = LAW/WALLS; Lens 2 = FIT/COST), each adjudicated:**

| # | Lens | Finding | Disposition |
| - | - | - | - |
| 24 | 1 | No per-chip send/compose mode exists — the law row 20 legislated an escape hatch the arm doesn't have; #4's "labels ARE the sends" = the X1 defect; #6 unreliable under the per-chat knob | FOLDED — the per-choice `mode` field priced (shared by #4/#6); #4 compose-mode; #1 left chips entirely |
| 25 | 1 | #13's `contentChanged` predicate is inexpressible — the resolver drops the field | FOLDED — the `TriggerFact.character` widening priced into #13 |
| 26 | 1+2 | The global lane is NOT "already built" at the engine: `runRule` skips chat-less rules; `DispatchFrame`/`CelEnv`/bus/`generate_image` all chat-typed | FOLDED — #13 repriced; the axes §1 claim corrected in that doc (a STALE claim in our own work) |
| 27 | 1 | Counter rules freeze at the 30/hr per-rule default; #1/#8 and the committed clock preset all carry the bug | FOLDED — preset-authoring law: counter rules set explicit caps; delta-listed for the committed preset |
| 28 | 1 | #3's F6-survival is an unruled owner fork minted by this doc | FOLDED — #3 re-classed NEEDS-OWNER with stated default |
| 29 | 1 | `chatOpened` is per-attach + viewer-blind; chips fan room-wide → reconnect spam | FOLDED — #1's invitation re-spec (host-tier, replace-per-rule) |
| 30 | 1 | #11 is genuinely NOT the refused retrieval class (no model spend, no assembly duplication) — but plugin event delivery has NO rate belt | FOLDED — verdict kept; the no-ceiling fact stated + #24 egress-floor item |
| 31 | 1 | run\_tool: deactivated plugin tools rot rules into auto-disable | FOLDED — pause-not-rot posture on #12 |
| 32 | 2 | #2's actor exclusion inexpressible on `turnCompleted` (fact carries no user identity) | FOLDED — re-specced onto `messageCommitted` |
| 33 | 2 | #2's member touches 2 tsc-invisible literal sites incl. the plugin membrane's silent downgrade + guest-visible vocabulary | FOLDED — priced in the row |
| 34 | 2 | #13's showcase arm (`generate_image`) is itself chat-required as built | FOLDED — into #13's price + the axes §1.2 list correction |
| 35 | 2 | #14 omits the two vitest exact pins (ordered 13-member `toEqual`; `toHaveLength(20)`) | FOLDED — priced |
| 36 | 2 | #15's bespoke chip is unrenderable by a plugin — generic `ToolCallBlock` fallback | FOLDED — felt experience restated honestly; renderer plane a recorded gap |
| 37 | 2 | #1+#4 chips stack on one event (per-arm cap only) | FOLDED — mooted for #1 (invitation); S1 display-cap note delta-listed |
| 38 | 2 | "zero-machinery" vs "preset-only" denoted the same price; S3 substrate itself unbuilt | FOLDED — classes normalized (§1 preamble) |
| 39 | 2 | #3 has no vars read path anywhere (B9's committed widget shares the gap); the published plane has a GUEST reader (`chat.read` `getVariables`) | FOLDED — read proc priced in #3 (B9 consumes it); the guest-reader fact stated in the fork |

**Stale-claim lens over our own work (job 3): 12 comment/doc-sourced claims re-derived → 7
CONFIRMED (several upgraded to code-sourced, e.g. the plugin visibility filter — stricter than
claimed), 3 STALE** (the axes "global lane already built" framing; the `contentChanged`-predicate
assumption; the per-chip-mode assumption rooted in the contracts:214 comment the spec's R4
already flags), **2 UNVERIFIABLE** (the D93 legacy validation line; the S2-toolNames-no-plugin-
path negative — both marked inline).

## §4 Findings that bear on the COMMITTED plan (spelled out; the reconciled DELTA LIST lives in the axes doc §5)

1. **The owner-global rule class is born in DDL, absent from spec/IA, and NOT engine-ready.**
   `automation_rules.chat_id` nullable from birth (`db/schema/automation.ts:73-76`) but the engine
   seam is chat-typed throughout (finding 26) — the axes §1 design + the corrected seam list is
   the build shape; the `automation` settings pane is the global lane's home.
2. **`run_analysis`'s output-op union needs `setVariable`** (member-visible routes don't exist) —
   with a numeric-score value contract, and the chat-vars READ surface priced with it (B9 shares).
3. **`DOMAIN_TRIGGER_TYPES` lags the domain event bus by two** (`persona.updated`,
   `world-info.updated` live on the bus, unrepresented in the tuple) — batch the widening into
   one merge window with B6's `reactionsChanged`.
4. **Plugins cannot think** — no model-call capability of any kind; `llm.quiet` over the widened
   author-scoped quiet op is the carrier; #24 reviews it once.
5. **The plugin-tool per-turn attach path is implied by the spec's own S2 pin but unspecified** —
   gates the oracle-deck class; recorded as the axes §6 unwired seam.
6. **Transform deadline (250 ms) vs `net.fetch` deadline (5 s) are structurally incompatible** —
   no fetching transform can exist; one design-warning sentence owed wherever transforms are
   taught.
7. **The tag domain already materialized suggest/confirm as durable data**
   (`character_tags.status` pending/accepted) — cross-system suggestion routes use the target
   domain's own pending-status where one exists (an S4 scope note).
8. **The image-post cascade-depth suppression holds** — depth rides out-of-band on the resolver
   return (`fact-resolver.ts:59-85`), consumed at `dispatch.ts:170,206,212` (probe-resolved).
9. **The committed spec's cadence predicate needed `int()` coercion — FOUND, FLAGGED, and now
   LANDED by the primary at f9e325ef6 (verified: all three sites patched correctly).** The
   remaining half: a `cel-goldens` vector pinning the dialect's coercion rules (mixed-type
   arithmetic throws; absent-key access throws; `has()` guards; no inline-flag regex).
10. **NEW (this round): the `surface_quick_reply` arm needs a per-choice `mode: "send"|"compose"`**
    (finding 24) and the S1 mount a chips display cap (finding 37); counter-rule presets set
    explicit `maxFiresPerHour` (finding 27 — the committed clock preset carries the same bug).
