---
kind: review
status: draft
updated: 2026-08-29
---

# Board re-derivation — server rows (scout, main @ e4d017fd8)

## #788 close remaining ST-parity gaps (seam-11 CAS assets + worldInfo.read + character.\* etc)

PARTIAL. Sub-items landed piecemeal:

- worldInfo.read/list (F12): DONE — `membrane.ts:857-883` HOST_FUNCTIONs `worldInfo.listBooks`/`listEntries`,
  wired through `domain/plugin/contract/ops.ts:141-146` and `domain/plugin/substrate/bridge.ts:143-171`. rung: called in live path (membrane dispatch).
- search/RAG query host fn (F1): DONE — `search.query` capability, `membrane.ts:933` `search.documents`,
  `host-v1.ts:671-673` capability map, `domain/plugin/contract/ops.ts:175`. rung: called in live path.
- character.read (reduced roster): NOT FOUND. Only `character.ingest`/`character.ingestAsset` (write) exist
  (`membrane.ts:1162-1201`). Grepped `character\.read|character\.list` across contracts/plugin/host-v1.ts and
  membrane.ts — zero hits.
- tokens.count host fn: NOT FOUND — zero hits for `tokens.count`/`tokens\.count` anywhere under
  contracts/plugin or the plugin-host membrane.
- Seam-11 (bundle UI assets → installer CAS): NOT DONE. `packages/contracts/src/plugin/ui.ts:263` comment
  still reads "large assets ride the bundle `ui/assets/` → installer-CAS route (seam 11), which is a later phase."
  RECOMMENDATION: keep — 2 of 5 sub-items done (worldInfo.read, search.query), 3 remain (character.read, tokens.count, seam-11 assets). Board issue body should be updated to mark the two done pieces so remaining work is scoped correctly, but do not close.

## #794 batch/atomicity cleanups (refinery + distill)

NOT STARTED.

- `packages/server/src/domain/refinery/verbs/submit-manual-rewrite.ts:92-93` (actually lines ~89-90 currently):
  still two SEPARATE calls — `await ctx.db.insert(refineryRuns).values(view);` then
  `await ctx.db.update(refinerySessions).set(...)` — not wrapped in a single `db.batch(batchMany(...))`.
- `packages/server/src/domain/discovery/verbs/distill.ts:310-318` `commitSummaries`: still takes
  `stmts: readonly BatchItem<"sqlite">[]` and does `await db.batch(chunk as [BatchItem<"sqlite">, ...])` —
  the raw `as` cast the issue calls out is still present, not routed through `batchMany` from
  `packages/db/src/kit/batch.ts`.
  RECOMMENDATION: keep — neither fix has landed; negative confirmed by reading both files in full plus reading `batchMany`'s definition (kit/batch.ts) which is not referenced from either site.

## #795 cross-tenant sweep write-IDOR completeness audit

LIKELY DONE (or very close). `tests/server/transport/cross-tenant-sweep.suite.int.test.ts` is saturated with
"post-sweep integrity re-read" comments/logic across essentially every owner-scoped write probe (persona,
preset, world-info, tag, refinery, chat/game, workloads, documents, plugins, credentials, automation rules,
budgets, presets order, tier placement, etc. — 40+ distinct "integrity re-read" references found across the
file). This reads as the completeness audit already executed, not merely #755's original scope. I did not
do a line-by-line audit of literally every UPDATE/void-write probe against a re-read (that is the actual
"done criteria" and would need enumerating every tRPC write route + cross-checking), so I can't certify
100% completeness, but the volume/pattern strongly suggests #795's work is either done or nearly done.
RECOMMENDATION: keep but downgrade priority / flag for a closer completeness pass (verifier-tier), or ask
orchestrator to spot check 3-5 owner-scoped UPDATE routes not mentioned above before closing.

## #84 \[PARKED] ST import: Data Bank + gallery write-waves

OWNER-GATED, wake condition NOT met. `packages/server/src/domain/import` has no databank/gallery write-wave
code — grepped `databank|gallery` under domain/import: only 3 files matched (contract/views.ts,
substrate/background.ts, loader/collect.ts) and none implement an upload/add-to-gallery write wave (these are
generic import scaffolding, not databank/gallery-specific writes). Wake condition is "owner re-stages
.st-data with both profile dirs" — no evidence of that happening (no recent commits referencing it).
RECOMMENDATION: owner — stays parked, wake condition unmet.

## #595 \[PARKED] location-scoped fire-on-presence lorebook activation

OWNER-GATED, wake condition NOT met. No presence-activation/scope-junction code found:
`grep -rn "fireOnPresence|fire-on-presence|presence"` under domain/world-info returns only one unrelated hit
(`persistence/queries.ts:172`, about scope-mode heuristics, not fire-on-presence). No GATHER-branch or
scope-junction activation code landed.
RECOMMENDATION: owner — stays parked, wake condition (owner opens the idea) unmet.

## #676 \[PARKED] automation quiet-hours are UTC

STALE-PREMISE CONFIRMED VALID (i.e. still a real, unfixed limitation — not stale). `domain/automation/substrate/dry-run.ts:23`
still computes `hour: d.getUTCHours()` with no timezone binding; `domain/automation/contract/presets.ts:169-176`
still documents "THE HOURS ARE UTC" and no `now.localHour` or per-user timezone threading exists anywhere
(searched presets.ts and dry-run.ts in full — no tz-related additions). Row's factual premise is intact.
RECOMMENDATION: owner — stays parked, wake condition (felt pain / owner opens it) unmet, code confirms wart still exists as described.
