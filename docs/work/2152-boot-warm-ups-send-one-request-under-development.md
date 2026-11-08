---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a7572929e5e574748
plan: cross-surface-consistency
---

# Boot warm-ups send one request under development React

## What

useWarmSavedRosters sends rosterPreset.list twice on a Chats boot under development React: the effect replays while the query is still pending with no data, so the cache check misses. Its CT passes on the first moment it sees one call. Warm through the query client's own deduplicating prefetch, check other warm-ups that use the same check-then-fetch shape, and make the CT count requests after the network settles.

## Why

A duplicate boot request in development hides the real request count that production tests and reviews read, and the same shape may duplicate elsewhere.

## Done when

A Chats boot sends exactly one rosterPreset.list request under development React, measured after the network settles, and the CT fails when a second request goes out.

## Evidence

Fixed at the cause, which was the component-test runtime, not the warm-up. `tests/support/browser/ct-runtime.ts` cleared the query cache in its layout-effect cleanup, and StrictMode runs that cleanup between its two effect passes, so every boot read in flight was dropped and sent again (the boot batch carried `chat.listChats` and `notifications.list` twice too). The cache now clears only when no mount is left after the replay. The production root (`packages/client/src/main.tsx`) never clears the cache, and `queryClient.query` already joins a fetch in flight (`Query.fetch` returns the running retryer), so `useWarmSavedRosters` and the other warm-ups of that shape (`use-display-scripts.ts`, `use-prefetch-room.ts`) keep the peek-then-query form the client rules prescribe.

`tests/client/features/app-shell/surfaces/shell-warm-rosters.ct.tsx` counts after the first answer lands and a one-second absence window: red on the base runtime (2 requests), green after (1). A planted second request in the hook turns it red. The old assertion compared input arrays with `toEqual([undefined])`, which also passes for three requests.
