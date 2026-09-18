---
kind: review
status: active
updated: 2026-09-13
---

# cb-adj-authority — adjudication of the legacy authority/parity cohort (#1922, #2147, #2000, #2095, #2273)

Lane `cb-adj-authority`, claude-b's READ-ONLY adjudication lens. Every number below came out of a run
produced in this session, in this lane's own worktree. No tracked file was modified at any point.

## 1. Base and method

| | |
| - | - |
| worktree | `/home/inktomi/inktomi-stack/development/orbweaver/.claude/worktrees/agent-a38a067eb4df68d82` |
| HEAD | `1ea2c2a0e` (branch `wt/agent-a38a067eb4df68d82`), clean at start and at end |
| main tip during the run | `a8c522ee3` — **HEAD is 5 commits behind main** |

**The 5-commit delta was checked and does not move any verdict here.** `git diff HEAD main` is the CSS
train (`css-family-ownership*`, `css-selector-has-a-writer-health`, `playwright-css-topology`,
`sanctioned-css-homes`, `seed-theme-ink-contrast`, `tokens-contract`, three review docs, the catalog) plus
their family tests. `git diff HEAD main -- tooling/src/verify/gates/ tooling/src/verify/lib/` filtered to
added lines matching `contract/gate\.ts|ExemptionTable|ExemptionRow` returns **nothing** (exit 1), so the
`policy-legacy-imports` population cannot have grown on main; and none of the delta's paths is a subject of
\#2000, #2095 or #2273. Where a figure below could in principle differ on main's tip, it is flagged.

**Every landing sha cited in this report was proven to be in HEAD's ancestry** by membership in
`git rev-list --abbrev-commit --abbrev=9 HEAD` (7,037 entries): `3420a81e9` `d9d1e3524` `ebfe88146`
`b5490a02a` `c97de9d2f` `ef044b12e` `23b31b3ca` `c6812ae41` `8c165cd9f` `183e49714` `d334dd5ca`
`9b01c410a` `97e68be91` `630cfe24c` `aecbc6c6c` `17297f298` — all `in-HEAD=1`.

### Runs produced in this session

| run | result |
| - | - |
| `pnpm check:structure --check policy-legacy-imports` | **exit 1 · 5 findings** · `final policies: 1 ran · raw 5 = waived 0 + granted 0 + effective 5 (5 error, 0 warning) · 0 alarm(s) · 0 tool error(s) · 0 withheld` · slot `agent-a38a067eb4df68d82-373387-2026-09-13T06-48-24-313Z` |
| `pnpm test:scoped port-parity-tier3 split-arm-parity schema-fact-parity` | **exit 0 · 3 files · 20 tests passed** · slot `agent-a38a067eb4df68d82-406615-2026-09-13T06-53-54-710Z` |
| `pnpm test:scoped tier3-close-by-rule.suite.test.ts` | **exit 0 · 2 tests passed, 20.3 s** · slot `agent-a38a067eb4df68d82-416972-2026-09-13T06-55-34-873Z` |
| §5b.5 header census over the 28 (scratchpad script, planted controls) | **FAMILY 28/28 · POPULATION PORT 28/28 · legacy SHA 26/28 by label field, 28/28 by second method** |

### Method notes that are load-bearing

- **The header-census label field produced two FALSE NEGATIVES and I caught them with a second method.**
  My field required the literal `LEGACY SHA` / `legacy SHA` / `pre-conversion SHA`. `serde-core-seal` and
  `serde-core-seal-health` both read `-` under it and both DO carry the legacy sha
  (`534c1327f682be2578e1dee7c7a2bfa488fb672a`) — `serde-core-seal` even carries an explicit
  `// SHA FORM NOTE:` saying the spelling is the bare 40-char form. A hex-run second method
  (`[0-9a-f]{7,40}` over the header span) reads both. Both directions were controlled: a planted positive
  header read `Y/Y/Y`, a planted negative read `-/-/-`, and `no-decorators` (a real module) read a single
  short sha under the hex field. **The 26/28 is my instrument's number; the tree's number is 28/28.**
- **The commit-message method for §4.6 silence is UNINFORMATIVE on this tree and I discarded it.** Grepping
  `differential|legacy replay|old/new` over `git log -1 --format=%B` returned 0 for `97e68be91`, 0 for
  `630cfe24c` **and 0 for the positive control `183e49714`** — which demonstrably DID land a §4.6 record,
  in the module header rather than the message. A zero from a method whose positive control also reads zero
  is not a result. The absence receipts below rest on the header method (positive control `test-layout`,
  hits=1) and the test-file method (positive control: `grep -rln` over `tests/tooling/verify/gates/` finds
  the modules' own family tests, which were then read).
- I did not plant a probe in any tracked file, so no shared-tree announcement was owed and none was sent.

---

## 2. Per-row adjudication

### #1922 — the `sanctioned-home` family's reviewed-grant authority migration

**Owner rulings on the row, preserved:**

1. One lane owns the reviewed-grant migration for the ENTIRE `sanctioned-home` family at once — migrating
   one pair while two siblings keep the old model is the "two homes for one concept" the program exists to
   remove.
2. Scope extension (verifier wave 3): `ALLOWLIST` in `contract-derives-not-respells` and `CALLER_FREE_OPS`
   in `injected-op-caller-param` are the same class and migrate in the same pass, not gate-by-gate.
3. **Re-derive the table population at claim time; do NOT work the recorded 97-of-319.** The census ran at
   `53bb2d35f` (2026-09-05) and every conversion landing after that date can carry a table it never
   classified — and a carried-through table looks identical to a classified one.
4. The row's own OPEN QUESTION, to be answered before enumerating: is per-file grant enumeration the
   intended cost, or does the population algebra want one reviewed operator for "directory permission"?

**Current-tree receipts.**

- The open question is **ANSWERED in the law, and the answer is neither arm the row offered.**
  `gate-runtime-standardization.md` §12.5 (re-read 2026-09-12): *"a class-level legacy exemption (an
  allowlist, a sanctioned-home list, a count ratchet) cannot be migrated as one grant row over N findings.
  The shape that works … the POLICY reports ONE aggregate finding per class (one subject, one operation),
  so the grant is 1:1 by construction"* — and, explicitly, *"#1922's plan is priced on this paragraph."*
  There is a **shipped precedent** for exactly this on the tree:
  `lib/reviewed-grants.ts#bus-payload-allowlist:credential-id`, whose own `why` says the subject is a field
  NAME rather than a path and that *"the policy aggregates every site of one name into one finding so this
  row stays 1:1 (§12.5)"*, replacing a legacy gate-owned `SANCTIONED_FIELDS` table. So neither
  per-file enumeration nor a new directory operator is needed; the aggregate-finding shape is built and
  precedented.
