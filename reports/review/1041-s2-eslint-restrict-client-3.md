# 1041 s2-eslint-restrict-client-3: native `orb/*` rules for six client style gates (redo)

Six gates moved to `orb/*` ESLint rules and were deleted. `density-tier` stays (escalate). Rule bodies live next to the other restriction rules in `eslint.config.js` (`CLIENT_STYLE_RESTRICTIONS` at `:1107`, hand rules from `:1810`). Durable tests: `tests/tooling/verify/ops/{inline-style,theme-override,flip-inversion,dark-variant,sub-floor-disclosure,surface-a11y-focus}-native.test.ts` over the probe `native-rule-probe.ts`.

## What changed since the refuted attempt

- Both orphaned singleton families are fixed: `surface-in-a-container` is family `surface-in-a-container` (`gates/surface-in-a-container.ts:96`) and `sub-floor-disclosure-health` is family `sub-floor-disclosure-health` (`gates/sub-floor-disclosure-health.ts:46`). Control: with the old family strings, `loadGateCorpus(repoRoot)` rejects with `singleton family sub-floor-disclosure must equal its sole policy id sub-floor-disclosure-health` (`lib/policy-module.ts:79`); with the fix it resolves.
- Nothing is bulk-suppressed. `eslint-suppressions.json` is unchanged. The seven ruled exceptions are reasoned `homes` entries on their rule rows (`eslint.config.js:1121-1160`). An inline disable would add a granted `suppressions` class per rule, the budget compares `waived plus granted` for equality with `APPLICATION suppressions: 57` (`contract/gate-authority.ts:118`), and the row may not rise.
- Reader gaps the verifier proved are closed: a `let` that is never reassigned and a same-file const reached through a computed key now read like the gate read them (`constantInitializer` `:1676`, `accessedName` `:1739`, `staticKeyName` `:1752`); a dark variant split across literals, templates and same-file consts is joined (`joinedText` `:1977`); `export { X }` and `export default X` surfaces are found (`exportedComponentName` `:2074`).
- The unfixable arms are written down below as lost claims.

## Red first

The seven native test files were run against the previous attempt's `eslint.config.js` (index version): 25 of 164 cases failed (list: `/tmp/.../scratchpad/c3r/red-fails.txt`): flip 4 (const key written, let key, const key for the receiver, const key for the read), dark 4 (two literals, const, let, unread suffix), off-token 3 (let, let shorthand, const key), surface 8 (three export spellings, five home files), theme 4 (const key, let key, concatenated key, let object), sub-floor 2 (two home files). Current config: 167 of 167 pass (six native files plus `tailwind-syntax-native.test.ts`).

Redo on current main: the flip home now runs with `homedOptions: { allowed: 1 }`; 4 new flip rows failed on the file-level ignore, and the eight native files (the seven plus `tailwind-class-discipline-native.test.ts`) pass 194 of 196. The 2 failures are in `tailwind-class-discipline-native.test.ts` (5 s cold-load timeout; `projectService` true for `packages/ui/src/tokens/index.ts`) and fail identically with main's own `eslint.config.js` swapped in.

Family control: `loadGateCorpus` with the two old family strings failed with the message above, and passes with the new ones.

## Real door

`pnpm exec eslint <six planted files> --no-warn-ignored`, repo config, exit 1, every plant refused (plants deleted, `git status` clean of them):

- `packages/ui/src/primitives/__plant-c3r-off.tsx` (`let GAP = 12; style={{ gap: GAP }}`): `2:42 orb/no-off-token-inline-style`
- `packages/ui/src/primitives/__plant-c3r-theme.tsx` (`const KEY = "--color-primary"; style={{ [KEY]: "red" }}`): `2:33 orb/theme-override-only-via-scope`
- `packages/ui/src/primitives/__plant-c3r-flip.ts` (`const KEY = "transform"; el.style[KEY] = ...; void el.offsetWidth`): `3:12 orb/no-unruled-flip-inversion`
- `packages/ui/src/primitives/__plant-c3r-dark.ts` (`"focus:dark" + ":bg-card"`): `1:22 orb/no-tailwind-dark-variant`
- `packages/ui/src/primitives/__plant-c3r-sub.tsx` (`<CollapsibleTrigger size="text">`): `1:48 orb/sub-floor-disclosure`
- `packages/client/src/features/chat/surfaces/__plant-c3r-surface.tsx` (`export { Pane }`, only an onClick focus): `1:7 orb/surface-a11y-focus`

