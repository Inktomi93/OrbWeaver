#!/usr/bin/env bash
# PreCompact hook. Claude Code appends this output to the compaction prompt, for /compact and auto-compact
# alike. The default summary keeps what happened and drops why: decisions lose their reasons, dead ends are
# retried, and path-scoped rules leave context until a matching file is touched again.
cat <<'TEXT'
Orbweaver compaction instructions:
- Keep each decision with its reason.
- Include a section named "Ruled out": each rejected approach with why, or "none".
- Quote owner rulings and corrections word for word.
- Name the commits, branches, worktrees, paths and commands that prove the current state.
- For a lane, keep the brief's items, their done lines and each item's status.
- For an orchestrator, keep each live lane's name, agent id, every worktree it uses and status.
- List every `.claude/rules/*.md` file that applied, and tell the next turn to re-read them before acting.
- End with a section named "Next step": the exact next action, never optional.
TEXT
