# 03 — The Members: Kind · Trigger · Input Slice · Schema · Write Path · Failure Posture

> **Status: COMMITTED (D59, 2026-07-01) — prescriptive design; the ledger D-entry wins on any
> conflict.** Every member, fully specced on the D58 crew template (rpg-design/06 §3 is the
> reference implementation). All four share §0; the per-member sections carry only what differs.

---

## 0. The shared mechanics (stated once, binding for all four)

- **Every member = a `WorkloadKind`** (workloads.md gold standard: kind + params/result zod
  schemas + a thin runner + a `RUNNERS` entry — the five mechanical edits). Kinds:
  `crew-lorebook-keeper` · `crew-card-evolution` · `crew-director` · `crew-prose-audit`.
  Params are uniformly `{ chatId: ChatId }` (+ `variantId` for on-demand prose audits); results
  are per-kind summary counts (below) — workload-OWNED shapes, per the workloads contract rule.
- **The runner is thin**: `readRunInputs` (crew env) → `buildMessages` (the member module, pure)
  → **`runStructuredAgentTurn(env.agentTurn, messages, payloadSchema)`** → `apply*` (crew env).
  `runStructuredAgentTurn` (`@orb/server/kit/agent-payload.ts`, shared with the rpg crew — doc 05
  §e) issues ONE completion with D48 `responseFormat`, zod-parses, and on failure retries ONCE
  with the validation errors appended; a second failure throws → workload `failed`, retryable from
  the workloads UI. The JSON-repair modal stays dead. One run = one completion = one schema —
  never batched *(marinara: §10 cross-agent JSON bleed — the rejected alternative)*.
- **The brain** is the sealed `agentTurn` (buddy Option B; invariant #3 — no second agent system),
  resolved via `resolveRole('agent')` for the workload's `ownerId` (= the chat HOST; owner-
  delegated credentials per D17/§3 defaults). **No tools, no loop** — `maxTurns:1`-class pure
  structured output; a member never acts mid-run (doc 05 §b).
- **Enqueue identity**: `workloads.start({ kind, params, ownerId: host })` — the host funds crew
  turns (D19 `runAsUserId` discipline; the memory host-only-execution precedent). Economics land
  in `stats` through the existing workload paths (doc 05 §f).
- **Single-active-per-kind is GLOBAL** (the workloads partial index). The scheduler treats a
  `DomainConflictError` on enqueue as "not now": counters/marks are durable, so the member simply
  enqueues on a later tick. Acceptable at this deployment's scale; the per-`(kind, chatId)`
  active-scope widening is a flagged workloads-domain amendment with the criterion "measured
  cross-chat starvation" (doc 05 §e — the rpg crew shares this exposure).
- **Ring rule** (rpg-design/06 §6 extended): a member's INPUT slice never contains ring-above
  content relative to its OUTPUT's audience. Concretely: keeper entries and edit proposals are
  member-visible artifacts ⇒ their inputs NEVER include `crew_plots` (a director secret quoted in
  a lore entry is a spoiler leak). The director's input includes everything it owns — it IS the
  hidden hand. Enforced test-time by canary strings (doc 08 §3).

| Kind | Trigger (04 §3 scheduler) | Input slice (ring-scoped) | Output schema | Write path | Failure posture |
|---|---|---|---|---|---|
| `crew-lorebook-keeper` | pending span ≥ `keeper.minSpan` (default 48 msgs) past the protect tail; or `runNow` | transcript `(keeperLastSeq, maxSeq−16]` + keeper-book entry index + roster names. NO plot state | `crewKeeperPayloadSchema` | `worldInfo.upsertEntries` (direct write — the ONE non-proposal member) + mark advance | failed → retry; mark unmoved; re-run idempotent |
| `crew-card-evolution` | pending span ≥ `cardEvolution.minSpan` (default 128); or `runNow` | transcript slice + each HOST-OWNED roster card (via `character.getCard`) + that pair's pending proposal. NO plot state | `crewCardEvolutionPayloadSchema` | `character.proposeCardEvolution` (supersedes pending) + `notifications.emit` | failed → retry; proposals are regenerable — losing a run loses nothing |
| `crew-director` | every `director.cadenceTurns` assistant turns (default 16); or `runNow` | recent-K transcript (last ~64 msgs, token-trimmed) + `crew_plots` (arc/twists/retired) + the host `steer` | `crewDirectorPayloadSchema` | `crew_plots` UPDATE (arc/twists/guidance) — nothing else, ever | failed → retry; the previous `guidance` keeps riding GATHER (stale-but-coherent beats absent) |
| `crew-prose-audit` | `mode:"every-turn"` → each completed assistant turn; `mode:"on-demand"` → a per-message button; both post-turn async | the audited variant + the preceding window (~24 msgs) + keeper-book entry index (continuity grounding). NO plot state | `crewProseAuditPayloadSchema` | `crew_edit_proposals` INSERT (replace-pending-per-variant) + bus event | failed → retry; `verdict:"clean"` writes nothing |

