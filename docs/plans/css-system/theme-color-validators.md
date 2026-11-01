---
kind: plan
status: done
updated: 2026-10-31
---

# Why the wire and render theme schemas validate colors differently

Result: no security escape. The two schemas do not use two validators. Both reach the one kit module `packages/kit/src/safe-color/index.ts`. The wire schema asks one extra question, "can the renderer resolve this color", and the render clamp does not. Keep two schemas over the layered kit predicates and name the reason in each header.

Evidence labels: proven means a run or a read of the cited code showed it. Inferred means the evidence points there and no run isolated it.

## Security

No input passed both boundaries and reached CSS as a payload. The probe fed hostile and malformed strings (table below) to both boundaries. Every `url()`, `var()`, `expression`, `;`, `}`, `{`, `/*`, backslash escape, unicode look-alike, `color-mix()`, `light-dark()`, `lab()`, `hwb()`, `color()` and relative-color string failed `isSafeColor`, so both boundaries refused it. Proven.

Both boundaries share the same injection gate, `isSafeColor`. The wire predicate is `isSafeColor` plus a parse, so every value the wire accepts is also a value the render clamp accepts. Proven by construction at `packages/kit/src/safe-color/index.ts:129` and by the probe table.

## What each boundary runs

| Boundary | File | Color fields | Fills with a derived foreground (`accent`, `background`, bubble `bg`) |
| - | - | - | - |
| Wire | `packages/contracts/src/theme/override.ts:46` | `isRenderableColor` | `isDeterministicColor` and `isRenderableColor` (line 38) |
| Render | `packages/ui/src/content/theme-scope/clamp.ts:69` | `isSafeColor` | `isDeterministicColor` (line 70) |

Kit predicates, all in `packages/kit/src/safe-color/index.ts`:

| Predicate | Line | Accepts |
| - | - | - |
| `isSafeColor` | 99 | After `trim()`: 1 to 64 characters and one anchored shape. Shapes: hex of length 3, 4, 6 or 8; any 3 to 20 letter word; `rgb[a](...)`, `hsl[a](...)` or `okl(ch\|ab)(...)` with a closed character class and no nesting. |
| `isDeterministicColor` | 150 | `isSafeColor` and not a contextual keyword (`currentColor`, system colors, CSS-wide values). |
| `isRenderableColor` | 129 | `isSafeColor`, and either a contextual keyword or a value ColorJS parses to finite sRGB. |

`isRenderableColor` calls `isSafeColor` at line 131. The two boundaries are therefore already layered. The kit header at lines 3 to 8 states the reason: `@orb/ui` and `@orb/contracts` cannot import each other, so the predicate lives in kit and only the two zod schemas exist twice. `docs/law/UI-Theming-and-Content.md` section 12.5 ("One-home note") rules the two schemas deliberate and names the pairing test. It does not mention that they use different predicates.

`tests/contracts/theme/pairing.dom.test-d.ts` pins the inferred types equal. It pins no predicate behavior. Proven by reading the file.

## Input table

A scratch test ran the kit predicates, `themeOverrideSchema.parse` (wire) and `clampThemeTokens` (render) on a hostile and malformed input set plus the seed values. `ink` is `borderColor`. `fill` is `userBubble.bg`. `wire/render` shows whether each boundary kept the value.

### Inputs where the boundaries differ

All differences are one direction: the render clamp keeps a value that the wire schema drops. Both fields behave the same.

| Input | `isSafeColor` | `isRenderableColor` | wire / render |
| - | - | - | - |
| `notacolorxx`, `abc` (any unknown 3 to 20 letter word) | yes | no | drop / keep |
| `rgb(1..2 0 0)` | yes | no | drop / keep |
| `rgb(,,)` | yes | no | drop / keep |
| `rgb(1 2)` | yes | no | drop / keep |
| `hsl(ddd)`, `hsl(deg)` | yes | no | drop / keep |
| `oklch(. . .)` | yes | no | drop / keep |

### Inputs both boundaries treat the same

