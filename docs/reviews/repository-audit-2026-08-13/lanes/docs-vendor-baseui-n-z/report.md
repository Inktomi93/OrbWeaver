## Lane identity

- Lane: `docs-vendor-baseui-n-z`
- Semantic scope: 18 vendored Base UI component-reference documents, Navigation Menu through Tooltip. This is a reference-corpus audit; it does not establish Orbweaver feature implementation.
- Snapshot commit: dispatch `41e18afe74afa570b67a3e670a1a38863c486a00`; bytes read on working tree `906d7aa125130e1c4691a7097c6725d8d31d113d`.
- Working-tree basis: all owned hashes still equal the dispatch assignment; no owned path was dirty.
- Assigned files read: 18 / 18 (100%).
- Assigned lines read: 27,713 / 27,713 (100%).
- Assigned bytes read: 1,341,243 / 1,341,243 (100%).
- Dirty assigned paths: 0.
- Exclusions: no source, tests, configuration, or other vendor documents are owned by this lane. Base UI usage outside the owned documents was queried only to assess reference applicability.

## Read receipt

`read-receipt.tsv` covers all 18 rows in `assignment.txt`; its line, byte, and SHA-256 values match the assignment and the closing hash recheck.

## Architecture observed

Each file is a copied Base UI component reference with title/subtitle/description front matter and a warning to use `@base-ui/react`, for example Navigation Menu [docs/vendor/base-ui/components/navigation-menu.md:1](../../../../../docs/vendor/base-ui/components/navigation-menu.md:1) and [docs/vendor/base-ui/components/navigation-menu.md:9](../../../../../docs/vendor/base-ui/components/navigation-menu.md:9). The local UI package declares that dependency through the catalog [packages/ui/package.json:103](../../../../../packages/ui/package.json:103), and the lockfile resolves it to 1.7.0 [pnpm-lock.yaml:1068](../../../../../pnpm-lock.yaml:1068). This establishes documentation/package-name compatibility only, not that each documented component is selected or correctly integrated.

The structural importer lens proves direct local Base UI imports for Number Field [packages/ui/src/primitives/number-field/number-field.tsx:1](../../../../../packages/ui/src/primitives/number-field/number-field.tsx:1) and Popover [packages/ui/src/primitives/popover/popover.tsx:12](../../../../../packages/ui/src/primitives/popover/popover.tsx:12) at R3. By contrast, the same completed 4,812-file lens found no direct imports of the Navigation Menu, OTP Field, or Preview Card modules; the 4,602-file literal cross-check agrees. That is not a claim those user-facing concepts are absent: local wrappers, a different primitive, or no declared need can explain it.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Vendored Base UI N–Z reference corpus (18 Markdown files) | 2 | 2 | 1 | 1 | 1 | high | 18 full-read receipts; current `@base-ui/react` dependency [packages/ui/package.json:103](../../../../../packages/ui/package.json:103); two R3 importer receipts; `pnpm check:docs` only checks formatting. |

The scores describe the reference corpus rather than a product subsystem: its content is present, but its source revision is not reproducible, its route links are not locally usable, and no sync/link-validation mechanism was found in this lane.

## Findings

### `docs-vendor-baseui-n-z-01` — deep-linked vendor pages hide corpus provenance and retain unusable docs-site routes

