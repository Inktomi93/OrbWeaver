---
kind: review
status: active
updated: 2026-09-12
---

# §5b audit — the eight legacy CSS gates (#2181/#2182/#2183, #1584)

Lane `cb-v-css-audit`, fresh-context Opus verifier, own worktree, rebased onto **`0e03cee19`** (main's tip
at write time; the audit was begun at `686853320` and every measurement below was re-taken at
`0e03cee19` after the orchestrator's premise update). `41c7fad04` is ORPHANED and is cited nowhere here.

**Instrument.** Every cut and probe drove the LEGACY dispatcher (`ops/conformance.ts#verifyGateProofs` →
`lib/pass.ts#runPass`) over the gate's own `mustFlag`/`mustPass` rows, on the substrate the descriptor
declares (all eight are `fsBacked: true`, so every row materialises into a real `mkdtemp` directory).
Each cut wrote **one scratch sibling module per cut, with a serial in the name**, asserted its anchor
occurs **exactly once** in the file and refused otherwise, and `rmSync`'d in a `finally`. No tracked file
was edited at any point; `git status --short` is empty and no `cbvca-*` module survives in `gates/` or
`lib/`. Baseline before every cut battery: **all eight modules 0 conformance failures**.

**Substrate caveat, stated because it decides several verdicts.** Six of the eight read the REAL
filesystem through `ctx.root` and are guarded by a real-tree anchor (`css-length-tokens`
`REAL_TREE_ANCHOR`, `css-var-defined`/`seed-theme-ink-contrast` "the gate's own source file is in
`ctx.files`", `css-family-ownership` `existsSync(package.json)`, `tokens-contract`
`resolve(ctx.root) === REPO_ROOT`). A fixture drive is a NON-ANSWER for those arms unless the fixture
plants the anchor — which is exactly why several arms below measure UNREACHED rather than UNENFORCED.

---

## PER-MODULE VERDICTS

Seven criteria per module, one line each. `?` never appears: a criterion I could not settle says so.

### 1. `css-var-defined` (415 lines) — COPY-TARGET: **none — new shape** (a declared HYBRID; no confirmed exemplar exists for the hybrid plane)

1. **CONTRACT** — `analysis: "resource"` **HYBRID**, and this is the module that forces §12.4's "a hybrid's
   dual role is explicit and receipted" to be exercised for the first time in this family: it needs the
   compiler population for the TS half (`walkStaticClassExpressions` carriers, `ctx.report(node,…)`) AND
   two resource kinds. Kinds: **`product-css`** (its `CSS_HOMES` const is byte-equal to
   `contract/css-family.ts#PRODUCT_STYLESHEETS`) + **`vendor-css-surface`** (whose own header at
   `contract/resource-vendor.ts:4-5` names *this gate* and `css-selector-has-a-writer` as its two
   consumers). `population: { in: ["@client","@ui"] }`, `execution: "entire-population"` (tripwires +
   two-sided liveness), `facts: []`.
2. **MESSAGE** — TRUE of the two arms that use it (`checkReferences`); every other arm passes its own
   `message` override, so the descriptor `message` is never wrong. **But `fix` is untrue of five arms**:
   "define it in the six-home topology, add an explicit var() fallback, or use a proved Base UI runtime
   property" is not the repair for a vendor version mismatch, a stale reviewed row, an unreviewed runtime
   writer, or an instrument-blindness tripwire. LEDGER ROW.
3. **FIX / AUTHORITY** — **SPLIT.** The two reference arms are node-anchored (`ctx.report(site.node, {token: site.name, offset})`)
   or file-anchored at an authored CSS coordinate, so both keep an ordinary door; spelling is
   `@orb-waive css-var-defined(--<prop-name>)`. **Every `GATE_SELF` arm is `hard` by construction** — it
   reports at `line: 0` with a synthetic token (`packages/x/y.tsx:--prop`, a bare label, or no token at
   all), which is §3's class-2 shape: `locateFinding` requires the token to be authored text at the exact
   line/column, and line 0 is not a line. Conversion is an ordinary policy + a `-health` sibling.
4. **FAMILY** — **`lib/css-var-resolution.ts#inventoryCssVariables` / `#readVendorContract`, and it is a
   SINGLETON**: measured importers = 1 (`gates/css-var-defined.ts`). A one-consumer `lib/` module is a
   private reader with a better address (§5b.7). The genuinely shared readers it also rides are
   `lib/static-class-expression.ts` (7 gate importers) and `lib/comment-spans.ts`.
5. **HEADER** — the best header of the eight; it records the retirement, the three replaced ratchets, a
   whole-tree measurement and a cut table. Missing: a **pre-conversion SHA** (it is legacy, so the port
   line is owed at conversion) and a **marker census** (measured below: 0).
6. **PROOFS — REFUTED. See (b) and the CUT MATRIX.** `checkRealTreeVendor` (the three replacement
   tripwires + both reviewed-vocabulary arms) and `checkRealTreeRuntime` (all four producer arms) are
   reached by **ZERO** committed proof rows; 3 of the 4 unguarded `checkPopulations` tripwires are
   unenforced.
7. **FORBIDDEN MACHINERY** — `lib/css-var-resolution.ts:1` imports `existsSync/readdirSync/readFileSync/statSync`
   and runs a **private directory walk** (`:299-310`) plus a **literal installed path**
   (`:340 packages/ui/node_modules/@base-ui/react`) and a mirror read (`:334`). `vendor-css-surface`
   serves all three exactly and was minted for it. Nothing else survives.

### 2. `css-selector-has-a-writer` (141 lines) — COPY-TARGET: **none — new shape** (hybrid, and the only module whose subject is CSS↔TS reconciliation)

1. **CONTRACT** — HYBRID: `product-css` (its `readCensus` reads exactly `PRODUCT_STYLESHEETS`) +
   `vendor-css-surface`; `population: { in: ["@client","@ui"] }` for the writer walk;
   `execution: "entire-population"`; `facts: []`. `cssInventory("product").selectorHooks` already
   publishes the class/data hook facts this gate re-derives — the conversion should consume that rather
   than `readCensus` + `selectorHooks`.
2. **MESSAGE** — TRUE of the `reportMissing` arms. The four other arms (Streamdown two-sided, Base UI
   manifest-only, Base UI installed-only, `selector-population:0`) each carry their own message. `fix`
   ("write the exact hook from a rendering/DOM terminal…") is untrue of the manifest/installed arms.
3. **FIX / AUTHORITY** — the `reportMissing` findings anchor at `(file=<stylesheet>, line, token=class:x |
   data-x="y")` via `cssFamilyFinding`, which sets `column: 1` — a resource finding whose token is NOT the
   authored text at column 1, so **the ordinary door does not bind today** (§3's class 2 at 9/9 base rate,
   confirmed here). Either re-anchor on the authored selector slice, or `hard`. The vendor/manifest arms
   are `hard` (they anchor at a `node_modules` path or a manifest JSON).
4. **FAMILY** — `lib/css-selector-writer-policy.ts#auditCssSelectorWriters` is a SINGLETON (1 importer).
   The real shared readers are `lib/css-family-source-provenance.ts` (2 gate importers — this gate and
   `css-family-ownership`, so **those two share a family**), `lib/static-class-expression.ts` (7),
   `lib/baseui-read.ts` (8), and `lib/ast-read.ts` via `css-selector-writers.ts` — the last is the module
   `shared-semantic-readers.md:33` explicitly calls **"not the new fact boundary"**, so the conversion
   must not preserve it.
5. **HEADER** — one line. It records no family, no population port, no legacy SHA, no marker census, and
   no declared limits. The weakest header of the eight. LEDGER ROW.
6. **PROOFS** — mixed. The Streamdown two-sided pair and the zero-population tripwire are ENFORCED
   (w01/w02/w03). **Both Base UI reconciliation arms are UNENFORCED** (w04/w05) — the same class the
   Streamdown pair pins on the other vendor.
7. **FORBIDDEN** — `lib/css-selector-writer-policy.ts:9` hardcodes
   `packages/ui/node_modules/streamdown/dist/chunk-BO2N2NFS.js` — a **content-hashed vendor chunk
   filename**, which rots at every Streamdown bump — and reads it with `existsSync`/`readFileSync`.
   `vendor-css-surface` publishes the Streamdown bundles and is the door. `readCensus`'s own
   `existsSync`/`readFileSync` over the five homes is served by `product-css`.

### 3. `css-family-ownership` (438 lines at `0e03cee19`) — COPY-TARGET: **`no-raw-color-in-css`** for the resource half; the TS-provenance half has no exemplar

1. **CONTRACT** — HYBRID: `product-css` + `population: { in: ["@client","@ui"] }` (the hook-owner
   provenance walk), `execution: "entire-population"`, `facts: []`. It reads `existsSync(package.json)` as
   a real-tree anchor; under the final contract that anchor is unrepresentable and unnecessary (the
   resource declaration IS the anchor, and a broken one is a population-phase refusal).
2. **MESSAGE** — TRUE and well-scoped ("a declaration is inside a sanctioned CSS path but belongs to
   another semantic family"). Note it is now true of FEWER arms than before `0e03cee19` — the retired
   census findings carried their own messages.
3. **FIX / AUTHORITY** — SPLIT. The ownership findings anchor at `(stylesheet, line, token=<selector or
   prop>)` with `cssFamilyFinding`'s `column: 1` — same binding problem as module 2: **the door does not
   bind today.** The `census:theme-direct`, `runtime-writer:*`, `direct-client-mechanism:*` and
   `density-arm:*` findings anchor at `GATE_SELF`/the sheet with synthetic tokens → `hard`.
4. **FAMILY** — `lib/css-family-policy.ts#auditCssFamilies` + `lib/css-family-census.ts#readCensus` are
   SINGLETONS (1 importer each). Genuinely shared: `lib/css-family-source-provenance.ts` (shared with
   module 2 — **that pair is the family**), `lib/static-class-expression.ts`, `lib/css-rules.ts` (5
   importers), `lib/comment-spans.ts`.
5. **HEADER** — good and now accurate for the retirement; carries a driven cut table. Missing pre-conversion
   SHA and marker census (0, measured).
6. **PROOFS** — the module's CORE is strong: the density-arm fences (f09/f10), the `complete` fence (f06,
   47 rows die) and the surviving `census:theme-direct` parity arm (f01) are all ENFORCED. **The
   instrument-health half is not:** `zero-declarations` (f02) and `zero-theme-values` (f03) are reached by
   zero committed rows, the `fullHomeSet` fence in `reportExactCensus` is unenforced (f04), and
   `reportClosedSeamDrift` — which houses **seven surviving hand-spelled count ratchets** — is reached by
   zero committed rows (f07/f08).
7. **FORBIDDEN** — `readCensus`'s `existsSync`/`readFileSync` (served by `product-css`),
   `existsSync(package.json)` (served by the declaration itself), and `readDirectThemeDeclarations`'s own
   `@theme`-block brace scanner + `blankNestedBlocks` — a **second CSS parser** beside `lib/css-rules.ts`,
   written because `parseCssRules` descends at-rules to STYLE rules and cannot express "direct
   declarations of an at-rule block". `CssFacts.declarations` **already answers it**
   (`CssDeclarationFact.owner.kind === "at-rule"` with the prelude), so this parser deletes on conversion.

### 4. `css-length-tokens` (581 lines) — COPY-TARGET: **`motion-token-purity`** (same subject, same coordinate discipline) for the shell half; the class half has no exemplar

1. **CONTRACT** — HYBRID: **`exact-file`** for `shell.css`… **and there is no id for it.** `EXACT_RESOURCE_PATHS`
   has no `shell.css` entry, so the shell half rides `product-css` (which admits all five homes, wider
   than the subject but the smallest CLOSED id — the `ui-exports-map-complete` precedent, contract §5 alt D)
   plus `population: { in: ["@client","@ui"] }` for the class half. `execution: "entire-population"`,
   `facts: []`.
2. **MESSAGE** — TRUE, and unusually careful: it names both halves ("shell.css permits only its declared
   viewport, query, ratio, and measurement mechanics, and class carriers permit only declared structural
   grid/query values"). The `reportStale`/`reportUnused` arms carry their own.
3. **FIX / AUTHORITY** — SPLIT. The shell declaration/query findings anchor at `(SHELL, line, column: 0,
   token: "gap:7px" | "@media (max-width: 48rem) {")` — `column: 0` and a composite token are class-2, so
   **no ordinary door today**. The CLASS findings are node-anchored through `sourceToken` with a real
   offset and ARE ordinary-waivable (`@orb-waive css-length-tokens(hover:w-[137px])`). The liveness/stale
   arms at `GATE_SELF` line 1 are `hard`. Three authorities → an ordinary policy + a `hard` `-health`.
4. **FAMILY** — **`lib/css-rules.ts#parseCssRules`** (5 importers: this, `motion-token-purity`,
   `over-art-plate-arm`, `rest-transform-grid`, `ops/resource-tree`) and
   **`lib/static-class-expression.ts#walkStaticClassExpressions`** (7 importers). Two real shared readers,
   and it is the only one of the eight whose family is unambiguous. `motion-token-purity`'s header already
   reserves `css-literal-geometry` for a second member — **this is the second member.**
5. **HEADER** — the longest and most honest of the eight (it records #2181's method lesson verbatim).
   Missing pre-conversion SHA; marker census 0 (measured).
6. **PROOFS — REFUTED for the #2181 half. See (b).** The occurrence arms and the `onRealTree` guard are
   ENFORCED (c01/c04/c05); **the 13 `(file, candidate)` liveness rows and the 10 declaration-liveness rows
   are UNENFORCED** (c02/c03/c06), and a one-line constructed `mustPass` was written and RUN that
   discriminates.
7. **FORBIDDEN** — `existsSync`/`readFileSync` on `shell.css` and `REAL_TREE_ANCHOR` (served by the
   declaration), and `new Scanner` from `@tailwindcss/oxide` — a THIRD-PARTY evaluator, not a private
   reader; it has no resource kind and needs none (it consumes a string, not the filesystem). No private
   AST walk: it goes through the shared class walker.

### 5. `playwright-css-topology` (323 lines) — COPY-TARGET: **`ui-exports-map-complete`** (pure resource, exact-file identity, derived-path arms)

1. **CONTRACT** — `analysis: "resource"`, `population: { of: "none", why: "CSS topology is a ResourceHost
   identity, never a compiler population" }`… **except for `directCtCssImports`**, which walks `ctx.files`
   under `playwright/` and `tests/` for `.css` ImportDeclarations, so it is a HYBRID with
   `population: { in: ["@tests"], under: ["playwright/**"] }`. Kinds: **`exact-file`** for
   `client-entry`, `client-css-entry`, `app-shell-surface`, `ct-boot`, `ct-extension-css`,
   `playwright-ct-config` — **all six ids already exist and `contract/resource-exact.ts:26-31` names this
   gate as their consumer** — plus `product-css` for the graph. `execution: "entire-population"`.
2. **MESSAGE** — TRUE but generic; every arm passes its own message, so the descriptor `message` is only
   the header line. No untrue clause found.
3. **FIX** — **`hard` by construction.** Every finding is `{file, line: 1, column: 0}` with **no token at
   all**, and several anchor at `GATE_SELF`. Class 2 in full: `locateFinding` cannot bind. The header must
   state that the legacy engine's bare `@orb-gate-ignore` door did exist and does not survive.
4. **FAMILY** — **`lib/sanctioned-css-homes.ts#SANCTIONED_CSS_HOMES`**, a real shared `lib/` module with
   exactly **two** consumers (this gate and `sanctioned-css-homes`) — the import-coupled pair, and the
   family both must declare. Also rides `lib/config-static-read.ts#readStaticSource` (7 importers) and
   `lib/comment-spans.ts`.
5. **HEADER** — three lines. No family, no population port, no legacy SHA, no marker census, no declared
   limits. LEDGER ROW.
6. **PROOFS** — the MAIN anchor guard and the zero-sources blindness arm are ENFORCED (p01/p03).
   **`validateCtConfig`'s entire four-clause fence is UNENFORCED** (p04) — no row plants a wrong plugin
   order, a missing plugin or a missing `CLIENT_GLOBALS` marker. And **the `unresolved` arm is
   STRUCTURALLY DEAD** (p05 + code read): `cssGraph`'s `visit` returns before `files.push(rel)` when
   `read()` is null, and `!unresolved:<spec>` is never a real path, so `graph.files.filter(startsWith("!unresolved:"))`
   is always empty. The message can only ever print `unresolved=none`, and a genuinely unresolvable
   non-sanctioned `@import` vanishes from the graph with no finding at all. That is a false clean.
7. **FORBIDDEN** — its own `CSS_IMPORT_RE`/`CSS_SOURCE_RE` regex walk over blanked CSS text, plus
   `statSync`/`readFileSync`/`existsSync`. **This is a SHARED-READER GAP, not a private reader — see (d).**

### 6. `seed-theme-ink-contrast` (326 lines) — COPY-TARGET: **`no-raw-color-in-css`** for the CSS half; the ink census half has no exemplar

1. **CONTRACT** — HYBRID: `population: { in: ["@client","@ui"] }` (the ink census is a static-class walk
   over TS) + one resource for `theme.css`. See (c): **`product-css` is the shipped kind that serves it**,
   with the whole five-home set admitted and the module naming `THEME_CSS` inside `evaluate`.
   `execution: "entire-population"` (the stale-exemption sweep is a whole-corpus verdict), `facts: []`.
2. **MESSAGE** — TRUE and precise; the per-finding message names the measured ratio, the ground and the
   seed. The blindness arms carry their own. No untrue clause.
3. **FIX / AUTHORITY** — **`hard`, and the module already says so**: `reportFailure` carries an explicit
   `@finding-overload-ok` whose reason is *"a seed palette failing AA is a ledger verdict, not a site an
   author may absolve."* That is a deliberate `hard`, not a class-2 accident — the only one of the eight
   where `hard` is EARNED rather than forced. The header must record that the legacy bare-marker door
   existed and is deliberately not carried.
4. **FAMILY** — `lib/seed-theme-ink.ts` is a SINGLETON (1 importer). The shared reader it rides is
   `lib/static-class-expression.ts#walkStaticClassExpressions` (7 importers), which is the family it
   shares with `css-length-tokens`, `css-family-ownership` and `css-selector-has-a-writer`.
5. **HEADER** — strong on WHY (the GROUNDS table's per-row receipts, the carrier-key rationale, the
   narrowness argument) and silent on the §5b.5 fields: no family, no population port, no legacy SHA, no
   marker census (0, measured).
6. **PROOFS** — the strongest set of the eight. The real-tree guard (k01, 4 rows die), the exemption table
   in BOTH directions (k02/k03) are ENFORCED, and five `mustFlag` rows each name a real historical defect.
   **One caveat:** `mustPass[3]`'s death under k02 is CONFOUNDED — it dies with seven
   *"could not resolve a colour"* blindness findings rather than a contrast finding, because its fixture
   `theme.css` declares only two of the eight grounds. The fence is enforced; the row does not isolate it.
7. **FORBIDDEN** — `existsSync`/`readFileSync` on `theme.css` only (served by `product-css`), plus its own
   `readSeedPalettes` parser in `lib/seed-theme-ink.ts`. That parser reads `[data-theme=…]` seed BLOCKS,
   which `CssFacts.declarations` + `owner.selectorList` already expresses — worth folding, but it is a
   judgment on colour VALUES (`toRgb`, `compositeOver`, `worstContrast`), which is policy and stays.

### 7. `tokens-contract` (88 lines) — COPY-TARGET: **`ui-exports-map-complete`** (single closed resource, validator preserved)

1. **CONTRACT** — the cleanest of the eight: `analysis: "resource"`, `population: { of: "none" }`,
   `execution: "entire-population"`, `facts: []`, `resources: [{ kind: "token-contract" }]`. §12.4's
   `token-contract` row names *"the canonical generated token bundle (vault, themes, resolver, removed)
   behind the preserved `validateTokenContract`"* — this gate IS that consumer, and
   `contract/resource-artifact.ts` already spells all seven paths.
2. **MESSAGE** — TRUE. Each finding overrides with `[${code}] ${path}: ${message}`, so the descriptor
   message is the family label only.
3. **FIX** — **`hard` by construction.** Findings anchor at `line: 0, column: 0` with
   `token: item.code` (`format.schema`) — a synthetic label that appears in no source. There is no ordinary
   door and the subject (a schema violation in a GENERATED artifact) should not have one.
4. **FAMILY** — **singleton**, and honestly so: `validateTokenContract` lives at the `packages/ui` ROOT and
   is reached through the `@orb/ui/token-contract` exports subpath. No `lib/` reader is involved at all.
5. **HEADER** — records the exports-subpath decision, the knip/production consequence and the owed move
   (a tooling `tokens` tool). Missing: population port, legacy SHA, marker census (0). The **owed move is
   the interesting line** — a gate importing a workspace package's root module is the only such shape in
   this family.
6. **PROOFS — the thinnest set of the eight: ONE `mustFlag` and ONE `mustPass` for a seven-document
   contract.** The real-tree history-ratchet conditional (`historyRoot = resolve(ctx.root) === REPO_ROOT ?
   ctx.root : undefined`) is **UNENFORCED** (t01: forcing it to `undefined` kills nothing), so the removal
   ratchet — half the gate's stated subject — is proven by nothing on either side.
7. **FORBIDDEN** — `validateTokenContract(join(ctx.root, "packages/ui"), historyRoot)` performs its OWN
   filesystem reads and (for the history ratchet) its own git invocation, from a module at the
   `packages/ui` ROOT. Under the final contract the policy hands `readyResourceValue(ctx.resources.tokenContract()).texts`
   to `validateTokenContractTexts` (which `contract/resource-artifact.ts` says stays where it is) and the
   git half becomes the open question the header already tracks.

### 8. `sanctioned-css-homes` (133 lines) — COPY-TARGET: **`server-layout`** (an `authored-tree` walk judged against a closed registry, two-sided)

1. **CONTRACT** — `analysis: "resource"`, `population: { of: "none" }`, `execution: "entire-population"`
   (a path-closed set cannot compose over a subset), `facts: []`, `resources: [{ kind: "authored-tree", id:
   "packages" }]`. See (d): **`authored-tree:packages` serves both sides**, and the reader's own
   `NON_AUTHORED_DIRECTORIES = {node_modules, .git, dist, .cache}` (`ops/resource-reader.ts:13`) is a
   SUPERSET of the gate's `GENERATED_DIRS = {dist, node_modules}`, so the fs-walk half ports with a
   deliberate widening the header must record. `authored-css` does NOT serve it (that kind is only
   `packages/{client,ui}/src`, and this gate's whole point is finding a `.css` OUTSIDE those).
2. **MESSAGE** — TRUE of the extra-path arm. The missing-home arm carries its own. `fix` ("move the
   responsibility into its exact §4 home") is true of the first and false of the second (you do not "move
   a responsibility" when a required home vanished). Minor.
3. **FIX / AUTHORITY** — **`hard`.** Both arms report `{line: 0 | 1, column: 0}` with **no token**; the
   missing-home arm anchors at `GATE_SELF`. And the subject is a REGISTRY decision, not a site an author
   waives. The missing-home arm additionally needs `subjectAnchor` (§3's absent-verdict rule): it currently
   anchors at the gate's own file, which under `report.file` would be outside the resource population and
   THROW.
4. **FAMILY** — **`lib/sanctioned-css-homes.ts#SANCTIONED_CSS_HOMES`**, shared with
   `playwright-css-topology` (2 consumers). Its header already records the #2096 move and says *"when the
   pair converts, the family they declare should be the name this file is renamed to."*
5. **HEADER** — three lines, adequate on WHAT, silent on all five §5b.5 fields. Marker census 0 (measured).
6. **PROOFS — the strongest of the eight after `seed-theme-ink-contrast`.** All three fences ENFORCED
   (s01 generated-dirs 1 row dies, s02 anchor guard 6 rows die, s03 allowlist 4 rows die), six `mustFlag`
   rows including a dotfile, a dot-directory, a directory-at-an-exact-path and an explicit STALE ARM with
   `count: 6`. This is the module a lane should copy the PROOF SHAPE from.
7. **FORBIDDEN** — a private `readdirSync` recursive walk (`productCssPaths`), plus `existsSync`/`statSync`.
   `authored-tree:packages` retires all of it. The `SANCTIONED_CSS_HOMES` registry is policy DATA and
   stays (guide §12.4: sanctioned homes are exact reviewed grants, never population subtraction — but this
   list is not a subtraction, it is the ADMITTED set the policy compares against, so it stays a plain
   const).

---

## THE FOUR QUESTIONS

### (a) `EXPECTED_DIRECT_THEME_DECLARATIONS = 203` — is "generated-output parity" doing work its subject does not earn?

**YES. 203 IS DERIVABLE, and I derived it.** Receipt, run in this session against `0e03cee19`:

```
generatorEmittedThemeDeclarations:              203   (packages/ui/tokens.build.ts#generateArtifacts, @theme block)
gateParsedDirectTheme:                          203   (lib/css-family-census.ts#readCensus, the gate's own reader)
handCopiedConstant:                             203
committedThemeCssIsByteIdenticalToGenerated:   true
```

**From what.** `tokens.build.ts:504-563` builds `flat: GeneratedCssValue[]` from `tokens.json`: one entry
per Style-Dictionary token whose `renderPortableToken` is non-null (all `placement: "theme"`), plus one per
`contract.cssValues` entry at its declared `placement`. `renderThemeCss` (`:281-284`) emits **exactly one
line per `placement === "theme"` entry** — the count is `flat.filter(placement === "theme").length` and
nothing else. The generator already ASSERTS the whole set against the contract twice
(`emittedTargets.size !== flat.length || !== contract.cssTargets.size` at `:544`, and the
`dictionary.allTokens.length !== contract.baseTokens.length` coverage check at `:536`).

**So the ruling's language IS doing work its subject does not earn.** `exception-authority-census.md:178`
calls it *generated-output parity*; on the tree it is a hand-copied literal compared against a parsed
count — the identical SHAPE to the three `css-var-defined` retired the same day, and to the five
`0e03cee19` retired an hour later. Nothing derives it, nothing ties it to `tokens.json`, and a legitimate
token addition reds it exactly the way the retired ratchets did (`#1956`'s four-commit, five-day red).

**What a derived parity check would compare.** Two arms, both free:
- **The honest one:** `readDirectThemeDeclarations(theme.css).length` vs
  `contract.cssTargets` partitioned by `placement`, read through the shipped **`token-contract`** resource
  kind (`ctx.resources.tokenContract()` publishes `texts` + `paths`; the `orb.cssValues` placement split
  lives in `tokens.json`'s own `$extensions`, i.e. inside `texts.base`). No new kind, no new reader.
- **The stronger one, and it subsumes the count entirely:** the committed `theme.css` is BYTE-IDENTICAL to
  the generator's output (measured true above), so a freshness comparison of the generated artifact against
  the committed one makes the declaration count a derived corollary rather than a fact anyone spells. That
  is the `ledgers:fresh` shape, one artifact over.

**Cost note for the ruling:** the byte-identity arm requires RUNNING Style Dictionary (async, seconds), so
it belongs in `ledgers:fresh` / a `baseline` verb, not inside a gate `evaluate`. The count-derivation arm
does not and can live in the policy.

**The five `censusControlFiles` rows are now FOUR, and the ONE home question is answered by the
retirement.** At `0e03cee19` only two remain (`mustFlag` at `:174`, `mustPass` at `:430` — the numbering
below is at the tip) and both spell `themeDirect: 203/202`. The #1956 coupled-site hazard therefore
survives ONLY for `EXPECTED_DIRECT_THEME_DECLARATIONS`, and it dissolves the moment the constant is
derived: **the ONE home is the generator's own contract (`contract.cssTargets` / `tokens.json`), and the
proof fixture then spells nothing.** Until that lands, the coupled site is 3 sites for one number
(`lib/css-family-census.ts:79`, the two fixture rows) and it is a real LEDGER ROW.

**AND THE RETIREMENT LEFT SEVEN MORE COUNT RATCHETS BEHIND, IN THE SAME FILE.**
`EXPECTED_RUNTIME_WRITERS` (4 keys: `density`/`blur`/`colorization` are derived from set sizes, **`fade: 12`
is a bare hand literal**) and `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` (3 hand-spelled counts: 1/1/3) are
compared exactly (`!==`) in `reportClosedSeamDrift`. §12.5 bans a count ratchet; `exception-authority-census.md:178`
disposes only the DECLARATION counts and says nothing about these. **And they are pinned by nothing** —
`reportClosedSeamDrift` is reached by zero committed proof rows (f07), and moving `fade: 12 → 13` kills no
row (f08).

### (b) `e7e3f083b` / `9e29a921c` (#2181 lane 1, LANDED) — does each replacing narrowing have a row that dies under its own cut, in the stated direction?

**NO for both halves. REFUTED.** Positive controls fired in both modules before any negative was recorded.

**`css-length-tokens` — `STRUCTURAL_CLASS_FILES` → 13 `(file, candidate)` rows + zero-occurrence liveness
behind `onRealTree`:**
- I **drove the module's OWN walk over the real tree** (`walkStaticClassExpressions` over
  `packages/{client,ui}/src`) through the legacy dispatcher — not a re-implementation — and reproduced the
  13 rows: the fixture drive at `mustFlag[3]` (which plants `REAL_TREE_ANCHOR`) names all 13 by
  `(file :: candidate)` in its findings, and every one of the four legacy per-file counts is accounted for
  (pager-chrome 3 · character-create-actions 2 · variants 7 unique candidates over 9 occurrences ·
  markdown 1 = 13). The lane's enumeration is CORRECT.
- **The `onRealTree` guard IS enforced** (c01: 2 `mustPass` rows die when opened — #2198's fix is pinned).
- **The 13 rows are NOT.** Deleting one row (c02, the markdown row) → **0 rows die**. Killing the ENTIRE
  class-liveness arm (c03) → **0 rows die**. The only fixture that reaches the arm is `mustFlag[3]`, whose
  `expect` is `{ token: "@media (max-width: 48rem) {" }` — a token the QUERY liveness arm emits — with **no
  `count`**. Legacy `matchesExpect` (`ops/conformance.ts:150-171`) matches `token` with `.some()`, so the
  13 stale findings inside that row's 18 are asserted by nothing. The header's own sentence — *"THE EXACT
  CARDINALITY MOVED WITH #2181 and is deliberately NOT restated as a number here"* — is the gap, stated
  honestly and left open.
- **Classification: UNENFORCED, not UNFALSIFIABLE.** I wrote and ran the discriminating row:
  a `mustPass` whose files are `{"packages/ui/src/markdown/markdown.tsx": 'export const M = <div
  className="max-h-[60cqh]" />;'}` — **green at tip, RED under the row's deletion** (`tip failures=0 / cut
  failures=1`). One line per row closes all 13.
- **The 10 `STRUCTURAL_DECLARATIONS` liveness rows (#2101's replacement) are UNENFORCED too** (c06: killing
  the arm kills nothing). Its occurrence half IS enforced (c04, `mustFlag[2]` dies). The QUERY liveness arm
  is the one that IS pinned (c05, `mustFlag[3]` dies).

**`css-var-defined` — the three totals → constant-receipting zero-tripwires:**
- **All three tripwires sit inside `checkRealTreeVendor`, which is reached by ZERO committed proof rows.**
  Throw probe at the arm's entry, directly below the `realTree` guard: **0 rows die** (v01). Same for
  `checkRealTreeRuntime`: **0 rows die** (v02). Positive control — a `throw` at `run()` entry — fires on
  **8 of 8** rows (v03), so both zeros are measurements, not blindness.
- Consequence: the two reviewed-vocabulary arms (unreviewed vendor name / stale vendor row), the runtime-use
  arm, the unreviewed-writer arm and the stale-producer arm are ALSO reached by no row. The header's cut
  table (*"the three tripwires INVERTED → 3"*) is a **real-tree probe receipt**, which
  `.claude/rules/gates-and-tooling.md` explicitly rules is not the deliverable: *"a tool caught lying gets
  its permanent pin, not a probe receipt."*
- **This is NOT a regression #2181 introduced** — the three count ratchets it replaced sat behind the same
  anchor and were equally unreached. But the commit's claim that the replacements are proven is false, and
  the retirement swapped one unproven mechanism for another.
- **No census is receipted** — CONFIRMED. Each tripwire asks `count === 0` and reports a constant-zero
  message; `EXPECTED_RUNTIME_USE` is now DERIVED from `RUNTIME_PRODUCER_ROWS.map(row => row.property)`, so
  the two-spellings-of-one-fact defect the header claims to have closed IS closed (read at
  `gates/css-var-defined.ts`, the `EXPECTED_RUNTIME_USE` declaration).
- **3 of the 4 unguarded `checkPopulations` tripwires are also unenforced** (v04: keeping only
  `source files` kills nothing) — only `"scanned zero source files"` has a row.

### (c) `seed-theme-ink-contrast` — which shipped resource kind serves its subject?

**`product-css`, and the door is `ctx.resources.cssInventory("product")` (or `productCss()` for raw text).
No fork.**

- The module's only filesystem subject is `packages/ui/src/styles/theme.css`, read with
  `existsSync`/`readFileSync` and handed to `readSeedPalettes`. `theme.css` is member 1 of
  `contract/css-family.ts#PRODUCT_STYLESHEETS`, and `ops/resource-tree.ts#loadProductCss` loads exactly
  that five-member list. `lib/resource-policy.ts:120` binds `cssInventory("product")` to the
  `{ kind: "product-css" }` declaration.
- **The ink half needs no kind at all**: `censusInks` walks `ctx.files` filtered to
  `packages/{ui,client}/src` through the shared `walkStaticClassExpressions`, which is a COMPILER
  population (`population: { in: ["@client","@ui"] }`), not a resource. So the module is a declared HYBRID
  and §12.4's "a hybrid's dual role is explicit and receipted" is the line the header owes.
- **The one thing to state as a deliberate widening:** `product-css` admits all five sheets where the gate
  reads one. That is the smallest CLOSED id (there is no `theme-css` `exact-file` id and the vocabulary is
  frozen), which is precisely the `ui-exports-map-complete` / `resource-policy-contract.md` §5 alt-D
  precedent — record it in the header so a later reader does not "fix" it by minting an id.
- Colour parsing (`toRgb`/`compositeOver`/`worstContrast`) and `readSeedPalettes` stay in the policy's
  `lib/`: they judge VALUES, and §12.3 keeps judgment outside ResourceHost.

### (d) `sanctioned-css-homes` + `playwright-css-topology` — the import-coupled pair

**The six-home registry is policy DATA and stays.** `lib/sanctioned-css-homes.ts` is a plain
`readonly string[]` of six exact paths with two consumers, already moved out of the gate module by #2096.
It is not an exemption table (no `why`, no `endsWhen`, nothing suppressed) and not a population
subtraction — it is the ADMITTED set both policies compare against. It stays `hard` and it stays a const.
Its own header names the family the pair should declare when it converts.

**The fs walk: `authored-tree:packages` + `exact-file`.**
- The EXTRA-PATH side (`productCssPaths`) is `authored-tree:packages` filtered to `.css`. The tree reader's
  `NON_AUTHORED_DIRECTORIES` (`node_modules`, `.git`, `dist`, `.cache`) is a strict superset of the gate's
  `GENERATED_DIRS`, so the port is a deliberate widening (`.git`/`.cache` newly excluded — no `.css` lives
  there today, but say it).
- The MISSING-HOME side needs per-path IDENTITY, which a tree walk gives (membership) but which
  **`exact-file` states better** — except **five of the six paths have no `exact-file` id**
  (`EXACT_RESOURCE_PATHS` has none of the CSS homes, only `client-css-entry`). Adding five ids inside the
  existing kind is explicitly **not** a reopening (§12.4: *"a new id inside an existing kind is not a
  reopening — it is a contract edit with a named consumer"*), and this pair is two named consumers.
  **Default if unruled: use `authored-tree:packages` membership for both sides** (one declaration, no
  contract edit), and note that a directory shadowing an exact path (`theme.css/keep`, which the gate's own
  `mustFlag[4]` pins) is answered by `ResourceTreeEntry.kind`.

**The CSS import graph: a SHARED-READER GAP, and I measured it.** `cssInventory` does **NOT** expose
`@import`/`@source`. Driven against the shared parser with a positive control:

```
input:  @import "tailwindcss";  @import "./theme.css";  @source "../";
        @media (max-width: 30rem) { .a { color: red; } }   .b { gap: 1px; }
parsed: atRulePreludes = ["@media (max-width: 30rem)"]      <- the CONTROL, a BLOCK at-rule, IS seen
        ruleSelectors  = [".a", ".b"]
        statement at-rules seen = 0
```

`lib/css-rules.ts#parseCssStylesheet` pushes an at-rule only from `closeFrame`, which fires on `}` — a
statement at-rule (`@import "x";`, `@source "y";`, `@charset`, `@layer a, b;`) has no block and produces
no fact. So `CssFacts` structurally cannot answer "what does this sheet import".

**That is BUILD work, not a refusal** (§3's shared-reader-gap paragraph). The fix is a
`statements: readonly { name, prelude, line, offset }[]` field on `ParsedCssStylesheet`, surfaced on
`CssFacts`. Consumers: **(1)** `playwright-css-topology`'s `cssGraph` @import walk, **(2)** the same gate's
`validateHarnessExtension` `@source` read + `validateProductCssGraph`'s source-root census — and the
reader has **five importers today** (`css-length-tokens`, `motion-token-purity`, `over-art-plate-arm`,
`rest-transform-grid`, `ops/resource-tree`), so it clears §12.4's two-independent-consumer bar by
construction. Building it also deletes the gate's `CSS_IMPORT_RE`/`CSS_SOURCE_RE` and, as a by-product,
**closes the structurally-dead `unresolved` arm** — a resolution question a fact reader answers honestly
where the gate's own walk drops it.

---

## `0e03cee19` — THE FOUR CLAIMS, PER CLAIM

| # | Claim | Verdict | Receipt |
| -: | - | - | - |
| 1 | the five per-sheet counts + the total are GONE from the module | **CONFIRMED** | `ast-grep 'export const $N = $V' -l ts lib/css-family-census.ts` lists 11 exports; `EXPECTED_DECLARATION_CENSUS`, `EXPECTED_DECLARATION_TOTAL`, `CENSUS_TOKEN` are absent (control: `EXPECTED_RUNTIME_WRITERS`, `EXPECTED_DIRECT_THEME_DECLARATIONS` present). A repo-wide literal grep finds them only in comment prose and in the design doc |
| 2a | THREE proof rows deleted | **CONFIRMED, and they are named** | `git show 0e03cee19 -- …/css-family-ownership.ts`: the `ui: 191` (+1) row, the `shell: 352` (−1) row, the `ui:189/client:128` (move) row. Row count 38+14 → **35+14**, re-derived by loading both trees |
| 2b | TWO `why` strings rewritten | **CONFIRMED, and they are named** | `mustFlag` `themeDirect: 202` ("…trips the generated-output ratchet" → "…parity arm — the one census constant the #2181 retirement kept") and the clean `mustPass` ("the exact declaration manifest as of #1869/#1870…" → "a full five-home fixture of legal declarations yields zero findings…") |
| 2c | did any deleted row pin a §4.1 narrowing that now has no successor? | **NO** | All three asserted `count: 2` on `census:ui-globals`/`census:shell` — tokens minted by `CENSUS_TOKEN`, and both the per-sheet arm and the total arm are deleted. Nothing surviving loses a pin. The surviving parity arm keeps BOTH its pins: cutting `203 → 204` reds the clean `mustPass` (f01), and the `themeDirect: 202` `mustFlag` asserts `count: 1, token: "census:theme-direct"` |
| 3 | the moved prose landed intact; 1919/1919 word count | **CONFIRMED IN SUBSTANCE, the number is off by 2 on the destination side** | Source side (the comment prose from `export const EXPECTED_DECLARATION_CENSUS` through `export const EXPECTED_DIRECT_THEME_DECLARATIONS` at `0e03cee19^`, 144 lines / 135 comment lines) = **1919 words**. Destination side (the `### theme.css …`→EOF bullets, backticks normalised, `- ` markers stripped) = **1921**. A word-level diff over 1919 tokens shows **exactly one difference**: `below:` → `under client globals.css:` — precisely the directional re-spelling the commit and §7 both disclose. Nothing else changed. The receipt "identical word count on both sides (1919)" is true of the SOURCE and stale-by-two for the DESTINATION; the same sentence is now in the doc |
| 4 | `EXPECTED_DIRECT_THEME_DECLARATIONS` UNTOUCHED | **CONFIRMED** | `lib/css-family-census.ts:79`, `= 203`, unchanged in the diff; still a hand-copied literal compared at `lib/css-family-policy.ts:179`. See (a) — it IS derivable |

**One claim the commit makes that I REFUTE.** *"RETIREMENT COSTS NOTHING IN INSTRUMENT HEALTH. The
blindness half was always separate … the arm is REACHED for every home, which is the claim the retirement
rests on."* The real-tree inversion probe is real, but it inverts the arm's POLARITY (`=== 0` → `!== 0`) and
so measures that five sheets have non-zero declarations — not that the blindness arm fires when one does
not. Driven the honest way, **`zero-declarations` is reached by ZERO committed proof rows** (f02, throw
probe) and so is `zero-theme-values` (f03); positive control 49/49 (f05). The retirement's cost to
instrument health is not zero — it is unmeasured, because the blindness half was never pinned either.

---

## CUT MATRIX

Every cell: the cut, the direction, whether a COMMITTED proof row died, the classification. Positive
controls are listed with their cells. Every anchor was asserted to occur exactly once; every scratch module
carried a serial and was removed in a `finally`.

### `css-length-tokens` (occurrence policy + two liveness arms; liveness cuts are TRIPWIRE-direction)

| # | Fence / arm | Cut | Direction | Rows died | Class |
| - | - | - | -: | -: | - |
| c00 | identity control | (no change) | — | 0 | CONTROL OK |
| c01 | `onRealTree` guard | `return true` | flag MORE | **2** (`mustPass[0]`, `mustPass[1]`) | **ENFORCED** (#2198's fix is pinned) |
| c02 | one of the 13 `(file, candidate)` rows (markdown) | delete the row | flag MORE (real tree) / FEWER (fixture) | **0** | **UNENFORCED** — constructed row written + run, discriminates |
| c03 | the WHOLE class-liveness arm | `if (false && …)` | flag FEWER | **0** | **UNENFORCED** — all 13 rows unpinned at once |
| c04 | `STRUCTURAL_CLASS_KEYS.has(key)` | `true` | flag FEWER | **1** (`mustFlag[2]`) | **ENFORCED** (the occurrence half) |
| c05 | the QUERY liveness arm | `if (false && …)` | flag FEWER | **1** (`mustFlag[3]`) | **ENFORCED** |
| c06 | the DECLARATION liveness arm (10 rows) | `if (false && …)` | flag FEWER | **0** | **UNENFORCED** |
| — | constructed §4.1 row for c02 | tip vs row-deleted | — | tip 0 / cut **1** | the fix, proven |

### `css-var-defined` (occurrence arms + five real-tree-guarded arms)

| # | Fence / arm | Cut | Rows died | Class |
| - | - | - | -: | - |
| v01 | `checkRealTreeVendor` (3 tripwires + 2 vocabulary arms) | `throw` below the guard | **0** | **UNREACHED** by every committed row |
| v02 | `checkRealTreeRuntime` (4 producer arms) | `throw` below the guard | **0** | **UNREACHED** |
| v03 | POSITIVE CONTROL | `throw` at `run()` entry | **8 of 8** | CONTROL OK |
| v04 | `checkPopulations` — definitions / references / classRoots | drop all three from the table | **0** | **UNENFORCED** (only `source files` is pinned, by `mustFlag[3]`) |

### `css-family-ownership` (at `0e03cee19`; 3-level harness patching gate → `css-family-policy` → `css-family-census`)

| # | Fence / arm | Cut | Rows died | Class |
| - | - | - | -: | - |
| f00 | identity control | (no change) | 0 | CONTROL OK |
| f01 | the surviving parity arm | `203` → `204` | **1** (clean `mustPass`) | **ENFORCED** |
| f02 | `zero-declarations` blindness | `throw` in the branch | **0** | **UNREACHED** |
| f03 | `zero-theme-values` blindness | `throw` in the branch | **0** | **UNREACHED** |
| f04 | `fullHomeSet` fence in `reportExactCensus` | delete the guard | **0** | **UNENFORCED** (post-retirement, near-dead decoration) |
| f05 | POSITIVE CONTROL | `throw` at `reportCensusHealth` | **49 of 49** | CONTROL OK |
| f06 | the `complete` fence on the parity arm | drop `complete &&` | **47** | **ENFORCED** |
| f07 | `reportClosedSeamDrift` (7 count ratchets) | `throw` below its guard | **0** | **UNREACHED** |
| f08 | `EXPECTED_RUNTIME_WRITERS.fade` | `12` → `13` | **0** | **UNENFORCED** |
| f09 | `reportDensityArmCompleteness` `rel !== TIERS` | delete the guard | **3** | **ENFORCED** |
| f10 | the `densityRules.length === 0` acquittal | delete the guard | **3** | **ENFORCED** |

### `sanctioned-css-homes`

| # | Fence | Cut | Rows died | Class |
| - | - | - | -: | - |
| s01 | `GENERATED_DIRS` (dist / node_modules) | walk them anyway | **1** | **ENFORCED** |
| s02 | the `package.json` ANCHOR guard | delete it | **6** | **ENFORCED** |
| s03 | `SANCTIONED_PATHS.has(rel)` | `false` (allow all) | **4** | **ENFORCED** |

### `playwright-css-topology`

| # | Fence / arm | Cut | Rows died | Class |
| - | - | - | -: | - |
| p01 | the `existsSync(MAIN)` early return | delete it | **1** | **ENFORCED** |
| p02 | `resolveCssImport`'s `tailwindcss` skip | delete it | **0** | see p05 — the unresolved path is inert |
| p03 | the zero-sources blindness arm | `if (false)` | **1** (`mustFlag[2]`, count 3→2) | **ENFORCED** |
| p04 | `validateCtConfig`'s 4-clause fence | `if (false)` | **0** | **UNENFORCED** (falsifier: a fixture with the plugins swapped) |
| p05 | is `!unresolved:` ever pushed into `graph.files`? | `throw` on that prefix at the push | **0** | **STRUCTURALLY DEAD ARM** |
| p06 | POSITIVE CONTROL | `throw` at every push | **5** | CONTROL OK |

### `seed-theme-ink-contrast`

| # | Fence | Cut | Rows died | Class |
| - | - | - | -: | - |
| k01 | the `realTree` guard | `true` | **4** | **ENFORCED** |
| k02 | `DECORATIVE_STROKE_CARRIERS` lookup | `false` (exempt nothing) | **1** | **ENFORCED** (but CONFOUNDED — the row dies with blindness findings, not contrast findings) |
| k03 | same, opened the other way | `true` (exempt everything) | **4** | **ENFORCED** |

### `css-selector-has-a-writer`

| # | Fence / arm | Cut | Rows died | Class |
| - | - | - | -: | - |
| w01 | the literal Streamdown chunk path | point it at a nonexistent chunk | **2** | **ENFORCED** (and this is the rot receipt — a vendor bump reds it) |
| w02 | `isVendorHook` | `return false` | **1** | **ENFORCED** |
| w03 | the `selector-population:0` blindness arm | `if (false)` | **1** | **ENFORCED** |
| w04 | the `baseUiManifestOnly` arm | iterate `[]` | **0** | **UNENFORCED** |
| w05 | the `baseUiInstalledOnly` arm | iterate `[]` | **0** | **UNENFORCED** |

### `tokens-contract`

| # | Fence | Cut | Rows died | Class |
| - | - | - | -: | - |
| t01 | the real-tree `historyRoot` conditional | force `undefined` | **0** | **UNENFORCED** (the removal ratchet is proven by nothing) |

### Marker census (criterion 5, all eight, one invocation with its own positive control)

Anchored marker-form predicate (`^\s*(//|/\*|\{/\*|/\*\*)\s*<opener>`, guide §7) over `git ls-files`
`packages`/`tests`/`tooling`/`scripts`/`playwright`, `.ts|.tsx|.css|.js|.jsx`:

```
scannedFiles: 7725
@orb-gate-ignore <gate> | @orb-waive <gate>, for all EIGHT gates: 0
POSITIVE CONTROL — any @orb-waive marker-form on the tree: 1196
```

**Zero live markers for all eight.** The conversions owe no marker translation; each header's marker-census
line is `0 (measured <date>, N=7725, control 1196)`.

---

## LANE 2 / LANE 3 BRIEF DELTAS

What the rows do not yet say and the briefs must.

1. **The `-health` split is not optional for five of the eight, and the reason is AUTHORITY, not severity.**
   `css-var-defined`, `css-length-tokens`, `css-family-ownership`, `css-selector-has-a-writer` and
   `playwright-css-topology` each mix an ORDINARY-doorable occurrence arm with `GATE_SELF`-anchored liveness/
   blindness arms that are `hard` by construction (line 0/1, synthetic or absent token → `locateFinding`
   cannot bind). Brief the split up front with the identical `family` string; a lane that discovers it at
   `report.node` throw time rewrites its whole proof set.
2. **`cssFamilyFinding` sets `column: 1` unconditionally** (`lib/css-family-census.ts`), and its `token` is
   a synthetic composite (`class:x`, `data-x="y"`, `<selector> { <prop>: <value> }`). Under this contract
   that is §3's class 2 in every arm of modules 2 and 3. **Every finding that survives as `ordinary` must be
   re-anchored on an authored slice at its real column**, through `lib/caught-failure.ts`'s
   `anchorWithin`/`firstAnchor` (the repo's one waiver-anchor contract) — never a hand-rolled coordinate.
   Base rate for this migration obligation is 9/9; expect it, do not report it as a defect against the
   legacy author.
3. **Name the resource declarations in the brief, with the receipt that they already exist**, so no lane
   re-derives them: `product-css` (modules 1, 2, 3, 4, 6), `vendor-css-surface` (1, 2 — its own contract
   header names both), `token-contract` (7), `authored-tree:packages` (8), `exact-file` ×6 (5 — all six ids
   already exist and `contract/resource-exact.ts` names the gate). **Nothing in this family needs a new
   kind.**
4. **Five of the eight are declared HYBRIDS** (1, 2, 3, 4, 6 — a resource half plus a compiler population
   for the static-class walk). Brief §12.4's "a hybrid's dual role is explicit and receipted" and require
   the header to state BOTH populations. Do not let a lane write `population: { of: "none" }` and then read
   `ctx.files`.
5. **The statement-at-rule gap is BUILD work and it blocks module 5** (see (d)). Lane 3 must build
   `ParsedCssStylesheet.statements` in `lib/css-rules.ts` and surface it on `CssFacts` BEFORE converting
   `playwright-css-topology`, with a planted control both ways (an `@import` inside a comment must NOT
   appear; the `@media` block at-rule must keep appearing). Five importers today, so no reopening is
   required. Deleting the gate's own regex walk also closes its dead `unresolved` arm.
6. **Every §4.1 cut in this family must be re-run in the TRIPWIRE direction for the liveness arms** — three
   of the four clean cells I found were read as clean by earlier probes for exactly the reason guide §4.1
   names. And the guarded arms need the anchor PLANTED in the fixture, or the cut measures nothing:
   `css-length-tokens` `REAL_TREE_ANCHOR`, `css-var-defined`/`seed-theme-ink-contrast` the gate's own source
   path in `ctx.files`, `css-family-ownership` `package.json`, `tokens-contract` `ctx.root === REPO_ROOT`.
7. **A `mustFlag` row whose fixture plants a real-tree anchor yields MANY findings; it owes a `count`.**
   `css-length-tokens` `mustFlag[3]` is the worked failure: 18 findings, `expect: { token }` only, and the
   13 rows #2181 landed are asserted by nothing. Under the final contract §4.1's `expect` rules make this a
   RED proof, so the conversion must supply `count` — and where the count is driven by a module-level table
   the fixture cannot control, `expect: { countFrom: "STRUCTURAL_CLASS_CANDIDATES" }` is the declared
   exemption (§4.1, #2001), which needs `token`/`line`/`messageIncludes` beside it.
8. **The retirement is not finished:** seven hand-spelled count ratchets survive in
   `lib/css-family-census.ts` (`EXPECTED_RUNTIME_WRITERS`, `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`) plus
   `EXPECTED_DIRECT_THEME_DECLARATIONS`. §12.5 bans a count ratchet and
   `exception-authority-census.md:178` disposes only the declaration counts. Whichever lane takes module 3
   must either retire or DERIVE all eight — and (a) shows 203 derives for free.
9. **Copy targets, stated per module** (they are in the per-module verdicts above):
   `no-raw-color-in-css` for modules 3 and 6's resource half; `motion-token-purity` for module 4's shell
   half; `ui-exports-map-complete` (post-`be4cdebcd`, via `resource-policy-contract.md`) for modules 5 and
   7; `server-layout` for module 8; **none — new shape** for modules 1 and 2. And the PROOF shape to copy
   inside this family is **`sanctioned-css-homes`'s** — six `mustFlag` rows, three enforced fences, an
   explicit stale arm with an exact count.
10. **`lib/ast-read.ts` reaches this family through `lib/css-selector-writers.ts`.**
    `shared-semantic-readers.md:33` calls it *"not the new fact boundary"* (26 gate importers). Module 2's
    brief must say so, or the lane will PRESERVE the reader the program exists to delete.
11. **Fix the tools as we find them lying, same era** (owner, 2026-08-22): `playwright-css-topology`'s
    `unresolved` arm prints a clean `unresolved=none` it can never contradict. That is a false clean in a
    live gate and gets a row + a committed pin, not a note in a conversion.

---

## WHAT I RAN

Everything below ran in this session, in this worktree, at `0e03cee19` unless stated. No whole-tree run:
per the orchestrator's box-schedule message I held `check:policy-conformance` and never started it, and I
ran no `check:structure`, no `pnpm verify`, no CT/e2e, and no planting suite.

- `git rebase main` twice (`686853320`, then `0e03cee19` after the premise update); `git status --short`
  empty at every checkpoint and at the end.
- **Baseline proof runs, all eight modules, both trees** (`verifyGateProofs([gate])` per module):
  `0e03cee19` → `css-var-defined 4+4` · `css-selector-has-a-writer 9+5` · `css-family-ownership 35+14` ·
  `css-length-tokens 5+2` · `playwright-css-topology 4+3` · `seed-theme-ink-contrast 5+4` ·
  `tokens-contract 1+1` · `sanctioned-css-homes 6+3` — **0 failures each**. At `686853320`,
  `css-family-ownership` was `38+14`, which is the independent re-derivation of `0e03cee19`'s
  three-deleted-rows claim.
- **31 cuts / probes** across three scratch harnesses (2-level, 3-level for the census chain, and a general
  1-hop lib patcher), each with an exactly-once anchor assertion and `finally` cleanup, one scratch module
  per cut with a serial in the name. Full results in the CUT MATRIX; **four positive controls fired**
  (v03 8/8, f05 49/49, p06 5, and the c02 constructed row 0→1).
- **The constructed §4.1 row** for `css-length-tokens`' markdown `(file, candidate)` row: green at tip, red
  under the row's deletion.
- **The 203 derivation**: `packages/ui/tokens.build.ts#generateArtifacts()` run in-process (it writes
  nothing unless it is the process entrypoint), `@theme` declarations counted from the emitted string,
  compared against `readCensus` and against the committed `theme.css` bytes.
- **The word-count re-measurement**: `git show 0e03cee19^:tooling/src/verify/lib/css-family-census.ts` into
  the scratchpad, comment prose sliced between the two `export const` anchors, normalised and diffed
  word-by-word against the doc's moved bullets.
- **The marker census**: anchored marker-form predicate over 7,725 tracked source files with a 1,196-hit
  positive control in the same invocation.
- **The statement-at-rule probe**: `parseCssStylesheet` driven on a five-line sheet with a block-at-rule
  positive control.
- **Reads in full**: `.claude/agent-doctrine.md` · `gate-runtime-read-first.md` ·
  `gate-runtime-standardization.md` §3, §4 (all), §5b, §7, §12.3, §12.4, §12.5 ·
  `resource-policy-contract.md` · `.claude/rules/gates-and-tooling.md` · all eight gate modules ·
  `no-raw-color-in-css.ts` · `motion-token-purity.ts` · `lib/css-rules.ts` · `lib/css-resource-facts.ts` ·
  `lib/css-family-census.ts` · `lib/css-family-policy.ts` (census half) · `lib/css-family-proof-fixtures.ts` ·
  `lib/css-selector-writer-policy.ts` · `lib/sanctioned-css-homes.ts` · `contract/css-family.ts` ·
  `contract/resource-css.ts` · `contract/resource-host.ts` · `contract/resource-declaration.ts` (kinds) ·
  `contract/resource-artifact.ts` · `contract/resource-exact.ts` · `contract/resource-vendor.ts` ·
  `ops/resource-tree.ts` · `ops/conformance.ts` · `packages/ui/tokens.build.ts` (emitter half).

---

## LEDGER ROWS (18 rows)

| # | Module / file | Defect | Evidence | Class | State |
| -: | - | - | - | - | - |
| 1 | `gates/css-length-tokens.ts` — the 13 `STRUCTURAL_CLASS_CANDIDATES` rows (#2181, `e7e3f083b`) | The replacement for `STRUCTURAL_CLASS_FILES` is pinned by NO committed proof row. Deleting one row kills nothing; killing the whole class-liveness arm kills nothing | cuts c02 (0 died), c03 (0 died); constructed `mustPass` on `packages/ui/src/markdown/markdown.tsx` is green at tip and RED under the deletion | §4.1 UNENFORCED | OPEN |
| 2 | `gates/css-length-tokens.ts` — the 10 `STRUCTURAL_DECLARATIONS` liveness rows (#2101) | Same shape one table over: the declaration-liveness arm can be deleted whole with no row dying | cut c06 (0 died); the occurrence half IS enforced (c04) and the query half IS enforced (c05) | §4.1 UNENFORCED | OPEN |
| 3 | `gates/css-length-tokens.ts` — `mustFlag[3]` | The only row that reaches the real-tree-guarded arms yields **18** findings and asserts `{ token }` only — no `count`. Its own `why` states the cardinality is deliberately not restated, which documents the gap rather than closing it | 18 findings measured at tip; legacy `matchesExpect` matches `token` with `.some()` (`ops/conformance.ts:163`) | §4.1 expect | OPEN |
| 4 | `gates/css-var-defined.ts` — `checkRealTreeVendor` (#2181, `9e29a921c`) | The three replacement blindness tripwires AND both reviewed-vendor-vocabulary arms are reached by ZERO committed proof rows. The header's cut table is a real-tree PROBE receipt, which the tooling rule rules is not the deliverable | throw probe v01: 0 rows die; positive control v03: 8 of 8 | #1990 dead-arm | OPEN |
| 5 | `gates/css-var-defined.ts` — `checkRealTreeRuntime` | All four runtime-producer arms (runtime-use vocabulary, unreviewed writer, stale producer row) reached by zero committed rows | throw probe v02: 0 rows die; control v03 | #1990 dead-arm | OPEN |
| 6 | `gates/css-var-defined.ts` — `checkPopulations` | Three of four blindness tripwires (`custom-property definitions`, `custom-property references`, `static class roots`) unpinned; only `source files` has a row | cut v04: dropping all three kills nothing | §4.1 UNENFORCED | OPEN |
| 7 | `gates/css-var-defined.ts` — the descriptor `fix` | *"define it in the six-home topology, add an explicit var() fallback, or use a proved Base UI runtime property"* is untrue of five arms (version mismatch, stale vendor row, unreviewed writer, stale producer, blindness) | read at the descriptor; each arm passes its own `message` but shares the one `fix` | §5b.2 | OPEN |
| 8 | `gates/css-family-ownership.ts` / `lib/css-family-policy.ts` — `zero-declarations` | The blindness arm `0e03cee19`'s "retirement costs nothing in instrument health" rests on is reached by ZERO committed rows. The commit's receipt inverts the arm's polarity on the real tree, which measures something else | throw probe f02: 0 rows die; positive control f05: 49 of 49 | #1990 dead-arm | OPEN |
| 9 | `lib/css-family-policy.ts` — `zero-theme-values` | Same: reached by zero committed rows | throw probe f03: 0 rows die | #1990 dead-arm | OPEN |
| 10 | `lib/css-family-policy.ts` — `fullHomeSet` fence in `reportExactCensus` | Unenforced, and post-retirement it guards only `zero-declarations`, so it is now near-dead decoration | cut f04: deleting the guard kills nothing | §4.1 UNENFORCED | OPEN |
| 11 | `lib/css-family-census.ts` — `EXPECTED_RUNTIME_WRITERS` (4 keys, `fade: 12` a bare literal) + `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` (3 keys) | SEVEN hand-spelled count ratchets survive `0e03cee19`'s retirement in the same file, compared exactly in `reportClosedSeamDrift`. §12.5 bans a count ratchet; `exception-authority-census.md:178` disposes only the DECLARATION counts and is silent on these | throw probe f07: `reportClosedSeamDrift` reached by 0 rows; cut f08: `fade: 12→13` kills nothing | §12.5 residual | OPEN |
| 12 | `lib/css-family-census.ts:79` — `EXPECTED_DIRECT_THEME_DECLARATIONS = 203` | Presented as "generated-output parity" and escalated as such. It is DERIVABLE: `tokens.build.ts#renderThemeCss` emits exactly one line per `placement === "theme"` entry of `flat`, measured at 203, and the committed `theme.css` is byte-identical to the generator's output. A hand-copied literal presented as parity | measured: generator 203 · gate reader 203 · constant 203 · byte-identical `true` | §12.5 / owner ruling | OPEN — **needs owner** |
| 13 | `gates/css-family-ownership.ts:174,438` + `lib/css-family-census.ts:79` | The #1956 coupled-site hazard survives for `EXPECTED_DIRECT_THEME_DECLARATIONS`: one number spelled in THREE places, deliberately not derived from the manifest so a bump cannot launder its own proof. Dissolves the moment row 12 is derived | read at the three sites; f01 proves both fixture spellings are load-bearing | one-home | OPEN (blocked on 12) |
| 14 | `0e03cee19` commit message + `docs/design/951-css-family-semantic-provenance.md` §7 | "the lift asserted an identical word count on both sides (1919)" is true of the SOURCE and stale-by-two for the DESTINATION (1921). The +2 is exactly the disclosed `below:` → `under client globals.css:` re-spelling; the disclosure did not note that it moved the count | word-level diff over 1919 normalised tokens: exactly one difference | receipt hygiene | OPEN (one-line doc fix) |
| 15 | `gates/playwright-css-topology.ts` — the `unresolved` arm | STRUCTURALLY DEAD. `cssGraph`'s `visit` returns before `files.push(rel)` when `read()` is null, and `!unresolved:<spec>` is never a real path, so `graph.files.filter(startsWith("!unresolved:"))` is always empty. The message can only print `unresolved=none`, and a genuinely unresolvable non-sanctioned `@import` disappears with no finding at all — a false clean in a live gate | throw probe p05 on the push (0 hits with the prefix); positive control p06 (5 pushes reached); code read of `cssGraph` | tool lying — fix same era | OPEN |
| 16 | `gates/playwright-css-topology.ts` — `validateCtConfig` | The whole four-clause fence (extension plugin present, tailwind present, ORDER, `CLIENT_GLOBALS` marker) is unenforced; no fixture plants a wrong order or a missing plugin | cut p04: `if (false)` kills nothing | §4.1 UNENFORCED | OPEN |
| 17 | `gates/css-selector-has-a-writer.ts` / `lib/css-selector-writer-policy.ts` | Both Base UI reconciliation arms (`baseUiManifestOnly`, `baseUiInstalledOnly`) unenforced — the same two-sided class the Streamdown pair pins correctly on the other vendor | cuts w04, w05: iterating `[]` kills nothing | §4.1 UNENFORCED | OPEN |
| 18 | `gates/tokens-contract.ts` | The real-tree history-ratchet conditional (`historyRoot`) is unenforced, so the git-removal half of a seven-document contract is proven by nothing — in a gate carrying exactly ONE `mustFlag` and ONE `mustPass` | cut t01: forcing `historyRoot = undefined` kills nothing | §4.1 UNENFORCED | OPEN |

**N asserted: 18 rows.**

---

## WHAT I DID NOT COVER

- **The planter.** `gate-conformance.repo.int` is orchestrator-run and I did not run it. Every proof-row
  result above comes from driving `verifyGateProofs` directly on ONE module at a time, which is the same
  code path the planter uses for these descriptors but without the shared `__g_` working-tree fixtures.
  Anything the planter's tree-planting half would surface is outside my measurement.
- **No whole-tree run.** `pnpm check:policy-conformance` was budgeted and then HELD by the orchestrator's
  box-schedule message; `check:structure`, `pnpm verify`, CT and e2e were never in scope. I therefore have
  **no real-tree finding counts** for any of the eight, and no differential (§4.6) for the two #2181
  commits — my (b) verdict is about PROOF-ROW enforcement only, not about catch parity.
- **`css-family-ownership`'s non-census arms are only partially cut.** I cut 5 of its ~15 narrowings
  (the parity arm, the `complete` fence, the `fullHomeSet` fence, and both density-arm guards). The shell-root
  grammar, the UI dependency-direction arm, `reportGeneratedWriters`, `reportClientComponentSkins`,
  `reportAuthoredLayers`, the keyframe/fade regexes and `hasClientMechanismCarrier` are UNCUT. Its 35+14 rows
  are dense and I expect most of them are enforced, but that is an expectation, not a measurement.
- **`lib/css-family-selector-provenance.ts`'s importer count** reads 0 in my `lib/<name>.ts` grep because
  intra-`lib/` imports use a bare `./` specifier. It is imported by `lib/css-resource-facts.ts` and
  `lib/css-family-policy.ts` at minimum; treat every "singleton" verdict above as a claim about GATE
  importers, which is what the family rule asks, and re-derive intra-lib fan-out before deleting anything.
- **The `authored-css` vs `product-css` choice for module 4's class half** — I did not measure whether
  `css-length-tokens`' `scanRoot` (`packages/{client,ui}/src/`) is byte-equal to the `@client`+`@ui`
  population; §3's population-port rule owes a set diff in both directions and that is the conversion
  lane's receipt, not mine.
- **No vitest at all, so #2229 never reached my results.** The orchestrator flagged that
  `tests/tooling/verify/ops/eslint.int.test.ts` does not parse at `0e03cee19` and makes any scoped run whose
  typecheck project sees it exit 1 with every test green. I ran zero `pnpm test:scoped` / `test:tooling`
  invocations — every measurement above is a direct in-process `verifyGateProofs` / module drive under
  `pnpm exec node`, whose exit code is its own — so no verdict here is contaminated by it. The corollary is
  that **I also ran none of the family tests** under `tests/tooling/verify/gates/**` for these eight
  modules; a `runPolicyPass`-shaped pin living in such a file (there is none for a LEGACY descriptor, but
  the conversions will owe them) is outside what I measured.
- **Nothing rendered.** This family has no user-visible surface; a `side-eye` pass is not owed.
