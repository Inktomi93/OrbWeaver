---
kind: spec
status: active
updated: 2026-07-03
---

# 01 — Verdicts and Vision: what the plain-chat crew IS (and what lives elsewhere)

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** The mission, the per-member verdicts, and the one reconciliation this feature forced
> (echo-chamber vs buddy's observer). Marinara evidence cited `(marinara: …)` — one-line anchors
> into `Marinara-Agent-System-Analysis.md` (git `7debe31`), the verified dissection of the original
> 21-agent pipeline.

---

## 1. What this is

The D58 rpg crew proved a shape: **async model-brainwork as WorkloadKinds on the sealed
`agentTurn`, writing through domain-of-affect verbs, with structured output + one bounded retry**.
This doc set extends that shape to ORDINARY roleplay chats — the four marinara capabilities Nate
committed to bring into the fold in full (residue rows B7 + B8):

1. **lorebook-keeper** — auto-distill durable continuity from play into lorebook entries.
2. **card-evolution-auditor** — propose conservative character-card updates from play.
3. **story director** — secret plot pressure for plain (non-game) roleplay.
4. **prose-guardian / continuity** — post-turn output auditors proposing edits.

(Marinara's fifth ambient member, echo-chamber, is evaluated in §4 and SUBSUMED BY BUDDY —
wanted, homed in the observer, not a crew member.)

A fifth capability joined the same domain during design (Nate, 2026-07-01): **persistent guides**
— the guided-generations extension's other half (side generations maintaining labeled persistent
injections: thinking/clothes/state/situational/rules + custom). It is interactive rather than
batch, so it runs as a crew VERB, not a WorkloadKind — doc 06 is its complete spec, including the
catalog of the extension's remaining scraps (spellchecker, edit-intros, tracker notes) so nothing
is silently lost.

They are designed as ONE system — one domain, one config surface, one scheduler, one review
vocabulary — because they interlock: the keeper's entries feed the auditor's continuity grounding,
the director's cadence shares the scheduler, and every member shares the proposal/accept trust
model. Four independent bolt-ons would mean four config homes, four cadence mechanisms, and four
half-review-surfaces — the exact scattering the residue §3 post-mortem warns against.

## 2. What marinara actually did (the evidence floor)

One-line facts this design is built on (all verified in the Agent-System-Analysis):

