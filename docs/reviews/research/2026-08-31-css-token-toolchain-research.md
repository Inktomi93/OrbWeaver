---
kind: review
status: active
updated: 2026-08-31
---

# CSS / token toolchain — 2026 ecosystem research and conformance audit

> **Evidence document.** Findings only; the plan built on them is
> [`../../architecture/proposed/token-contract-program.md`](../../architecture/proposed/token-contract-program.md).
> Method: SearXNG + WebSearch discovery, trafilatura/raw-GitHub on primary sources, `ast-grep`/`jq`
> against installed `node_modules` and the live token source. Every negative carries a scanned-file
> count plus a second method. No product or tooling code was modified while producing this.

## 0. What we actually have (corrected — first probe was wrong)

`require()` from repo root reports NOT INSTALLED for all of these; that is pnpm's strict layout,
not absence. Real state, from `packages/ui/node_modules/*/package.json`:

| package | installed | declared in |
| - | - | - |
| tailwindcss | 4.3.3 | packages/ui, packages/client, root |
| tailwind-merge | 3.6.0 | packages/ui (peer of tailwind-variants) |
| tailwind-variants | 3.2.2 | packages/ui |
| style-dictionary | 5.5.0 | packages/ui |
| eslint-plugin-better-tailwindcss | 4.7.0 | root |

Nothing is missing from the catalog. The gaps below are integration/validation gaps, not
uninstalled dependencies.

## 1. tailwind-merge exposes NO conflict trace — confirmed, not assumed

Full public surface (`dist/types.d.ts:2875-2876`): `createTailwindMerge`, `extendTailwindMerge`,
`fromTheme`, `getDefaultConfig`, `mergeConfigs`, `twJoin`, `twMerge`, `validators`.

Negative receipts (`ast-grep -l ts` over the installed d.ts, `--no-ignore` x3):

- control `twMerge` -> matches=2, scannedFileCount=1  (the search ran)
- `onConflict` / `trace` / `debug` / `explain` -> matches=0, scannedFileCount=1 each
- literal cross-check `grep -acE "onConflict|conflictTrace|explain\(|reportConflict"` -> 0

The `createTailwindMerge` "callback" in the docs is a lazy **config factory**, not a
conflict-decision hook. There is no winner/loser reporting API.

### The parser hook is narrower than it looks

`ConfigStaticPart.experimentalParseClassName?(param): ParsedClassName` (`types.d.ts:40`), with
`ExperimentalParseClassNameParam { className, parseClassName }` and exported types
`ExperimentalParseClassNameParam` / `ExperimentalParsedClassName` (`:2876`).

Every class outside a cache hit passes through it, and it receives the default parser to delegate
to. It exposes syntactic parts — modifiers, important, base class, postfix, and external-prefix
status — but **not** the class-group classification or conflict decision. An input/output set diff
also cannot identify duplicate occurrences or asymmetric conflicts reliably. A complete `__orb`
merge receipt therefore requires one Orb-owned merge front door plus bounded occurrence/suffix/pair
replay through the actual configured merger. The hook may decorate debug display under the exact
package pin; it is not a correctness dependency or a loser/winner source.

Caveat the docs state plainly: experimental, may break in any minor.

## 2. tailwind-merge is a heuristic parser, not compiler truth

From its own `docs/limitations.md`, the parts that bite a token-driven design system:

- It infers class type from **name shape**, not from your compiled Tailwind config.
  `twMerge('text-sm text-2xs')` -> `text-2xs`; a custom `text-2xs` doing something other than
  font-size still evicts `text-sm`.
- "Doesn't understand custom CSS" — `twMerge('my-custom-padding p-4')` keeps both.
- Arbitrary properties never conflict with standard classes: `twMerge('p-4 [padding:1rem]')`
  keeps both, deliberately, for bundle size.
- Arbitrary variants never conflict with standard modifiers.
- Ambiguous arbitrary values need explicit labels or it guesses:
  `font-(--my-family) font-(--my-weight)` -> keeps only the second (both read as font-weight).
  `font-(family-name:--my-family)` is the fix. Same for `bg-[position:...]` vs `bg-[size:...]`
  and `text-[length:...]`.

Relevant to us because our token pipeline emits CSS custom properties and our components use
arbitrary-variable classes. The label requirement is a real, silent correctness trap.

### Exact Tailwind 4.3.3 compiler truth, not prefix inference