Live tree: the six rules, parse-only through the repo config, over 1965 client and ui source files (1035 `.ts`, 930 `.tsx`; 1963 in scope): 0 findings.

## Records

### no-off-token-inline-style: done
- parity: 8 mustFlag / 10 mustPass ported (8 / 9 rows plus the waiver-marker row, which belonged to the retired ordinary-waiver engine), 1 lost.
- lost claim: a value reached through an import (`import { GAP } from "./gap.ts"`) is not followed; untyped lint reads the same file only. Pinned as a 0-finding row. Rider census: `rg` for a token-backed style key (gap, padding, margin, width, height, fontSize, borderRadius, top, left, right, bottom, zIndex, inset) taking an UPPER_CASE identifier, over the 930 `.tsx` files of `packages/ui/src` and `packages/client/src` (the 1035 `.ts` files hold no JSX `style={{}}`; ast-grep `$X.style.$P = $V` finds 6 writes in `-l tsx` and 4 in `-l ts`, in tabs.tsx, web-weave.tsx, live-token-resolver.ts and theme-contrast.ts; their values are literals, locals and a template, none an imported constant): 4 lines, none a style value (`topN:` query arguments x3, one header comment), so the arm has no live population.
- deleted: `gates/no-off-token-inline-style.ts`, its `_liveness/frontend.ts` arm, its arm in `ui-token-surface-wave-1.suite.test.ts`.
- waivers: 2 `@orb-waive` markers, both gate fixtures; removed with the gate. 0 grants.

### theme-override-only-via-scope: done (D328, retained-unqualified row)
- parity: 4 mustFlag / 4 mustPass ported, 1 lost.
- lost claim: an object (or key) imported from another module and handed to `style`. Computed keys through a same-file const or never-reassigned let, and objects bound the same way, are read. Pinned as a 0-finding row.
- deleted: gate, `_liveness/frontend.ts` arm, `home-client-family.suite.test.ts` import and entry, `gate-spelling-twins.baseline.json` row.
- waivers: authority `reviewed-grant` with 0 rows; none to judge.

### no-unruled-flip-inversion: done, with one lost claim
- parity: 3 mustFlag / 5 mustPass ported, 1 lost (the imported-const spelling).
- waivers rejudged: the one live reviewed grant (`tabs.tsx`, operation `flip-inversion`) became a reasoned home on the rule row. `homedOptions: { allowed: 1 }` keeps the rule running on the file, so the grant's two central alarms survive: a second write-plus-flush pair in `tabs.tsx` is a finding (over-broad), and a `tabs.tsx` with no pair reports its home stale (stale). Grant file, its `reviewed-grants.ts` import and spread, and the budget row are gone.
- lost claim: a style or property name reached through an imported const. Rider census: ast-grep over `packages/ui/src` and `packages/client/src` (1965 files: 1035 `.ts`, 930 `.tsx`; the lint scope is the same set) for `$X.style[$K] = $V` and `$X[$K].transform = $V`: 0 matches in `-l ts` and 0 in `-l tsx`; `rg 'style\[[^\]]*\]\s*=[^=]|\]\.transform\s*='` over the same two roots: 0 lines. The only `$X.style.transform = $V` writes are the 2 in `tabs.tsx` (`-l tsx`; 0 in `-l ts`), both with a literal key, so no live site, waiver or grant depends on the arm.
- red first: `flip-inversion-native.test.ts` gained 6 rows (second pair, computed-key second pair, flush gone, no transform write, measure-then-set beside the pair, sibling file with two pairs); 4 failed on the file-level ignore, 27 of 27 pass with `homedOptions`.
- real door: `tabs.tsx` with an appended `el.style.transform = ...; void el.offsetWidth;` function gave `212:12 orb/no-unruled-flip-inversion`, exit 1; `tabs.tsx` with `node.getBoundingClientRect();` removed gave `1:1` "fewer FLIP pairs than its ruling names", exit 1; the untouched file exits 0. The file was restored byte for byte.
- deleted: gate, `lib/reviewed-grants-no-unruled-flip-inversion.ts`, `no-unruled-flip-inversion.suite.test.ts`, `_liveness/client.ts` arm, budget row.

