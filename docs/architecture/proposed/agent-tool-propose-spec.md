---
kind: spec
status: active
updated: 2026-07-18
---

# Agent room-hands — the `tool-propose` mini-spec (propose/confirm for agent tool use in rooms)

> **DESIGN deliverable — nothing here is built.** D60 minted the closed
> `AGENT_ACTIONS = ["speak", "tool-propose"]` union and the `canAgent` arm at the agent-principal
> birth; the `"tool-propose"` arm has had ZERO callers ever since (the ceiling's second wall,
> spec-only — `../history/agent-principal-design/03-capability-ceiling.md` §2). The D60 seat wave
> CLOSED at AP4a (D99, 2026-07-18) with `speak` fully built; this spec opens the last seam. The
> graduated set's deferral criterion (04-buddy-transition §5): *"a concrete room use case for
> buddy's hands."* The concrete case now in-tree: `generate_image` executes IN-TURN under the
> resolved HOST Principal (`entry/compose/chat.ts` `buildChatToolOps` — `resolveHostPrincipal(frame.runAsUserId)`),
> so attaching ANY mutating/spend tool to an agent-speaker turn today would be zero-human-in-the-loop
> host-authority execution. Room-hands is the shape that makes agent tool use in plain rooms possible
> WITHOUT that hole. Owner ruling: maximal, extensible, do it right once. The D-ledger wins on any
> conflict; graduated agent-principal docs cited here are frozen history, not build authority.

## 0. The concept line

**`tool-propose` is the third and last agent tool posture: an enabled seated agent, during its own
`speak` turn in a plain room, may call propose-flavored tools that STASH a durable, reviewable
proposal row — nothing executes until the room's HOST confirms, and execution then runs the SAME
registered tool through the ONE tool-use execute pipeline under the CONFIRMER's human `Principal`.**
It is the buddy solo propose/confirm trio (`propose_*` tools → `buddy.confirm`) generalized to
shared rooms: durable instead of in-RAM, host-reviewed instead of owner-reviewed, and executed
through the D48 registry instead of a bespoke kind-switch.

The complete agent-tool-posture table (every row names its authority basis):

| Path | Who | Tools | Executes | Authority basis |
| - | - | - | - | - |
| rpg agent-GM seat (AP4a, LIVE) | the agent holding `rpg_games.gmUserId`, narrator turns only | rpg registry tools, seat-gated per call (`requireGmSeat` gm-model arm via `resolvePartyActorKind`/`resolveGmSeat`) | DIRECTLY, in-turn, staged + flushed at commit | a STANDING authority grant — the host assigned the seat (`assignGmSeat`); scope is one game chat, one domain |
| crew members (D59, LIVE) | workload personas — NOT principals | **NONE, ever** ("an actor is not a proposer" — pure structured output; proposals ride domain review queues) | never | none — the bright line (05-seats §3) |
| **room-hands (`tool-propose`, THIS SPEC)** | any enabled seated agent (`kind:'agent'` roster row), during its own speak turn | derived `propose_*` wrappers over a CLOSED proposable tuple | NEVER in-turn; a human confirm executes later | NO standing grant — per-action human consent is the authority |

**What `tool-propose` adds that the GM seat does not:** the GM seat is direct execution justified by
an explicit, standing, host-conferred authority object, scoped to rpg's own tools in a game chat.
Room-hands covers the complement — cross-domain tools, non-game rooms, and agents holding NO
authority object at all. The line to hold: **standing seat authority ⇒ direct execute; no standing
authority ⇒ propose + human confirm; structured-output-only ⇒ no tools.** A fourth posture (direct
execution without a seat-shaped authority object) must never exist — it is the
`buildChatToolOps` host-Principal hole with a friendly name.

## 1. Who proposes, what is proposable, what never is

