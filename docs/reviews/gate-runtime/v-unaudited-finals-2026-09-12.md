---
kind: review
status: active
updated: 2026-09-12
---

# v-unaudited-finals — the 28 final policies no §5b wave ever read (#1584)

Lane `cb-v-unaudited-finals`. Fresh-context, read-only adversarial audit of every FINAL `defineGate` policy
that appears as a subject in NO `v-audit-wave*` / `v-exemplar-audit` / `v-gate-batch` / `v-*-2026-09-12`
verifier record. Held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md)
§5b's seven criteria and §4's proof rules. Isolated worktree at main's tip `6b1d01be0`; every number below
came out of a run produced in this session.

## POPULATION DERIVATION (the set, as data)

| step | count | method |
| - | -: | - |
| final policies | **237** | `grep -l '^export const gate = defineGate(' tooling/src/verify/gates/*.ts` |
| cross-check | **237** | newest main `check:structure` slot `main-2930600-2026-09-12T13-42-50-932Z`: `final {registered:237, ran:237, withheld:0}`, `ran 297` (60 legacy + 237 final) |
| named in an audit/verifier record | **209** | bare-token match of each module's basename across the concatenated corpus of 13 records (10,597 lines) |
| **REMAINDER — this lane's set** | **28** | `comm -23` |

The subtraction is deliberately GENEROUS (a module merely mentioned in a record counts as covered), so the
28 are modules no record names at all. A strict `gates/<name>.ts` path-shaped match would have left 208
uncovered — the records name their subjects as bare tokens, which is why the bare-token rule is the right
one and why the strict number is quoted here rather than used.

28 ≤ 40, so **all 28 were read header-to-last-row. Nothing in the set is NOT COVERED.**

## INSTRUMENT CONTROLS, RUN FIRST (both directions, every harness)

| instrument | control | result |
| - | - | - |
| `verifyPolicyProofs([policy])` per module | baseline over all 28 | **0 failures, all 28** |
| §4.1 cut harness (sibling scratch module in the gates dir, `rmSync` in `finally`) | `types-in-contract`: `declaration.isExported()` → `false` | **RED 1** (`mustPass[0]`) |
| same | comment-only no-op cut | **CLEAN** |
| same | non-unique anchor (`service.ts`, 8 occurrences) | **REFUSED — anchor occurs 8x** (the §4.1 false-clean guard works) |
| `runPolicyPass` file-map driver | `no-default-props` §4.2 positive arm | **effective 0 · waived 1 · alarms 0** |
| same | §4.2 DEAD-POSITION control (`(MyComponent)`) | **effective 1 · alarms 1** |
| same | §4.2 FOREIGN-ID control (`no-such-policy`) | **effective 1 · alarms 1** |
| header census reader | planted positive / negative header | **Y/Y/Y** and **-/-/-** |

Every cut asserts its anchor occurs EXACTLY ONCE in the file and refuses otherwise; every cut is written to
a SIBLING scratch module (never the real file) and removed in a `finally`. `git status --short` was EMPTY
after every batch and at the end. No real file under `tooling/` was modified at any point, so no shared-tree
announcement was owed.

## REAL-TREE LIVENESS, from the published slot (plants subtracted by name)

