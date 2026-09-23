#!/usr/bin/env bash
# SessionStart hook (startup, resume, compact, clear). SessionStart fires for the main session only, so
# this is how main-only procedure reaches it: the output orders the session to load the `orchestrator`
# skill. It prints, in this order, because a long output is persisted with only its head shown:
#   1. the CPU ceiling line (`cpu-fence.sh`) and the core.hooksPath repair;
#   2. the account identity and the bridge inbox it owns;
#   3. the first actions: the bridge plugin state, the skill load, the notes to read;
#   4. the newest bridge note, the worktree count and main's dirty state;
#   5. a warning when the orchestrator's MEMORY.md nears the harness's truncation cap.
# Keep it fast (<10s) and well under 8KB. It writes nothing except the core.hooksPath repair.
set -uo pipefail
# The harness pipes a JSON envelope (session_id, source, cwd, transcript_path) on stdin; a terminal run has none.
HOOK_IN=""; [ -t 0 ] || HOOK_IN=$(cat 2>/dev/null || true)
# The fallback is DERIVED from this script's own location (<repo>/.claude/hooks/), never a hardcoded box path.
SELF_REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)
cd "${CLAUDE_PROJECT_DIR:-$SELF_REPO_ROOT}" 2>/dev/null || exit 0
echo "=== AUTO-ONBOARD (SessionStart hook — read, then ACT on it; re-derive nothing below) ==="
# PER-SESSION CPU/MEMORY CEILING. Its own header owns the why.
bash "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/cpu-fence.sh" 2>/dev/null

# core.hooksPath REPAIR. While it is set locally, lefthook does not sync the git hooks. An external tool
# (likely Codex) sets it to the default hooks dir, which is the same as unset, so clearing that value is
# safe. Any other value is someone's choice: warn, never touch.
HOOKS_PATH=$(git config --local --get core.hooksPath 2>/dev/null || true)
if [ -n "$HOOKS_PATH" ]; then
  GIT_COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
  case "${HOOKS_PATH%/}" in
    .git/hooks | "${GIT_COMMON:-/nonexistent}/hooks")
      if git config --local --unset core.hooksPath 2>/dev/null; then
        echo "--- core.hooksPath was set to the default hooks dir (${HOOKS_PATH}); unset it so lefthook can sync the git hooks"
      else
        echo "!!! core.hooksPath is set to the default hooks dir (${HOOKS_PATH}) and the unset FAILED; run: git config --local --unset core.hooksPath"
      fi
      ;;
    *)
      echo "!!! core.hooksPath is set to ${HOOKS_PATH}, not the default hooks dir. Left alone; lefthook does not sync the git hooks while it is set."
      ;;
  esac
fi

echo "!!! STALE-SENTINEL GUARD: any CONTEXT SENTINEL ('~N% full — run the compact ritual NOW') visible in the carried history is PRE-compact residue — this window is FRESH. Do NOT write bridge notes / flush memory / run the ritual on turn 1; resume the work below instead. Only a NEW sentinel arriving in THIS window counts."

