---
kind: tooling
status: open
updated: 2026-09-24
priority: P1
area: tooling
---

# Make a fresh machine install without manual workarounds

## What

Pin Node through `devEngines.runtime` in the root package.json so pnpm installs Node 26 itself. The onnxruntime-node download is denied in `allowBuilds`, and the README names the one-time Playwright browser install; this pin is what is left.

pnpm 12.6 records a checksum for every platform build of the pinned Node in the lockfile, including the musl builds that only unofficial-builds.nodejs.org publishes. It fetches them even with `supportedArchitectures` narrowed to glibc. The lane box's egress policy refuses that host, so the lockfile entry cannot be made there. Run `pnpm runtime set node 26` in the repository root on a box that reaches it, commit the `package.json` and `pnpm-lock.yaml` change, and delete `.nvmrc` in the same commit once CI reads the new pin. Until then `engines.node` with `engineStrict` in pnpm-workspace.yaml refuses a wrong Node, and `.nvmrc` feeds version managers and CI.

## Why

The goal is that the app runs on everyone's machine with pnpm install and pnpm start.

## Done when

A clean machine with only pnpm installs, starts and runs one CT file with no manual step beyond the documented browser install.

## Evidence

Filled at landing: what ran and where its output is.
