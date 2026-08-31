---
kind: review
status: active
updated: 2026-08-31
---

# Tailwind, tailwind-variants, tailwind-merge, Style Dictionary, and DTCG API audit

## Verdict

Orbweaver has the right high-level CSS architecture and mostly uses the installed packages for the jobs
they actually do well: Tailwind v4 is integrated CSS-first; `@orb/ui` is the single stylesheet and class-
merge front door; `tv()` is the component-skin vocabulary; CSS cascade exceptions are explicit; generated
token artifacts are freshness-tested; and ThemeScope/custom-theme boundaries preserve user theming without
letting raw structured overrides reach DOM style.

The token source is not, however, a DTCG 2025.10 source in more than syntax. Style Dictionary 5.5.0 merely
detects `$value`/`$type`; it does not validate the stable value shapes, and Orbweaver feeds it legacy CSS
strings. Of 178 base tokens, **148 are directly nonconformant by the stable Format rules, and 163 are
nonconformant after aliases resolve**. The current generator would stringify conformant color, dimension,
duration, and shadow objects as `[object Object]`. This is the dominant pre-launch defect and requires a
full source-and-generator migration, not a compatibility veneer.

The class merge is also incomplete against the exact Tailwind 4.3.3 compiler. The real emitted custom
namespaces are not the set assumed by the CSS census: `aspect`, `blur`, and `ease` are missing from the
configured merger; `dimension` and `z` emit no named utility at all. The planned `#933` diagnostic cannot
come from a package callback: tailwind-merge 3.6.0 exposes no loser/winner trace, and
`experimentalParseClassName` exposes only syntactic parsing, not classification or conflict decisions.
A bounded local replay over the real merger plus a browser CSSOM/CDP cascade probe is required.

Dependency decision: add **direct dev dependencies** on `ajv@8.20.0` and `ajv-formats@3.0.1`, pin the official
2025.10 Format and Resolver schemas, and keep Orb-specific semantic checks local. Both packages already
exist in this lockfile transitively, so this makes ownership explicit without adding resolved code today.
Do not add Terrazzo, a separate “DTCG” package, or a class/cascade tracer.

## Confirmed findings

### P1 — the canonical token documents claim DTCG while 163/178 effective values are not DTCG 2025.10 values

`packages/ui/src/tokens/tokens.json:1-2` declares the file the DTCG single source, but its value inventory is:

| declared family           |   total |                   direct DTCG-valid |               direct invalid |                      effective invalid after alias resolution |
| ------------------------- | ------: | ----------------------------------: | ---------------------------: | ------------------------------------------------------------: |
| `color`                   |      75 |                          15 aliases |               60 CSS strings | 75, because all 15 aliases terminate at invalid string colors |
| `dimension`               |      67 |                                   0 |               67 CSS strings |                                                            67 |
| `duration`                |       8 |                                   0 |                8 CSS strings |                                                             8 |
| `shadow`                  |       5 |                                   0 |                5 CSS strings |                                                             5 |
| invalid `$type: "string"` |       6 |                                   0 |                            6 |                                                             6 |
| `fontFamily`              |       2 |                       0 normatively | 2 comma-delimited CSS stacks |                                                             2 |
| `cubicBezier`             |       1 |                                   1 |                            0 |                                                             0 |
| `number`                  |      14 |                                  14 |                            0 |                                                             0 |
| **total**                 | **178** | **30 schema-direct / 15 effective** |               **148 direct** |                                             **163 effective** |

The superficially plausible `155 invalid` count is wrong. So is a simple `161 = 75 + 67 + 8 + 5 + 6`:
that treats 15 alias strings as invalid before resolution, but omits the two comma-delimited font-family
strings. The official JSON Schema accepts the font strings because JSON Schema cannot express the Format's
normative “single family or array of families” rule. The correct views are therefore:

- 146 official-schema failures in the base document: 60 literal colors + 67 dimensions + 8 durations +
  5 shadows + 6 unknown types;
- 148 direct normative failures after the two comma-delimited font families are included;
- 163 effective failures after the 15 syntactically valid aliases resolve to invalid terminal colors.

The two seed value sets add 80 nonconformant color strings, 40 per file, plus an Orb-only `$colorScheme`
member and no declared/inherited `color` type (`packages/ui/src/tokens/themes/light.json:1-45`,
`packages/ui/src/tokens/themes/mocha.json:1-45`). Those 80 are deliberately not included in the 178-token
base count.

Evidence: a complete recursive JSON walk reported `178` leaves and exactly `color/string 75`,
`dimension/string 67`, `duration/string 8`, `shadow/string 5`, `string/string 6`, `fontFamily/string 2`,
`cubicBezier/array 1`, and `number/number 14`. An Ajv strict/all-errors compile of the official stable Format
schema succeeded, and validation of the current file returned false. Style Dictionary confirms the source
of the false confidence: `detectDtcgSyntax` flips true when it sees either spelling and performs no value
validation (`packages/ui/node_modules/style-dictionary/lib/utils/detectDtcgSyntax.js:9-26`); its public type
accepts `$value: any` and `$type: string` (`packages/ui/node_modules/style-dictionary/types/DesignToken.d.ts:5-24`).

