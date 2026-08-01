---
kind: audit
status: draft
updated: 2026-07-22
---

# Agent & Composition — Pain-Point Inventory

> **Scope.** A statement of CURRENT pain only — no fixes, no recommendations, no target shapes.
> Symptoms as they exist in the tree on 2026-07-22, so the problem can be seen whole before anything
> is decided. Each item is tagged by evidence level:
> **\[MEASURED]** proven this session by a live spike · **\[CODE]** read directly from the tree ·
> **\[STATED]** reported by the owner, not yet code-verified this pass.
>
> **STILL LIVE (docs-hygiene pass, 2026-08-02).** Kept here, not archived — most sections still
> describe the tree. What HAS been answered since, so nobody re-files it:
> **§7 workloads god-domain → ANSWERED by D117** (`Core-Path-Registry.md`) — the junk drawer is gone
> (58→30 files, 8 owner-domain `workload-contributions.ts` factories assembled at
> `entry/compose/workload-contributions.ts`; the 13 `Workload<X>Env` bundles died with it). §7's
> import/export split partially followed it (databank + import re-homed in stage D).
> **§7 settings god-feature → ANSWERED by SET-SEAMS** (`docs/design/set-seams-spec.md`, S0-S6 all
> landed; ledger entry pending with the S6 seal) — the god-feature is gone. Every knob pane
> DECOMPOSED into self-owned settings-SECTION contributions raised by the feature that READS the
> knobs, and `features/settings` is now the SHELL plus the theme: 18 files, whose only surfaces are
> `settings-shell-surface.tsx` (nav · fuzzy search · scroll-spy · deep link · the aggregate save
> footer) and `theme-picker-surface.tsx`. Adding a domain's settings is a section in that domain plus
> ONE line at the door — it cannot grow this feature.
> Everything else (§1-§6, §8, §9) is unaudited by that pass — treat as stated.

---

## 0. Working-tree state

- **\[CODE]** The tree is a debugging graveyard: untracked `shitsfucked`, `test_agent.ts`,
  `packages/server/src/test_agent.ts`, `dump_schema.ts`, `schema.json`; modified files across the
  agent-sdk backend (`agent-runner.ts`, `output-schema.ts`, `runner.ts`, `summarize.ts`) and
  `kit/structured-turn/index.ts`; a `wip: safe commit pending work` commit. The in-flight edits all
  sit on the structured-output / capability plumbing of the agent turn path (see §3).

---

## 1. Vocabulary collisions — one word, several meanings

- **\[CODE]** **"agent" means at least six different things** depending on where you stand:
  a principal (`db/schema/agent-principals.ts`), a provider backend
  (`infra/providers/backends/agent-sdk`), a session-provisioned entity
  (`domain/sessions/verbs/provision-agent.ts`), a chat seat
  (`domain/chat/.../agent-seat.ts`, `member-agent-row.tsx`), buddy's internal thing
  (`domain/buddy/agent/`, `buddy/substrate/agent.ts`), and compose roles
  (`entry/compose/agent-author.ts` / `agent-speaker.ts` / `agent-connection.ts`). It is also a
  provider *role* (`PROVIDER_ROLES` includes `"agent"`), an *api* (`ChatApi` includes `"agent-sdk"`),
  and a ceiling (`canAgent`). The same token spans identity, execution, seating, and authorization.

- **\[CODE]** **"session" means two unrelated things**, so much so that a spine rule exists solely to
  keep them apart — `core/Spine-Identity-and-Auth.md §"BFF session ≠ SDK chat session"`. One is the
  auth/login session (`domain/sessions/`); the other is the agent-sdk transcript resume cache
  (`infra/providers/backends/agent-sdk/session/`).

- **\[CODE]** **"party" is one concept stored in two homes.** `save-as-party-dialog.tsx` writes a
  characters-only roster-preset ("a party is a cast of characters"); `rpg_party`
  (`domain/rpg/persistence/party.ts`) is the live campaign's characters. Same "characters-only cast"
  meaning, two storage locations and two code paths.

---

## 2. The entity zoo — buddy / agents / crew / party / roster

- **\[CODE]** **An "agent" seated in a roster is just a buddy.** `agent-seat.ts`: *"v1: the only agent
  flavour is the owner's buddy."* The roster's `kind:'agent'` member and "buddy" are the same thing
  under two names.

- **\[CODE]** **buddy and crew are the same execution primitive with different triggers, built as two
  separate domains.** Both run turns via the one sealed `agentTurn`; buddy is reactive (an observer
  loop), crew is scheduled (workload members). Each is a full domain with its own bus, scheduler,
  config, and tables.

- **\[CODE]** **party sits on a different axis than the rest but gets grouped with them.** roster/party
  are *membership* (who is in the room); buddy/crew/agents are *execution* (what takes a turn). The
  five names get discussed as peers though they answer two different questions.

---

## 3. Execution axis — the agent turn

- **\[CODE]** **Every agent-turn caller forks by hand on `api === "agent-sdk"`.**
  `entry/compose/crew-turn.ts` literally throws (`"an agent-sdk connection uses runAgentTurn, not the
  chat role"`); buddy and rpg branch the same way. The fork is copy-pasted into each caller.