- **Who: any enabled seated agent, source-blind.** The propose tools attach only to agent-speaker
  turns (the `agentSpeakerUserId` fact the engine already computes for `gateAgentSpeaker`), gated by
  a fresh `canAgent(actor, "tool-propose", AGENT_SEAT_ROSTER)` on the same freshly-read actor.
  Chat stays source-blind (D60): nothing dispatches on `sourceKind`; buddy is v1's only source but
  the seam is source-agnostic. *(Rejected: sourceKind-gating "buddy only" — re-introduces source
  knowledge into chat, and the ceiling already gates the right axis (the principal, not its
  species). Rejected: attach for non-agent AI speakers too — a character has no principal, no
  ceiling row, and no owner-consent story; the D60 walls are the whole basis.)*
- **What: a CLOSED contract tuple `AGENT_PROPOSABLE_TOOL_NAMES`** (home: `domain/tool-use`
  `contract/`, beside the registry types). Every member names a REAL registered `ToolDefinition` —
  the execute side. A member needs no live attach site of its own; it may exist solely as confirm's
  execute target. Growing the tuple = register the target tool + add the member + its summary
  renderer + a confirm-matrix test row (the exhaustive `Record` over the tuple makes a missing
  renderer `tsc`-red — §5.5 dispatch discipline). **v1 members (two, proving both arms):**
  `generate_image` (spend-shaped — the existing imagery D48 tool, unchanged) and `set_chat_title`
  (mutation-shaped — a NEW small registry tool over the host-only `chat.updateTitle`, registered by
  chat's owning-domain closure at compose). *(Rejected: an open "any registry tool is proposable"
  posture — the registry will grow rpg/plugin tools whose handlers assume seat gates or turn
  staging; closed-union discipline is the repo's standing answer. Rejected: a `proposable: boolean`
  flag on `ToolDefinition` — scatters the policy across registrants; the tuple is one home and one
  diff to review.)*
- **Unproposable FOREVER (policy, recorded so nobody builds it):** rpg tools (their gate is seat
  authority + turn staging — proposing one outside a turn breaks both premises); membership/seat
  lifecycle (invite/kick/seat/unseat/handoff — the human chokepoints ARE the design); credentials,
  settings, admin, identity, export (wall-one territory); message edit/delete (crew's
  `crew_edit_proposals` queue is the ONE edit-proposal home — a second path is a doubling); buddy's
  SOLO hands (`propose_rename`/`propose_workload` stay owner-scoped on the solo surface —
  byte-identical, D60). Structural backstop regardless of policy: confirm executes under the
  confirmer's `Principal` through the target verb's own gates, so an out-of-authority proposal
  refuses at execution even if the tuple is ever mis-grown.

## 2. The mechanism — derived `propose_*` wrappers, one execute path

