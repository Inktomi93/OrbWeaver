---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: plugins
lane: wt/agent-a84eabc3e8d8f0a49
---

# One event counts as one plugin broker loss, and the halt names the plugins active at each loss

## What

When the plugin broker watchdog stops itself, `packages/server/src/infra/plugin-host/process-runtime.ts` counts the loss twice: once for the watchdog's stopped report and once for its exit. The halt that D347 sets at a stated count of losses inside its window is therefore reached by fewer real events. The halt also records the same reason on every enabled plugin of each affected owner and does not say which plugins were active at each loss. Evidence: the security review of the lane's fifteenth leg under reports/review.

## Why

The decision states a bound the code does not keep, and an owner told that plugins stopped cannot tell which plugin to remove.

## Done when

One watchdog stop counts as one loss, proved by a test through the production watchdog with the injected clock, and the halt record names the plugins that were active at each counted loss where plugin health is shown.

## Evidence

Filled at landing: what ran and where its output is.
