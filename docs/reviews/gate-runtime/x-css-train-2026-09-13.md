---
kind: review
status: active
updated: 2026-09-13
---

# `cb-x-css-train` — the CSS gate train, wave 1 (#2183, #2231, #2182, #2265, #1584)

Lane `cb-x-css-train`, isolated worktree, based on `eba8ef526`. **Four modules converted, one shared-reader
capability built, one shared-artifact capability built, one live `hard` red on `main` found and fixed, nine
exemption rows migrated to reviewed grants.** `css-selector-has-a-writer` and #2181's three modules are NOT
done and are scoped at the end.

## What landed

| Commit | Subject |
| - | - |
| `0e7c182b2` | `lib/css-rules.ts` statement at-rules + `sanctioned-css-homes` + `playwright-css-topology` (#2183, #2231, #2265) |
| `c9c9c9ee4` | `tokens-contract` + the token-removal baseline as DATA (#2182) |
| `5ed90e0e1` | `seed-theme-ink-contrast` + nine reviewed grants (#2182) |

## Per module

### `lib/css-rules.ts#CssStatementAtRule` — the BUILD that unblocked module 5

`parseCssStylesheet` pushed at-rules only from `closeFrame`, which fires on `}`, so a BLOCKLESS at-rule
(`@import`, `@source`, `@charset`, a `;`-terminated `@layer`) produced no fact and `CssFacts` structurally
could not answer "what does this sheet import". Surfaced as `ParsedCssStylesheet.statements` →
`AuthoredCssFile.statements` → `CssFacts.statements` + `population.statements`, with
`quotedStatementArgument` so no consumer re-spells the quoted-argument grammar.

**Controls, both directions, one invocation** (`tests/tooling/verify/lib/css-rules.test.ts`): an `@import`
inside a comment does NOT appear (comments are blanked before the scan); the `@media` BLOCK at-rule still
appears in `atRules`; a declaration is never a statement; an unnameable at-keyword (`@ import`) is refused
rather than published under an empty name.

### `sanctioned-css-homes` → final `hard` resource policy

- **Population port: an INTENTIONAL WIDENING.** Legacy `readdirSync` from `<root>/packages` skipping
  `{dist, node_modules}`; final `authored-tree:packages`, whose reader excludes
  `{node_modules, .git, dist, .cache}` — a strict superset. Measured: no `.css` lives under `.git` or
  `.cache` today, so the admitted set is byte-identical and the widening is a statement about the future.
- **The anchor guard RETIRED.** `existsSync(package.json)` existed because a fixture could not be told from
  a gutted checkout. An absent/empty `packages` tree is now a population REFUSAL; a tree holding one
  unrelated file is six missing homes (`mustFlag[4]`, `count: 6`). The legacy `mustPass` asserting the
  opposite is retired WITH the guard, as an assertion rather than an absence.
- **The missing-home anchor MOVED** off the gate's own source file (in no resource population — it would
  THROW) onto `lib/absent-subject-anchor.ts#subjectAnchor`.
- Authority `hard`. The legacy bare `@orb-gate-ignore` door existed and does NOT survive; marker census 0.
- Real tree: `pnpm check:structure --check sanctioned-css-homes` **exit 0**, 4197 resources, 0 effective.

### `playwright-css-topology` → final `hard` DECLARED HYBRID, and #2231 closed by construction

- Six `exact-file` ids + `product-css`; `population: { in: ["@client", "@tests"] }`.
- **Population port: an INTENTIONAL NARROWING that deletes a STRUCTURALLY DEAD clause.**
  `directCtCssImports` filtered `ctx.files` for `playwright/` OR `tests/`. The gate harness corpus is
  `_shared/ts-workspace.ts#harnessGlobs` — `packages/*/src/**`, `tests/**`, `tooling/src/**`, `scripts/**`
  and nothing else. `playwright/**/*.tsx` appears ONLY in `searchGlobs`, which the gate run does not use, so
  `ctx.files` never contained a `playwright/**` module: the clause matched zero files BY CONSTRUCTION, and
  no legacy row exercised it. (The tree also holds exactly four `playwright/` files, one of them the CT boot
  the clause explicitly excluded.)
- **#2231.** The graph now walks `cssInventory("product").statements`; a specifier resolving to no
  sanctioned stylesheet is NAMED in the finding. `mustFlag[5]` is the pin, and the §4.1 cut p05 kills it.
- **The CT boot is a TEXT arm — a DECLARED WEAKENING.** `playwright/index.tsx` is outside the harness corpus
  and `ctx.sourceFile` refuses a path outside the population, so the boot is judged as comment-blanked TEXT
  over `exact-file:ct-boot`, the shape `contract/resource-exact.ts`'s header sanctions for these ids by
  name. Weaker in exactly one way: a `.css` specifier inside a STRING LITERAL there would read as an import.
- **Five fused clauses SPLIT into distinct messages** (CT config: PRESENCE / ORDER / TARGET; harness
  extension: SOURCE-SET / RESIDUE). The audit measured the whole four-clause CT-config fence UNENFORCED
  (p04) and a fused message is exactly why: two rows pinning two clauses cannot be discriminated by
  `messageIncludes` when both clauses print one sentence.
- Real tree: **exit 0** after the #2265 fix below.

### #2265 — a LIVE `hard` red on `main`, and the out-of-fence fix

The LEGACY descriptor, driven frozen from `eba8ef526` over the real workspace through `lib/pass.ts#runPass`,
reports **1 finding on `main` today**:

```
playwright-ct.config.ts:1:0 — CT config must inject the harness source extension into client globals before Tailwind compiles it
```

Its fourth clause is `!code.includes("packages/client/src/styles/globals.css")`, and the config composes that
path in two halves (`CLIENT_PACKAGE_ROOT` + `"src/styles/globals.css"`, `playwright-ct.config.ts:46,48`);
`grep -c` of the joined literal is **0**, control `orb:ct-css-source-extension` is **1**. The config was
CORRECT and the gate could not read it — hidden under the standing whole-tree red because the fused message
never named which clause fired (#2106's class).

**Fixed at the CONFIG, not the predicate** (orchestrator-ruled, keep the hunk): `playwright-ct.config.ts:48`
spells the path whole. `path.resolve` folds both forms identically; exercised by importing the config
(loads, `testDir=tests`, 2 vite plugins). Widening the gate's predicate to accept a composed spelling was
REFUSED — it would make the gate unable to say what it means.

### `tokens-contract` → final `hard` resource policy, and the removal ratchet SURVIVES

The naive conversion drops half the gate's subject in silence. The legacy `run` computed
`historyRoot = resolve(ctx.root) === REPO_ROOT ? ctx.root : undefined` and handed it to
`validateTokenContract`, which shells `git merge-base` + `git show`. A final policy has no root, no
filesystem, no subprocess — so "a portable token was removed without a ledger row" simply stops being
reported while everything else stays green.

**Built, not declared lost.** `packages/ui/token-contract.ts` gains `TokenRemovalBaseline` +
`readTokenRemovalBaseline`; `validateTokenContractTexts`' second parameter takes EITHER a repo root (the
worktree callers, unchanged) or the already-read document. The PROVIDER does the git read — the shape
`tracked-files` already uses — and publishes `TokenContractResource.removalBaseline`.

**Three statuses, and the third is the design.** `ready` compares. `unavailable` emits a `removed.baseline`
diagnostic (a real worktree whose history read FAILED must never be silent). `empty` — a repository with no
commits, which is exactly what `ops/policy-conformance.ts` builds for every `mode: "resource"` row — is
SILENT, because a history that never existed is vacuous rather than blind. Collapsing the last two puts a
finding on every consumer's clean corpus and makes a clean vault unprovable; that was measured, not guessed.

**The ratchet is pinned for the first time**, and not by a row: a `mode: "resource"` baseline is `empty` by
construction, and the re-cut confirms dropping `contract.removalBaseline` kills zero rows (t02). The
discriminating construction was written and RUN — a `runPolicyPass` against the REAL repo root with the vault
overlaid to drop `spacing.tight`, reporting `removed.unrecorded` — and RED-FIRST verified: planted in the
real module, 1 failed / 5 passed, restored by `mv`, `git status --short` clean. Closes audit ledger row 18.

### `seed-theme-ink-contrast` → final `reviewed-grant` policy, and the audit's one unpriced decision

The §5b audit ruled `hard` off the `@finding-overload-ok` reason. That reason is TRUE and survives — no
marker door, no author absolution. But the module carried `DECORATIVE_STROKE_CARRIERS`, a nine-row
`ExemptionTable`, and §12.5 bans a gate-owned exemption grammar. `exception-authority-census.md:124`
classifies those rows BY NAME as "9 decorative-stroke GRANTS", so they migrated to `lib/reviewed-grants.ts`
keyed `(carrier file, ink:<token>)` and the authority follows the exception mechanism. **The ruling survives;
its INPUT changed.**

Consequences, each measured:

- **Findings AGGREGATE to one per `(carrier, ink)` class.** A grant is strictly 1:1; one decorative carrier
  fails on up to eight grounds × three seeds, so a per-(ground, seed) shape would make all nine rows
  over-broad on arrival.
- **An unreadable ink is its CLASS's verdict.** `text-border` is `oklch(… / 0.08)`, a translucent LINE token
  with no opaque colour; the legacy skipped it BEFORE judging, which also swallowed the tripwire. The first
  conversion attempt reported three sheet-anchored blindness findings and left `meter-border` STALE — the
  arm now reports under the ink's own grant identity, and the row consumes it.
- **Real tree: `raw 9 = granted 9 + effective 0 · 0 alarm(s)`** — every migrated row consumed exactly 1:1.
- **Family: singleton under its own id**, because `lib/policy-module.ts#policyFamilyNames` refuses anything
  else for a policy with no proven sibling (`check:structure` exited 2 saying so). `static-class-ink` is the
  name reserved for the second member.
- The `@finding-overload-ok` marker is DELETED, not translated (§7 kind 3's own disposition); its REASON is
  kept as the header's authority paragraph.

## §4.1 cut matrices (one scratch sibling per cut, serial in the name, anchor asserted exactly once, `rmSync` in `finally`)

| Cut | Direction | Rows died | Class |
| - | - | -: | - |
| s00 / p00 / k00 / t00 identity controls | — | 0 | CONTROL OK |
| s01 `entry.kind === "file"` | flag FEWER | 1 | ENFORCED |
| s02 sanctioned-path membership | the rule | 3 | ENFORCED |
| s03 `.css` extension fence | flag MORE | 2 | ENFORCED |
| s04 missing-home loop | the rule | 2 | ENFORCED |
| p01 CT story/spec `tests/` fence | flag MORE | 14 | ENFORCED |
| p02 tailwind package skip | flag MORE | 14 | ENFORCED |
| p03 CT-config ORDER clause | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| p04 CT-config TARGET clause | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| p05 unresolved-import arm (#2231) | flag FEWER | 1 | ENFORCED (was STRUCTURALLY DEAD) |
| p06 harness-extension RESIDUE | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| p07 harness `@source` VALUE | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| p08 CT-config PRESENCE clause | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| p09 main front-door presence | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| t01 `findingFile` population fence | reach MORE | 2 | ENFORCED |
| t02 the removal baseline hand-in | flag FEWER | 0 | UNREACHABLE BY A ROW — pinned in the family test, red-first verified |
| t03 the diagnostic-code token | — | 2 | ENFORCED |
| k01 zero-palette tripwire | flag FEWER | 1 | ENFORCED |
| k02 zero-ink tripwire | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| k03 unreadable-ink class arm | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| k04 SELF-TINT composition | flag FEWER | 1 | ENFORCED (was UNENFORCED — new row) |
| k05 the ACCENT hover ground | flag FEWER | 1 | ENFORCED |
| k06 per-(file, token) aggregation | flag MORE | 1 | ENFORCED (was UNENFORCED — new row) |
| k07 the AA-NORMAL threshold | the rule | 5 | ENFORCED |

**Nine clean cells found, nine closed with rows written and RUN.** None was recorded as unfalsifiable except
t02, which owes and has a family-test construction with a red-first receipt.

## §4.6 differentials

- `playwright-css-topology`: **legacy 1, final 1**, same file, same subject. The frozen legacy descriptor was
  driven over the real workspace through `lib/pass.ts#runPass`. Delta: the MESSAGE (fused → the TARGET
  clause) and the anchor column (`1:0` → `1:1`). Both `hard`, marker census 0 = 0 = 0, so no waiver orphans.
- `sanctioned-css-homes`, `tokens-contract`: both sides 0 on the real corpus. Per the vacuity rule these are
  population/outcome receipts, not catch parity. What carries them: for `tokens-contract`, the ratchet is
  proven LIVE on the final side (`readTokenRemovalBaseline(REPO_ROOT).status === "ready"`, canonical vault
  through it → 0 diagnostics).
- `seed-theme-ink-contrast`: legacy 0 (its skip-table produced no finding for the nine carriers), final
  0 EFFECTIVE with 9 GRANTED. The mechanism moved; the outcome did not.

## Marker census

Anchored marker-form predicate (`^\s*(//|/\*|\{/\*|/\*\*)\s*<opener>`) over `git ls-files packages tests
tooling scripts playwright`, `.ts|.tsx|.css|.js|.jsx`:

```
scannedFiles: 7730
POSITIVE CONTROL — any @orb-waive marker-form: 1196
@orb-gate-ignore <gate> | @orb-waive <gate>, all EIGHT css gates: 0
```

**0 = 0 = 0.** No conversion owed a translation; each converted header records it.

## Floors

| Command | Result |
| - | - |
| `pnpm test:scoped` on the three new family tests | 15/15, exit 0 |
| `pnpm test:scoped` css-rules · resource-declaration · token-contract · resource-artifact | 32/32, exit 0 |
| `pnpm check:policy-conformance` (whole, after each module) | 254 policies · 3008 rows · 14 refusal rows · **0 failures** · 215 grants, exit 0 |
| `pnpm gate:contract` | **383 → 370**; all four converted modules at zero; total never rose |
| `pnpm exec biome check <files> --diagnostic-level=error` | exit 0 |
| `pnpm exec eslint <files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | 2/2 PASS |
| `pnpm check:structure --check <id>` per module (real tree, gate-scoped, publishes nothing) | all four exit 0 |
| `pnpm check:docs docs/design/951-css-family-semantic-provenance.md` | exit 0 |

**`Core-Enforcement-Active-Gates.md` was NOT run through `pnpm format:docs`.** A probe of HEAD's own bytes at
a scratch path is ALREADY `not formatted` (the formatter wants to unescape `\~`/`\_` in rows this lane never
touched), so that red is inherited, and formatting a shared roster after adding rows is the multi-lane hazard
the standing facts name. The four rewritten rows are format-stable — the formatter's diff over the file
touches only pre-existing escapes elsewhere.

## NOT DONE, with its scoping

### `css-selector-has-a-writer` (#2182's third module) — NOT CONVERTED

Read in full and scoped rather than started, because a half-conversion here is worse than none. What it
needs, measured:

1. `product-css` for the census — `identities()` currently goes through
   `lib/css-family-census.ts#readCensus`, which is SHARED with the unconverted `css-family-ownership` and
   carries the owner-pending `EXPECTED_DIRECT_THEME_DECLARATIONS = 203` (#2230). The conversion consumes
   `cssInventory("product").selectorHooks` instead and touches neither.
2. `vendor-css-surface` for the Streamdown bundles — this retires the content-hashed
   `packages/ui/node_modules/streamdown/dist/chunk-BO2N2NFS.js` literal, which rots at every bump.
3. **The blocker: `lib/baseui-read.ts` has EIGHT gate importers.** `collectSelectorWriters` reaches the
   installed Base UI surface and the committed manifest through it, and both are `ctx.root` filesystem
   reads. Re-homing them onto `vendorCssSurface` + `json:baseui-manifest` changes a reader SEVEN other
   legacy gates share — a cross-lane change, not a fence-local one. **This is the decision the next lane
   needs made before it starts:** convert `baseui-read` to take the narrowed facts (and carry the seven
   legacy callers on a shim until they convert), or convert the whole Base UI family in one lane.
4. `lib/css-selector-writers.ts` imports `unwrapExpression` from `ast-read.ts` — ONE function. The brief is
   right that `ast-read` is not the new fact boundary; the replacement is `lib/reference-fact.ts`'s
   `resolveStableExpression`, and the swap owes its own differential because the two are not the same
   predicate.
5. Both Base UI reconciliation arms are UNENFORCED (audit w04/w05) and owe rows in the conversion.
6. `cssFamilyFinding` sets `column: 1` with a synthetic composite token, so every surviving ordinary
   finding must be re-anchored through `lib/caught-failure.ts#anchorWithin`/`firstAnchor`, or the arm is
   `hard`. Base rate for that migration obligation is 9/9.

### #2181's three modules — NOT CONVERTED, NOT PINNED

`css-length-tokens` (581 lines), `css-var-defined` (415), `css-family-ownership` (438) are the three largest
in the family and each carries its own unenforced set (13 + 10 `(file, candidate)` rows, two whole
real-tree-guarded arms, seven surviving count ratchets). Adding `mustPass` rows to a LEGACY descriptor that
is due for conversion buys a pin that the conversion then rewrites; the honest sequencing is to convert them
and land the pins IN the conversion, which is one lane per module. **One #2181 item WAS closed:** the
`1919 → 1921` word-count line in `docs/design/951-css-family-semantic-provenance.md` (audit ledger row 14),
rewritten to state both sides and why they differ.

`EXPECTED_DIRECT_THEME_DECLARATIONS = 203` was NOT touched (owner decision #2230, pending).

## LEDGER ROWS (2 rows)

| # | Module / file | Defect | Evidence | Class | State |
| -: | - | - | - | - | - |
| 1 | `playwright-ct.config.ts:48` + `gates/playwright-css-topology.ts` (legacy) | The gate's CT-config fence tested `code.includes("packages/client/src/styles/globals.css")` against a config that only ever spelled the path in two halves, so a HARD gate sat RED on `main` against its one live subject. Invisible because the legacy fence FUSED four clauses into one message and the whole-tree run is red by construction (#2106's class) | the frozen legacy descriptor driven over the real workspace through `lib/pass.ts#runPass`: 1 finding at `playwright-ct.config.ts:1:0`; `grep -c` of the joined literal = 0, control = 1 | tool lying — fixed same era | FIXED (`0e7c182b2`) |
| 2 | `gates/seed-theme-ink-contrast.ts` — `DECORATIVE_STROKE_CARRIERS` | A NINE-ROW gate-owned `ExemptionTable` §12.5 bans outright, which the §5b audit's own seven-criterion pass did not record under criterion 7 (it named only the fs reads and the seed parser) and whose existence changes the module's AUTHORITY. `exception-authority-census.md:124` had already classified the rows as grants | read at `seed-theme-ink-contrast.ts:63` on `eba8ef526`; the audit's module-6 verdict rules `hard` with no mention of the table | §5b.7 / §12.5 residual | FIXED (`5ed90e0e1`) — nine reviewed grants, all nine consumed 1:1 on the real tree |

## Durable lessons (report text — the orchestrator owns the memory write)

- **A resource policy's own RECEIPT can turn its blindness findings into tool errors.** `receiptFailures`
  reds on `members === 0` OR `unresolved > 0`, so a consumer that receipts its CENSUS makes "I measured
  nothing" a refusal instead of a finding — the exact inversion §12.3 records for a `-health` consumer, one
  layer out. Receipt a denominator that cannot be zero past the policy's own guard.
  Hook: `resource policy receipt census turns blindness into a tool error`.
- **Migrating an exemption TABLE to reviewed grants forces the finding GRANULARITY, not just the home.** A
  grant is 1:1; a policy whose findings are per-(subject × N conditions) makes every migrated row over-broad
  on arrival. The conversion has to aggregate to one finding per grant identity first, and that is a
  behavioural change a proof set built on `{ token }` alone will not notice.
  Hook: `exemption-table → grants forces one aggregate finding per identity`.
- **A skip-BEFORE-judging table also suppresses the instrument's own blindness arms.** Replacing it with a
  grant surfaces them, at the wrong subject, and the grant then reads STALE. The fix is to report the
  blindness under the SAME identity the grant names.
  Hook: `a skip-table hides the blindness arm behind it`.
- **`playwright/**` is NOT in the gate harness corpus** (`harnessGlobs` vs `searchGlobs`), so any gate clause
  filtering `ctx.files` for a `playwright/` prefix is dead by construction, and any policy needing that
  file's AST must go through `exact-file` TEXT.
  Hook: `harnessGlobs never loads playwright/`.
- **A singleton policy's `family` MUST equal its own id** — the loader refuses a shared name until the second
  member converts, with `check:structure` exit 2. Declare the reserved name in the header instead.
  Hook: `singleton family must equal its policy id`.
