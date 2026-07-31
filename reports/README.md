# reports/ — ephemeral tool output only

This directory is gitignored. It holds EPHEMERAL outputs: `pnpm snap` PNGs, `pnpm check`/`pnpm test`
verify + report JSON, `design-audit`/`perf-meter` runs, stickler `scratch/` probe scripts.

DURABLE artifacts live in the tree: mocks + design references → `docs/design/mocks/`; design/program
specs → `docs/design/`; reviews → `docs/reviews/{stickler,side-eye,misc}/`.

Nothing written here should ever need `git add -f` again. If you are about to force-add a file from
this directory, it belongs in `docs/` instead.
