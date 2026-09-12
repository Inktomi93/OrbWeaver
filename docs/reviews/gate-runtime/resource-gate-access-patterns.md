---
kind: review
status: active
updated: 2026-09-05
---

# Resource-gate access patterns for the shared ResourceHost

## Verdict

The current corpus contains **255** top-level `tooling/src/verify/gates/*.ts` modules and exactly **53** descriptors spelling `fsBacked: true`. The design count is correct. Of those 53, 50 are `whole-project`; only `baseui-derives-not-respells`, `baseui-state-data-attributes`, and `no-manual-memo` claim `incremental-safe`. The set is not one homogeneous “filesystem gate” class:

- 29 are resource-only directory/file/config/artifact reconciliations;
- 24 are hybrids that combine AST/types or shared-walk facts with one or more disk resources;
- four config-grant gates depend on a **tracked Git inventory**, not an ambient filesystem walk;
- one gate (`tsconfig-routing-parity`) executes an external compiler and is a distinct cost/tier class;
- two gates still create a private ts-morph `Project` solely to parse gate descriptor source (`dangling-refs`, `enforcement-registry-parity`).

The minimal final host is therefore a set of typed resource facts, not `readFile(path)` plus `glob(root)`. A raw file/glob escape hatch would preserve the current ability for each gate to invent its own corpus, parser, empty behavior, fixture requirements, and receipts.

## Census receipts and closed manifest

Commands run from the assigned worktree at its current HEAD:

```text
$ find tooling/src/verify/gates -maxdepth 1 -type f -name '*.ts' -printf '%f\n' | sort | wc -l
255

$ rg -l 'fsBacked\s*:\s*true' tooling/src/verify/gates --glob '*.ts' | sort | wc -l
53
```

The second scan covered the complete 255-file top-level descriptor corpus. A literal cross-check (`rg -n 'fsBacked:\s*true'` over the resulting paths) produced one descriptor occurrence in every file below and no additional file. The exact 53-name manifest is:

