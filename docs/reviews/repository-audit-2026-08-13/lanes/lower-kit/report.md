## Lane identity

- Lane: `lower-kit`
- Semantic scope: `@orb/kit` source and its assigned `tests/kit` mirrors only.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current bytes; `read-receipt.tsv` recorded zero assignment-hash drift. `git status --short -- packages/kit tests/kit` returned no paths (command receipt).
- Assigned files read: 107 / 107 (100%).
- Assigned lines read: 15,627 / 15,627 (100%).
- Assigned bytes read: 800,457 / 800,457 (100%).
- Dirty assigned paths: 0 observed.
- Exclusions: all unassigned packages, composition roots, live route/client/browser surfaces, gates, and test support files.

## Read receipt

`read-receipt.tsv` covers all 107 OWNED and 9 SHARED rows; every current SHA-256 equals its assigned snapshot SHA-256. Coverage is complete.

## Architecture observed

`@orb/kit` declares directory-front-door package exports (`"./*": "./src/*/index.ts"`) and in-package `#*` mapping in [package.json](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/package.json:8) (R2, full read). A completed alias-resolved API-surface scan covered 4,903 workspace source files and classified all 342 kit exports: 262 public to another workspace, 77 internal, one test-only, and two unused (`time pnpm ast apisurface kit --public --max 200`, 2m11.338s, R3 for public reach). The tool caps detail to 200 rows, so its two unused candidates are not generalized into a package-wide wiring verdict; one printed candidate is `OwnerStatId` at [ids/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/ids/index.ts:165).

The macro engine is a substantial pure subsystem with parsing, registry, evaluator, metadata, variables, row macros, and user macros in the owned source set; its focused unit suite ran as part of 49 passing kit files (R4, `pnpm exec vitest run --project unit tests/kit`). Kit also owns security-sensitive pure policy construction: card-frame produces a response-document or meta CSP and re-clamps theme/font values at document assembly ([card-frame/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/card-frame/index.ts:91), [card-frame/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/card-frame/index.ts:151), R2/R4).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| `@orb/kit` assigned source/test set (56 source + 51 test files) | 4 | 3 | 3 | 2 | 2 | medium | Package export map; full source/test read; completed API-surface scan (342 exports, 262 cross-package public, R3); 49 unit files / 743 tests pass (R4); kit-purity is declared as a gate by [Core-0](/home/inktomi/inktomi-stack/development/orbweaver/docs/architecture/core/Core-0-Architecture-and-Structure.md:230) but not run/read in this lane. |
| Macro public module | 4 | 3 | 4 | 2 | 2 | high | Macro implementation files + 12 assigned macro tests, including grammar/DoS/parity suites (full-read basis, R4); 96 resolved importer files (R3); focused unit pass (R4). |
| Card-frame pure policy builder | 4 | 2 | 4 | 1 | 0 | high | CSP/document construction ([card-frame/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/card-frame/index.ts:111), [card-frame/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/card-frame/index.ts:151), R2); whole-policy and hostile-token tests ([card-frame test](/home/inktomi/inktomi-stack/development/orbweaver/tests/kit/card-frame/index.test.ts:15), [card-frame test](/home/inktomi/inktomi-stack/development/orbweaver/tests/kit/card-frame/index.test.ts:53), R4). Runtime delivery belongs to excluded server/client routes, so no operability evidence is credited. |

## Findings

### LOWER-KIT-01 — Card-frame browser boundary has no current runtime receipt in this lane

