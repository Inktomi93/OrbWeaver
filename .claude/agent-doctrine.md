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
  - **`ast-grep` (aka `sg`, v0.44) for code STRUCTURE** — "every `useState(...)` call", "components
    matching a JSX shape", "functions with signature X", and AST-aware rewrites. Structural, no
    regex-escaping pain, respects syntax. The flags that matter (run `sg run --help` for the rest — no
    repo `sgconfig`, run ad-hoc):
    - `sg run -p '<pattern>' -l ts <paths>` — search. Metavars: `$A` = one node, `$$$A` = many;
      `-l/--lang` is `ts`/`tsx`/`js`/`css`/… (required for a bare pattern).
    - `-r '<fix>'` rewrites, but **prints a diff only** — nothing is applied until `-U/--update-all`
      (batch) or `-i/--interactive` (confirm each). A search never mutates.
    - `--globs 'packages/ui/**'` to scope · `-C <n>` context lines · `--json=compact` machine output ·
      `--files-with-matches` for paths only · `-k <kind>` by AST node kind.
    - `sg outline <paths>` lists symbols/imports/exports/members; `--debug-query -l ts` prints the
      tree-sitter AST when a pattern won't match (your escape hatch, don't guess the node kind).
  - **The built-in Grep TOOL for literal text** — strings, comments, config values, a quick "does
    this token appear". It's ripgrep-backed, needs no permission prompt, and has no binary-skip
    issue. Don't force ast-grep on a literal, and don't shell out to grep for a plain search.
    ONLY when a Bash pipeline genuinely needs grep in it: use `/usr/bin/grep -a` — the shell's bare
    `grep` is a ugrep wrapper that skips some `.ts` as binary → silent false-negative sweeps.
  - **`tree`** (v2.1) for directory structure at a glance; **`tokei`** (v12.1, `--output json`) for
    LOC/size stats by language when scoping how big a surface is.
- **Verify with our instruments, cheaply.** `pnpm snap <route> --map/--contrast/--eval/--aria` (Bash,
  own headless browser, no MCP cost); `window.__orb` for render/query/bus state; wait on
  `data-app-ready`. Prefer these over chrome-devtools MCP.

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
- Your own `git merge main` runs `-c core.hooksPath=/dev/null` (the `-c` goes BEFORE the subcommand),
  then re-run gates manually. The orchestrator's merges keep the hook.
- **Verification floor** (scoped green is NOT done): your suites + scoped tsc + biome/eslint PLUS
  `pnpm check:structure` (test-file rules — test-layout mirror, ct-no-oneshot, no-test-fabrication,
  testid-typed — are invisible to every source-scoped tool) PLUS whole-tree `npx knip --cache`
  (last-importer removals) PLUS `npx depcruise packages --config .dependency-cruiser.cjs` whenever
  you added/moved a FILE or changed any import path (layer/subsystem-mediation rules are whole-graph —
  a scoped floor missed a verbs→named-subsystem edge once, 08-03) PLUS `pnpm typecheck:graph` when
  you touched anything under tests/.
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
- **Gates land on a FIXED tree, not a parked one (owner law, 08-03):** when your new gate finds live
  violations, FIX them in the same lane — allowlists/baselines are reserved for genuinely PERMANENT
  deliberate exemptions (each with a reason string and a stale-arm), never "temp, it's fine" debt
  parking. A gate that ships with parked violations teaches the tree that red is negotiable. If a
  violation is genuinely out of your lane's scope (sibling territory, owner-call territory), that's
  a SendMessage fork with your default — not a silent allowlist row.