| Gate | Descriptor receipt | Kind | Current execution |
| - | - | - | - |
| `baseline-single-migration` | `tooling/src/verify/gates/baseline-single-migration.ts:81` | resource-only | whole |
| `baseui-anatomy-completeness` | `tooling/src/verify/gates/baseui-anatomy-completeness.ts:113` | hybrid AST + manifest | whole |
| `baseui-derives-not-respells` | `tooling/src/verify/gates/baseui-derives-not-respells.ts:275` | hybrid AST + manifest | selected files |
| `baseui-state-data-attributes` | `tooling/src/verify/gates/baseui-state-data-attributes.ts:177` | hybrid AST + manifest | selected files |
| `baseui-surface-manifest` | `tooling/src/verify/gates/baseui-surface-manifest.ts:185` | resource-only installed types + manifest | whole |
| `biome-grant-liveness` | `tooling/src/verify/gates/biome-grant-liveness.ts:360` | resource-only config + Git inventory | whole |
| `client-structure` | `tooling/src/verify/gates/client-structure.ts:277` | resource-only tree + TSX text | whole |
| `component-size-ui` | `tooling/src/verify/gates/component-size-ui.ts:69` | resource-only tree/text | whole |
| `component-size` | `tooling/src/verify/gates/component-size.ts:70` | resource-only tree/text | whole |
| `css-family-ownership` | `tooling/src/verify/gates/css-family-ownership.ts:18` | hybrid AST + CSS | whole |
| `css-length-tokens` | `tooling/src/verify/gates/css-length-tokens.ts:310` | hybrid AST + CSS | whole |
| `css-selector-has-a-writer` | `tooling/src/verify/gates/css-selector-has-a-writer.ts:20` | hybrid AST + CSS/vendor | whole |
| `css-var-defined` | `tooling/src/verify/gates/css-var-defined.ts:202` | hybrid AST + CSS/vendor docs/types | whole |
| `d-citation-integrity` | `tooling/src/verify/gates/d-citation-integrity.ts:115` | hybrid project text + Markdown registry | whole |
| `dangling-doc-cite` | `tooling/src/verify/gates/dangling-doc-cite.ts:241` | hybrid comments + path inventory | whole |
| `dangling-refs` | `tooling/src/verify/gates/dangling-refs.ts:918` | hybrid AST + docs/catalog/Git | whole |
| `db-structure` | `tooling/src/verify/gates/db-structure.ts:168` | hybrid AST + directory liveness | whole |
| `density-tier` | `tooling/src/verify/gates/density-tier.ts:366` | hybrid JSX + CSS + baseline | whole |
| `depcruise-grant-liveness` | `tooling/src/verify/gates/depcruise-grant-liveness.ts:289` | resource-only static config + Git inventory | whole |
| `devtools-frontend-assets` | `tooling/src/verify/gates/devtools-frontend-assets.ts:81` | resource-only generated closure | whole |
| `enforcement-registry-parity` | `tooling/src/verify/gates/enforcement-registry-parity.ts:337` | resource-only TS descriptors + Markdown | whole |
| `eslint-grant-liveness` | `tooling/src/verify/gates/eslint-grant-liveness.ts:223` | resource-only static config + Git inventory | whole |
| `feature-owns-definition` | `tooling/src/verify/gates/feature-owns-definition.ts:40` | resource-only directory liveness | whole |
| `feature-structure` | `tooling/src/verify/gates/feature-structure.ts:200` | resource-only directory tree | whole |
| `gate-ignore-inventory` | `tooling/src/verify/gates/gate-ignore-inventory.ts:107` | hybrid marker facts + gate-dir inventory | whole |
| `gate-modernization` | `tooling/src/verify/gates/gate-modernization.ts:390` | hybrid AST + cited Markdown/baselines | whole |
| `integer-line-boxes` | `tooling/src/verify/gates/integer-line-boxes.ts:409` | hybrid static classes + JSON/CSS | whole |
| `motion-token-purity` | `tooling/src/verify/gates/motion-token-purity.ts:129` | resource-only CSS glob/text | whole |
| `no-manual-memo` | `tooling/src/verify/gates/no-manual-memo.ts:107` | hybrid AST + installed compiler text | selected files |
| `no-nul-bytes-in-source` | `tooling/src/verify/gates/no-nul-bytes-in-source.ts:90` | resource-only byte corpus | whole |
| `no-raw-color-in-css` | `tooling/src/verify/gates/no-raw-color-in-css.ts:93` | resource-only CSS glob/text | whole |
| `no-raw-z-index` | `tooling/src/verify/gates/no-raw-z-index.ts:76` | hybrid AST + token JSON | whole |
| `over-art-plate-arm` | `tooling/src/verify/gates/over-art-plate-arm.ts:130` | resource-only CSS + baseline | whole |
| `package-layout` | `tooling/src/verify/gates/package-layout.ts:39` | resource-only directory liveness | whole |
| `pd-citation-integrity` | `tooling/src/verify/gates/pd-citation-integrity.ts:100` | hybrid project text + Markdown registries | whole |
| `playwright-css-topology` | `tooling/src/verify/gates/playwright-css-topology.ts:198` | resource-only TS/CSS config graph | whole |
| `ratchet-row-integrity` | `tooling/src/verify/gates/ratchet-row-integrity.ts:81` | resource-only baseline JSON | whole |
| `rest-transform-grid` | `tooling/src/verify/gates/rest-transform-grid.ts:377` | hybrid static classes + CSS | whole |
| `runner-config-path-liveness` | `tooling/src/verify/gates/runner-config-path-liveness.ts:170` | resource-only static runner configs | whole |
| `sanctioned-css-homes` | `tooling/src/verify/gates/sanctioned-css-homes.ts:51` | resource-only CSS path inventory | whole |
| `seed-theme-ink-contrast` | `tooling/src/verify/gates/seed-theme-ink-contrast.ts:238` | hybrid static classes + theme CSS | whole |
| `server-layout` | `tooling/src/verify/gates/server-layout.ts:52` | resource-only directory liveness | whole |
| `test-layout` | `tooling/src/verify/gates/test-layout.ts:151` | resource-only test tree + mirror liveness | whole |
| `test-presence-client` | `tooling/src/verify/gates/test-presence-client.ts:281` | hybrid AST + mirror text/tree | whole |
| `test-presence` | `tooling/src/verify/gates/test-presence.ts:465` | hybrid AST + mirror liveness + baseline | whole |
| `tokens-contract` | `tooling/src/verify/gates/tokens-contract.ts:49` | resource-only canonical token bundle | whole |
| `tooling-instrument-proof` | `tooling/src/verify/gates/tooling-instrument-proof.ts:239` | hybrid AST + directory liveness | whole |
| `tooling-slot-template` | `tooling/src/verify/gates/tooling-slot-template.ts:157` | resource-only directory tree | whole |
| `tsconfig-entry-liveness` | `tooling/src/verify/gates/tsconfig-entry-liveness.ts:321` | resource-only JSONC + Git inventory | whole |
| `tsconfig-routing-parity` | `tooling/src/verify/gates/tsconfig-routing-parity.ts:146` | resource-only compiler subprocess + static routing | whole |
| `ui-exports-map-complete` | `tooling/src/verify/gates/ui-exports-map-complete.ts:166` | resource-only directory tree + package metadata | whole |
| `ui-primitive-structure` | `tooling/src/verify/gates/ui-primitive-structure.ts:535` | hybrid AST + directory/mirror liveness | whole |
| `verify-registry-parity` | `tooling/src/verify/gates/verify-registry-parity.ts:126` | resource-only package metadata + static registry | whole |

