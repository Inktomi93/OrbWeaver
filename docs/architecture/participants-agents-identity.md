# Orbweaver — participants, agents, identity (character & persona)

> **Status: planning (authoritative detail).** The model for who/what is in a chat: human participants
> (personas) and agent participants (characters, buddy). Folds in the "characters as agents" reframe
> that dissolves the agent-sdk↔completions parity pain. Grounded in whole-file recon of neo-tavern's
> character/persona domains + the agent-sdk runner/env/name-stamping code, and the group-chat plan.

## 0. The foundation is a stateless CHAT TURN; "agent mode" is opt-in (NOT the whole bet)

The canonical abstraction is **not** "an agent." It's a **stateless chat turn**:

> A **chat turn** = `(system prompt, this-participant's-view-of-canon, connection) → reply`. A pure
> function of canon. **Pluggable backends** run it; most turns never touch the heavyweight agent SDK.

**Agent mode** (tools + multi-turn loop + a session) is an **opt-in capability layered on top**, for the
turns that genuinely need it (buddy, future tool-using characters) — not the substrate everything sits
on. A character is a *participant with its own connection*; by default its turn is a plain stateless chat
turn; it *may* opt into agent mode.

### The two Anthropic packages (the reality)
- **`@anthropic-ai/claude-agent-sdk`** — the only DIRECT dep, the only one imported. Heavyweight: spawns
  the Claude Code runtime binary, sessions, MCP tools, env-configured. neo-tavern uses it **two ways** —
  constrained single-turn for *primary chat* (the imitation pain) and the full agentic loop for *buddy*.
- **`@anthropic-ai/sdk`** — the plain Anthropic **Messages API**, installed only as the agent SDK's
  *peer* (nested, not imported). It **requires an Anthropic API key, which we do not have/use** — so it
  stays the **unused peer**, NOT a backend we adopt. We reach Claude only via the sub or via OpenRouter.

### The three connection paths (the only ones we use)
1. **Sub** → `claude-agent-sdk` (host `claude login`; the only legal way to use the sub).
2. **agent-sdk skin → an OpenRouter Claude model** → `claude-agent-sdk` pointed at OpenRouter
   (paid Claude through the agent-sdk *runtime*; for agent mode / sub-parity behavior on a paid model).
3. **chat-completions** → OpenRouter (any model incl. Claude), vLLM, custom-openai — stateless.

### Backend matrix (which runner runs a chat turn)
| Backend | Serves | State |
|---|---|---|
| OpenRouter chat-completions / responses | **the stateless default for ALL OpenRouter models, incl. Claude-via-OR** | stateless |
| vLLM | local | stateless |
| custom-openai | BYO endpoint | stateless |
| `claude-agent-sdk` | **(a) the Max sub** (its only legal path); **(b) agent mode** (tools/loops), on the sub OR on paid Claude via the OpenRouter skin env | stateful (session = a canon-derived cache, backend-internal) |

So `claude-agent-sdk` is **reserved**: the Max sub + agent mode. Plain Claude-via-OpenRouter goes through
**stateless chat-completions** (cheaper, no agent-SDK tax) — the skin is only for sub-required or
agent-mode turns. There is **no direct-Anthropic-API backend** (no key).

### Why this dissolves the pain *without* betting on agents
- **Env-knobs + seed/reseed/statefulness live ONLY in the `claude-agent-sdk` backend** — invoked for
  sub-path turns (required) and agent-mode turns. Everyone else (Claude-via-OR, vLLM, custom-openai,
  plain chat) is stateless and never touches it; its session is a canon-derived cache (backend-internal,
  not a domain concept) — no `sessionDirty`/mode-flip/orphan-reap in the domain.
- **Name merge-tax dies from per-participant isolation, regardless of backend.** Each participant owns
  its own role-tagged view; the only surviving concern is "render *other* participants' turns into THIS
  one's view" — one rendering job (the egocentric view-builder), not the `applyNamesBehavior` +
  `prefixNames` + `authorName`-smuggling + `truncateAtForeignLabel` quartet.
- **Buddy + chat unify at the seam that matters** — one chat-turn path; "agent mode" is a `tools?` +
  loop flag on top, used by buddy and opt-in characters. Not two ad-hoc agent systems.

## 1. Participants — the roster (humans + agents)

A chat has a **roster of participants**, each either a **human** (carries a persona) or an **agent**
(carries an identity + a connection). (Same `kind: human | character` discriminator neo-tavern already
has — but here "character" participants are *agents*.)

