---
name: agent-authoring
description: "The complete reference for writing and optimizing Codex subagent definition files (.Codex/agents/*.md) — all 17 YAML frontmatter fields with types, defaults and version floors; exactly what a subagent does and does NOT inherit at startup (AGENTS.md yes, auto memory no, output style no); the scope/precedence rules across user, project and plugin agents; the concurrency and nesting limits and the env vars that govern them; and this repo's own conventions for its nine-role fleet. Use when creating a new agent, auditing or optimizing existing agent files, deciding which fields a role should set, or debugging why an agent behaves differently from the main session."
---

# Authoring Codex agent files

Reference verified against the official subagents documentation at Codex **2.1.231** (2026-08-13).
Field set and defaults change between releases — re-verify against `code.Codex.com/docs/en/sub-agents`
before trusting this on a much newer version, and check `marckrenn/Codex-changelog`'s
`system-prompts/` diffs for behavior changes that never get a changelog line.

## §1 File shape and scope

An agent is a markdown file: YAML frontmatter, then the body, which **becomes the agent's system prompt**.

| Scope | Location | Notes |
|---|---|---|
| User | `~/.Codex/agents/` | available in every project |
| Project | `.Codex/agents/` | checked in, team-shared; wins over a user agent of the same name |
| Plugin | `<plugin>/agents/` | ignores `permissionMode`, `mcpServers`, and `hooks` |

Codex watches both directories and picks up edits within seconds — no restart. **Two exceptions
that DO need a restart:** the watcher only covers directories that existed at session start (so the first
agent file in a brand-new `agents/` dir needs one), and sessions started with `--disable-slash-commands`
don't watch at all.

## §2 The complete frontmatter field set (17 fields; only 2 required)

| Field | Req | Type / values | Default |
|---|---|---|---|
| `name` | **yes** | lowercase + hyphens. **No `:`** — reserved for plugin scoping; a file with one fails to load (silently, before v2.1.218). Filename need not match. Hooks receive it as `agent_type` | — |
| `description` | **yes** | when Codex should delegate here. This is the routing signal — write it as trigger conditions, not a job title | — |
| `tools` | no | comma-separated tool names. Omitted = **inherits every subagent-available tool** | inherit all |
| `disallowedTools` | no | deny-list, subtracted from inherited or specified tools | — |
| `model` | no | `sonnet` · `opus` · `haiku` · `fable` · full ID · `inherit` | **`inherit`** |
| `permissionMode` | no | `default` · `acceptEdits` · `auto` · `dontAsk` · `bypassPermissions` · `plan` · `manual` (alias for `default`, v2.1.200+) | session default |
| `maxTurns` | no | integer cap on agentic turns | unlimited |
| `skills` | no | skills preloaded at startup — **full content injected**, not just the description | — |
| `mcpServers` | no | server names or inline configs, scoped to this agent | inherits session MCP |
| `hooks` | no | lifecycle hooks scoped to this agent | — |
| `memory` | no | `user` · `project` · `local` — the agent's **own** persistent auto-memory directory | off |
| `background` | no | `true` forces background even when the result is needed now | Codex chooses (background by default since v2.1.198) |
| `effort` | no | `low` · `medium` · `high` · `xhigh` · `max` (availability depends on model) | inherits session |
| `isolation` | no | `worktree` — temporary git worktree, auto-removed if unchanged | none |
| `color` | no | `red` `blue` `green` `yellow` `purple` `orange` `pink` `cyan` | — |
| `initialPrompt` | no | auto-submitted first turn — **only** when the agent is the main-session agent (`--agent` / the `agent` setting) | — |

**Two field traps.** `tools` with no resolvable entry makes the agent **fail to launch** with a
zero-tools error. And to preload a skill use `skills:`, never `Skill` in the `tools` list — they do
different things.

## §3 What an agent actually starts with

A non-fork subagent's initial context is **only**:

- its own system prompt (this file's body) plus environment details — *not* the full Codex system prompt
- the delegation message the orchestrator wrote
- **the whole AGENTS.md hierarchy** — `~/.Codex/AGENTS.md`, project `AGENTS.md`, `.Codex/rules/*`,
  `Codex.local.md`, managed policy
- git status (snapshot from parent session start)
- full content of any `skills:` listed
- a sibling roster for `SendMessage` — **only if** `SendMessage` is in its `tools` and another agent is named (v2.1.206+)

It does **NOT** get: your conversation history, files you already read, your **auto memory**
(`MEMORY.md` and every topic file — main-session only), or your **output style**. Its context window is
sized by **its own model**, not yours.

> The built-in `Explore` and `Plan` agents are the sole agents that skip AGENTS.md and git status, and
> there is no field to change that. **Open question for this repo:** we ship a *custom* `Explore.md` that
> shadows the built-in name — it is unverified whether the skip keys on the name or on built-in identity.
> If it keys on name, our custom Explore receives no AGENTS.md at all. Renaming it sidesteps the question.

**Consequence for briefs:** any memory lesson a lane needs must be restated in the brief. The agent
cannot read your memory.

## §4 Limits and the env vars that move them

| Limit | Default | Env var |
|---|---|---|
| Nesting depth below main | **3** (was 1 in 2.1.217-218; 5 and uncappable in 2.1.172-216) | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` |
| Concurrent running subagents | **20** (ultracode sessions exempt) | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` |
| Total subagents per session | none since v2.1.224 | — |

At the depth limit Codex withholds the `Agent` tool from every subagent except a fork. **This repo
pins depth to 1** in `~/.Codex/settings.json` `env`, and every role additionally omits `Agent` from its
`tools` — belt and braces, deliberately.

## §5 Repo conventions for our nine roles

Our fleet: `scout`, `Explore` (user scope) · `executor`, `forge`, `mech-executor`, `security-executor`,
`side-eye`, `stickler`, `verifier` (project scope). Routing policy lives in
`.Codex/rules/orchestration.md` — this file is about how the *files* are written.

Standing conventions:

- **Always set `model` explicitly.** It defaults to `inherit`, and an inherited frontier model across a
  five-lane fan-out is the single largest avoidable cost in this project.
- **Always set `effort`.** It also inherits, so an expensive session silently makes every lane expensive.
- **Never grant `Agent`.** Roles are leaves by construction, not by instruction.
- **Grant `SendMessage` only to roles that report mid-run** and are worth resuming as warm legs — it is
  also what unlocks the sibling roster.
- **Security-dominant work never runs on a Fable-tier agent**, and never in the main session.

Fields we do **not** yet use and should evaluate per role: `permissionMode` (a lane cannot answer a
permission prompt — this is the targeted fix for stalls), `memory` (persistent cross-session learning,
strongest case is `stickler` accumulating this repo's law), `mcpServers` (scoping a server to one role
stops every other agent paying its tool schemas in context), `disallowedTools`, `maxTurns` as a runaway
guard, and `isolation: worktree` in-file rather than passed at dispatch.

## §6 Writing the body

The body is the system prompt, so write it as instructions to the agent, not documentation about it.
Front-load the non-negotiables; an agent reads its prompt once and never sees your corrections. State
what a correct **refusal** looks like — a lane that correctly refuses an impossible task is a success,
and agents that do not know that will improvise instead.

Keep `description` written as delegation triggers. Codex routes on that string, so "use when X, Y, or Z
is true" outperforms a noun phrase.