A fresh `tailwindcss.compile()` probe over Orb's generated `@theme` produced named utilities for exactly
14 custom families: color, spacing, radius, aspect, shadow, blur, border width, font family, text size,
leading, tracking, container, width, and easing. Orb's configured merger already handles 11; it leaves both
conflicting candidates alive for **aspect, blur, and ease**.

The same probe was negative for `dimension`, `immersive`, `reading`, `fade`, `z`, and `motion`. Valid
arbitrary-variable forms such as `w-(--dimension-rail)` and `z-(--z-raised)` already use Tailwind core
groups and merge. Therefore namespace enforcement must compare the exact compiler-positive set against the
configured merger in both directions. Registering every token prefix would encode another false model.

Tailwind-variants adds a second seam: Orb's `createTV` currently merges internally before many results reach
`cn()`, so a loser can disappear before a diagnostic front door sees it. A live 3.2.2 probe proved
`createTV({twMerge:false})` preserves raw normal and slot candidates. The future trace must turn that merge
off, keep TV as the variant/slot composer, and perform one configured Orb merge.

## 3. Our token source is DTCG-SHAPED but not DTCG-CONFORMANT

`packages/ui/src/tokens/tokens.json` (62,288 bytes, 178 tokens). Declared vs actual `$value`
runtime type:

| `$type` | count | our `$value` | DTCG 2025.10 requires | verdict |
| - | - | - | - | - |
| color | 75 | 60 literal strings (`oklch(0.158 0.006 60)`) + 15 `{alias}` strings | literals require an object with `colorSpace` + `components`; alias strings are legal | 60 direct failures; 15 aliases are syntactically legal but resolve to those invalid literals |
| dimension | 67 | string (`0.25rem`) | object `{value: number, unit: "px"\|"rem"}` | NON-CONFORMANT |
| duration | 8 | string (`130ms`) | object `{value: number, unit: "ms"\|"s"}` | NON-CONFORMANT |
| shadow | 5 | string | composite object (color/offsets/blur/spread) | NON-CONFORMANT |
| string | 6 | string (`2 / 3`) | **`string` is not a DTCG type at all** | INVALID TYPE |
| number | 14 | number | JSON number | conformant |
| cubicBezier | 1 | array of 4 | array of four numbers | conformant |
| fontFamily | 2 | one comma-separated CSS family list per string | one font name per string, or an array of such strings | schema-shaped but normatively invalid |

Spec receipts (trafilatura, designtokens.org/tr/drafts):

- dimension: format module line 464 — "The value *MUST* be an object containing a numeric
  `value` ... and `unit` of measurement (`"px"` or `"rem"`)."
- duration: same section — object with `value` + `unit` of `"ms"` or `"s"`.
- color: color module line 68-72 — `$type` MUST be `color`; `colorSpace` **required**,
  `components` **required**, `hex` optional fallback.
- type vocabulary (every "MUST be set to the string X" in the format module): border,
  cubicBezier, dimension, duration, fontFamily, fontWeight, gradient, number, shadow,
  strokeStyle, transition, typography (+ color, defined in its own module).
  `grep -acE 'the string `string`'` -> **0**. There is no `string` type.

The count must be stated by layer rather than collapsed into the earlier 155 estimate:

- **146** fail the official direct schema-shaped values: 60 literal colors + 67 dimensions + 8
  durations + 5 shadows + 6 unknown `string` types.
- **148** fail normative direct-value conformance after adding the two comma-list font families.
- All 15 color aliases are syntactically valid references, but resolve to invalid literal-color
  targets, so **163 of 178 fail end-to-end resolved 2025.10 conformance**.
- Only 14 `number` tokens and one `cubicBezier` token are conformant end to end.

## 4. Why the build stays green — and why that is the actual defect

Style Dictionary 5.5.0 detects DTCG **syntax** (`$value`/`$type`) and resolves references. It does
not validate declared value shapes against the spec.

Receipts against the installed copy (`lib/`, 101 files scanned, control `resolveReferences`
matches=4):

- `validateToken` / `validate` / `assertValid` / `schema` -> matches=0
- `find lib -iname "*valid*" -o -iname "*schema*"` -> no files

Their own docs say it outright (styledictionary.com/info/dtcg): *"the latest format 2025.10 does
not have full support yet in Style Dictionary. This is a work in progress in v5."* Their conversion
helper explicitly does **not** refactor type values to DTCG types.

