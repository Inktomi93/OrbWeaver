---
kind: design
status: active
updated: 2026-08-14
---

# Prod-build CLS lead — investigation only, no fix

**Status:** INVESTIGATION. Confirms the prod launcher exists; does NOT run a prod measurement — blocked
on a prod-build window (see below), not forced.

## Background

Side-eye measured home-boot CLS 0.134 on the DEV stack (over the 0.1 budget) and retracted attributing it
to the databank tile — the F14 reservation is byte-exact — leaving the suspicion that 0.134 is a cold
dev-module-graph artifact rather than a real layout-shift defect. This investigation was asked to confirm
or refute that against a PROD build, if the check is cheap.

## Does the prod launcher exist?

Yes. `scripts/dev/stack.sh` mode-dispatches to `scripts/dev/stack-prod.ts` for
`pnpm stack up|down|restart|status prod`:

- `scripts/dev/stack.sh:2` — "PROD routes to stack-prod.ts"
- `scripts/dev/stack.sh:8` — `pnpm stack up|down|restart|status [dev|prod] [--debug]`
- `scripts/dev/stack.sh:112-114` — "PROD routes the WHOLE invocation to scripts/dev/stack-prod.ts and
  never returns... nothing below this block runs in prod mode, because prod has no vite, no engines
  management, and no \[dev machinery]"
- `scripts/dev/stack-prod.ts:15` — "detached production server, no vite, no build step" at the
  supervisor level — i.e. `stack-prod.ts` ADOPTS/manages a running server but does not itself run the
  client build; a client-dist preflight is a documented precondition, so a prod run needs a pre-built
  `packages/client` dist staged before the supervisor starts.

## Is the check cheap right now? No — port collision with the live dev stack

`scripts/dev/stack-prod.ts:64` — `DEFAULT_PORT = 8788`, the SAME default backend port
`scripts/dev/stack.sh:81` uses for dev (`BACKEND_PORT="${PORT:-8788}"`). Prod serves the built client
dist off the same server process/port (no separate vite port in prod).

Live-port check at investigation time (`ss -ltnp` / `lsof`):

```
LISTEN  127.0.0.1:5173   node-MainThread pid=2358127   (dev vite — live)
LISTEN  *:8788           node-MainThread pid=3377495   (dev server — live)
```

The dev stack is live and answering on :8788/:5173 right now (other lanes' work depends on it — this
batch was explicitly scoped "collision-free with the live client lanes"). Standing up `pnpm stack up prod`
would either refuse (port already held — `scripts/dev/stack-prod.ts:379`, "is also the ... port ... Stop
that first, or point PORT elsewhere") or require overriding `PORT` to a second port, which still needs a
FULL client production build staged first (no build step in the supervisor itself — that has to happen
out-of-band) and a second full server boot standing beside the live one. That's not a bounded/cheap step;
it's a real prod-build-and-boot window that would need to be scheduled when the live dev stack (and
whatever other lanes depend on it) isn't in use, or run on an explicitly separate `PORT`.

## Verdict

**Blocked on a prod-build window** — not run. The DEV-stack number stands as the only measurement on
record: **home-boot CLS 0.134** (over the 0.1 budget), per side-eye's report, with the databank tile
already cleared (F14 reservation byte-exact) and cold-dev-module-graph flagged as the leading (unconfirmed)
suspect. A future lane should run this when a prod-build window is available (either after the live dev
stack is torn down, or on an explicit non-8788 `PORT`) — `pnpm stack up prod` after staging a client
production build, then re-measure home-boot CLS the same way side-eye did.
