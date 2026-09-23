---
kind: review
status: active
updated: 2026-09-05
---

# Typed ResourceHost foundation

The foundation provides closed resource facts and a tested PolicyContext receipt seam. **No gate module was edited or converted.** The production loader remains unchanged; this is an additive dependency of the atomic [gate runtime migration](../../design/gate-runtime-standardization.md), based on `80890046b4f93071d2e77cf242abad31eea31d28` from `codex/gate-tsmorph-standardization`.

## Census and provider selection

The [resource access report](resource-gate-access-patterns.md) remains the exact 53-gate manifest. A fresh structural `pair` query for `fsBacked: true` scanned all 255 top-level gate modules with zero skipped files and found exactly 53 descriptor pairs. A literal cross-check and comparison with the report's 53 rows produced identical sets, with no missing or extra names. Its 29 resource-only / 24 hybrid and 50 entire-population / 3 selected-file partition is the migration evidence, not a new runtime registry.

The initial providers cover repeated acquisition, not complete gate algorithms:

| Family | Delivered facts | Census consumers served in part |
| - | - | - |
| Authored trees | Twelve closed roots; normalized file/directory identities, disk/overlay origin, byte counts, LF-based line counts, raw NUL counts | Layout/template/feature/primitive/schema/migration gates, component-size pair, test mirrors, gate inventory |
| Authored CSS | All CSS members in the client/UI source inventories; text and existing parsed rules with source positions | CSS literal/geometry, ownership/writer, and appearance families |
| Product CSS | Exact five `PRODUCT_STYLESHEETS` homes, independent of ambient tree membership | Ownership/writer/variable/topology and token-derived CSS consumers |
| Package metadata | Eight closed package identities; validated scripts, dependency groups, export entries, authored name and privacy | `ui-exports-map-complete`, `verify-registry-parity`; inputs for config liveness |
| Static code configs | Five closed ESLint/depcruise/Vitest/Playwright/CT identities; anchored selection rows and explicit unreadable shapes | ESLint/depcruise/runner liveness; part of Playwright topology |
| Tracked Git inventory | One lazy NUL-delimited Git index read per invocation, exit/timeout receipt | Biome/depcruise/ESLint/tsconfig grant liveness |

The host does not judge naming buckets, module slots, line caps, mirror rules, grants, debt, palettes, contrast, or CSS ownership. Those algorithms stay in `verify/lib` or their existing owners until conversion. Package name/privacy are data, not host-enforced policy. The existing ordered config evaluator reuses stable reference facts and refuses cycles, writes, and mutable collection escapes instead of dropping members.

## Runtime and refusal guarantees

`contract/resource-host.ts` is the gate-facing surface. Its methods accept closed IDs; there is no path, glob, parser, Project, cache reset, or filesystem callback. Internal acquisition lives in `ops/resource-reader.ts`. `createResourceHost` returns the host and a separate invocation receipt reader for composition/reporting.

Facts discriminate `ready`, `missing`, `empty`, and `unresolved`; only ready facts carry a value. Their immutable receipts record resource identity, exact paths, semantic member count, acquisition duration, and subprocess details where applicable. The host caches successful and failed acquisition alike. Repeated requests share the same fact; a new invocation observes disk changes. First observations are cached, rather than promising an atomic filesystem-wide snapshot. A file that disappears after its directory was observed but before its bytes were read refuses. Directory listings and file bytes share membership snapshots, so a cached file cannot disappear from a later tree view or turn into a directory with new children.

Overlay additions/replacements and deletion tombstones are copied at construction. Implicit directories join the same inventories. Conflicting ancestor/child overlay rows, symlinks, nonregular files, malformed paths, and invalid UTF-8 refuse rather than returning an empty success. Raw byte/NUL facts do not depend on text decoding. Installed/generated directory trees (`node_modules`, `.git`, `dist`, `.cache`) are excluded from authored walks and require dedicated providers. Git membership deliberately ignores overlays: deleting a virtual file does not delete its tracked index identity.