Upstream is moving: a 5.x release adds "support for DTCG v2025.10 dimension token type object
value, while remaining backwards compatible for dimension tokens using string values."
Backwards-compatible acceptance is exactly what lets our non-conformance stay invisible.

**This is the honest framing: a green build currently certifies "Style Dictionary could parse it",
and we have been reading it as "the token contract is valid." Those are different claims.**

### The current generator would corrupt conformant values

`packages/ui/tokens.build.ts` treats every array as a cubic bezier and every other value with
`String(value)`. Structured colors, dimensions, durations, and shadows therefore become
`[object Object]`, while a shadow array is formatted as a cubic bezier. It also calls deprecated
`exportPlatform()` and manually re-walks the token tree even though Style Dictionary 5.5.0 exposes
`getPlatformTokens().allTokens` with paths and transformed values.

Style Dictionary has useful structured transforms, but not a complete stable-family answer: its standalone
duration handling is legacy, its transition formatter still interpolates DTCG duration objects incorrectly,
and runtime CSS expressions are intentionally outside its token transforms. Source conformance and a
type-directed modern emitter must therefore migrate atomically by family under byte/computed output parity.

## 5. The part that changes the recommendation

4 of our 5 `shadow` values are CSS-runtime expressions:

```
0 0 0 1px oklch(from var(--color-primary) l c h / 0.4), 0 0 18px ...
0 0 0 1px var(--color-shadow-hairline), inset 0 1px 0 0 var(...)
inset 0 1px 0 var(--color-shadow-cta-highlight)
```

A DTCG shadow is a structured object of concrete sub-values. A relative-color function resolving
against a Tailwind-generated custom property **cannot be expressed in DTCG at all** — not as a
formatting inconvenience, but by construction. Same for anything using `color-mix()` or `calc()`
over runtime vars.

Also: 15 of 75 colors are `{alias}` references, 60 are literals.

So "make tokens.json DTCG-conformant" is not a single migration. It is a partition decision:
which values are **design tokens** (portable, structured, tool-interchangeable) and which are
**CSS authored in the token file because it was a convenient place to put it**. The second group
must not carry a `$type` at all. The source-level solution is one root/group
`$extensions["orb.cssValues"]` payload: a closed map from generated custom-property
target to a concrete CSS string plus description/provenance, with no `$value`. The runtime CSS stays
in the canonical JSON without being misidentified as tokens or creating a seventh source file. The
name `cssValues` is deliberate: calling them recipes would invite a private expression language,
resolver, and transform engine that the repo does not need.

The strict boundary must preserve the existing theming engine rather than flatten it: generated seed blocks,
custom `ThemeOverride` validation/clamping, carried room/speaker palettes, derived polarity and
`color-scheme`, relative-color surface/shadow formulas, and the trusted owner's separately validated
end-of-head custom CSS. Strict DTCG applies only to values claiming portable-token status. Any implementation
change to the custom-CSS validation/injection boundary is security-sensitive and is not part of this migration.

## 6. Ecosystem options, priced

Purpose-built DTCG -> Tailwind v4 `@theme` generator exists and is real:

| package | latest | weekly dl | first published |
| - | - | - | - |
| @terrazzo/parser | 2.7.1 | 94,860 | 2024-04-26 |
| @terrazzo/cli | 2.7.1 | 78,808 | 2024-04-26 |
| style-dictionary | 5.5.2 | 2,076,750 | 2017-03-07 |
| tailwind-merge | 3.6.0 | 82,457,031 | 2021-07-18 |

`@terrazzo/plugin-tailwind` — "Generate a Tailwind v4 theme from DTCG tokens" — is the only
first-class DTCG->Tailwind-v4 path found. It is not a strict stable-2025.10 oracle: exact 2.7.1
source accepts Terrazzo-only `string` / `boolean` / `link` types, permits non-DTCG dimension units,
normalizes legacy string colors, and gives `$extensions.mode` proprietary semantics. Its useful
alias/type-mismatch checks validate a Terrazzo dialect rather than the exact contract Orbweaver needs.

**Slop filter — do not adopt these.** The "DTCG validator" packages that surface first in search
are all weeks old with negligible adoption: `@design-token-kit/core` (37/wk, created 2026-06-10),
`@designesy/tokens` (31/wk, created 2026-08-15), `norma-design-lint` (14/wk, created 2026-07-08).
Search-engine prominence is not adoption; these read as generated packages.