- **\[CODE]** **The `agent` provider-role dispatcher is a half-vestige in tension with its own domain.**
  `infra/providers/roles/agent.ts` hardcodes `"agent mode is always the agent-sdk"` and a fixed
  `AGENT_BACKEND = "agent-sdk"`, while `domain/connection/verbs/resolve-role.ts` (owner ruling
  2026-07-21) says agent turns default to the chat connection and *"ride the CHAT engine —
  chat-completions/responses/anthropic-messages → runChatTurn, agent-sdk → runAgentTurn."* Two places
  disagree about what an agent turn routes to.

- **\[CODE]** **Two tool loops exist.** The agent-sdk backend runs its own internal loop
  (`runAgentTurn`); the chat engine runs a generic recurse loop (`runRecurseLoop` in
  `domain/chat/engine/pipeline.ts`). The same "call tool → feed result → repeat" concept is
  implemented twice.

- **\[CODE]** **The generic loop lives inside the chat domain.** `runRecurseLoop` +
  `attachTools`/`attachResponseFormat`/`pivotCalls` are in `chat/engine/pipeline.ts`, so buddy/crew/rpg
  cannot reuse it without going through chat or reimplementing it.

---

## 4. Capability plumbing

- **\[CODE]** **Capability is carried whole on the chat path and hand-plucked on the agent path.**
  `resolveRole` produces `ResolvedConnection {api, model, credential, capability}`; `ChatRequest`
  carries the full `capability: ModelCapability`, but `AgentTurnRequest` carries only scalar flags
  (`supportsStructuredOutput`, `maxContextTokens`, `orSkinTierModels`). Each agent-turn caller
  re-derives `capability → flags` itself. The modified files in the working tree (§0) are this
  re-derivation being fought by hand.

