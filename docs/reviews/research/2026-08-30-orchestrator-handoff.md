---
kind: review
status: active
updated: 2026-08-30
---

# Hand-off to the orchestrator — recurrence research (three briefs), 2026-08-30

From: the owner's research lane `nate-research` (worktree `wt/nate-research`, base `7f574337a`). Three
read-only reports sit beside this file under `docs/reviews/research/`. Each build item below cites its
report section for receipts. NOTHING here is claimed or dispatched — that is yours. Re-derive each row
before dispatching (the reports are at `7f574337a`; the tree has moved).

## 0. First: the reports need to land

The three reports + this file are UNTRACKED in the research worktree. They are `check:docs` green but
carry no catalog receipt. Land them via the born-reviewed pattern (a `receipts/<lane>.json` row,
`verifiedCommit` = the report commit) or re-home them wherever review docs live now — your call. Path:
`.claude/worktrees/nate-research/docs/reviews/research/*.md`. Do NOT tear that worktree down before
copying them out.

## 1. Class corrections — rows the "family" labels mis-attributed

These matter because a fix aimed at the wrong class re-pays the whole discovery. Update the issue
bodies/labels if you keep family tags on the board.

| Issue | Was filed / grouped as | Actual class | Why it matters |
| - | - | - | - |
| #622 `dims` | "declared, never populated" (field-liveness family) | **partial producer set on an OPTIONAL field** — the upload path fills it (`attachment-url-provider.tsx:44`), imagery never did and still doesn't | a field-liveness gate can never see it; the fix is type-level (required) or primitive-level (tolerant, what shipped) |
| #320 / #321 | dead knobs (field-liveness) | **dropped hop in a pass-through chain** / knob surface outside `knob-wire-coverage`'s 5 enumerated arms | name-global liveness sees "produced" AND "read"; the gate hole is the audit's F1 hole |
| #650 netHosts | unpaired value | **server-View-field the client never reads** (audit F4 class) | no field-level instrument exists; Brief 3 §4.1 measured 24 more |
| #471, #837 | unpaired value (the two data-loss bugs) | **degraded/emptied READ → persisted WRITE** (destructive RMW) | not liveness at all; their fix seams are total by a header sentence only (0/233 gates reference them) |
| #610 | unpaired value | wrong-principal read (authz) | leave with security |
| #619, #637 | unpaired value | Brief 2's inert-arm class | already fixed with liveness markers |
| #674, #681 | over-art plate family (#626's class) | **NO-BACKING composition** at the TSX tier — no surface at all, not a plate-less translucent rule | the CSS gate cannot see them by construction; needs the sweep (item B1) |
| #690, #692, #693, #697 | over-art plate family | **TOKEN PAIRING on the light polarity** (`palette-contrast` territory) | not the plate law; the pair list is hand-listed |
| #850 | tap-target / touch floor | **ROW PITCH below the pseudo** — `inline` Buttons in a `Stack gap="field"`; the 28px `::after` exists and is unreachable because the hit lands on the neighbour's text (#807 refuses it, correctly) | no control primitive can own pitch; no layout primitive floors it (`pointer-coarse` appears nowhere in `ui/src/layout`) |
| this-chat P2 (collapsible 411×40) | touch floor missing | **opt-in floor arm not taken** — `collapsible` trigger `size="control"` exists (`variants.ts:31`) | a default inversion, not a new floor |
| #453 / #835 | home CLS mechanism | the mechanism was RIGHT; its substrate (#837) was wiping it every boot | the ruling stood; the lesson is the sentinel pin at every tier that reads memory |
| #808, #653 | "absence reads as clean" | correct — the only two of the seven that are | — |
| #816 | absence reads as clean | **NO-RULE** — nothing mechanizes a rule that does not exist | don't file an instrument-honesty row for it; the PNG-look is the instrument |
| #825, #851, #871 | absence reads as clean | **PRECISION-NEIGHBOUR** — a rule without its nearest legitimate look-alike fenced | item B3 |
| #452, #550 | absence reads as clean | **INPUT-SHAPE-SILENT** — parsed silently; per-tool fixes | item B4 |

## 2. Build items, priority-ordered (P = my read; you price them)

### Brief 3 — unpaired value (report §5)

