# Marinara Agent System → Orbweaver Port Map

> **Status: research / port-planning.** The port strategy for bringing marinara's agent pipeline into
> Orbweaver's domain-isolated model. Pairs with [`Marinara-Agent-System-Analysis.md`](Marinara-Agent-System-Analysis.md)
> (the verified *analysis* of what marinara's agent system actually does). This doc is the *strategy*.
> Aligns with the RESOLVED decision in [`domains/buddy.md`](../domains/buddy.md) (agent = a pattern, not
> a domain) and D48 (tool recurse loop).
>
> Supersedes the prior Gemini-authored `Agent-System-Migration.md` (deleted — it claimed
> `generate.routes.ts` was "~2,500 lines"; it is **11,227**, and 8 agent-pipeline call-sites live in it).

---

## 1. What marinara does (one-paragraph recap)

The agent system is a functional 3-phase pipeline (`pre_generation` → `parallel` → `post_processing`),
orchestrated inline in the **11,227-line `generate.routes.ts`** god-route (8 pipeline call-sites there).
Agents return a custom `AgentResult` payload; the route applies side-effects via a large
`switch(result.type)` dispatch (~1,400 lines, per [`Marinara-Agent-System-Analysis.md`](Marinara-Agent-System-Analysis.md)
§10). Five agent types bypass the pipeline entirely (director secret-plot double-loop,
knowledge-retrieval/router, lorebook-keeper, the text-rewrite editor), hand-rolled directly in the route.
Full detail is in the analysis doc; this doc is only about where it goes.

## 2. The core contradiction (why a direct port is illegal)

Porting marinara's pipeline verbatim breaks three Orbweaver constraints:

- **Invariant #3 — one turn path, no second agent system** (buddy.md). A centralized "agent pipeline
  orchestrator" *is* a second agent system.
- **Dumb-adapter routes / one-way flow.** Pushing pipeline orchestration, side-effect dispatch, and
  capability gating into a route god-object is exactly the tier violation Orbweaver forbids.
- **The `RECEIVE` seam is for pure `kit` engines only** (D53 — regex, macro). A post-gen agent firing a
  *nested blocking LLM call* inside `RECEIVE` breaks the synchronous pipeline and injects silent latency.

## 3. The port strategy — dismantle the orchestrator, distribute the phases

Keep marinara's good parts (pure functions, context payloads, the propose/confirm capability ceiling);
delete the god-object by **composition**, not a `domain/agent-pipeline`.

### 3.1 Each phase gets a native Orbweaver home

| Marinara phase | Example agents | Orbweaver home |
| --- | --- | --- |
| **Pre-generation** | knowledge-retrieval, knowledge-router | A **domain verb invoked in the chat `GATHER` phase**, returning `Injection[]` that `BUILD` slots into the prompt. No pipeline phase needed. |
| **Parallel / ambient** | (the media agents, ambient analysis) | **Async listeners on the chat event bus**, or **`workload` jobs**. Never block the turn. |
| **Post-processing** | prose-guardian, continuity | Either (a) run *during* the turn as an agent principal via the **D48 tool recurse loop**, or (b) run **asynchronously as a Workload** that audits the finished output and proposes edits out-of-band. **Never** a blocking nested call in `RECEIVE`. |

### 3.2 Replace `AgentResult` + the switch with MCP tool calls (D48)

Kill the custom `AgentResult` payload and the ~1,400-line dispatch switch. Per D48, structured actions
are native tool calls:

- The `chat` domain owns the recurse loop (OpenAI-wire path).
- When an agent wants to mutate state it emits a JSON-schema **tool call**; the chat domain catches it,
  runs the owning domain's verb directly, and recurses until done.
- Side-effects are contained in the domains that own the data — not scraped from a payload in a route.

### 3.3 Stateful bypasses become their own thin domains + Workloads

Marinara's director runs a **stateful double-loop** to resolve a secret plot before the user can reply —
a synchronous while-loop blocking the turn, which Orbweaver forbids. Port it as its own thin
`domain/director` owning a `director_plots` table, whose loop runs **asynchronously as a `WorkloadKind`**
using the injected `agentTurn` runner to think. Same treatment for lorebook-keeper (its own domain +
async workload).

## 4. The housing rule — "Domain of Affect" (no agent-domain explosion)

Adding N specialized agents does **not** mean N new domains. An agent lives inside the domain that owns
the data it manipulates:

- **Just chats?** → a row in `characters`, using the existing `chat` domain. No new anything.
- **Manages world info?** (auto-summarizer, fact-extractor) → a **verb inside `domain/world-info`**: it
  builds the prompt, calls `agentTurn()`, writes to its own tables.
- **Introduces a genuinely new subsystem?** (director's secret plots, buddy's Tamagotchi mechanics) →
  *only then* a new thin domain.

The `chat` domain and the turn path never know these worker agents exist. Delete an agent = delete a verb
from its owning domain; nothing else moves.

## 5. Buddy stays exactly as-is (do NOT centralize)

The recurring temptation — "build one central agent system that buddy is part of" — is the exact trap
buddy.md was written to prevent. Orbweaver's resolved position (buddy.md Option B): **agent is a
PATTERN, not a domain.** The intelligence is a sealed `agentTurn` in `infra/providers`; `buddy` is a thin
domain that *composes* it (constructs its `(soul, tools, connection, view)` and injects the turn). A
central `domain/agent` that had to know buddy's gacha/mood/trace mechanics would instantly become the
monolith. Every new agent (director, lorebook-keeper) follows buddy's lead: own thin domain, own tables,
call `agentTurn` for a brain.

## 6. Port order (de-risked)

1. **Confirm the `agentTurn` seam** (`infra/providers`) + the D48 tool recurse loop exist and are the
   only agent-execution path (buddy already needs this).
2. **Pre-gen agents → GATHER verbs** (knowledge-retrieval/router first — they already bypass the pipeline,
   so they port cleanly).
3. **Post-gen evaluators → Workloads** (prose-guardian/continuity as async output-auditors proposing edits).
4. **Director / lorebook-keeper → thin domains + WorkloadKinds** (the stateful bypasses).
5. **Delete `AgentResult` + the dispatch switch** as each side-effect type becomes a tool-call → verb.
6. There is no step "build the pipeline" — the pipeline is what we're dismantling.

## 7. Cross-refs

- [`Marinara-Agent-System-Analysis.md`](Marinara-Agent-System-Analysis.md) — verified analysis (the "what")
- [`domains/buddy.md`](../domains/buddy.md) — agent-as-pattern (RESOLVED, Option B); the first consumer
- D48 — tool recurse loop (structured actions native); D53 — RECEIVE-seam-is-pure-kit
- [`rpg/07-port-map.md`](rpg/07-port-map.md) — the parallel RPG port map (same dismantle-the-god-route shape)