| Class | Examples | Result |
| - | - | - |
| Named colors | `red`, `RED`, `burlywood`, `rebeccapurple`, `transparent` | keep / keep |
| The CSS named-color list | every name tried | keep / keep |
| Hex | `#fff`, `#ffff`, `#ffffff`, `#ffffffff`, `#FFF`, `#fff` | keep / keep |
| Bad hex | `#ff`, `#fffff`, `#fffffff`, `#ggg`, 65-character hex | drop / drop |
| Numeric functions | `rgb(1,2,3)`, `rgb(1 2 3 / 50%)`, `rgba(1,2,3,.5)`, `hsl(120deg 50% 50%)`, `oklch(0.7 0.1 40 / 0.5)`, `oklch(-1 1 30 / 0.5)`, `oklab(...)` | keep / keep |
| Contextual ink | `currentColor`, `CanvasText`, `inherit`, `unset` | keep / keep on ink; drop / drop on fill |
| Trailing whitespace | `red\n`, `#fff` | keep / keep, stored untrimmed |
| Valid in CSS, refused by the shape | `rgb(1e2 0 0)`, `hsl(0.5turn 50% 50%)`, `hsl(-30 50% 50%)`, `oklch(0.7 0.1 40deg)` | drop / drop |
| Injection | `url(//evil)`, `url(x)`, `var(--x)`, `expression(1)`, `javascript:alert(1)`, `@import 'x'`, `red;`, `red; color: blue`, `red}`, `red}body{color:blue`, `red/*c*/`, `/*`, `{`, `}`, `;`, `red !important`, `red\n;`, `rgb\(1 2 3)`, `\72ed`, `r\65d`, `rgb(1 2 3)` plus NUL | drop / drop |
| Look-alikes | Cyrillic `е`, full-width `ｒｅｄ`, zero-width space, combining accent | drop / drop |
| Non-color functions | `color-mix(in srgb, red, blue)`, `light-dark(red, blue)`, `lab()`, `lch()`, `hwb()`, `color(srgb 1 0 0)`, `rgb(from red r g b)`, `oklch(from red l c h)`, `rgb(none 0 0)` | drop / drop |
| Size and shape | empty, space, tab, 64 and 65 character words, 85 character `rgb(...)`, 200,000 space `rgb(` | drop / drop |

A second probe fed browser-valid inputs to the kit: the CSS named-color list, the system colors, and a set of numeric forms (percent channels, slash alpha, `hsl` with `e` and `deg`, `oklab` with negative axes). `isRenderableColor` agreed with `isSafeColor` on every one. The only refusal was `hsl(-30 50% 50%)`, which `isSafeColor` already refuses, so both boundaries drop it. Proven for this sample. A browser-valid color that ColorJS cannot parse would still split the boundaries. The sample did not find one.

### Seed palettes and default content

| Set | Values | Unsafe | Safe but unrenderable | Wire and render disagree |
| - | - | - | - | - |
| `SEED_THEME_VALUE_SETS` `--color-*` vars (`packages/ui/src/tokens/themes.gen.ts`) | 84 | 0 | 0 | 0 |
| `SEED_THEMES` overrides (`packages/server/src/domain/settings/substrate/seed-themes.ts`) | 36 | 0 | 0 | 0 |
| Dev database `themes.override` and `characters.theme_override` (copy of `data/db/orbweaver.db`, 3 themes and 20 character overrides) | 276 | 0 | 0 | 0 |

Every stored and seeded value has the form `oklch(N N N)`. The production database was not read. The dev database is a disposable snapshot, so this is evidence for the stored shape, not for production.

`TOKENS["color.*"]` values in `packages/ui/src/tokens/index.ts` include `light-dark(...)` strings that `isSafeColor` refuses. They are stylesheet values emitted into `theme.css`, not override fields. The only token values read as ambient colors are `color.background` and `color.primary` (`packages/client/src/lib/resolve-theme-scope-tokens.ts:64`), which are plain `oklch(...)`.

