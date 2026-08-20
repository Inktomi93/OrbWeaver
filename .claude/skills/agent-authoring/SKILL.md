---
name: agent-authoring
description: "Author, convert, audit, or debug Orbweaver subagents for Claude Code and Codex, including Claude Markdown frontmatter, Codex TOML manifests, explicit model and reasoning routing, instruction inheritance, skill preloads, sync validation, and hook or trust interactions. Use before changing agent definitions or the Claude-to-Codex sync machinery."
---

# Authoring agents for Claude Code and Codex

Claude is Orbweaver's role-prose source. The Claude contract below was verified against the official
subagents documentation at Claude Code **2.1.231** (2026-08-13).
Field set and defaults change between releases — re-verify against `code.claude.com/docs/en/sub-agents`
before trusting this on a much newer version, and check `marckrenn/claude-code-changelog`'s
`system-prompts/` diffs for behavior changes that never get a changelog line.

## §1 File shape and scope

An agent is a markdown file: YAML frontmatter, then the body, which **becomes the agent's system prompt**.

| Scope | Location | Notes |
|---|---|---|
| User | `~/.claude/agents/` | available in every project |
| Project | `.claude/agents/` | checked in, team-shared; wins over a user agent of the same name |
| Plugin | `<plugin>/agents/` | ignores `permissionMode`, `mcpServers`, and `hooks` |

Claude Code watches both directories and picks up edits within seconds — no restart. **Two exceptions
that DO need a restart:** the watcher only covers directories that existed at session start (so the first
agent file in a brand-new `agents/` dir needs one), and sessions started with `--disable-slash-commands`
don't watch at all.

## §2 The complete frontmatter field set (17 fields; only 2 required)

| Field | Req | Type / values | Default |
|---|---|---|---|
| `name` | **yes** | lowercase + hyphens. **No `:`** — reserved for plugin scoping; a file with one fails to load (silently, before v2.1.218). Filename need not match. Hooks receive it as `agent_type` | — |
| `description` | **yes** | when Claude should delegate here. This is the routing signal — write it as trigger conditions, not a job title | — |
| `tools` | no | comma-separated tool names. Omitted = **inherits every subagent-available tool** | inherit all |
| `disallowedTools` | no | deny-list, subtracted from inherited or specified tools | — |
| `model` | no | `sonnet` · `opus` · `haiku` · `fable` · full ID · `inherit` | **`inherit`** |
| `permissionMode` | no | `default` · `acceptEdits` · `auto` · `dontAsk` · `bypassPermissions` · `plan` · `manual` (alias for `default`, v2.1.200+) | session default |
| `maxTurns` | no | integer cap on agentic turns | unlimited |
| `skills` | no | skills preloaded at startup — **full content injected**, not just the description | — |
| `mcpServers` | no | server names or inline configs, scoped to this agent | inherits session MCP |
| `hooks` | no | lifecycle hooks scoped to this agent | — |
| `memory` | no | `user` · `project` · `local` — the agent's **own** persistent auto-memory directory | off |
| `background` | no | `true` forces background even when the result is needed now | Claude chooses (background by default since v2.1.198) |
| `effort` | no | `low` · `medium` · `high` · `xhigh` · `max` (availability depends on model) | inherits session |
| `isolation` | no | `worktree` — temporary git worktree, auto-removed if unchanged | none |
| `color` | no | `red` `blue` `green` `yellow` `purple` `orange` `pink` `cyan` | — |
| `initialPrompt` | no | auto-submitted first turn — **only** when the agent is the main-session agent (`--agent` / the `agent` setting) | — |

**Two field traps.** `tools` with no resolvable entry makes the agent **fail to launch** with a
zero-tools error. And to preload a skill use `skills:`, never `Skill` in the `tools` list — they do
different things.

## §3 What an agent actually starts with

A non-fork subagent's initial context is **only**:

- its own system prompt (this file's body) plus environment details — *not* the full Claude Code system prompt
- the delegation message the orchestrator wrote
- **the whole CLAUDE.md hierarchy** — `~/.claude/CLAUDE.md`, project `CLAUDE.md`, `.claude/rules/*`,
  `CLAUDE.local.md`, managed policy
- git status (snapshot from parent session start)
- full content of any `skills:` listed
- a sibling roster for `SendMessage` — **only if** `SendMessage` is in its `tools` and another agent is named (v2.1.206+)

It does **NOT** get: your conversation history, files you already read, your **auto memory**
(`MEMORY.md` and every topic file — main-session only), or your **output style**. Its context window is
sized by **its own model**, not yours.

> The built-in `Explore` and `Plan` agents are the sole agents that skip CLAUDE.md and git status, and
> there is no field to change that. **Open question for this repo:** we ship a *custom* `Explore.md` that
> shadows the built-in name — it is unverified whether the skip keys on the name or on built-in identity.
> If it keys on name, our custom Explore receives no CLAUDE.md at all. Renaming it sidesteps the question.

**Consequence for briefs:** any memory lesson a lane needs must be restated in the brief. The agent
cannot read your memory.

## §4 Limits and the env vars that move them

| Limit | Default | Env var |
|---|---|---|
| Nesting depth below main | **3** (was 1 in 2.1.217-218; 5 and uncappable in 2.1.172-216) | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` |
| Concurrent running subagents | **20** (ultracode sessions exempt) | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` |
| Total subagents per session | none since v2.1.224 | — |

At the depth limit Claude Code withholds the `Agent` tool from every subagent except a fork. **This repo
pins depth to 1** in `~/.claude/settings.json` `env`, and every role additionally omits `Agent` from its
`tools` — belt and braces, deliberately.

## §5 Repo conventions for our nine roles

Our fleet: `scout`, `Explore` (user scope) · `executor`, `forge`, `mech-executor`, `security-executor`,
`side-eye`, `stickler`, `verifier` (project scope). Routing policy lives in
`.claude/rules/orchestration.md` — this file is about how the *files* are written.

Standing conventions:

- **Always set `model` explicitly.** It defaults to `inherit`, and an inherited frontier model across a
  five-lane fan-out is the single largest avoidable cost in this project.
- **Always set `effort`.** It also inherits, so an expensive session silently makes every lane expensive.
- **Never grant `Agent`.** Roles are leaves by construction, not by instruction.
- **Grant `SendMessage` only to roles that report mid-run** and are worth resuming as warm legs — it is
  also what unlocks the sibling roster.
- **Security-dominant work never runs on a Fable-tier agent**, and never in the main session.

Adopted 2026-08-14 (the agents-revamp lane): `permissionMode` on the build roles (a lane cannot answer
a permission prompt — the targeted fix for stalls), `memory: project` on stickler/verifier,
`mcpServers: ["authentik"]` scoped to security-executor. Still unevaluated: `disallowedTools`,
in-file `isolation: worktree`.

**`maxTurns` is BANNED on every agent in this fleet (owner ruling, 2026-08-14, verbatim "hell no").**
The dispatch model is bigger chunks per agent — area-lanes, 4-8 items, warm continuation legs — chosen
FOR cache economics and wider dispatch. A turn cap decapitates exactly the long lanes that model
produces, and a lane killed mid-area re-pays its whole cold read on redo. Runaway protection is the
orchestrator's job (it watches lanes and can TaskStop), never a per-agent ceiling. Do not re-add this
field; do not "helpfully" suggest it in reviews of agent files.

## §6 Writing the body

The body is the system prompt, so write it as instructions to the agent, not documentation about it.
Front-load the non-negotiables; an agent reads its prompt once and never sees your corrections. State
what a correct **refusal** looks like — a lane that correctly refuses an impossible task is a success,
and agents that do not know that will improvise instead.

Keep `description` written as delegation triggers. Claude routes on that string, so "use when X, Y, or Z
is true" outperforms a noun phrase.

## §7 Codex target contract

Codex project agents live at `.codex/agents/*.toml`. Every standalone manifest requires `name`,
`description`, and `developer_instructions`. Normal config fields such as `model`,
`model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and `skills.config` may be set per role.
Claude-only fields such as `permissionMode`, `tools`, `disallowedTools`, `color`, `memory`, and the YAML
`skills` list are not Codex TOML fields.

Re-verify material Codex changes against the official
[subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents). This Codex
section was refreshed for Codex 0.148.0-alpha.9 on 2026-08-19.

Orbweaver generates Codex manifests from `.claude/agents/*.md`; never hand-edit a generated TOML. The
converter carries the shared body over, adds a Codex compatibility preamble, translates skill preloads
into explicit read instructions, and refuses an unmapped role. Current routing:

| Role class | Codex model |
| - | - |
| Mechanical execution | `gpt-5.6-luna` |
| Everyday execution, verification, UX, security | `gpt-5.6-terra` |
| Frontier design or analysis (`forge`, `stickler`) | `gpt-5.6-sol` |

Preserve each source role's `effort` as `model_reasoning_effort`. Security stays on Terra rather than
the frontier tier, matching the role's explicit routing law.

## §8 Shared authoring workflow

1. Read `.claude/rules/orchestration.md`, the complete source role, and every skill it preloads.
2. Edit the Claude source. Change the converter only when the host translation itself changes.
3. Run `pnpm agents:sync`; inspect the generated TOML and model/effort routing.
4. Run `pnpm check:agents` and `pnpm exec vitest run tests/tooling/codex-agent-config.int.test.ts`.
5. Start a fresh Codex session when validating discovery; an existing session can retain its startup
   agent catalog.

Treat delegation briefs as self-contained in both hosts. Do not assume a subagent inherits the main
session's memory, output style, prior file reads, or unstated decisions.

Codex project hooks live in `.codex/hooks.json`; `.codex/hooks` points at the Claude-owned
implementations. A hook change can require the user to re-trust the project in a fresh Codex session.
Do not bypass that prompt or edit user-global trust state.

Repository skills have the same one-source shape: author them under `.claude/skills`, while
`.agents/skills` is the tracked Codex discovery symlink. Codex officially scans `.agents/skills` and
follows symlinked skill folders, so never recreate a second copied skill tree.