**One derivation, not N hand-written twins:** at `entry/compose`, for each tuple member, tool-use
derives a `propose_<name>` `ToolDefinition` from the target def — the SAME `argsSchema` (already
wire-projectable, D48; the wrapper adds no schema of its own so the two can never drift), a
description prefixed with the propose contract ("This does NOT run it — it files a proposal the
host can confirm"; the buddy `propose_*` honesty precedent — the model must never believe it
executed), `capability: null`, and a handler that zod-parses (already done by execute), renders the
summary via the exhaustive renderer `Record`, and STASHES the row via tool-use's own proposals
slice. The wrappers register into the same ONE registry (collision = boot-fatal, unchanged).
*(Rejected: no wrappers + a `mode:"propose"` flag on the exec frame that turns execute into stash —
the model sees the REAL tool name and a description that says it executes; a model lied-to about
effects narrates falsehoods into canon. The propose-ness must be in the model-facing contract.
Rejected: hand-written per-tool propose defs (the buddy shape) — N copies of one behavior that
drift; buddy's are bespoke because their targets are not registry tools.)*

**Confirm is the one execute path re-entered:** accept re-loads the row, re-parses the stored args
against the target's CURRENT `argsSchema` (the zod belt against schema drift since stash), builds a
one-call batch, and runs `toolUse.executeToolCalls` with a `ToolExecutionContext` whose
`principal` is the CONFIRMER's real `Principal`, `triggeredBy` = the confirmer, `chatId` = the
row's chat, `roster` = the confirmer's loaded membership, `turnId: null` (a non-turn consumer — the
buddy precedent). The target's `capability` ceiling and its owning verb's own gates re-run under
that Principal. *(Rejected: a per-kind confirm `switch` calling injected domain verbs (the
`buddy.confirm` shape) — a SECOND execute path beside the registry that every new member must be
added to; the registry pipeline is exactly the "one execute path" the D48 design bought.)*

**Execution authority — the D19 answer, precisely:** the D19 triple governs TURNS; a confirmed
execution is NOT a turn — it is an ordinary human-called verb invocation. The confirmer's
`Principal` is the caller; any spend inside the handler (`generate_image` resolves its role under
`exec.principal`) is the confirmer's. Because confirm is host-only (§3), this stays coherent with
the room's funding story: the host consented to the seat, funds the agent's speech (D19), and funds
its confirmed hands. No synthetic Principal is ever minted for confirm. *(Rejected: execute under
the host's synthetic `resolveHostPrincipal` regardless of who confirms — an authority laundering
seam the moment confirm ever widens past the host; the confirmer must BE the authority. Rejected:
"the agent's authority" — there is none; wall one.)*

## 3. The flow

1. **Attach (engine, agent-speaker turns only).** Where `TurnPrep.attachedToolNames` is populated
   (`chat/verbs/turn.ts` — today `rpg?.tools ?? []`): when the turn's `agentSpeakerUserId` is
   non-null AND the chat is NOT a game chat (v1 — game chats keep their rpg tool surface; criterion
   to widen: a real want for propose-hands at a game table), the engine asks the injected
   `ChatContext.resolveAgentProposeTools(agentUserId)` (null = unwired, byte-identical — the
   `tools`/`expressions`/`rpg` null-op precedent) and gates with
   `canAgent(actor, "tool-propose", AGENT_SEAT_ROSTER)` on the actor `gateAgentSpeaker` already
   freshly read (one read, two verdicts). A `tool-propose` refusal attaches NOTHING and the turn
   proceeds tool-less — `speak` governs the turn, `tool-propose` only the hands (degrade, never
   kill). *(Rejected: a constant name-list on `ChatContext` — an op keeps the seam open for
   per-agent/per-source curation without a contract change; the compose v1 implementation just
   returns the derived tuple. Rejected: gating inside the tool handler only — the wire request
   would still advertise tools a disabled-hands agent can call; attach-time is the honest gate.)*
2. **Stash (mid-turn, via the wrapper handler).** The wrapper writes one `agent_tool_proposals`
   row: proposer = the frame's `agentSpeakerUserId` (a NEW nullable field threaded
   engine → `ChatToolExecFrame` → `ToolExecutionContext`; the engine knows the fact, nothing else
   does — null on non-agent turns and non-chat consumers, and the stash refuses `ok:false` on null
   as the belt against a propose tool riding a human turn), `pending`, `expiresAt = now + TTL`.
   **Replace-per-kind:** ONE pending per `(chatId, toolName)` — a partial unique index + the
   supersede-then-insert single batch (`crew/persistence/proposals.ts`
   `insertProposalReplacingPending`, verbatim pattern). The tool result tells the model to say so
   in prose ("Proposed — the host can confirm below," the buddy phrasing discipline).
3. **Surface (§4).** Bus ping + the in-chat review affordance for the host.
4. **Confirm / deny (host verbs).** `accept` (host-gated → lifecycle checks → re-parse → execute
   → flip `accepted`, stamp `resolvedByUserId`) and `dismiss` (host-gated → flip `dismissed`).
   Lifecycle checks at accept, in order, each with its D83 code: still `pending`
   (`proposal_not_pending`), not past `expiresAt` (lazily flip `expired`, refuse
   `proposal_expired`), the target tool still registered + args still parse (`tool_retired` — a
   registry/schema drift refusal, not a crash), the proposing agent still a PRESENT seat
   (`proposer_not_seated` — the seat was the standing basis; kick revokes the pending hands) and
   still ENABLED via a fresh `users.enabled` read (`agent_disabled` — the kill switch reaches
   pending proposals: containment stays total, D60). *(Rejected: proposals survive kick as
   confirmable — a kicked agent's pending writes executing later is exactly the revoked-authority
   race kick exists to close. Rejected: eager expiry sweeps/listeners — crew's lazy accept-time
   staleness is the precedent; a durable row needs no timer.)*
