<!-- ALWAYS-ON: `.claude/rules/*.md` without `paths:` frontmatter is injected into EVERY subagent on
     EVERY dispatch, so every line here is paid by every lane forever — which is why the opt-out below
     is first and why this file holds POLICY only. Split history + the full rationale: the
     `orchestrator-runbook` skill (§0).

     THE HOMES — do not merge them:
       · THIS FILE = orchestrator-only POLICY (roles, tiers, briefs, lane/load, merge, overnight, push).
       · `.claude/skills/orchestrator-runbook/` = orchestrator PROCEDURE, loaded on invocation
         (work:item cookbook, claude-b/bridge mechanics, onboard ritual, worktree mechanics).
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
  worktree — it structurally cannot create or operate a second worktree, so never prescribe one**
  (the ff-onto-main-tip mechanism it uses instead is in the `orchestrator-runbook` skill).
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
  lane-slot, full-battery lens — the scoring posture for that sweep is in the `orchestrator-runbook` skill.
- **WHICH ACCOUNT AM I? (both accounts load THIS file — test before acting on anything claude-b):**
  `echo "${CLAUDE_CONFIG_DIR:-primary}"` — if it names `.claude-b`, YOU ARE CLAUDE-B: never delegate
  onward (that is recursion), you identify as claude-b in every board comment / commit trailer context /
  lane name (prefix `cb-`), and you report on stdout and check the bridge. As of **2026-08-24** this is
  the NORMAL case, not the exception: the primary account ran out of usage and the operator SWAPPED the
  session to claude-b, so claude-b IS the driving account — a swap needs no usage sentinel, no
  delegation and no bridge hop. The ≥85%-weekly-sentinel overflow clause, the `claude -p` spelling, the
  `~/.claude/bridge/` inbox protocol (dormant while primary is dark) and `SESSIONS.md`
  resume-never-re-mint are all in the **`orchestrator-runbook` skill** — load it before delegating
  across accounts or writing a bridge note.
- **POST-COMPACT / SESSION-START: the AUTO-ONBOARD hook does the ritual** (`.claude/hooks/session-onboard.sh`)
  — it injects the board, the bridge inbox, the claude-b registry pointer and the worktree count as
  session context. ACT on that context instead of re-deriving it, and **never track the board from
  memory: `pnpm work:item overview` before EVERY refill decision.** The full ritual (what each section
  means, Triage/Verify/Parked/Needs-owner as queues) is in the `orchestrator-runbook` skill.
- **Local `main` is the worktree base.** The owner pushes manually, so `origin/main` can be far behind.
  Spawn and rebase from the latest local `main`; never "refresh" a lane onto the remote branch.
- **Never push `origin` without fresh owner authorization for that exact push.** A prior or conditional
  word is not reusable. Run the required pre-push verification first, then ask or use the fresh word.
- **The shared agent memory is READ-ONLY to roles by instruction; every write to it is YOURS** (a
  lane's proposed lesson arrives as report text). Provisioning — `memory: project` resolves against the
  AGENT'S CWD, so every worktree needs `pnpm agent-memory:link` — is in the `orchestrator-runbook` skill.

## Work control (Project 1 is the only mutable lifecycle home)

- **Project owns lifecycle; prose owns durable results.** Never mirror Triage / Ready / Running /
  Blocked / Verify / Done into docs, use `pnpm work:item` for lifecycle transitions, and **only the
  orchestrator mutates Project** — subagents return path/commit/test receipts, you update the linked
  issue. Decisions enter **Needs owner**. Re-derive before you claim.
- **CLAIM FIRST, ALWAYS: the issue exists and is claimed BEFORE the fixing work starts.** An issue
  minted after its fixing commit is retrospective paperwork, not tracking.
- The `pnpm work:item` cookbook (classes, the `ready → claim → review → verify → done` lifecycle, the
  retry semantics) and the other three lifecycle-hygiene rules are in the **`orchestrator-runbook`
  skill**; `pnpm work:item --help` prints the complete command reference.

## What a brief must carry (subagents start almost naked)

A non-fork subagent boots with its own system prompt, your delegation message, the CLAUDE.md hierarchy,
git status, preloaded `skills`, and the shared `MEMORY.md` INDEX — **never** your conversation history,
your output style, anything you already read, or any memory topic-file BODY. (The full inheritance
table is `agent-authoring` §3; it is restated in the `orchestrator-runbook` skill.) Assume the index,
never the body: a load-bearing lesson is restated in the brief or named by its exact filename.

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
- **Worktree lifecycle rides the CUSTOM hook pair** (`WorktreeCreate`/`WorktreeRemove` →
  `.claude/hooks/worktree-setup.sh` / `worktree-remove.sh`): `isolation: "worktree"` dispatches get a
  WORKING tree for free — never add "run pnpm install" to those briefs. **A MANUAL `git worktree add`
  bypasses the hook and MUST run `pnpm worktree:bootstrap` (§L.5) or every gate LIES and every lane
  there boots with an empty memory index.** Hook internals + the teardown sequence: `orchestrator-runbook`
  skill.
- **Worktree teardown does NOT fire on agent completion** (probed live 2026-08-13) — worktrees
  accumulate, sweep them by hand at end of session, and **a worktree dir with no `.git` resolves
  `git -C` UP TO MAIN, so hand-run commands there hit the main checkout.** Never `rm -rf` a
  hook-created tree (it strands registered worktree metadata) and **never tear down a worktree you
  might resume** — a SendMessage resurrection lands in a deleted cwd. The sweep command sequence and
  its containment proof are in the `orchestrator-runbook` skill.
- **A lane's "done" report can lie about files it never staged** — require `git show --stat` receipts in
  briefs; spot-check `git -C <wt> status --short` before teardown.
- **Investigation lanes get instrumentation directives, not just symptoms** — the four-hop per-boundary
  diff (FE payload → server input → DB row → read-back) named a write-merge bug in one pass that
  endpoint-only debugging would have circled for hours.
