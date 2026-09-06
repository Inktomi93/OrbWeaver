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
#   4. (2026-09-02, second live regression of lesson 1) The board grew until the total hit 11.9KB →
#      persisted with a 2KB preview again, and the FIRST ACTIONS block — which sat LAST — never reached
#      the window: the orchestrator armed no runbook and paid two CLI paper cuts. Two consequences baked
#      in: FIRST ACTIONS moved directly under IDENTITY (imperatives before evidence — truncation eats
#      from the back), and the runbook-skill load is a numbered FIRST ACTION, not a pointer aside. The
#      board is the re-derivable section (lesson 3 applies to it too), so it takes the trims.
#   5. (2026-09-05, owner: "so I don't have to tell you each time") A resumed session was told BY HAND,
#      every time, which skill to load, to read SESSIONS.md and its own inbox notes IN FULL, and whether
#      a bridge Monitor already existed — the hook printed "arm NOW" unconditionally, so a compact (which
#      KEEPS the Monitor alive) invited a duplicate. Baked in: the Monitor existence check is done HERE
#      (pgrep on the inbox path — the process is visible from a shell; the agent's own task list is the
#      tie-break for an orphan), the reads are enumerated as numbered steps, the per-account ROLE line
#      states the lane-driver contract, and the session's scratch dispatch-map path is derived from the
#      hook's stdin session_id and printed when it survived. Paid for by trimming the board (lesson 4).
set -uo pipefail
# The harness pipes a JSON envelope (session_id, source, cwd) on stdin; a terminal run has none.
HOOK_IN=""; [ -t 0 ] || HOOK_IN=$(cat 2>/dev/null || true)
cd "${CLAUDE_PROJECT_DIR:-/home/inktomi/inktomi-stack/development/orbweaver}" 2>/dev/null || exit 0
echo "=== AUTO-ONBOARD (SessionStart hook — read, then ACT on it; re-derive nothing below) ==="
# PER-SESSION CPU/MEMORY CEILING (#1835). One line, one printed line back; it can only ever exit 0. Its
# own header owns the why (nice cannot cross a cgroup slice boundary; a quota can).
bash "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/cpu-fence.sh" 2>/dev/null
echo "!!! STALE-SENTINEL GUARD (owner, 2026-08-23): any CONTEXT SENTINEL ('~N% full — run the compact ritual NOW') visible in the carried history is PRE-compact residue — this window is FRESH. Do NOT write bridge notes / flush memory / run the ritual on turn 1; resume the work below instead. Only a NEW sentinel arriving in THIS window counts."

# 0) IDENTITY (2026-09-01, #1053; re-derived 2026-09-05): both accounts fire this same hook, and the
#    bridge is DIRECTIONAL — the inbox you read/ack/Monitor differs per account. Before this block the
#    hook told claude-b to monitor PRIMARY'S inbox; only carried context caught it.
#    DETECTION MIRRORS ~/.claude/statusline-command.sh (owner, 2026-09-05: "look at how our statusline
#    detects"): the session's OWN identity is the config dir that owns its transcript
#    (`.transcript_path` = <config-dir>/projects/…, a documented hook-input field); CLAUDE_CONFIG_DIR is
#    only the FALLBACK, because an env var is inherited by every child shell — a hook run from the other
#    account's terminal would otherwise answer with the caller's identity, not the session's. The two are
#    cross-checked and a disagreement is printed LOUDLY, never silently resolved (the 2026-09-01
#    wrong-account defect class). The account word ("primary" / "claude-b" / else basename) is the same
#    rule as the statusline's account_for() and context-sentinel.py account_name() — change all three or
#    none.
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
echo "!!! IDENTITY: you are ${WHO} (by ${IDENT_SRC}; config dir ${CFG_DIR}). YOUR inbox is ~/.claude/bridge/${INBOX}/ — read it, ack by MOVE into its done/, and Monitor THAT dir; you WRITE notes to ~/.claude/bridge/${OUTBOX}/. claude-b prefixes lanes cb-, never delegates cross-account, and only PRIMARY commits on main's checkout (bridge protocol 022). MESSAGE FORM is ~/.claude/bridge/PROTOCOL.md — read it before writing a note: NNN monotonic across BOTH directions (max over all four dirs incl. done/), at: in ISO 8601 UTC, kind in re: (plain | QUESTION with stated default | BLOCKED | ANSWER to NNN | ACK of NNN); a QUESTION stays unacked until answered."

# 0b) FIRST ACTIONS — directly under identity so a truncated/persisted firing still delivers them
#     (lesson 4). The hook cannot invoke tools itself; these are the orders the fresh window executes.
#     The Monitor check is the hook's (lesson 5): `^inotifywait ` anchors on the binary so the bash -c
#     wrapper and this hook's own pgrep never match, and the trailing `${INBOX}/` keeps to-b and
#     to-primary distinct. A compact keeps the Monitor task alive; a fresh session has none.
MON_CMD="stdbuf -oL inotifywait -m -q -e close_write -e moved_to --format '%e %f' ~/.claude/bridge/${INBOX}/ | stdbuf -oL grep --line-buffered -vE '^\\S+ (\\.|zz-)|done/'"
MON_PIDS=$(pgrep -f "^inotifywait .*bridge/${INBOX}/" 2>/dev/null | tr '\n' ' ')
if [ -n "${MON_PIDS// /}" ]; then
  MON_SINCE=$(ps -o lstart= -p "${MON_PIDS%% *}" 2>/dev/null | sed 's/^ *//')
  echo "!!! FIRST ACTIONS, in order: (1) BRIDGE MONITOR: one is ALREADY RUNNING on your inbox (inotifywait pid ${MON_PIDS}since ${MON_SINCE:-?}) — a compact keeps it alive. Do NOT arm a second (two = every note twice). Only if it is NOT in your own task list is it an orphan of a dead session: kill it, then arm with the command below."
