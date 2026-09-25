---
kind: tooling
status: open
updated: 2026-09-24
priority: P1
area: tooling
---

# Derive worker caps from the machine and drop the Linux-only tooling paths

## What

Make every concurrency cap derive from the machine through Node, and port the Linux-only pieces a contributor on macOS or Windows hits. (1) tooling/src/\_shared/concurrency-profile.ts keeps each profile's numbers as ceilings and adds a per-unit cost (cores and MB per worker plus a base) for each knob; the reader takes the smallest of the ceiling, the cores bound and the memory bound, scaled by the profile's share of the machine, never below 1. Cores come from os.availableParallelism(), memory from process.constrainedMemory() with os.totalmem() as the fallback. Measured: a ts7 aggregator check is about 4.2 GB plus 0.6 GB per checker. (2) The edit hook reads the derived caps through Node, not raw jq, and its flock, stat --format and jq uses move to a Node port of the hook. (3) The verify host-slot pool replaces flock and /proc with a Node lock. (4) Biome gets a thread cap if Biome 2 has a real one. (5) Per-process caps do not stop several processes each sizing to the whole machine: add a host-wide slot pool for whole-program ts7 runs, sized from memory the way `ctRunnersHostWide` bounds browsers, and route `pnpm typecheck`, the vitest typecheck projects and the edit hook through it. Measured: four lanes each running a 4 to 5 GB tsc on a 13.4 GB box OOM-killed tsc, node and browser processes alike. (6) Retire the cgroup quota: the SessionStart fence hook and the profile's `sessionCpuQuotaPct` and `sessionMemoryHigh` fields set systemd CPU and memory quotas that exist only on Linux with systemd; the derived caps size the work instead, and `process.constrainedMemory()` already reads a cgroup limit where one exists. The stack tooling stays Linux-only by D252.

## Why

The caps were tuned for one 24-core 48 GB box and know nothing about the machine they run on, so a 15 GB box OOM-kills tsc under pnpm check, and the hook and the verify slot pool need Linux tools.

## Done when

On a 15 GB 4-core box pnpm check and pnpm test:types finish with no OOM kill, measured by peak RSS before and after; the big box keeps its current caps; the hook suite and the host-slot tests pass on the Node paths.

## Evidence

Filled at landing: what ran and where its output is.
