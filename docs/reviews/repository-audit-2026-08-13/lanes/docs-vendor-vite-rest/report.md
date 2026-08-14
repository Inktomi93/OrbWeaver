# Repository audit — docs-vendor-vite-rest

## Scope and corpus receipt

This lane covers the 20 remaining Vite vendor-reference documents assigned in `assignment.txt`: the corpus index, root pages, change notices, configuration pages, plugins, releases, and the compact Vite guide page. It excludes `docs/vendor/vite/guide/**` (the sibling guide lane), external Vite hosting behavior, and application behavior. Vendor documentation is context/reference material; it is not proof that Orbweaver implements the described Vite behavior.

Working-tree basis: `906d7aa125130e1c4691a7097c6725d8d31d113d`; assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`. All `20/20` assigned paths were fully read before searching and match their assigned SHA-256 values: `2860/2860` lines, `117196/117196` bytes, and zero scoped dirty paths. See `read-receipt.tsv` and `commands.md`.

The shared AST tool drifted after the assignment snapshot (`4099` → `4495` lines; assigned SHA `3fb787…`, current SHA `7f8dd9…`); no conclusion relies on the assigned tool body. A targeted current-tool scan is logged only for its actual result.

## Architecture and provenance observed

`docs/vendor/vite/INDEX.md:3-5` identifies the corpus as a Vite-docs mirror fetched from `https://vite.dev/llms.txt` on 2026-08-07, explicitly labels it reference-only, and says to re-fetch on a Vite version bump. `INDEX.md:7-14` identifies the Vite 8 / 8.2.x line, says the fetch observed latest `vite@8.2.1`, relates the workspace catalog's `^8.1.2`, and catalogues 42 pages. That is useful corpus-level status/provenance; it is not an immutable upstream source identity or executable refresh process.

The reference is locally relevant: `packages/client/package.json:45-49` declares catalog Vite/plugin dependencies, `pnpm-workspace.yaml:252` pins `vite: ^8.1.2`, and the installed client executable reports Vite 8.1.2. `packages/client/vite.config.ts:4-6` imports Vite and its React plugin; `:85` declares `devCspMirror`, and `:198` installs it. Vite configuration topics have direct config counterparts, including dependency optimization (`:200-208`), Vite future options (`:229-238`), build options (`:239-282`), and dev-server/fs policy (`:283-346`). These are R3 configuration receipts, not runtime feature verification.

The corpus correctly treats Vite 8 change pages as future/deprecation guidance (`docs/vendor/vite/changes.md:6-23`), and the local configuration deliberately opts into future warnings (`packages/client/vite.config.ts:210-238`). The exact document snapshot is Vite 8.2.1 context whereas the installed client is 8.1.2; `INDEX.md:8-10` names that same-major/minor drift rather than concealing it.

## Scorecards

| Surface | Implementation | Wiring | Verification | Enforcement | Operability | Basis |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Remaining Vite reference corpus (20 files) | 3 | 1 | 1 | 0 | 1 | Useful Vite-8 content and local index, but no link/freshness gate; offline navigation is incomplete. |
| Provenance/version status | 3 | 2 | 2 | 0 | 2 | Index supplies source/date/version and installed Vite confirms local version, but no immutable upstream revision or refresh contract. |
| Client Vite configuration relevance (bounded consumer check) | 2 | 3 | 1 | 1 | 2 | Config imports/uses Vite and targeted AST proves one plugin is wired; no dev/build behavior was executed. |

## Findings

### docs-vendor-vite-rest-01 — Offline vendored-link navigation is materially incomplete

- Severity: P3
- Confidence: high
- Class: operability-gap
- Evidence rung: R2
- Scope denominator: 20 assigned vendor documents; 255 links inventoried, including 38 relative links of which 31 do not resolve as literal repository paths.
- Receipts: `docs/vendor/vite/config/preview-options.md:11,21,28,32,57,64,68,73,82,91,95` links `./server-options`; `docs/vendor/vite/config/server-options.md:341` links `./shared-options`; `docs/vendor/vite/guide.md:10,14,16,18,225,266` and `docs/vendor/vite/plugins.md:7,10,56` contain representative non-resolving relative links. The inventory counted 255 links in scope: 73 Vite-site-root links and 31 of 38 relative links that do not resolve as literal repository paths.
- Impact: the stated local mirror cannot be navigated reliably as ordinary checked-out Markdown. The Vite-site-root links also require an unproved site router. This is an internal-documentation usability problem, not evidence that upstream Vite links are broken.
- Recommendation: choose and document one intended navigation mode. If checked-out Markdown is supported, rewrite/materialize links and add a scoped link check with one positive control. If a generated Vite-site router is required, make that generator/router explicit and test it.

### docs-vendor-vite-rest-02 — Snapshot refresh cannot be reproduced immutably

- Severity: P3
- Confidence: high
- Class: operability-gap
- Evidence rung: R0 for immutable upstream identity; R2 for the declared source/status
- Scope denominator: 20 assigned vendor documents and the current repository refresh-producer search scope recorded in `commands.md`; one mirror index has no immutable upstream revision or reproducible retrieval input.
- Receipts: `docs/vendor/vite/INDEX.md:3-5` records a date and `llms.txt` URL but no upstream Git SHA/tag, retrieval command, retained input, or generated manifest; `INDEX.md:7-14` supplies the version/status claim. A scoped current-tree search for the mirror/URL/fetch terms found no runnable or documented refresh producer outside the vendor tree (command and scope in `commands.md`).
- Impact: a later Vite bump cannot deterministically reconstruct or verify this exact mirror. The current index is honest enough to guide a manual re-fetch, but it cannot establish which upstream revision produced the corpus or prevent stale/mixed pages.
- Recommendation: record immutable upstream revision plus retrieval inputs/command (or a manifest with source hashes), and add a cheap freshness/consistency check. Keep the current reference-only disclaimer.

## Verification and limits

`pnpm check:docs` passed, but it only validates Markdown formatting. `pnpm --filter @orb/client exec vite --version` proved the installed Vite version, not an application build/dev-server behavior. The targeted AST reference scan completed with 2 hits in one file; the broad Vite-importer scan was partial/noisy and is intentionally not evidence. No production source, test, configuration, or shared audit artifact was edited by this lane.

## Cross-lane synthesis notes

The sibling Vite-guide corpus has the same Vite-site link topology; deduplicate link-policy remediation at corpus level. Conversely, do not carry a blanket “no provenance” claim into synthesis: `INDEX.md:3-14` supplies corpus-level source/date/version context. It still does not supply page-level immutable origin or a reproducible refresh mechanism, which is the narrower finding above.
