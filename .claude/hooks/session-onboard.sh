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
cd "${CLAUDE_PROJECT_DIR:-~/dev/orbweaver}" 2>/dev/null || exit 0
echo "=== AUTO-ONBOARD (SessionStart hook — read, then ACT on it; re-derive nothing below) ==="
echo "!!! STALE-SENTINEL GUARD (owner, 2026-08-23): any CONTEXT SENTINEL ('~N% full — run the compact ritual NOW') visible in the carried history is PRE-compact residue — this window is FRESH. Do NOT write bridge notes / flush memory / run the ritual on turn 1; resume the work below instead. Only a NEW sentinel arriving in THIS window counts."

# 0) IDENTITY (2026-09-01, #1053): both accounts fire this same hook, and the bridge is DIRECTIONAL —
#    the inbox you read/ack/Monitor differs per account. CLAUDE_CONFIG_DIR is the one identity test
#    (runbook §2; unset = primary). Before this block the hook told claude-b to monitor PRIMARY'S
#    inbox; only carried context caught it.
case "${CLAUDE_CONFIG_DIR:-primary}" in
  *".claude-b"*) WHO="claude-b"; INBOX="to-b"; OUTBOX="to-primary" ;;
  *)             WHO="primary";  INBOX="to-primary"; OUTBOX="to-b" ;;
esac
echo "!!! IDENTITY: you are ${WHO} (CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-unset}). YOUR inbox is ~/.claude/bridge/${INBOX}/ — read it, ack by MOVE into its done/, and Monitor THAT dir; you WRITE notes to ~/.claude/bridge/${OUTBOX}/. claude-b prefixes lanes cb-, never delegates cross-account, and only PRIMARY commits on main's checkout (bridge protocol 022). MESSAGE FORM is ~/.claude/bridge/PROTOCOL.md — read it before writing a note: NNN monotonic across BOTH directions (max over all four dirs incl. done/), at: in ISO 8601 UTC, kind in re: (plain | QUESTION with stated default | BLOCKED | ANSWER to NNN | ACK of NNN); a QUESTION stays unacked until answered."

# 1) THE DISPATCH MAP FIRST (agentIds + merge order + holds — the un-summarizable state). Both
#    accounts historically park their dispatch maps in to-primary/, so the newest note is scanned
#    across BOTH dirs and labeled; the unacked count is YOUR inbox only (only those are yours to ack).
NEWEST_NOTE=$(ls -t ~/.claude/bridge/to-primary/*.md ~/.claude/bridge/to-b/*.md 2>/dev/null | head -1)
if [ -n "${NEWEST_NOTE:-}" ]; then
  NOTE_LABEL="${NEWEST_NOTE#"$HOME"/.claude/bridge/}"
  echo "--- newest bridge note (${NOTE_LABEL}) — READ THIS BEFORE TOUCHING LANES OR MERGES:"
  head -c 3500 "$NEWEST_NOTE"
  echo
  UNACKED=$(ls ~/.claude/bridge/${INBOX}/*.md 2>/dev/null | /usr/bin/grep -cv "${NEWEST_NOTE##*/}" || true)
  [ "${UNACKED:-0}" -gt 0 ] && echo "(+$UNACKED unacked note(s) in ~/.claude/bridge/${INBOX}/ — YOUR inbox; ack by MOVE into done/)"
else
  echo "--- bridge (to-primary/ and to-b/): both empty"
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
echo "--- FIRST ACTIONS: (1) ARM THE BRIDGE MONITOR NOW — first tool call, on YOUR inbox, this exact command (a hook cannot invoke the Monitor tool itself, so this is the auto-start; the stdbuf is load-bearing — into a pipe inotifywait BLOCK-buffers, paid 2026-09-01; probe with a throwaway file after arming, and TaskStop any pre-compact duplicate the probe exposes):"
echo "      Monitor persistent: stdbuf -oL inotifywait -m -q -e close_write -e moved_to --format '%e %f' ~/.claude/bridge/${INBOX}/ | stdbuf -oL grep --line-buffered -vE '^\\S+ (\\.|zz-)|done/'"
echo "    (2) honor any MERGE HOLD / sequencing note above; (3) session scratchpad dispatch-map.md (if this session's scratchpad survived) carries the fuller history."

