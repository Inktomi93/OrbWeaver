---
kind: history
status: superseded
supersedes: docs/architecture/core/Spine-TypeScript-and-Patterns.md §7.5 (string-union dispatch)
updated: 2026-07-13
---

# Spine TypeScript — archaeology record

> Frozen 2026-07-13, extracted from `core/Spine-TypeScript-and-Patterns.md`. The measured evidence that
> motivated spine §7.5 (string-union dispatch discipline) — pattern-adoption archaeology from the
> neo-tavern predecessor, NOT current law. The live rule (one canonical union per axis + mapped-type
> Record / `assertNever` dispatch, gated by `no-inline-union-redecl` + `exhaustive-dispatch`) lives in
> `core/Spine-TypeScript-and-Patterns.md §7.5`. Read this only for the original evidence; orbweaver's
> axes are born in the target shape.

## The measured pain (neo-tavern AST dispatch scout)

The AST dispatch scout quantified the "touch N spots to add one variant" cost of un-homed string-union
dispatch in the neo-tavern steady clone (companion scan record: `Grounded-Intelligence-AST-Scan.md`):

| axis | touch-count | shape of the rot |
| - | - | - |
| `messageRole` (system/user/assistant) | **132** | 3 competing canonical const-arrays + 116 inline re-spellings; no importable union |
| `users.role` (admin/user) | 35 | no exported `UserRole` union → 33 inline `"admin"\|"user"` re-decls |
| `guidedAction` (6) | 23 | 14 redecls + 4 **untyped** `Record`s (no exhaustiveness backstop) |
| `routing.source` (4) | **18** | **the user's lived pain, MEASURED** — 11 inline re-decls of the source union (dispatch IS gated; the cost is pure re-declaration) |
| `routing.api` (3) | 12 | 9 inline re-decls (dispatch fully `assertNever`-gated) |

The gold standard already present in neo and carried into orbweaver's `workloads`: `workloads.kind`
dispatches through `RUNNERS: { [K in WorkloadKind]: Runner<K> }` — a mapped-type Record, so a missing
kind is a hard compile error; `routing.api`/`source` runner switches use typed-return / `assertNever`.
Orbweaver's axes (`MESSAGE_ROLES`, `USER_ROLES`, `AUTH_MODES` + `MODE_RESOLVERS`, `WorkloadKind` +
`RUNNERS`, …) are born this shape, so these touch-counts never recur.