- **Human participant** → `{ userId, activePersona, role: host|member }`. Brings their OWN persona.
- **Agent participant** → `{ identity (character id), connection, tools?, role }`. An AI voice.

Solo chat = a roster of {1 human, 1 agent}. Group = N. There is no separate "group system" — group is
just a larger roster (the group-chat plan's thesis, applied here natively).

## 2. Agent = (identity, connection, view, tools)

An agent is the AI side of the roster. Four parts, each a clean seam:

| Part | What | Note |
|---|---|---|
| **identity** | the character card (the flat live `characters` row — D28) — name, description, persona, scenario, depth-prompt | resolved from `characters.id` at use (live identity, §4); buddy's "soul" is the same shape with no card |
| **connection** | which model/runner voices THIS agent | **per-agent** (a character can run on a different model than another; buddy = "always cheap"). Defaults to the chat/role default, overridable per agent. New routing axis: per-agent, not per-user. |
| **view** | this agent's egocentric view of canon (what it witnessed; other agents' turns rendered in) | the ONE name/merge concern that survives — owned by the view-builder |
| **tools** | optional in-process MCP server | character = none; buddy = its tool server. The only structural diff between a "roleplay agent" and a "tool agent" (`maxTurns`, `mcpServers`). |

**The agent turn is stateless-first:** `runAgentTurn(systemPrompt, view, connection, tools?) → reply`.
chat-completions runs it directly. The agent-sdk backend runs it by maintaining a canon-derived session
cache (its concern, not the domain's).

## 3. Persona — per-participant, anchor, attribution (multi-human future-proof)

Persona is the **human** side. Three roles, three homes — no more, and the dormant scaffolding goes live:

| Role | Home | Status change for orbweaver |
|---|---|---|
| **active** (who this human is playing now) | `chat_participants.activePersonaId` (per human) | **MAKE IT LIVE.** Assembly reads the *participant's* active persona. **Drop `chats.personaId`** (today's host-persona second home that can diverge). Host is just a participant. |
| **anchor** (the `{{user}}` POV the card's `{{user}}` resolves against) | the chat-level anchor (`pinnedPersonaId` → rename `anchorPersonaId`) | **KEEP** — the dual-persona rule (anchor stable so a mid-chat switch never rewrites the card's established `{{user}}`) is built + elegant; carry it forward. |
| **attribution** (who actually said a given line) | `messages.personaId` + `messages.authorUserId` | keep; server-stamped, never client-supplied |

**Multi-human (your requirement):** because active persona is per-participant, when a registered user
(e.g. buddy) is invited into a group chat, **their** current persona flows through and **yours** does
too — each human's lines render under their own persona. The anchor (`{{user}}`) is the room's chosen
POV (default = host). This is the group-chat plan §5a model, made the default shape instead of dormant.

**The dual-persona render rule (keep, from neo-tavern):** card-authored / character-content sections
render against the **anchor** persona; user-authored sections (literal blocks, persona marker,
chat-attached WI) render against the speaking participant's **active** persona. `setActivePersona` needs
no reseed (persona lives in the per-turn system prompt).

**Fix the lossy bit:** `createFromCharacter`'s `{{char}}↔{{user}}` string-swap is a one-way lossy
transform — redesign so a persona-from-card keeps a reference / re-derivable mapping rather than baking
a swapped string.

## 4. Character — one flat live card + a git-commit history (D28)

- **One table holds the card (D28):** `characters` is a **FLAT row that IS the card** — identity
  (id, handle, owner, flags) **and** all content (name, description, personality, greetings, systemPrompt,
  the typed promotions, …) on the same row. The neo `character_versions` table is **GONE**; there is no
  `currentVersionId`, no `version` counter, no version table.
- **History is a separate log nothing gates on:** `character_snapshots` `{id, characterId FK CASCADE,
  content (full-card JSON), label?, createdAt}` — append-only, **nothing FKs it**. The git working-tree +
  commit-log split: the `characters` row is the working tree (edit in place — always safe, no CAS, no COW);
  `character_snapshots` is the commit log (browse it, `restore` copies a blob → the live row, in place).
  The whole `cow.ts` machinery (`versionPinned` + `forkVersion` + the in-place CAS) is **deleted** — it
  existed *only* because chats pinned a cv. `messages.characterId` (identity attribution) is the seam this
  builds on; reading the card is `getCard` (a plain `characters`-row read — there is no version to resolve).
