---
kind: spec
status: active
updated: 2026-07-03
---

# Chat-Crew Design — the prescriptive plan for `domain/crew` (doc-set index)

> **Status: COMMITTED (D59, 2026-07-01).** The plain-chat agent crew IS a product goal — the
> Marinara-Residue B7/B8 rows are CLOSED (Nate, 2026-07-01: bring the non-game agent capabilities
> into the fold in full), and the guided-generations extension's PERSISTENT-guides half joins the
> same domain (doc 06). This doc set is the authoritative design (`Core-Laws-and-Precedents.md`
> D59 is the decision record and wins on any conflict); the marinara agent corpus is the evidence
> base (archived — `Marinara-Agent-System-Analysis.md` + `Marinara-Agent-Port-Map.md` at the
> "archive the marinara research corpus" commit `7debe31`; the marinara CLIENT and the
> guided-generations extension source were dissected fresh for docs 06–07). Everything here is
> prescriptive and self-contained: a builder with ONLY this doc set + the orbweaver law docs
> (AGENTS-1/2/3, the domain docs it cites, `rpg-design/` for the precedent pattern) can build the
> whole system. Every decision carries its WHY + the rejected alternative.

> **Triage 2026-07-09 (dispatch board — `../README.md` §0):** READY-TO-BUILD. Next: CW2 (lands tool-use T6 structured-output as its first consumer; the `worldInfo.upsertEntries` first-builder race with rpg R7 is arbitrated in 08). CW4 stays HARD-GATED on the mandatory owner director playtest.

## The one-paragraph design

Ordinary (non-game) chats gain an **async crew** — the D58 rpg-crew pattern with the game removed.
ONE thin `domain/crew` owns the per-chat crew config, the cadence state, the director's hidden plot
state, the edit-proposal queue, and the persistent-guide definitions; each MEMBER is a
**`WorkloadKind`** (params/result zod schemas, thin runner, `RUNNERS` entry) whose runner thinks
via the **sealed injected `agentTurn`** (buddy Option B — there is NO second agent system) with
D48 structured output and ONE bounded retry, and **writes through its domain-of-affect's verbs**
(world-info owns lorebook entries; character owns card proposals; chat owns message edits and
injections — all reached by injection, never sideways). Four members ship: the **lorebook keeper**
(distills aged-out transcript into keyed lore entries, direct write, capped + idempotent), the
**card-evolution auditor** (proposes conservative card diffs the OWNER accepts —
propose-don't-dispose), the **story director** (a secret arc + twist bank in a crew table,
surfaced to the model as ONE host-ring injection — prompt-side pressure only, no clocks), and the
**prose auditor** (a post-turn output audit proposing message edits — never a blocking call in
RECEIVE, D53). A fifth capability, **persistent guides** (thinking/clothes/state/situational/rules
+ custom), is interactive rather than batch: a crew VERB awaiting one free-text `agentTurn`
completion that maintains a labeled persistent chat injection (doc 06). The fifth marinara member,
**echo-chamber, is SUBSUMED BY BUDDY** — the capability is wanted and its home is buddy's
observer/reaction engine; no crew member exists for it (doc 01 §4). A domain-owned **scheduler** (the buddy observer pattern) watches the chat bus, enqueues due
members, and fires auto-guide refreshes; chat itself stays crew-blind (one optional injected
GATHER op, the rpg precedent).

## Reading order

| Doc | What it locks |
|---|---|
| [`01-verdicts-and-vision.md`](01-verdicts-and-vision.md) | the per-member build/shape/subsume verdicts (fun-test applied), the echo-chamber ↔ buddy-observer reconciliation, non-goals |
| [`02-domain-shape-and-state.md`](02-domain-shape-and-state.md) | **the director-state decision** (one `domain/crew`, the hard call argued), the 8-slot layout, `CrewContext`, all tables + config schema, staleness/swipe semantics |
| [`03-members.md`](03-members.md) | every member: kind · trigger · ring-scoped input slice · output zod schema · write path · failure posture · prompt brief |
| [`04-integration-scheduler-and-rings.md`](04-integration-scheduler-and-rings.md) | the chat graft (one GATHER op + the injection `audience` amendment), the scheduler, bus events, notifications, the `can()` matrix, multi-human consent |
| [`05-interconnection-map.md`](05-interconnection-map.md) | the nine seam answers: D46 evolution path · D48 (no tools) · memory two-rhythms extended · buddy · the rpg crew (shared plumbing) · stats/economics · multi-human · game-chat exclusion · notifications |
| [`06-persistent-guides.md`](06-persistent-guides.md) | the FIFTH capability: persistent guides (the guided-generations extension's other half) — one generic mechanism, packaged templates, the verb-not-workload run core, auto-refresh, the adjacent-findings catalog |
| [`07-client-ui.md`](07-client-ui.md) | the client/UI design: what users see per capability (run visibility, proposal review, config, failure), grounded in the marinara-client dissection — mine the WHAT, reject the HOW |
| [`08-build-plan.md`](08-build-plan.md) | CW1–CW7 shippable chunks with sizes + dependencies, what ships pre-Phase-8, the test plan |

## The verdict card (the executive summary)

| Capability | Verdict | One line |
|---|---|---|
| lorebook-keeper (B7a) | **BUILD** | `crew-lorebook-keeper` — keyed entries from aged-out transcript, direct world-info write, capped, hand-edit-safe |
| card-evolution-auditor (B7b) | **BUILD** | `crew-card-evolution` — proposals in a `character`-owned table; owner accepts with an automatic pre-evolution snapshot |
| story director (B8a) | **BUILD (shaped)** | `crew-director` — arc + twists in `crew_plots`, ONE host-ring guidance injection; no clocks, no tools, no message posts |
| echo-chamber (B8b) | **SUBSUMED BY BUDDY** | the capability is wanted; its home is buddy's observer (PD-45/64) — ambient-reaction richness grows there via additive `BuddySignalKind` members, never a crew member |
| prose-guardian / continuity (B8c) | **BUILD (shaped)** | ONE `crew-prose-audit` kind (prose + local continuity in one brief), on-demand-first, propose→review→`chat.editMessage` |
| persistent guides (guided-generations) | **BUILD** | one generic guide mechanism (verb-not-workload) + packaged templates; maintains labeled persistent injections; auto-refresh opt-in |

## Standing decisions a cold agent must not re-litigate

No second agent system (buddy invariant #3 — every capability thinks via the ONE sealed
`agentTurn`) · nothing crew-ish ever blocks a turn (D53 — marinara's `shouldHoldForTextRewrite`
hold and its mid-turn injection-review modal are the named anti-patterns) · no crew member gets
tools (members are pure structured output; guides are pure free-text — anything that "acts"
mid-run is an actor, not a proposer) · chat gains NOTHING crew-specific beyond one optional
injected op + the additive injection `audience` field + the client `message-footer` slot region ·
card evolution is propose-don't-dispose (the owner accepts; never an autonomous card write) ·
guide CONTENT has one home (the `chat_injections` row; `crew_guides` is definition only) · the
four MEMBERS never run on a chat with an active rpg game (the rpg crew is that chat's crew; guides
are exempt — inert prompt aids) · echo-chamber is SUBSUMED BY BUDDY — ambient reactions grow
ONLY through the buddy-observer extension path (01 §4), never a crew member · enablement is
HOST-only, per chat, default OFF for every member and every auto-refresh (keeper default-OFF
ratified; revisit-on-evidence criterion stands — 02 §6).
