---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: release
lane: wt/agent-ad0e85a8b8ba4ff64
---

# Install and image comments and knobs match what the scripts do

## What

The `Dockerfile` prod-deps comment says every patched dependency is a dev tool; several are production dependencies of the deploy graph. `install.cmd` ignores the `ORB_MODE` knob that `install.sh` honors. `docker/orbweaver.local.env.example` does not say that `PORT` moves the listener away from the published mapping in the base compose shape. No CI job runs `install.sh` or `update.sh`. Source: `docs/work/codebase-review/units/scripts-patches.md` and `install-run.md`.

## Why

The installer is the first thing a new user runs, and its logic is tested only by hand.

## Done when

The comment names the two patch classes. `install.cmd` reads `ORB_MODE` before it asks. The env example names `ORB_PORT` as the knob for the shipped shape. A nightly step runs the checkout's own `install.sh` against a scratch directory and then `update.sh --no-start`, or the item records why that cannot run on a hosted runner.

## Evidence

Filled at landing: what ran and where its output is.
