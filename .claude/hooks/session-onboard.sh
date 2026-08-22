#!/usr/bin/env bash
# SessionStart onboarding (owner, 2026-08-22): after a compact/clear/startup the orchestrator gets its
# brain back AUTOMATICALLY — no "perform onboarding" prompt needed. Emits the board truth + the
# standing-posture pointers as session context. Keep FAST (<10s) and read-only.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-~/dev/orbweaver}" 2>/dev/null || exit 0
echo "=== AUTO-ONBOARD (SessionStart hook — read, then act; no need to re-derive any of this) ==="
echo "--- standing posture: .claude/rules/orchestration.md (auto-loaded; the board below IS the mutable state — no snapshot doc exists)"
echo "--- board (pnpm work:item overview):"
timeout 45 pnpm work:item overview 2>/dev/null | /usr/bin/grep -v "^\$" || echo "(overview unavailable — run it manually)"
echo "--- bridge inbox (claude-b → primary):"
ls ~/.claude/bridge/to-primary/*.md 2>/dev/null | /usr/bin/grep -v /done/ || echo "(empty)"
echo "--- claude-b registry: ~/.claude/bridge/SESSIONS.md (resume, never re-mint); live check: ps ax | grep -F 'CLAUDE_CONFIG_DIR=~/.claude-b'"
echo "--- worktrees (possible live/stale lanes):"
git worktree list 2>/dev/null | tail -n +2 || true
echo "--- reminders: re-arm the bridge Monitor (inotifywait ~/.claude/bridge/to-primary/) · git status --short for uncommitted state · lanes resume via SendMessage, never respawn"
