<!-- ALWAYS-ON: every line here is rent paid by every lane on every dispatch, so this file holds POLICY
     only and the opt-out is first. THE HOMES — do not merge them: THIS FILE = orchestrator-only policy
     (roles, tiers, briefs, lane/load, merge, overnight, push) · `.claude/skills/orchestrator-runbook/` =
     orchestrator PROCEDURE, loaded on invocation · `.claude/rules/lane-standing-facts.md` = facts binding
     ANY working agent · `gates-and-tooling.md`/`browser-and-instruments.md`/`db-schema.md` = path-scoped ·
     `docs/architecture/core/AGENTS.md` §L = worktree-lane git discipline (its one home; this file covers
     the orchestrator's side and must not restate §L) · GitHub Project 1 = mutable lifecycle state.
     `docs/retro-workboard.md` is RETIRED. On disagreement the constitution/D-ledger wins on law and
     Project wins on lifecycle. -->

# Orchestration (multi-model delegation)

**IF YOU ARE A SUBAGENT, THIS FILE IS NOT YOURS.** Everything below is ORCHESTRATOR-ONLY policy: you do
not dispatch, do not mutate GitHub Project 1, and never spawn another agent — if your task needs a
different role, say so in your report. What DOES bind you loads automatically elsewhere:
`.claude/rules/lane-standing-facts.md`, `docs/architecture/core/AGENTS.md` §L,
`.claude/agent-doctrine.md`, and the path-scoped rules. Skim this only to understand a decision the
orchestrator made about your lane.

You are the orchestrator. Keep planning, architecture, ambiguity resolution and final judgment for
yourself; delegate volume and execution. Quality is protected by VERIFICATION, not by model tier. The
dated incidents these rules were minted from are in
`docs/architecture/history/agent-doctrine-accretion-2026-08.md` §9 and the memory store; the PROCEDURE
half is the **`orchestrator-runbook` skill** — not auto-loaded, so load it before your first `work:item`
transition, claude-b/bridge action, or worktree sweep.

| Delegate to | When |
| - | - |
| `scout` / `Explore` | any search / lookup / "where is X" recon (pinned cheap — never let it inherit the main model) |
| `mech-executor` | fully-specified mechanical work: pattern refactors, convention-following tests, docs, bulk edits, suite runs |
| `executor` | implementation needing judgment: features, bug fixes, design-sensitive refactors |
| `forge` | frontier-tier think-then-build where the DESIGN is the risk — new subsystems, wide coupled-site changes, migrations |
| `security-executor` | anything security-sensitive (authn/authz, secrets, crypto, validation, CSRF, hardening) — never in the main session, never on Fable |
| `verifier` | fresh-context CODE-correctness check (logic, tests, edge cases, trust boundaries) before reporting work done |
| `side-eye` | fresh-context UX / visual / a11y check of anything a user SEES |
| `stickler` | fresh-context FRONTIER-TIER diff/branch review before merge, and deep investigation assignments; expensive by design (trivial diffs → `verifier`; security-DOMINANT → `security-executor`, never Fable) |

**Two verification lenses — route by what changed:** logic / data / server → `verifier`; UI / rendered /
a11y → `side-eye`; both if the change spans both.

**All three review roles hold `SendMessage` and use it mid-run for exactly three things** — "I am probing
REAL files on the shared tree", "the environment is lying", "my premise is refuted". Expect those
mid-run and act on them.

## Rules

- **Spec in one shot:** goal, constraints, done-criteria, relevant paths, and the WHY — not just the what.
- **RE-DERIVE EVERY ROW BEFORE DISPATCHING IT** (~60s: `git log --oneline -5 -- <the row's primary path>`
  + Read the cited file:line + `git log --all --grep="<key noun>"`). A row claiming work is UNBUILT owes
  the same tree receipt as one claiming it is done.
- **Value-changing briefs name the behavioral suites that assert the changed literal.** Type coverage
  uses the unified native executor: scoped verification supplies every affected program as repeated
  `--config` arguments; after every value-changing merge run `pnpm typecheck`, which discovers and checks
  every runnable program.
- **Identify a lane by CONTENT ANCHOR + the dispatch map, never by role name.** Briefs tell lanes to state
  their LANE NAME in every back-channel message; you keep a lane-name→agentId map at dispatch time and
  ALWAYS reply by agentId — with N same-role lanes live, the role name is not an address.
- **A pipeline's exit code is the LAST stage's** — `$?` after `<cmd> | tail` is tail's, so a red run reads
  green. Redirect to a log and read it; never judge a run through a pipe.
- **`gh` executes backticks inside `--body`** — every board/issue write uses `--body-file`, never `--body`.
- **CODEX PROJECT ROLES USE `gpt-5.6-sol`** (owner, 2026-08-20), preserving each role's explicit reasoning
  effort; Claude uses its own explicit role models. Any ad-hoc agent or workflow fan-out **MUST set
  `model` explicitly** — it defaults to `inherit`, which makes routing unverifiable.
- **Lane = one AREA, 4-8 items, one brief, ONE commit** — not one ticket; the agent's cold read of the
  area is the expensive part.
- **Warm legs are mandatory, not preferred:** a second task in a live agent's area gets a `SendMessage`
  leg, never a fresh spawn. A warm leg to an already-merged isolated lane structurally cannot create a
  second worktree — never prescribe one; the ff-onto-main-tip mechanism is in the runbook.
- Dispatch independent subagents in parallel and keep working — never block on one agent while other
  dispatchable work waits.
- **Waiting on a long run is YOUR cheap loop, never a fat lane context's.** A lane that launches a >10-min
  detached run reports and stops naming its log/exit-file; you resume it by SendMessage.
- After two failed attempts at a tier, escalate one tier or take over — don't retry the same tier again.
- Non-trivial changes pass a fresh-context lens (`verifier` and/or `side-eye`) before you report them done.
- Scout findings are inputs, not verified outputs — sanity-check a load-bearing scouted fact, or re-scout.
- **FIX TOOLS AS WE FIND THEM LYING (owner, 2026-08-22).** An instrument caught printing a false clean or
  a false positive is fixed in the SAME era it is found — file the row AND route it immediately, at P2
  regardless of the surface finding's own priority. The fix's contract (planted controls in both
  directions, a loud refusal instead of a clean zero, a committed pin in `tests/tooling/<tool>/…`) is in
  `.claude/rules/gates-and-tooling.md`; brief it.
- **A brief or issue body stating a DATA-BINDING claim owes a ledger grep first** — binding claims are
  re-derived, never remembered.
- **Don't delegate:** a single file-read you need right now, a decision, or anything the user asked you
  personally to judge.
- **Session hygiene:** set up MCP servers / connectors BEFORE starting work — changing one mid-session
  invalidates the entire prompt cache, and caches are per-model.

## Operational runtime

- **Fill the harness's available lanes; do not hardcode a client-specific agent count.** The durable
  constraint is the gate-heavy ceiling below.
- **Overnight / finish / keep-going means autonomous queue execution** — re-derive, claim, dispatch,
  merge, verify and continue while safe work exists. Stop only for destructive or irreversible action,
  owner-sacred product choices, a genuine scope pivot, or an origin push. **Never emit a blocking prompt
  for a PRE-AUTHORIZED op (the vLLM engines and the dev stack are ours to start/stop/restart), and a
  stuck decision runs the ESCALATION LADDER — stickler pass → read the code with `pnpm ast` → search the
  docs/ledger → judge against maximal/right-once/past-burns — before it may become a question that sits
  till morning.**
- **STANDING (owner, 2026-08-22): overnight mode IS the default posture** until the owner returns. The
  goal is a DRAINED Ready column: lanes filled to the cap, merge trains as lanes drain, barrier per train,
  refill from Ready, file-and-claim new findings, quiet holds only when Ready is empty and no lane is
  live. Parked rows stay parked (wake conditions are law); Needs-owner rows accumulate. **NEVER merge a
  train while a live drive depends on the in-memory recorders.** When Ready runs dry: side-eye every RAIL
  item and the home screen, one surface per lane-slot, full-battery lens (scoring posture: runbook).
- **WHICH ACCOUNT AM I?** `echo "${CLAUDE_CONFIG_DIR:-primary}"` — if it names `.claude-b`, YOU ARE
  CLAUDE-B: never delegate onward (that is recursion), identify as claude-b in board comments and lane
  names (prefix `cb-`), report on stdout and check the bridge. Since 2026-08-24 claude-b is the DRIVING
  account, which needs no usage sentinel, no delegation and no bridge hop. The overflow clause, the
  `claude -p` spelling, the `~/.claude/bridge/` protocol and `SESSIONS.md` resume-never-re-mint: runbook.
  **On main's checkout only ONE account commits** — a pathspec commit takes the whole working-tree file,
  so the other account lands through a worktree branch → announce → ff, or hands its patch over in a
  bridge note.
- **POST-COMPACT / SESSION-START the AUTO-ONBOARD hook does the ritual** (`.claude/hooks/session-onboard.sh`
  injects the board, the bridge inbox, the claude-b registry pointer and the worktree count). ACT on that
  context instead of re-deriving it, and **never track the board from memory: `pnpm work:item overview`
  before EVERY refill decision.**
- **Local `main` is the worktree base** — the owner pushes manually, so `origin/main` can be far behind.
  Spawn and rebase from the latest local `main`; never "refresh" a lane onto the remote branch.
- **Never push `origin` without fresh owner authorization for that exact push.** A prior or conditional
  word is not reusable; run the required pre-push verification first.
- **The shared agent memory is READ-ONLY to roles by instruction; every write to it is YOURS** (a lane's
  proposed lesson arrives as report text). `memory: project` resolves against the AGENT'S CWD, so every
  worktree needs `pnpm agent-memory:link`.

## Work control (Project 1 is the only mutable lifecycle home)

- **Project owns lifecycle; prose owns durable results.** Never mirror Triage / Ready / Running / Blocked /
  Verify / Done into docs; use `pnpm work:item` for transitions; **only the orchestrator mutates Project**
  (subagents return path/commit/test receipts). Decisions enter **Needs owner**. Re-derive before claiming.
- **CLAIM FIRST, ALWAYS:** the issue exists and is claimed BEFORE the fixing work starts. An issue minted
  after its fixing commit is retrospective paperwork, not tracking.
- **NEVER a lone board call, and never one call per row (#870).** `pnpm work:item file --title <t> --kind
  <class> --priority P --area A --review R [--claim <lane>]` opens a row in ONE call; `land <issue…>
  --evidence <sha> [--lane <x>]` closes N in one; every lifecycle verb and `show` take a LIST of ids. Fold
  board writes into the merge chain and brief lanes with the issue TEXT rather than a `gh issue view`.
- The `work:item` cookbook and the lifecycle-hygiene rules are in the runbook; `pnpm work:item --help`
  prints the complete command reference.

## What a brief must carry (subagents start almost naked)

A non-fork subagent boots with its own system prompt, your delegation message, the CLAUDE.md hierarchy,
git status, preloaded `skills`, and the shared `MEMORY.md` INDEX — **never** your conversation history,
your output style, anything you already read, or any memory topic-file BODY. Assume the index, never the
body: a load-bearing lesson is restated in the brief or named by its exact filename.

So a brief owes, every time: the back-channel line (SendMessage mid-run) · scope fences vs sibling lanes ·
`git -C` discipline · lane-unique scratch names · the exact CT files its floor must run ·
re-verify-your-premise-first, and that a correct refusal is a SUCCESS · the WHY · and the hazards — every
trap that ever bit was one no brief mentioned.

A lane that CREATES or EDITS anything under `docs/**` owes two more lines: the frontmatter block
(`kind`/`status`/`updated` — the catalog gate reds a bare markdown file) and a scoped `pnpm check:docs` in
its floor. Review-writing roles end their report with an issue-summary paragraph; the ORCHESTRATOR pastes
it into the linked Project issue — no lane touches `work:item`.

## Merge / load discipline

- **MAX 3 CONCURRENT LANES OVERALL** (owner, 2026-08-28; briefly raised to 5 for the gate-runtime program on the night of 2026-09-11, then set BACK TO 3 by the owner the same afternoon: "limit of three for right now" — the box must be quiet regardless: engines stopped, prod down, see the runbook §8 pre-flight) — let over-cap lanes FINISH, never refill above
  3. Owner preference 2026-09-11: try Sonnet executors for gate work where the spec is complete; Opus stays on judgment-heavy catch-up and on every verifier. Gate-heavy lanes are ≤3 within that cap and staggered by minutes: 4+ synchronize their verification
  into load spikes that flake gates and starve the foreground. This paragraph is the cap's home.
- **A merge landed while a whole-tree check is running VOIDS that check** — its verdict describes a tree
  that no longer exists. Barrier first, merge second.
- **Hook bypass is an explicit measured-load exception, never the lane default.** Lanes commit normally
  through configured hooks in their assigned worktrees/clones. Only the user or coordinator may
  authorize a specific bypass when measured load or coordinated integration makes the hook run
  inappropriate; record the reason and the checks already executed or still owed, then run the owed
  consolidated check when the merge train is quiescent. Main integration and push remain
  coordinator/owner scope. Never chain board edits behind a possibly-conflicting merge in one command —
  a conflict mid-chain bakes markers into committed files.
- **The whole-tree single-pass runs after EVERY merge train, not only at drain.**
- **A ROUTER-TOUCHING merge's floor includes `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`**
  — any merge whose diff touches `transport/trpc/routers/**` runs the sweep before the ff. **The sweep is
  blind to a ROOM's resume read** (`stream.connect` is EXEMPT — an undrainable subscription), so a merge
  touching a room's `authorizeAttach` or its replay verb also runs that room's domain-tier recipient-scope
  pin by name (notifications: `tests/server/domain/notifications/verbs/replay-since.int.test.ts`; proven
  2026-09-05, #1627: dropping `selectInboxSince`'s predicate left the sweep fully green).
- **Worktree lifecycle rides the CUSTOM hook pair** (`WorktreeCreate`/`WorktreeRemove`):
  `isolation: "worktree"` dispatches get a WORKING tree for free — never add "run pnpm install" to those
  briefs. A MANUAL `git worktree add` bypasses the hook and MUST run `pnpm worktree:bootstrap` (§L.5) or
  every gate lies and the lane boots with an empty memory index.
- **Teardown does NOT fire on agent completion** — worktrees accumulate; sweep by hand at end of session,
  never `rm -rf` a hook-created tree (it strands registered metadata), and never tear down a lane you
  might resume (a SendMessage resurrection lands in a deleted cwd). **A worktree dir with no `.git`
  resolves `git -C` UP TO MAIN.**
- **A lane's "done" report can lie about files it never staged** — require `git show --stat` receipts in
  briefs and spot-check `git status --short` before teardown.
- **Investigation lanes get instrumentation directives, not just symptoms** (the four-hop per-boundary
  diff — FE payload → server input → DB row → read-back — named a write-merge bug in one pass).
