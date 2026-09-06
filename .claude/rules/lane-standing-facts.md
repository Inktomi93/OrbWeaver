<!-- ALWAYS-ON (no `paths:` frontmatter): loads at launch for everyone, so every line is rent. THE HOMES —
     do not merge them: THIS FILE = facts binding ANY agent doing work here (orchestrator included) ·
     `.claude/rules/orchestration.md` = delegation/lane/merge/overnight POLICY, orchestrator-only ·
     `docs/architecture/core/AGENTS.md` §L = worktree-lane git discipline (its one home) ·
     `gates-and-tooling.md`/`browser-and-instruments.md`/`db-schema.md` = path-scoped, indexed below ·
     GitHub Project 1 = mutable lifecycle state. On conflict the constitution / D-ledger wins on law and
     Project wins on lifecycle. -->

# Standing facts (every agent — lanes: these bind you, briefs restate only DELTAS)

Every one was paid for at least once; you get them without being told per-brief. The incidents behind
them are in `docs/architecture/history/agent-doctrine-accretion-2026-08.md` §10 and the memory store —
go there only when a rule's edge case is unclear.

## Load-scoped rules — read the one that matches what you are touching

These load automatically when you read a matching file. If you are working in one of these areas and
have not seen its rule yet, READ IT BY PATH before you edit:

| You are touching | Read |
| - | - |
| `tooling/src/verify/gates/**` · `tests/tooling/**` · any gate or instrument | `.claude/rules/gates-and-tooling.md` |
| `tests/**/*.ct.tsx` · `tests/e2e/**` · a rendered/browser probe | `.claude/rules/browser-and-instruments.md` |
| `packages/db/src/migrations/**` · the drizzle schema | `.claude/rules/db-schema.md` — **it drops the dev db; read it BEFORE you edit** |

## Staging and commits

- **Stage by PATHSPEC on `main` or any SHARED tree; `git add -A` is FINE in your own isolated worktree**
  (owner correction 2026-08-24). The two failure modes are opposite: on a shared tree a broad `git add`
  sweeps a sibling's in-flight probe into your commit (it has shipped a BLINDED gate, which then reports
  green forever); in your own worktree `git commit -- <pathspec>` silently SKIPS UNTRACKED files and the
  cited-but-never-committed deliverable dies at teardown. Either way: `git status --short` EMPTY before
  you report, and `git show --stat <sha>` in the report.
- **Read your own diff before you commit.** An Edit inserting a declaration directly above another lands
  BETWEEN that declaration and its JSDoc, silently re-parenting the doc block — invisible to biome, tsc,
  the gates and the suites. Anchor insertions on the opening `/**`, and read `git show --stat` (it also
  catches an unstaged deliverable, and a `Bin` byte-count on a `.ts`/`.tsx` = a NUL in a template literal).
