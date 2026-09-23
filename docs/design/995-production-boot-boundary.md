---
kind: design
status: active
updated: 2026-09-01
---

# Production readiness / dev instrumentation boundary (#995)

Status: implementation contract for issue #995. This design restores the #433 production boot
boundary without removing any #953 Appearance, CSS-merge, or animation evidence. The original plan
kept the 780,000-byte ceiling; the post-split production measurement proved that premise stale, and
the owner authorized a measured ratchet recalibration without changing the production validation graph.

## Re-derived problem

The production entry statically imports `installAppReadySignal` from
`packages/client/src/lib/agent-bridge.ts` (`packages/client/src/main.tsx:37`). That module owns the
readiness singleton and its settle algorithm (`packages/client/src/lib/agent-bridge.ts:51-154`), but it
also statically imports the dev Appearance, automation, CSS-merge, animation, motion, render, and bus
graph (`packages/client/src/lib/agent-bridge.ts:35-50`). The symbol is called from the live production
entry (`packages/client/src/main.tsx:155`), so this is implementation reachability, not a matching-name
claim.

The production ratchet at commit `51d50ad03ffb787808553b67460061505e6e2c49` reports a boot payload of
819,676 bytes against the unchanged 780,000-byte ceiling: 697,637 bytes in `index-Bup2krTB.js`, 36,584
bytes in `jsx-runtime-DUeIs9Gz.js`, and 85,455 bytes in `time-Das8Thoo.js`. The emitted boot entry also
contains the dev-only `css-merges`, `automation-fires`, `configured class-merge receipts`, and
`durable automation dispatch audit` strings. Commit `09b8ead41` (#433) established the opposite
boundary: the entire agent-handle assembly is reachable only through the literal
`import.meta.env.DEV` dynamic import in `main.tsx`. Commit `78788014d` (#953) then added Appearance and
animation imports to the mixed readiness/debug module, reconnecting those rails to the production
entry.

The current architecture law already decides the fork. The development handle assembly must remain
behind the one literal DEV dynamic door (`docs/law/client-architecture-lockdown.md:84`),
and `main.tsx` owns production boot wiring (`docs/law/client-architecture-lockdown.md:419`).
No owner-sacred copy or push decision is involved.

After implementing that split, a clean production build measured 818,188 bytes: 696,149 bytes in
`index-Bw7uAXfc.js`, 36,584 bytes in `jsx-runtime-DUeIs9Gz.js`, and 85,455 bytes in the newly declared
`time-Das8Thoo.js` modulepreload. That is 1,488 bytes below the pre-split 819,676-byte build, and the
emitted production graph retains `data-app-ready` while containing none of the dev registry strings
above. Sourcemap attribution identifies the residual `time` chunk as the production
validation/identity floor: Zod core/classic, UUID/TypeID, kit ids/time, `zod-jitless.ts`, Query timeout
management, and Appearance boot-hint/readiness code. The owner ruled that synchronous production
validation remains foundational; no lazy Zod or deferred contract-loading work belongs in #995.

## Chosen architecture

Add one floor-tier module, `packages/client/src/lib/app-ready-signal.ts`, as the only readiness home.
Move the existing readiness block there without changing its algorithm:

- the private `data-app-ready` vocabulary, grace and ceiling values;
- the single module-scope `Promise.withResolvers<void>()` pair;
- `RouteResolution`;
- `installAppReadySignal`, including the observed-fetch, route-resolution, boot-read, grace,
  degraded-ceiling, performance-measure, and unsubscribe behavior;
- a narrow exported `appReady` promise and `isAppReady()` query for the dev bridge.

`main.tsx` imports only `installAppReadySignal` from this new module. `routes/router.tsx` imports only
the `RouteResolution` type from it. `agent-bridge.ts` imports `appReady` and `isAppReady()` and exposes
those exact values as `globalThis.__orb.ready` and `isReady()`. It does not mint another Promise or
readiness predicate. The existing `agent-handles/index.ts` dynamic import remains byte-for-byte behind
the literal `if (import.meta.env.DEV)` door, so every #953 debug capability stays available in DEV and
CT while becoming unreachable from the production boot graph.

This is one contract field plus two consumers on existing rails. There is no new lifecycle, provider,
React context, preload, barrel export, or debug implementation.

## Rejected alternatives

- **Raise the ceiling before proving the boundary.** Rejected: the original excess included accidental
  debug reach, not reviewed production capability. A larger ceiling at that point would have ratified the
  defect. Once the post-split build excluded the dev graph but remained above 780,000 bytes, the owner
  authorized recalibrating the now-stale baseline to the measured production graph. The new 859,000-byte
  ceiling is 818,188 × 1.05, rounded down to a flat thousand, leaving 40,812 bytes (4.99% over measured)
  under the existing ratchet convention.
- **Create a modulepreloaded debug sibling.** Rejected: the boot ratchet sums the whole preload closure;
  this changes chunk names, not production work.
- **Dynamically import readiness.** Rejected: readiness is production boot behavior. Making its install
  asynchronous adds a race before the one-shot marker is listening and complicates the very boundary
  being repaired.
- **Duplicate readiness state inside `agent-bridge.ts`.** Rejected: two promises or two predicates can
  disagree on settle, degraded, route, or boot-read state. `__orb.ready` must be the production signal,
  not a debug approximation.
- **Re-export readiness from `agent-bridge.ts`.** Rejected: that preserves the tempting production
  import path and allows the dev graph to re-enter. Production consumers import the readiness home
  directly; the dev bridge imports inward to it.
- **Delete or defer #953 instrumentation.** Rejected: none of it is the defect. Its reachability is.

## Coupled-site inventory

The shared shape fans out to these current sites:

- production wiring: `packages/client/src/main.tsx`;
- route port: `packages/client/src/routes/router.tsx`;
- dev handle: `packages/client/src/lib/agent-bridge.ts` and the existing
  `packages/client/src/agent-handles/index.ts` DEV door;
- readiness/bridge CT story and assertions: `tests/client/lib/_ct-stories.tsx` and
  `tests/client/lib/agent-bridge.ct.tsx`;
- structural prevention: `tooling/src/verify/gates/agent-bridge-lock.ts` and its planted controls;
- active source/tooling comments: `packages/client/src/lib/boot-reads.ts`,
  `packages/client/src/lib/agent-tools.README.md`,
  `packages/client/src/features/app-shell/hooks/use-selected-theme.ts`,
  `packages/client/src/features/app-shell/components/boot-veil.tsx`,
  `tooling/src/ui-audit/lib/evidence.ts`, `tooling/src/ui-audit/lib/budgets.ts`, and
  `tooling/src/snap/ops/drive.ts`;
- active architecture: `docs/law/client-architecture-lockdown.md` and the existing
  `agent-bridge-lock` row in `docs/law/Core-Enforcement-Active-Gates.md`.

Type-only dev handle imports in `agent-nav`, `agent-seed`, and `agent-rpg` remain on
`agent-bridge.ts`; they consume debug handle types, not readiness. Historical reviews, completed
design receipts, and frozen history retain their time-accurate old paths.

## Test and proof plan

1. Keep the current `agent-bridge.ct.tsx` readiness scenarios as behavioral regression tests for
   route resolution, an in-flight query past grace, and a pending boot-critical dependent read.
2. Add a mounted CT assertion that the debug handle's `ready` is object-identical to `appReady`, then
   drive the real install and assert `__orb.isReady()` and the shared Promise settle together.
3. Extend `agent-bridge-lock` so it refuses a production entry import of `agent-bridge.ts`, requires
   the entry and router to use `app-ready-signal.ts`, and requires the bridge to import the shared
   promise/query. Plant a bad production import and a forked bridge state; both must make the gate red.
4. Run the focused bridge CT and gate tests, scoped typecheck/Biome/structure, and the active-doc
   formatting/catalog checks.
5. Run a fresh production `pnpm check:boot-chunk` after restoring the boundary. Inspect `dist/index.html`
   and every emitted production JavaScript chunk: `data-app-ready` must remain reachable in the boot
   entry, while the dev registry strings and Appearance/CSS-merge/animation modules must be absent from
   the production closure rather than moved into a preload. Only after that proof may the owner-authorized
   ratchet recalibration describe the remaining production graph.

The memory lessons consulted were `MEMORY.md` and
`rollout_summaries/2026-08-25T06-29-17-4t5c-orbweaver_aug21_25_trajectory_and_integration_health_review.md`:
fresh source/build evidence outranks historical status, stale Vite graphs can make readiness look absent,
and documentation changes owe current catalog receipts. The proof therefore rebuilds before inspecting
the emitted graph and runs the doc catalog checks after every active-doc edit.
