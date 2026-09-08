---
kind: review
status: active
updated: 2026-09-08
---

# Independent review — tRPC boundary and branded input repair (#1889 / #1890)

Review target: the uncommitted #1889 and #1890 delta in
`.claude/worktrees/codex-world-gate-integration` at baseline
`1eb70fdc7da3628141dd0df60ffab6bf6ab7de16`. The concurrent forms split, test-presence work,
Node-purity pin, and documentation changes were excluded. Source, tests, native dependency configuration,
package exports/imports, compiler programs, and the relevant migrated ID gates were read. No source,
configuration, board, staging, or commit state was changed by this review; this report is its only tree write.

## Findings

None.

## #1889 — branded Zod input contract

`brandedId<T>()` now declares `z.ZodType<T, string>` at
`packages/kit/src/ids/index.ts:278`, matching its actual `z.string().min(1)` parser while retaining `T` as
the post-parse branded output. This closes the concrete static hole: Zod 4.4.3 defaults the second
`ZodType` generic to `unknown`, so the former `z.ZodType<T>` accepted numbers and objects in authored
`z.input<>` shapes even though runtime parsing rejected them. The cast changes only the declared type;
the runtime schema expression at `ids/index.ts:280` is unchanged.

The helper-level type proof pins `string` input, rejects number/object assignability, carries the same
input through `z.object`, and retains branded output at `tests/kit/ids/index.test-d.ts:53-63`. The runtime
proof rejects empty strings, numbers, and objects while accepting a non-empty string at
`tests/kit/ids/index.test.ts:27-32`. The composed proof uses the actual exported
`TrpcClient = TRPCClient<AppRouter>` and real `tag.updateTag` route: a plain string call compiles,
number/object calls are required errors, the result is `TagId`, and assignment to `CharacterId` is a
required error (`tests/tooling/trpc-brand-input.test-d.ts:1-20`). The router really obtains this field from
`brandedId<TagId>()` at `packages/server/src/transport/trpc/routers/tag.ts:20-23`; this is not a stand-in
client shape.

The existing migrated gates should remain unchanged:

- `no-raw-id` rejects raw Zod string builders in ID-named schema fields and explicitly governs branded
  validated output. It does not and should not infer the helper's pre-parse generic.
- `brand-in-name-position` governs bare-string parameter/property declarations against the canonical ID
  vocabulary. A Zod schema's input/output split is outside that signature rule.
- `schema-branding` governs Drizzle primary/FK row brands. It has no relationship to the wire schema's
  pre-parse input generic.

Their composed ID-family conformance remained green. Extending any of these gates to duplicate the Zod
generic assertion would mix distinct contracts and provide weaker evidence than the compiler tests above.

## #1890 — one client-owned tRPC type seam

The client now has one direct `AppRouter` import: the type-only edge at
`packages/client/src/data/trpc.ts:8`. That module derives and exports the reusable `TrpcClient` alias at
`:22-23`; the data front door re-exports it at `packages/client/src/data/index.ts:69`; and the four dev
bridges consume that client-owned type at `agent-plugin/index.ts:10-13`, `agent-rpg/index.ts:5-9`,
`agent-handles/index.ts:24-45`, and `agent-seed/index.ts:28-34,312-314`. Their executable bodies and wire
calls are unchanged. A structural import sweep scanned all 625 client `.ts` files and all 694 client
`.tsx` files and found exactly the one `@orb/server` type import; a literal source search corroborated it.

The native dependency selectors compose correctly:

- `client-no-backend-runtime` covers every client source and rejects server/DB edges that are not
  `type-only` (`.dependency-cruiser.cjs:145-150`).
- `client-backend-types-only-through-trpc` rejects type-only server/DB edges from every client source
  except the exact `packages/client/src/data/trpc.ts` path (`:153-158`).
- `client-trpc-type-target` rejects type-only server/DB edges from that file unless the resolved target is
  the exact server root (`:160-166`).

The fixture graph plants the legal root edge plus illegal other-source server/DB edges and illegal
`data/trpc.ts` server-internal/DB targets (`tests/tooling/dependency-cruiser.int.test.ts:128-137`). Its
assertions verify both halves of the type wall, the legal edge, and server/DB runtime rejection at
`:381-403`. `tsPreCompilationDeps: true` keeps erased type edges visible to those selectors
(`.dependency-cruiser.cjs:790-800`).

This is deliberately module-level enforcement. Dependency-cruiser cannot select an imported TypeScript
symbol; the complementary current source contract is that `packages/server/src/index.ts:4` exports only
`AppRouter`. Therefore the implemented claim is exact for the current tree: one client source may reach one
backend module through a type-only edge. If the server root later acquires another public export, the rule
will not distinguish it; that is the stated module/symbol enforcement boundary, not a present defect.

The updated client/server comments now describe the actual controls. No package export map, dependency
kind, auth/session path, transport endpoint, or runtime application import changed. In a native cruise
rooted at real `client/src/data/trpc.ts`, the graph contained 1,741 modules / 9,374 edges and zero
violations. Its only direct Orb backend edge was `data/trpc.ts -> server/src/index.ts`, classified
`type-only`; removing type-only edges left 174 reachable modules and zero server/DB modules. The full native
cruise remained clean at 4,717 modules / 27,170 edges.

## Independent verification receipts

- `pnpm test:scoped tests/kit/ids/index.test.ts tests/tooling/dependency-cruiser.int.test.ts tests/tooling/dependency-cruiser-worlds.int.test.ts` — 3 files, 81 tests passed. Artifact:
  `reports/runs/test/codex-world-gate-integration-3115926-2026-09-08T13-49-11-827Z/test-report.json`.
- `pnpm test:types tests/kit/ids/index.test-d.ts tests/tooling/trpc-brand-input.test-d.ts` — 2 files,
  8 type tests passed under `types-node`, with no type errors.
- `pnpm test:scoped tests/tooling/verify/gates/id-brand-flow.test.ts` — 1 composed ID-gate conformance
  test passed. Artifact:
  `reports/runs/test/codex-world-gate-integration-3129322-2026-09-08T13-53-28-311Z/test-report.json`.
- `pnpm typecheck` and `pnpm typecheck:graph` — both exited 0 with no diagnostics.
- Native `depcruise` rooted at `packages/client/src/data/trpc.ts` — 1,741 modules / 9,374 edges, zero
  violations; runtime-only reachability contained zero Orb server/DB modules.
- `pnpm depcruise` — 4,717 modules / 27,170 dependencies, zero violations.
- Scoped Biome over the 14 review files — clean, no fixes applied. Scoped ESLint over the covered
  source/test files — exit 0, no warnings.

The known global `baseui-render-prop-composition.defineGate` loader failure and the existing Knip unused
export/type population were outside this review and were not used to qualify these results.