# IDENTITY. Both accounts fire this hook, and the bridge is directional, so the inbox differs per account.
# The session's own identity is the config dir that owns its transcript (`.transcript_path` =
# <config-dir>/projects/…). CLAUDE_CONFIG_DIR is only the fallback: every child shell inherits it, so a
# hook run from the other account's terminal would answer with the caller's identity. A disagreement is
# printed, never resolved silently. The account word matches `~/.claude/statusline-command.sh`
# account_for() and context-sentinel.py account_name(); change all three together.
account_for() {
  case "$1" in
    "$HOME/.claude")   printf 'primary' ;;
    "$HOME/.claude-b") printf 'claude-b' ;;
    *)                 printf '%s' "${1##*/}" ;;
  esac
}
TRANSCRIPT=$(printf '%s' "$HOOK_IN" | jq -r '.transcript_path // empty' 2>/dev/null)
ENV_CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; ENV_CFG="${ENV_CFG%/}"
CFG_DIR=""
case "$TRANSCRIPT" in
  */projects/*) CFG_DIR="${TRANSCRIPT%/projects/*}" ;;
esac
[ -z "$CFG_DIR" ] && CFG_DIR="$ENV_CFG"
WHO=$(account_for "${CFG_DIR%/}")
case "$WHO" in
  claude-b) INBOX="to-b";       OUTBOX="to-primary" ;;
  *)        INBOX="to-primary"; OUTBOX="to-b" ;;
esac
IDENT_SRC="transcript"; [ -n "$TRANSCRIPT" ] || IDENT_SRC="env fallback (no transcript_path on stdin)"
if [ -n "$TRANSCRIPT" ] && [ "${CFG_DIR%/}" != "$ENV_CFG" ]; then
  echo "!!! ACCOUNT MISMATCH: the transcript says ${WHO} (${CFG_DIR}) but CLAUDE_CONFIG_DIR says $(account_for "$ENV_CFG") (${ENV_CFG}). The TRANSCRIPT wins below; this is a config fault to report to the owner, not a signal."
fi
echo "!!! IDENTITY: you are ${WHO} (by ${IDENT_SRC}; config dir ${CFG_DIR}). YOUR inbox is ~/.claude/bridge/${INBOX}/ — read it, ack by MOVE into its done/; the bridge plugin watches it; you WRITE notes with \`claude-bridge send\`. claude-b prefixes lanes cb-, never delegates cross-account, and only PRIMARY commits on main's checkout. MESSAGE FORM is ~/.claude/bridge/PROTOCOL.md — read it before writing a note: claude-bridge send numbers it under the lock, at: in ISO 8601 UTC, kind in re: (plain | QUESTION with stated default | BLOCKED | ANSWER to NNN | ACK of NNN); a QUESTION stays unacked until answered."

# FIRST ACTIONS sit directly under identity so a truncated output still delivers them. The hook cannot
# call tools; these are orders for the session.
if [ -x "$HOME/.claude/skills/bridge/bin/claude-bridge" ]; then
  echo "!!! FIRST ACTIONS, in order: (1) BRIDGE PLUGIN: it watches ~/.claude/bridge/${INBOX}/ from session start. Each new note arrives as a 'bridge: new note N' event — do not start an inotifywait Monitor on it. Send, ack and list with claude-bridge (the bridge skill)."
else
  echo "!!! FIRST ACTIONS, in order: (1) BRIDGE PLUGIN MISSING (~/.claude/skills/bridge): nothing watches the inbox; tell the owner; read the inbox at every merge window."
fi
echo "    (2) LOAD THE orchestrator SKILL (Skill tool) and follow its first actions before any lane, merge, bridge note or worktree action. A compaction summary carries a digest of it, and a digest fails on command detail."
echo "    (3) READ IN FULL (cat), never the 2KB head printed below: ~/.claude/bridge/SESSIONS.md, then EVERY unacked note in ~/.claude/bridge/${INBOX}/ (ls it first). A SELF-prefixed note is your own compact map: act on it, THEN ack by mv into done/. Read the scratch dispatch map too if the line below found it."
echo "    (4) Honor every MERGE HOLD / sequencing line in the notes; resume live lanes by SendMessage to their agentIds, NEVER respawn."
if [ "$WHO" = "claude-b" ]; then
  echo "    (5) ROLE: you are the second LANE DRIVER on your own account — you write ONLY claim --lane cb-<x>, file --ready, and file --kind decision + needs-owner; primary does every other transition, every fold, every memory write. If no unacked assignment note is in your inbox, write a QUESTION note to primary asking for your lanes (state a DEFAULT + deadline), pre-derive the default set while waiting, and fill to 3 lanes of your own. Owner-word items: ask in chat ONCE and tell primary 'asked in chat — do not re-ask'."
else
  echo "    (5) ROLE: claude-b claims and files under cb-*; you review / verify / land / re-price its rows and fold its worktree branches; answer its QUESTION notes before their deadline (an unanswered question fires its stated default)."
fi
SID=$(printf '%s' "$HOOK_IN" | jq -r '.session_id // empty' 2>/dev/null)
SCRATCH_MAP="/tmp/claude-$(id -u)/$(pwd | tr '/' '-')/${SID:-none}/scratchpad/dispatch-map.md"
if [ -n "$SID" ] && [ -f "$SCRATCH_MAP" ]; then
  # Two map conventions: a `# >>> RESUME HERE` line rewritten in place at the top, or append-only
  # UPDATE lines at the bottom. Print the LAST resume line if any, else the last 2 non-empty lines.
  RESUME_LINE=$(/usr/bin/grep '^# >>> RESUME' "$SCRATCH_MAP" | tail -1 | cut -c1-200)
  if [ -n "$RESUME_LINE" ]; then
    echo "--- scratch dispatch map SURVIVED: ${SCRATCH_MAP} — resume line: ${RESUME_LINE}"
  else
    echo "--- scratch dispatch map SURVIVED: ${SCRATCH_MAP} — last 2 lines:"
    /usr/bin/grep -v '^[[:space:]]*$' "$SCRATCH_MAP" | tail -2 | cut -c1-200
  fi
else
  echo "--- scratch dispatch map: none for this session (fresh session, or purged) — the bridge note below is the digest"
fi

# THE NEWEST BRIDGE NOTE (agentIds, merge order, holds). Both accounts park dispatch maps in to-primary/,
# so the newest note is scanned across both dirs and labeled; the unacked count is YOUR inbox only.
NEWEST_NOTE=$(ls -t ~/.claude/bridge/to-primary/*.md ~/.claude/bridge/to-b/*.md 2>/dev/null | head -1)
if [ -n "${NEWEST_NOTE:-}" ]; then
  NOTE_LABEL="${NEWEST_NOTE#"$HOME"/.claude/bridge/}"
  echo "--- newest bridge note (${NOTE_LABEL}) — READ THIS BEFORE TOUCHING LANES OR MERGES:"
  head -c 2000 "$NEWEST_NOTE"
  echo
  UNACKED=$(ls ~/.claude/bridge/${INBOX}/*.md 2>/dev/null | /usr/bin/grep -cv "${NEWEST_NOTE##*/}" || true)
  [ "${UNACKED:-0}" -gt 0 ] && echo "(+$UNACKED unacked note(s) in ~/.claude/bridge/${INBOX}/ — YOUR inbox; ack by MOVE into done/)"
