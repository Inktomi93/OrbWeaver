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