| # | Item | Where | Enforcer | Size | P |
| - | - | - | - | - | - |
| A1 | **Dominance arm on `json-column-write-parity`**: a whole-replace writer of a `defineVersionedConfig`-owned column must be dominated in its own body by `requireIntactStoredConfig(...)`. mustFlag = a third writer with no guard; mustPass = `theme-queries.ts:154`'s key-wise `json_set` | `tooling/src/verify/gates/json-column-write-parity.ts` (has the whole-replace classifier + schema derivation) | gate | S | P2 — makes #471's class unrepresentable for every future writer |
| A2 | **Sanctioned-home arm for `RegisteredStore.reset`**: `setState($X.getInitialState(), true)` on a persist-minted store legal ONLY in the two door files, and `.reset()` on a `RegisteredStore` callable ONLY from `resetWithoutPersisting` | new gate or an arm on `no-raw-zustand-persist` | gate | S | P2 — #837's class for every future identity-boundary caller |
| A3 | **`pnpm ast viewgap` lens** (field-level `clientgap`): owner ∈ `*View\|*Summary`, readers restricted to `packages/client/src`, `@view-server-only: <reason>` two-sided marker. Prototype exists: `scratchpad/nr-view-fields.ts` in the research session (reuses `fieldIndexes`/`contractFieldsOf`); 24 candidates at `7f574337a`, list in Brief 3 §4.1 | `tooling/src/ast/ops/` | lens → ratchet after triage | S | P2 — then TRIAGE the 24 (MessageView economics: `ttftMs`, `finishReason`, `stopReason`, `terminalReason`, `cacheReadTokens`, `cacheWriteTokens`, `editedAt` — confirmed unrendered by two methods) |
| A4 | **Dropped-hop lens**: for each function whose parameter is annotated with a `contracts` shape, a declared field the body never reads (name/destructure/spread=all) → DROPPED INPUT. #320's exact shape | `tooling/src/ast/ops/` | lens (candidate) | M | P3 — precision unknown until run |
| A5 | **Lens hygiene** on `contract-field-liveness`: (a) fence the schema-composition alias (`thresholdPct: generationKnobSchemas.compactionThresholdPct`), (b) print the CLASS beside each hit (template-key / guest / foreign-format / dormant-cited / unclassified). Never ratchet it | `tooling/src/ast/lib/fields.ts` | lens | S | P3 |
| A6 | **One human read**: `stPresetSchema.character_id` (`preset/index.ts:2737`) — parsed, never read; the `use_regex` shape | — | — | XS | P3 |

### Brief 2 — absence reads as clean (report §4)