5. **Timeout.** `AGENT_TOOL_PROPOSAL_TTL_MS = 72h` (durable + the host may be away; buddy's 5-min
   TTL is an in-RAM, owner-present number). Lazy: `list` filters past-expiry; `accept` flips the
   status for the audit trail. Owner-taste on the number (§8).
6. **Spam bounds.** Structural, no counters: at most `|AGENT_PROPOSABLE_TOOL_NAMES|` pending rows
   per chat (replace-per-kind), the agent's turn frequency is already bounded by arbitration + the
   `triggeredBy` turn-count budget + auto-mode's dual bound, and the in-turn call count by
   `toolRecurseLimit`. Confirm-side flooding is a human clicking — their own verbs' limits apply.
   *(Rejected: an hourly propose rate-limit — machinery for a bound the replace-per-kind shape
   already enforces; the buddy hourly limit guards CONFIRMED MUTATIONS, and here each mutation
   already costs a human click. Criterion to add one: a real annoyance the replace bound didn't
   contain.)*
7. **Containment (the D60 runbook, extended one column).** Mute/kick/disable/owner-delete each
   reach the hands: mute stops selection (no turns, no stashes); kick ⇒ `proposer_not_seated` on
   every pending; `users.enabled=false` ⇒ `canAgent` refuses attach on any new turn AND
   `agent_disabled` refuses every pending confirm; owner-delete cascades the agent row and the
   proposals with it (FK, §5). The containment suite re-proves all four arms (§6 — the D60
   precedent demands the ceiling re-proof).

## 4. Surfaces

