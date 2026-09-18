# Orbweaver executor doctrine (build-process hard rules)

Every role reads this BEFORE touching code (all seven role bodies order the full read): the recurring
gotchas that break this repo's gates or ship broken pixels. `docs/architecture/core/AGENTS.md` (the
constitution) is separate, higher, and wins on any conflict — read it IN FULL first, then this file,
then the docs/file-headers your task touches (per-domain law is the CODE + its headers). Do not skim.

Every line below is a RULE; the incident that minted it is in
`docs/architecture/history/agent-doctrine-accretion-2026-08.md` and the shared memory store — go there
only when a rule's edge case is genuinely unclear.

## The hard rules
- **Tokens only.** No raw px / hex / arbitrary Tailwind in features (a biome hook enforces it); compose
  from `@orb/ui` primitives + `<Stack>/<Row>/<Section>/<Container>`; never `className` on raw HTML.
  Tokens are `packages/ui/src/tokens/tokens.json` → `pnpm --filter @orb/ui tokens:build` after editing
  (theme.css + tokens/index.ts are GENERATED; a dead token is a build error).
- **The gate battery is `pnpm check`**; the commit hook runs it, NOT `pnpm test`. A change can be
  gate-green and still fail `pnpm test`. After editing any gate or token file, run `check-gates.int`.
