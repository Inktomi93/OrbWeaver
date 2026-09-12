---
kind: review
status: active
updated: 2026-09-12
---

# Exception and authority migration census

Parent program: [#1584](https://github.com/Inktomi93/orbweaver/issues/1584). This is migration evidence, not a runtime registry.

Census is against clean integration worktree `codex/gate-tsmorph-standardization` at `53bb2d35f3d7bf82bf0c5e911c705b60a35bb91a`.

Coverage:

- Closed verifier source scope: 376 tracked files under `tooling/src/verify/{gates,lib,ops}`: 366 TypeScript, 9 JSON, 1 Markdown.
- Gate corpus: 255 modules.
- Structural scan: `ast-grep 0.45.0`, 366 files scanned, 0 skipped. Literal `rg` covered the same trees. There are no TSX files in this surface.
- I also read the destination design, final policy/authority contracts, authority validation/coordinator, policy dispatcher, and their complete authority/policy-pass/resource tests.
- Excluded from classification: test fixture literals unless they instantiate a real current mechanism; generated/vendor trees; native Biome/ESLint config rows themselves except where a verifier gate reads them; historical docs. I separately checked the push-tier `@public` reader because it is an equivalent policy exception outside the gate corpus.

The final law is unambiguous: one central ordinary marker, exact typed grants, warning debt tied to a work item, no count ratchets, and no gate-owned parser or sanctioned-home subtraction ([design:120-133](../../design/gate-runtime-standardization.md:120), [acceptance:202-206](../../design/gate-runtime-standardization.md:202)).

## Numeric census

- `ExemptionTable`: 97 literal declarations in 73 gate files, 319 rows, including 14 empty tables. The old shared type intentionally conflates allowlists, sanctioned homes, and deferred debt ([gate.ts:19-37](../../../tooling/src/verify/contract/gate.ts:19)).

- Equivalent non-`ExemptionTable` gate collections detected by the existing structural predicate: 20 collections, 79 rows. These include `ReadonlyMap`, arrays, `Set`s, inferred objects, and regex lists. The existing name detector and its limits are at [gate-modernization.ts:21-29](../../../tooling/src/verify/gates/gate-modernization.ts:21) and [gate-modernization.ts:109-160](../../../tooling/src/verify/gates/gate-modernization.ts:109).

- `SANCTIONED_HOMES`: 25 tables, 42 rows. Twenty-four gates use the shared helper; `two-class-role-authority` implements the same mechanism locally. The helper supports file and directory grants and owns only missing-path liveness ([sanctioned-home.ts:10-26](../../../tooling/src/verify/lib/sanctioned-home.ts:10), [sanctioned-home.ts:35-68](../../../tooling/src/verify/lib/sanctioned-home.ts:35)).

- Baselines: 9 tracked `*.baseline.json` files repository-wide. Their current logical populations are:

  - `density-tier`: 23 rows / 60 admitted occurrences, all ratified.
  - `duplicate-action-doors`: 6 rows / 12 occurrences, all ratified.
  - `over-art-plate-arm`: 4 rows / 4 burnable findings.
  - `suppressions`: 274 file rows / 572 occurrences: 545 ratified, 27 burnable across 20 files.
    **LANDED 2026-09-12 (`a33b2e339`)**: the baseline is DELETED. `suppressions` converted to reviewed-grant authority and its
    count ratchet went with it; the census at landing was 597 occurrences across 283 files in 65
    `(rule, scope)` classes, each licensed by exactly one row in `tooling/src/verify/lib/reviewed-grants.ts`
    and consumed exactly once. A class goes stale the day its last site disappears, which is what the
    burnable column used to track by hand.
  - `test-presence`: 2 debt rows.
    **LANDED 2026-09-12 (`a33b2e339`)**: the baseline is DELETED — see the `test-presence.baseline.json` row below, which carries
    the same disposition.
  - `ui-variant-axes-stamped`: 0 rows.
  - `ct-unfed-reads`: 1 ratified row.
  - `orphan-export-ratchet`: 0 entry rows.
  - `gate-spelling-twins`: 83 gate rows / 103 blind spellings.

- The every-test manifest adds 2,427 current-file rows and 76 deletion rows at `docs/test-baseline/manifest.json`.

- CSS carries five per-file declaration counts plus one total at [css-family-census.ts:52-118](../../../tooling/src/verify/lib/css-family-census.ts:52). The direct generated-theme count is a separate generated-output parity assertion.

- Legacy gate severity downgrade count: zero. Structural `severity: $V` search scanned all 366 files with no current gate descriptor match. Literal matches were final-runtime code and fixture strings. Current legacy findings all block.

## Ordinary occurrence waivers

The shared `@orb-gate-ignore` mechanism is already the correct conceptual bucket, but its legacy parser/runtime/auditor are replaced centrally:

- 631 literal comment-opener candidates: 394 in packages, 12 in tests, 225 in tooling.
- Grammar/parser: [gate-ignore.ts:10-43](../../../tooling/src/verify/lib/gate-ignore.ts:10).
- Node and line lookup: [gate-ignore.ts:171-227](../../../tooling/src/verify/lib/gate-ignore.ts:171).
- Consumption accounting in the dispatcher: [pass.ts:192-234](../../../tooling/src/verify/lib/pass.ts:192).
- Stale, malformed, unregistered, and overbroad auditor: [gate-ignore-inventory.ts:1-35](../../../tooling/src/verify/gates/gate-ignore-inventory.ts:1), [gate-ignore-inventory.ts:129-190](../../../tooling/src/verify/gates/gate-ignore-inventory.ts:129).

Eleven additional gate-specific grammars currently duplicate that job. Literal opener candidates total 158:

| Grammar | Candidates | Parser receipt | Disposition |
| - | -: | - | - |
| `@foreign-id-ok` | 70 | `brand-in-name-position.ts:78-81` | Central ordinary waiver |
| `@sub-floor-ok` | 2 | `sub-floor-disclosure.ts:22-25,59-71` | Central ordinary waiver |
| `@finding-overload-ok` | 24 | `finding-overload-provenance.ts:37-39,192-247` | **STALE (cb-v-authority-census L5, #2100):** the gate's own header records the ban SURVIVED #828 with a changed reason — it is not obsolete. Delete WITH ITS GATE, whenever that gate retires; the ban is live and the 6 live markers stay parked |
| `@owner-scope-ok` | 20 | `owner-scoped-reads.ts:25-26` | Central ordinary waiver |
| `@owner-scope-write-ok` | 31 | `owner-scoped-writes.ts:41-42` | Central ordinary waiver |
| `@owner-scope-upsert-ok` | 0 | `owner-scoped-upserts.ts:34-35` | Delete empty grammar |
| `@first-boot-only` | 0 | `query-boundary-reservation.ts:27-30,122-134` | Delete empty grammar; policy arm remains ordinary |
| `@swallowed-ok` | 8 | `detached-work-traced.ts:71-74,379` | Central ordinary waiver |
| `@surface-focus-elsewhere` | 2 | `surface-a11y-focus.ts:39-48,88-89` | Central ordinary waiver |
| `@nullable-cmp-ok` | 1 | `nullable-column-inequality.ts:27-28,180-243` | Central ordinary waiver |
| `@over-art-plate-ok` | 0 | `lib/over-art-plate.ts:15-18,135-198` | Delete empty grammar; four current violations become warning debt |

`no-legacy-react-api` additionally re-parses the central `@orb-gate-ignore` spelling at `:31-68,145-167`; that reader is pure duplication and deletes.

The three owner-scope gates share generic traversal in [tenancy-read.ts:205-226](../../../tooling/src/verify/lib/tenancy-read.ts:205) but still declare separate marker regexes and separate liveness loops. `sub-floor-disclosure` and `query-boundary-reservation` carry nearly identical line-adjacent marker tables and malformed/stale/overbroad reconciliation. `brand-in-name-position` and `detached-work-traced` each reimplement named-position block resolution. These are the clearest duplicated parser families.

The linter suppression parser is a distinct resource fact, not an Orb waiver grammar. It recognizes Biome, ESLint, and TypeScript directives at [suppressions.ts:20-35](../../../tooling/src/verify/gates/suppressions.ts:20) and shares trivia carriers with `no-blanket-suppression`. A literal opener scan saw 571 sites while its committed parsed ledger has 572, confirming that regex-only counting misses one JSX/trailing carrier.

## Reviewed grants

These are recurring permissions and should become exact reviewed grants, with the current broad file/zone key narrowed to the finding’s stable subject and operation.

- The 42 `SANCTIONED_HOMES` rows across 25 gates.

- Three legacy path subtractions that are explicitly already ruled as reviewed grants:

  - `bound-field-via-hook` excludes `use-bound-field.ts` at `:32`; scan the home and grant its raw-context import.
  - `no-inline-invalidate-outside-seam` excludes the invalidation seam at `:23`; grant that exact TanStack operation.
  - `registry-context-via-mint` excludes `MINT_HOME` at `:37`; grant the exact React context construction.

- Two regex-zone forms: `firehose-import-allowlist`’s three `ALLOWED` regexes at `:42` and `no-raw-egress`’s two `FETCH_SANCTIONED` zones at `:23`. The latter are directory permissions, not population.

- Exact external-config grant families:

  - `biome-grant-liveness.ts:80,126` — 2 rows.
  - `depcruise-grant-liveness.ts:70` — 3 rows.
  - `eslint-grant-liveness.ts:47` — 3 rows.
  - `tsconfig-entry-liveness.ts:53,80` — 4 rows.
  - `ct-unfed-reads.baseline.json` — 1 exact `(test, procedure)` permission.

- Stable semantic permissions include:

  - `bus-definition-belts.ts:57,71` — 4 derived-bus/reach grants.
  - `bus-payload-allowlist.ts:196` — 1 safe wire field.
  - `contract-derives-not-respells.ts:55` — 2 exact homonym/aggregate grants.
  - `dangling-refs.ts:764,777,832` — 27 deliberately absent path/symbol grants.
  - `dialog-via-composite.ts:27` — 10 permanent non-form species; its two temporary chat rows belong in warning debt.
  - `injected-op-caller-param.ts:43` — 7 caller-free operations.
  - `integer-line-boxes.ts:38` — 1 exact CSS token occurrence.
  - `json-column-write-parity.ts:74,86` — 5 semantic column/guard permissions.
  - `no-floorless-control-in-wrap.ts:70` — 2 permanent geometry rulings despite the misleading `JUDGMENT_DEFERRED` name.
  - `no-manual-memo.ts:31` — 3 compiler/tooling rulings.
  - `no-untyped-soft-ref.ts:23` — 6 semantic soft-reference grants.
  - `own-tables-only.ts:140` — 1 exact foreign read.
  - `seed-theme-ink-contrast.ts:63` — 9 decorative-stroke grants.
  - `single-stream-transport.ts:50` — 1 operation exemption.
  - `tooling-argv-front-door.ts:33` — 5 exact argv entry permissions.
  - `tooling-shared-plumbing.ts:60,75,95,130,143` — 19 exact home/caller/site permissions.
  - `two-class-role-authority.ts:55,63` — 2 exact role-check permissions.
  - `wire-schema-vocab-one-home.ts:24` — 2 exact schema homes.
  - `zod-modern-spellings.ts:100` — 7 model-facing/structural re-emit permissions.

Path-only file allowlists such as `empty-state-has-action` (16), `dialog-via-composite` (12), `no-arbitrary-tw-values` (2), `no-manual-memo` (3), `render-error-via-battery` (4+2), `ui-size-via-variant` (3), and `zod-modern-spellings` (7) cannot be copied verbatim. A file row currently suppresses every matching occurrence in that file. The final grant needs one stable subject/operation per justified occurrence, or the finding must use the central ordinary marker.

The 23 density rows/60 occurrences, six duplicate-door rows/12 occurrences, and 545 ratified suppression occurrences also represent reviewed decisions, but their count rows do not fit directly. Each accepted occurrence needs its own exact identity, or the underlying hard algorithm must own cardinality.

## Warning debt tied to work

These are actual unresolved findings, not permissions:

- `open-json-column-key-parity.ts:66-77`: 1 row, `messageVariants.metadata`, tied to issue `#184`.
- `over-art-plate-arm.baseline.json`: 4 rows, tied to `#626`.
- `test-presence.baseline.json`: 2 rows, tied to board item `#772`.
  **LANDED 2026-09-12 (`a33b2e339`)**: DELETED. The file no longer exists; `#772`'s two rows retired with it rather than moving to
  a grant, because the debt they tracked was closed rather than licensed.
- `contract-verb-presence.ts:32-38`: 2 W1i rows. They cite `test-support-dry-punchlist.md`, not a work item.
- `knob-wire-coverage.ts:42-69`: 5 D107 remediation rows. They cite law/audit prose, not a work item.
- `query-freshness-coverage.ts:197-202`: 1 `automation.listChatActivity` row. It cites B6 design work, not a work item.
- `suppressions.baseline.json`: 27 burnable occurrences across 20 files. The rows do not carry work-item identities.
  **LANDED 2026-09-12 (`a33b2e339`)**: DELETED. Every occurrence is now a reviewed grant keyed `(policyId, subject, operation)`, which
  is an identity rather than a count — so the "no work-item identity" objection this row raised is answered
  by the shape of the replacement, not by adding issue numbers to the old one.
- `dialog-via-composite.ts:31-35`: `rename-chat-dialog` and `invite-dialog` are temporary “lane held” exceptions with no work-item identity.

`no-floorless-control-in-wrap`’s two “deferred” rows are permanent, already-fixed geometry rulings and belong under reviewed grants.

## Hard policy and authoritative runtime data

These are not exception rows and must remain enforced as policy/resource facts:

- `ownerid-registry.ts:24` — 27 schema ownership classifications.
- `persistence-boundary.ts:38` — 14 device-local store identities. Its separate six-file `RAW_STORAGE_ALLOWLIST` at `:14` is reviewed permission.
- `query-freshness-coverage.ts:48` — 34 static/writer-local freshness classifications.
- `own-tables-only.ts:64,102,119` — 8 schema/table/bulk-reader ownership rows.
- `lifecycle-portability.ts:92` — 17 authoritative portability classifications.
- `db-structure.ts:26` — 6 non-domain DB producer identities.
- `sanctioned-css-homes.ts:9` — closed six-home CSS registry.
- `serde-core-seal.ts:21` — the hard import/export domain vocabulary.
- `tooling-slot-template.ts:18,28` — 2 tool-slot classifications.
- `suppressions.ts:46,201` — the two ratified-rule tables. These classified native suppression facts; they were
  not Orb waivers.
  **LANDED 2026-09-12 (`a33b2e339`)**: both tables DELETED. **The `6 test` figure was the one number in this row that did not survive
  re-derivation:** measured at the conversion parent `d23150315`, `RATIFIED_RULES` held **45** source rows
  and `RATIFIED_TEST_RULES` held **7** test rows, and all of both migrated. The live surface is **46**
  `source`-scope and **19** `tests`-scope reviewed grants in `tooling/src/verify/lib/reviewed-grants.ts`
  (counted there today). The `tests` scope grew because one legacy table row could cover a whole rule class
  across every test file, whereas a grant names its subject exactly.
- `tokens.json`, `0000_baseline.sql` parity, Base UI surface manifest (39 components, 292 parts), prose hash/version manifest (148 slots), devtools asset manifest, and generated flag/parity outputs remain authoritative resource data.
- CSS `EXPECTED_DIRECT_THEME_DECLARATIONS` is generated-output parity; the five per-file declaration counts and aggregate total are current-population counts and retire.

## Delete/fix

- All 14 empty `ExemptionTable`s: `dangling-doc-cite.ALLOW`, `db-structure.BASELINE_RIDER_PRODUCERS`, `depcruise.EXEMPT`, `eslint.EXEMPT`, `list-row-adoption.ALLOWLIST`, `message-kind-policy-coverage.DEFERRED`, `no-hover-display-swap.ALLOWLIST`, `no-interactive-role-in-features.BURN_DOWN`, `no-off-token-inline-style.ALLOWLIST`, `no-off-token-radius-shadow.ALLOWLIST`, `no-raw-interactive-intrinsics.BURN_DOWN`, `runner-config-path-liveness.EXEMPT`, `scroll-container-positioned.ALLOWLIST`, and `stale-draft-commit.ALLOWLIST`.
- All 9 `*.baseline.json` mechanisms retire after their rows are converted/fixed. Empty `ui-variant-axes-stamped` and orphan-export ledgers can delete immediately at cutover.
- The 83-row/103-spelling gate-spelling baseline is migration debt, not permission; fix the blind readers and delete it.
- `docs/test-baseline/manifest.json`’s 2,427-file census and 76 deletion ledger rows are the prohibited every-file manifest shape.
- CSS five-home counts plus aggregate total are prohibited current-population declaration counts.
- `gate-ignore-inventory`, `finding-overload-provenance`, `ratchet-row-integrity`, admitted/admittedRatified plumbing, and gate-owned stale-table reconciliation become obsolete when central authority owns them.
- Current test/spec population exclusions remain population algebra where they define the policy’s subject. Sanctioned implementation homes must not survive as `notUnder` subtraction.

## Final model mismatches

Three current classes cannot fit the final typed authority model as written:

1. **Warning debt has no typed work-item identity.** `GatePolicy` contains `id/family/authority/severity/population/...` only ([policy.ts:81-93](../../../tooling/src/verify/contract/policy.ts:81)). A warning can mention an issue in prose, but the contract cannot require or validate “tied to a work item.” The W1i, D107, B6, temporary dialog, and 27 suppression-debt occurrences expose this immediately.

2. **Reviewed grants have no cardinality.** The identity is `(policyId, subject, operation)` ([gate-authority.ts:48-55](../../../tooling/src/verify/contract/gate-authority.ts:48)). One matching grant suppresses every finding with that identity and merely increments a count ([gate-authority.ts:266-270](../../../tooling/src/verify/lib/gate-authority.ts:266)); liveness checks only zero consumption ([gate-authority.ts:315-324](../../../tooling/src/verify/lib/gate-authority.ts:315)). Count ratchets therefore require occurrence-unique subject/operation identities or a hard cardinality policy before migration. A density/duplicate-door/suppression file-count row cannot be translated one-for-one. **CORRECTED 2026-09-12 (read `lib/gate-authority.ts#processReviewed` / `#reconcileAuthority` on the tree): a reviewed grant is STRICTLY ONE-TO-ONE — a grant matching N > 1 candidates suppresses NOTHING and alarms `over-broad-reviewed-grant`; the sentence in this row that says it "suppresses every finding with that identity and merely increments a count" described a retired engine. A class-level exemption migrates by making the POLICY report one aggregate finding per class (guide §12.5), never by one grant over N findings. #1922 is priced on the corrected rule.**

3. **Broad regex/directory/file grants are not exact occurrences.** The 42 sanctioned-home rows, two fetch zones, three firehose regexes, and broad file allowlists may suppress several sites. They fit only after the detector emits a stable semantic subject/operation for each intended permission. Copying the current key would preserve the over-grant.

The 24 `@finding-overload-ok` uses target a marker-immune meta-policy, so they cannot become ordinary waivers while that policy remains hard. They delete with the obsolete provenance mechanism. The push-tier `@public` family is also outside central authority today: 24 twin and 13 future markers are parsed by `tooling/src/ast/lib/public-markers.ts:5-88` and consumed by `orphan-export-ratchet`; they need to remain that stage’s hard semantic facts or migrate with the stage, rather than being mistaken for Orb ordinary waivers.
