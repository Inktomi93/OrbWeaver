## Lane identity

- Lane: `docs-vendor-baseui-a-m`
- Semantic scope: 19 vendored Base UI component-reference pages, Accordion through Meter; documentation-reference quality only, not Orbweaver implementation proof.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; working-tree read basis `de133f16c45c0a3dcf6194fbee5c7804b72f8104`.
- Working-tree basis: all 19 owned hashes still equal the assignment; no owned path is dirty. Shared `scripts/codemods/ast.ts` changed after assignment (4,495 current lines versus 4,099 assigned), so AST receipts describe current bytes.
- Assigned files read: 19 / 19 (100%).
- Assigned lines read: 40,103 / 40,103 (100%).
- Assigned bytes read: 1,792,303 / 1,792,303 (100%).
- Dirty assigned paths: 0.
- Exclusions: other Base UI pages/INDEX, all production source and test semantic review, external URL availability, and behavior of the examples when copied into an app. Targeted code/import checks below are evidence edges only.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`, with the assignment line/byte totals and SHA-256 values exactly reconciled. All source pages are text; no binary carve-out applies.

## Architecture observed

The pages are standalone upstream-style API/reference documents. Each starts with a component title and a migration warning requiring `@base-ui/react` imports, e.g. Accordion at `docs/vendor/base-ui/components/accordion.md:1-13`; it is not an Orbweaver design or implementation declaration. The local UI package depends on `@base-ui/react` at `packages/ui/package.json:102-104`, resolves lockfile version 1.7.0 at `pnpm-lock.yaml:1068-1075`, and an AST import path reaches the Accordion seal at `packages/ui/src/primitives/accordion/accordion.tsx:1-8` (R3). This only establishes import alignment, not that the vendored text is synchronized to 1.7.0 or that an example behavior works.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| A–M Base UI vendor reference corpus (19 pages / 40,103 lines) | 3 | 1 | 1 | 0 | 1 | high | Full-read receipt; component/API sections including `accordion.md:11,590-596`; `pnpm check:docs`; 171 broken repository-local paths. |
| Local package-name alignment edge (one positive and one negative module check) | 2 | 3 | 0 | 3 | 0 | high | `accordion.md:9`; `packages/ui/src/primitives/accordion/accordion.tsx:1-8`; AST 4,812-file receipt; `packages/ui/package.json:102-104`; `pnpm-lock.yaml:1068-1075`. |

The corpus earns implementation 3 only as documentation content: each assigned page has component prose, examples, and an API reference. It does **not** describe an Orbweaver feature implementation. Verification is 1 because formatting passes, but no check ties page content or links to the installed package. Enforcement 0 means no owned-page freshness/provenance or link-reachability guard was found; the installed-surface tooling is a different artifact and cannot prove these docs current.

## Findings

### `docs-vendor-baseui-a-m-01` — 171 root-relative links are unusable from the vendored corpus

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R2
- Scope denominator: 171 `/react/components/...` or `/react/handbook/...` links in 19 fully read pages; all 19 pages contain one or more, as the per-file `rg -c` receipt in `commands.md` records.
- Receipts: `docs/vendor/base-ui/components/accordion.md:592`; `docs/vendor/base-ui/components/field.md:214`; `docs/vendor/base-ui/components/drawer.md:284`; `docs/vendor/base-ui/components/combobox.md:531-534`; root-relative-link scan in `commands.md`.
- Established fact: links such as `[Root](/react/components/accordion.md)` and `[Root](/react/components/field.md)` are Base UI site-root paths, not paths under `docs/vendor/base-ui/`; this repository has no matching vendored `/react/...` root. The safe formatting check passed but performs no link validation.
- User or system impact: an offline/repository reader following cross-component or handbook guidance is taken outside the snapshot (or to a dead repository-local route). This makes the intended reference corpus materially less usable, although it does not alter application runtime.
- What remains unverified: whether a particular documentation host rewrites `/react/...` to base-ui.com. That does not restore offline/repository navigation.
- Suggested next check or fix: make the mirror’s link policy explicit: rewrite links to local mirrored paths or convert them to absolute, version-pinned upstream URLs; add a scoped link checker with a positive control.

### `docs-vendor-baseui-a-m-02` — pages cannot prove which upstream release they mirror

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R0 for an upstream-version claim; R2 for the pages’ component-document declarations.
- Scope denominator: 19 / 19 owned pages. Full reads and the metadata-key search found no source URL, version, snapshot, retrieval date, or update field in any assigned page.
- Receipts: `docs/vendor/base-ui/components/accordion.md:1-13`; `docs/vendor/base-ui/components/field.md:1-11`; absence scan and full-read receipt in `commands.md`; installed dependency evidence `packages/ui/package.json:102-104` and `pnpm-lock.yaml:1068-1075`.
- Established fact: the files identify a component and correctly instruct readers to use the renamed package, but their front matter has only `title`, `subtitle`, and `description`; no owned page states a release/version or source/retrieval provenance. The repository currently installs Base UI 1.7.0, but the pages do not themselves establish that they are 1.7.0.
- User or system impact: a maintainer cannot decide whether an API example is applicable after a package upgrade, and drift can look authoritative because the pages explicitly ask readers to prefer them over prior knowledge (`accordion.md:7-9`).
- Cross-lane correction: `docs/vendor/base-ui/INDEX.md:1-5` records corpus-level upstream pattern, retrieval date (2026-08-07), and installed Base UI 1.7.0. That mitigates the version/provenance issue for readers who enter through the index; individual deep-linked pages still do not identify or link back to that snapshot metadata.
- Suggested next check or fix: expose the existing corpus-level provenance from every deep-linked page or hosting view and add a maintained refresh/link policy.

## Proven strengths

- `pnpm check:docs` completed successfully, proving the current pages meet the repository formatter’s syntax/style requirements: R5 for formatting only, not link/freshness correctness.

## Declared versus completed

| Declared surface | Strongest evidence | Audit conclusion |
| --- | --- | --- |
| Component/API guidance for Accordion through Meter | R2: every assigned page’s title, prose, examples, and API sections; e.g. `accordion.md:11,590-596` | Present as an upstream-style reference, not Orbweaver behavior proof. |
| Use renamed package name | R3: `accordion.md:9` + resolved local Accordion import | Targeted consumer alignment is established. |
| Form module is locally imported | R0: `pnpm ast importers @base-ui/react/form` returned zero with 4,812 scanned files; literal import search independently found none | No local Form import was established; this is not a defect because the reference corpus may intentionally exceed live use. |
| Cross-component/handbook navigation | R2: 171 root-relative links | Declared links exist but are not repository-local navigable. |
| Version-fresh documentation snapshot | R2 corpus metadata / R0 per-page | `docs/vendor/base-ui/INDEX.md:1-5` records a 1.7.0 retrieval snapshot; owned deep-linked pages do not expose it and no freshness behavior is enforced. |

## Tests and gates

No tests are assigned to this documentation-only lane (unit 0, integration 0, contract 0, CT 0, e2e 0, type 0). `pnpm check:docs` passed and only reports the markdown formatter. It supplies no broken-link, upstream-release, rendered-example, or installed-surface-to-vendor-doc positive control. The local Base UI surface/manifests seen in literal search are out-of-scope implementation/gate artifacts; their existence does not validate the prose mirror.

## Cross-lane edges

- `docs-vendor-baseui-rest` confirms `docs/vendor/base-ui/INDEX.md:1-5` carries corpus-level source/version/retrieval metadata. This partially mitigates finding 02; it does not repair a deep-linked page’s inability to identify or navigate to that version context.
- The Base UI gate/tooling lane should determine whether `scripts/check/baseui-surface.manifest.json` (literal hit) and its positive controls can be extended to verify documentation snapshot/version metadata and link policy. This lane makes no claim that such a gate is absent outside its owned pages.
- UI primitive lanes own behavioral correctness for the local seals. This lane’s import evidence is intentionally limited to package-name/subpath alignment.

## Tool receipts

`pnpm ast` was read from current working-tree bytes and invoked bare; its targeted `importers` calls completed with a 4,812-file typed corpus (`dts:2`, `ts:3,769`, `tsx:1,041`), no skipped files, and no tool failure. Exact module literal search was the independent check for strings/config/dependency evidence. The link and metadata scans cover all 19 owned Markdown files; the 171-link count is the sum of each file’s `rg -c` result. External URL reachability, vendored pages outside A–M, `node_modules`, generated outputs, and sibling-owned semantic source review were excluded.

## Lane verdict

All 19 assigned files were fully read and byte-reconciled against the lane snapshot.
They provide substantial component/API reference content and correctly name the current package spelling.
The corpus index identifies a 1.7.0 retrieval snapshot, but the assigned deep-linked pages are not self-identifying or self-verifying and do not expose that context.
Their 171 root-relative documentation-site links are not usable as offline/repository-local navigation.
The only current proof is formatting plus a targeted local import-alignment edge; it is not behavioral or documentation-freshness proof.
No production code, tests, gate, law, or sibling artifact was modified.