| # | Item | Where | Enforcer | Size | P |
| - | - | - | - | - | - |
| B1 | **Shared verdict door `printVerdict`**: prints the RESULT line AND refuses (exit 2, `INSTRUMENT-ERROR`) a clean verdict whose declared denominators are empty/absent/`-1`/violate their own `refuseWhen` (`zero` \| `unstable` \| `below floor`), with an explicit `honestEmpty: <reason>` arm (motion-audit's quiet-frames case). Then `tooling-instrument-proof` arm F: an `INSTRUMENT_TOOLS` member calling `printResult(` directly is RED | `tooling/src/_shared/evidence.ts` + `artifacts.ts`; 8 call sites | gate (sanctioned door) | S–M | **P2** — #808/#653's shape fleet-wide |
| B2 | **Per-family liveness on design-audit's RESULT line**: every check family publishes `scanned-<family>=N`; an enabled family reporting 0 on a page with census > 0 is a refusal (the ct-unfed ACTIVE-marker shape) | `tooling/src/ui-audit/ops/run.ts`, `lib/collect.ts` | rides B1 | S | P2 |
| B3 | **Closed rule registry + fixture PAIR per rule**: home the 43 free-string rule ids (8 `checks-*.ts`) in one `as const` table; gate `design-audit-rule-proof` requires per id `@rule-fires(<id>): …` AND `@rule-silent(<id>): <nearest legitimate neighbour>` in `tests/tooling/ui-audit/**` or `design-audit-walker.ct.tsx`, two-sided. Today: 42/43 rules pinned somewhere, `landmark-missing` in none, NO rule has a required neighbour plant | `tooling/src/ui-audit/lib/` + new gate | gate | M | P2 — #825/#851's class at every rule's birth |
| B4 | **Shared strict argv door** + `tooling-shared-plumbing` arm G: a `cli.ts` reading `process.argv` outside it is RED. `_shared/argv.ts` is six helpers today, not a parser; `ast/cli.ts:49-60` is the worked refusal shape | `tooling/src/_shared/argv.ts` + ~14 clis | gate arm | M | P3 |
| B5 | **Register `review-mirror`** in `INSTRUMENT_TOOLS` (+ its two proof markers) | `_shared/instruments.ts` | existing gate | XS | P3 |
| B6 | **Opt-in `--self-check`** on design-audit (walker over a known-positive fixture page before the real page). NOT default — duplicates the per-commit proofs, catches none of the population/precision shapes | `ui-audit/ops/run.ts` | — | S | P4 |

### Brief 1 — primitive guarantee (report §2–§3)

| # | Item | Where | Enforcer | Size | P |
| - | - | - | - | - | - |
| C1 | **DOM-derived worst-art contrast SWEEP CT**: mount the room over the worst legal art per polarity (dim floor #487; bright under a light plate, dark under a dark one), walk every text node under `[data-has-bg-image]`, sample each via `pixelContrast`, refuse on a 0-node walk. Replaces the 5 per-instance pins as the standing guard; would have caught #674 and #681 on landing. Second arm: the same sweep over the composited theme-scope harness with the PAIR list derived from what is painted over what (closes #690–#697's class) | `tests/client/features/chat/surfaces/` + `tests/ui/content/theme-scope/` | CT (push) + `test-presence` | M | **P2** |
| C2 | **Invert the collapsible default**: `size="control"` becomes the base; the text-height arm becomes `size="text"` and owes a line-adjacent `@sub-floor-ok(<reason>)` marker, two-sided | `packages/ui/src/primitives/collapsible/variants.ts` + CT re-pin | `ui-size-via-variant` + marker arm | S | P2 — closes the this-chat 411×40 row and every future one |
| C3 | **Pitch arm on `no-floorless-control-in-wrap`**: ≥2 floorless Buttons as direct siblings of one `Stack`/`Row`/list whose `gap` is below the touch floor at coarse, unless each row carries `min-h-touch-target` / `pointer-coarse:min-h-…`. mustFlag = `rpg-stat-profile-editor.tsx`'s shape verbatim. Plus a `rows="control"` variant on `Stack` (or `ListRow` adoption for editor rows — `list-row-adoption` covers LIST-region surfaces only) | gate + `packages/ui/src/layout/variants.ts` | gate | S–M | P2 — #850's class (the 28 P1s) |
| C4 | **`QueryBoundary.reserveKey`**: lift `TileFallback`/`TileBody` (`home-tile.tsx:180-233`) into the boundary — remembered box via `useSurfaceBox`, `skeletonRowCountFor` fills it, settled child measured on mount; the literal `count` becomes the first-boot guess. Gate arm: a `QueryBoundary` whose fallback is a `SkeletonRows` with a literal `count` and no `reserveKey` is RED, `@first-boot-only(<reason>)` marker for boundaries that never re-mount. 129 mounts / 92 files to key (mechanical). Inherits the #837 sentinel pin at the boundary tier (seed a box, boot, assert `data-tile-reserved`) | `packages/client/src/data/query-boundary.tsx`, `state/surface-box-store.ts` | gate + CT sentinel | M | P2 — boot-2 exactness for every boundary; the This-chat Injections 89→920 |
| C5 | **Injections rows collapse** to the Field-overrides idiom (the CLS report's own remedy, #5 P1/P2) — a design fix, not a reservation fix; and bound Rules with it (report §5 P3) | `settings-context-tab.tsx`, `injections-manager.tsx` | side-eye receipt | M | P2 (owner taste — flag) |
| C6 | **#871 planted control** (already the issue's own done-bar): decide auditor-right vs over-refusing before any Field-hint change | — | — | S | P2 (open row) |
| C7 | Per-dir check of the 7 interactive `@orb/ui` dirs with no floor token (`accordion`, `option-strip`, `toggle-group`, `file-trigger`, `file-dropzone`, `selection-bar`, `save-bar`) — each may inherit from a composed Button/Toggle; unverified | `packages/ui/src/primitives/` | — | XS | P3 |

## 3. Suggested lane packaging (one AREA per lane, 4–8 items)

- **Lane "write-seam totality"** (executor): A1 + A2 (+ A5 as a rider). Floors: `check-gates.int` + `gate-conformance.int` for the new arms, the settings + durable-local suites.
- **Lane "view-field lens"** (executor): A3 build → triage the 24 → file real finds; A4 as a stretch. Floor: `tests/tooling/ast/**`.
- **Lane "verdict door"** (executor, tooling): B1 + B2 + B5. Floor: every instrument's `cli.int.test.ts` + the instrument-proof gate.
- **Lane "rule registry"** (executor, tooling): B3 (+ B4 if it fits). Floor: `tests/tooling/ui-audit/**` + walker CT.
- **Lane "contrast sweep"** (executor, client/CT): C1. Floor: the new CT + the two existing pixel-pin files.
- **Lane "touch defaults"** (executor, ui): C2 + C3 + C7. Floor: button/collapsible/stack CTs + the floorless gate's conformance.
- **Lane "boundary reservation"** (forge — the design is the risk: 129 sites, one seam): C4. Floor: home + rpg HUD CTs, the #837 sentinel, `pnpm test:ct` on chat context tab.
- C5/C6: owner-visible product changes — route as decisions, not lanes.

## 4. Hazards to restate in the briefs (each paid once already)

- A1/A2 probe REAL gate files: announce before probing on a shared tree (`gates-and-tooling.md`).
- C4 reads durable-local memory: the #837 lesson — the test doubles must be faithful to zustand's
  `persist`, not to the file header; use real `createPersistedStore` mints in the pins.
- C1 samples the framebuffer: `getComputedStyle` is blind to a composite over art; only `pixelContrast`
  counts (`mask-is-paint-invisible-to-computed-style`).
- B1 must keep motion-audit's honest-empty arm (a quiet surface at `--window 100` reaches 0 frames
  legitimately, `empty-population-vs-broken-probe`).
- A3's census is name-global and UNDER-reports; treat its zero as weak and its hit as strong.
