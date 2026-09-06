---
kind: handoff
status: active
updated: 2026-09-06
---

# Registry/completeness family conversion for #1584

## Outcome

All nine assigned legacy gates are final `defineGate` policies. Two of them carried a second arm whose
authority differs from the rest of their module, so — following the design's own `tooling-front-door`
ruling that a descriptor carries exactly one authority — each split into an ordinary policy plus a
sibling `reviewed-grant` policy. The corpus therefore gains two module ids and loses none.

Final AST/compiler source populations in this family are `.ts`/`.tsx` only. `.mts`/`.cts`/`.mjs`/`.cjs`
are excluded as eventual cleanup and are not part of any population-equality claim below.

## The shared-fact defect this conversion had to repair first

`registryDefinitionFact` reported **zero members for section, modal, home-tile and config-group** on the
real typed workspace — four of the seven kinds, including every kind the first conversion batch needed.
`lib/registry-fact.ts`'s `authoredObject()` inherited `readStaticAuthoredValue`'s FIELD-level refusal as
the definition's own provenance refusal, and every live registry definition carries an imported lucide
icon, so the whole-value read refused with `missing` ("const binding `Users` has no initializer") and the
definition vanished. Only an inline arrow (`unsupported`) survived, which is why collection,
config-section and chrome looked healthy while the four blocked kinds did not.

Root provenance is now its own reader — `resolveAuthoredComposite()` in `lib/static-authored-value.ts`,
which refuses only when the composite's OWN binding is mutated or invoked (the check `readValue` already
ran) — and `registry-fact.ts` drops the poisoning branch. Red-first receipt: the new control fails against
the unmodified readers with `policy receipt refused: population "ModalDefinition" left 1 unresolved`.

| kind | members before | members after |
| - | -: | -: |
| section | 0 | 10 |
| modal | 0 | 11 |
| home-tile | 0 | 7 |
| config-group | 0 | 13 |
| collection | 4 | 4 |
| config-section | 37 | 47 |
| chrome | 7 | 7 |

Unresolved is zero on every kind after the repair.

## Conversion manifest

| Legacy id | Final disposition | Authority/severity | Declared denominators (real tree) |
| - | - | - | - |
| `modal-registry-completeness` | converted | ordinary/error | `ModalDefinition` 11 |
| `modal-body-not-placeholder` | converted | ordinary/error | `ModalDefinition` 11 |
| `placeholder-copy-registry` | converted | ordinary/error | `SectionDefinition` 10 |
| `chrome-registry-completeness` | converted | ordinary/error | `ChromeEntry` 7 · `CHROME_ZONES` 4 |
| `section-factory-contribution-bundle` | converted | ordinary/error | `SectionDefinition factory` 4 · `ContributorRegistry` 1 |
| `message-kind-policy-coverage` | converted | ordinary/error | `MessageKindPolicy axis` 3 |
| `warning-code-coverage` | converted | ordinary/error | `WARNING_CODES` 12 · `CHAT_WARNING_CODES` 14 |
| `section-registry-completeness` | converted; route-import arm split out | ordinary/error | `SectionDefinition` 10 |
| `route-imports-no-feature` | NEW sibling of the row above | reviewed-grant/error | `route module` 7 |
| `config-group-completeness` | converted; anchor arm split out | ordinary/error | `ConfigGroupDefinition` 13 · `CollectionContribution` 4 · `config content host` 1 |
| `config-anchor-in-registry` | NEW sibling of the row above | reviewed-grant/error | `ConfigSectionContribution` 47 · `config anchor stamper` 46 |

`home-tile-registry-completeness`, `no-parallel-section-map`, `registry-assembly-at-door-only` and
`duplicate-action-doors` were outside this lane and are untouched. `verify/lib/registry.ts` is the
verification-stage registry and remains unrelated.

## Why two policies split

A `defineGate` descriptor carries exactly one authority, and an arm whose exceptions are recurring
repository PERMISSIONS cannot share a module with arms whose exceptions are per-occurrence waivers.

- **`route-imports-no-feature`** — "only the sanctioned composition route may import a feature front door"
  was a hard-coded `app-root.tsx` exemption plus a blanket `#features/auth` carve-out. Both are now
  findings with exact `(subject, operation)` identity, licensed by five grant rows.
- **`config-anchor-in-registry`** — the §6.8.3 arm exempted `state/` and `features/config/` by regex. That
  regex is deleted; the config feature's two anchor READERS are two grant rows.

The permissions are visible, dated and self-cleaning: after a complete owner run a row consumed zero times
is STALE and a row matching more than one finding is OVER-BROAD and licenses nothing.

## Conversion receipts

One real-tree pass over the whole converted family (`getWorkspace({types:true})`, `runPolicyPass` with
`reviewedGrantsFor(policies)`), beside a legacy replay of the same nine descriptors through `lib/pass.ts`:

