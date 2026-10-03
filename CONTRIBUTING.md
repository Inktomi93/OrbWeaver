# Contributing

## Reporting a bug

Two ways, and the first one is better because it carries the state:

1. **In the app** — the bug-report button on the dev top rail captures a bundle (route, build identity,
   recent console errors, appearance axes) alongside your note. Settings → **This install** has a Copy button for the version line if you are filing by hand.
2. **GitHub issues** — <https://github.com/Inktomi93/orbweaver/issues>. Quote the version line
   (`vX.Y.Z` for a release, `X.Y.Z-dev+<commit>` for anything else) from About this install; without it we
   cannot tell what you ran.

## Developing

Use native Linux, macOS or Windows. Install Git and pnpm through the README's "From source" steps. On Windows, install Git for Windows with Git Bash available to the Git hooks; run contributor commands in PowerShell or Windows Terminal. WSL2 is optional.

```bash
pnpm install     # deps + git hooks
pnpm runtime set node 26 -g  # Node on PATH for hooks
pnpm exec playwright install chromium  # browser for Snap and component tests
pnpm start       # production server on http://localhost:8788
pnpm dev         # the watched dev stack in this terminal, http://localhost:5173
pnpm stack up    # the same dev stack detached; `pnpm stack status` and `pnpm stack down`
```

`package.json` pins pnpm and the Node runtime used by repository commands. On Linux, use `pnpm exec playwright install --with-deps chromium` to install browser system libraries too. A dependency version goes in
the `catalog:` of `pnpm-workspace.yaml`, and the `package.json` that uses it says `catalog:`.

## Before you open a PR

```bash
pnpm check       # the static tier: lint, typecheck, structural gates
```

Run affected behavior tests with `pnpm test:scoped <paths>` or `pnpm test:ct <paths>`. The pre-push hook runs `pnpm verify --push`, which adds node tests, component tests and e2e smoke.

## Native contributor evidence

The manual [contributor workflow](.github/workflows/contributor.yml) runs a fresh checkout and install on macOS and Windows. It proves server and Vite readiness from `pnpm dev`, captures Home with Snap, stops the process tree, runs `pnpm check`, and runs `tests/client/features/chat/components/home-quick-picks-tile-body.ct.tsx`. Each job uploads existing harness artifacts, Snap run slots and dev logs even after a failure. Completed native runs are still required before declaring contributor parity.

The manual [install workflow](.github/workflows/install.yml) separately proves source and Docker production launches and plugin broker behavior. Use its `windows_proof_only` input to repeat Windows broker proofs without rerunning startup or unrelated platform jobs. `windows_proof_repetitions` selects sequential repetitions; each writes its own artifact.

The architecture is enforced, not suggested: imports flow one direction through the package cake,
every shape has exactly one home, and tests live in the central `tests/` tree mirroring `src`. Read
`docs/law/Constitution.md` before a non-trivial change — it is the map and the rules.
