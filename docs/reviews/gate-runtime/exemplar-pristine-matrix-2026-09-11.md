---
kind: review
status: active
updated: 2026-09-11
---

# The nine cited exemplars × §5b's seven criteria — the measured matrix (#2005, #1584)

Guide [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §3 names one CONFIRMED
exemplar per evidence plane and tells a Phase-D lane to COPY it. §5b says a module is pristine only when all
SEVEN criteria hold. **Nobody had measured the nine against all seven** — §3's own caveat paragraph measured
exactly one criterion (§5b.5's three header fields) and found 3 of 9 complete.

This file is the 9 × 7. It is a READING measurement, per §5b's own closing paragraph: criteria 1, 4, 6 and 7
are partly greppable; 2, 3 and 5 are judgment about whether prose matches behaviour. Every cell below was
produced in this session against `9cb2fac89`, and a cell I could not settle says `UNCLEAR` with what would
settle it rather than guessing.

## The criteria, abbreviated

| # | criterion |
| - | - |
| C1 | smallest complete contract for its evidence plane — nothing declared it does not use |
| C2 | the `message` is TRUE of what the code flags (every context clause is a claim) |
| C3 | `fix` names the exact waiver spelling, read off the `report.node` call — ORDINARY policies only |
| C4 | the family is a real shared `lib/` reader (module + function) or a declared singleton WITH its reason |
| C5 | the header records FAMILY + its reader, POPULATION PORT, and the LEGACY SHA |
| C6 | proofs meet §4 in full (legacy rows, `expect`+`count` on every `mustFlag`, §4.1 cuts, §4.2 identity arm, §4.5 pins) |
| C7 | nothing forbidden survives behind the contract |

## THE MATRIX

| module | C1 | C2 | C3 | C4 | C5 | C6 | C7 |
| - | - | - | - | - | - | - | - |
| `section-registry-completeness` | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| `server-layout` | PASS | PASS | n/a `hard` | PASS | PASS | PASS | PASS |
| `ui-exports-map-complete` | PASS | PASS | n/a `hard` | PASS | PASS | PASS | PASS |
| `bus-definition-belts` | PASS | PASS | n/a `hard` | PASS (unnamed) | **FAIL** | PASS | PASS |
| `user-bus-deferred-member` | PASS | PASS | n/a `hard` | PASS (unnamed) | **FAIL** | **PARTIAL** | PASS |
| `no-raw-matchmedia` | PASS | **UNCLEAR** | n/a `reviewed-grant` | PASS | **PARTIAL** | **PARTIAL** | PASS |
| `no-mutating-register-api` | PASS | PASS | PASS | **UNCLEAR** | **PARTIAL** | PASS | PASS |
| `db-enum-from-tuple` | PASS | PASS | n/a `hard` | PASS (unnamed) | **FAIL** | PASS | PASS |
| `spacing-tier-home-health` | PASS | PASS | n/a `hard` | PASS (unnamed) | **FAIL** | **PARTIAL** | PASS |

`PASS (unnamed)` = the family IS a real shared `lib/` reader and the module consumes it, but the header does
not NAME it, which is the half of C4 that §3 states as *"named in the header"*. Those cells close with C5.

**THE TABLE ABOVE IS THE MEASUREMENT, NOT THE CURRENT STATE — every non-PASS cell was closed in the same
lane** (`#2005`, second commit). What each cell WAS and what closed it is below; both UNCLEAR cells were
ruled by the owner and re-scored PASS. The measurement is kept verbatim rather than overwritten because
§5b's closing paragraph asks for a per-module verdict line so a miss surfaces as a missing row, and because
a reader arriving from §3's caveat paragraph needs to see what "3 of 9" actually meant.

## THREE BRIEF PREMISES THAT DIED (re-derived, not remembered)

1. **`no-raw-matchmedia` does NOT need #1998 fixed first — #1998 is CLOSED.** `2bacd5ef9` landed the
   five-grant count. Measured: `lib/reviewed-grants.ts` carries exactly **5** rows with
   `operation: "raw-match-media"` (`:405,:414,:422,:430,:438`); the module header `:8-11` says "All FIVE" and
   states the surviving `why` for the media-grid row (its query is `(pointer: fine)`, which the coarse-pointer
   home does not answer); the roster row at `Core-Enforcement-Active-Gates.md:288` enumerates all five.
   `refutation-ledger-2026-09-12.md:151` already records this CLOSED.
2. **`spacing-tier-home-health` does NOT owe a §4.5 pin — it landed at `ec336d41c`.**
   `tests/tooling/verify/gates/tier-home-health-family.suite.int.test.ts:57-89` is the narrowed-request deferral pin
   (`owner.status: "not-applicable"`, `population: "complete"`) WITH its whole-project control, and the same
   file carries the §4.6 split-arm differential (`6f815e95e`). It is not "a copy target for a HARD tripwire
   only" on that ground; its remaining gaps are C5 and one C6 discriminator.
3. **`user-bus-deferred-member` does not fail all three §5b.5 fields** — it carries its LEGACY SHA
   (`d9ac09d580d98188caae64ba04f24deee7402ef6`, verified by reading
   `d9ac09d58:tooling/src/verify/gates/user-bus-coverage.ts`, which is a legacy `GateDescriptor`). It fails
   FAMILY and POPULATION PORT. Same for `bus-definition-belts` (`001949630e8a…`, verified the same way) —
   both got their SHA at `4e832e610`.

## WHAT EACH NON-PASS CELL IS

### C5 — the three header fields (six modules)

Derived by `git log -1 --format=%h -- <module>` back to the CONVERSION commit, then taking its PARENT, then
**verifying by reading the predecessor file at that SHA** (each yields a legacy `export const gate: GateDescriptor`).
A pickaxe/hash grep was not used: §5b.5 says it overstates carriers by 78%.

| module | conversion | LEGACY SHA | predecessor file read at that SHA |
| - | - | - | - |
| `bus-definition-belts` | `bda39454c` | `001949630` (already in header) | `gates/bus-definition-belts.ts` |
| `user-bus-deferred-member` | `001949630` | `d9ac09d58` (already in header) | `gates/user-bus-coverage.ts` |
| `no-raw-matchmedia` | `256682e4a` | **`6a7978135`** | `gates/no-raw-matchmedia.ts` |
| `no-mutating-register-api` | `4885cde80` (split-out) | **`5dd83aaa4`** | `gates/registry-assembly-at-door-only.ts` |
| `db-enum-from-tuple` | `521780ac6` | **`1bf7ff7d9`** | `gates/db-enum-from-tuple.ts` |
| `spacing-tier-home-health` | `99b7429e2` (split-out) | **`d6f36904f`** | `gates/no-raw-spacing-in-features.ts` |

The legacy population predicates, read off those files — the POPULATION PORT each header owes:

| module | legacy predicate | final `population` | port |
| - | - | - | - |
| `bus-definition-belts` | `scopeSafety: "whole-project"`, `ctx.project.getSourceFiles()`, no `scanRoot` | `{ in: ["@contracts","@client","@server"] }` | INTENTIONAL CORRECTION — narrowed to the provider's own population |
| `user-bus-deferred-member` | `scopeSafety: "whole-project"`, no `scanRoot` | `{ in: ["@contracts","@server"] }` | INTENTIONAL CORRECTION — same, one axis narrower |
| `no-raw-matchmedia` | `p.includes("packages/client/src/") \|\| p.includes("packages/ui/src/")` MINUS three home files | `["@client","@ui"]` | INTENTIONAL CORRECTION — the subtraction became grants |
| `no-mutating-register-api` | `startsWith("packages/client/src/")` + an in-visitor door subtraction | `"@client"`, whole | INTENTIONAL CORRECTION — the split's whole reason |
| `db-enum-from-tuple` | `/\/packages\/db\/src\/schema\//u` | `{ in: ["@db"], under: ["packages/db/src/schema/**"] }` | BYTE-IDENTICAL |
| `spacing-tier-home-health` | `/\/packages\/(?:client\|ui)\/src\//u` | `["@client","@ui"]` | BYTE-IDENTICAL |

**The population NARROWINGS above are not free choices and the header must say so** — for the three fact
consumers, §5b.5's third structural gap ("nothing checks that a provider's population is a SUBSET of its
consumers'") means the consumer population must EQUAL the provider's, and all three do
(`bus-definition-fact.ts:380`, `bus-fact.ts:651`, `schema-fact.ts:519-522`). A lane copying one of these and
"simplifying" the population to the narrower set its own arm reads would make the provider hand it nodes it
may not NAME, which is the `ctx.relativePath` throw.

### C6 — three PARTIAL cells, all the same shape

Measured by loading every policy object and counting rows (`mustFlag` / with `expect` / with `count` / with a
DISCRIMINATOR — `token`, `line` or `messageIncludes`):

| module | mustFlag | `expect` | `count` | discriminated |
| - | - | - | - | - |
| `section-registry-completeness` | 8 | 8 | 8 | 8 |
| `server-layout` | 3 | 3 | 3 | 3 |
| `ui-exports-map-complete` | 7 | 7 | 7 | 7 |
| `bus-definition-belts` | 3 | 3 | 3 | 2 |
| `user-bus-deferred-member` | 1 | 1 | 1 | **0** |
| `no-raw-matchmedia` | 9 | 9 | 9 | **4** |
| `no-mutating-register-api` | 4 | 4 | 4 | 4 |
| `db-enum-from-tuple` | 10 | 10 | 10 | 7 |
| `spacing-tier-home-health` | 1 | 1 | 1 | **0** |

§4.1: *"name `count` always, and `token` (or `line`/`messageIncludes`) whenever the row's `why` claims WHICH
node flags."* Every row in the three PARTIAL cells has a `why` that claims exactly that:

- **`spacing-tier-home-health` `mustFlag[0]`** — `why` says *"the markdown home resolves to no file"*, and
  the per-finding message quotes the failing KEY. Under a bare `count: 1`, a tripwire that named the LAYOUT
  key instead would pass this row. Owes `messageIncludes` naming the key.
- **`user-bus-deferred-member` `mustFlag[0]`** — one deferral, one member; the message appends
  `Member: connectionsChanged`. Owes `messageIncludes: "connectionsChanged"`.
- **`no-raw-matchmedia` `mustFlag[1..4]` and `[7]`** — five subject-identity rows (the one-home-is-not-a-
  carve-out row, the computed-literal spelling, the stored alias, the cast dodge, the translated marker) each
  carry a bare `count: 1` while `mustFlag[0]` beside them pins `token`. Every candidate this policy pushes
  supplies `token: MATCH_MEDIA` explicitly, so the token is available on all nine and costs nothing.

`bus-definition-belts` (2 of 3) and `db-enum-from-tuple` (7 of 10) are NOT counted PARTIAL: their bare-`count`
rows are founding/arity rows whose `why` claims a COUNT rather than a node (`"two inline configs on one table
are TWO findings — the verdict is per COLUMN"`), which is what `count` alone proves.

The §4.1 cut tables, the §4.2 identity arms and the §4.5 pins are NOT re-derived here — the standing record is
`v-exemplar-audit-2026-09-12.md` (waves 1-10) as adjudicated by
[`refutation-ledger-2026-09-12.md`](refutation-ledger-2026-09-12.md), which carries a session receipt per row.
Every wave-1 defect named against these nine reads **CLOSED** there, re-derived against `831576613`. **A cut
sweep here would be the fourth reading of the same fences and would inherit the guide's own over-report
classes** (a tripwire's INVERTED cut direction; a declared performance prefilter; the documented-unfalsifiable
`memberPath.length === 0`).

### C2 — the one UNCLEAR

**`no-raw-matchmedia`'s `MESSAGE` opens with *"a raw `matchMedia` read OUTSIDE the named media-query
one-homes"*, and the policy reports INSIDE them too.** That is deliberate and the module says so:
`mustFlag[1]`'s `why` is *"THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the reduced-motion one-home reds
like any other file and is licensed by an exact grant row."* So the clause is true of the EFFECTIVE finding
set (grants license the four home reads) and false of the RAW one.

Both readings are defensible and the choice is not a lane's:

- it is TRUE of every finding a human ever reads, because a consumed grant removes the rest;
- it is FALSE the moment a grant goes stale or is withheld — precisely the state in which an author reads
  the message inside a home and is told the read is outside one.

**RESOLVED — owner ruling, 2026-09-11 (#2005): §5b.2 is a claim about the EFFECTIVE set, and the message
stands.** A reviewed-grant policy's granted findings are suppressed before any human sees them, so
*"outside the named media-query one-homes"* is true of every finding a reader ever gets. Rewording it to
describe the raw scan would make the message narrate the policy's internals instead of its verdict, and
would force that awkwardness onto every reviewed-grant policy in the corpus.

**But the risk §5b.2 guards is real here and it is not in the message** — it is a copying lane reading
"outside the one-homes" as SCOPE-EXCLUDED and writing a population subtraction. The home is SCANNED and
licensed by an exact grant row (the 2026-08-22 scan-and-allowlist ruling), which is the opposite of
exclusion; a subtracted home is invisible when it moves, a granted one reds at its row. That fact lived
only in `mustFlag[1]`'s `why` and is now a header paragraph. Message, both `messageIncludes` pins and the
roster row are UNTOUCHED. Cell re-scored **PASS**.

### C4 — the one UNCLEAR

**`no-mutating-register-api` declares `family: "registry-assembly-at-door-only"` and shares NO `lib/` reader
with that sibling** — it is a pure-syntax name check importing nothing from `lib/`. §5b.4's two sanctioned
shapes (a shared `lib/` reader, or a declared singleton with its reason) do not cover a SPLIT family, which
§3's plane table separately sanctions as its own shape.

It also collided with an OPEN ledger row: `refutation-ledger-2026-09-12.md:117` records that
`registry-assembly-at-door-only.ts:26` declared `FAMILY: SINGLETON under its own id` while two modules carry
that family string.

**RESOLVED — owner ruling, 2026-09-11 (#2005): a SPLIT family is a legitimate third shape, and the fence was
widened by one line to close both halves.** §5b.4's two shapes do not cover a split; §3's plane table
sanctions it, and what CREATES it is §12.1's one-authority-and-one-severity-per-policy rule meeting two
different populations. Both modules now carry a FAMILY line saying two-member SPLIT, sharing no `lib/`
reader deliberately (this arm resolves nothing; the sibling resolves a factory callee's identity), with the
family STRING named as what keeps them visible as one law. **The `family:` value was correct on both modules
and was not touched** — only the prose describing it was wrong. That closes `refutation-ledger:117`. Cell
re-scored **PASS**.

## WHAT LANDED, AND THE CONTROL THAT PROVES THE C6 FIXES BITE

Second commit, seven modules (six of the nine plus ONE out-of-fence line the owner explicitly authorised —
`registry-assembly-at-door-only`'s FAMILY sentence, see C4):

- **C5, six modules** — FAMILY line naming the shared `lib/` reader (or the split, with its reason),
  POPULATION PORT with the legacy predicate quoted and the delta classified, and the LEGACY SHA. Four SHAs
  were newly derived; two were already present and were verified rather than re-minted.
- **C6, three modules, seven proof rows** — `spacing-tier-home-health.mustFlag[0]` gains
  `messageIncludes` naming the failing sanctioned-home KEY (there is no `token`: it is a `report.file`
  finding); `user-bus-deferred-member.mustFlag[0]` gains `messageIncludes: "Member: connectionsChanged"`;
  `no-raw-matchmedia.mustFlag[1..4]` and `[7]` gain `token: MATCH_MEDIA`, which every candidate already
  supplies explicitly.
- **C2/C4 header paragraphs** for the two ruled forks, above.

**PLANTED POSITIVE CONTROL, both directions.** A bare green after adding an expectation proves nothing —
an expectation that cannot fail reads exactly like one that holds. In a `cp`-backed copy of all three
modules each new discriminator was pointed at a WRONG value (`token: "notMatchMedia"`; the sibling
sanctioned-home key `packages/ui/src/layout/`; `Member: settingsChanged`), and
`pnpm check:policy-conformance` went **exit 2 with EIGHT rows red — and the distinction between eight and seven is the load-bearing part, not an arithmetic slip.** **SEVEN is the count of rows FIXED; EIGHT is the count the planted control REDS**, and the extra one is the interesting case: a single edit reddening a row it was not aimed at. An earlier version of this sentence said “exactly the seven expected rows” and then enumerated eight immediately after, which is how the inconsistency was caught (`v-wave-2026-09-13`, re-driven 2026-09-13 at `ff3eacb44`: 193 policies / 2125 rows / **8 failures**, exit 2, `no-raw-matchmedia` ×6 + `spacing-tier-home-health` ×1 + `user-bus-deferred-member` ×1). **A document stating a control’s expected red-count must say WHICH count it means**, because the two diverge exactly when an edit catches a neighbouring row — and that divergence is evidence the discriminator bites harder than claimed, never evidence of a miscount. The eight are — six
`no-raw-matchmedia` rows (the five new ones plus `mustFlag[0]`, which the same edit caught),
`spacing-tier-home-health.mustFlag[0]` and `user-bus-deferred-member.mustFlag[0]`. Restored with `mv`;
`git status --short` showed only the intended edits. Before and after the real fix the run is identical:
`186 final policies · 2021 proof rows · 0 failure(s) · 105 grant rows · 0 invalid`, exit 0.

**The nine roster rows were read and need no edit** — measured, not assumed. `no-raw-matchmedia`'s row
enumerates all five grants (#1998's roster half is closed too) and no row in
`Core-Enforcement-Active-Gates.md` claims a singleton for either half of the `registry-assembly-at-door-only`
family. Nothing in that file was touched, so no `|`-escaping or column-reflow hazard was taken on.

## WHAT A COPY LANE SHOULD BE TOLD TODAY

- **Header shape: copy `section-registry-completeness` or `server-layout`.** Both carry all three §5b.5
  fields; `server-layout` additionally shows the INTENTIONAL-CORRECTION form with each delta numbered.
- **Proof shape by plane: unchanged from §3.** The bare-`count` rows that made three cells PARTIAL are
  fixed, so the named exemplars are now safe to copy row-for-row.
- **A FACT CONSUMER'S POPULATION IS NOT A FREE CHOICE** — it must EQUAL the provider's, because nothing
  checks the subset relation (§4.5b) and a consumer narrower than its provider is handed nodes it may not
  NAME. Three of the nine now say so in their header at the exact place a lane would "simplify" it.
- **Tripwire cut direction is INVERTED** (guide §4.1) — `spacing-tier-home-health`'s fences ACQUIT, so its
  falsifier is a `mustFlag` going GREEN. Its header now says this at the top.