Failure scenario: a consumer or future validator reads “DTCG single source,” accepts the source as portable,
and encounters CSS-only strings where structured colors/dimensions/durations/shadows are required; aliases
inherit the same invalid terminals. This blocks correct interchange and makes package acceptance look like
standards conformance. The architecture requires every visual value to originate in the DTCG vault
(`docs/architecture/core/client-architecture-lockdown.md:96-115`), so this is a source-contract defect, not
a documentation preference.

### P1 — the generator cannot consume the conformant source it is required to produce

`packages/ui/tokens.build.ts:77-83` handles every array as a cubic bezier and every other value with
`String(value)`. Therefore a conformant color, dimension, duration, or shadow object renders as
`[object Object]`; a conformant shadow array renders as `cubic-bezier([object Object], …)`. The generator then
manually walks the deprecated token tree (`:266-300`) after calling `exportPlatform()` (`:277-292`). Style
Dictionary 5.5.0 explicitly marks that API deprecated and returns the modern `Dictionary` from
`getPlatformTokens()` (`packages/ui/node_modules/style-dictionary/lib/StyleDictionary.js:397-416`), whose
`allTokens` entries already carry exact `path`, `original`, and transformed value metadata
(`packages/ui/node_modules/style-dictionary/types/DesignToken.d.ts:28-61`).

Style Dictionary has usable transforms for structured colors, dimensions, font families, cubic beziers,
and shadows, including DTCG object dimensions (`lib/common/transforms.js:377-413`) and structured shadow
lists (`:1841-1878`). It does **not** have a complete stable-family answer:

- there is no standalone DTCG `duration` → CSS transform; the old `time/seconds` family is not the stable
  `duration` type;
- the transition shorthand has an explicit DTCG-duration TODO and currently interpolates objects as
  `[object Object]` (`:1799-1826`);
- there is no gradient-to-CSS transform;
- its tolerant helpers intentionally accept legacy strings, so successful output is not conformance proof.

Failure scenario: migrating the source family-by-family before changing the generator makes the committed
theme invalid CSS and corrupts `TOKENS[*].value`; migrating the generator without a type-directed registry
silently retains legacy acceptance. The change must be atomic by family and red-first.

### P2 — tailwind-merge omits three real Tailwind 4.3.3 utility namespaces and registers assumptions instead of compiler truth

The current merger derives spacing, radius, container, width, typography leading/tracking/text, but no
aspect, blur, or easing family (`packages/ui/src/lib/class-merge.ts:31-84`). Exact Tailwind 4.3.3 compilation
over the generated `@theme` produced named utilities for 14 custom namespace families:

| compiler-positive namespace | planted candidates               | current merge result  |
| --------------------------- | -------------------------------- | --------------------- |
| color                       | `bg-primary bg-secondary`        | one survivor, correct |
| spacing                     | `gap-field gap-tight`            | one survivor, correct |
| radius                      | `rounded-base rounded-card`      | one survivor, correct |
| aspect                      | `aspect-portrait aspect-banner`  | **both survive**      |
| shadow                      | `shadow-glow shadow-overlay`     | one survivor, correct |
| blur                        | `blur-strength blur-fill-chrome` | **both survive**      |
| border width                | `border-hairline border-control` | one survivor, correct |
| font family                 | `font-sans font-mono`            | one survivor, correct |
| text size                   | `text-title text-body`           | one survivor, correct |
| leading                     | `leading-title leading-body`     | one survivor, correct |
| tracking                    | `tracking-micro tracking-wide`   | one survivor, correct |
| container                   | `max-w-cq-sm max-w-cq-lg`        | one survivor, correct |
| width                       | `w-dialog-sm w-dialog-lg`        | one survivor, correct |
| easing                      | `ease-out-expo ease-linear`      | **both survive**      |

The same compiler probe proved six negative namespaces: `dimension` (`w-rail`, `w-panel`), `immersive`,
`reading`, `fade`, `z`, and `motion` emit no corresponding named utilities. `w-(--dimension-rail)` does
compile, and the default merger already handles arbitrary-variable width. Accordingly, the census proposal
at `docs/reviews/stickler/2026-08-30-css-census-doctrine-and-enforcement.md:949-973` is partly false: aspect
and blur need registration; dimension and z must not be registered; ease is the missing family it did not
name. `#933` must encode the 4.3.3 compiler matrix, not the census premise.

This is already observable: Avatar's portrait aspect plus a caller `aspect-square` override leaves both
classes in the composed output, so CSS source order, not the caller, chooses the result. The focused merge
suite passes because `REGISTERED_NAMESPACES` only proves the four namespaces already registered
(`tests/ui/lib/class-merge.test.ts:105-123`); it cannot discover compiler-positive families.