## Where each boundary runs

### Wire boundary (`themeOverrideSchema`)

| Direction | Site |
| - | - |
| Write | `packages/server/src/domain/settings/verbs/create-theme.ts` (`parse`), `update-theme.ts`, `promote-theme.ts`. tRPC inputs take the strict twin (`packages/contracts/src/settings/index.ts:1041`). |
| Write | Theme file import: `wireThemeSchema` in `packages/server/src/primitives/serde/theme/index.ts`, and `themeToWire` on export. SillyTavern files are mapped to oklch literals in `st.ts` first. |
| Write | Character card override: `packages/contracts/src/character/index.ts:461` and `:901`, `packages/contracts/src/chat/roster.ts:343`. |
| Read | `toThemeView` (`packages/server/src/domain/settings/substrate/theme-views.ts`) runs `themeOverrideSchema.catch({})` on every stored row. Character reads parse at `packages/server/src/domain/character/persistence/queries.ts:917` and `:941`. |
| Store | `themes.override` and `characters.theme_override` columns as JSON. |
| UI write gate | `ColorField` (`packages/ui/src/primitives/color-field/color-field.tsx:151`) refuses a draft that fails `isRenderableColor` before the form value changes. |

The wire schema is a shape and renderability check with a security role as the first layer. Its header (`override.ts:1` to `:4`) calls it the boundary clamp. The injection guarantee comes from `isSafeColor` inside it. Inferred from the call graph: because every read re-parses, a stored value that fails the wire schema never reaches the client.

### Render boundary (`clampThemeTokens`)

| Step | Site |
| - | - |
| Input | `ThemeScope` props, typed `ThemeScopeTokens` (`packages/ui/src/content/theme-scope/theme-scope.tsx:60`). |
| Gate | `themeScopeTokensSchema` at `clamp.ts:76`, then derivation. |
| Sink | A React `style` object: `--*` custom properties plus `colorScheme` and `color` (`theme-scope.tsx:95`). React sets each key through the CSSOM, so the value is never concatenated into a stylesheet string. Inferred from React's style handling, not run here. |
| Derived strings | `oklch(from ${picked} ...)` and `calc(...)` wrap an accepted value (`clamp.ts:205`, `:258`). The accepted value matches the anchored shapes, so it cannot close the function. |

`clamp.ts:1` calls this file the security boundary. That is the stronger role: ThemeScope is the sanctioned path from an untrusted override to the DOM (`theme-scope.tsx:58`). The wire schema is the earlier gate on storage. The render clamp is the last gate before the DOM and must stay safe without trusting the caller.

### Other users of `isSafeColor`

| Site | Role |
| - | - |
| `packages/kit/src/card-frame/index.ts:360` | Plugin and card frame theme tokens. Adds `CSS_ESCAPE` (`<`, `>`, `{`, `}`) and runs on the server before the document is built (`packages/server/src/entry/http/plugin-frame.ts:184`). This sink concatenates into a document, so it keeps its own extra guard. |
| `packages/client/src/features/chat/lib/speaker-color.ts:52` | Asserts a generated color. |
| `packages/ui/src/charts/meter/ring-gauge.tsx:70`, `track-bar.tsx:71` | Custom meter color. |

Scan counts: `ast-grep -p 'isSafeColor($$$)'` over the repository root for `-l ts` and `-l tsx` found 10 matches (8 in `ts`, 2 in `tsx`), counting the kit itself and its test. `isRenderableColor($$$)` found 9 (5 in `ts`, 4 in `tsx`). `themeOverrideSchema` over `packages` found 12 files in `ts` and none in `tsx`. A literal `rg` agreed on the file set.

## What the user sees when the boundaries differ

The risk is a value that the render clamp keeps and the wire schema drops. Wire-accepted values are always render-accepted, so the reverse split cannot occur.