## 7. Options as originally priced (SUPERSEDED — see note)

> **Owner ruling 2026-08-31 (pre-launch):** KISS/YAGNI are suspended; the call is to do this
> properly and in full rather than take the cheapest sufficient option. The options below are
> preserved as the pricing record — **the chosen plan is the official-schema gate plus selected
> borrowed patterns, without Terrazzo**,
> specified in `../../architecture/proposed/token-contract-program.md`. Read that for what to build.

**A. Official schema + Orb semantic gate (chosen).** Declare `ajv@8.20.0` and
`ajv-formats@3.0.1` as direct dev dependencies, compile the pinned official 2025.10 schema in strict
all-errors mode, and supplement its limits with terminal-alias/type checks, single-name font-family
validation, and strict Zod schemas for Orb extensions. Both Ajv packages already resolve at those
exact versions in the lock, so this adds declared ownership but no new resolved code. Planted
controls run both directions per house gate law.

**B. Adopt Terrazzo as a validating parser (rejected after source audit).** It would add a second
token dialect, not a stricter stable-format oracle. Keep Style Dictionary as emitter and validate
before it runs.

**C. The merge/cascade receipt.** Disable tailwind-variants' internal merge, make Orb's `cn()` the
sole merge point, and recover loser/winner chains with bounded replay through the actual configured
merger. `experimentalParseClassName` may enrich syntax display but cannot supply classification or
decisions. For true browser cascade provenance — which declaration actually won in the rendered page —
raw CDP matched styles are insufficient because protocol `CSSProperty` has no activity verdict. #950
therefore uses the revision-matched official DevTools frontend SDK's
`CSSMatchedStyles.propertyState` through `TargetManager`, `DOMModel`, and `CSSModel.getMatchedStyles`.
The SDK bytes are a committed path-closed, hash/license/revision-verified tooling asset set; computed
style alone still cannot answer the loser or reason.

## 8. Follow-up audit settlements

- A fresh Tailwind/Vite build compiled 3,407 modules and emitted all 178 generated variables; the
  existing source currently loses none. Migration still owes before/after byte and computed parity.
- A live tailwind-variants probe proved `createTV({twMerge:false})` preserves raw normal and slot
  candidates, while the current factory can discard conflicts before Orb's `cn()` sees them.
- Exact Terrazzo 2.7.1 parser/linter source validates the broader dialect described above; it is not
  the chosen oracle.

---

# PART 2 — Alternatives, industry practice, patterns to borrow

## 9. Version headroom: essentially none

| package | ours | latest | gap |
| - | - | - | - |
| tailwindcss | 4.3.3 | 4.3.3 | current |
| @tailwindcss/vite | 4.3.3 | 4.3.3 | current |
| tailwind-merge | 3.6.0 | 3.6.0 | current |
| eslint-plugin-better-tailwindcss | 4.7.0 | 4.7.0 | current |
| tailwind-variants | 3.2.2 | 3.3.1 | 1 minor |
| style-dictionary | 5.5.0 | 5.5.2 | 2 patches |

No package is stale. There is no "better version" to move to.

## 10. Are there better PACKAGES? Mostly no — one category is genuinely contested

- **tailwind-variants (3.78M/wk) vs class-variance-authority (63.3M/wk).** cva has ~17x the
  downloads, but tv is a superset (slots + built-in merge). D54 already ruled this. No reason
  to reopen; cva would be a downgrade in capability.
