---
kind: spec
status: active
updated: 2026-07-03
---

# 05 — The Interconnection Map (how the crew relates to everything it touches)

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Each seam: the DECISION, the mechanism, the rejected alternative. The crew is the
> most cross-referential of the marinara adoptions — this doc exists so no seam is re-derived
> from vibes.

---

## (a) D46 automation — triggers now, rules later, NO orphaning

**DECISION: the crew's built-in cadences are PERMANENTLY scheduler-owned (04 §3); D46 gains the
ability to DRIVE crew work, never the obligation.** The Phase-8 evolution path, so nothing gets
orphaned:

- **Now (pre-Phase-8):** the scheduler subsystem + `crew_chats` config are the trigger system.
  This is a hardcoded cadence in the same sense the rpg director's counter is (rpg-design/06 §3)
  — deliberate, data-driven, one enqueue site.
- **Phase 8 (D46 lands):** (1) the crew's mirrored domain events (`crew.keeperRan`,
  `crew.editProposalCreated`, `crew.cardProposalCreated`, `crew.directorPassCompleted` — 04 §4)
  become Tier-1 TRIGGERS ("on cardProposalCreated do notify", "on keeperRan where entriesAdded > 0
  do quick-reply"). (2) The D46 closed action union gains ONE reserved-additive member,
  `enqueue_crew_workload {chatId, member}` (snake_case per the automation action-arm convention;
  automation-design/03 §1 is the union's home) — capability-gated, budget-governed — so a power user
  can author exotic triggers ("on chatOpened run the keeper"). The built-in per-member toggles
  REMAIN the normal UX.

*(Rejected: migrating the built-in cadences INTO user-visible D46 rules at Phase 8 — it turns a
checkbox into rule authoring, and deleting the scheduler saves ~100 lines while making "enable the
keeper" a two-system act. Rejected: crew-private automation semantics — a second rule engine is
exactly what D46 forbids; the crew's only "rules" are cadence numbers in its config schema.)*
This mirrors the rpg 09b posture exactly: mirror events out, keep the action union clean, reserve
one additive arm.

## (b) D48 tool loop — NO crew member gets tools

**DECISION: every member is pure structured output** (`responseFormat` + zod + one bounded retry,
03 §0). No member registers in the `domain/tool-use` registry; no member's run recurses. WHY: the
members are DISTILLERS and PROPOSERS — their entire action surface is the runner-applied payload,
which keeps the trust model legible (a workload that can only return JSON cannot exceed its
applier). *(Rejected: giving the prose auditor an `edit_message` tool or the keeper an
`upsert_entry` tool — a tool-wielding workload is an ACTOR whose blast radius is the tool set, and
the review layer stops being structural; marinara's capability-gate lesson (§10) says keep the
apply boundary on the server side of the model.)* The D48 machinery the crew DOES use is the
structured-output axis (`output.structured` capability + `responseFormat`) — a model without it
fails the run with a clear `structured_output_unsupported`-class error surfaced on the workload
row; the Tier-3b polyfill posture is inherited unchanged from rpg (rpg-design/09 §+).

## (c) memory — the two-rhythms boundary, extended (09f's argument, third rhythm)

rpg 09f held two rhythms apart: memory digests (mechanical, regenerable, pure-function-of-canon)
vs rpg session summaries (authored campaign canon). The keeper adds a THIRD artifact class —
**curated lore**: model-drafted, HOST-EDITABLE, key-triggered. The boundary table, binding:

| Artifact | Nature | Recall | Regenerable? | Owner-editable? |
|---|---|---|---|---|
| memory digest (D55) | derived index | always-assembled `{{memory}}` (mode-driven) | YES — pure function of canon; delete and rebuild | NO (editing a digest is editing a cache) |
| keeper entry (this design) | curated lore | key-triggered WI match | NO — the keeper drafts, the host may curate; a rebuild would clobber curation (the hand-edit guard, 03 §1) | YES — first-class |

Consequences: the keeper must NEVER be pitched as "memory you can edit" (it is lore extraction);
memory must never dedupe against keeper entries (different planes; the WI budget walk and the
`{{memory}}` budget are already separate line items in chat's ONE budget pass). The overlap (both
compress history) is priced the same way rpg priced `{{rpgContinuity}}` vs `{{memory}}`: different
queries — "always know the story so far" (memory) vs "recall the exact fact when its keyword
fires" (keeper). The prose auditor's continuity grounding reads keeper entries (03 §4), NOT memory
digests, in v1 — the deferred deep-continuity variant is the thing that would consume
memory/search retrieval, and its criterion is recorded in 03 §4. *(Rejected:
keeper-entries-as-a-digest-tier — breaks D55's pure-function invariant the moment a host edits
one.)*

## (d) buddy — one reaction engine, one agent pattern

Two touch points, both settled:

1. **echo-chamber IS buddy's observer** wearing a different hat — SUBSUMED BY BUDDY (ratified,
   Nate 2026-07-01; 01 §4): the capability lives in the observer, and ambient-reaction richness
   grows there via additive `BuddySignalKind` members — never a crew member.
2. **The crew consumes the SAME sealed `agentTurn`** buddy injects (Option B). The crew adds zero
   turn paths, zero provider imports, zero prompt-assembly engines — invariant #3 holds by
   construction. The crew's propose/confirm surfaces are the buddy agency gate's pattern
   (proposal + sole-executor verb + authority check) made durable in tables instead of the
   in-process Map — same ceiling philosophy, per-resource authority instead of per-user.

## (e) the rpg crew — shared plumbing, NOT a shared env

**DECISION: no generic `WorkloadCrewEnv`.** Each feature keeps its own runner-env sub-interface
(`rpg: WorkloadRpgEnv`, `chatCrew: WorkloadChatCrewEnv`) — the runner-env is "a structured, named,
typed bundle… each sub-interface the minimal op subset that feature's runners use" (workloads.md);
a generic crew env would be the junk drawer that rule exists to prevent, and the two crews' op
sets barely overlap (rpg appliers vs crew appliers). **What IS shared** (extracted because 12+
runners across both crews would otherwise copy it): **`runStructuredAgentTurn`** in
`@orb/server/kit/agent-payload.ts` — build messages → `agentTurn` with `responseFormat` → zod
parse → one bounded retry with validation errors appended → typed payload or throw. The rpg crew
runners CONVERGE on this helper when built (a note for the R6 builder; it changes no rpg
contract). Also shared for free: the workload lifecycle (single-active, retry-from-UI, progress
bus), and the single-active-per-kind global-scope exposure — the per-`(kind, chatId)` index
widening, if contention ever demands it, is ONE workloads-domain amendment serving both crews
(03 §0). *(Rejected: a `domain/agents` shared crew substrate — that is the second agent system
with a new name.)*

## (f) stats / economics — whose money, what consent, which throttle

- **Billing:** crew workloads carry `ownerId = host`; role-client binding + turn economics land in
  `stats` through the standard workload paths (the rpg 09g answer — no new stats surface, zero
  crew tables in stats).
- **Consent (D17 axes):** enabling a member is the host's explicit spend consent; the on-demand
  audit button is member-invokable ONLY under a host-enabled toggle (04 §6 — the enable IS the
  delegation). Crew turns resolve credentials via owner-delegated `resolveRole('agent')`; the
  `max-pro-sub` owner gate lives in credential resolution where it already is (D17/§3) — the crew
  adds no credential logic.
- **Throttle:** structural in v1 — default-OFF, cadence floors (`min()` bounds in the config
  schema), single-active-per-kind, and the every-turn audit mode being an explicit opt-in with a
  cost sentence in the UI. The real budget machinery (per-chat token/$ ceilings on autonomous
  work) is D46's committed budget axis; when it lands, crew enqueues route under it like
  automation-triggered generations. *(Rejected: building a crew-private budget table now — it
  would be superseded by the D46 axis within a phase.)*

## (g) multi-human — consent + rings recap (normative home: 04 §6–7)

Host enables, host funds, roster sees WHAT is enabled; artifacts ring by type (keeper →
room-visible, edit proposals → edit-authority, card proposals → card owner, plot → host); the
director's hidden hand is structurally gated by the injection `audience` field + host-only reads;
member opt-out of crew slices is reserved-additive. Nothing here invents authority — every check
is `can()` over the SAME participant/host/owner axes chat and character already enforce.

## (h) rpg mode — mutual exclusion on a chat

**DECISION: `crew.setConfig` REFUSES (CrewConflictError) while the chat has an active rpg game,
and `rpg.createGame` on a crew-enabled chat requires the crew be disabled first** (the rpg-side
check is one guard in `createGame` reading the same predicate, flagged to the rpg builder — an
rpg-design amendment note, not a redesign). Mechanism: the injected `chat.hasActiveGame(chatId)`
predicate (02 §7), wired to rpg's read at compose; a no-op `false` in rpg-less deploys. WHY: two
hidden hands (crew director + rpg director) fight; two keepers (crew keeper + rpg-lorebook-upkeep)
double-write lore; the rpg crew IS the game chat's crew. Coarse on purpose — per-member
coexistence rules have no user until someone runs a game and wants a prose auditor, and THAT
request is the criterion to revisit. (Persistent guides are EXEMPT from the exclusion — inert
prompt-side aids with no second-director or double-keeper problem; doc 06 §5.) *(Rejected: per-member allow-lists — complexity without a
user; rejected: silent auto-disable on game start — config that flips itself erodes trust.)*

## (i) notifications / world-info / character — the write seams (normative homes)

For completeness of the map: world-info's `upsertEntries`/book ops (03 §1 — the D58-committed op
reused), character's proposal table + accept verbs (02 §5), notifications' single `crew-proposal`
member (04 §5). Each is an injected op; none is a new pattern.
