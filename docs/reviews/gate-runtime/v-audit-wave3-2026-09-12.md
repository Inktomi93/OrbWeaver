---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave3 — the Drizzle-schema fact family against §5b PRISTINE (#1584)

Read-only adversarial audit of the nine modules the orchestrator named as the Drizzle-schema fact family,
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven criteria
and §4's proof rules. Method, receipt style and verdict-block format are copied from
[`v-audit-wave2-2026-09-12.md`](v-audit-wave2-2026-09-12.md), which is the better of the two prior waves and
which corrected wave 1's naive cut method. Every number below came out of a run produced in this session in
an isolated worktree; every probe was `cp f f.w3bak` … `mv f.w3bak f`, never `git stash`/`checkout`/`restore`,
and `git status --short` was EMPTY after every one of the nine probe rounds.

`check:policy-conformance` is at **167 final policies · 1,667 proof rows · 0 failures · exit 0** before and
after this audit and returns to it after every probe.

## Headline

**All nine are FINAL `defineGate` modules and all nine are in scope** (the wave-2 premise correction does not
recur here). **Nine of nine are REFUTED**, but the failure profile is the inverse of wave 2's: the *proof
sets* in this family are the strongest in the corpus so far, and the *headers* are the weakest.

| Property | Wave 1 (10 exemplars) | Wave 2 (7 final) | **Wave 3 (9 final)** |
| - | -: | -: | -: |
| `mustFlag` rows with no `count` | 2 of 33 | 0 of 45 | **1 of 53** (`ownerid-registry` stale arm; derived count = 27) |
| `messageIncludes` discriminators that are tautologies | 3 of 8 | 0 of 6 | **0 of 6** — all six sibling-arm transplants FAILED |
| §4.1 narrowings genuinely unenforced | 12 of 30 (40%, unsplit) | 5 of 30 (17%) | **4 of 24 (17%)**, each with a falsifier run in BOTH arms |
| Modules with NO §4.5 refusal pin | 3 | 2 | **0** — the family's refusal is proven centrally, 3 arms + a positive control |
| Modules in the #1972 `ctx.relativePath` class | — | 5 of 7 | **0 of 9** — structurally, and the reader is the reason (see "Checked and CLEAN") |
| Headers recording a POPULATION PORT | — | 6 of 7 | **1 of 9** |
| Headers naming the FAMILY + its reader as module+function | — | 6 of 7 | **0 of 9** |
| Roster rows that are bare pre-conversion labels | 4 | 0 | **1** (`schema-branding`) |
| Roster rows dense about the LEGACY implementation | — | 5 | **1** (`fk-columns-indexed`) |
| Ordinary policies whose `fix` names the waiver spelling | — | 7 of 7 | **2 of 3** (`fk-ondelete-stated` names none) |

| # | Module | Verdict |
| -: | - | - |
| 1 | `db-enum-from-tuple` | **REFUTED (minor — criterion 5 only)** — no population-port line and no family-reader path; **4 of 4 narrowings ENFORCED**, 10 exact counts, the strongest identity-counterfactual set in the family. **The module to hand a conversion lane.** |
| 2 | `nullable-column-inequality` | **REFUTED (minor — criteria 3, 6)** — the only header in the family that records its population port, with a measured 6,113 → 6,112 delta and the named dropped path. One MUTUALLY-REDUNDANT cluster (proven), one `fix` that names its position only self-referentially |
| 3 | `contract-banned-shapes` | **REFUTED** (criteria 4, 5, 6) — a declared singleton `family` with NO stated reason while it shares `lib/ledger-banned-shapes.ts` with `schema-banned-shapes`; `mustFlag[6]` cannot discriminate the two §4.6 arms because `missingHome` embeds `missingSubject` verbatim (proven by cut) |
| 4 | `schema-banned-shapes` | **REFUTED** (criteria 5, 6) — no port/family line; the `offset < 0` fallback arm is reached by NO row. 9 exact counts, 4 of 4 real narrowings enforced |
| 5 | `ownerid-registry` | **REFUTED** (criteria 5, 6) — the family's ONLY `mustFlag` with no `count` (derived: **27**); no port/family line. Both narrowings ENFORCED, and the barrel-anchor cut is the loudest in the batch (10 rows) |
| 6 | `fk-columns-indexed` | **REFUTED** (criteria 5, 6) — **one genuinely UNENFORCED narrowing, and the module's own `fix` names it** (the inline `.unique()` arm); roster row `:102` cites the LEGACY reader `_shared/schema-read.ts`, which the converted module does not import |
| 7 | `schema-branding` | **REFUTED** (criteria 5, 6) — **three genuinely UNENFORCED narrowings, the most in the family**, each with a built falsifier; roster row `:100` is a bare pre-conversion label AND overstates the subject (`*Id` columns vs the exact property `id`) |
| 8 | `fk-ondelete-stated` | **REFUTED** (criteria 3, 5) — ORDINARY with a `fix` that names NO waiver spelling (§5b.3); no port/family line. 1 of 1 narrowing enforced, both counts exact |
| 9 | `table-explicit-primary-key` | **REFUTED** (criterion 5) — **a ONE-LINE header**: no family, no reader, no population port, no legacy SHA. Proofs are clean (1 of 1 narrowing enforced, 2 exact counts) |

## Premise corrections

1. **`contract-banned-shapes` is NOT a `drizzleSchemaFact` consumer** and therefore is not part of the
   "Drizzle-schema fact family" the brief names. Its own header says so at `contract-banned-shapes.ts:2-3`:
   *"A different EVIDENCE PLANE from the schema partition (`schema-banned-shapes`) — authored contract
   declarations, not the Drizzle fact."* It declares `facts: []` and `analysis: "syntax"`. It IS a final
   `defineGate` module and §5b binds it, so **I audited it** — but it is out of the #1966 receipt-discipline
   question by construction, and the 18/18 claim does not concern it. The nine `drizzleSchemaFact`
   consumers among my subjects are therefore **eight**.
2. **`schema-branding` was re-audited as the brief asked, and wave 1's numbers reclassify.** Wave 1 reported
   "three arm narrowings unenforced." Under the corrected four-bucket method the number is the same — **three**
   — but the identities differ, each now carries a falsifier run in BOTH arms, and one of them
   (`parentBrand === null`) additionally exposes a latent MESSAGE defect (below).
3. **The brief's "18/18 consumers route through `recordReadySchemaFact`" is TRUE as re-derived, with one
   documented departure** — `freeze-provenance-write-pairing-health` has a reachable path that returns
   before the call. It is not a hole (it files its own receipt), but it is not what the claim's wording says.
   Detail in the receipt-discipline section.

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline) | `167 final policies · 1667 proof rows · 0 failure(s) · 105 grant rows · 0 invalid · 20068ms`, **exit 0** — identical to the brief's headline |
| `pnpm check:policy-conformance` (final, restored tree) | `167 final policies · 1667 proof rows · 0 failure(s) · 105 grant rows · 0 invalid · 13145ms`, **exit 0** — restored exactly to baseline |
| `pnpm gate:contract` (final) | `761 finding(s) across 271 gate module(s)`, exit 1. **The total did NOT rise.** A grep over the whole log for all nine subject ids returns **0** — none of the 761 is theirs |
| **`pnpm check:structure`** (run alone on the restored tree, after every probe) | exit 1 (the migration baseline). Tail: `final policies: 167 ran · raw 1322 = waived 1127 + granted 105 + effective 90 (90 error, 0 warning) · **0 alarm(s)** · **0 tool error(s)** · **0 withheld**`; `single-pass: ran 271/271 active gate(s) (104/104 legacy · 167/167 final) … run COMPLETE`. **All nine subjects `✓` with non-zero real-tree populations** — the eight fact consumers at `population 30 source · drizzle-schema: 1288 member(s)` (`nullable-column-inequality` at `population 6276 source`, plus `waived 1`, so its live `@orb-waive` door is exercised on the real tree), `contract-banned-shapes` at `population 105 source · ledger contract bans: 2 member(s)`. **Nothing in this family is withheld or blinded on the real tree.** Run id `agent-a56441e9de20b7108-3263957-2026-09-11T23-39-30-857Z` |
| `pnpm test:scoped` × 4 files | **4 files / 25 tests PASSED, exit 0, no type errors, 8.37 s**: `schema-fact-wave-1.test.ts` (5), `ledger-banned-shapes.test.ts` (1), `verify/lib/schema-fact.test.ts` (16), `verify/lib/ledger-banned-shapes.int.test.ts` (3) |
| 9 probe rounds | 24 narrowing cuts · 1 cluster cut · 4 built falsifiers run in BOTH arms · 6 message transplants · 1 `count: 99` derivation · 2 fail-open arms. Each restored; `git status --short` EMPTY after every round |

`pnpm exec biome` / `pnpm typecheck` were **not** run: this lane wrote one markdown file and modified no
tracked code. `pnpm check:docs` was run scoped for that file.

