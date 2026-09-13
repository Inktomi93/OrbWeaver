---
kind: review
status: draft
updated: 2026-08-29
---

# test-presence gate — board re-derivation (#772, #773)

Main at `e4d017fd8` (clean).

## Gate mechanics found

`tooling/src/verify/gates/test-presence.ts`:

- Domain arm is DEMAND-BY-DEFAULT (landed #767, commit `b52fd38d4`, merged `f54644386`): any file
  under `DOMAIN_DIR = "packages/server/src/domain/"` with runtime/callable logic is demanded a
  mirror test, exempt only by shape (`index.ts` barrels, zero-logic `service.ts`/`context.ts`
  roots, error-class-only `contract/` files) — `test-presence.ts:2,17,45`.
- A committed DEBT baseline (`tooling/src/verify/gates/test-presence.baseline.json`) whitelists
  the currently-known-untested demanded files so the gate stays green while the backlog burns
  down; any row whose file gains a test goes RED-stale until the baseline shrink is committed
  (single writer `gen-test-presence-baseline.ts`, per the #772 issue body).
- **No entry/ or transport/ arm exists anywhere in the gate** — grepped `test-presence.ts` and
  `contract-verb-presence.ts`/other gates for `entry`/`transport` demand logic; none found. Only
  the domain tree is scanned (`test-presence.ts:17`, `322`).

## #772 — domain DEBT burn-down

- `tooling/src/verify/gates/test-presence.baseline.json`: **72 rows**, unchanged since it was
  authored at `f54644386` (#767 merge, 2026-08-28). `git log --oneline -- <baseline file>` shows
  exactly one commit touching it — the creation commit. No burn-down/shrink commit has landed.
- Matches the #772 pinned comment's own re-derived residual (72 ledger rows, family partition:
  substrate 54, named subsystems 7, engine 3, contract-with-real-logic 3, guard 2, memory 2,
  feature-root singleton 1) — comment posted 2026-08-28 06:45, tree is unmoved since.
- Exemption list: still only the shape-based exemptions (barrel/service-root/error-class), no
  additional slot exemptions added.

**VERDICT: ⛔ NOT-STARTED** — 72 of 72 residual rows remain, zero cleared since the baseline was
authored. Counts are current and accurate, not stale.
**RECOMMENDATION:** keep open as-is; ready to dispatch family-sized burn-down lanes per the
existing partition in the pinned comment (substrate first, highest yield).

## #773 — entry/transport demand arm

- Confirmed structurally: the gate has **zero** entry/transport coverage today — the row's premise
  ("the current test-presence demand never covers entry/transport") holds on current main.
- The row's own cited counts (entry/ 18 untested of 68 callable; transport/ 7 untested of 20; 25
  total) come from the #767 lane's survey, not from a re-run here — the gate itself computes no
  such number since it doesn't scan those trees. Re-deriving 18/68 and 7/20 exactly requires the
  same exemption-shape analysis the issue asks for as its deliverable (what's wiring-exempt by
  law vs. real logic in `entry/compose`, `entry/*`, `transport/*`) — that is design work, not a
  cheap gate-accounting pull, so I did not attempt to independently re-count file-by-file.
- Sanity check: `packages/server/src/{entry,transport}` currently hold 188 tracked files total
  (`git ls-files … | wc -l`), consistent with an ~88-callable subset (68+20) being plausible in
  scope, though this doesn't confirm the exact split.
- No commits since the #767 survey touch entry/transport test coverage in a way that would shrink
  this (no new `.test.ts`/`.int.test.ts` additions found under those trees post-survey via the
  git log of the era).

**VERDICT: ⚠️ STALE-PREMISE-RISK (unconfirmed, likely still ~accurate)** — the *existence* of the
gap (no gate arm at all) is solidly confirmed. The exact "25 untested / 18+7" headline number is
inherited from the #767 lane's survey and was not independently re-run here; nothing on the tree
since would have moved it, but it was never a gate-computed number to begin with (no arm exists to
compute it).
**RECOMMENDATION:** keep open; before widening, dispatch the exemption-analysis step named in the
issue body as its own first deliverable (do not blanket-demand entry/compose, which is wiring-only
by convention) — resize only if that analysis lands a materially different count than 25.
