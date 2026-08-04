# Orbweaver executor doctrine (build-process hard rules)

Every doctrine-aware role (`mech-executor`, `executor`, `verifier`, `security-executor`) reads this
BEFORE touching code. These are the recurring gotchas that break this repo's gates or ship broken
pixels — they are not optional, and "I didn't know" is not a valid outcome. The *architecture* law is
separate and higher: `docs/architecture/core/AGENTS.md` (the constitution) wins on any conflict.

## Read order
1. `docs/architecture/core/AGENTS.md` — the constitution, IN FULL. Then the specific docs/file-headers
   it points to for your task. The per-domain law is the CODE + its file headers (the code is the doc).
2. This file.
Do not skim. You are an amnesiac agent; these docs are your memory.

## The hard rules
- **Tokens only.** No raw px / hex / arbitrary Tailwind values in features (a biome hook enforces it).
  Compose from `@orb/ui` primitives + `<Stack>/<Row>/<Section>/<Container>`; never `className` on raw
  HTML in a feature. Tokens live in `packages/ui/src/tokens/tokens.json` → after editing them run
  `pnpm --filter @orb/ui tokens:build` (theme.css + tokens/index.ts are GENERATED; a dead/unused token
  is a build error).
- **The gate battery is `pnpm check`** (biome + eslint + typecheck + structure + depcruise). The commit
  hook runs `pnpm check`, NOT `pnpm test`. After editing any gate or token file, run the gate's own
  integration test (`check-gates.int`). CT/unit tests are NOT in the commit hook — a change can be
  gate-green and still fail `pnpm test`.
- **Lane verification is SCOPED (owner ruling 2026-07-25). Whole-tree `pnpm check`, `structure:full`,
  and the full `pnpm test` battery are BANNED in a lane** — on a shared multi-lane tree they only show
  sibling churn and burn your time attributing it. Your DONE bar: run exactly the test files you touched
  (`pnpm vitest run <paths>`, single-file playwright CT), typecheck your surface (scoped tsc / the fast
  per-package stages), biome+eslint on your files. The ORCHESTRATOR runs the big gates once on the
  quiesced tree; anything it catches comes back to you to fix.
- **The harness AUTO-WRITES artifacts — READ them, never pipe or re-run to rediscover a failure.**
  `pnpm check` → `reports/verify.json` + per-stage `reports/verify/<stage>.log` +
  `reports/check-structure.json`; `pnpm test` → `reports/test-report.json` + `reports/ct-flaky.json`.
  Invoke the SCRIPTS, not bare runners (a bare `npx vitest run` skips the json reporter and loses the
  artifact); a `| tail`/`| grep` filter on live output eats the failure list you needed.
- **NEVER run `biome check --write`, `biome format`, or any format-all / fix-all.** Its INFO-level
  autofixes have changed behavior and crashed the server (the `/u` unicode-regex wave took down boot).
  Fix only ERROR-level diagnostics. `useUnicodeRegex` is deliberately deleted from biome.json — do not
  re-add `u` flags to ASCII-matching regexes.
- **`biome-ignore` must be the comment IMMEDIATELY above the flagged line.** If you also need an
  `eslint-disable-next-line`, put the eslint comment ABOVE the biome-ignore(s) so the biome-ignore stays
  flush with the code. Suppress a rule only when it is a genuine false-positive, with a cited reason —
  never restructure real code (e.g. `role="grid"` div → `<table>`) just to silence a linter.
- **done ≠ rendered.** Verify the computed / rendered result — `getComputedStyle`, `boundingBox`,
  `pnpm snap` — not the source. A gate can be green while the pixels are wrong (collapsed to 0px,
  wrong aspect, unreadable contrast). Assert geometry against the resolved token, never a hardcoded px.
- **Read the FULL gate / test output.** Tailing hides mid-chain errors. A run that "looks done" isn't
  verified until you've read its result. A builder whose last message is "waiting on the background run"
  is NOT done.
