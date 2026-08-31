---
kind: review
status: active
updated: 2026-08-31
---

# #936 token-contract cold review — `0ba9b094d`, `22a7ae04a`, and `01905d6b2`

## Confirmed findings against immutable `0ba9b094d`

### P1 — the gate's canonical `mustPass` proof is permanently red on the substrate that runs it — fixed by `01905d6b2`

`tooling/src/verify/gates/tokens-contract.ts:52` passes the conformance fixture's synthetic `ctx.root`
as the Git `repoRoot`, while `tooling/src/verify/gates/tokens-contract.ts:72` declares the complete
canonical corpus as a `mustPass`. The removed-token leg at
`0ba9b094d:packages/ui/token-contract.ts:547` refuses any root without `.git`. The standing conformance
runner deliberately materializes fs-backed examples under `/tmp/orb-conformance-*`, not inside a Git
worktree (`tests/tooling/gate-conformance.int.test.ts:53`). Therefore the known-good proof produces a
finding before it can prove the corpus good.

Failure scenario: the full behavioral tooling suite loads this descriptor, runs the canonical
`mustPass`, and fails even though the live vault is valid. The change therefore cannot satisfy the
program's two-direction instrument criterion (`token-contract-program.md:156-161`, done criterion 3 at
`:242`) or the gate-authoring closeout battery.

Evidence reproduced at both reviewed SHAs with the real descriptor and dispatcher:

```text
pnpm exec tsx -e '... verifyGateProofs([gate]) ...'
[
  {
    "gate": "tokens-contract",
    "arm": "mustPass",
    "detail": "expected NO finding but got 1: [removed.baseline] /removed: cannot inspect token history: /tmp/orb-conformance-RmrOSe is not a Git worktree ..."
  }
]
```

This is not a claim inferred from an unrun broad suite: it is the exact failing proof invocation. A
real-tree `validateTokenContract("./packages/ui", process.cwd())` remained clean at 272 scanned / 178
targets, so the failure is specifically the gate proof's substrate seam.

### P1 — `0ba9b094d` closed `orb.cssValues` without an output-placement decision and forced every value into `@theme` — fixed by `22a7ae04a`

At the reviewed commit, `0ba9b094d:packages/ui/token-contract.ts:72` defined a closed CSS-value entry
with only `value`, `description`, and `provenance`; its strict schema at `:112` had no placement arm.
The emitter appended every extension entry to the same flat list
(`0ba9b094d:packages/ui/tokens.build.ts:404`) and rendered that entire list into `@theme`
(`0ba9b094d:packages/ui/tokens.build.ts:222`, `:422`). There was no valid contract spelling for a
generated private runtime alias that must exist as ordinary root CSS rather than as a Tailwind theme
namespace.

Failure scenario: the density program needs portable spacing decisions to remain DTCG while private
`--orb-density-*` aliases are emitted at `:root` and rebound in `tiers.css`. Under `0ba9b094d`, the only
contract-valid choice put those aliases into `@theme`, leaving their retention dependent on Tailwind's
candidate/reference analysis. A Tailwind 4.3.3 compiler probe confirmed the boundary: an otherwise
unused private property in plain `@theme` disappeared from `build([])`, while the same property in
`:root` survived and a referenced Tailwind namespace generated its utility. This made the closed
contract unable to express the immediate #938 design safely; it was not a hypothetical future feature.

Evidence:

```text
Tailwind 4.3.3 compile/build probe, plain @theme with no candidates:
/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */

Tailwind 4.3.3 compile/build probe after explicit root placement:
:root, :host { --spacing-control: 2rem; }
:root { --orb-density-control: var(--spacing-control); }
.h-control { height: var(--spacing-control); }
```

Disposition: `22a7ae04a` fixes this finding. Its independent follow-up evidence is below; the original
defect remains recorded because this review's first subject is immutable `0ba9b094d`.

### P2 — the removal ratchet and its “exact 178-target surface” test do not preserve `orb.cssValues` output identities — fixed by `01905d6b2`

