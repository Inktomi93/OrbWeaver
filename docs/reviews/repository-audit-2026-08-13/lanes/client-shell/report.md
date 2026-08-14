## Lane identity

- Lane: `client-shell`
- Semantic scope: client package entry and Vite shell, routes, public-shell assets, global stylesheet, developer navigation/game-seed bridges, and their mirrored route CTs.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; final working-tree reconciliation at `a73d7272dc95ba93f85251121902a79858f47255`.
- Working-tree basis: final working-tree bytes. Two owned developer-bridge files drifted during this lane and were reread; their final hashes are in `read-receipt.tsv`.
- Assigned files read: 26 / 26 (100%).
- Assigned lines read: 2,385 / 2,385 (100% final working-tree lines; assignment snapshot was 2,378).
- Assigned bytes read: 131,389 / 131,389 (100% final working-tree bytes; assignment snapshot was 130,629).
- Dirty assigned paths: 2 changed after the first receipt — `packages/client/src/agent-nav/index.ts`, `packages/client/src/agent-seed/index.ts`; reread and refreshed. No other final receipt drift.
- Exclusions: binary PNG icon/background content, feature internals, state/data implementations, server routers, and generic CT support are assigned elsewhere. Their names appear below only as cross-lane edges.

## Read receipt

`read-receipt.tsv` covers all 26 `OWNED` rows in `assignment.txt`. Final byte/line/hash reconciliation is complete.

## Architecture observed

`packages/client/index.html:29-31` supplies the one DOM mount and `src/main.tsx`; `main.tsx:153-158` builds the QueryClient/tRPC singletons and `main.tsx:237-357` assembles closed section/modal/settings registries before nesting their providers around `RouterProvider` at `main.tsx:376-429`. `routes/router.tsx:13-37` composes the `/` and `/login` routes, their auth guards, immediate pending surface, restoration, and view transitions. `routes/app-root.tsx:18-88` keeps the global socket/user/RPG bus and one-shot join/persona route residue above the blind shell mount.

The dev bridges are not parallel stores: `agent-nav/index.ts:70-186` calls canonical state actions and tRPC query options, while `agent-seed/index.ts:319-430` writes through the production typed client. Both attach via `installAgentDebugHandle(... buildAgentNav(...), buildAgentSeed(...))` at `main.tsx:431-433`. `pnpm ast refs buildAgentNav/buildAgentSeed` establishes this definition → import → composition route at R3.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| SPA shell and route composition (13 owned runtime files; 2 route CTs) | 4 | 4 | 5 | 3 | 3 | high | `packages/client/src/main.tsx:153-433`; `packages/client/src/routes/router.tsx:13-37`; `tests/client/routes/app-root.ct.tsx:56-224`; `tests/client/routes/route-pending.ct.tsx:11-14`; coordinator exact-scope CT 7/7 |
| Dev navigation and RPG seed bridges (2 files) | 3 | 3 | 1 | 3 | 2 | medium | `packages/client/src/agent-nav/index.ts:70-186`; `packages/client/src/agent-seed/index.ts:319-430`; `packages/client/src/main.tsx:120-123,431-433` |
| Client Vite/public shell (index, manifest, assets, Vite/CSS) | 4 | 3 | 1 | 3 | 2 | medium | `packages/client/index.html:17-31`; `packages/client/vite.config.ts:85-127,153-346`; `packages/client/src/styles/globals.css:54-243` |

## Findings

### CLIENT-SHELL-02 — developer bridges have no owned behavioral proof

- Severity: P2
- Class: declared-not-tested
- Confidence: medium — a current dev/e2e test outside this lane that drives `__orb.nav` and `__orb.seed` would resolve the gap; this lane does not claim such a test is absent repository-wide.
- Evidence rung: R3.
- Scope denominator: 2 dev-handle factories, 3 owned non-fixture test/story modules. The owned route story imports `AppRoot` directly (`tests/client/routes/_ct-stories.tsx:8-19`), and the only direct pending test mounts `RoutePending` (`tests/client/routes/route-pending.ct.tsx:8-14`); neither imports/installs `main.tsx` or either bridge.
- Receipts: `packages/client/src/agent-nav/index.ts:70-186`; `packages/client/src/agent-seed/index.ts:319-430`; `packages/client/src/main.tsx:431-433`; `pnpm ast refs buildAgentNav/buildAgentSeed` in `commands.md`.
- Established fact: both bridges are production-composition-reachable in development, but the owned test surface exercises neither installation nor their refusal/seed sequences.
- User or system impact: a developer/audit aid can regress its lookup/error semantics or the ordered game seeding sequence with no focused local proof in this semantic lane.
- What remains unverified: external e2e/probe coverage and current runtime behavior, including the final refreshed search-based character lookup/seed changes.
- Suggested next check or fix: add a narrow dev-only browser/probe test at the bridge seam, stubbing typed tRPC responses and asserting valid/invalid navigation plus an ordered seed write sequence.

