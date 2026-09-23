---
kind: history
status: archived
updated: 2026-09-01
---

# Agent doctrine + always-loaded rules — the narrative removed on 2026-09-01 (#1056)

> **Frozen record, not law.** These are the dated incidents, measurements, receipts and procedure
> blocks that were carried inside the always-loaded instruction set until 2026-09-01, when #1056
> compacted that set to one rule line per section (the classification rule and the load arithmetic are
> `docs/reviews/stickler/2026-09-01-law-doc-memory-truth-audit.md` §A.1/§C). The RULES survive, in the
> live files, unchanged in meaning; the story survives here. Every block below is VERBATIM as it stood
> at commit `02adf9cf1`, with its former file:line range in the heading.
>
> Read this only when a live rule's edge case is unclear and you want the incident that minted it. The
> live homes are `.claude/agent-doctrine.md`, `.claude/rules/*.md`, `docs/architecture/core/AGENTS.md`
> §L, and — for the lesson-shaped halves — the shared agent memory store.

## 1. `.claude/agent-doctrine.md` — the search-tool manual (was `:61-131`)

```
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
  - **`tooling/src/codemod/` (`pnpm codemod`; the ts-morph kit, ex-scripts/codemods/codemod-kit.ts) BEFORE you hand-edit a repeated shape or write your own
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

```

## 2. `.claude/agent-doctrine.md` — the push window (was `:136-143`)

```
- **NEVER commit while a `git push` is running, and never trust the push's summary line.** Measured
  2026-08-03: our pre-push hook is `pnpm verify --push` (~17 min), and git resolves the ref to push at
  INVOCATION but transfers the ref's value at TRANSFER time. A commit made inside that window ships
  silently, and git prints the range it computed 17 minutes earlier — so the output actively misreports
  what went to origin. It cost a confused investigation and a wrong accusation of an innocent lane.
  **Verify a push against the SERVER** (`git ls-remote origin refs/heads/main`, or the GitHub API's push
  events), never the console summary — the same discipline as reading `reports/verify.json` instead of
  console output. Two instances of that one lesson in a single day.

```

## 3. `.claude/agent-doctrine.md` — the permission-defer death (was `:145-152`)

```
- **A LANE THAT DIES SILENTLY IS USUALLY A PERMISSION DEFER, NOT A TRANSIENT.** Symptom: "completed"
  after a one-line preamble, 1-4 tool calls, at a suspiciously CONSISTENT token count. The real message
  is `settings deferred Bash` — the command was not in `.claude/settings.json` `permissions.allow`, the
  permission flow asked, and **a subagent has nobody to ask**. Consistency across lanes is the tell; a
  genuine transient is ragged. **The PreToolUse guard is implicated even when it denies nothing:**
  `defer` means "fall through to the normal permission flow", which is NOT `allow` — a decisions log full
  of `defer` with zero denies exonerates the RULES while still being the trigger. Fix the allowlist, not
  the guard. (Cost seven lanes on 2026-08-03 because "0 denies" was read as "not the hook", twice.)

```

## 4. `.claude/agent-doctrine.md` — lane invariants, accreted 2026-08-03 (was `:173-256`)

```
## Lane invariants (accreted 2026-08-03 — every worktree lane, every dispatch; briefs no longer repeat these)
- `git -C <your-worktree>` on EVERY git call (cwd silently resets/dies across notification boundaries).
- Staging is ruled in `.claude/rules/lane-standing-facts.md` §Staging and commits — pathspec on `main`
  or any SHARED tree, `git add -A` in your own isolated worktree (a pathspec commit silently drops
  untracked files). Lane-unique scratchpad filenames; verify your own commits with `git show --stat`
  before reporting; `git status --short` empty before READY.
- **ONE COMMIT per lane (owner law, 2026-08-03): all your work lands as a SINGLE commit at READY.**
  Intermediate checkpoints only when the orchestrator orders a pause. The message is TERSE — subject
  + a few what/why body lines, drafted in SECONDS (an agent was observed drafting a commit message
  for fifteen minutes; that is banned). Receipts, tables, and narrative belong in your FINAL REPORT
  to the orchestrator, never in the commit message.
- Your own `git merge main` runs `-c core.hooksPath=/dev/null` (the `-c` goes BEFORE the subcommand),
  then re-run gates manually. The orchestrator's merges keep the hook.
- **Verification floor** (scoped green is NOT done): your suites + scoped tsc + biome/eslint PLUS
  `pnpm check:structure` (test-file rules — test-layout mirror, ct-no-oneshot-live-read-assert,
  no-test-fabrication, testid-typed-only — are invisible to every source-scoped tool) PLUS whole-tree
  `pnpm knip` (last-importer removals) PLUS `pnpm depcruise` whenever
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
  `tests/e2e/` at all** (its program is all of `tests/` MINUS the excludes — `tests/e2e` whole, plus the
  `tests/{ui,client,support/ct}/**/*.tsx` directories), so the graph program is
  structurally incapable of seeing a spec. **A floor that names only some of them is a floor with holes** — and the hole is invisible until the orchestrator's consolidated check finds it.
- **Your floor NAMES its playwright CT files, by path.** `check:structure` never executes one, and a
  LANE is banned from running the whole battery — so a CT file nobody named is a file nobody ran. A lane
  shipped a fix without its own brand-new proving CT this way, and another left 19 CT reds on main
  because its scoped floor was vitest-only. List the paths in your report beside their results.
  **CORRECTED 2026-08-03 — the old reason given here was FALSE and had propagated for weeks:** it is not
  that `pnpm verify --push` skips CTs. It does NOT. `tests:node` (push + full tiers) runs `pnpm test`,
  which is `vitest run --project …` **`&&` `pnpm test:ct --retries=2`** — ONE behavioral lane, stated in
  the `tests:node` row of `tooling/src/verify/lib/registry.ts`.
  **The tier ladder is DATA, never prose — every restatement of it here has drifted. Read it from
  `pnpm verify --list`** (every stage, tier and argv is data in that one registry file). The two
  standing facts that are NOT in the listing: `pnpm check` = the static tier, NO runtime tests — but it
  DOES run `types:testd`, so the `.test-d.ts` type lane rides the static bar, not the battery; and
  `--push` takes ~16-17 min, so BACKGROUND it.
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
- **Gate-touching work reads `tooling/src/verify/gates/GATE-AUTHORING.md` first** — it is the gate law
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

```

