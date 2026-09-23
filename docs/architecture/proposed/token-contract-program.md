---
kind: spec
status: active
updated: 2026-08-31
---

# The token contract program — making `tokens.json` a validated contract, not a parsed file

> **IMPLEMENTED AND COLD-CONFIRMED as #936 on 2026-08-31.** Evidence and the original design basis were
> researched and dated 2026-08-31; every claim below traces to that measurement. This document owns the durable shape; GitHub Project 1 owns
> lifecycle. **Owner ruling 2026-08-31 (pre-launch): KISS/YAGNI suspended — build it properly and in
> full.** The cheap-option framing in the research doc §7 is superseded by this program.

The implementation train is `0ba9b094d` + output-placement repair `22a7ae04a` + target/seed-ratchet repair
`01905d6b2`. Frontier cold review is
`../../reviews/stickler/2026-08-31-token-contract-936-cold-review.md`: 178 unique output targets, 272 scanned
entries, 44/44 final adversarial checks, and byte-identical generated artifacts. `orb.cssValues` requires
explicit `theme|root` placement; the removal ratchet covers portable paths and exact CSS target identity;
Light/Mocha seed membership is exact; real-worktree Git history and synthetic fs-backed conformance are
separate honest arms. The problem statement below is the measured **pre-migration baseline**, not current
source truth.

**Post-program additive contract (#969, 2026-08-31).** The vault remains open to new portable semantics;
conformance is not a frozen token count. `color.reading-plate-foreground` and
`color.sidebar-accent-foreground` were added because those paint hosts cannot honestly share the base or
sidebar foreground around an accepted custom palette's polarity crossover. Current source validates 187
base tokens, 290 base/Light/Mocha entries, and 195 unique CSS targets. The three generated seed palettes
gain only those two paired variables, with values equal to their former winning inks; runtime ThemeScope
derives them against their actual surfaces. The authored base remains exact; only a derived shared-host ramp
delta or input alpha retracts when its starting recipe makes a common AA ink mathematically impossible. The
separately validated owner-CSS plane still wins later.

**Post-#969 framebuffer rider (#883, 2026-08-31).** “Analytically at 4.5” is not a sufficient generated
foreground contract: browser OKLCH resolution and alpha composition measured Mocha input/popover at 4.430
and both accepted pivot inputs at 4.460. WCAG/rendered acceptance remains 4.5; Orb-owned neutral derivation
aims at 4.6, capped by the unchanged authored anchor's physically attainable black/white endpoint, and its
derived ramp/input family yields to that same attainable target. The accepted-base matrix's analytic
minimum is 4.5798; exact pivots solve to 4.6127/4.6144. The generated base token map remains byte-identical;
Mocha's `muted-foreground` is the only seed output retuned (0.720→0.731, quantized input/popover
4.430→4.6286). The all-seed gate is derived from `SEED_THEME_VALUE_SETS`, so a future value-set inherits the
same host matrix rather than a theme-name exception.

