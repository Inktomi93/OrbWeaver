## Lane identity

- Lane: `dependency-lock`
- Semantic scope: the one owned pnpm lockfile, its immutable workspace-resolution and dependency-health behavior.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` from `assignment.txt`.
- Working-tree basis: lockfile bytes read from the current working tree; current HEAD was `189f2c71e76e16f947f6de7dd35634d7bffc9c0c` (C05).
- Assigned files read: 1 / 1 (100%).
- Assigned lines read: 14,341 / 14,341 (100%).
- Assigned bytes read: 486,132 / 486,132 (100%).
- Dirty assigned paths: 0. The lane output directory was untracked until this audit created its three owned artifacts; `pnpm-lock.yaml` was clean (C05, C15).
- Exclusions: package manifests, source, tests, gates, and every sibling lane are outside this lane. Machine-local pnpm-store mutation is reported as audit state only, not a repository finding (C08).

## Read receipt

`read-receipt.tsv` covers 100% of the one `OWNED` assignment entry. Its current SHA-256 is exactly the assignment SHA: `561939039fe1be2908269d5407e5185fbd9e5943febfd6ae9d06d5a0f61a7036` (C03, C05, C15).

## Architecture observed

The lock is a pnpm v9 workspace graph: 7 importers (root plus six package paths), 161 direct importer dependency entries, 1,419 resolved package records, and 1,421 snapshots (C09). Its structural sections are `settings` at [pnpm-lock.yaml:3](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:3), `catalogs` at [pnpm-lock.yaml:7](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:7), `overrides` at [pnpm-lock.yaml:328](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:328), `patchedDependencies` at [pnpm-lock.yaml:332](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:332), importers at [pnpm-lock.yaml:335](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:335), packages at [pnpm-lock.yaml:845](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:845), and snapshots at [pnpm-lock.yaml:7503](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:7503). Strict YAML parsing found SHA-512 integrity on all 1,419 package resolutions and no tarball, git, or local resolution (C03, C09; R4); an offline immutable pnpm install accepted the exact graph across all seven workspaces (C07; R5).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| pnpm workspace lock integrity (1 lockfile; 7 importers; 1,419 package resolutions) | 4 | 5 | 2 | 2 | 2 | high | Strict all-record parse and universal SHA-512 integrity (C03, C09; R4); offline frozen install and workspace listing (C07–C08; R5); deductions for current peer, audit, and dedupe nonzeros (C10–C14). |

## Findings

### DEPLOCK-01 — High advisory records include two bounded production-input upgrade candidates

- Severity: P2
- Class: operability-gap
- Confidence: high for the advisory inventory; medium for sharp exploitability and low for the PDF.js advisory preconditions.
- Evidence rung: R5 for the current online package-manager inventory and application integration tests; R3 for the traced application call paths.
- Scope denominator: 1,419 package resolutions / 1,421 snapshots / 32 online advisory records (0 critical, 12 high, 17 moderate, 3 low). The 12 high records collapse to 7 package families and 10 distinct GHSAs; repeated dependency paths and duplicate-family records are not independent exploits.
- Receipts: `sharp@0.34.5` is resolved at [pnpm-lock.yaml:6754](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:6754) and `pdfjs-dist@6.1.200` at [pnpm-lock.yaml:6370](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:6370). The security reconciliation traces authenticated raster upload/variant decode through `packages/server/src/entry/http/upload.ts:95-129`, `packages/server/src/domain/assets/verbs/resolve-variant.ts:20-42`, and `packages/server/src/infra/image/index.ts:115-136`; it traces PDF upload/extraction through `packages/server/src/entry/http/upload.ts:133-162`, `packages/server/src/domain/databank/verbs/upload.ts:29-42`, and `packages/server/src/infra/extraction/loaders/pdf.ts:65-88`. Full advisory-family and reachability receipts are in `SECURITY-VALIDATION.md`.
- Established fact: online `pnpm audit --json` confirms the same 32/12-high inventory. Untrusted authenticated image bytes reach sharp, making its pre-0.35.0 advisory a bounded upgrade candidate. Untrusted PDF bytes reach server-side text extraction, but the published PDF.js browser-hosting/scripting preconditions are not established by this DOM-less legacy-build path. The adm-zip, fast-uri, ip-address, brace-expansion, and nanoid records are dev-only, duplicate-family, or unproven transitive application paths—not proven production exploits.
- User or system impact: the server retains known vulnerable decoder versions on real input paths, but the audit did not demonstrate compromise, XSS, SSRF, or denial of service. P1 would overstate the evidence.
- What remains unverified: advisory-specific malicious-input behavior, compensating decoder controls, and upgrade compatibility. The current 24 PDF/upload/image integration tests prove normal wiring, not exploitability or mitigation.
- Suggested next check or fix: upgrade sharp to the advisory's fixed floor and pdfjs-dist to its fixed floor, regenerate the lock, run the focused image/PDF/upload integration suites, then rerun online `pnpm audit --json`. Treat the remaining high records by actual production reachability rather than raw advisory-record count.

### DEPLOCK-02 — resolved tooling versions violate two peer contracts

- Severity: P2
- Class: operability-gap
- Confidence: high — pnpm's peer resolver returned both incompatibilities on the exact installed graph (C11).
- Evidence rung: R5
- Scope denominator: 1,419 package resolutions and the 2 peer-contract groups reported by `pnpm peers check`; excludes peer contracts that pnpm did not report.
- Receipts: the lock resolves `eslint-plugin-jsx-a11y@6.10.2` at [pnpm-lock.yaml:5005](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:5005) alongside `eslint@10.7.0` at [pnpm-lock.yaml:5045](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:5045), and it resolves the affected `@typescript-eslint` 8.56.1 entries at [pnpm-lock.yaml:3912](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:3912)–[pnpm-lock.yaml:3972](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:3972) alongside `typescript@6.0.3` at [pnpm-lock.yaml:7097](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:7097). C11 reports the supported ranges as ESLint `^3`–`^9` and TypeScript `>=4.8.4 <6.0.0`.
- Established fact: `pnpm peers check` exits 1 because the locked versions are outside those declared peer ranges (C11; R5).
- User or system impact: lint/type tooling runs under versions their peer authors do not support, raising the risk of tooling breakage or incorrect diagnostics.
- What remains unverified: whether the mismatches trigger an actual project command failure; no sibling-owned source/test was inspected.
- Suggested next check or fix: align the owning catalog/direct dependency versions to supported peer ranges, regenerate the lock, then make `pnpm peers check` exit 0.

### DEPLOCK-03 — lockfile is not at pnpm's dedupe fixed point

- Severity: P3
- Class: architecture-drift
- Confidence: high — `pnpm dedupe --check --offline` names the sole pending resolution change (C10).
- Evidence rung: R5
- Scope denominator: the full 1,419-package lockfile graph; pnpm reported 1 pending package-resolution upgrade. Excludes an assessment of whether that duplicate has observable runtime cost.
- Receipts: both `enhanced-resolve@5.24.2` and `5.24.3` are present at [pnpm-lock.yaml:4901](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:4901) and [pnpm-lock.yaml:4905](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:4905); `tsconfig-paths-webpack-plugin@4.2.0` is resolved at [pnpm-lock.yaml:7028](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:7028) and uses 5.24.3 in its snapshot at [pnpm-lock.yaml:11304](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:11304). C10 says dedupe can lift its other 5.24.2 edge to 5.24.3.
- Established fact: pnpm exits 1 for `dedupe --check`, so the committed lock is not its current deduplicated graph (C10; R5).
- User or system impact: duplicate transitive resolution increases graph maintenance and can produce avoidable version divergence, without a demonstrated current behavior failure.
- What remains unverified: the root manifest edge selecting 5.24.2; that manifest belongs to another lane.
- Suggested next check or fix: run `pnpm dedupe`, review the minimal lock diff, then repeat C07 and C10.

## Proven strengths

- **DEPLOCK-S01 — immutable offline workspace resolution is reproducible.** All seven workspace projects were accepted by `pnpm install --offline --frozen-lockfile --ignore-scripts` without mutating the lockfile (C07, C15; R5). This does not override the health findings above.
- **DEPLOCK-S02 — every resolved registry package has a SHA-512 integrity value.** Strict parsing over all 14,341 owned lines found integrity on all 1,419 package resolutions and no tarball/git/local-resolution exceptions (C03, C09; R4).

## Declared versus completed

| Declared lock surface | Strongest current evidence | Status |
| - | - | - |
| v9 lock sections, workspace importers, package and snapshot graph | Full-file read plus strict parse: [pnpm-lock.yaml:1](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:1), [pnpm-lock.yaml:335](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:335), [pnpm-lock.yaml:845](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:845), [pnpm-lock.yaml:7503](/home/inktomi/inktomi-stack/development/orbweaver/pnpm-lock.yaml:7503) (C03, C09; R4) | Complete syntax/integrity metadata evidence. |
| Frozen offline installation | C07 (R5) | Completed for this machine's current lock graph. |
| Dedupe, peers, vulnerability health | C10–C14 (R5) | Incomplete: one dedupe change, two peer groups, and 32 advisories. |

## Tests and gates

No repository test file or gate is assigned to this lane, so unit/integration/contract/CT/e2e/type-test counts are all 0. The exact applicable behavioral checks were package-manager-native: C07 passed; C10, C11, and C12–C14 returned meaningful nonzero results. No static/type result is treated as behavioral proof. `pnpm dedupe --check` reported a supply-chain-policy message last verified six days earlier (C10); it is historical output, not a current R5 strength.

## Cross-lane edges

- **root-config / dependency owners:** DEPLOCK-01 through DEPLOCK-03 require manifest/catalog/override changes outside this lane; reconcile the locked versions and rerun the package-manager commands in C07 and C10–C14 plus the current online audit.
- **security validation:** `SECURITY-VALIDATION.md` supersedes the original raw-count P1 classification and separates the bounded sharp/PDF input paths from dev-only, duplicate-family, and unproven transitive records.
- **verification environment:** C08 found a modified local pnpm store, including the lock's patched Stryker instance. This is not a repository lock finding; a verifier that needs store-level trust should use `pnpm install --force` in a disposable environment, then repeat C07.

## Tool receipts

`pnpm ast` was run bare and its current scan-ledger semantics were read (C06). No code-level structural negative was made, so there is no fabricated zero-scan claim. The only negative-style integrity statement — 0 package resolutions missing SHA-512 integrity — has a nonzero 1,419-package denominator from strict full-lock parse (C03, C09) and independent package-manager corroboration through C07. Full commands, exits, elapsed time, artifacts, scope accounting, and failures are in `commands.md`.

## Lane verdict

The owned lockfile was fully read, is syntactically valid, pins all 1,419 package resolutions with SHA-512 integrity, and supports a current offline frozen install. It is not dependency-healthy: pnpm reports 12 high advisory records, two peer-contract groups, and one pending dedupe change. Security reconciliation reduces the raw high count to bounded P2 upgrade candidates for sharp and PDF.js; no P1 application exploit is proven. The current lock hash still matches the assignment; current `ast.ts` differs from its assigned shared checksum, so this is explicitly a rolling working-tree audit rather than a single-commit claim.
