# 1041 s2-eslint-restrict-ui-1

Gates: `ui-primitive-structure`, `ui-primitive-overlay-health`, `ui-primitive-permissions`. All three are deleted and replaced by native rules and one node test. The `ui-primitive` fact, `ui-primitive-structure-read.ts`, `test-narration.ts` and the `ui-primitive` authored-tree roster stay for s6-delete-facts-1 (their only reader is now `tests/tooling/verify/lib/ui-primitive-structure-read.test.ts`).

## Successors

| Claim | Home | Where |
| - | - | - |
| `index.ts` never re-exports `variants` | ordinary `orb/ui-variants-barrel-private` | `eslint.config.js` `UI_PRIMITIVE_RESTRICTIONS` |
| no inline `<svg>` outside `charts/` | ordinary `orb/ui-no-inline-svg` | same |
| no color literal or color call carrying a digit in `tests/ui/**/*.ct.tsx` (comments and test narration blanked) | HARD `orb/ui-ct-no-color-literal`, a hand rule judging source lines with the retired gate's regex | `uiCtColorRule`, enabled only in `hardConfig` |
| no inline `*Provider` in `tests/ui` CT and fixtures | HARD `orb/ui-ct-no-inline-provider` | same |
| anchored overlay: `.Popup` needs `.Positioner` | HARD `orb/ui-overlay-anchored-anatomy` | same |
| modal overlay: `.Backdrop` + `.Popup`, no `.Positioner` | HARD `orb/ui-overlay-modal-anatomy` | same |
| primitive trio, variants naming, `data-slot`, co-located CT | node test | `tests/ui/primitives/primitive-topology.test.ts` |

Durable controls: `tests/tooling/verify/ops/ui-primitive-native.suite.test.ts` (123 rows) and the topology test (17 rows).

## Verifier findings answered (refuted attempt 8d0f51eca1)

- Template color lost case, then the concatenation case (attempt 2 refutation): the selector chains are gone. A selector follows nodes, but the retired gate judged the source line, so a color call split across any number of operands (`"rgba(" + r + ", " + g + ", " + b + ", 0.5)"`), a literal that ends past the paren (`"rgb( " + r`), a `.join` array, or template literals joined with `+` slipped past it. `orb/ui-ct-no-color-literal` is now a hand rule: it blanks comments and test narration (a `test`/`it`/`describe`/`suite`/`bench` title as argument 1, an `expect` message as argument 2, with literal template chunks only), then applies the retired regex to each line. The five refuted shapes are rows and flag. The all-substitution form (`rgb(${r}, ${g}, ${b})`) and a call closed before its digit stay clean, as before.
- Authority downgrade (reviewed-grant to ordinary): fixed. Color and provider rules are now HARD (`UI_HARD_RESTRICTIONS`), registered on the plugin and enabled only in `hardConfig`, so an inline disable cannot excuse them. Rows prove a reasoned `eslint-disable-next-line` does not excuse either rule, and that neither rule is in the ordinary profile. The old central grants never named a color or provider subject (the six grants are shape and CT exemptions, rejudged below), so the HARD profile is stricter, not looser.
- Vacuity: `git ls-files 'tests/ui/**/*.ct.tsx' 'tests/ui/**/*.fixtures.tsx'` lists 0 files, so the CT rules guard no live site yet. Controls prove they bite.
- Leftovers: `docs/law/Core-Enforcement-Active-Gates.md` is generated (owed). `docs/adr/0220-rejected-neo-and-report-only-gates.md:59` is an immutable ADR naming the gate as history. The reader, fact, narration helper, their tests and the roster entry belong to s6-delete-facts-1.

## ui-primitive-structure (ordinary)

- parity: 2 mustFlag / 2 mustPass ported, 0 lost. Barrel flag, svg flag, chart pass, and the waiver-marker pass (now: a reasoned `eslint-disable-next-line` suppresses exactly that finding and not the next line).
- real door: `pnpm exec eslint packages/ui/src/primitives/zz-plant/index.ts packages/ui/src/primitives/zz-plant/zz-plant.tsx` exit 1, `orb/ui-variants-barrel-private` and `orb/ui-no-inline-svg` (run in the first attempt; rules unchanged here).
- live tree: 89 `index.ts` and 98 non-chart `.tsx` scanned, 0 findings.
- waivers: the 2 `@orb-waive ui-primitive-structure` markers were the gate's own mustPass fixture (0 outside fixtures); they die with the gate. No grants.
- deviation, not a lost row: findings report at the export declaration / opening element, not the specifier token.

## ui-primitive-overlay-health (HARD)

