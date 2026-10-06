# Contributing

Orbweaver is one dude and a lot of tooling. Bug reports, fixes and plugins are all welcome. Fair warning: the
codebase is strict on purpose, and the checks will tell you about it before I do.

## Reporting a bug

Two ways. The first is better because it carries the state:

1. **In the app.** The bug-report button captures a bundle (route, build identity, recent console errors,
   appearance settings) alongside your note. Settings → **This install** has a Copy button for the version
   line if you file by hand.
2. **[GitHub issues](https://github.com/Inktomi93/orbweaver/issues).** Include the version line (`vX.Y.Z` for
   a release, `X.Y.Z-dev+<commit>` for anything else). Without it I can't tell what you ran.

Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Branches

`release` is the default branch: it's what people install and what the repository page shows. Development
happens on `main`. After cloning, run `git switch main`, and open pull requests against `main`.

## Setting up

Native Linux, macOS or Windows all work. Install Git and pnpm with the README's "From source" steps. On
Windows, install Git for Windows with Git Bash available to the Git hooks, and run commands in PowerShell or
Windows Terminal. WSL2 is optional.

```bash
pnpm install                            # dependencies and git hooks
pnpm runtime set node 26 -g             # Node on PATH for the hooks
pnpm exec playwright install chromium   # browser for Snap and the component tests
pnpm start                              # production server on http://localhost:8788
pnpm dev                                # watched dev stack in this terminal, http://localhost:5173
pnpm stack up                           # same dev stack, detached; pnpm stack status / pnpm stack down
```

`package.json` pins pnpm and the Node runtime the repository commands use. On Linux, use
`pnpm exec playwright install --with-deps chromium` to get the browser's system libraries too. A dependency
version goes in the `catalog:` of `pnpm-workspace.yaml`, and the `package.json` that uses it says `catalog:`.

## The rules of the house

The architecture is enforced, not suggested. Imports flow one direction through the package layers, every
shape has exactly one home, and tests live in the central `tests/` tree mirroring `src`. Read
`docs/law/Constitution.md` before a non-trivial change: it's the map and the rules.

Commit messages are conventional (`feat(chat): ...`, `fix(ui): ...`), and the commit hook checks them. Commits
written with an AI assistant end with its `Co-Authored-By:` trailer; for one you typed yourself, commit with
`ORB_HUMAN_COMMIT=1` set. Release notes are built from these messages, so write them for a reader.

## Before you open a PR

```bash
pnpm check   # the static tier: lint, typecheck, structural gates
```

Run the behavior tests your change touches with `pnpm test:scoped <paths>` or `pnpm test:ct <paths>`. The
pre-commit hook runs the static checks on what you staged, and the pre-push hook runs `pnpm check`. CI runs
the rest on every PR: node tests, component tests and the e2e smoke suite. `pnpm verify --push` runs all of
it locally if you'd rather know first.

## Native proof workflows

Two manual workflows prove the paths that matter on real runners:

- [contributor](.github/workflows/contributor.yml) does a fresh checkout and install on macOS and Windows,
  starts `pnpm dev`, captures Home with Snap, runs `pnpm check` and one component test, and uploads the logs
  even when it fails.
- [install](.github/workflows/install.yml) proves the README's source and Docker launches and the plugin
  broker. Its `windows_proof_only` input repeats the Windows broker proofs alone, and
  `windows_proof_repetitions` runs them up to three times in a row.

## Maintainers: syncing and releasing

`main` is pushed from a local checkout, and two things merge on GitHub: Dependabot PRs (into `main`) and the
release PR (into `release`). Both commands below fold those in first, so a push is never refused.

- `pnpm sync` merges anything new on `origin/main` and `origin/release` into local `main`, then pushes `main`.
  Merge a Dependabot PR on GitHub with the Squash button, then run it.
- `pnpm release` does the same, then pushes `main` to `release`, which opens or updates the release PR.
  Merge that PR on GitHub to tag the version, publish the release and build the image. It refuses a commit
  whose CI run isn't green, so push, wait for CI, then release.

Extra arguments go to `git push`, for example `pnpm release --no-verify`. If you forget to sync, the
pre-push hook stops you in seconds and says so.