- **`v-authority-census-2026-09-12.md` §5 chunk C2 still records the prerequisite as unanswered** —
  *"a ruling on whether a reviewed grant may key a DIRECTORY or a FILE"*, over
  `no-pointer-variants-in-features` (1 row) · `no-raw-z-index` (2) · `ui-skin-fragment-purity` (1) ·
  `no-arbitrary-tw-values` (2) · `ui-size-via-variant` (2) · `test-presence-client` (1). That census
  paragraph is STALE against §12.5 as re-read.
- **Chunk C1 LANDED** (`b5490a02a`, in HEAD). Independent re-derivation: `list-row-adoption`,
  `no-interactive-role-in-features`, `stale-draft-commit` and `db-structure` hold **no** `: ExemptionTable = {`
  declaration on today's tree (census below).
- **NOT ONE reviewed grant has been minted for the `sanctioned-home` tier family.** `REVIEWED_GRANTS`
  carries 218 `why:` rows; `grep -n 'policy:'` over it returns nothing (the key is `policyId`), and no row
  names `no-raw-spacing-in-features`, `no-raw-typography-in-features`, `no-raw-z-index`,
  `no-pointer-variants-in-features` or `ui-skin-fragment-purity`.
- **Full `: ExemptionTable = {` census across `tooling/src/verify` (26 declarations, 24 sites):**
  - **16 sites are in LEGACY (`defineGate=0`) gate modules** — `contract-verb-presence`, `dangling-refs`
    (×2 + 1 computed), `dialog-via-composite`, `duplicate-action-doors`, `json-column-write-parity` (×2),
    `knob-wire-coverage` (×2), `no-arbitrary-tw-values`, `no-manual-memo`,
    `no-pointer-variants-in-features`, `no-raw-z-index`, `open-json-column-key-parity` (×2),
    `query-freshness-coverage` (×2), `tooling-slot-template` (×2), `ui-size-via-variant`,
    `ui-skin-fragment-purity`, `wire-schema-vocab-one-home`. **Their authority migrates at CONVERSION**;
    they are the conversion queue's work, not #1922's post-conversion cleanup. Verified per module with
    `grep -c defineGate`.
  - **3 sites are in `lib/` and are consumed by FINAL modules** — `lib/raw-spacing-tier.ts#SANCTIONED_HOMES`,
    `lib/raw-typography-tier.ts#SANCTIONED_HOMES`, `lib/contract-derives-not-respells.ts#ALLOWLIST`. Each
    still does `import type { ExemptionTable } from "../contract/gate.ts"` and each is imported by a
    `defineGate` module (`no-raw-spacing-in-features:34`, `no-raw-typography-in-features:51`,
    `contract-derives-not-respells:54`).
  - `CALLER_FREE_OPS` is the fourth of the same shape, RETYPED rather than relocated only:
    `lib/injected-op-caller-param.ts:37` `export const CALLER_FREE_OP_ROWS: readonly CallerFreeOpRow[]`,
    imported by the FINAL `injected-op-caller-param-health.ts:22` and reachable from
    `injected-op-caller-param` through the family.
- **The legacy pair in `lib/sanctioned-home.ts` still has live consumers**, so the row's "also owns deleting
  the legacy pair once its last consumer converts" clause has not come due: `homeFiles` (`:44`) is called by
  `reportUnresolvedHomes` (`:75`), which is called by `no-pointer-variants-in-features:113`,
  `no-raw-z-index:100` and `ui-skin-fragment-purity:95` — all three LEGACY.

**Classification: SPLIT.**

| landed | still missing |
| - | - |
| The row's blocking OPEN QUESTION is answered by §12.5 + the `bus-payload-allowlist:credential-id` precedent. | The answer has not reached `v-authority-census-2026-09-12.md` §5 C2, which still names the ruling as C2's prerequisite. |
| Chunk C1's four empty-table deletions (`b5490a02a`). | **Zero of the five `sanctioned-home` family members have migrated to reviewed grants.** Three are still legacy with in-module tables; two moved their table to `lib/` and kept gate-owned authority. |
| Scope-extension member `contract-derives-not-respells` and `injected-op-caller-param` stopped importing `contract/gate.ts` (`d9d1e3524`, `3420a81e9`). | Neither minted a grant: `ALLOWLIST` and `CALLER_FREE_OP_ROWS` are intact in `lib/`, gate-imported. |

