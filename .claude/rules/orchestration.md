<!-- Moved here from ~/.claude/CLAUDE.md on 2026-08-13 (owner: "move our orchestration instructions to
     the orbweaver project"). SPLIT on 2026-08-24 (lane cb-agent-fleet): this file was 389 lines, opened
     by telling every subagent to ignore it, and was injected into every lane anyway — paying full
     context and then suppressing itself. Nothing was deleted; the lane-binding half moved to
     `.claude/rules/lane-standing-facts.md` and three path-scoped rules took the rest.

     `.claude/rules/*.md` without `paths:` frontmatter loads at launch with the same priority as
     `.claude/CLAUDE.md`, AND project rules are part of the hierarchy subagents receive — which is why
     the opt-out below has to be first, and why it now names WHICH sections it suppresses.

     THE HOMES — do not merge them:
       · THIS FILE = orchestrator-only POLICY (roles, tiers, briefs, lane/load, merge, overnight, push).
       · `.claude/rules/lane-standing-facts.md` = facts binding ANY working agent (always-on).
       · `.claude/rules/gates-and-tooling.md` · `browser-and-instruments.md` · `db-schema.md`
         = path-scoped; they load when an agent reads their files.
       · `docs/architecture/core/AGENTS.md` §L = worktree-lane git discipline (its one home; this file
         covers the orchestrator's side and must not restate §L).
       · GitHub Project 1 = mutable CURRENT STATE (ready/running/blocked/verified).
     docs/retro-workboard.md is RETIRED (owner, 2026-08-22) — the board + these rules are the recovery
     path; its history is archaeology.
     If these homes disagree, the constitution/D-ledger wins on law and Project wins on lifecycle. -->

# Orchestration (multi-model delegation)

**IF YOU ARE A SUBAGENT, THIS FILE IS NOT YOURS — but do not discard it wholesale.** Every section
below is ORCHESTRATOR-ONLY policy: how work gets routed, briefed, tracked, merged, and paid for. You
do not dispatch, you do not mutate GitHub Project 1, and you never spawn another agent — if your task
needs a different role, say so in your report and the orchestrator dispatches. (Nesting is banned by
the harness, not by this text: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` in `~/.claude/settings.json`
`env`, plus every role omits `Agent` from its `tools` list.)

**What DOES bind you lives elsewhere and loads for you automatically:**
`.claude/rules/lane-standing-facts.md` (always-on — staging, floors, suite load caps, the dev stack,
tool hazards), `docs/architecture/core/AGENTS.md` §L (worktree git discipline),
`.claude/agent-doctrine.md` (the build-process floor), and the path-scoped rules for gates, the
browser tier, and the db schema. Read those. Skim this one only when you need to understand a decision
the orchestrator made about your lane.

You are the orchestrator. Keep planning, architecture, ambiguity resolution, and final judgment for
yourself; delegate volume and execution to role agents. Quality is protected by VERIFICATION. For Codex,
the owner has ruled that every project role uses `gpt-5.6-sol`; role instructions and explicit reasoning
effort remain the specialization axes.

| Delegate to | When |
| - | - |
| `scout` / `Explore` | any search, lookup, "where/how is X" reconnaissance (pinned cheap — never let a background search inherit the main model) |
| `mech-executor` | fully-specified mechanical work: pattern refactors, convention-following tests, docs, bulk edits, running gate/test suites |
| `executor` | implementation needing judgment: features, bug fixes, design-sensitive refactors |
| `forge` | frontier-tier think-then-build where the DESIGN is the risk — new subsystems, wide coupled-site changes, migrations a wrong architecture would force a rebuild of |
| `security-executor` | anything security-sensitive (authn/authz, secrets, crypto, validation, CSRF, hardening) — never in the main session, never on Fable |
| `verifier` | fresh-context CODE-correctness check (logic, tests, edge cases, trust boundaries) before reporting non-trivial work done |
| `side-eye` | fresh-context UX / visual / a11y check of anything a user SEES — the other verification lens |
| `stickler` | fresh-context FRONTIER-TIER analysis: substantial diff/branch review before merge, AND deep investigation/research assignments (owner scope 2026-08-19); expensive by design, trivial diffs go to `verifier`; security-DOMINANT work still routes to `security-executor` (never Fable) |

**Two verification lenses — route by what changed:** logic / data / server → `verifier`; UI / rendered /
a11y → `side-eye`; both if the change spans both.

**All three review roles hold `SendMessage` (granted 2026-08-24) and are instructed to use it mid-run
for exactly three things** — "I am probing REAL files on the shared tree", "the environment is lying",
"my premise is refuted". Expect those mid-run and act on them: the day they could not speak, an
unannounced gate probe was swept into a commit (shipping a blinded gate) and a stale `:5173` build sat
undelivered through twenty minutes of merges.

## Rules

- **Spec in one shot:** goal, constraints, done-criteria, relevant paths, and the WHY — not just the what.
- **RE-DERIVE EVERY ROW BEFORE DISPATCHING IT (2026-08-14, two stale dispatches in one day — one
  fixed a fixed bug's board row, one dispatched a program built five days earlier).** \~60 seconds
  before any Agent call: `git log --oneline -5 -- <the row's primary path>` + Read the cited
  file:line + `git log --all --grep="<key noun>" --oneline -5`. A board/audit row claiming work is
  UNBUILT owes the same tree receipt as one claiming it's done. A refusing lane costs \~5 min; a lane
  fixing a fixed thing costs an hour.
- **Value-changing briefs name the RIGHT type program in the floor, never a bare `pnpm typecheck`**
  (2026-08-14, paid twice in one day) — the three-program truth table is in `lane-standing-facts.md`.
  The orchestrator's own half: run `node scripts/ts7.cjs --noEmit -p tsconfig.json` (\~15s) after
  EVERY value-changing merge; the single skipped tripwire of 2026-08-14 was exactly the merge carrying
  the red.
- **Reply routing: identify a lane by CONTENT ANCHOR + the dispatch map, never by role name**
  (2026-08-14, second misroute of the era — two live executors, an approval landed on the wrong
  one). Briefs must tell lanes to state their LANE NAME in every back-channel message; the receiving
  side of a misroute bounces it, but the intended lane silently proceeds on defaults.
  **The SENDING side is symmetric (2026-08-21): with N same-role lanes live, `SendMessage to:
  "<role>"` is unroutable (the harness refuses or, worse, could hit the wrong lane). The orchestrator
  keeps a dispatch map (lane name → agentId) at dispatch time and ALWAYS replies by agentId — the
  role name is never an address.**
- **Briefs owe the wrapper-hygiene line** — the Bash guard classifies UNTRACKED script bodies
  (2026-08-14), so a lane writing helper scripts needs the sanctioned spellings named. Also:
  `tests/tooling/check-gates.int.test.ts` is NOT concurrency-safe with itself (shared `__g_` fixture
  paths) — never let a lane floor and a drain battery overlap it.
- **CODEX PROJECT ROLES USE SOL** (owner, 2026-08-20). Every Codex project-role manifest and ad-hoc
  Orbweaver dispatch uses `gpt-5.6-sol`; preserve the role's explicit reasoning effort. Claude still uses
  its own explicit role models. Any ad-hoc agent or workflow fan-out **MUST set `model` explicitly** —
  `model` defaults to `inherit`, which makes routing unverifiable.
- **Lane = one AREA, 4-8 items, one brief, ONE commit** — not one ticket. The agent's cold read of the area
  is the expensive part; per-ticket lanes re-pay it every ticket.
- **Warm legs are mandatory, not preferred.** A second task in a live agent's area gets a `SendMessage`
  leg, never a fresh spawn. Only spawn fresh when the agent is dead or the area is genuinely different.
  **Warm leg to an ALREADY-MERGED isolated lane (2026-08-21): its git fence is pinned to its OWN
  worktree — it structurally cannot create or operate a second worktree, so never prescribe one.**
  The correct mechanism: the lane proves containment (`git rev-list --left-right --count main...HEAD`
  → its side 0), fast-forwards its branch to main's tip, and lands the follow-up as new commits on
  top — a re-delivery-free merge for the orchestrator.
- Dispatch independent subagents in parallel / in the background and keep working — don't block on one
  agent while other dispatchable work waits.
- **Waiting on a long run is YOUR cheap loop, never a fat lane context's** (usage ruling 2026-08-21,
  paid ~30% of a weekly cap in one day). A lane that launches a >10-min detached run reports and stops,
  naming its log/exit-file; you or a cron/monitor pick up the completion and resume it by SendMessage.
- After two failed attempts at a tier, escalate one tier or take over — don't retry the same tier a third
  time.
- Non-trivial changes pass a fresh-context lens (`verifier` and/or `side-eye`) before you report them done.
  Prefer that over self-review.
- Scout findings are inputs, not verified outputs — sanity-check a load-bearing scouted fact, or re-scout.
- **FIX TOOLS AS WE FIND THEM LYING (owner, 2026-08-22).** An instrument caught printing a false clean
  or a false positive (a silent matches=0, a PASS the eye refutes, a detector blind to a defect class)
  is fixed in the SAME era it is found — file the row AND route it immediately (dispatch, or fold into
  the live lane already in that tool's area), at P2 regardless of the surface finding's own priority:
  every downstream lane consumes the instrument's output, so a lying tool multiplies its cost by every
  run until fixed. The fix's own contract — planted controls in both directions, a loud refusal instead
  of a clean zero, and the permanent committed pin in `tests/tooling/<tool>/…` — lives in
  `.claude/rules/gates-and-tooling.md`; brief it.
- **A brief or issue body stating a DATA-BINDING claim owes a ledger grep first** (the D58 lesson: the
  orchestrator wrote "chats reference presets via turn settings" into an issue as fact; the ledger
  already ruled the binding impossible and a gate already enforced it). Binding claims are re-derived,
  never remembered.
- **Don't delegate:** a single file-read you need right now, a decision, or anything the user asked you
  personally to judge.
- **Session hygiene:** set up MCP servers / connectors BEFORE starting work — adding or removing one
  mid-session (or toggling web search) invalidates the entire prompt cache, and caches are per-model.

## Operational runtime

- **Fill the harness's available lanes; do not hardcode a client-specific agent count.** Claude and
  Codex expose different concurrency ceilings. The durable constraint is the gate-heavy ceiling below,
  not an old workboard number.
- **Overnight / finish / keep-going means autonomous queue execution.** Re-derive, claim, dispatch, merge,
  verify, and continue while safe work exists. Stop only for destructive or irreversible action,
  owner-sacred product choices, a genuine scope pivot, or an origin push.
- **STANDING (owner, 2026-08-22, vacation week): overnight mode IS the default posture until the owner
  returns.** Every session auto-adopts it — no per-session activation word needed. The goal is a DRAINED
  Ready column: keep lanes filled to the cap, merge trains as lanes drain, barrier per train, refill from
  Ready, file-and-claim new findings, and take quiet holds only when Ready is empty and no lane is live.
  The stop categories above are unchanged; Parked rows stay parked (wake conditions are law), Needs-owner
  rows accumulate for the owner's return, and NEVER merge a train while a live drive depends on the
  in-memory recorders (paid 2026-08-22: an orchestrator merge respawned the server mid-turn and killed it).
  WHEN READY RUNS DRY (owner, 2026-08-22): side-eye every RAIL item and the home screen, one surface per
  lane-slot, full-battery lens. On the aesthetic/Nielsen scoring: a default-tier score (a "30/40") is NOT
  acceptance — every IDENTIFIED issue gets fixed or filed with a receipt; but do not score-chase
  perfection (no re-review loops hunting points; the finding list, not the number, is the deliverable).
  Findings → file-claim-fix per lifecycle; fixes verified by the side-eye lens before Done.
- **CLAUDE-B OVERFLOW (owner, 2026-08-22): if — and ONLY if — a WEEKLY-usage sentinel reports ≥85%,
  lane-class work may delegate to the second Claude account.** The trigger is exclusively that explicit
  harness sentinel in context — never a self-estimate, never the 5-hour window, never any other signal.
  Spelling (the bashrc `claude-b` function is invisible to non-interactive shells):
  `CLAUDE_CONFIG_DIR="$HOME/.claude-b" claude -p "<full cold brief>"` — verified alive 2026-08-22.
  A claude-b invocation shares the project MEMORY and hooks (symlinked — verified 2026-08-22) but no
  conversation context: every delegation is a complete cold brief to executor standard (goal,
  constraints, paths, done-criteria, hazards, the WHY, §L discipline, scoped floors), and its output
  returns on stdout — treat it like any lane report: verify receipts, never trust bare claims. Same
  permission boundaries as any lane: nothing denied here may be routed there.
  **WHICH ACCOUNT AM I? (both accounts load THIS file — test before acting on this clause):**
  `echo "${CLAUDE_CONFIG_DIR:-primary}"` — if it names `.claude-b`, YOU ARE CLAUDE-B: this overflow
  clause does not apply to you (never delegate onward — that is recursion), you identify as claude-b
  in every board comment / commit trailer context / lane name (prefix `cb-`), and your session is
  driven by the primary via `-p`/`--resume` — report on stdout and check the bridge (below).
  **THE BRIDGE (cross-account messages — the session registries are per-config-dir, so SendMessage
  cannot span accounts):** `~/.claude/bridge/` holds `to-b/` and `to-primary/` inboxes. A message is
  one markdown file `NNN-<slug>.md` (frontmatter: from/at/re + body); the reader ACKS BY MOVE into
  the inbox's `done/` subdir after acting. Check your inbox at session start and at every merge
  window; never edit another message, only move it. REALTIME (primary side): keep a persistent
  Monitor (`inotifywait -m` on `~/.claude/bridge/to-primary/`) so claude-b messages arrive as live
  events instead of polls. POST-COMPACT LIVENESS: `~/.claude/bridge/SESSIONS.md` is the claude-b
  session REGISTRY — read it before any claude-b spawn; the standing session there is RESUMED
  (`--resume <id>`), never re-minted (endless fresh spawns lose its accumulated context); a live
  process check is `ps ax | grep -F 'CLAUDE_CONFIG_DIR=/home/inktomi/.claude-b'`.
- **POST-COMPACT / SESSION-START: the AUTO-ONBOARD hook does the ritual** (owner, 2026-08-22 —
  `.claude/hooks/session-onboard.sh`, a SessionStart hook for startup/resume/compact/clear): it
  injects the board overview, the bridge inbox, the claude-b registry pointer and the live worktree
  list as session context automatically. Your half on seeing it: ACT on that context instead of
  re-deriving it — re-arm the bridge Monitor, resume (never respawn) any live lanes/worktrees it
  lists, and never track the board from memory:
  `pnpm work:item overview` before EVERY refill decision — Triage, Verify, Parked and Needs-owner
  are queues too (Triage needs triaging, Verify rows need verification lanes, Parked
  wake-conditions get re-derived when their subject changes).
- **Local `main` is the worktree base.** The owner pushes manually, so `origin/main` can be far behind.
  Spawn and rebase from the latest local `main`; never "refresh" a lane onto the remote branch.
- **Never push `origin` without fresh owner authorization for that exact push.** A prior or conditional
  word is not reusable. Run the required pre-push verification first, then ask or use the fresh word.
- **Project owns lifecycle; prose owns durable results.** Re-derive before claim, use
  `pnpm work:item` for lifecycle transitions, and never mirror Ready/Running/Blocked/Done into a doc.
- **Docs-only integration under load:** run the required per-file formatter and scoped docs/catalog
  checks, commit with hooks bypassed when the whole-tree hook would duplicate the draining-train gate,
  then run one consolidated barrier on the integrated tree.
- **Provisioning the shared agent memory (2026-08-24).** Every role carries `memory: project`, which
  resolves against the AGENT'S CWD — so the main checkout AND every worktree need
  `.claude/agent-memory/<role>` symlinked at the shared store. `pnpm agent-memory:link` does it, and
  both `.claude/hooks/worktree-setup.sh` and `pnpm worktree:bootstrap` call it. The links are
  gitignored, so a fresh clone needs the command once. Roles are READ-ONLY on that store by
  instruction; **every write to it is yours**, and a lane's proposed lesson arrives as report text.

## Work control quick path

- **Existing mutable work?** Scan it with `pnpm work:item list --status <status>`, inspect it with
  `pnpm work:item show <issue>`, and update that issue; do not
  create a duplicate. **New work?** Create exactly one class: `work` for an executable build,
  operations, or documentation outcome; `bug` for a reproducible contract violation; `decision` for an
  owner fork; `program` for one committed future sprint; or `evidence` for a
  re-derived finding routed to one of those classes. Use `pnpm work:item create <class> --title <title> --body-file <file>`; the matching `.github/ISSUE_TEMPLATE/*.yml` is the canonical issue body.
- **Project is the only mutable lifecycle home.** Never mirror Triage, Ready, Running, Blocked, Verify,
  or Done into docs. Decisions enter **Needs owner**. The lifecycle is `ready <issue>` → `claim <issue> --lane <lane>` → `review <issue>` → `verify <issue> --evidence <receipt>` → `done <issue> --evidence <same-receipt>`; set Kind, Priority, Area, and Review before Ready. Use `needs-owner <issue>` for raw
  decision ingress, `block`/`unblock`, and `park --wake` for exceptions. `pnpm work:item --help` prints
  the complete cookbook. Lifecycle commands write Status last and accept an identical retry after an
  interrupted or uncertain GitHub response; rerun the operator command instead of repairing fields with
  raw `gh` calls.
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

## What a brief must carry (subagents start almost naked)

A non-fork subagent receives its own system prompt, the delegation message, the CLAUDE.md hierarchy
(this file, `lane-standing-facts.md`, and any path-scoped rule its reads trigger), git status, and any
preloaded `skills`. It does **NOT** receive: your conversation history, your output style, or anything
you have already read. Its context window is sized by **its own** model, not yours.

**One nuance since 2026-08-24:** every role carries `memory: project` pointed at the SHARED project
memory store, so a lane DOES boot with the `MEMORY.md` INDEX in its system prompt and can Read any
topic file by name. It does not get the bodies, and it does not get the reasoning you did around them —
so a load-bearing lesson is still restated in the brief, or named by its exact filename. Assume the
index, never the body.

So a brief owes, every time: the back-channel line (SendMessage mid-run) · scope fences vs sibling lanes ·
`git -C` discipline · lane-unique scratch names · the exact CT files its floor must run ·
re-verify-your-premise-first, and that a correct refusal is a SUCCESS · the WHY · and the hazards — every
trap that ever bit was one no brief mentioned.

A lane that CREATES or EDITS anything under `docs/**` owes two more lines: the frontmatter block
(`kind`/`status`/`updated` — the catalog gate reds a bare markdown file) and a scoped `pnpm check:docs`
in its floor — lefthook enforces catalog freshness, dangling references, and D-citation integrity at
push, so a doc written without them is debt the orchestrator inherits at the train gate. Review-writing
roles (stickler) end their report with an issue-summary paragraph; the ORCHESTRATOR pastes it into the
linked Project issue — no lane touches `work:item`.

## Merge / load discipline (minted 2026-08-02, hardened 2026-08-13)

- **Cap concurrent GATE-HEAVY lanes at \~3, stagger dispatches by minutes.** 5+ synchronize their
  verification into load-60 spikes that flake gates (10s-hook timeouts, unfired-gate phantoms) and starve
  the foreground. This is a FLAKE ceiling, not a usage one — the overall lane cap lives on the board.
- **Under load:** merge with `--no-verify` on branch-side green receipts and run ONE consolidated check
  when lanes drain. Track the debt on the board. Never chain board edits behind a possibly-conflicting
  merge in one command — a conflict mid-chain bakes markers into committed files.
- **The whole-tree single-pass runs after EVERY merge train, not only at drain** — one corpus train
  left 9 findings that every scoped lane floor structurally missed; the single-pass caught them 30 min
  after merge instead of at the barrier.
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
- **Never tear down a worktree you might resume** — a SendMessage resurrection lands in a deleted cwd.
- **Killing a task mid-git leaves staged-no-MERGE\_HEAD debris** — `git reset --hard HEAD` (the branch holds
  everything) and redo, don't excavate.
- **A lane's "done" report can lie about files it never staged** — require `git show --stat` receipts in
  briefs; spot-check `git -C <wt> status --short` before teardown.
- **Investigation lanes get instrumentation directives, not just symptoms** — the four-hop per-boundary
  diff (FE payload → server input → DB row → read-back) named a write-merge bug in one pass that
  endpoint-only debugging would have circled for hours.
