---
kind: review
status: active
updated: 2026-09-05
---

# ResourceHost layout, size, and inventory gate family

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584). Base: `2800f78b63e702fb98c117d2ce810c843901d25f` on `codex/gate-tsmorph-standardization`.

## Verdict

The exact 53-policy resource manifest contains 13 layout, size, inventory, package, NUL, export-map, and migration-baseline candidates in this family. **Zero are eligible on the delivered ResourceHost plus final proof/runtime contracts.** No descriptor, helper, test, grant, baseline, planner, dispatcher, conformance runtime, product file, or global catalog/test manifest was changed. The correct result is a closed refusal manifest, not a partial conversion that bypasses final conformance or changes policy semantics.

The blocking seam is shared by eleven resource-only tree policies. A resource proof materializes `.ts`/`.tsx` files into the Project but adds only non-TypeScript files to `resourcePaths` (`tooling/src/verify/ops/policy-conformance.ts:69-84`). Authored-tree facts return every file and implicit directory as resource paths (`tooling/src/verify/ops/resource-reader.ts:168-210,227-243`). The bound host refuses any returned path outside the effective resource population (`tooling/src/verify/lib/resource-policy.ts:12-18`). Therefore a resource-only tree policy whose founding proof needs TypeScript cannot make its mandatory `verifyPolicyProofs([gate])` proof green without changing the excluded descriptor-to-resource/conformance foundation.

This is the same unfinished integration boundary already recorded in `resource-host-foundation.md`: descriptor-to-resource membership, hybrid source/resource identity overlap, and shared overlay composition remain parent work (`docs/reviews/gate-runtime/resource-host-foundation.md:46-48`). The lane did not repair that seam.

Owner ruling for the destination: final AST/compiler source populations contain `.ts` and `.tsx` only. `.mts`, `.cts`, `.mjs`, and `.cjs` are eventual cleanup, not additional source-population members. The delivered planner does not enforce that ruling yet: `tooling/src/verify/lib/policy-plan.ts` admits `[cm]?ts`, compiler membership forwards authored `.mts`/`.cts` members, and population resolution applies no default extension fence. The future resource declaration seam must close that drift while preserving the boundary: non-source inputs remain explicit ResourceHost facts rather than being admitted to the compiler population to make a proof pass.

## Closed manifest

A fresh structural `pair` query for `fsBacked: true` matched 53 descriptors across all 255 top-level gate modules. A literal `rg` cross-check returned the identical 53-file set. The family partition is `13 in scope + 40 out of family = 53`; the eligible partition is `0 eligible + 13 excluded = 13`.

### Eligible

None.

### In-family exclusions

| Policy | Required facts | Exclusion |
| - | - | - |
| `baseline-single-migration` | migration tree + strict journal JSON | The schema-family boundary excludes implementation here, and the host has no typed strict-JSON/migration-journal provider. The gate judges exact journal entries, not directory presence; the missing provider is recorded at `resource-host-foundation.md:52`. |
| `client-structure` | client feature tree + server domain tree + authored TSX text | Tree membership is available, but `ResourceTreeEntry` exposes no text and rule 7 reads `OUTER_CONTAINER` from TSX source. Its TypeScript tree proof also hits the shared conformance/resource-population refusal. |
| `component-size` | client source tree + legacy-equivalent LOC | `ResourceTreeEntry.lines` is LF count plus one, while the legacy gate removes one terminal LF. On the current corpus all 1,286 judged files differ by one line: legacy reports one violation and host metadata would report four, falsely adding three files at the 450-line boundary. The TypeScript resource proof is also unrepresentable. |
| `component-size-ui` | UI source tree + legacy-equivalent LOC | The same terminal-LF mismatch affects all 358 judged files. Both algorithms currently report zero violations, but population-value equality is false and the TypeScript resource proof is unrepresentable. |
| `feature-owns-definition` | client feature tree | The tree has the required names and kinds, but its mandatory TypeScript resource proof cannot declare the provider-returned TS files and implicit directories as effective resource paths. |
| `feature-structure` | server domain tree | The tree has the required root and slot facts, but the mandatory TypeScript resource proof hits the same population refusal. |
| `no-nul-bytes-in-source` | complete authored byte corpus + per-occurrence lines | The current policy covers `packages`, `tooling`, `tests`, `scripts`, and `docs`; closed tree ids omit `scripts`, `docs`, and tooling root files outside `tooling/src`. Tree entries expose aggregate `nulBytes`, not per-occurrence line positions. |
| `package-layout` | package source-root tree | The founding `packages/kit/src/loose.ts` proof is a TypeScript resource identity and hits the shared conformance refusal. |
| `server-layout` | server tree | The required TS files and implicit tier directories cannot be represented as resource identities by final conformance. |
| `test-layout` | test tree + derived source/test mirror | The host lacks the derived mirror fact explicitly listed at `resource-host-foundation.md:53`; its TypeScript test-tree proofs also hit the shared conformance refusal. |
| `tooling-slot-template` | tooling slot tree | The provider is otherwise complete. A planted final-policy proof failed both arms with `resource authored-tree:tooling-slot is outside the effective resource population` because its `.ts` fixtures were Project sources but not resource paths. |
| `ui-exports-map-complete` | UI tree + package metadata | Package metadata is ready, but module/front-door truth comes from TS `index.ts` paths. Those mandatory resource identities hit the shared conformance refusal. |
| `ui-primitive-structure` | primitive tree + source AST + CT mirror | This is a genuine hybrid whose TS/TSX identities need both AST and resource judgment. The final planner/pass rejects source/resource overlap, and the mirror provider is also absent. |

