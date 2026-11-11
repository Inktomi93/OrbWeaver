# Unit: root-lint-configs

Band L. Paths: biome.json, eslint.config.ts, eslint-plugins.d.ts, stylelint\*.{ts}, jscpd.json,
knip.ts, .dependency-cruiser.ts, lefthook.yml, stryker.config.ts, vitest\*.ts,
playwright\*.config.ts, codegraph.json, .mcp.json, .markdownlint.json.

Grading posture: this is the enforcement layer the whole review trusts. Mid-redo context applies
hard here — before grading any gate as too big/dead, check `pnpm doc overview` for a scheduled
retirement (unwired-code plan items touch depcruise/eslint). Thesis to test: config prose (rule
justifications, comments citing tests/docs) goes false the same way code comments did.

## Sweeps

Literal axis sweep over all 22 files (`rg -n '\bany\b|TODO|FIXME|@ts-|eslint-disable'`): zero real
hits — every match is prose "any" or a CSS-var pattern. `rg -n 'tests/legacy'`: zero hits.

Raw-output excerpts, codegraph/.mcp/jscpd/markdownlint/stryker/eslint-plugins.d.ts read in full
(the last six are ≤16 lines each; verdict inline in findings).

## Findings

- \[P3] vitest.config.ts:49 — comment cites `docs/work/0062`; `pnpm doc show 62` refuses "no such
  item under docs/work/" — dead board cite, and board-number cites are forbidden outright by
  `.claude/rules/comments.md` rule 40 (D141). Direction: keep the why (working-tree guard law),
  drop the number or re-cite the ruling that mandates it.

