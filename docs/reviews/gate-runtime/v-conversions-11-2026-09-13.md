---
kind: review
status: active
updated: 2026-09-13
---

# v-conversions-11 — the `devtools` / `bus-payload` / `baseui-read` conversions, fresh-context verification

Lane `cb-v-conversions-11` (claude-b). Adversarial verification of the seven final policies landed by
`a196a35d7` (p-planter-trio part 1) and `17297f298` (p-baseui-family). Every number below is run output
produced in this session, in this worktree; nothing is re-quoted from a commit message.

## 1. Base

- Base sha: **`17297f2981c970063ed9089625abc71b4bf39368`** (`git -C <wt> rev-parse HEAD`), tree clean at start
  and at finish.
- Root: `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a2282482604a04ecc`
- Parents verified: `a196a35d7bd4014bbf0a3e65d8b8dffe1a08f3b2`, `17297f2981c9…`. The brief's second baseui sha
  `cc2a7f76d` exists as a commit object but is not on this branch's first-parent line; `17297f298` carries the
  whole baseui diff, so I verified against that. **Brief premise corrected:** the brief says *"9 reviewed-grant
  rows added"* for the bus family — the diff is `+9 LINES`, which is **one** grant row
  (`bus-payload-allowlist:credential-id`). Everything below reads it as one row; the §4.3 arms confirm it.

### Instruments run whole (real tree, this worktree)