`0ba9b094d:packages/ui/token-contract.ts:519-525` extracts only nodes collected as DTCG tokens from the
historical document, and `:582-592` compares only that token-path set. `orb.cssValues` targets are
separately added to the generated target set, so their names never enter the removal comparison. The
test that says it preserves the **exact** pre-migration target surface derives `BASELINE_TARGETS` from
the generated file under test (`tests/tooling/token-contract.test.ts:13-17`) and then compares the live
source to that moving set (`:133-138`). Its independent pin is only the number 178.

Failure scenario: delete `--aspect-portrait`, add an unrelated replacement target, and regenerate.
The validator retains a 178 denominator, the generated `index.ts` becomes the test's new baseline, and
the removal ledger sees no deletion because neither extension target is a portable-token path. The
actual `aspect-portrait` utility is live in Avatar variants
(`packages/ui/src/primitives/avatar/variants.ts:30-49`) and the media-tile grid, so that silent
same-count substitution removes a rendered contract while the token-contract instrument reports clean.

Evidence, reproduced against exact `22a7ae04a` after first reproducing it against `0ba9b094d`:

```json
{
  "scanned": 272,
  "targets": 178,
  "hasOld": false,
  "hasNew": true,
  "diagnostics": []
}
```

The adversarial mutation replaced `--aspect-portrait` with `--aspect-portrait-renamed` and validated
against the reviewed commit as the Git baseline. This is a same-count identity loss, so the existing
178 assertion does not refute it. The program requires unrecorded deletion to be refused
(`token-contract-program.md:163-168`, done criterion 5 at `:244`) and describes the output as a closed
target map (`:75-82`, `:147-149`); the current ratchet proves only the portable-token half.

### P2 — the static contract accepts a same-count Light/Mocha member substitution even though the generator later rejects it — fixed by `01905d6b2`

`0ba9b094d:packages/ui/token-contract.ts:418-426` validates only that every present value-set member is
a color and names some base token. It does not require the exact seed-covered member set. Exact
Light/Mocha coverage exists later in the emitter (`packages/ui/tokens.build.ts:320-337`), but the
`tokens-contract` gate calls only the validator. The new 272 assertion catches a raw deletion, but it
does not make the denominator semantic.

Failure scenario: replace Light's required `color.background` with the equally valid base color
`color.sky-day`. The token count remains 178 + 54 + 40 = 272, Resolver metadata still pairs
Hearth/Light/Mocha correctly, and the static gate reports clean even though generation must refuse the
value set. The gate therefore does not enforce the exact composition it claims to guard; a developer
gets a false-green static contract and only discovers the defect in the later generation/freshness
test tier.

Evidence, exact adversarial probe at `22a7ae04a` (the same validator body as `0ba9b094d`):

```json
{
  "scanned": 272,
  "light": 54,
  "hasBackground": false,
  "hasSkyDay": true,
  "diagnostics": []
}
```

This does not allege that the generator is wrong: its exact-set check is correct. The defect is that
the static contract/gate and its advertised 272 denominator do not carry that check, contrary to the
program's bounded value-set contract (`token-contract-program.md:204-210`, done criterion 8 at
`:250-251`).

## Verification log — immutable `0ba9b094d`

### Authority and full-file coverage