## THE RECEIPT-DISCIPLINE SECTION (#1966) — the fail-open is REAL, and this family's convention holds

### The runtime gap, confirmed from source

`policyReceiptFailures` (`tooling/src/verify/lib/policy-pass.ts:701-719`) has **no "policy produced no
semantic receipt" arm**. Its fact twin `factReceiptFailures` (`:648-651`) does:

```ts
if (run.receipts.length === 0) {
  failures.push("fact produced no semantic receipt");
}
```

There is no corresponding clause in `policyReceiptFailures`. **One correction to the brief's framing:** the
gap is narrower than "a policy that declares a fact and files no receipt passes silently." `:703-706` DOES
refuse an *unconsumed* fact (`declared facts were not consumed`). The live hole is therefore a policy that
**consumes** the fact, narrows the status itself, and files no receipt.

### The two-arm reproduction (this is the receipt, not the reasoning)

Probed on `table-explicit-primary-key.ts` with one added `mustPass` row whose fileset declares **no Drizzle
table at all** — an empty census inside the policy's population.

**ARM A — unmodified source.** Fail-CLOSED, exactly as designed:

```
policy-conformance: 167 final policies · 1668 proof rows · 1 failure(s) · exit 2
  ✗ table-explicit-primary-key · mustPass[0] · W3 PROBE ARM A: a schema population that declares NO drizzle table at all
      PASS TOOL ERROR [evaluate] drizzle schema fact empty: schema source population declares no Drizzle SQLite tables
```

**ARM B — `recordReadySchemaFact(ctx, fact);` replaced by `if (fact.status !== "ready") { return; }`**, the
single most natural thing a cold lane would write, and byte-for-byte type-correct:

```
policy-conformance: 167 final policies · 1668 proof rows · 0 failure(s) · exit 0
```

**The policy rendered a CLEAN verdict over an EMPTY census and the runtime said nothing.** That is #1966, and
it is a live, one-edit-away hole, not a hypothetical.

### Module by module — does each consumer file the receipt BEFORE reading `fact.value`?

All eighteen `drizzleSchemaFact` consumers, not only my subjects. The **type system makes the ORDER
unfalsifiable by accident**: `recordReadySchemaFact` is an `asserts fact is ReadySchemaFact<T>` function
(`contract/schema-fact.ts:29`), and `SchemaFact<T>` carries `value` only on the `ready` arm, so `fact.value`
before the call does not compile. A consumer can only escape by narrowing manually — which is ARM B.

| Consumer | `recordReadySchemaFact` call | First `.value` read | Verdict |
| - | -: | -: | - |
| `db-enum-from-tuple` | `:166` | `:167` | **ROUTES — receipt precedes** |
| `fk-columns-indexed` | `:28` | `:29` | ROUTES |
| `fk-ondelete-stated` | `:28` | `:29` | ROUTES |
| `nullable-column-inequality` | `:250` | `:251` | ROUTES |
| `ownerid-registry` | `:111` | `:112` | ROUTES |
| `schema-banned-shapes` | `:63` | `:64` | ROUTES |
| `schema-branding` | `:56` | `:57` | ROUTES |
| `table-explicit-primary-key` | `:26` | `:27` | ROUTES |
| `byte-check-cast` | `:209` | `:212` | ROUTES |
| `domain-freshness-plane` | `:651` | `:676` | ROUTES |
| `lifecycle-portability` | `:498` | `:499` | ROUTES |
| `no-untyped-soft-ref` | `:81` | `:82` | ROUTES |
| `owner-scoped-reads` | `:117` | `:118` | ROUTES |
| `owner-scoped-upserts` | `:164` | `:165` | ROUTES |
| `owner-scoped-writes` | `:147` | `:148` | ROUTES |
| `own-tables-only` | `:429` | `:438` | ROUTES |
| `table-scoping-class` | `:422` | `:424` | ROUTES |
| `freeze-provenance-write-pairing-health` | `:111` | `:115` | **ROUTES — with a reachable path that returns FIRST** |

**18 of 18 route. No consumer is a live fail-open hole. The brief's central question answers NO — #1966 is
latent for this family, not present.**

### The one departure, and the one thing it costs

`freeze-provenance-write-pairing-health.ts:101-107` handles `fact.status === "empty"` **before**
`recordReadySchemaFact` and returns:

```ts
if (fact.status === "empty") {
  ctx.receipt({ kind: "population", source: "freeze-provenance-write-pairing-health", members: 1 });
  …
  return;
}
```

This is correct and deliberately documented (`:94-100`, #1962): `empty` is the fact's own modelled value,
and this policy's whole job is to REPORT a schema tree that lost its guarded table. It files its own receipt,
so the fail-open does not open. **But the receipt it files is the literal `1`.** `receiptFailures`
(`policy-pass.ts:636-644`) only ever tests `count === 0` and `unresolved > 0`, so a hardcoded `1` satisfies
the predicate by construction and measures nothing. §12.3's rule that *"a provider's receipt states what it
MEASURED"* has no policy-side analogue in the runtime, and this is the shape that would exploit that.
`contract-banned-shapes:224` does the same thing (`members: CONTRACT_BANNED_SHAPES.length`) but is
**honest about it**, stating in a comment that `members` is the RULE population and that zero would mean the
row table went empty. That comment is the standard; the `members: 1` is not.

**Recommendation for #1966, from this evidence:** the fix is a `policyReceiptFailures` arm, not a per-family
convention. This family passes it today by a discipline that lives in a shared helper's signature — which is
genuinely strong — but the helper is opt-in, the escape compiles, and the escape is one `if` statement.
`schema-fact.ts:530-533`'s own header already says exactly this and names the pin
(`tests/tooling/verify/lib/schema-fact.test.ts:113`, "THE FAIL-OPEN SHAPE"). **The claim in that header is
TRUE as of this audit; I re-derived it consumer by consumer.**

## DEFECTS

### D1 — 8 of 9 headers record NO POPULATION PORT, and 9 of 9 record no FAMILY line (§5b.5, HIGH)

The single worst property of this family and the one that most disqualifies it as copy material. Mechanical
census over all nine modules:

```
grep -c 'FAMILY'          → 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0
grep -c 'POPULATION PORT' → 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0 · 0
grep -cE '[0-9a-f]{7,}\^?' (a legacy SHA anywhere) → 0 in all nine
```

§5b.5 requires the header to record *"the family and its reader, the population port (byte-identical, or the
intentional correction and why)."* Wave 2's family did this in 6 of 7 headers with labelled lines and cited
legacy SHAs (`dd862e988^`, `577d03d63^`). Here:

- **The population port is recorded exactly once**, in `nullable-column-inequality.ts:42-53`, and it is
  excellent — it names the legacy `scanRoot` expression, states the measured delta on the frozen candidate
  set (**legacy admitted 6,113 paths, the conversion admits 6,112**), names the ONE dropped path
  (`packages/showcase-plugins/src/index.ts`), and proves the drop is lossless with a positive control. **That
  paragraph is the §5b.5 standard and the other eight owe one.**
