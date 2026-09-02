#!/usr/bin/env bash
# SessionStart onboarding (owner, 2026-08-22; hardened 2026-08-23 after its first live firing): after a
# compact/clear/startup the orchestrator gets its brain back AUTOMATICALLY — no "perform onboarding"
# prompt needed. Keep FAST (<10s) and read-only.
#
# LESSONS BAKED IN from the 2026-08-22 compact (the hook's one live firing before this revision):
#   1. SIZE IS THE CONTRACT. The first firing emitted 21KB → the harness persisted it to a file with a
#      2KB preview, and that file was UNREADABLE later (tool-results cleanup). Only the preview's first
#      lines reached the agent — by LUCK they were the board. So: most-load-bearing content FIRST, hard
#      caps on every section, total target well under 8KB so it always lands inline.
#   2. The DISPATCH MAP is the single most valuable artifact post-compact (live lane agentIds, monitor
#      handles, merge ORDER/holds) — compaction summaries reliably garble exactly those. Print the
#      newest unacked bridge note's CONTENT inline, not just its filename.
#   3. The worktree enumeration was the bulk of the 21KB (78 rows at the time) and is re-derivable in
#      seconds — print a COUNT + the command, never the listing.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-/home/inktomi/inktomi-stack/development/orbweaver}" 2>/dev/null || exit 0
echo "=== AUTO-ONBOARD (SessionStart hook — read, then ACT on it; re-derive nothing below) ==="
echo "!!! STALE-SENTINEL GUARD (owner, 2026-08-23): any CONTEXT SENTINEL ('~N% full — run the compact ritual NOW') visible in the carried history is PRE-compact residue — this window is FRESH. Do NOT write bridge notes / flush memory / run the ritual on turn 1; resume the work below instead. Only a NEW sentinel arriving in THIS window counts."

# 1) THE DISPATCH MAP FIRST (agentIds + merge order + holds — the un-summarizable state).
NEWEST_NOTE=$(ls -t ~/.claude/bridge/to-primary/*.md 2>/dev/null | head -1)
if [ -n "${NEWEST_NOTE:-}" ]; then
  echo "--- newest bridge note (${NEWEST_NOTE##*/}) — READ THIS BEFORE TOUCHING LANES OR MERGES:"
  head -c 3500 "$NEWEST_NOTE"
  echo
  OTHERS=$(ls ~/.claude/bridge/to-primary/*.md 2>/dev/null | /usr/bin/grep -cv "${NEWEST_NOTE##*/}" || true)
  [ "${OTHERS:-0}" -gt 0 ] && echo "(+$OTHERS older unacked note(s) in ~/.claude/bridge/to-primary/ — ack by MOVE into done/)"
else
  echo "--- bridge inbox (~/.claude/bridge/to-primary/): empty"
fi

# 2) THE BOARD (mutable truth; titles capped so the section stays small).
echo "--- board (pnpm work:item overview, titles capped):"
timeout 45 pnpm work:item overview 2>/dev/null | /usr/bin/grep -v "^\$" | cut -c1-110 | head -60 \
  || echo "(overview unavailable — run pnpm work:item overview manually)"

# 3) POINTERS (each one line; the content is re-derivable on demand).
WT_COUNT=$(git worktree list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
echo "--- worktrees: ${WT_COUNT:-?} beyond main (run: git worktree list — resume live lanes via SendMessage to the dispatch map's agentIds, NEVER respawn; sweep only under containment proofs)"
DIRTY=$(git status --short 2>/dev/null | head -5)
if [ -n "$DIRTY" ]; then echo "--- UNCOMMITTED on main (investigate before merging anything):"; echo "$DIRTY"; else echo "--- main working tree: clean"; fi
echo "--- standing posture: .claude/rules/orchestration.md (auto-loaded, POLICY only). PROCEDURE lives in the orchestrator-runbook SKILL — load it (Skill tool) before your first work:item transition, claude-b/bridge action, or worktree sweep; it is not auto-loaded. claude-b registry: ~/.claude/bridge/SESSIONS.md (resume, never re-mint)."
echo "--- FIRST ACTIONS: (1) re-arm the bridge Monitor (stdbuf -oL inotifywait -m ... ~/.claude/bridge/to-primary/ | stdbuf -oL grep --line-buffered — the stdbuf is load-bearing, see runbook §2); (2) honor any MERGE HOLD / sequencing note above; (3) session scratchpad dispatch-map.md (if this session's scratchpad survived) carries the fuller history."

# 4) CONTEXT-BUDGET GUARD (2026-08-24, #638). Two always-on injections have no other signal when they
#    near their caps — MEMORY.md truncates silently past 200 lines OR 25600 bytes (whichever binds
#    first; bytes bind in practice), and every un-path-scoped .claude/rules/*.md is rent every lane
#    pays, budgeted at 200 lines. Quiet when healthy; loud only when something is at risk. Never fail.
{
  MEM_LINK="$(find .claude/agent-memory -maxdepth 1 -type l 2>/dev/null | head -1)"
  if [ -n "$MEM_LINK" ]; then
    MEM_FILE="$(readlink -f "$MEM_LINK" 2>/dev/null)/MEMORY.md"
    if [ -f "$MEM_FILE" ]; then
      MEM_BYTES=$(wc -c <"$MEM_FILE" 2>/dev/null | tr -d ' ')
      MEM_LINES=$(wc -l <"$MEM_FILE" 2>/dev/null | tr -d ' ')
      BYTE_CAP=25600
      LINE_CAP=200
      BYTE_PCT=$(( MEM_BYTES * 100 / BYTE_CAP ))
      LINE_PCT=$(( MEM_LINES * 100 / LINE_CAP ))
      if [ "$BYTE_PCT" -ge 80 ] || [ "$LINE_PCT" -ge 80 ]; then
        if [ "$BYTE_PCT" -ge "$LINE_PCT" ]; then
          echo "!!! MEMORY.md at ${BYTE_PCT}% of the BYTE cap (${MEM_BYTES}/${BYTE_CAP} bytes; ${MEM_LINES}/${LINE_CAP} lines) — the byte cap binds. Past it, agents get a TRUNCATED index and no other signal (only the orchestrator may write it)."
        else
          echo "!!! MEMORY.md at ${LINE_PCT}% of the LINE cap (${MEM_LINES}/${LINE_CAP} lines; ${MEM_BYTES}/${BYTE_CAP} bytes) — the line cap binds. Past it, agents get a TRUNCATED index and no other signal (only the orchestrator may write it)."
        fi
      fi
    fi
  fi

  for f in .claude/rules/*.md; do
    [ -f "$f" ] || continue
    /usr/bin/grep -q "^paths:" "$f" 2>/dev/null && continue # path-scoped: not always-on rent
    RL=$(wc -l <"$f" 2>/dev/null | tr -d ' ')
    if [ "${RL:-0}" -gt 200 ]; then
      if [ "$f" = ".claude/rules/orchestration.md" ] && [ "$RL" -le 230 ]; then
        : # ACKNOWLEDGED-OVER (owner-ruled, #638): trimmed 389->290->224 deliberately; every remaining
          # line is decision-shaping policy or a damage-class — going lower means relocating the role
          # table or the dispatch rules. Silent, not a recurring nag.
      else
        echo "!!! $f is ${RL} lines (always-on rules budget: 200) — every non-fork subagent pays this as rent each dispatch. Trim, or add path-scoped 'paths:' frontmatter if it's not truly always-relevant."
      fi
    fi
  done
} 2>/dev/null