- Read `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, the full D-ledger and the
  relevant D42/D44/D54/D71/D123/D144 clauses before judging the change.
- Read `docs/architecture/proposed/token-contract-program.md` (266 lines) and
  `docs/reviews/research/2026-08-31-css-token-toolchain-research.md` (423 lines) in full, in the required
  order.
- Read all 21 files committed by `0ba9b094d` in full. The two vendored schemas, lockfile, and test
  manifest were additionally parsed end-to-end as machine documents rather than sampled as prose.
  No touched-file region was omitted.
- Read the complete theming/custom-CSS seam: the theme contract, server seed registry, generated seed
  pairing, selected-theme derivation, `resolveThemeScopeTokens`, `ThemeScope` clamp, custom-theme CSS
  validation/injection, and their focused tests/CTs.

### Contract, schema, package, and graph checks

- Real corpus: base 178 + Light 54 + Mocha 40 = **272** scanned tokens; **178** unique CSS targets;
  zero diagnostics. Resolver result was exactly Hearth/dark/base, Light/light/light, and
  Mocha/dark/mocha.
- Vendored schema raw hashes exactly matched the constants:
  `02d3362a3127834fd2fdd4e4d86748eaa4623054fabf369db8a410526b12646f` (Format) and
  `2286caca56d683066475b93bca78fd73a9a337f20981bf98ea8ee8d60f8fd40b` (Resolver).
  Fresh downloads from the two pinned 2025.10 official URLs were semantically identical after
  canonical `jq -S -c` serialization: official/local hashes matched at
  `0836d41cc0070a344b92e6b79f8a66b618b3411f8f5a081cc4489521e06571d5` and
  `a9df08a66874ebddfe6f716d913f69913247d185ac1b8abd3b5b4b63f51793e6`.
- `packages/ui` owns Ajv 8.20.0, `ajv-formats` 3.0.1, Style Dictionary 5.5.0, Zod 4.4.3,
  Tailwind 4.3.3, `tailwind-merge` 3.6.0, and `tailwind-variants` 3.2.2 at the intended direct scopes.
  The lock parsed at lockfile version 9 and resolved the direct Ajv/formats relationship coherently.
- Style Dictionary usage is the modern `getPlatformTokens("flat").allTokens` path with explicit
  type-directed serialization; no deprecated `exportPlatform`, type-blind `String(value)`, or
  `[object Object]` output remained.
- `ast-grep` call-site sweeps covered TS and TSX separately: `validateTokenContract` had two live TS
  calls (gate and wrapper), `assertTokenContract` had the emitter call, and `ThemeScope` had 42 TSX
  occurrences across 18 files. The searches reported nonzero scanned-file counts; literal `rg` sweeps
  were used as the second method for absence claims.
- Exact-SHA `git grep` found zero `tech.inktomi`, `orb.cssRecipes`, or `cssRecipes` literals at both
  `0ba9b094d` and `22a7ae04a`.

### Output and theme/custom-CSS behavior

- Pre/post generated target sets were both exactly 178 with no missing or added target identity. The
  migration's seven lexical value diffs were numeric zero normalization only (`0.50` to `0.5`, `0.10`
  to `0.1`) plus zero-dimension `0em` to `0rem`; 11 extension-backed outputs moved in source order.
  `themes.gen.ts` was byte-identical. The migration therefore changed generated bytes as expected but
  preserved CSS semantics.
- Focused unit run: 4 files / 65 tests passed with no type errors
  (`token-contract`, near-duplicate, seed-theme pairing, and app-shell theme resolution).
- Second focused unit run: 4 files / 41 tests passed with no type errors
  (token index/freshness, theme emit pairing, ThemeScope classification, and theme contracts).
- Focused component run: custom-theme-style plus ThemeScope, 29 passed / 0 failed / 0 flaky / 0
  skipped.
- The seed pairing suite proves the server registry is exactly Hearth/Mocha/Light and pairs every
  shipped override to base/generated values. Arbitrary custom IDs do not enter the bounded Resolver:
  only `isSeed === true` produces `[data-theme]` (`use-selected-theme.ts:30-33`), while the test's
  arbitrary `theme_x` flows its override through `ThemeScope` (`resolve-theme-scope-tokens.test.ts:18-46`).
  Custom theme CSS remains own-client, validation-gated, and appended at the intentional end-of-head
  boundary (`custom-theme-style.tsx:21-37`). No trust boundary was widened by the migration.

### Deliberately not run

- Did not run broad `pnpm check`; the assignment explicitly requested focused adversarial review and
  said not to repeat the broad battery. The gate's failing `mustPass` was invoked directly through the
  real dispatcher, so finding 1 does not depend on an omitted broad run.

## Independent follow-up review — `22a7ae04a` placement repair

### Verdict

The placement repair is correct and introduces **no new confirmed finding**. It closes the original
placement finding above. It does not close the other three findings, all of which were independently
reproduced again at `22a7ae04a`.

### Full-file and adversarial evidence kept separate from the original verdict

- Read all five files changed by the exact commit (`22a7ae04a^..22a7ae04a`) in full:
  `tokens.json` (1,602 lines), `token-contract.ts` (710), `tokens.build.ts` (447),
  `token-contract.test.ts` (296), and `index.test.ts` (252). No region was omitted.
- `CssValuePlacement` is the closed union `theme | root`; `placement` is required in both the exported
  contract and strict Zod entry schema (`packages/ui/token-contract.ts:56`, `:73-78`, `:114-122`).
  Missing placement produced `orb.cssValues`; invalid `utility` produced `orb.cssValues`; valid `root`
  produced zero diagnostics.
- All 11 live runtime entries explicitly say `placement: "theme"`; none defaults and none currently
  says root. The commit therefore adds capability without silently implementing density.
- The emitter preserves portable tokens in `theme`, carries each extension entry's validated placement,
  partitions both arms, and emits root values as ordinary unlayered `:root` CSS
  (`packages/ui/tokens.build.ts:223-237`, `:403-435`). A synthetic both-arm probe emitted the theme
  token only inside `@theme` and the private alias only inside `:root`. Tailwind 4.3.3 compiled that
  output to the expected theme variable, root alias, and `h-control` utility.
- Exact commit grep found `--orb-density-control` only in the synthetic placement test; no density
  source, `tiers.css`, `data-density`, or live alias was added. The commit touched only the five files
  listed above.
- All three generated artifacts were byte-identical from `0ba9b094d` to `22a7ae04a`:
  `theme.css` `cc376264...f0f4ae`, `index.ts` `9bdaca55...d3abc`, and `themes.gen.ts`
  `10b6eaf7...436eb`.
- Real placement-aware contract result remained zero diagnostics, 272 scanned, 178 targets, and the
  exact Hearth/Light/Mocha pairing. Focused placement/freshness tests passed 2 files / 41 tests with no
  type errors.
- Reproduction of the three remaining findings at `22a7ae04a`:
  the gate `mustPass` still returned one `removed.baseline` failure; the same-count
  `--aspect-portrait` target substitution remained 178/clean; the same-count Light
  `background -> sky-day` member substitution remained 272/clean.

## Final repair follow-up — `01905d6b2`

### Verdict

The five-file final repair closes all three findings that remained after `22a7ae04a` and introduces
**no new confirmed finding**. Together, `22a7ae04a` and `01905d6b2` close all four findings from the
immutable `0ba9b094d` review.

### Full-file and adversarial evidence kept separate from both earlier verdicts

- Read all five files changed by exact commit `01905d6b2` in full: `removed.json` (60 lines),
  `token-contract.ts` (827), `tokens.build.ts` (435), `token-contract.test.ts` (350), and the
  `tokens-contract` gate descriptor (82). No region was omitted; `git diff --check` was clean.
- **Fs-backed proof seam:** the gate now passes Git history only when the dispatcher root is the exact
  real repository root (`tooling/src/verify/gates/tokens-contract.ts:9-10`, `:53-57`). Direct
  `verifyGateProofs([gate])` returned `[]`, proving the `/tmp/orb-conformance-*` canonical `mustPass`
  no longer tries to inspect Git. The real-worktree path remains active: deleting `motion.ambient`
  against exact `01905d6b2` produced `removed.unrecorded` (and the corresponding output-target
  finding), while the unmodified real corpus remained clean. Finding 1 is closed without weakening
  the history ratchet.
- **Full output identity:** `tokenTargetsFromLegacy` now reconstructs the complete historical CSS
  surface from both emitted portable tokens and `orb.cssValues`
  (`packages/ui/token-contract.ts:609-625`). `removedTargets` has a strict, duplicate/stale-checked
  ledger (`:628-659`), and the merge-base diff rejects any historical target absent from both the
  current set and that ledger (`:698-713`). The exact adversarial control replaced live
  `--aspect-portrait` with `--aspect-portrait-renamed`: the static, history-free validator remained
  clean as intended, but the real-worktree ratchet returned `removed.target.unrecorded` while the
  denominator stayed 178. The permanent test also reads both live consumers, Avatar and
  media-tile-grid (`tests/tooling/token-contract.test.ts:273-292`). Finding 3 is closed.
- **Exact seed members before generation:** `REQUIRED_SEED_VALUE_SET_PATHS` is one frozen 40-member
  contract (`packages/ui/token-contract.ts:21-63`); validation compares both missing and extra members
  (`:481-503`). Mocha must equal those 40; Light must equal those 40 plus every base
  `light-dark` output arm (`:771-778`), which is the current 54. Independent same-count
  `color.background -> color.sky-day` substitutions returned `seed.members` for **both** Light and
  Mocha while retaining the full 272 denominator. The failure occurs in `validateTokenContractTexts`,
  before Style Dictionary or generation. Finding 4 is closed.
- **ThemeScope coupling:** the required seed set contains 40 unique paths. The live ThemeScope emitter
  contributes exactly 39 color paths; set comparison found no missing member and exactly one declared
  extra, `color.backdrop`, whose non-ThemeScope responsibility is documented. The generator imports
  both authorities and throws at module load on either missing or stale membership
  (`packages/ui/tokens.build.ts:23-25`, `:41-51`), preserving the previous derive-and-check coupling
  rather than replacing it with an unchecked duplicate list.
- **Corpus and artifacts:** the live result is base 178 + Light 54 + Mocha 40 = 272 scanned, 178 unique
  targets, zero diagnostics, and the exact Hearth/dark, Light/light, Mocha/dark Resolver pairing. All
  three artifacts are byte-identical from `22a7ae04a` through `01905d6b2`: `theme.css`
  `cc376264...f0f4ae`, `index.ts` `9bdaca55...d3abc`, and `themes.gen.ts`
  `10b6eaf7...436eb`.
- **Focused behavior:** `pnpm exec vitest run tests/tooling/token-contract.test.ts
  tests/ui/tokens/index.test.ts` passed 2 files / 44 tests with no type errors. This includes the real
  generator freshness/ThemeScope coupling import, the fs-backed proof, target-ratchet control, and
  Light member control; the independent probe supplied the parallel Mocha arm.
- **Scope:** exact-commit grep found no density, `tiers.css`, `data-density`, or `--orb-density-*`
  change. The commit touched only the five reviewed files. Exact-SHA terminology grep remained clean
  for `tech.inktomi`, `orb.cssRecipes`, and `cssRecipes`.
- Did not run broad `pnpm check`, per the assignment. The three repaired claims were exercised
  directly with their real functions and focused behavioral tests.

## Unconfirmed, low priority

None.

## Combined closure verdict

`22a7ae04a` safely repairs the output-placement hole, and `01905d6b2` closes the three remaining
contract/gate defects without changing generated output or density. The immutable base review found
four confirmed defects (severity ceiling P1); the two repair commits fix all four and add none.
**#936 is ready to close with zero active Stickler findings.**

## Issue summary

Cold review of `0ba9b094d` found 4 confirmed findings (severity ceiling P1): the gate's canonical fs-backed `mustPass` could not run its Git ratchet, `orb.cssValues` had no output-placement arm, the removal/exact-surface controls did not preserve extension-output identities, and the static validator accepted same-count seed member substitutions. Follow-up `22a7ae04a` fixed placement; final repair `01905d6b2` independently closes the remaining three with no new finding, no generated-artifact change, and no density implementation. #936 is ready to close with zero active Stickler findings. Full report: `docs/reviews/stickler/2026-08-31-token-contract-936-cold-review.md`.
