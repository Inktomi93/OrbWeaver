---
kind: review
status: draft
updated: 2026-08-29
---

# Board re-derivation: #798, #801, #802, #774, #778 (scout pass)

Main HEAD at time of check: `e4d017fd8` (clean). All five rows' claimed work is found ON MAIN via
dedicated commits, not on any unmerged branch.

## #798 — plugin remote-image capability (net.fetchAsset + character.ingestAsset)

**✅ DONE-ON-MAIN.** Commit `72dbcc9e5` ("feat(plugin): net.fetchAsset + character.ingestAsset +
bindable detail hero (#798)").

- Capability + host handler: `packages/server/src/infra/plugin-host/membrane.ts:1559-1594` —
  `attachAsync(ctx, net, {name: "fetchAsset", ...})` requires capability `net.fetchAsset`
  (line 1572), routes through `safeFetch` with the manifest allowlist (never guest-supplied host),
  validates via `isAllowedImageBuffer` (magic-byte sniff), then calls
  `runtime.bridge.assets.storeFetched(bytes, sniffed.mime)`.
- `storeFetched` wired at `packages/server/src/entry/compose/automation-plugin.ts:712-716`: stores
  with `kind: "generated"` in the installer's own CAS, returns `{assetId}` only — no URL ever
  reaches the guest.
- `character.ingestAsset` declared in `packages/server/src/domain/plugin/contract/ops.ts:344-347`
  (rides the existing `character.ingest` grant).
- Rung reached: called in a live path + tests. `tests/server/infra/plugin-host/membrane.test.ts`
  gained 170 lines in this commit; CT coverage in
  `tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx`.

**CLOSE RECOMMENDATION: close.**

## #801 — plugin egress belt split (net.fetchAsset own budget)

**✅ DONE-ON-MAIN.** Commit `80908a0d8` ("feat(card-atlas): hub v1.2 ... belt+cap split (#801)").

- `PLUGIN_ASSET_EGRESS_PER_HOUR = 1200` — new constant,
  `packages/server/src/domain/plugin/substrate/rate-floor.ts:52`.
- `PLUGIN_EGRESS_PER_HOUR` raised 120→360 — same file, line \~39-45 (diff confirmed;
  `git show 80908a0d8 -- .../rate-floor.ts`).
- New byte cap `PLUGIN_ASSET_MAX_BYTES = 5_242_880` (5 MiB) —
  `packages/server/src/infra/plugin-host/budgets.ts` (added by same commit).
- Enforcement: `membrane.ts` fetchAsset handler now calls `runtime.bridge.admitAssetEgress()`
  (own belt) instead of the old `admitEgress()` shared call, and uses `PLUGIN_ASSET_MAX_BYTES`
  for both the fetch options and the image-guard cap (`membrane.ts` diff in `80908a0d8`).
- `admitAssetEgress` defined at `packages/server/src/domain/plugin/substrate/bridge.ts` alongside
  the pre-existing `admitEgress` (line 288), wired at compose
  (`packages/server/src/entry/compose/automation-plugin.ts` — `createPluginRateFloor(now, {
  capability: "net.fetchAsset", limit: PLUGIN_ASSET_EGRESS_PER_HOUR })` pattern, mirroring the
  existing `net.fetch` wiring at line 471).

Rung reached: exported constant, called in a live enforcement path (the membrane host handler),
with test deltas in the same commit (`membrane.test.ts`, `escape.suite.test.ts`,
`confirmed-act.test.ts`).

**CLOSE RECOMMENDATION: close.**

## #802 — plugin-fetched CAS assets are GC-bait (no ASSET\_REFS coverage)

**⛔ NOT-STARTED — the row's claim is CONFIRMED TRUE and unaddressed.**

- The FK-based live-reference registry is
  `packages/server/src/domain/assets/persistence/asset-refs.ts:38-62` (`ASSET_REFS`). It enumerates
  `characters.avatarAssetId`, `personas.avatarAssetId`, `galleryItems.assetId`,
  `imageryGenerations.assetId`, `messageAssets.assetId`, `messageReactions.emojiImageAssetId`,
  `documents.sourceAssetId`, `plugins.bundleAssetId`, `adminDistributedPlugins.bundleAssetId` —
  **no plugin-fetched-asset column exists in this list**, and there is no `kind`-based exemption
  either (GC keys off FK/JSON presence, not `assets.kind`).
- `net.fetchAsset`'s `storeFetched` (automation-plugin.ts:712-716) writes `kind: "generated"` with
  **no accompanying FK write** — the guest gets back a bare `assetId`; if the plugin only *displays*
  it (the #798 "bindable detail hero" UI arm) rather than calling `character.ingestAsset`, nothing
  in the DB ever points at the row.
- The only protection is the GC grace window
  (`packages/server/src/domain/assets/verbs/collect-garbage.ts:21-23,54-55`,
  `DEFAULT_GRACE_MS`) — a put→link timing buffer, not a durable reference. Once grace expires an
  un-ingested, only-displayed plugin-fetched asset is reaped by `collectGarbage`.

Search method: `Grep` for `ASSET_REFS|assetRefs|asset_refs` across `packages/` (non-test) → 5 files,
all read; `ast-grep` cross-check via `grep -rn "storeFetched"` (3 call sites, all read) confirms no
additional registry write accompanies the plugin CAS write.

**CLOSE RECOMMENDATION: keep open (genuinely unaddressed defect).**

## #774 — seeded example plugins upgraded to full UI plane

**✅ DONE-ON-MAIN.** A long commit train (`f217adec6` origin U1 demo → `f5c47b920` ARM C vocab →
`989a3bea9`/`cb0996d53` checkpoints → `eefe770d7` keepsake-camera + card-atlas → `bf7b3a14b`/
`690d2c6ec` published SDK mirror → `906cca256` "merge(#774): plugin showcase set + ARM C
bound-collection + published SDK").

- `packages/server/src/entry/boot/seed-assets/plugins/` now holds 8 directories: `pocket-arcade`,
  `research-familiar`, `affinity-tracker`, `oracle-deck`, `story-clocks`, `keepsake-camera`,
  `draft-polish`, `card-atlas`, `scene-chips` (9 counting scene-chips) — more than the original
  five-plugin baseline the row references, and includes `card-atlas` which (per #801 above) drives
  the full node union including `net.fetchAsset`/bound-collection (`grid.tilesFrom`,
  `image.assetFrom`) arms.

Rung reached: files exist, named by commit subjects as the delivered feature, exercised by
`tests/.../seed-example-plugins.int.test.ts` (touched in the `80908a0d8` #801 commit too, 57-line
delta). Did not read every seeded bundle's full body line-by-line to enumerate exactly which node
kinds each individually exercises — the commit-train breadth (ARM C, published SDK, per-plugin
READMEs, card-atlas's 917-line `main.js`) is strong evidence of "full UI plane," but a
symbol-by-symbol per-plugin node-kind audit was not performed.

**CLOSE RECOMMENDATION: close** (with the caveat above if the orchestrator wants a stricter
per-node-kind receipt before closing).

## #778 — surface-state 64-key belt / LRU eviction

**🕓 OWNER-GATED / PARKED — code confirms the row's own premise verbatim, no eviction landed.**

- Cap: `PLUGIN_SURFACE_STATE_MAX_KEYS = 64` —
  `packages/server/src/domain/plugin/substrate/surface-state.ts:42`.
- The file's own header comment (lines 38-41) states: *"The priced revision — per-plugin byte
  budget rather than key count, or an LRU over rooms — is board row 778, parked until a real plugin
  hits this."*
- `createPluginSurfaceStateStore` (`surface-state.ts:63-108`) implements only count-and-refuse: a
  new key past the cap throws (`ui.setState refused`, line 89-93); no eviction, no LRU, no
  byte-budget alternative exists anywhere in the file or its callers
  (`packages/server/src/domain/plugin/verbs/get-surface-state.ts`,
  `packages/server/src/domain/plugin/activation/deactivate.ts` only read/clear, never evict).

**CLOSE RECOMMENDATION: owner** (this is a deliberately parked wake-condition row, not a stale one —
its wake condition, "a plugin hits the 65th-room refusal," has not fired on the evidence gathered;
keep parked, do not close as done and do not treat as ready work).
