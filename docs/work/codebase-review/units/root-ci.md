# Unit: root-ci

Band S. Path: `.github/` (22 tracked files, 2,346 lines; all 10 workflows, the composite setup
action, dependabot.yml, CODEOWNERS, secret-scanning, PR/issue/discussion templates read; the
png is binary).

## Sweeps

- Path cross-refs: extracted every repo path and test/spec file named in any workflow or
  dependabot config and diffed against `git ls-files`. One dead path in the whole tree
  (contributor.yml — the P1 below). e2e specs named by diagnostics.yml exist; every script
  a workflow calls exists (`ci:contributor-ready/-stop`, `test:tools`, `lint:css`,
  `plugin:author-release`, the scripts/ci trio, anonymous-image-pull.sh, install-media.sh).
- `uses: $/.github/actions/setup` is not a hallucination: GitHub's self-repository syntax,
  GA per the 2026-07-30 Actions changelog, resolved at the run's workflow commit — exactly
  what the release.yml comment claims. Verified externally; the audit tools lag (CodeQL issue
  \#22755 and actionlint 1.7.12 both fail to parse it).
- actionlint 1.7.12 audit (owner ask, run locally rather than wired as a gate): zero findings
  except three `$/` lines, which are the linter not yet knowing the GA self-repository syntax.
  If it is ever gated, it needs only `-ignore 'specifying action "\$/'` (verified to exit 0
  on the tree, narrow enough to keep every real missing-ref failure; the flag string was
  round-tripped through the YAML parser and an sh word-split to confirm).
- Dependabot config vs reality: cooldown 14d/30d matches the header's promise; the second npm
  entry's default-branch target matches `release` being the default branch; the pnpm-12
  lockfile claim is real (dependabot-core#15904, filed exactly as the comment describes);
  `pnpm sbom --lockfile-only --sbom-format spdx` exists and works on pnpm 12.15.0.
- Release chain: release-please-config.json two-component layout matches the `packages--*`
  output names; the compose default image name matches release.yml's `IMAGE`; the version-stamp
  identity checks in release.yml/install.yml/development-image.yml agree with the stamp chain
  proven in install-run; anonymous-image-pull.sh's channel guard matches both callers.
- D141 sweep over `.github/**`: zero date/count/history hits. The dependabot-core#15904 cite
  is a live upstream anchor, kept.
- actionlint wired in-unit (owner ask): security-scans.yml `workflows` job now runs
  reviewdog/action-actionlint\@b6d63b44 (v1.84.0, lightweight-tag sha, dependabot-managed)
  beside zizmor, with `-ignore 'specifying action "\$/'` — pattern verified to exit 0 on the
  tree and narrow enough to keep every real missing-ref failure. Flag string round-tripped
  through the real YAML parser and an sh word-split before it was trusted.

## Findings

- \[P1] `.github/workflows/contributor.yml:130` — the weekly contributor proof runs
  `pnpm test:tools tests/tooling/generated-css-drift.repo.int.test.ts`, a file deleted by
  e617b360ea and replaced by `tests/ui/styles/generated-theme-drift.repo.int.test.ts`.
  Reproduced on this tree: exit 1, "No test files found". Two compounding breaks: (1) the step
  is red-by-construction on both macOS and Windows every week, training everyone to ignore the
  proof's red; (2) the replacement sits under `tests/ui/`, which `test:tools` explicitly
  excludes, so pointing the step at the new path with the same runner would still find nothing
  — the cross-platform generated-file freshness proof is silently dead (Linux keeps it via the
  plain node job). Direction: run the replacement through the default vitest config in that
  step, and grep workflow test-paths in the same sweep as any test-file rename.
- \[P2] `.github/dependabot.yml:42-62,78-98` — the ignore lists exist for the stated rule
  "Version-keyed patches must be ported before a dependency bump; unused patches fail
  installation", but they cover 13 of the 50 `patchedDependencies` entries. 37 patched
  dependencies are exposed to the monthly batch — including direct, high-churn ones
  (drizzle-orm, drizzle-kit, hono, openid-client, ai, @ai-sdk/*, @base-ui/*, @codemirror/*,
  @tanstack/*, @trpc/client, pdfjs-dist, playwright-core — note `@playwright/*` does not match
  the unscoped `playwright-core`). Every monthly npm PR is red-by-construction until a human
  ports ~30 patches, and the security-updates entry carries the same gap. Direction: generate
  the ignore blocks from `patchedDependencies` (a check that the two sets agree is the real
  gate — same shape as the closed-vocabulary integrity test already proposed).
- \[P3] `.github/workflows/dependency-graph.yml:5` — the job's removal condition ("once the
  graph parses both documents") half-landed: upstream #15904 closed 2026-11-04 with the
  parser fixed, but runtime/development scope is now mislabeled by the static parse (community
  reports both directions wrong), and a submitted graph outranks the static parse. Decision
  owed: keep the submission for scope accuracy (current de facto choice) or retire it — with
  the comment rewritten to the real remaining reason either way.
- \[P3] `.github/dependabot.yml:39-40` — "7.x through the `ts7` catalog alias" names an alias
  that does not exist: the catalog maps `@typescript/native: npm:typescript@7.1.0-beta` and
  `typescript: npm:@typescript/typescript6@6.0.2` (pnpm-workspace.yaml:47-48). `ts7` exists
  only as the marketplace plugin name. An agent routing a TypeScript bump would chase the
  wrong key.

## Verdict

reviewed (4: one P1, one P2, two P3). The owner-ordered actionlint audit ran clean and was
deliberately not wired as a gate; the invocation recipe is above if that changes.
The workflows read like they were written by someone who has been burned by every GitHub
Actions failure mode: every action sha-pinned with a version comment, `persist-credentials:
false` everywhere, a ci-ok aggregate that refuses to flatten a matrix red into green, identity
proven twice (stamp AND OCI revision) before anything touches `latest`, a draft-retry that can
never move a stable pointer backwards, and a `$/.github/actions/setup` trick that predates the
linters auditing it. For a first CI, this is embarrassing quality — the one P1 is precisely
the class the repo's own verification law warns about (a value-changing commit leaving a stale
coupled consumer), and the P2 is the same disease in dependabot's config: the rule is right,
the list under it went stale at the moment the patch set outgrew the hand-maintained names.