---

## 1. `crew-lorebook-keeper` (B7a — the rpg-lorebook-upkeep cousin)

**Trigger — DECISION: high-water-mark span over settled transcript, NOT per-turn and NOT
memory-coupled.** The keeper processes `(keeperLastSeq, maxSeq − PROTECT_TAIL]` once the pending
span reaches `minSpan`. WHY: marinara's keeper already ran against a HISTORICAL context of older
messages, not the live turn *(marinara: §12 `buildHistoricalLorebookKeeperContext`)* — the
instinct is right: distill what is settling out of play, where swipes can no longer un-happen it.
*(Rejected: piggybacking memory's block-aging events — memory can be OFF (D36 global toggle) and
the keeper must not depend on it; the crew keeps its own seq cursor. Rejected: per-turn cadence —
it reads swipe-volatile tip content and burns a completion per turn for lore that arrives fine in
batches. Rejected: manual-only — auto-upkeep is the feature; `runNow` exists as the manual arm,
the rpg seat-invokable precedent.)*

**The book.** `keeper.bookId` names a host-owned book. `null` + enabled ⇒ on first run the domain
mints one (`worldInfo.createBook(host, "Keeper — <chat title>")`) and attaches it at chat scope
(`attachToChat`), then persists the id into config. The keeper writes ONLY this book — the
marinara read/write scope split *(marinara: §7 `writableLorebookIds`)* kept structural: the write
op is book-scoped, so the keeper cannot touch any other book by construction.

**Output schema (`@orb/contracts/crew`):**

```ts
export const crewKeeperPayloadSchema = z.object({
  entries: z.array(z.object({
    entryName: z.string().min(1).max(80),          // span-stamped by the APPLIER, not the model: "«name» (msgs 121–168)"
    keys: z.array(z.string().min(1).max(40)).min(1).max(8),
    content: z.string().min(1).max(2000),
    kind: z.enum(["world", "character", "relationship", "event"]),
    replacesEntryName: z.string().nullable().default(null),  // merge/update an existing entry instead of adding
  })).max(6),                                       // KEEPER_MAX_ENTRIES_PER_RUN
});
```

**KEYED entries, not constant — DECISION.** Entries carry keyword keys and fire through the normal
WI keyword match. WHY: memory digests already provide the always-present compressed spine; the
keeper's differentiated value is **verbatim-capable, key-triggered recall** (the rpg coherence
interlock's layer 3, rpg-design/06 §5) — "what EXACTLY did she promise in the greenhouse" fires on
"greenhouse", costs zero budget otherwise. *(Rejected: constant entries per the residue row's
literal wording — 60 constant entries is a standing budget bomb and a redundant second memory;
the rpg keeper's brief already demanded `keys[]` in its schema.)*

**Caps + idempotency + hand-edit safety (the apply rules, in `applyKeeperResult`):**

- Entries are keeper-tagged (entry metadata: `{crew: {span: {fromSeq,toSeq}, contentHash}}`) and
  span-stamped in the name — a re-run over the same span REPLACES its own entries (the rpg
  replace-same-session rule generalized to replace-same-span).
- `KEEPER_ENTRY_CAP = 60` per book: at cap the run's prompt switches to merge-mode (the entry
  index it receives says so; `replacesEntryName` becomes mandatory guidance) and the applier drops
  net-new entries beyond cap with a logged count.
- **The keeper never overwrites a host-edited entry**: the applier compares the stored
  `contentHash` against the entry's current content; a mismatch means the host curated it — the
  keeper's replacement is SKIPPED (logged). The host's hand always wins. *(Rejected: last-writer-
  wins — it makes the WI editor a lie for keeper books.)*
- The mark `keeperLastSeq` advances to the run's `toSeq` in the SAME transaction as the upsert.

