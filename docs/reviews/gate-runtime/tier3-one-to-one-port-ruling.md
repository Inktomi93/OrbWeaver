---
kind: review
status: active
updated: 2026-09-12
---

# #2000 Tier 3 — the close-by-rule ruling, written as a membership test

**The ruling in one sentence.** A converted module owes NO §4.6 conversion differential when its
conversion was a **one-to-one port of a pure-syntax visitor that still carries its legacy proof rows** —
because in that shape `check:policy-conformance` already runs the legacy corpus through the production
dispatcher on every static pass, and a replay adds nothing a carried row does not already assert.

**The roster is the rule's OUTPUT, not an inherited list**, and it is held two-sidedly by
`tests/tooling/verify/gates/tier3-close-by-rule.suite.test.ts`, which re-derives it over the whole final corpus
and fails when a conversion changes who qualifies.

## Why this is a membership test and not seventeen names

`gate-runtime-orchestrator-playbook.md:650` says **"TIER 3 — 17 one-to-one ports at 0/0, close BY RULE
with the ports."** The number survived. **The list did not.**

- `git log --all --diff-filter=A -- '*parity-A*' '*parity-B*' '*parity-C*'` — nothing, ever committed.
  The census's lists (playbook `:617`) lived in a session scratchpad that no longer exists.
- `docs/reviews/gate-runtime/v-ledger-fixes-2026-09-12.md:208` restates the same bare 17 and adds *"no
  per-module closure is recorded"*.

So the seventeen is a **number with no list and nothing two-sided holding it** — the decayed end state of
exactly the failure mode the program keeps paying for. A rule with a stated membership test survives the
next conversion; a list of seventeen names does not. That is the whole reason this document is shaped the
way it is, and it is worth one sentence to the next lane: **`p-roster-as-data`'s rows are the same class
one step earlier.**

**AND THE PLAYBOOK CARRIES TWO DIFFERENT TIER 3s — do not read one as confirming the other.** `:650` is
the RE-SCOPED ranking (the "~13 modules genuinely need a built differential" cut); `:665` is the ORIGINAL
126 ranking and says **"TIER 3 — ~64 one-to-one ports of pure-syntax visitors."** Same label, different
sets. **This ruling implements `:650`.**

## The membership test

A module is CLOSED BY RULE when every clause holds. Any single refusal means a differential is OWED. The
executable form, with a planted break per clause, is `tier3-close-by-rule.suite.test.ts`; the clause numbers
below are its comment anchors.

1. **One-to-one.** The conversion parent holds exactly one exported legacy `GateDescriptor`, and the final
   policy's `id` is the legacy `name` and the module's own filename. A split, a merge or a rename refuses.
2. **Pure syntax on the legacy side.** The legacy module imported no shared semantic reader from `lib/`
   (`pass.ts` excepted), no `@orb/tooling/_shared/**` reader, and touched no type checker.
3. **No cross-file or real-tree state.** The legacy carried no `finalize` arm and no `ExemptionTable` /
   `ExemptionRow`. Either one is an arm a fixture-level replay structurally cannot reach — which is the
   `-health` split hazard §4.6 names, in its single-module form.
4. **No population subtraction.** The legacy `scanRoot` carries no negation. **This clause is
   deliberately weaker than its intent** (see LIMITS).
5. **The final is still pure syntax.** `analysis: "syntax"`, `facts: []`, `resources: []`. A conversion
   that acquired a fact, a resource or type analysis changed what the policy can SEE, and that change is
   precisely a differential's subject.