- **The family reader is named by MODULE PATH in two** (`schema-banned-shapes:4`, `contract-banned-shapes:4`,
  both pointing at `../lib/ledger-banned-shapes.ts`). Five more name it only in prose ("the shared Drizzle
  fact", "the provider") without module or function.
- **`table-explicit-primary-key.ts` has a ONE-LINE header** stating only what the rule is. No family, no
  reader, no port, no rationale. It is the least documented converted module I have read.

Nobody reading these nine can answer "is this conversion's population the same set the legacy gate walked?"
for eight of them, which is the exact question §4.6 exists to make answerable.

### D2 — `contract-banned-shapes`'s `mustFlag[6]` cannot discriminate the two §4.6 arms (§4.1, MEDIUM)

The module has two blindness arms at `:214-218`:

```ts
if (paths.includes(home)) {
  ctx.report.file(home, { message: missingSubject(subject, home) });
} else if (anchor !== undefined) {
  ctx.report.file(anchor, { message: missingHome(subject, home, anchor) });
}
```

and `missingHome` (`:120-121`) is `` `${missingSubject(subject, home)} Its home file is not in this policy's
population at all …` `` — it **embeds `missingSubject` verbatim**. `mustFlag[6]` pins the first arm with
`expect: { count: 1, messageIncludes: "SILENT NO-OP" }`, and that substring is in BOTH messages.

**Proven by cut.** Forcing the branch to `false as boolean` so only `missingHome` can ever fire leaves
`mustFlag[6]` GREEN — the row it exists to prove does not notice that its arm stopped executing:

```
policy-conformance: … 4 failure(s)   ← none of them mustFlag[6]
```

The sibling row IS discriminating (a transplant of `"not in this policy's population"` onto `mustFlag[6]`
FAILS, receipt in Sweep B), so only the home-PRESENT arm is unpinned. **Fix:** `mustFlag[6]` needs a
discriminator the second arm cannot satisfy — the reported FILE is the honest one (`home` vs `anchor`), and
the expectation shape has no `file` field, so the practical answer is `line` plus a fixture whose home and
anchor differ in position, or a `messageIncludes` on text unique to the *absence* of the second clause, which
does not exist today.

### D3 — four narrowings are genuinely UNENFORCED, each with a falsifier run in BOTH arms (§4.1, MEDIUM)

Three of the four are in `schema-branding`, the module wave 1 already audited. The fourth is in
`fk-columns-indexed` and is the sharpest, because **the module's own `fix` names the arm nothing proves**:

> `fk-columns-indexed.ts:10-11` — "add a Drizzle `index` or `uniqueIndex` whose first term is the FK; an
> inline `.primaryKey()`/**`.unique()`** or leading composite `primaryKey` also counts."

`column.unique` at `:37` is the clause that honours that sentence, and it is **not** mutually redundant with
`leading.has(...)`: `column.unique` is an inline builder-chain operation (`schema-fact-value.ts:341`
`unique: chain.operations.has("unique")`) while `table.indexes` is built only from the extras callback
(`schema-fact-value.ts:401`), so an inline `.unique()` never appears as an index term. Two distinct code
paths, one unproven.

Full falsifier table in Sweep A.

### D4 — `ownerid-registry` `mustFlag[4]` carries no `count`; the derived value is 27 (§4.1, LOW-MEDIUM)

The stale arm's expectation is `expect: { messageIncludes: "classifies nothing" }` (`ownerid-registry.ts`,
the `mustFlag` with `why: "THE STALE ARM, mode (B) of §4.4a"`). §4.1: *"Name `count` always."* This is the
only such row in 53 across the family. Derived by planting `count: 99`:

```
✗ ownerid-registry · mustFlag[4] · THE STALE ARM, mode (B) of §4.4a …
    expected effective finding count=99 but got 27
```

**27 is exactly `Object.keys(OWNERID_CLASSIFICATIONS).length`** (re-derived mechanically; the module header's
"27 schema ownership classifications" claim is CORRECT). Without the `count` the row passes if the arm reports
1 of 27 — i.e. if the stale detection silently shrank to a single row. `count: 27` closes it.

### D5 — `fk-ondelete-stated` is ORDINARY and its `fix` names no waiver spelling (§5b.3, MEDIUM)

§5b.3 binds every ordinary policy. `fk-ondelete-stated.ts:10-11`:

> `pass \`{ onDelete: "cascade" | "set null" | "restrict" | "no action" }\` to \`.references(...)\`, choosing
> what the child row means without its parent; then regenerate the baseline.\`

No `@orb-waive fk-ondelete-stated(<position>)`, and no statement of what the position is. The information
EXISTS in the module — `mustPass[2]`'s `why` (`:95`) is the best position statement in the family
("the report anchors on the COLUMN DECLARATION at offset 0 and its token is the schema fact's
`column.identity.propertyName`, so an author waives the property name `chatId` — never the SQL name
`chat_id` or the `references` call") — but a `why` is invisible to the person the policy fires on. That
sentence belongs in the `fix`.

The other two ordinary policies are PARTIAL rather than clean:

- `schema-branding.ts:10-11` names `@orb-waive schema-branding(<column>)`. `<column>` is ambiguous exactly
  where it matters: the token is `column.identity.propertyName` but **the MESSAGE names the SQL identity**
  (`things.id is a primary-key entity id…`, built from `table.sqlName`/`column.sqlName`). The fixture waives
  `schema-branding(id)`, the property name. Compare wave 2's gold, which says outright "never the zone or the
  `mobile` field the message names."
- `nullable-column-inequality.ts:39-40` names `@orb-waive nullable-column-inequality(<the reported token>)`.
  Self-referential: a reader cannot tell from the `fix` that the token is `Table.column` source text.

### D6 — two roster rows in `Core-Enforcement-Active-Gates.md` are wrong about the converted module (§5b.5, MEDIUM)

Seven of nine rows are accurate and several are excellent (`nullable-column-inequality:314` is the densest
honest row I have checked in three waves — it carries the co-location ruling, the waiver grammar, the
`.primaryKey()`-is-NOT-NULL reading and both declared limits, and every clause survived a check). Two do not:

| Row | The claim | The tree |
| - | - | - |
| `:102` `fk-columns-indexed` | "the columns argument is resolved through local/imported object-literal bindings and object spreads by **`_shared/schema-read.ts`**" | **Wrong reader.** `tooling/src/_shared/schema-read.ts` still exists with five other consumers, but `fk-columns-indexed.ts` does not import it — the converted module reads `../lib/schema-fact.ts` (`:6`). A mis-citation, not a dangling ref; the wave-2 D2 class recurring |
| `:100` `schema-branding` | "db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK)" | **A bare pre-conversion LABEL (wave 1's D9 class) that also OVERSTATES the subject.** The module keys the entity-id arm on `column.identity.propertyName === "id"` EXACTLY (`:17`) — not on a `*Id` pattern — which my falsifier #4 proves by construction: an unbranded primary key named `slug` passes today. The row promises coverage the module does not have |

`:103` (`fk-ondelete-stated`) claims "Fails CLOSED on a spread options object — the action is named AT the
column." That behaviour lives in the shared fact's option parsing, and **no proof row in the module exercises
it** — recorded as NOT-EVALUATED rather than filed, because I did not build the fixture.

### D7 — `contract-banned-shapes` declares a SINGLETON `family` with no reason, while sharing a reader (§5b.4, MEDIUM)

`family: "contract-banned-shapes"` — a singleton named after itself. §5b.4 permits that only as *"a declared
singleton **with its reason**"*, and the header gives none. The header explains why the POLICY ID is separate
(a different evidence plane), which is a different question and is correct. Meanwhile the module shares
`lib/ledger-banned-shapes.ts` — the D-cite row tables, `bannedMessage`, `contractBanHome` — with
`schema-banned-shapes`, which declares `family: "drizzle-schema"` (its *fact* reader). So one shared `lib/`
reader produces two different family keys and neither names it. Wave 2's `warning-code-coverage:21-24` is the
standard: it declares its singleton AND prices the alternative. The same paragraph is owed here.

### D8 — an arm nothing reaches, and a latent message defect the fence is hiding (LOW)

- **`schema-banned-shapes` `offset < 0` fallback (`:70-73`).** Neutering the branch (`(offset as number) < -1`)
  changes **no** proof row, so no fixture produces an identity the declaration text does not carry verbatim.
  The branch is defensive and correct; §4.1's answer is either a fixture or a stated declared limit, and it
  has neither.
- **`schema-branding`'s FK message interpolates `null`.** When the `parentBrand === null` fence (`:33`) is
  cut, the message reads *"pins.chatSlug carries id brand "chat", but its parent chats.slug carries null."*
  — `foreignKeyBrandProblem:38` does `carries ${parentBrand}` with no null arm. Not live today (the fence
  makes the branch unreachable), which is precisely why it is worth recording: **if a lane closes D3 by
  deleting that fence instead of adding a row, it ships the string `carries null` to a user.**

## Checked and CLEAN — the #1972 class does not reach this family, and the reader is why

**0 of 9 modules are in the `ctx.relativePath` escape class**, and this is the family's strongest property.
Two facts, both measured:

1. **Only two subjects call `ctx.relativePath` at all**, and both call it over `ctx.files`
   — `ownerid-registry:126` (`ctx.files.map(ctx.relativePath)`) and `contract-banned-shapes:206`
   (same shape). §12.3 splits the class by argument: a node the policy **VISITED** is safe, a declaration
   reached by **RESOLUTION** is not. Every argument here is a file the runtime already resolved into the
   population. `ctx.checker()` appears **zero** times and `getType()` **zero** times across all nine.
2. **The shared reader solved the problem structurally rather than by idiom.**
   `schema-fact-value.ts:373-394` `canonicalPathResolver` derives the repository root ONCE from the effective
   population, verifying that every absolute path ends with its own repository identity, and then resolves
   **any** source file by prefix slice. It throws only when a file is outside the *repository* — not outside
   the *population*. That is strictly better than §12.3's recommended total idiom
   (`canonical.sourceFile.getFilePath().replaceAll("\\","/")`), because it recovers the repo-relative path
   rather than the absolute one, and it is what lets `foreignTarget` (`schema-fact.ts:230, :272`) name a
   parent column in another file without asking the policy context anything. **This deserves to be the
   §12.3 exemplar for a fact that must resolve across files.**

**And `ownerid-registry`'s `ctx.files` anchor is NOT the §12.3 "false clean under `--scope`" anti-pattern**,
which I checked because the shape looks identical. `policy-pass.ts:337` defers an `entire-population` policy
entirely for a proper-subset selection (`"entire-population policy deferred for a proper subset selection"`),
so the barrel test never runs against a partial fileset — the policy either has the whole population or does
not run. All nine subjects declare `execution: "entire-population"`, so the protection is family-wide.

## Checked and CLEAN — no loader-property limit in this batch

I checked all nine for the `no-raw-matchmedia` shape — a declared limit that is really a claim about the
LOADER's `lib` (both live loaders build ts-morph with no `compilerOptions`, so the ts-morph default lib
including DOM applies). **None asserts that the analysis program cannot see a global, a DOM declaration or an
ambient type.** The nearest things are checker/resolution properties that are `lib`-independent and pinned by
real rows: `db-enum-from-tuple`'s `mustPass[0]` why ("it must pass WITHOUT the external module being
loadable", i.e. `@orb/contracts` is unresolvable in a virtual project and the origin reader still admits it —
**verified: cutting `fromCanonicalModule` reds five `mustPass` rows**), and `nullable-column-inequality`'s
`mustPass[6]` module-origin counterfactual.

## Open question I could not settle — `analysis: "types"` on eight modules that never touch the checker

`analysis` has exactly ONE runtime effect: `policy-pass-context.ts:243-248` throws when a `syntax` owner calls
`ctx.checker()`. A policy's `analysis` does **not** propagate to its facts — the fact carries its own
(`policy-pass.ts:542`, `analysis: run.fact.analysis`), and `drizzleSchemaFact` declares `"types"` itself. So
eight of my nine declare `analysis: "types"` while calling neither `ctx.checker()` nor `getType()` (both
counts are **zero** in all nine), which reads as the §5b.1 over-declaration shape ("nothing declared that it
does not use").

**And there is a gate on this axis that only catches the OTHER direction.** The `gate-authoring-law` legacy
gate's own diagnostic, read out of my `check:structure` log, says:

> "An `analysis` token: the policy DECLARES `analysis: \"syntax\"` and its body calls `getType(`/`getSymbol(`.
> `ctx.checker()` refuses a syntax owner, but a ts-morph node reaches the compiler WITHOUT the context, so
> the declaration is simply untrue … **and the smallest-complete-contract rule has no other enforcer on this
> axis.**"

So UNDER-declaration is gate-caught and OVER-declaration is not, by the gate's own admission. **I still did
not prove the over-declaration is real**: the counterfactual — flipping two of them to `"syntax"` and
re-running conformance — was written and not run, because the only remaining window overlapped my
`check:structure` run and patching a gate module mid-flight is the exact mistake I made once already in this
session. Recorded as a live question for #1584 rather than a defect, because the honest alternative reading is
that `analysis` declares the *evidence plane the verdict rests on*, in which case "types" is correct and
`contract-banned-shapes`'s `"syntax"` is the outlier for the right reason. **The probe is one conformance run
and it should be run before this family is copied.**

## One live real-tree finding against a subject, from `check:structure`

`diagnostic-legibility` (a LEGACY gate, `scanned 277/7412 files`) reports **87 findings corpus-wide**, and
exactly **one** belongs to my nine:

```
✗ diagnostic-legibility (87)  ·  scanned 277/7412 files
    tooling/src/verify/gates/contract-banned-shapes.ts:189:0  diagnostic must carry a pointer — end the
    message with a `<Doc>.md §N` doc path, a code-home … or mark it `// terse-ok: <reason>`
```

The subject is `UNRESOLVED_MESSAGE` (`contract-banned-shapes.ts:113-114`), which ends *"Author the shape as a
resolvable Zod object/extend/merge chain."* It DOES cite `(GATE-AUTHORING §5, #944)` — but mid-sentence, and
the rule is about the message's END. The other eight subjects have **zero** findings from this gate. It is a
one-line fix (move the cite to the tail, or append
`tooling/src/verify/lib/ledger-banned-shapes.ts`) and it belongs with D7's header fix in the same commit.

## MANDATORY SWEEP A — the §4.1 narrowing cut table, CLASSIFIED

Method per §4.1 and wave 2's correction: `cp` the module, cut the narrowing, run every declared row through
the production conformance door, `mv` back. **A clean cut is not a verdict** — it routes into one of four
buckets, and UNENFORCED is issued only with a falsifier run in BOTH arms.

| Module | Narrowing (`path:line`) | Cut | Row that died | Verdict |
| - | - | - | - | - |
| `table-explicit-primary-key` | `table.indexes.some(kind === "primary-key")` (:28) | inline PKs only | `mustPass[1..3]` | ENFORCED |
| `fk-ondelete-stated` | `onDelete.kind === "unspecified"` (:31) | flag every FK | `mustPass[0]`, `mustPass[1]` | ENFORCED |
| `fk-columns-indexed` | `column.unique \|\|` (:37) | drop it | — | **UNENFORCED** — falsifier built |
| | `column.primaryKey \|\|` (:37) | drop it | `mustPass[3]` | ENFORCED |
| | leading-term `terms[0]?.kind === "column"` (:32-33) | any index column counts | `mustFlag[3]`, `mustFlag[4]` | ENFORCED |
| `schema-branding` | `column.primaryKey &&` (:17) | any column named `id` | — | **UNENFORCED** — falsifier built |
| | `propertyName === "id" &&` (:17) | any unbranded PK | — | **UNENFORCED** — falsifier built |
| | `parentBrand === null \|\|` (:33) | judge unbranded parents | — | **UNENFORCED** — falsifier built |
| | `parentIdentity?.kind !== "population-column"` (:24) | — | — | **NOT EVALUATED** — a discriminated-union TYPE obligation (§12.3's `ResourceLoad` rule); `parent` is reachable only on that arm, so the test cannot be deleted, only written wrong |
| `ownerid-registry` | `propertyName === OWNER_COLUMN` (:87) | any column name | `mustPass[2]`, `mustPass[4]` | ENFORCED |
| | barrel anchor `paths.includes(SCHEMA_BARREL)` (:127) | always run the stale arm | **10 rows** (every `mustFlag` and every `mustPass`) | ENFORCED — the loudest cut in the family |
| `schema-banned-shapes` | `shape.table === table.sqlName` (:38) | every row on every table | **14 rows** | ENFORCED |
| | `columnHit` pattern arm (:22) | pattern never matches | `mustFlag[0]`, `mustFlag[1]`, `mustFlag[4]` | ENFORCED |
| | per-occurrence loop (:64) | first finding only | `mustFlag[7]` | ENFORCED |
| | `offset < 0` fallback (:70) | neuter it | — | **UNREACHED ARM** — no fixture produces a non-verbatim identity; §4.1 owes a fixture or a declared limit |
| `db-enum-from-tuple` | `isFrozen(terminal)` (:104) | accept any array | `mustFlag[7]`, `mustFlag[9]` | ENFORCED |
| | `terminal.getSourceFile() === home` (:104) | accept any file's tuple | `mustFlag[6]` | ENFORCED |
| | `fromCanonicalModule(value)` (:96-98) | drop the canonical-origin arm | `mustPass[0..2]`, `mustPass[4]`, `mustPass[6]` (5 rows) | ENFORCED |
| | `elementsProven(...)` (:107) | trust the outer `as const` | `mustFlag[8]`, `mustFlag[9]` | ENFORCED |
| | `named &&` (:146) | resolve any authored node | — | **MUTUALLY REDUNDANT** — a non-name node reaches `resolveStableExpression`, which refuses it, so both paths land on `unreadable`. No falsifier built (see "did NOT cover") |
| `nullable-column-inequality` | guarded-column `continue` (:262-264) | ignore guards | `mustFlag[5]`, `mustPass[1..3]` | ENFORCED |
| | `moduleSpecifier.startsWith(DRIZZLE_MODULE)` (:112) | any module's `ne` | `mustPass[6]` — **exactly the row its own `why` names** | ENFORCED |
| | `COMBINATOR_FNS.has(name)` (:157) | any resolved call combines | — | **MUTUALLY REDUNDANT** — cluster cut below |
| | the `spellings` prefilter (:225) | visit every CallExpression | — | **DECLARED NON-NARROWING, VERIFIED HONEST.** `:71-83` calls it a per-file candidate index for performance and says the full origin resolution "still runs". Removing it changed no proof row, which is what that claim has to mean |
| `contract-banned-shapes` | interface `node.getName() !== shape.typeName` (:159) | judge every interface | `mustFlag[6]`, `mustPass[2]` | ENFORCED |
| | variable `node.getName() !== shape.schemaVar` (:184) | judge every variable | `mustFlag[2..3]`, `mustPass[3..4]` | ENFORCED |
| | `callee.receiver === null ? current : …` (:82) | treat a rootless chain as empty | `mustFlag[5]` | ENFORCED |
| | `paths.includes(home)` branch (:214) | force the anchor arm | — | **NON-DISCRIMINATING ROW** — D2 |

**Totals: 24 cuts (+1 cluster cut) → 15 ENFORCED · 4 genuinely UNENFORCED (17%) · 2 MUTUALLY REDUNDANT ·
1 UNREACHED ARM · 1 NON-DISCRIMINATING ROW · 1 declared non-narrowing verified honest · 1 NOT EVALUATED.**

### The MUTUAL-REDUNDANCY cluster cut (wave 2's detector, reproduced)

`nullable-column-inequality`'s `combinatorChain` (`:153-160`) tests two things in one `if`:

```ts
const name = resolved.get(identity) ?? null;
if (name !== null && COMBINATOR_FNS.has(name)) { chain.push(identity); }
```

`COMBINATOR_FNS.has(name)` alone cuts CLEAN, and the naive reading would be "the co-location ruling is
unenforced" — which would be badly wrong, because `mustFlag[7]` exists precisely to pin it:

> "CO-LOCATION IS NOT GUARDING: the guard and the predicate share a statement AND an argument list, but
> `choose` is not a boolean combinator…"

The fixture's `choose` is a LOCAL function, so `drizzleCallee` returns `null` and the FIRST half refuses it —
no fixture built on a non-drizzle wrapper can ever exercise the second. **Cutting BOTH together kills the
row:**

```
✗ nullable-column-inequality · mustFlag[7] · CO-LOCATION IS NOT GUARDING …
    expected at least one effective finding but got 0
```

**The cluster IS enforced; neither half is individually pinnable; the fix is not two `mustPass` rows.** The
residual gap is narrow and real: a *drizzle* call that is not `and`/`or` and encloses both the guard and the
predicate (`eq(isNull(c), ne(c, "x"))` is the constructible shape) is unpinned. That is one `mustFlag` row,
not a redesign.

### The falsifier table (§4.1's real receipt)

Every UNENFORCED verdict is backed by a row run in BOTH arms: planted on UNMODIFIED source it must PASS, and
with the fence cut it must go RED.

| # | Falsifier | Unmodified | Fence cut |
| -: | - | - | - |
| 1 | `fk-columns-indexed` — an FK column carrying an inline `.unique()` and leading no extras index (`pins.chatId`) | **PASS** | **RED** — "a foreign-key column does not LEAD any B-tree index" |
| 2 | `schema-branding` — a column literally named `id` that is NOT the primary key and carries no brand (`rows.id`, alongside a `slug` PK) | **PASS** | **RED** — "rows.id is a primary-key entity id without a canonical @orb/kit/ids brand" |
| 3 | `schema-branding` — a BRANDED child (`pins.chatSlug`, `$type<ChatId>()`) referencing an UNBRANDED parent (`chats.slug`) | **PASS** | **RED** — "pins.chatSlug carries id brand "chat", but its parent chats.slug carries null" |
| 4 | `schema-branding` — an unbranded primary key whose property name is not `id` (`rows.slug`) | **PASS** | **RED** — "rows.slug is a primary-key entity id without a canonical @orb/kit/ids brand" |

Falsifier 2's red message is itself the tell for D8: the string says "primary-key entity id" about a column
that is not a primary key.

## MANDATORY SWEEP B — the expectation rows (#1968)

`expectationFailure` read off the source: `count` compares `findings.length` EXACTLY
(`ops/policy-conformance.ts:194-196`); `line`/`token`/`messageIncludes` run through `findings.some(...)`
(`:203-213`), so any single match satisfies the row.

**53 `mustFlag` rows across the nine subjects. 52 carry a `count`** — verified mechanically per module
(3 · 10 · 9 · 5 · 9 · 8 · 5 · 2 · 2). The one exception is D4, whose count I derived as **27**.

| Module · rows | Declared `expect` | `token` verdict | `messageIncludes` verdict |
| - | - | - | - |
| `schema-branding` mF0..mF2 (3) | `{count, token, messageIncludes}` ×3 | the column PROPERTY name — per-finding | **PROVEN discriminating** — three distinct per-finding messages, the corpus's correct shape (wave 1 said so; re-verified) |
| `db-enum-from-tuple` mF0..mF9 (10) | `{count}` ×2, `{count, messageIncludes}` ×8 | not used — the `why` never claims WHICH node beyond the count | **PROVEN discriminating** — two messages (`MESSAGE` vs `UNREADABLE(column)`) |
| `nullable-column-inequality` mF0..mF8 (9) | `{count}` ×2, `{count, token}` ×7 | the operand SOURCE TEXT (`characters.avatarAssetId`) — per-finding, and it is also the waiver position | N/A — one policy-level message; correctly NOT used |
| `ownerid-registry` mF0..mF4 (5) | `{count, token, messageIncludes}` ×2, `{count, messageIncludes}` ×2, `{messageIncludes}` ×1 | `ownerId` | **PROVEN discriminating** — `MESSAGE` vs `staleMessage(table)` |
| `schema-banned-shapes` mF0..mF8 (9) | `{count, token, messageIncludes}` ×8, `{count}` ×1 | the declared identity (property or table declaration name) — per-finding | **PROVEN discriminating** — the D-cite, per-row from `bannedMessage` |
| `contract-banned-shapes` mF0..mF7 (8) | `{count, token, messageIncludes}` ×2, `{count, messageIncludes}` ×6 | `kind` / `appSettingsSchema` | **PROVEN discriminating for 5 of 6** — the sixth is D2 |
| `fk-columns-indexed` mF0..mF4 (5) | `{count, token}` ×5 | the column property name — per-finding | N/A — one message |
| `fk-ondelete-stated` mF0..mF1 (2) | `{count, token}` ×2 | `chatId` | N/A — one message |
| `table-explicit-primary-key` mF0..mF1 (2) | `{count, token}` ×2 | the table declaration name | N/A — one message |

### The transplant round — six run, six FAILED, zero tautologies

Each row's sole message discriminator moved onto a sibling arm's text. A discriminator that is real must
REFUSE the sibling's string:

```
✗ schema-branding · mustFlag[1]         "carries no canonical"  → "but its parent"
✗ db-enum-from-tuple · mustFlag[0]      (none)                  → "CANNOT be established"   [the inline arm, given the unreadable arm's text]
✗ schema-banned-shapes · mustFlag[2]    "D18"                   → "D26"
✗ contract-banned-shapes · mustFlag[0]  "D60"                   → "D33"
✗ contract-banned-shapes · mustFlag[6]  "SILENT NO-OP"          → "not in this policy's population"
✗ ownerid-registry · mustFlag[0]        "D23"                   → "classifies nothing"
```

All six produced `expected one effective finding matching messageIncludes=… but no single finding matched`.
**No tautologies.** The `db-enum-from-tuple` transplant is the sharpest: it proves the module's two messages
are genuinely disjoint at the arm boundary, which is what makes the eight identity-counterfactual rows'
`"CANNOT be established"` a real pin rather than a restatement of "something flagged".

Note that `contract-banned-shapes` mF6 appears in BOTH sweeps and the two receipts are consistent, not
contradictory: the string `"not in this policy's population"` is genuinely absent from `missingSubject`
(this transplant), while `"SILENT NO-OP"` is present in BOTH messages (the D2 cut). The row's discriminator
points the wrong way.

### §4.2 positive identity arms — three ordinary policies, three arms present

Six of the nine are `authority: "hard"` (`db-enum-from-tuple`, `ownerid-registry`, `schema-banned-shapes`,
`contract-banned-shapes`, `fk-columns-indexed`, `table-explicit-primary-key`), and §4.4 gives a hard policy no
waiver arm — correctly, since a ledger verdict's escape is contesting the D-cite. The three ORDINARY policies
each carry the in-module `mustPass` shape §4.2 sanctions:

- `schema-branding` `mustPass[2]` — `// @orb-waive schema-branding(id): this natural identity is deliberately plain; ends if the table becomes an entity FK parent.`
- `fk-ondelete-stated` `mustPass[2]` — `@orb-waive fk-ondelete-stated(chatId)`, with the best position `why` in the family
- `nullable-column-inequality` `mustPass[4]` — `@orb-waive nullable-column-inequality(characters.avatarAssetId)`, naming the live `discovery/persistence/embed-store-reads.ts` site

**I did NOT run the dead-position control** on these three (see "did NOT cover"). Wave 2 ran seven; this is
the one place my method is weaker than the wave I copied.

## PRISTINE per module — nine verdict blocks, seven criteria each

Legend: **P** pass · **F** fail · **N/A** does not bind · **NE** not evaluated.

### 1. `db-enum-from-tuple` — REFUTED (minor — criterion 5 only)

1. **P** — `facts: [drizzleSchemaFact]` read unconditionally; `resources: []` explicit; no `ctx.checker()`, no
   `getType()`, no `ctx.relativePath` call site at all. `execution: "entire-population"` honest (the fact is
   the denominator). `analysis: "types"` — see the open question.
2. **P** — two messages, each true of what it anchors: the inline arm says the config IS an array literal; the
   unreadable arm says the derive claim "CANNOT be established" and explains why in the message body.
   **PROVEN to discriminate.**
3. **N/A** — `authority: "hard"`; the `fix` correctly names the code fix (reference a named tuple) and gives
   both sanctioned forms.
4. **P** — family `drizzle-schema`; the shared reader is named in prose ("The shared Drizzle fact owns builder
   identity") though not by module path.
5. **F** — no POPULATION PORT line and no module-path family line (D1). The header is otherwise the second
   best in the family: it states the three arms, the no-silent-skip posture, and carries a MARKER CENSUS
   ("zero live `@orb-gate-ignore db-enum-from-tuple` markers exist on the tree (rg, 2026-09-05, with a
   positive control proving the search reached packages/db)") — **which I re-derived and confirmed: the only
   two hits repo-wide are this comment and a 2026-09-02 review.** Roster row `:193` is accurate.
6. **P** — **4 of 4 narrowings ENFORCED**; 10 exact counts; the six identity counterfactuals (computed local /
   mutable `let` / same-name-wrong-origin / no-`as const` / composed-over-unproven / composed-over-widened)
   are the best-designed near-miss set I have audited, and each has its green twin. §4.5 refusal is proven
   family-centrally (`schema-fact-wave-1.test.ts:84-140`, three arms + a healthy control).
7. **P** — no private walk, cache, table, marker parser or fs read.

**THE MODULE TO HAND A CONVERSION LANE**, once its header gains a port line. Its only §5b failure is prose.

### 2. `nullable-column-inequality` — REFUTED (minor — criteria 3, 6)

1. **P** — `facts` / `resources` explicit; no checker, no `getType()`, no `ctx.relativePath`.
   `execution: "entire-population"` honest and load-bearing (the fact's `@db` population is a strict SUBSET of
   the policy's `@packages`+`@tests`, so the safe direction — a superset provider feeding a subset consumer,
   wave 2's structural trap, does NOT occur here). The per-file `spellings` index is state in `create`,
   correctly.
2. **P** — one long message, every clause of which is true of what it flags (nullable per the schema fact, no
   guard, the three-valued explanation). `token` is the operand source text and is per-finding.
3. **F (minor)** — the `fix` names `@orb-waive nullable-column-inequality(<the reported token>)` but does not
   say what the reported token IS (D5). Everything else about the `fix` is exemplary: it gives both sanctioned
   total forms and states the end condition a waiver owes.
4. **P** — `family: "drizzle-schema"`, the reader named in prose.
5. **P** — **the one header in the family that meets §5b.5's population-port bar**, with a measured delta and
   a named dropped path proven inert by a positive control. Roster row `:314` is accurate throughout
   (co-location ruling, `.primaryKey()`-is-NOT-NULL, both declared limits, the waiver grammar).
6. **F (minor)** — §4.2 arm present; 9 exact counts; the guard and module-origin fences ENFORCED, and
   `mustPass[6]`'s `why` states its own cut result ("deleting that comparison turns this row red") — **re-cut
   and verified TRUE**. The one gap is the MUTUALLY-REDUNDANT combinator cluster: enforced as a cluster, with
   a narrow unpinned residue (a drizzle non-combinator ancestor). The `spellings` prefilter is a declared
   non-narrowing and the declaration is HONEST.
7. **P**.

### 3. `contract-banned-shapes` — REFUTED (criteria 4, 5, 6)

1. **P** — the most minimal contract in the batch: `facts: []`, `resources: []`, `analysis: "syntax"`,
   population `@contracts`. Its one `ctx.relativePath` is over `ctx.files`. `execution: "entire-population"`
   honest (the §4.6 missing-subject arm is a whole-population verdict).
2. **P** — three messages (the ban, the unresolved-initializer refusal, the two missing-subject forms), each
   true of what it anchors; five of six discriminators PROVEN.
3. **N/A** — hard.
4. **F** — D7: a singleton `family` with no reason, while sharing `lib/ledger-banned-shapes.ts` with
   `schema-banned-shapes`.
5. **F** — D1 (no port/family line). The population narrowing IS documented, unusually well, **inline at the
   `population:` field** (`:145-154`) with a re-derived ast-grep census and a tsx positive control — it is
   just not in the header where §5b.5 puts it, and it is a narrowing rationale rather than a port claim
   against the legacy gate.
6. **F** — 8 exact counts; 3 of 3 real narrowings ENFORCED; the fail-closed unresolved arm proven.
   **D2: `mustFlag[6]` cannot discriminate the two §4.6 arms.** Also the family's ONE live real-tree gate
   finding: `diagnostic-legibility` flags `UNRESOLVED_MESSAGE` for not ENDING with a pointer (section above).
7. **P** — no walk, no fs read; the Zod chain reader is local but reads only the node it was handed and
   delegates value resolution to `lib/schema-fact-value.ts` + `lib/reference-fact.ts`.

### 4. `schema-banned-shapes` — REFUTED (criteria 5, 6)

1. **P** — minimal and honest; `execution: "entire-population"` correct (a table-scoped ban over the whole
   schema); no checker, no `getType()`, no `ctx.relativePath`.
2. **P** — per-finding `bannedMessage(label, cite)`, each carrying its own D-cite; PROVEN to discriminate
   (D18 → D26 transplant FAILED).
3. **N/A** — hard, deliberately and with the reason stated ("a ledger verdict's only escape is contesting the
   D-cite, never a site comment").
4. **P** — `family: "drizzle-schema"`; the row/message reader named by PATH (`../lib/ledger-banned-shapes.ts`).
5. **F** — D1. The header is good on the partition boundary (schema vs contract vs the D12 biome rule) and the
   roster row `:194` is accurate including its test citation, **which I verified exists**
   (`tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts`).
6. **F** — 9 exact counts; 4 of 4 real narrowings ENFORCED (table fence, pattern arm, per-occurrence loop, and
   the column-vs-pattern split); the SQL-name-not-binding-name counterfactual has its green twin in both
   directions. **D8: the `offset < 0` fallback is reached by no row.**
7. **P**.

### 5. `ownerid-registry` — REFUTED (criteria 5, 6)

1. **P** — `facts`/`resources` explicit, no checker, no `getType()`; the one `ctx.relativePath` is over
   `ctx.files`. `execution: "entire-population"` honest AND load-bearing — the stale arm is a whole-schema
   verdict, and the module says so.
2. **P** — two messages; `staleMessage(table)` is per-finding and names the row; PROVEN to discriminate.
3. **N/A** — hard, with the escape explicitly routed to re-deciding D23 rather than to a comment. The header
   states why the classification table is AUTHORITATIVE DATA and not a grant, citing the
   exception-authority-census, and that reasoning is correct.
4. **P** — `family: "drizzle-schema"`.
5. **F** — D1. The header is otherwise one of the two best in the family (the two-sided arm's design, the
   anchor choice and WHY it is not a row's own path, the 27-row count **which I re-derived as exactly 27**).
   Roster row `:182` is accurate.
6. **F** — **D4: the stale arm has no `count`** (derived 27). Both narrowings ENFORCED, the barrel-anchor cut
   reds all ten rows, and `mustPass[3]` is a properly written DECLARED LIMIT for the anchor.
7. **P**.

### 6. `fk-columns-indexed` — REFUTED (criteria 5, 6)

1. **P** — minimal; no checker, no `getType()`, no `ctx.relativePath`. `execution: "entire-population"`
   honest.
2. **P** — one message and it is precise about the actual SQL property ("does not LEAD any B-tree index …
   a column second in a composite cannot serve child lookup or parent-delete probes"), which the composite
   rows prove.
3. **N/A** — hard. The `fix` names the four counting shapes — and one of them is D3.
4. **P** — `family: "drizzle-schema"`.
5. **F** — D1, plus **D6: roster row `:102` cites `_shared/schema-read.ts` as the resolver**, which the
   converted module does not import (it reads `../lib/schema-fact.ts:6`). The row also carries tree numbers
   ("37 violations", "8 of the 37") that are conversion-era archaeology, correctly attributed but unaged.
6. **F** — 5 exact counts, each with a distinct token; the leading-term and `primaryKey` fences ENFORCED; the
   five near-misses (shorthand FK, imported columns object, indexed sibling, second-of-composite,
   composite-PK trailing term) are a strong set. **D3: the `.unique()` arm the `fix` names is UNENFORCED**,
   falsifier built. One `mustPass` closes it.
7. **P**.

### 7. `schema-branding` — REFUTED (criteria 5, 6)

1. **P** — `facts`/`resources` explicit; no checker, no `getType()` (brand identity is resolved by the
   provider, which is the whole point of the split); no `ctx.relativePath`.
   `execution: "entire-population"` honest and load-bearing — a cross-table FK brand comparison cannot compose
   over a subset, and the module builds a whole-schema column map (`:57`) to do it.
2. **P** — three per-finding messages, the only module in the family passing a per-finding `message` on every
   arm; PROVEN to discriminate. **Caveat carried to criterion 3:** the messages name SQL identities while the
   token is the property name.
3. **F (minor)** — the `fix` names `@orb-waive schema-branding(<column>)` but `<column>` does not resolve the
   SQL-vs-property ambiguity the messages create (D5).
4. **P** — `family: "drizzle-schema"`; "The provider owns type/symbol identity; this policy owns intent" is a
   good statement of the split, without the module path.
5. **F** — D1 (a TWO-LINE header: no port, no reader path, no legacy SHA) **and D6** — roster row `:100` is a
   bare label that also overstates the subject (`*Id` columns, where the module keys on the exact property
   `id`).
6. **F** — **three genuinely UNENFORCED narrowings, the most in the family**, each with a falsifier run in
   both arms (D3). 3 exact counts; §4.2 arm present; §4.5 proven centrally — and `schema-branding` is the
   module the central refusal pins DRIVE (`schema-fact-wave-1.test.ts:81`), which is a real strength.
7. **P**.

**Wave 1's "REFUTED minor" is too generous on today's evidence.** The three gaps are not stylistic: two of
them mean an unbranded entity id passes (a non-`id` primary key, and any `id` that is not the PK), which is
the policy's founding subject.

### 8. `fk-ondelete-stated` — REFUTED (criteria 3, 5)

1. **P** — minimal; no checker, no `getType()`, no `ctx.relativePath`.
2. **P** — one message, true of what it flags, and it names the SQLite behaviour that makes it a defect.
3. **F** — **D5: an ORDINARY policy whose `fix` names no waiver spelling at all.** The position statement
   exists in `mustPass[2]`'s `why` and is the best in the family; it belongs in the `fix`.
4. **P** — `family: "drizzle-schema"`; header names the shared fact's responsibilities precisely ("call
   identity, imported columns, aliases, and fail-closed option parsing").
5. **F** — D1. Roster row `:103`'s "fails CLOSED on a spread options object" clause is **NOT-EVALUATED** — it
   describes fact behaviour that no proof row in this module exercises.
6. **P** — 2 exact counts; 1 of 1 narrowing ENFORCED; §4.2 arm present; §4.5 proven centrally. The
   empty-options-object near-miss (`{}` with no `onDelete`) is exactly the right second row.
7. **P**.

### 9. `table-explicit-primary-key` — REFUTED (criterion 5)

1. **P** — the simplest contract in the family and correctly so.
2. **P** — one message; the rowid explanation is true and is the reason the rule exists.
3. **N/A** — hard.
4. **P** — `family: "drizzle-schema"`.
5. **F** — **a ONE-LINE header.** No family reader, no population port, no legacy SHA, no rationale for the
   `entire-population` execution or the `types` analysis. D1's worst instance. Roster row `:104` is accurate
   but carries an unaged tree number ("all 76 tables").
6. **P** — 2 exact counts with distinct tokens; 1 of 1 narrowing ENFORCED (the composite-PK arm, whose cut
   reds three `mustPass` rows); the namespace-import and alias rows prove builder identity survives both
   respellings; §4.5 proven centrally.
7. **P**.

This module is the family's cleanest PROOF SET and its worst DOCUMENT, which is the wave's finding in
miniature.

## What I did NOT cover

- **I did not run the §4.2 dead-position control** on the three ordinary policies. Wave 2 ran seven and that
  is what converted "my arm is green" into "my arm discriminates". The three arms are PRESENT and structurally
  correct, but **whether each binds is UNVERIFIED BY ME.** This is the clearest gap in my method and it is one
  probe round.
- **The `analysis: "types"` counterfactual was queued and not run** (see the open question). Eight modules
  declare a types plane they never use; I can neither file nor clear it.
- **I did not run the §4.6 conversion differential** for any subject. `drizzle-registry-conversion.test.ts`
  covers `domain-freshness-plane` and `lifecycle-portability`, neither of which is mine. Whether each of these
  nine populations is byte-identical to its legacy predecessor is UNVERIFIED except for
  `nullable-column-inequality`, whose header states a measured delta I took on trust rather than re-deriving.
- **I did not build a falsifier for `db-enum-from-tuple`'s `named &&` clause** — I classified it MUTUALLY
  REDUNDANT from the code path (both branches reach `unreadable`), which is reasoning, not a receipt.
- **`schema-branding`'s `parentIdentity?.kind !== "population-column"` was NOT cut** — it is a discriminated
  union narrowing that cannot be deleted, only written wrong.
- **The roster clause "fails CLOSED on a spread options object"** (`fk-ondelete-stated`, `:103`) is
  NOT-EVALUATED: I did not build the fixture.
- **I contaminated my FIRST `check:structure` run** by patching `table-explicit-primary-key.ts` while it was
  in flight, and I say so rather than quoting it. The run reported in "What I ran" is a SECOND run started
  after every probe was restored and the tree verified clean.
- **The box was not quiet.** Two sibling worktrees (`agent-ad385679eb04f3fda`, `agent-aa14fc12953cd9715`) were
  running their own `pnpm check:structure` concurrently with mine, confirmed by `/proc/<pid>/cwd`. That is
  contention, not a lying environment, and no probe in this audit showed a `STACK_TRACE_ERROR` or a 5,000 ms
  timeout — but the structure timing is not a clean-box number.
- **I did not run CT, e2e, biome or typecheck.** This lane modified no tracked code.
- `tests/tooling/check-gates.repo.int.test.ts` was not run — it is the orchestrator's and is not
  concurrency-safe with itself.

## Proposed memory lessons (the orchestrator owns the write)

**Index line:** `- [an assertion-function receipt helper makes ORDER uncheatable but not OPTIONAL](assertion-helper-fixes-order-not-adoption.md) — asserts-narrowing means a consumer cannot read .value first; it can still narrow by hand and file nothing`

Body: `recordReadySchemaFact` is `asserts fact is ReadySchemaFact<T>`, and `SchemaFact<T>` carries `value`
only on the `ready` arm, so a consumer physically cannot read the value before filing the census receipt —
the ORDER half of the #1966 guarantee is enforced by the type system across all 18 consumers. What the type
system does NOT enforce is ADOPTION: replacing the call with `if (fact.status !== "ready") { return; }` is
type-correct, compiles, and takes the policy from a loud `PASS TOOL ERROR [evaluate] drizzle schema fact
empty` to `0 failure(s) · exit 0` over an empty census — measured both arms on
`table-explicit-primary-key`. `policyReceiptFailures` (`lib/policy-pass.ts:701`) has no "policy produced no
semantic receipt" arm; its fact twin at `:648` does. It DOES refuse an unconsumed fact
(`declared facts were not consumed`), so the live hole is narrower than "declares and files nothing" — it is
"consumes, narrows by hand, files nothing". When auditing a fact family's receipt discipline, the question is
never "does the helper exist" but "does every consumer call it, and does any consumer have a reachable path
that returns before it" — one of the 18 does, and it files its own receipt with a hardcoded `members: 1`,
which satisfies `receiptFailures` (`count === 0` only) while measuring nothing.

**Index line:** `- [a family can be strong in PROOFS and empty in HEADERS, and the audit must say which](proof-strong-header-empty-family.md) — 9/9 headers with no FAMILY or POPULATION PORT line beside 52/53 exact counts and zero tautologies`

Body: The Drizzle-schema fact family inverts the wave-1/wave-2 failure profile. Its proof sets are the best in
the corpus — 52 of 53 `mustFlag` rows carry an exact `count`, all six `messageIncludes` discriminators survive
a sibling-arm transplant, 15 of 24 narrowings are ENFORCED with several `why` strings naming their own cut
result and verified true — while **zero of nine headers carry a `FAMILY` line, zero carry a `POPULATION PORT`
line, and zero cite a legacy SHA**; one module's entire header is a single sentence. §5b weights these
equally and it is right to: a lane told to "copy this module" copies the header's silence too, and cannot
answer "is this conversion's population the set the legacy gate walked?" for eight of the nine. So report the
two axes SEPARATELY and name the best instance of each — `nullable-column-inequality:42-53`, which states the
legacy `scanRoot`, the measured 6,113→6,112 delta and the one dropped path with a positive control, is the
§5b.5 standard the other eight owe, and it took one paragraph.

**Index line:** `- [canonicalPathResolver is the better answer to #1972 than §12.3's total idiom](canonical-path-resolver-beats-the-total-idiom.md) — derive the repo root ONCE from the population, then resolve any file by prefix; throws on outside-the-REPO, not outside-the-population`

Body: §12.3's fix for the `ctx.relativePath` escape is the total idiom
`canonical.sourceFile.getFilePath().replaceAll("\\","/")`, which yields an ABSOLUTE path and so cannot be
compared against population coordinates. `lib/schema-fact-value.ts:373-394` does better and should be the
exemplar: `canonicalPathResolver` takes the effective population once, derives the repository root by
asserting every absolute path ends with its own repo-relative identity (throwing if the population spans two
roots), and returns a resolver that slices the prefix off ANY source file. It throws only for a file outside
the REPOSITORY — never for one merely outside the policy's population — which is what lets the schema fact
name a foreign-key parent column in another package without asking the policy context anything. Measured
consequence: **0 of 9 modules in the Drizzle-schema family are in the #1972 class**, against 5 of 7 in the
registry/completeness family, and the difference is entirely this reader. Corollary for the safe direction of
a provider/consumer population mismatch: `nullable-column-inequality`'s policy population
(`@packages`+`@tests`) is a strict SUPERSET of `drizzleSchemaFact`'s (`@db`+`schema/**`), which is the SAFE
orientation — wave 2's structural trap was the inverse (a superset PROVIDER feeding a subset CONSUMER).

**Index line:** `- [an entire-population policy is DEFERRED under --scope, so a ctx.files anchor is not the §12.3 false clean](entire-population-defers-it-does-not-shrink.md) — policy-pass.ts:337; check execution before filing a ctx.files membership test as an anti-pattern`

Body: §12.3 bans substituting `ctx.files` membership for a home question because "`policy-pass.ts:316`
intersects `run.files` with a scoped run's requested paths, so that test reads silently clean under every
`--scope`/`--changed` run." `ownerid-registry:126-129` gates its whole stale arm on
`ctx.files.map(ctx.relativePath).includes("packages/db/src/schema/index.ts")` and looks exactly like that
anti-pattern. It is NOT, and the discriminator is one field: `policy-pass.ts:337` sets
`owner = { status: "not-applicable", reason: "entire-population policy deferred for a proper subset
selection" }` whenever an `execution: "entire-population"` policy's effective total is less than its declared
total. The policy either receives the WHOLE population or does not run at all, so a real-tree anchor test over
`ctx.files` is sound for that execution mode and only for it. Before filing a `ctx.files` membership test as a
defect, read the policy's `execution`.

## Issue summary for #1584

A fresh-context Opus verifier audited the nine-module Drizzle-schema fact family against §5b's seven criteria,
ran the §4.1 narrowing sweep (24 cuts plus one cluster cut across nine `cp`/`mv` probe rounds) and the #1968
expectation sweep (all 53 `mustFlag` rows), and **REFUTES all nine** — but with the INVERSE failure profile of
the first two waves, which is the finding the program should take away. **On proofs this family is the best
audited so far**: 52 of 53 `mustFlag` rows carry an exact `count`, all six `messageIncludes` discriminators
SURVIVE a sibling-arm transplant (zero tautologies), 15 of 24 narrowings are ENFORCED, several fence rows
state their own cut result and every such claim was re-cut and found TRUE, and **0 of 9 modules are in the
\#1972 `ctx.relativePath` class** — structurally, because `lib/schema-fact-value.ts:373-394`'s
`canonicalPathResolver` derives the repo root once from the population and resolves any file by prefix,
throwing only for a file outside the REPOSITORY rather than outside the population; that is a better answer
than §12.3's own total idiom and should become its exemplar. **On headers the family is the worst audited so
far**: ZERO of nine carry a `FAMILY` line, ZERO carry a `POPULATION PORT` line, ZERO cite a legacy SHA, and
`table-explicit-primary-key.ts`'s entire header is one sentence — the sole exception,
`nullable-column-inequality.ts:42-53`, is the §5b.5 standard (legacy `scanRoot`, a measured 6,113→6,112
population delta, the one dropped path proven inert by a positive control) and the other eight owe one
paragraph each. **The brief's sharpest item — #1966 — answers NO for this family and YES for the runtime.** I
re-derived all EIGHTEEN `drizzleSchemaFact` consumers: 18 of 18 route through `recordReadySchemaFact` and all
18 file the receipt BEFORE reading `fact.value`, which the type system makes uncheatable (the helper is
`asserts fact is ReadySchemaFact<T>` and `value` exists only on the `ready` arm). **But the escape compiles.**
Two-arm reproduction on `table-explicit-primary-key`: with one added `mustPass` whose fileset declares no
Drizzle table, unmodified source gives `PASS TOOL ERROR [evaluate] drizzle schema fact empty` (exit 2), and
replacing the call with `if (fact.status !== "ready") { return; }` gives `0 failure(s) · exit 0` — a CLEAN
verdict over an EMPTY census. One correction to the brief's framing: `policyReceiptFailures` DOES refuse an
*unconsumed* fact (`lib/policy-pass.ts:703`), so the live hole is "consumes, narrows by hand, files nothing",
not "declares and files nothing" — and the one documented departure, `freeze-provenance-write-pairing-health`'s
`empty` arm, files its own receipt with a hardcoded `members: 1` that satisfies `receiptFailures` (`count === 0`
only) while measuring nothing. **The fix belongs in `policyReceiptFailures`, not in a per-family convention.**
Defects filed: **four genuinely UNENFORCED narrowings (17%, each with a falsifier run in BOTH arms)** — three
in `schema-branding` (an `id` column that is not the PK; an unbranded PK not named `id`; a branded child
pointing at an unbranded parent — two of which mean an unbranded entity id passes, the policy's founding
subject) and one in `fk-columns-indexed` where **the module's own `fix` names the arm nothing proves** (the
inline `.unique()` exemption, which is genuinely not redundant with the leading-index test because
`.unique()` is a builder-chain operation and `table.indexes` is built only from the extras callback);
`contract-banned-shapes`'s `mustFlag[6]` **cannot discriminate the two §4.6 arms** because `missingHome`
embeds `missingSubject` verbatim, proven by forcing the branch and watching the row stay green;
`ownerid-registry`'s stale arm is the family's only `mustFlag` with no `count` (derived by planting
`count: 99`: **27**, exactly `OWNERID_CLASSIFICATIONS.length`, which I re-derived and which the header states
correctly); `fk-ondelete-stated` is ORDINARY with a `fix` naming NO waiver spelling (§5b.3), while its
`mustPass[2]` `why` carries the best position statement in the family — it is in the wrong field;
`contract-banned-shapes` declares a singleton `family` with no reason while sharing
`lib/ledger-banned-shapes.ts` with `schema-banned-shapes` (§5b.4, the wave-2 `message-kind` shape recurring);
and two roster rows are wrong — `fk-columns-indexed:102` cites the LEGACY `_shared/schema-read.ts` the
converted module does not import, and `schema-branding:100` is a bare pre-conversion label that also
OVERSTATES the subject ("`*Id` columns" where the module keys on the exact property `id`, which falsifier #4
proves by construction). Two more classifications worth the program's attention: **one MUTUALLY-REDUNDANT
cluster confirmed by cutting together** — `nullable-column-inequality`'s `name !== null` and
`COMBINATOR_FNS.has(name)` are individually uncuttable because the `choose` fixture is refused by the
drizzle-origin half first, and cutting BOTH kills `mustFlag[7]` — and **one declared non-narrowing verified
honest**: the module's per-file `spellings` index says it is a performance candidate filter and that full
origin resolution "still runs", and removing it changed no proof row, which is what that claim has to mean.
`check:policy-conformance` reproduced the brief's headline exactly (**167 · 1,667 · 0 failures · exit 0**) and
is back at it after all nine probe rounds; **`gate:contract` is 761 across 271 modules, UNCHANGED, with ZERO
findings for all nine subjects**; and I ran **`pnpm check:structure` once, alone, on the restored tree** —
**`0 alarm(s) · 0 tool error(s) · 0 withheld`**, `271/271 active gate(s)`, run COMPLETE, all nine subjects `✓`
at non-zero real-tree populations (`drizzle-schema: 1288 member(s)` over 30 schema sources;
`nullable-column-inequality` additionally shows `waived 1`, so its live waiver door is exercised), so
**nothing in this family is blinded or withheld today** and #1966 is fix-before-copy rather than fix-now. The
one live real-tree finding against any subject is `diagnostic-legibility` flagging
`contract-banned-shapes.ts:189`'s `UNRESOLVED_MESSAGE` for not ENDING with a doc/code pointer (1 of that
gate's 87 corpus-wide; the other eight subjects have zero). The scoped floor
(`schema-fact-wave-1` · `ledger-banned-shapes` ×2 · `verify/lib/schema-fact`) is **4 files / 25 tests PASSED,
exit 0, no type errors**. **`db-enum-from-tuple` is the module to hand a conversion lane** — 4 of 4 narrowings
enforced, 10 exact counts, six identity counterfactuals each with a green twin, a re-derived marker census
that is TRUE, and D1 (a missing port line) as its only §5b failure. Two disclosures the program should weigh
against this verdict: **I did not run the §4.2 dead-position control** on the three ordinary policies, so
their identity arms are present and structurally correct but UNVERIFIED BY ME, and **I did not settle whether
`analysis: "types"` is over-declared** on the eight modules that call neither `ctx.checker()` nor `getType()`
— `analysis` has exactly one runtime effect (gating `ctx.checker()`, `policy-pass-context.ts:243`) and does
not propagate to facts, so the counterfactual is one conformance run and it should be run before this family
is copied.