- **DB (pre-launch): schema changes SQUASH into `0000_baseline.sql`** (regen via drizzle-kit + biome-
  format the meta), never an incremental `0001`. The `db-structure` gate does NOT catch this.
- **Use the right search tool — don't default to grep for everything (all these ARE installed):**
  - **`ast-grep` for code STRUCTURE** — "every `useState(...)` call", "components matching a JSX shape",
    "functions with signature X", and AST-aware rewrites. Structural, no regex-escaping pain, respects
    syntax. **Type `ast-grep`, never `sg`** — VERIFIED on this box 2026-08-03, after two wrong versions of
    this line: `which -a sg` returns `~/.cargo/bin/sg` (ast-grep's own binary) FIRST, then
    **`/usr/bin/sg`, which is a symlink to `newgrp`** — the collision is present HERE, merely shadowed by
    PATH order. And ast-grep itself prints `WARNING: \`sg\` is deprecated. Use \`ast-grep\` instead.` So:
    upstream deprecated it, and one PATH change / different shell / `sudo` flips a search into a
    group-switch command. (An earlier version of this line claimed `sg` silently searches nothing here —
    FALSE, a census of 133,631 Bash calls found it working. The rule is right; that reason was not.)
    (Run `ast-grep run --help` for the rest; no repo `sgconfig`, run ad-hoc.)
    - `ast-grep run -p '<pattern>' -l ts <paths>` — search. Metavars: `$A` = one node, `$$$A` = many;
      `-l/--lang` is `ts`/`tsx`/`js`/`html`/`css`/… (required for a bare pattern).
    - **`ts` and `tsx` are DIFFERENT LANGUAGES and there is NO superset flag — run BOTH and merge,
      always.** `-l ts` matches no `.tsx`; `-l tsx` scans ZERO `.ts`-only files. One measured tree, same
      pattern: `-l ts` scanned=303/matches=11 vs `-l tsx` scanned=359/matches=107.
    - **A negative claim needs `--inspect summary`.** `ast-grep run` exits 1 on no-match — the IDENTICAL
      exit as the wrong language, wrong path, or an ignored dir. `--inspect summary` prints
      `scannedFileCount=…`; **`scannedFileCount=0` means the search never happened** — report "I could
      not search", never "not found". A non-zero scan count is what entitles you to an absence claim.
    - `-r '<fix>'` rewrites, but **prints a diff only** — nothing is applied until `-U/--update-all`
      (batch) or `-i/--interactive` (confirm each). A search never mutates.
    - `--globs 'packages/ui/**'` to scope · `-C <n>` context lines · `--json=compact` machine output ·
      `--files-with-matches` for paths only · `-k <kind>` by AST node kind.
    - `ast-grep outline <paths>` lists symbols/imports/exports/members — **syntax-only**: no references,
      no types, no re-export chains, no call graph, so it maps structure but never proves reachability.
      `--debug-query -l ts` prints the tree-sitter AST when a pattern won't match (don't guess the kind).
    - Inline rules: `--inline-rules` (with `--stdin` for snippets), single-quoted or the shell eats
      `$META`. **`stopBy` defaults to `neighbor`, not the whole subtree** — write `stopBy: end` unless
      you mean direct-child-only. Validate any rule against a known-POSITIVE and known-NEGATIVE before
      trusting a zero from it; every failure mode here returns a silent zero.
  - **The built-in Grep TOOL for literal text** — strings, comments, config values, a quick "does
    this token appear". It's ripgrep-backed, needs no permission prompt, and has no binary-skip
    issue. Don't force ast-grep on a literal, and don't shell out to grep for a plain search.
    ONLY when a Bash pipeline genuinely needs grep in it: use `/usr/bin/grep -a` — the shell's bare
    `grep` is a ugrep wrapper that skips some `.ts` as binary → silent false-negative sweeps.
    **Always pass `--exclude-dir=node_modules` explicitly.** `grep -r` does NOT respect ignore files,
    and all six packages have their own `node_modules`. Today those happen to contain SYMLINKS into the
    pnpm store, which `grep -r` won't follow — so a count can come out right by ACCIDENT of the store
    layout while the command is wrong. Hoisting, a different installer, or one real directory turns the
    same command into thousands of `@types` hits with no signal that anything changed. Rely on the flag,
    never on the layout. (`ast-grep` and the Grep tool respect ignore files and need no flag — this is
    a raw-`grep`-in-a-pipeline rule.)
  - **`tree`** (v2.1) for directory structure at a glance; **`tokei`** (v12.1, `--output json`) for
    LOC/size stats by language when scoping how big a surface is.
  - **The global `code-recon` SKILL is the standard for any recon claim** — load it with the Skill tool
    before hunting in an unfamiliar codebase. It carries the evidence ladder this repo judges by
    (declared → exported → imported → called), the three ways recon fails while LOOKING like success
    ("a file existing is not evidence the thing is implemented"; "no-matches is not absence"), and the
    ast-grep run/outline/scan mechanics. Absence claims need TWO independent methods.
  - **Reading NEO (`legacy-main`) structurally:** it is a BRANCH, so nothing is on disk and `git show`
    yields one file at a time — which is how a dig degrades into grep-guessing. Materialize it OUTSIDE
    the repo and run ast-grep over that:
    `git -C <repo> archive legacy-main | tar -x -C <scratchpad>/neo`. Never `checkout`, never
    `worktree add`, never `cp` into the tree (lanes may be mid-sweep on the working tree). For
    SillyTavern (`/home/inktomi/inktomi-stack/SillyTavern/`) use `ast-grep -l js` **and `-l html`** and
    lead with `ast-grep outline` for the symbol map — hunt by SHAPE, not by the feature's English name.
    **Much of ST's UI hides in TEMPLATE HTML** (`public/scripts/templates/`, inline `<template>`), so a
    JS-only sweep misses whole capabilities; its locale/string tables are a cheap high-recall index of
    every user-facing option.
  - **`scripts/codemods/codemod-kit.ts` BEFORE you hand-edit a repeated shape or write your own
    codemod.** It is a ts-morph toolkit with a documented index (search `── §`), and it already carries
    the helpers for campaigns this repo has run: `retypeIdAnnotations` (retype every `chatId: string`
    → `chatId: ChatId` AND insert the type-only import, preserving `| null` / `?`, idempotent),
    `castStringLiteralsByDiagnostic` (TYPE-CHECKER-driven — wraps the literals tsc reports as
    unassignable, so it catches positional args/returns a structural pattern misses; run it LAST, after
    the retypes), `castIdInObjectLiterals` / `castIdInComparisons`, plus move/repoint/rename/re-export
    arms. **`runCodemod` DRY-RUNS BY DEFAULT** and prints a per-file diff before a byte hits disk —
    `--apply` is the explicit commit flag. Preview, read the WHOLE diff, then apply in reviewable
    batches; a blind mass `--apply` is how a wrong rename ships. Same rule for `ast-grep -r`: it prints
    a diff only until `-U`/`-i`.
