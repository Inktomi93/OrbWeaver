---
kind: review
status: active
updated: 2026-09-08
---

# Client component ownership review

## Findings

### Resolved low — the design receipt attested evidence at the deleted QueryBoundary source and test paths

The component move deletes `packages/client/src/data/query-boundary.tsx` and moves `tests/client/data/query-boundary.ct.tsx`, but the initial `docs/catalog/receipts/design.json` change still attested the #885 claim against those deleted paths. The generated catalog mirrored both stale evidence targets.

Concrete failure: the catalog presents the #885 design as verified while both machine-readable evidence targets resolve to no file. A reader or verifier following the claim cannot reach the implementation or its behavioral proof.

Evidence: `pnpm check:doc-catalog` explicitly reports `code evidence target does not resolve: packages/client/src/data/query-boundary.tsx:130` and `test evidence target does not resolve: tests/client/data/query-boundary.ct.tsx:126`. A literal sweep confirms these are the only old QueryBoundary source/test references outside frozen history/research, the deletion ledger, the review finding, and the one-shot move map. The same check also reports the expected receipt hash drift for the six corrected living documents; its unrelated shared-auth/gate-runtime violations are outside this review.

Resolution: `docs/catalog/receipts/design.json:229` now points to `packages/client/src/components/query-boundary.tsx:134`, the reservation mechanism, and line 233 points to `tests/client/components/query-boundary.ct.tsx:126`, the full seeded-box/refill/remeasure behavioral proof. Both coordinates resolve on the current tree, and `git diff --check` passes for the receipt.

Sequenced metadata follow-up: receipt hash/provenance and generated-catalog refresh must occur immediately after the reviewed content commit. This is required rather than deferred repair: `receipt-rules.ts:196-205` requires the verified hash to equal both the current document and the blob at `verifiedCommit`, with that commit an ancestor of `HEAD`; the new document bytes cannot truthfully be attested to the old HEAD. Until that content commit exists, the generated catalog necessarily retains the old receipt snapshot. Frozen dated research/history, deletion-ledger rows, and the codemod move table correctly retain the historical paths.

## Verified clean

- Read the complete old and new `WeaveGlyph`, old and new `QueryBoundary`, both moved CTs, the component/data/lib barrels, `type-worlds-client-components.ts`, the three coupled gates, their client-family integration test, the exact ESLint grant, brand SVG, and relevant test-baseline rows. The security-owned bug-report-capture implementation and the prepared forms recipe were excluded as directed.
- The initially stale living prose was repaired during review and read back: the five architecture documents, #885 design, exact ESLint-grant WHY, moved glyph CT header, and `use-online-status` CT pointer now identify the component ownership correctly. The #885 design explicitly retains its stories at `tests/client/data/_ct-stories.tsx`.
- Rechecked the two final design-receipt evidence coordinates directly against current source and test bytes. A stale-path sweep is clean outside the expected frozen/history, deletion-ledger, review, and one-shot move-map records; only the generated catalog snapshot awaits the required post-content-commit regeneration.
- Direct diffs confirm `QueryBoundary` changed only the five relative imports required by its new directory. `WeaveGlyph` changed only its header; both CT bodies are unchanged apart from the story/source imports required by relocation.
- An independent ts-morph comparison against immutable `/tmp/codex-weave-c93` found 105/105 symbol import sites preserved exactly by file, symbol, alias, declaration/specifier type flags, and expected destination module. The three same-owner component consumers route directly to `./query-boundary.tsx`.
- A separate export-structure comparison found the four public exports transferred exactly: value `QueryBoundary`/`WeaveGlyph` and type-only `QueryBoundaryProps`/`WeaveGlyphProps`; neither former barrel retains a stale export. The concurrent capture move accounts for the other three removals from `lib/index.ts`.
- The regenerated test baseline contains each new CT path once and carries one deletion-ledger row for each old path. `/tmp/codex-client-components-ct.log` records 11/11 component tests passing; `/tmp/codex-client-components-policy-tests.log` records the home-client policy suite passing 12/12 with no type errors.
- `/tmp/codex-client-component-gates.log` records all 20 query gate conformance examples green and both legacy gates clean over 1,316 real client sources. The final `render-error-via-battery` file was read in full; its canonical boundary home and every identity fixture now use the component path.
- A dependency-cruiser JSON run focused on the moved homes traversed 1,301 client modules with zero violations. An independent strongly connected component pass over its runtime edges found zero cycles, including the component barrel, its three same-owner consumers, and the component-to-data dependencies.
- Scoped ESLint over both moved production files, the component barrel, and root config passed. `git diff --check` over the component ownership paths passed.
- The immutable production-build comparison in `/tmp/codex-component-boot-check.md` built 3,519 modules on both sides. The HTML-declared boot payload changed by 440 bytes, and the questioned forms/editor initializer fingerprints were already retained in both baseline and candidate entry chunks; no boot regression is supported.
- `/tmp/codex-barrels-before-forms.log` records the lib, state, data, and UI-lib compiler probes with no DOM libraries and no diagnostics. Forms remains the explicitly reported outstanding barrel and is outside this applied checkpoint.
- The 104 consumer files whose only ownership change is a named import were not re-audited for unchanged product behavior: their body identity is covered by `/tmp/codex-client-components-proof.json` (`112` checked bodies, zero body changes) and the independent 105-site import-structure comparison above.

## Unconfirmed suspicions

None.

## Issue summary

The client-component ownership review found and resolved one low-severity documentation drift defect: living ownership prose and the #885 evidence targets initially named deleted QueryBoundary/WeaveGlyph homes; the final source, test, docs, comments, and receipt targets now agree. Runtime composition, public exports, all 105 imports, source/test bodies, source-mirror baseline rows, gate anchors, cycles, CT behavior, and measured boot payload are clean. Zero findings remain open. After the reviewed content commit, immediately attest the edited document/report hashes to that commit and regenerate the catalog, as required by the receipt verifier. Report: `docs/reviews/stickler/2026-09-08-client-component-ownership.md`.
