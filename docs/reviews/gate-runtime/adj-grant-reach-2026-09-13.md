---
kind: review
status: active
updated: 2026-09-13
---

# Can a final policy REACH the reviewed grants through a helper wrapper? — yes, and the program's own repair commit already did it

Lane `cb-adj-grant-reach` (claude-b verify lens, read-only, owner-authorized prevention question, 2026-09-13).
Worktree `.claude/worktrees/agent-adf944b7cbfcc6dee` at `da3f25f63`. No tracked file was edited; every fixture was
untracked and is removed. The deliverable is this report plus a proposed enforcement contract shaped as a row of
`policing-surface-audit-2026-09-12.md`'s RECOMMENDED ADDITIONS table (§4) — root judges and authorizes; this lane
implements nothing and does not touch `policy-legacy-imports.ts` (#2320 owns that file).

**THE HEADLINE, stated first because it changes the question from prevention to repair.** The wrapper path is not
a hypothetical: **`3420a81e9` ("five families' shared predicates move to lib/ — no gate imports a gate", 2026-09-12)
closed two `policy-legacy-imports` ARM A findings by MOVING the `ExemptionTable`-typed constant out of the gate into
a NEW `lib/` module that now carries the `contract/gate.ts` import.** The refutation ledger records both as
*CLOSED at `3420a81e9` (the predicate moved to `lib/`, the import went with it)*. The import went with it; **the
reach did not.** `no-raw-spacing-in-features` and `no-raw-typography-in-features` still receive the legacy exemption
contract — the #1922 migration's actual subject — one ordinary import hop away, and the arm reports zero. The same
commit created `lib/raw-typography-tier.ts` and left `lib/sanctioned-home.ts` (which imports BOTH `contract/gate.ts`
and the legacy dispatcher `lib/pass.ts`) as the shared reader of four final modules.

---

## 1. Policing home and today's reach

### 1.1 The family and the one arm that judges imports

The policing home is the **`policy-soundness` family**, nine members, read off the family test's own `FAMILY` array
(`tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts:37-47`): `policy-binding-resolution`,
`policy-family-readers`, `policy-fixture-substrate`, `policy-legacy-imports`, `policy-proof-expectations`,
`policy-refusal-coverage`, `policy-soundness`, `policy-waiver-identity`, `policy-waiver-spelling`.

**Exactly one of them judges import reach: `policy-legacy-imports`** (`hard`/`error`, `analysis: "types"`,
`execution: "selected-files"`, population `{ in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] }`). I drove `policy-binding-resolution` over the wrapper fixture as a
territory check — 0 findings (§2 row X); its closed ten-member tuple is about ts-morph binding/origin members, not
about module doors. `policy-family-readers` reads a member's `lib/` imports for FAMILY cardinality only, and — worth
saying out loud — it **rewards** importing a shared `lib/` module, which is the exact motion that creates a wrapper.

### 1.2 What `policy-legacy-imports` actually follows

`tooling/src/verify/gates/policy-legacy-imports.ts`:

| step | code | what it reads |
| - | - | - |
| candidacy | `isCandidateSpecifier` `:117-119` | forbidden BASENAME (`:99`) · relative (`:105-107`) · contains `ops/` (`:112-114`) |
| the door | `judgeDoor` `:203-229` | `getModuleSpecifierSourceFile()`; resolved path vs the 9 exact `FORBIDDEN_IMPORT_HOMES` (`:86-96`), then the `ops/` prefix (`:137`), then `gateRegistrationOf(target)` |
| one hop in | `launderedThrough` `:247-263` → `launderedByReExport` `:267-285` | **`shim.getExportDeclarations()` ONLY** — `export … from` re-exports, to fixpoint over a visited set |
| fail-closed | `:214-216`, `:277-280` | a CANDIDATE specifier resolving nowhere ⇒ `unreadable` |

**`getExportDeclarations()` returns `ExportDeclaration` nodes only.** An ordinary `import { X } from "…"` inside the
target, and an `export function` / `export const` declaration in the target, are not `ExportDeclaration`s and are
never visited. So the walk sees the shim shape (`export { X } from "../contract/gate.ts"`) and is structurally blind
to the wrapper shape (`import { X } from "../contract/gate.ts"; export function f() { … X … }`).

The module header states this as a designed bound and prices it: *"Measured before landing: the whole of
`verify/lib/` + `verify/contract/` holds TWO `export … from` declarations … so this fence lands at zero findings and
zero false positives, and its cost is two resolutions."* That measurement is true and is exactly why the arm is
cheap — and it is also why it is the wrong shape: the population it walks is two declarations wide, while the
population it needs to walk (ordinary imports of `lib/` modules gates consume) is, measured below, 140 targets.

The audit that minted the arm **already named the class and rejected the weaker spelling for the same reason**:
`policing-surface-audit-2026-09-12.md:104` — *"E5 by SPELLING (the specifier text) | REJECTED | a re-export shim or a
same-named sibling defeats a spelling"*. The re-export shim was closed (#2201). The **wrapper** — the other half of
the same sentence's logic — was not, and is not in that audit's §10 "WHAT I DID NOT COVER".

### 1.3 The reviewed-grants importer census, two methods, with counts

**Method 1 — `pnpm ast importers tooling/src/verify/lib/reviewed-grants`** (the structural lens):
`14 hit(s) in 14 file(s)`; epilogue `scanned=7583 skipped=0 matches=14 status=complete`. Ten are under `tests/`,
four under `tooling/`: `tooling/src/verify/index.ts:152` (a **re-export**: `export { REVIEWED_GRANTS,
reviewedGrantsFor } from "./lib/reviewed-grants.ts";`), `ops/policy-conformance-stage.ts:32`, `ops/scoped.ts:31`,
`ops/structure.ts:69`. **Zero gate modules.**

**Method 2 — an independent resolver pass** over all 4150 `.ts`/`.tsx` files under `tooling/` + `tests/`, resolving
every relative `import`/`export … from` specifier to a real file: the identical 14, same four under `tooling/`.

**The grep corroboration, and why it is not the census:** a literal `rg` for `reviewed-grants` matches **45 files**,
of which **20 are gate modules and 40 of the 40 gate-file hits are prose** — `why`/`message`/`fix` strings and header
comments. That 20-to-0 gap is the standing "grep counts comments and strings" tax; the ast lens and the resolver pass
agree at zero.

The producer's own header states the law it is asking to have enforced (`lib/reviewed-grants.ts:5`):

> *"Gate modules never import this table; the command runner hands it to `runPolicyPass` as `reviewedGrants`."*

### 1.4 The corpus and the reach graph today (bounded census, `tooling/src/verify/**` only)

Measured with a scratchpad resolver (`adjgr-census.mjs` / `adjgr-authority.mjs`, `pnpm exec node`, both read-only):

- gate modules **309**; **final by shape** (`/^export const gate = defineGate\(/mu`) **267**.
- doors in final modules **1366**; distinct resolved targets **140** (95 under `lib/`).
- **HOP-0 direct (today's live ARM A class): 5 final modules** import `contract/gate.ts` —
  `depcruise-grant-liveness`, `domain-freshness-plane`, `eslint-grant-liveness`, `lifecycle-portability`,
  `runner-config-path-liveness`. No final module imports any other `FORBIDDEN_IMPORT_HOMES` member directly, and
  none imports `lib/reviewed-grants.ts`.
- **HOP-1 taint under the FULL forbidden tuple + `ops/` prefix: 7 targets, 50 distinct final modules.** The
  breakdown matters more than the total:

| tainted target a final gate imports | reaches | final importers |
| - | - | -: |
| `lib/resource-declaration.ts` | `ops/resource-host.ts` | **43** |
| `lib/grant-liveness.ts` | `contract/gate.ts` | 5 |
| `lib/sanctioned-home.ts` | `contract/gate.ts`, `lib/pass.ts` | 4 |
| `lib/contract-derives-not-respells.ts` | `contract/gate.ts` | 2 |
| `lib/raw-spacing-tier.ts` | `contract/gate.ts` | 2 |
| `lib/raw-typography-tier.ts` | `contract/gate.ts` | 2 |
| `contract/gate-corpus.ts` | `contract/gate.ts` | 1 (`policy-legacy-imports` itself) |

- **HOP-N under the AUTHORITY subset only** (`lib/reviewed-grants.ts` · `lib/gate-authority.ts` ·
  `lib/ordinary-waiver.ts` · `lib/gate-ignore.ts`), BFS to depth 8 from all 267 finals: **4 modules, all at depth 3,
  all on one chain** — `{no-raw-spacing-in-features, no-raw-typography-in-features, spacing-tier-home-health,
  typography-tier-home-health}` → `lib/sanctioned-home.ts` → `lib/pass.ts` → `lib/gate-ignore.ts`. **No final module
  reaches the GRANT TABLE at any depth.**
- **Producer-side allowlist sizing** (whole `tooling/` + `tests/`): `lib/reviewed-grants.ts` 14 importers (4 under
  `tooling/`), `lib/gate-authority.ts` **2** (1 under `tooling/`: `lib/policy-pass.ts`), `lib/ordinary-waiver.ts`
  **3** (2: `lib/gate-authority.ts`, `ops/gen/caught-failure-population.ts`), `lib/gate-ignore.ts` **3** (3:
  `gates/gate-ignore-inventory.ts` — a **LEGACY** `GateDescriptor`, out of the final population — `index.ts`,
  `lib/pass.ts`).

**The 43 is the load-bearing number for candidate pricing.** `lib/resource-declaration.ts` is the SANCTIONED resource
guard: `policy-soundness` E4 *requires* every `ctx.resources.<door>()` to sit inside `readyResourceValue` imported
from it. That module imports `ops/resource-host.ts`. So **a one-hop widening over the FULL forbidden tuple would make
E4-compliance and the widened arm mutually contradictory in 43 modules.** Any widening must be scoped to the
AUTHORITY subset, not to `FORBIDDEN_IMPORT_HOMES`.

---

## 2. Probe matrix

**Harness.** `tests/tooling/verify/adjgr-grant-reach.scratch.test.ts` (untracked, since deleted), the family test's
own recipe: `runPolicyPass({ knownPolicies: [policy], policies: [policy], root, project: projectOf(files),
reviewedGrants: [], failOnWarnings: false })` over an in-memory `Project`, fixtures built from
`gates/_proof/policy-soundness.ts`'s `familyFixture` / `finalProbeModule` / `HARD_TRUNK` — i.e. the PRODUCTION
dispatcher, not a hand-rolled visitor. Every row below ran in **one invocation** so the planted positive controls
(rows a and b) certify every zero beside them. Receipt: `pnpm test:scoped tests/tooling/verify/adjgr-grant-reach.scratch.test.ts`,
exit 0, 1 test passed, 15 `[adjgr]` lines. Verdict kinds are decoded from the finding message.

| # | case | expected | measured | verdict kind |
| - | - | - | - | - |
| **a** | **CONTROL, PLANTED POSITIVE** — policy does `import { REVIEWED_GRANTS } from "../lib/reviewed-grants.ts"` | flags | **findings=1** | `forbidden-home` |
| **b** | **CONTROL** — helper does `export { REVIEWED_GRANTS } from "./reviewed-grants.ts"`, policy imports the alias | flags | **findings=1** | `laundered` |
| **1** | **THE WRAPPER** — `lib/grant-helper.ts` does an ORDINARY `import { REVIEWED_GRANTS } from "./reviewed-grants.ts"` and exports a NEW `grantedSubjects(policyId)`; the policy imports and calls it | *silent today* | **findings=0** | — |
| **c** | CONTROL — neutral `lib/` helper importing nothing authority-shaped | passes | findings=0 | — |
| **d** | CONTROL — SANCTIONED path: `lib/reviewed-grant-findings.ts` (imports only `contract/policy.ts`), grant matched by the coordinator | passes | findings=0 | — |
| **2** | wrapper exports a CONST derived from the table (`export const GRANTED_IDS = new Set(REVIEWED_GRANTS.map(…))`) | *silent today* | **findings=0** | — |
| **3** | LEGITIMATE READER — helper whose PARAMETER type is the grant table; the value is supplied by the caller | passes | findings=0 | — |
| **3b** | policy imports the grant TYPE from `../contract/gate-authority.ts` (a forbidden BASENAME, an innocent resolved path) | passes | findings=0 | — |
| **4** | TWO-HOP wrapper (helper A reads grants, helper B wraps A, policy imports B) | *silent today* | **findings=0** | — |
| **5** | NAMESPACE import of the table by the policy (`import * as grants from "../lib/reviewed-grants.ts"`) | flags | **findings=1** | `forbidden-home` |
| **5b** | NAMESPACE import of the WRAPPER | *silent today* | **findings=0** | — |
| **6** | the LIVE barrel shape — policy imports `../index.ts`, which re-exports `./lib/reviewed-grants.ts` | flags | **findings=1** | `laundered` |
| **7** | DYNAMIC `await import("../lib/reviewed-grants.ts")` in the policy body | *silent today* | **findings=0** | — |
| **8** | **THE LIVE SHAPE** — mirror of `3420a81e9`: `lib/raw-spacing-tier.ts` imports `contract/gate.ts` and exports the `ExemptionTable`-typed `SANCTIONED_HOMES`; `lib/sanctioned-home.ts` imports `contract/gate.ts` + `lib/pass.ts` and exports functions; the gate imports both | *silent today* | **findings=0** | — |
| **X** | territory check — `policy-binding-resolution` driven over row 1's fixture | n/a | findings=0 | — |

**Reading of the matrix.** The arm's coverage boundary is exactly the DECLARATION KIND of the hop: an
`ExportDeclaration` with a module specifier is followed (b, 6); an `ImportDeclaration` inside the same file is not
(1, 2, 4, 5b, 8). Nothing about the wrapper is exotic — row 2 and row 8 are the shape a lane reaches for when it is
told "move the shared predicate to `lib/`", which is a STANDING RULING (#2096) the corpus is actively migrating to.

Row 7 (dynamic import) is a second, disjoint hole: `judgeModule` visits `ImportDeclaration`/`ExportDeclaration`
only. `policy-soundness` E3 does judge value-position `import()`, but only over its closed
`FORBIDDEN_IO_SPECIFIERS` door set (`fs`, `child_process`, …) — not over the authority homes. I did not build the
E3 control for that claim; it is a read of E3's tuple, flagged as such in §"what I did not cover".

---

## 3. Enforcement candidates

| | catches | misses | false positives on today's tree (measured) | cost | coupled sites | #2320 collision |
| - | - | - | - | - | - | - |
| **(i)** extend `launderedThrough` to also follow the target's own `ImportDeclaration`s, ONE hop, when the imported binding is a function/const whose initializer or signature references a forbidden module | rows 1, 2, 8; the 4 live `sanctioned-home` modules | row 4 (two-hop) — **a hop cap is defeated by adding one file, and row 4 measures that**; rows 5b/7 unless the visitor widens too | if scoped to the AUTHORITY subset: **0** (no `lib/` target a final gate imports reaches an authority home in one hop). If scoped to the full tuple: **50 of 267**, incl. **43 via `lib/resource-declaration.ts` → `ops/resource-host.ts`, which `policy-soundness` E4 REQUIRES** | +1 resolution per candidate door per hop; ~140 targets | the module + its rows + guide §12.5 + the roster row + the family test's ARM A text second opinion (`FORBIDDEN_HOME_IMPORT_RE` is a per-LINE regex and cannot express a hop — it must gain a second predicate or the two-sided pin goes one-sided) | **same file, same function.** Queues behind #2320 or consolidates under that owner |
| **(ii)** a REACH arm at the door keyed on the imported BINDING's resolved declaration origin, extended to "the declaration's own module imports a forbidden basename", one level | same as (i), plus it can name the BINDING rather than the module (a better message) | same as (i) — one level is one level; also needs `resolveModuleMemberOrigin` per named import, so a namespace import (5b) needs its own answer | same as (i) | strictly higher than (i): a binding resolution per named import, not per door | (i)'s sites plus `lib/reference-fact*` reader selection (`policy-binding-resolution` forbids a gate rolling its own) | **same file AND the same arm shape #2320 is building.** Highest collision; should be one lane, not two |
| **(iii)** **producer-side seal** — `lib/reviewed-grants.ts` (and the three other authority homes) importable only from a named allowlist | **every row in §2 at once**, including 4 (unbounded hops), 5b (namespace), 7 (dynamic import), and any future spelling: if no reachable module may import the producer, there is no chain to walk | a module ALREADY on the allowlist becoming a wrapper (mitigated: the allowlist is `ops/` + `index.ts`, none of which a gate may import — `ops/**` is already ARM A's prefix member and `index.ts` is caught by the existing re-export walk, row 6) | **0.** Allowlist as measured: `reviewed-grants` 4 (`index.ts`, `ops/policy-conformance-stage.ts`, `ops/scoped.ts`, `ops/structure.ts`) · `gate-authority` 1 (`lib/policy-pass.ts`) · `ordinary-waiver` 2 · `gate-ignore` 3, one of which is a LEGACY gate that retires at the cutover. **Ten `tooling/` rows total; every test importer is out of the population** | one predicate over ~635 files under `tooling/src/verify/`, or a dependency-cruiser rule at zero runtime cost on the gate bar | a new module + roster row + guide §12.5 sentence + a family-test second opinion; **plus one honest red**: `gates/gate-ignore-inventory.ts` (legacy) imports `lib/gate-ignore.ts` — scope the population to exclude legacy or accept a row that retires at the cutover | **none.** Different file, different population (`lib/**`+`ops/**` importers, not `gates/**`). Can land in parallel with #2320 |
| **(iv)** (iii) **+** widening the existing walk to ordinary imports over the AUTHORITY subset only, unbounded hops with the same visited set | everything (iii) catches, plus the 4 live `sanctioned-home`/`gate-ignore` reach chains that a producer seal on the AUTHORITY homes would ALSO catch (`lib/pass.ts` imports `lib/gate-ignore.ts`, so the seal reds `lib/pass.ts`) | nothing measured | AUTHORITY-scoped: **4** (the `sanctioned-home` chain), all honest — they are the legacy-dispatcher debt already named in the ledger | (i)'s cost plus (iii)'s | both sets | inherits (i)'s file collision |

**A note on "smallest".** (iii) is smaller than (i) in every dimension that matters: it is a predicate over a
**4-to-10-row allowlist** instead of a graph walk with a hop policy; it needs no hop-limit justification (the thing a
walk can never argue honestly, per the module's own header rejecting a depth cap); it is a **biconditional over the
producer**, so it is complete against spellings nobody has invented; and it does not touch the file #2320 owns.

---

## 4. Recommendation — as a row of the audit's RECOMMENDED ADDITIONS table

Placed in `policing-surface-audit-2026-09-12.md` §RECOMMENDED ADDITIONS shape (that table's columns), and filling
matrix cells **B11** (*no grant-table read*) and **B12** (*no marker-engine/legacy-parser import*), which today read
**BUILT — `policy-legacy-imports`** and are, on this lane's measurement, built only against the DIRECT and RE-EXPORT
spellings.

| # | addition | the paid defect it closes | HOME (why there) | tier | reds on the current tree | coupled sites | confidence |
| - | - | - | - | - | - | - | - |
| **1a — HIGHEST VALUE** | **`policy-authority-producer-seal`**: a module under `tooling/src/verify/**` may import `lib/reviewed-grants.ts`, `lib/gate-authority.ts`, `lib/ordinary-waiver.ts` or `lib/gate-ignore.ts` only if its own repo-relative path is in a closed `AUTHORITY_CONSUMERS` tuple. Cut direction is the PRODUCER, so the reach question stops being a graph walk | **PAID, not hypothetical:** `3420a81e9` closed two ARM A findings by relocating the `ExemptionTable` import into a new `lib/` module; the ledger records both CLOSED and the reach survives (§2 row 8, measured silent). Also the class the minting audit itself named and half-closed — `:104` rejected spelling-keyed enforcement because *"a re-export shim … defeats a spelling"*; #2201 closed the shim, the wrapper is the same sentence's other half | a NEW module in the `policy-soundness` family — an OPEN class goes in its own module (the rule the audit set twice, for `policy-legacy-imports` and `policy-binding-resolution`). Population is `tooling/src/verify/**` **minus** `gates/**` under the legacy contract, not `gates/**`: the subject is the IMPORTER OF THE PRODUCER, which is a different population from every existing family member and is why it cannot be an arm of `policy-legacy-imports` | arm (`hard`/`error`; the class is at ~0-1 so no `warning`+`workItem` transition is owed) | **0 under `tooling/src/verify/lib` and `ops`** (the allowlist IS today's importer set: 4 + 1 + 2 + 3, measured two ways). ONE row if the population admits legacy gates: `gates/gate-ignore-inventory.ts` (a legacy `GateDescriptor`) imports `lib/gate-ignore.ts` — exclude legacy, or carry it as a row that retires at the cutover | 4: the module + its roster row in `Core-Enforcement-Active-Gates.md` + the guide §12.5 sentence (*"Gate modules receive neither grant tables nor marker parsers"* gains ***"and no module outside `AUTHORITY_CONSUMERS` imports them, so there is no chain to reach through"***) + a family-test second opinion computed by a DIFFERENT method (a specifier regex over `tooling/src/verify/**`, never the resolver the arm uses) | **high** — the recogniser is one `getModuleSpecifierSourceFile()` suffix test the family already owns, the allowlist is ten rows, and the enforcement is a biconditional rather than a coverage claim |
| **1b — companion, lower priority** | widen `policy-legacy-imports`'s hop walk from `getExportDeclarations()` to ALL module doors of the target, **AUTHORITY subset only**, unbounded hops on the existing visited set | the same defect from the consumer side; closes the residual `lib/pass.ts` → `lib/gate-ignore.ts` chain if 1a's population is scoped away from legacy | `policy-legacy-imports` `launderedThrough` — **the file #2320 owns**; this is a leg of that lane or it queues behind it, never a parallel edit | arm | **4** (`no-raw-spacing-in-features`, `no-raw-typography-in-features`, `spacing-tier-home-health`, `typography-tier-home-health`, all depth 3 through `lib/sanctioned-home.ts` → `lib/pass.ts` → `lib/gate-ignore.ts`) — honest legacy-dispatcher debt | 4: the walk + 2 rows (a wrapper `mustFlag`, the `lib/resource-declaration.ts`-shaped `mustPass` that keeps E4 compatible) + the family test's `FORBIDDEN_HOME_IMPORT_RE` second opinion (a per-line regex today; it CANNOT express a hop and goes one-sided unless it gains a hop predicate) + the header's own "cost is two resolutions" paragraph | **medium** — correct, but a hop policy is the thing the module's header already refused to bound, and row 4 measures why |
| **DO NOT BUILD** | a one-hop widening over the FULL `FORBIDDEN_IMPORT_HOMES` + `ops/` prefix | — | — | — | **50 of 267 final modules, 43 of them because `lib/resource-declaration.ts` imports `ops/resource-host.ts` — the guard `policy-soundness` E4 mandates.** The arm would contradict a sibling arm of its own family | — | **high — refuse.** Scope any widening to the AUTHORITY subset |

### 4.1 The implementable spec for 1a

- **Predicate.** For each `ImportDeclaration` / `ExportDeclaration` with a module specifier in the population: if
  `getModuleSpecifierSourceFile()`'s path ends with a member of `AUTHORITY_HOMES` (`/tooling/src/verify/lib/`
  - `reviewed-grants.ts` · `gate-authority.ts` · `ordinary-waiver.ts` · `gate-ignore.ts`) **and** the importing file's
    repo-relative path is not in `AUTHORITY_CONSUMERS`, report at the specifier. Candidacy is the basename (identical
    to ARM A's `isHomeCandidate`, reused, not re-spelled); identity is the resolved suffix; a candidate resolving
    nowhere is `unreadable` and reported (#944 fail-closed).
- **Population.** `{ in: ["@tooling"], under: ["tooling/src/verify/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] }`.
  Tests are outside it by construction, which is correct: a family test importing `REVIEWED_GRANTS` to compute a
  second opinion is the sanctioned reader.
- **Cut direction.** PRODUCER. The complement of a ten-row allowlist, not a walk of a 140-target graph.
- **Controls owed** (§4.1's planted-break rule — this is an INVENTED property, so it owes a planted break):
  a `mustFlag` per authority home; a `mustFlag` for a `lib/` module not on the allowlist (the wrapper's producer
  side — the row that turns §2 row 1 red); a `mustPass` per allowlist member; a `mustPass` for
  `lib/reviewed-grant-findings.ts` (imports only `contract/policy.ts` — the sanctioned coordinator path, §2 row d);
  a `mustPass` for the `contract/gate-authority.ts` TYPE door (§2 row 3b — identity, not spelling); a `mustRefuse`
  blindness tripwire on its own path, matching the family's shape.
- **Coupled sites.** As the table's column. The family-test second opinion must be computed by a method the arm does
  not use — a specifier-text regex over `tooling/src/verify/**`, per the standing rule that an opinion which walks
  the same graph agrees by construction.
- **Collision with #2320.** None. Different file, different population, different cut direction. 1b is the one that
  collides and must be that lane's leg.

---

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-legacy-imports` | `cb-adj-grant-reach` · `tooling/src/verify/gates/policy-legacy-imports.ts:247-263` | the #2201 hop walk follows the target's `getExportDeclarations()` ONLY, so a `lib/` helper that reaches a forbidden home by an ORDINARY `import` and exports a NEW function or const launders it past both arms — at one hop, two hops, and through a namespace import | instrument blind spot (false clean); matrix cells B9/B11/B12/C2/C3/C8/C9 are built against the direct and re-export spellings only | OPEN — board-less until root files it | `tests/tooling/verify/adjgr-grant-reach.scratch.test.ts` (untracked, removed) through `runPolicyPass`: wrapper `findings=0`, derived-const `findings=0`, two-hop `findings=0`, namespace-wrapper `findings=0` — **with the planted positive controls `direct findings=1 [forbidden-home]` and `re-export findings=1 [laundered]` in the SAME invocation** |
| `no-raw-spacing-in-features`, `no-raw-typography-in-features` | `cb-adj-grant-reach` · `tooling/src/verify/lib/raw-spacing-tier.ts:1`, `lib/raw-typography-tier.ts:1` | the refutation ledger records both ARM A rows *CLOSED at `3420a81e9` (the predicate moved to `lib/`, the import went with it)*. The IMPORT moved; the REACH did not — the `ExemptionTable`-typed `SANCTIONED_HOMES` and its `contract/gate.ts` import now sit one ordinary hop away and the arm reports zero. The #1922 legacy-exemption migration's subject is still in both modules | RELOCATED, not closed — a close whose evidence is the blind spot above | OPEN — the two ledger rows' CLOSED state is unsound and owes a re-classification | `git show 3420a81e9 -- tooling/src/verify/gates/no-raw-spacing-in-features.ts` (the deleted `import type { ExemptionTable } from "../contract/gate.ts";`, the added `import { SANCTIONED_HOMES } from "../lib/raw-spacing-tier.ts";`); bounded census: `lib/raw-spacing-tier.ts` and `lib/raw-typography-tier.ts` each import `contract/gate.ts` and each has 2 final importers; §2 row 8 mirrors the shape and measures `findings=0` |
| `policy-legacy-imports` | `cb-adj-grant-reach` · `…/policy-legacy-imports.ts:344-357` (the visitor's `kinds`) | the visitor admits `ImportDeclaration`/`ExportDeclaration` only, so a value-position `await import("../lib/reviewed-grants.ts")` in a final module reaches the grant table unseen. `policy-soundness` E3 does judge dynamic `import()`, but over its `FORBIDDEN_IO_SPECIFIERS` door set, not the authority homes | instrument blind spot (false clean), disjoint from the wrapper class | OPEN — board-less | §2 row 7: `findings=0` beside the same-invocation positive controls. **Partial:** the E3-does-not-cover-it half is a read of E3's tuple, not a driven control |

`ledger rows OWED: 3`

---

## WHAT I DID NOT COVER

- **The real-corpus arm.** I did not run `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` (its
  real-corpus leg is ~112 s and the brief holds me off heavy runs while root has the heavy slot). Every real-tree
  number here is from the bounded resolver census, corroborated by `pnpm ast` where a lens exists. The ARM A live
  count I report (5 direct `contract/gate.ts` importers) is a shape census, not that policy's own verdict.
- **`policy-soundness` E3's dynamic-import arm was READ, not DRIVEN.** Ledger row 3 says so.
- **Non-relative (package-door) spellings of the authority homes.** No `@orb/tooling/...` specifier resolving to an
  authority home exists today; I did not build the control for one, and candidate 1a's candidacy test is a basename
  test, which covers a package door by construction.
- **`tests/**` as a reach surface.** Ten test files import `REVIEWED_GRANTS` legitimately; I did not evaluate
  whether a gate could reach the table through a test module (it cannot — tests are outside every gate population
  and no gate imports one), and 1a's population excludes them deliberately.
- **The two-writer question on `policy-legacy-imports.ts`.** I read #2320's territory only through the brief; I did
  not read that lane's in-flight diff, so the 1b collision note prices the FILE, not that lane's specific arm.
- **Rendered proof.** Nothing a user sees. No side-eye owed.
