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

## THREE BRIEF PREMISES THAT DIED (re-derived, not remembered)

1. **`no-raw-matchmedia` does NOT need #1998 fixed first — #1998 is CLOSED.** `2bacd5ef9` landed the
   five-grant count. Measured: `lib/reviewed-grants.ts` carries exactly **5** rows with
   `operation: "raw-match-media"` (`:405,:414,:422,:430,:438`); the module header `:8-11` says "All FIVE" and
   states the surviving `why` for the media-grid row (its query is `(pointer: fine)`, which the coarse-pointer
   home does not answer); the roster row at `Core-Enforcement-Active-Gates.md:288` enumerates all five.
   `refutation-ledger-2026-09-12.md:151` already records this CLOSED.
2. **`spacing-tier-home-health` does NOT owe a §4.5 pin — it landed at `ec336d41c`.**
   `tests/tooling/verify/gates/tier-home-health-family.int.test.ts:57-89` is the narrowed-request deferral pin
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

**What would settle it:** a ruling on whether §5b.2's *"every context clause is a claim"* is a claim about
RAW or EFFECTIVE findings for a reviewed-grant policy. Left UNCHANGED by this lane: the string is pinned
verbatim by `mustFlag[5]`/`mustFlag[6]`'s `messageIncludes` and quoted in the roster row, so rewording it is a
three-site edit on a wave-1-confirmed exemplar, not a copy-edit.

### C4 — the one UNCLEAR

**`no-mutating-register-api` declares `family: "registry-assembly-at-door-only"` and shares NO `lib/` reader
with that sibling** — it is a pure-syntax name check importing nothing from `lib/`. §5b.4's two sanctioned
shapes (a shared `lib/` reader, or a declared singleton with its reason) do not cover a SPLIT family, which
§3's plane table separately sanctions as its own shape.

It also collides with an OPEN ledger row: `refutation-ledger-2026-09-12.md:117` records that
`registry-assembly-at-door-only.ts:26` still declares `FAMILY: SINGLETON under its own id` while two modules
carry that family string. **That sibling is out of this lane's fence**, so the honest half of the fix — a
FAMILY line in `no-mutating-register-api` stating the two-member split and why it shares no reader — lands
here and the sibling's false SINGLETON claim stays OPEN.

## WHAT A COPY LANE SHOULD BE TOLD TODAY

- **Header shape: copy `section-registry-completeness` or `server-layout`.** Both carry all three §5b.5
  fields; `server-layout` additionally shows the INTENTIONAL-CORRECTION form with each delta numbered.
- **Proof shape by plane: unchanged from §3**, with the caveat that `no-raw-matchmedia`'s bare-`count` rows
  and the two tripwire rows are the shape NOT to copy (see C6).
- **Tripwire cut direction is INVERTED** (guide §4.1) — `spacing-tier-home-health`'s fences ACQUIT, so its
  falsifier is a `mustFlag` going GREEN.