- **Probes:** `cp f f.bak; …; mv f.bak f` or `git show HEAD:<path>` — never `git stash`/`checkout`/
  `restore` (the rule's one home is constitution §4). Red-first receipts run new pins against the
  UNMODIFIED source before any fix. If the probe edits a REAL file on a SHARED tree, SendMessage the
  orchestrator with the paths before you start and again when you have restored them.
- **Never run a whole-tree baseline/snapshot REGENERATOR on a shared or multi-lane tree** (the fabrication
  baseline, suppressions, `drizzle generate`): it recomputes from the WHOLE working tree and bakes a
  sibling's in-flight edits into your committed baseline. Hand-edit the single row, or use the gate's own
  line-adjacent escape marker.
- **The two line-coupled ledgers RED at `pnpm check`** — `ledgers:fresh` re-derives
  `docs/reviews/caught-failure-ownership/population.json` and `docs/test-baseline/manifest.json` and names
  the differing rows plus the regen command. A lane that adds a TRACKED spec regenerates the manifest in
  its OWN worktree (`git add` the spec first — the derivation reads `git ls-files`); on a SHARED tree,
  re-derive on the merged tree at the barrier.

## Forks, rulings and premises

- **Fork-with-stated-default is the lane contract for recorded-ruling collisions.** State the fork WITH
  receipts, price the arms, name your default + deadline, and KEEP WORKING on your other items. Never
  silently reverse a recorded ruling; never stall on it. The house resolution idiom when a ruling must
  evolve: **"the ruling survives — its INPUT changed"** (preserve the mechanism, change the condition,
  record both).
- **Same-file parallel lanes are FINE when hunk regions are pre-declared through main.** Both lanes state
  their regions, NEITHER relocates hunks to dodge the merge (relocation is what breaks 3-way), and the
  orchestrator resolves by union.
- **A DATA-BINDING claim is re-derived, never remembered** — a brief or issue body asserting one owes a
  ledger grep first.
- **Seeded rows are never verification evidence, and a per-user-scoped empty read is evidence about WHICH
  PRINCIPAL asked** — verify against model-populated / real-principal state, and say which principal your
  receipt was taken as.

## Verification floors

- **Type floors run BOTH programs.** Per-package `types:packages` is structurally blind to `tests/` and
  `scripts/`; `types:graph` (`node scripts/ts7.cjs --noEmit -p tsconfig.json`) is the program that sees
  them. A lane changing a shared VALUE also owes the behavioral suites that assert the literal — `pnpm
  check` is static and runs no tests.
- **The THREE-program typecheck truth table** (this is its ONE home; every other file points here):
  `types:graph` EXCLUDES `packages/{ui,client}/src` but sees `tests/` + `scripts/` — and excludes
  `tests/client/` and `tests/ui/` WHOLE (`tsconfig.json` names the bare directories, `.ts` files included,
  not just the `.tsx` half — truth-repaired 2026-09-05 after cb-pure-mirrors proved it with a planted TS2322)
  **AND `tests/e2e/` whole** (a lane touching `tests/client`, `tests/ui` or `tests/e2e` MUST name
  `typecheck:tests-dom`; `types:graph` is a false clean there); per-package `pnpm typecheck` sees
  ui/client src AND is the ONLY program that owns `tests/**/*.ct.tsx`; `tests-dom` owns
  `tests/{client,ui}/**/*.ts` plus an explicit list of non-CT DOM-coupled escapees and does NOT see CT tsx.
  A floor claims only coverage it verified — when uncertain, PLANT a control error; that is the standard,
  not paranoia. **A fourth, `.test-d.ts`-only invocation exists but adds no NEW coverage** — `pnpm
  test:types` (the `types:testd` verify stage) runs vitest's typecheck feature, split 2026-09-05 (#1313)
  into `types-node` (root `tsconfig.json`) and `types-browser` (`tsconfig.tests-dom.json`, for the handful
  of `.test-d.ts` subjects that import a browser package) — it DUPLICATES `types:graph`/`typecheck:tests-dom`
  for `.test-d.ts` files rather than supplementing them, and the split's whole point was to stop it
  double-reporting under the wrong lib (it used to check every `.test-d.ts` under the DOM-less root with
  `ignoreSourceErrors: true` swallowing the fallout — a floor that ran only `pnpm test:types` was measurably
  blind to a real subject error in a DOM-touching `.test-d.ts` file before this fix).
- **A checker OOM / kill / timeout is exit-2 class — NEVER hand-wave it as load** (owner ruling): exit
  134/137, a heap abort, or a wall-clock kill of tsc/depcruise/knip/eslint/a lens/the gate harness means
  THE RUN IS NOT A VERDICT, and "probably contention" is a hypothesis you prove by a quiet re-run.
- **The heap floor is WORKSPACE-WIDE but only through pnpm:** `pnpm-workspace.yaml`
  `nodeOptions: --max-old-space-size=16384` reaches every `pnpm run` / `pnpm exec` child (node's own
  default self-cap is \~4GB even on the 128GB box); `ts7.cjs` carries the flag internally. **`npx` NEVER
  carries it — that is the whole tool family, not a list of two** — and neither does a bare
  `node tooling/src/<tool>/cli.ts`.
- **eslint owns `packages/{ui,client}/src`, `tooling/src/**`, the test trees, AND — with a REDUCED rule set (tsdoc + the shared block; `TSDOC_SURFACE` in `eslint.config.js`, truth-repaired 2026-09-06 by a planted `tsdoc/syntax` control in #1800) — `packages/server/src/**/*.ts`; lint server src too, do not skip it as unowned:
  `tests/{tooling,server,kit,db,contracts,support,e2e,client,ui}/**/*.ts` plus the CT surface (`*.ct.tsx`,
  `*.fixtures.tsx` under `tests/ui`, `_ct-stories.tsx`)** (#1574, 2026-09-05). A file outside those globs answers
  "File ignored because no matching configuration was supplied" — RED under `--max-warnings 0` and SILENT under
  the scoped verify lane (it passes `--no-warn-ignored`), so a lane that lints an uncovered path has measured
  nothing. Still uncovered by design: the 31 `.tsx` story/fixture modules named in `eslint.config.js`'s
  `TESTS_DOM_OWNED` note (#1590).
- **The spellings: a named pnpm script when one exists, else `pnpm exec <tool> …` — never `npx`.** Scoped
  biome is `pnpm exec biome check <paths> --diagnostic-level=error`; scoped CT is `pnpm ct:scoped <paths>`
  (it carries BOTH the cache-clear and the nice). An OOM under THAT ceiling is a real finding to report,
  never to rerun-until-green.
- **A search, gate, or in-page sampler that reports nothing owes a PLANTED POSITIVE CONTROL in the same
  invocation** — a bare zero is "I couldn't measure", never "it isn't there".
- **A point measurement never proves a range property.** Layout/balance fixes owe the width matrix (both
  ends + any crossover) and the appearance arms BEFORE the arm is chosen.

## Running suites without starving the box

- **Scoped invocations go through the NICED pnpm scripts, never raw npx** (npx bypasses the nice-19 floor
  that protects the co-hosted homelab): `pnpm test:scoped <paths>` · `pnpm ct:scoped <paths>`, from your
  worktree via `env -C`. **Pass NO `--maxWorkers`/`--workers` unless going LOWER** (#1835): the SHIPPED
  defaults ARE the shared-host values (vitest 4, CT 2) from `tooling/concurrency-profile.json`, the ONE
  home for every cap; `ORB_DEDICATED_BOX=1` in the SHELL is the solo-box switch (vitest 14, CT 4 — the
  measured quiet-box numbers). Whole `check`/`verify` runs, the edit hook's legs and CT runners now hold
  HOST-WIDE slots that QUEUE, never refuse, and `.claude/hooks/cpu-fence.sh` caps each session at
  CPUQuota 800%. `nice` only orders OUR tasks — user.slice and system.slice both weight 100 under cgroup
  v2, so it never reached the containers; the quota is what does.
- **Load proof for a flake is `--repeat-each N` for CT ONLY; node suites take SEQUENTIAL passes** (2026-09-05):
  `pnpm test:scoped … --repeat-each=3` exits 2 — the preflight's `vitest list` dies on `--repeatEach`. And never
  start a SECOND `ct:scoped` in the SAME worktree for load (#1581): both share `.cache/`, the second's
  cache-clear + vite rebuild lands under the first and untouched tests read red. A different worktree, or
  repeat-each, or sequential runs — never a sibling runner in your own tree.
- **Long mutation/calibration runs are orchestrator-scheduled** — never start one without an explicit
  green light naming the concurrency.
- **Lanes NEVER busy-wait on a long run** (every sleep-loop poll re-bills cache reads on the lane's ENTIRE
  context). A lane that launches a >10-min detached run REPORTS AND STOPS, naming its log/exit-file; the
  orchestrator resumes it by SendMessage. The harness-mechanics half — why a backgrounded run never comes
  back to you — is its own section below, **"Running a long command"**, because it binds every lane, not
  only the ones running suites (#911: three stalls in one day under this suite-load head).
- **The harness AUTO-WRITES its artifacts — read them, never pipe or re-run to find a failure**
  (`reports/verify.json`, `reports/verify/<stage>.log`, `reports/test-report.json`), and those paths are
  `latest` POINTERS, not files written in place. What a run writes where: constitution §4 →
  `UNIFIED-VERIFICATION-DESIGN.md` §3.3b.

## Running a long command (every lane — this is not a suite-load rule)

- **A finished subagent turn is NOT re-invoked by its own background jobs.** There is no notification
  coming: when your turn ends, nothing you started in the background can wake you. A run under \~10 min is
  redirected to a log (`> $LOG 2>&1; echo EXIT=$?`) and READ in a LATER CALL IN THE SAME TURN — never
  backgrounded-and-waited-on. A run over \~10 min is REPORTED AND STOPPED (name the log/exit-file); the
  orchestrator resumes you by SendMessage.
- **The failure shape, so you can catch yourself:** the sentence *"I'll wait for the notification"* (or
  "I'll pause tool calls until the background job completes") is the tell — a lane that has written it has
  already stalled (#911, three lanes in one day, 2026-08-30). Read the log now, or report and stop.

## The dev stack

- **The dev stack self-heals on source changes — do NOT flag routine "needs restart".** Workspace packages
  are SOURCE-consumed by vite; exports-map moves auto-restart it via the `orb:workspace-exports-restart`
  plugin; the server auto-respawns via `node --watch` over server/contracts/db/kit src.
- **The ONLY manual-restart triggers:** `.env` edits, `pnpm install`/dep changes, supervisor-script
  (`stack.sh`/`dev.sh`) edits, engine-posture changes. When in doubt, prove the served module
  (`curl :5173/@fs/<abs path> | grep <symbol>`) instead of bouncing the stack.
- **A watched-src save — and therefore any merge — RESPAWNS the server and WIPES the in-memory wire/RPG
  flight recorders**, so a merge never lands under a live drive that depends on them, and an instrument
  change never lands mid-drive without messaging the driving lane.
- **The "long-lived vite serves a corrupt module graph" premise is RETIRED (owner, 2026-09-06: "vite has HMR, we
  fixed the stale issue").** `:5173` rendered receipts are valid after a merge train WITHOUT a vite pid-age check;
  do not bounce vite because the train moved. The 2026-08 incident stays in memory as history only. The
  self-heal law above therefore has no era limit; the manual-restart triggers are the list above, nothing more.
- **NEVER execute `scripts/dev/engines.ts` — or any engine launcher, `--help` included — to "verify" it
  while the live stack runs.** There is no dry-run and no help guard: the invocation spawns real vLLM
  against the live ports and its pidfile reconciler reaps every engine process it does not own. A
  launcher/config DIFF is verified by typecheck + unit tests + argv snapshots (`buildEngineArgv` exists
  for exactly that). Bringing engines UP for a live drive when they are DOWN is separately authorized
  (`pnpm engines`); the ban is on spawning to inspect.
- **A log tail is NEVER a liveness check** — `.cache/stack/client.log`'s tail can belong to a DIFFERENT
  since-exited vite. Probe the served app (`data-app-ready` + page errors on a bare snap).
- **`:5173` serves MAIN, never your worktree** (§L.6) — rendered proof from a lane comes from
  `snap --isolated --ref <your-sha>` or the CT browser.
- **If the environment is lying — stale server, wrong build, thin stage db, a sibling holding the stage
  port — SendMessage the orchestrator the moment you find out.** Every lane measuring after that point is
  measuring a dead premise, not just you.

## Tool hazards

- **`vitest list --filesOnly --json <path>` OVERWRITES `<path>`.** `--json`'s value is OPTIONAL, so the next
  positional is consumed as the JSON OUTPUT path rather than as a filter — a lane probing with
  `--json tests/tooling/smoke.test.ts` replaced that TRACKED TEST FILE with a JSON array (recovered via
  `git show HEAD:<path> > <path>`). Always `=`-join it to an absolute scratch path
  (`--json=/tmp/.../out.json`). Same shape as the `rg -r` hazard below: an optional-value flag turns the
  next argument into a destination.
- **rg flag discipline is a standing hazard:** `-r` + a shorthand cluster (`-rln`) silently REPLACES match
  text. Spell `--files-with-matches` / `-n` out.
- **Wrapper scripts are classified by BODY** — the Bash guard reads UNTRACKED script bodies, so a helper
  script must carry the sanctioned spellings inside it (the CT cache-clear before playwright; a redirect
  to a log read in a separate command rather than a pipe into tail).
- **Code-PRESENCE claims use `pnpm ast`/ast-grep — grep corroborates, never decides.** A negative claim
  owes a non-zero scanned-file count plus a second method; `ts` and `tsx` are different languages, run
  both.
- **A worktree typecheck cannot prove an `@orb/*` exports-subpath REMOVAL, and cannot refute an import of a file
  that exists only on main** (#1623, proven 2026-09-05 with `ts.resolveModuleName` + `tsc --traceResolution`):
  a worktree lives at `<repo>/.claude/worktrees/<id>/`, TypeScript treats an exports-map MISS as non-terminal, and
  the ancestor walk reaches MAIN's `node_modules/@orb/*` two levels up — nothing placed in between stops it (an
  empty dir, `exports: {}`, an explicit `null` subpath and a wildcard-to-missing-target were all tried). The proof
  of a subpath removal is the merge train's whole-tree check on main; a lane deleting an exports key says so in its
  report instead of claiming a green typecheck as the receipt.
