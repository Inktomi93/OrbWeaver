---
kind: review
status: archived
updated: 2026-08-30
---

# Gate-stance census — all 219 gates, against the maximal stance (#393 P6)

FLAG-ONLY. Nothing in this document was changed in the censusing lane; every row is a candidate for a
follow-up item the orchestrator files. Two things WERE fixed in the P6 lane and are listed here only so a
reader does not re-file them: `nullable-column-inequality`'s marker fence and `diagnostic-legibility`'s
pointer vocabulary (both broke on the corpus's move out of `scripts/`, both carry a new `mustPass` row).

## Method, and what this instrument cannot see

Every row was derived by reading each `export const gate` descriptor through ts-morph over the real corpus
(`tooling/src/verify/gates/*.ts`, 219 files, all `status: "active"`), then hand-classified where the
classification is a judgement. Receipts are `file:line` on the post-move tree.

**Two classes the detector is structurally blind to, stated so a zero here is never read as absence:**

- **`a4` (a finding message with no navigable pointer) reported ZERO, and that zero is weak.** The scan only
  judges a `message:` whose initializer is a self-contained string literal; the corpus overwhelmingly composes
  per-occurrence messages from template literals and named constants, which this pass skips. The LIVE
  authority for that class is the `diagnostic-legibility` gate itself, which reads the descriptor's `message:`
  through the shared project and is green — but it judges the group message, not every runtime-composed
  Finding override. **That residual gap is itself a census finding (F1 below), not a clean result.**
- **`a1` (a `mustFlag`/`mustPass` row with no `why`) reported ZERO, and that zero is STRONG** — the check is a
  property of the object literal, so it sees every row. 219 gates, 0 rows without a rationale.

## Headline

| dimension | count | verdict |
| - | - | - |
| a1 · self-proof rows with no `why` | 0 / 219 | CLEAN (strong zero) |
| a2a · `scanRoot` excludes a SANCTIONED HOME | 27 | the §3 anti-pattern, live at scale |
| a2b · `scanRoot` excludes a test/tool ZONE | 12 | scope, not an exemption — recorded, not flagged |
| a2c · `scanRoot` with ≥3 clauses | 19 | §3's "unreviewable by inspection" class |
| a3 · legacy `Record<string, string>` exemption tables | 29 tables / 24 gates | the pre-`ExemptionTable` spelling |
| a3 · exemption table with NO stale arm | 0 | CLEAN — every file carrying a table also carries a stale sweep |
| a5 · legacy tier/severity/warn descriptor fields | 0 | CLEAN — the warn tier left no residue |
| b · multi-mode descriptors | 12 | 11 are `visit`+`visitFile`/`run`; 1 is all three |
| c · dual-homed (conformance AND a standalone suite) | 1 genuine, 9 explained | see §C |
| d · tests pinning outgrown behavior | 0 | see §D |

## A1 — self-proof rationales: CLEAN

All 219 descriptors carry ≥1 `mustFlag` and ≥1 `mustPass` (loader-enforced), and **every one of those rows
carries a `why`.** The loader only enforces PRESENCE of the arrays; the `why` is enforced by nothing, and it
is nonetheless universal. That is the strongest single result in this census: the register the law asks for
("the founding shape — the real defect this gate was minted from") is actually being written.

## A2 — `scanRoot`, the #1 silent-green source

GATE-AUTHORING §4: *"Scan-and-allowlist beats scanRoot-exclusion for sanctioned homes. A sanctioned home
scoped OUT of `scanRoot` carries its exemption silently through a rename or a move."* The corpus has **27
live instances** — and the P6 move is the proof that the hazard is not theoretical: three fences keyed on the
`scripts/` ZONE broke silently the moment the corpus left it (two started judging their own documentation,
one stopped scanning the corpus entirely).

The split below is a JUDGEMENT: a row is the anti-pattern when the excluded path is the rule's own sanctioned
HOME (`no-raw-intl-time` excluding `packages/kit/src/time/`; `sole-env-reader` excluding `ENV_HOME`), and it
is SCOPE when the excluded path is a test/tool zone or the gate corpus itself. Both tables carry the
predicate verbatim so the classification can be re-derived rather than trusted.

Note the gate GATE-AUTHORING names by name: `scrubber-home`'s exclusion shape is cited in §4 as *the*
anti-pattern, and it is still live at `gates/scrubber-home.ts:85`.

### A2a — `scanRoot` EXCLUDES a SANCTIONED HOME (the §3 anti-pattern)

| gate | receipt | the predicate |
| - | - | - |
| `assumes-single-replica` | `gates/assumes-single-replica.ts:42` | `` (p) => p.includes("packages/server/src/") && !PERSISTENCE.test(`/${p}`) `` |
| `bus-channel-primitive` | `gates/bus-channel-primitive.ts:23` | `` (p) => TRANSPORT_SCOPE.test(`/${p}`) && !OWN_HOME.test(`/${p}`) `` |
| `client-cache-surgery-only-in-data` | `gates/client-cache-surgery-only-in-data.ts:14` | `` (p) => { if (!p.includes("packages/client/src/")) { return false; } if (p.includes("packages/client/src/data/")) { return false; } if (TEST_FILE_RE.te `` |
| `content-part-seam` | `gates/content-part-seam.ts:65` | `` (p) => { const abs = `/${p}`; return PROD_SRC.test(abs) && !SANCTIONED.some((re) => re.test(abs)); } `` |
| `no-direct-useform` | `gates/no-direct-useform.ts:13` | `` (p) => !p.includes("packages/client/src/forms/") `` |
| `no-direct-users-read` | `gates/no-direct-users-read.ts:50` | `` (p) => MSG_DIR.test(p) && !EXEMPT_DOMAINS.some((d) => p.includes(`${DOMAIN_ROOT}${d}/`)) `` |
| `no-effect-on-shared-selection` | `gates/no-effect-on-shared-selection.ts:141` | `` (p) => p.includes("packages/client/src/features/") && !p.includes("packages/client/src/features/app-shell/") `` |
| `no-handwritten-wire-json-schema` | `gates/no-handwritten-wire-json-schema.ts:74` | `` (p) => (p.startsWith("packages/server/src/") \|\| p.startsWith("packages/contracts/src/") \|\| p.startsWith("packages/kit/src/")) && !p.includes(".test.") `` |
| `no-pointer-variants-in-features` | `gates/no-pointer-variants-in-features.ts:77` | `` (p) => p.includes(FEATURES_ROOT) && !p.includes(APP_SHELL) `` |
| `no-raw-clock` | `gates/no-raw-clock.ts:12` | `` (p) => !( p.startsWith("packages/kit/src/time/") \|\| p.startsWith("packages/server/src/entry/") \|\| p.includes(".test.") \|\| p.startsWith("tests/") \|\| p. `` |
| `no-raw-interactive-intrinsics` | `gates/no-raw-interactive-intrinsics.ts:68` | `` (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx") && !p.includes("packages/client/src/features/app-shell/") `` |
| `no-raw-intl-time` | `gates/no-raw-intl-time.ts:32` | `` (p) => !p.startsWith("packages/kit/src/time/") `` |
| `no-raw-random` | `gates/no-raw-random.ts:12` | `` (p) => !( p.startsWith("packages/server/src/entry/") \|\| p.endsWith("packages/client/src/main.tsx") \|\| p.includes(".test.") \|\| p.startsWith("tests/") \| `` |
| `no-raw-spacing-in-features` | `gates/no-raw-spacing-in-features.ts:39` | `` (p) => { const path = `/${p}`; if (!SCOPE_REGEX.test(path)) { return false; } if (ALLOWLIST_ZONES.some((zone) => zone.test(path))) { return false; } r `` |
| `no-raw-typography-in-features` | `gates/no-raw-typography-in-features.ts:39` | `` (p) => { const path = `/${p}`; if (!SCOPE_REGEX.test(path)) { return false; } if (ALLOWLIST_ZONES.some((zone) => zone.test(path))) { return false; } r `` |
| `no-raw-z-index` | `gates/no-raw-z-index.ts:39` | `` (p) => { const path = `/${p}`; if (!SCOPE_REGEX.test(path)) { return false; } if (ALLOWLIST_ZONES.some((zone) => zone.test(path))) { return false; } r `` |
| `no-raw-zustand-persist` | `gates/no-raw-zustand-persist.ts:39` | `` (p) => { const path = `/${p}`; if (!SCOPE_REGEX.test(path)) { return false; } if (ALLOWLIST.some((rel) => path.endsWith(`/${rel}`)) \|\| TEST_REGEX.test `` |
| `no-untrusted-html-in-main-dom` | `gates/no-untrusted-html-in-main-dom.ts:34` | `` (p) => { const full = `/${p}`; return SCOPE.test(full) && !EXEMPT_ZONES.some((zone) => zone.test(full)); } `` |
| `own-tables-only` | `gates/own-tables-only.ts:355` | `` (p) => p.includes(DOMAIN_ROOT) && !p.includes(PERSISTENCE_SEG) `` |
| `owner-role-split` | `gates/owner-role-split.ts:33` | `` (p) => SERVER_SRC.test(`/${p}`) && !ALLOWLIST.test(`/${p}`) `` |
| `render-error-via-battery` | `gates/render-error-via-battery.ts:108` | `` (p) => p.startsWith(CLIENT_SRC) && p !== BATTERY_HOME && !ALLOWLIST.has(p) `` |
| `scrubber-home` | `gates/scrubber-home.ts:85` | `` (p) => PACKAGES_SRC.test(`/${p}`) && !SANCTIONED_ZONES.some((zone) => zone.test(`/${p}`)) `` |
| `selection-store-via-factory` | `gates/selection-store-via-factory.ts:54` | `` (p) => p.startsWith(STATE_DIR) && p.endsWith(SELECTION_SUFFIX) && !p.includes("/create-") && !NON_DRILL_ALLOWLIST.has(p) `` |
| `single-stream-transport` | `gates/single-stream-transport.ts:75` | `` (p) => ROUTERS_DIR.test(`/${p}`) && !STREAM_ROUTER.test(`/${p}`) `` |
| `sole-env-reader` | `gates/sole-env-reader.ts:82` | `` (p) => p.includes("packages/server/src/") && !ENV_HOME.test(`/${p}`) `` |
| `theme-override-only-via-scope` | `gates/theme-override-only-via-scope.ts:34` | `` (p) => { const full = `/${p}`; return SCOPE.test(full) && !EXEMPT_ZONES.some((zone) => zone.test(full)); } `` |
| `ui-skin-fragment-purity` | `gates/ui-skin-fragment-purity.ts:58` | `` (p) => p.startsWith("packages/ui/src/") && !p.startsWith(LIB_HOME) `` |

### A2b — `scanRoot` excludes a ZONE (scope, not an exemption — recorded, not flagged)

| gate | receipt | the predicate |
| - | - | - |
| `commented-code` | `gates/commented-code.ts:23` | `` (p) => !p.startsWith("tooling/src/verify/gates/") `` |
| `no-await-db-in-loop` | `gates/no-await-db-in-loop.ts:14` | `` (p) => !(p.includes(".test.") \|\| p.startsWith("tests/")) `` |
| `no-caller-user-id` | `gates/no-caller-user-id.ts:23` | `` (p) => !p.startsWith("tooling/src/verify/gates/") `` |
| `no-if-is-group` | `gates/no-if-is-group.ts:14` | `` (p) => !(p.includes("tests/") \|\| p.includes("tools/") \|\| p.includes("scripts/") \|\| TEST_FILE_REGEX.test(p)) `` |
| `no-inline-union-redecl` | `gates/no-inline-union-redecl.ts:280` | `` (p) => !p.startsWith("tooling/src/verify/gates/") `` |
| `no-loose-id-cast` | `gates/no-loose-id-cast.ts:24` | `` (p) => !(p.includes("tests/") \|\| p.includes("tools/") \|\| p.includes("scripts/") \|\| TEST_FILE_REGEX.test(p)) `` |
| `no-mint-via-cast` | `gates/no-mint-via-cast.ts:13` | `` (p) => !(p.includes("tests/") \|\| p.includes("tools/") \|\| p.includes("scripts/") \|\| TEST_FILE_REGEX.test(p)) `` |
| `no-multiplexed-mutation-error` | `gates/no-multiplexed-mutation-error.ts:14` | `` (p) => p.includes("packages/client/src/") && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx") `` |
| `persistence-no-in-memory-state` | `gates/persistence-no-in-memory-state.ts:12` | `` (p) => p.includes("/persistence/") && !p.includes(".test.") && !p.startsWith("tests/") `` |
| `test-determinism` | `gates/test-determinism.ts:48` | `` (p) => p.startsWith(TESTS_ROOT) && !UNSCANNED_ROOTS.some((root) => p.startsWith(root)) `` |
| `test-fixture-imports` | `gates/test-fixture-imports.ts:50` | `` (p) => p.includes("tests/") && !p.includes("tests/e2e/") && !p.includes("tests/support/") && !p.endsWith(".test-d.ts") `` |
| `zustand-selector-stability` | `gates/zustand-selector-stability.ts:15` | `` (p) => !EXEMPT_TEST.test(`/${p}`) `` |

### A2c — `scanRoot` predicates carrying ≥3 clauses (§3: unreviewable by inspection)

| gate | receipt | clauses |
| - | - | - |
| `contract-derives-not-respells` | `gates/contract-derives-not-respells.ts:224` | `` 3 clauses: (p) => p.includes("packages/server/src/domain/") \|\| p.includes("packages/contracts/src/") \|\| p.includes("pack `` |
| `gate-ignore-inventory` | `gates/gate-ignore-inventory.ts:102` | `` 3 clauses: (p) => p.startsWith("packages/") \|\| p.startsWith("tests/") \|\| p.startsWith("tooling/src/verify/gates/") `` |
| `no-default-props` | `gates/no-default-props.ts:20` | `` 3 clauses: (p) => p.startsWith("packages/client/src") \|\| p.startsWith("packages/ui/src") \|\| p.startsWith("packages/serve `` |
| `no-handwritten-wire-json-schema` | `gates/no-handwritten-wire-json-schema.ts:74` | `` 6 clauses: (p) => (p.startsWith("packages/server/src/") \|\| p.startsWith("packages/contracts/src/") \|\| p.startsWith("pack `` |
| `no-if-is-group` | `gates/no-if-is-group.ts:14` | `` 4 clauses: (p) => !(p.includes("tests/") \|\| p.includes("tools/") \|\| p.includes("scripts/") \|\| TEST_FILE_REGEX.test(p)) `` |
| `no-loose-id-cast` | `gates/no-loose-id-cast.ts:24` | `` 4 clauses: (p) => !(p.includes("tests/") \|\| p.includes("tools/") \|\| p.includes("scripts/") \|\| TEST_FILE_REGEX.test(p)) `` |
| `no-manual-memo` | `gates/no-manual-memo.ts:112` | `` 4 clauses: (p) => p.startsWith("packages/ui/src/") \|\| p.startsWith("packages/client/src/") \|\| p.startsWith("tests/ui/")  `` |
| `no-manual-token-estimate` | `gates/no-manual-token-estimate.ts:50` | `` 6 clauses: (p) => { if (p.includes("/tests/") \|\| p.endsWith(".test.ts") \|\| p.endsWith(".test.tsx")) { return false; } re `` |
| `no-mint-via-cast` | `gates/no-mint-via-cast.ts:13` | `` 4 clauses: (p) => !(p.includes("tests/") \|\| p.includes("tools/") \|\| p.includes("scripts/") \|\| TEST_FILE_REGEX.test(p)) `` |
| `no-multiplexed-mutation-error` | `gates/no-multiplexed-mutation-error.ts:14` | `` 3 clauses: (p) => p.includes("packages/client/src/") && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx") `` |
| `no-raw-clock` | `gates/no-raw-clock.ts:12` | `` 7 clauses: (p) => !( p.startsWith("packages/kit/src/time/") \|\| p.startsWith("packages/server/src/entry/") \|\| p.includes( `` |
| `no-raw-container-widths` | `gates/no-raw-container-widths.ts:37` | `` 3 clauses: (p) => { if (p.includes("packages/ui/src/layout/") \|\| p.includes("packages/ui/src/markdown/")) { return false `` |
| `no-raw-interactive-intrinsics` | `gates/no-raw-interactive-intrinsics.ts:68` | `` 3 clauses: (p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx") && !p.includes("packages/client/src/ `` |
| `no-raw-random` | `gates/no-raw-random.ts:12` | `` 9 clauses: (p) => !( p.startsWith("packages/server/src/entry/") \|\| p.endsWith("packages/client/src/main.tsx") \|\| p.inclu `` |
| `persistence-no-in-memory-state` | `gates/persistence-no-in-memory-state.ts:12` | `` 3 clauses: (p) => p.includes("/persistence/") && !p.includes(".test.") && !p.startsWith("tests/") `` |
| `render-error-via-battery` | `gates/render-error-via-battery.ts:108` | `` 3 clauses: (p) => p.startsWith(CLIENT_SRC) && p !== BATTERY_HOME && !ALLOWLIST.has(p) `` |
| `selection-store-via-factory` | `gates/selection-store-via-factory.ts:54` | `` 4 clauses: (p) => p.startsWith(STATE_DIR) && p.endsWith(SELECTION_SUFFIX) && !p.includes("/create-") && !NON_DRILL_ALLOW `` |
| `test-fixture-imports` | `gates/test-fixture-imports.ts:50` | `` 4 clauses: (p) => p.includes("tests/") && !p.includes("tests/e2e/") && !p.includes("tests/support/") && !p.endsWith(".te `` |
| `testid-liveness` | `gates/testid-liveness.ts:285` | `` 3 clauses: (p) => (p.includes("packages/") && p.includes("/src/")) \|\| p.includes("tests/") `` |

### A3 — legacy `Record<string, string>` exemption tables (the pre-`ExemptionTable` spelling)

| gate | receipt | table |
| - | - | - |
| `baseui-derives-not-respells` | `gates/baseui-derives-not-respells.ts:255` | `` `MANIFEST_FILE: Readonly<Record<string, string>>` — the legacy path→reason spelling; Exemp `` |
| `baseui-state-data-attributes` | `gates/baseui-state-data-attributes.ts:152` | `` `MANIFEST_FILE: Readonly<Record<string, string>>` — the legacy path→reason spelling; Exemp `` |
| `baseui-surface-manifest` | `gates/baseui-surface-manifest.ts:161` | `` `INSTALLED_ONE_PART: Readonly<Record<string, string>>` — the legacy path→reason spelling;  `` |
| `contract-derives-not-respells` | `gates/contract-derives-not-respells.ts:55` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `db-structure` | `gates/db-structure.ts:21` | `` `NON_DOMAIN_PRODUCERS: Readonly<Record<string, string>>` — the legacy path→reason spelling `` |
| `db-structure` | `gates/db-structure.ts:33` | `` `BASELINE_RIDER_PRODUCERS: Readonly<Record<string, string>>` — the legacy path→reason spel `` |
| `dialog-via-composite` | `gates/dialog-via-composite.ts:28` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `empty-state-has-action` | `gates/empty-state-has-action.ts:21` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `knob-wire-coverage` | `gates/knob-wire-coverage.ts:24` | `` `DOORWAY: Record<string, string>` — the legacy path→reason spelling; ExemptionTable makes  `` |
| `knob-wire-coverage` | `gates/knob-wire-coverage.ts:34` | `` `DEFERRED: Record<string, string>` — the legacy path→reason spelling; ExemptionTable makes `` |
| `list-row-adoption` | `gates/list-row-adoption.ts:24` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `macro-resolution-home` | `gates/macro-resolution-home.ts:99` | `` `DECLARATIONS: Readonly<Record<string, string>>` — the legacy path→reason spelling; Exempt `` |
| `motion-token-purity` | `gates/motion-token-purity.ts:21` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-arbitrary-tw-values` | `gates/no-arbitrary-tw-values.ts:19` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-interactive-role-in-features` | `gates/no-interactive-role-in-features.ts:50` | `` `BURN_DOWN: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-off-token-inline-style` | `gates/no-off-token-inline-style.ts:16` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-off-token-radius-shadow` | `gates/no-off-token-radius-shadow.ts:15` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-raw-color-in-css` | `gates/no-raw-color-in-css.ts:25` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-raw-interactive-intrinsics` | `gates/no-raw-interactive-intrinsics.ts:16` | `` `BURN_DOWN: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `no-untyped-soft-ref` | `gates/no-untyped-soft-ref.ts:17` | `` `SOFT_REF_ALLOWLIST: Readonly<Record<string, string>>` — the legacy path→reason spelling;  `` |
| `ownerid-registry` | `gates/ownerid-registry.ts:18` | `` `OWNERID_ALLOWLIST: Readonly<Record<string, string>>` — the legacy path→reason spelling; E `` |
| `persistence-boundary` | `gates/persistence-boundary.ts:38` | `` `DEVICE_LOCAL_REGISTRY: Record<string, string>` — the legacy path→reason spelling; Exempti `` |
| `query-freshness-coverage` | `gates/query-freshness-coverage.ts:47` | `` `STATIC: Record<string, string>` — the legacy path→reason spelling; ExemptionTable makes ` `` |
| `query-freshness-coverage` | `gates/query-freshness-coverage.ts:120` | `` `DEFERRED: Record<string, string>` — the legacy path→reason spelling; ExemptionTable makes `` |
| `single-stream-transport` | `gates/single-stream-transport.ts:39` | `` `EXEMPT: Readonly<Record<string, string>>` — the legacy path→reason spelling; ExemptionTab `` |
| `two-class-role-authority` | `gates/two-class-role-authority.ts:55` | `` `SANCTIONED_HOMES: Record<string, string>` — the legacy path→reason spelling; ExemptionTab `` |
| `two-class-role-authority` | `gates/two-class-role-authority.ts:62` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `ui-size-via-variant` | `gates/ui-size-via-variant.ts:117` | `` `ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTable make `` |
| `zod-modern-spellings` | `gates/zod-modern-spellings.ts:100` | `` `ISSUES_ALLOWLIST: Record<string, string>` — the legacy path→reason spelling; ExemptionTab `` |

### B — multi-mode descriptors

| gate | receipt | modes |
| - | - | - |
| `finding-overload-provenance` | `gates/finding-overload-provenance.ts:329` | `` declares visit + visitFile `` |
| `no-inline-union-redecl` | `gates/no-inline-union-redecl.ts:262` | `` declares visit + run `` |
| `no-legacy-react-api` | `gates/no-legacy-react-api.ts:129` | `` declares visit + visitFile `` |
| `no-pointer-variants-in-features` | `gates/no-pointer-variants-in-features.ts:68` | `` declares visit + visitFile `` |
| `owner-scoped-reads` | `gates/owner-scoped-reads.ts:73` | `` declares visit + visitFile `` |
| `owner-scoped-upserts` | `gates/owner-scoped-upserts.ts:107` | `` declares visit + visitFile `` |
| `owner-scoped-writes` | `gates/owner-scoped-writes.ts:82` | `` declares visit + visitFile `` |
| `session-channel-boundary` | `gates/session-channel-boundary.ts:35` | `` declares visit + run `` |
| `testid-liveness` | `gates/testid-liveness.ts:274` | `` declares visit + run `` |
| `tooling-front-door` | `gates/tooling-front-door.ts:93` | `` declares visit + run `` |
| `tooling-instrument-proof` | `gates/tooling-instrument-proof.ts:107` | `` declares visitFile + run `` |
| `tooling-shared-plumbing` | `gates/tooling-shared-plumbing.ts:130` | `` declares visit + visitFile + run `` |

## A4 — diagnostic pointers

**F1 (the residual gap).** `diagnostic-legibility` reads the descriptor's `message:` — the group header. A
gate's per-occurrence `Finding.message` override is composed at RUNTIME (a template literal naming the stale
row, the dead position, the missing member) and is judged by nothing. The corpus is dense with them (the
stale-arm messages of `own-tables-only`, `no-hover-display-swap`, `bus-coverage`, `gate-ignore-inventory`, and
every table-carrying gate). Most DO carry a pointer by convention; nothing enforces it, and the ones that
regress are exactly the messages a blocked agent reads at the moment of blocking.

Candidate: extend `diagnostic-legibility` to the override literals it can statically resolve (it already owns
`evalString`-class machinery through `ast-read.ts`), with a `// terse-ok:` escape for the runtime-composed
tail it genuinely cannot reach — and a `mustPass` row writing that limit down.

## A5 — legacy tier / mode residue: CLEAN

Zero descriptors carry a `severity`, `tier`, `warn` or `level` field. The abolished warn tier left no residue
in the corpus; `GateDescriptor` has no such field, so a stale one would be a silent extra property the loader
ignores — which is why it was worth checking rather than assuming.

## B — multi-mode descriptors

Twelve gates declare more than one of `visit` / `visitFile` / `run`. This is NOT presented as a defect: the
descriptor contract explicitly admits the combination (`kinds`+`visit` for per-node accumulation, `run` to
judge the accumulation), and the accumulate-then-finalize shape is the documented idiom for a stale arm.

What the count IS good for: **`tooling-shared-plumbing` declares all three** (`gates/tooling-shared-plumbing.ts:130`),
which is the corpus's only three-mode gate and the one worth a second look — it now carries six arms plus two
exemption tables plus a five-row PROJECT_SITES census, and a gate that has grown three dispatch modes is the
shape §4.3's size carve was written to tolerate rather than to bless.

## C — dual-homed tests

**One genuine dual-home, with receipts:**

`verify-registry-parity` is `fsBacked: true`, so the conformance runner materializes a real temp dir for it —
and its `mustFlag`/`mustPass` rows already drive a planted `package.json` through every arm
(`gates/verify-registry-parity.ts:141` arm 1, `:150` arm 2, `:163` arm 3, `:174` + `:184` the pass halves).
The SAME three behaviors are also pinned standalone at `tests/tooling/verify/ops/run.int.test.ts:532`
(arm 1 bites), `:539` (no over-bite) and `:555` (arm 2 guarded), through a hand-built `runPass([gate])` over
`withTree`. The standalone predates the descriptor's fsBacked rows; the reason it existed is gone.

Candidate: delete the three standalone cases, keeping the gate's own conformance rows as the single home.
Coupled site: `tests/tooling/verify/ops/run.int.test.ts` also imports the gate for its `runParityGate` helper,
which would go with them.

**Nine NOT dual-homed, and the reason is written down in each file.** The five `*.residual.test.ts` suites
each open with a paragraph stating exactly which arm could not become a conformance example and why —
`hasPointer` is a pure helper with no file to fire on; `monotonic-tests` tooth 2 needs real disk under a
descriptor that is not `fsBacked`; the `no-test-fabrication` / `suppressions` / `warning-code-coverage`
ratchet arms need an INJECTED baseline the conformance runner cannot supply. The remaining four hits
(`bus-coverage`, `no-caller-user-id`, `no-off-token-radius-shadow` in the scoped/render suites) are gates used
as SPECIMENS of a scope-safety class by the harness's own tests, not re-assertions of their rules.

## D — tests pinning outgrown behavior

Zero found. The nearest candidates were the three `verify-registry-parity` standalone cases in §C — but they
pin CURRENT behavior in a second place, which is duplication, not rot. Two behaviors the P6 move DID outgrow
were swept in the move commit rather than left here: the `tsx …/scoped.ts` argv expectation and the
`gen-test-baseline-manifest.ts` regen-command regex, both of which named files that no longer exist.

## The `__g_` planting question — mechanics, then a recommendation

**Today.** `check-gates.int` and `gate-ignore-grammar.int` plant `__g_`-prefixed fixtures AT REAL TREE PATHS
(`packages/server/src/domain/__g_x/…`, `tests/…`, `tooling/src/verify/gates/__g_…`) because a gate's
`scanRoot` is a repo-relative PREFIX — a fixture only fires the gate if it sits where the gate looks. The
sentinel is fenced in eight places: `.gitignore:99`, and seven config mirrors
(`tsconfig.base.json:121` · `tsconfig.json:79-80` · `tooling/tsconfig.json:12` · `biome.json:24` ·
`vitest.config.ts:20` · `eslint.config.js:146` · `.dependency-cruiser.cjs:700`). Findings on `__g_` paths are
stripped at the real-tree entrypoints (`lib/pass.ts` `PROBE_ARTIFACT_RE`) so a concurrent battery cannot red
an independent run, and both suites carry `SERIAL_INT` rows *because they share the sentinel namespace*.

**A gitignored staging dir is not a smaller idea — it is a bigger one.** It is already technically possible:
the harness takes `root` as a parameter, and the P6 run-completeness suite
(`tests/tooling/verify/ops/structure.int.test.ts`) proves the CLI runs correctly against an arbitrary planted
root at ~0.5s per case. The blocker is not the mechanism, it is the ANCHORS: the gates that matter most read
real sibling files — `own-tables-only` and a dozen db gates need `packages/db/src/schema/index.ts` present as
the real-tree anchor; `baseui-*` need `packages/ui/node_modules/@base-ui/react`; `dangling-refs` needs the
whole `docs/` tree; every stale arm is deliberately guarded on an anchor that a synthetic tree does not have
(GATE-AUTHORING §4.5 — a `scope.kind` check was rejected for exactly this reason). A staging root would have
to mirror or symlink most of the repo, at which point it IS the repo with an extra layer of indirection, and
the anchor guards would start passing for the wrong reason.

**RECOMMENDATION: keep in-place planting.** The cost it is blamed for — the `SERIAL_INT` coupling — is not
caused by planting in-place; it is caused by the two suites sharing ONE sentinel namespace and each reaping
`__g_*` wholesale on teardown. The available improvement is therefore much smaller and much safer than a
staging dir:

> Give each suite (or each run) its OWN sentinel segment — `__g_cg_…` / `__g_gi_…`, or `__g_<pid>_…` — and
> scope each teardown's `find` to its own segment. The eight fences already match `__g_*` by prefix, so no
> config moves. `SERIAL_INT`'s two tree-writer rows could then drop their mutual exclusion (the fixed-port
> lifecycle row is unrelated and stays), which is the actual wall-clock win on the table.

That is a follow-up item, not a P6 change: it edits two suites that are not concurrency-safe with themselves,
and proving the new isolation needs a deliberate concurrent run.

## Routing

| # | finding | scope |
| - | - | - |
| F1 | `diagnostic-legibility` does not judge per-occurrence `Finding.message` overrides | gate change + a declared-limit `mustPass` |
| F2 | 27 `scanRoot` sanctioned-home exclusions (§A2a) | a burn-down: each becomes scan-and-allowlist + a stale arm, or a written declared limit. Start with `scrubber-home` (named in the law as the anti-pattern) |
| F3 | 29 legacy `Record<string, string>` exemption tables (§A3) | mechanical: `ExemptionTable` makes `why` type-enforced; the law says migrate when you touch the gate |
| F4 | 19 `scanRoot` predicates ≥3 clauses (§A2c) | each owes the §3 receipt: run the predicate over the real file list and READ what it drops |
| F5 | `verify-registry-parity` triple-pinned in `run.int.test.ts` (§C) | delete the standalone cases; conformance is the home |
| F6 | per-suite `__g_` sentinel segments, and drop the two `SERIAL_INT` tree-writer rows | test-infra change + a concurrent-run proof |

## LANDED RECORD — the remediation (lane tool-verify, #417, 2026-08-22)

The rows above are the flag-only census as delivered. This section is what actually landed against them, and
what was REFUTED on re-derivation. Every count below is a receipt, not a plan.

**F2 — 24 of 27 converted to scan-and-allowlist; 3 refuted.** The converted gates SCAN their sanctioned home
and exempt it with a cited `ExemptionTable` row, swept by ONE shared RENAME TRIPWIRE
(`tooling/src/verify/lib/sanctioned-home.ts` — mode B of §4.4a: a row resolving to no file is RED). The
receipt that the homes are genuinely scanned now is each gate's own scan denominator: `scrubber-home`
2878→2880, `no-direct-useform` 5392→5420, `sole-env-reader` 1331→1335, `ui-skin-fragment-purity` 317→337,
`single-stream-transport` 25→26, `bus-channel-primitive` 55→56, `no-effect-on-shared-selection` 719→773,
`client-cache-surgery-only-in-data` 965→1017, `no-pointer-variants-in-features` 719→773,
`no-raw-interactive-intrinsics` 442→477, `no-raw-clock` 2808→2880, `no-raw-random` 3328→3402,
`no-direct-users-read` 975→1018, `render-error-via-battery` 1012→1017, `selection-store-via-factory` 9→12,
the spacing/typography/z-index triplet 1332→1354 each, `theme-override-only-via-scope` 1345→1354,
`no-untrusted-html-in-main-dom` 1339→1354, `owner-role-split` 1334→1335 (`pnpm check:structure`, before/after).

**THE HAZARD WAS LIVE, and the conversion found it:** `no-raw-random`'s exclusion list carried
`packages/kit/src/prng/` and `packages/kit/src/random/` — NEITHER DIRECTORY EXISTS on this tree. Two
exemptions for nothing, unfalsifiable by construction, exactly what §3 predicts an excluded home becomes.
Both were deleted (not re-keyed as rows), and the tripwire is what makes the next one impossible.

**The 3 refuted F2 rows are SCOPE, not exemptions** (each already carries a written declared limit naming a
different enforcer, which is F2's own alternate disposition):

- `assumes-single-replica` excludes `/persistence/` — and `persistence-no-in-memory-state`'s `scanRoot` is
  exactly `p.includes("/persistence/")`. The two gates PARTITION the tree; nothing is unjudged, and the
  excluded zone is judged more strictly, not less.
- `own-tables-only` excludes `/persistence/` as its documented sanctioned CROSS-DOMAIN READ home (its header
  §"DECLARED LIMITS" already names `no-direct-users-read` + `discovery-no-stats-rollups` as the enforcers
  there). The exclusion is a CONVENTION over every domain's `persistence/`, not a path — enumerating it as
  rows would fight the convention, and a renamed convention makes this gate scan MORE, never less.
- `no-handwritten-wire-json-schema`'s clauses are `.test.` / `.test-d.` / `scripts/` — test and research
  ZONES with the reason written above the predicate. No sanctioned home is involved (an A2b row filed as
  A2a).

**F3 — 23 tables migrated; 4 rows REFUTED as fixture maps, not exemption tables.** `macro-resolution-home`'s
`DECLARATIONS`, `baseui-derives-not-respells`'s + `baseui-state-data-attributes`'s `MANIFEST_FILE`, and
`baseui-surface-manifest`'s `INSTALLED_ONE_PART` are conformance FIXTURE MAPS (path → mini-project SOURCE)
spread into `files:` blocks. The census keyed A3 on the `Record<string, string>` SHAPE, and for these four
the shape is a coincidence — migrating them handed `writeFileSync` an object (caught by the conformance
suite, reverted, and each now carries a why-line saying so). Two more (`no-raw-interactive-intrinsics`'s
`BURN_DOWN`, `single-stream-transport`'s `EXEMPT`) rode the F2 conversion of the same file. Two migrated
tables were also carrying DATA in the value slot rather than a reason — `db-structure`'s producer paths and
`list-row-adoption`'s allowed JSX root — and became `ExemptionRow` INTERSECTIONS (`{ producer, why }` /
`{ root, why }`), which is the §4.1 widening rule and is the exact failure the legacy spelling hides.

**F5 — landed.** The three standalone `verify-registry-parity` cases and the `runParityGate` helper are gone
from `tests/tooling/verify/ops/run.int.test.ts`; the one behavior conformance did not carry (the
`check:show` INSPECTOR half of the allowlist) moved into the gate's first `mustPass` row in the same commit,
so the deletion dropped nothing.

**F4 — NOT a code change, and the census's own framing is why.** "Each owes the §3 receipt: run the
predicate over the real file list and READ what it drops" is satisfied for the 19 by the SCAN DENOMINATOR
the harness already prints per gate (`scanned N/M files`, `gates[].scan` in `reports/check-structure.json`)
plus the zero-scan alarm. Of the 19, the 11 that were also A2a rows lost clauses in the F2 conversion above.
The remainder are unions of roots and test/tool-zone negations whose drop-set is the printed denominator.

**F6 — REFUSED, with the receipt.** The recommendation ("per-suite sentinel segments … `SERIAL_INT`'s two
tree-writer rows could then drop their mutual exclusion") does not hold on re-derivation: per-suite segments
fix the TEARDOWN collision but not the one that forces seriality. `check-gates.int` runs a whole-tree
`node tooling/src/verify/cli.ts structure` child under `ORB_GATE_FIXTURES=1`, and that opt-out is
ALL-OR-NOTHING — it disables `stripProbeFindings` for every `__g_*` path, not for one segment — so a
concurrent sibling's fixtures land inside the anti-drift `fired` set this suite asserts on. Segments alone
therefore cannot decouple the two suites; the opt-out would have to become segment-VALUED first. And even
then both files independently satisfy `SERIAL_INT` reason #2 (whole-tree scanners; each spawns a ~2-minute
full-corpus scan), so dropping their rows trades one serial scan for two concurrent ones plus the parallel
lane — a LOAD decision on a co-hosted box, not a sentinel decision. The sentinel-segment work's only stated
benefit was the row drop, so it was not done either. Both halves are the orchestrator's call with this
receipt in hand.

**F1 — not landed.** Unchanged from the census: `diagnostic-legibility` still judges only the descriptor's
group `message`. The candidate written in §A4 stands.
