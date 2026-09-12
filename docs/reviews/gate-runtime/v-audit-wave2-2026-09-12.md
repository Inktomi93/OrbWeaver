---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave2 — the registry/completeness family against §5b PRISTINE (#1584)

Read-only adversarial audit of the eight modules the orchestrator named as the registry/completeness family,
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven criteria
and §4's proof rules. Method, receipt style and per-module verdict-block format are copied from wave 1
([`v-exemplar-audit-2026-09-12.md`](v-exemplar-audit-2026-09-12.md)) so the two are comparable — with one
deliberate departure, described next.

## The departure: every clean cut is CLASSIFIED, not counted

A wave-1 sibling lane established mid-run that the §4.1 cut test has **two ways of reporting UNENFORCED when
nothing is wrong**, and that a bare unenforced COUNT cannot tell them apart. This audit adopts the correction
and reports three buckets instead of one number:

- **UNENFORCED** — genuinely unpinned. The receipt is a **built falsifier**: a row that PASSES on unmodified
  source and goes RED when the fence is cut. Nothing below is called UNENFORCED without that pair of runs.
- **MUTUALLY REDUNDANT** — a sibling fence catches the same subject, so neither cuts alone. Confirmed by
  cutting the cluster TOGETHER. The fix is not N `mustPass` rows.
- **WRONG-DIRECTION CUT** — the fence does not make the policy flag MORE; it prevents a FALSE CLEAN, or it is
  a type obligation, or its subject is owned elsewhere. A "flags more" cut cannot falsify it.

**This matters to the headline number.** My naive sweep said 12 of 30 (40%) — the same rate wave 1 reported.
After classification it is **5 of 30 genuinely unenforced (17%)**, each with a built falsifier. Wave 1's 40% is
unsplit and, on this evidence, likely OVERSTATES; I did not re-audit it.

Every number below came out of a run produced in this session, in an isolated worktree. The audit started at
`a9fe79c48`; `main` was merged twice mid-run (`8257071ee`, then the matchmedia/resource lanes), and **every
receipt was re-produced on the merged tree**. `git diff --stat <8257071ee> HEAD` over all eight subject files is
EMPTY, so the one long-running instrument (`check:structure`) still describes the modules as they stand. All
probes were `cp f f.w2bak` … `mv f.w2bak f` inside this worktree — never `git stash`/`checkout`/`restore` — and
`git status --short` was EMPTY after every one of the twelve probe rounds.

`check:policy-conformance` is at **167 final policies · 1,667 proof rows · 0 failures · exit 0** before and
after this audit and stays there through every defect below.

## Headline

**Seven of the eight are FINAL; the eighth is LEGACY and §5b does not bind it.** Of the seven, **five carry a
REPRODUCED tool-error defect** — the #1972 `ctx.relativePath` class, which is not merely latent: it is
constructible with an ordinary in-repo cross-package fixture, no `node_modules` required.

On every criterion wave 1 found rotten, this family is markedly better:

| Property | Wave 1 (10 exemplars) | Wave 2 (7 final modules) |
| - | -: | -: |
| `mustFlag` rows with no `count` | 2 of 33 | **0 of 45** |
| `messageIncludes` discriminators that are tautologies | 3 of 8 | **0 of 6** — all six sibling-arm transplants FAILED |
| §4.2 identity arms that discriminate | 4 of 4 in-module | **7 of 7** |
| §4.1 narrowings genuinely unenforced | 12 of 30 (40%, unsplit) | **5 of 30 (17%)**, each with a built falsifier |
| Modules with NO §4.5 refusal pin | 3 | **2** — and both denominators PROVEN sound by probe |
| Roster rows that are bare pre-conversion labels | 4 | **0** — but 5 carry STALE clauses, the inverse defect |
| A declared limit that is a claim about the LOADER | 1 (`no-raw-matchmedia`, false in three documents) | **0** — checked and clean, receipt below |

| # | Module | Verdict |
| -: | - | - |
| 1 | `chrome-registry-completeness` | **REFUTED** (criteria 1, 5, 6) — D1; one unenforced narrowing; roster clause "the exact `ChromeEntry` annotation head" refuted by the module's own shadow control |
| 2 | `section-registry-completeness` | **REFUTED — by D1 ALONE** (criterion 1). 4 of 4 narrowings enforced, header and roster row both accurate, identity arm discriminates. **The module to hand a conversion lane once D1 lands** |
| 3 | `modal-registry-completeness` | **REFUTED** (criteria 1, 5) — D1; roster clause "a planned modal wiring a real function `body`" names an arm the module cannot execute. 4 of 4 narrowings enforced |
| 4 | `config-group-completeness` | **REFUTED** (criteria 1, 5, 6) — D1; roster's `fileLoaded(compose/authed-app.tsx)` door does not exist in the module; no §4.5 pin for its three declared denominators |
| 5 | `warning-code-coverage` | **REFUTED** (criteria 1, 5, 6) — D1, and here the population mismatch is STRUCTURAL; two genuinely unenforced narrowings with built falsifiers; roster names the wrong shared reader |
| 6 | `message-kind-policy-coverage` | **REFUTED** (criteria 4, 5, 6) — NO family line and NO population-port line; a `mustPass` `why` claiming a narrowing the row does not prove; roster row describes three retired mechanisms. **Out of the D1 class.** Its three carrier fences are MUTUALLY REDUNDANT, not unenforced |
| 7 | `placeholder-copy-registry` | **REFUTED (minor — criterion 6 only)** — one genuinely unenforced narrowing, closed by one `mustPass`. **The only module with no `ctx.relativePath` call site at all**, so out of the D1 class by construction. Closest to copyable today |
| 8 | `home-tile-registry-completeness` | **NOT A SUBJECT — LEGACY.** `GateDescriptor` + `scopeSafety` + `run` + two direct walks; five `gate:contract` findings, all of them its. §5b does not bind an unconverted module (premise correction 1) |

## Premise corrections

1. **`home-tile-registry-completeness` is LEGACY, not final.** Re-derived against
   `pnpm check:policy-conformance` as the brief asked.
   `tooling/src/verify/gates/home-tile-registry-completeness.ts:147` is
   `export const gate: GateDescriptor = {`, not `defineGate`. Two independent receipts: `pnpm gate:contract`
   reports **five findings, all of them this module's** (`[descriptor-wrapper]`, `[legacy-field] scopeSafety`,
   `[legacy-field] run`, and two `[direct-walk]`s at `:135` and `:157`), and `check:structure` prints it with
   the LEGACY line shape (`✓ home-tile-registry-completeness · scanned 7412/7412 files`) rather than the final
   shape (`· final ordinary/error · population N source`). **I audited the other seven and report this one as
   out of scope.** It is a conversion candidate, not a defect.
2. **`message-kind-policy-coverage:202` no longer carries `ext: ["ts","tsx"]`** — removed on `main` by the
   \#1959 lane while this audit ran. Every line number here is post-merge; the absence is correct and is not
   filed.