**Prompt brief (versioned constant in `members/lorebook-keeper.ts`; STEAL the rpg keeper's core):**
*"Distill durable continuity only — facts that will still matter 200 messages from now. When exact
dialogue matters, copy the exact lines."* (rpg-design/06 §3, kept verbatim) + net-new: *"Prefer
updating an existing entry over adding a near-duplicate; return `replacesEntryName` when you do.
Never record secrets a character has not revealed on-screen"* (the ring rule, prompt-tier belt —
the structural belt is that plot state is simply not in its inputs).

**Result (`ResultByKind`):** `{ entriesAdded, entriesReplaced, skippedHandEdited, spanTo }`.

## 2. `crew-card-evolution` (B7b — propose-don't-dispose)

**Scope: host-owned cards only.** The runner audits each roster character whose `characters.ownerId`
= the chat host (in multi-human rooms the host owns the cast — D22/character.md; member-contributed
cards stay rejected, so in practice this is "the whole cast"). Synthetic group characters are
skipped (`synthetic=true` filter — the character.md invariant).

**Output schema:**

```ts
export const cardEvolutionChangeSchema = z.object({
  field: z.enum(["description", "personality", "scenario", "creatorNotes"]),  // the conservative evolvable set — never name/systemPrompt/postHistory (steering internals are the author's, not play's)
  op: z.enum(["append", "replace"]),
  text: z.string().min(1).max(1500),
  rationale: z.string().min(1).max(400),             // per-change, shown in the diff UI
});
export const crewCardEvolutionPayloadSchema = z.object({
  proposals: z.array(z.object({
    characterName: z.string(),                        // runner maps name→characterId from the roster slice; unknown names dropped + logged
    changes: z.array(cardEvolutionChangeSchema).min(1).max(3),   // PROPOSAL_CHANGE_CAP
  })).max(3),
});
```

**Write path:** `character.proposeCardEvolution` — inserts/supersedes the `(characterId, chatId)`
pending row (02 §5), then `notifications.emit({type:"crew-proposal", recipientUserId: owner, …})`.
The ACCEPT lives entirely in `domain/character` (02 §5): owner-only, per-change pickable,
automatic `pre-evolution` snapshot first (reversible via `restore` — the D28 history log doing
its job). *(Rejected: auto-apply-with-undo — a card is the user's authored identity artifact; the
rpg sheet-evolution/host-accept precedent + marinara's own review layer both say the human
disposes. Rejected: notifications-as-storage — the inbox is a delivery surface (notifications.md);
a proposal is a domain row the notification merely points at.)*

**Prompt brief:** *"Propose only changes the transcript EARNED: personality drift shown repeatedly,
relationships formed or broken, scenario facts that changed on-screen. Prefer `append`. If nothing
earned a change, return empty proposals"* — empty is the expected common case (the rpg
distill merge rule: empty = carry forward).

**Result:** `{ proposalsFiled, charactersAudited, spanTo }`.

## 3. `crew-director` (B8a — the hidden hand, prompt-side only)

**What it is:** every `cadenceTurns` assistant turns, one structured pass reads recent play + its
own plot state and (a) maintains a secret arc + twist bank in `crew_plots`, (b) authors the
`guidance` text the next turns will carry as a host-ring injection (04 §2). Marinara's
evaluate→author-successor double-run *(marinara: §4)* is ONE workload run with both steps inside
the runner — the rpg-director rule, unchanged.

**Output schema:**

```ts
export const crewDirectorPayloadSchema = z.object({
  arcStatus: z.enum(["active", "completed"]),
  updatedArc: z.string().min(20).max(1200).nullable().default(null),    // refresh the arc (null = carry forward — the merge rule)
  successorArc: z.string().min(20).max(1200).nullable().default(null),  // required by prompt when arcStatus="completed"
  twistOps: z.array(z.discriminatedUnion("op", [
    z.object({ op: z.literal("add"), twist: z.string().max(400) }),
    z.object({ op: z.literal("retire"), twist: z.string().max(400) }),
  ])).max(4),
  guidance: z.string().min(1).max(1200),   // the NEXT injection content — imperative, model-facing, may reference secrets
});
```

The applier enforces `TWIST_CAP = 6` (adds beyond cap dropped, logged), moves retired twists to
`retiredTwists`, swaps in `successorArc` when completed, and writes `guidance` + `lastPassSeq`.

**What it deliberately does NOT have** (the shaping — each with the reason):