- parity: 1 mustFlag / 1 mustPass ported, 0 lost.
- real door: `pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config --stdin --stdin-filename packages/ui/src/primitives/dialog/dialog.tsx` with `export const X = () => <D.Popup />;` exit 1, `orb/ui-overlay-modal-anatomy`.
- live tree: 5 anchored and 3 modal component files, 0 findings.
- deviation, not a lost row: the old text test `.includes(".Popup")` is now an exact `Popup` / `Positioner` / `Backdrop` member name; it no longer sees type positions or strings, which render no layer.
- no waivers, no grants.

## ui-primitive-permissions (reviewed-grant, now HARD for color and provider)

- parity: 1 mustFlag / 1 mustPass ported (missing `variants.ts`; complete topology), 0 lost. The gate's color and provider arms (covered only by the reader test, not its mustFlag rows) are also ported.
- topology arms (shape, CT) moved to a test because they are directory facts no lint selector sees. Color and provider arms moved to HARD lint.
- red first (attempt 2): with the previous selector-chain rule, 5 of the 6 new rows failed (four-operand concatenation, bare separators, `"rgb( "` open literal, `.join` array, template-literal concatenation); a sixth row asserting blindness to a call split across lines was dropped because the selector rule flagged it and the retired gate did not. All 123 rows pass with the line rule. Topology: removing `badge/variants.ts` reds `every real primitive keeps the shape contract`.
- real door: `pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config tests/ui/primitives/vplant/vplant.ct.tsx` exit 1. Planted lines 1 to 4 (four-operand rgba concatenation, `"rgb( " + r`, `["rgb(", r, ", 20, 30)"].join("")`, template-literal concatenation) and line 5 (`"#abc"`) each reported `orb/ui-ct-no-color-literal` (1:19, 2:19, 3:20, 4:19, 5:19); a comment line and a `test("rgb(1,2,3) title")` narration line were clean. Plant deleted. The eight live overlay files lint clean under the same HARD command (exit 0).
- parity with the retired regex: the same regex runs over the same blanked text, so the digit-in-identifier case, a private `#abc` class-field name and a `data-slot`-style token all behave as before. Narration blanking uses the root of a non-computed member chain at any depth, as the retired helper did. Not covered, as before: a call whose open paren and digit sit on different lines.
- deviation, not a lost row: overlay member matching no longer sees TS type positions or strings (`typeof D.Positioner` in a modal, `typeof D.Popup` with no Positioner). Neither renders a layer, so no anatomy claim is lost; the old text `includes` flagged them. The topology test reads directories directly, so an untracked or empty primitive directory fails locally (stricter).
- lost claim: none. 0 live population for the CT arms in any case: `git ls-files tests/ui` lists 0 `.ct.tsx` and 0 `.fixtures.tsx` files (8 files total), and no waiver or grant names the arm.

### Grant rejudge

The six grants were the exemptions UI-Primitives-and-Reuse §13.7 already names as law (variants-exempt: `icons`, `virtual-list`, `message-list`, `aria-announcer`, `file-trigger`; CT-exempt: `icons`). None is fixable without minting an empty `variants.ts` shell or a CT for a nonvisual barrel; the law ratified each as skinless. They became two `as const satisfies Record<string, string>` tables in the topology test beside the assertion, with the reason text kept, and a stale check: an exempt primitive that now satisfies the contract fails the test. No entry was added.

## Scaffolding removed

- `tooling/src/verify/gates/ui-primitive-{structure,overlay-health,permissions}.ts`
- `tests/tooling/verify/gates/ui-primitive-structure.int.test.ts`, `ui-primitive-grants.suite.repo.int.test.ts`
- liveness arms and imports in `_liveness/client-ui.ts` and `_liveness/multi-root-b.ts` (and the `PRIMITIVE` const only the arm used)
- `waiver-budget.ts` `ui-primitive-permissions` row; 6 rows in `reviewed-grants-tooling-to-permission.ts`
- prose: `test-reach.ts` comment and `why`, law docs, five `tests/legacy/ui` comments

Kept on purpose for s6-delete-facts-1: `lib/ui-primitive-fact.ts`, `lib/ui-primitive-structure-read.ts`, `lib/test-narration.ts`, their tests, and the `ui-primitive` roster entry in `contract/resource-tree.ts` with `tests/tooling/verify/ops/resource-tree.test.ts`.

## Owed

- `pnpm lint:eslint-scoped` after the `eslint.config.js` edit (heavy foundation passes; not run).
- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (three catalog rows).
- s6-delete-facts-1: delete the `ui-primitive` fact, reader, `test-narration.ts`, their tests and the roster entry.