## Shared resource computations and minimal typed host capabilities

### 1. Authored tree and exact-resource liveness

Required host surface:

```ts
interface ResourceHost {
  authoredTree(id: AuthoredTreeId): ResourceFact<readonly TreeEntry[]>;
  exactFiles<I extends ExactResourceId>(ids: readonly I[]): ResourceFact<ReadonlyMap<I, ExactFile>>;
  mirrorIndex(id: MirrorFamilyId): ResourceFact<MirrorIndex>;
}
```

`AuthoredTreeId` is a closed identity such as `server-domain-tree`, `client-feature-tree`, `ui-primitive-tree`, `tooling-slot-tree`, `test-tree`, `db-migration-tree`, or `product-css-paths`. It is not a root string supplied by a gate. `TreeEntry` must include repo-relative path, kind, byte/line counts when requested, and tracked/authored classification. `ResourceFact` carries `status: ready | missing | empty | unresolved`, members, and a receipt. This one computation replaces the duplicated `existsSync`/`readdirSync`/`statSync` walkers in `baseline-single-migration`, `client-structure`, both component-size gates, `db-structure`, `feature-owns-definition`, `feature-structure`, `gate-ignore-inventory`, `no-nul-bytes-in-source`, `package-layout`, `sanctioned-css-homes`, `server-layout`, `test-layout`, `tooling-instrument-proof`, `tooling-slot-template`, `ui-exports-map-complete`, and `ui-primitive-structure`.

The algorithms that stay in `verify/lib` are the policy classifiers: feature bucket naming, domain template slots, line caps, test/source mirror rules, tooling five-slot rules, primitive trio/anatomy clauses, and migration journal semantics. The host owns only loading, identity, empty/refusal status, and receipts.

### 2. Parsed authored text: JSON, JSONC, static code config, package metadata

Required surface:

```ts
interface ResourceHost {
  json<I extends JsonResourceId>(id: I): ResourceFact<JsonValueFor<I>>;
  jsonc<I extends JsoncResourceId>(id: I): ResourceFact<JsonValueFor<I>>;
  staticConfig<I extends StaticConfigId>(id: I): ResourceFact<StaticConfigFor<I>>;
  packageMetadata<I extends PackageId>(id: I): ResourceFact<PackageMetadata>;
}
```

The current reusable static reader already resolves literals, same-file consts, templates, concatenation, arrays, objects, and spreads and refuses unsupported shapes (`config-static-read.ts:128-175`). Preserve that algorithm and put its file loading/source creation behind `staticConfig`; do not give each config gate source text. It serves `.dependency-cruiser.cjs`, `eslint.config.js`, the three runner configs, and Playwright topology. Strict JSON remains distinct for `biome.json`, migration journal, package manifests, token/baseline ledgers, and catalog data. JSONC plus `extends` folding remains distinct for `tsconfig-entry-liveness`.

Consumers: all five config-liveness gates; `baseline-single-migration`; `dangling-refs` catalog; `density-tier`, `over-art-plate-arm`, and `test-presence` baselines; `no-raw-z-index`; `ratchet-row-integrity`; `tokens-contract`; `ui-exports-map-complete`; `verify-registry-parity`; `playwright-css-topology`.

Missing and parse failure must be separate unresolved/tool-error facts. Today these gates inconsistently return silently, report a policy finding, or throw. The host must never collapse missing/unparseable into `{}`. An empty row population is a refusal for the liveness family, not a clean result.

### 3. Tracked repository inventory

Required surface:

```ts
trackedFiles(): ResourceFact<TrackedFileIndex>;
```

This is one exact `git ls-files -z` computation, shared by `biome-grant-liveness`, `depcruise-grant-liveness`, `eslint-grant-liveness`, and `tsconfig-entry-liveness`. Their existing shared implementation is `grant-liveness.ts:16,167,220,262`. Keep `globMatcher`, exact-vs-pattern classification, and liveness judgment in the shared helper; move subprocess execution, empty/error status, and the member-count receipt into the host. An ambient directory walk is not equivalent: it makes grants depend on installed/build/report debris. These four gates cannot use the ordinary in-memory Project fixture for pattern liveness; their existing dedicated proofs correctly create temporary Git repositories.

### 4. CSS corpus and parsed CSS facts

Required surface:

```ts
productCss(): ResourceFact<ProductCssCorpus>;
cssInventory(request: CssFactRequest): ResourceFact<CssFacts>;
vendorCssSurface(): ResourceFact<VendorCssSurface>;
```

`productCss` is the exact five-home identity already centralized in `contract/css-family.ts`/`SANCTIONED_CSS_HOMES`; arbitrary gates may not add a sixth path. `CssFacts` should expose parsed rules/declarations/selectors/custom-property definitions and references, comment-blanked source positions, and exact source receipts. The Tailwind/static-class side remains in the shared AST reader. `VendorCssSurface` covers the committed Base UI Markdown mirror, installed `CssVars.d.ts` declarations/package version, and Streamdown vendor selector sources.

Consumers divide into genuine computation families:

- five-home ownership/writer family: `css-family-ownership`, `css-selector-has-a-writer`, `css-var-defined`, `playwright-css-topology`, `sanctioned-css-homes`;
- CSS literal/geometry family: `css-length-tokens`, `integer-line-boxes`, `motion-token-purity`, `no-raw-color-in-css`, `rest-transform-grid`;
- appearance family: `density-tier`, `over-art-plate-arm`, `seed-theme-ink-contrast`.

Keep unique policy algorithms in lib: family ownership (`css-family-policy.ts:396`), selector writer reconciliation (`css-selector-writer-policy.ts:126`), custom-property resolution (`css-var-resolution.ts:254,329`), plate mixing (`over-art-plate.ts:270,295`), and contrast math/palette interpretation (`seed-theme-ink.ts:96,191,227-241`). Their loaders and receipts move to the host. `motion-token-purity` and `no-raw-color-in-css` must stop owning `globSync("packages/{ui,client}/src/**/*.css")`; both consume the same authored CSS corpus.

### 5. Markdown/document facts

Required surface:

```ts
documents(): ResourceFact<DocumentIndex>;
ledger<I extends LedgerId>(id: I): ResourceFact<LedgerFactsFor<I>>;
```

`DocumentIndex` owns living-document membership, exact paths, headings/anchors, links, and catalog status; `LedgerId` names `core-path-registry`, `core-audits-debt`, `gate-enforcement-roster`, or a ratchet ledger. Consumers are `d-citation-integrity`, `pd-citation-integrity`, `dangling-doc-cite`, `dangling-refs`, `enforcement-registry-parity`, `gate-modernization`, and `ratchet-row-integrity`. The ordered string evaluator and each policy's token grammar remain algorithms in lib. Filesystem enumeration, Markdown heading/link parsing, catalog JSON loading, and missing/empty receipts become one shared fact.

This family needs a clear refusal split: an absent named registry/document is unresolved; an empty but valid registry is a policy-visible population only when the policy explicitly allows it. `dangling-refs` currently mixes four corpora and exemption tables in one 1,152-line module; conversion should consume shared document/gate-descriptor/symbol facts without moving its four judgments into ResourceHost.

### 6. Base UI installed surface

Required surface:

```ts
baseUiSurface(): ResourceFact<BaseUiSurfaceFacts>;
```

This identity comprises installed `packages/ui/node_modules/@base-ui/react`, its `package.json` and `.d.ts` export/state/CssVars surface, plus committed `baseui-surface.manifest.json`. The existing shared loader is already the correct nucleus: package and manifest identities at `baseui-read.ts:19-25`, installed read at `:114`, state attributes at `:140`, manifest at `:210`, and AST-side bindings/rendered parts at `:218-257`. Remove its module cache/reset door and make it invocation-scoped through the host.

Consumers: `baseui-surface-manifest` (resource-only), `baseui-anatomy-completeness`, `baseui-derives-not-respells`, `baseui-state-data-attributes`, `css-selector-has-a-writer`, and `css-var-defined`. The latter five remain hybrids. Missing package, missing manifest, learned-nothing/truncated type surface, and version disagreement are explicit refusal or policy facts; no consumer may interpret an empty map as “no parts”. These gates cannot be proven with pure in-memory files because the installed package/manifest side is the subject; their resource examples belong in auto-cleaned temp roots.

### 7. Canonical generated/artifact resources

Required surface:

```ts
tokenContract(): ResourceFact<TokenContractTexts>;
devtoolsClosure(): ResourceFact<VerifiedDevToolsAssets>;
installedReactCompiler(): ResourceFact<InstalledCompilerFacts>;
```

These are deliberately narrow. `tokens-contract` reads the canonical token JSON/schema/generated output bundle through `@orb/ui/token-contract`; `devtools-frontend-assets` reads and hashes the exact pin/closure/license tuple under `tooling/src/snap/lib/devtools-frontend`; `no-manual-memo` needs only whether the installed compiler exists and whether its bundled denylist still names `@tanstack/react-virtual`. Preserve `validateTokenContract` and `verifyDevToolsAssetsSync` as their unique validators (`devtools-assets.ts:123,260`); host them behind exact typed resources and publish their internal file/hash counts as resource receipts.

