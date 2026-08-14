## Lane identity

- Lane: platform-tooling
- Semantic scope: CI, devcontainer/firewall, Docker secret shim/defaults, editor and Playwright CT harness, Stryker patch, report shell.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`; current HEAD basis: `906d7aa125130e1c4691a7097c6725d8d31d113d`.
- Assigned files read: 22 / 22 (100%); lines: 990 / 990 (100%); bytes: 50,683 / 50,683 (100%).
- Dirty assigned paths: 0. Rolling snapshot drift: assignment predates current HEAD, but every owned working-tree SHA still equals assignment; no rerun was required.
- Exclusions: production server source, compose/config roots, and broader CT specs are sibling-lane-owned; only the direct firewall parity test and three CT consumers were examined as edges.

## Read receipt

`read-receipt.tsv` covers all 22 assigned paths at the current bytes.

## Architecture observed

The devcontainer starts the firewall via `postStartCommand` and waits for it (`.devcontainer/devcontainer.json:92-93`); its script restores Docker DNS, builds an allowlist, then sets default INPUT/FORWARD/OUTPUT policies to DROP (`.devcontainer/init-firewall.sh:13-18`, `:117-130`). Docker’s entrypoint converts only an explicit six-name `_FILE` allowlist to env before exec (`docker/entrypoint.sh:30-51`). Its linked server unit test proves that list remains set-identical to the agent-SDK firewall and that values are absent from child env (`tests/server/infra/providers/backends/agent-sdk/env.test.ts:335-357`, R4); the structural caller scan found two live server callers of `buildClaudeSdkEnv` (commands receipt, R3).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Docker secret shim (1 shell file, 6 keys) | 4 | 3 | 4 | 3 | 3 | high | `docker/entrypoint.sh:30-51`; `env.test.ts:335-357` |
| Devcontainer firewall (1 script) | 3 | 3 | 1 | 2 | 2 | high | `.devcontainer/init-firewall.sh:117-144`; `devcontainer.json:92-93` |
| Playwright CT bootstrap (4 files) | 3 | 2 | 0 | 1 | 1 | medium | `playwright/index.tsx:10-18`; `playwright/index.css:1-14` |
| Manual full CI (1 workflow) | 3 | 2 | 0 | 2 | 2 | high | `.github/workflows/ci.yml:1-37` |

## Findings

### `platform-tooling-01` — firewall has no dedicated behavioral proof

- Severity: P2
- Class: declared-not-tested
- Confidence: high — it would rise no further without a root-capable isolated-network probe; a test matching its exact script name was absent from the entire test corpus.
- Evidence rung: R3
- Scope denominator: 1 firewall script; 0 matching test files across the literal-search denominator recorded in `commands.md`.
- Receipts: `.devcontainer/init-firewall.sh:117-144` establishes the policy and self-checks; `.devcontainer/devcontainer.json:92-93` wires it; `commands.md` records zero `init-firewall` test files.
- Established fact: the real default-deny policy and GitHub/self-test branches exist and are invoked at startup, but no reproducible test exercises failure, DNS, host-network, or allowlist behavior.
- Impact: a policy regression is found only by starting a privileged devcontainer.
- Suggested smallest action: add one isolated/root-capable script probe that asserts allowed GitHub, rejected arbitrary egress, and a failure path; keep it out of normal unprivileged unit runs.

## Proven strengths

- `docker/entrypoint.sh` and the agent-SDK child-env firewall are protected by a meaningful passing 20-test unit run: exact set parity plus value-scrubbing for every shim key (`docker/entrypoint.sh:46-48`; `tests/server/infra/providers/backends/agent-sdk/env.test.ts:335-357`, R4).

## Declared versus completed

| Surface | Strongest current rung |
| --- | --- |
| File-secret import / missing-file refusal | R4 |
| Agent-SDK production callers | R3 |
| Devcontainer firewall startup wiring | R3 |
| CT bootstrap declared in source | R2 |
| Manual full CI workflow | R2 |

## Tests and gates

The direct unit contract is meaningful and passed. CT verification remains unproven in this environment because the command guard rejected the required cache-clear prefix before Playwright executed; that is a tool failure, not a red or green CT result. The workflow deliberately only exposes `workflow_dispatch` (`.github/workflows/ci.yml:1-6`) and invokes `pnpm verify --full` when run (`:27-37`), but no current CI artifact was available.

## Cross-lane edges

- The secret-shim test owns the server firewall half; server/provider lane should preserve `HOST_SECRET_ENV_KEYS` parity whenever it changes (`tests/server/infra/providers/backends/agent-sdk/env.test.ts:297-357`).
- CT startup configuration and Compose roots are excluded sibling surfaces; this lane did not claim their end-to-end registration.

## Tool receipts

Bare `pnpm ast` completed in 0.7s. `callers buildClaudeSdkEnv` completed in 5.3s: TS 1,314 scanned, TSX 0, 3,498 excluded, 2 matches. The broader `refs` and `reaches` attempts did not reach a canonical artifact and count as tool failures; all details are in `commands.md`.

## Lane verdict

The Docker secret handoff is materially verified at R4, including the critical child-process scrub. The firewall is wired and self-checking but lacks a dedicated behavioral probe. CT and manual-CI surfaces are declared, while no current CT/CI execution receipt was obtainable. No assigned-file drift was observed against the frozen assignment.