## Proven strengths

- The app’s real shell route is exercised as a composed browser story rather than a hand-built substitute: its CT asserts fresh-home behavior, cross-feature contributor tiles, empty-chat behavior, character-to-chat creation, draft persistence, and the forced/returning persona branches (`tests/client/routes/app-root.ct.tsx:56-224`, R5 current CT).
- The router has a non-empty accessible pending component (`packages/client/src/routes/router.tsx:29-37`, `packages/client/src/routes/route-pending.tsx:14-19`) and its current direct CT asserts the labelled status element (`tests/client/routes/route-pending.ct.tsx:11-14`, R5).

## Declared versus completed

| Surface | Strongest current evidence | State |
| - | - | - |
| SPA root/provider/registry composition | R3 (entry → `RouterProvider`; structural refs) + R5 current CT | wired and current browser-tested |
| `/` and `/login` auth-gated routes and pending surface | R3 router registration + R5 current CT | wired and current browser-tested |
| Dev `__orb.nav` | R3 (`buildAgentNav` → `main.tsx:433`) | wired, no owned behavioral proof |
| Dev `__orb.seed` | R3 (`buildAgentSeed` → `main.tsx:433`) | wired, no owned behavioral proof |
| `rpg.rollDice` arrival surface | R2 server declaration; no client spelling found | cross-lane intent unresolved, not classified as a defect here |

## Tests and gates

The owned route CTs are substantive: they assert user-visible state transitions, an inaccessible dismissal path, and a real route-level pending affordance rather than only rendering snapshots (`tests/client/routes/app-root.ct.tsx:56-224`; `tests/client/routes/route-pending.ct.tsx:11-14`). The coordinator's exact two-file sanctioned rerun passed 7/7 with zero failed, flaky, or skipped tests and a canonical JSON naming exactly those files. They do not cover the developer handles because the route story bypasses `main.tsx` (`tests/client/routes/_ct-stories.tsx:8-19`). No static gate is claimed as behavioral evidence.

## Cross-lane edges

- `pnpm ast unwired rpg` finds `rpg.rollDice` at `packages/server/src/transport/trpc/routers/rpg.ts:89` among 369 server procedures. Neither structural identifier scan nor independent literal scan finds `rollDice` in the 1,369 client source/test TS/TSX files. This is an R2 server declaration / R0 intent question, not a conclusion that the procedure is defective; reconcile with the rpg client/server lanes.
- `pnpm ast orphans client` reports `packages/client/src/features/refinery/hooks/use-refinery-schemas.ts:54 useDeleteRefinerySchema`; that feature is not owned here. Hand off to `client-preset-refinery`.

## Tool receipts

`pnpm ast` was read and run bare. Completed structural lenses include client cycles, orphan/test-only/prod-only liveness, bridge/router references, and server-procedure client-consumer reconciliation; counts, durations, denominator inventories, literal cross-check, and every tool failure are in `commands.md`. Broad `orphans client` and `testonly client` ran to PTY completion; no AST timeout is used as evidence. The coordinator corrected the command shape to `pnpm test:ct <paths>` and retained the fresh two-file 7/7 canonical CT receipt.

## Lane verdict

All 26 assigned artifacts were fully read and reconciled to final working-tree hashes. The shell has real composition wiring and high-value current browser proof: the exact two owned CT files pass 7/7. The dev navigation and seeding bridges are wired through the real entry but have no behavioral proof in this owned test surface. `rpg.rollDice` has no client spelling, yet its intended audience belongs to the rpg lanes and remains unverified.