6. **THE LOAD-BEARING CLAUSE — the final CARRIES the legacy proof rows, LABELS *AND* BYTES.** Every legacy
   example's `why` survives verbatim in the final module, **and so does its `files`/`at` payload**. This is
   what makes the rule sound rather than merely cheap: if the rows are the legacy rows, conformance runs
   the legacy corpus against the production dispatcher every static pass. **A lane that REWROTE the rows
   destroyed that argument along with them**, and the module owes a replay. `expect:` is deliberately NOT
   compared — a conversion legitimately gains a `mode` and may split a message — and the sweep REFUSES a
   module whose payload it cannot parse rather than passing it by measuring nothing.

   **The BYTES half was missing from the first version of this ruling and it was a live hole (#2118).**
   Checking only `why` meant a conversion that kept every label while re-authoring every fixture still
   qualified — and the "conformance already runs the legacy corpus" argument was then FALSE, because the
   dispatcher was running re-authored fixtures. **`no-decorators` is that module**: all three of its `why`
   strings survived its conversion verbatim while all three of its template-literal fixtures were
   re-indented and re-homed into a `files` map. It sat on the roster from the first commit until the
   clause grew its second half. **It is now REPLAY-OWED**, and it is the only module the strengthening
   moved.

## The roster, re-derived over the whole final corpus at `0060ec324`

**Receipt: 248 final modules scanned · 11 CLOSE-BY-RULE · 237 REPLAY-OWED.** Method: for each
`tooling/src/verify/gates/*.ts` containing `defineGate({`, the conversion commit is the first commit the
`defineGate` pickaxe reports for that path, the legacy blob is that commit's parent, and the clauses above
are applied to the pair.

| module | legacy blob |
| - | - |
| `baseui-render-prop-composition` | `45743d76d^` |
| `ct-story-single-import` | `47c35b61c^` |
| `infra-auth-no-userid` | `45743d76d^` |
| `member-card-clamped` | `7be684811^` |
| `no-array-literal-querykey` | `45743d76d^` |
| `no-default-props` | `61aa46279^` |
| `no-external-media-without-gate` | `45743d76d^` |
| `no-layout-context-props` | `45743d76d^` |
| `no-media-queries-in-features` | `99b7429e2^` |
| `no-raw-container-widths` | `99b7429e2^` |
| `ui-accname-survives-spread` | `45743d76d^` |

**Two movements since the first landing, both recorded rather than silently absorbed.** The corpus grew
239 → 248 final modules across 24 merges and **not one new module joined** — the roster held green through
every one of them, which is the membership test doing its job. The only change is `no-decorators`, which
clause 6's byte half moved OUT (see above). A roster that never moves under a strengthening would be the
suspicious outcome; one that moves by exactly the module the strengthening was written for is the
expected one.

### The count disagrees with the census, and the disagreement cannot be reconciled

**11, not 17.** The census's 17 cannot be checked against this because its list was never committed, so
there is no way to tell whether the two sets overlap, whether the census counted modules this test refuses
(clause 6 alone drops 15 modules that clauses 1-5 admit), or whether the corpus simply moved. **Report the
11 as today's derived figure and the 17 as an uncheckable inherited one** — do not average them, and do
not let a future derivation landing near either number read as confirmation.

The single largest source of the gap is measurable: relaxing ONLY clause 6 takes the roster from 11 to 26.
That is the clause the soundness argument rests on, so the 11 is the honest number.

## LIMITS — stated, because a silent limit is how a rule becomes a rubber stamp

- **The test classifies by the legacy blob's SHAPE, never by a real-tree run.** It cannot see whether a
  legacy gate's live findings were zero. The playbook's phrasing ("whose legacy side actually RAN and
  returned zero") is therefore NOT what this test checks; clause 6 replaces that evidence with a stronger
  and checkable one.
- **Byte carriage is a SUBSTRING comparison** over the legacy `files`/`at` payload. It proves the fixture
  text survived into the final module; it does not prove the row's `expect` still pins the same node —
  that is conformance's job and it runs on the static bar every pass.
- **Clause 4 reads the `scanRoot` for a NEGATION, which is not the same as proving the absence of a
  population subtraction.** A negation refuses the module (conservative), but a subtraction spelled
  without `!` passes. A module on this roster whose population later turns out to have been narrowed is a
  defect to FILE, not a verdict this ruling defends.
- **The roster is corpus-dated.** It is the membership test's output on the tree this lane landed against.
  The test, not this table, is the live answer.

## The two exceptions — replayed, not closed

Per #2000, two modules are carve-outs and were REPLAYED instead
(`tests/tooling/verify/gates/port-parity-tier3.test.ts`):

- **`plugin-dump-guard`** (#1986). It fails the membership test on three clauses at once: a `finalize`
  blindness arm (clause 3), a control-flow ORDERING predicate rather than a token match, and a final that
  is `analysis: "types"` (clause 5). Its five ordering catches survive on the completed twin; the raw
  legacy fixtures now REFUSE (a zero-member population receipt) where the legacy `finalize` reported a
  finding — louder, not quieter. The `finalize` arm's LEGACY-SIDE COVERAGE is **zero examples**, asserted
  rather than claimed, and its successor is driven from the arm's own trigger condition.
- **`turn-identity`** (the wave-9 copy candidate). The vocabulary arm replays 1:1; the identity arm
  survives once its `@orb/contracts/identity` home is made resolvable — the §4.8b package-door class, one
  layer over. The population fence is byte-identical, and the final REFUSES a verb-only fixture with a
  `[population]` tool error where the legacy silently scanned nothing.

**The frozen SHA for `turn-identity` was re-derived rather than inherited**, and the re-derivation
mattered: `git log` on the module names `0d83d99f1` as its most recent structural commit, and
`0d83d99f1~1` ALREADY carries `defineGate`. The module header's own claim — `e5a7a8a8c^`, i.e.
`509671ae2` — is the commit that holds the `GateDescriptor`.