CSS facts retain the existing parser's supported grammar. Malformed blocks/comments/quotes and quoted delimiters or escapes the parser cannot preserve produce unresolved facts. This is not a complete CSS Syntax validator. Package exports currently support string-valued maps; unsupported conditional/array/null forms refuse. Static config facts are selection rows, not execution of arbitrary JavaScript.

## PolicyContext integration

The dispatcher creates one host per invocation and binds it once per owner. Composition may supply `PolicyPassInput.resourceOptions` for overlay/parser injection; the dispatcher always supplies its own root and creates a fresh host, preventing cross-root substitution or reuse of prior caches; resource conformance uses a fresh default host rooted at each materialized example:

```ts
const fact = context.resources.packageMetadata("root");
```

The binding checks every acquired path against `context.resourcePaths` and records each consumed resource once per owner, including shared cache hits. Non-ready facts record unresolved receipts even if the policy ignores their status. Out-of-population requests record an unresolved receipt before throwing, so catching the exception cannot restore a clean owner. The existing dispatcher now also refuses an owner that declares effective resources but produces no resource receipt. Host acquisition also marks consumed paths in a private context set. Every effective resource path must be covered before owner completion; a forged public semantic receipt or a partial resource read cannot satisfy that check. These refusals withhold central grant/waiver reconciliation; a no-op owner cannot falsely stale a grant.

The final descriptor-to-resource population resolver is still integration work. The native `context.resources` field now uses the production binding in both ordinary passes and conformance. They must derive path membership from closed requests before dispatch, handle source/resource identity overlap for hybrids, preserve entire-population selection, and feed the same overlay to the shared AST workspace. The current runtime rejects an identity supplied as both source and resource; this foundation does not silently change that contract. The binding is a tested seam, not a claim that the production gate fleet uses ResourceHost yet.

## Remaining provider contracts

- Exact artifacts and typed JSON/JSONC: biome config, tsconfig extends folding, migration journal, token vault/schema/output bundle, and remaining ledgers.
- Derived test/source mirror facts and policy-specific authored byte/text populations; tree inventory alone does not replace their algorithms.
- Tracked package dependency-module membership for grant patterns; the Git path index does not yet replace all of `memberSources`.
- Markdown/document/catalog/heading/link facts and D/PD/enforcement ledgers.
- Shared gate-descriptor facts from the runtime workspace, replacing both private descriptor Projects.
- Installed Base UI/version/type/manifest and vendor CSS surfaces; no module-cache reset door may enter the final host.
- DevTools pin/closure/hash/license facts and installed React compiler denylist facts, with typed fixture injection.
- Compiler-resolved tsconfig membership with explicit entire-population/static-tier cost, timeout, compiler identity, and runnable temp-project proofs.
- Domain-specific resource receipt units such as declarations, class writers, palettes, ink pairs, tokens, and ledger rows. CSS acquisition currently counts stylesheets; its count does not stand in for those later semantic denominators.

## Verification evidence

All behavioral proofs use auto-cleaned scratch roots or virtual inputs; none plant a live-tree probe. Focused foundation verification passed 132 tests across the resource reader/host/tree/tracked/policy suites and existing policy-pass, policy-loader, population, authority, and reference foundations. A later six-suite run passed 41 tests after the exact parser-identity and final reader changes. The settled cold run passed 54 tests across seven resource/dispatcher suites, plus 43 existing config-liveness tests. Together with the unchanged population/authority/reference/loader foundations (92 tests), the focused runs cover 189 distinct tests across 14 files. Scoped tooling and test import-closure type programs, Biome, and ESLint are the lane floor; broad whole-tree checks, gate differentials, performance baselines, and the atomic cutover remain the integrating task's responsibility under shared load.

