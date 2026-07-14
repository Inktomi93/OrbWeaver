# Spine-Testing doctrinal lineage — frozen 2026-07-13

> **Frozen 2026-07-13, extracted from `core/Spine-Testing.md`.** The neo-tavern provenance and dated
> migration events that used to sit inline in the testing spine. The LIVE law (the rules these choices
> produced) stays in `core/Spine-Testing.md`; this is the WHERE-IT-CAME-FROM, kept findable but out of
> the law. The fuller neo-mining record is `history/neo-test-steal-list.md`.

## Where each choice came from (vs neo-tavern)

- **One centralized `tests/` tree + KIND-by-suffix** was chosen AGAINST neo-tavern's category-directory
  split (neo grouped tests into per-category directories; orb derives the path as a prefix-swap mirror
  and marks the KIND with a filename suffix so a lane = a glob/`--project` filter). The browser-runner
  half — Playwright, never Vitest browser-mode — was taken from neo's proven doctrine.

- **Vitest browser-mode is FORBIDDEN** because cold-cache dep-discovery hangs. neo-tavern hit this and
  migrated off it on 2026-06-20; orb never adopted it.

- **`isolate: true` kept (NOT neo's `isolate: false`).** neo ran `isolate: false` for a 2–3× suite
  speedup and accepted the reset-discipline footgun that comes with a shared module graph. orb declined:
  a fresh graph per file resets the single-tenant `globalMacroRegistry` for free, and the speed isn't
  worth the discipline tax.

- **The `extends: true` per-project trap.** neo-tavern's root `test` rigor defaults (isolate/restoreMocks/
  etc.) were DEAD config because its projects omitted `extends: true` — the per-runner options never
  reached a project. orb's config sets `extends: true` on every project so the root defaults actually
  apply; this is the latent trap the config header warns against copying.

- **The scripted tape/runner** (`tests/support/chat/tape.ts`) was re-derived from neo's
  `tests/support/harness/` tape/runner (steal-list N4), not transplanted — the divergences (ONE
  `runChatTurn` seam vs neo's split group/solo runners; loud under-script exhaustion vs neo's cycle;
  rate-limit/error as a thrown `ProviderError` vs a response field) are documented in the fixture header.

## Mutation ratchet — neo's founding numbers

The Stryker gate class ("a surviving mutant is a covered-but-unchecked line") was founded on neo's
`isVllmBackend`-lying-gate class — a gate whose test asserted presence-of-behavior without asserting
correctness. neo's measured history: aggregate mutation score climbed 55.41% → 66.31% over one hardening
pass, with `break` held \~6 points under (at 60). orb's `break` stays `null` until its own measured run
calibrates it, then ratchets up as a backslide floor.