- **Lane iteration is SCOPED.** The explicit inner loop is exactly the test files you touched
  (`pnpm test:scoped <paths>`, `pnpm test:ct <paths>` — niced scripts, never raw `npx`; pass NO worker
  flag, the SHIPPED defaults ARE the shared-host caps since #1835, from `tooling/concurrency-profile.json`)
  + scoped typecheck + biome/eslint on your files. Commit normally in your assigned worktree or clone;
  its configured hooks may run required whole-project checks. Do not manually duplicate a full battery
  solely to commit. Hook bypass requires a specific user- or coordinator-authorized exception with the
  reason and executed/owed checks recorded; the orchestrator owns integrated graduation.
- **The harness AUTO-WRITES artifacts — READ them, never pipe or re-run to rediscover a failure**, and
  invoke the SCRIPTS (a bare `npx vitest run` drops the json reporter). Which artifact each run writes,
  and why the paths are `latest` POINTERS rather than files written in place: constitution §4.
- **NEVER a tree-wide `biome check --write` / `biome format` / any fix-all** — INFO-level autofixes have
  changed behavior and crashed the server; fix ERROR-level only, and never re-add `u` flags
  (`useUnicodeRegex` is deliberately deleted). CARVE-OUT: `--write` SCOPED to files you touched is
  sanctioned for the fixes biome owns — read the WHOLE diff, never widen past your own set.
- **`biome-ignore` is the comment IMMEDIATELY above the flagged line** (an `eslint-disable-next-line`
  goes ABOVE it). Suppress only a genuine false-positive, with a cited reason; never restructure real
  code to silence a linter.
- **done ≠ rendered.** Verify the computed/rendered result (`getComputedStyle`, `boundingBox`,
  `pnpm snap`), not the source; assert geometry against the resolved token, never a hardcoded px.
- **Read the FULL gate / test output.** A run that "looks done" isn't verified until you have read its
  result; a builder whose last message is "waiting on the background run" is NOT done.
- **DB (LAUNCHED since 2026-09-18, #316): a schema change is a FORWARD incremental migration** —
  `0000_baseline.sql` is frozen, never regenerated and never hand-patched, and an applied migration is
  never edited (a mistake in one is fixed by a new forward migration). Baseline drift is boot-FATAL, not a
  dev-db wipe; a deliberate wipe is `pnpm seed:demo --fresh`. Procedure: `.claude/rules/db-schema.md` →
  `Tier-1-DB.md` §"Regime 2".
- **Verify with our instruments, cheaply:** `pnpm snap <route> --map/--contrast/--eval/--aria`,
  `window.__orb` for render/query/bus state, wait on `data-app-ready`. These ARE the browser — there is
  no devtools MCP (retired 2026-09-02, #1255); wanting one means naming the gap and building the arm.
- **NEVER commit while a `git push` is running, and never trust the push's summary line** — git resolves
  the ref at invocation and transfers its value at transfer time, so a commit inside the ~17-min pre-push
  window ships silently under a stale printed range. Verify against the SERVER (`git ls-remote origin`).
- **A lane that dies silently is usually a PERMISSION DEFER, not a transient** — tell: "completed" after
  1-4 tool calls at a consistent token count; the real message is `settings deferred Bash` and a subagent
  has nobody to ask. Report the EXACT command and stop cleanly; the fix is the allowlist, not the guard.

## Search and recon
- **`ast-grep` for code STRUCTURE, the Grep tool for literal text, `pnpm ast` for reference/liveness.**
  Type `ast-grep`, NEVER `sg` (`/usr/bin/sg` is `newgrp`; upstream deprecated the alias). `ast-grep -r`
  and `pnpm codemod` DRY-RUN by default — nothing hits disk without `-U`/`-i`/`--apply`; read the whole
  diff, apply in reviewable batches.
- **`ts` and `tsx` are DIFFERENT languages with no superset flag — run BOTH and merge.**
- **An absence claim owes `--inspect summary` (non-zero `scannedFileCount`), a SECOND method, and a
  planted positive control.** `scannedFileCount=0` is "I could not search", never "not found"; a zero
  from an unprobed instrument is not a result. Code-PRESENCE claims use `pnpm ast`/ast-grep; grep
  corroborates, never decides.
- **The global `code-recon` SKILL is the standard for any recon claim** — the evidence ladder, the three
  ways recon fails while looking like success, `tree -L` truncation and
  partial-reads-locate-never-conclude live there. Load it; never report a rung you did not climb.
- In a Bash pipeline: `/usr/bin/grep -a --exclude-dir=node_modules` (the shell's `grep` is a ugrep
  wrapper that skips some `.ts` as binary; `grep -r` ignores ignore-files).
- **Reading NEO (`legacy-main`) is a BRANCH read** — materialize it OUTSIDE the repo
  (`git -C <repo> archive legacy-main | tar -x -C <scratchpad>/neo`) and ast-grep that; never
  checkout/worktree/cp into the tree. SillyTavern needs `-l js` AND `-l html` (its UI hides in templates).

## Boundaries
- **You are a leaf agent — never spawn other agents** (no Agent tool, no `claude -p` from Bash). If the
  task needs another role, stop and report.
- **Never `git stash` / `git checkout <path>` / `git restore`** — they silently destroy uncommitted work.
  Read old versions with `git show HEAD:<path>`. Commit / push ONLY when the spec says to.
- **No scope creep** — no surrounding cleanup, speculative abstraction, defensive code for cases that
  can't happen, or "while I'm here" refactors.
- **A precise "blocked because X" is a successful outcome; a guessed implementation is not.**

## Reporting
Audit every progress claim against a tool result from THIS session; report skipped steps as skipped and
failures with their output; lead with the outcome. Surface durable lessons to the orchestrator (it owns
the memory store) — never write memory yourself. **Authored text goes in a FILE, not in your report:**
specs, drafted ledger entries and owner-facing copy land under `docs/…` and you cite the path.

## Lane invariants (every worktree lane; briefs do not repeat these)
- `git -C <your-worktree>` on EVERY git call (cwd silently resets across notification boundaries).
- Staging is ruled in `.claude/rules/lane-standing-facts.md` §Staging and commits (pathspec on a SHARED
  tree, `git add -A` in your own worktree). Lane-unique scratch filenames; `git show --stat` in the
  report; `git status --short` EMPTY before READY.
- **ONE COMMIT per lane (owner law)**, message TERSE and drafted in seconds; receipts and narrative go in
  the final report, never the commit message.
- Merge main into your lane normally through the configured hooks and commit conflict resolution without
  bypass by default. A specifically authorized bypass follows constitution §L's reason-and-checks record.
- **Explicit lane floor:** your suites + scoped tsc + biome/eslint + the affected gates that accept a
  scoped subject + `pnpm typecheck --config <path>` for every affected native program selected by the
  shared compiler reader. The configured commit hook owns the whole-project `check:structure`, knip and
  dependency-cruise passes; read that hook result, but do not manually duplicate those passes solely to
  commit. A file move, import-path change or last-importer removal still names that coupled risk in the
  report. `pnpm typecheck` with no configs discovers and runs the complete runnable program set.
- **The typecheck door is ONE command** — `pnpm typecheck [--config <repo-relative-tsconfig>]...`.
  Repeated configs select native programs; the verifier's `types:native` stage forwards the complete
  affected-program selection. `.test-d.ts` assertions remain the separate `types:testd` stage.
- **Your floor NAMES its playwright CT files by path** — `check:structure` never executes one, so a CT
  nobody named is a CT nobody ran. **The verify tier ladder is
  DATA, never prose — read it from `pnpm verify --list`**; the two facts not in that listing: `pnpm check`
  is the static tier (no runtime tests, but it DOES run `types:testd`), and `--push` takes ~16-17 min so
  BACKGROUND it.
- **A landed change to a shared READ, a stub shape, or an a11y ATTRIBUTE must SWEEP every test asserting
  the old one** — grep the OLD spelling across `tests/**` + `**/*.ct.tsx` and fix the mounts FIRST.
- Red-first proofs compile against the OLD source and assert user-visible affordances (`cp f f.bak` /
  `git show HEAD:<path>`). Worktree Bash rejects compound commands — script to the scratchpad.
- SendMessage the orchestrator MID-RUN on ruled-territory forks and keep working; never improvise on a
  ruling, never stall silently. **When your work kills a sibling lane's premise, say so immediately.**
- **Test-seam convention:** `__reset<Noun>` when it resets state, `__<verb>ForTest` otherwise; read the
  spelling off existing code. A pure model helper tests happen to exercise is NOT a seam.
- **A dynamic seam ships with its lens** — a string-keyed lookup, registry entry, devtools label or test
  title ships with the literal sweep that finds it; an LS-only rename is half a rename.
- **Gate-touching work follows `docs/design/gate-runtime-read-first.md`**, then the final authoring guide
  `tooling/src/verify/gates/GATE-AUTHORING.md` for contract, authority, coupled sites and proof ownership.
  Legacy block/line marker resolution and checkout probes belong to its verbatim archive; final policies
  prove exact source positions through central authority and use isolated fixtures/virtual overlays.
- **Gates land on a FIXED tree (owner law):** fix the live violations your new gate finds, in the same
  lane. Allowlists are for PERMANENT deliberate exemptions with a reason string and a stale-arm, never
  debt parking; out-of-scope violations are a SendMessage fork, not a silent allowlist row.
- **Deleting an exemption row is a COUPLED-SITE edit** — the row's `mustFlag`/`mustPass` conformance rows
  are vitest (invisible to `pnpm check`). Retarget the proofs in the same commit. **Re-creating a test file
  at a previously-deleted path is NO LONGER the second half of this rule** (#2217, owner ruling): the
  test-baseline manifest and its `deletions` ledger are DELETED, so there is nothing to re-ledger and
  nothing to regenerate — test presence is DERIVED (`test-presence` / `test-layout`).
- **Shared-box hygiene:** never `pkill` by process name (kill your own PGID; if you hit a sibling,
  message the orchestrator with the timestamp); probes live in the session scratchpad, NEVER in the tree;
  anything over ~10 min launches OUTSIDE the task manager (`setsid nohup … </dev/null & disown`) with its
  exit code in a `.exit` file — a timed-out foreground poll becomes a background task and EVICTS the
  oldest, which is the run you were watching.

## Your instruments lie (the green may be the tool failing open)
- **`biome.json` is STRICT JSON: a `//` comment is a parse error and biome silently falls back to
  BUILT-IN DEFAULTS.** Tells: phantom TAB diffs, rules the repo has off, absurd file counts. Probe:
  `pnpm exec biome check <one-known-clean-file>`.
- **`incremental` is OFF repo-wide because it produced a FALSE GREEN** (warm exit 0, cold exit 1, same
  tree); advice about clearing `tsbuildinfo` is stale, and re-enabling owes the `tsconfig.base.json` proof.
- **A gate that ratchets a PRODUCER proves nothing about a READER** — on a green coverage gate, ask
  separately who CONSUMES the value. A class, not one gate.
- **A law that lives only in prose is a wish** (constitution §2.3) — prove the clause, don't read it.
- **A doc's §-lists are snapshots nobody re-swept** — re-derive before building, truth-repair in the
  same commit.

## Verify before building
- **A ledger clause's cited SEAM, a brief's cited MECHANISM, and a review's tree-claims are all
  HYPOTHESES that AGE** — re-derive each against TODAY'S tree (or a live drive) before building to its
  letter, and report which premise died. A brief's SYMPTOM and RULINGS stay law; its why does not.
- **A file header, a guard's comment or a schema note routinely holds the ruling your brief is about to
  violate** — read the contract before fixing the symptom, check any prescription naming a user-facing
  affordance against the product, and deviate with the receipt.
- **An ABSENCE receipt owes its SCOPE as well as its method, and the LAW decides the scope** — an
  exhaustive listing of the wrong directory reads exactly like proof. Read the D-entry governing X.
- **"Declare the limit" is a partial fix wearing a receipt's clothes** (owner: *"we are the do things
  right the first time club even if it means more work"*): legitimate only when the thing is genuinely
  out of reach. Fix the CLASS, not the instance the reviewer happened to probe.
- **`pnpm check` is STATIC and a targeted verifier is no substitute for the tier the change lives in.** A
  changed SHARED VALUE referenced by literal (enum member, label, wire field) hides a stale fixture in a
  suite you never thought to open — run the suites asserting it and repo-wide-grep the literal across
  `tests/`. **"No CT" is a claim you owe a grep for, not a default.**

## Rendered proof
- **Shoot the NARROWEST REAL production mount, not the story width** — a `shrink-0` cluster sized wide is
  this repo's most common rendered defect; a narrow CT needs a FIXED-width container with
  `overflow: visible` (a content-sized root agrees with the bug).
- **Same-tick reads of smooth-scroll/async paint are false negatives by construction** — poll to settled.
- **Hit areas need `elementFromPoint` at offsets from the centre, never a bounding box**; mobile geometry
  needs REAL coarse-pointer emulation.
- **A green-before test — and any new walk-fence/exclude/instrument in your floor — needs a PLANTED
  POSITIVE CONTROL.** A test that passes pre-fix is a FENCE, not a defect proof; relabel it honestly.
- **Verify a fix at the seam the DEFECT was reported at**, not only at the unit; a live drive finds what
  tests structurally cannot — what the MODEL RECEIVES.