| Path | What happens | Evidence |
| - | - | - |
| A junk value goes through the wire (create, update, import, card, any read) | The field drops to `undefined`. The token inherits the theme default. A valid sibling is kept. | `tests/contracts/theme/color-renderability.contract.test.ts` and the probe. Proven. |
| A junk value goes straight to `ThemeScope` | `borderColor`, `speaker`, `bodyColor` and bubble `bg` emit the raw word into a custom property. `background` emits the whole derived surface ramp as `oklch(from notacolorxx ...)`. `accent` emits nothing. | Probe of `clampThemeTokens` with `notacolorxx`. Proven. |
| That emitted custom property is used | A `var()` that resolves to an unparsable value is invalid at computed-value time, so the property takes its initial or inherited value, not the app default. Surfaces fed by the junk ramp would lose their background. | Inferred from the CSS custom-property rules. Not run in a browser. |

The kit comment at `packages/kit/src/safe-color/index.ts:19` to `:23` says an unknown word is "ignored" by the browser. That is accurate for a direct declaration. It is not accurate for a custom property read through `var()`. The effect is cosmetic and not a vector.

The second row needs a caller that hands `ThemeScope` an override that no wire schema parsed. I found none in production paths:

- The theme editor preview passes `themeOverrideFromForm(values)` (`packages/client/src/features/config/components/theme-editor.tsx:214`). Its color fields come from `ColorField`, which refuses unrenderable drafts. Proven by reading both.
- Stored and card overrides reach the client through the read schemas above. Inferred from the call graph.
- The other `ThemeScope` call sites were not each traced.

A value already stored before the wire schema asked the second question is dropped on the next read. The user sees that token return to its default. The dev database holds no such value.

## Verdict

Two concepts, one module. "Safe to emit" is one concept and has one home in kit. "Resolvable to a pixel" is a second concept, asked only where a user types or storage commits. The two zod schemas are the cake-forced pair that law section 12.5 already rules deliberate. The predicates under them are already layered: `isRenderableColor` calls `isSafeColor`.

Recommendation: keep two validators, layered as they are, and name the reason in each header. Change no logic.

Why not merge the render clamp to `isRenderableColor`:

- The render clamp runs on every `ThemeScope` render. `isRenderableColor` runs ColorJS on every field, and the clamp already parses colors in `toOklch`. Inferred: this doubles parsing on the hot path. No measurement was taken, and no user-felt cost was reported.
- The kit header (`index.ts:125` to `:127`) says the render clamp deliberately fails open when a parser cannot read a value a browser can. The probe found no such value among its browser-valid inputs, so the benefit of that fail-open is unproven. The cost of a merge is unmeasured too. Neither side justifies a code change today.
- The gain is small: junk reaching the render clamp is reachable only through a caller that skips the wire schema, and I found none.

Why not make the wire schema use `isSafeColor`: it would store values that paint nothing, which is the case the second question exists to prevent.

For a roleplay app with one owner-visible theme editor, the sized answer is the current layering: the injection gate is shared and cannot drift, and the extra parse sits only where a human types or a file imports.

## Follow-ups

Header text only, no behavior change:

| File | Change |
| - | - |
| `packages/ui/src/content/theme-scope/clamp.ts:69` | Add: this schema asks only `isSafeColor`. The wire twin also asks `isRenderableColor`. A wire-accepted value is always accepted here. |
| `packages/contracts/src/theme/override.ts:5` | The existing two-copy line should name the predicate difference and link this file. |
| `docs/law/UI-Theming-and-Content.md` section 12.5 "One-home note" | Add one sentence naming the predicate difference. |
| `packages/kit/src/safe-color/index.ts:19` | Say an unknown word in a custom property is invalid at computed-value time, not ignored. |

One test would pin the claim this report rests on: for a corpus of colors, every value `themeOverrideSchema` keeps, `clampThemeTokens` also keeps. The pairing test pins types only.

## Method

Scratch tests ran `isSafeColor`, `isRenderableColor`, `isDeterministicColor`, `themeOverrideSchema.parse` and `clampThemeTokens` on the inputs above, with the Vitest runner and the kit's own imports. They were deleted after the run and are not part of the commit.