- **No hidden clocks** — clocks are an rpg mechanic with an rpg HUD and tick tools; a plain chat
  has nowhere to render or resolve them. Want clocks? That's rpg mode — it exists.
- **No message posts, no canon writes, no tools** — its entire output surface is its own table.
  A director that acts is a GM; a plain chat has no GM seat.
- **No per-turn recompute** — GATHER reads the stored `guidance` verbatim (a column read, zero
  added latency); freshness is the cadence's job.

**The `steer` field** is the host's standing instruction to the director ("keep it low-stakes and
domestic", "escalate toward a confrontation") — the plain-chat analogue of rpg's
`nextSessionRequest`, and the knob that makes the hidden hand FEEL like a tool instead of a
hijacker.

**Prompt brief:** STEAL the rpg secrets framing — *"Optional pacing scaffolding. Use it when it
fits; if the story is meant to stay chill, domestic, or low-pressure, define soft ongoing tensions
instead of a rushing plotline"* (rpg-design/06 §1 `gm_secrets`, kept because it is the strongest
anti-railroading line in the corpus) + the twist vocabulary from world-gen (*"revelation | clue |
false explanation | reveal trigger | fallout"*) + net-new: *"`guidance` must steer the NARRATOR'S
choices, never the players': plant, foreshadow, complicate — do not script anyone's next action."*

**Result:** `{ arcStatus, twistsAdded, twistsRetired, guidanceChars }`.

## 4. `crew-prose-audit` (B8c — the post-turn output auditor)

**ONE kind for both marinara briefs — DECISION.** prose-guardian (style/slop/echo) and continuity
(contradiction against established fact) were two agents sharing one hold mechanism *(marinara: §6
`REWRITE_AGENT_TYPES`)*. Here they are one brief with two note kinds, because they share the same
input (a finished variant + grounding), the same output (a proposed rewrite), and the same review
flow. *(Rejected: two kinds — double the config, double the runs, for one artifact. The split
criterion, recorded: deep continuity auditing — full-canon contradiction search needing
memory/search retrieval and its own cadence — is DEFERRED; if built, it becomes a second kind
then, and it overlaps memory's future trackers/clips roadmap enough that it should be judged
against that substrate first, doc 05 §c.)*

**Trigger — on-demand-FIRST (the cost posture; RATIFIED as shipped, Nate 2026-07-01).** `mode:"on-demand"` (default): a "review this
reply" affordance on any assistant message enqueues one audit for that variant. `mode:"every-turn"`:
the scheduler enqueues per completed assistant turn — this DOUBLES the chat's per-turn model cost
and the config UI says so in plain text. *(Rejected: every-turn default — an always-on +100% cost
multiplier as a default is how a feature gets globally disabled in week one; the button teaches
the value first.)* Both are post-turn async — the turn is already persisted and streamed before
the audit exists (D53: the RECEIVE seam stays pure; marinara's turn-hold is the named anti-pattern).

**Output schema:**

```ts
export const crewProseAuditPayloadSchema = z.object({
  verdict: z.enum(["clean", "issues"]),
  proposedContent: z.string().min(1).nullable().default(null),  // full replacement text; required by prompt when verdict="issues"
  notes: z.array(z.object({
    kind: z.enum(["prose", "continuity"]),
    note: z.string().min(1).max(300),
  })).max(6),
});
```

**Write path:** `verdict:"clean"` → no row (the result records it; the on-demand button shows
"clean ✓"). `"issues"` → `crew_edit_proposals` INSERT with `auditedHash` (replaces any pending
proposal on that variant — the partial index). The **accept flow** (02 §9 staleness rules):
`crew.acceptEditProposal` verifies pending + still-selected variant + hash, then calls the
injected `chat.editMessage(principal, …)` — **chat's own `can()` decides who may edit canon**
(author/host per chat's rules); crew adds no second edit-authority model. *(Rejected: crew-side
authority re-implementation — one authority seam per resource, and messages are chat's.)*

**Prompt brief:** *"Audit the reply, not the writer. `prose` notes: echoed player dialogue,
repetition, tense/POV breaks, slop phrases. `continuity` notes: contradictions of the provided
lore entries or the visible window ONLY — never invent an off-screen fact to contradict with. A
rewrite must preserve every plot-relevant event and all speaker attributions; when in doubt,
`clean`."* The no-parroting language STEALs from the rpg reminder's block (rpg-design/06 §2) —
same failure mode, same fix.

**Result:** `{ verdict, proposalId: … | null }`.