- **In-chat review affordance (the ONE review home).** The proposal is about THIS room and its
  confirmer is in it — review lives in the chat surface (a host-visible pending card: summary,
  tool name, proposing agent's display name via the roster map, Confirm/Dismiss), fed by a `list`
  query + a bus ping. *(Rejected: the notifications inbox as the primary surface — the crew
  `crew-proposal` member exists because ITS review home (the character page) sits outside the chat;
  here the home is the chat. No `agent-tool-proposed` notification member in v1 — a member ships
  WITH its first emit site only when a real need appears (D-ledger discipline); rows are durable
  and expiry bounds rot. Criterion: evidence of proposals expiring unseen in host-absent rooms.)*
- **Bus:** ONE new `ChatBusEvent` member `agentToolProposalChanged { chatId, proposalId }` —
  id-only re-read (the `chatUpdated` discipline), NEVER durably logged (the
  `chatOpened`/`expression` precedent), emitted on stash AND on every status flip (one member, not
  one per transition — the client re-reads the list either way). **Transport-filtered to the
  HOST's stream** (the crew `plotUpdated` host-elision precedent): v1 proposals are host-only
  visible — the host is the sole confirmer, and other members seeing undecided host-authority
  actions is noise (owner-taste, §8). Coupled sites (the bus-coverage law, one change): the union +
  `CHAT_BUS_EVENT_TYPES` record + the bus-coverage gate's map/mustPass example + the
  `check-gates.int` fixture.
- **Refusal vocabulary (D83).** Codes the client discriminates on are contract vocabulary,
  one-homed: `AGENT_TOOL_PROPOSAL_REFUSAL_REASONS = { proposalNotPending: "proposal_not_pending",
  proposalExpired: "proposal_expired", toolRetired: "tool_retired", proposerNotSeated:
  "proposer_not_seated", agentDisabled: "agent_disabled" }` (the named-object
  `SEAT_REFUSAL_REASONS` shape — both sides discriminate by name; `agent_disabled` deliberately
  reuses the existing seat-refusal literal so the client copy mapper keeps one meaning per string).
  Server codes derive from the contract; message-text matching stays BANNED.

## 5. Data + events

- **Home: `domain/tool-use` grows a proposals slice** (persistence + verbs + `db`/`now` on its
  context — the 8-slot template; "owns no tables" was a phase fact, not a law). WHY tool-use and
  not chat or a new domain: the row IS a deferred registry tool call, and confirm re-enters
  tool-use's own execute pipeline — homing it elsewhere forces the registry's opaque
  `ResolvedToolSet`/execute machinery across a domain boundary; chat stays tool-blind (its whole
  posture); a new domain is six coupled sites for one table with one consumer. Membership gating at
  the verbs reads `chat_participants` directly (the `crew/guard.ts` `requireParticipant`/host
  precedent) — non-member ⇒ leak-free NOT\_FOUND before any read (the injected-op caller-gate law).
- **Table `agent_tool_proposals`** (rides `0000_baseline` — pre-launch squash law; `ID_PREFIX`
  gains `agentToolProposal` → `agtprop_…`):

| Column | Shape | Notes |
| - | - | - |
| `id` | `AgentToolProposalId` PK | app-minted TypeID |
| `chatId` | FK `chats` CASCADE, NOT NULL | the room; authority DERIVES via membership at the verb (chats are ownerless — the `crew_edit_proposals` precedent). D23: an association row anchored by a required FK to canon — NO `ownerId` stamp |
| `proposerUserId` | FK `users` CASCADE, NOT NULL | the agent principal; CASCADE = owner-delete/agent-delete takes the proposals (containment rung 4, referential physics) |
| `toolName` | text NOT NULL | the TARGET registry tool (never the wrapper name) |
| `args` | json NOT NULL | the model's parsed args; re-parsed at accept |
| `summary` | text NOT NULL | the stash-rendered one-liner the review card shows |
| `status` | enum tuple, default `pending` | `AGENT_TOOL_PROPOSAL_STATUSES = ["pending", "accepted", "dismissed", "superseded", "expired"]` — drizzle `{enum}` + tuple-built CHECK (the character-proposals pattern) |
| `createdAt` / `expiresAt` / `resolvedAt` | int | lazy expiry (§3.5) |
| `resolvedByUserId` | FK `users` SET NULL | the confirmer/dismisser — the audit stamp |

Partial unique: `(chatId, toolName) WHERE status='pending'` — the replace-per-kind bound.
Status flips, never deletes (the audit trail survives — crew precedent).

- **Contracts (`@orb/contracts/tool-use`, new small node):** the statuses tuple + the refusal
  reasons + `AgentToolProposalView { id, chatId, toolName, summary, proposerUserId, status,
  createdAt, expiresAt }` (ids + capped strings; args stay server-side — the client renders the
  summary, never re-renders args). The proposable tuple itself stays server-side
  (`domain/tool-use/contract/`) — the client discriminates on statuses/reasons, not tool names.
- **tRPC:** a new `toolProposals` router — `listForChat` (host-gated read), `accept`, `dismiss`
  (host-gated writes). Every procedure gets its cross-tenant-sweep classification row (PROBED) in
  the same change — the new-router law.
- **Engine/exec-frame delta:** `ChatToolExecFrame` + `ToolExecutionContext` gain
  `agentSpeakerUserId: UserId | null` (threaded engine → compose adapter → tool-use); the compose
  adapter forwards it. Buddy/automation consumers pass null.

## 6. Chunk plan

Build order RH0 → RH3; each chunk lands green-whole (contracts→db→domain→transport→client — the
cake order). Sizes are S/M.

- [ ] **RH0 — shapes + schema (S).** `@orb/contracts/tool-use` (statuses, refusal reasons, view);
  `agent_tool_proposals` into `0000_baseline` (drizzle-kit regen + biome-format the meta);
  `ID_PREFIX.agentToolProposal`; the `ChatBusEvent` member + `CHAT_BUS_EVENT_TYPES` + bus-coverage
  gate map/mustPass + `check-gates.int` fixture (the three-coupled-sites law). Tests: contract
  round-trip; the bus exhaustiveness `satisfies` is the compile proof.
- [ ] **RH1 — the tool-use proposals slice (M).** `db`/`now` onto `ToolUseContext`; persistence
  (insert-replacing-pending batch, load, list, resolve-flip); `AGENT_PROPOSABLE_TOOL_NAMES` + the
  exhaustive summary-renderer `Record`; the wrapper derivation
  (`deriveProposeToolDefinitions(registry, stash)`); the `set_chat_title` target tool (chat-owned
  def over `chat.updateTitle`, the imagery closure idiom); `accept`/`dismiss`/`list` verbs with the
  full refusal ladder; `agentSpeakerUserId` onto `ToolExecutionContext`. Tests: persistence int
  (replace-per-kind batch, lazy expiry, flip audit); the accept matrix (every refusal code +
  the happy path executing through a real registry def); the D83 derive (codes match contracts).
- [ ] **RH2 — engine attach + compose wiring (M).** `ChatContext.resolveAgentProposeTools` (null =
  unwired byte-identical); the attach site + `canAgent("tool-propose")` degrade gate + the
  non-game-chat guard; `ChatToolExecFrame.agentSpeakerUserId` threaded; compose: register the
  derived wrappers into the one registry, wire the op + the stash. Tests: engine int — an
  agent-speaker turn attaches the wrappers and a model tool-call stashes a row (composed-REAL
  through compose, never a stub — the compose-stub-rot law); a character/human turn attaches
  nothing (byte-identical); a game-chat agent turn attaches nothing; the `tool-propose`-refused
  turn runs tool-less.
- [ ] **RH3 — transport + client + containment re-proof (M).** The `toolProposals` router + THREE
  sweep rows (PROBED); the host-filtered bus projection at the chat stream; the client review card
  (host-only affordance, D22 render-what-arrives, tokens-only) + the D83 copy mapper rows.
  **Containment suite extension (the D60 re-proof, the close-out bar):** disabled agent ⇒ no
  attach on a live turn AND `agent_disabled` on its pending; kicked ⇒ `proposer_not_seated`;
  re-enable restores confirmability; owner-delete cascades the rows; a
  propose-then-never-confirm asserts ZERO side effects (buddy inv-3, carried). Side-eye pass on the
  review card (rendered surface — done ≠ rendered).

## 7. Invariants (gate candidates)

1. **No agent turn ever executes a mutating registry tool in-turn.** The only in-turn tool surfaces
   on an agent-speaker turn are the derived `propose_*` wrappers (and rpg's seat-gated set on
   narrator turns, which are not agent-speaker turns). *(test: RH2's attach matrix; review: the
   attach site is ONE place.)*
2. **Confirm requires a human `Principal` and re-runs every gate fresh** — lifecycle, registry,
   seat, kill switch, then the target's own `capability`/verb gates under the confirmer. *(test:
   the accept matrix + the containment extension.)*
