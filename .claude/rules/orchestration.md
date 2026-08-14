<!-- Moved here from ~/.claude/CLAUDE.md on 2026-08-13 (owner: "move our orchestration instructions to
     the orbweaver project"). It lived globally but every role below except scout/Explore is an orbweaver
     agent, so it was costing context in every other repo to describe agents that did not exist there.
     `.claude/rules/*.md` without `paths:` frontmatter loads at launch with the same priority as
     `.claude/CLAUDE.md`, AND project rules are part of the hierarchy subagents receive — so this reaches
     lane agents, which is why the subagent opt-out below still has to be the first line.

     TWO HOMES, DELIBERATELY SPLIT — do not merge them:
       · THIS FILE = durable delegation POLICY (which role, what tier, what a brief owes).
       · docs/retro-workboard.md § STANDING LAWS = operational CURRENT-STATE law (lane caps, merge
         mechanics, push posture, what is in flight). It changes per session; this does not.
     If they ever disagree, the board wins on operational matters and this file wins on role selection. -->

# Orchestration (multi-model delegation)

**If you are running AS a subagent — ANY subagent: a named role (scout, Explore, mech-executor, executor,
verifier, security-executor, side-eye, stickler) or an ad-hoc/general-purpose one — ignore this file and
just do the task you were given.** If your task needs another role, say so in your report and the
orchestrator dispatches. (Nesting is banned by the harness, not by this text:
`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` in `~/.claude/settings.json` `env`, plus every role below omits
`Agent` from its `tools` list. Removing either restores Claude Code's depth-3 default.)

You are the orchestrator. Keep planning, architecture, ambiguity resolution, and final judgment for
yourself; delegate volume and execution to role agents. Quality is protected by VERIFICATION, not by
running the biggest model everywhere — spend main-session tokens on judgment, route the rest to cheaper
tiers.

| Delegate to | When |
|---|---|
| `scout` / `Explore` | any search, lookup, "where/how is X" reconnaissance (pinned cheap — never let a background search inherit the main model) |
| `mech-executor` | fully-specified mechanical work: pattern refactors, convention-following tests, docs, bulk edits, running gate/test suites |
| `executor` | implementation needing judgment: features, bug fixes, design-sensitive refactors |
| `security-executor` | anything security-sensitive (authn/authz, secrets, crypto, validation, CSRF, hardening) — never in the main session, never on Fable |
| `verifier` | fresh-context CODE-correctness check (logic, tests, edge cases, trust boundaries) before reporting non-trivial work done |
| `side-eye` | fresh-context UX / visual / a11y check of anything a user SEES — the other verification lens |
| `stickler` | fresh-context frontier-tier review of a substantial diff/branch before merge — finds defects nobody claimed anything about; expensive by design, trivial diffs go to `verifier` |

**Two verification lenses — route by what changed:** logic / data / server → `verifier`; UI / rendered /
a11y → `side-eye`; both if the change spans both.

## Rules

- **Spec in one shot:** goal, constraints, done-criteria, relevant paths, and the WHY — not just the what.
- **RE-DERIVE EVERY ROW BEFORE DISPATCHING IT (2026-08-14, two stale dispatches in one day — one
  fixed a fixed bug's board row, one dispatched a program built five days earlier).** ~60 seconds
  before any Agent call: `git log --oneline -5 -- <the row's primary path>` + Read the cited
  file:line + `git log --all --grep="<key noun>" --oneline -5`. A board/audit row claiming work is
  UNBUILT owes the same tree receipt as one claiming it's done. A refusing lane costs ~5 min; a lane
  fixing a fixed thing costs an hour.
- **Value-changing briefs name `types:graph` in the floor, never bare `pnpm typecheck`** (2026-08-14,
  paid twice in one day): the per-package program is BLIND to `tests/` and `scripts/`, so a schema
  column or rename leaves the shared factories/probes red in the one program nobody in the lane ran.
  The orchestrator's half: run `node scripts/ts7.cjs --noEmit -p tsconfig.json` (~15s) after EVERY
  value-changing merge — the single skipped tripwire of 2026-08-14 was exactly the merge carrying
  the red.
- **Reply routing: identify a lane by CONTENT ANCHOR + the dispatch map, never by role name**
  (2026-08-14, second misroute of the era — two live executors, an approval landed on the wrong
  one). Briefs must tell lanes to state their LANE NAME in every back-channel message; the receiving
  side of a misroute bounces it, but the intended lane silently proceeds on defaults.
- **Wrapper hygiene reaches briefs now:** the Bash guard classifies UNTRACKED script bodies
  (2026-08-14) — a lane's helper scripts must carry sanctioned spellings inside (CT cache-clear
  before playwright; redirect harness output to a log and read the log in a separate command, never
  pipe into tail). Also: `tests/tooling/check-gates.int.test.ts` is NOT concurrency-safe with itself
  (shared `__g_` fixture paths) — never let a lane floor and a drain battery overlap it.
- **MODEL TIER IS THE BURN LEVER, not lane count** (owner, 2026-08-13). Five lanes cost what five lanes of
  work cost; five lanes *on Opus* cost multiples. Start at the cheapest role that can plausibly succeed and
  escalate on failure, never the reverse. Any ad-hoc agent or workflow fan-out **MUST set `model`
  explicitly** — `model` defaults to `inherit`, which is how five Opus lanes happen by accident.
- **Lane = one AREA, 4-8 items, one brief, ONE commit** — not one ticket. The agent's cold read of the area
  is the expensive part; per-ticket lanes re-pay it every ticket.
- **Warm legs are mandatory, not preferred.** A second task in a live agent's area gets a `SendMessage`
  leg, never a fresh spawn. Only spawn fresh when the agent is dead or the area is genuinely different.
- Dispatch independent subagents in parallel / in the background and keep working — don't block on one
  agent while other dispatchable work waits.
- After two failed attempts at a tier, escalate one tier or take over — don't retry the same tier a third
  time.
- Non-trivial changes pass a fresh-context lens (`verifier` and/or `side-eye`) before you report them done.
  Prefer that over self-review.
- Scout findings are inputs, not verified outputs — sanity-check a load-bearing scouted fact, or re-scout.
- **Don't delegate:** a single file-read you need right now, a decision, or anything the user asked you
  personally to judge.
- **Session hygiene:** set up MCP servers / connectors BEFORE starting work — adding or removing one
  mid-session (or toggling web search) invalidates the entire prompt cache, and caches are per-model.

## What a brief must carry (subagents start almost naked)

A non-fork subagent receives its own system prompt, the delegation message, the CLAUDE.md hierarchy
(including this file), git status, and any preloaded `skills`. It does **NOT** receive: your conversation
history, your **auto memory** (every pinned MEMORY.md lesson is main-session only), your output style, or
anything you have already read. Its context window is sized by **its own** model, not yours.

So a brief owes, every time: the back-channel line (SendMessage mid-run) · scope fences vs sibling lanes ·
`git -C` discipline · lane-unique scratch names · the exact CT files its floor must run ·
re-verify-your-premise-first, and that a correct refusal is a SUCCESS · the WHY · and the hazards — every
trap that ever bit was one no brief mentioned. **Any memory lesson the lane needs must be restated in the
brief; it cannot read your memory.**

## Merge / load discipline (minted 2026-08-02, hardened 2026-08-13)

- **Cap concurrent GATE-HEAVY lanes at ~3, stagger dispatches by minutes.** 5+ synchronize their
  verification into load-60 spikes that flake gates (10s-hook timeouts, unfired-gate phantoms) and starve
  the foreground. This is a FLAKE ceiling, not a usage one — the overall lane cap lives on the board.
- **Under load:** merge with `--no-verify` on branch-side green receipts and run ONE consolidated check
  when lanes drain. Track the debt on the board. Never chain board edits behind a possibly-conflicting
  merge in one command — a conflict mid-chain bakes markers into committed files.
- **Worktree teardown does NOT fire on agent completion** (probed live 2026-08-13). Worktrees accumulate;
  sweep them by hand at end of session. A worktree dir with no `.git` resolves `git -C` **up to MAIN** —
  hand-run commands there hit the main checkout. Sweep: `git worktree list` → `git worktree remove --force`
  registered ones → `rm -rf` unregistered dirs → `git worktree prune` → `git branch -D wt/*` only after
  `git rev-list --left-right --count main...<branch>` shows 0 on the branch side.
- **Never tear down a worktree you might resume** — a SendMessage resurrection lands in a deleted cwd.
- **Killing a task mid-git leaves staged-no-MERGE_HEAD debris** — `git reset --hard HEAD` (the branch holds
  everything) and redo, don't excavate.
- **A lane's "done" report can lie about files it never staged** — require `git show --stat` receipts in
  briefs; spot-check `git -C <wt> status --short` before teardown.
- **Investigation lanes get instrumentation directives, not just symptoms** — the four-hop per-boundary
  diff (FE payload → server input → DB row → read-back) named a write-merge bug in one pass that
  endpoint-only debugging would have circled for hours.
