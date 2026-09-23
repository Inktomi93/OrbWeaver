---
name: agent-authoring
description: "Author, convert, audit, or debug Orbweaver subagents for Claude Code and Codex, including Claude Markdown frontmatter, Codex TOML manifests, explicit model and reasoning routing, instruction inheritance, skill preloads, sync validation, and hook or trust interactions. Use before changing agent definitions or the Claude-to-Codex sync machinery."
---

# Authoring agents for Claude Code and Codex

Claude is the role-prose source; Codex manifests are generated from it. Re-verify field behavior
against the official subagents documentation before trusting this on a newer Claude Code or Codex
release — field defaults change between releases.

## File shape and scope

An agent is a Markdown file: YAML frontmatter, then a body that becomes the agent's system prompt.

| Scope | Location | Notes |
| - | - | - |
| User | `~/.claude/agents/` | available in every project |
| Project | `.claude/agents/` | checked in, wins over a user agent of the same name |
| Plugin | `<plugin>/agents/` | ignores `permissionMode`, `mcpServers`, `hooks` |

The watcher only covers directories that existed at session start. Add the first agent file to a new
`agents/` directory, then restart.

## Frontmatter fields

Only `name` and `description` are required.

| Field | Notes |
| - | - |
| `name` | lowercase and hyphens, no `:`. A file with one fails to load |
| `description` | write as delegation triggers ("use when X"), not a job title — Claude routes on this string |
| `tools` | comma-separated. Omitted inherits every subagent-available tool. A list with no resolvable entry fails the agent to launch |
| `disallowedTools` | deny-list subtracted from inherited or specified tools |
| `model` | `sonnet` \| `opus` \| `haiku` \| `fable` \| full ID \| `inherit` (default). Set it explicitly — an inherited frontier model across a lane fan-out is the largest avoidable cost |
| `permissionMode` | `default` \| `acceptEdits` \| `auto` \| `dontAsk` \| `bypassPermissions` \| `plan` \| `manual` |
| `skills` | preloaded at startup, full content injected. To preload a skill use `skills:`, never `Skill` in `tools` |
| `mcpServers` | server names or inline configs, scoped to this agent |
| `hooks` | lifecycle hooks scoped to this agent |
| `effort` | `low` \| `medium` \| `high` \| `xhigh` \| `max`. Set it explicitly; it also inherits |
| `isolation` | `worktree` — temporary git worktree, removed if unchanged |
| `color` | for transcript display |
| `background` | `true` forces background even when the result is needed now |
| `maxTurns` | do not set it on an Orbweaver role. Runaway protection is the orchestrator's job (`TaskStop`); a turn cap kills long lanes mid-area and the redo re-pays the whole cold read |
| `memory` | leave unset. No Orbweaver role gets a memory grant (see Subagent context) |
| `initialPrompt` | only for the main-session agent, not subagents |

Never grant `Agent` to a role — roles are leaves by construction.

## Subagent context

A non-fork subagent starts with only:

- its own system prompt (the body below) and environment details, not the full Claude Code system prompt
- the delegation message it was sent
- the whole `CLAUDE.md` hierarchy, plus a `.claude/rules/*` file only once it reads a matching path
- git status from parent session start
- full content of any `skills:` it lists
- a sibling roster for `SendMessage`, only if `SendMessage` is in its `tools` and another agent is named

It gets no conversation history, no files the parent already read, no output style and no memory. A
brief restates any lesson a lane needs at file-body depth, or names the exact rule file to read; a
lane or review skill it needs is listed under `skills:`.

## Repo roles

Roles live under `.claude/agents/`; routing policy lives in the `orchestrator` skill. This file covers
how the role files are written, not which role to dispatch.

- Set `model` and `effort` explicitly on every role.
- Grant `SendMessage` to every role. The `lane` skill names the cases that call for a mid-run message.
- The `orchestrator` skill's routing table owns which model tier can take security-dominant work.
- List `skills:` for any procedure the role needs preloaded (for example `side-eye` lists
  `side-eye-design-review` and `snap-driving`).

## Writing the body

Write the body as instructions to the agent, not documentation about it. Front-load the
non-negotiables — an agent reads its prompt once. State what a correct refusal looks like: a lane that
refuses an impossible task is a success, and an agent that does not know that will improvise instead.

## Codex target

Codex project agents live at `.codex/agents/*.toml`, generated from `.claude/agents/*.md`. Never
hand-edit a generated TOML; edit the Claude source and re-run the sync. A standalone manifest needs
`name`, `description`, `developer_instructions`. `model`, `model_reasoning_effort`, `sandbox_mode`,
`mcp_servers`, and `skills.config` carry over; Claude-only fields (`permissionMode`, `tools`,
`disallowedTools`, `color`, `memory`, the YAML `skills` list) do not exist in Codex TOML. Preserve each
role's `effort` as `model_reasoning_effort`.

Codex project hooks live in `.codex/hooks.json`; `.codex/hooks` points at the Claude-owned
implementations. A hook change can require the user to re-trust the project in a fresh Codex session —
do not bypass that prompt.

Skills follow the same one-source shape: author under `.claude/skills/`. `.agents/skills` is a tracked
symlink to it. Codex has no automatic skill preload; the generated TOML preamble names each listed
skill's path under `.agents/skills/` and tells Codex to read it before the role body. Never create a
second copied skill tree.

## Authoring workflow

1. Read the `orchestrator` skill, the complete source role, and every skill it preloads.
2. Edit the Claude source. Change the converter only when the host translation itself changes.
3. Run `pnpm agents:sync`; inspect the generated TOML and its model/effort routing.
4. Run `pnpm check:agents` and `pnpm test:scoped tests/tooling/agent-sync`.
5. Start a fresh Codex session to validate discovery — an existing session can retain its startup
   agent catalog.

Treat delegation briefs as self-contained in both hosts: never assume a subagent inherits the main
session's memory, output style, prior file reads, or an unstated decision.