3. **`AGENT_PROPOSABLE_TOOL_NAMES` is the ceiling's tool axis** — a new member without a summary
   renderer or a confirm-matrix row is `tsc`/review red. *(compile: the exhaustive `Record`.)*
4. **One pending per `(chatId, toolName)`; flips never deletes.** *(schema: the partial unique;
   test: the replace batch.)*
5. **The wire never carries args back out** — the client sees `summary` + `toolName`, never a
   re-renderable args payload. *(review: the view shape; the contracts node owns it.)*

## 8. Open questions (owner-taste only — each with the maximal recommendation)

1. **Proposal visibility: host-only vs room-visible?** REC: host-only v1 (transport-filtered, the
   `plotUpdated` precedent) — the host is the sole authority and the card is a decision surface,
   not room content; widening later is a filter removal, not a migration.
2. **TTL: 72h?** REC: yes — long enough for an away host, short enough that a stale spend proposal
   dies on its own. One constant, trivially retuned.
3. **v1 proposable set: `generate_image` + `set_chat_title`?** REC: yes — one spend-shaped, one
   mutation-shaped member proves both arms of the confirm path; lore-entry proposals wait (crew's
   keeper overlaps — decide the one-home question when someone asks).
4. **May the proposing agent's OWNER dismiss (not accept) in an owner≠host room?** REC: no v1 —
   host-only keeps one authority; the owner's lever is unseating their agent (D83's
   `unseatAgent`), which already voids the pendings via `proposer_not_seated`.