| Command | Result |
| - | - |
| `pnpm check:policy-conformance` | **exit 0** — `261 final policies · 3096 proof rows · 16 refusal rows · 0 failure(s) · 216 grant rows · 0 invalid · 47814ms (corpus: 305 module(s), 44 legacy)` |
| `pnpm gate:contract` | exit 1 (legacy remainder, by construction) — `339 finding(s) across 305 gate module(s)`; **grep of the log for all seven ids returns 0** — the four converted legacy ids are gone from its rows |
| `pnpm check:structure --check devtools-frontend-assets` | exit 0 · `raw 0 = waived 0 + granted 0 + effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld` · population `0 source · 505 resource` |
| `pnpm check:structure --check bus-payload-allowlist --check bus-payload-allowlist-health` | exit 0 · `raw 1 = waived 0 + granted 1 + effective 0 · 0 alarms · 0 tool errors · 0 withheld` · `bus-payload-allowlist: 259 member(s)` (the commit's 259 = 259 claim reproduces) · `fact bus-payload-shape: success · 105 member(s)` |
| `pnpm check:structure --check baseui-{surface-manifest,anatomy-completeness,derives-not-respells,derives-not-respells-health}` | exit 0 · `raw 7 = waived 7 + granted 0 + effective 0 · 0 alarms · 0 tool errors · 0 withheld` · populations `366 source` ×3, `0 source · 790+1+1 resource` for surface-manifest |
| `pnpm check:structure --check tooling-project-home` | exit 0 · `raw 9 = granted 9 = effective 0 · 0 alarm(s)` — `baseui-read.ts`'s **two** `new Project` sites (`:120`, `:144`) aggregate to ONE finding, so the grant stays 1:1 |
| `pnpm test:scoped` × 6 suites (`enforcement-registry-parity.int`, `bus-payload-family`, `baseui-and-surface-family.repo.int`, `devtools-frontend-assets.int`, `port-parity-tier3`, `_shared/devtools-assets`) | **70/70 pass** |
| `pnpm test:scoped ui-gate-structural-regressions.int + baseui-read.int + reviewed-grants` | **1 FAILED / 9 passed** — `reviewed-grants.test.ts` (see LR-3) |
| `pnpm check:structure --check dangling-refs` | exit 1, **2 findings, both pre-existing** (`Core-Path-Registry.md:146` `domain/hub`) — not attributable to these commits, and the gate is structurally blind to the phantom TEST-FILE citation below (its corpora are docs, not gate comments) |

The **planters were NOT run** (fence). Where a planter arm mattered I evaluated its literal predicate against
the live loader instead — receipt in LR-2.

### Method notes (so a re-runner can reproduce)

- §4.1 cuts ran through a scratch harness that writes **one sibling module PER CUT with a serial in the name**
  in the same directory (relative imports resolve), asserts the **anchor occurs EXACTLY ONCE** in the file and
  refuses otherwise, re-imports the GATE as well when a `lib/` reader was patched (the split-family false-clean
  rule), runs the module's rows through `verifyPolicyProofs`, and `rmSync`s in a `finally`. An **unpatched
  CONTROL copy ran first in every batch and reported 0 rows dead every time.** 40 cuts/probes total.
- One real file was probed with `cp`/`mv` (`tooling/src/_shared/devtools-assets.ts`), announced to the
  orchestrator before and after; restored, `git status --short` empty.
- `mode: "resource"` fixtures the harness drives are the conformance runner's own OS-tmpdir substrate — nothing
  was planted in the checkout.

---

## 2. Per-module verdicts

### 2.1 `devtools-frontend-assets` — **PARTIAL**

**Confirmed by run output.**

- Contract shape is the smallest complete one for its plane: `population: { of: "none" }`, `analysis: "resource"`,
  `execution: "entire-population"`, `facts: []`, three closed resource requests, every read wrapped in
  `readyResourceValue`. Structure run above: 0 tool errors, 0 withheld, 505-file resource population.

- **No filesystem read survives behind the contract.** The policy imports exactly `adjudicateDevToolsClosure`
  and `readChromiumBrowserVersion` from `_shared/devtools-assets.ts`; I read the whole reachable call graph
  (`parseDevToolsAssetPin` · `parseManifest` · `parseLicenses` · `verifyResourceClosure` · `verifyLicenseClosure` ·
  `verifyMember` · `safeMember` · `verifyExactInventory`) and none of them touches `node:fs`. The fs-reading
  functions in that module (`closureCensus`, `readClosureInput`, `installedPlaywrightTuple`,
  `verifyDevToolsAssetsSync`) are reachable only from the runtime entry point, not from the policy.
  `verifyDevToolsAssetsSync` keeps its signature and delegates — the §12.7 one-algorithm claim holds.

- **§4.1, four claimed fences, all ENFORCED, direction "flag MORE" in each case (cut = replace the predicate with
  `false`, i.e. fail it OPEN):**

  | Cut | Direction | Row that died |
  | - | - | - |
  | `safeMember`'s four-clause canonical-relative test → `if (false)` | open | `mustFlag[2]` |
  | the installed Playwright/Chromium tuple comparison → `if (false)` | open | `mustFlag[3]` |
  | `verifyExactInventory`'s inventory comparison → `if (false)` | open | `mustFlag[1]` |
  | `verifyMember`'s hash/size comparison → `if (false)` | open | `mustFlag[0]` |

- **Instrument controls both directions.** `count: 99` planted on all four `mustFlag` rows fails all four
  (`expected 99 but got 1` ×4) — every count is exact. The two `mustRefuse` discriminators **transplant-test
  clean in both directions**: `mustRefuse[1]`'s text onto `[0]` reds (`[population] … devtools-closure is
  missing`), `[0]`'s onto `[1]` reds (`[evaluate] … installed-package:playwright-core:text:browsers.json … came
  back missing`). Two genuinely different refusal doors, each pinned.

- Marker census reproduces: **0 = 0 = 0**. Positive controls measured here: 132 files carry `@orb-gate-ignore`,
  781 carry `@orb-waive` (the header says 774 — a drifted-by-merge number, not a defect). The single
  `@orb-gate-ignore devtools-frontend-assets` hit on the tree is the module's own header prose at `:45`.

**Why not CONFIRMED — LR-8.** Six adjudicator clauses cut CLEAN against the policy's rows. Five of them are held
by **no tier at all**: with `manifestChecksum`, `decodedBytes`, `licenceSource`, `urlCorrespondence` and
`licenceFamily` **all forced open at once** on the real `_shared/devtools-assets.ts`, `pnpm test:scoped
tests/tooling/_shared/devtools-assets.test.ts` still reports **9 passed (9)** and no proof row dies. The sixth
(the symlink refusal in `closureCensus`) is held by that suite's *"symlinks are forbidden even when their target
is an ordinary file"*. This is the guide's WRONG-DIRECTION class (each cut makes the policy flag LESS), so the
fix is a `mustFlag` per clause, not a `mustPass` — and the module's own header calls
`adjudicateDevToolsClosure` *"THE WHOLE CONTRACT"*, which is the claim these five clauses currently do not carry.
Also LR-12: the header says that suite has "8 rows"; it has 9 tests.

### 2.2 `bus-payload-allowlist` — **PARTIAL**

**Confirmed by run output.**

- §4.1 matrix (cut = force the fence open so the policy flags MORE), driven against **this** sibling and named
  as such:

  | Cut | Direction | Rows that died | Class |
  | - | - | - | - |
  | `BUS_DECL_NAMES.has(node.getName())` → `true` | open | `mustPass[1]` · `mustPass[2]` | ENFORCED |
  | `BUS_FILES.has(relativePath)` fence → `if (false)` | open | **none** | **MUTUALLY REDUNDANT** — see the joint cut |
  | both cut TOGETHER (§4.1's joint procedure) | open | `mustPass[1]` · `[2]` · `[6]` · `[8]` | ENFORCED jointly; `mustPass[8]`'s `why` (*"the row that dies if the root dispatch is dropped and the population is mistaken for the subject set"*) is TRUE only under the joint cut, which is the honest reading |
  | the non-transitive field boundary opened (a field's named `TypeReference` followed through `followIdentityRef`) | open | `mustPass[2]` | ENFORCED |
  | `groupByGrantIdentity`'s `(subject, operation)` key made per-occurrence | open | `mustFlag[11]` (`count 2 → got 3`) | ENFORCED — the grant-granularity claim is real |
  | `smellToken(...) !== undefined` filter → `true` | open | 19 rows | the RULE, not a fence |

- **§4.3, all three directions, reproduced by running `bus-payload-family.suite.test.ts`** (12/12): the table holds
  exactly `[["credentialId","bus-payload-field"]]`; the intended grant is consumed **exactly once**
  (`grantedFindings 1`, `effectiveFindings []`, `authorityAlarms []`); a **wrong operation** leaves the finding
  effective and raises `stale-reviewed-grant`; a **renamed subject** stales the row. Raw N = granted N is also
  the real-tree receipt above (`raw 1 = granted 1`).

- §4.6 receipts I could reproduce independently: real-tree `raw 1 → granted 1 → effective 0`, member census
  **259**, `0 tool error(s)`, `0 withheld`. The family test's real-corpus liveness arms (planted `apiKey` on a
  live union reported; the live grant consumed) pass.

- Marker census 0 = 0 = 0 confirmed: every `@orb-gate-ignore bus-payload-allowlist` hit on the tree is prose —
  the two modules' own headers and two `docs/catalog` receipt strings — all excluded by §8 step 6.

**Why not CONFIRMED — LR-2, LR-3, LR-10.** Two landed coupled-site defects and one receipt-honesty defect; LR-2
is a **new suite red on `main`**.

### 2.3 `bus-payload-allowlist-health` — **CONFIRMED**

- §4.1: every fence I could cut is enforced, and I applied the **REVERSE direction where the arm is a tripwire**.

  | Cut | Direction | Rows that died |
  | - | - | - |
  | `fact.corpusFiles < REAL_CORPUS_MIN` abstention → `if (false)` | the tripwire speaks always | 14 rows (all 8 `mustFlag`, all 6 `mustPass`) |
  | `contributionMark` stops counting `refusals.length` | open | `mustFlag[3]` · `[4]` · `[5]` |
  | `FIELD_KEYLESS_KINDS` narrowed back to `MEMBERLESS_KINDS` (the #1066 widening reversed) | open | `mustFlag[1]` · `mustPass[0]` · `[1]` · `[3]` · `[4]` |
  | `forwarded`/root fences — n/a (different family) | — | — |

- **§12.3 / the brief's item 3, driven:** `busPayloadFact`'s receipt states what it MEASURED —
  `members: context.files.length, unresolved: 0` (`lib/bus-payload-fact.ts:900`), never the census; the real
  run prints `fact bus-payload-shape: success · 105 member(s)` against a 105-file population, not a field count.
  Driving the `-health` policy on an **EMPTY CENSUS** (70 `@contracts` files, zero bus roots) through
  `runPolicyPass`:

  ```
  toolErrors=0   effectiveFindings=10   withheld=[]
  receipts=["population:bus-payload-allowlist-health:members=1:unresolved=0"]
  first finding: packages/contracts/src/filler/f0.ts :: blindness tripwire (§4.6) — …
  ```

  It **reports rather than tool-erroring**, and it receipts the CONSTANT `members: 1` exactly as §12.3 rule 2
  requires. Both siblings together on the same corpus: 0 tool errors, 0 withheld.

- The `-health` module cites no non-existent test file, declares `hard`/`error` honestly (no waiver door), and
  its three anchor moves are each stated with the reason.

### 2.4 `baseui-surface-manifest` — **REFUTED**

The contract shape, the `identity()` `state` term, the `NON_COMPONENT_DIRS` fence, the ledger-shape arm and the
refusal pins all hold (receipts below). It is REFUTED because **three of the arms its own header advertises are
enforced by no proof row, and one of them is the module's headline claim.**

**Enforced (§4.1, cut direction "flag MORE" unless noted):**

| Cut | Direction | Rows that died |
| - | - | - |
| `identity()` drops `part.state` | flag LESS (a `mustFlag` goes green) | `mustFlag[2]` and only that row — the header's claim is exactly true |
| `NON_COMPONENT_DIRS` emptied | open | `mustPass[2]` |
| `part.disposition !== "exposed"` on the NO_REASON arm removed | open | 7 rows (`mustFlag[0,1,2,5,6]`, `mustPass[0,2]`) |

**REFUTED — three UNENFORCED arms, each with a falsifier I wrote and RAN (guide §4.1: "before recording
UNFALSIFIABLE, write the row that would discriminate and RUN it"):**

| Arm | Cut alone | Constructed row at tip | Same row under the cut |
| - | - | - | - |
| `diffParts`'s **vanished-PART** direction | CLEAN | PASSES (`count: 2` — the drift finding plus the blind-part finding the empty entry also produces) | **REDS** (`count=2 but got 1`) |
| `diffSurface`'s **vanished-COMPONENT** direction | CLEAN | PASSES (`count: 1`, `"vanished from the installed package but still has a manifest entry"`) | **REDS** (`at least one … but got 0`) |
| `diffSurface`'s **version comparison** | CLEAN | PASSES (`count: 1`, `"the manifest describes 9.9.8"`) | **REDS** (`at least one … but got 0`) |

The third is the one that matters most: the module's first paragraph is *"This is the version-bump tripwire"*,
and no row proves the version comparison fires. All three are WRONG-DIRECTION cuts (they make the policy flag
LESS), so the fix is three `mustFlag` rows, which I have already written and run — LR-4 carries them.

**§4.5 pin gaps (LR-9).** The family test pins `json:baseui-manifest` **missing** and **unparseable** for four
policies, and `installed-package:base-ui:ast` **missing** for this one. Two more reachable statuses have no pin,
both demonstrated by a planted row:

```
[evaluate]   resource installed-package:base-ui:metadata was declared ready by population resolution
             but came back unresolved: installed package base-ui (metadata) could not be read …
[population] resource declaration json:baseui-manifest is empty: resource file is empty:
             tooling/src/verify/gates/baseui-surface.manifest.json
```

`resource-policy-contract.md` §3.6 asks for **one pin per declared resource per non-ready status**; `empty` is a
distinct `json` fact by that document's own §2 table, and `unresolved` on the metadata door is reachable from a
`package.json` that merely lacks `version`.

**LR-1** also applies (phantom test-file citation, ×2 in this module).

### 2.5 `baseui-anatomy-completeness` — **REFUTED**

**Enforced:** arm C's blindness guard (cut → 6 rows die, `mustFlag[0,1]` + `mustPass[0,1,2,4]`). The `@ui`
population port is byte-identical on repo-relative paths and the structure run reports `population 366 source`,
matching the legacy `scanned 366/7557` the header records.

**REFUTED — two unenforced fences, one of them with a `why` that claims the opposite:**

1. **The `part.disposition !== "unresolved"` carve on arm B.** Cut alone: CLEAN. The module's `mustPass[2]`
   `why` presents itself as the row that holds it (*"a DECLARED LIMIT: `unresolved` is baseui-surface-manifest's
   red"*), but its fixture is `MANIFEST("unresolved")` + `ROOT_ONLY` — Backdrop is **not rendered**, so
   `site === undefined` and the carve is never reached. This is precisely the guide's *"a clean cut is more often
   an unenforced FIXTURE than an unenforced fence"* shape. My constructed row `MANIFEST("unresolved")` +
   `ROOT_AND_BACKDROP` **passes at tip** and **reds under the cut** with
   `` `Select.Backdrop` is rendered at …:4, but the ledger rules it "unresolved" ``.
2. **The `part.kind !== "part"` continue.** Cut alone: CLEAN, and it is *not* unfalsifiable —
   `contract/baseui.ts` ships `EXPORT_KINDS = ["part","hook","type"]`. My constructed row (a `"kind":"hook"`
   entry ruled `exposed`, not rendered) **passes at tip** and **reds under the cut** with
   ``the ledger rules `Select.useFilter` "exposed", but no @orb/ui seal renders it``.

**Arm C's guard is a raw text scan and the header's comment posture is false (LR-7).** `create`'s guard is
`ctx.files.some((sf) => sf.getText().includes(BASE_UI_MODULE_PREFIX))` while the header declares
`COMMENT POSTURE: comment-SAFE`. Measured, and the two positions differ:

- a **file-leading** comment carrying `@base-ui/react/` does NOT satisfy the guard (ts-morph
  `SourceFile#getText()` excludes leading trivia) — arm C still fired;
- a **mid-file** comment DOES satisfy it: the row identical to `mustFlag[2]` except that the anchor file is
  `export const TOKENS = 1;\n// see @base-ui/react/select for the anatomy\nexport const OTHER = 2;\n`
  produced **2 findings instead of arm C's 1** — the blindness verdict was replaced by two arm-A accusations.

So one comment turns a *"this run is blind"* verdict into two false *"the seal does not render it"* findings, and
the module's stated posture does not describe its own predicate.

**LR-1** applies (phantom test-file citation).

### 2.6 `baseui-derives-not-respells` (ordinary) — **PARTIAL**

**Every fence the module names as held by a specific row IS held by that row** — the four cuts, each driven
against the named sibling (§4.1's split-family rule):

| Cut | Direction | Row that died | Module's claim |
| - | - | - | - |
| `foldPart`'s `if (!at.isRoot) return;` deleted | open | `mustPass[2]` | *"Cut the `isRoot` fence in `foldPart` and this is the row that dies, and it is the ONLY row that does"* — **TRUE** |
| `isPropsInterface` forced `true` | open | `mustPass[3]` | *"Cut `isPropsInterface` and this is the row that dies"* — **TRUE** |
| `referencesIdentifier` relaxed to a substring test | a `mustFlag` goes green | `mustFlag[1]` | *"the row that dies if `referencesIdentifier` is relaxed to a substring test"* — **TRUE** |
| `derivesFromBase` forced `false` (the rule) | open | `mustPass[0]` | the rule, not a fence |
| the `forwarded` fence deleted, driven against **THIS** sibling | open | **none — CLEAN** | correctly not claimed here; it is the `-health` sibling's `mustPass[2]` that holds it (cut 6 below), which is the split-family false-clean the guide warns about and this family avoids |

**§4.2 identity arm:** present as `mustPass[1]` in the module (marker at the reported position on a
one-finding fixture) and re-proved with all three assertions by the family test's
*"§4.2 identity arms — the reported position IS the waiver position, and it discriminates"* block, including the
dead-position negative for the sibling `baseui-portal-container-seam`. The real-tree run shows
`ordinary/error · waived 7 · 0 alarms`.

**§8.6 marker census reconciled, arithmetic closed with a positive control.** Located each waiver by hand:
`select/select.tsx` 1, `combobox/combobox.tsx` 3 (`items`, `value`, `defaultValue`),
`autocomplete/autocomplete.tsx` 3 — **7 live product waivers**, matching the header's per-file `3 → 3 / 3 → 3 /
1 → 1` and the legacy count of 7 recorded independently in
`docs/reviews/gate-runtime/v-authority-census-2026-09-12.md:205`. The structure run's `waived 7` closes
**7 = 7 = 7**. Positive controls: 132 `@orb-gate-ignore` files, 781 `@orb-waive` files repo-wide; the four
non-product `@orb-waive baseui-derives-not-respells` hits are the roster doc's spelling example, the family
test's counting literal, the module's own `fix` string and its `mustPass[1]` fixture.

**Why PARTIAL:** LR-1 (phantom test-file citation at `:58`) and LR-11 (`analysis: "resource"` +
`execution: "selected-files"` deviates from `resource-policy-contract.md` §1(4)/§3.4 without recording the
deviation).

### 2.7 `baseui-derives-not-respells-health` — **CONFIRMED**

- §4.1, both fences the module names, each driven against **this** sibling:

  | Cut | Direction | Row that died | Module's claim |
  | - | - | - | - |
  | `derivedAliases` never populated | open | `mustPass[1]` | *"Cut `derivedAliases` from the shared reader and this is the row that dies"* — **TRUE** |
  | the `forwarded` fence deleted (judge by NAME alone) | open | `mustPass[2]` | *"Cut the `forwarded` fence and this is the row that dies"* — **TRUE** |

- The split is total and asserted rather than assumed: `mustFlag[0]` here is byte-identical to the ordinary
  sibling's `mustPass[6]`, and `mustPass[3]` here is byte-identical to that sibling's `mustFlag[0]`. `handler`
  and `rootOwner` are mutually exclusive in `RespelledMember`, so neither arm can license the other.

- `hard` with no door is honest: the module records that the obvious unwaivability pin was **authored and RAN**
  and fails with `AUTHORITY ALARM [ordinary-waiver] … targets non-ordinary policy` — I did not need to
  re-derive that, because the central negative is owned once at `tests/tooling/verify/lib/ordinary-waiver.test.ts`
  per §4.2, and the family test's dead-position control passes.

- Its two `messageIncludes` discriminators are disjoint by construction (`"DROPS 1 of its 2 arguments"` vs
  `"a hand copy rots"`), which is what §4.1 asks of a two-branch message.

- Cites no non-existent file. (LR-11's contract-shape note applies to it too but is filed once.)

---

## LEDGER ROWS (12 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `bus-payload-allowlist` | v-conversions-11 · `tests/tooling/check-gates.repo.int.test.ts:1118` | **A LANDED SUITE RED.** `a196a35d7` converted the gate and rewrote its `UNFIXTURABLE_GATES` comment to say *"its row is GONE from the set below"*, but only removed `devtools-frontend-assets`; `"bus-payload-allowlist"` is still in the set. The two-sided arm at `:1241` (`[...UNFIXTURABLE_GATES].filter((g) => !legacyNames.has(g))` must equal `[]`) now FAILS. The arm was GREEN at `a196a35d7~1` (all seven rows named legacy modules there), so this is a NEW red, not baseline. The commit's own body says *"Suite NOT run — orchestrator-only"* | coupled-site / stale-exemption | **OPEN** | planter NOT run (fence); its predicate evaluated against the live loader: `legacy=44 final=261`, `bus-payload-allowlist: legacy=false final=true`, `filter(...) === ["bus-payload-allowlist"]` → `ARM WOULD FAIL`. Pre-state read with `git show a196a35d7~1:tests/tooling/check-gates.repo.int.test.ts` |
| `baseui-surface-manifest` · `baseui-anatomy-completeness` · `baseui-derives-not-respells` | v-conversions-11 · `baseui-surface-manifest.ts:43,82` · `baseui-anatomy-completeness.ts:47` · `baseui-derives-not-respells.ts:58` | Four NEW header citations point at `tests/tooling/verify/gates/baseui-family.test.ts`, **which does not exist**. The real home is `tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts`. §5b.5 asks the header to name the pin that proves the refusal; a phantom path is worse than none. (Two further pre-existing citations of the same phantom sit in `baseui-state-data-attributes.ts:42` and `baseui-portal-container-seam.ts:50` — same class, not this lane's) | header / dangling citation | **OPEN** | `ls tests/tooling/verify/gates/ \| grep -i baseui` → only `baseui-and-surface-family.suite.repo.int.test.ts`; `git show 17297f298~1:<each module>` → zero occurrences, so all four are new. `pnpm check:structure --check dangling-refs` is structurally blind to it (docs corpora only) |
| `bus-payload-allowlist` | v-conversions-11 · `tooling/src/verify/lib/reviewed-grants.ts:28` | The `bus-payload-allowlist:credential-id` row is inserted OUT OF SORT ORDER — before `bus-channel-primitive:bus-channel-mint`, where `"bus-c" < "bus-p"`. `tests/tooling/verify/lib/reviewed-grants.test.ts` asserts `keys === [...keys].toSorted()`. **Honest framing: that suite was ALREADY red at `a196a35d7~1`** on a separate pre-existing `seed-theme-ink-contrast` / `selection-store-via-factory` block, so the commit did not break it — it added a second, independently wrong position into an already-red suite | ordering / coupled-site | **OPEN** | `pnpm test:scoped tests/tooling/verify/lib/reviewed-grants.test.ts` → `1 failed \| 9 passed`; isolated: `rows=216 misordered positions=14`, `idx 2/3` are the new row, `idx 82–93` pre-existing (`git show a196a35d7~1:…` shows `selection-store-via-factory` at `:704` before `seed-theme-ink-contrast:meter-border` at `:766`) |
| `baseui-surface-manifest` | v-conversions-11 · `baseui-surface-manifest.ts:161,173,184` | THREE arms UNENFORCED by any proof row: `diffParts`'s vanished-PART direction, `diffSurface`'s vanished-COMPONENT direction, and `diffSurface`'s VERSION comparison — the last being the module's headline *"version-bump tripwire"* claim. Each cut is WRONG-DIRECTION (flags LESS), so the fix is a `mustFlag` per arm; all three are written and run below | §4.1 unenforced narrowing | **OPEN** | cut-alone: CLEAN ×3. Constructed rows PASS at tip and RED under their cut: vanished-part `expected count=2 but got 1`; vanished-component and version `expected at least one effective finding but got 0`. Fix spec: (a) `INSTALLED_ONE_PART` plus a manifest whose `parts` carries the live `Root` entry AND a `Separator` entry with empty `props`/`inherits` (a template literal over `ROOT_ENTRY("exposed","")`), `expect {count:2, messageIncludes:"vanished from the installed package"}`; (b) a manifest with a second component `Dialog` absent from the installed set, `expect {count:1, messageIncludes:"vanished from the installed package but still has a manifest entry"}`; (c) `manifestJson(ROOT_ENTRY("exposed","")).replace('"version": "9.9.9"','"version": "9.9.8"')`, `expect {count:1, messageIncludes:"the manifest describes 9.9.8"}` |
| `baseui-anatomy-completeness` | v-conversions-11 · `baseui-anatomy-completeness.ts:112` + `:199` | The `part.disposition !== "unresolved"` carve on arm B is UNENFORCED, and `mustPass[2]`'s `why` claims to be the row that holds it. Its fixture renders ROOT ONLY, so `site === undefined` and the carve is never reached — an unenforced FIXTURE, not an unenforced fence | §4.1 unenforced narrowing + false `why` | **OPEN** | cut alone CLEAN; constructed `{...MANIFEST("unresolved"), [SEAL_PATH]: ROOT_AND_BACKDROP}` as a `mustPass` PASSES at tip and REDS under the cut with `` `Select.Backdrop` is rendered at …:4, but the ledger rules it "unresolved" ``. Fix spec: add that row as a `mustPass` and correct `mustPass[2]`'s `why` to stop claiming the carve |
| `baseui-anatomy-completeness` | v-conversions-11 · `baseui-anatomy-completeness.ts:102` | The `part.kind !== "part"` continue is UNENFORCED, and it is NOT unfalsifiable — `contract/baseui.ts:8` ships `EXPORT_KINDS = ["part","hook","type"]` | §4.1 unenforced narrowing | **OPEN** | cut alone CLEAN; a constructed `mustPass` whose ledger carries a `"kind":"hook"` entry ruled `exposed` and unrendered PASSES at tip and REDS under the cut with ``the ledger rules `Select.useFilter` "exposed", but no @orb/ui seal renders it``. Fix spec: land that row |
| `baseui-anatomy-completeness` | v-conversions-11 · `baseui-anatomy-completeness.ts:62,154` | Arm C's blindness guard is a RAW TEXT SCAN (`sf.getText().includes(BASE_UI_MODULE_PREFIX)`) while the header declares `COMMENT POSTURE: comment-SAFE`. A MID-FILE comment mentioning `@base-ui/react/` satisfies the guard, replacing the blindness verdict with arm-A accusations; a FILE-LEADING one does not (ts-morph `getText()` drops leading trivia), so the two positions disagree | message/header truth + text-predicate | **OPEN** | probe row identical to `mustFlag[2]` except the anchor is `export const TOKENS = 1;\n// see @base-ui/react/select …\nexport const OTHER = 2;\n` → `expected count=1 but got 2` (two arm-A findings, arm C silent). The file-leading variant still fired arm C. Fix spec: ask the AST (`baseUiBindings(sf).length > 0`, already imported by the family's shared reader) instead of the file text |
| `devtools-frontend-assets` | v-conversions-11 · `tooling/src/_shared/devtools-assets.ts:330,381,406,374,414` | FIVE adjudicator clauses are held by NO enforcement tier: the manifest-checksum-vs-pin comparison, the decoded-byte-total drift check, the revision-pinned licence SOURCE check, the url/file correspondence + duplicate-url check, and the licence-family correspondence check. All five cut clean against the policy's rows AND against the runtime's own regression suite | §4.1 unenforced clause (WRONG-DIRECTION class) | **OPEN** | all five forced open at once on the real file (`cp`/`mv`, announced, restored, `git status --short` empty): `pnpm test:scoped tests/tooling/_shared/devtools-assets.test.ts` → `9 passed (9)`; per-clause cuts against the policy → `rows that DIED (0)` ×5. The sixth clean cut (the symlink refusal) IS held by that suite. Fix spec: one `mustFlag` per clause on the `mode: "resource"` substrate, each mutating exactly one field of `fixtureFiles` (a pin `manifestSha256`, a pin `decodedBytes`, a notice `source` off-revision, an asset `file` that is not `assets${url}`, a `licenseFamily` naming no family) |
| `baseui-surface-manifest` | v-conversions-11 · `tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts:256-294` | §4.5 pin gap: `resource-policy-contract.md` §3.6 asks one pin per declared resource per reachable non-ready status. `installed-package:base-ui:metadata` **unresolved** and `json:baseui-manifest` **empty** are both reachable and pinned by nothing (`metadata`/`ast` **missing** are also unpinned except through the whole-package drop) | §4.5 refusal coverage | **OPEN** | planted rows produced `[evaluate] resource installed-package:base-ui:metadata … came back unresolved: … could not be read` (from a `@base-ui/react` `package.json` carrying `name` but no `version`) and `[population] resource declaration json:baseui-manifest is empty: resource file is empty: …`. Fix spec: two more `runPolicyPass` pins beside the existing missing/unparseable pair |
| `bus-payload-allowlist` | v-conversions-11 · `bus-payload-allowlist.ts:120` | The consumer receipt is `members: Math.max(fact.fields.length, 1)`, and the comment two lines above says the census exists so that *"a census that shrank while the corpus did not is visible on the run line"*. At the one value where that matters — a census of **0** — the receipt reports **1** | receipt honesty | **OPEN** | driven on an empty census: `receipts=["population:bus-payload-allowlist:members=1:unresolved=0"]` with `fact.fields.length === 0` (the `-health` sibling reported 10 blindness findings on the same corpus). Fix spec: either receipt the true count and let the runtime's `count === 0` refusal fire (the `-health` sibling is the designated accuser and is unaffected), or delete the "visible on the run line" sentence |
| `baseui-derives-not-respells` · `-health` | v-conversions-11 · `baseui-derives-not-respells.ts:100,103` · `-health.ts:85,86` | Both declare `analysis: "resource"` with `execution: "selected-files"`. `resource-policy-contract.md` §1(4) and §3.4 require `execution: "entire-population"` of every `analysis: "resource"` policy and state *"where it disagrees with a module, the module is wrong"*. The modules' per-file reasoning is defensible, but neither records the deviation, so the binding contract and the tree silently disagree | contract conformance / undocumented deviation | **OPEN** | read of both modules against `docs/design/resource-policy-contract.md` §1 and §3.4. Fix spec: either amend the contract doc's clause to *"unless the verdict is genuinely per-file, stated in the header"*, or record the deviation in both headers with the reason — a lane's call either way, but not silence |
| `devtools-frontend-assets` | v-conversions-11 · `devtools-frontend-assets.ts:29` | The header says the runtime path's regression proof is *"tests/tooling/\_shared/devtools-assets.test.ts (8 rows…)"*; the suite has **9** tests | header count staleness | **OPEN** | `pnpm test:scoped tests/tooling/_shared/devtools-assets.test.ts` → `(9 tests)` / `Tests 9 passed (9)` |

ledger rows OWED: 12

---

## WHAT I DID NOT COVER

- **The four planters were not run** (`check-gates.repo.int`, `gate-ignore-grammar.repo.int`,
  `gate-conformance.repo.int`, `gate-spelling-twins.int`) — fence. LR-2 is an evaluation of `check-gates`'s
  literal predicate against the live loader, not a run of the suite. Someone must still run it at a quiet
  barrier; expect `:1241` red until LR-2 is fixed.
- **No whole-corpus `pnpm check:structure`** — the structure leg was gated and I did not need the tail. Every
  structure receipt above is a SELECTED `--check` run that publishes nothing.
- **The §4.6 differentials were not re-run from the parent sha.** I reproduced their *outcome* receipts
  (bus 259 members / raw 1 → granted 1 → effective 0; devtools 505-file resource population, 0/0; baseui 7
  waived / 0 effective) and the marker arithmetic, but I did not replay the legacy descriptors through
  `lib/pass.ts#runPass` at `<sha>~1`. The commits' fixture-level replay claims (surface-manifest 7/9, anatomy
  6/7, derives 12/12) are therefore **unverified by me** — they are the largest remaining hole in this report.
- **Only the fences I could name were cut.** ~40 cuts/probes across seven modules is not the complete fence set
  of `lib/bus-payload-fact.ts` (923 lines) — in particular the zod arm resolution, the mapped-type distribution
  resolver and `resolveNamedTypes`' population fence were exercised only through the modules' existing rows.
- `lib/baseui-read.ts` was never modified (sibling-lane fence). The `NON_COMPONENT_DIRS` cut ran against a
  scratch sibling COPY; the original is byte-unchanged.
- **Out of scope, observed:** `lib/css-selector-writers.ts:311-313` still calls the three root-taking fs readers
  (`readManifest`, `readInstalledSurface`, `readInstalledStateAttributeValues`). Its only gate importer,
  `gates/css-selector-has-a-writer.ts`, is still LEGACY (0 `defineGate`), so no FINAL policy carries an fs read —
  but that is the coupled site the css lane inherits when it converts.
- `pnpm check:docs` was not run on this report beyond the catalog formatter.

## PROPOSED LESSONS

**A `-health`/split conversion's planter-row retirement is TWO edits, and the comment is the one that lies.**

Index entry: `[planter row ≠ its comment](planter-unfixturable-row-and-its-comment-are-two-edits.md) — a conversion that rewrites the UNFIXTURABLE comment to "its row is GONE" without deleting the row reds a suite nobody runs`

Body: `tests/tooling/check-gates.repo.int.test.ts` carries `UNFIXTURABLE_GATES` as a Set plus a long
per-gate comment block ABOVE it. A conversion owes both edits. Rewriting only the comment produces the
worst possible artifact: prose asserting the row is gone, sitting above the row. The two-sided arm
(`[...UNFIXTURABLE_GATES].filter((g) => !legacyNames.has(g))` must be `[]`) catches it, but the suite is a
PLANTER — orchestrator-only, `--full`-only — so the red is invisible for as long as nobody runs it.
**How to apply:** on any conversion, `grep` the converted id as a STRING LITERAL across `tests/tooling/**`
(guide §8's roster-coupled-site rule) and, if you cannot run the planter, evaluate the arm's literal
predicate against `loadMixedGateCorpus` in a 10-line script — that is a receipt and costs seconds.

**A "declared limit" row proves nothing if its fixture cannot reach the branch the limit is about.**

Index entry: `[limit row must reach the branch](declared-limit-row-must-reach-its-branch.md) — a mustPass whose why names a carve is a false pin when the fixture short-circuits before the carve`

Body: `baseui-anatomy-completeness`'s `mustPass[2]` states it holds the `disposition !== "unresolved"` carve,
but its fixture never renders the part, so the guard's earlier `site === undefined` clause returns first and
the carve is unreached. The cut comes back clean and reads exactly like an unenforced fence. **How to apply:**
when a row's `why` names a specific clause, trace the fixture to that clause — every earlier condition on the
path is a place the row can stop short. The repair is one fixture field (here: render the part), and it turns
the cut red.

**Where the enforcement of a shared adjudicator lives is a question you must ASK, not assume.**

Index entry: `[extracted adjudicator loses its pins](extracted-adjudicator-clauses-lose-every-tier.md) — pulling a validator into _shared/ for a gate to reuse does not carry the validator's clause coverage with it`

Body: `devtools-frontend-assets`' conversion extracted `adjudicateDevToolsClosure` into `_shared/` so the
policy and the runtime reach one verdict. The policy grew four `mustFlag` rows; the runtime suite kept its
nine. Neither set covers five of the adjudicator's clauses, and because each side looks complete on its own,
the gap is invisible from either. **How to apply:** after an extraction, cut EVERY clause of the extracted
function and check BOTH tiers — the policy's rows and the original caller's suite. A clause held by neither
is the extraction's own defect, not inherited debt.

---

## Landing summaries for the #1584 comment

**`devtools-frontend-assets` — PARTIAL.** Contract, population port and refusal doors verified: 0 tool errors /
0 withheld on `--check`, `count: 99` fails all four `mustFlag` rows, both `mustRefuse` discriminators transplant-red
in both directions, marker census 0=0=0 with 132/781 positive controls, no fs read in the policy's reachable graph.
REFUTED cell: five clauses of `adjudicateDevToolsClosure` (manifest checksum, decoded-byte total, licence source
revision pin, url/file correspondence, licence-family correspondence) cut CLEAN against the policy's rows AND
leave `_shared/devtools-assets.test.ts` at 9/9 — held by no tier. Header also says that suite has 8 rows; it has 9.

**`bus-payload-allowlist` — PARTIAL.** §4.1 matrix reproduced (root-name dispatch, the non-transitive boundary and
the grant aggregation each ENFORCED; the `BUS_FILES` fence is MUTUALLY REDUNDANT and reds only jointly, which is
what `mustPass[8]` actually holds). §4.3 verified in all three directions, raw 1 = granted 1 on the real tree,
census 259. Two landed coupled-site defects: `bus-payload-allowlist` was left in `check-gates.repo.int`'s
`UNFIXTURABLE_GATES` while its comment says the row is gone — the `:1241` arm was green at the parent and fails
now — and the new grant row is out of sort order. Plus a `Math.max(…, 1)` receipt that reports 1 on a census of 0.

**`bus-payload-allowlist-health` — CONFIRMED.** All three fences enforced with the cut direction taken correctly
for a tripwire (`REAL_CORPUS_MIN` → 14 rows, refusal-as-contribution → 3, `FIELD_KEYLESS_KINDS` → 5). §12.3
verified by driving: the provider receipts what it MEASURED (`files.length`, 105 on the real tree), and on an
EMPTY census the policy reports 10 blindness findings with 0 tool errors and a constant `members: 1` receipt.

**`baseui-surface-manifest` — REFUTED.** Three arms the header advertises are enforced by no row: the vanished-PART
direction, the vanished-COMPONENT direction, and the VERSION comparison — the last is the module's own headline
"version-bump tripwire". Each cut is wrong-direction; I wrote and ran the three `mustFlag` falsifiers (they pass at
tip and red under their cut) and they are the fix. Two reachable refusal statuses are unpinned
(`installed-package:base-ui:metadata` unresolved, `json:baseui-manifest` empty). The `state` term in `identity()`,
`NON_COMPONENT_DIRS` and the NO_REASON narrowing ARE enforced. Header cites a test file that does not exist.

**`baseui-anatomy-completeness` — REFUTED.** The `unresolved` carve on arm B is unenforced and `mustPass[2]`'s `why`
falsely claims to hold it (its fixture never renders the part, so the carve is unreached); the `part.kind !== "part"`
fence is unenforced and falsifiable in one row (`EXPORT_KINDS` ships `hook`). Arm C's guard is a raw
`getText().includes()` scan while the header declares comment-SAFE — a MID-FILE comment naming `@base-ui/react/`
turns the blindness verdict into two false arm-A accusations. Arm C's guard itself, and the `@ui` population port,
are enforced. Header cites a test file that does not exist.

**`baseui-derives-not-respells` — PARTIAL.** Every fence the module names as held by a specific row IS held by that
row (`isRoot` → `mustPass[2]`, `isPropsInterface` → `mustPass[3]`, identifier exactness → `mustFlag[1]`), the §4.2
identity arm carries all three assertions and discriminates, and the §8.6 census closes at 7 = 7 = 7 with the
per-file table confirmed by hand (select 1 / combobox 3 / autocomplete 3). Two notes: the header cites a test file
that does not exist, and `analysis: "resource"` + `execution: "selected-files"` deviates from
`resource-policy-contract.md` §3.4 without recording the deviation.

**`baseui-derives-not-respells-health` — CONFIRMED.** Both named fences enforced (`derivedAliases` → `mustPass[1]`,
`forwarded` → `mustPass[2]`), and the same `forwarded` cut driven against the ORDINARY sibling comes back CLEAN —
the split-family false clean, correctly attributed here. The split boundary is asserted by byte-identical fixtures
in both directions, the two branch messages are disjoint, and `hard`-with-no-door is honest.