- **Verify with our instruments, cheaply.** `pnpm snap <route> --map/--contrast/--eval/--aria` (Bash,
  own headless browser, no MCP cost); `window.__orb` for render/query/bus state; wait on
  `data-app-ready`. Prefer these over chrome-devtools MCP.

- **NEVER commit while a `git push` is running, and never trust the push's summary line.** Measured
  2026-08-03: our pre-push hook is `pnpm verify --push` (~17 min), and git resolves the ref to push at
  INVOCATION but transfers the ref's value at TRANSFER time. A commit made inside that window ships
  silently, and git prints the range it computed 17 minutes earlier — so the output actively misreports
  what went to origin. It cost a confused investigation and a wrong accusation of an innocent lane.
  **Verify a push against the SERVER** (`git ls-remote origin refs/heads/main`, or the GitHub API's push
  events), never the console summary — the same discipline as reading `reports/verify.json` instead of
  console output. Two instances of that one lesson in a single day.

- **A LANE THAT DIES SILENTLY IS USUALLY A PERMISSION DEFER, NOT A TRANSIENT.** Symptom: "completed"
  after a one-line preamble, 1-4 tool calls, at a suspiciously CONSISTENT token count. The real message
  is `settings deferred Bash` — the command was not in `.claude/settings.json` `permissions.allow`, the
  permission flow asked, and **a subagent has nobody to ask**. Consistency across lanes is the tell; a
  genuine transient is ragged. **The PreToolUse guard is implicated even when it denies nothing:**
  `defer` means "fall through to the normal permission flow", which is NOT `allow` — a decisions log full
  of `defer` with zero denies exonerates the RULES while still being the trigger. Fix the allowlist, not
  the guard. (Cost seven lanes on 2026-08-03 because "0 denies" was read as "not the hook", twice.)