> **REFUTED 2026-09-12 (primary, note 639; re-derived on both slots).** The slot this section reads,
> `main-2930600-2026-09-12T13-42-50-932Z`, was VOIDED under #2069 before this audit ran: a fixture-planting suite
> wrote into the working tree while the run read it, so its 961 total carries **650 `__g_`/`__dc_` findings** that are
> fixture files, not positive controls. The clean slot `main-3632865-2026-09-12T15-40-44-410Z` (total 263) carries 0.
> Consequences: **the "20 of 28 carry a planted control, 8 do not" partition below does not exist** — zero final
> policies plant, by construction (guide §4.8), so "no planted control" is vacuously true of all 246 finals; the class
> the eight modules name ("silent when healthy AND silent when broken") is real but is **228 of 246**, not 8 (#2149
> carries the corrected scope and the ruling that every final owes one real-corpus liveness pin). The verifier acted
> correctly by every rule it had: a published slot carried no tombstone (#2167). Read the section below as the
> method it used, not as its numbers.

Read from `reports/runs/structure/main-2930600-2026-09-12T13-42-50-932Z/check-structure.json` (checkout
`main`, `complete: true`, 297 ran, `total 961`). **`__g_*` planted paths subtracted by name:** 20 of the 28
carry exactly one (or more) `__g_` finding, which is a POSITIVE CONTROL that those 20 fire on the real tree.

- **`component-size` is the only module with a genuine real-tree finding**: `packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:451` — `451 lines (cap 450)`. Product debt, not a gate defect; recorded so the next reader does not re-derive it.
- **8 modules have NO planted control and report nothing**: `contract-derives-not-respells-health`, `ct-poll-schedule-and-paint-health`, `external-id-single-writer-health`, `injected-op-caller-param-health`, `serde-core-seal-health`, `windowed-infinite-query-health`, `persist-partialize-and-total-migrate`, `section-factory-contribution-bundle`. **A health arm with no planted control is a gate whose real-tree liveness nothing proves** — it is quiet when healthy and quiet when broken, which is the blinded-gate shape. This is a CLASS row below, not eight module rows.

### Live meta-enforcer findings that NAME one of my 28 (same slot)

| enforcer | subject | what it says |
| - | - | - |
| `policy-waiver-identity` | `no-form-state-in-useeffect:169` | an ORDINARY policy with no positive §4.2 identity arm |
| `policy-proof-expectations` | `contract-derives-not-respells-health:79` | `messageIncludes` matches every finding the policy can emit — the row's discrimination claim is empty |
| `gate-modernization` | `serde-core-seal:31` | exemption vocabulary with no STALE arm |
| `diagnostic-legibility` | `component-size:35`, `component-size-ui:43`, `external-id-single-writer-health:100`, `injected-op-caller-param-health:53`, `windowed-infinite-query:174`, `windowed-infinite-query:223` | a diagnostic with no doc/code pointer |

`policy-waiver-spelling` (the mechanized §5b.3 enforcer) names **none** of the 28 — so §5b.3 is clean across
this set, and that is a real-tree receipt rather than the hand census the refutation ledger forbids.

## LEDGER ROWS (17 rows)

| module | lane · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `ct-story-single-import` | cb-v-unaudited-finals L1 · `ct-story-single-import.ts:106-116` (`jsxTreeRoot`) | **THE GATE IS BLIND TO A PAIRED ELEMENT — a reproducible false clean on a `hard` gate.** `jsxTreeRoot` climbs only through `JsxElement`/`JsxFragment`/`JsxSelfClosingElement`; a PAIRED tag's identifier sits under a `JsxOpeningElement`, which is in none of those, so the loop breaks at the first ancestor and the "tree root" is the identifier ITSELF — a unique scope per occurrence, so two paired references can never group. Driven on `runPolicyPass`: `<Story />` twice in one fragment → **1 finding** (the module's own `mustFlag[2]`); `<Story>one</Story>` twice in the same fragment → **0**; one paired + one self-closing → **0**; two self-closing inside a paired `<div>` → **1**. The eval-time `SyntaxError` the gate exists to prevent does not care which spelling was used | other (false clean) | **OPEN** | fix spec: climb through `JsxOpeningElement`/`JsxClosingElement` as well (or take the tag's `getParent().getParent()` element), and land BOTH paired shapes as `mustFlag` rows |
| `ct-story-single-import` | cb-v-unaudited-finals L2 · `ct-story-single-import.ts:259-266` (`mustPass[4]`) | **A FALSE PIN riding L1.** The `primitive.ct.tsx` row is cited as the proof that the `STORY_MODULE_RE` fence bites (`<Button>` twice from `@orb/ui/button`). Cutting `STORY_MODULE_RE` out of the `components.add` condition leaves it **CLEAN** — it passes because its `<Button>One</Button>` pair is PAIRED and therefore ungroupable, not because the specifier fence rejected it | §4.1 narrowing | **OPEN** | re-pin with a SELF-CLOSING non-story pair (`<Button />` twice) once L1 is fixed; `PASCAL_CASE` (cut → CLEAN) and `rewriteScope` (cut → CLEAN) are two further unpinned fences in the same module |
| `config-anchor-in-registry` | cb-v-unaudited-finals L3 · `config-anchor-in-registry.ts:51-54` (`isAnchorCall`) | **THE FOURTH POLARITY: an accusing arm whose predicate is an identity ACQUITTAL, fail-OPEN on `unreadable`, while a sibling arm in the SAME module fails closed.** `isAnchorCall` reports a stamp only on a RESOLVED canonical `configAnchorId` export, so an unreadable identity acquits; `renderedModules`' `readJsxTagFact` treats an unresolved tag as NOT-registered and accuses. Driven with a live registry present (so no receipt refusal masks it): direct import → **1 effective**; `opaque().configAnchorId("b","one")` (the guide's reusable falsifier) → **0**; mint imported from an unresolvable module → **0**; barrel re-export → **1**. The header says "Both halves are resolved identities" and records no per-arm answer | other (fail-open) | **OPEN** | fix per `lib/origin-verdict.ts`: the name prefilter already exists (`anchorNames.has(name)`), so fail CLOSED inside the candidate set and pin it with the opaque-receiver row |
| `config-anchor-in-registry` | cb-v-unaudited-finals L4 · `lib/reviewed-grants.ts:122,130` | **a reviewed-grant policy with TWO live grant rows and NO §4.3 grant-identity pin anywhere.** `config-anchor-stamp` occurs in exactly two files on the tree — the gate and the grant table — and in NO test. `registry-family.suite.test.ts` imports the gate into its conformance list only (`:4`, `:27`). So nothing proves the intended row is consumed exactly once, that a wrong operation stays effective, or that a renamed subject stales/withholds — the four things `home-client-family.suite.test.ts:259-305` pins for its family | §4.5 pin | **OPEN** | copy the four `runPolicyPass` grant pins from `home-client-family.suite.test.ts` into `registry-family.suite.test.ts` |
| `serde-core-seal-health` | cb-v-unaudited-finals L5 · `serde-core-seal-health.ts:67-71` | **the accusation's SUBJECT IDENTITY is unpinned: reporting the WRONG sanctioned domain passes every row.** Patching the message to name the opposite domain (`domain === "import" ? "export" : "import"`) leaves conformance **CLEAN**. Both arms anchor on `ANCHOR:1` and differ only in message, and each `why` claims WHICH sanction died — the §4 rule for exactly this shape | §4.1 narrowing | **OPEN** | add `messageIncludes: "\"import\""` to `mustFlag[0]`; the two messages are already disjoint on the domain string |
| `serde-core-seal-health` | cb-v-unaudited-finals L6 · `serde-core-seal-health.ts:52` | the byte-surgery IDENTITY fence is unenforced: replacing `pngChunkImport(node) !== ""` with `true` (so ANY import in a sanctioned domain counts as byte surgery) leaves conformance **CLEAN** — no row has a sanctioned domain importing something unrelated, which is the whole premise of "the claim behind its permission is dead" | §4.1 narrowing | **OPEN** | one `mustFlag` row: `domain/import/**` importing only `@orb/db`, both sanctioned files otherwise intact |
| `component-size` | cb-v-unaudited-finals L7 · `component-size.ts:18,33` (`CAP_ROUTE`) | **the route-cap branch is entirely unexercised — dead by fixture, in BOTH directions.** No row places a file under `packages/client/src/routes/`, so `CAP_ROUTE = 500 → 450` is CLEAN and `→ 1` is also CLEAN. The 500-line route cap the message advertises is enforced by nothing in the proof set | §4.1 narrowing | **OPEN** | two rows: a 501-line route file flags at `line 501`; a 451-line route file passes |
| `component-size` | cb-v-unaudited-finals L8 · `component-size.ts:22` | the `notNamed` test/spec/gen/`.d.ts` exclusions are unenforced (deleting the whole list: **CLEAN**) — while its OWN FAMILY SIBLING `component-size-ui` pins the identical list (`notNamed → ["*.nope"]` reds `mustPass[2]` with 3 findings). One family, two standards, and the weaker half is the one on the bigger population | §4.1 narrowing | **OPEN** | copy `component-size-ui.ts`'s `mustPass[2]` shape (an in-scope file plus oversize excluded siblings) |
| `commented-code` | cb-v-unaudited-finals L9 · `commented-code.ts:16` | **the self-scan fence `notUnder: ["tooling/src/verify/gates/**"]` is unenforced** (dropping it: **CLEAN**) — the exact `pd-citation-integrity` class the guide names, on a policy whose own `mustFlag` string is parked code inside the scan root. Nothing stops a later widening from making the gate corpus report itself | §4.1 narrowing | **OPEN** | one `mustPass` row placing a parked-code comment at `tooling/src/verify/gates/<x>.ts` |
| `commented-code` | cb-v-unaudited-finals L10 · `commented-code.ts:7,26-31` | two further unenforced fences: the `SingleLineCommentTrivia` kind test and the `[;{}]` terminator. Individually CLEAN, and the JOINT cut (kind fence + widening the regex anchor to `/^\/[/*]/`) is also **CLEAN** — so this is a missing FIXTURE, not a redundant pair. The terminator is what keeps prose starting with `if`/`return`/`type` out of the population, i.e. the fence that prevents a mass false positive | §4.1 narrowing | **OPEN** | two rows: `/* const dead = compute(); */` flags; `// if the value is missing we fall back` passes |
| `windowed-infinite-query` | cb-v-unaudited-finals L11 · `windowed-infinite-query.ts:44-45` + `:339` (`mustPass[3].why`) | **the header's §4.1 matrix names a row that does not die, and the proof row repeats the claim.** The matrix says the factory-name cut reds "the `queryOptions` row; and the arm rows"; measured, the cut reds `mustFlag[4]` and `mustFlag[5]` only — `mustPass[3]` (the `queryOptions` row, whose own `why` says "Cutting the `callee.getName() === \"infiniteQueryOptions\"` test … turns this red") stays GREEN, because its single argument carries no `maxPages` and so produces no subject either way. Everything else in this module's matrix reproduced EXACTLY (receiver ×1, `neverRewinds` ×3, `LENS_METHODS` ×1, population ×1, const-hop wrong-direction ×2) | §5b.5 header | **OPEN** | correct both texts to name `mustFlag[4]`/`[5]`, or give `mustPass[3]` a `maxPages` so it genuinely dies under the cut |
| `no-form-state-in-useeffect` | cb-v-unaudited-finals L12 · `no-form-state-in-useeffect.ts:169` | no positive §4.2 identity arm: no marker-form `mustPass` row and no family-test pin (`simple-visitors-wave-4.suite.test.ts:87-100` uses this id only as the FOREIGN id in another policy's negative arm — the exact overcount the guide warns a grep makes). Independently reported by the live `policy-waiver-identity` enforcer in the published slot, so my read agrees with the gate | §4.2 identity | **OPEN** | add the marker row on `useEffect(() => {}, [form.state.values])` with position `form.state.values` (the `fix` already names that spelling) |
| `persist-partialize-and-total-migrate` | cb-v-unaudited-finals L13 · `persist-partialize-and-total-migrate.ts:84-90` (`isPersistCall`) | **an ALIASED `persist` inside the mint factory escapes the surviving arm, and nothing else checks option completeness.** Driven: bare `persist(() => ({}), { version, partialize })` in `create-persisted-store.ts` → **1 effective**; `import { persist as durable }` + `durable(…)` → **0**; options through a const hop → **0**. The header retires ARM A precisely BECAUSE the identifier reader "walks straight past an aliased import" and defers identity to `no-raw-zustand-persist` — but that sibling judges the MINT, not the options, and the factory is exactly where the mint is sanctioned. Neither limit is declared | §4.1 narrowing | **OPEN** | either resolve the callee origin (the sibling's reader) or declare both limits with `mustPass` rows saying so |
| `contract-derives-not-respells-health` | cb-v-unaudited-finals L14 · `contract-derives-not-respells-health.ts:33` | the header claims TWO death modes ("renamed, deleted, **or its matching table disappears**"); only the rename is pinned. Cutting `matchedTable(...) !== undefined` is CLEAN (a tripwire's fence acquits, so the standard direction does not apply). Driven directly: `ThemeRow` alive with the `themes` table REMOVED → **1 effective finding**, so the arm WORKS and no row reaches it | §4.1 narrowing | **OPEN** | one `mustFlag` row: the shape present, its table gone (the probe above is the fixture) |
| `contract-derives-not-respells-health` | cb-v-unaudited-finals L15 · `contract-derives-not-respells-health.ts:11` | §5b.4/§5b.7: the "shared reader" is the SIBLING GATE MODULE — `ALLOWLIST`, `DOMAIN_CONTRACT_RE`, `handWrittenShapes`, `matchedTable`, `tableNames` are all imported from `./contract-derives-not-respells.ts`, not from `lib/`. `serde-core-seal`'s pair does the same (`pngChunkImport`) and says so in its header; this one does not. §5b.4 asks for "a real shared `lib/` reader (module + function, named in the header)" | §5b.7 forbidden | **OPEN** | owner/architect call: either bless gate-to-gate export as the sanctioned split-family shape and say so in §12.3, or move the predicate to `lib/`. **Two live precedents disagree today** |
| `ct-poll-schedule-and-paint` | cb-v-unaudited-finals L16 · `ct-poll-schedule-and-paint.ts:23` | the header calls the `hard` occurrence half "the ORDINARY per-occurrence policy" two lines before saying "authority stays `hard`". `ordinary` is a CONTRACT keyword (a waiver door), and this is a file lanes are pointed at to copy. Separately: `UNTRUSTED_TRIGGERS.has(target.getName()) → true` cuts **CLEAN** (no row has a non-listed inner call such as `el.focus()` before a motion poll) | §5b.5 header | **OPEN** | reword to "the per-occurrence policy"; add the `el.focus()` `mustPass` row |
| `serde-core-seal` | cb-v-unaudited-finals L17 · `gate-modernization.ts:277-284` vs `serde-core-seal.ts:31` | **AN INSTRUMENT FALSE POSITIVE CREATED BY THE #1584 SPLIT.** `gate-modernization` ARM B requires a module carrying an exemption vocabulary to carry a STALE-arm DIAGNOSTIC in the SAME module (`STALE_VOCAB_RE` over that file's string literals). The split family puts the stale arm in the `-health` SIBLING by design, so `serde-core-seal`'s `SANCTIONED_DOMAINS` is accused while its ratchet demonstrably exists and is proven (`serde-core-seal-health` `mustFlag[0]`). Every split family with an exemption vocabulary inherits this | other (instrument) | **OPEN** | teach ARM B to accept a stale arm in a same-`family` sibling policy, or exempt final policies whose family has a `-health` member |

## CROSS-CUTTING CLASSES, counted PER MODULE (the leverage)

| class | modules | receipt |
| - | -: | - |
| **§4.1 population/subject fence UNENFORCED** — widening the declared population to `@authored` leaves every row green, so no row places its subject outside the fence | **9 of 28** | `component-size`, `ct-poll-schedule-and-paint`, `ct-story-single-import`, `external-id-single-writer`, `no-default-props`, `persist-partialize-and-total-migrate`, `serde-core-seal`, `test-no-stubs`, `types-in-contract`. PINNED in 9: `component-size-ui`, `ct-no-oneshot-live-read-assert`, `infra-auth-no-userid`, `no-if-is-group`, `no-layout-context-props`, `testid-typed-only`, `verb-naming`, `windowed-infinite-query`, `windowed-infinite-query-health`. The fix is one row and `windowed-infinite-query`'s `mustPass[6]` is the shape to copy |
| **population widening is the WRONG-DIRECTION cut and is therefore UNMEASURED** for the `entire-population` tripwires (their fences ACQUIT) | **7** | `config-anchor-in-registry`, `contract-derives-not-respells-health`, `ct-poll-schedule-and-paint-health`, `external-id-single-writer-health`, `injected-op-caller-param-health`, `section-factory-contribution-bundle`, `serde-core-seal-health`. `windowed-infinite-query-health` is the ONLY module in the whole set that states this direction rule in its header AND pins the cell with a `mustFlag`-goes-green row |
| **N/A — population is `of: "all"`** | 2 | `commented-code`, `no-form-state-in-useeffect` |
| **§5b.5 header records no FAMILY decision** | **14 of 28** | measured over the HEADER SPAN only, with planted positive/negative controls |
| **§5b.5 header records no POPULATION PORT** | **16 of 28** (and the reader counts a bare `POPULATION:` line as a port, so this is a LOWER bound on the gap) | same run |
| **§5b.5 header records no legacy SHA** | **24 of 28** | only `serde-core-seal`, `serde-core-seal-health`, `windowed-infinite-query`, `windowed-infinite-query-health` carry one. Same #2005 systemic row the ledger already tracks; this set does not improve it |
| **#944 third answer** | **0 of 28 implement an `unreadable` arm** | `grep -c 'unreadable\|UNREADABLE'` = 0 in all 28; no module imports `readSealedOrigin`/`sealedOriginReports`. So the throw-probe is N/A for this set — and L3 is the shape that exists INSTEAD: a fail-open acquittal with no vocabulary at all, which is exactly why the guide says to ask per ARM rather than grep for the comparison |
| **real-tree liveness unproven** — no planted `__g_` control and no real finding | **8** | listed above. A `-health` arm is quiet when healthy and quiet when broken |
| **gate-local `getDefinitionNodes()` binding resolution** | 8 modules corpus-wide, **1 of mine** (`ct-no-oneshot-live-read-assert:191`) | `ast-grep --lang ts -p '$X.getDefinitionNodes()' tooling/src/verify/gates/` → **16 matches in 8 files**. `windowed-infinite-query`'s header states the rule ("binding identity is a shared primitive (§12.3) and a gate may not own one") and replaced its own walk with `resolveStableExpression`; §12.3's own forbidden list does NOT name `getDefinitionNodes`. Reported as an UNSETTLED RULE with two live precedents, not as a module defect |

## COPY-SET UPDATE

**COPYABLE — point a conversion lane at these:**

- **`windowed-infinite-query-health`** — the best module in the set and the one to copy for any `-health`
  sibling: it states the tripwire CUT DIRECTION, pins every acquitting fence with a `mustFlag`-goes-green
  row (including a constructed one that a first pass had recorded UNFALSIFIABLE), receipts a CONSTANT rather
  than its own census, and records FAMILY + POPULATION PORT + legacy SHA.
- **`external-id-single-writer` + `-health`** — the exemplar for a two-policy family: a real shared `lib/`
  reader, a recorded population CORRECTION with its re-derivation, an ABSENT-SUBJECT arm that survives the
  subject being deleted, and `messageIncludes` rows that name WHICH carve-out died.
- **`section-factory-contribution-bundle`** — the exemplar for TYPE IDENTITY: identity is one declaration in
  one module, with a same-name/wrong-module counterfactual, a local-declaration counterfactual, an
  eleven-hop alias row, and per-arm anchors that keep two arms independently waivable.
- **`no-if-is-group`**, **`no-layout-context-props`**, **`infra-auth-no-userid`**, **`testid-typed-only`**,
  **`no-decorators`** — the ordinary-singleton shape: a declared SINGLETON family WITH its reason, a
  population port, a `fix` that names the derived position, the `@orb-waive` arm on a one-finding fixture,
  and (for the first three) a population row that actually dies without the fence.
- **`ct-no-oneshot-live-read-assert`** — copy its EXPECTATION-DISCRIMINATOR paragraph verbatim: it states
  that its constant `token` and single `message` make `token`/`messageIncludes` tautologies here, so every
  row carries `count` + `line` instead. That paragraph is the antidote to L5.
- **`test-no-stubs`** — copy its CROSS-FILE LEAK CONTROL: a fixture whose numeric offsets overlap ACROSS
  files, so the row only stays green while reconciliation is per-file. It also states why the row's paths
  are population coordinates rather than decoration.

**ANTI-PATTERNS — do not copy:**

- `ct-story-single-import`'s `jsxTreeRoot` (L1): an ancestor climb over a hand-listed set of JSX node kinds
  that omits the opening-element kind. Any "climb to the enclosing X" helper owes a fixture per SPELLING of
  X, not per shape of X.
- `serde-core-seal-health`'s `mustFlag[0]` (L5): a file-anchored multi-arm report whose arms differ only in
  `message`, expected with a bare `count`. That row shape cannot tell a correct accusation from an
  accusation naming the wrong subject.
- `config-anchor-in-registry`'s `isAnchorCall` (L3): a resolved-identity predicate in the ACCUSING position
  with no fail-closed branch, in a module whose other arm fails closed.
- `component-size`'s proof set (L7/L8) beside `component-size-ui`'s: same family, and the sibling pins two
  cells this one leaves open. When splitting a cap policy per package, copy the STRONGER half's rows.
- `persist-partialize-and-total-migrate`'s bare-identifier callee test (L13) — kept in the surviving arm
  after the header itself called that reader too weak.
- Any header that uses `ordinary` / `hard` as ENGLISH (L16). In this corpus they are contract values.

## WHAT THIS AUDIT IS NOT

No §4.6 differential (no module in this set except the four SHA-carrying ones records a legacy SHA to replay
against — the #2005 blocker). No `pnpm check:structure` run (forbidden to this lane; every real-tree number
is read from the published main slot named above). No mutation of any tracked file. The 5 `ct-*` and 2
`external-id-*` modules' `entire-population` fences were cut in the standard direction only where that
direction applies; the 7 tripwires' acquitting population cells are recorded as UNMEASURED rather than
guessed.
