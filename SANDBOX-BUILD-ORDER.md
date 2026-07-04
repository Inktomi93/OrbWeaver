# Sandbox build-order scratch (2026-07-04)

> **SCRATCH, not law.** A session-handoff note for dev-container Claude sessions: the agreed
> build order + operational context as of commit `ecf228f`. The constitution
> (`docs/architecture/core/AGENTS.md` — read it IN FULL first), the D-ledger, and
> `Core-BUILD-PLAN.md`/`Core-Audits-and-Debt.md` WIN over anything here. Delete this file when
> it goes stale; update the date line when you land a wave.

## Where the tree is (so you don't re-derive it)

- **Phases 0–5 BUILT.** D48 tool-calling is DONE end-to-end (T1–T4; PD-54 cleared): wire seams,
  all four translator mappings + stream accumulator, `domain/tool-use`, and the chat recurse
  loop. T5 (MCP) ships with buddy, T6 (`runStructuredAgentTurn`) with crew CW2, T7 with client.
- **The 7 fired-trigger gates are ACTIVE** (31 structure gates total) + the solo-byte-identical
  property suite. `pnpm check` runs them all — they bite.
- **Baseline schema riders are IN** (pre-launch window used): crew CW1 tables,
  `card_evolution_proposals`, automation DDL, `global_variables`, `WORKLOAD_KINDS` = 18 with
  stub runners.
- **16 PDs burned 07-03/07-04** (95–100, 103, 106, 110–117 + 54). Remaining `ready` rows are
  all lane-absorbed (PD-101/102/104/107/108/109/112) — burn each WITH the lane that touches
  its surface, not as a separate pass.
- **AP0–AP2 + AP3-seating-half landed; the AP3 voicing chain is OPEN** (PD-17,
  `blocked:AP3-2-remaining`) — a seated agent cannot speak yet. Another session owns that lane
  unless Nate says otherwise.

## The build order (agreed with Nate, 2026-07-04)

**Wave 1 — now (three parallel lanes, no file collisions):**

1. **Client feature surfaces** (Phase 6 core — the `UI-*.md` core set is the spec). Order
   inside the lane: **chat surface first** (message-list + composer + swipes/variants +
   streaming — the bus reducer, chat-stream store, query/trpc plumbing, and form factories in
   `packages/client/src/{data,state,forms,lib}` all already exist and are consumer-less by
   design), then **character library** (consume `createCollectionSurface`), then panels
   (specs: `proposed/connection-capability-panel.md`, `proposed/character-snapshot-ux.md`,
   `proposed/preset-form-mapper-elimination.md`). Land the **Playwright CT + e2e + visual
   harness WITH the first surface** (support exists at `tests/support/ct/`; zero suites yet).
   The D47/D49 client features (welcome screen, reasoning block + effort picker, gallery
   grids, token counter, inline images, `/imagine`) hang off the chat surface. PD-58 (client
   observability) and PD-2's relocation check ride this lane.
2. **AP3 voicing chain → AP3-3** (`proposed/agent-principal-design/`) — the other session's
   lane; gates rpg.
3. **Automation A1–A3** (`proposed/automation-design/` — kit-only slice: macro-DX, CEL,
   global-var verbs over the landed table). Explicitly buildable now; agent-able.
   Fillers: `proposed/export-deferred-surfaces.md` (PD-109), `proposed/sessions-token-rotation.md`.

**Wave 2 — after AP3:** rpg (`proposed/rpg-design/` R-chunks; D48 is ready for it) + AP4a
closes the seat wave inside it.

**Wave 3:** chat-crew (`proposed/chat-crew-design/` CW1-behavior→CW2, then CW3/5/6 parallel).
**CW4 (director) is gated on Nate hand-playtesting the brief — do not start it without him.**
Also `buddy-observer-reaction-engine.md` (PD-45) whenever buddy gets attention.

**Wave 4 (Phase 7 grafts, independent):** databank → expressions → hub + saved-rosters →
imagery extensions + D47 standalones.

**Wave 5 (Phase 8):** automation A4–A8 (needs the two chat flags below), then plugin-design
Tier 2.

**Cheap-now chat flags (land during ANY Wave-1/2 chat touch, they're heisenbugs later):**
`initiator`/`automationDepth` turn-record fields + `getTurnOrigin` read; `variantSelected`
must fire AFTER the swipe path's variable re-fold (automation-design/05 review flags #1/#4).

## Operational rules for container sessions (hard-won, do not relearn)

- **You cannot `git push` from the container** (no keys, by design). Commit locally; Nate
  pushes from the host. Corollary: worktree agents base off **origin/main** — if origin is
  behind your local commits, tell agents to `git merge --ff-only <sha>` or brief them with
  the delta.
- **NEVER `git stash`/`pop`/`restore`/`checkout --`** — multiple sessions share the object
  store; fix mistakes by editing forward. Never touch another session's dirty files.
- **Read FULL `pnpm check`/`pnpm test` output** — never tail; mid-chain errors hide. Don't
  pipe exit codes you branch on (`cmd | tail` eats the code).
- **Sweeps:** `ast-grep` (`sg`) for structure, `/usr/bin/grep -a` for text (the wrapped grep
  skips some .ts as binary).
- **gitignore green-blindness:** after any feature commit, eyeball `git show --stat` against
  what you built — an unanchored ignore glob once silently ate a whole source dir at commit
  (`data/`; now root-anchored). biome also skips ignored dirs, so "green" ≠ scanned.
- **Verdicts are pre-made:** the judgment PDs were decided by Nate 2026-07-03 (rows carry
  **DECIDED** stamps). Don't re-litigate; don't invent new wire-or-strike decisions without
  him. `minisearch` is an approved @orb/ui dep. Config never binds to chats — the owning
  feature carries the association.
- **Committed means full treatment** — cold-read build bar, tests travel with code, no thin
  slices of committed features.
- **Local-light/vLLM suites self-skip in here** (`VLLM_DISABLED=1`, no `.models/`); that is
  expected, not a failure. The firewall blocks everything but npm/GitHub/Anthropic/VS Code.

## The `/reference/` corpus (gitignored, read-only)

The docs cite neo/ST evidence one-line (e.g. "`tool-calling.js:565`"). Those targets are
mirrored INSIDE the repo so container sessions can verify them (only this folder is mounted):

- `reference/neo-tavern/` — neo's source (src/docs/tests/tools/scripts + root configs).
- `reference/upstream/` — neo's evidence base: **sillytavern** (the `tool-calling.js`/
  `openai.js` cites), **marinara-engine**, **guided-generations**, stmp, cardshark,
  card-curator, card-refinery.
- `reference/design/` — Nate's design-goal set (DESIGN.md, design-system/, brand/voice HTML).

READ-ONLY provenance — never edit, never import from, never copy wholesale (the
carry-a-neo-pattern reflex is the documented failure mode; port DECISIONS, not code).
It is gitignored, so ignore-respecting tools skip it: search with `/usr/bin/grep -a` or
`sg --no-ignore`; Glob/Read work normally. Refresh by re-running the rsync from the host
(it is a frozen snapshot, 2026-07-04).

## Quick commands

- `pnpm check` (biome+eslint+tsc+types+31 gates+depcruise) · `pnpm test` (full) ·
  `pnpm vitest run <path>` (targeted) · `pnpm exec tsx scripts/check/report.ts` (gates only)
- Registry: `docs/architecture/core/Core-Audits-and-Debt.md` (live) ·
  `docs/architecture/history/Core-Debt-Cleared-Ledger.md` (done)