### no-tailwind-dark-variant: done, with lost claims
- parity: 14 mustFlag / 8 mustPass: 13 / 4 ported, 1 / 0 lost, 3 mustPass inverted, 1 marker-engine row retired.
- lost claims: the static-cycle `unresolved:` arm and the zero-carrier-root tripwire (the rule judges the written string, so there is no provenance to fail on); a variant split across modules; the class-carrier fence (a prose string, a local function named `cn` and a `tv` configuration value that spell `dark:` are now findings, pinned as flagged rows). The live tree has no such string (ast-grep `string_fragment` `dark:` over 1035 `.ts` and 930 `.tsx`: 0; `rg 'dark:'`: only token-object keys).
- restored: split literals, same-file const and let substitutions, templates and `+` chains, an unread prefix or suffix around `dark:`; a class const is reported once at its declaration.
- KEEP producer: the `static-class` fact and `lib/static-class-expression.ts` stay (css-var-defined, css-length-tokens read them).
- deleted: gate, `no-tailwind-dark-variant.int.test.ts`, `_liveness/frontend.ts` arm, polarity test in `static-class-consumers.int.test.ts`; `tailwind-syntax-native.test.ts` no longer runs the gate and its first test gets a 60 s timeout for the cold config load.
- waivers: 3 markers, all gate fixtures; removed. 0 grants.

### sub-floor-disclosure: done
- parity: 4 mustFlag / 6 mustPass ported (4 / 5 plus the waiver-marker row, which is now the home-allows-one-mount row), 0 lost.
- waivers rejudged: 2 live per-occurrence `@orb-waive` markers (`rpg-beat-row.tsx`, `turn-tool-calls-disclosure.tsx`) became reasoned homes on the rule row. A home is not a whole-file pass: `homedOptions: { allowed: 1 }` keeps the rule running on the file, so a second `size="text"` mount is still a finding (the per-occurrence precision) and a home that mounts none reports itself stale (the old marker-staleness alarm). The verifier's repro (two triggers at the rpg-beat-row path gave 0 findings) now gives 1. Budget row removed.
- census for the one-ruled-mount-per-home premise: `ast-grep scan` (kind `jsx_attribute`, regex `size="text"`, braced spellings included) over `packages/client/src` and `packages/ui/src`, 930 `.tsx` scanned (the 1035 `.ts` files cannot hold JSX): 2 hits, `turn-tool-calls-disclosure.tsx:91` and `rpg-beat-row.tsx:183`, one per home. `rg` for `size=("text"|{"text"})` over `packages tests` finds only those two plus the rule's test, the primitive's doc, its variants and a CT.
- red first: with the `homedOptions` lines commented out, `sub-floor-disclosure-native.test.ts` failed 4 of 21 (second mount in each home, stale home twice); restored, 21 of 21 pass.
- real door: `rpg-beat-row.tsx` with a second `<CollapsibleTrigger size="text">` appended gave `259:45 orb/sub-floor-disclosure`, exit 1 (the ruled mount at :183 stays accepted); plant removed. The seven homed files, clean: exit 0, 0 messages each.
- kept: `sub-floor-disclosure-health` (s6 shard owns it) and `lib/collapsible-size-vocabulary.ts` (its reader); only the dead `subFloorSizeLiteral` left the lib.
- deleted: gate, budget row, `_liveness/frontend.ts` arm; `disclosure-reservation-family.suite.test.ts` rewritten to the surviving policies.