- \[P3] vitest.config.ts:90-91 — `#2406` / `#1864` history cites ("Between #1864 and #2406 this
  line carried the pin…") — archaeology, same D141 rule; the operative sentence ("No
  AUTH_FALLBACK: #2406 resolves it per AUTH_MODE, so the suite's default boots at owner") can
  restate the behavior without the numbers.

- \[P3]\[open question] codegraph.json:3 — `include` lists four dirs, all git-tracked plain TS/TSX
  (verified `git check-ignore` + `git ls-files`), while `codegraph status` indexes 8,727 files
  tree-wide — so `include` provably does not restrict the index and the dirs need no rescue from
  ignore rules. CLI help documents no include semantics; not proven dead, proven unexplained.
  Either it means "additional attention/file-kinds" upstream or it is residue; a config whose
  only key cannot be explained from the tool's own docs is a candidate for deletion or a
  comment. Do not escalate without reading the tool's config docs.

- \[P2] eslint.config.ts:2437 — the `no-restricted-imports` refusal message tells the author "Use
  the shared @orb/testkit/node/fixtures.ts test entry", but that specifier is refused by the
  resolver (`ERR_PACKAGE_PATH_NOT_EXPORTED`, verified with `createRequire(...).resolve`); the
  dotted per-file exports were deleted by `2fec920816` "refactor(testkit): import testkit through
  nine doors" (Oct 23) and the vitest fixtures moved behind the `@orb/testkit/node` door. Every
  real test imports `@orb/testkit/tooling` or `@orb/testkit/node`. The enforcement layer hands out
  a repair instruction that cannot compile — prose pointing at structure that moved, the program
  thesis in the config layer. Direction: re-point the message to the live door; the fix should
  prove the specifier with `require.resolve`, not grep. Related, not itself broken:
  `settings.vitest.vitestImports` (eslint.config.ts:1114-1115) still lists the dead dotted
  specifiers as recognition patterns — pinned by `tests/tooling/eslint-vitest-plugin-patch.test.ts:106`,
  so a triage of the message must not silently delete those entries.

- \[P2] biome.json:2631-2634 (generated) ← tooling/src/biome-config/policy.config.ts (source) — the
  raw-media refusals send the author to `<MessageMedia>` (`@orb/ui/content`); that specifier is
  refused by the resolver (`ERR_PACKAGE_PATH_NOT_EXPORTED`), the live door is `@orb/ui/message-media`
  (what every feature imports). Same crime as the fixtures.ts message: the door moved, the
  diagnostic still points at the old home. Direction: fix in policy.config.ts, regenerate.

- \[P2] biome.json:156 ← tooling/src/biome-config/policy.config.ts:321 — the D12 `sessions`-plural
  ban message claims "Pinned by tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts"; that
  file was deleted by `821e8f8dff` "remove custom verification" (Oct 21) and nothing replaced it
  (`git ls-files | rg -i ledger-banned` → zero; second method: `rg -l 'banned-shapes'` over
  tests/ and tooling/ hits only the message's own source). The ban itself still bites — the biome
  rule is the enforcement — so this is false memory in a refusal message, not a lost gate: the
  sentence certifying the guarantee names a retired certifier. Direction: re-point or drop the
  "Pinned by" sentence. (The `@orb/contracts/sessions` plural is deliberately banned by name per
  D12 — not itself a finding; the dead cite is.)

- \[P3] Comment law (`.claude/rules/comments.md` rule 40, D141: never cite an issue or board
  number): three sites violate it — knip.ts:146 (`#1847`), vitest.config.ts:90-91 (`#2406`,
  `#1864`, plus "Between X and Y this line carried the pin" archaeology), and vitest.config.ts:49
  (`docs/work/0062`, also dead, logged above). The D-cites and Spine-§ cites elsewhere in these
  files are legal and stay.

- \[P3]\[judgment] biome.json:161 (generated from policy.config.ts:325) — "dotenv was killed
  2026-08-03": a date stamp inside a diagnostic message. Messages are user-facing strings rather
  than comments, so the no-dates letter doesn't strictly bite; flag for triage because the same
  archaeology instinct the law exists to kill is what wrote it.

- \[P3]\[FIXED] vitest.config.ts:49 — dead board cite (see above): comment rewritten without the
  number, why preserved.

- \[P3]\[FIXED] board-number cites (D141): vitest.config.ts:90-91 and knip.ts:146 — comments
  rewritten to state the current truth; the AUTH_FALLBACK sentence they now carry is re-derived
  from `packages/server/src/entry/lifecycle.ts:611` (authFallback is consumed at auth
  construction, which resolves it per AUTH_MODE), not copied from the deleted numbers.

Liveness receipts (the "is this config even alive" axis): `pnpm biome:check` → "biome.json is
current"; `pnpm depcruise` → 0 violations over 8,524 modules / 53,096 deps; eslint config
evaluates clean (`--print-config` on a live file, empty stderr). In-unit verification tier:
vitest-repository-scheduling, knip-workspace-policy and the citation gate — 10/10 pass after the
comment edits.

Not findings, judged in place: `eslint-plugins.d.ts` is required (both plugins still ship no
types, verified via their package.json); the `@orb/contracts/sessions` plural ban is deliberate
(D12 bans the specifier by name); the knip/biome/stylelint/vitest/playwright configs are all
*derived* (vault tokens, TEST_KIND_DEFINITIONS, tsconfig file lists, modes.ts) rather than
hand-mirrored — which is the compiler-error direction the board is walking, so mid-redo grading
blesses the layer's shape; the stylelint SHEETS list is curated (7 shell sheets exist, 4 listed)
and green under the csstools gate.

## Verdict

reviewed (7): 3 open P2, 2 open P3 (one an open question), 2 findings fixed in-unit. The gates
themselves are alive, derived and guarded — biome generated-and-current, depcruise over 8.5K
modules, a throwing tripwire where eslint reads biome, a throwing lane classifier in the stryker
overlay. The rot is exactly where the phase-0 thesis predicts: the *sentences inside refusal
messages* that name doors and pin-tests which moved. Three of three are the same crime with
resolver-grade receipts. The enforcement layer executes truthfully and misinforms its authors —
gates have gates; the gate's mouth has none. Carried to instruction-files unit: AGENTS.md says
pre-push runs "Biome, dependency-cruiser and ESLint"; lefthook.yml also runs github-sync, knip,
knip-prod and typecheck — understatement in the always-on core.