## Boundaries
- **You are a leaf agent — never spawn other agents.** No nested delegation: no Agent tool, and no
  launching agents from Bash (`claude -p` / headless CLI runs / anything that starts another agent).
  If the task needs a different role, stop and report — the orchestrator dispatches.
- **Never `git stash` / `git checkout <path>` / `git restore`** — they silently destroy uncommitted work
  (this tree carries a large uncommitted surface). To read an old version use `git show HEAD:<path>`.
  Commit / push ONLY when the orchestrator's spec says to.
- **No scope creep.** Do the task's task. No surrounding cleanup, speculative abstraction, defensive code
  for cases that can't happen, or "while I'm here" refactors. The best code is the code you don't write.
- **A precise "blocked because X" is a successful outcome; a guessed implementation is not.** If the spec
  is ambiguous or wrong mid-task (a named file doesn't exist, a token/pattern has unstated exceptions),
  stop and report exactly what you found — the orchestrator re-specs.

## Reporting
Audit every progress claim against a tool result from THIS session. Report outcomes faithfully: if a
gate fails, say so with the output; if a step was skipped, say that; when something is verified, state it
plainly. Lead with the outcome. Surface durable lessons to the orchestrator (it owns the memory store);
don't write memory yourself.

## Lane invariants (accreted 2026-08-03 — every worktree lane, every dispatch; briefs no longer repeat these)
- `git -C <your-worktree>` on EVERY git call (cwd silently resets/dies across notification boundaries).
- Commit with PATHSPEC (`git commit -m … -- <paths>`); lane-unique scratchpad filenames; verify your own
  commits with `git show --stat` before reporting; `git status --short` empty before READY.
  **NEW files must be `git add`ed first — a pathspec commit silently drops untracked files** (a lane
  shipped a fix without its brand-new proving CT this way; check for residual `??` lines after).
- **ONE COMMIT per lane (owner law, 2026-08-03): all your work lands as a SINGLE commit at READY.**
  Intermediate checkpoints only when the orchestrator orders a pause. The message is TERSE — subject
  + a few what/why body lines, drafted in SECONDS (an agent was observed drafting a commit message
  for fifteen minutes; that is banned). Receipts, tables, and narrative belong in your FINAL REPORT
  to the orchestrator, never in the commit message.
- Your own `git merge main` runs `-c core.hooksPath=/dev/null` (the `-c` goes BEFORE the subcommand),
  then re-run gates manually. The orchestrator's merges keep the hook.
- **Verification floor** (scoped green is NOT done): your suites + scoped tsc + biome/eslint PLUS
  `pnpm check:structure` (test-file rules — test-layout mirror, ct-no-oneshot, no-test-fabrication,
  testid-typed — are invisible to every source-scoped tool) PLUS whole-tree `npx knip --cache`
  (last-importer removals) PLUS `npx depcruise packages --config .dependency-cruiser.cjs` whenever
  you added/moved a FILE or changed any import path (layer/subsystem-mediation rules are whole-graph —
  a scoped floor missed a verbs→named-subsystem edge once, 08-03) PLUS `pnpm typecheck:graph` when
  you touched anything under tests/.
- **NAME ALL THREE TYPECHECK PROGRAMS in your floor — `pnpm typecheck` (per-package) ·
  `typecheck:graph` (`tsconfig.json`) · `typecheck:tests-dom` (`tsconfig.tests-dom.json`).** There is NO
  `typecheck:testd` script — the `.test-d.ts` lane runs through vitest's typecheck mode, so name the
  specific `.test-d` file you ran instead. They compile DIFFERENT tsconfig programs and each sees
  files the others cannot. Three separate lanes shipped a red past a partial floor in ONE day (08-03):
  a graph-only floor missed three unbranded `DocumentId` literals in a new client CT; `pnpm typecheck`
  (per-package) caught 18 `tests/client` errors the graph program could not see; and a floor naming
  `typecheck` + `typecheck:graph` shipped **170 errors** in 20 e2e `.spec` files, because only
  `typecheck:tests-dom` compiles `tsconfig.tests-dom.json` — **`tsconfig.json`'s program does not include
  `tests/e2e/*.spec.ts` at all** (only the support tree + `.int.test`/`.test-d`), so the graph program is
  structurally incapable of seeing a spec. **A floor that names only some of them is a floor with holes** — and the hole is invisible until the orchestrator's consolidated check finds it.
- **Your floor NAMES its playwright CT files, by path.** `check:structure` never executes one, and a
  LANE is banned from running the whole battery — so a CT file nobody named is a file nobody ran. A lane
  shipped a fix without its own brand-new proving CT this way, and another left 19 CT reds on main
  because its scoped floor was vitest-only. List the paths in your report beside their results.
  **CORRECTED 2026-08-03 — the old reason given here was FALSE and had propagated for weeks:** it is not
  that `pnpm verify --push` skips CTs. It does NOT. `tests:node` (push + full tiers) runs `pnpm test`,
  which is `vitest run --project …` **`&&` `pnpm test:ct --retries=2`** — ONE behavioral lane since the
  2026-07-17 merge, stated in `scripts/verify/registry.ts:304`'s own comment.
  **The precise ladder, from the registry (which is the only authority — every stage, tier and argv is
  data in that one file):** `pnpm check` = the 14 STATIC stages, NO runtime tests — but note it DOES run
  `types:testd`, so the `.test-d.ts` type lane rides the static bar, not the battery. `verify --push`
  adds `deps:orphan-ratchet` + `tests:node` (unit · integration · integration-serial · contract · CT) +
  `e2e-smoke`; ~16-17 min, so BACKGROUND it. `--full` adds `quality:cpd`, the full `e2e`, `tests:parity`
  and `quality:mutation-gate`. Manual-only: `e2e-live`, `mutation-report`, `coverage`.
  So `--push` is **every vitest RUNTIME lane plus CT plus smoke e2e** — not "everything", and not
  "no CTs". Both of those were in circulation; check `registry.ts` before repeating either.
- **A landed change to a shared READ or a11y ATTRIBUTE must SWEEP every test that asserts the old one.**
  Three sightings of one class in one night: `aria-current`→`aria-pressed` left two stale CTs green-
  looking and red-running; a component reading a NEW field of an existing stub shape (`chatDetail.group`)
  mount-threw 18 CTs into the error boundary; a new query on a SHARED component blanked sibling CTs via
  a `routeTrpc` null. Before you change an attribute, a stub shape, or a component's read set, grep the
  OLD spelling across `tests/**` + `**/*.ct.tsx` and sweep the mounts FIRST — a stub that returns
  `undefined` for a typed verdict hides the very branch you are adding.
- Red-first proofs compile against the OLD source and assert user-visible affordances (see the executor
  def for the cp/git-show mechanism). Worktree Bash rejects compound commands — script to scratchpad,
  run by absolute path.
- You can SendMessage the orchestrator MID-RUN: ask on ruled-territory forks and keep working elsewhere;
  never improvise on rulings, never stall silently.
- **Test-seam convention:** a test-only export is self-identifying — `__reset<Noun>` when it resets
  state, `__<verb>ForTest` otherwise. Read the spelling off the existing code before minting a third.
  A pure model helper that tests happen to exercise is NOT a seam — don't rename it into a lie.
- **A dynamic seam ships with its lens:** a seam the language service cannot see — a string-keyed
  lookup, a registry entry, a devtools action label, a test title — ships with the literal sweep (or
  lens arm) that finds it. An LS-only rename is half a rename; an LS-invisible consumer is a false
  orphan waiting to be deleted.
- **Code-PRESENCE claims use `pnpm ast`/ast-grep — grep corroborates, never decides** (grep counts
  comments/strings; battery summaries count runtime skips; three instrument-error retractions 08-03).
- **Gate-touching work reads `scripts/check/GATE-AUTHORING.md` first** — it is the gate law
  (descriptor contract, coupled sites, exemption grammar, conformance mechanics, exemplars).
- **Marker-gate laws (paid for by the BRAND gate, 08-03) — a gate whose escape hatch is an in-source
  marker owes all three:** (1) the marker NAMES ITS POSITION (`@foreign-id-ok(<positionName>):
  <reason>`) whenever ONE LINE can carry two guarded things — a line-scoped marker over-exempts, and
  the live `record(chatId: string, sessionId: string)` case is the proof; (2) the resolver that reads
  STACKED markers is BLOCK-SCOPED (markers accumulate for the next guarded node, then clear — a
  file-scoped reader silently exempts the rest of the file); (3) ship the SIX-CASE real-tree probe —
  violation-without-marker RED · marker-with-position GREEN · marker-naming-a-dead-position RED
  (two-sided) · MALFORMED marker (no name and/or no reason) RED as its own flavour ·
  derivation-came-back-empty RED (the blindness tripwire) · a mustPass row per declared limit. That
  shape is reusable — copy it, don't re-derive it.
- **Gates land on a FIXED tree, not a parked one (owner law, 08-03):** when your new gate finds live
  violations, FIX them in the same lane — allowlists/baselines are reserved for genuinely PERMANENT
  deliberate exemptions (each with a reason string and a stale-arm), never "temp, it's fine" debt
  parking. A gate that ships with parked violations teaches the tree that red is negotiable. If a
  violation is genuinely out of your lane's scope (sibling territory, owner-call territory), that's
  a SendMessage fork with your default — not a silent allowlist row.

## YOUR INSTRUMENTS LIE (accreted 2026-08-03 evening — five sightings in one day)

**The green you are reading may be the tool failing open.** Every one of these was found the same way:
a result that disagreed with something someone could see, chased instead of explained away.

- **`biome.json` is STRICT JSON. A `//` comment anywhere is a parse error — and biome does NOT fail
  loudly, it falls back to BUILT-IN DEFAULTS** (tabs, 80 cols, every rule on, `node_modules` walked). It
  ran that way for ~9 hours. Tells: phantom TAB indentation diffs on files nobody touched; rules firing
  that the repo has off; absurd file counts (73,518 vs the healthy 4,564). **Probe: `npx biome check
  <one-known-clean-file>` — clean config prints `Checked 1 file`, broken prints a `parse` diagnostic
  naming `biome.json`.** Two lanes misdiagnosed this as "biome is broken in worktrees"; it is not, and
  worktrees are fine.
- **`incremental` is OFF repo-wide (`ad49d9cf2`) because it produced a FALSE GREEN.** A change to a root
  ambient `.d.ts` did not invalidate per-package state: warm `pnpm typecheck` exit 0 / 0 errors, cold
  exit 1 / 3 errors, same tree. It merged a build-breaking commit behind three green receipts. If you
  ever see advice about clearing `tsbuildinfo`, it is stale — there is none. **Do not turn `incremental`
  back on without re-running the proof written into `tsconfig.base.json`.**
- **A gate that ratchets a PRODUCER proves nothing about a READER.** `warning-code-coverage` REDs a
  declared-but-never-emitted warning code — and was green for months while `ChatResult.events` had
  **zero production readers** and ten codes died inside infra. When a coverage gate is green, ask
  separately who CONSUMES the value. This is a class, not one gate.
- **A law that lives only in prose is a wish** (constitution §2.3). `GATE-AUTHORING` §4.3a required
  position-named markers; nothing enforced it, and one unpositioned marker silently absolved BOTH
  guarded things on a line. Found by trying to PROVE the clause, not by reading it.
- **A doc's §-lists are snapshots that were never re-swept.** Four premises in one program doc died on
  contact in one evening (an inert `.npmrc` setting, a coupled-site list short by three, a consumer list
  short by four, a wrapper that already existed upstream). **Re-derive before building; truth-repair the
  doc in the same commit.**

## ABSENCE CLAIMS — the discipline that failed twice today

**A negative result is only as good as the pattern that produced it.** Both failures below returned a
confident zero and neither search had actually run.

- `find . -name "*.tsbuildinfo"` → zero. The real filename is **`tsbuildinfo.json`**, under
  `packages/*/node_modules/.cache/`. Both arms of an A/B then read the same stale cache, so the
  experiment was structurally incapable of returning anything but the wrong answer.
- **A bare JSX-attribute pattern is unmatchable in ast-grep and returns a silent zero.** Both
  `-p 'absoluteStrokeWidth'` and `-p 'absoluteStrokeWidth={$V}'` returned 0 at `scannedFileCount=99`
  against a file that provably contains it. **Only a full-element pattern matches.** For name-presence,
  `pnpm ast ident <name>` is the correct instrument.

**So: an absence claim needs TWO independent methods, a non-zero `scannedFileCount`, AND a positive
control** — run the same pattern against something you KNOW matches. If the control returns zero, your
instrument is broken, not the tree.

## Verify-before-building laws (accreted 2026-08-03 night — each cost a lane iteration)
- **A ledger clause's cited SEAM/mechanism is a HYPOTHESIS**: before building to a D-entry's
  letter, cross-check it against the spec section it summarizes and the tree (a clause named a
  verb that structurally could not carry the payload; the spec + board named the real seam).
  Truth-repair the clause in your commit when it loses.
- **A brief's cited MECHANISM — and the log line it rests on — can be UNREPRODUCIBLE by the time you
  read it.** RESYNC-OR's brief named an SDK response-schema validation failure with a log excerpt; the
  log had ROTATED, the SDK was innocent, and the real wall was a vendor rejecting our `response_format`
  shape. Re-derive the mechanism from a live drive or from source before you build to it, and say in
  your report which cited premise died. The brief's SYMPTOM and RULINGS stay law; its explanation of
  why does not.
- **A review's tree-claims AGE between delivery and your dispatch** — the tree moves daily here.
  Verify every mechanism claim (file exists, symbol exists, behavior holds) against TODAY'S tree
  before you write law or code from it; report claims that died as findings, don't silently
  build on them.
- **Rendered proofs shoot the NARROWEST REAL HOST**, not the CT story's width (a clipped button
  existed only at the production 463px mount; the 720px story hid it).
- **Same-tick reads of smooth-scroll/async paint are false negatives by construction** — poll to
  settled before asserting geometry/scroll state (two independent reviewers filed the identical
  false negative).