### 8. Compiler-resolved tsconfig membership

Required surface:

```ts
tsconfigPrograms(): ResourceFact<TsconfigProgramMembership>;
```

Only `tsconfig-routing-parity` needs this. It runs installed `tsgo --showConfig -p <config>` once per present program (`tsconfig-routing-parity.ts:48-77`) and compares that compiler truth with `staticPrograms` (`program-routing.ts:137`). This must be lazy, memoized once per invocation, execution=`entire-population`, and tagged with subprocess count, wall time, exit status, and compiler identity. It belongs in the static/full tier, not a selected-file inner loop. A spawn failure or malformed output is a tool error; a missing required program is unresolved. This gate cannot use in-memory fixtures: its subject is compiler-resolved files on disk. Temp roots must include runnable configs, while a real-corpus control may use an overlay only if the compiler host itself sees that overlay; otherwise keep a dedicated temp project.

## Per-gate resource/access and proof notes

The following table records the current access mechanism, scan unit/zero posture, and grant/proof substrate. “Harness files” means the current implicit ts-morph file denominator; it is not a resource receipt.

| Gate(s) | Exact resource/corpus and mechanism | Current scan/zero/refusal | Exemptions and proof substrate | |
| - | - | - | - | - |
| `baseline-single-migration` | migration dir entries, `0000_baseline.sql`, `meta/_journal.json`; fs + strict JSON | no `ctx.scan`; missing migrations dir silently passes; missing baseline/journal reds | launch boolean is a sunset switch, not grant; temp-root proof | |
| Base UI trio + surface manifest | committed surface manifest; installed Base UI types/package; shared AST bindings/renders for trio | harness file counts; explicit missing/blindness arms in surface/anatomy; two selected-file gates still depend on global manifest | dispositions are reviewed rulings with reason; temp roots; AST half can be virtual | |
| config liveness five | exact root config(s), statically extracted rows, and tracked-file inventory for biome/eslint/depcruise/tsconfig | explicit `ctx.scan` of config rows; absent, unparseable, unreadable, no rows, and tracked-corpus empty refuse/report | exact and pattern grants plus two-sided stale/dead-cite checks; dedicated temp roots, four with temp Git repos | |
| `client-structure` | client feature tree + server domain names; recursive fs and raw TSX outer-container text | no resource scan; absent feature root passes | reserved names/buckets are policy sets; temp tree | |
| component-size pair | recursive client/ui source trees and raw line counts | no resource scan; absent root passes | skip classes are corpus policy; temp tree/live overlay | |
| CSS ownership/writer/var | exact five CSS homes + TS/TSX writer/class facts + installed vendor sources | family/writer use helper-owned accumulators; var emits detailed resource scan and explicit zero populations | expected census/vendor sets are ratchets; temp roots; canonical real-tree controls are unfixturable | |
| CSS literal/geometry gates | authored CSS corpus or exact shell/theme/tokens plus static class facts | length/integer/rest declare custom member scans and anchor-guard zeros; motion/raw-color have no custom scan | baseline/allow tables are two-sided where present; CSS temp roots, AST classes virtual or overlay | |
| `d-citation-integrity`, `pd-citation-integrity` | exact Markdown registries + project source/core-doc text | no resource scan; missing registry degrades to empty and can mass-red/silently distort, so host must refuse | reserved D range is registry data; no site grant; temp root with registry + sources | |
| `dangling-doc-cite` | TS comments from shared AST plus recursive root/package/public file inventories and exact doc liveness | `ctx.scan` counts commented files; blind under minimum real corpus; missing targets are findings | two-sided allow table; virtual source + temp document tree | |
| `dangling-refs` | gate descriptors, living doc/catalog corpus, core Markdown backticks, source symbol index, `.gitignore`, exemption cites | several arm-specific custom scans/blindness checks; private Project for gate descriptor source | four two-sided exemption tables; temp root; real-corpus controls need overlay/index support | |
| `db-structure` | db schema dir membership plus AST barrel exports and domain names | harness counts; missing schema dir returns | reserved cross-cutting/domain mappings are two-sided grants | temp tree + virtual AST |
| `density-tier` | `tiers.css`, JSX class/slot facts, baseline JSON | custom admitted counts; anchor-guarded empty tier map/populations | shrink-only baseline; temp CSS + virtual AST | |
| `devtools-frontend-assets` | exact pin, inspector closure, license, hashes and installed browser tuple | validator-derived proof; missing/stale/hash mismatch reports | no grant; exact temp closure; live tree unfixturable | |
| `enforcement-registry-parity` | all top-level gate TS descriptors parsed in a private Project + enforcement Markdown/all core docs | no resource scan; explicit mirror-reader population floor | no grant; temp tree; canonical roster live fixture intentionally retired | |
| feature/layout/template gates | named directory trees and exact required entries | no custom scan; many absent roots currently pass; stale-table arms use real anchors | policy vocabularies and exact two-sided rows stay in gate/lib; temp trees or overlays | |
| `gate-ignore-inventory` | gate directory names + centrally collected marker consumption facts | no custom scan; explicit no-gates blindness | central ordinary marker reconciliation; current live-tree grammar suite requires virtual overlay | |
| `gate-modernization` | gate AST, cited Markdown headings, baseline JSON liveness | harness counts; real-anchor guards doc/baseline health | detects exemption vocabularies lacking stale arm; temp resources + virtual gate AST | |
| `no-manual-memo` | selected source AST + exact installed React compiler bundle fact | incremental AST denominator; compiler absence/delist behavior is anchor-guarded | no site grant for compiler fact; virtual AST plus injected installed fact | |
| `no-nul-bytes-in-source` | recursively enumerated authored text extensions, raw bytes | `ctx.scan` counts files; empty tree currently becomes zero alarm only via central denominator | no grant; temp tree; cannot use text-only in-memory fixture because NUL bytes are subject | |
| `no-raw-z-index` | AST class values + exact `tokens.json` z keys | harness AST count; unresolved token home reported through sanctioned-home helper | sanctioned homes are exact reviewed grants with liveness; virtual AST + temp JSON | |
| `over-art-plate-arm` | authored client/ui CSS and baseline JSON | `scanRoot: false`; helper returns stylesheet/site counts via custom scan; anchor guards baseline reconciliation | shrink-only baseline; temp CSS; shared live fixture with CSS class/source control | |
| `playwright-css-topology` | exact main/app-shell/CSS entry/CT boot/config/extension and five-home set; static TS and CSS import/source parsing | custom graph scan; missing/unreadable exact nodes red | no grant; exact temp root; live canonical paths unfixturable | |
| `ratchet-row-integrity` | every `*.baseline.json` under gate dir | custom ledger count; zero ledgers reds only on real anchor | row classes/cites are data under shared ratchet helper | temp root; live `__g_` baseline becomes temp ledger |
| `seed-theme-ink-contrast` | exact theme.css seed palettes + static class ink/ground candidates | `ctx.scan` ink×ground×seed pairs; anchor-guarded zero palette/ink and unresolved colors | decorative-stroke table two-sided | temp CSS + virtual AST/overlay |
| `test-presence-client`, `test-presence`, `test-layout` | package source/test mirror trees; AST callable/store/action/schema facts; mirror file text; one baseline | presence emits admitted counts, client/layout rely on harness; real anchors guard whole-tree/stale arms | shape exemptions plus shrink-only baseline | temp mirror trees + virtual AST; real-corpus stale controls use overlay |
| `tokens-contract` | exact canonical token vault/schema/generated texts; strict JSON plus validator | token count via `ctx.scan`; missing/invalid handled by validator | no grant; exact temp-root bundle; live canonical paths unfixturable | |
| `tooling-instrument-proof` | AST registry/tests/tooling files plus directory/file liveness | custom registry source/member scan and anchor blindness | proof-class vocabulary is two-sided | virtual overlay on real Project for live control; temp exact tree for resource proof |
| `tsconfig-routing-parity` | installed tsgo output for every config + static routing algebra | no `ctx.scan` resource counts today; failed child/malformed JSON throws | no grant; runnable temp project, costly static/full tier | |
| `ui-exports-map-complete` | ui module dirs + `packages/ui/package.json` exports | module-dir scan; missing package/export map reports; zero dirs must refuse | no grant | temp tree; shares `__g_uiprim` live fixture |
| `verify-registry-parity` | root package scripts/deps + static verify registry | no resource scan; missing package silently returns, which must become refusal | non-stage allowlist is policy and must remain explicit/two-sided | exact temp package; live root unfixturable |