else
  echo "--- bridge (to-primary/ and to-b/): both empty"
fi

# POINTERS (each one line; the content is re-derivable on demand).
WT_COUNT=$(git worktree list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
echo "--- worktrees: ${WT_COUNT:-?} beyond main (run: git worktree list — resume live lanes via SendMessage to the dispatch map's agentIds, NEVER respawn; sweep only under containment proofs)"
DIRTY=$(git status --short 2>/dev/null | head -5)
if [ -n "$DIRTY" ]; then echo "--- UNCOMMITTED on main (investigate before merging anything):"; echo "$DIRTY"; else echo "--- main working tree: clean"; fi
echo "--- standing posture and procedure: the orchestrator skill (FIRST ACTION 2 above). claude-b registry: ~/.claude/bridge/SESSIONS.md (resume, never re-mint)."

# MEMORY.md GUARD. The harness injects the orchestrator's MEMORY.md and truncates it silently past 200
# lines or its byte cap, whichever binds first. The index sits beside the transcript:
# <config-dir>/projects/<project>/memory/MEMORY.md. ORB_ONBOARD_MEMORY_FILE overrides the path; it is the
# seam for a planted control. Quiet when healthy; never fails.
{
  if [ -n "${ORB_ONBOARD_MEMORY_FILE:-}" ]; then
    MEM_FILE="$ORB_ONBOARD_MEMORY_FILE"
  elif [ -n "$TRANSCRIPT" ]; then
    MEM_FILE="$(dirname "$TRANSCRIPT")/memory/MEMORY.md"
  fi
  if [ -n "${MEM_FILE:-}" ] && [ -f "$MEM_FILE" ]; then
    MEM_BYTES=$(wc -c <"$MEM_FILE" 2>/dev/null | tr -d ' ')
    MEM_LINES=$(wc -l <"$MEM_FILE" 2>/dev/null | tr -d ' ')
    # 24.4 KiB, read from the harness's own truncation warning ("MEMORY.md is 24.6KB (limit: 24.4KB)").
    # Re-pin it if that warning's number changes; nothing here can ask the harness.
    BYTE_CAP=24985
    LINE_CAP=200
    BYTE_PCT=$(( MEM_BYTES * 100 / BYTE_CAP ))
    LINE_PCT=$(( MEM_LINES * 100 / LINE_CAP ))
    if [ "$BYTE_PCT" -ge 80 ] || [ "$LINE_PCT" -ge 80 ]; then
      if [ "$BYTE_PCT" -ge "$LINE_PCT" ]; then
        echo "!!! MEMORY.md at ${BYTE_PCT}% of the BYTE cap (${MEM_BYTES}/${BYTE_CAP} bytes; ${MEM_LINES}/${LINE_CAP} lines) — the byte cap binds. Past it, the session gets a TRUNCATED index and no other signal."
      else
        echo "!!! MEMORY.md at ${LINE_PCT}% of the LINE cap (${MEM_LINES}/${LINE_CAP} lines; ${MEM_BYTES}/${BYTE_CAP} bytes) — the line cap binds. Past it, the session gets a TRUNCATED index and no other signal."
      fi
    fi
    # Past either cap the harness drops tail (newest) lines first. Name the lines that vanished:
    # KEEP_BYTES = how many head lines fit under BYTE_CAP (+1 per line for the newline); KEEP = the
    # tighter of that and the line cap.
    if [ "$MEM_BYTES" -gt "$BYTE_CAP" ] || [ "$MEM_LINES" -gt "$LINE_CAP" ]; then
      KEEP_BYTES=$(awk -v cap="$BYTE_CAP" '{b+=length($0)+1; if(b>cap){print NR-1; exit}} END{if(b<=cap) print NR}' "$MEM_FILE")
      KEEP=$KEEP_BYTES
      [ "$LINE_CAP" -lt "$KEEP" ] && KEEP=$LINE_CAP
      [ "$KEEP" -lt 0 ] && KEEP=0
      if [ "$KEEP" -lt "$MEM_LINES" ]; then
        INVISIBLE=$((MEM_LINES - KEEP))
        echo "!!! MEMORY.md TRUNCATED: ${INVISIBLE} tail line(s) invisible —"
        tail -n +"$((KEEP + 1))" "$MEM_FILE" | cut -c1-60
      fi
    fi
  fi
} 2>/dev/null