**Post-program CSS provenance boundary (#972/#975, 2026-08-31).** This document remains the implemented
token-contract design record; it does not supersede the active CSS law. #972 proved 413 previously opaque
`tv` observations in each static ownership gate and left 508 genuinely runtime-assembled observations. The
repository has no `cva` dependency, lockfile entry, import, or call population, so no speculative grammar was
added. #975 is the browser-tier complement: null DevTools `propertyState(property)` rows are legitimate
unclassified SDK states and are skipped before the classified-declaration denominator; an ordinary zero
classified population still fails loud. Its same-revision closure is 479 resources / 9,853,687 bytes, and
Vite repository provenance is recovered only from the authoritative `data-vite-dev-id` stylesheet header.
These results settle the boundary around the token program; they do not reopen D54 or create a second value
authority.

## 1. The problem in one paragraph

`packages/ui/src/tokens/tokens.json` holds 178 tokens in DTCG-shaped syntax (`$value`/`$type`).
The exact failure has three layers: 146 tokens fail the official direct-value shapes; 148 fail
normative direct-value conformance once the two comma-separated `fontFamily` CSS lists are included;
and 163 fail end-to-end 2025.10 conformance after 15 syntactically legal color aliases resolve to
invalid literal-color targets. Six of the direct failures declare `$type: "string"`, which is not a
DTCG type at all. Only 14 `number` tokens and one `cubicBezier` token are end-to-end conformant.
Style Dictionary 5.5.0 accepts all of it because it detects DTCG **syntax** and resolves references
but ships **no value-shape validator**
(101 files scanned; `validateToken`/`validate`/`assertValid`/`schema` all matched 0; no `*valid*`
or `*schema*` file exists in its `lib/`). Their own docs say 2025.10 is *"a work in progress in v5."*

At the pre-migration baseline, a green build certified only *"Style Dictionary could parse this"*, while
the repo read it as *"the token contract is valid."* #936 replaced that false implication with the enforced
contract above. The historical distinction remains here because it is the failure mode the gate prevents.

## 2. What we are NOT doing, and why

- **Not replacing Style Dictionary.** Its modern dictionary API and type-directed transforms remain a
  useful emitter once a real validator guards the input. Terrazzo 2.7.1 accepts a broader proprietary
  dialect, so adding it would create a second parser without creating a stricter oracle.
- **Not adopting Panda/vanilla-extract/StyleX.** Those are paradigm rewrites of the client, not
  dependency swaps. Nothing in the findings justifies one.
- **Not reopening D54** (`tailwind-variants` over `cva`). tv is a superset; the ruling stands.
- **Not reducing the theming engine or custom CSS.** Stable DTCG governs values that claim to be
  portable tokens. Seed-theme generation, custom `ThemeScope` overrides, polarity derivation,
  carried room palettes, Orb runtime CSS formulas, and user-authored custom theme CSS remain
  first-class capabilities at their explicit owned boundaries. The migration must preserve their
  emitted CSS and rendered behavior; validation must not misclassify legitimate authored CSS as an
  invalid token.
- **Not copying another system's tolerated legacy.** GitHub's Primer still accepts legacy hex color
  strings and Terrazzo accepts a broader proprietary dialect. Those are evidence that migration is
  common, not permission for Orbweaver to stop halfway. Stable DTCG 2025.10 is the contract for every
  portable token; Orb-only CSS runtime values are explicit vendor-extension data, never mislabeled
  standard tokens. The objective is enforced conformance, not a marketing badge.

## 3. The partition decision (the architectural core — decide this FIRST)

4 of our 5 `shadow` values are CSS-runtime expressions:

```
0 0 0 1px oklch(from var(--color-primary) l c h / 0.4), 0 0 18px …
inset 0 1px 0 var(--color-shadow-cta-highlight)
```

A DTCG shadow is a structured object of concrete sub-values. **A relative-color function resolving
against a Tailwind-generated custom property cannot be expressed in DTCG at all** — not awkwardly,
but by construction. Same for `color-mix()` and `calc()` over runtime vars.

Therefore `tokens.json` currently holds two different kinds of thing, and the program's first act is
to name them. This refines the paint law rather than weakening it: reusable/portable visual decisions
remain tokens; mechanism-local CSS remains in its responsible sanctioned stylesheet; only token-output
expressions that cannot be portable live in the vendor extension.

| Class | Definition | Carries a spec `$type`? |
| - | - | - |
| **Token** | A portable design decision with a concrete value. Interchangeable with other tools. | YES — and must satisfy the spec value shape. |
| **Runtime CSS value** | A concrete expression whose meaning depends on the CSS runtime (`var()`, `oklch(from …)`, `color-mix()`, `calc()`). | NO — it is vendor-extension data, not a token. |

Derived CSS stays in the same canonical JSON under one vendor-namespaced
`$extensions["orb.cssValues"]` payload. It is a closed map from generated custom-property
target to a concrete CSS string plus description/provenance; it has no `$value`, so DTCG does not classify
it as a token. This preserves
the six-home/one-path law without inventing a seventh source file or a custom `$type` the stable
vocabulary does not permit. It also avoids inventing a recipe DSL, resolver, or transform engine: these
values are authored CSS with explicit ownership, not portable token ingredients. **This partition is the
deliverable that outlives the tooling** — get it wrong and every later gate enforces the wrong thing.

The resulting ownership rule is closed:

| Thing being authored | One home |
| - | - |
| reusable portable value or alias | DTCG token/value set in the token vault |
| generated custom-property value that requires the CSS runtime | `orb.cssValues` in the canonical JSON |
| universal, client-wide, density, or shell-local CSS mechanism | the matching sanctioned stylesheet, with the paint-law WHY/test obligation |
| component anatomy/skin/state | the component's `tv()` variants |
| component layout | an `@orb/ui` primitive/container contract |
| trusted owner's personal override | the validated end-of-head `CustomThemeStyle` boundary |

## 4. The build

### 4.1 The validator — official schema first, Orb semantics second

Declare `ajv@8.20.0` and `ajv-formats@3.0.1` as direct dev dependencies of `packages/ui` and compile
the versioned official 2025.10 Format schema with strict/all-errors behavior. Both exact packages
already exist transitively in the lock, so this records ownership without adding resolved code.
The direct `zod@4.4.3` remains the right tool for the small Orb extension payload and semantic
checks; its `fromJSONSchema` API is semi-experimental and rejects the official schema's external
`$ref` and `if`/`then`/`else`, so it must not translate or reimplement the normative schema.

Validation has three explicit layers:

1. Ajv validates the official direct document/value shapes.
2. Orb semantic checks enforce the normative gaps a JSON schema cannot prove alone: one font name
   per `fontFamily` string, terminal alias resolution, alias target/type compatibility, and the
   closed standard `$type` vocabulary.
3. Strict Zod schemas validate `orb.llm`, `orb.cssValues`, and the existing
   pointer-fine extension, including unique output targets, metadata, and referenced custom properties.

Rules, each one paid for by a finding:

- **Pin the versioned official schemas.** A floating latest URL cannot silently change the contract.
- **Use closed string-union dispatch for Orb semantic checks and output roles.** Adding a role without
  an arm fails `tsc`, the same discipline as every other axis in the repo.
- **Use `.strict()` on every Orb extension object.** An unknown or typo'd key is an error, not
  silently ignored.
- **Validate `$type` and document structure before semantic resolution**, so a bad type cannot
  cascade into a hundred meaningless alias errors.
- **Structured output** `{path, message, code}` as JSON, so the verify harness consumes it like every
  other gate report rather than through a human-readable log.

### 4.2 Value shapes to enforce

| `$type` | count today | today's value | enforce |
| - | - | - | - |
| color | 75 | `oklch(0.158 0.006 60)` string | `{colorSpace, components[], alpha?, hex?}` — `oklch` IS a supported colorSpace, so the 60 literals convert mechanically; the 15 aliases stay references |
| dimension | 67 | CSS strings | 62 portable `px`/`rem` values become `{value, unit}` (normalizing `0em` to `0rem`); two `clamp()` values and three `em`/`ch` values split portable numeric inputs from their CSS-only output in `cssValues` |
| duration | 8 | `130ms` string | `{value: number, unit: 'ms'\|'s'}` |
| shadow | 5 | CSS string | the one concrete shadow becomes a structured token; the four runtime-dependent values become extension CSS values (§3) |
| number | 14 | number | already conformant |
| cubicBezier | 1 | `[0.16,1,0.3,1]` | already conformant |
| fontFamily | 2 | comma-separated CSS list in one string | array of one-font-name strings |
| string | 6 | ratio/percentage CSS syntax | remove the invalid type; represent portable numeric decisions as `number`, and put serialization-only syntax in the vendor extension (§4.3) |

### 4.3 Non-token CSS gets a namespaced extension, never a custom `$type`

DTCG has no `string` type (`grep` for it across the spec returns 0), and stable §5.2.2/§8 does not
permit arbitrary custom `$type` values. Primer's `custom-string` and Terrazzo's `string` are vendor
dialects, not stable-format precedent. Remove Orbweaver's six invalid `string` tokens from the token
tree: portable numeric decisions become standard `number` tokens; CSS-only ratio/percentage syntax
and the four runtime shadows become typed entries in
`$extensions["orb.cssValues"]`. The extension schema owns the closed output-target map,
concrete CSS strings, descriptions/provenance, and reference-integrity checks. It does not create a
private expression language.

### 4.4 The gate

A `tokens-contract` gate in the existing harness (`pnpm gate:new`), authored to
`tooling/src/verify/gates/GATE-AUTHORING.md`:

- Runs in the static tier; RED on any schema violation.
- **Planted controls in BOTH directions** — a known-bad token must fail it and a known-good token
  must pass it, pinned permanently in `tests/tooling/`. A gate that has never refused anything is an
  unvalidated instrument.
- **Prints its scanned-token count.** A zero must read as *clean*, never as *blind* — this is the
  same rule that makes a `scannedFileCount=0` a non-answer.

### 4.5 The removed-token ratchet

Port `primer/primitives/scripts/checkRemovedTokens.ts`: diff token names against
`git merge-base HEAD <base>` using `git ls-tree` + `git show`, against a committed `removed.json`
ledger. This is the repo's existing `ledgers:fresh` pattern applied to tokens, and it makes deleting
a token a deliberate reviewable act rather than a silent break across every surface reading the var.

### 4.6 `$deprecated` as a real lifecycle

Spec format module lines 167-173 and 198-208: `$deprecated` accepts `true` / a string explanation /
`false`, on **tokens and on groups** (inherited by children, overridable per child). We use it on 0
tokens today. Adopt the industry lifecycle: deprecate in a minor, soft-delete in the next, remove in
a major, ship a codemod with each major. Pairs directly with §4.5.

### 4.7 `$extensions` carrying agent guidance — the highest-leverage item

GitHub embeds LLM-facing guidance inside the token file under a vendor-namespaced key, schema
validated like everything else:

```
// org.primer.llm
z.object({ usage: z.array(z.string()).optional(), rules: z.string().optional() })
```

They pair it with a repo-root `DESIGN_TOKENS_GUIDE.md` written for agents — its sections include
"Keyword Enforcement (RFC 2119)", "Decision Tree: Easing Selection", and "Hallucination Guard", plus
a background/foreground pairing matrix with MUST/NEVER rules and required contrast ratios.

**This repo's stated author is "a rotating cast of amnesiac agents." Guidance that lives in prose
rots; guidance that lives in a schema-validated `$extensions` block is checked.** Adopt an
`orb.llm` extension carrying `usage` and `rules`, and make the paint-doctrine pairing
rules machine-readable rather than a doc an agent may not read. At the historical baseline we already
carried `$description` on 141 of 178 tokens and `$extensions` on 5 — the mechanism existed and was unused.

### 4.8 Keep the canonical source strict JSON

Stable Format 2025.10 defines token files as JSON and recommends `.tokens` / `.tokens.json`.
Orbweaver keeps the constitutionally named `tokens.json`: `.tokens.json` is a recommendation, not a
conformance requirement, and renaming would churn the just-locked six-home path for no semantic
gain. Agent guidance lives in schema-validated `$description` / `$extensions`, not JSON5 comments.

### 4.9 Make value-set composition a bounded Resolver contract

Validate a versioned DTCG 2025.10 Resolver document for the base, Light, and Mocha value sets. Orb's
adapter implements only the one-modifier/source-order subset the theming engine actually needs and rejects
unsupported resolver features. Seed files use conformant inherited/declared color values; palette identity
and `color-scheme` composition are resolver/Orb metadata, never undeclared token members. The manifest is
composition configuration over the same vault, not a second value authority.

### 4.10 Modernize the emitter atomically with the values

`tokens.build.ts` moves from deprecated `exportPlatform()` and a manual token-tree walk to
`getPlatformTokens().allTokens` plus `token.path`. Output is type-directed: structured color, dimension,
duration, shadow, font-family, cubic-bezier, and number values each have an explicit formatter/transform;
the `cssValues` extension has its own closed renderer; an unknown type or output role is RED. The source and
emitter migrate by family under captured byte/computed goldens so conformant objects can never stringify to
`[object Object]` or make a shadow array look like a cubic bezier.

## 5. Explicitly deferred — needs an owner call, not a lane

**Cascade layers instead of `tailwind-merge`.** Tailwind v4 is built on native `@layer`; the
community pattern puts component styles in a lower layer so caller classes win by cascade with no
runtime merge. **There is no official Tailwind maintainer position** — discussion #14400 is entirely
community proposals. It would also collide with D54's sealed-`ui` merge posture. Worth a spike;
not part of this program.

**The `__orb` merge/cascade receipt.** `tailwind-merge` exposes no conflict trace. The package's
`experimentalParseClassName` exposes syntax only, not class-group classification or the winning decision,
and tailwind-variants currently performs an earlier merge that can destroy evidence before Orb sees it.
The tracked #933 solution is to disable TV's internal merge, make `cn()` the sole merge front door, and
identify losers with bounded occurrence/suffix/pair replay through Orb's actual configured merger. Browser
cascade provenance belongs to the revision-matched official DevTools frontend SDK: Snap asks
`CSSMatchedStyles.propertyState` for `Active`/`Overloaded` through `TargetManager`, `DOMModel`, and
`CSSModel.getMatchedStyles`. The committed path-closed SDK asset set is hash/license/revision verified;
direct CDP matched-style inference would be a second partial cascade implementation and remains forbidden.
Both instruments remain outside this token migration; #950 and
`../../reviews/research/2026-08-31-devtools-css-cascade-provenance.md` own the cascade tier.

## 6. Done-criteria

1. Every token in `tokens.json` validates end to end against stable 2025.10 types and value shapes;
   no custom or legacy `$type` remains.
2. The partition of §3 is recorded in the file itself, not only in this doc.
3. `pnpm check` goes RED on a planted bad token and stays green on a planted good one, both pinned.
4. The gate prints its scanned-token count.
5. `removed.json` exists and the ratchet refuses an unrecorded deletion.
6. The generated Tailwind theme is byte-diffed before/after the migration — **a value change here is
   a visual regression, and the migration must prove it changed nothing it did not intend to.**
7. Seed themes, custom ThemeScope values, carried palettes, polarity, Orb runtime formulas, and the
   sanitized custom-theme CSS path retain explicit behavioral and rendered receipts; DTCG validation
   does not narrow authored-CSS capability.
8. The base plus light/mocha value-set composition is declared by a schema-valid, bounded 2025.10 Resolver
   manifest; unsupported resolver features fail loud rather than pretending Orb implements the full spec.
9. `tokens.build.ts` consumes `getPlatformTokens().allTokens`, uses type-directed output formatting, and
   has no deprecated `exportPlatform`, manual token-tree walk, or type-blind `String(value)` fallback.

## 7. Resolved research decisions

- Derived CSS stays in the canonical JSON as vendor-namespaced extension data with no `$value`; it
  is not a custom token type and does not create a seventh source home.
- Do not adopt `@terrazzo/parser` as a conformance oracle. Version 2.7.1 accepts Terrazzo-only
  `string` / `boolean` / `link` types, non-DTCG dimension units, and legacy color normalization; its
  required-type lint also rejects some spec-valid inherited typing. It validates a useful Terrazzo
  dialect, not the exact stable contract Orbweaver is adopting.
- Style Dictionary remains the emitter behind the new contract validator. It receives only validated
  standard tokens; the generator separately renders the closed Orb CSS-value extension.
- Strict JSON and the existing `tokens.json` path remain canonical. `.tokens.json` is a recommendation,
  not a conformance condition, and path churn would reopen the just-locked six-home doctrine for no gain.
