## Lane identity

- Lane: `docs-vendor-vite-guide`
- Semantic scope: 23 vendored Vite guide pages; their reference quality, provenance, repository-local navigation, and targeted local relevance only. They are not Orbweaver implementation proof.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; working-tree read basis `906d7aa125130e1c4691a7097c6725d8d31d113d`.
- Working-tree basis: all 23 owned hashes equal assignment; no owned path is dirty. Shared `scripts/codemods/ast.ts` changed after assignment (current 4,495 lines vs assigned 4,099), so AST receipts describe current bytes.
- Assigned files read: 23 / 23 (100%).
- Assigned lines read: 6,994 / 6,994 (100%).
- Assigned bytes read: 310,753 / 310,753 (100%).
- Dirty assigned paths: 0.
- Exclusions: Vite pages outside `guide/`, external-host availability, application behavior, and sibling-owned source/test/gate semantics. Targeted configuration/import checks are evidence edges only.

## Read receipt

`read-receipt.tsv` covers all 23 `OWNED` assignment rows and reconciles lines, bytes, and SHA-256 exactly; all pages are text. The shared prerequisite changed after assignment, disclosed above, but no owned guide page drifted.

## Architecture observed

The pages are a Vite-site documentation mirror: every page declares only a site route, e.g. `docs/vendor/vite/guide/api-environment.md:1-4`, then offers upstream concepts or configuration guidance such as production builds (`docs/vendor/vite/guide/build.md:4-19`) and plugins (`docs/vendor/vite/guide/api-plugin.md:4-18`). They neither declare nor prove an Orbweaver subsystem. The local client config imports Vite's `defineConfig` and workspace-root helper (`packages/client/vite.config.ts:5-6`) and declares Vite via the workspace catalog (`packages/client/package.json:48`, `pnpm-workspace.yaml:252`): a targeted R3 relevance edge, not evidence that each guide instruction is adopted.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Vite vendor-guide corpus (23 pages / 6,994 lines) | 3 | 1 | 1 | 0 | 1 | high | Full receipt; `api-javascript.md:4-12`, `build.md:4-19`; `pnpm check:docs`; 100 root-relative plus 35 verbatim-missing relative targets. |
| Local Vite relevance edge | 2 | 3 | 0 | 3 | 0 | high | `packages/client/vite.config.ts:5-6`; `packages/client/package.json:48`; `pnpm-workspace.yaml:252`; complete AST corpus plus exact-specifier cross-check. |

The corpus earns implementation 3 only as documentation: it has substantive guide prose and examples. Formatting is the only current automated verification. No owned-page freshness or link policy is enforced. The local edge establishes an active Vite configuration, never that the mirrored guides describe its actual configuration or behavior.

## Findings

### `docs-vendor-vite-guide-01` — the mirrored guide links require an absent Vite-site router

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R2
- Scope denominator: 100 root-relative links and 35 relative targets that do not name an existing repository file verbatim across all 23 fully read pages; per-file counts are in `commands.md`.
- Receipts: `docs/vendor/vite/guide/api-plugin.md:12,261-262`; `docs/vendor/vite/guide/features.md:18,24,28`; `docs/vendor/vite/guide/build.md:6,19,32-34`; local-target scan in `commands.md`.
- Established fact: site routes such as `/guide/features`, `/config/build-options.md`, and extensionless `./api-javascript` are valid only when a Vite documentation site supplies route rewriting. The repository contains the Markdown file `api-javascript.md`, not the literal target `api-javascript`, and has no repository-root `/guide` or `/config` routing surface.
- User or system impact: a reader using this tree as a local/offline reference cannot reliably follow cross-guide or configuration references; useful supporting context is displaced to an unproven external host or a dead local target.
- What remains unverified: whether the eventual documentation viewer rewrites these site routes. Such hosting would need explicit proof and still would not make normal repository-file navigation work.
- Suggested next check or fix: declare the vendor-mirror navigation policy: rewrite targets to local Markdown paths, or convert all Vite-site links to explicit absolute/version-pinned upstream URLs; add a scoped link check with a known-good local link and known-bad control.

