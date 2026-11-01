---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `client/lib`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `SEED_PROFILES.d20` | `client/src/lib/agent-bridge-handles.ts:40` | unbuilt | delete | delete the member and the 8 branch, check or keys that name it |
| `APPEARANCE_CARRIER_PLANES.root-html` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `APPEARANCE_CARRIER_PLANES.shell-grid` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `APPEARANCE_CARRIER_PLANES.background-layer` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `APPEARANCE_CARRIER_PLANES.message-props` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `CASCADE_SOURCES.generated-theme` | `client/src/lib/appearance-invariant-manifest.ts:17` | unbuilt | delete | delete the member |
| `CHARACTER_DETAIL_ANCHORS.editor-sections` | `client/src/lib/contribution-contracts.ts:201` | unbuilt | delete | delete the member |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Counts: 7 rows = 6 kept + 1 owner question.

- `SEED_PROFILES.d20`: kept. `tooling/src/snap/ops/scenarios/rpg-game.json:21` calls `orb.seed.game({profile:'d20'})` inside a `page.evaluate` string, and `packages/client/src/dev/agent-seed/index.ts:400` branches on it. The `__orb.seed` handle is the documented agent surface (`packages/client/src/lib/agent-tools.README.md:19`).
- `APPEARANCE_CARRIER_PLANES.root-html`, `.shell-grid`, `.background-layer`, `.message-props`: kept. The scan misses writers through `as const` objects: `ROOT`, `GRID`, `BACKGROUND` and `MESSAGE` at `packages/client/src/lib/appearance-carrier-manifest.ts:129-136` carry them into the rows, and `PORTAL_BY_CARRIER` (line 57) is a `Record` over the plane type that would lose its entry. 4 rows.
- `CASCADE_SOURCES.generated-theme`: kept. `SPACING_SOURCES` and `THEME_SOURCES` (`packages/client/src/lib/appearance-invariant-manifest.ts:115,119`) name it, and the producer is `tooling/src/snap/lib/cascade-source.ts:9`, which classifies `theme.css` as `generated-theme`; the observed value is compared against these lists.
- `CHARACTER_DETAIL_ANCHORS.editor-sections`: owner question, not applied. It is the only member. No contribution is registered (`characterDetailContributors`, `packages/client/src/compose/chat-context.ts:47`, ships empty), but the editor reads the registry (`packages/client/src/features/character/surfaces/character-editor-surface.tsx:247`) and the registry is a testkit door export (`tests/support/browser/index.ts:7`). Deleting the member means deleting the whole character-detail contributor seam: `CharacterDetailContribution`, `CharacterDetailState`, the registry, the `detailContributors` props through `makeCharactersSection`, and the testkit export. Question: delete the seam, or keep it as the extension point? Default: keep.
- Survey: codegraph_explore `SEED_PROFILES agent-bridge-handles APPEARANCE_CARRIER_PLANES CASCADE_SOURCES CHARACTER_DETAIL_ANCHORS`; ast-grep string-literal scan over `packages tests tooling` (5913 `.ts` files with `-l ts`, 1524 `.tsx` files with `-l tsx`): `"d20"` 24 ts + 8 tsx, `"generated-theme"` 10, `"root-html"` 4, `"message-props"` 3, `"editor-sections"` 2, all read; plus `rg` of each literal over `packages tests tooling scripts`, which found the JSON scenario the AST scan cannot see. Stored data: none; all are in-code vocabularies.
- No code change.
