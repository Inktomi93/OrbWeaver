---
name: orchestrator-runbook
description: "Orbweaver orchestrator PROCEDURE — the GitHub Project 1 work:item cookbook and lifecycle hygiene, the claude-b second-account mechanics (overflow trigger, the -p spelling, the ~/.claude/bridge inboxes, SESSIONS.md), the SessionStart auto-onboard ritual, shared agent-memory provisioning, and worktree create/teardown mechanics. Load when creating or transitioning a Project issue, onboarding after a compact or session start, operating or reading the cross-account bridge, or creating/sweeping worktrees. Policy for these areas stays in .claude/rules/orchestration.md; this file is the how."
---

# Orchestrator runbook (procedure)

Split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane `cb-runbook-split`). That file is
ALWAYS-ON — it is injected into every subagent on every dispatch, so every line of it is paid by every
lane forever. Policy (what shapes a decision in the moment) stayed there. This file holds the
PROCEDURE — what you look up while doing the thing — and is loaded on invocation instead of carried.

**Nothing here was rewritten to be shorter.** The text is the rule text; where a claim's premise had
rotted it carries a dated truth-repair beside the original, never a silent edit.

## §0 Where this file came from (the rules-file provenance)

Moved from `~/.claude/CLAUDE.md` into the orbweaver project on 2026-08-13 (owner: "move our
orchestration instructions to the orbweaver project"). SPLIT on 2026-08-24 (lane cb-agent-fleet): the
rules file was 389 lines, opened by telling every subagent to ignore it, and was injected into every
lane anyway — paying full context and then suppressing itself. Nothing was deleted; the lane-binding
half moved to `.claude/rules/lane-standing-facts.md` and three path-scoped rules took the rest, leaving
290 lines. SPLIT AGAIN on 2026-08-24 (lane cb-runbook-split) into policy + this procedure skill.

`.claude/rules/*.md` without `paths:` frontmatter loads at launch with the same priority as
`.claude/CLAUDE.md`, AND project rules are part of the hierarchy subagents receive — which is why the
subagent opt-out has to be first in that file, and why it names WHICH sections it suppresses.

**What a subagent actually starts with** (the paragraph the rules file now points at; the fuller
inheritance table is `agent-authoring` §3): a non-fork subagent receives its own system prompt, the
delegation message, the CLAUDE.md hierarchy (`orchestration.md`, `lane-standing-facts.md`, and any
path-scoped rule its reads trigger), git status, and any preloaded `skills`. It does **NOT** receive:
your conversation history, your output style, or anything you have already read. Its context window is
sized by **its own** model, not yours. **One nuance since 2026-08-24:** every role carries
`memory: project` pointed at the SHARED project memory store, so a lane DOES boot with the `MEMORY.md`
INDEX in its system prompt and can Read any topic file by name. It does not get the bodies, and it does
not get the reasoning you did around them — so a load-bearing lesson is still restated in the brief, or
named by its exact filename. Assume the index, never the body.

## §1 Work control quick path

- **Existing mutable work?** Scan it with `pnpm work:item list --status <status>`, inspect it with
  `pnpm work:item show <issue…>`, and update that issue; do not
  create a duplicate. **New work?** Create exactly one class: `work` for an executable build,
  operations, or documentation outcome; `bug` for a reproducible contract violation; `decision` for an
  owner fork; `program` for one committed future sprint; or `evidence` for a
  re-derived finding routed to one of those classes. Use `pnpm work:item create <class> --title <title> --body-file <file>`; the matching `.github/ISSUE_TEMPLATE/*.yml` is the canonical issue body.
- **Project is the only mutable lifecycle home.** Never mirror Triage, Ready, Running, Blocked, Verify,
  or Done into docs. Decisions enter **Needs owner**. The lifecycle is `ready <issue…>` → `claim <issue…> --lane <lane>` → `review <issue…>` → `verify <issue…> --evidence <receipt>` → `done <issue…> --evidence <same-receipt>`; set Kind, Priority, Area, and Review before Ready. **Prefer the two COMPOSITE verbs (#870) — they are the same guarded verbs in one call:** `file --title <t> --kind <class> [--priority P] [--area A] [--review R] [--body-file f] [--ready] [--claim <lane>]` opens a row (create + metadata + ready + claim), and `land <issue…> --evidence <receipt> [--lane <lane>] [--comment-file f]` closes it (claim-if-needed → review → verify → done, resuming from wherever each row already is). Every lifecycle verb and `show` accept a LIST of ids. Use `needs-owner <issue>` for raw
  decision ingress, `block`/`unblock`, and `park --wake` for exceptions. `pnpm work:item --help` prints
  the complete cookbook. Lifecycle commands write Status last and accept an identical retry after an
  interrupted or uncertain GitHub response; rerun the operator command instead of repairing fields with
  raw `gh` calls.
- **THE COMPLETE VERB SET — never run `--help` to rediscover this.**

  | verb | shape | note |
  | - | - | - |
  | `file` | `--title <t> --kind <work\|bug\|decision\|program\|evidence> [--priority P] [--area A] [--review R] [--body-file f\|-] [--ready] [--claim <lane>] [--dod '<cmd>']` | create + metadata + ready + claim in ONE call. No `--body-file` ⇒ body IS the title. A `decision` enters Needs owner and REFUSES `--ready`/`--claim`. |
  | `land` | `<issue…> --evidence <receipt> [--lane <lane>] [--comment-file f] [--force-close --reason <text>]` | claim-if-needed → review → verify → done. `--lane` required only for a row still Ready. |
  | `overview` / `show` / `list` | `overview` · `show <issue…>` · `list [--status <status>]` | `overview` is the board-read ritual verb. |
  | `create` | `<class> --title <t> --body-file <f>` | prefer `file`. |
  | `ready` · `claim` · `review` · `needs-owner` | `ready <issue…>` · `claim <issue…> --lane <lane>` · `review <issue…>` · `needs-owner <issue…>` | every one takes a LIST. |
  | `set` | `<issue…> <field> <value> [<field> <value>…]` | `Lane` is lifecycle-controlled and REFUSED here. |
  | `block` · `unblock` · `park` | `block <issue…> --by <blocker>` · `unblock <issue…> --by <blocker>` · `park <issue…> --wake <condition>` | `--by` and `--wake` are mandatory. |
  | `verify` · `reverify` · `done` | `verify <issue…> --evidence <r>` · `reverify <issue…> --evidence <replacement>` · `done <issue…> --evidence <same-r> [--force-close --reason <t>]` | `done` takes the SAME receipt `verify` took. |
  | `refute` | `<issue…> --evidence <refutation> [--dod '<cmd>']` | **Verify only.** Returns the row to Ready with Evidence replaced; the outcome stands and the rework is claimable. |
  | `dod` | `<issue…> [--cmd '<command>']` | mint/re-mint a Definition of Done, red-first; bare form ADOPTS the body's block. Runs capped at 300000 ms. `npx` is refused at mint — use a pnpm script or `pnpm exec`. |

- **TRANSITIONS ARE GUARDED, and the guard that bites is `ready`.** Lifecycle is Triage → Ready → Running →
  Review → Verify → Done. **`ready` REFUSES a Running row** — its legal pre-states are Triage, Needs owner, Blocked,
  Parked or Ready. So there is no backward step out of Running: to free a row whose lane died, use `park --wake
  <condition>` (the honest one — it forces a wake), or `block --by`, or `needs-owner`, or carry it forward through
  `review`. Interrupted transitions are safe to rerun, including the composite verbs, which resume at the row's
  current status.

- **Two more guards `land` enforces, both paid 2026-09-11.** `land` needs the row at **Ready or later** — a Parked
  row must go through `ready` first (Parked IS a legal `ready` pre-state, so it is `ready` then `land`, two calls). And
  `--force-close --reason` only OVERRIDES A BAR THAT EXISTS: on a row with no DoD it refuses with
  `has no DoD — --force-close only overrides a bar that exists`. A row that never had a DoD closes with plain `land`.

- **CLOSING A ROW AS SUPERSEDED: read the BODY, never the title or the commits.** A row's title and its commit trail
  can both look current while its body specifies an architecture that no longer exists. Paid 2026-09-11: three P1 rows
  (#1608/#1609/#1637) were first triaged by commit archaeology and parked to be "re-derived", when reading their bodies
  showed all three specified the ESLint-engine design — ESLint rule bodies, `no-restricted-syntax` fragments, a
  `runEslint` platform — whose every referenced artifact is absent from the tree. There was nothing to re-derive
  against. The close receipt owes a REQUIREMENT-TO-LANDING map (which of the row's stated outcomes shipped, by what
  route) plus the archive tag holding the unmerged commits, so a later reader can tell supersession from abandonment.

- **A RUNNING row's Lane cannot be changed by any verb.** `set … Lane` is refused as lifecycle-controlled, and
  `claim` refuses with `work item is already Running in lane <x>`. So when a lane DIES mid-flight — an account goes
  down, a session is lost — the Lane field keeps naming an owner that cannot act and there is no tool path to correct
  it. Record the transfer as an issue COMMENT, which is the durable owner-of-record, and treat the stale Lane string
  as cosmetic. Do not `park`/`ready`/re-`claim` a live row just to repaint the label: that trades a cosmetic lie for a
  lifecycle lie. Paid 2026-09-11 when Codex went hard down mid-program.
- **Lifecycle hygiene (Codex control-plane review, 2026-08-16 — the four measured misses):**
  1. **Claim FIRST, always.** The issue exists and is claimed BEFORE the fixing work starts — an issue
     created seconds after its fixing commit is retrospective paperwork, not tracking (#75 was minted
     33s after its fix landed; the discovery→file→claim→fix ordering is the contract even mid-dogfood).
  2. **A ruled decision moves the moment it is ruled.** Owner ruling + any landed arm ⇒ transition out
     of Needs owner immediately (Running with a lane, or through Review/Verify) — a ruled-and-built
     issue still showing Needs owner is a lifecycle lie (#76 sat there after b5e48a907 landed).
  3. **Retire the design artifact when its program closes.** A Done program's design doc flips
     `status: active` → archived in the SAME breath, and any deferred-work section gets its OWN
     Project issue (parked with a wake condition if not actionable) — prose-only deferrals are the
     parallel backlog the Project exists to kill (#74's doc sat active with §7 deferrals untracked).
  4. **Receipts name LIVE issues.** A catalog receipt's typed claim pointing at a CLOSED issue is
     semantically stale even when the hashes verify — re-receipt when the referenced issue closes.
- **Only the orchestrator mutates Project.** Subagents return path/commit/test receipts; the
  orchestrator updates the linked issue. Issues point to durable repo evidence, and durable repo evidence
  never copies Project lifecycle fields.

## §2 The second Claude account (claude-b): overflow, swap, and the bridge

**Dated state, 2026-08-24 (owner) — read this BEFORE the recorded rule below.** The PRIMARY account ran
out of usage and the operator SWAPPED the session to claude-b. claude-b is not receiving overflow
delegations right now — **it IS the driving account**: every lane, every merge, every board transition
in this session is claude-b as primary. Nothing crossed the bridge to get here; the operator switched
accounts. So there are TWO distinct routes to claude-b running work, and only one of them is the
overflow clause: an operator SWAP needs no sentinel, no delegation, and no bridge. Build-state claims
carry a dated receipt or do not exist — that is why this paragraph is dated and why the rule below is
preserved as the recorded condition rather than rewritten into a description of today.

- **CLAUDE-B OVERFLOW (owner, 2026-08-22): if — and ONLY if — a WEEKLY-usage sentinel labeled `[primary]` reports ≥85%
  (a `[claude-b]` weekly sentinel is not the trigger; an `[ACCOUNT MISMATCH …]` one is a config fault to fix, not a signal),
  lane-class work may delegate to the second Claude account.** The trigger is exclusively that explicit
  harness sentinel in context — never a self-estimate, never the 5-hour window, never any other signal.
  Spelling (the bashrc `claude-b` function is invisible to non-interactive shells):
  `CLAUDE_CONFIG_DIR="$HOME/.claude-b" claude -p "<full cold brief>"` — verified alive 2026-08-22.
  A claude-b invocation shares the project MEMORY and hooks (symlinked — verified 2026-08-22) but no
  conversation context: every delegation is a complete cold brief to executor standard (goal,
  constraints, paths, done-criteria, hazards, the WHY, §L discipline, scoped floors), and its output
  returns on stdout — treat it like any lane report: verify receipts, never trust bare claims. Same
  permission boundaries as any lane: nothing denied here may be routed there.
- **The IDENTITY TEST is not here — it is inline in `.claude/rules/orchestration.md`,** because it must
  be answered by a session that never invokes this skill. It is unchanged: `echo "${CLAUDE_CONFIG_DIR:-primary}"`;
  if it names `.claude-b` you ARE claude-b — never delegate onward (that is recursion), identify as
  claude-b in every board comment / commit trailer context / lane name (prefix `cb-`). What changed on
  2026-08-24 is only the FREQUENCY: claude-b-as-driver is the normal case now, not the exception, so
  the test matters more, not less.
- **THE BRIDGE (cross-account messages — the session registries are per-config-dir, so SendMessage
  cannot span accounts):** `~/.claude/bridge/` holds `to-b/` and `to-primary/` inboxes. A message is
  one markdown file `NNN-<slug>.md` (frontmatter: from/at/re + body); the reader ACKS BY MOVE into
  the inbox's `done/` subdir after acting. Check your inbox at session start and at every merge
  window; never edit another message, only move it.
  **The full message contract is `~/.claude/bridge/PROTOCOL.md` (v2, authoritative) — read it BEFORE
  writing a note** (added 2026-09-01, #1054: a cold session invented its own form and forked the
  numbering at 055): `NNN` is monotonic across BOTH directions (take the max over all four dirs,
  `done/` included), `at:` is ISO 8601 UTC, and the `re:` line carries the KIND — plain, `QUESTION —`
  (body states options + your DEFAULT and deadline; keep working unless truly `BLOCKED`), `ANSWER to
  NNN`, `ACK of NNN`. A QUESTION stays UNACKED until answered; an unanswered question means the
  default fired, and the report says so. REALTIME (primary side): keep a persistent
  Monitor (`stdbuf -oL inotifywait -m -q -e close_write -e moved_to --format '%e %f'
  ~/.claude/bridge/to-primary/ | stdbuf -oL grep --line-buffered -v done/` — the `stdbuf -oL` is
  LOAD-BEARING: into a pipe inotifywait BLOCK-buffers, so the first note sat unseen until a second event
  flushed it, paid 2026-09-01; probe with a throwaway file after arming) so claude-b messages arrive as live
  events instead of polls.
  **LIVENESS CAVEAT (2026-08-24): the bridge is DORMANT while the primary account is out of usage.**
  `to-primary/` messages have nobody reading them — the protocol is correct machinery and primary will
  come back, but a session must never sit waiting on an ack that structurally cannot come. Write the
  note if it is durable state worth handing over; do not treat it as a request/response channel while
  the far side is dark.
- **POST-COMPACT LIVENESS:** `~/.claude/bridge/SESSIONS.md` is the claude-b
  session REGISTRY — read it before any claude-b spawn; the standing session there is RESUMED
  (`--resume <id>`), never re-minted (endless fresh spawns lose its accumulated context); a live
  process check is `ps ax | grep -F 'CLAUDE_CONFIG_DIR=/home/inktomi/.claude-b'`.
- **Which account am I, when both accounts load the rules file?** The identity test above is the only
  answer — `CLAUDE_CONFIG_DIR` naming `.claude-b` means this overflow clause does not apply to you, and
  your session is driven by the primary via `-p`/`--resume` when it was delegated (report on stdout and
  check the bridge) or by the operator directly when it was a swap.

## §3 The SessionStart auto-onboard ritual

- **POST-COMPACT / SESSION-START: the AUTO-ONBOARD hook does the ritual** (owner, 2026-08-22 —
  `.claude/hooks/session-onboard.sh`, a SessionStart hook for startup/resume/compact/clear): it
  injects the board overview, the bridge inbox, the claude-b registry pointer and the live worktree
  list as session context automatically. Your half on seeing it: ACT on that context instead of
  re-deriving it — re-arm the bridge Monitor, resume (never respawn) any live lanes/worktrees it
  lists, and never track the board from memory:
  `pnpm work:item overview` before EVERY refill decision — Triage, Verify, Parked and Needs-owner
  are queues too (Triage needs triaging, Verify rows need verification lanes, Parked
  wake-conditions get re-derived when their subject changes).
- The hook's own header documents its size contract (most-load-bearing content FIRST, total well under
  8KB so it lands inline rather than being spilled to an unreadable file) and why the dispatch map is
  printed before anything else. Read `.claude/hooks/session-onboard.sh` before editing it.

## §4 Provisioning the shared agent memory

- **Provisioning the shared agent memory (2026-08-24).** Every role carries `memory: project`, which
  resolves against the AGENT'S CWD — so the main checkout AND every worktree need
  `.claude/agent-memory/<role>` symlinked at the shared store. `pnpm agent-memory:link` does it, and
  both `.claude/hooks/worktree-setup.sh` and `pnpm worktree:bootstrap` call it. The links are
  gitignored, so a fresh clone needs the command once. Roles are READ-ONLY on that store by
  instruction; **every write to it is yours**, and a lane's proposed lesson arrives as report text.

## §5 Worktree lifecycle mechanics

The POLICY lines (never tear down a worktree you might resume; require `git show --stat` receipts and
spot-check `git status --short` before teardown) stay in `.claude/rules/orchestration.md`. The
mechanics are here.

- **Worktree lifecycle rides the CUSTOM hook pair — know it, use it (owner reminder 2026-08-22):**
  `WorktreeCreate` → `.claude/hooks/worktree-setup.sh` REPLACES built-in creation (it creates the
  worktree, runs the per-worktree `pnpm install` — 2s/48MiB via CAS hardlinks — and links `.env`,
  `settings.local.json` and the agent-memory dirs; its stdout IS the worktree path). `WorktreeRemove`
  → `.claude/hooks/worktree-remove.sh` is the paired teardown. Consequences: `isolation: "worktree"`
  dispatches get a WORKING tree for free — never add "run pnpm install" to those briefs; a MANUAL
  `git worktree add` bypasses the hook and MUST run `pnpm worktree:bootstrap` (§L.5) or every gate
  lies AND every lane there boots with an empty memory index; teardown of hook-created trees goes
  through the harness's remove (or replicates the remove hook's steps) — a bare `rm -rf` strands
  registered worktree metadata. Do NOT "solve" installs with enableGlobalVirtualStore (breaks tsc +
  type-aware lint).
- **Worktree teardown does NOT fire on agent completion** (probed live 2026-08-13). Worktrees accumulate;
  sweep them by hand at end of session. A worktree dir with no `.git` resolves `git -C` **up to MAIN** —
  hand-run commands there hit the main checkout. Sweep: `git worktree list` → `git worktree remove --force`
  registered ones → `rm -rf` unregistered dirs → `git worktree prune` → `git branch -D wt/*` only after
  `git rev-list --left-right --count main...<branch>` shows 0 on the branch side.
- **Killing a task mid-git leaves staged-no-MERGE\_HEAD debris** — `git reset --hard HEAD` (the branch holds
  everything) and redo, don't excavate.
- **Warm leg to an ALREADY-MERGED isolated lane (2026-08-21)** — the mechanism the rules file points
  at: the lane proves containment (`git rev-list --left-right --count main...HEAD` → its side 0),
  fast-forwards its branch to main's tip, and lands the follow-up as new commits on top — a
  re-delivery-free merge for the orchestrator. It structurally cannot create or operate a second
  worktree, so never prescribe one.

## §6 Integration procedures

- **Docs-only integration under load:** run the required per-file formatter and scoped docs/catalog
  checks, then commit normally through configured hooks. If measured load makes that hook inappropriate,
  only a specific user- or coordinator-authorized exception may bypass it; record the reason and the
  checks already executed or still owed, then run the owed consolidated barrier on the quiescent
  integrated tree.
- **WHEN READY RUNS DRY (owner, 2026-08-22)** — the scoring posture behind the rules file's one-liner:
  side-eye every RAIL item and the home screen, one surface per lane-slot, full-battery lens. On the
  aesthetic/Nielsen scoring: a respectable-looking total is NOT acceptance — every IDENTIFIED
  issue gets fixed or filed with a receipt; but do not score-chase perfection (no re-review loops
  hunting points; the finding list, not the number, is the deliverable). Findings → file-claim-fix per
  lifecycle; fixes verified by the side-eye lens before Done.

## §7 Niggles minted 2026-08-30 (a 20-merge, 25-ruling owner-live session — each paid for once)

1. **Pipe exit codes lied for four merges.** (Rule promoted to `orchestration.md` §Rules; this is its telling.) `pnpm check:ledgers-fresh | tail -2; echo $?` prints TAIL's exit; a STALE manifest sat on main for an hour. Spelling: `pnpm -s <cmd> > "$S/x.log" 2>&1; echo EXIT=$?` then read the log — or `echo "EXIT=${PIPESTATUS[0]}"`. Never `$?` after a pipe.
2. **`pkill -f <pattern>` matches the shell issuing it** (exit 144, the merge never ran). Bracket the pattern: `pkill -f "verify/cli\.[t]s"`.
3. **A merge under a running whole-tree check skews the check** — it reads the working tree (rule promoted to `orchestration.md` §Merge/load discipline; this is its procedure). Per train: kill the check, merge, `ledgers-fresh` (real exit), restart the check on the new tip. A check that finished on an older tip is not the tip's verdict.
4. **Claim at dispatch.** A row set Ready but never `claim`ed fails at `review` later ("must be Running") — the lifecycle is `ready → claim → review → verify → done`, `block/unblock` need `--by <n>`, `ready` refuses a Blocked row. TRUTH-REPAIR 2026-09-01: #870's one-shot verbs LANDED (ac441d5e5) — `file` opens a row (create+metadata+ready+claim) and `land <issue…>` closes rows (claim-if-needed→review→verify→done, multi-id), so the old "chain the primitives in ONE Bash call" workaround is RETIRED; reach for `file`/`land` first, primitives only for the transitions the composites don't cover (the census that motivated this: board choreography = 7.3% of orchestrator context; 49% of board calls carried one invocation — and it was re-paid on 2026-09-01 by an orchestrator chaining primitives for 24 closes with the composite verbs already on the tree: re-read `--help` when a tool you drive daily is announced changed).
5. **`gh issue comment --body "…`sha`…"` executes the backtick.** Always `--body-file`. (Rule promoted to `orchestration.md` §Rules.)
6. **Mocks are Claude Design canvases** (`/design` → `seed-canvas.mjs` → Artifact, contract 0.1.31, caps self+downloads), never forge-drawn HTML lanes (owner: "just use the artifact creation skill"). Commit the canvas SOURCE under `docs/design/mocks/<name>/` (build.mjs + *.dc.html + canvas.json + true-size renders + DESIGN.md + README row); the README edit needs its OWN re-attest. Render each board's default state and LOOK before publishing (box-sizing, z-order, glyph rules were all caught only on the render).
7. **Every lane that edits a law doc costs a catalog re-attest at merge** (verifiedCommit = the merge sha) — batch them per train; a report a lane leaves uncommitted needs a FULL READ before its born-reviewed receipt (state its location in the bridge if the window can't afford the read).
8. **Sentinels are account-labeled since 2026-09-01** (`context-sentinel [primary]: …` / `[claude-b]`; usage cache per `<config-dir>/rate-limits.json`, stamped, refused when foreign — memory `sentinel-usage-cache-is-per-account.md`). A sentinel without a bracketed account is pre-fix residue. Before that date they could belong to the other account: a 96/97% weekly sentinel fired on claude-b's numbers while the owner said claude-b was nowhere near max — the two accounts' statuslines wrote ONE cache file, last writer wins.
9. **Four gate-heavy lanes is over the cap in practice:** two lanes hit `ORB-LOAD-KILL` / exit-143 on `check:structure` while a fourth ran. (Cap promoted to `orchestration.md` §Merge/load discipline — MAX 3 concurrent lanes overall, gate-heavy ≤3 within it; this is the measurement behind it.)
10. **The bridge inbox monitor pings on your own note edits** — write the bridge note in one shot, or stop the monitor while the other account is dark.
11. **MEMORY.md hits its byte cap in a long session** (the live constant is `BYTE_CAP` in `.claude/hooks/session-onboard.sh`, which measures it for you at session start) — compact labels (they are scan hints; recall keys off `description:`), and fold late lessons into hub files rather than minting new index lines.
12. **Re-derive the law's premise, not just the row's:** the retirement procedure said "code does not cite docs"; the tree had ~250 comment citations and 8 lying pointers from the LAST pass. A brief that quotes a law step owes a grep of its premise.
13. **Owner-live mode:** batches of ≤4 `AskUserQuestion`s with the recommended arm first worked (~25 rulings in one evening); keep a running RULINGS section in the bridge note so rulings survive compaction, and post each ruling on its issue the same turn.

## §8 The overnight pre-flight and whole-tree runs (minted 2026-09-11 — the gate-program wake that lost five hours)

Every line here was paid for in ONE night. Run the pre-flight BEFORE the first whole-tree run or the first dispatch; each skipped line cost an hour or more.

1. **Engines first.** `pnpm engines status`. A SLEEPING fleet has offloaded its weights from VRAM into host RAM (~37 GiB `Shmem` on this box); two whole-tree verifies were watchdog-killed for memory before anyone looked. If no live drive needs the fleet: `env -C <main> pnpm stack down prod` (owner-authorized for overnight; the prod supervisor otherwise takeover-respawns a stopped fleet — fixed at cdfe100d0 via the `engines.stopped` marker, but prod down is still the clean state), then `env -C <main> pnpm engines stop` FROM MAIN — the pidfile's launch identity is per-checkout and a worktree's stop refuses every engine as foreign. **DETECT THE PROCESS; do not infer it from memory** (owner, 2026-09-13). Read `.cache/stack/engines.pgid` — a JSON state record, not a pgid file, carrying per engine the `pid`, `port`, `cwd`, `launchMarker` and **`startTicks`** (the anti-PID-reuse check) — plus `.cache/stack/engines.stopped` and `ss -ltnp | grep ':870[123]'`. All read-only; none invokes the launcher. **A dead pidfile with NO stopped marker is its own state**: the marker is written only on a clean stop verdict (`engines-ctl.ts:218-226`), so its absence beside dead pids means the fleet died outside the stop path, and the supervisor's takeover honors the MARKER, not the pids. `Shmem` in `/proc/meminfo` still beats `ps` RSS for MEASURING a resident fleet's footprint, but it is a proxy for existence and an earlier \~1 GiB threshold sat at 59% of the measured 609 MiB idle floor.
2. **A whole-tree check never runs alongside live lanes.** `orchestration.md` already says a merge voids a running check; the inverse also holds: three gate-heavy lanes plus a whole-tree verify under one 800% quota starved every lane for hours. Run the whole-tree check in the gap when lanes drain, alone.
3. **After a watchdog kill, a `run_in_background` task's START time is unknown.** The harness deferred a third verify for 4h50m after its own two memory kills; the redirected log and the harness task file were both BORN at the moment it finally ran. Before reasoning about elapsed time, `stat --format=%w <log>`. Do not read a live five-minute-old log as a hung five-hour run and kill it (paid).
4. **`EnterWorktree` does not reload the rules.** The `.claude/rules/*` and CLAUDE.md copies in context are the LAUNCH checkout's (main's). A branch that changed them — retired scripts, renamed commands, new test kinds — will be briefed wrong from the in-context copy. Re-read `lane-standing-facts.md` from the tree before writing any brief.
5. **Worktree isolation is not available from an isolated session, and would branch from the wrong base.** The `isolation: "worktree"` hook branches from the launch checkout's HEAD, not the integration tree; from a worktree session the guard refuses the `git -C` needed to verify the base. Run lanes on the shared tree with disjoint file sets, pathspec staging, and the coupled-fixture rule (a value change owes its fixtures in the same commit — one lane's required field broke 30 fixtures a sibling found first).
6. **A program with a live umbrella row gets receipts as comments, not a row per batch.** `claim` refuses a second lane on a Running row, which is the mechanical temptation to mint rows; resist it. Landing comments on the program row carry commit, census delta and family decisions. Only defects, prerequisites and decisions get their own rows.
7. **Conversions stop at Verify.** `land` goes straight to Done; use `review` + `verify --evidence` for program work and `done` only after a fresh-context `verifier` CONFIRMED, one verifier per wave. Orchestrator receipt checks (commit stat, census re-derivation, causal chains) are necessary and are not the lens.
8. **`--evidence` stays under 1024 characters until #1920 lands.** The CLI help promises an auto-split over the column cap; it exits 2 with `Column value must be a valid value for text column` instead (reproduced five times in one night, pure-ASCII input). Keep the field to verdict + sha + headline; put the narrative in a comment.
9. **`--dod` is optional** (owner, 2026-09-10): use it when a red-first reproduction is the cheapest pin for a bug, never as ritual on every row.
10. **The census is not a convertibility list.** For the gate program specifically, `gate:contract`'s simple tier is blind to what a gate reads; the oracle is the shipped resource kinds plus the scout table (design doc, resume step 3). Assign families with named shared readers, never "the next N simple modules."
11. **Named project roles carry their own model — never override them down.** `executor.md`, `verifier.md` and `side-eye.md` declare `model: opus`; only `mech-executor.md` declares `sonnet` (scout/Explore are pinned cheap). The orchestration rule "every ad-hoc agent MUST set `model` explicitly" is about `general-purpose`/`Explore`-class fan-outs whose default is `inherit`; it is not license to pass `model: sonnet` on a named role. Dispatch executor/verifier/side-eye with NO `model` override. Paid 2026-09-11: every executor and both verifier waves ran on Sonnet by that misreading; the verifier — the quality gate — had to be killed and rerun on Opus over every landed commit.
12. **Bridge SELF maps are the COMPACT ritual's artifact, nothing else** (owner, 2026-09-11: "you do not need to write dispatch maps unless you are close to compact"). Write `~/.claude/bridge/to-primary/NNN-SELF-*.md` only when a NEW context sentinel fires in the current window, or when handing the session off (a relaunch the owner ordered). Never at dispatch time, never per merge, never as a habit: the harness task list already holds every live agentId, and a note per dispatch costs a Write, a monitor ping and a read on the next resume. §7.13's "running RULINGS section in the bridge note" applies to the note you write AT compact, not to a standing file you keep current.
13. **Mid-implementation hook posture (owner, 2026-09-11, until the gate cutover):** lefthook installs `pre-commit`, `pre-merge-commit` and `pre-push`, and each runs a whole-tree check that is RED by construction while the production loader is legacy and modules convert. So: lanes run in ISOLATED worktrees off `main` and land through orchestrator merges; every lane commit and every orchestrator merge/commit on `main` runs with `git -c core.hooksPath=/dev/null …` (a `--ff-only` merge fires no hook; a real merge commit would fire `pre-merge-commit` and fail); the scoped floor that WAS run (named test files, `gate:contract` delta, biome/eslint on the touched files, `pnpm typecheck --config <cfg>`) is named in the commit message; the individual checks run by hand in the lane and again on `main` after the merge. Whole-tree `pnpm verify` runs ALONE between waves as a baseline read (inherited vs new red), never as a lane gate. The owner pushes; `pre-push` is theirs.
14. **The gate-runtime program has its own step list:** `docs/design/gate-runtime-orchestrator-playbook.md` (session start, standing rules, work order by phase at cap 3, brief skeleton, landing procedure, binding lessons). Read it before the first dispatch of that program; the law it points at is `docs/design/gate-runtime-standardization.md`.