**The finding that matters for routing: the four modules that dropped off #2147's list did so by RELOCATING
the table one hop into `lib/`, not by migrating authority.** That satisfies `policy-legacy-imports` ARM A's
import-origin test and leaves §12.5's actual property ("gate modules receive neither grant tables") unheld
by anything. If the remaining five are closed the same way, the arm reaches 0 red while #1922 is 0% done
and the program loses its only live enforcer of the migration. Ledger row 1 below.

**Fix spec (bounded, one lane).** See chunk **A** in §3.

**Proposed lifecycle transition:** stays **Ready** (do not close). Its issue body should gain a comment
recording that the open question is answered by §12.5 + the `credential-id` precedent, and that the
relocation-to-`lib/` remedy does NOT discharge it.

---

### #2147 — `policy-legacy-imports` reds NINE final modules (#1922 class row)

**Owner/orchestrator rulings on the row, preserved:** the gate is `hard`/`error` by orchestrator ruling
2026-09-12 on the owner's no-shortcuts instruction; **until landed, the arm's reds are the honest state of
the tree, not a lane's defect**; the fix per module is authority migration (#1922) — the gate-local table's
rows become exact `(policy, subject, operation)` grant rows, a class-level allowance migrating by the
POLICY reporting ONE aggregate finding per class; `runner-config-path-liveness`'s `EXEMPT` is EMPTY (C1 —
delete, no grant minted); `eslint`/`depcruise`'s RATIFIED rows carry `cite` paths whose dead-cite arm has
NO successor under a grant — **state it per row, never absorb it**; split by MODULE across two lanes of 4–5.

**Current-tree receipts.** `pnpm check:structure --check policy-legacy-imports` on `1ea2c2a0e`:
**exit 1, 5 findings, 0 tool errors, 0 withheld** (the run's own positive control — the recognizer is live
and firing).