- legacy replay: 7,133 files, nine gates, **0 findings each**, zero tool errors;
- final pass: 11 policies, **0 effective findings**, zero fact/tool/authority errors, nothing withheld,
  **zero authority alarms** — the seven grant rows are each consumed exactly once;
- population deltas: every policy's semantic subject is a classified raw-scan reduction of the legacy
  7,133-file physical corpus to the package(s) it actually reads (`@client` 1,302 files; message-kind
  `@contracts+@server+@client` 2,887; warning-code `@server+@contracts` 1,585). No semantic member is lost:
  every declared denominator equals or exceeds its legacy count.

Denominator changes worth naming, all verified to produce no new finding on the real tree:

- `placeholder-copy-registry` compares **10** section pairs, not 8: the shared value reader follows the
  aliased `title`/`placeholder` constants the legacy literal-only reader counted as unreadable skips.
- `config-anchor-in-registry` judges **46** stampers where the legacy regex judged 44 and exempted the
  rest by path.
- `chrome-registry-completeness`, `warning-code-coverage` and `message-kind-policy-coverage` reproduce
  their legacy declared counts exactly (4 zones; 12 and 14 codes; 3 axes).

## Verification

| Check | Result |
| - | - |
| family conformance (`tests/tooling/verify/gates/registry-family.test.ts`) | green — every policy's founding, nearest-legal and counterfactual rows, plus three runtime-refusal pins conformance cannot express |
| shared fact + tuple provider tests | green (registry-fact 6, tuple-vocabulary 7) |
| ported policy pins (`message-kind-policy-coverage.test.ts`) | green (3) |
| central grant table (`tests/tooling/verify/lib/reviewed-grants.test.ts`) | green — all seven rows validate against the roster discovered from every `defineGate` module |
| tooling type program (`ts7.cjs -p tooling/tsconfig.json`) | green, zero errors |
| scoped biome + eslint on every touched file | green |
| real-tree family pass + legacy replay | see receipts above |

The root graph program stays red at the known legacy/final harness sites until cutover and is the
integration owner's check, as is `pnpm gate:contract`.

## What this lane changed outside its nine modules

- `lib/static-authored-value.ts` — one added export, `resolveAuthoredComposite`; `readStaticAuthoredValue`
  is unchanged, so the bus/schema/static-class consumers are unaffected.
- `lib/registry-fact.ts` — the provenance repair above.
- `lib/tuple-vocabulary-fact.ts` — `createTupleVocabularyFacts()` is promoted to the first-class
  `tupleVocabularyFact` provider over `@client + @server + @contracts`, the exact packages whose exported
  tuples its consumers read. It indexes 2,125 exported names on the real tree and refuses outright when the
  index is empty.
- `lib/registry-definition-home.ts`, `lib/registry-definition-field.ts`, `lib/registry-definition-anchor.ts`
  — three small shared readers so the family's co-location law, its named-field reads and its finding
  anchoring cannot drift apart between policies.
- `lib/reviewed-grants.ts` — seven rows, sorted by policy then id.

## Known limits, written down

- A registry definition's COMPLETE authored value still refuses whenever a field carries an imported icon,
  component or hook. Policies read the fields they need explicitly; nothing consumes `authoredValue` whole.
- `modal-body-not-placeholder` judges the body's OWN render. A placeholder rendered deeper inside a real
  component the body mounts is that component's business (a `mustPass` row records this).
- `section-factory-contribution-bundle` cannot judge an unannotated return type or a parameter type that
  resolves to no declaration; both are `mustPass` rows.
- `warning-code-coverage` keys the infra-to-chat mapper by name in ONE place. A rename empties that reader
  and REDs every code it owns — a loud false accusation, never a false clean.
- `tooling/src/verify/lib/section-defs.ts` now has ZERO code consumers (`pnpm ast importers`: 0 matches
  over 7,138 scanned files; a literal scan finds only one comment in `tests/tooling/check-gates.int.test.ts`).
  It is NOT deleted here: `GATE-AUTHORING.md` and `Core-Enforcement-Active-Gates.md` both cite it in prose,
  and the second is owned by the integration lane, so deleting the file alone would leave a dangling
  reference. The deletion is a two-line fold: remove the file, reword those two citations.

## Resume order

1. Fold the two new module ids into `Core-Enforcement-Active-Gates.md` and the test-baseline manifest
   (`tests/tooling/verify/gates/registry-family.test.ts` added; `section-factory-contribution-bundle.test.ts`
   and `tests/tooling/warning-code-coverage.residual.test.ts` retired).
2. Delete `lib/section-defs.ts` together with its two prose citations.
3. Re-run `pnpm gate:contract` on the merged tip; this family's nine modules should leave the legacy-field
   and private-walk counts entirely.
4. `lib/ast-read.ts` and `lib/tuple-read.ts` still have 38 legacy gate consumers and stay until those
   convert; no consumer in this family remains.