- Severity: P2
- Class: declared-not-tested
- Confidence: high
- Evidence rung: R4 for pure construction; R0 for a current browser/runtime proof in this lane.
- Scope denominator: 1 security-sensitive pure card-frame module; excluded runtime consumers are not part of the 107-file denominator.
- Receipts: [card-frame/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/card-frame/index.ts:111) constructs policy strings; [card-frame/index.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/card-frame/index.ts:151) emits the document; [card-frame test](/home/inktomi/inktomi-stack/development/orbweaver/tests/kit/card-frame/index.test.ts:15) checks the complete CSP strings; [card-frame test](/home/inktomi/inktomi-stack/development/orbweaver/tests/kit/card-frame/index.test.ts:91) confirms document-side re-clamping. `pnpm exec vitest run --project unit tests/kit` passed all 49 files / 743 tests.
- Established fact: the assigned tests prove deterministic policy text and escaping clamps, but do not execute an iframe or the excluded server route/client frame delivery; the source’s browser-behavior comments therefore remain un-reproduced by this lane.
- User or system impact: a CSP-string regression is well-covered, while a browser delivery or header/meta integration mismatch could still survive the kit unit suite.
- What remains unverified: actual response-header delivery, iframe sandbox behavior, parent-CSP intersection, and external-media behavior.
- Suggested next check or fix: the composition-owning lane should run/add a focused Playwright/browser integration probe that drives both delivery arms; no kit code change is implied here.

## Proven strengths

- `card-frame` tests assert entire document/meta CSP values, including the safe floor and prohibited plain-`http:` scheme ([card-frame test](/home/inktomi/inktomi-stack/development/orbweaver/tests/kit/card-frame/index.test.ts:15), R4); the current focused unit command passed (R4).
- Macro is live below multiple package layers: `pnpm ast importers @orb/kit/macro` resolved 128 import sites in 96 files, including production client/server consumers (R3), while the current kit unit suite passed its macro-focused files (R4).

## Declared versus completed

| Surface | Strongest evidence | Status |
| - | - | - |
| Package subpath front doors | R3 | Declared by [package.json](/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/package.json:8); an alias-resolved scan classified 262 of 342 kit exports as cross-package public. |
| Macro engine | R4 | Implemented, cross-package imported, and covered by current focused unit/property/parity-suffix tests. |
| Card-frame policy/document builder | R4 | Implemented and unit-tested; browser delivery remains outside lane evidence. |
| Whole-package purity/enforcement | R1/R2 | Shared law declares the `kit-purity` gate; this lane did not inspect or run that gate, so no stronger enforcement claim is made. |

## Tests and gates

The exact focused unit command passed 49 files and 743 tests on current working-tree bytes. The assigned suite includes 12 macro tests (including `.suite` grammar, DoS-bound, and parity cases) and whole-string CSP assertions for card-frame, which are meaningful R4 unit evidence. It does not establish integration, contract, type, CT, e2e, or gate execution. The attempted package script was unsuitable as a scope filter and timed out during a broad run; its unrelated failures are documented in `commands.md` and are not attributed to kit.

## Cross-lane edges

- Card-frame’s claimed routed-header and client-srcdoc paths need the server/http and UI/client owners to establish runtime wiring; this lane establishes only the shared pure builder and its unit behavior.
- `@orb/kit/macro` has resolved production consumers in client, contracts, db, and server (command receipt); those consumers own end-to-end composition and any cross-boundary behavior beyond the macro engine itself.

## Tool receipts

`pnpm ast` was read and used. The completed `apisurface kit --public --max 200` scan ran 2m11.338s, covered 4,903 source files, and classified all 342 exports (262 public, 77 internal, one test-only, two unused); printed detail was intentionally capped to 200 rows. `importers @orb/kit/macro` independently yielded 128 resolved import sites in 96 files. No absence finding is made, so no zero-result structural claim or literal cross-check is presented. Full command status, scan scope, and exclusions are in `commands.md`.

## Lane verdict

The assigned kit source/test set is fully read and byte-identical to its audit snapshot. The kit unit lane is currently green: 49 files / 743 tests.
The macro engine has direct resolved use across the package cake, and card-frame’s pure CSP/clamp behavior has focused unit proof.
Package-wide export reach is structurally catalogued, but the API-surface lens identifies two unused candidates and its detailed listing is capped; gate/runtime owners remain outside this lane.
The largest remaining uncertainty is browser/runtime proof for the card-frame delivery boundary.