| module named at mint | today | receipt |
| - | - | - |
| `depcruise-grant-liveness` | **RED** | `:30:46 "../contract/gate.ts"` — `ExemptionTable, Finding`; `EXEMPT:52` empty, `RATIFIED:74` live; `Finding` is load-bearing at `:159 reportFinding` |
| `domain-freshness-plane` | **RED** | `:70:35` — `ExemptionRow`, used as a TYPE BUILDING BLOCK (`:90` `RoomReach`, `:95` `FreshnessRow extends`, `:367` `UNSEATABLE_SCHEMA`), not as a table |
| `eslint-grant-liveness` | **RED** | `:10:37` — `ExemptionTable`; `RATIFIED:21` is a LIVE suppressor |
| `lifecycle-portability` | **RED** | `:54:51` — `ExemptionRow, ExemptionTable`; `:82 NonPortableRow extends ExemptionRow`, `:114 NON_PORTABLE_CANON` |
| `runner-config-path-liveness` | **RED** | `:78:46` — `ExemptionTable, Finding`; `EXEMPT:106` is `{}` (EMPTY — C1's delete) yet the import survived |
| `contract-derives-not-respells` | green | table moved to `lib/contract-derives-not-respells.ts:32`, still `ExemptionTable`-typed (`d9d1e3524`) |
| `injected-op-caller-param` | green | retyped to `CallerFreeOpRow[]` in `lib/injected-op-caller-param.ts:37` |
| `no-raw-spacing-in-features` | green | table moved to `lib/raw-spacing-tier.ts:22`, still `ExemptionTable`-typed (`3420a81e9`) |
| `no-raw-typography-in-features` | green | table moved to `lib/raw-typography-tier.ts:21`, same (`3420a81e9`) |

**Classification: SPLIT — 4 of 9 off the arm, 0 of 9 migrated to reviewed grants.**

Two per-module facts the fix spec must carry and the mint's text did not:

- `runner-config-path-liveness` is the CHEAPEST row and is already half done: its `EXEMPT` is literally
  `{}`. The remaining work is deleting the declaration and the type import. Nothing is granted, nothing is
  lost. C1 emptied it (`b5490a02a`) and stopped one line short.
- **`domain-freshness-plane` and `lifecycle-portability` are a DIFFERENT remedy from the other three.**
  They do not carry a gate-owned exemption TABLE that becomes grants; they use `ExemptionRow` as a
  structural type (`why` + `endsWhen`) that a domain row shape intersects. The correct cut is a
  `contract/`-homed row shape, not a grant migration — briefing them as "migrate the table" will produce a
  wrong answer. `domain-freshness-plane`'s `:88` comment already says `ExemptionRow` is *"widened by
  intersection, never"* re-spelled.

**Fix spec:** chunk **A** in §3. **Proposed lifecycle transition:** stays **Ready**, re-scoped from nine
modules to **five**, with the two-remedy split above stated in the body.

---

### #2000 — nobody is checking old-gate vs new-gate PARITY

**Owner rulings on the row, preserved (they were re-scoped three times and the LAST scope is the spec):**

- The row's headline census was corrected twice by its own author. A/B/C1/C2 replaced A/B/C; the "126
  nowhere" was wrong by ~3x; the surviving problem is **discoverability, not absence**.
- **Vacuity has TWO shapes**, and the second looks like rich evidence: a legacy side that is zero *because
  the legacy exemption was a `scanRoot` SUBTRACTION*. Operational form, landed in guide §4.6:
  **read the legacy-side number FIRST; a zero downgrades the record regardless of how much prose follows.**
- **RULED:** *a conversion whose legacy side was zero because every live site sat inside a `scanRoot`
  subtraction has proven outcome parity and real-tree liveness, and cannot prove catch parity from the
  corpus* — 31 modules downgrade by that one ruling, not 31 lanes.
- **Deliverable 3 landed at `2084c403e`:** §4.6 no longer permits the evidence to vanish; silence is not
  compliance.
- **The FINAL scope (comment 5, 2026-09-12 01:32Z):** Tier 2a (4 split arms — `no-rejected-cors-proxy`,
  `persisted-store-registry`, `no-mutating-register-api`, `no-inline-domain-interface`), Tier 2b
  (`contract-banned-shapes`, `nullable-column-inequality`), Tier 2c (schema-fact's remaining 7), Tier 3
  closed BY RULE with two carve-outs that must be replayed (`turn-identity`, `plugin-dump-guard`).
- Two lessons kept as law: *when a conversion's predicate disagrees with the legacy predicate, the MESSAGE
  is the thing to fix, not the predicate*; *a family test often lives under the WAVE's name, not the
  gate's — grep the gate ID as a string, never the filename.*

**Current-tree receipts. The ENTIRE re-scoped spec has landed.**

| tier | artifact | landing |
| - | - | - |
| 2a | `tests/tooling/verify/gates/split-arm-parity.test.ts` (8 tests) | `23b31b3ca` |
| 2b + 2c | `tests/tooling/verify/gates/schema-fact-parity.test.ts` (9 tests) | `c97de9d2f` |
| Tier 3 ruling | `docs/reviews/gate-runtime/tier3-one-to-one-port-ruling.md` | `c97de9d2f`, strengthened at `ef044b12e` |
| Tier 3's executable membership test | `tests/tooling/verify/gates/tier3-close-by-rule.suite.test.ts` (2 tests) | with the ruling |
| the two carve-outs | `tests/tooling/verify/gates/port-parity-tier3.test.ts` (3 tests) | `c97de9d2f` |

**I ran all four suites myself: 20 + 2 tests, exit 0 in both invocations.**

**I checked the harness for the classic tautology and it is not there.** `tests/support/legacy-differential.ts`
extracts the pre-conversion module with `execFileSync` `git show` into a scratch dir outside the checkout
(no silent HEAD fallback — a bad sha throws), shims ONLY the header import block and asserts the body is
byte-identical afterwards, declares **all three** §4.6 comparisons in its `Replay` type
(`findings`/`population`/`toolErrors`), THROWS on an unrecognised tool-error shape, asserts an INERTNESS
control on every constructed twin, and since #2119 REFUSES a legacy blob that reaches the real filesystem.
I verified one frozen blob by hand: `git show 5dd83aaa42c…:tooling/src/verify/gates/plugin-dump-guard.ts`
holds `import type { GateDescriptor }` at `:6` and `export const gate: GateDescriptor` at `:95` — a genuine
legacy descriptor, not the final module.

**The ledger's row for this issue is STALE and would misroute a lane.**
`refutation-ledger-2026-09-12.md:357` reads *"Still owed: the Tier 3 ruling, `turn-identity` and
`plugin-dump-guard`"*, with the evidence cell *"`schema-fact-wave-1.suite.test.ts` contains no `BASE`, no
`runPass`, no frozen-legacy import → Tier 2b/2c absent; no per-module Tier 3 closure recorded and
`turn-identity` / `plugin-dump-guard` unaddressed."* Two independent errors: it measured
`schema-fact-wave-1.suite.test.ts` when the artifact is `schema-fact-parity.test.ts`, and all three of the
"still owed" items landed in `c97de9d2f` — **the very commit the row's own state cell cites**. Ledger row 2.

**One honest tension to record rather than absorb.** The tier-3 ruling's own derived receipt is
**"248 final modules scanned · 11 CLOSE-BY-RULE · 237 REPLAY-OWED"**, and the doc says plainly *"11, not
17 … do not average them"* and *"relaxing ONLY clause 6 takes the roster from 11 to 26."* That 237 is a
STRICTER accounting basis than the row's risk-ranked one (clause 6 demands the final carry the legacy proof
rows' labels **and bytes**), and it is not the row's spec. **#2000's spec is discharged; the corpus-wide
parity question is not, on the basis the ruling itself established.** Whether the 237 becomes a new row is
an orchestrator call, not this lane's — but it must not be silently inherited as "#2000 is closed, parity
is done."

**Classification: IMPLEMENTED, PENDING VERIFICATION → and I ran the verification.** Every artifact the
re-scoped spec named exists, is in HEAD's ancestry, and is green in a run I produced. The one residual is
documentary (the stale ledger row) plus the 237 disposition above.

**Proposed lifecycle transition:** **Verify → Done**, with two conditions on the closing comment: (a) it
records the 237-replay-owed figure and names who owns it, and (b) `refutation-ledger-2026-09-12.md:357` is
flipped with `c97de9d2f` / `ef044b12e` as the receipt. Do not close it silently.

---

### #2095 — §5b.5 headers for the 28 never-audited finals

**Rulings on the row, preserved:** one mech lane, by module, adding the three header lines per guide §5b.5
— FAMILY (the shared `lib/` reader, or SINGLETON with its reason), POPULATION PORT (byte-identical, or the
correction and why), legacy SHA as the module's own conversion PARENT in the house `(<sha>^)` form,
**read by hand** (§5b.5's census caveat); census before/after over the header span with a planted control;
**do not touch proof rows.**

**Current-tree receipts.**

- Landing: `c6812ae41` *"docs(gates): the three §5b.5 header fields for all 28 never-audited finals
  (#2095, #1584)"*, followed by `8c165cd9f` *"the §5b.5 POPULATION label…"* — both in HEAD.
- **My own census over the 28, with planted positive and negative controls (both behaved):**
  **FAMILY 28/28 · POPULATION PORT 28/28 · legacy SHA 26/28 by label field, 28/28 by hex-run second
  method.** The two label-field misses are `serde-core-seal` and `serde-core-seal-health`, both of which
  carry `534c1327f682be2578e1dee7c7a2bfa488fb672a` in their header span; `serde-core-seal` carries an
  explicit `// SHA FORM NOTE:` stating the bare-40-char spelling is deliberate. **They are my field's false
  negatives, not tree gaps.**
- **The one OPEN ledger defect is FIXED.** `refutation-ledger-2026-09-12.md:785` (cb-v-wave-8c L8) says
  `no-default-props.ts` states its port as `// POPULATION NOTE:` rather than the labelled
  `POPULATION PORT:`. On today's tree `no-default-props.ts:6` reads
  `// POPULATION PORT: the legacy scanRoot matched p.startsWith("packages/client/src") (no trailing
  slash)…` and a corpus-wide count of `POPULATION NOTE` across `tooling/src/verify/gates/*.ts` is
  **0 files** (against `POPULATION PORT` in **199** and a `^// FAMILY` line in **203**). Fixed at
  `8c165cd9f`.

**Classification: LIFECYCLE ONLY.** The outcome is on the tree AND verified by receipts I produced: the
28-module census above with its two controls and its second method, plus the zero-file `POPULATION NOTE`
count against a 199-file positive control.

**Closure receipt to paste on the issue:** `c6812ae41` (the 28 headers) + `8c165cd9f` (the label
correction the ledger's L8 row named); re-censused 2026-09-13 by lane `cb-adj-authority` at `1ea2c2a0e`:
FAMILY 28/28, POPULATION PORT 28/28, legacy SHA 28/28 (two under a second method, with the spelling
receipt), planted positive `Y/Y/Y` and planted negative `-/-/-`.

**Proposed lifecycle transition:** **→ Done.** `refutation-ledger-2026-09-12.md:785` flips CLOSED at
`8c165cd9f` in the same commit. The row's residual note — *"#2204's ruling should name this spelling"* — is
a separate row's work and should not hold #2095 open; if the third spelling is to be banned rather than
just relabelled, that belongs on #2204.

---

### #2273 — four §4.6 silences on CONFIRMED conversions

**Rulings on the row, preserved:** measured by `cb-v-wave-8b` on `50e31c534`, ledger rows 5–8; guide §4.6
(#2000) — *"silence is no longer compliance"*: a conversion lands the differential as a committed test OR
states in its commit message that it ran and what it found. The four: the `tsconfig-entry-liveness` +
`biome-grant-liveness` pair (`97e68be91`, #2021); the mirror trio `test-layout`/`test-presence`/
`test-presence-client` (`aecbc6c6c`, #2061); `test-layout`'s **anchor move** (§4.6 category 6, legacy
`line: 0` → final `1:1`) unrecorded; `no-color-literals` (#1994), on no close-by-rule roster and with no
differential anywhere. **The wave ran `test-layout`'s itself: 53 = 53.** Owner lane: `p-parity-tier2bc`.
A fifth, from `cb-v-wave-9b` (`refutation-ledger-2026-09-12.md:819`): the landed mirror record was a
FINDINGS differential only — no population and no tool-error comparison — *"§4.6 requires all three."*

**Current-tree receipts.**

| item | today |
| - | - |
| mirror trio §4.6 record | **LANDED** at `183e49714` (in HEAD). `test-layout.ts:72-91` carries `§4.6 DIFFERENTIAL — RECORDED 2026-09-13 (#2273)` with each of the three axes named separately — FINDINGS (final 57 at `5045a6a68`, legacy 53 measured on `50e31c534` where the final also read 53, the +4 accounted path-by-path), POPULATION (`of: "none"` both sides; `package-test` 6525 / `tooling-test` 2228 / `unresolved` 0), TOOL ERRORS (0 final, owner `success`; the legacy descriptor could not produce one). `test-presence.ts:78` and `test-presence-client.ts:56` carry theirs, each honestly labelled **VACUITY SHAPE 1** where it applies. |
| the wave-9b completeness complaint (`:819`) | **DISCHARGED by the same commit** — all three axes are now stated per policy. |
| `test-layout` ANCHOR MOVE | **LANDED**, `test-layout.ts:87-91`: legacy synthetic `line: 0` → final `1:1`, with the consequence argued (it can bind nothing — the live `@orb-gate-ignore test-layout` census is ZERO, *"re-measured 2026-09-13 with a planted positive control"*, and every finding is FILE-anchored). |
| `tsconfig-entry-liveness` | **STILL SILENT** |
| `biome-grant-liveness` | **STILL SILENT** |
| `no-color-literals` | **STILL SILENT** |

**Absence receipts for the three, two methods, both controlled.**

- Header method — `grep -c '4\.6 DIFFERENTIAL'` over each gate module:
  `tsconfig-entry-liveness` **0** · `biome-grant-liveness` **0** · `no-color-literals` **0** ·
  **positive control `test-layout` 1**. (`biome-grant-liveness:45` mentions "§4.6 classifier-rot tripwire"
  — a different clause, read and excluded.)
- Test-file method — `grep -rln` over `tests/tooling/verify/gates/` for the three ids returns exactly four
  files: `biome-grant-liveness.int.test.ts`, `grant-liveness-family.suite.test.ts`,
  `tsconfig-entry-liveness.int.test.ts`, `unfenced-class-fragment-scanners.suite.test.ts`. Grepping each for
  `4\.6|differential|legacyReplay|frozenLegacyGate`: **0, 1, 0, 0** — and the single hit
  (`grant-liveness-family.suite.test.ts:15`) reads *"`hard` `-health` sibling holding its §4.6 blindness
  tripwires"*, which is not a differential. Corroborated: the only three files on the tree naming
  `legacy-differential` are `schema-fact-parity.test.ts`, `port-parity-tier3.test.ts` and the shared
  harness `tests/support/legacy-differential.ts`.
- Commit-message method **discarded** — its positive control also read zero (see §1).
- **None of the three qualifies for close-by-rule.** `tier3-close-by-rule.suite.test.ts` passed in my own run
  (2 tests, exit 0) and its assertion is that the ruling doc's roster IS the membership test's output on
  today's corpus. That roster is 11 modules and contains none of the three (`no-color-literals`'s sibling
  `no-raw-container-widths` IS on it at `99b7429e2^`, which is exactly why its absence is meaningful, not
  an oversight). **So a differential is genuinely OWED for each of the three, by the program's own
  executable test, on today's tree.**

**Classification: SPLIT — 3 of 5 items closed, 2 still missing.**

| closed | still missing |
| - | - |
| mirror trio §4.6 record (all three axes) — `183e49714` | `tsconfig-entry-liveness` + `biome-grant-liveness` §4.6 record |
| `test-layout` anchor move, category 6, with a planted control | `no-color-literals` §4.6 record |
| the wave-9b population/tool-error completeness row (`:819`) | |

**Fix spec:** chunk **B** in §3. Note that `cb-v-wave-8b` **already ran the config pair's differential**
(ledger `:797`: *"legacy 0 → final raw 9 and 1, all granted, 0 effective; guide §4.6 category 5 … and it is
clean; the RECORD is what is owed"*). Per §4.6's own vacuity rule that is a **legacy-side ZERO — vacuity
shape 1 or 2** — so the record must SAY that, not present the clean result as catch parity. That is a
five-line header edit per module, not a build.

**Proposed lifecycle transition:** stays **Ready**, re-scoped from four items to **two** (the config pair
as one, `no-color-literals` as the other), with the three closed items and their receipts recorded in a
comment so a lane does not re-do them. `refutation-ledger-2026-09-12.md:798`, `:799` and `:819` flip CLOSED
at `183e49714`; `:797` and `:800` stay OPEN.

---

## 3. Coherent repair chunks

Two lane-sized chunks. Both are gate-touching, so both read
`docs/design/gate-runtime-standardization.md` §12.5 + §4.6 and `.claude/rules/gates-and-tooling.md` first.

### Chunk A — finish the FINAL-module authority migration (#1922 + #2147), 5 modules + 4 relocated tables

**Files to change**

- `tooling/src/verify/gates/runner-config-path-liveness.ts` — delete the empty `EXEMPT` (`:106`) and the
  `ExemptionTable` import; keep `Finding` only if `livenessFindings` still returns it, else drop the import
  entirely and report through `ctx.report.file`.
- `tooling/src/verify/gates/eslint-grant-liveness.ts` (`RATIFIED:21`, a LIVE suppressor) and
  `tooling/src/verify/gates/depcruise-grant-liveness.ts` (`EXEMPT:52` empty — delete; `RATIFIED:74` live;
  `Finding`→`ctx.report` at `:157-161`, `:241`) — migrate the RATIFIED rows to
  `tooling/src/verify/lib/reviewed-grants.ts` by the §12.5 aggregate shape: **the policy reports ONE
  aggregate finding per class so the grant is 1:1**, copying `bus-payload-allowlist:credential-id`'s shape.
  **Per-row, state the `cite`-path dead-cite arm's loss explicitly** (`biome-grant-liveness`'s header states
  the delta) — never absorb it.
- `tooling/src/verify/gates/domain-freshness-plane.ts` (`:70,:90,:95,:367`) and
  `tooling/src/verify/gates/lifecycle-portability.ts` (`:54,:82,:114`) — **DIFFERENT cut**: these consume
  `ExemptionRow` as a structural `why`/`endsWhen` row type intersected into a domain shape. Home that shape
  in `tooling/src/verify/contract/` (or the family's `lib/`) as its own declaration and stop importing
  `contract/gate.ts`. No grant is minted for either.
- The four relocated tables — `lib/raw-spacing-tier.ts:22`, `lib/raw-typography-tier.ts:21`,
  `lib/contract-derives-not-respells.ts:32`, `lib/injected-op-caller-param.ts:37` — migrate to reviewed
  grants by the same aggregate shape. `lib/raw-spacing-tier.ts`'s and `lib/raw-typography-tier.ts`'s own
  headers argue the two tables must stay SEPARATE files; that argument survives as two separate grant
  ROWS per policy, keyed on the home path.

**Cut direction / proof shape**

- Each migrated table's grant rows are proven the way `home-client-family.suite.test.ts:259-305` proves its
  family's: the intended row is consumed exactly once, a wrong `operation` stays effective, a renamed
  subject stales or withholds. That is the four-pin set to copy.
- The success condition is a run, not a read: `pnpm check:structure --check policy-legacy-imports` reaching
  **0 findings** — but **the lane must ALSO show the tables are gone**, because the arm cannot see a table
  in `lib/` (ledger row 1). The second receipt is
  `grep -rn ': ExemptionTable = {' tooling/src/verify/lib/` returning nothing and
  `grep -rn 'ExemptionTable\|ExemptionRow' tooling/src/verify/lib/` returning nothing for the four family
  files.
- Family tests to name in the floor: `tests/tooling/verify/gates/grant-liveness-family.suite.test.ts`,
  `tests/tooling/verify/gates/tier-home-health-family.suite.int.test.ts`,
  `tests/tooling/verify/gates/contract-shape-wave-1.suite.test.ts`,
  `tests/tooling/verify/gates/injected-op-caller-param-split.test.ts` (it imports
  `CALLER_FREE_OP_ROWS` **by symbol** at `:43` and builds its expectations from the live rows, so a
  migration breaks it by construction — retarget in the same commit), plus
  `pnpm check:policy-conformance` whole.
- **Hazard to brief:** `tier-home-health-family.suite.int.test.ts:200-206` pins that
  `lib/sanctioned-home.ts` *"changed only ADDITIVELY since BASE"* and rewrites the
  `from "../lib/sanctioned-home.ts"` specifier. Deleting `homeFiles`/`reportUnresolvedHomes` will red it —
  and their last three consumers (`no-pointer-variants-in-features:113`, `no-raw-z-index:100`,
  `ui-skin-fragment-purity:95`) are all still LEGACY, so **the legacy pair cannot be deleted in this
  chunk.** Say so in the commit rather than half-deleting.

**Explicitly OUT of chunk A:** the 16 `ExemptionTable` sites in LEGACY gate modules. Their authority
migrates at conversion; charging them to #1922 doubles the price and blocks on the conversion queue.

**Also in scope, one line of prose:** `docs/reviews/gate-runtime/v-authority-census-2026-09-12.md` §5 C2's
prerequisite sentence, which still says a directory-vs-file grant-key ruling is owed. §12.5 answers it and
`bus-payload-allowlist:credential-id` is the shipped precedent.

### Chunk B — the three remaining §4.6 silences (#2273), header-only

**Files to change:** `tooling/src/verify/gates/tsconfig-entry-liveness.ts`,
`tooling/src/verify/gates/biome-grant-liveness.ts`, `tooling/src/verify/gates/no-color-literals.ts`.

**Cut direction:** add a `§4.6 DIFFERENTIAL — RECORDED <date> (#2273)` block to each header, in the shape
`test-layout.ts:72-91` now uses — **all three axes named separately** (findings, populations, tool errors),
never "the differential".

- The config pair's numbers are already measured and must be stated with their VACUITY CLASS, not as a
  clean pass: legacy 0 → final raw 9 and 1, all granted, 0 effective, guide §4.6 category 5. A legacy-side
  ZERO downgrades the record; say which of §4.6's shapes it is and that catch parity is NOT proven.
- `no-color-literals` has no measurement yet. Its sibling `no-raw-container-widths` is on the close-by-rule
  roster at `99b7429e2^`; `no-color-literals` is not, so run the replay through
  `tests/support/legacy-differential.ts` (read its header first) or, if it turns out to satisfy the clause
  set, land it on the roster and let `tier3-close-by-rule.suite.test.ts` be the receipt — that test asserts the
  doc's table equals its own output, so a roster addition is self-proving.

**Proof shape:** `pnpm test:scoped tests/tooling/verify/gates/tier3-close-by-rule.suite.test.ts` (it reds if the
roster and the derivation disagree) plus, if a replay is written,
`pnpm test:scoped tests/tooling/verify/gates/port-parity-tier3.test.ts` or the new file. A header-only
change to the two config modules additionally names their own suites:
`tests/tooling/verify/gates/biome-grant-liveness.int.test.ts`,
`tests/tooling/verify/gates/tsconfig-entry-liveness.int.test.ts`,
`tests/tooling/verify/gates/grant-liveness-family.suite.test.ts`, and for `no-color-literals`
`tests/tooling/verify/gates/unfenced-class-fragment-scanners.suite.test.ts`.

**Hazard:** the guide's §5b.5 census caveat applies — a header block must be read by hand after it lands;
my own census in §1 shows a label field silently false-negating a real citation.

---

## 4. Proposed patches

**None written and none applied.** Both chunks are specs, not patches: chunk A's cut needs a grant-row
authoring decision per row (the `cite` dead-arm loss must be stated per row, which is authorship, not
mechanics), and chunk B's is three header blocks whose CONTENT is a measurement the fixing lane must own.
The only file this lane created is this report.

---

## LEDGER ROWS (2 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-legacy-imports` | cb-adj-authority L1 · `tooling/src/verify/gates/policy-legacy-imports.ts:120-136` (`FORBIDDEN_IMPORT_HOMES`) and its `fix` string | **ARM A's stated remedy VOIDS the §12.5 property the arm exists to enforce.** The arm judges the IMPORT ORIGIN of a specifier, and `#2201`'s re-export chase follows only `export … from`. A gate-owned `ExemptionTable` moved into `lib/<family>.ts` as `import type { ExemptionTable } from "../contract/gate.ts"` + `export const T: ExemptionTable = {…}` is therefore invisible: `lib/x.ts` is neither a forbidden home nor a registering gate module, and it is outside the declared population (`under: ["tooling/src/verify/gates/**"]`, 309 source files). §12.5 says *"Gate modules receive neither grant tables nor marker parsers"* — a final module importing that table still receives one. The arm's own `fix` ARM B authorizes the move (*"debt data with one owner (a deferral list) moves to `contract/` or `lib/` the same way"*), so this is a designed escape rather than a false negative — but nothing then holds §12.5, and #1922's migration can reach 0 red at 0% done | other (coverage gap created by the stated remedy) | **OPEN** (board #2147 / #1922) | `pnpm check:structure --check policy-legacy-imports` on `1ea2c2a0e`: **5 findings** (the invocation's own positive control — the recognizer fires) and NONE of them is `no-raw-spacing-in-features:34`, `no-raw-typography-in-features:51`, `contract-derives-not-respells:54` or `injected-op-caller-param-health:22`, each of which imports a live exemption table from `lib/`. The four tables are intact: `lib/raw-spacing-tier.ts:22`, `lib/raw-typography-tier.ts:21`, `lib/contract-derives-not-respells.ts:32` (all three still `ExemptionTable`-typed off `contract/gate.ts`) and `lib/injected-op-caller-param.ts:37` (retyped `CallerFreeOpRow[]`). Four of the nine modules the arm named at mint went green by exactly this move (`3420a81e9`, `d9d1e3524`) and **zero reviewed grants were minted** — no `REVIEWED_GRANTS` row names any of the five sanctioned-home policies · FIX: judge the exemption-table SHAPE at the final module's import boundary (a `defineGate` module importing a value whose declared type resolves to `contract/gate.ts#ExemptionTable`/`ExemptionRow`, wherever it sits), or widen the population to `tooling/src/verify/lib/**` with an `ExemptionTable`-declaration arm. Either way the arm needs a `mustFlag` fixture for the one-hop-lib shape, which it has for the `export … from` shim (`:434`) and not for this one |
| `#2000` | cb-adj-authority L2 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:357` | the row's OPEN cell says *"Still owed: the Tier 3 ruling, `turn-identity` and `plugin-dump-guard`"* — **all three landed in `c97de9d2f`, the commit the same cell already cites for Tier 2b/2c.** Its evidence cell measured the WRONG FILE (`schema-fact-wave-1.suite.test.ts`, which indeed has no `BASE`/`runPass`/frozen-legacy import) instead of the artifact `schema-fact-parity.test.ts`. A lane reading the queue is routed to build three things that exist | other (stale work-queue row) | **OPEN → should flip CLOSED** | `docs/reviews/gate-runtime/tier3-one-to-one-port-ruling.md` exists (9,954 bytes), `tests/tooling/verify/gates/port-parity-tier3.test.ts` exists (19,730 bytes) and names both carve-outs in its header, `tests/tooling/verify/gates/tier3-close-by-rule.suite.test.ts` exists (17,248 bytes); all three landed at `c97de9d2f` (per-path `git log`), strengthened at `ef044b12e`, both in HEAD's ancestry. RUN THIS SESSION: `pnpm test:scoped port-parity-tier3 split-arm-parity schema-fact-parity` → exit 0, **20 tests**; `pnpm test:scoped tier3-close-by-rule` → exit 0, 2 tests, 20.3 s. Frozen-blob spot check: `5dd83aaa42c…:plugin-dump-guard.ts` carries `GateDescriptor` at `:6`/`:95`, so the replay is against real legacy bytes · FIX: flip `:357` CLOSED with `c97de9d2f` / `ef044b12e`, and open the disposition of the ruling's own derived **237 REPLAY-OWED of 248** as its own row rather than letting it ride a closed #2000 |

**ledger rows OWED: 2**

Additionally, three EXISTING ledger rows should flip on the receipts in §2 and are NOT counted above
because they are re-statements, not new defects: `:798` (mirror trio §4.6 silence) and `:799`
(`test-layout` anchor move) and `:819` (mirror record findings-only) all CLOSED at `183e49714`; `:785`
(`no-default-props` `POPULATION NOTE` label) CLOSED at `8c165cd9f`.

---

## WHAT I DID NOT COVER

- **No whole-tree run.** No `pnpm check`, no bare `check:structure`, no `check:policy-conformance`, no CT —
  the brief's load fence. So I have **no corpus-wide final/legacy partition of my own**; where I needed one
  I cite `gate-runtime-read-first.md` §2's dated figure and say so. The single bounded
  `--check policy-legacy-imports` run printed `SELECTED RUN … this is NOT a whole-corpus verdict and
  reports/check-structure.json was NOT republished`, which is the correct behaviour and is why its 5 is a
  per-policy number and not a tree verdict.
- **I did not re-derive the 28 as a set.** I reconstructed the membership by hand from
  `v-unaudited-finals-2026-09-12.md`'s own tables (the report does not commit the list as one block) and it
  came to exactly 28, which is consistent — but it is a reconstruction, not a `comm -23` re-run of the
  report's derivation. If a module was misattributed, my 28/28 is 27/28 plus one unmeasured module.
- **I did not independently discriminate the three parity suites with a planted break.** Doing so requires
  neutering a policy in a tracked file, which this lane may not do. I verified instead that the harness
  cannot be vacuous by construction (no HEAD fallback, three declared axes, total tool-error classifier,
  twin-inertness control, `#2119` fs refusal) and that one frozen BASE blob is genuinely legacy. **A green
  from a harness I have not seen fail is weaker evidence than a planted control**, and the residual
  uncertainty is exactly that gap.
- **I did not run `no-color-literals`'s differential**, only established that none exists and that the
  module fails the close-by-rule membership test.
- **I did not read `Core-Enforcement-Active-Gates.md` in full** (385 KB, 305 rows) — per the read-first
  ordering it is on-demand by affected row, and nothing in these five rows turned on a roster cell.
- **I did not touch Project 1.** Every lifecycle transition above is a PROPOSAL for the orchestrator.
- **Board status field not read.** All five issues are `OPEN` on GitHub; I did not query their Project 1
  column, so "stays Ready" may be a no-op for a row already sitting elsewhere.