### Out-of-family exclusions

These 40 rows remain in the exact 53 manifest but are not part of this lane. CSS policies stay out even though authored/product CSS acquisition exists; they need a dedicated CSS ownership/grant family. Config, document, installed/generated, schema, registry, mirror-presence, and compiler policies retain their own missing-provider or owner boundaries.

| Boundary | Exact policies | Count |
| - | - | -: |
| CSS ownership/grant/appearance/topology | `css-family-ownership`, `css-length-tokens`, `css-selector-has-a-writer`, `css-var-defined`, `density-tier`, `integer-line-boxes`, `motion-token-purity`, `no-raw-color-in-css`, `no-raw-z-index`, `over-art-plate-arm`, `playwright-css-topology`, `rest-transform-grid`, `sanctioned-css-homes`, `seed-theme-ink-contrast` | 14 |
| Config, tracked-inventory, and compiler membership | `biome-grant-liveness`, `depcruise-grant-liveness`, `eslint-grant-liveness`, `runner-config-path-liveness`, `tsconfig-entry-liveness`, `tsconfig-routing-parity` | 6 |
| Base UI and installed/generated artifacts | `baseui-anatomy-completeness`, `baseui-derives-not-respells`, `baseui-state-data-attributes`, `baseui-surface-manifest`, `devtools-frontend-assets`, `no-manual-memo`, `tokens-contract` | 7 |
| Documents, descriptors, registries, grants, and ratchets | `d-citation-integrity`, `dangling-doc-cite`, `dangling-refs`, `enforcement-registry-parity`, `gate-ignore-inventory`, `gate-modernization`, `pd-citation-integrity`, `ratchet-row-integrity`, `verify-registry-parity` | 9 |
| DB/schema family | `db-structure` | 1 |
| Test-presence/mirror family | `test-presence-client`, `test-presence` | 2 |
| Tool proof/registry hybrid | `tooling-instrument-proof` | 1 |
| **Total** | | **40** |

## Population and semantic equivalence

No old/new policy differential exists because no final descriptor was eligible. The conversion delta is byte-empty and the `gate:contract` reduction is exactly zero. The current migration census remains 1,447 findings across 255 modules; each of the four size/inventory candidates sampled by its owner contributes three legacy-contract findings, 12 total.

The one attempted policy-shaped control was intentionally off-tree and left no workspace bytes. `tooling-slot-template` consumed `context.resources.authoredTree("tooling-slot")` from a resource-only descriptor and ran through final `verifyPolicyProofs`; both proof arms refused at the resource binding. That establishes that the blocker is exercised behavior, not a prose inference.

Current live ResourceHost acquisition returned ready facts for `client-source` (1,437 members), `ui-source` (490), `tooling-slot` (1,752), `packages` (4,123), and `tests` (3,310). Readiness does not establish semantic sufficiency: the LOC comparison, missing text/mirror/journal/per-occurrence facts, and proof-population mismatch above are the reason no row receives conversion credit.

## Control coverage

The delivered foundation already carries the required ready/missing/empty/unresolved, overlay replacement/addition/tombstone, symlink/nonregular, invalid UTF-8, resource receipt, and partial/unconsumed controls. This lane reran those production tests instead of copying them into thirteen blocked gate modules. Planner deletion/rename and entire-population controls remain in the final planner suite. No current-corpus product violation was fixed or suppressed.

| Command | Result |
| - | - |
| `pnpm gate:contract` | Expected migration-census exit 1: 1,447 findings across 255 modules; reduction 0 |
| `pnpm test:scoped tests/tooling/verify/ops/resource-reader.test.ts tests/tooling/verify/ops/resource-host.test.ts tests/tooling/verify/ops/resource-tree.test.ts tests/tooling/verify/ops/resource-config.test.ts tests/tooling/verify/ops/resource-tracked.test.ts tests/tooling/verify/lib/resource-policy.test.ts tests/tooling/verify/lib/policy-pass.test.ts tests/tooling/verify/ops/policy-conformance.test.ts tests/tooling/verify/lib/policy-plan.test.ts --maxWorkers=4` | 89/89 tests green across 9 files; type errors: none |