Failure scenario: a component/caller override on aspect, blur, or ease looks correct in source but leaves
two declarations alive, and Tailwind's emission order chooses the rendered value. Add only the three proven
families and a compiler-derived positive/negative planted matrix. Do not add namespace support because a
token prefix merely exists.

### P2 — the current double-merge architecture destroys the evidence `#933` needs before `cn()` can observe it

Orb's exported `tv` enables tailwind-variants' internal merge (`packages/ui/src/lib/class-merge.ts:101-104`),
and component output is then commonly passed through the exported `cn()`. A live `createTV({ twMerge: false
})` probe preserved all raw base/variant/caller candidates for normal and slot variants, while the current
factory can discard a loser before Orb's front door sees it. This makes a complete loser → winner record
impossible at the only seal the diagnostics can instrument.

Neither installed package provides a native replacement:

- tailwind-variants 3.2.2 supports `createTV({ twMerge: false })`, slots, compound variants/slots, extension,
  and `cx`/`cnMerge`, but has no decision callback;
- tailwind-merge 3.6.0 returns only the merged string. Its internal right-to-left loop classifies and skips
  conflicts without emitting an event (`packages/ui/node_modules/tailwind-merge/src/lib/merge-classlist.ts:6-114`);
- `experimentalParseClassName` can override parsing of modifiers, important, base class, postfix, and
  external-prefix status (`parse-class-name.ts:23-113`). It does **not** expose class-group classification,
  conflicting group IDs, or the winner. The claim that it exposes classification is refuted by the exact
  type and implementation.

Failure scenario: `window.__orb.css` reports only merges that survive the earlier TV pass, so an apparently
complete trace omits the most important component-skin conflicts. The correct bounded mechanism is:

1. configure Orb's sole `createTV` with `twMerge: false`, retaining TV as the variant/slot composer;
2. make `cn()` the single merge point and record its ordered joined tokens and final string in dev only;
3. identify survivors by occurrence, then replay the **actual configured merger** over bounded suffix/pair
   inputs to identify the first later class that evicts each loser and follow that chain to the final winner;
4. label Orb custom families from the same namespace registry and everything else `tailwind-core`;
5. plant asymmetric `px`/`pr`, modifiers, order-sensitive modifiers, important, postfix/slash, arbitrary
   values, and custom aspect/blur/ease examples; a trace with zero population is an instrument error.

This deliberately reuses package behavior instead of copying its class-group engine. Keep
`experimentalParseClassName` debug-only if it helps token display, under the exact 3.6.0 pin and a contract
test. It is not an acceptable correctness dependency or a loser/winner source.

### P2 — the cascade half of `#933` is a browser concern, not a Tailwind/tailwind-merge API

No audited package observes final stylesheet/layer/specificity/inline/inheritance decisions. Tailwind's
`compile`, `compileAst`, and unstable design-system loader can compile candidate CSS
(`packages/ui/node_modules/tailwindcss/dist/lib.d.mts:325-376`), but they cannot identify the declaration a
browser selected on a live element. Orb already has Playwright 1.61.1 and a Snap CDP session; the protocol
supports `CSS.getMatchedStylesForNode`.

Failure scenario: a correct class merge trace reports one utility while an unlayered rule, inline custom
property, inherited value, or later owner CSS wins in the browser. Extend Snap/`__orb.css` with a bounded
CDP-backed matched-style probe: selector/element, property, winner and losing declarations, stylesheet
source, layer/source order, specificity/importance/inline/inherited state, and computed value. Plant a
fixture that exercises layer, specificity, inline, custom-property resolution, and a losing declaration;
empty CSSOM/CDP population is `INSTRUMENT ERROR`, not clean. No dependency is justified.

### P3 — the import seal permits a second `createTV`, which would mutate tailwind-variants' global merge cache

The front-door comment says `createTV` remains importable so the sanctioned home needs no exception
(`packages/ui/src/lib/class-merge.ts:16-22`). The installed implementation keeps module-level
`cachedTwMergeConfig` and updates it when a configured factory runs
(`packages/ui/node_modules/tailwind-variants/dist/chunk-RZF76H2U.js:12-25,57-59`). A complete structural
sweep finds exactly one live call today, at `class-merge.ts:102`, so the tree is clean now; the enforcement
does not make the invariant unrepresentable.

Failure scenario: a future file imports `createTV` for a local preset, changes the cached configuration,
and makes variant merges order-dependent again while every current seal still passes. Restrict
`createTV` to the front-door file or add a gate that asserts exactly one import/call and plants a second
call as the negative control. If the single-merge redesign above lands, still keep the restriction: global
mutable package state should have one owner even when its merge switch is off.

### P3 — the `dark` custom variant is dead and names a deleted palette

