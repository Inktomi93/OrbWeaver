## Lane identity

- Lane: `docs-vendor-baseui-rest`
- Semantic scope: the remaining 12 Base UI vendor-reference pages (corpus index, handbooks, 1.7.0 release notes, and utilities); documentation-reference quality only, never Orbweaver implementation proof.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; working-tree read basis `906d7aa125130e1c4691a7097c6725d8d31d113d`.
- Working-tree basis: all 12 owned hashes equal the assignment and no owned path is dirty. The shared AST instrument changed after assignment, so AST receipts describe its current 4,495-line working-tree version.
- Assigned files read: 12 / 12 (100%).
- Assigned lines read: 7,796 / 7,796 (100%).
- Assigned bytes read: 255,776 / 255,776 (100%).
- Dirty assigned paths: 0.
- Exclusions: other Base UI reference pages, production-source/test correctness, external URL availability, and execution of copied examples. Targeted import/configuration checks are evidence edges only.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`, exactly reconciling the frozen line, byte, and SHA-256 totals. All owned paths are text documents; no binary carve-out applies.

## Architecture observed

The owned pages are explicitly a verbatim Base UI documentation snapshot rather than an Orbweaver design declaration: the index identifies the upstream path, fetch date, and installed version at `docs/vendor/base-ui/INDEX.md:1-5`. The index says the handbook is cross-cutting reference and Forms is authority for Field/Form/TanStack integration (`docs/vendor/base-ui/INDEX.md:10-16`); the current package declares `@base-ui/react` (`packages/ui/package.json:102-104`) and the lockfile resolves 1.7.0 (`pnpm-lock.yaml:1068-1075`). This establishes snapshot and package alignment, not that any copied example runs in Orbweaver. Direct Field imports in five UI files provide a local consumer edge, e.g. `packages/ui/src/primitives/field/field.tsx:1-2` (R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Remaining Base UI vendor corpus (12 pages / 7,796 lines) | 3 | 1 | 1 | 0 | 2 | high | Full-read receipt; `INDEX.md:1-18`; `handbook/forms.md:11-16`; `utils/merge-props.md:11-39`; `pnpm check:docs`. |
| Corpus provenance/version alignment | 3 | 2 | 1 | 0 | 2 | high | `INDEX.md:1-5`; `releases/v1-7-0.md:1-13`; `packages/ui/package.json:102-104`; `pnpm-lock.yaml:1068-1075`. |
| Targeted Forms/Field consumer edge | 2 | 3 | 0 | 3 | 0 | high | `handbook/forms.md:11-16`; exact imports including `packages/ui/src/primitives/field/field.tsx:1-2`; completed AST receipt. |

The corpus earns implementation 3 as reference content: handbook, release, and API prose are present, but it says nothing about an Orbweaver feature implementation. The version row earns only verification 1 because format checking and the installed-package surface do not validate the snapshot's text. Enforcement 0 means no freshness or local-link rule was established for the owned pages.

## Findings

### `docs-vendor-baseui-rest-01` — 13 upstream-root links cannot navigate inside the repository mirror

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R2
- Scope denominator: 13 `/react/components`, `/react/handbook`, or `/react/utils` links across 7 of 12 fully read owned documents: Forms 2, Styling 2, Customization 1, CSP Provider 1, Direction Provider 1, mergeProps 3, and useRender 3.
- Receipts: `docs/vendor/base-ui/handbook/forms.md:15,1508`; `docs/vendor/base-ui/handbook/styling.md:36,46`; `docs/vendor/base-ui/utils/merge-props.md:356-360`; `docs/vendor/base-ui/utils/use-render.md:325,364`; full scan and absent-local-subtree check in `commands.md`.
- Established fact: examples such as `[Dialog](/react/components/dialog.md)` and `[mergeProps](/react/utils/merge-props.md)` resolve from a documentation-site root, while no `docs/vendor/base-ui/react` subtree exists. `pnpm check:docs` passes without checking those targets.
- User or system impact: a reader using the vendored corpus offline or in a repository viewer cannot follow its cross-reference path. This affects reference usability, not application runtime.
- What remains unverified: a hosted documentation renderer might rewrite these paths to Base UI's public site. That would not make repository-local/offline navigation work.
- Suggested next check or fix: define a mirror-link policy: rewrite to the local vendored layout or preserve version-pinned absolute upstream links, then add a scoped link check with a positive control.

### `docs-vendor-baseui-rest-02` — the documented re-fetch path is not reproducible from the current checkout

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R2
- Scope denominator: one corpus-level refresh instruction in the Base UI index; searched current executable/config surfaces were `scripts/`, `tests/`, root `package.json`, and the lockfile.
- Receipts: `docs/vendor/base-ui/INDEX.md:3-5`; root scripts at `package.json:63`; bounded executable/config search recorded in `commands.md`.
- Established fact: the index correctly says to re-fetch on a version bump, but says the fetch-script shape exists only in git history. The current root scripts expose only `format:docs` and `check:docs`, and the bounded current-tree search identified no mirror refresh entry point.
- User or system impact: after a dependency bump, the documented source of truth tells an agent to refresh but not how to do so from the checked-out repository. It increases the chance of a stale mirror or an unreproducible hand-made snapshot.
- What remains unverified: an equivalent command may be recoverable from git history or an external operational runbook; neither is a current, repository-local procedure established by this audit.
- Suggested next check or fix: keep a tracked, documented re-fetch command (or an exact documented upstream command) next to the index, and make the version it emits/checks agree with the installed package.

## Proven strengths

- `pnpm check:docs` passed, proving the current owned Markdown meets the repository formatting check: R5 for formatting only, not link or snapshot correctness.

## Declared versus completed

| Declared surface | Strongest evidence | Audit conclusion |
| --- | --- | --- |
| Verbatim v1.7.0 documentation mirror | R3: `INDEX.md:1-5`, release header, installed package/lockfile | Version and retrieval are declared at corpus level; content equivalence to upstream was not independently downloaded or executed. |
| Forms/Field/TanStack reference authority | R3: `INDEX.md:11-12`, `handbook/forms.md:11-16`, exact Field imports | A relevant local consumer edge exists; no claim is made that Base UI Form, React Hook Form, or TanStack Form integration is locally implemented. |
| Cross-page documentation navigation | R2: 13 root-relative links | Links are declared but not repository-local navigable. |
| Re-fetch on dependency bump | R2: `INDEX.md:3-5` | Intent is clear, but current checkout lacks a documented runnable refresh path. |

## Tests and gates

No tests are assigned to this documentation-only lane (unit 0, integration 0, contract 0, CT 0, e2e 0, type 0). `pnpm check:docs` passed but is a markdown formatter only. The local Base UI surface gates and package manifest prove installed API surface alignment, not upstream-document text equality, deep-link reachability, or mirror refreshability. The lane did not inspect those sibling-owned gate implementations beyond targeted literal evidence.

## Cross-lane edges

- `docs-vendor-baseui-a-m` should treat this index as the corpus-level mitigation to any per-page provenance gap: `docs/vendor/base-ui/INDEX.md:1-5` supplies the 1.7.0 source/retrieval record. It still does not give a deep-linked individual page its own provenance.
- A Base UI gate/tooling owner should decide whether the installed-surface pipeline can also verify index version and the vendor mirror link policy. This lane does not claim that the present surface gates are missing such a capability outside the bounded searches recorded above.
- UI primitive lanes own whether the Forms examples and utility guidance are correctly applied; this lane only established one targeted `@base-ui/react/field` consumer edge.

## Tool receipts

The current AST tool was read and invoked bare. One targeted `importers` query completed with the scan ledger: 4,812 typed files, zero skipped, nine package-substring matches; exact import literals independently resolved seven direct Field imports. Root-relative-link scans cover every owned Markdown page and the local target absence check is explicit. Formatting passed. No tool failure supports any finding; external reachability, vendored pages outside the lane, `node_modules`, generated output, and sibling semantic source/test review are excluded.

## Lane verdict

All 12 owned files were fully read and hash-reconciled to the frozen snapshot.
This half of the corpus fixes the per-page provenance weakness with a strong corpus index: source pattern, fetch date, and 1.7.0 target are explicit.
The package and release declaration agree on 1.7.0, and the renamed package has a targeted local consumer edge.
The mirror remains less useful than it looks offline: 13 root-relative links do not resolve within the repository.
Its index also requires re-fetching on an upgrade while directing the procedure to git history rather than a current runnable command.
Formatting is current; no behavioral, external-link, or upstream-text-equivalence verification was established.
No production code, tests, gates, law, or sibling artifact was modified.
