---
kind: reference
status: active
updated: 2026-07-24
---

# tests/e2e/support — doctrine

## Machinery, not hand-rolls

`trpc.ts` is the ONE wire path — specs read/mutate canon via its typed helpers, never a hand-rolled
`fetch`/batch shape. `chat-room.ts` is the ONE DOM/bus interaction surface for the chat room. `virtualizer.ts`
is the ONE scroll-sweep for the windowed message list. A new spec needing API or DOM machinery extends the
matching module (add-only) — it does not inline its own.

## `.first()` / `.last()` — when it's legitimate

Strict-mode multi-match forces a pick. It's a DELIBERATE choice, not an escape hatch, only when:

- the target is genuinely order-defined (newest/oldest row, list-desc-by-updatedAt row 0) and the spec says
  so in a comment, OR
- no identity (message id, canon row) is available yet at that point (e.g. waiting for a row to APPEAR
  before its id can be read).

When an id IS available (from `listCanon`, a mutation's return value, a divider's `data-message-id` sibling),
use `messageRow(page, id)` / `assistantRows(page)` (chat-room.ts) instead of a positional pick on the whole
row set — strict-mode-safe by construction, not order-dependent.

## Virtualizer sweep (`virtualizer.ts`)

The windowed message list (`@orb/ui/message-list`) never mounts every row — only the current virtual window
(+ overscan) exists in the DOM. `collectVirtualRows(page)` scroll-sweeps top-to-bottom, dedupes by
`data-message-id`, and returns every row once regardless of transcript length.
`assertVirtualListMatchesCanon(page, canon)` compares the sweep to `listCanon()` (order + whitespace-normalized
containment, same posture as `live-turn-canon-parity.spec.ts`'s `domTranscript`). Use these instead of reading
`[data-message-id]` once at rest whenever the transcript can exceed the viewport — a short-transcript spec
where everything is always mounted doesn't need the sweep.

## Rotation-2 idioms (minted, keep using)

- **Base UI select, live-drive:** click the trigger → `expect(listbox).toBeVisible()` → pick the option by
  `getByRole("option", { name })` (identity, never positional `.first()`) → assert the listbox hidden.
  Clicking through the open animation before it's stable gives a "not visible" flake.
- **Debounced autosave:** a DOM attribute driven by a debounced save lags the UI action by
  debounce+save+bus-refetch. Gate the assertion on a SERVER-state poll (re-read via `trpc.ts`), not a fixed
  wait — it also proves the value actually persisted, not just that the DOM painted.
- **Disabled-affordance CTs:** assert `aria-disabled` + a `title` naming the unlock condition +
  activation-prevention (the click/keypress does nothing) — all three, not just one.

## Ports

Every mode stack, the OIDC issuer and the fixture provider bind fixed base ports from the registry
(`tooling/src/floor/host/ports.ts`). A second e2e run on the box sets `E2E_PORT_OFFSET=<n>` (a multiple of 10,
for example `10` or `20`) to shift all of them together; `modes.ts` reads it into `E2E_RUN_PORTS`, which specs use
instead of the registry's base rows. An offset that would land on a reserved row or a stage band is refused.

## Provider tapes

A spec that needs model turns plays a recorded provider tape instead of a live engine. `tape-provider.ts` serves the tape on loopback, and `pinChatToTape` (`trpc.ts`) binds `chat` to it through a custom endpoint connection. It never binds `summarize`: background summarize work runs on its own clock and would send requests no journey step names. The tapes live in `tests/support/node/provider-tapes/`.

1. Name every request the journey sends, in order, as the steps passed to `startTapeProvider`. A post-commit round counts: on a loopback endpoint the RPG loop falls back to a state round after the turn.
2. Re-record after a journey changes its requests: run `OPENROUTER_API_KEY=<key> pnpm e2e:tapes:record`. The recording forwards each request to OpenRouter with a lowered output ceiling, scrubs ids, cost and routing fields, and writes the tape under the gitignored `reports/provider-tapes/`. The script copies the tapes into `tests/support/node/provider-tapes/` only when every journey passed.
3. Commit the changed tapes. `tests/support/node/provider-tapes.int.test.ts` refuses a tape that does not parse, holds a key-shaped string or names a non-loopback host.

A replay refuses a request beyond the tape and a request whose tool set differs from the recorded one, and disposal fails on an unplayed step.

## Artifacts

`reports/e2e-results/` (trace/screenshot on failure) is WIPED by the next run. Read a failing run's
artifacts BEFORE re-running — a repro lost to an instant re-run is not recoverable.

## Suppression-marker placement

`ONESHOT-OK` / `FABRICATION-OK` markers key on the EXPRESSION START line. A biome reflow can move a
multi-line expression's start without moving the marker comment, silently orphaning it (the marker no longer
covers what it was meant to). Re-check marker placement after any reflow touching a marked expression.