## Current `__g_` live-tree probes and destination

`tests/tooling/check-gates.int.test.ts:9-20` plants fixtures in the developer tree, runs the full structure command twice, and cleans with broad `find ... -name __g_* -exec rm -rf` calls at `:85-101`. This must disappear at cutover. The current resource-gate fixtures are:

| Gate | Live probe path/source receipt | Destination |
| - | - | - |
| `feature-structure` | `packages/server/src/domain/__g_struct/index.ts` (`check-gates.int.test.ts:136-137`) | virtual Project overlay; tree host merges overlay entries |
| `test-presence` | `domain/__g_pres/verbs/act.ts`, contracts `__g_prescontract/index.ts` (`:142-153`) | virtual overlay plus mirror-index overlay |
| `gate-ignore-inventory` | `packages/server/src/__g_ignoreinv.ts` (`:156-161`) | virtual overlay; central marker engine observes it |
| `db-structure` | `packages/db/src/schema/__g_orphan.ts` (`:173-174`) | virtual overlay + db-tree overlay |
| `baseline-single-migration` | `packages/db/src/migrations/__g_0001_fake.sql` (`:215-217`) | auto-cleaned temp migration root |
| `test-layout` | `tests/server/__g_nomirror.test.ts` (`:224-225`) | virtual overlay + mirror-index overlay |
| `tooling-slot-template` | `tooling/src/__g_badtool/stray.ts` (`:227-228`) | virtual tree overlay |
| `tooling-instrument-proof` | `tests/tooling/__g_rogue/x.test.ts` (`:254-257`) | virtual overlay on the loaded Project and authored tree |
| `pd-citation-integrity`, `d-citation-integrity` | package source cites (`:277-286`) | virtual source overlay; registry stays typed real resource |
| `no-nul-bytes-in-source` | raw NUL fixture (`:296-299`) | auto-cleaned temp byte root; an in-memory TS string is insufficient |
| `server-layout`, `package-layout` | rogue server dir/package root (`:336-339`) | virtual authored-tree overlay |
| `ui-primitive-structure`, `ui-exports-map-complete` | shared `primitives/__g_uiprim/index.ts` (`:340-344`) | virtual Project/tree/package-export overlay; keep independent expected findings |
| `client-structure` | feature stray file (`:345-346`) | virtual authored-tree overlay |
| `seed-theme-ink-contrast` | source ink candidate (`:370-373`) | virtual AST overlay; inject already-loaded theme palette fact |
| `component-size`, `component-size-ui` | oversized text (`:418-423`) | virtual file/tree overlay with line-count fact |
| `integer-line-boxes`, `rest-transform-grid`, `css-var-defined` | class-value fixtures (`:447-452`) | virtual AST overlay; inject shared CSS/token facts |
| `density-tier` | class/slot fixture (`:453-458`) | virtual AST overlay plus real/fixture tier-map fact |
| `motion-token-purity` | `packages/ui/src/__g_motion/__g_motion.css` (`:459-462`) | auto-cleaned temp CSS root |
| `dangling-doc-cite` | source comment and gate-corpus comment fixtures (`:519-525`) | virtual source overlay plus typed document index |
| `dangling-refs` | shared gate descriptor ghost-doc fixture (`:523-525`) | virtual gate AST overlay plus typed document index |
| `ratchet-row-integrity` | `__g_*.baseline.json` (`:569` onward) | auto-cleaned temp ledger root |
| `test-presence-client` | client source with no mirror (`:618-619`) | virtual source/tree/mirror overlay |
| `sanctioned-css-homes` | two unsanctioned CSS paths (`:805-809`) | auto-cleaned temp CSS tree or virtual resource overlay |
| `no-raw-color-in-css` | raw CSS fixture (`:851-853`) | auto-cleaned temp CSS root |
| `over-art-plate-arm` | shared CSS glass/transparent fixture (`:854-860`) | auto-cleaned temp CSS root with loaded appearance facts |
| `no-manual-memo`, `no-raw-z-index` | TS source fixtures (`:887-890`, `:986-987`) | virtual AST overlay; installed/token fact injected |
| Base UI anatomy/derive/state gates | `primitives/__g_b*` seal fixtures (`:904-930`) | virtual AST overlay plus typed manifest fact; installed-surface proof remains temp-root |
| `css-length-tokens` | shared `w-[600px]` source fixture (`:970-973`) | virtual AST overlay plus exact shell/resource facts |
| `gate-modernization` | gate module with no descriptor (`:1102-1134`) | virtual gate-corpus overlay |