- The pipeline was 3-phase, orchestrated inline in an 11,227-line god-route; results applied by a
  ~1,400-line `switch(result.type)` *(marinara: §3, §10)*. **Dismantled, not ported** — the
  Agent-Port-Map verdict is now enacted law (D58 crew + buddy invariant #3).
- **lorebook-keeper bypassed the pipeline**: a direct `executeAgent` call against a specially built
  "historical" context processing OLDER messages, not the live turn *(marinara: §12,
  `buildHistoricalLorebookKeeperContext`)*. That instinct — distill what's leaving the window, not
  the volatile tip — is kept (doc 03 §1 trigger).
- Agents had **per-agent persistent memory** (`context.memory`, written back via
  `agentsStore.setMemory`) — the director's `_secretPlotState` lived there and the director could
  **run twice in one turn** (evaluate → if arc complete, immediately re-run to author a successor),
  blocking the turn *(marinara: §4, §7)*. Kept as: real typed state in a real table
  (`crew_plots`), the double-loop folded into ONE async workload run (the rpg-director rule).
- Lorebook write scope was a **separate permission list from read scope** (`writableLorebookIds`
  vs `activatedLorebookEntries`) *(marinara: §7)*. Kept as: the keeper writes ONLY its configured
  book (doc 03 §1).
- **The capability gate was the one real trust boundary**: built-in agents applied freely; a
  user-authored agent needed a matching capability flag or its result was silently dropped
  *(marinara: §10, `customAgentCanApplyResult`)*. Orbweaver's equivalent is `can()` on every crew
  verb + the D48 registry rule — kept structural, not bolted on.
- **An injection-review layer existed**: some writer-agent injections went through user
  review/approval before commit *(marinara: §12, `REVIEWABLE_WRITER_AGENT_TYPES`)*. Kept and
  strengthened: card evolution and prose audits are propose-ONLY; a human accepts.
- **prose-guardian/continuity could make generation WAIT** (`shouldHoldForTextRewrite`)
  *(marinara: §6)* — the named anti-pattern. Orbweaver's auditors are strictly post-turn async
  (D53: never a blocking nested LLM call in RECEIVE).
- Batching heterogeneous structured completions by `(provider, model)` caused **cross-agent JSON
  bleed** that forced defensive carry-forward parsing *(marinara: §10)*. Kept as law: one workload
  run = one completion = one schema. No batching of crew payloads, ever.
- Each agent could target its **own provider/model** *(marinara: §9)* — kept as a deferred lean
  (doc 05 §f): v1 crew thinks via `resolveRole('agent')`; per-member model overrides wait for a
  real want.

## 3. The per-member verdicts (the fun test, applied honestly)

The rpg fun test (rpg-design/01 §2): *does it create a player decision or a visible consequence?
If it only mutates numbers nobody sees or decides on, it's simulation noise.* For a NON-game crew
the test adapts: **does it produce an artifact a user sees, uses, or decides on?**

| Member | Artifact | Verdict |
|---|---|---|
| lorebook-keeper | keyed lore entries that FIRE in later prompts (verbatim recall memory digests can't give) + are browsable/editable in the WI editor | **BUILD** — visible, durable, decision-bearing (the host curates the book) |
| card-evolution-auditor | a reviewable card diff with rationale; accept = the card grows with play | **BUILD** — the accept IS a user decision; the diff is the visible artifact |
| story director | narrative direction the user FEELS (the model stops meandering) + a host-readable plot panel | **BUILD (shaped)** — the artifact is indirect but real; marinara users ran it by choice. Shaped THIN: prompt-side pressure only (no clocks, no state writes beyond its own table) because every visible-consequence lever (clocks, HUD, encounter pressure) belongs to rpg mode — a plain chat has nowhere to render them (rejected: porting clocks to plain chats — that's rpg mode without the game, and rpg mode exists) |
| echo-chamber | ambient reactions alongside the main reply | **SUBSUMED BY BUDDY** — §4 (the capability has a home; it is not a crew member) |
| prose-guardian / continuity | a reviewable edit proposal on a finished reply | **BUILD (shaped)** — ONE kind covering both briefs; on-demand-first (doc 03 §4 argues the cost posture) |

## 4. The echo-chamber ↔ buddy-observer reconciliation (SUBSUMED BY BUDDY)

**What it was:** marinara's `echo-chamber` ran in the parallel phase (runtime-forced — *(marinara:
§5, `resolveAgentRuntimePhase`)*), generating ambient reactions alongside the main generation.

**Why it is not a CREW member.** Its output has exactly two possible destinations, neither of
which a crew workload serves:

1. **Into canon** (posted as messages) — then it's an uninvited speaker. Orbweaver's roster +
   arbitration system ALREADY owns "other characters react": per-turn re-arbitration,
   talkativeness, auto-mode AI→AI chaining (chat.md Part III). A parallel ambient generator would
   be a second, worse arbitration engine — the residue §4 record exists precisely so nobody
   rebuilds group behavior from marinara parts.
2. **Ephemeral flavor** (side-channel chatter that evaporates) — then it is, verbatim, **buddy's
   observer** (buddy.md `observer/`, PD-45/64): one normalized signal in → at most one quip out,
   throttled, deduped, per-user SSE bus. That engine is DESIGNED (buddy.md — signal taxonomy,
   throttle/dedupe, the event-source seam) but **DEFERRED behind PD-45/64, not yet built or wired**
   (`domain/buddy/index.ts` carries the deferral note; only `BuddySignalKind` exists in the tree —
   design-review CREW-2 correction). The subsumption verdict binds regardless: when the observer
   lands, echo-chamber richness grows THERE.

**The reconciliation rule (binding — RATIFIED, Nate 2026-07-01):** the CAPABILITY IS WANTED and
it HAS A HOME — buddy's observer is orbweaver's ambient-reaction engine, and echo-chamber is
SUBSUMED by it. Ambient-reaction richness grows THERE: **additive `BuddySignalKind` members fed
from chat-bus events** (e.g. a scene-beat signal), rendered by buddy's existing quip surface —
ONE reaction engine, never a crew member, never a parallel per-turn agent. *(Rejected: a
`crew-echo-chamber` WorkloadKind — it would duplicate the observer's throttle/dedupe/mood
machinery or lack it, and its per-turn LLM cost buys flavor text nobody acts on. Rejected:
recording this as a cut/rejection — the record must read "this capability has a home," because a
cold agent reading "CUT" would neither build the buddy signals nor stop a re-proposal framed
differently.)*

Echo-chamber's residue row flips to DECIDED-subsumed with this section as the record.

## 5. Non-goals (explicit)

- **No crew for buddy's solo transcript** — `buddy_turns` is not a chat; buddy has its own
  reaction/agency design.
- **No crew on rpg game chats** — the rpg crew (D58) is that chat's crew; `crew.setConfig` refuses
  on an active game (doc 05 §h).
- **No autonomous canon writes** — no member posts messages, edits messages, or rewrites cards on
  its own authority. The keeper's direct lorebook write is the ONE deliberate exception (doc 03 §1
  argues it: entries are capped, visible, hand-editable, and prompt-side — the blast radius of a
  bad entry is one deletion).
- **No per-member model pickers, budgets UI, or member-authored rules in v1** — deferred with
  criteria (doc 05).
- **No new client framework surface** — review chips + one config panel ride the D44 world
  (doc 04 §7).
