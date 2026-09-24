# Contributing

## Reporting a bug

Two ways, and the first one is better because it carries the state:

1. **In the app** — the bug-report button on the dev top rail captures a bundle (route, build identity,
   recent console errors, appearance axes) alongside your note. Settings → Admin → **About this
   install** has a Copy button for the version line if you are filing by hand.
2. **GitHub issues** — <https://github.com/Inktomi93/orbweaver/issues>. Quote the version line
   (`v0.0.0 (<commit>, <source>)`) from About this install; without it we cannot tell what you ran.

## Developing

Develop on **Linux or WSL2**. The dev harness uses `nice`, cgroup fencing and bash hooks, so the
watched stack is Linux-shaped. macOS can run the tests and `pnpm start`; it cannot run `pnpm stack`.

```bash
pnpm install     # deps + git hooks
pnpm start       # production server on http://localhost:8788
pnpm stack up    # Linux only: the watched dev stack on http://localhost:5173
```

You need pnpm and Node 26; the README's Develop section installs both through pnpm. A dependency version goes in
the `catalog:` of `pnpm-workspace.yaml`, and the `package.json` that uses it says `catalog:`.

## Before you open a PR

```bash
pnpm check       # the static tier: lint, typecheck, structural gates
```

`pnpm verify --push` additionally runs the behavioural suites (node tests, component tests, e2e
smoke) and takes a while; run it if your change touches behaviour rather than only shape.

The architecture is enforced, not suggested: imports flow one direction through the package cake,
every shape has exactly one home, and tests live in the central `tests/` tree mirroring `src`. Read
`docs/law/Constitution.md` before a non-trivial change — it is the map and the rules.