# 4) CONTEXT-BUDGET GUARD (2026-08-24, #638). Two always-on injections have no other signal when they
#    near their caps — MEMORY.md truncates silently past 200 lines OR the harness's byte cap (whichever
#    binds first; bytes bind in practice), and every un-path-scoped .claude/rules/*.md is rent every lane
#    pays, budgeted at 200 lines. Quiet when healthy; loud only when something is at risk. Never fail.
{
  # ORB_ONBOARD_MEMORY_FILE overrides the discovered path — the ONLY seam for a planted control (#1061),
  # since the real seam (the first symlink under .claude/agent-memory) always resolves to the live shared
  # index. Undocumented elsewhere; this comment is its one home.
  if [ -n "${ORB_ONBOARD_MEMORY_FILE:-}" ]; then
    MEM_FILE="$ORB_ONBOARD_MEMORY_FILE"
  else
    MEM_LINK="$(find .claude/agent-memory -maxdepth 1 -type l 2>/dev/null | head -1)"
    if [ -n "$MEM_LINK" ]; then
      MEM_FILE="$(readlink -f "$MEM_LINK" 2>/dev/null)/MEMORY.md"
    fi
  fi
  if [ -n "${MEM_FILE:-}" ]; then
    if [ -f "$MEM_FILE" ]; then
      MEM_BYTES=$(wc -c <"$MEM_FILE" 2>/dev/null | tr -d ' ')
      MEM_LINES=$(wc -l <"$MEM_FILE" 2>/dev/null | tr -d ' ')
      # 24.4 KiB. MEASURED from the harness's own truncation warning, 2026-09-01: "MEMORY.md is
      # 24.6KB (limit: 24.4KB) ... Only part of it was loaded". The old 25600 was ABOVE the real cap,
      # so tail index lines were already vanishing while this guard reported 99%. RE-PIN if that
      # warning's number ever changes — the harness emits it at session start and nothing here can
      # invoke it, so this constant is only as fresh as the last sighting.
      BYTE_CAP=24985
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
      # Past either cap, the harness truncates the INJECTED index at the byte cap, dropping tail
      # (newest) lines first, silently — the percentage line above says "at risk", this says WHICH
      # lessons actually vanished. KEEP_BYTES = how many head lines fit under BYTE_CAP (cumulative
      # byte count, +1 per line for the newline); KEEP = the tighter of that and the line cap.
      if [ "$MEM_BYTES" -gt "$BYTE_CAP" ] || [ "$MEM_LINES" -gt "$LINE_CAP" ]; then
        KEEP_BYTES=$(awk -v cap="$BYTE_CAP" '{b+=length($0)+1; if(b>cap){print NR-1; exit}} END{if(b<=cap) print NR}' "$MEM_FILE")
        KEEP=$KEEP_BYTES
        [ "$LINE_CAP" -lt "$KEEP" ] && KEEP=$LINE_CAP
        [ "$KEEP" -lt 0 ] && KEEP=0
        if [ "$KEEP" -lt "$MEM_LINES" ]; then
          INVISIBLE=$((MEM_LINES - KEEP))
          echo "!!! MEMORY.md TRUNCATED: ${INVISIBLE} tail line(s) invisible to every agent —"
          tail -n +"$((KEEP + 1))" "$MEM_FILE" | cut -c1-60
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
        : # TEMPORARY — this exemption goes when the orchestration.md trim (#1056) lands it under 200.
          # ACKNOWLEDGED-OVER (owner-ruled, #638): trimmed 389->290->224 deliberately; every remaining
          # line is decision-shaping policy or a damage-class — going lower means relocating the role
          # table or the dispatch rules. Silent, not a recurring nag.
      else
        echo "!!! $f is ${RL} lines (always-on rules budget: 200) — every non-fork subagent pays this as rent each dispatch. Trim, or add path-scoped 'paths:' frontmatter if it's not truly always-relevant."
      fi
    fi
  done
} 2>/dev/null