- **\[CODE + MEASURED]** **Capability is source/model-keyed, but real tool-ability is cell-keyed
  (source × api).** `resolveModelCapability` sets `tools`/`output.structured` from `source`, ignoring
  the wire the turn will actually run on. Three concrete divergences:
  - **\[CODE]** anth-direct is tool-less by charter, yet a curated Claude model's capability advertises
    `tools` regardless of the anthropic-messages → anth-direct wire it lands on.
  - **\[MEASURED]** the vLLM arm hardcodes `tools: {parallel: true}` for every api, but a turn through
    `(agent-sdk, vllm)` runs tools sequentially, not in parallel (this session's spike).
  - **\[MEASURED]** the multi-turn tool-loop crash (`vllm#38738`, `"Invalid assistant message
    content=''"`) is model-dependent — reproduces on Mistral, not on this stack's Qwen3-VL-8B.

---

## 5. Provider matrix — specific cells

- **\[CODE]** **anth-direct is tool-less AND structured-output-less by charter** (D67; its header:
  *"PAID-KEY-ONLY, tool-less, stateless"*). The first-party Anthropic key therefore cannot run an
  agent turn on the raw direct wire at all — only through the agent-sdk skin. The limit is a scope
  decision (providers "part 02 §3b"), not an engine limit.

- **\[CODE]** **The vLLM backend breaks the folder convention.** Every other backend lives under
  `infra/providers/backends/<name>/`; vLLM lives one level up at `infra/providers/vllm/` because it
  also owns local GPU-engine supervision (`vllm/engine/supervisor.ts`, `gpu.ts`, `engine-control.ts`).

- **\[CODE]** **The agent-sdk backend keeps its own turn-state store** (`agent-sdk/session/frames.ts` +
  `store.ts`) — a second place turn state lives beside the DB canon. It is a derived in-memory cache
  (rebuildable from canon) that exists to bridge the SDK's stateful session model + preserve
  prompt-cache lineage, but it is state machinery the raw backends do not have.

- **\[MEASURED]** **Parallel tool calls are lost on the SDK path.** Same model, same engine, same
  3-city prompt:
  - raw `/v1/chat/completions` (hermes): 3 tool\_calls in one response.
  - raw `/v1/messages` (no SDK, `tool_choice: auto`): 3 tool\_use blocks in one response.
  - SDK → `/v1/messages`: one tool\_use per turn, sequential across turns.
    The Claude Code CLI serializes (via `disable_parallel_tool_use`, a real field on
    `ToolChoiceAuto/Any/Tool` in `@anthropic-ai/sdk`, set nowhere in the readable SDK JS — it lives in
    the compressed CLI binary and is not reachable through the SDK's `Options`). So on the SDK path,
    parallelism is unreachable regardless of engine or model.

---

## 6. Crew / agent-principal — orchestration duplication

- **\[CODE]** **The design is disciplined at the model level but duplicated at the orchestration
  level.** Both `agent-principal-design` and `chat-crew-design` insist on one auth spine and one
  `agentTurn` ("no second agent system"). Yet buddy and crew each implement the same pattern —
  *watch the chat bus → enqueue → run an agentTurn → react/propose* — in two separate domains. The
  crew README says it outright: crew's scheduler is *"the buddy observer pattern."*

- **\[CODE]** **The "no second agent system" line is repeated as a refrain** (agent-principal README
  ×3, crew README ×1+) — a boundary that has to be policed that hard is a boundary the structure keeps
  drifting across.

- **\[CODE]** **The buddy/crew boundary is decided case by case.** echo-chamber is "subsumed by buddy"
  rather than made a crew member; the split (reactive → buddy, scheduled → crew) is a judgment call
  between two systems that are both "background AI watching a chat."

---

## 7. Composition — god-domains and mirrored fragmentation

- **\[CODE]** **Client features mirror backend domains 1:1.** `client/features/buddy/` and
  `client/features/crew/` exist because `domain/buddy` and `domain/crew` exist — the client structure
  is derived from backend domain boundaries rather than from what a user sees, even though the client's
  sanctioned cross-domain path (a tRPC call; only *hook* imports across features are banned) does not
  require the mirror.

- **\[CODE]** **workloads is a god-domain.** `domain/workloads/runners/` holds 30+ runners owned by
  other domains (`rpg-*`, `crew-*`, `databank-*`, `assets-*`, `distill-*`, `reconcile-*`). Because a
  runner cannot import its home domain, `contract/runner-env.ts` imports from `@orb/contracts/crew`,
  `/databank`, `/rpg`, `/role-clients` and threads **13 `Workload<X>Env` bundles** wired at compose
  (its own header: *"the one true cross-feature composition seam"*). A new background job touches \~6
  sites. Jobs are organized by mechanism (async → workloads), not by ownership.

- **\[CODE]** **Import and export of the same entities live in different places.**
  `domain/export/` is lean (6 injected ops, reads `@orb/db` directly), but import runs as workload
  runners (`workloads/runners/import-bundle.ts`, `import-st.ts`) with a `WorkloadImportEnv`. The
  portability *core* (`@orb/contracts/portability`) is a clean entity-agnostic registry; the import
  half does not use it and is entangled in the god-domain instead.

- **\[CODE]** **settings is a god-feature on the client.** `client/features/settings/` houses seven
  domains' settings surfaces, forms, hooks, and mutations (`tags-settings`, `chat-behavior-settings`,
  `regex-settings`, `theme-picker`, `expressions-settings`, `appearance-settings`, `system-settings`
  - matching `use-*-form` / `use-*-mutations`). Adding a domain's settings adds a surface + form + hook
  - mutation to this one feature.

- **RESOLVED 2026-08-01 by SET-SEAMS** (the bullet above; `docs/design/set-seams-spec.md` §8, receipts
  per stage): S0 mechanism `30f43f69` (ONE section registry + `anchor: SettingsCategoryId` +
  `owns`/partition + the save-status seam) · S1 appearance → chat/app-shell/character `9d4646d4` ·
  S2 chat-behavior → chat `65f0865c` · S3 workloads + admin → their own features `1eaa962c` ·
  S4 system → user-admin, pane merged into admin `7813dbed` · S5 tags + regex →
  `features/tag`/`features/regex` `0072e598` · S6 seal (this commit). Every surface named above is
  DELETED or re-homed: no `tags-settings`, `chat-behavior-settings`, `regex-settings`,
  `appearance-settings` or `system-settings` under `features/settings` — the only
  `use-*-form`/`use-*-mutations` pair left is the theme's, which is settings-domain. The pain-point's
  own predicted cost is inverted: a domain's settings now costs a section IN THAT DOMAIN plus one
  door line.

- **\[CODE]** **The right pattern already exists in-tree but is applied inconsistently.** The registry
  shape (thin core + per-thing descriptor) is present in the portability core, the `character-detail`
  `editor-sections` registry, and the `chat-surface` anchors — but workloads, settings, and the agent
  client surfaces do not use it.

---

## 8. Runtime bugs (owner-reported)

- **\[STATED]** **localStorage can hard-brick a session.** If localStorage is invalidated, the app
  enters an autosave loop — it saves settings, then reverts, then saves again — and only a manual
  clear recovers it. Not yet traced to code this pass.

---

## 9. Information architecture (owner-reported)

- **\[STATED]** **The four-sections client law is violated.** A "societies" area and an "rpg flank"
  sit in a weird slot the four-section shell did not anticipate; the client lockdown was reported
  closed, yet these punched through it. Not re-verified against the shell code this pass.

- **\[STATED]** **The context menu is over- and under-used at once** — overloaded in some places,
  absent where it is expected in others.

---

## Cross-cutting observation (not a fix — a shape the symptoms share)

Many of the items above are the same shape seen from different sides: a cross-domain concern
(an agent turn's capability, a background job, an entity's import, a domain's settings, an agent
surface) is either **centralized into one domain/feature that must then know about everyone**
(workloads, settings) or **fragmented to mirror a boundary that the composition seam did not require**
(client agent features). The vocabulary collisions in §1 and the orchestration duplication in §6 are
the same tension expressed in naming and in structure. Stated here only as the pattern the pains have
in common — the response to it is out of scope for this document.