## 5. `.claude/agent-doctrine.md` — YOUR INSTRUMENTS LIE + ABSENCE CLAIMS (was `:258-303`)

```
## YOUR INSTRUMENTS LIE (accreted 2026-08-03 evening — five sightings in one day)

**The green you are reading may be the tool failing open.** Every one of these was found the same way:
a result that disagreed with something someone could see, chased instead of explained away.

- **`biome.json` is STRICT JSON. A `//` comment anywhere is a parse error — and biome does NOT fail
  loudly, it falls back to BUILT-IN DEFAULTS** (tabs, 80 cols, every rule on, `node_modules` walked). It
  ran that way for ~9 hours. Tells: phantom TAB indentation diffs on files nobody touched; rules firing
  that the repo has off; absurd file counts (73,518 vs the healthy 4,564). **Probe: `pnpm exec biome check
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

- `find . -name "*.tsbuildinfo"` → zero, back when `incremental` was still on: the real filename WAS
  **`tsbuildinfo.json`**, under `packages/*/node_modules/.cache/`, so both arms of an A/B read the same
  stale cache and the experiment could not return anything but the wrong answer. (`incremental` is off
  repo-wide today — there is no such file now; the LESSON is the wrong-glob silent zero.)
- **A bare JSX-attribute pattern is unmatchable in ast-grep and returns a silent zero.** Both
  `-p 'absoluteStrokeWidth'` and `-p 'absoluteStrokeWidth={$V}'` returned 0 at `scannedFileCount=99`
  against a file that provably contains it. **Only a full-element pattern matches.** For name-presence,
  `pnpm ast ident <name>` is the correct instrument.

**So: an absence claim needs TWO independent methods, a non-zero `scannedFileCount`, AND a positive
control** — run the same pattern against something you KNOW matches. If the control returns zero, your
instrument is broken, not the tree.

```

## 6. `.claude/agent-doctrine.md` — verify-before-building laws (was `:305-324`)

```
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

```

## 7. `.claude/agent-doctrine.md` — minted 2026-08-08, 2026-08-07, 2026-08-07 late, overnight (was `:326-475`)

```
## Minted 2026-08-08 (the Base UI + dogfood double campaign)

- **UI lanes: measure every Row/selection-bar/band at its NARROWEST real production mount before
  READY.** Six receipts in one night (persona row 358px, theme band 256px, bulk bar 330px ×2,
  model-roles hint, menu gutter): a `shrink-0` trailing cluster sized in a wide context is the
  repo's most common rendered defect. A CT at the narrowest mount needs a FIXED-width container
  (`overflow: visible`) — the content-sized mount root agrees with the bug.
- **Any new walk-fence, exclude, or instrument in your floor requires a planted-POSITIVE-control
  receipt** — create the thing the fence should catch, show it caught, rm it. A zero from an
  unprobed instrument is not a result.
- **When your work invalidates a sibling lane's premise mid-flight, SendMessage the orchestrator
  immediately** — two premise-deaths this campaign (field-control-registration, ScrollUpArrow)
  saved sibling lanes from building against dead specs because the finder spoke up before landing.


## Minted 2026-08-07 (the identity-spine + fork-security + phone-composition day)

**Shared-box hygiene — a lane can damage a sibling from inside its own worktree.**

- **NEVER `pkill` BY PROCESS NAME.** A bare `pkill -f headless_shell` to stop your own CT suite
  kills EVERY playwright browser on the machine, including a sibling's live run. Kill your own
  PGID, or scope to your own invocation — and note that even `pkill -f "playwright test -c
  playwright-ct.config.ts"` is too broad when siblings run the same config. If you do hit a
  sibling, SendMessage the orchestrator IMMEDIATELY with the timestamp: a mass CT failure with no
  cause is exactly what a real defect looks like, and the next lane will burn hours on the phantom.
- **Probe/harness files live in the session scratchpad, NEVER in the repo tree.** In-tree probes
  get swept up by any whole-tree instrument a sibling runs — five `zz*` specs red-flagged a full
  battery and cost a relaunch.
- **Anything over ~10 minutes launches OUTSIDE the task manager** (`setsid nohup … </dev/null &
  disown`) with its exit code landed in a `.exit` file, and you poll by READING the log. A
  foreground poll that hits its timeout becomes a background task and EVICTS THE OLDEST one — which
  is the long run you were watching. Two hour-long runs died at ~93% this way, looking exactly like
  a crash near the end.

**Read the contract before you fix the symptom.**

- The best fixes this day came from reading something the brief never mentioned: a NOT_FOUND that
  looked like noise was a **deliberate leak-free collapse** (a non-member and a no-game chat get
  the identical error so a foreigner learns nothing) — so the fix belonged at the caller, not the
  verb. A brief's "build a record-emitting mode beside X" died on line 67 of an unmentioned file
  (ONE per-turn registry serves BOTH hops, so a sink in its closure pools one row's data onto
  another's). **A file header, a guard's comment, or a schema note routinely contains the ruling
  your brief is about to violate.**
- **A prescription that names an affordance is a claim about the product — check it.** A brief said
  an error should tell users to "duplicate it"; Duplicate does not exist for that row class. Shipping
  it would have been a new defect one screen over. Deviate with the receipt.

**Proof discipline.**

- **A green-before test needs a PLANTED POSITIVE CONTROL before you trust it.** Plant the violation
  the assertion should catch, watch it red, restore. A green test that cannot fail is not evidence.
- **Demote your own pin honestly.** If a test passes pre-fix, it is a FENCE (a regression guard),
  not a defect proof — relabel it and name the pin that actually proves the defect. One lane did
  this three legs running; that is the behaviour, not a weakness.
- **Hit areas need `elementFromPoint` at offsets from the centre, never a bounding box.** A
  variant carrying its touch floor in an overflowing `::after` collides with the row below and a
  box assertion sees nothing — measured: aiming at one control committed another.
- **Mobile geometry needs REAL coarse-pointer emulation.** A narrow viewport renders a fine-pointer
  layout no phone produces; a reviewer nearly filed a false P1 on tap targets that the app sizes
  correctly at `pointer: coarse`.
- **Verify a fix at the seam the DEFECT was reported at**, not only at the unit. A fold fix passed
  its unit pin three times while the production applier shape kept resurrecting data.

**Deliverables.**

- **Authored text goes in a FILE, not in your report.** A D-entry that lived only in a lane's report
  had to be re-derived from the tree weeks later — `reports/` is ephemera. Write specs, drafted
  ledger entries, per-column classifications and owner-facing copy to `docs/…` and CITE the path.
- **Re-creating a test file at a previously-deleted path is a coupled site** — the test-baseline
  `deletions` ledger keeps a record that becomes a lie AND pre-authorizes the next delete. Only
  `check:structure` sees it.

## Minted 2026-08-07 (late) — two more from the identity day

- **Deleting an exemption row is a COUPLED-SITE edit.** A gate's `DEFERRED`/allowlist entry has
  siblings written against it — its own `mustFlag`/`mustPass` conformance rows and any planted
  fixture. Removing the row (even when the gate itself TELLS you to) orphans them, and
  `pnpm check` will not notice: the conformance suite is a **vitest** test, not a structure gate.
  Delete the row, retarget the proofs, run BOTH `check:structure` and the two tooling suites.
- **A live drive finds what tests structurally cannot: what the MODEL RECEIVES.** Every test asserts
  what the code does. Driving one narrator round showed the system prompt naming one character seven
  times, the co-speaker **zero** times, and opening "write X's perspective only" — the feature worked
  only because the model inferred a character it was never given. No unit or CT can see that; it is
  not a wrong value, it is an absent one, in a prompt nobody asserts on.

### An absence receipt must be scoped to where the LAW puts the thing (2026-08-07, lane DATABANK-S2)

A board row said the D85 host-visibility toggle was "still unbuilt" and backed it with a receipt: an
exhaustive listing of `databank/verbs/` showing no visibility setter. The listing was accurate. The
conclusion was false — D85 homes that override in **chat**, not databank, and the whole feature had
shipped: host-gated write verb, strict schema parse, enforcement subtracting hidden ids from the union,
contract, client affordance.

**An exhaustive listing of the wrong directory reads exactly like proof.** It has a method, a scope, and
a complete enumeration; it just answers a question nobody asked.

- A row citing an ABSENCE owes its **scope** as well as its method, and the scope is decided by the LAW,
  not by the domain whose name appears in the feature's title. Cross-domain overrides live where the
  precedent puts them.
- Before writing "X is unbuilt", read the D-entry that governs X and check the home it names. One
  `git show` of the ledger would have killed this row.
- The corollary for dispatch: when a brief hands a lane an absence receipt, say which directory was
  searched and why THAT directory is where the thing would be. If you can't justify the scope, the row
  is a lead, not a row.

### "Declare the limit" is a partial fix wearing a receipt's clothes (2026-08-07, owner correction)

Owner, verbatim: **"we are the do things right the first time club even if it means more work."**

I briefed three lanes with an escape hatch and did not notice I had done it three times:
- a gate lane: *"extend the reach where it's cheap, declare the rest"* — for four write shapes that were
  all resolvable with the ts-morph machinery the gate ALREADY contained, one of them a live idiom with
  20+ call sites;
- an assembly lane: *"report your recommendation"* on a new inconsistency that lane's own change had
  introduced;
- a security lane: *"either gate it or state the asymmetry"* on a uniformity claim that was false.

Each reads like rigor. Each is the same move: converting work into a sentence.

**The tell is the justification.** A declared limit is legitimate when the thing is genuinely out of
reach — "`tests/**` is outside scanRoot because scanning it would red the gate's own proofs" is a real
limit with a real reason. **"I could resolve this but it's more work" is not a limit, it's a decision,
and writing it down doesn't make it a receipt.** A documented blind spot on a live idiom is a gate that
stays silent on the next real defect while reading as covered.

Related orchestrator failure in the same session: I said an urgent finding was **"routed to its own
lane"** three separate times, in three messages, without ever dispatching it. Saying where work belongs
is not the same as sending it. **Grep your own outbound claims for "routed", "boarded", "queued" — then
verify each one against the dispatch results**, the same way a board row owes its evidence method.

**Fix the class, not the instance the reviewer happened to probe.** When a verifier finds one site of an
asymmetry, ask what else shares its shape before scoping the leg.

## Minted 2026-08-07 (overnight) — the verify step is not optional

- **`pnpm check` is STATIC — it NEVER runs `tests:node` (the vitest projects + the CTs).** A green
  `pnpm check` is NOT the behavioral tier and is NOT "done". A change that alters a SHARED VALUE other
  code references by literal — an enum/allowlist member, a user-facing label or menu item, a wire field
  name — hides a stale coupled fixture in a suite you never thought to open, and static will not see it.
  Proven twice in one night: a dropped `SUMMARIZE_SOURCES` member left a stale fixture in the
  *routing-coherence* int-suite (the `.catch(undefined)` schema HEALED the bad value to `undefined`, so
  the failure read as a cryptic `expected undefined to be '…'`); a renamed row-kebab menu item left a CT
  asserting the OLD label. Both were invisible to `pnpm check` AND to a targeted verifier that swept only
  the suites it expected to be coupled.
- **When you change such a value, RUN the CT/integration suites that assert it — and repo-wide-grep the
  literal across `tests/` for a coupled fixture in an unrelated suite.** Name BOTH the suites you ran and
  the coupled sites you checked. **"No CT" is a claim you owe a grep for, not a default** — the lane that
  renamed a menu item and reported "No CT" was wrong; a CT asserted that exact label.
- **`pnpm check` green + a targeted verifier CONFIRMED is not a substitute for the tier the change lives
  in.** Verify at the tier where the coupled assertion lives, not one below it.

```

## 8. `.claude/agent-doctrine.md` — the code-recon evidence ladder copy (was `:477-487`)

```
## Code recon — evidence standards (baked in from the code-recon skill, 2026-08-07)

The repo's thesis is "everything must be proven." Recon fails in three ways that all LOOK like success — internalize these; do not wait for a skill to be invoked.

- **A file or name existing is NOT evidence it is implemented.** Ladder, weakest→strongest: path exists < name matches the concept < symbol declared (`ast-grep outline`) < exported < imported elsewhere < a call site in a live path < a test asserts it. **Never report a rung you did not climb** — "`session.ts` exists and exports `createSession`, but nothing imports it" is a finding; "sessions work" is a claim you did not verify.
- **No matches is NOT absence.** `ast-grep run` exits 1 on no-match AND on wrong-language / wrong-path / ignored-dir — identical exits. Before ANY negative claim, print the scanned count (`--inspect summary` → `scannedFileCount`); `0` means "I could not search", never "not found". A negative claim owes the scanned-count receipt PLUS a second method (a literal `rg`, or `pnpm ast`).
- **`-l ts` and `-l tsx` are DIFFERENT languages — run BOTH and merge.** `-l ts` scans `.ts`/`.mts` and NOT `.tsx`; `-l tsx` scans `.tsx` only. A single-language sweep of a mixed tree is a bug unless you proved it homogeneous. And a property read has THREE node kinds — `$X.foo`, `$X?.foo`, `$X["foo"]` — so a dot-only sweep is a false clean (measured this session: reported 0 where 4 real optional-chained readers existed). Destructuring and aliased re-exports are more shapes still.
- **`tree -L` lies** — it truncates silently AND its trailing "N directories, M files" counts only what it PRINTED (a 150× undercount, read as a total). Use `tree -d --gitignore` (unlimited depth) or `git ls-files` for an inventory; probe depth with a histogram before choosing `-L`.
- **Partial reads are for LOCATING, not CONCLUDING.** Read the WHOLE file before stating something is or is not handled: a grep hit inside a dead branch is a false positive invisible from the hit, and absence (no error handling, no `await`, no cleanup) is invisible in an excerpt by construction. Files under ~400 lines: just read them.
- **Filter with the tool's own flags, never `| head` / `| grep`** — a piped view is silently truncated and reads exactly like a complete answer (the same failure class as `scannedFileCount=0`). Use `--match` / `--type` / `--globs` / `-C`. Bounding output is fine only if you SAY it was a sample, and a sample never supports a whole-tree claim.
- **Every load-bearing claim carries its receipt**: `path:line` + the command that found it, what you covered, what you excluded, and what would change the answer. A hedge ("I did not verify X") is honest only when the check was expensive — not when one command you already ran for a sibling case would have settled it.

```

## 9. `.claude/rules/orchestration.md` — the pre-trim body (was `:1-236`)

```
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
- **NEVER a lone board call, and never one call per row (#870).** `pnpm work:item file --title <t>
  --kind <class> --priority P --area A --review R [--claim <lane>]` opens a row in ONE call and
  `land <issue…> --evidence <sha> [--lane <x>]` closes N of them in one; every lifecycle verb and
  `show` take a LIST of ids. Fold board writes into the merge chain and brief lanes with the issue
  TEXT rather than sending them to `gh issue view`. The measured cost of the old choreography was a
  median of 3 calls per row, 7.3% of the orchestrator's tool-turn context.
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
- **A ROUTER-TOUCHING merge's floor includes the cross-tenant sweep suite** (paid 2026-08-24: C5
  added three procs, its lane floor and the orchestrator's merge floor both omitted
  `tests/server/transport/cross-tenant-sweep.suite.int.test.ts`, and main sat red on the
  completeness guard until a sibling lane hit it). The `new-router-needs-sweep-classification`
  memory existed — the failure was the FLOOR not naming the suite. Any merge whose diff touches
  `transport/trpc/routers/**` runs the sweep before the ff.
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

```

## 10. `.claude/rules/lane-standing-facts.md` — the pre-trim body (was `:1-197`)

```
<!-- Split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane cb-agent-fleet). That file was
     389 lines, opened by telling every subagent to IGNORE it, and was injected into every lane
     regardless — so the facts lanes actually need were paying full context and then being suppressed.
     Nothing was deleted: orchestration.md kept the ORCHESTRATOR-ONLY policy, this file took everything
     that binds a working agent, and three path-scoped rules took the content that only matters when
     you touch their files. This file has NO `paths:` frontmatter, so it loads at launch for everyone.

     THE HOMES — do not merge them:
       · THIS FILE = facts that bind ANY agent doing work here (orchestrator included).
       · `.claude/rules/orchestration.md` = delegation/lane/merge/overnight POLICY, orchestrator-only.
       · `docs/architecture/core/AGENTS.md` §L = worktree-lane git discipline (its one home).
       · `.claude/rules/gates-and-tooling.md` · `browser-and-instruments.md` · `db-schema.md`
         = path-scoped, load when you read their files. The index below names them.
       · GitHub Project 1 = mutable CURRENT STATE.
     On conflict the constitution / D-ledger wins on law, Project wins on lifecycle. -->

# Standing facts (every agent — lanes: these bind you, briefs restate only DELTAS)

Promoted 2026-08-18, re-homed here 2026-08-24. Every one was paid for at least once. You get these
without being told per-brief.

## Load-scoped rules — read the one that matches what you are touching

These load automatically when you read a matching file. If you are working in one of these areas and
have not seen its rule yet, READ IT BY PATH before you edit:

| You are touching | Read |
| - | - |
| `tooling/src/verify/gates/**` · `tests/tooling/**` · any gate or instrument | `.claude/rules/gates-and-tooling.md` |
| `tests/**/*.ct.tsx` · `tests/e2e/**` · a rendered/browser probe | `.claude/rules/browser-and-instruments.md` |
| `packages/db/src/migrations/**` · the drizzle schema | `.claude/rules/db-schema.md` — **it drops the dev db; read it BEFORE you edit** |

## Staging and commits

- **Stage by PATHSPEC on `main` or any SHARED tree; `git add -A` is FINE in your own isolated
  worktree** (owner correction 2026-08-24 — do not read this as a blanket ban, the blanket version
  pushes worktree lanes into the worse failure). The two failure modes are opposite:
  - On a shared tree a broad `git add` sweeps whatever else is live into your commit. On 2026-08-24 it
    swept a review lane's in-flight probe of `tooling/src/verify/gates/bus-definition-belts.ts` into a
    commit and shipped a BLINDED gate — and a blinded gate reports green forever, so nothing
    downstream catches it. Name your paths.
  - In an isolated worktree the tree is yours, and `git commit -- <pathspec>` **silently skips
    UNTRACKED files** — a cited-but-never-committed deliverable is destroyed at teardown (§L.2, and it
    has happened). `git add -A` after sweeping your own scratch is the safer spelling there.
  - Either way: `git status --short` EMPTY before you report, and `git show --stat <sha>` in the report.
- **Read your own diff before you commit.** An Edit inserting a declaration directly above another
  lands BETWEEN that declaration and its JSDoc, silently re-parenting the doc block — invisible to
  biome, tsc, the gates and the suites. Anchor insertions on the opening `/**`, and read
  `git show --stat` on your own commit (it is also what catches an unstaged deliverable and a
  `Bin` byte-count on a `.ts`/`.tsx` = a NUL slipped into a template literal).
- **Probes**: `cp f f.bak; …; mv f.bak f` or `git show HEAD:<path>` — NEVER `git stash`/`checkout`/
  `restore`. Red-first receipts run new pins against the UNMODIFIED source before any fix. If the probe
  edits a REAL file on a SHARED tree, SendMessage the orchestrator with the paths before you start and
  again when you have restored them.
- **Never run a whole-tree baseline/snapshot REGENERATOR on a shared or multi-lane tree** (the
  fabrication baseline, suppressions, `drizzle generate`): it recomputes from the WHOLE working
  tree and bakes a sibling's in-flight edits into your committed baseline. Hand-edit the single
  row, or use the gate's own escape marker (line-adjacent, like `biome-ignore`).
- **The two line-coupled ledgers now RED at `pnpm check`, not at the next whole node run** (#817,
  2026-08-30): the `ledgers:fresh` static stage re-derives
  `tooling/src/verify/gates/caught-failure-ownership.population.json` and `docs/test-baseline/manifest.json` and
  names the differing rows plus the regen command. So a lane that adds a TRACKED spec regenerates the
  manifest in its OWN worktree (`git add` the spec first — the derivation reads `git ls-files`), and a
  merge that shifts lines above a caught-failure marker is caught by the merge floor rather than hours
  later. On a SHARED tree the regenerator rule above still stands: re-derive on the merged tree at the
  barrier.

## Forks, rulings and premises

- **Fork-with-stated-default is the lane contract for recorded-ruling collisions.** A lane that hits a
  recorded ruling states the fork WITH receipts, prices the arms, names its default + deadline, and KEEPS
  WORKING on its other items. Never silently reverse a recorded ruling; never stall on it. The house
  resolution idiom when a ruling must evolve: **"the ruling survives — its INPUT changed"** (preserve the
  mechanism/text, change the condition, record both). Paid ~8× on 2026-08-19 alone, zero stalls.
- **Same-file parallel lanes are FINE when hunk regions are pre-declared through main.** Both lanes state
  their regions, NEITHER relocates hunks to dodge the merge (relocation is what breaks 3-way), and the
  orchestrator resolves by union. The failure mode is silent relocation, not the shared file.
- **A DATA-BINDING claim is re-derived, never remembered** — a brief or issue body asserting one owes a
  ledger grep first (the D58 lesson: "chats reference presets via turn settings" was written into an
  issue as fact when the ledger had already ruled the binding impossible and a gate already enforced it).
- **Seeded rows are never verification evidence, and a per-user-scoped empty read is evidence about
  WHICH PRINCIPAL asked** — not about whether the data exists. Verify against model-populated /
  real-principal state, and say which principal your receipt was taken as.

## Verification floors

- **Type floors run BOTH programs.** Per-package `types:packages` is structurally blind to `tests/`
  and `scripts/`; `types:graph` (`node scripts/ts7.cjs --noEmit -p tsconfig.json`) is the program
  that sees them. A lane changing a shared VALUE (enum member, wire field, user-facing label) also
  owes the behavioral suites that assert the literal — `pnpm check` is static and runs no tests.
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
- **A checker OOM / kill / timeout is exit-2 class — NEVER hand-wave it as load (owner ruling
  2026-08-21; ts7/depcruise/lens OOMs were being shrugged off for weeks).** Exit 134/137, a heap
  abort, or a wall-clock kill of tsc/depcruise/knip/eslint/a lens/the gate harness means THE RUN IS
  NOT A VERDICT: no green may be claimed from it, and "probably contention" is a hypothesis you
  prove by a quiet re-run, not a dismissal. The heap floor is WORKSPACE-WIDE: pnpm-workspace.yaml
  `nodeOptions: --max-old-space-size=16384` reaches every pnpm-run script (node's default self-cap is
  ~4GB even on the 128GB box); ts7.cjs carries the flag internally so bare `node scripts/ts7.cjs` gets
  it too. **`npx` NEVER carries the floor — that is the whole tool family, not a list of two.** MEASURED
  2026-08-27 by printing `process.env.NODE_OPTIONS` in the child: bare `node` unset · `npx` **unset** ·
  `pnpm exec` `--max-old-space-size=16384` · `pnpm run <script>` `--max-old-space-size=16384`. So
  `npx biome`, `npx playwright`, `npx depcruise`, `npx knip` and friends all run at node's ~4GB
  self-cap; so does a bare `node tooling/src/<tool>/cli.ts …` (paid 2026-08-23: two exit-134 OOMs on a
  bare structure run; the `pnpm check:structure` spelling picked up the floor and ran clean). **The
  spellings: a named pnpm script when one exists, else `pnpm exec <tool> …` — never `npx`.** Scoped
  biome is `pnpm exec biome check <paths> --diagnostic-level=error`; scoped CT is
  `pnpm ct:scoped <paths>` (it already carries BOTH the cache-clear and the nice — hand-rolling
  `rm -rf playwright/.cache && npx playwright test -c …` reproduces the script badly AND drops the
  floor). An OOM under THAT ceiling is a real finding to report, never to rerun-until-green.
  Run-completeness enforcement is #410.
- **A search, gate, or in-page sampler that reports nothing owes a PLANTED POSITIVE CONTROL in the same
  invocation**; a bare zero is "I couldn't measure", never "it isn't there".
- **A point measurement never proves a range property.** Layout/balance fixes owe the width matrix
  (both ends + any crossover) and the appearance arms BEFORE the arm is chosen; a single-width
  receipt endorsing a "move X" fix is the shell-game setup the owner has explicitly banned.

## Running suites without starving the box

- **Scoped test invocations go through the NICED pnpm scripts, never raw npx (2026-08-21 — raw npx
  bypasses the nice-19 priority that protects the co-hosted homelab):** node suites =
  `pnpm test:scoped <paths> --maxWorkers=4` · CT = `pnpm ct:scoped <paths> --workers=2` (it carries
  the cache-clear). Run from your worktree via `env -C` (never `cd`); your worktree's own
  node_modules + package.json serve the scripts.
- **The `--maxWorkers=4` / `--workers=2` cap applies whenever any sibling lane is live** (measured
  2026-08-21: one lane's default 14 forks at ~90% CPU each drove a 24-core box to load-avg 103 and
  STARVED THE CO-HOSTED HOMELAB — Authentik errored for the owner. The box is not ours alone;
  vitest.config's maxWorkers:14 is the DEDICATED-box number, briefs restate the cap). At load-avg 170
  the CT default worker count times out every test at `mount()` on pure contention — zero signal —
  while `--workers=2` came back green in 53s.
- **Long mutation/calibration runs are orchestrator-scheduled** — a lane never starts one without an
  explicit green light naming the concurrency.
- **Lanes NEVER busy-wait on a long run (usage ruling 2026-08-21, paid ~30% of a weekly cap in one
  day):** every sleep-loop poll re-bills cache reads on the lane's ENTIRE context — a 328k-context
  lane polling a 90-min calibration at 45s intervals burned millions of token-equivalents saying
  "not done yet". A lane that launches a >10-min detached run REPORTS AND STOPS (its report names
  the log/exit-file); the orchestrator picks up the completion and resumes the lane by SendMessage.
  **A finished subagent turn is NOT re-invoked by its own background jobs** (2026-08-30: a lane
  stopped twice "waiting for the notification" and had to be resumed by hand) — a run under ~10 min
  is redirected to a log and READ in a later call in the same turn, never backgrounded-and-waited-on.
- **The harness AUTO-WRITES its artifacts — read them, never pipe or re-run to find a failure:**
  `pnpm check` → `reports/verify.json` + `reports/verify/<stage>.log`; `pnpm test` →
  `reports/test-report.json`. A `| tail`/`| grep` on live output eats the failure list.
- **Those paths are `latest` POINTERS, not files a run writes in place (#1029).** Each run writes only
  inside `reports/runs/<instrument>/<checkout>-<pid>-<timestamp>/` and publishes the pointer atomically when
  it FINISHES, so concurrent runs on one checkout keep both verdicts. Read the same paths as always; when
  you need YOUR run, take the slot the run printed. Layout: `UNIFIED-VERIFICATION-DESIGN.md` §3.3b.

## The dev stack

- **The dev stack self-heals on source changes — do NOT flag routine "needs restart"** (law corrected
  2026-08-21; the old "vite prebundles workspace packages" fact died with 086c4e047). Workspace packages
  are SOURCE-consumed by vite (zero `@orb/*` in `.vite/deps`; probed live: a `packages/ui` edit HMR'd
  onto `:5173` with no restart); exports-map moves auto-restart vite via the `orb:workspace-exports-restart`
  plugin; the server auto-respawns via `node --watch` over server/contracts/db/kit src (warm engines
  re-adopted, seconds). The ONLY manual-restart triggers: `.env` edits, `pnpm install`/dep changes,
  supervisor-script (`stack.sh`/`dev.sh`) edits, engine-posture changes. When in doubt, prove the served
  module (`curl :5173/@fs/<abs path> | grep <symbol>`) instead of bouncing the stack.
- **A watched-src save (and therefore any merge) RESPAWNS the server and WIPES the in-memory wire/RPG
  flight recorders** — so a merge never lands under a live drive that depends on them, and an instrument
  change (design-audit/snap/gates) never lands while a drive is live without messaging the driving lane;
  its before/after deltas silently span two instruments otherwise. (2026-08-21, db25e3d1d: "the ruling
  survives — its INPUT changed"; the old manual restart-at-merge-window is gone, this consequence is not.)
- **The self-heal law has an ERA limit (2026-08-24 — "the ruling survives, its INPUT changed"):
  per-save HMR is fine, but a LONG-LIVED vite that absorbed a multi-merge era can serve a CORRUPT
  module graph** — proven live: :5173 boot-dead with a TypeError inside the prose REGISTRY while a
  node import proved the source consistent (147/147); a clean restart fixed it, zero code changes.
  Tells: a page error in a registry/composition module whose source proves consistent + a vite pid
  (`ps -o lstart`) older than the merge train. TRAP: `.cache/stack/client.log`'s tail can belong to
  a DIFFERENT since-exited vite — a log tail is NEVER a liveness check; probe the served app
  (`data-app-ready` + page errors on a bare snap). After a merge train, check the vite pid's age
  before taking rendered receipts; a receipt off a pre-train vite is void.
- **`:5173` serves MAIN, never your worktree** (§L.6). Rendered proof from a lane comes from
  `snap --isolated --ref <your-sha>` or the CT browser.
- **If the environment is lying — stale server, wrong build, thin stage db, a sibling holding the stage
  port — SendMessage the orchestrator the moment you find out.** Every lane measuring after that point
  is measuring a dead premise, not just you (paid 2026-08-24: a stale `:5173` build was discovered four
  minutes into a 24-minute review and sat undelivered for the other twenty while merges continued).

## Tool hazards

- **rg flag discipline is a standing hazard**: `-r` + shorthand cluster (`-rln`) silently REPLACES match
  text — four offenses in one era, three by the orchestrator. Spell `--files-with-matches`/`-n` out.
- **Wrapper scripts are classified by BODY.** The Bash guard reads UNTRACKED script bodies
  (2026-08-14), so a helper script must carry the sanctioned spellings inside it: the CT cache-clear
  before playwright, and a redirect to a log read in a separate command rather than a pipe into tail.
- **Code-PRESENCE claims use `pnpm ast`/ast-grep — grep corroborates, never decides.** A negative claim
  owes a non-zero scanned-file count plus a second method; `ts` and `tsx` are different languages, run
  both.

```

## 11. `.claude/rules/browser-and-instruments.md` — the reporter=list retirement narrative (was `:26-38`)

```
- **NEVER run two `ct:scoped` invocations concurrently in ONE worktree** — the script's `rm -rf
  playwright/.cache` + rebuild is single-flight per TREE, so a sibling replaces the component index
  mid-flight and everything that MOUNTS fails while the few tests that don't still pass. TRUTH-REPAIR
  2026-09-01 (#1006): the interim rule "pass `--reporter=list` until the summary reporter is fixed" is
  RETIRED — the CT summary was accused of inverting a run ("2 passed / 51 failed" against list's "52 passed
  / 1 failed") and was CLEARED by reproduction (three arms — a trivial pass/fail probe, a 51× retry-then-pass
  probe under `--retries=2`, and the real tests/ui suites — each matched the json reporter's own counts from
  the SAME run, and a list arm of the same selection agreed 82/82). The sighting came from ONE shared
  worktree that six lanes were working in with sibling CT runs live: it was the cache clobber above, i.e.
  two different runs, not a lying counter. The counting is now pure and committed-pinned
  (`tooling/src/verify/ops/ct-run-tally.ts` + `tests/tooling/verify/ops/ct-run-tally.test.ts`), so a real
  inversion would red a test instead of costing a lane an investigation. Read a clobbered run's tell —
  a *registered* component list naming stories you did not select — from `reports/ct-report.json`.

```

## 12. `.claude/rules/db-schema.md` — the squash mechanics + two-lane sequencing (was `:34-41`)

```
- **The baseline-squash mechanics** (C5 lane, 2026-08-24): `drizzle-kit generate` REFUSES without
  `meta/_journal.json` — a squash is `rm` the sql + snapshot, write a journal with `"entries": []`,
  then `generate --name baseline`. Diff the regenerated baseline against the old one and verify it
  is EXACTLY your delta (no sibling churn) before committing.
- **Two lanes with baseline regens cannot be unioned** — two independently regenerated
  `0000_baseline.sql`s each miss the other's tables and the generated files don't hand-merge. The
  orchestrator sequences: the first lane's baseline merges to main; the second regenerates ONLY on a
  post-merge main merged into its own worktree.

```

## 13. `docs/architecture/core/AGENTS.md` §L — the pre-trim lane-discipline text (was `:327-354`)

```
## §L — LANE DISCIPLINE (worktree agents; minted 2026-08-02 from a day of paid tuition)

Every dispatched worktree lane obeys these or its work gets refused at the merge:

1. **`git -C <your-worktree>` on EVERY git call.** Your shell's cwd resets when its directory is
   deleted or a `cd` leaves the project — three bare-git commands ran against main this way. Never
   trust cwd for git.
2. **Prove your own commits.** `git show --stat <sha>` in your report, and `git status --short`
   must be EMPTY before you report — `git commit -- <pathspec>` silently skips untracked files,
   and a cited-but-never-committed file is destroyed at worktree teardown (it happened; the file
   was a deliverable).
3. **Whole-tree gates are the orchestrator's.** Commit with `-c core.hooksPath=/dev/null` and run
   the SCOPED equivalents by hand (biome/eslint/tsc on touched files + your suites + the gates
   your change touches). In a multi-lane session the hook's whole-tree check is a load bomb and a
   2-minute-timeout trap.
4. **Merging main into your branch:** same hook rule (`-c core.hooksPath=/dev/null`), then run the
   scoped gates on the merged tree yourself.
5. **Recreated a worktree manually?** `git worktree add` does NOT fire the install hook — run
   `pnpm worktree:bootstrap` (install + the agent-memory link) or every gate lies and the lane
   boots with an empty memory index.
6. **Rendered proof from a worktree:** `:5173` serves MAIN, never your tree. Use
   `snap --isolated --ref <your-sha>` (a detached worktree of your commit on offset ports) or
   screenshot from the CT browser.
7. **Scratch files are lane-unique.** A shared scratchpad name (`msg.txt`) cost a commit that
   landed with another lane's message. Prefix with your lane's short name.
8. **Report deviations WITH receipts.** If the spec text is wrong on the tree's evidence, say
   exactly where and why — spec-letter compliance against a false premise is a defect, and the
   orchestrator diffs your deviation against the spec before minting law.
```