`packages/ui/src/styles/globals.css:60-71` says the variant excludes `light` and `birdie`, but `birdie` is
not a seed and the full TS/TSX/CSS corpus contains no live `dark:` utility consumer. The only non-comment
`dark:` matches are unrelated object keys (`code-editor.tsx`, Shiki configuration). This is the CSS census
F7, independently reproduced.

Failure scenario: a future author trusts the prose, adds a `dark:` utility, and inherits an obsolete
polarity policy whose light-set enumeration is already stale. Delete the dead variant and its test pin, or
only reintroduce it with a real consumer and derivation from the actual value-set polarity registry.

## Exact installed capability inventory

The lock/catalog and package-local manifests resolve the relevant stack to:

| package             | exact installed version | capability Orb should treat as public                                                                                  |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tailwindcss`       | 4.3.3                   | CSS-first `@import`, `@theme`, utilities/variants; `compile`, `compileAst`; unstable design-system introspection       |
| `@tailwindcss/vite` | 4.3.3                   | Vite integration over the CSS entry                                                                                    |
| `tailwind-variants` | 3.2.2                   | `tv`, `createTV`, slots, variants, compounds, extension, `cx`/`cnMerge`; configurable merge-off composition            |
| `tailwind-merge`    | 3.6.0                   | `twMerge`, `extendTailwindMerge`, `createTailwindMerge`, default config and validators; parser override only, no trace |
| `style-dictionary`  | 5.5.0                   | async constructor/config, DTCG spelling detection, aliases, transforms/formats, `getPlatformTokens()` dictionary       |

Receipts: `pnpm-workspace.yaml:185-192,251-255`, `packages/ui/package.json:107-148`, and each installed
package's own `package.json`. There is **no separate DTCG npm package installed**. Orb uses Style Dictionary
plus an Orb-authored token contract. Do not invent a package to explain `$value`/`$type`.

Primary standards receipts are the stable [DTCG Format 2025.10](https://www.designtokens.org/TR/2025.10/format/),
its official [Format schema](https://www.designtokens.org/schemas/2025.10/format.json), the stable
[Resolver 2025.10](https://www.designtokens.org/TR/2025.10/resolver/), and its official
[Resolver schema](https://www.designtokens.org/schemas/2025.10/resolver.json). Exact package behavior is
receipted to the installed declarations/implementation above; the alternative parser was checked against
the exact published [`@terrazzo/parser` 2.7.1 package](https://www.npmjs.com/package/@terrazzo/parser/v/2.7.1)
and its linked first-party repository/source.

Tailwind's unstable design-system object can list/parse candidates and variants, compile AST nodes, resolve
theme values, print/canonicalize candidates, and expose class order. That is valuable in a build/test probe,
not a runtime contract. Pin 4.3.3 and contract-test any use of the `__unstable__` export. The stable
`compile()` surface is sufficient for namespace coverage tests and should be preferred there.

Tailwind-variants' `extend` and `compoundSlots` are available but the representative/full corpus does not
show an unhandled real composition that needs them. Responsive variants were removed in v4 of the library;
do not design against that retired API. The lite build drops merge capability but buys nothing after Orb
turns merge off at the one factory.

## What Orbweaver already does properly

- `packages/ui/src/styles/globals.css:1-7` is the single consumer entry: Tailwind, generated theme, and
  tiers in deliberate order. The unlayered reduced-motion, tier, theme-scope, and owner-CSS floors are
  intentional cascade law, not an invitation to layer everything.
- The fresh Vite production build completed over 3,407 modules in 2.12 seconds. All 178 generated custom
  properties were present and no token variable was missing. Current Tailwind 4.3.3 did not prune the plain
  `@theme` variables, so `@theme static` would solve no reproduced defect. `@theme inline` would be wrong:
  Orb relies on runtime custom-property overrides and shadow ingredient indirection.
- `class-merge.ts:1-104` correctly owns one configured `tailwind-merge` instance and one `tv` front door;
  the import-order regression, custom typography, spacing, radius, container, and width families have
  meaningful later-wins tests (`tests/ui/lib/class-merge.test.ts:1-142`).
- `tokens.build.ts:38-60,181-225` enforces exact seed value-set coverage against the ThemeScope emit set and
  produces generated CSS/TS artifacts whose freshness suite is green.
- `ThemeScope` is a real boundary, not a token-file escape. The contracts schema validates colors/fonts/
  enums and explicitly partitions card-embeddable from viewer-sacred keys
  (`packages/contracts/src/theme/override.ts:1-17,35-59,62-135`). The UI-local mirror validates again,
  strips unknowns, derives only known custom properties, and derives polarity from a picked base
  (`packages/ui/src/content/theme-scope/clamp.ts:50-100,174-194,284-374`).
- Seed, custom, and carried palettes are deliberately distinct. Seed themes paint from generated
  `[data-theme]` blocks and pass `{}` to ThemeScope; custom themes pass their structured override; absent
  values inherit the base ramp. Ambient background/accent are judging inputs, not emitted fallbacks
  (`packages/client/src/features/app-shell/lib/resolve-theme-scope-tokens.ts:1-17,35-63`). Nested room and
  speaker scopes inherit/rebase through validated context (`theme-scope.tsx:30-73`).
- Derived variables remain dynamic browser CSS on purpose: neutral surface ramp, foregrounds, reading
  plate/band, borders, input, and shadow ingredients are relative-color formulas rooted in the selected or
  carried surface (`packages/ui/src/content/theme-scope/derive-vars.ts:13-178`). A strict portable-token
  migration must not flatten or delete this capability.
- The active custom theme's raw CSS is an explicit, separate owner capability. Only the viewing owner's
  selected theme is injected, after the app styles, by a raw end-of-head `<style>`; participant CSS never
  crosses to other viewers (`packages/client/src/features/app-shell/components/custom-theme-style.tsx:1-38`,
  `app-shell.tsx:227-255`). Create/update reject fixed/sticky CSS, import degrades rejected CSS to null, and
  the client rechecks before injection (`packages/kit/src/css-validate/index.ts:1-47`, create/update/import
  verb receipts at `create-theme.ts:19-40`, `update-theme.ts:20-42`, `import-theme.ts:19-45`). This is a
  security-sensitive boundary. This report does not propose changing its policy or implementation.

## The strict-DTCG boundary and runtime CSS non-regression contract

Strict DTCG applies to every value that claims to be a portable design token or value-set member. It does
**not** apply to legitimate runtime CSS mechanisms in their explicit homes, and it must not reduce:

1. generated seed `[data-theme]` palettes and their explicit native `color-scheme`;
2. custom `ThemeOverride` structured fields, per-field drop behavior, foreground/contrast derivation,
   density/radius/font mapping, or the ThemeScope emit surface;
3. nested carried room/speaker palettes, viewer-sacred partitioning, ambient-base/accent judging chain,
   polarity, relative-color formulas, or shadow ingredient inheritance;
4. owner-authored custom CSS and its current write-time + client-time validation/injection boundary;
5. authored CSS mechanisms in the six sanctioned homes.

Use a vendor extension in the **same canonical strict JSON document**, named
`$extensions["orb.cssValues"]`, for Orb-owned raw CSS output values that are not portable
tokens. Prefer `cssValues` over `cssRecipes`: these are already concrete CSS expressions such as layered
shadows, `clamp()`, `ch`/`em` measures, and relative-color expressions. Calling them recipes invites a new
mini language, resolver, and transform engine that Orb does not need. The extension should be a closed map
from generated CSS custom-property name to a raw CSS value plus description/provenance, for example a
single `value` string; its `var(--…)` operands can be discovered and checked directly. Do not put `$value`
leaves or custom `$type`s inside it, and do not ask DTCG tools to resolve aliases inside extensions.

The five `orb.pointerFine` values are a different extension contract: make the vendor key explicit and the
payload a structured `{ value, unit }` dimension, then format it locally. They are conditional override
metadata, not legacy token values. Plant extension-preservation tests because generic token tools are
required to preserve unknown `$extensions`, not interpret them.

This same-file extension preserves the one-path/six-home doctrine better than a second value source. It is
metadata for generating values, not a seventh stylesheet or a token namespace. A separate file would create
two authorities for `--shadow-*`/`--dimension-*`; a custom `$type` would falsely claim portability. Stable
DTCG defines the allowed token types and requires token types to be one of them; namespaced private types
are not a conformant escape. `$extensions` is the specified vendor-extension mechanism.

## Complete DTCG 2025.10 migration inventory

### Family inventory and output implications

| family/current population                            | canonical migration                                                                                           | transform/output requirement                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 46 plain literal colors                              | `{colorSpace:"oklch", components:[l,c,h], alpha?}`                                                            | Style Dictionary `color/oklch`; byte/parity test browser round-trip                        |
| 14 `light-dark()` colors                             | two conformant color values in light/dark value sets                                                          | resolver-set composition; generator emits the existing `light-dark(light,dark)` CSS value  |
| 15 color aliases                                     | keep `{path}` aliases                                                                                         | validate terminal type/value and cycles after resolution                                   |
| 80 seed color values                                 | conformant color objects with inherited/declared `color`                                                      | emit identical `[data-theme]` vars; move `$colorScheme` to resolver context/Orb extension  |
| 61 `px`/`rem` dimensions plus zero-valued `0em`      | structured `{value, unit}` using only `px` or `rem`; normalize zero to `0rem`                                 | Style Dictionary `size/rem` or a unit-preserving local formatter; computed-output parity   |
| 2 `clamp()` dimensions                               | portable floor/cap/percentage inputs plus `cssValues` output expression                                       | preserve raw formula; check referenced vars and exact target ownership                     |
| 3 nonportable unit values (`0.08em`, `75ch`, `65ch`) | portable numeric inputs where the number is design data; raw unit formula in `cssValues`                      | do not lie with DTCG `dimension`, whose stable units are px/rem; preserve rendered formula |
| 8 durations                                          | structured `{value, unit}` using `ms` or `s`                                                                  | local duration formatter; Style Dictionary 5.5.0 has no correct standalone transform       |
| 5 shadows                                            | prose as structured DTCG shadow; four dynamic layered shadows as `cssValues` using portable color ingredients | native transform for the portable one; preserve runtime `var()`/relative-color behavior    |
| 6 `$type:string` values                              | two aspect ratios to raw `cssValues`; four percentages to numbers with a local percentage output role         | type-directed local output, no custom type                                                 |
| 2 font families                                      | arrays of individual family strings                                                                           | `fontFamily/css`; preserve quoting/fallback order                                          |
| 1 cubic bezier                                       | already conformant array                                                                                      | `cubicBezier/css`                                                                          |
| 14 numbers                                           | already conformant                                                                                            | identity formatter                                                                         |
| 5 pointer-fine extension strings                     | structured vendor-extension dimensions                                                                        | local conditional formatter                                                                |

Four of five current shadows are genuinely runtime CSS expressions (`shadow.glow`, `overlay`, `cta`, and
`cta-glow`) because they use theme-scoped custom properties/relative colors. They are not portable DTCG
shadow values and must not be flattened into static colors. `shadow.prose` can be a structured DTCG shadow.

### Resolver and theme sets

Adopt a schema-valid DTCG 2025.10 Resolver document as the declarative composition manifest for the base,
light, and mocha value sets. It should describe the actual one-modifier theme contexts and source order; a
small local adapter may support precisely that subset and must reject unsupported Resolver features. Do
not claim a generic Resolver implementation. The resolver manifest is composition configuration, not a
second value home. Validate it with the official Resolver schema and plant base/light/mocha selection,
missing set, bad modifier, and ordering controls.

### Migration order — red first

1. **R0, freeze behavior:** capture current generated `theme.css`, typed token map, seed map, full compiled
   custom-property set, representative computed palette/polarity/ThemeScope states, and custom-theme CSS
   injection. These are compatibility goldens, not reasons to keep legacy source shapes.
2. **R1, plant conformance:** vendor the official 2025.10 Format and Resolver schemas with version, source
   URL, and content hash; add strict Ajv/all-errors validation plus semantic rules for font-family members,
   aliases, inherited types, terminal type/value agreement, cycles, and Orb extension contracts. The
   current corpus is the expected red.
3. **R2, simple portable families:** numbers/cubic stay; migrate 46 base + 80 seed literal colors, 61
   standard dimensions, 8 durations, and 2 font arrays. Register explicit type-directed transforms and
   compare artifacts after each family.
4. **R3, nonportable scalar outputs:** migrate the six invalid string types and five special dimensions into
   portable numeric inputs plus `orb.cssValues`; migrate pointer-fine metadata to its structured
   extension. No raw CSS grammar remains in a portable `$value`.
5. **R4, polarity sets:** split the 14 light/dark color pairs into conformant value sets, add the bounded
   Resolver manifest, and preserve the generated `light-dark()` result and ThemeScope `color-scheme` arms.
6. **R5, shadows:** migrate prose to structured shadow and move the four dynamic formulas to `cssValues`,
   still referencing the ThemeScope-derived color ingredients at runtime.
7. **R6, generator idiom:** use `getPlatformTokens().allTokens` and `token.path`; delete `exportPlatform`,
   the manual walk, and type-blind `renderValue`; fail on every unhandled declared type/output role.
8. **R7, graduate:** regenerate, run full checks and UI/token suites, fresh Vite compile, exact 178-target
   output coverage, seed/custom/carried polarity render matrix, and user custom CSS non-regression.

### Planted controls

- one valid and one invalid fixture for every used DTCG family; unknown type, invalid unit, wrong component
  count, comma-packed font, alias cycle, alias terminal wrong type, and inherited-type mismatch;
- official schema load/hash failure and a zero-token input must fail loud, never report zero violations;
- every `cssValues` target is unique and generated exactly once; every `var(--x)` operand exists; extension
  entries contain no `$value` and portable `$value`s contain no CSS function/unit grammar;
- unknown `$extensions` survive parsing/transforms unchanged;
- local duration, pointer-fine, and dynamic shadow formatters have exact object-in/CSS-out controls;
- Style Dictionary transition with object durations remains a planted negative until upstream fixes it;
- compiler namespace positive/negative set equality for the exact 4.3.3 matrix above;
- seed/custom/carried ThemeScope matrix proves base/accent judging, derived variable set, density, radius,
  native `color-scheme`, light-dark arm, portal inheritance, and participant CSS non-propagation;
- custom owner CSS still reaches the end-of-head style after validation; fixed/sticky remains rejected and
  import invalid CSS still degrades to null. Any changes to that security-sensitive implementation require
  a separate security review.

## Dependency decision table

| gap                                                                      | decision                                                              | why / planted control capability                                                                                                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stable Format + Resolver JSON validation                                 | **justified direct dev dependencies: Ajv 8.20.0 + ajv-formats 3.0.1** | official schemas compile under strict/all-errors; both already transitively resolved in this lock; direct ownership is auditable; schema/hash and per-family planted fixtures are straightforward |
| DTCG semantic gaps (font strings, alias terminal shape, extension rules) | **small local mechanism**                                             | normative checks are Orb-sized and not expressible in the official JSON Schema; run after Ajv and Style Dictionary resolution                                                                     |
| DTCG duration/CSS and dynamic CSS output                                 | **small local mechanism**                                             | Style Dictionary lacks the exact transforms; type-directed formatters and `cssValues` keep scope bounded                                                                                          |
| class loser → winner                                                     | **small local mechanism**                                             | package has no trace callback; replay the exact configured merger rather than reimplementing its groups                                                                                           |
| browser cascade winner                                                   | **installed API suffices**                                            | existing Playwright/CDP can call CSS matched-style APIs; no JS package can replace browser cascade truth                                                                                          |
| compiler namespace coverage                                              | **installed API suffices**                                            | Tailwind 4.3.3 stable `compile()` provides exact positive/negative evidence                                                                                                                       |
| TV raw variant composition                                               | **installed API suffices**                                            | `createTV({twMerge:false})` is public and tested in 3.2.2                                                                                                                                         |
| second standards oracle                                                  | **do not add Terrazzo**                                               | parser accepts a broader Terrazzo dialect and normalizes legacy values; it cannot be strict DTCG authority                                                                                        |

No-new-dependency fallback: check in the two official schemas and hand-write validators for every currently
used family plus alias traversal. This can work, but it duplicates a large evolving schema and is inferior
to explicitly owning Ajv packages already present in the lock. It remains the fallback if direct Ajv policy
is rejected, not the recommendation.

### Why Zod and Terrazzo are not the validator

Orb's installed Zod 4.4.3 exposes `fromJSONSchema`, but its public declaration labels it semi-experimental,
and the exact implementation rejects external `$ref` and conditional `if`/`then`/`else`. Compiling the
official Format schema failed for those reasons. It can own the small Orb semantic/extension contracts; it
cannot replace Ajv for the official schemas.

`@terrazzo/parser@2.7.1` was inspected from the exact published tarball. It preserves unknown extensions
and has useful alias/type mismatch linting, but its default dialect deliberately supports `string`,
`boolean`, and `link`, allows `em` dimensions, normalizes legacy string colors, requires explicit type even
where DTCG inheritance/alias semantics differ, and gives proprietary meaning to `$extensions.mode`.
Package size was 107.7 KB compressed / 542.7 KB unpacked and it brings `momoa`, `colorjs.io`,
`merge-anything`, `picocolors`, `scule`, `@terrazzo/json-schema-tools`, and Terrazzo token packages. That is
extra parsing and attack/maintenance surface without a strict second oracle. `@terrazzo/plugin-tailwind`
also duplicates Orb's generator mapping and does not solve runtime CSS formulas, ThemeScope, merge traces,
or cascade traces. Do not adopt either package.

## Capabilities deliberately not adopted

- **JSON5:** reject for canonical source. Stable Format 2025.10 defines token files as JSON and recommends
  `.tokens` or `.tokens.json`. Rename the canonical file to `tokens.tokens.json` if the repository accepts
  the path migration; express commentary with `$description`/vendor `$extensions`, not comments.
- **custom/namespaced `$type`:** reject. Stable tokens use specified types; private behavior belongs in a
  vendor `$extensions` payload, not a value that falsely claims portable type conformance.
- **Terrazzo parser/plugin:** reject for the reasons above.
- **`@theme inline`:** reject because runtime ThemeScope/value-set overrides and shadow ingredients must
  remain late-bound. **`@theme static`:** do not adopt now; the fresh build emitted all variables already.
- **Tailwind unstable design system at runtime:** reject; stable compile is enough for tests. A pinned,
  contract-tested build-only use is acceptable if a later compiler query needs it.
- **tailwind-merge `experimentalParseClassName` as correctness API:** reject; debug display only under pin.
- **tailwind-variants lite, responsive variants, speculative `extend`/`compoundSlots`:** no demonstrated gap.
- **broad cascade-layer rewrite:** reject. The audited unlayered floors and owner CSS are deliberate; add
  diagnostics before changing cascade policy.
- **unused DTCG families:** do not mint gradients, typography, transition, border, font-weight, or stroke
  tokens merely because the spec defines them. The validator must support them when introduced, but the
  source should only contain real Orb values.

## Cross-reference to the active CSS program

- **#921:** the census correctly found the old feature-only CSS-home gate under-scoped. A sibling lane is
  currently replacing it with `sanctioned-css-homes`; this audit did not edit or certify that uncommitted
  work. The full `pnpm check` failure is from that lane's formatter/catalog state, not from this report.
- **#931:** retain its six-home/value-doctrine work, but correct the merge namespace premise and fold this
  full DTCG migration into the token/config phase. Do not close on syntax detection or legacy output parity.
- **#933:** its two diagnostic channels are sound requirements, but neither is package-native. Build class
  traces at the sole merge front door after TV raw composition, and cascade traces from browser CSSOM/CDP.
  The compiler positive/negative matrix must be planted before namespace ownership is asserted.

## Verified clean / verification log

Authority read in full before judgment: `.claude/agent-doctrine.md` (483 lines),
`docs/architecture/core/AGENTS.md` (365), `Core-Laws-and-Precedents.md` and registry pointers,
`client-architecture-lockdown.md` (755), `UI-Architecture-and-Layout.md` (445), `UI-Density-Law.md` (208),
`ui-package-design.md` (523), and the full 1,404-line CSS census. Relevant law: D42/D54 component engine,
D62/D66 UI boundaries, D70/D71 token/value-set derivation, D141 enforcement, D144 theming polarity, and D150
shell paint.

Integration files read in full include the base and seed token documents, generator and all generated
artifacts, class-merge front door and tests, UI/client global CSS, tiers and shell CSS, representative `tv`
variant modules/exports, ThemeOverride/ThemeScope/derivation/resolution/carried/custom-CSS paths, seed-theme
server projection, CSS validation and theme verbs, Vite configs, CSS structure/token freshness tests, and
relevant gates. Package surfaces read include package manifests/exports, public declarations and shipped
READMEs/docs, plus implementation for Tailwind compilation/design-system behavior, tailwind-merge parser/
classification/merge/config, tailwind-variants config/cache/merge/slots, and Style Dictionary DTCG detection,
dictionary/config, transforms, types, and deprecations. No sampled-file conclusion is used.

Commands/evidence:

- exact `pnpm list --filter @orb/ui --depth 0`/catalog/lock inspection; no separate DTCG package;
- complete recursive token walk and official Format schema Ajv probe;
- exact published Terrazzo 2.7.1 tarball manifests, declarations, parser/lint/normalization source;
- Tailwind 4.3.3 compile probes for every namespace and positive/negative class pair; direct
  tailwind-merge and TV raw/current probes;
- structural TS and TSX sweeps for merge imports/calls and `dark:` usage, plus literal `rg` confirmation;
- fresh scratch Vite production build: 3,407 modules, 2.12 s, all 178 token variables emitted;
- focused suite:
  `pnpm exec vitest run tests/ui/lib/class-merge.test.ts tests/ui/tokens/index.test.ts tests/ui/styles/css-structure.suite.test.ts`
  → 3 files, 84 tests passed, no type errors;
- full `pnpm check` output read. All type, test, structure, dependency, knip, and documentation-format stages
  passed. Biome/catalog failed only on shared in-progress `sanctioned-css-homes.ts` and the two concurrently
  modified architecture docs. This is a non-verdict on #921's current uncommitted replacement, not a
  product/toolchain failure attributable to the audited baseline.
- report-specific `pnpm check:docs` passed (`107 file(s) formatted`). `pnpm check:doc-catalog` remains red on
  the two pre-existing architecture-document hashes and stale generated catalog; this report is untracked
  and therefore is not cataloged yet. The orchestrator must run the catalog writer when it lands the report.

No product, tooling, Project, Git, dependency, token, generated artifact, or custom-CSS implementation was
modified. The only file authored by this lane is this report. The untracked
`docs/reviews/research/2026-08-31-css-token-toolchain-research.md` and
`docs/architecture/proposed/token-contract-program.md` were created by another lane and were not touched.

## Unconfirmed, low priority

None. Terrazzo's future strict-DTCG posture may change, but 2.7.1 is conclusively not a strict oracle and no
recommendation depends on future behavior.

## Issue summary

Audit found 7 confirmed findings (severity ceiling P1): Orb's 178-token source is only DTCG-shaped, with 148 direct and 163 effective nonconformant values; its generator would corrupt conformant structured values and uses deprecated/type-blind APIs; exact Tailwind 4.3.3 compilation proves missing merge coverage for aspect/blur/ease and refutes dimension/z registration; current TV pre-merge destroys class-trace evidence and neither merge package has a decision callback; browser cascade tracing requires the existing CDP surface rather than a package callback; the `createTV` global-state seal is prospective rather than closed; and the `dark` custom variant is dead/stale. Recommended program: direct Ajv 8.20.0 + ajv-formats 3.0.1 over pinned official 2025.10 Format/Resolver schemas, local semantic/extension checks, complete per-family migration with raw runtime formulas preserved in `orb.cssValues` (matching the existing `orb.pointerFine` namespace precedent), a single Orb merge with bounded replay diagnostics, browser CDP cascade tracing, and planted compiler/conformance/theme controls. Report: `docs/reviews/stickler/2026-08-31-tailwind-style-dictionary-dtcg-api-audit.md`.
