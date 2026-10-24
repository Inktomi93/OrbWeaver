---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: tests
---

# Client, inference, kit, contracts and db test mirrors import only their package door

## What

Item 1255 gave `tests/server/**` a dependency-cruiser rule: a suite imports production only from its mirror's front door, the server's exported subpaths, the primitives and the testkit doors, with type-only imports of other doors allowed and a closed reasoned list for constants. The other test trees (`tests/client`, `tests/inference`, `tests/kit`, `tests/contracts`, `tests/db`) have no equivalent, so a client suite may import another feature's internals or a kit suite another module's private file.

## Why

The cake is a cake only if every test tree obeys it; one enforced mirror and four unenforced ones is the gap item 1255 closed for the server alone.

## Done when

One native dependency-cruiser rule per test tree, modelled on `serverTestMirrorRules()`, with the package door (and for the client, the feature's own `index.ts`) as the allowed import and type-only imports of other doors allowed; a planted sideways import and a planted internal import each fail; the existing sites are swept through the composed root, the harness seams or `move-import-names`, with any closed exceptions reasoned per entry; a tooling test plants trees for each rule; the testkit README's enforcement table lists the rules.

## Evidence

Survey before the rules, `ast-grep` over `ts` and `tsx` source specifiers (files with imports, production specifiers, `#<pkg>/*` deep specifiers), cross-checked against the native dependency-cruiser edge list:

| Tree | Files | Production specifiers | Deep `#` specifiers | Native edges into `packages/` |
| - | - | - | - | - |
| `tests/client` | 88 | 208 | 29 | 208 |
| `tests/inference` | 28 | 47 | 0 | 43 |
| `tests/kit` | 19 | 28 | 1 | 28 |
| `tests/contracts` | 42 | 142 | 0 | 142 |
| `tests/db` | 16 | 36 | 0 | 36 |

Findings under the new rules before the sweep, and after:

| Tree | Before | After | How each site closed |
| - | - | - | - |
| `tests/client` | 27 | 0 | Two tier-level variant-payload type contracts split into one `variant-payloads.dom.test-d.ts` per mirrored feature or tier (17 internal type reaches); `peek-query` through `@orb/client/data`; seven suites listed in `PACKAGE_TEST_REACHES` |
| `tests/inference` | 2 | 0 | The logger spy reads `processObservability.logger()` from `@orb/testkit/node/composed` |
| `tests/kit` | 0 | 0 | none |
| `tests/contracts` | 0 | 0 | none; the plugin SDK conformance contract reads ambient `.d.ts` files outside any `src/` |
| `tests/db` | 2 | 0 | Both suites are listed: the provenance boot case needs `runBootMigrations`, and `traced-client-spans` proves the client wrapper `createDb` takes; each issues raw reads only the persistence tier may run |

The listed client suites unit-test a feature-private pure model. Item 0989 removed every door forward that only tests consumed, and `knip.ts` sets `includeEntryExports`, so a door export for them would be a `pnpm knip:prod` finding. The native guest protocol CT reads `UI_GUEST_BUDGETS`, the client guest's own caps, instead of the server plugin host's.

Checks: `pnpm test:tools tests/tooling/native-package-test-mirror.test.ts` passes 33 rows, and 19 of them fail against the previous config. A planted sideways and internal import per tree each failed `pnpm depcruise`, then were removed.
