<!-- Moved here from ~/.claude/CLAUDE.md on 2026-08-13 (owner: "move our orchestration instructions to
     the orbweaver project"). It lived globally but every role below except scout/Explore is an orbweaver
     agent, so it was costing context in every other repo to describe agents that did not exist there.
     `.claude/rules/*.md` without `paths:` frontmatter loads at launch with the same priority as
     `.claude/CLAUDE.md`, AND project rules are part of the hierarchy subagents receive — so this reaches
     lane agents, which is why the subagent opt-out below still has to be the first line.

     THREE HOMES, DELIBERATELY SPLIT — do not merge them:
       · THIS FILE = durable delegation + agent-operations POLICY (roles, tiers, briefs, lane/load,
         merge, overnight, and push posture).
       · docs/architecture/core/AGENTS.md §L = worktree-lane discipline.
       · GitHub Project 1 = mutable CURRENT STATE (what is ready/running/blocked/verified).
     docs/retro-workboard.md is RETIRED (owner, 2026-08-22) — the board + this file are the recovery path; its history is archaeology.
     If these homes disagree, the constitution/D-ledger wins on law and Project wins on lifecycle. -->

# Orchestration (multi-model delegation)

**If you are running AS a subagent — ANY subagent: a named role (scout, Explore, mech-executor, executor,
verifier, security-executor, side-eye, stickler) or an ad-hoc/general-purpose one — ignore this file and
just do the task you were given.** If your task needs another role, say so in your report and the
orchestrator dispatches. (Nesting is banned by the harness, not by this text:
`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` in `~/.claude/settings.json` `env`, plus every role below omits
`Agent` from its `tools` list. Removing either restores Claude Code's depth-3 default.)

You are the orchestrator. Keep planning, architecture, ambiguity resolution, and final judgment for
yourself; delegate volume and execution to role agents. Quality is protected by VERIFICATION. For Codex,
the owner has ruled that every project role uses `gpt-5.6-sol`; role instructions and explicit reasoning
effort remain the specialization axes.

| Delegate to | When |
| - | - |
| `scout` / `Explore` | any search, lookup, "where/how is X" reconnaissance (pinned cheap — never let a background search inherit the main model) |
| `mech-executor` | fully-specified mechanical work: pattern refactors, convention-following tests, docs, bulk edits, running gate/test suites |
| `executor` | implementation needing judgment: features, bug fixes, design-sensitive refactors |
| `security-executor` | anything security-sensitive (authn/authz, secrets, crypto, validation, CSRF, hardening) — never in the main session, never on Fable |
| `verifier` | fresh-context CODE-correctness check (logic, tests, edge cases, trust boundaries) before reporting non-trivial work done |
| `side-eye` | fresh-context UX / visual / a11y check of anything a user SEES — the other verification lens |
| `stickler` | fresh-context FRONTIER-TIER analysis: substantial diff/branch review before merge, AND deep investigation/research assignments (owner scope 2026-08-19); expensive by design, trivial diffs go to `verifier`; security-DOMINANT work still routes to `security-executor` (never Fable) |

**Two verification lenses — route by what changed:** logic / data / server → `verifier`; UI / rendered /
a11y → `side-eye`; both if the change spans both.

## Rules

- **Spec in one shot:** goal, constraints, done-criteria, relevant paths, and the WHY — not just the what.
- **RE-DERIVE EVERY ROW BEFORE DISPATCHING IT (2026-08-14, two stale dispatches in one day — one
  fixed a fixed bug's board row, one dispatched a program built five days earlier).** \~60 seconds
  before any Agent call: `git log --oneline -5 -- <the row's primary path>` + Read the cited
  file:line + `git log --all --grep="<key noun>" --oneline -5`. A board/audit row claiming work is
  UNBUILT owes the same tree receipt as one claiming it's done. A refusing lane costs \~5 min; a lane
  fixing a fixed thing costs an hour.
- **Value-changing briefs name `types:graph` in the floor, never bare `pnpm typecheck`** (2026-08-14,
  paid twice in one day): the per-package program is BLIND to `tests/` and `scripts/`, so a schema
  column or rename leaves the shared factories/probes red in the one program nobody in the lane ran.
  The orchestrator's half: run `node scripts/ts7.cjs --noEmit -p tsconfig.json` (\~15s) after EVERY
  value-changing merge — the single skipped tripwire of 2026-08-14 was exactly the merge carrying
  the red.
- **Reply routing: identify a lane by CONTENT ANCHOR + the dispatch map, never by role name**
  (2026-08-14, second misroute of the era — two live executors, an approval landed on the wrong
  one). Briefs must tell lanes to state their LANE NAME in every back-channel message; the receiving
  side of a misroute bounces it, but the intended lane silently proceeds on defaults.
  **The SENDING side is symmetric (2026-08-21): with N same-role lanes live, `SendMessage to:
  "<role>"` is unroutable (the harness refuses or, worse, could hit the wrong lane). The orchestrator
  keeps a dispatch map (lane name → agentId) at dispatch time and ALWAYS replies by agentId — the
  role name is never an address.**
- **Wrapper hygiene reaches briefs now:** the Bash guard classifies UNTRACKED script bodies
  (2026-08-14) — a lane's helper scripts must carry sanctioned spellings inside (CT cache-clear
  before playwright; redirect harness output to a log and read the log in a separate command, never
  pipe into tail). Also: `tests/tooling/check-gates.int.test.ts` is NOT concurrency-safe with itself
  (shared `__g_` fixture paths) — never let a lane floor and a drain battery overlap it.
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
- **Lanes NEVER busy-wait on a long run (usage ruling 2026-08-21, paid ~30% of a weekly cap in one
  day):** every sleep-loop poll re-bills cache reads on the lane's ENTIRE context — a 328k-context
  lane polling a 90-min calibration at 45s intervals burned millions of token-equivalents saying
  "not done yet". A lane that launches a >10-min detached run REPORTS AND STOPS (its report names
  the log/exit-file); the orchestrator or a cron/monitor picks up the completion and resumes the
  lane by SendMessage. Waiting is the orchestrator's cheap loop, never a fat lane context's.
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
  run until fixed. The fix carries the zero-hygiene contract (planted positive controls both directions;
  unsupported query shapes REFUSE loudly instead of printing a clean zero) and a clean-surface re-run
  distinguishing fixed-false-positives from newly-visible real findings. **And the lie must become
  IMPOSSIBLE TO REINTRODUCE (owner, 2026-08-22):** the planted fixture that reproduced the lie lands
  as a COMMITTED red-first test in the tooling mirror (`tests/tooling/<tool>/…`) — a permanent pin,
  never a one-time probe receipt — so any regression goes red in the suite forever. A lying-tool fix
  without its permanent pin is not done.
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
(including this file), git status, and any preloaded `skills`. It does **NOT** receive: your conversation
history, your **auto memory** (every pinned MEMORY.md lesson is main-session only), your output style, or
anything you have already read. Its context window is sized by **its own** model, not yours.

So a brief owes, every time: the back-channel line (SendMessage mid-run) · scope fences vs sibling lanes ·
`git -C` discipline · lane-unique scratch names · the exact CT files its floor must run ·
re-verify-your-premise-first, and that a correct refusal is a SUCCESS · the WHY · and the hazards — every
trap that ever bit was one no brief mentioned. **Any memory lesson the lane needs must be restated in the
brief; it cannot read your memory.**

A lane that CREATES or EDITS anything under `docs/**` owes two more lines: the frontmatter block
(`kind`/`status`/`updated` — the catalog gate reds a bare markdown file) and a scoped `pnpm check:docs`
in its floor — lefthook enforces catalog freshness, dangling references, and D-citation integrity at
push, so a doc written without them is debt the orchestrator inherits at the train gate. Review-writing
roles (stickler) end their report with an issue-summary paragraph; the ORCHESTRATOR pastes it into the
linked Project issue — no lane touches `work:item`.

## Rulings minted 2026-08-19 (the 9/9 rail-sweep night — each paid for at least once)

- **Fork-with-stated-default is the lane contract for recorded-ruling collisions.** A lane that hits a
  recorded ruling states the fork WITH receipts, prices the arms, names its default + deadline, and KEEPS
  WORKING on its other items. Never silently reverse a recorded ruling; never stall on it. The house
  resolution idiom when a ruling must evolve: **"the ruling survives — its INPUT changed"** (preserve the
  mechanism/text, change the condition, record both). Paid ~8× tonight, zero stalls.
- **Same-file parallel lanes are FINE when hunk regions are pre-declared through main.** Both lanes state
  their regions, NEITHER relocates hunks to dodge the merge (relocation is what breaks 3-way), and the
  orchestrator resolves by union. The failure mode is silent relocation, not the shared file.
- **The THREE-program typecheck truth table** (two briefs shipped wrong floors before this was pinned;
  CORRECTED 2026-08-21 by planted control; RE-CORRECTED 2026-08-23 #571 by planted control): `types:graph`
  (ts7 -p tsconfig.json) EXCLUDES packages/{ui,client}/src (bundler-mode) but sees tests/ + scripts/ —
  and excludes `tests/{ui,client}/**/*.tsx` by directory **AND excludes `tests/e2e/` whole** (DOM-context
  ruling 2026-07-24; `tests-dom` owns it — a lane touching tests/e2e MUST name `typecheck:tests-dom` in
  its floor; types:graph is a false clean there); per-package `pnpm typecheck` sees ui/client src AND is the
  ONLY program that owns `tests/**/*.ct.tsx` (a planted TS2322 in a .ct.tsx was caught by per-package
  alone); `tests-dom` does NOT see CT tsx — its include is an explicit list of non-CT DOM-coupled
  escapees. A floor claims coverage it verified — when uncertain, PLANT a control error; that is the
  standard, not paranoia.
- **The whole-tree single-pass runs after EVERY merge train, not only at drain** — tonight's corpus train
  left 9 findings that every scoped lane floor structurally missed; the single-pass caught them 30 min
  after merge instead of at the barrier.
- **Workspace-package merges self-apply — the ruling survives, its INPUT changed (2026-08-21,
  db25e3d1d):** vite source-consumes workspace packages (no stale prebundles) and the server
  auto-respawns via `node --watch` when merged files land, so no manual restart-at-merge-window
  exists any more. What REMAINS true: the merge-triggered server respawn WIPES in-memory wire/RPG
  flight recorders — so still never land a merge under a live drive that depends on them, and
  **never merge an instrument change (design-audit/snap/gates) while a drive is live without
  messaging the driving lane** — its before/after deltas silently span two instruments otherwise.
- **A brief or issue body stating a DATA-BINDING claim owes a ledger grep first** (the D58 lesson: the
  orchestrator wrote "chats reference presets via turn settings" into an issue as fact; the ledger
  already ruled the binding impossible and a gate already enforced it). Binding claims are re-derived,
  never remembered.
- **rg flag discipline is a standing hazard**: `-r` + shorthand cluster (`-rln`) silently REPLACES match
  text — four offenses this era, three by the orchestrator. Spell `--files-with-matches`/`-n` out; a
  tool-guard pattern for this is filed.

## Merge / load discipline (minted 2026-08-02, hardened 2026-08-13)

- **Cap concurrent GATE-HEAVY lanes at \~3, stagger dispatches by minutes.** 5+ synchronize their
  verification into load-60 spikes that flake gates (10s-hook timeouts, unfired-gate phantoms) and starve
  the foreground. This is a FLAKE ceiling, not a usage one — the overall lane cap lives on the board.
- **Under load:** merge with `--no-verify` on branch-side green receipts and run ONE consolidated check
  when lanes drain. Track the debt on the board. Never chain board edits behind a possibly-conflicting
  merge in one command — a conflict mid-chain bakes markers into committed files.
- **Worktree lifecycle rides the CUSTOM hook pair — know it, use it (owner reminder 2026-08-22):**
  `WorktreeCreate` → `.claude/hooks/worktree-setup.sh` REPLACES built-in creation (it creates the
  worktree AND runs the per-worktree `pnpm install` — 2s/48MiB via CAS hardlinks — plus env linking;
  its stdout IS the worktree path). `WorktreeRemove` → `.claude/hooks/worktree-remove.sh` is the
  paired teardown. Consequences: `isolation: "worktree"` dispatches get a WORKING tree for free —
  never add "run pnpm install" to those briefs; a MANUAL `git worktree add` bypasses the hook and
  MUST run `pnpm worktree:bootstrap` (§L.5) or every gate lies; teardown of hook-created trees goes
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

## Standing lane facts (2026-08-18 promotion — lanes: these bind you; briefs restate only DELTAS)

Every lane, without being told per-brief:

- **The dev stack self-heals on source changes — do NOT flag routine "needs restart"** (law corrected
  2026-08-21; the old "vite prebundles workspace packages" fact died with 086c4e047). Workspace packages
  are SOURCE-consumed by vite (zero `@orb/*` in `.vite/deps`; probed live: a `packages/ui` edit HMR'd
  onto `:5173` with no restart); exports-map moves auto-restart vite via the `orb:workspace-exports-restart`
  plugin; the server auto-respawns via `node --watch` over server/contracts/db/kit src (warm engines
  re-adopted, seconds). The ONLY manual-restart triggers: `.env` edits, `pnpm install`/dep changes,
  supervisor-script (`stack.sh`/`dev.sh`) edits, engine-posture changes. When in doubt, prove the served
  module (`curl :5173/@fs/<abs path> | grep <symbol>`) instead of bouncing the stack. NOTE: a watched-src
  save DOES respawn the server and wipes in-memory wire/RPG flight recorders — time merges accordingly
  when a live drive depends on them.
- **A snap stage's db is whatever its cached dir already holds** (corrected 2026-08-19 — the seed
  copies the dev db only into a FRESH stage dir; a cached stage keeps its old state, which can be
  thin). Verify provenance before using owner-corpus rows as receipts (fresh sha, or probe a known
  row); when unverified, rendered receipts come from CT or live-main. Stage writes land in the
  stage's copy — read-only discipline still applies to drives. The stage band (`:8888`/`:5273`) is
  ONE pair — if a sibling holds it, fall back to CT and say so; never tear a sibling's stage down.
- **`__orb.queries()` is a CACHE CENSUS, never an in-flight network count.** Any "N parallel
  queries" perf claim owes a network re-derivation before a dedupe is prescribed.
- **A CPU profile's top self-time frame can be the INSTRUMENT** (dev-only tooling). Attribute before
  optimizing; a dev-only frame is a tooling fix, not an app fix.
- **A point measurement never proves a range property.** Layout/balance fixes owe the width matrix
  (both ends + any crossover) and the appearance arms BEFORE the arm is chosen; a single-width
  receipt endorsing a "move X" fix is the shell-game setup the owner has explicitly banned.
- **Scoped test invocations go through the NICED pnpm scripts, never raw npx (2026-08-21 — raw npx
  bypasses the nice-19 priority that protects the co-hosted homelab):** node suites =
  `pnpm test:scoped <paths> --maxWorkers=4` · CT = `pnpm ct:scoped <paths> --workers=2` (it carries
  the cache-clear). Run from your worktree via `env -C` (never `cd`); your worktree's own
  node_modules + package.json serve the scripts. playwright-ct runs PRODUCTION React
  (StrictMode inert). The CT harness may mount its own copy of global surfaces (Toaster) — assert
  on the instance that carries content, never a bare slot selector.
  **Under multi-lane load add `--workers=2`** (measured 2026-08-21 at load-avg 170: default workers
  = all tests time out at mount() on pure contention, zero signal; `--workers=2` = green in 53s).
  **The same cap applies to NODE suites: lane runs add `--maxWorkers=4`
  whenever any sibling lane is live (via `pnpm test:scoped` — see the invocation bullet)** (measured 2026-08-21: one lane's default 14 forks at ~90% CPU
  each drove a 24-core box to load-avg 103 and STARVED THE CO-HOSTED HOMELAB — Authentik errored for
  the owner. The box is not ours alone; vitest.config's maxWorkers:14 is the DEDICATED-box number,
  briefs restate the cap). Long mutation/calibration runs are orchestrator-scheduled — a lane never
  starts one without an explicit green light naming the concurrency.
  **`route.abort()` defaults to `"failed"`, which makes chromium swap in an ERROR PAGE** — the
  mounted tree disappears and every later assertion passes vacuously (`toBeHidden` on a destroyed
  DOM); `route.abort("aborted")` is the only code that leaves the document standing.
- **Probes**: `cp f f.bak; …; mv f.bak f` or `git show HEAD:<path>` — NEVER `git stash`/`checkout`/
  `restore`. Red-first receipts run new pins against the UNMODIFIED source before any fix.
- **@orb/ui primitives drop `data-testid`** (slot-only seal); ECharts `BarList` is a canvas —
  text assertions speak for the frame, not the bars.
- **A checker OOM / kill / timeout is exit-2 class — NEVER hand-wave it as load (owner ruling
  2026-08-21; ts7/depcruise/lens OOMs were being shrugged off for weeks).** Exit 134/137, a heap
  abort, or a wall-clock kill of tsc/depcruise/knip/eslint/a lens/the gate harness means THE RUN IS
  NOT A VERDICT: no green may be claimed from it, and "probably contention" is a hypothesis you
  prove by a quiet re-run, not a dismissal. The heap floor is WORKSPACE-WIDE: pnpm-workspace.yaml `nodeOptions: --max-old-space-size=16384`
  reaches every pnpm-run script (node's default self-cap is ~4GB even on the 128GB box); ts7.cjs
  carries the flag internally so bare `node scripts/ts7.cjs` gets it too. Bare `npx depcruise`/`npx
  knip` spellings BYPASS the floor — invoke the pnpm rows — and so does a bare
  `node tooling/src/<tool>/cli.ts …` (paid 2026-08-23: two exit-134 OOMs on a bare structure run;
  the `pnpm check:structure` spelling picked up the floor and ran clean) — an OOM
  under THAT ceiling is a real finding to report, never to rerun-until-green. Run-completeness
  enforcement is #410. A search,
  gate, or in-page sampler that reports nothing owes a PLANTED POSITIVE CONTROL in the same
  invocation; a bare zero is "I couldn't measure", never "it isn't there". Two samplers that are
  dead on this tree by construction: an `rgb(...)` regex (computed style passes `oklch` through
  VERBATIM) and anything reading `getComputedStyle`/`elementFromPoint` to see a `mask-image`
  (a mask is PAINT — only framebuffer sampling sees it).
- **A SCHEMA-BASELINE edit DROPS the dev db at the next respawn — merge-window-scheduled, like a
  recorder-dependent drive (2026-08-23, #533/#534).** Any change to `packages/db/src/migrations/**`
  (hand-patch or regen) changes the baseline hash, and boot/migrate then RESETS the dev database — all
  data, pre-launch by design. It cost a 1,242-chat ST import plus ten corpus passes (~8h GPU) once.
  The tripwire is now a `[verify-notice]` line in `pnpm check`'s tail block ("THE NEXT SERVER RESPAWN
  WILL DROP THE DEV DB") — READ IT; it never fails the run, so a green verdict does not mean nothing
  happened. Before merging such a lane: schedule it like a merge window, and the moment the boot's
  pre-migrate backup appears, PIN it (`touch data/orbweaver.db.backup-<stamp>.keep`) — a pinned backup
  is exempt from `pruneDbBackups` forever; an unpinned one ages out of the recent-5/daily-7 budget.
- **Seeded rows are never verification evidence, and a per-user-scoped empty read is evidence about
  WHICH PRINCIPAL asked** — not about whether the data exists. Verify against model-populated /
  real-principal state, and say which principal your receipt was taken as.
- **Type floors run BOTH programs.** Per-package `types:packages` is structurally blind to `tests/`
  and `scripts/`; `types:graph` (`node scripts/ts7.cjs --noEmit -p tsconfig.json`) is the program
  that sees them. A lane changing a shared VALUE (enum member, wire field, user-facing label) also
  owes the behavioral suites that assert the literal — `pnpm check` is static and runs no tests.
- **Never run a whole-tree baseline/snapshot REGENERATOR on a shared or multi-lane tree** (the
  fabrication baseline, suppressions, `drizzle generate`): it recomputes from the WHOLE working
  tree and bakes a sibling's in-flight edits into your committed baseline. Hand-edit the single
  row, or use the gate's own escape marker (line-adjacent, like `biome-ignore`).
- **Read your own diff before you commit.** An Edit inserting a declaration directly above another
  lands BETWEEN that declaration and its JSDoc, silently re-parenting the doc block — invisible to
  biome, tsc, the gates and the suites. Anchor insertions on the opening `/**`, and read
  `git show --stat` on your own commit (it is also what catches an unstaged deliverable and a
  `Bin` byte-count on a `.ts`/`.tsx` = a NUL slipped into a template literal).