A read-only live acquisition smoke returned ready facts for product CSS (5 stylesheets), authored CSS (5), tracked inventory (8,915 files at the base), and root package metadata (1). The initial sample durations were approximately 236 ms, 388 ms, 81 ms, and 1 ms respectively; these are diagnostic samples, not a performance comparison or acceptance budget.

Cold verification reproduced and drove permanent controls for read/tree snapshot disagreement, cached file-to-directory drift, undeclared resource consumption, absent resource receipts, and mutation/escape of static config collections. The independent cold reviewer confirmed the settled foundation with no remaining concrete findings; no conversion credit is claimed for merely adding a provider.

The global test-baseline manifest was returned byte-for-byte to the starting commit at the parent task's request. The [parent work item](https://github.com/Inktomi93/orbweaver/issues/1584) owns its regeneration after the foundation train drains; this lane makes no baseline regeneration claim.

Issue-summary handoff: typed acquisition and owner receipt foundations are available for integration; retain the listed missing providers and hybrid population composition requirements before assigning resource-gate conversions. No Project lifecycle transition was performed in this lane. Global catalogue/baseline regeneration and whole-tree acceptance belong to the parent train; no global ledger is changed here.

## Reproduction commands

```sh
pnpm test:scoped tests/tooling/verify/ops/resource-reader.test.ts tests/tooling/verify/ops/resource-host.test.ts tests/tooling/verify/ops/resource-tree.test.ts tests/tooling/verify/ops/resource-config.test.ts tests/tooling/verify/ops/resource-tracked.test.ts tests/tooling/verify/lib/resource-policy.test.ts tests/tooling/verify/lib/policy-pass.test.ts --maxWorkers=2
pnpm test:scoped tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts tests/tooling/verify/gates/depcruise-grant-liveness.int.test.ts tests/tooling/verify/gates/runner-config-path-liveness.int.test.ts --maxWorkers=2
pnpm test:scoped tests/tooling/verify/lib/population-resolver.test.ts tests/tooling/verify/lib/gate-authority.test.ts tests/tooling/verify/lib/reference-fact.test.ts tests/tooling/verify/lib/policy-loader.test.ts --maxWorkers=2
pnpm check:docs docs/reviews/gate-runtime/resource-host-foundation.md
```

The scoped type programs extend `tooling/tsconfig.json` for changed source roots and `tsconfig.json` for the resource test roots, with empty `include`, explicit `files`, and the root `reset.d.ts`/`platform.d.ts` ambient pair. Both use the existing `scripts/ts7.ts` wrapper and retain the real import closure; neither is a whole-tree verification claim.

## Composed integration repair

The integrated parent at `5de69981984838389cf57c62fb4901a2d9b4fcfa` exposed a resource conformance fixture that read disk directly without consuming a resource receipt. The dispatcher now supplies the bound host on `context.resources`; the proof consumes typed root package metadata while independently observing exact materialized bytes and cleanup. Planted unconsumed, forged-receipt, and partial-consumption twins fail both proof arms, while successful and throwing examples retain deterministic sanitized paths and temp cleanup. A shared-host control verifies one acquisition with independent per-owner consumption receipts.

The shared-load depcruise test timeout also exposed repeated extraction work: escape analysis and property traversal were performed for every key family. A config now binds one local extractor across all key families. Five fresh-Project samples measured medians of 970.9 ms before and 559.3 ms after (cold first samples were noisy); no timeout was increased. The serial provider/config-liveness replay passed 56 tests, with the live depcruise config arm at 834 ms. This is a focused replay and cost reduction, not a universal wall-time guarantee.

Final composed verification passed 88 tests across seven files: policy conformance, policy pass, resource policy, config provider, and the three existing config-liveness suites. The final combined provider depcruise arm took 1,469 ms. A permanent structural control verifies one property traversal across both depcruise key families; no wall-time threshold is used. Independent cold review confirmed all root/provenance/coverage repairs and reran the same 88 controls. Scoped source/test type programs and scoped lint remain the verification boundary; global baselines, catalogue, board, and broad structure were not touched.
