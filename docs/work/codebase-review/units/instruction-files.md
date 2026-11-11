# Unit: instruction-files

Band L. Paths: `AGENTS.md` (202 lines), `.claude/rules/` (16 files, all read in full),
`.claude/hooks/` (6 files), `.claude/settings.json`, `.claude/agents/` (8), `.claude/skills/`
(10 skills; lane and orchestrator read in full, others claim-verified), `.claude/marketplace/`
(orb-session, ts7-lsp), `.codex/` (8 agent tomls, config, hooks, mcpls, environments, symlinked
hooks).

## Sweeps

- Cite check, all 16 rules files: every cited path resolves (merge.ts, clamp.ts, wire-history.ts,
  TABLE_SCOPING/ASSET_REFS, AMBIENT_STUBS, plugin-leaf-nodes.tsx, resolveGuidedSteer,
  CONTENT_CLASS_POLICY/spanToWirePart, writeHandState, mergeFeatures, tenancy/index.ts, the
  inference and chat homes, vocabulary-map.md, legacy-tests dir). `synthesize.ts` lives at
  `packages/inference/src/capability/synthesize.ts` — the rule's adjacent reference resolves.
- Citation-gate question (a) resolved: the gate DOES scan AGENTS.md and the rule files
  (`LAW_DOC` regex at tests/tooling/doc/comment-path-citations.repo.int.test.ts:18); it passed
  3/3 over the edited AGENTS.md. Root-level bare-file citations stay invisible to it — that
  stays inside the open root-config P2, unchanged.
- Header-budget question (b): no mechanical check exists for the 3-line header budget (grep for
  a line-count gate in tooling/src/doc and tests/tooling: nothing). See the P2 below.
- Hooks: all six settings.json-referenced scripts exist; codegraph-project.mjs's PROJECT_TOOLS
  match the installed codegraph CLI/MCP surface; the MEMORY byte cap arithmetic checks
  (24.4 KiB = 24,985 B); every external bridge path the onboard hook names exists on this box
  (PROTOCOL.md, SESSIONS.md, claude-bridge, statusline account_for); worktree hooks refuse
  out-of-scope paths and keep unmerged branches.
- Agents: 8 Claude md + 8 Codex toml, bodies diffed programmatically — all 8 byte-identical
  after the Codex-compat preamble (drift check at /tmp/opencode/agentdiff.mts). Model routing
  maps consistently (opus→gpt-6.1-sol, sonnet→gpt-6.1-terra, fable→gpt-6-astra). `.codex/hooks`
  and `.agents/skills` are symlinks into `.claude/` — one home, no copies.
- Skills fact-check: `test:mutation`, `lint:eslint:box`, `unwired`, `doc edit`, `stack`,
  `worktree:bootstrap`, `knip` all exist in package.json; `tooling/concurrency-profile.json`,
  `~/inktomi-stack/docs-mcp/libraries.txt`, `docs/plans/test-foundation` anchor,
  `durable-resume.int.test.ts`, the scout agent, the lanes plugin, stack-lookup, and
  `~/.local/state/orbweaver` all exist; the orchestrator's doc-CLI table matches `pnpm doc help`
  verb-for-verb; the codegraph CLI has callers/impact/affected/explore as AGENTS.md claims;
  dogfood-loop's 11 console classes all appear in client code, and `__orb.nav` +
  `sandbox-trace-noise` are real; snap-driving §5 exists; the codemod showcase directories all
  exist.
- D141 sweep over `.claude/**` + AGENTS.md: after the in-unit fixes, zero date/hash/count/
  banned-word hits (the only date match is the literal legacy-tests directory name, which is
  the path itself).
- Fixed in-unit: AGENTS.md pre-push description (said "Biome, dependency-cruiser and ESLint";
  lefthook.yml runs seven gates: github-sync-check, biome, depcruise, eslint, knip, knip-prod,
  typecheck — now named); AGENTS.md "grep is a ugrep wrapper" (false: /usr/bin/grep is GNU grep
  3.11, ugrep is not on PATH and no wrapper exists in the repo; replaced with the truth);
  date stamps in the two worktree-hook headers ("probed 2026-07-30" → "probed against the
  harness").

## Findings

- \[P2] `.claude/rules/comments.md:37` vs `AGENTS.md:11` — the header law contradicts the
  header's job. comments.md budgets "a file header is 3 lines or fewer"; AGENTS.md declares
  "per-domain law is the code and its file headers… it can hold a ruling your fix would break".
  Reality: 1,005 of 1,623 header-carrying `.ts` files in packages/server/src + packages/kit/src
  exceed 3 lines (worst: kit/src/card-frame/index.ts at 100). No mechanical check exists for
  either claim. A cold review lane citing the budget would trim law-carrying headers; a cold
  builder following AGENTS.md writes a 60-line header the budget calls a defect. Direction:
  amend the budget to the practice (a purpose line plus a rulings block, gated by content
  kind) or move the rulings to law docs and trim — but one of the two sentences has to go.
- \[P3] `.claude/skills/lane/SKILL.md:195-200` — the "Legacy-main" section teaches reading and
  porting from branch `legacy-main`, which does not exist: no local ref (`git for-each-ref`
  empty), no remote ref (`git ls-remote --heads` empty), `rev-parse` fails. Dead procedure;
  the port it served appears complete. Deleting the section is a law change, not a comment fix.
- \[P3] `.claude/skills/lane/SKILL.md:204` — prescribes test-hook names `__reset<Noun>` /
  `__<verb>ForTest`; zero occurrences under packages/ (tracked scan, 9,672 files; the tooling
  hits are the unrelated word `ForTestFamily` and vendored devtools assets). The convention
  either died with the test rebuild or was never wired; the Spine/testkit docs don't restate
  it either.
- \[P3] `AGENTS.md` is 202 lines against its own writing.md:52 budget ("`AGENTS.md` with its
  imports… stays under 200 lines"); every rule has `paths:` so imports contribute nothing.
  No mechanical check found. Two lines over — the rule needs a trim or a check.
- Observations, not filed: security-builder's frontmatter lacks `permissionMode` and
  `autoCompactWindow` that the other four builders set (plausible intent, unproven); the
  orchestrator's work-board table omits `done` from `pnpm doc set` states and says "knip"
  where pre-push runs knip and knip:prod (description completeness, not falsity).

## Verdict

reviewed (4: one P2, two fixed in-unit, one self-budget P3). This unit is the review's
strongest confirmation of the working thesis: the machinery is excellent and the prose beside
it rots. The rules files are pure distilled lessons with honest citations — every one I
checked resolves. The dual-harness agent manifests are byte-drift-free, the doc-CLI table is
honest, and the hooks are paranoia done right. What is false sits in exactly the places no
gate reads: a tool-behavior sentence about grep, a hook-description sentence, a dead branch
name, a naming convention nobody can find, and a line budget its own file busts. The
comments.md-vs-AGENTS.md header contradiction is the unit's real prize: two always-on
documents give a cold agent opposite orders about the single most load-bearing comment kind
in this repo.