## Cold review

`docs/reviews/stickler/2026-09-05-resource-layout-size-inventory.md` independently confirmed the 53-policy census, duplicate-free 13+40 partition, zero-currently-eligible verdict, common proof refusal, missing-provider classifications, live host counts, LOC deltas, 89-test focused run, and 1,447-finding contract census. It found one P1 report defect: the first owner-ruling insertion described the `.ts`/`.tsx` destination without naming the delivered planner's `.mts` admission. The current report corrects that drift distinction. Final cold-review result: **CONFIRMED, zero outstanding findings.**

## Scope retained

- No raw filesystem, path/glob corpus, parser, Project, cache, callback, or path registry entered a gate module.
- No schema-family, CSS-family, private descriptor/registry, installed/generated artifact, planner/CLI/runtime, global baseline/catalog, board, main, or push action occurred.
- No baseline, ratchet, exemption table, adapter, dual runtime, or warning without a real work-item identity was added.
- The parent runtime seam must land before this family is redispatched; the lane does not prescribe its implementation here.
- The parent planner/resource seam must converge the delivered `[cm]?ts` behavior to the owner-ruled `.ts`/`.tsx` final population and keep non-source inputs explicit resources; widening source extensions is not a repair.

## Checkpoint and resume

This report and its cold review describe base `2800f78b63e702fb98c117d2ce810c843901d25f`; their first task commit is `1f41b00809c8136b38dae671c1bbce1eaabb3d65`. During the lane, `codex/gate-tsmorph-standardization` advanced independently to `7753e71005ab6c06e1135012ff61693cb25183a0` through `019b28ad8`, `74c725067`, and `7753e7100`. The task stopped under the owner checkpoint directive before re-deriving any family row against those three commits. In particular, the title of `7753e7100` indicates source/resource format work; the base-scoped `13 → 0` verdict must not be treated as current-tip eligibility evidence.

Resume from the current parent tip, read the three intervening commits and the resulting planner/conformance/resource contracts in full, then repeat the structural 53-policy census, exact 13+40 set comparison, all thirteen eligibility decisions, the off-tree tree-policy proof, the LOC differential, `pnpm gate:contract`, and the focused 89-test command. Fold this report commit only after that re-derivation; preserve the base-scoped evidence and append a current-tip disposition rather than silently rewriting the historical verdict.

Issue-summary handoff: at the reviewed base, the 53-policy resource census closes to a 13-policy layout/size/inventory family and 40 explicit out-of-family rows. All 13 were blocked by exercised final-proof population semantics or a named missing provider; zero descriptors converted, `gate:contract` reduced by zero, and the branch preserved the parent runtime/schema/CSS ownership fences. The parent branch advanced after review, so current-tip eligibility is explicitly not re-attested.

## Current-tip re-derivation: first converted pair

The resource declaration, same-path hybrid, TS/TSX source, and resource-waiver seams were folded and reverified before this re-derivation. Three low-coupling rows were then read in full and converted without using the remaining disposable task worktrees:

| Policy | Final shape | Population proof | Finding proof |
| - | - | - | - |
| `feature-owns-definition` | hard, resource-only, entire population; `client-feature` tree | 25/25 direct feature dirs and 25/25 definition owners match the legacy filesystem scan exactly | four final proofs pass; current legacy/final findings 0/0 |
| `package-layout` | reviewed-grant, source/resource hybrid, entire population; five package source roots plus `packages` tree | legacy/final loose-module subject sets are both empty and byte-equal; final pass sees 1,854 TS/TSX source paths and 4,123 resource paths | two final proofs pass; current legacy/final findings 0/0; any future exception requires exact `(path, loose-package-root-module)` grant identity |
| `ui-exports-map-complete` | hard, resource-only, entire population; package tree plus typed UI package metadata | module/family membership and export targets are derived from the same authored tree and string-only exports map as the legacy policy; no family list survives | seven final proofs pass; current legacy/final findings 0/0; unreadable package metadata is now an incomplete owner instead of an A4 ordinary finding |

Resource conformance now treats implicit parent directories of declared fixture files as valid resource identities, allowing a directory-shaped structural finding without inventing a fake file. The focused conversion test covers all three descriptors, the coupled conformance slice passes 12/12, tooling TypeScript and scoped Biome pass, and direct current-corpus runs complete all three owners with no tool/authority error or finding. The other ten rows remain uncredited until each is reread and re-derived against the current contracts.