The separate marker-consumption suite plants three live carrier trees (`gate-ignore-grammar.int.test.ts:34,44,96`) and deletes broadly with `find` (`:120-139`). Those are syntax/authority controls, not resource policy fixtures. They move as one **virtual overlay on the real loaded Project** so sibling-gate consumption remains observable without touching disk. A temp root would not preserve real gate registration and marker-consumption composition.

The current harness explicitly lists 22 gates that no `__g_` file can drive (`check-gates.int.test.ts:1241-1357`): `biome-grant-liveness`, `tsconfig-entry-liveness`, `eslint-grant-liveness`, `depcruise-grant-liveness`, `runner-config-path-liveness`, `baseui-surface-manifest`, `warning-code-coverage`, `verify-registry-parity`, `enforcement-registry-parity`, `tsconfig-routing-parity`, `bus-coverage`, `rpg-bus-coverage`, `automation-bus-coverage`, `domain-events-coverage`, `bus-payload-allowlist`, `knob-wire-coverage`, `message-kind-policy-coverage`, `tokens-contract`, `css-family-ownership`, `css-selector-has-a-writer`, `devtools-frontend-assets`, and `playwright-css-topology`. Fourteen belong to this 53-gate resource-host census; the remaining eight are non-resource whole-corpus policies. Their proofs stay explicit temp-root/dedicated controls rather than being forced through a fake overlay.

