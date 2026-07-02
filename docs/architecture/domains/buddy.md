# Orbweaver — `buddy`: the first `agent`-role consumer (soul instead of a card)

> **Status: planning (authoritative detail).** The buddy domain owns the per-user Tamagotchi
> companion: its **soul** (model-authored identity), its **bones** (deterministic gacha body), its
> **reaction engine** (alive — reacts to real app events), and its **agency** (limited, confirmed
> hands). The defining change from neo-tavern: buddy stops being an **ad-hoc second agent system**
> (hand-rolled router + own prompt + own credential resolution + a firewalled-out turn path) and
> becomes **the first consumer of the `agent` abstraction** — "an agent with tools + its own
> connection + a soul instead of a card," composed via chat's ONE stateless turn path. Authoritative
> upstream: `participants-agents-identity.md` §0/§2/§6 (the agent model + the open
> agent-as-domain-vs-pattern decision) — **the governing doc**; `domains/connection.md` §1
> (`resolveRole('agent')` — buddy's own backend/model); `AGENTS.md` §4 (buddy pain
> entry), §7.1 + §8.6 (first-class principal); `core/Core-Core-Legacy-Migration-and-Gaps.md` §4 (`contracts/buddy`
> taxonomy), §1 (`replay-buffer` → kit), §5 (the credentials injection). `Core-0-Architecture-and-Structure.md` §4 is the
> 8-slot template this domain follows.

---

## What this domain owns

- **The buddy identity (`buddies` row, PK = `userId`, one per user, created lazily at hatch)** — the
  **soul** (`name`, `personality`, model-authored once at hatch), the **bones**
  (`rarity`/`species`/`eye`/`hat`/`shiny`/`stats`, snapshotted at hatch then MUTABLE — stats _grow_),
  and **reaction/agency state** (`mood`, `lastReactionAt`, `lastSignalKey`, `reactionsEnabled`,
  `bondXp`, `agencyEnabled`).
- **The deterministic gacha roll** (`roll(userId)`) — FNV-1a + mulberry32, salt
  `tavern-buddy-2026-01`, **frozen draw order** (`rarity → species → eye → hat → shiny → stats`).
  Drives the pre-hatch preview AND the hatch snapshot.
- **Soul generation at hatch** — `generateSoul`: a vLLM `summarize` call (`jsonSchema` guided
  decoding, seeded by the bones so the soul matches the body), with a canned fallback when the engine
  is down. Idempotent hatch (PK-race → reload the winner).
- **The reaction engine (`observer/`)** — one normalized `BuddySignal` in → at most one quip + mood
  shift + stat/bond growth out, throttled (cooldown) + deduped (`lastSignalKey`). Workload/chat/trace/
  presence sources; the optimistic-CAS write; the fire-and-forget `react()` that must never throw into
  the loop; the 30s trace sampler; the presence sweep.
- **The mood machine + derived facets** (pure) — `moodForSignal`/`resolveMood`/`decayMood` (priority +
  hold window + lazy read-time decay), and `bondTierOf`/`stageOf`/`formOf` (relationship tier,
  maturity stage, archetype form — all DERIVED from stats/bondXp, never stored).
- **The buddy-chat transcript (`buddy_turns`)** — the solo user⇄buddy conversation, persisted so it
  survives reloads AND feeds back as the buddy's memory (its egocentric **view**). `ask` (the agent
  turn), `confirm`, `history`, `clearChat`.
- **Agency — the curated hands (`agent/`)** — buddy's tool DEFINITIONS + handlers (read-only
  status/counts + `propose_*` tools, closed over `(db, userId)`), registered into the ONE
  `domain/tool-use` registry at compose (D48; `proposed/tool-use-design/`), the **propose/confirm
  gate** (a proposal Map; `buddy.confirm` is the ONLY executor), the **kill switch**
  (`agencyEnabled`), the **hourly mutation rate-limit**.
- **The quip log (`buddy_quips`)** — the reaction engine's spoken output, swept to ~20/user
  (hover-history; the live bubble is ephemeral SSE).
- **The live bus (`bus.ts`)** — the per-user `quip`/`moodChanged`/`evolved` SSE channel + late-subscriber
  replay window, fanned out by the tRPC `buddy.stream` subscription.

This domain does **not** own: the **agent-turn runner** (that is `infra/providers` — sealed;
`runAgentTurn` with the firewall lives there; buddy consumes it through an injected op); the
**credential resolver / vLLM mint** (that is `credentials` — injected per `credentials.md`); **connection
routing** (that is `connection`'s `resolveRole('agent')` — the hand-rolled `resolveBuddyRouting`
is **deleted**); the **taxonomy enums** (those are `@orb/contracts/buddy`; `@orb/db` imports them for
enum columns); the **sprites / ASCII rendering** (that is `@orb/client` — presentation); the
**replay-buffer** (that is `@orb/kit`); the **cross-feature event sources** (workload/chat buses, trace
ring — injected via the observer env from `chat`/`workloads`/`foundation/observability`); the
**first-class-principal mechanics** (`provisionAgentPrincipal`, the `authorUserId` stamping path, the
`chat_participants.kind` split — those are the identity spine, §8.6; buddy only flags the blast radius).

---

## The defining change (the governing reframe)