3. **The #1972 class is now DOCUMENTED in the guide** (§12.3, `gate-runtime-standardization.md:722-735`,
   including the total house idiom and a census of "seven call sites in six modules, live once and latent six
   times"). My contribution is the REPRODUCTION: **all five of my modules' latent sites fire**, and without
   `node_modules`.

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline, at `a9fe79c48`) | `167 final policies · 1662 proof rows · 0 failure(s) · 105 grant rows · 0 invalid` — identical to the brief's headline, **exit 0** |
| `pnpm check:policy-conformance` (final, post-merge, after all twelve probe rounds) | `167 final policies · **1667** proof rows · 0 failure(s) · 105 grant rows · 0 invalid · 15812ms`, **exit 0** — restored (+5 rows are other lanes', landed by the two merges) |
| `pnpm gate:contract` (before and after) | `761 finding(s) across 271 gate module(s)`, exit 1. Total did NOT rise. **grep over the final log for all seven FINAL subject ids returns 0**; the only subject-named findings in the corpus are the legacy `home-tile-registry-completeness`'s five |
| **`pnpm check:structure`** (run ALONE, once — the instrument wave 1 skipped) | exit 1 (migration baseline). Tail: `final policies: 167 ran · raw 1322 = waived 1127 + granted 105 + effective 90 (90 error, 0 warning) · 0 alarm(s) · **0 tool error(s)** · **0 withheld**`; `single-pass: ran 271/271 active gate(s) … run COMPLETE`. **All eight subjects `✓` with non-zero real-tree populations** — chrome 1319 src / `CHROME_ZONES: 4` / `ChromeEntry: 7`; config-group 1319 / 4+1+13 across its three denominators; modal 1319 / 11; section 1319 / 10; placeholder 1319 / 10; message-kind 2917 / axis 3; warning-code 1598 / `CHAT_WARNING_CODES: 14` + `WARNING_CODES: 12`. **Nothing in this family is withheld or blinded on the real tree.** Run id `agent-a6d7dedbf06f8f479-3102881-2026-09-11T23-08-04-162Z` |
| `pnpm test:scoped tests/tooling/verify/gates/` | 57 files, **53 passed / 4 failed**; 6 failing tests, triaged below. **Both family tests covering my subjects PASSED**: `registry-family.test.ts` (10 tests, 15.7 s) and `message-kind-policy-coverage.test.ts` (3 tests, 1.5 s) |
| quiet re-run of the three timing-out files | **3/3 files PASS, exit 0** |
| 12 `cp`/`mv` probe rounds | 30 narrowing cuts · 2 cluster cuts · 1 direction control · 6 message transplants · 7 dead-position controls · 7 population-escape probes · 2 denominator probes · 6 built-falsifier rows run in BOTH arms. Each restored; `git status --short` EMPTY after every round |

`pnpm exec biome` / `pnpm typecheck` were **not** run: this lane wrote one markdown file and modified no tracked
code. `pnpm check:docs` was run scoped for that file.

## DEFECTS

### D1 — the #1972 `ctx.relativePath` escape FIRES in five of seven, and does not need `node_modules` (HIGH)

§12.3 (`gate-runtime-standardization.md:722-735`) states the class and calls six of its seven sites LATENT.
**They are not latent in the sense of "hard to reach."** Each fires on an ordinary in-repo cross-package
resolution — which is the exact shape this family exists to judge (`#944`: a definition whose initializer is
IMPORTED).

One probing `mustPass` row per module, resolving the subject to a sibling package inside the same repo. Run
post-merge; byte-identical to the pre-merge run:

```
✗ chrome-registry-completeness · mustPass[0]
    PASS TOOL ERROR [evaluate] source file is outside the effective population: packages/ui/src/chrome-entries.ts
✗ config-group-completeness · mustPass[0]
    PASS TOOL ERROR [evaluate] source file is outside the effective population: packages/ui/src/group-defs.ts
✗ modal-registry-completeness · mustPass[0]
    PASS TOOL ERROR [evaluate] source file is outside the effective population: packages/ui/src/modal-defs.ts
✗ section-registry-completeness · mustPass[0]
    PASS TOOL ERROR [evaluate] source file is outside the effective population: packages/ui/src/section-defs.ts
✗ warning-code-coverage · mustPass[0]
    PASS TOOL ERROR [evaluate] source file is outside the effective population: packages/client/src/state/codes.ts
```

Reproduction (chrome; the other three registry modules are the same shape with their own type):

```ts
"packages/ui/src/chrome-entries.ts": 'export const uiChrome = { id: "x", zone: "topbar.trail", label: "X", mobile: "sheet" };\n',
"packages/client/src/features/x/lib/x-chrome.tsx":
  'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\n' +
  'import { uiChrome } from "../../../../../ui/src/chrome-entries.ts";\n' +
  'export const xChrome: ChromeEntry = uiChrome;\n',
```

**Per module, whether the resolution can escape the population, and why** — the brief's central question:

| Module | Call site | Subject | Can it escape? |
| - | - | - | - |
| `chrome-registry-completeness` | `:73` `definition.declaration.getSourceFile()` | the fact's own declaration | **No.** `registryDefinitionFacts.chrome`'s population is `@client` (`lib/registry-fact.ts:326`), byte-identical to the policy's `:60`. A declaration the fact produced is always among the policy's files |
| | `:83` `object.getSourceFile()` | the RESOLVED object literal | **YES — reproduced.** The object is reached by cross-file resolution, which follows the import wherever it goes. `@client` is the population; `@ui`, `@kit`, `@contracts` and `node_modules` are each one import away |
| `section-registry-completeness` | `:109` declaration · `:168` visited `sourceFile` | | No / No (`:168` is a node the policy VISITED) |
| | `:119` `object.getSourceFile()` | resolved object | **YES — reproduced** |
| `modal-registry-completeness` | `:161` declaration · `:257` visited `sourceFile` | | No / No |
| | `:171` `object.getSourceFile()` | resolved object | **YES — reproduced** |
| `config-group-completeness` | `:133` declaration · `:223`, `:234` visited `sourceFile` | | No / No |
| | `:143` `object.getSourceFile()` | resolved object | **YES — reproduced** |
| `warning-code-coverage` | `:247` visited `sourceFile` | | No |
| | `:156` `fact.symbol.declaration.getSourceFile()`, via `ctx.relativePath` handed into `channelVocabulary` at `:226` | the tuple's declaring module | **YES — reproduced, and here the exposure is STRUCTURAL rather than incidental.** `tupleVocabularyFact`'s population is `{ in: ["@client","@server","@contracts"] }` (`lib/tuple-vocabulary-fact.ts:137`); the policy's is `{ in: ["@server","@contracts"] }` (`:215`). The fact's population is a strict SUPERSET of its consumer's, so a `WARNING_CODES` or `CHAT_WARNING_CODES` tuple resolving in `@client` is delivered to a policy that is not allowed to name it. **This is the one case needing no unusual import at all** — only a same-named exported tuple in the client tree |
| `message-kind-policy-coverage` | `:221` visited `sourceFile` | | **No.** Its one call site takes the file the visitor was handed |
| `placeholder-copy-registry` | — | — | **No call site at all.** Out of the class by construction |

**Fix, per §12.3:** the total house idiom `canonical.sourceFile.getFilePath().replaceAll("\\","/")` at the four
registry modules' `object.getSourceFile()` site. `warning-code-coverage` owes either the same idiom at `:156`
or an explicit reconciliation of the two populations, because a superset provider feeding a subset consumer is
a standing trap for every future `tupleVocabularyFact` consumer. §12.3 explicitly forbids substituting a
`ctx.files` membership test.

**Scope of my claim:** proven in the conformance runtime. On the real tree `check:structure` reports
`0 tool error(s) · 0 withheld`, so **no subject is blinded today** — which is what "latent" means, and exactly
why it should be fixed before the shape is copied 106 times.

### D2 — five of eight roster rows describe mechanisms the converted module does not implement (§5b.5, MEDIUM)

The guide's routing table makes `Core-Enforcement-Active-Gates.md` a COUPLED SITE. Wave 1's D9 found four rows
left as bare pre-conversion LABELS. This family has the inverse defect: every row is dense, and five are dense
about the LEGACY implementation. **A dense row that is wrong is worse than a bare one, because a lane reads it
as a specification.**

| Row | The claim | The tree |
| - | - | - |
| `:327` `message-kind-policy-coverage` | "`DEFERRED` is the bus-coverage idiom, self-cleaning both directions … Blindness tripwires: home gone (mode B, anchor-guarded), record/interface renamed away, orphan DEFERRED row" | **Three dead mechanisms.** The module header states "The legacy DEFERRED table is DELETED: it was empty, and its stale/orphan arms were structurally unprovable while it stayed empty" (`:13-14`) and "No real-tree anchor file decides which substrate a proof receives" (`:18`). There is no DEFERRED table, no orphan-row arm and no mode-B anchor guard |
| `:168` `placeholder-copy-registry` | "reconciled ACROSS the `features/*/lib/*-section.*` files" | **False.** The POPULATION PORT is an explicit INTENTIONAL WIDENING away from that filename filter to the whole `@client` tree by canonical TYPE (`:17-21`), precisely because "filtering by FILENAME here let an uncolocated section duplicate another's copy unseen" |
| `:168` (same row) | "a non-string-literal copy is a DECLARED LIMIT counted as a `non-literal-copy` skip rather than a silent `continue`" | **False.** It is now a fail-closed FINDING — `Unreadable copy` (`:118`), pinned by `mustFlag[3]`. `non-literal-copy` appears nowhere under `tooling/`; the only repo-wide hits are this roster row and a 2026-09-02 review |
| `:168` (same row) | "via the shared `registryDefinitionFact`" | Wrong symbol. `lib/registry-fact.ts:349` exports `registryDefinitionFacts` (plural, a per-kind map); the singular does not exist |
| `:165` `config-group-completeness` | "The orphan arm keys on the REAL door (`fileLoaded(compose/authed-app.tsx)`), never `scope.kind`, so the gate's own conformance mini-projects don't red it" | **False.** `fileLoaded` appears ZERO times in `config-group-completeness.ts`. The orphan arm runs unconditionally over the collection fact (`:246-253`); the mini-projects stay green because the `PRELUDE` registers `baseCollection`, not because of a door test |
| `:160` `chrome-registry-completeness` | "the SUBJECT is the exact `ChromeEntry` annotation head" | **Refuted by the module's own proof row.** The header says the subject is canonical TYPE identity "rather than by matching an annotation's head text" (`:15-17`), and `mustPass[5]` (THE SHADOW CONTROL) proves a local same-named `ChromeEntry` is NOT the subject — which a head-text match would have flagged |
| `:196` `warning-code-coverage` | "each channel's tuple is RESOLVED through `lib/tuple-read.ts` (#947)" | Wrong reader. The module imports `lib/tuple-vocabulary-fact.ts` (`:35`), which does not import `tuple-read.ts` either. `tuple-read.ts` still exists with five other consumers, so this is a mis-citation, not a dangling ref. The row also names none of the conversion's load-bearing facts: the per-channel HOME BINDING, the two disjoint emit scopes, the deleted DEFERRED tables, or the `@orb-waive` position |
| `:161` `modal-registry-completeness` | "the DECLARED-PLANNED honesty (… or a planned modal wiring a real function `body`)" | **Vacuous as written.** `plannedReason` (`:124-134`) reads `body.planned`; a `body: () => null` resolves to no object, returns `undefined`, and the modal classifies as `"real"`. A modal cannot be both planned and function-bodied under this reader, so the clause's second half names an arm that cannot execute. Contrast `section-registry-completeness`, which DOES implement the analogue (`wiresRealBody`, `:59-76`) and pins it with two `mustFlag` rows |

`:114` (`section`), `:163` (`home-tile`, correctly describing the legacy gate) and `:115`/`:166` (the two
split-out reviewed-grant policies) are accurate.

### D3 — `message-kind-policy-coverage`'s header records NO family and NO population port (§5b.4 + §5b.5, MEDIUM)

Every other module in this batch opens with a `FAMILY …` line naming the shared reader (module + function) and
a `POPULATION PORT: …` line stating byte-identical or the intentional correction. This one has neither:

```
grep -c 'FAMILY'          chrome 1 · section 1 · modal 1 · config-group 1 · warning-code 1 · placeholder 1 · message-kind 0
grep -c 'POPULATION PORT' chrome 1 · section 1 · modal 1 · config-group 1 · warning-code 1 · placeholder 1 · message-kind 0
```

Its descriptor declares `family: "message-kind-policy-coverage"` — a singleton — with no stated reason, which
is what §5b.4 forbids ("a declared singleton **with its reason**"). The contrast is in the same batch:
`warning-code-coverage:21-24` declares its singleton AND prices it ("`tupleVocabularyFact` is a shared
PRIMITIVE, not a family key — three unrelated families read it … and no sibling policy judges whether a warning
code is EMITTED, which is this policy's subject"). That paragraph is the standard; the same one is owed here.

The population port matters specifically here: the legacy descriptor's population is recorded nowhere, and the
module reaches into `@client` as well as `@server`/`@contracts` (`:202`) — a reader cannot tell whether that
third root is a port or a correction.

### D4 — a `mustPass` `why` names a narrowing the row does not prove (MEDIUM; the wave-1 D6 shape, recurring)

`message-kind-policy-coverage` `mustPass[3]`'s `why`:

> "the CONTRACTS-INTERNAL derivation is a carrier, not an enforcer: `SELF` alone would not cover the axis, and
> the behavior-tier read here is what does — **so this row pins that a home-file read is never counted as
> production coverage on its own**".

Cutting the narrowing it names — `references.filter(({ path }) => isReaderScope(path))` at `:139` — leaves the
whole module green, including this row. The row survives because its fixture ALSO carries a real behaviour-tier
read, so `memory` is covered either way. The claim is not pinnable by a `mustPass` at all: the property is "a
non-behaviour-tier read leaves the axis UNCOVERED", which is a `mustFlag`. **I built it** (see the falsifier
table): a second `@contracts` file importing the record and reading the axis. It PASSES on unmodified source
and goes RED the moment the fence is cut.

### D5 — five narrowings are genuinely UNENFORCED, each with a built falsifier (MEDIUM)

Down from a naive twelve. The full classification is in Sweep A; the five are chrome's unreadable-id gate,
warning-code's chat-emitter channel gate and pushed-record `message` requirement, message-kind's reader-scope
fence (D4), and placeholder's pair-key description half. **Each is closed by one row**, and I have run the row
in both arms.

The distribution is the finding: `section` is 4-of-4 and `modal` 4-of-4 enforced, while `warning-code` is 3-of-5
and `message-kind` 1-of-4-distinct. **The two clean modules are the two that write their fence rows with an
explicit "deleting X REDS this row" `why` — and every one of those claims was re-cut and found TRUE.**

### D6 — two modules' declared denominators are SOUND but UNPINNED (§4.5, LOW)

`tests/tooling/verify/gates/registry-family.test.ts` holds real `runPolicyPass` refusal pins for `chrome`
(`:242`, the zone vocabulary stops resolving), `modal` + `section` (`:134`, one kind's blind provider) and
`warning-code` (`:197-228`, three arms — declared-outside-home / absent / empty — plus the `:230` positive
control proving the withholding is the rebinding and not the fixture). `message-kind-policy-coverage.test.ts`
holds three more. **`config-group-completeness` and `placeholder-copy-registry` have none.**

That matters most for `config-group`, whose header declares "THREE DENOMINATORS, all declared and never summed:
the group definitions, the collection bodies, and the config content host itself — **the last one so a renamed
host cannot silently retire its import arm**" (`:16-17`). Nothing pins it. I probed both:

```
✗ config-group-completeness · mustPass[0] · W2 PROBE: the config CONTENT HOST is renamed …
    PASS TOOL ERROR [receipt] policy receipt refused: population "config content host" resolved zero members
✗ placeholder-copy-registry · mustPass[0] · W2 PROBE: no SectionDefinition exists at all …
    PASS TOOL ERROR [receipt] policy receipt refused: population "SectionDefinition" resolved zero members
```

**Both mechanisms WORK.** These are missing pins, not broken guards — but §4.5's whole point is that "a clean
zero from a detector that might be blind is not evidence," and the two probes above are two `runPolicyPass`
pins somebody should have committed. `warning-code-coverage`'s three-arm `test.each` at `:197` is the shape.

### Checked and CLEAN — no loader-property limit in this batch

A sibling lane established that `no-raw-matchmedia`'s declared limit was a claim about the LOADER's `lib`
(`_shared/ts-workspace.ts:62` constructs `new Project` with no `compilerOptions`, so the ts-morph default lib —
which includes DOM — applies), and that such a claim is unpinnable by a `mode: "types"` proof row at all. **I
checked all eight subjects for that shape and found none.** The nearest thing is
`chrome-registry-completeness:15-17` ("a `ChromeEntry[]` annotation … resolves to the Array symbol, not to the
canonical entry type"), which is a CHECKER/type-resolution property rather than a `lib` property — `Array` is
present under every `lib` setting in the repo — and it is pinned by a real row (`mustPass[3]`, THE ASSEMBLER
BOUNDARY), which I verified bites. No module in this family asserts that the analysis program cannot see a
global, a DOM declaration or an ambient type.

## MANDATORY SWEEP A — the §4.1 narrowing cut table, CLASSIFIED

Method, per §4.1: `cp` the module, cut the narrowing, run every declared row through the production conformance
door, `mv` back. **Per the mid-run correction, a clean cut is not a verdict** — it is routed into one of three
buckets, and an UNENFORCED verdict is issued only with a falsifier run in both arms.

| Module | Narrowing (`path:line`) | Cut | Row that died | Verdict |
| - | - | - | - | - |
| `chrome` | rail-only mobile fence `zone.value.startsWith(RAIL_PREFIX)` (:116) | require `mobile` on every zone | `mustFlag[1]`, `mustPass[2..5]` | ENFORCED |
| | the unreadable-id gate `&& claimId(…)` (:134) | run `judgeZone` regardless | — | **UNENFORCED** — falsifier built |
| | `population: "@client"` (:60) | widen to `+@server` | — | **WRONG-DIRECTION** — see the note below |
| | zone membership `!zones.has(…)` (:112) — a POSITIVE, control | make it unreachable | `mustFlag[2]` | control bites |
| `section` | `startsWith(ROUTES)` (:168) | drop it | `mustPass[5]` — **exactly the row its own `why` names** | ENFORCED |
| | attribute-name fence `=== GOD_MAP_PROP` (:80) | bare `isJsxAttribute` | `mustPass[6]` — **as its `why` names** | ENFORCED |
| | god-map object-literal requirement (:88) | any initializer expression | `mustPass[4]` | ENFORCED |
| | `kind.value !== CONTEXT_NONE` (:75) | any resolved context kind | `mustFlag[1]` + `mustPass[0]` + `mustPass[7]` | ENFORCED |
| `modal` | `startsWith(ROUTES)` (:257) | drop it | `mustPass[7]` — **as its `why` names** | ENFORCED |
| | attribute-name fence `=== GOD_MAP_PROP` (:112) | bare `isJsxAttribute` | `mustPass[8]` — **as its `why` names** | ENFORCED |
| | singleton scope `placement !== SINGLETON_PLACEMENT` (:195) | every placement a singleton | `mustFlag[5]` | ENFORCED |
| | planned-exempt gate `judgePlanned(…) === "real"` (:237) | judge planned surface modals too | `mustFlag[3]` + `mustPass[1]` + `mustPass[9]` | ENFORCED |
| | the opener-name PREFILTER `openerNames.has(name)` (:249) | accept every call | — | **NOT A NARROWING — and the header SAYS SO.** `:14-16` claims "removing the prefilter changes no proof row, which is exactly what 'candidate filter, not a narrowing' has to mean." **Verified TRUE** |
| `config-group` | HOST fence in the import visitor (:223) | any file's imports | every row (8 `mustFlag` + 5 `mustPass`) | ENFORCED |
| | specifier fence `FEATURE_DOOR \|\| ESCAPING_RELATIVE` (:227) | any non-empty specifier | `mustPass[2]` | ENFORCED |
| | `ESCAPING_RELATIVE = "../../"` two-hop (:48) | one hop `"../"` | `mustPass[2]` — **as its `why` names** | ENFORCED |
| | importFile-is-declared gate (:158) | judge `importFile` always | every row | ENFORCED |
| | `canonical.kind !== "project"` (:104) | drop it | — | **WRONG-DIRECTION — and it is a TYPE obligation, not a fence.** `origin.value.canonical` is a discriminated union carrying `sourceFile`/`exportedName` only on the `project` arm, so the test cannot be deleted, only written correctly (§12.3's `ResourceLoad` rule, same shape). Cutting it makes the policy flag LESS, and a non-project canonical is unconstructible in an in-memory project with no `node_modules` |
| `warning-code` | home fence `candidate.path !== channel.home` (:181) | drop it | `mustFlag[5]` — **as its `why` names** | ENFORCED |
| | emit-scope fence `startsWith(channel.emitScope)` (:181) | drop it | `mustFlag[6]` — **as its `why` names** | ENFORCED |
| | canonical mapper binding `getName() === CHAT_MAPPER` (:148) | any function's returns | `mustFlag[4]` | ENFORCED |
| | per-channel chat-emitter admission `channel.chat &&` (:127) | both channels admit `emit`/`emitQuiet` | — | **UNENFORCED** — falsifier built |
| | a pushed record must carry `message` (:116) | drop it | — | **UNENFORCED** — falsifier built (a "flags LESS" fence: it prevents a false CLEAN, so the falsifier is a row the cut turns GREEN) |
| | vocabulary HOME BINDING `declared === channel.home` (:157) | adopt any same-named tuple | — | **PINNED ELSEWHERE, not a gap** — `registry-family.test.ts:197-228` ("declared outside its home"), the legitimate §4.5 home for it |
| `message-kind` | single-arm exemption `axis.singleArm \|\|` (:236) | demand a reader for literal axes | `mustPass[1]` | ENFORCED |
| | reader-scope fence in `directAxes` (:139) | count non-behaviour-tier reads as coverage | — | **UNENFORCED** — falsifier built on the second attempt (see below); D4 |
| | `homeCarriers` `path === HOME` (:122) · `enclosingCarrier` `isExported()` (:105) · `carriedAxes` `importedNames.has(carrier)` (:188) | individually | — | **MUTUALLY REDUNDANT.** Cut TOGETHER they kill `mustFlag[2]` (the local-shadow row): with all three gone, the local `MESSAGE_KIND_POLICY` in the server fixture becomes a "home carrier" named `p` and covers `prompt`. The cluster IS enforced; none of the three is individually pinnable, and the fix is **not** three `mustPass` rows |
| `placeholder` | the absent arm `copy.kind === "absent" → return` (:114) | report it | `mustPass[2]` | ENFORCED |
| | pair key is `(title, description)` (:98) | key on `title` alone | — | **UNENFORCED** — falsifier built |
| | `population: "@client"` (:81) | widen to `+@server` | — | **WRONG-DIRECTION** — see below |

**Totals: 30 cut → 18 ENFORCED in-module · 5 genuinely UNENFORCED (17%) · 3 MUTUALLY REDUNDANT (enforced as a
cluster) · 3 WRONG-DIRECTION · 1 pinned in the family test.** Plus one declared non-narrowing verified honest
(modal's opener prefilter) and one positive-arm control that bit.

### The falsifier table (§4.1's real receipt)

Every UNENFORCED verdict above is backed by a row run in BOTH arms: planted on UNMODIFIED source it must PASS
(the fence works and the row is correct), and with the fence cut it must go RED.

| Falsifier | Unmodified | Fence cut |
| - | - | - |
| `chrome` — an unreadable id (`id: computeId()`) on a `rail.nav` widget with no `mobile`; `{count: 1, token: "railChrome", messageIncludes: "Unreadable id"}` | PASS | **RED** (count 1 → 2) |
| `warning-code` — a chat-bus `emit({type:"warning", code:"provider_ok"})` sited INSIDE `packages/server/src/infra/providers/`; `{count: 1, token: '"provider_ok"'}` | PASS | **RED** (the code becomes "covered", 1 → 0 findings) |
| `warning-code` — `warnings.push({ code: "provider_ok" })` with NO `message`; `{count: 1, token: '"provider_ok"'}` | PASS | **RED** (1 → 0) |
| `placeholder` — two sections sharing a TITLE with distinct descriptions (a `mustPass`) | PASS | **RED** (they collide on a title-only key) |
| `message-kind` v1 — a HOME-file `export const SELF = MESSAGE_KIND_POLICY.standard.memory;` as the only read | PASS | **still PASS — the falsifier was WRONG** |
| `message-kind` v2 — a SECOND `@contracts` file importing the record and reading the axis | PASS | **RED** (1 → 0) |

**The v1/v2 pair is the mid-run correction proving itself on my own work.** My first message-kind falsifier did
not flip, and the naive reading would have been "the fence is dead after all." It is not: a SECOND fence,
`isCanonicalRecordReference` (`:109-112`), refuses a same-file reference outright, so no HOME-file fixture can
ever exercise `isReaderScope`. The two are mutually redundant *for that subject*. `isReaderScope` has its own
non-redundant subject — a `@contracts` file that is inside the population but outside
`packages/{server,client}/src` — and v2 is it.

### Why the two `population:` cuts are WRONG-DIRECTION, with a receipt

For the five registry modules the SUBJECT comes from `registryDefinitionFacts.<kind>`, whose own population
(`lib/registry-fact.ts:326`) owns the denominator. Widening the POLICY's population adds visitor files, not
subjects, so a "flags more" cut structurally cannot falsify it. The field is nonetheless LIVE — the control is
the NARROW direction. Narrowing chrome's population to
`{ in: ["@client"], under: ["packages/client/src/state/**"] }` reds **all twelve** of its rows:

```
✗ chrome-registry-completeness · mustFlag[0..4] and mustPass[0..6]   (12 rows)
```

This is also the mechanism behind D1: because the policy's population is NARROWER than the resolver's reach,
and `ctx.relativePath` is partial over the policy's population, the policy can be handed a node it is not
allowed to name.

## MANDATORY SWEEP B — the expectation rows (#1968)

`expectationFailure` read off the source: `count` compares `findings.length` EXACTLY
(`ops/policy-conformance.ts:194-196`); `line`/`token`/`messageIncludes` run through `findings.some(...)`
(`:203-213`), so any one match satisfies the row.

**45 `mustFlag` rows across the seven final subjects. EVERY ONE carries a `count`** — verified mechanically
(`grep -n 'expect: {' <module> | grep -v 'count:'` returns nothing in all seven, against per-module totals of
5 · 8 · 9 · 7 · 3 · 7 · 6). Wave 1 found two rows with no `count`; this family has zero, so no `count: 99`
derivation was needed: every declared count is exact and green.

| Module · rows | Declared `expect` | `token` verdict | `messageIncludes` verdict |
| - | - | - | - |
| `chrome` mF0..mF4 (5) | `{count, token, messageIncludes}` ×5 | the DECLARED NAME (`xChrome`/`bChrome`/`railChrome`) — per-finding | **PROVEN discriminating** |
| `section` mF0..mF6 (7) | `{count, token, messageIncludes}` ×7 | declared name, plus `sections` on the god-map arm — per-finding | **PROVEN discriminating** |
| `modal` mF0..mF8 (9) | `{count, token, messageIncludes}` ×9 | declared name / `modals` — per-finding | **PROVEN discriminating** |
| `config-group` mF0..mF7 (8) | `{count, token, messageIncludes}` ×8 | declared name / the `import` keyword — per-finding | **PROVEN discriminating** |
| `warning-code` mF0..mF6 (7) | `{count, token, messageIncludes}` ×7 | the TUPLE MEMBER literal WITH quotes (`"never_emitted"`) — per-finding | carries the member name (`Member: "never_emitted"`) — per-finding by construction |
| `message-kind` mF0..mF2 (3) | `{count, token}` ×3, mF0 adds `messageIncludes` | the AXIS NAME (`memory`/`wire`/`prompt`) — per-finding | **PROVEN discriminating** |
| `placeholder` mF0..mF5 (6) | `{count, token, messageIncludes}` ×6 | declared name — per-finding | **PROVEN discriminating** |

**The transplant round.** Each module emits from ONE `report.node` call site but composes
`` `${MESSAGE} ${detail}` `` with a per-arm detail, so wave 1's D3 sibling-arm risk is live in principle. I
moved each row's sole message discriminator onto a sibling arm's text. **All six FAILED** — every discriminator
is real:

```
✗ chrome-registry-completeness · mustFlag[0]    "Not co-located"            → "Duplicate id"
✗ section-registry-completeness · mustFlag[1]   "Empty planned reason"      → "Not co-located"
✗ modal-registry-completeness · mustFlag[4]     "Duplicate singleton …"     → "Duplicate id"
✗ config-group-completeness · mustFlag[3]       "lifecycle is not data"     → "Orphan collection body"
✗ placeholder-copy-registry · mustFlag[3]       "Unreadable copy"           → "Unreadable definition"
✗ message-kind-policy-coverage · mustFlag[0]    "declared on CoreMessageKindPolicy" → "declared on MessageKindPolicy"
```

The last is the sharpest control in the set: `"declared on MessageKindPolicy"` is NOT a substring of
`"declared on CoreMessageKindPolicy"`, and the row correctly refuses it. **No tautologies found** — the
criterion wave 1 failed worst (three of eight), passed outright here, because the per-arm detail is COMPOSED
rather than the policy-level `message` being reused.

### §4.2 positive identity arms — all SEVEN discriminate

Flipping each arm's marker position to a dead token in a `cp`-backed copy:

```
✗ chrome-registry-completeness · mustPass[6]
    AUTHORITY ALARM [ordinary-waiver] … packages/client/src/features/x/lib/rail-chrome.tsx:2:1 names a dead position
✗ section-registry-completeness · mustPass[7]      … x-section.ts:2:1 names a dead position
✗ modal-registry-completeness · mustPass[9]        … x-modal.tsx:2:1 names a dead position
✗ config-group-completeness · mustPass[4]          … x-collection.tsx:2:1 names a dead position
✗ placeholder-copy-registry · mustPass[6]          … a-section.ts:2:1 names a dead position
✗ warning-code-coverage · mustPass[4]              … resolve.ts:1:1 names a dead position
✗ message-kind-policy-coverage · mustPass[4]       … participants.ts:3:3 names a dead position
```

All seven are in-module `mustPass` arms (the `schema-branding` shape), all seven produce exactly one finding by
construction, and each `why` states why the fixture is one-finding. The two interesting ones:
`warning-code-coverage`'s position is the tuple member literal INCLUDING its quotes with the marker above the
tuple's own declaration; `message-kind-policy-coverage`'s finding is anchored on a `PropertySignature` but
OFFSET to the axis name, so the marker reads `(wire)` and not `(readonly)`. Both are correct and both are
stated. **§5b.3 passes in all seven: every `fix` names the exact `@orb-waive <id>(<position>)` spelling AND
says what the position is**, and the dead-position control proves each one binds.

## PRISTINE per module — eight verdict blocks, seven criteria each

Legend: **P** pass · **F** fail · **N/A** does not bind · **NE** not evaluated.

### 1. `chrome-registry-completeness` — REFUTED (criteria 1, 5, 6)

1. **F** — D1: `:83` asks `ctx.relativePath` a question it may not be able to answer. Otherwise minimal:
   `facts`/`resources` explicit, no `ctx.checker()`, no `getType()`, `analysis: "types"` honest (the provider
   resolves type identity), `execution: "entire-population"` honest (a cross-file duplicate-id verdict cannot
   compose over a subset).
2. **P** — five per-arm details, each true of what it anchors, each PROVEN to discriminate.
3. **P** — `FIX` names `@orb-waive chrome-registry-completeness(<position>)` and states the position is the
   DECLARED NAME, "never the zone or the `mobile` field the message names". Dead-position control proves it.
4. **P** — family `registry-definitions`, reader `lib/registry-fact.ts` +
   `lib/registry-definition-{anchor,field,home}.ts`, all named; `tupleVocabularyFact` correctly called a shared
   PRIMITIVE rather than a second family.
5. **F** — the header is excellent (two-denominator rationale, the #942 drift, the assembler-by-type boundary);
   the ROSTER row `:160` refutes the header on subject identity (D2).
6. **F** — §4.2 arm PROVEN; §4.5 refusal pin present and strong (`registry-family.test.ts:242`); five exact
   counts; the rail-only fence ENFORCED. **One genuine gap:** the unreadable-id gate (`:134`), falsifier built.
   The population cut was wrong-direction and is not a gap.
7. **P** — `gate:contract` zero; no walk, cache, table, marker parser or fs read.

### 2. `section-registry-completeness` — REFUTED BY D1 ALONE (criterion 1)

1. **F** — D1 at `:119`. Everything else in criterion 1 is clean.
2. **P** — seven per-arm details, PROVEN to discriminate.
3. **P** — `FIX` names the spelling, both position shapes (`xSection`, `makeXSection`), AND the god-map arm's
   different position (the JSX attribute name `sections`).
4. **P** — family + readers named; the route-import arm's split into `route-imports-no-feature` recorded with
   its reason (one authority per policy).
5. **P** — header records the family, the reader, the byte-identical population port with the legacy SHA
   (`dd862e988^`), the M3 factory amendment, and WHY the ROUTES fence stays inside the arm rather than in the
   population. Roster row `:114` matches. The densest honest header in the batch.
6. **P** — §4.2 arm PROVEN; **all four narrowings ENFORCED**, and the two fence rows' `why` strings each name
   the row that dies — re-cut and verified correct. §4.5 pin present (`registry-family.test.ts:134`). Seven
   exact counts.
7. **P**.

**This is the module to hand a conversion lane, once D1 lands.** It is strictly better material than nine of
wave 1's ten.

### 3. `modal-registry-completeness` — REFUTED (criteria 1, 5)

1. **F** — D1 at `:171`.
2. **P** — nine per-arm details; PROVEN to discriminate.
3. **P** — same shape as `section`, including the god-map arm's separate position.
4. **P**.
5. **F** — the module header is very good, including the rare and valuable NEGATIVE claim that the opener
   prefilter is a candidate filter and not a narrowing (**which I verified true**). The roster row `:161`
   describes a planned-wiring-a-real-body arm the module cannot execute (D2).
6. **P** — §4.2 arm PROVEN; **all four narrowings ENFORCED**, two of them naming their own dying row
   correctly; §4.5 pin present; nine exact counts. `mustPass[9]`'s parenthetical ("the empty reason RETURNS
   `refused`, so the surface-reachability arm never adds a second") is directly proven by the cut.
7. **P**.

### 4. `config-group-completeness` — REFUTED (criteria 1, 5, 6)

1. **F** — D1 at `:143`. Three denominators, all declared and never summed — the right shape — and both
   `facts:` entries are read.
2. **P** — eight per-arm details across five arms; PROVEN to discriminate.
3. **P** — `FIX` names the spelling, the declared-name position, and the host-import arm's different position
   (the `import` keyword).
4. **P**.
5. **F** — the header is strong and records the anchor arm's split; the roster row `:165` asserts a
   `fileLoaded` door the module does not have (D2).
6. **F** — §4.2 arm PROVEN; **all four real narrowings ENFORCED** (the two-hop `ESCAPING_RELATIVE` fence
   correctly names its own dying row), the fifth reclassified as a type obligation; eight exact counts. The
   failure is **§4.5**: no refusal/receipt pin for this policy at all — including for the HOST denominator its
   own header says exists to stop a silent retirement (D6; probed and sound).
7. **P**.

### 5. `warning-code-coverage` — REFUTED (criteria 1, 5, 6)

1. **F** — D1 at `:156`, and here the population mismatch with `tupleVocabularyFact` is structural rather than
   incidental. Otherwise the contract is minimal and honest.
2. **P** — one message plus a per-finding `Member: "<code>" of <TUPLE>` suffix and a per-channel `Scope:` in the
   `fix`; both per-finding by construction.
3. **P** — the best `fix` in the batch on the position question: it states the position is the quoted literal
   INCLUDING its quotes and that the marker goes on the line above the tuple's own declaration. Both halves
   proven by `mustPass[4]` and my dead-position control.
4. **P** — singleton DECLARED **with its reason**, and the reason prices the alternative (three unrelated
   families read `tupleVocabularyFact`, so it is a primitive and not a family key). This is the §5b.4 standard.
5. **F** — header is excellent (two channels, home binding, the #1440 mapper tripwire and its
   loud-false-accusation failure mode, the deleted DEFERRED tables, the lossless population narrowing with its
   legacy SHA). Roster row `:196` names the wrong reader and none of it (D2).
6. **F** — §4.2 arm PROVEN; the home fence, the emit-scope fence and the mapper binding are ENFORCED and each
   names its own dying row correctly; §4.5 refusal pins are the strongest in the batch (a three-arm `test.each`
   PLUS a positive control that the withholding is the rebinding and not the fixture,
   `registry-family.test.ts:230`); seven exact counts. **Two genuine gaps**, both with built falsifiers: the
   chat-emitter channel gate and the pushed-record `message` requirement.
7. **P**.

### 6. `message-kind-policy-coverage` — REFUTED (criteria 4, 5, 6)

1. **P** — `facts: []` and `resources: []` explicit; `analysis: "types"` honest (`readAxes` calls `.getType()`
   at `:70` to resolve inherited members, which is the whole point of the #947 split); its one
   `ctx.relativePath` call is on a VISITED file, so it is **out of the D1 class**;
   `execution: "entire-population"` honest (an axis-coverage verdict over a subset would report every axis
   uncovered).
2. **P** — one message plus a per-finding ``Axis: `<name>`, declared on <Interface>`` suffix; PROVEN to
   discriminate, including against the near-substring of its own base interface.
3. **P** — `FIX` names the read; `mustPass[4]`'s `why` explains the offset that makes the position the axis
   name; dead-position control proves it binds.
4. **F** — D3: singleton with no declared reason, and no family line at all.
5. **F** — D3 (no family, no population port, no marker census) plus D2 (roster row `:327` describes three
   retired mechanisms).
6. **F** — §4.2 arm PROVEN; §4.5 refusal pins present and good (three, in a dedicated file: unresolvable
   `extends`, receipt-as-denominator, renamed record); three exact counts; the single-arm exemption ENFORCED.
   **One genuine gap** — the reader-scope fence (D4), falsifier built on the second attempt. Its three carrier
   fences are MUTUALLY REDUNDANT and enforced as a cluster, **not** four separate gaps as a naive sweep would
   have reported.
7. **P**.

### 7. `placeholder-copy-registry` — REFUTED (minor — criterion 6 only)

1. **P** — `facts: [registryDefinitionFacts.section]` read unconditionally in `evaluate`; `resources: []`
   explicit; no `ctx.checker()`, no `getType()`, **no `ctx.relativePath` call site at all** — the only module in
   this batch structurally outside the D1 class. `execution: "entire-population"` is honest and load-bearing: a
   CROSS-FILE distinctness comparison cannot compose over a subset, and the header says so.
2. **P** — six per-arm details (`Duplicate copy` / `Empty copy` / `Unreadable definition` / `Unreadable copy`),
   each true of what it anchors; PROVEN to discriminate, including between its two near-twin "Unreadable" arms.
3. **P** — `FIX` names the spelling, both position shapes, and explicitly "never the copy field the message
   names".
4. **P** — family + readers named.
5. **P** — the header records the family, the reader, and the population port as an INTENTIONAL WIDENING with
   its reason ("filtering by FILENAME here let an uncolocated section duplicate another's copy unseen") and the
   legacy SHA `577d03d63^`; it also states the fail-closed posture and why. (Its ROSTER row `:168` is stale in
   three places — D2 — which is a coupled site this module owns, filed under criterion 5 of the ROSTER rather
   than of the module, since the module's own header is correct.)
6. **F (minor)** — §4.2 arm PROVEN; six exact counts; the absent arm ENFORCED; the population cut was
   wrong-direction and is not a gap. **One genuine gap:** the module's own `message` claims a DISTINCT
   "(title, description) pair" and nothing proves the description half participates — two sections sharing a
   title with different descriptions is unpinned. Falsifier built; **one `mustPass` closes it.**
7. **P** — `gate:contract` zero.

**Closest to copyable today** — its only failure is one row.

### 8. `home-tile-registry-completeness` — NOT A SUBJECT (legacy)

1..7. **N/A — §5b does not bind an unconverted module.** It is a `GateDescriptor` with `scopeSafety`, a `run`
hook, `ctx.project.getSourceFiles()` (`:157`), `getDescendantsOfKind` (`:135`), the legacy `at:`/`files:` proof
shape and `expect: { token }` with no `count`. `pnpm gate:contract` files five findings against it and zero
against the other seven.

**As a conversion candidate it is well-positioned:** four arms that map cleanly onto shapes this family already
has, and `registryDefinitionFacts` already carries six kinds — a seventh (`home-tile`) puts it in the
`registry-definitions` family with the same reader, the same co-location helper, the same anchor and the same
`@orb-waive` position (the declared name). **The one thing to carry across:** its arms key on
`typeNode.getText().startsWith("HomeTileContribution")` — a HEAD-TEXT match, which is exactly what the shared
fact's canonical-type identity replaced in `chrome`, and which the chrome SHADOW CONTROL row exists to pin.

## Red triage — `pnpm test:scoped tests/tooling/verify/gates/` (6 failures in 4 files)

A scoped red is never baseline, so each is attributed.

- **Contention, not regressions (4 tests in 3 files).** `drizzle-registry-conversion.test.ts` (×2),
  `grant-liveness-family.test.ts`, `runner-config-path-liveness.int.test.ts` — all four failed with
  `Test timed out in 5000ms` (the per-test default). Re-run ALONE: **3/3 files PASS, exit 0.**
- **Pre-existing, other lane's scope (2 tests).** `caught-failure-ownership.repo.int.test.ts` — the committed
  `.catch` census over `packages/client/**` has drifted from a fresh derivation. That is the `ledgers:fresh`
  class, untouched by anything in this family and unreachable from any gate module I read. **Not mine, not a
  finding of this audit**; I did not triage its origin.

**Both family tests covering my subjects PASSED**: `registry-family.test.ts` 10/10, 15.7 s;
`message-kind-policy-coverage.test.ts` 3/3, 1.5 s.

## What I did NOT cover

- **`home-tile-registry-completeness` was not audited against §5b** — it is legacy (premise correction 1). I
  read it in full and characterised it as a conversion candidate only.
- **I did not run the §4.6 conversion differential** for any subject. `drizzle-registry-conversion.test.ts` is
  the only committed differential under `tests/tooling/verify/gates/` and it covers none of these eight.
  Whether each conversion's population is byte-identical to the legacy predecessor named in its header
  (`9055cfe6a`, `dd862e988^`, `577d03d63^`, `58370d705^`, `ed8b96aef`) is UNVERIFIED — I took the headers' port
  claims on trust, which is exactly the class of claim doctrine says ages.
- **I did not cut every narrowing.** Two are unevaluated by choice: `chrome`'s `vocabulary.kind !== "resolved"`
  withhold (`:127`) and `message-kind`'s `iface === undefined` withhold (`:226`) are fail-CLOSED guards whose
  enforcement is the receipt, and both are pinned by real §4.5 tests, so cutting them measures the runtime
  rather than the module. `warning-code`'s `isWarningsSink` alias walk (`:89-103`) has a declared `mustPass[0]`
  and a `mustFlag[2]` counterfactual on both sides, which is §4.1 satisfied without a cut.
- **I did not audit the shared readers** (`lib/registry-fact.ts`, `lib/registry-definition-{anchor,field,home}.ts`,
  `lib/tuple-vocabulary-fact.ts`, `lib/reference-fact.ts`, `lib/reference-fact-call.ts`,
  `lib/static-authored-value.ts`) for the §5b.7 "private reader wearing a shared reader's clothes" shape. Each
  visibly has ≥2 consumers across this family, but I did not count consumers with `pnpm ast`.
- **The D1 real-tree half is UNMEASURED by me.** `check:structure` says `0 tool error(s) · 0 withheld` today,
  which proves no subject is blinded RIGHT NOW; it does not prove the escape is unreachable on a future tree.
  What IS proven is that an ordinary in-repo fixture reaches it in five of five.
- **`check:structure` was run once, at `8257071ee`**, before the second merge. `git diff --stat` over all eight
  subject files between that commit and HEAD is EMPTY, so its verdict still describes them; it does NOT cover
  the matchmedia/resource modules that moved after it, which are not my subjects.
- **I did not run CT, e2e, biome or typecheck.** This lane modified no tracked code.
- `tests/tooling/check-gates.repo.int.test.ts` was not run — it is the orchestrator's, and not concurrency-safe
  with itself.

## Proposed memory lessons (the orchestrator owns the write)

**Index line:** `- [a falsifier that does NOT flip is the mutual-redundancy detector](falsifier-that-does-not-flip-detects-a-sibling-fence.md) — when a built row survives its own fence being cut, look for the SECOND fence catching the subject before writing UNENFORCED`

Body: The §4.1 cut test's three-bucket classification (unenforced / mutually redundant / wrong-direction) has a
cheap mechanical detector nobody has to reason their way to: **build the falsifier and run it in both arms.** A
row that PASSES unmodified and goes RED under the cut proves UNENFORCED. A row that passes in BOTH arms proves
the cut is not reaching the subject — either a sibling fence catches it, or the cut was the wrong direction.
Measured on `message-kind-policy-coverage`: a falsifier whose only read of the axis was a HOME-file
self-derivation did not flip when `isReaderScope` was cut, because `isCanonicalRecordReference` refuses a
same-file reference outright, so NO home-file fixture can exercise `isReaderScope` at all. The second attempt —
a different `@contracts` file that IMPORTS the record — flipped immediately. The first attempt was not wasted:
it is what identified the redundant pair. Corollary: when N fences in one function all come back clean, cut them
TOGETHER; the same module's three home-carrier fences (`path === HOME`, `isExported()`, `importedNames.has`) are
individually uncuttable and kill a row as a cluster, so the fix is one row for the cluster and not three.

**Index line:** `- [ctx.relativePath escapes the population through an ORDINARY cross-package import](relativepath-escapes-without-node-modules.md) — the #1972 class needs no .d.ts; a sibling @orb package one import away reproduces it in a proof row`

Body: §12.3 documents `ctx.relativePath` as partial and illustrates the class with a `node_modules` `.d.ts`,
which reads as exotic. It is not. A `mustPass` fixture whose subject's initializer is imported from
`packages/ui/src/...` while the policy's population is `@client` throws
`PASS TOOL ERROR [evaluate] source file is outside the effective population` in the conformance runtime —
reproduced in four registry policies at their `object.getSourceFile()` site plus `warning-code-coverage` at its
`fact.symbol.declaration.getSourceFile()` site. The warning-code case carries the general lesson: **a fact
provider whose population is a strict SUPERSET of its consumer's hands that consumer nodes it cannot name**
(`tupleVocabularyFact` is `@client`+`@server`+`@contracts`; `warning-code-coverage` is `@server`+`@contracts`),
so the mismatch is a property of the PAIR and should be checked whenever a policy declares `facts:`. A two-file
`mustPass` row is the whole probe; the fix is the total idiom
`canonical.sourceFile.getFilePath().replaceAll("\\","/")`, never a `ctx.files` membership test (that reads clean
under every `--scope` run).

**Index line:** `- [a DENSE roster row can be dense about the LEGACY gate](dense-roster-row-describes-the-legacy-gate.md) — worse than a bare label, because a lane reads it as a specification; grep every noun of art against the converted module`

Body: Wave 1's D9 found four `Core-Enforcement-Active-Gates.md` rows left as bare pre-conversion labels. The
registry/completeness family has zero of those and five of the inverse: long, specific, confident rows
describing mechanisms the converted module deleted — a `DEFERRED` table and a mode-B anchor guard
(`message-kind-policy-coverage:327`), a `*-section.*` filename population and a `non-literal-copy` skip that is
now a fail-closed finding (`placeholder-copy-registry:168`), a `fileLoaded(compose/authed-app.tsx)` door that
appears zero times in the module (`config-group-completeness:165`), an "annotation head" subject the module's
own shadow control refutes (`chrome-registry-completeness:160`), and the wrong shared reader
(`warning-code-coverage:196`). The check is mechanical and cheap: for every NOUN OF ART in a roster row — a
helper name, a table name, a file regex, a skip label, a reader path — grep the converted module for it. A
clause naming something absent from the module is a defect in the same class as a stale fixture, and the
conversion commit is where it should have died.

**Index line:** `- [a fence row that states its own cut result is the cheap §4.1 mechanism](fence-row-states-its-own-cut-result.md) — "deleting X REDS this row" in a why is re-runnable in one probe, and the modules that write it are the ones with zero unenforced narrowings`

Body: The two modules in the registry/completeness family with 4-of-4 narrowings ENFORCED
(`section-registry-completeness`, `modal-registry-completeness`) are the two whose fence rows' `why` strings
name the cut and its consequence — "Deleting the `startsWith(ROUTES)` guard flags this component and REDS this
row — without it the fence is a claim the positives never visit". The two with real gaps
(`warning-code-coverage` 2 gaps, `message-kind-policy-coverage` 1) use the idiom only for the fences that turn
out to be enforced. The correlation is not luck: writing the sentence forces the author to run the cut, and it
converts §4.1 from an audit obligation into a one-command check any later reader can re-run. Verify, don't
trust — every such claim in this family was re-cut and all were TRUE, but the inverse failure (a `why` naming a
narrowing the row does not prove) is the recurring defect, seen in `no-raw-matchmedia`'s `mustPass[1]` (wave 1
D6) and again in `message-kind-policy-coverage`'s `mustPass[3]`.

## Issue summary for #1584

A fresh-context Opus verifier audited the eight-module registry/completeness family against §5b's seven
criteria, ran the §4.1 narrowing sweep (30 cuts across twelve `cp`/`mv` probe rounds) and the #1968 expectation
sweep (all 45 `mustFlag` rows), and **REFUTES seven and refuses the eighth as out of scope**. First, a premise
correction: **`home-tile-registry-completeness` is LEGACY, not converted** — `GateDescriptor` + `scopeSafety` +
`run` + two direct walks, and `pnpm gate:contract`'s five subject-named findings ALL belong to it (zero for the
seven final modules), so §5b does not bind it; it is a good conversion candidate for the `registry-definitions`
family. `check:policy-conformance` reproduced the brief's headline exactly and is back at **167 · 1,667 · 0
failures · exit 0** after every probe; `gate:contract` is **761, unchanged, with ZERO findings for all seven
final subjects**. **The brief's sharpest item is CONFIRMED and upgraded from latent to reproduced**: the #1972
`ctx.relativePath` escape fires in **five of five** predicted modules and needs no `node_modules` `.d.ts` — an
ordinary `packages/ui/src/...` import one hop from `@client` produces `PASS TOOL ERROR [evaluate] source file is
outside the effective population` in `chrome`, `section`, `modal` and `config-group` at their RESOLVED-object
site, and in `warning-code-coverage` at its tuple-symbol site where the exposure is STRUCTURAL:
`tupleVocabularyFact`'s population (`@client`+`@server`+`@contracts`) is a strict SUPERSET of its consumer's
(`@server`+`@contracts`), so the provider hands the policy nodes it may not name. The DECLARATION sites are SAFE
in all five (the registry fact's population is byte-identical to its consumers'), so the fix is the §12.3 total
idiom at exactly five call sites. **Adopting the mid-run cut-test correction changed the headline number
materially and the report carries the split**: a naive sweep said 12 of 30 unenforced (40%, wave 1's rate);
after classification it is **5 genuinely UNENFORCED (17%) — each backed by a built falsifier run in BOTH arms —
plus 3 MUTUALLY REDUNDANT (message-kind's three home-carrier fences are individually uncuttable and kill
`mustFlag[2]` as a cluster), 3 WRONG-DIRECTION (the two `population:` widenings, which cannot add subjects
because the fact owns the denominator — the NARROW-direction control reds all 12 chrome rows and proves the
field live; plus config-group's `canonical.kind !== "project"`, a discriminated-union TYPE obligation rather
than a fence), and 1 pinned in the family test.** One falsifier failed to flip and that was the most useful
result of the round: `message-kind`'s home-file fixture is caught by a SECOND fence
(`isCanonicalRecordReference` refuses a same-file reference), so the corrected falsifier is a different
`@contracts` file that imports the record — it passes unmodified and reds under the cut. **This family is
markedly cleaner than wave 1's exemplars on everything wave 1 found rotten: all 45 `mustFlag` rows carry an
exact `count` (wave 1: two missing), all six `messageIncludes` discriminators PROVE discriminating under a
sibling-arm transplant (wave 1: three tautologies), all seven §4.2 identity arms alarm under a planted
dead-position control, and NO module asserts a limit that is a claim about the LOADER** (checked explicitly
after the `no-raw-matchmedia` finding; the nearest is a checker/type-resolution property that is `lib`-independent
and is pinned by a real row). Also filed: `message-kind-policy-coverage` has **no family line and no
population-port line at all** (§5b.4/§5b.5 — `warning-code-coverage:21-24` declares its singleton WITH its
reason and is the standard to copy) and its `mustPass[3]` `why` claims a narrowing that survives deletion (the
recurring wave-1-D6 shape); **five of eight roster rows in `Core-Enforcement-Active-Gates.md` are dense about
the LEGACY implementation** (a `DEFERRED` table and mode-B anchor guard at `:327`, a `*-section.*` population
and a `non-literal-copy` skip at `:168`, a `fileLoaded(compose/authed-app.tsx)` door absent from the module at
`:165`, an "annotation head" subject the module's own shadow control refutes at `:160`, the wrong shared reader
at `:196`) — the inverse of wave 1's bare-label defect and worse, because a lane reads a dense row as a
specification; and `config-group-completeness` and `placeholder-copy-registry` carry **no §4.5 refusal pin**,
including for config-group's third declared denominator whose stated purpose is that "a renamed host cannot
silently retire its import arm" — I probed both and **both withhold correctly** (`policy receipt refused:
population "config content host" resolved zero members`), so these are missing pins rather than broken guards.
**`section-registry-completeness` is the module to hand a conversion lane once D1 lands** — 4 of 4 narrowings
enforced, both fence rows stating their own cut result and both verified true, accurate header AND roster row,
D1 its only §5b failure; **`placeholder-copy-registry` is closest to copyable today** — the only module with no
`ctx.relativePath` call site at all, failing on one unenforced narrowing that one `mustPass` closes. Per the
brief I ran **`pnpm check:structure` once, alone** — the instrument wave 1 skipped: **`0 tool error(s) · 0
withheld`**, `271/271 active gate(s)`, run COMPLETE, all eight subjects `✓` at non-zero real-tree populations,
so **nothing in this family is blinded or withheld on the real tree today**, which makes D1 a fix-before-copy
rather than a fix-now. Scoped suite: 53/57 files passed; the 4 timing-out tests pass 3/3 on a quiet re-run and
the 2 remaining reds are `caught-failure-ownership`'s census drift, another lane's scope.