## Existing helper reuse map

| Existing helper | Keep | Move behind host |
| - | - | - |
| `baseui-read.ts` | installed-surface interpretation, binding/rendered-part facts | package/manifest loading, cache/reset, status/receipts |
| `config-static-read.ts` | static JS/TS value evaluator and refusal semantics | source loading and SourceFile construction |
| `grant-liveness.ts` | exact/pattern classifiers and liveness algorithms | `git ls-files`, subprocess status, tracked-member receipt |
| `comment-spans.ts`, `css-rules.ts`, `static-class-expression.ts` | syntax algorithms and source-position preservation | CSS/text corpus acquisition |
| CSS family/writer/variable helpers | policy-independent census and provenance algorithms | five-home/vendor loading and shared population receipt |
| `over-art-plate.ts`, `seed-theme-ink.ts` | plate/palette/contrast judgments | CSS loading and stylesheet discovery |
| `_shared/ratchet-rows.ts` | row schema, class, admission and cite interpretation | ledger discovery/read/status; writers are outside gate execution |
| `_shared/devtools-assets.ts` | pin parsing, closure/hash/license validation | exact resource loading/receipt |
| `program-routing.ts` | static path-to-program algebra | compiler membership execution and invocation cache |
| `symbol-reference.ts`, `tuple-read.ts` | canonical AST facts | nothing resource-specific; consume the shared query host |

## BLOCKED BEFORE RESOURCE-GATE CONVERSION

1. **Typed resource identities and receipts do not yet exist.** Conversion must wait for closed ids for authored trees, exact configs/artifacts, product CSS, document ledgers, installed Base UI, token contract, and tsconfig program membership. A gate-local string path is not the destination contract.
2. **The host needs first-class `missing`, `empty`, and `unresolved` states.** Current gates disagree on whether missing roots pass, red, or throw. Until the runtime withholds a clean verdict on unresolved required resources, moving loaders would preserve false greens behind a new API.
3. **Population composition with virtual overlays is unresolved.** The live `__g_` replacement requires the same overlay to feed both the ts-morph workspace and resource indexes. If tree/CSS/doc/mirror indexes ignore virtual files, the proof will pass on AST while resource reconciliation remains blind.
4. **Tracked Git inventory must be invocation-scoped and fail closed.** Four liveness gates cannot convert until `git ls-files` is one shared fact with error/empty receipts and temp-Git proof support.
5. **Compiler subprocess execution needs an explicit cost/tier contract.** `tsconfig-routing-parity` must not become an accidental per-gate spawn loop or selected-file inner-loop cost. The host must own lazy once-per-invocation execution, timeout/exit capture, compiler identity, and entire-population refusal.
6. **Installed/generated artifacts need dependency injection in proofs.** Base UI, DevTools, token-contract, Playwright topology, and compiler-plugin facts cannot be represented by ordinary in-memory fixtures. Their typed resource providers and auto-cleaned temp-root fixture mode must land before their gates convert.
7. **Private descriptor Projects must be removed through a shared descriptor fact.** `dangling-refs` and `enforcement-registry-parity` cannot carry their `new Project` readers into the final module. The loader/shared query layer must expose descriptor id/status/message/doc metadata and source positions.
8. **Grant/baseline policy ownership must stay outside ResourceHost.** The host may load typed rows and report their resource status; it must not decide exceptions. Central authority/grant reconciliation owns reviewed grants, while unique gate algorithms own current shrink-only baseline interpretation until those baselines retire.
9. **Every custom `ctx.scan` must be translated to resource units before deletion.** CSS declarations/classes, config rows, document/comment files, token counts, palettes/ink pairs, ledgers, module dirs, and compiler programs must appear in `resources` receipts. Harness source-file counts cannot stand in for a corpus the gate did not read.

No gate/helper/runtime/test was edited and no test or broad verification command was run for this audit.