- **tailwind-merge (82.5M/wk)** is the category, not a choice. There is no serious competitor.
- **style-dictionary (2.08M/wk) vs @terrazzo/cli (78.8k/wk).** SD has 26x the adoption; exact
  Terrazzo 2.7.1 is **not** a stricter stable-DTCG oracle. It accepts proprietary types/units and
  legacy colors. **They are converging, not competing** — there is a joint
  RFC for a shared "Token Listing" format
  (style-dictionary discussion #1479), explicitly framed by a maintainer as "an interoperable
  extension with DTCG," with both tools as co-producers. So this is not a fork-in-the-road bet.
- **Panda CSS (428k/wk), vanilla-extract (3.0M/wk), StyleX (1.9M/wk)** are whole-paradigm
  replacements (build-time atomic CSS with typed tokens). Adopting one is a client rewrite, not
  a dependency swap. Not proportionate to the problems in Part 1.

## 11. What GitHub's Primer actually ships (primary source, read from the repo)

`primer/primitives` — 108k weekly downloads, the largest openly-readable production token system.

**Their validation is a hand-rolled zod script, run in CI.** Not a vendor tool.

- `package.json`: `"lint:tokens": "tsx scripts/validateTokenJson.ts"`,
  `"check:removed-tokens": "tsx scripts/checkRemovedTokens.ts"`
- `.github/workflows/token-schema-validation.yml` runs `lint:tokens --outFile=tokenErrors.json`
  on PRs, gated on a `hasChanged` job, then posts a per-file/per-path error table as a PR comment
  and `core.setFailed`s.
- deps: `zod ^4.1.3`, `zod-validation-error ^4.0.1`, `json5 ^2.2.1`.

**The schema shape is exactly this repo's house pattern.** `src/schemas/designToken.ts`:

```
const tokenTypes = z.discriminatedUnion('$type', [
  colorToken, cubicBezierToken, dimensionToken, shadowToken, borderToken,
  fontFamilyToken, fontWeightToken, gradientToken, typographyToken,
  viewportRangeToken, numberToken, durationToken, stringToken, ...
])
```

One schema file per token type, discriminated on `$type`, every object `.strict()` so an unknown
key is an error. That is a string-union dispatch with an exhaustive map — the same discipline
`no-inline-union-redecl` / `exhaustive-dispatch` already enforce here.

`validateTokenJson.ts` validates `$type` FIRST and **aborts the file** if types are invalid, before
running value validation. It prints "N token files validated" with a per-file check/cross — a
scanned-count receipt, the same property our gate law demands.

### THE KEY FINDING: Primer has NOT fully migrated either

```
// colorToken.ts
$value: z.union([colorHexValue, colorW3cValue, referenceValue])

// dimensionValue.ts  —  strict object ONLY
z.object({ value: z.number(), unit: z.enum(['px','rem','em']) }).strict()
```

Dimensions they migrated to the W3C object. **Colors still accept a legacy hex string.** So
"nobody is fully conformant" is true, and partial migration is the normal industry state, not a
failure. Carbon is mid-migration too (`carbon-design-system/carbon` issue #23091 converts
`@carbon/layout` to DTCG + a Style Dictionary pipeline).

**But we are not in the tolerated bucket.** Primer's `colorHexValue` accepts only `#rgb`/`#rrggbb`/
`#rrggbbaa`. Our colors are `oklch(0.158 0.006 60)` — raw CSS color functions, which even the most
permissive real-world schema rejects. Mitigating: `oklch` IS a supported DTCG colorSpace, so
`oklch(0.158 0.006 60)` -> `{colorSpace:"oklch", components:[0.158,0.006,60]}` is a mechanical
conversion for the 60 literal colors.

### Their custom string is evidence of a dialect, not our migration target

```
// stringToken.ts
$type: tokenType('custom-string')
```

DTCG has no `string` type. Primer needed one and named it `custom-string`, which is honest about
being proprietary but is still outside the stable vocabulary. Orbweaver will not copy it: portable
numeric decisions become standard `number` tokens, while serialization-only ratio/percentage CSS
lives in `orb.cssValues` without `$value` or a custom `$type`.

## 12. Patterns worth borrowing, ranked by fit to THIS repo

**1. Official 2025.10 JSON Schemas through Ajv, then strict Orb semantics.** Highest value. Declare
the already-resolved `ajv@8.20.0` and `ajv-formats@3.0.1` directly, pin/hash the Format and Resolver
schemas, validate the official shape first, then run local alias/font/extension checks. Primer's
type-first abort, strict extension objects, scanned-count receipt, and structured
`{path, message, code}` output remain good patterns. Zod 4.4.3 is appropriate for the small Orb
extension schemas; its semi-experimental JSON-Schema converter cannot compile the official external
references and conditional branches.

**2. The removed-token ratchet.** `checkRemovedTokens.ts` diffs token names against
`git merge-base HEAD <base>` using `git ls-tree` + `git show`, and maintains a committed
`src/tokens/removed.json` ledger. This is precisely the `ledgers:fresh` + ratchet pattern already
in this repo, applied to tokens. It makes a token deletion a deliberate, reviewable act instead of
a silent break — worth having given how many surfaces read these vars.

**3. `$extensions` carrying LLM guidance — the one genuinely novel idea.**

```
// llmExtension.ts —  key: 'org.primer.llm'
z.object({ usage: z.array(z.string()).optional(), rules: z.string().optional() })
```

GitHub embeds agent-facing usage rules INSIDE the token file, under a vendor-namespaced
`$extensions` key, schema-validated like everything else. They pair it with a repo-root
`DESIGN_TOKENS_GUIDE.md` written for agents — it has sections titled "Keyword Enforcement
(RFC 2119)", "Decision Tree: Easing Selection", and "Hallucination Guard", plus a
background/foreground pairing matrix with MUST/NEVER rules and required contrast ratios.

For a codebase whose stated author is "a rotating cast of amnesiac agents", this is the highest-
leverage pattern found in the whole sweep: the token file becomes self-documenting to the next
cold agent, and the guidance is validated rather than rotting in prose. We already have
`$description` on 141 of 178 tokens and `$extensions` on 5 — the mechanism is present and unused.

**4. `$deprecated` as a real lifecycle.** Spec format module lines 167-173 and 198-208:
`$deprecated` takes `true` / a string explanation / `false`, on tokens AND on groups (inherited by
children, overridable). We use it on **0** tokens. Industry practice is deprecate in a minor,
soft-delete in the next minor, remove in a major, shipping a codemod with each major. Pairs
naturally with the removed-token ratchet.

**5. Cascade layers instead of a merge function — interesting, NOT yet a recommendation.**
Tailwind v4 is built on native `@layer`. The community pattern is to declare
`@layer theme, base, components, utilities;` and put component styles in a lower layer, so
caller classes win by cascade and no runtime merge is needed. **Honest caveat: there is no
official Tailwind maintainer position on this** — the v4/tailwind-merge discussion (#14400) is
entirely community proposals (Qwik UI's maintainer, others), with no maintainer statement either
way. Clerk shipped a layer-name option for exactly this reason. Worth a spike, not a migration,
and it would collide with D54's sealed-`ui` merge posture — an owner call, not a lane's.

**6. Strict JSON source.** Stable Format 2025.10 defines JSON and recommends `.tokens` or
`.tokens.json`. Keep the constitutionally named `tokens.json`; renaming buys no conformance and
would churn the locked six-home path. Put guidance in `$description` and schema-validated vendor
extensions, not comments.

## Post-research settlement — static provenance and live cascade (2026-08-31)

This remains an evidence document, not active architecture law. Later implementation established the
boundary that the original ecosystem research could not measure:

- \#972 proved 413 previously opaque `tv` observations in each static ownership gate. The remaining 508 are
  genuinely runtime-assembled. `cva` has zero package, lockfile, import, and call population, so Orbweaver did
  not add a grammar for an absent library.
- \#975 repaired the official DevTools SDK materializer and live denominator without changing the pinned SDK
  revision. Literal `import.meta.resolve()` discovery plus the official formatter API produced a 479-resource,
  9,853,687-byte hash/license/revision-verified closure containing both formatter-worker assets. A null
  `propertyState(property)` is an unclassified SDK row, not `Active` or `Overloaded`; mixed populations keep
  their classified rows, while an ordinary zero classified-declaration population remains `INSTRUMENT ERROR`.
  Blank Vite rule URLs recover repository provenance only through the stylesheet's `data-vite-dev-id` header.
  All six live property queries returned structured nonzero results with zero unexpected requests.

The active contract and enforcement posture lives in `client-architecture-lockdown.md` §4. This rider records
what the research led to; it does not promote this review over that law.

## 13. What I did NOT verify in Part 2

- ~~zod availability~~ SETTLED: `zod` is a declared direct dependency of `packages/ui`
  (resolves to 4.4.3), same major as Primer's ^4.1.3, so the schema pattern ports directly.
  `style-dictionary` is a **devDependency** there, so the token build is already dev-time-only —
  a validator script sits naturally beside it. No D54 conflict: zod is already inside the seal.
- ~~Terrazzo's own conformance against 2025.10~~ SETTLED from the exact published 2.7.1 source:
  broader dialect, not a strict oracle.
- Whether the cascade-layer pattern actually works under our `tv()` slot usage. Unspiked.
- Carbon's and Spectrum's current schemas — I read Carbon's migration issue summary and Spectrum's
  repo root only, not their validation code.
