@docs/architecture/core/AGENTS.md

# Orbweaver — Claude Code entry point

<!-- 2026-08-13: this file WAS a symlink to `.agents/AGENTS.md` — an 18-line POINTER, not the
     constitution. So for however long that symlink existed, the 343-line constitution above was never
     actually in context; it was only ever a link an agent had to choose to follow. Owner's intent was
     always that the real constitution loads. Fixed by importing it.

     WHY `@import` RATHER THAN A SYMLINK (both are supported; the docs endorse either):
       · a symlink loads the constitution but nothing else — the `Mission.md` pointer below would be lost
       · an import lets Claude-specific content live here without editing the law itself
       · the constitution stays exactly one file with one home; this is a thin entry point over it
     `@path` is the ONLY syntax that pulls a file into context. A markdown link does not — that was the
     original defect. Paths resolve relative to THIS file. To reference a path without importing it,
     wrap it in backticks. -->

Everything above this line is `docs/architecture/core/AGENTS.md`, loaded in full. It is the law.

Also foundational, read on demand rather than loaded: [`docs/Mission.md`](docs/Mission.md) (why the
codebase is shaped this way) and
[`docs/architecture/core/Documentation-Law.md`](docs/architecture/core/Documentation-Law.md) (how docs and
comments are written — machine-first).

Per-domain law is the **CODE + its file headers** — the per-domain docs were gutted (the code is the doc).
The D-ledger (`docs/architecture/core/Core-Laws-and-Precedents.md`) wins on ANY conflict.

> **You are an amnesiac agent** — this documentation is the substitute for the memory and judgment you
> lack. Read every word; do not skim.

## Where the other instruction files live

- **Delegation policy** (role routing, model tier, what a brief owes, merge/lane mechanics):
  `.claude/rules/orchestration.md` — auto-loads, and also reaches subagents.
- **Lane discipline** for worktree agents is **§L of the constitution above** — that is its one home;
  `.claude/rules/orchestration.md` covers the orchestrator's side and must not restate §L.
- **Agent-file authoring** (all 17 frontmatter fields, what a subagent inherits): the `agent-authoring`
  skill — invoke before writing or editing any `.claude/agents/*.md`.
- **Current state, queue, and standing operational law:** `docs/retro-workboard.md`.
