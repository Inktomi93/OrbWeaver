---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/admin shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/admin`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `RevokeSessionParams` / `CookieAdmission` | `server/src/domain/admin/contract/params.ts:58` | restated | unknown (read) | a verb's params and a cookie admission match by coincidence: keep both |
| `EmbedCharacterCardParams` / `RemoveCharacterParams` | `server/src/domain/admin/contract/params.ts:66` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `EmbedCharacterCardParams` / `ListSnapshotsParams` | `server/src/domain/admin/contract/params.ts:66` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `EmbedCharacterCardParams` / `ListConnectedParams` | `server/src/domain/admin/contract/params.ts:66` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `EmbedCharacterCardParams` / `ListForCharacterParams` | `server/src/domain/admin/contract/params.ts:66` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `EmbedCharacterCardParams` / `ListForCharacterParams` | `server/src/domain/admin/contract/params.ts:66` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

6 rows: applied 0, kept 6 (5 deliberate, 1 with a reason), handed off 0, owner question 0. No code changed. Scan: ast-grep inline rule (identifier, type_identifier, property_identifier), `-l ts` and `-l tsx`, `packages tests` (5200 ts and 1450 tsx files): each name is declared once and used only in its own domain's contract, service and verb files.

- `EmbedCharacterCardParams` against `RemoveCharacterParams`, `ListSnapshotsParams`, `ListConnectedParams` and `ListForCharacterParams` (5 rows; two are the same pair name from the world-info and regex domains): kept as deliberate. Both sides of every row are one verb's `...Params` in a domain's `contract/params.ts`; `docs/law/Core-0-Architecture-and-Structure.md` section 4 ("every verb's \*Params") gives each verb its own named input.
- `RevokeSessionParams` / `CookieAdmission`: kept. `RevokeSessionParams` (`domain/admin/contract/params.ts`) is the admin verb's input; `CookieAdmission` (`entry/auth/seam.ts`, private) is what the cookie path of the auth seam returns. Both hold `{ principal, sessionId }` today, but an entry seam result and a domain verb input change for different reasons, and the entry layer would have to import a domain contract type for a private two-field shape.