else
  echo "!!! FIRST ACTIONS, in order: (1) BRIDGE MONITOR: NONE running on your inbox — arm it NOW as your first tool call (Monitor tool, persistent; stdbuf is load-bearing: into a pipe inotifywait BLOCK-buffers, paid 2026-09-01), then probe with a throwaway file and rm it:"
fi
echo "      ${MON_CMD}"
echo "    (2) LOAD THE orchestrator-runbook SKILL (Skill tool) BEFORE your first work:item transition, bridge note, or worktree action — a compaction summary carries DIGESTED runbook knowledge, which is exactly what fails on CLI detail (2026-09-02: ready-before-claim + lowercase --kind were both paid for skipping this)."
echo "    (3) READ IN FULL (cat), never the 2KB head printed below: ~/.claude/bridge/SESSIONS.md, then EVERY unacked note in ~/.claude/bridge/${INBOX}/ (ls it first). A SELF-prefixed note is your own compact map: act on it, THEN ack by mv into done/. Read the scratch dispatch map too if the line below found it."
echo "    (4) BOARD: pnpm work:item overview before EVERY refill decision (Triage / Verify / Parked / Needs-owner are queues too). Honor every MERGE HOLD / sequencing line in the notes; resume live lanes by SendMessage to their agentIds, NEVER respawn."
if [ "$WHO" = "claude-b" ]; then
  echo "    (5) ROLE (contract note 235, 2026-09-04): you are the second LANE DRIVER on your own account — you write ONLY claim --lane cb-<x>, file --ready, and file --kind decision + needs-owner; primary does every other transition, every fold, every memory write. If no unacked assignment note is in your inbox, write a QUESTION note to primary asking for your lanes (state a DEFAULT + deadline), pre-derive the default set while waiting, and fill to 3 lanes of your own. Owner-word items: ask in chat ONCE and tell primary 'asked in chat — do not re-ask'."
else
  echo "    (5) ROLE: claude-b claims and files under cb-*; you review / verify / land / re-price its rows and fold its worktree branches; answer its QUESTION notes before their deadline (an unanswered question fires its stated default)."
fi
SID=$(printf '%s' "$HOOK_IN" | jq -r '.session_id // empty' 2>/dev/null)
SCRATCH_MAP="/tmp/claude-$(id -u)/$(pwd | tr '/' '-')/${SID:-none}/scratchpad/dispatch-map.md"
if [ -n "$SID" ] && [ -f "$SCRATCH_MAP" ]; then
  # Two map conventions exist (claude-b, note 295): a `# >>> RESUME HERE` line rewritten in place at the
  # top, or append-only UPDATE lines at the bottom. `head -1` served only the first and printed a stale
  # blank for the second. Print the LAST resume line if any, else the last 2 non-empty lines.
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

# 1) THE DISPATCH MAP (agentIds + merge order + holds — the un-summarizable state). Both
#    accounts historically park their dispatch maps in to-primary/, so the newest note is scanned
#    across BOTH dirs and labeled; the unacked count is YOUR inbox only (only those are yours to ack).
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

# 2) THE BOARD (mutable truth; titles capped so the section stays small).
echo "--- board (pnpm work:item overview, titles capped):"
timeout 45 pnpm work:item overview 2>/dev/null | /usr/bin/grep -v "^\$" | cut -c1-100 | head -14 \
  || echo "(overview unavailable — run pnpm work:item overview manually)"
echo "(board capped at 14 lines — pnpm work:item overview for the rest; never track it from memory)"

# 3) POINTERS (each one line; the content is re-derivable on demand).
WT_COUNT=$(git worktree list 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
echo "--- worktrees: ${WT_COUNT:-?} beyond main (run: git worktree list — resume live lanes via SendMessage to the dispatch map's agentIds, NEVER respawn; sweep only under containment proofs)"
DIRTY=$(git status --short 2>/dev/null | head -5)
if [ -n "$DIRTY" ]; then echo "--- UNCOMMITTED on main (investigate before merging anything):"; echo "$DIRTY"; else echo "--- main working tree: clean"; fi
echo "--- standing posture: .claude/rules/orchestration.md (auto-loaded, POLICY only); PROCEDURE = the orchestrator-runbook skill (FIRST ACTION 2 above). claude-b registry: ~/.claude/bridge/SESSIONS.md (resume, never re-mint)."

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
      echo "!!! $f is ${RL} lines (always-on rules budget: 200) — every non-fork subagent pays this as rent each dispatch. Trim, or add path-scoped 'paths:' frontmatter if it's not truly always-relevant."
    fi
  done
} 2>/dev/null