- Severity: P3
- Class: operability-gap
- Confidence: high — source/retrieval/version metadata is absent from all 18 full-read pages, although the sibling corpus index records it; 144 `/react/...` route-absolute links were counted and `react/` does not exist at the repository root.
- Evidence rung: R2 for the copied-reference content and its retained links; R3 only for selected local package consumers. No R4/R5 freshness or hyperlink proof exists.
- Scope denominator: 18 owned documents / 27,713 lines / 1,341,243 bytes; all documents have the same basic front-matter shape, with representative routes at [docs/vendor/base-ui/components/select.md:499](../../../../../docs/vendor/base-ui/components/select.md:499), [docs/vendor/base-ui/components/tooltip.md:425](../../../../../docs/vendor/base-ui/components/tooltip.md:425), and [docs/vendor/base-ui/components/navigation-menu.md:2727](../../../../../docs/vendor/base-ui/components/navigation-menu.md:2727).
- Receipts: per-file route-link counts: navigation-menu 14; number-field 8; otp-field 6; popover 11; preview-card 8; progress 5; radio 7; scroll-area 6; select 24; separator 1; slider 10; switch 5; tabs 5; toast 14; toggle-group 1; toggle 1; toolbar 6; tooltip 12 (144 total). Commands and zero-search coverage are recorded in `commands.md`.
- Established fact: the documents explicitly identify the correct renamed package [docs/vendor/base-ui/components/number-field.md:9](../../../../../docs/vendor/base-ui/components/number-field.md:9), but none identifies or links to the corpus snapshot metadata. Cross-lane `docs/vendor/base-ui/INDEX.md:1-5` does record the upstream pattern, 2026-08-07 retrieval, and installed Base UI 1.7.0. Their preserved `/react/...` paths still target Base UI’s hosted namespace rather than any tracked local path.
- User or system impact: a deep-linked reader can consume useful API material but cannot see its 1.7.0 snapshot context or follow its cross-references in this checkout without separately discovering the index.
- What remains unverified: current upstream parity and a reproducible refresh command; no claim is made that the copied API details are incorrect.
- Suggested next check or fix: expose/link the existing index provenance from component pages, and either convert route links to maintained upstream URLs or provide a local link map plus a link check.

## Proven strengths

None qualify. The name migration guidance agrees with the installed package name, and R3 importers prove selected local use, but neither proves version-aligned documentation behavior at R4/R5.

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| --- | --- | --- |
| 18 component API references and examples | R2: the files fully contain component prose, examples, props, states, and export-group declarations, e.g. [docs/vendor/base-ui/components/toast.md:1](../../../../../docs/vendor/base-ui/components/toast.md:1). | Content exists; freshness is not established. |
| `@base-ui/react` package-name guidance | R3: every owned file’s rename warning, package declaration [packages/ui/package.json:103](../../../../../packages/ui/package.json:103), resolved lock entry [pnpm-lock.yaml:1068](../../../../../pnpm-lock.yaml:1068), and corpus metadata at `docs/vendor/base-ui/INDEX.md:1-5`. | Name/version align at corpus level; individual pages do not expose that provenance. |
| Number Field and Popover are locally applicable references | R3: direct module importer scans at [packages/ui/src/primitives/number-field/number-field.tsx:2](../../../../../packages/ui/src/primitives/number-field/number-field.tsx:2) and [packages/ui/src/primitives/popover/popover.tsx:12](../../../../../packages/ui/src/primitives/popover/popover.tsx:12). | Referenced locally; behavior not tested by this lane. |
| Navigation Menu, OTP Field, Preview Card direct Base UI imports | R0 for a direct-import assertion: completed structural scans and literal cross-check found none. | Not evidence that an Orbweaver feature is absent or unwired. |

## Tests and gates

There are no owned tests. `pnpm check:docs` passed, proving only current formatting of 104 Markdown files. It neither validates the 144 preserved docs-site routes nor proves the snapshot’s Base UI version or API accuracy; no positive control was run, so it is not an R5 usability/freshness strength.

## Cross-lane edges

- The remaining-corpus lane confirms shared provenance in `docs/vendor/base-ui/INDEX.md:1-5`; synthesis must not report a corpus-wide absence of source/version metadata. The offline-link and per-page context gaps remain.
- The UI/source owner may use the R3 wrapper citations above if it needs to validate API-version compatibility, but this lane deliberately did not read or judge those implementations.

## Tool receipts

`pnpm ast` was read and run bare before structural use. Completed importer scans covered 4,812 files (`dts:2`, `ts:3769`, `tsx:1041`) per query. The two positive scans respectively found 2 imports in 1 Number Field file and 4 imports in 3 Popover files; three negative direct-module scans were complete and are backed by a 4,602-file literal search. Markdown link and provenance scans are non-code literal analyses; full commands, counts, and no-tool-failure record are in `commands.md`.

## Lane verdict

All 18 assigned reference documents were read and their hashes exactly reconcile with the assignment. They supply extensive Base UI API/examples and consistently name the current package, with selected direct local consumers proven at R3. The corpus index records the 1.7.0 source/retrieval context, but the owned pages do not expose it and their 144 docs-site route links cannot resolve inside this repository. Formatting passes but does not cover those usability gaps. No claim is made about Base UI correctness or any Orbweaver feature implementation.
