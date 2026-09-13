---
kind: evidence
status: active
updated: 2026-09-13
---

# #2238 — attestation fixture Git isolation

Independent review accepted the production `runAttestAtRoot` seam, then found that its test repository was
constructed by a local `git` helper that inherited `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE`. Under a
Git hook, fixture setup could therefore consume the caller's candidate index before the isolated production
operation was reached. Fixture commits also did not disable hooks.

The local helper now clears all three Git routing variables and invokes Git with
`core.hooksPath=/dev/null` and `commit.gpgsign=false`. Every fixture init, configuration, add, commit, and
HEAD read already goes through this helper, so the correction covers the complete controlled repository.
Production code is unchanged.

The new regression creates an owned empty sentinel index, exposes it as the inherited `GIT_INDEX_FILE`,
constructs a complete attestation repository, and requires the sentinel bytes to remain exact. Before the
helper correction, the test failed because fixture `git add` replaced that index with five fixture paths.
After isolation, the focused attestation file passed 4/4; artifact
`reports/runs/test/agent-adee520ef5eeac7f9-911606-2026-09-13T08-38-33-563Z/test-report.json`.

The source-level hook control is the explicit null hooks path on every helper invocation. The regression
does not execute a real hook merely to prove hooks are disabled. No production source, real repository
index, receipt, catalog, or lifecycle state was changed.

## Verification floor

- `pnpm test:scoped tests/tooling/doc-catalog`: 69/69 runtime and 3/3 native type assertions passed;
  artifact `reports/runs/test/agent-adee520ef5eeac7f9-924098-2026-09-13T08-40-08-640Z/test-report.json`.
- Scoped Biome and ESLint passed for `attest.int.test.ts`.
- `pnpm typecheck --config tsconfig.json`: one runnable native program passed.
- Report-only documentation formatting and `git diff --check` passed.

No broad verification battery or production mutation was run.
