# 1041 s5-css-topology-tests-1

Shard target: runtime-test. Gates: `playwright-css-topology`, `sanctioned-css-homes`, `density-tier-slot-map`, `z-index-tier-health`. All four are replaced by Node tests and deleted.

## Successors

| Gate | Successor | Cadence |
| - | - | - |
| `sanctioned-css-homes` | `tests/client/styles/css-home-topology.suite.test.ts` (homes block) | per-push Node CI |
| `playwright-css-topology` arms A-E | `tests/client/styles/css-home-topology.suite.test.ts` (front-door block) | per-push Node CI |
| `playwright-css-topology` arm F (CT config) | `tests/tooling/playwright-ct-css-front-door.test.ts` | weekly tooling proof |
| `density-tier-slot-map` | `tests/ui/styles/tier-slot-map.suite.test.ts` | per-push Node CI |
| `z-index-tier-health` | `tests/tooling/z-index-implementation-homes.test.ts` | weekly tooling proof |

The two weekly placements are tooling self-claims: the CT config and the lint home table that `eslint.config.js` reads. Primary rules on cadence.

## Records

### sanctioned-css-homes

- Parity: 5 mustFlag / 2 mustPass / 1 mustRefuse ported, 0 lost. Rows are path lists fed to `homeFindings`.
- Plant: untracked `packages/client/src/features/chat/liveness.css`. The live test went red, exit 1: `stylesheet outside the closed set of homes: packages/client/src/features/chat/liveness.css`. Plant deleted.
- Deleted: the gate, `tooling/src/verify/lib/css-home-topology.ts` (its only importers were the two gates), its liveness arm in `_liveness/resources.ts`.
- Lost claim: the family-suite pins for a symlink under `packages/` and for the receipt pair are framework artifacts. A symlinked home now fails the `lstat` regular-file check. Gitignored files are no longer seen, where the old fs walk skipped only `dist`, `node_modules`, `.git`, `.cache`.
- Waivers and grants: 0 markers, 0 grant rows, no budget row.

### playwright-css-topology

- Parity: 13 mustFlag / 3 mustPass / 5 mustRefuse ported, 0 lost (the closed-graph arm D claim is expressed by `assertSanctioned`, see Plant 3). Arms A-E run over the real tree with one planted change per row; arm F rows are plugin-name lists and config text.
- Plant 1: `playwright/index.tsx` import `@orb/client/styles` replaced by `../packages/client/src/styles/globals.css`. Live test red, exit 1: `CT must import @orb/client/styles and no product or harness stylesheet directly`. Reverted.
- Plant 2: `playwright-ct.config.ts` plugin order swapped to `[tailwindcss(), CT_CSS_SOURCE_PLUGIN]`. Live test red, exit 1: `CT config must register the harness source extension BEFORE Tailwind compiles it`. The old gate compared text offsets of the plugin definition and the Tailwind call, so it could not see this swap. Reverted.
- Plant 3 (arm D closure): `@import "tailwindcss/theme.css";` added after line 4 of `packages/client/src/styles/globals.css`. Live test red, exit 1: `production CSS graph is incomplete (... unresolved=packages/client/src/styles/globals.css → node_modules/.pnpm/tailwindcss@4.3.3/node_modules/tailwindcss/theme.css is outside the sanctioned stylesheet homes)`. Reverted. The first draft of the walk followed any existing stylesheet and stayed green on this plant; `assertSanctioned` now refuses any root or `@import` target outside the five homes, as the old `cssGraph` did (only bare `tailwindcss` is exempt). Rows added: an existing third-party stylesheet and an existing harness stylesheet (`playwright/index.css`) imported into client globals; the old missing-file row now reads the outside-homes message. The new rows ran red against the previous walk (2 failed, 26 passed), then green.
- Deleted: the gate, `_liveness/multi-root-b.ts` arm, `tests/tooling/verify/gates/css-home-topology-family.suite.test.ts`, and the five exact-file ids only this gate used (`client-entry`, `client-css-entry`, `app-shell-surface`, `ct-boot`, `ct-extension-css`) from `contract/resource-exact.ts`. The three infra tests that used them as fixtures now use `vitest-config` and `playwright-config`.
- Strengthened: `.css` imports are read with TypeScript's scanner, so the CT-boot string-literal limit is gone; dynamic `import()` and `require` of `.css` in `tests/` now count; the CSS graph and the harness `@source` come from Tailwind's own compiler.
- Lost claim: the family-suite receipt and `unresolved` status pins are framework artifacts. The target clause of arm F stays a text check over comment-free code tokens, as before.
- Waivers and grants: 0 markers, 0 grant rows, no budget row.

### density-tier-slot-map

- Parity: 3 mustFlag / 2 mustPass / 1 mustRefuse ported, 0 lost.
- Plant: untracked `packages/client/src/features/chat/components/liveness-rogue-slot.tsx` stamping `data-slot="list-row-root"`. Live test red, exit 1: `ROGUE STAMP: data-slot="list-row-root" is mapped by packages/ui/src/styles/tiers.css but stamped at ...`. Plant deleted.
- Deleted: the gate, its `_liveness/frontend.ts` arm, `mappedSlots`, `MappedSlot`, `UI_SOURCE_ROOT` and the `jsxAttributeLiterals` export from `lib/density-tier.ts` (no consumer left), the slot-map cases and the `UI_SOURCE_ROOT` equality case in `density-tier-family.suite.test.ts`. The `density-tier` gate and its grants are untouched; only a stale header comment was reworded.
- Lost claim: tiers.css hooks are read with a regex over comment-blanked text, not the CSS parser's `selectorHooks`. A hook spelled with spaces or a case flag, or quoted inside a declaration value, reads differently. tiers.css has neither.
- Waivers and grants: 0 markers, 0 grant rows, no budget row.

### z-index-tier-health

- Parity: 2 mustFlag / 1 mustPass / 0 mustRefuse ported, 0 lost; the empty-population refusal from the family suite is kept.
- Plant: `packages/ui/src/markdown` moved aside. The first draft read git pathnames and stayed green, because git still lists a deleted tracked file. It now reads the existence-checked inventory and went red, exit 1: `expected [ 'packages/ui/src/markdown/' ] to deeply equal []`. Directory restored.
- Deleted: the gate, `tests/tooling/verify/gates/z-index-tier-health.suite.test.ts`, its `_liveness/frontend.ts` arm. `lib/z-index-homes.ts` stays: `eslint.config.js` reads it.
- Lost claim: none beyond cadence.
- Waivers and grants: 0 markers, 0 grant rows, no budget row.

## Owed to primary

- `pnpm check:ledgers-fresh` regeneration: four rows of `docs/law/Core-Enforcement-Active-Gates.md`.
- The real-corpus liveness suites on the merged tree: four arms were removed.
- `check:structure` family checks on the new tests (`test-layout`, `tests-run-the-product`, `dangling-doc-cite`).
- `docs/work/1041` evidence move.