### `docs-vendor-vite-guide-02` — no assigned page identifies the upstream Vite snapshot it mirrors

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R0 for upstream-version/snapshot identity; R2 for the pages' guide declarations.
- Scope denominator: 23 / 23 owned pages. Each front matter has a `url` route, e.g. `docs/vendor/vite/guide/api-environment.md:1-2`, but no source revision, Vite release, snapshot date, retrieval date, or update field.
- Receipts: `docs/vendor/vite/guide/api-javascript.md:1-4`; `docs/vendor/vite/guide/build.md:1-4`; full reads and metadata scan in `commands.md`; the installed client range is `^8.1.2` at `pnpm-workspace.yaml:252`.
- Established fact: the corpus contains version-sensitive material, including explicitly release-candidate Environment API guidance (`docs/vendor/vite/guide/api-environment.md:4-18`) and API/deprecation direction (`docs/vendor/vite/guide/api-javascript.md:380-404`), but no owned page can establish which Vite documentation revision it mirrors. Local Vite is independently resolved to 8.1.2, but that does not synchronize the docs.
- User or system impact: maintainers cannot tell whether a recommendation applies to the installed Vite release, and future package upgrades can leave an authoritative-looking yet stale reference corpus.
- What remains unverified: the sibling-owned Vite index/rest corpus may provide corpus-level provenance. It could partially mitigate discoverability but cannot make a deep-linked guide page self-identifying.
- Suggested next check or fix: have `docs-vendor-vite-rest` inspect the Vite corpus index for source/version/retrieval metadata; if absent, add one visible corpus-level provenance record and check it against the installed Vite lockfile surface.

## Proven strengths

- `pnpm check:docs` currently passes: R5 for markdown formatting only, high confidence (`commands.md`). It does not prove link reachability, source freshness, or guide applicability.

## Declared versus completed

| Declared surface | Strongest evidence | Audit conclusion |
| --- | --- | --- |
| Vite guide/reference content | R2: titles, prose, and examples, e.g. `features.md:4-20`, `build.md:4-28` | Present as upstream-style guidance, not Orbweaver implementation evidence. |
| Production/build and plugin guidance | R2: `build.md:4-19`; `api-plugin.md:4-18` | Readable content exists; no test establishes that it matches installed Vite. |
| Cross-reference navigation | R2: 100 root-relative and 68 relative Markdown targets | Declared links exist but 100 need a site router and 35 relative targets do not literally resolve in the tree. |
| Vite snapshot/release identity | R0 | Not established by any owned page. |
| Local Vite use | R3: config import and dependency declaration | Targeted configuration relevance established; source-level usage beyond that is intentionally out of scope. |

## Tests and gates

No tests are assigned to this documentation-only lane (unit 0, integration 0, contract 0, CT 0, e2e 0, type 0). `pnpm check:docs` passes but is a formatter check. Its successful result is not behavioral proof and has no positive control for broken link targets or stale upstream provenance. `pnpm ast` has no Markdown/link/provenance lens; its broad `importers vite` result is complete (4,812 files scanned) but matches unrelated Vitest spellings, so exact literal/specifier inspection is the appropriate second method for the limited consumer edge.

## Cross-lane edges

- `docs-vendor-vite-rest` owns any Vite index/config/asset mirror pages. It should determine whether an index carries corpus-level source/revision/retrieval metadata and whether missing targets are mirrored elsewhere; this lane did not inspect those files.
- `developer-runtime` or the appropriate client/tooling lane owns Vite configuration correctness. The limited import/version evidence here must not be read as validation of `packages/client/vite.config.ts` behavior.
- A docs/gate lane should determine whether the active doc formatter can host a link/provenance check with a positive control; no absence claim is made beyond this assigned corpus and the instrument's documented lenses.

## Tool receipts

Bare `pnpm ast` completed after reading current `scripts/codemods/ast.ts`; the tool reports its supported structural lenses and no Markdown-link/provenance lens. `pnpm ast importers vite` completed with 4,812 typed files scanned (`dts:2`, `ts:3,769`, `tsx:1,041`), 974 matches in 956 files, zero skipped; it is unsuitable for the exact module-name conclusion because `vite` also matches Vitest-related imports. Exact literal search and full reads establish the narrow client Vite edge. The Markdown-target scan covers all 23 owned files: 100 root-relative, 68 relative, and 35 verbatim-missing relative targets. No command failed.

## Lane verdict

All 23 assigned pages were fully read and byte-reconciled to the lane snapshot.
They offer substantive upstream Vite guide content and a targeted active local Vite consumer exists.
They cannot identify which Vite documentation revision they mirror.
Their cross-page references depend on a Vite-site router absent from ordinary repository navigation.
Formatting currently passes; it is not a freshness, compatibility, or link-reachability control.
No product code, test, gate, law, or sibling-owned artifact was changed.