> **Buddy is the first consumer of the `agent` abstraction, not a second agent system.**
> An agent = `(identity, connection, view, tools)` (`participants-agents-identity.md` §2). Agent mode
> (tools + a multi-turn loop) is **opt-in on the ONE stateless chat-turn path** (§0, invariant #3).
> Buddy is just "an agent with tools + its own connection + a **soul** instead of a card."

The four parts, mapped onto today's buddy:

| Agent part     | neo-tavern buddy (ad-hoc)                                                                                              | orbweaver buddy (composed)                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **identity**   | the `buddies` soul (`name`/`personality`) + `buildBuddySystemPrompt`                                                   | the same soul — the character-card identity shape **minus the card** (§2). The system-prompt builder stays buddy-local (its persona has no card scaffolding).                                                                                                                                                                                                  |
| **connection** | `resolveBuddyRouting(role)` — a hand-rolled `admin→max-pro-sub haiku, else vLLM` switch, the `BUDDY_SUB_MODEL` literal | **`resolveRole('agent')`** + a per-agent override (§1, the new per-agent routing axis). Buddy's "always cheap" is just its connection. The owner gate stays in credential resolution (`max-pro-sub` is owner-only, D17). The owner's buddy inherits the owner's box sub via owner-delegated `credentials.resolve`; a non-owner's buddy never resolves the box. |
| **view**       | the `buddy_turns` transcript + `buildPromptWithMemory` + `fitSeedToBudget` (its own memory)                            | the buddy's egocentric **view of canon** — for the solo buddy chat, the `buddy_turns` transcript IS the view; the budget-trim is the view-builder's window discipline.                                                                                                                                                                                         |
| **tools**      | tool definitions + handlers (`agent/tools.ts`), registered into the ONE D48 tool-use registry                          | unchanged in spirit; the firewall (agent-mode attaches ONLY this agent's registered projection; non-agent turns attach none) becomes a property of **agent-mode in the sealed runner**, not a buddy-local concern.                                                                                                                                             |

What this dissolves (the pain ledger, `AGENTS.md` §4):

- **No hand-rolled router** — `resolveBuddyRouting` is deleted; the brain is `resolveRole('agent')`.
- **No second turn path** — `ask` no longer imports `#server/providers` `runAgentTurn` directly; it
  composes the **one** chat-turn path via an injected op (invariant #3: "no second agent system").
- **No exiled credential reach** — `resolveCredential`/`mintVllmCredential` come via injection from
  `credentials` (the `buddy.context` injection table in `credentials.md`).

---

## The KEY open decision — `agent` as a thin domain vs a pattern (DO NOT unilaterally resolve)

`participants-agents-identity.md` §6 leaves this open: _"fold buddy's ad-hoc memory/routing/prompt into
the agent abstraction, or keep buddy as the first consumer that proves the abstraction?"_ The two
readings:

- **Option A — `agent` is a thin shared DOMAIN** (`domain/agent`). A real feature that owns the
  stateless-first agent turn (`runAgentTurn(systemPrompt, view, connection, tools?)`), the firewall,
  and the egocentric view-builder; chat and buddy both consume it.
  - _Pro:_ one home for the agent turn + the firewall + the view-builder; tool-using characters (future)
    and buddy share it; the `(identity, connection, view, tools)` shape has an owner.
  - _Con:_ a new domain that mostly **delegates** to chat's assemble + the sealed providers runner —
    exactly the "indirection earning nothing" the brief (§3 / §6B) warns to collapse. Chat already owns
    the turn path; invariant #3 says there is only ONE.

- **Option B — `agent` is a PATTERN composed by chat + buddy** (no new domain). The agent turn IS
  chat's one turn path; "agent mode" is a `tools?`/loop flag on it. Buddy stays a thin domain that owns
  soul/bones/reactions/agency/transcript and **injects** the turn (an injected `agentTurn` op wired at
  entry) + supplies its own `(soul, connection, tools, view)`. The shared _vocabulary_ (the
  `(identity, connection, view, tools)` shape + the `AgentTurnRequest`/`runAgentTurn` seam) lives in
  `@orb/contracts` + `infra/providers` — shared **types without a shared domain**.
  - _Pro:_ honors invariant #3 (one turn path, agent mode is a flag, no second agent system); no
    indirection; buddy stays small and legible.
  - _Con:_ chat's turn path must expose a clean **agent-mode seam** buddy can call without importing chat
    internals (the composition-root injection); the firewall must live in the sealed runner (it already
    does — `providers/run-agent.ts` + `buildAgentOptions`), not in chat.

**RESOLVED: Option B (pattern), NOT a new `domain/agent`.** `agent` is a PATTERN composed by chat +
buddy: the agent turn IS chat's ONE stateless turn path, "agent mode" is a `tools?`/loop flag on it, and
the firewall + the stateless agent-turn seam live in `infra/providers` (sealed, already there). Buddy
stays a thin domain (soul/bones/reactions/agency/transcript) and **injects** the turn as an `agentTurn`
op wired at `entry/`, supplying its own `(soul, connection, tools, view)`. The shared agent _contract_
(the `(identity, connection, view, tools)` shape + the `AgentTurnRequest`/`runAgentTurn` seam) lives in
`@orb/contracts` + `infra/providers` — shared types WITHOUT a shared domain. Rationale: invariant #3
forbids a "second agent system," and a `domain/agent` that merely delegates to chat + providers is the
most likely place for that second system to regrow. (Consistent with the fan-out ledger: "`agent` = a
PATTERN, not a new domain.") The one remaining sub-question — does the agent-turn composition op get
EXPOSED by the chat domain or constructed directly at `entry/` from the sealed runner — is a chat-domain

- spine call; see the deferred item below.

---

## The §8.6 first-class-principal transition (blast radius — defer the mechanics)

> **D60 (2026-07-01): the mechanics this section defers are now FULLY DESIGNED — authoritative:
> [`../proposed/agent-principal-design/`](../proposed/agent-principal-design/README.md) (solo
> `buddy_turns` survives byte-identical; the inversion + seating are its doc 04).

Today the buddy is **not** a `users` row. `buddies.userId → users.id` makes it act **as the owner**, and
that borrowed identity gives three safety properties _for free_:

1. **The kill switch** (`agencyEnabled`) — hands off ⇒ no tool turn at all.
2. **The propose/confirm gate** — the agent only `stashProposal`s; `buddy.confirm` is the **sole**
   executor (gated on ownership + `agencyEnabled` + the hourly rate-limit).
3. **The `buddy_turns` firewall** — the buddy writes NO chat `messages`; `BuddyAgentRequest` has no
   `chatId` (passing chat context is a **compile error**); the transcript is its own table.

`AGENTS.md` §8.6 (LOCKED) makes agents **first-class principals**: buddy gets its own `users` row
(`provisionAgentPrincipal` — precedent: the synthetic `__group__${chatId}` character,
`mintSyntheticGroupCharacter` in `character.md`), a seat in `chat_participants`, and **self-attributed
messages** (`authorUserId` = the agent). **This inverts the `buddy_turns` firewall — an agent principal
CAN write to `messages`.** The blast radius (grounded by `reports/principal-scout.json`):

- **`chat_participants.kind` is overloaded** (identity-table _and_ human-vs-AI). A buddy principal is
  **both** userId-backed _and_ AI-driven — currently unrepresentable (the XOR forbids a row with both).
  Needs a `kind:"agent"` / `isAi` axis split.
- **`authorUserId` is never stamped on the live send path** today (only a one-time backfill, hardcoded to
  owner) → threading a real principal-id is a NEW build.
- **`loadOwnedChat` owner-equality** → `requireParticipant`/`requireHost`.
- **The `buddies.userId` owner-link** splits into owner-link-vs-own-principal.

**The safety that was free must survive as an EXPLICIT capability ceiling.** Under the principal model an
agent is no longer "just the owner," so the kill switch + propose/confirm gate + rate-limit become the
enforced **capability ceiling** (the permission model's global×resource×capability, `AGENTS.md`
§7.1), not an emergent property of borrowed identity. **Mechanics defer to the identity spine
(`core/Spine-Identity-and-Auth.md`); buddy's job is to (a) keep the gate + kill-switch + rate-limit as the
ceiling, and (b) note that the `buddy_turns`-vs-`messages` firewall inverts when buddy becomes a
participant.**

---

## Esoteric / load-bearing (flag, preserve)

- **The agent firewall (structural).** `buildAgentOptions` starts from the roleplay firewall base
  (`tools:[]`, cowork denylist, strict tool config, credential-scoped env); the agent-mode turn ADDS
  ONLY the agent's registered projection — the tool-use `project-mcp` output for THIS agent's tool
  set (`proposed/tool-use-design/02`) — plus `maxTurns`. Non-agent (roleplay) turns attach NO tools
  and `maxTurns:1` — **that asymmetry IS the firewall.** It now lives in `infra/providers`
  (sealed) as the property of _agent-mode_; never attach a tool projection to a non-agent turn.
  *(neo provenance: `mcpServers:{neo-tavern}` + `allowedTools:["mcp__neo-tavern__*"]` vs
  `mcpServers:{}` — the buddy-local MCP server this registry projection replaces.)* The OAuth
  credential firewall (empty config dir, OAuth sources nulled) is preserved on every routing path —
  **never extract the OAuth token** (ban risk, per project memory).
- **The propose/confirm gate + kill switch (the capability ceiling).** A confused/runaway model can
  _suggest_, never _act_. This is the safety the borrowed-owner identity gave for free; under §8.6 it must
  survive as the explicit capability ceiling (above).
- **The in-process proposal Map + mutation rate-limit — `ASSUMES(single-replica)`.** `agent/proposals.ts`
  (TTL 5min, keyed by userId, replace-on-new) and `agent/rate-limit.ts` (sliding hourly window) are
  module-scope Maps. A propose on replica A + confirm on replica B would miss each other; the budget
  would multiply by replica count. **A locked NOTE, not a bug** — keep the `ASSUMES(single-replica)`
  annotation; the fix-if-reversed is a `buddy_proposals` / `buddy_rate_limits` table (same TTL +
  replace/atomic semantics).
- **The deterministic gacha is byte-stable (the AAD-style invariant).** The salt `tavern-buddy-2026-01`
  - the frozen draw order are load-bearing: rotating the salt or reordering the draws **re-rolls every
    user's pre-hatch preview**. Treat as frozen once buddies exist.
- **The soul-gen + idempotent hatch.** vLLM `summarize` with `jsonSchema` guided decoding (free, local),
  canned fallback on engine-down; the `loadBuddy` null-guard is check-then-act, so a PK constraint
  violation on the concurrent-insert loser → reload the winner's row (both callers see the same soul).
- **The reactor's optimistic-CAS loop.** Bypass-cooldown signals (`workload:failed`,
  `trace:error-spike`) can race the same row; the UPDATE is gated on the loaded `updatedAt` (0 rows ⇒
  reload + recompute), bounded to 3 attempts. `bondXp` is a **server-side `sql` increment** (not
  read-modify-write) because the row was read before a multi-second turn.
- **Lazy mood decay at read time** (no poll write): a buddy quiet >15min reads `content`. `resolveMood`
  priority + hold window keeps a failure's `anxious` alive past a routine `content`.
- **`RARITY_STARS` is unwired display intent — KEEP** (`Core-0-Architecture-and-Structure.md` "unwired ≠ worthless"). A
  rarity→stars map with no current consumer; it is presentation intent, not residue. Travels to client
  with the sprites or to `contracts/buddy` with the taxonomy.
- **vLLM window discipline.** `SEED_TOKEN_BUDGET` (seed trim) + `maxContextTokens` cap exist because the
  local Messages-API returns a **non-fail-fast 500** on overflow — the working set must stay under 32768
  by construction. In orbweaver this is a **capability-descriptor** concern (`domains/connection.md` §2
  `context.window`) the agent-turn seam reads, not a buddy literal.

---

## The 8-slot layout

```
domain/buddy/
├── index.ts                  FRONT DOOR — the only legal external import
├── service.ts                COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts                DI BUNDLE — explicit BuddyContext interface (NOT ReturnType<>)
├── bus.ts                    live quip/mood/evolved SSE bus (consumes @orb/kit replay-buffer)
├── contract/
│   ├── service.ts            BuddyService interface — read this to know everything the domain does
│   ├── params.ts             every verb's *Params
│   ├── results.ts            *Result + BuddyProposal + BuddyTurnView
│   ├── views.ts              BuddyView (imports the taxonomy types from @orb/contracts/buddy)
│   ├── errors.ts             typed domain errors (today borrows kit DomainConflictError)
│   ├── signals.ts            BuddySignal + BuddySignalKind (the observer's normalized event vocab)
│   ├── agent-env.ts          BuddyAgentEnv — the injected cross-feature HANDS (was contract/env.ts)
│   └── observer-env.ts       BuddyObserverEnv — the injected cross-feature EVENT SOURCES
├── verbs/
│   ├── get.ts  hatch.ts  ask.ts  confirm.ts
│   ├── history.ts  clear-chat.ts  set-reactions.ts  set-agency.ts
├── persistence/
│   └── queries.ts            buddies + buddy_turns + buddy_quips (all SELECT/INSERT/UPDATE/DELETE)
├── substrate/
│   ├── mood.ts               pure mood machine + bond/stage/form derived facets
│   ├── roll.ts               deterministic gacha (FNV-1a + mulberry32 + frozen draw order)
│   └── soul.ts               soul-gen (parse/canned/generate) — pure-ish, calls the injected role client
├── agent/                    NAMED subsystem — the curated hands (the tool agent)
│   ├── tools.ts              buddy's tool definitions + handlers (status/counts + propose_*); registered into the ONE tool-use registry
│   └── system-prompt.ts      buildBuddySystemPrompt — the soul prompt (the identity, no card)
├── agency/                   NAMED subsystem — in-memory single-replica gate state
│   ├── proposals.ts          proposal Map (TTL 5min) — ASSUMES(single-replica) annotated
│   └── rate-limit.ts         hourly mutation window — ASSUMES(single-replica) annotated
└── observer/                 NAMED subsystem — the reaction engine
    ├── start.ts              lifecycle: wires the env event sources + timers; SIGTERM teardown
    ├── react.ts              the reactor (CAS write + quip-gen + mood/stat/bond growth)
    ├── signal-router.ts      raw lite event → owner-resolved BuddySignal → dispatch
    ├── trace-sampler.ts      the 30s slow-turn / error-spike poll
    ├── db-reads.ts           owner resolution + first-exchange (narrow read-only row reads)
    └── canned.ts             mood-keyed fallback quips (breaker open)
```

**Named subsystems (three):** `agent/` (tools + soul prompt), `agency/` (the single-replica gate state —
mirrors `credentials.md`'s `health/` rename: in-memory state out of `persistence/`), `observer/` (the
reaction engine). **`agent/routing.ts` is gone** (its job is `connection.resolveRole('agent')`).

**`context.ts` — explicit interface:** the DI bundle type is `export interface BuddyContext` (not
`ReturnType<typeof createBuddyContext>`), per `no-inline-types`. The `createDefaultRoleClients()` /
disabled-box defaults are **removed** — `roleClients`, the credential ops, and the agent-turn op are
**required injected deps** wired at `entry/` (missing ⇒ `tsc` red), per `Core-Legacy-Migration-and-Gaps.md` §6
(`createDefaultRoleClients` is DELETED).

---

## Verbs (the `BuddyService` interface)

```typescript
BuddyService = {
  // Identity / lifecycle
  get(params: GetBuddyParams): Promise<BuddyView>          // unhatched → deterministic preview; hatched → stored view
  hatch(params: HatchBuddyParams): Promise<BuddyView>      // snapshot bones + model-authored soul (idempotent)

  // The agent conversation
  ask(params: AskBuddyParams): Promise<AskBuddyResult>     // a tool-using agent turn (may surface a proposal)
  confirm(params: ConfirmBuddyParams): Promise<ConfirmBuddyResult>  // the ONLY executor of a proposed action
  history(params: BuddyHistoryParams): Promise<BuddyTurnView[]>
  clearChat(params: ClearBuddyChatParams): Promise<ClearBuddyChatResult>

  // Agency / reactions toggles
  setReactions(params: SetReactionsParams): Promise<BuddyView>   // observer on/off
  setAgency(params: SetAgencyParams): Promise<BuddyView>         // the "hands" kill switch
}
```

The reaction engine is started out-of-band (`startBuddyObserver`, wired at the composition root), not a
service verb — it is a supervised loop, not a request path.

**`ask` is the agent-mode composition:** it resolves the connection (injected
`resolveRole('agent')` + per-agent override), resolves the credential (injected
`credentials.resolve` / `mintVllmCredential`), builds the soul system-prompt + the view (recent turns,
budget-trimmed), resolves its registered tool set via the tool-use registry's `project-mcp`
projection (never a buddy-built server), and calls the injected `agentTurn` op (the one turn path /
sealed runner). It persists the user line **before** the multi-second turn (crash-safety) and the
assistant line after.

---

## Public surface (`index.ts`)

```typescript
// Service + view types (consumed by the tRPC Services bundle + client)
export type { BuddyService, BuddyServiceDeps, BuddyContext } from "./contract/service";
export type { BuddyView } from "./contract/views";
export type { BuddyProposal, BuddyTurnView } from "./contract/results";

// The live reaction feed (consumed by the tRPC buddy.stream subscription)
export { type BuddyBusEvent, buddyBusEmitter, getRecentBuddyEvents } from "./bus";

// The cross-feature injected seams (assembled at entry/, mirror WorkloadRunnerEnv)
export type { BuddyAgentEnv, BuddyWorkloadKind } from "./contract/agent-env";
export type {
  BuddyObserverEnv,
  BuddyWorkloadSignal,
  BuddyChatSignal,
  BuddyTraceSummary,
} from "./contract/observer-env";
export { type BuddyObserverReads, createBuddyObserverReads } from "./observer/db-reads";
export { startBuddyObserver } from "./observer/start";

// Factory
export { createBuddyService } from "./service";
```

**The taxonomy (`CompanionBones`, `Mood`, `Stage`, `BondTier`, `Rarity`, `Species`, …) lives in
`@orb/contracts/buddy`** — it is NOT re-exported from this front door; `@orb/db` (enum columns),
`@orb/client` (sprite rendering), and this domain all import from `@orb/contracts` directly. **The
sprites (`renderSprite`, `renderFace`, the body art) live in `@orb/client`** — presentation, and they
import the contracts taxonomy type, so they cannot be `kit`.

---

## Movement table

| Unit                                                                                                                                                               | Outcome                                 | Target                                                                                                                         | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Enforcement tier                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent/routing.ts` — `resolveBuddyRouting`, `BUDDY_SUB_MODEL`, `BuddyRouting`                                                                                      | **deleted**                             | —                                                                                                                              | The hand-rolled `admin→max-pro-sub-haiku / else vLLM` router is exactly the pain (`AGENTS.md` §4). Replaced by `connection.resolveRole('agent')` + a per-agent override. The `claude-haiku-4-5` literal becomes the connection's per-agent model.                                                                                                                                                                                                          | resolve-time: buddy imports the `connection` front door (injected op); the local router is gone — `domain-no-cross-feature` + no `agent/routing.ts` to import |
| `verbs/ask.ts` — `import { runAgentTurn } from "#server/providers"`                                                                                                | injected op                             | `agentTurn` op on `BuddyContext`, wired at `entry/` from the sealed `infra/providers` runner                                   | "No second agent system" (invariant #3). Buddy composes the ONE turn path; the firewall stays in the sealed runner.                                                                                                                                                                                                                                                                                                                                        | lint-time: `domain-no-cross-feature` (a domain may not reach `infra/providers` directly — it receives the op)                                                 |
| `verbs/ask.ts` + `verbs/hatch.ts` + `context.ts` — `resolveCredential`, `mintVllmCredential` (from `_shared/credentials`)                                          | injected ops                            | `credentials.resolve` + `credentials.mintVllmCredential` on `BuddyContext` (the `buddy.context` injection in `credentials.md`) | `_shared` does not exist; credentials owns resolve+mint and injects them.                                                                                                                                                                                                                                                                                                                                                                                  | resolve-time: `_shared` gone; `domain-no-cross-feature` enforces injection                                                                                    |
| `verbs/ask.ts` — `buildPromptWithMemory`, `fitSeedToBudget`, `MEMORY_TURNS`, `SEED_TOKEN_BUDGET`, `VLLM_MAX_CONTEXT_TOKENS`                                        | stays domain feature                    | `domain/buddy/substrate/view.ts` (the egocentric view-builder + window discipline)                                             | This is the buddy's **view** of canon (agent part #3). The window cap derives from the connection capability descriptor (`domains/connection.md` §2), not a hardcoded literal.                                                                                                                                                                                                                                                                             | lint-time: `no-inline-types`; the literal → descriptor-sourced                                                                                                |
| `agent/system-prompt.ts` — `buildBuddySystemPrompt`                                                                                                                | stays domain feature                    | `domain/buddy/agent/system-prompt.ts`                                                                                          | The soul prompt = the agent's **identity** (a card's shape minus the card). Buddy-specific (no roleplay scaffolding).                                                                                                                                                                                                                                                                                                                                      | resolve-time (same package)                                                                                                                                   |
| `agent/tools.ts` — `createBuddyMcpServer`, `toolText`, `TOOL_PAYLOAD_MAX_CHARS`                                                                                    | stays domain feature                    | `domain/buddy/agent/tools.ts`                                                                                                  | The buddy's curated toolset; handlers close over `(db, userId)` so a tool can't act as another user. **D48 note: these definitions register into the ONE `domain/tool-use` registry at compose and reach the SDK via its `project-mcp` projection (`proposed/tool-use-design/02`) — buddy owns tool DEFINITIONS, never a second registry.**                                                                                                                                                                                                                                                                                                                                                       | resolve-time                                                                                                                                                  |
| `agent/proposals.ts` — `stashProposal`/`takeProposal`/`peekProposal`/`clearProposal` Map                                                                           | stays domain feature, renamed subsystem | `domain/buddy/agency/proposals.ts`                                                                                             | In-memory single-replica gate state is NOT a DB query and not `persistence/`. Mirrors `credentials.md`'s `health/` rename. Keep `ASSUMES(single-replica)`.                                                                                                                                                                                                                                                                                                 | lint-time: `persistence-no-in-memory-state` (gate candidate) + an `ASSUMES(single-replica)` check gate                                                        |
| `agent/rate-limit.ts` — `allowMutation` hourly window Map                                                                                                          | stays domain feature, renamed subsystem | `domain/buddy/agency/rate-limit.ts`                                                                                            | Same single-replica in-memory state.                                                                                                                                                                                                                                                                                                                                                                                                                       | lint-time: same two gates                                                                                                                                     |
| `mood.ts` — `moodForSignal`/`resolveMood`/`decayMood`/`statForSignal`/`bondTierOf`/`stageOf`/`formOf`                                                              | stays domain feature                    | `domain/buddy/substrate/mood.ts`                                                                                               | Pure feature-local logic, unit-pinnable without a db. Belongs in `substrate/`.                                                                                                                                                                                                                                                                                                                                                                             | resolve-time                                                                                                                                                  |
| `roll.ts` — `roll`, `rollFrom`, `mulberry32`, `hashString`, `SALT`, `Roll`                                                                                         | stays domain feature                    | `domain/buddy/substrate/roll.ts`                                                                                               | Deterministic gacha; pure, no I/O. The `SALT` + frozen draw order is byte-stable (load-bearing).                                                                                                                                                                                                                                                                                                                                                           | resolve-time; test-time round-trip pins the preview stability                                                                                                 |
| `verbs/hatch.ts` — `generateSoul`/`parseSoul`/`cannedSoul`/`SOUL_SCHEMA`/`SOUL_SYSTEM`/`CANNED_NAMES`                                                              | stays domain feature                    | `domain/buddy/substrate/soul.ts` (called from `hatch`)                                                                         | Soul-gen is its own concern; the verb stays thin. The vLLM client arrives via the injected `roleClients`/summarize op.                                                                                                                                                                                                                                                                                                                                     | resolve-time                                                                                                                                                  |
| `persistence/queries.ts` — all `buddies`/`buddy_turns`/`buddy_quips` queries + `rowToView`/`previewView`/`turnToView` projections                                  | stays domain feature                    | `domain/buddy/persistence/queries.ts`                                                                                          | The domain's own tables; the only writer. Projections that call `mood.ts` derived facets stay.                                                                                                                                                                                                                                                                                                                                                             | resolve-time                                                                                                                                                  |
| `persistence/queries.ts` — `BuddyRow`/`BuddyTurnRow`/`BuddyQuipRow` (`$inferSelect`)                                                                               | stays domain feature                    | `domain/buddy/persistence/queries.ts` (local drizzle-inferred types)                                                           | DB-row types derived from the schema; not cross-boundary, no leak.                                                                                                                                                                                                                                                                                                                                                                                         | lint-time: `no-inline-types` (not exported)                                                                                                                   |
| `contract/signals.ts` — `BuddySignal`/`BuddySignalKind` (the type)                                                                                                 | stays domain feature                    | `domain/buddy/contract/signals.ts`                                                                                             | Domain-internal event vocab; not cross-boundary.                                                                                                                                                                                                                                                                                                                                                                                                           | lint-time: `no-inline-types` (in `contract/`)                                                                                                                 |
| `contract/signals.ts` — `workloadSignal`/`chatSignal`/`traceSignal`/`presenceSignal` builders + `bucket5m`                                                         | stays domain feature                    | `domain/buddy/observer/signals.ts` (pure builders next to the reactor)                                                         | Pure builders belong with the subsystem that uses them, not in `contract/` (which is types-only).                                                                                                                                                                                                                                                                                                                                                          | lint-time: `feature-structure` (no logic in `contract/`)                                                                                                      |
| `contract/env.ts` — `BuddyAgentEnv`, `BuddyWorkloadKind`                                                                                                           | stays domain feature, renamed           | `domain/buddy/contract/agent-env.ts`                                                                                           | The injected cross-feature HANDS seam (mirrors `WorkloadRunnerEnv`). Rename for clarity vs `observer-env.ts`.                                                                                                                                                                                                                                                                                                                                              | resolve-time: the env is wired at `entry/`; `domain-no-cross-feature` keeps buddy from importing `workloads`                                                  |
| `contract/observer-env.ts` — `BuddyObserverEnv` + lite event shapes                                                                                                | stays domain feature                    | `domain/buddy/contract/observer-env.ts`                                                                                        | The injected cross-feature EVENT-SOURCE seam (chat/workloads buses + trace ring). Lite shapes keep the coupling type-thin.                                                                                                                                                                                                                                                                                                                                 | resolve-time: assembled at `entry/`/`transport/jobs`                                                                                                          |
| `observer/db-reads.ts` — `createBuddyObserverReads` (narrow reads: the workload's `ownerId` FK + the chat's host from the `chat_participants(role='host')` roster) | stays domain feature                    | `domain/buddy/observer/db-reads.ts`                                                                                            | A narrow read-only lookup of **shared schema rows** (not another feature's code) — the observer must resolve the reacting user it doesn't yet know: the workload owner by FK (workloads are single-owned), the chat **host** from the `chat_participants` roster (D18: chats are membership-scoped, there is no `chats.ownerId` column). The owning services expose only caller-scoped reads. Sanctioned cross-table read, like `import/export`→`@orb/db`. | resolve-time: `@orb/db` is a declared dep; the read is schema-level, not a cross-feature service call                                                         |
| `bus.ts` — `buddyBusEmitter`/`emitBuddyEvent`/`getRecentBuddyEvents`/`BuddyBusEvent`                                                                               | stays domain feature                    | `domain/buddy/bus.ts`                                                                                                          | The buddy's outward voice; mirrors `chat/bus.ts`. Keyed on `userId`.                                                                                                                                                                                                                                                                                                                                                                                       | resolve-time                                                                                                                                                  |
| `bus.ts` — `import { createReplayBuffer } from "_shared/replay-buffer"`                                                                                            | → `@orb/kit`                            | `@orb/kit/replay-buffer`                                                                                                       | Pure, 3 feature consumers (buddy/chat/workloads) — `Core-Legacy-Migration-and-Gaps.md` §1 + §7.1 REFINES the brief's "feature-internal" verdict to kit.                                                                                                                                                                                                                                                                                                    | resolve-time: `@orb/kit` declared dep; `kit-purity` (no domain/Node import)                                                                                   |
| `shared/buddy/taxonomy.ts` — all enums/weights/thresholds + `CompanionBones`/`CompanionStats`                                                                      | → `contracts`                           | `@orb/contracts/buddy`                                                                                                         | Cross-boundary vocab: `@orb/db` imports the enums for columns, the client renders from it, the server rolls from it. `Core-Legacy-Migration-and-Gaps.md` §4.                                                                                                                                                                                                                                                                                               | resolve-time: `@orb/db`/`@orb/client`/`@orb/server` all declare `@orb/contracts`; never import `@orb/server` for it                                           |
| `shared/buddy/taxonomy.ts` — `RARITY_STARS` (no current consumer)                                                                                                  | → `contracts` (or client with sprites)  | `@orb/contracts/buddy`                                                                                                         | Unwired display intent — KEEP (`Core-0-Architecture-and-Structure.md` "unwired ≠ worthless"). Travels with the taxonomy.                                                                                                                                                                                                                                                                                                                                   | resolve-time                                                                                                                                                  |
| `shared/buddy/sprites.ts` — `renderSprite`/`renderFace`/`spriteFrameCount` + the body/hat/mood art                                                                 | → `client`                              | `@orb/client` (buddy presentation)                                                                                             | Pure presentation; imports the contracts taxonomy type, so it **cannot** be `kit` (would still be fine as kit purity-wise, but it has a single consumer — the client — and is display, not an engine). `Core-Legacy-Migration-and-Gaps.md` §10 open item resolved: client.                                                                                                                                                                                 | resolve-time: lives in `@orb/client`; no server consumer                                                                                                      |
| `persistence/queries.ts` + `verbs/hatch.ts` — `newId` (from `_shared/ids`)                                                                                         | → `@orb/kit`                            | `@orb/kit/ids`                                                                                                                 | Pure TypeID mint; the canonical kit leaf (446 importers).                                                                                                                                                                                                                                                                                                                                                                                                  | resolve-time                                                                                                                                                  |
| `verbs/hatch.ts` — `isConstraintViolation` (from `_shared/db-errors`)                                                                                              | → `@orb/db`                             | `@orb/db/kit`                                                                                                                  | DB-error classifier; domain-agnostic 4-depth `cause` walk.                                                                                                                                                                                                                                                                                                                                                                                                 | resolve-time                                                                                                                                                  |
| `verbs/confirm.ts` — `DomainConflictError` (from `_shared/errors`)                                                                                                 | → `@orb/kit`                            | `@orb/kit/errors`                                                                                                              | Pure error base class; boot-critical kit module.                                                                                                                                                                                                                                                                                                                                                                                                           | resolve-time                                                                                                                                                  |
| `context.ts` — `createDefaultRoleClients()` default + disabled-box default                                                                                         | **deleted**                             | required injected deps wired at `entry/`                                                                                       | `Core-Legacy-Migration-and-Gaps.md` §6: `createDefaultRoleClients` is DELETED; contexts receive `roleClients` (+ credential ops + agent-turn op) as required deps.                                                                                                                                                                                                                                                                                         | compile-time: missing dep ⇒ `tsc` red                                                                                                                         |
| `context.ts` — `ReturnType<typeof createBuddyContext>`                                                                                                             | stays domain feature                    | `domain/buddy/context.ts` — explicit `export interface BuddyContext`                                                           | The inferred type is invisible at a glance.                                                                                                                                                                                                                                                                                                                                                                                                                | lint-time: `no-inline-types`                                                                                                                                  |
| `RoleClients` type (from `_shared/role-clients`, used by hatch/react/observer)                                                                                     | → `contracts`                           | `@orb/contracts/role-clients`                                                                                                  | Cross-boundary contract (depends on provider result contracts). `Core-Legacy-Migration-and-Gaps.md` §4. Buddy imports the type from contracts; the bound instance is injected.                                                                                                                                                                                                                                                                             | resolve-time                                                                                                                                                  |

---

## Cross-feature composition (the injection model)

Buddy reaches **no** sibling feature directly (`domain-no-cross-feature`). Everything cross-feature
arrives through three injected bundles, all assembled at the composition root (`entry/` /
`transport/jobs`), mirroring `WorkloadRunnerEnv`.

**Injected into `buddy.context` (the request-path service):**

| Op injected                                | Provided by                                                                       | Used for                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `connection.resolveRole('agent')`          | `connection` domain                                                               | the buddy's brain (backend/model) + the capability descriptor (window cap)                           |
| `credentials.resolve`                      | `credentials` domain                                                              | gating the agent turn (owner → `max-pro-sub`, owner-delegated; the owner gate lives in resolve, D17) |
| `credentials.mintVllmCredential`           | `credentials` domain                                                              | the keyless local vLLM credential for the non-owner path                                             |
| `agentTurn` (the sealed agent-mode runner) | `infra/providers` (the ONE turn path; or chat's exposed op, per the KEY decision) | running the tool-using turn behind the firewall                                                      |
| `roleClients.summarize`                    | `infra` role clients (vLLM)                                                       | soul-gen at hatch + quip-gen in the reactor (free, local)                                            |
| `BuddyAgentEnv.startWorkload`              | `workloads` domain                                                                | the `confirm`→workload proposal path (curated `BuddyWorkloadKind` subset)                            |

**Injected into `startBuddyObserver` (the supervised reaction loop):**

| Op injected                                                 | Provided by                                                  | Used for                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BuddyObserverEnv.onWorkloadEvent` / `onChatEvent`          | `workloads` / `chat` buses                                   | the live reaction triggers                                                                                                                          |
| `BuddyObserverEnv.readRecentTraces`                         | `foundation/observability` ring                              | the 30s slow-turn / error-spike sampler                                                                                                             |
| `BuddyObserverEnv.resolveWorkloadOwner` / `resolveChatHost` | `createBuddyObserverReads` (buddy's own narrow schema reads) | resolving "whose buddy reacts" — the workload owner by FK, the chat host from the `chat_participants(role='host')` roster (D18: no `chats.ownerId`) |
| `roleClients.summarize`                                     | `infra` vLLM                                                 | quip generation (canned fallback on breaker-open)                                                                                                   |

No domain imports `domain/buddy` internals; the tRPC router consumes the front door, the observer is
started at the composition root.

---

## Spine thread intersections

### §0 / §2 / §3 the agent model (governing)

Buddy is the proof-of-concept for "agent mode is opt-in on the one chat-turn path." The four agent parts
(identity=soul, connection=`resolveRole('agent')`, view=the transcript, tools=the registered
tool set, projected by the tool-use registry)
map cleanly. The stateless-first contract holds: buddy's turn is `runAgentTurn(systemPrompt, view,
connection, tools?)`; the agent-sdk session is a backend-internal cache, never a buddy concept.

### §6 the agent model — RESOLVED

`agent` is a PATTERN (Option B), NOT a thin domain (see the dedicated section). The agent turn is chat's
one stateless turn path; buddy injects it as the `agentTurn` op. Only the op's exposure seam (chat-domain
vs `entry/`-constructed from the sealed runner) remains deferred.

### §7.1 / §8.6 identity, principal, capability ceiling

Buddy is the first-class-principal precedent alongside the `synthetic` group character
(`character.md` §8.6: `mintSyntheticGroupCharacter` ≈ `provisionAgentPrincipal`). The `buddy_turns`
firewall inverts when buddy gains a `chat_participants` seat + self-attributed `messages`. The
borrowed-identity safety becomes the explicit capability ceiling (kill switch + confirm gate +
rate-limit, enforced by global×resource×capability). Mechanics defer to `core/Spine-Identity-and-Auth.md`.

### §7.4 types & schemas — one home, one direction

- Taxonomy vocab + `CompanionBones`/`CompanionStats` → `@orb/contracts/buddy` (cross-boundary; db +
  client + server consume).
- `RoleClients` → `@orb/contracts/role-clients`.
- `BuddyView`/`BuddyProposal`/`BuddyTurnView`/`*Params`/`*Result` → `domain/buddy/contract/`.
- `BuddySignal`/`BuddySignalKind`, `BuddyAgentEnv`, `BuddyObserverEnv` + lite event shapes →
  `domain/buddy/contract/` (domain-internal injected-seam types).
- `BuddyRow`/`BuddyTurnRow`/`BuddyQuipRow` → `persistence/queries.ts` (drizzle `$inferSelect`).
- `BuddyContext` → explicit `export interface`, never `ReturnType<>`.

### §7.5 string-union dispatch discipline

- `BuddySignalKind` (12 members) → ONE importable canonical union in `domain/buddy/contract/signals.ts`;
  the `SIGNAL_MOOD` / `SIGNAL_STAT` maps + `react()`'s mood/stat lookups must be **exhaustive over it**
  (a mapped-type `Record<BuddySignalKind, …>` so a new kind fails `tsc`). `SIGNAL_MOOD` already is a full
  `Record`; `SIGNAL_STAT` is a `Partial<Record>` (intentional — not every signal grows a stat) — keep
  the partial but assert exhaustiveness on the consumer switch.
- `Proposal.kind` (`rename | workload`) → exhaustive switch in `confirm` (`assertNever` on the default);
  a new proposal kind = union member + switch arm + tool, or `tsc` red.
- `Mood`/`Rarity`/`Species`/`Hat` etc. are the `@orb/contracts/buddy` canonical unions; db enum columns
  import them (already correct in `db/schema/buddy.ts`).

### §7.2 settings / config

There is **no `UserSettings.buddy` block** today — `reactionsEnabled`/`agencyEnabled` are row columns;
cooldown is a constant. This is the intended floor; promote to AppSettings/UserSettings only if per-user
tuning is wanted (the README's deferred item). The vLLM window caps are NOT settings — they derive from
the connection capability descriptor (`domains/connection.md` §2).

---

## Invariants (gate candidates)

1. **One agent turn path** — buddy runs no second agent system. `ask` composes the injected `agentTurn`
   op (the sealed `infra/providers` runner); it never imports a backend or re-implements the loop.
   _Enforcement: lint-time (`domain-no-cross-feature` — no `infra/providers` import); compile-time (the
   op type is the only entry)._

2. **The firewall: agent-mode attaches ONLY the agent's registered projection (the tool-use
   `project-mcp` output for this agent's tool set); non-agent turns attach none** — and the agent turn carries
   no `chatId` (until §8.6 makes buddy a participant). The asymmetry lives in the sealed runner.
   _Enforcement: compile-time (the request shape has no `chatId` on the non-participant path —
   passing chat context is a type error); test-time (the firewall + tool-surface probe)._

3. **`buddy.confirm` is the ONLY executor of a proposed action** — the agent only stashes proposals; no
   tool mutates. Every mutation passes the kill switch (`agencyEnabled`) + the hourly rate-limit.
   _Enforcement: compile-time (tools return proposals, never perform writes; `confirm` is the sole
   mutation site); test-time (a propose-then-no-confirm asserts zero side-effects)._

4. **The gacha is byte-stable** — the `tavern-buddy-2026-01` salt + the frozen draw order
   (`rarity → species → eye → hat → shiny → stats`) never change once buddies exist (re-rolls every
   preview otherwise).
   _Enforcement: test-time (a golden test pins `roll(knownUserId)` to fixed bones)._

5. **In-memory gate state is annotated `ASSUMES(single-replica)` and lives in `agency/`, not
   `persistence/`** — the proposal Map + rate-limit window are per-process.
   _Enforcement: lint-time (`persistence-no-in-memory-state` + the `ASSUMES(single-replica)` check gate,
   the same gate pattern `credentials.md` uses for `health/cache.ts`)._

6. **The reactor never throws into the loop** — `react()` is fire-and-forget (catch + log); the
   optimistic-CAS write is bounded (3 attempts) and uses a server-side `sql` increment for `bondXp`.
   _Enforcement: test-time (a reactor that throws is swallowed; a concurrent-write test exercises the
   CAS retry)._

7. **The buddy taxonomy has ONE home (`@orb/contracts/buddy`)** — db enum columns, client sprites, and
   the server roll all import it from contracts; no re-export through `@orb/server`.
   _Enforcement: resolve-time (`@orb/db`/`@orb/client` declare `@orb/contracts`, never `@orb/server`)._

8. **The reaction signal vocab is exhaustive** — `BuddySignalKind` is one canonical union; the mood/stat
   maps + the reactor switch are exhaustive over it.
   _Enforcement: compile-time (mapped-type `Record` / `assertNever`)._

---

## Resolved decisions (was: open)

- **`agent` as a thin domain vs a pattern (THE key one) — RESOLVED: pattern (Option B).** Buddy is "an
  agent with tools + its own connection + a soul," composed via chat's ONE stateless turn path + an
  injected `agentTurn` op; the shared agent _contract_ lives in `@orb/contracts` + `infra/providers`
  WITHOUT a `domain/agent`. (Per the fan-out ledger; consistent with chat invariant #3.)
- **Where the per-agent connection's owner gate lives — RESOLVED.** The owner gate stays in credential
  resolution (`max-pro-sub` is owner-only, D17, `credentials.md`); buddy is the OWNER's agent and inherits
  the owner's box sub via owner-delegated `credentials.resolve` (a non-owner's buddy gets its own
  credential, never the box). The "always cheap" default is a per-agent connection override on
  `resolveRole('agent')`. The buddy domain carries NEITHER the model literal NOR the routing logic
  (`resolveBuddyRouting` is deleted).
- **The soul as identity — RESOLVED (for the initial port): keep the `buddies` row.** Buddy's soul stays
  buddy-local soul columns (single, mutable, model-authored once at hatch) rather than a cardless
  `character`. (Deferred refinement below if tool-using characters ever need the same shape.)

### Still open (deferred, with criteria)

- **The agent-turn composition exposure seam — DEFERRED (chat-domain + spine call).** Option B is locked;
  the remaining choice is whether the `agentTurn` op is exposed BY the chat domain (a chat front-door op)
  or constructed at `entry/` directly from the sealed `infra/providers` runner. _Criterion:_ decide WITH
  the chat domain at chat-scaffold time — whichever keeps the firewall in the sealed runner and buddy free
  of chat internals. Buddy consumes an injected op either way; this does not change buddy's shape.
- **§8.6 principal transition — DEFERRED to `core/Spine-Identity-and-Auth.md` (mechanics).** When buddy becomes
  a `users`-row principal with a `chat_participants` seat + self-attributed `messages`, the `buddy_turns`
  firewall inverts. The mechanics (`provisionAgentPrincipal`, the `kind:"agent"`/`isAi` split, the
  `authorUserId` stamping path, `requireParticipant`) are owned by the identity spine. **Buddy-local
  decision RESOLVED:** the solo `buddy_turns` transcript SURVIVES as the solo-chat case (the firewall
  stays for solo buddy chat); it inverts only when/if buddy joins a real group room as a participant.
- **The buddy `view` vs chat's egocentric view-builder — DEFERRED.** Solo view = the `buddy_turns`
  transcript + budget trim, kept a buddy-local special case for now. _Criterion to converge:_ when buddy
  joins a group chat (§8.6) its view becomes chat canon via the view-builder — converge then, not before.
- **Promote in-memory gate state to DB — DEFERRED (note, not pending work).** Only if the
  `ASSUMES(single-replica)` assumption is ever abandoned (`buddy_proposals` / `buddy_rate_limits` tables,
  same TTL + replace/atomic semantics).
- **A `UserSettings.buddy` block — DEFERRED.** The cooldown / neglect-threshold constants are the floor
  until per-user tuning is wanted.