- **Snapshots = restorable history**, never a thing a chat is welded to. Back them up so people can track
  changes + restore; everything else follows the one live row.
- **Association keys (D28 — all identity-keyed).** `character_personas` AND `character_books` both key on
  `characters.id`. (Neo keyed books on the cv to snapshot injected content per pinned version; with no cv
  that asymmetry is gone — the live card's book set is read at assemble. A future "freeze lore at a
  snapshot" feature would reference a `character_snapshots` id, never a cv.)
- **`synthetic` group character** (the §11.5 group-as-character memory bucket) stays — a hidden agent
  identity for a room's shared memory; one flat `characters` row like any other.

## 5. How this dissolves the two named pains (before → after)

| Pain (neo-tavern) | Cause | orbweaver |
|---|---|---|
| **Names at start of message** | one assistant stream merges N characters → must stamp/strip/fence names, twice (wire + SDK frames) + smuggle `authorName` + truncate foreign labels (agent-sdk has no stop param) | per-agent isolation = no merge. Each agent owns its role-tagged view; "other agents' turns" are rendered by ONE view-builder. No stamping quartet, no truncation band-aid. |
| **agent-sdk env knobs** | spawning a coding-agent binary configured only via env → ~11 isolation pins + a reserved-keys denylist, load-bearing on every turn | agent-sdk is ONE backend; its env config is a backend detail. The canonical (completion) runner needs none of it. |
| (bonus) **seed/reseed statefulness** | making a stateful runtime imitate stateless | agent turn is stateless-first; SDK session = a derived cache of canon (rebuilt when stale, like a digest). 7 mechanisms → backend-internal or gone. |

## 6. Decisions / risks (resolved / deferred)

- **Per-agent connection (a new routing axis) — RESOLVED: default = the role default, per-agent override
  optional.** Routing/credential resolution becomes per-agent, resolved in
  `connection.resolveRoleConnection` (the agent is a role — `agent` for buddy, the `chat` role default for
  a character — with an identity). A participant's own `{backend, model}` override wins over the role
  default when present; absent, it inherits the default. Aligns with `domains/connection.md §1` +
  `domains/connection.md §"Per-agent capability"`.
- **Stateless-first vs the Max-sub cache — RESOLVED: backend owns the cache, no upward leak.** The
  agent-sdk session cache (the prompt-cache survival that makes Max-sub cheap) lives **backend-internal**
  in `infra/providers/backends/agent-sdk/session/`; it reseeds-from-canon when stale. Stateless-first is the domain
  contract — the domain has no session concept. (Locked set — not re-opened.)
- **Buddy unification scope — RESOLVED: agent is a PATTERN, not a domain.** There is **no `domain/agent`**;
  "agent" is the participant shape `(identity, connection, view, tools)` (§2). Buddy is the first consumer
  of the pattern — "an agent with tools + its own connection + a soul instead of a card" — and folds its
  ad-hoc router/memory/prompt onto it. Aligns with `buddy.md` (which leans PATTERN).
- **`createFromCharacter` lossy macro-swap (§3) — RESOLVED: keep a re-derivable mapping, don't bake a
  swapped string.** The persona-from-card stores a reference to its source character + the
  `{{char}}↔{{user}}` mapping **as data**, so the original is reconstructable; the one-way string-swap is
  retired. (Exact storage shape is persona's to land — a back-reference field + the swap map.)

## 7. Invariants (gate candidates)

1. **A chat turn is a pure function of canon** — no domain-level session state; the `claude-agent-sdk`
   session is a backend-internal cache, reseedable from canon. Agent mode is opt-in, not the default.
2. **Each participant owns its egocentric view** — no merged multi-character assistant stream; name
   rendering lives in ONE view-builder, not a stamping quartet.
3. **One chat-turn path** — agent mode (tools + loop) is a `tools?`/loop flag on it (buddy + opt-in
   characters); no second agent system. `claude-agent-sdk` is reserved for the Max sub + agent mode.
4. **Persona active is per-participant** (roster), anchor is per-chat, attribution is per-message — no
   `chats.personaId` second home.
5. **Character associations key on `characters.id`** (identity), never a version.
6. **There is no character version table** — the card is the flat `characters` row (read via `getCard`);
   history is the `character_snapshots` log (browse + `restore`), which nothing FKs and which gates nothing.