### surface-a11y-focus: done, with one lost claim
- parity: 4 mustFlag / 6 mustPass ported (4 / 5 plus the waiver-marker row), 1 lost.
- lost claim: the empty-population refusal (`surfaces/` renamed away made the gate refuse; the rule passes silently on an empty scope). It was a runtime property, not a descriptor row. Rider census: the live population is not empty (the 5 homed surfaces plus every other file under `packages/client/src/features/*/surfaces/` outside app-shell and topbar are linted: 0 findings in the census below), so no live site, waiver or grant hits the arm; it guards only a future rename of the directory.
- waivers rejudged: 5 live `@orb-waive` markers (new-chat picker, corpus artifact, corpus home, corpus moment, tag member surfaces) became reasoned homes on the rule row. The central stale arm is restored: `homedOptions: { homed: true }` keeps the rule running on each home, and a homed surface that now takes arrival focus (`useFocusOnMount`, a lifecycle `.focus()`, or a Dialog, Popover, Tooltip, Dropdown or Sheet root) reports that its reasoned home is stale. The verifier's repro (`useFocusOnMount` in `new-chat-picker-surface.tsx`) now gives 1. Budget row removed.
- red first: with the `homedOptions` lines commented out, `surface-a11y-focus-native.test.ts` failed 3 of 34 (stale via `useFocusOnMount`, via Dialog, and with no exported component); restored, 34 of 34 pass.
- real door: `tag-member-surface.tsx` with an appended component calling `useFocusOnMount` gave `15:17 orb/surface-a11y-focus` (stale home), exit 1; plant removed.
- deleted: gate, `_liveness/client-ui.ts` arm, `lib/surface-composition.ts` focus reader (`exportedComponentAnchor` stays for `surface-in-a-container`), surface-a11y cases in `baseui-and-surface-family.suite.repo.int.test.ts`.

### Framework change behind both homes
`RESTRICTION_BLOCKS` in `eslint.config.js` now flatMaps each entry; an entry carrying `homedOptions` gets a second block over its home paths that runs the same rule with those options. Entries without it produce the block they did before. `restrictionPlugin.rules` registers `sub-floor-disclosure` as a hand rule (it was a selector row; selector and message moved into the rule).

### Rebase onto moved main
The previous commit was cherry-picked onto current main. Conflicts resolved by reading both sides: the four fragment-section comments and G22 in `client-architecture-state-and-gates.md` keep main's "feature layout test" wording with the `orb/` prefix; `reviewed-grants.ts` takes main's removal of the package-subpath grants and drops the flip grants; `_liveness/frontend.ts` takes main's removal of `macro-resolution-home` and drops the two deleted gates' arms; `eslint.config.js` keeps main's three restriction spreads beside `CLIENT_STYLE_RESTRICTIONS`. `tailwind-class-discipline-native.test.ts` has two failures (a 5 s cold-load timeout, and `projectService` true for `packages/ui/src/tokens/index.ts`) that reproduce identically with main's own `eslint.config.js` swapped in, so they predate this shard.

### Live census of the six rules
A parse-only script (scratchpad `c3/census.mjs`) ran the six rules, each home with its options, over the tracked `packages/client/src` and `packages/ui/src` files minus tests, declarations and generated files: 1962 files (930 `.tsx`), 0 findings from any `orb/` rule. The 45 other messages are inline-directive noise from rules the script does not load.

### density-tier: escalate
Nothing deleted. ast-grep over `packages/client/src/features` (732 `.tsx`) finds 177 `size|weight|tone|transform` attributes on `Text`/`Heading` in 79 files, against 35 `text-axis` grants in `lib/reviewed-grants-density-tier-{a,b}.ts` (49 grants, budget row 49). The gate's A3 arm is narrower than any selector, so parity with the grants is unresolved (`gates/density-tier.ts:152`).

## Owed to primary

- `pnpm lint:eslint-scoped` after the `eslint.config.js` edit (not run, per override).
- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (six retired gate rows; two family renames).
- Run `tests/tooling/gate-spelling-twins.int.test.ts`, the `_liveness` runner and `baseui-and-surface-family.suite.repo.int.test.ts` (whole corpus or `projectCtx` on the repo root; edited, not run).
- `pnpm check:agents` fails only on three dead links in `docs/plans/test-foundation/design.md` (reports not in this tree), unrelated.
