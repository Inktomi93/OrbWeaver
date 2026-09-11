---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave2 — the registry/completeness family against §5b PRISTINE (#1584)

Read-only adversarial audit of the eight modules the orchestrator named as the registry/completeness family,
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven criteria
and §4's proof rules. Method, receipt style and per-module verdict-block format are copied from wave 1
([`v-exemplar-audit-2026-09-12.md`](v-exemplar-audit-2026-09-12.md)) so the two are comparable.

Every number below came out of a run produced in this session, in an isolated worktree. The audit started at
`a9fe79c48`; `main` was merged mid-run at `8257071ee` (the #1959 `ext` sweep touched one subject), and **every
receipt cited here was re-produced on the merged tree** — the #1972 reproduction was re-run after the merge and
is byte-identical. All probes were `cp f f.w2bak` … `mv f.w2bak f` inside this worktree — never
`git stash`/`checkout`/`restore` — and `git status --short` was EMPTY after every one of the nine probe rounds.

`check:policy-conformance` is at **167 final policies · 1,662 proof rows · 0 failures · exit 0** before and
after this audit and stays there through every defect below.

## Headline

**Seven of the eight are FINAL; the eighth is LEGACY and §5b does not bind it.** Of the seven, **five carry a
REPRODUCED tool-error defect** (the #1972 `ctx.relativePath` class — not latent, constructible with an ordinary
in-repo cross-package fixture), and **two are CONFIRMED**.

This family is *markedly* better than wave 1's exemplar set on the criteria wave 1 found rotten:

| Property | Wave 1 (10 exemplars) | Wave 2 (7 final modules) |
| - | -: | -: |
| `mustFlag` rows with no `count` | 2 of 33 | **0 of 45** |
| `messageIncludes` discriminators that are tautologies | 3 of 8 | **0 of 6** (all six transplants FAILED) |
| §4.2 identity arms that discriminate | 4 of 4 in-module | **7 of 7** |
| Unenforced §4.1 narrowings | 12 of 30 (40%) | **12 of 30 (40%)** |
| Modules with NO §4.5 refusal pin | 3 | **2** (and both denominators PROVEN sound by probe) |
| Roster rows that are bare pre-conversion labels | 4 | **0** (but 5 carry STALE clauses — the inverse defect) |

| # | Module | Verdict |
| -: | - | - |
| 1 | `chrome-registry-completeness` | **REFUTED** — D1 (#1972, reproduced); roster clause "the exact `ChromeEntry` annotation head" is refuted by the module's own shadow control |
| 2 | `section-registry-completeness` | **REFUTED** — D1 only. Every one of its four narrowings is ENFORCED and each row's `why` names the row that dies, correctly. Otherwise the best module in the batch |
| 3 | `modal-registry-completeness` | **REFUTED** — D1; roster clause "a planned modal wiring a real function `body`" describes an arm the module cannot execute |
| 4 | `config-group-completeness` | **REFUTED** — D1; roster's `fileLoaded(compose/authed-app.tsx)` door does not exist in the module; its third declared denominator is sound but UNPINNED |
| 5 | `warning-code-coverage` | **REFUTED** — D1 (and here the population mismatch is STRUCTURAL, not incidental); 3 of 5 narrowings unenforced; roster names the wrong shared reader |
| 6 | `message-kind-policy-coverage` | **REFUTED** — 4 of 5 narrowings unenforced; NO family line and NO population-port line in the header (§5b.4 + §5b.5); a `mustPass` `why` that claims a narrowing the row does not prove; roster row describes three retired mechanisms |
| 7 | `placeholder-copy-registry` | **CONFIRMED (one nit)** — no `ctx.relativePath` call at all, so it is OUT of the #1972 class by construction. Nit: its roster row is stale in two places |
| 8 | `home-tile-registry-completeness` | **NOT A SUBJECT — LEGACY.** `GateDescriptor` + `scopeSafety` + `run` + two direct walks; five `gate:contract` findings. §5b does not bind an unconverted module (premise correction, below) |

**Recommendation: `section-registry-completeness` is the module to hand a conversion lane** — once D1 lands.
Its four narrowings are all enforced, its two fence rows state the cut result in their `why` and were verified
to be telling the truth, and its identity arm discriminates. It is strictly better material than nine of wave
1's ten.

## Premise corrections

1. **`home-tile-registry-completeness` is LEGACY, not final.** Re-derived against
   `pnpm check:policy-conformance` as the brief asked. `tooling/src/verify/gates/home-tile-registry-completeness.ts:147`
   is `export const gate: GateDescriptor = {`, not `defineGate`. Two independent receipts:
   `pnpm gate:contract` reports **five findings, all of them this module's** (`[descriptor-wrapper]`,
   `[legacy-field] scopeSafety`, `[legacy-field] run`, and two `[direct-walk]`s at `:135` and `:157`), and
   `check:structure` prints it with the LEGACY line shape (`✓ home-tile-registry-completeness · scanned
   7412/7412 files`) rather than the final shape (`· final ordinary/error · population N source`). **I audited
   the other seven and report this one as out of scope.** It is a conversion candidate, not a defect.
2. **`message-kind-policy-coverage:202` no longer carries `ext: ["ts","tsx"]`** — removed on `main` by the
   #1959 lane while this audit ran. Every line number in this file is post-merge; the absence is correct and is
   not filed.
3. **The #1972 class is now DOCUMENTED in the guide** (§12.3, `gate-runtime-standardization.md:722-735`,
   including the total house idiom and a census of "seven call sites in six modules, live once and latent six
   times"). My contribution is the REPRODUCTION: **all five of my modules' latent sites fire**, and they fire
   without needing `node_modules` at all.

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline, pre-merge) | `167 final policies · 1662 proof rows · 0 failure(s) · 105 grant rows · 0 invalid · 12140ms (corpus: 271 module(s), 104 legacy proven by gate-conformance)`, **exit 0** — identical to the brief's headline |
| `pnpm check:policy-conformance` (after all nine probe rounds, post-merge) | same line, **exit 0** — restored |
| `pnpm gate:contract` | `761 finding(s) across 271 gate module(s)`, exit 1. Total did NOT rise. **ZERO findings for all seven FINAL subjects**; all five subject-named findings belong to the legacy `home-tile-registry-completeness` |
| **`pnpm check:structure`** (run alone, once — the gap wave 1 left) | exit 1 (migration baseline). Tail: `final policies: 167 ran · raw 1322 = waived 1127 + granted 105 + effective 90 (90 error, 0 warning) · 0 alarm(s) · **0 tool error(s)** · **0 withheld**`. `single-pass: ran 271/271 active gate(s) … run COMPLETE`. **All eight subjects ran `✓` with non-zero real-tree populations** (chrome 1319 src / `CHROME_ZONES: 4` / `ChromeEntry: 7`; config-group 1319 / three denominators 4+1+13; modal 1319 / 11; section 1319 / 10; placeholder 1319 / 10; message-kind 2917 / axis 3; warning-code 1598 / `CHAT_WARNING_CODES: 14` + `WARNING_CODES: 12`). **Nothing in this family is withheld on the real tree** |
| `pnpm test:scoped tests/tooling/verify/gates/` | 57 files, **53 passed / 4 failed**; 6 failing tests, triaged below. **Both family tests covering my subjects PASSED**: `registry-family.test.ts` (10 tests, 15.7 s) and `message-kind-policy-coverage.test.ts` (3 tests, 1.5 s) |
| quiet re-run of the three timing-out files | **3/3 files PASS, exit 0** |
| 9 `cp`/`mv` probe rounds (30 narrowing cuts, 6 message transplants, 7 dead-position controls, 7 population-escape probes) | each restored; `git status --short` EMPTY after every round |

`pnpm exec biome` / `pnpm typecheck` were **not** run: this lane wrote one markdown file and modified no tracked
code. `pnpm check:docs` was run scoped for that file.

## DEFECTS

### D1 — the #1972 `ctx.relativePath` escape FIRES in five of seven, and does not need `node_modules` (HIGH)

§12.3 (`gate-runtime-standardization.md:722-735`) states the class and calls six of the seven sites LATENT.
**They are not latent in the sense of "hard to reach."** Each fires on an ordinary in-repo cross-package
resolution, which is the shape this family exists to judge (`#944`: a definition whose initializer is IMPORTED).

One probing `mustPass` row per module, resolving the subject to a sibling PACKAGE inside the same repo:

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

**Per module, whether the resolution can escape the population, and why:**

| Module | Call site | Subject | Can it escape? |
| - | - | - | - |
| `chrome-registry-completeness` | `:73` `definition.declaration.getSourceFile()` | the fact's own declaration | **No.** `registryDefinitionFacts.chrome`'s population is `@client` (`lib/registry-fact.ts:326`), byte-identical to the policy's `:60`. A declaration the fact produced is always in the policy's files |
| | `:83` `object.getSourceFile()` | the RESOLVED object literal | **YES — reproduced.** The object is reached by cross-file resolution, which follows the import wherever it goes. `@client` is the population; `@ui`, `@kit`, `@contracts` and `node_modules` are all one import away |
| `section-registry-completeness` | `:109` declaration · `:168` visited `sourceFile` | | No / No (`:168` is a node the policy VISITED) |
| | `:119` `object.getSourceFile()` | resolved object | **YES — reproduced** |
| `modal-registry-completeness` | `:161` declaration · `:257` visited `sourceFile` | | No / No |
| | `:171` `object.getSourceFile()` | resolved object | **YES — reproduced** |
| `config-group-completeness` | `:133` declaration · `:223`, `:234` visited `sourceFile` | | No / No |
| | `:143` `object.getSourceFile()` | resolved object | **YES — reproduced** |
| `warning-code-coverage` | `:247` visited `sourceFile` | | No |
| | `:156` `fact.symbol.declaration.getSourceFile()` (via `ctx.relativePath` passed into `channelVocabulary` at `:226`) | the tuple's declaring module | **YES — reproduced, and here the exposure is STRUCTURAL, not incidental.** `tupleVocabularyFact`'s population is `{ in: ["@client", "@server", "@contracts"] }` (`lib/tuple-vocabulary-fact.ts:137`); the policy's is `{ in: ["@server", "@contracts"] }` (`:215`). The fact's population is a strict SUPERSET of its consumer's, so a `WARNING_CODES` or `CHAT_WARNING_CODES` tuple resolving in `@client` is delivered to a policy that cannot name it. **This is the one case where the throw needs no unusual import at all** — only a same-named exported tuple in the client tree |
| `message-kind-policy-coverage` | `:221` visited `sourceFile` | | **No.** Its one call site takes the file the visitor was handed |
| `placeholder-copy-registry` | — | — | **No call site at all.** Out of the class by construction |

**Fix, per §12.3:** the total house idiom, `canonical.sourceFile.getFilePath().replaceAll("\\","/")`, for the
four registry modules' `object.getSourceFile()` site; `warning-code-coverage` additionally owes either the same
idiom at `:156` or a declared reconciliation of the two populations, because a superset provider feeding a
subset consumer is a standing trap for every future consumer of `tupleVocabularyFact`. §12.3 explicitly forbids
substituting a `ctx.files` membership test.

**Scope of my claim:** proven in the conformance runtime. On the real tree, `check:structure` reports
`0 tool error(s) · 0 withheld` today, so **no subject is currently blinded** — which is exactly what "latent"
means and exactly why it should be fixed before the shape is copied 106 times.

### D2 — five of eight roster rows describe mechanisms the converted module does not implement (§5b.5, MEDIUM)

The guide's routing table makes `Core-Enforcement-Active-Gates.md` a COUPLED SITE. Wave 1's D9 found four rows
that were bare pre-conversion LABELS. This family has the inverse defect: every row is dense, and five of them
are dense about the LEGACY implementation. A dense row that is wrong is worse than a bare one, because a lane
reads it as a specification.

| Row | The claim | The tree |
| - | - | - |
| `:327` `message-kind-policy-coverage` | "`DEFERRED` is the bus-coverage idiom, self-cleaning both directions … Blindness tripwires: home gone (mode B, anchor-guarded), record/interface renamed away, orphan DEFERRED row" | **Three dead mechanisms.** The module header states "The legacy DEFERRED table is DELETED: it was empty, and its stale/orphan arms were structurally unprovable while it stayed empty" (`:13-14`) and "No real-tree anchor file decides which substrate a proof receives" (`:18`). There is no DEFERRED table, no orphan-row arm and no mode-B anchor guard |
| `:168` `placeholder-copy-registry` | "reconciled ACROSS the `features/*/lib/*-section.*` files" | **False.** The module's POPULATION PORT is an explicit INTENTIONAL WIDENING away from that filename filter to the whole `@client` tree by canonical TYPE (`:17-21`), precisely because "filtering by FILENAME here let an uncolocated section duplicate another's copy unseen" |
| `:168` (same row) | "a non-string-literal copy is a DECLARED LIMIT counted as a `non-literal-copy` skip rather than a silent `continue`" | **False.** It is now a fail-closed FINDING — `Unreadable copy` (`:118`), pinned by `mustFlag[3]`. `non-literal-copy` appears nowhere in `tooling/`; the only two hits repo-wide are this roster row and a 2026-09-02 review |
| `:168` (same row) | "via the shared `registryDefinitionFact`" | Wrong symbol. `lib/registry-fact.ts:349` exports `registryDefinitionFacts` (plural, a per-kind map); the singular does not exist |
| `:165` `config-group-completeness` | "The orphan arm keys on the REAL door (`fileLoaded(compose/authed-app.tsx)`), never `scope.kind`, so the gate's own conformance mini-projects don't red it" | **False.** `fileLoaded` appears ZERO times in `config-group-completeness.ts`. The orphan arm runs unconditionally over the collection fact (`:246-253`); the conformance mini-projects are kept green by the `PRELUDE` registering `baseCollection`, not by a door test |
| `:160` `chrome-registry-completeness` | "the SUBJECT is the exact `ChromeEntry` annotation head" | **Refuted by the module's own proof row.** The header says the subject is canonical TYPE identity "rather than by matching an annotation's head text" (`:15-17`), and `mustPass[5]` (THE SHADOW CONTROL) proves a local same-named `ChromeEntry` is NOT the subject — which a head-text match would have flagged |
| `:196` `warning-code-coverage` | "each channel's tuple is RESOLVED through `lib/tuple-read.ts` (#947)" | Wrong reader. The module imports `lib/tuple-vocabulary-fact.ts` (`:35`), which does not import `tuple-read.ts` either. `tuple-read.ts` still exists and has five other consumers, so this is a mis-citation, not a dangling ref. The row also names none of the conversion's load-bearing facts: the per-channel HOME BINDING, the two disjoint emit scopes, the deleted DEFERRED tables, or the `@orb-waive` position (the tuple member literal WITH its quotes) |
| `:161` `modal-registry-completeness` | "the DECLARED-PLANNED honesty (… or a planned modal wiring a real function `body`)" | **Vacuous as written.** `plannedReason` (`:124-134`) reads `body.planned`; a `body: () => null` resolves to no object, returns `undefined`, and the modal is classified `"real"`. A modal cannot be both planned and function-bodied under this reader, so the second half of the clause names an arm that cannot execute. Contrast `section-registry-completeness`, which DOES implement the analogous check (`wiresRealBody`, `:59-76`) and pins it with two `mustFlag` rows |

`:114` (`section`), `:163` (`home-tile`, correctly describing the legacy gate) and `:115`/`:166` (the two
split-out reviewed-grant policies) are accurate.

### D3 — `message-kind-policy-coverage`'s header records NO family and NO population port (§5b.4 + §5b.5, MEDIUM)

Every other module in this batch opens with a `FAMILY …` line naming the shared reader (module + function) and
a `POPULATION PORT: …` line stating byte-identical or the intentional correction. `message-kind-policy-coverage`
has neither:

```
$ grep -c 'FAMILY' <each module>        chrome 1 · section 1 · modal 1 · config-group 1 · warning-code 1 · placeholder 1 · message-kind 0
$ grep -c 'POPULATION PORT' <each>      chrome 1 · section 1 · modal 1 · config-group 1 · warning-code 1 · placeholder 1 · message-kind 0
```

Its descriptor declares `family: "message-kind-policy-coverage"` — a singleton — with no stated reason, which is
exactly what §5b.4 forbids ("a declared singleton **with its reason**"). The contrast is in the same batch:
`warning-code-coverage:21-24` declares its singleton AND prices it ("`tupleVocabularyFact` is a shared PRIMITIVE,
not a family key — three unrelated families read it … and no sibling policy judges whether a warning code is
EMITTED, which is this policy's subject"). That paragraph is the standard; write the same one here.

The population port matters here specifically: the legacy descriptor's population is not recorded anywhere, and
the module reaches into `@client` as well as `@server`/`@contracts` (`:202`) — a reader cannot tell whether that
third root is a port or a correction.

### D4 — a `mustPass` `why` names a narrowing the row does not prove (MEDIUM; the wave-1 D6 shape, recurring)

`message-kind-policy-coverage` `mustPass[3]`'s `why`:

> "the CONTRACTS-INTERNAL derivation is a carrier, not an enforcer: `SELF` alone would not cover the axis, and
> the behavior-tier read here is what does — **so this row pins that a home-file read is never counted as
> production coverage on its own**".

Cutting the narrowing it names — `references.filter(({ path }) => isReaderScope(path))` at `:139`, so a
home-file read DOES count as production coverage — leaves the whole module green, including this row. The row
survives because its fixture ALSO carries a real behaviour-tier read, so `memory` is covered either way. The
claim is not pinnable by a `mustPass` at all: the property is "a home-only read leaves the axis UNCOVERED",
which is a `mustFlag` — a fixture whose only read of the axis is `export const SELF = MESSAGE_KIND_POLICY.standard.memory;`
inside `packages/contracts/src/chat/participants.ts`.

Same module, same shape, one narrowing over: `homeCarriers`'s `path === HOME` filter (`:122`) and
`carriedAxes`'s `importedNames.has(carrier)` (`:188`) are both unenforced, and both are halves of the
"carrier" mechanism this row claims to pin.

### D5 — twelve of thirty narrowings are UNENFORCED (40%), concentrated in two modules (MEDIUM)

The full table is below. The distribution is the finding: `section` is 4/4 enforced and `modal` 4/4, while
`message-kind` is 1/5 and `warning-code` 2/5. The two clean modules are the two that write their fence rows
with an explicit "deleting X REDS this row" `why` — and **every one of those claims was verified true.** That
is the cheapest available mechanism for §4.1 and it works; the two dirty modules do not use it.

### D6 — two modules' declared denominators are SOUND but UNPINNED (§4.5, LOW)

`tests/tooling/verify/gates/registry-family.test.ts` holds real `runPolicyPass` refusal pins for `chrome`
(`:242` zone vocabulary stops resolving), `modal` + `section` (`:134` one kind's blind provider) and
`warning-code` (`:197-228`, three arms: declared-outside-home / absent / empty, plus the `:230` positive control
proving the withholding is the rebinding and not the fixture). `message-kind-policy-coverage.test.ts` holds
three more. **`config-group-completeness` and `placeholder-copy-registry` have none.**

That matters most for `config-group`, whose header declares "THREE DENOMINATORS, all declared and never summed:
the group definitions, the collection bodies, and the config content host itself — **the last one so a renamed
host cannot silently retire its import arm**" (`:16-17`). Nothing pins that. I probed it:

```
✗ config-group-completeness · mustPass[0] · W2 PROBE: the config CONTENT HOST is renamed …
    PASS TOOL ERROR [receipt] policy receipt refused: population "config content host" resolved zero members
✗ placeholder-copy-registry · mustPass[0] · W2 PROBE: no SectionDefinition exists at all …
    PASS TOOL ERROR [receipt] policy receipt refused: population "SectionDefinition" resolved zero members
```

**Both mechanisms WORK.** This is a missing pin, not a broken guard — but §4.5's whole point is that "a clean
zero from a detector that might be blind is not evidence," and the two probes above are two `runPolicyPass`
pins somebody should have committed. `warning-code-coverage`'s three-arm `test.each` at `:197` is the shape to
copy.

## MANDATORY SWEEP A — the §4.1 narrowing cut table

Method, per §4.1: `cp` the module, cut the narrowing so the policy flags MORE, run every declared row through
the production conformance door, `mv` back. A cut that kills no row means the narrowing is UNENFORCED.

| Module | Narrowing (`path:line`) | Cut | Row that died | Verdict |
| - | - | - | - | - |
| `chrome-registry-completeness` | rail-only mobile fence `zone.value.startsWith(RAIL_PREFIX)` (:116) | require `mobile` on every zone | `mustFlag[1]`, `mustPass[2..5]` | ENFORCED |
| | `population: "@client"` (:60) | `{ in: ["@client","@server"] }` | — | **UNENFORCED** |
| | the unreadable-id gate `&& claimId(…)` (:134) | run `judgeZone` regardless | — | **UNENFORCED** |
| | zone membership `!zones.has(zone.value)` (:112) — a POSITIVE, control | make it unreachable | `mustFlag[2]` | control bites |
| `section-registry-completeness` | `startsWith(ROUTES)` (:168) | drop it | `mustPass[5]` — **exactly the row its own `why` names** | ENFORCED |
| | attribute-name fence `=== GOD_MAP_PROP` (:80) | bare `isJsxAttribute` | `mustPass[6]` — **as its `why` names** | ENFORCED |
| | god-map object-literal requirement (:88) | any initializer expression | `mustPass[4]` | ENFORCED |
| | `kind.value !== CONTEXT_NONE` (:75) | any resolved context kind | `mustFlag[1]` + `mustPass[0]` + `mustPass[7]` | ENFORCED |
| `modal-registry-completeness` | `startsWith(ROUTES)` (:257) | drop it | `mustPass[7]` — **as its `why` names** | ENFORCED |
| | attribute-name fence `=== GOD_MAP_PROP` (:112) | bare `isJsxAttribute` | `mustPass[8]` — **as its `why` names** | ENFORCED |
| | singleton scope `placement !== SINGLETON_PLACEMENT` (:195) | every placement a singleton | `mustFlag[5]` | ENFORCED |
| | planned-exempt gate `judgePlanned(…) === "real"` (:237) | judge planned surface modals too | `mustFlag[3]` + `mustPass[1]` + `mustPass[9]` | ENFORCED |
| | the opener-name PREFILTER `openerNames.has(name)` (:249) | accept every call | — | **NOT A NARROWING — and the header SAYS SO.** `:14-16` claims "removing the prefilter changes no proof row, which is exactly what 'candidate filter, not a narrowing' has to mean." **Verified true** |
| `config-group-completeness` | HOST fence in the import visitor (:223) | any file's imports | every row (8 `mustFlag` + 5 `mustPass`) | ENFORCED |
| | specifier fence `FEATURE_DOOR \|\| ESCAPING_RELATIVE` (:227) | any non-empty specifier | `mustPass[2]` | ENFORCED |
| | `ESCAPING_RELATIVE = "../../"` two-hop (:48) | one hop `"../"` | `mustPass[2]` — **as its `why` names** | ENFORCED |
| | importFile-is-declared gate (:158) | judge `importFile` always | every row | ENFORCED |
| | `canonical.kind !== "project"` (:104) | drop it | — | **UNENFORCED** |
| `warning-code-coverage` | home fence `candidate.path !== channel.home` (:181) | drop it | `mustFlag[5]` — **as its `why` names** | ENFORCED |
| | emit-scope fence `startsWith(channel.emitScope)` (:181) | drop it | `mustFlag[6]` — **as its `why` names** | ENFORCED |
| | canonical mapper binding `getName() === CHAT_MAPPER` (:148) | any function's returns | `mustFlag[4]` | ENFORCED |
| | per-channel chat-emitter admission `channel.chat &&` (:127) | both channels admit `emit`/`emitQuiet` | — | **UNENFORCED** |
| | a pushed record must carry `message` (:116) | drop it | — | **UNENFORCED** |
| | vocabulary HOME BINDING `declared === channel.home` (:157) | adopt any same-named tuple | — | **UNENFORCED in the module.** Pinned instead in `registry-family.test.ts:197-228` ("declared outside its home"), which is the legitimate §4.5 home for it — filed as a table row, not as a defect |
| `message-kind-policy-coverage` | single-arm exemption `axis.singleArm \|\|` (:236) | demand a reader for literal axes | `mustPass[1]` | ENFORCED |
| | reader-scope fence in `directAxes` (:139) | count home-file reads as production | — | **UNENFORCED** (see **D4**) |
| | carrier-is-IMPORTED gate `importedNames.has(carrier)` (:188) | every home carrier counts | — | **UNENFORCED** |
| | `homeCarriers` `path === HOME` (:122) | carriers from any file | — | **UNENFORCED** |
| | `enclosingCarrier` `isExported() === true` (:105) | unexported consts too | — | **UNENFORCED** |
| `placeholder-copy-registry` | the absent arm `copy.kind === "absent" → return` (:114) | report it | `mustPass[2]` | ENFORCED |
| | `population: "@client"` (:81) | `{ in: ["@client","@server"] }` | — | **UNENFORCED** |
| | pair key is `(title, description)` (:98) | key on `title` alone | — | **UNENFORCED** |

**18 ENFORCED, 12 UNENFORCED of 30 cut** (40% — the same rate wave 1 measured, with a very different
distribution: `section` and `modal` are 4/4 and 4/4, `message-kind` is 1/5 and `warning-code` 2/5).

**A note on the five registry modules' population fences.** Their `population:` declaration is near-inert with
respect to findings, and for a different reason than wave 1's cases: the SUBJECT comes from the
`registryDefinitionFacts.<kind>` provider, whose own population (`lib/registry-fact.ts:326`) owns the
denominator. Widening the policy's population adds visitor files, not subjects. That is not itself a defect —
but it IS the mechanism behind D1: because the policy's population is narrower than the resolver's reach, and
`ctx.relativePath` is partial over the policy's population, the policy can be handed a node it is not allowed
to name.

## MANDATORY SWEEP B — the expectation rows (#1968)

`expectationFailure` read off the source: `count` compares `findings.length` EXACTLY
(`ops/policy-conformance.ts:194-196`); `line`/`token`/`messageIncludes` run through `findings.some(...)`
(`:203-213`), so any one match satisfies the row.

**45 `mustFlag` rows across the seven final subjects. EVERY ONE carries a `count`** — verified mechanically
(`grep -n 'expect: {' <module> | grep -v 'count:'` returns nothing in all seven, against totals of
5 · 8 · 9 · 7 · 3 · 7 · 6). Wave 1 found two rows with no `count`; this family has zero. No `count: 99`
derivation was needed anywhere, because every declared count is exact and green.

| Module · rows | Declared `expect` | `token` verdict | `messageIncludes` verdict |
| - | - | - | - |
| `chrome` mF0..mF4 (5) | `{count:1, token, messageIncludes}` ×5 | `token` is the DECLARED NAME (`xChrome`/`bChrome`/`railChrome`) — per-finding | **PROVEN discriminating** (transplant below) |
| `section` mF0..mF6 (7) | `{count:1, token, messageIncludes}` ×7 | declared name, plus `sections` for the god-map arm — per-finding | **PROVEN discriminating** |
| `modal` mF0..mF8 (9) | `{count:1, token, messageIncludes}` ×9 | declared name / `modals` — per-finding | **PROVEN discriminating** |
| `config-group` mF0..mF7 (8) | `{count:1, token, messageIncludes}` ×8 | declared name / the `import` keyword — per-finding | **PROVEN discriminating** |
| `warning-code` mF0..mF6 (7) | `{count:1, token, messageIncludes}` ×7 | the TUPLE MEMBER literal WITH quotes (`"never_emitted"`) — per-finding | carries the member name (`Member: "never_emitted"`) — per-finding by construction |
| `message-kind` mF0..mF2 (3) | `{count:1, token}` ×3, mF0 adds `messageIncludes` | the AXIS NAME (`memory`/`wire`/`prompt`) — per-finding | **PROVEN discriminating** |
| `placeholder` mF0..mF5 (6) | `{count:1, token, messageIncludes}` ×6 | declared name — per-finding | **PROVEN discriminating** |

**The transplant round.** Each module emits from ONE `report.node` call site but composes
`` `${MESSAGE} ${detail}` `` with a per-arm detail, so the sibling-arm risk wave 1's D3 found is live in
principle. I moved each row's sole message discriminator onto a sibling arm's text. **All six FAILED**, i.e.
every discriminator is real:

```
✗ chrome-registry-completeness · mustFlag[0]        "Not co-located"            → "Duplicate id"
✗ section-registry-completeness · mustFlag[1]       "Empty planned reason"      → "Not co-located"
✗ modal-registry-completeness · mustFlag[4]         "Duplicate singleton …"     → "Duplicate id"
✗ config-group-completeness · mustFlag[3]           "lifecycle is not data"     → "Orphan collection body"
✗ placeholder-copy-registry · mustFlag[3]           "Unreadable copy"           → "Unreadable definition"
✗ message-kind-policy-coverage · mustFlag[0]        "declared on CoreMessageKindPolicy" → "declared on MessageKindPolicy"
```

The last is the sharpest control in the set: `"declared on MessageKindPolicy"` is NOT a substring of
`"declared on CoreMessageKindPolicy"`, and the row correctly refuses it.

**No tautologies found.** This is the criterion wave 1 failed worst (three of eight) and this family passes it
outright, because the per-arm detail string is composed rather than the policy-level `message` being reused.

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
construction, and each `why` states WHY the fixture is one-finding. `warning-code-coverage` and
`message-kind-policy-coverage` are the two interesting ones: the former's position is the tuple member literal
INCLUDING its quotes and the marker sits above the tuple's own declaration; the latter's finding is anchored on
a `PropertySignature` but OFFSET to the axis name, so the marker reads `(wire)` and not `(readonly)`. Both are
correct and both are stated in the `why`. **§5b.3 passes in all seven: every `fix` names the exact
`@orb-waive <id>(<position>)` spelling AND says what the position is**, and the dead-position control proves
each one binds.

## PRISTINE per module — eight verdict blocks, seven criteria each

Legend: **P** pass · **F** fail · **N/A** does not bind · **NE** not evaluated.

### 1. `chrome-registry-completeness` — REFUTED (criteria 1, 5, 6)

1. **F** — D1: `:83` asks `ctx.relativePath` a question it may not be able to answer. `facts`/`resources`
   explicit, no `ctx.checker()`, no `getType()`, and `analysis: "types"` is honest (the provider resolves type
   identity). `execution: "entire-population"` is honest — a cross-file duplicate-id verdict cannot compose
   over a subset.
2. **P** — five per-arm details, each true of what it anchors, each PROVEN to discriminate.
3. **P** — `FIX` names `@orb-waive chrome-registry-completeness(<position>)` and states the position is the
   DECLARED NAME, "never the zone or the `mobile` field the message names". Dead-position control proves it.
4. **P** — family `registry-definitions`, reader `lib/registry-fact.ts` + `lib/registry-definition-{anchor,field,home}.ts`,
   all named; `tupleVocabularyFact` correctly called a shared PRIMITIVE rather than a second family.
5. **F** — the header is excellent (two-denominator rationale, the #942 drift, the assembler-by-type boundary);
   the ROSTER row `:160` refutes the header on the subject-identity clause (D2).
6. **F** — §4.2 arm PROVEN; §4.5 refusal pin present and strong (`registry-family.test.ts:242`); every
   `mustFlag` carries an exact `count`. But two of three narrowings are UNENFORCED (population, the
   unreadable-id gate).
7. **P** — `gate:contract` zero; no walk, cache, table, marker parser or fs read.

### 2. `section-registry-completeness` — REFUTED (criterion 1 only) — the best module in this batch

1. **F** — D1 at `:119`. Everything else in criterion 1 is clean.
2. **P** — seven per-arm details, PROVEN to discriminate.
3. **P** — `FIX` names the spelling AND both position shapes (`xSection`, `makeXSection`) AND the god-map arm's
   different position (the JSX attribute name `sections`).
4. **P** — family + readers named; the route-import arm's split into `route-imports-no-feature` is recorded
   with its reason (one authority per policy).
5. **P** — header records the family, the reader, the byte-identical population port with the legacy SHA
   (`dd862e988^`), the M3 factory amendment, and WHY the ROUTES fence stays inside the arm rather than in the
   population. Roster row `:114` matches. This is the densest honest header in the batch.
6. **P** — §4.2 arm PROVEN; **all four narrowings ENFORCED**, and the two fence rows' `why` strings each name
   the row that dies — verified correct. §4.5 pin present (`registry-family.test.ts:134`). All seven `mustFlag`
   rows carry exact counts.
7. **P**.

### 3. `modal-registry-completeness` — REFUTED (criteria 1, 5)

1. **F** — D1 at `:171`.
2. **P** — nine per-arm details; PROVEN to discriminate.
3. **P** — same shape as `section`, including the god-map arm's separate position.
4. **P**.
5. **F** — the module header is very good, including the rare and valuable negative claim that the opener
   prefilter is a candidate filter and not a narrowing (**which I verified true**). The roster row `:161`
   describes a planned-wiring-a-real-body arm the module cannot execute (D2).
6. **P** — §4.2 arm PROVEN; **all four narrowings ENFORCED**, two of them naming their own dying row
   correctly; §4.5 pin present; nine exact counts. `mustPass[9]`'s parenthetical ("the empty reason RETURNS
   `refused`, so the surface-reachability arm never adds a second") is directly proven by the r6 cut.
7. **P**.

### 4. `config-group-completeness` — REFUTED (criteria 1, 5, 6)

1. **F** — D1 at `:143`. Three denominators, all declared and never summed — the right shape, and the two
   `facts:` entries are both read.
2. **P** — eight per-arm details across five arms; PROVEN to discriminate.
3. **P** — `FIX` names the spelling, the declared-name position, and the host-import arm's different position
   (the `import` keyword).
4. **P**.
5. **F** — the header is strong and records the anchor arm's split; the roster row `:165` asserts a
   `fileLoaded` door the module does not have (D2).
6. **F** — §4.2 arm PROVEN; four of five narrowings ENFORCED (the two-hop `ESCAPING_RELATIVE` fence correctly
   names its own dying row); eight exact counts. But `canonical.kind !== "project"` is UNENFORCED, and there is
   **no §4.5 refusal/receipt pin for this policy at all** — including for the HOST denominator its own header
   says exists to stop a silent retirement (D6; I probed it and it is sound).
7. **P**.

### 5. `warning-code-coverage` — REFUTED (criteria 1, 5, 6)

1. **F** — D1 at `:156`, and here the population mismatch with `tupleVocabularyFact` is structural, not
   incidental (D1 table). Otherwise the contract is minimal and honest.
2. **P** — one message plus a per-finding `Member: "<code>" of <TUPLE>` suffix and a per-channel `Scope:` in
   the `fix`. Both are per-finding by construction.
3. **P** — the best `fix` in the batch on the position question: it states the position is the quoted literal
   INCLUDING its quotes and that the marker goes on the line above the tuple's own declaration. Both halves
   proven by `mustPass[4]` and my dead-position control.
4. **P** — singleton DECLARED **with its reason**, and the reason prices the alternative (three unrelated
   families read `tupleVocabularyFact`, so it is a primitive and not a family key). This is the §5b.4 standard.
5. **F** — header is excellent (two channels, home binding, the #1440 mapper tripwire and its
   loud-false-accusation failure mode, the deleted DEFERRED tables, the lossless population narrowing with its
   legacy SHA). Roster row `:196` names the wrong reader and none of it (D2).
6. **F** — §4.2 arm PROVEN; the home fence and the emit-scope fence are ENFORCED and each names its own dying
   row correctly; §4.5 refusal pins are the strongest in the batch (a three-arm `test.each` PLUS a positive
   control that the withholding is the rebinding and not the fixture, `registry-family.test.ts:230`); seven
   exact counts. But **three of five in-module narrowings are UNENFORCED** — the chat-emitter channel gate, the
   pushed-record `message` requirement, and the vocabulary home binding (the last legitimately lives in the
   family test, so two are real gaps).
7. **P**.

### 6. `message-kind-policy-coverage` — REFUTED (criteria 4, 5, 6)

1. **P** — `facts: []` and `resources: []` explicit; `analysis: "types"` honest (`readAxes` calls `.getType()`
   at `:70` to resolve inherited members, which is the whole point of the #947 split); the one `ctx.relativePath`
   call is on a VISITED file, so it is out of the D1 class. `execution: "entire-population"` is honest — an
   axis-coverage verdict over a subset would report every axis uncovered.
2. **P** — one message plus a per-finding `` Axis: `<name>`, declared on <Interface> `` suffix; PROVEN to
   discriminate, including against the near-substring of its own base interface.
3. **P** — `FIX` names the read; `mustPass[4]`'s `why` explains the offset that makes the position the axis
   name. Dead-position control proves it binds.
4. **F** — D3: singleton with no declared reason, and no family line at all.
5. **F** — D3 (no family, no population port, no marker census) plus D2 (roster row `:327` describes three
   retired mechanisms).
6. **F** — §4.2 arm PROVEN; §4.5 refusal pins present and good (three, in a dedicated file, covering the
   unresolvable `extends`, the receipt-as-denominator, and the renamed record); three exact counts. But **four
   of five narrowings are UNENFORCED**, and `mustPass[3]`'s `why` claims one of them (D4).
7. **P**.

### 7. `placeholder-copy-registry` — CONFIRMED (one nit)

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
   legacy SHA `577d03d63^`. It also states the fail-closed posture and why. **Nit:** the roster row `:168` is
   stale in two substantive places (D2) — a coupled site this module owns, but not a module defect.
6. **P** — §4.2 arm PROVEN; six exact counts; the absent arm ENFORCED. Two narrowings are UNENFORCED
   (population — inert here for the reason given in Sweep A's note — and the description half of the pair key);
   neither is a claim the module makes anywhere, so §4.1's "a narrowing is a claim" does not bite. **A `mustFlag`
   for two sections sharing a title with different descriptions would close the second.** No §4.5 pin (D6), but
   the denominator is PROVEN sound by probe.
7. **P** — `gate:contract` zero.

**This and `section-registry-completeness` are the two I would hand a conversion lane** — `placeholder` today,
`section` once D1 lands.

### 8. `home-tile-registry-completeness` — NOT A SUBJECT (legacy)

1..7. **N/A — §5b does not bind an unconverted module.** It is a `GateDescriptor` with `scopeSafety`, a `run`
hook, `ctx.project.getSourceFiles()` (`:157`), `getDescendantsOfKind` (`:135`), the legacy `at:`/`files:` proof
shape and `expect: { token }` with no `count`. `pnpm gate:contract` files five findings against it and zero
against the other seven. Its roster row `:163` accurately describes what it does today.

**As a conversion candidate it is well-positioned:** four arms that map cleanly onto the family's existing
shapes, and `registryDefinitionFacts` already has six kinds — a seventh (`home-tile`) would put it in the
`registry-definitions` family with the same reader, the same co-location helper, the same anchor and the same
`@orb-waive` position (the declared name). The one thing to carry across is that its current arms key on
`typeNode.getText().startsWith("HomeTileContribution")` — a HEAD-TEXT match, which is exactly what the shared
fact's canonical-type identity replaced in `chrome` (and which the chrome SHADOW CONTROL row exists to pin).

## Red triage — `pnpm test:scoped tests/tooling/verify/gates/` (6 failures in 4 files)

A scoped red is never baseline, so each is attributed.

- **Contention, not regressions (4 tests in 3 files).** `drizzle-registry-conversion.test.ts` (×2),
  `grant-liveness-family.test.ts`, `runner-config-path-liveness.int.test.ts` — all four failed with
  `Test timed out in 5000ms` (the per-test default). Re-run ALONE: **3/3 files PASS, exit 0.**
- **Pre-existing, other lane's scope (2 tests).** `caught-failure-ownership.repo.int.test.ts` — the committed
  `.catch` census in `packages/client/**` has drifted from a fresh derivation. That is the `ledgers:fresh`
  class, untouched by anything in this family and not reachable from any gate module I read. **Not mine, not a
  finding of this audit**; I did not triage its origin.

**Both family tests covering my subjects PASSED**: `registry-family.test.ts` 10/10, 15.7 s;
`message-kind-policy-coverage.test.ts` 3/3, 1.5 s.

## What I did NOT cover

- **`home-tile-registry-completeness` was not audited against §5b** — it is legacy (premise correction 1) and
  §5b binds converted modules. I read it in full and characterised it as a conversion candidate only.
- **I did not run the §4.6 conversion differential** for any subject. `drizzle-registry-conversion.test.ts` is
  the only committed differential in `tests/tooling/verify/gates/` and it covers none of these eight. Whether
  each conversion's population is byte-identical to the legacy predecessor named in its header (`9055cfe6a`,
  `dd862e988^`, `577d03d63^`, `58370d705^`, `ed8b96aef`) is UNVERIFIED — I took the headers' port claims on
  trust, which is exactly the class of claim wave 1's doctrine says ages.
- **I did not cut every narrowing.** Three are unevaluated: `chrome`'s `vocabulary.kind !== "resolved"` withhold
  (`:127`) and `message-kind`'s equivalent `iface === undefined` withhold (`:226`) are fail-CLOSED guards whose
  enforcement is the receipt, and both are pinned by real §4.5 tests, so cutting them measures the runtime
  rather than the module; `warning-code`'s `isWarningsSink` alias walk (`:89-103`) has a declared `mustPass[0]`
  and a `mustFlag[2]` counterfactual on both sides, which is §4.1 satisfied without a cut.
- **I did not audit the shared readers** (`lib/registry-fact.ts`, `lib/registry-definition-{anchor,field,home}.ts`,
  `lib/tuple-vocabulary-fact.ts`, `lib/reference-fact.ts`, `lib/reference-fact-call.ts`,
  `lib/static-authored-value.ts`) for the §5b.7 "private reader wearing a shared reader's clothes" shape. Each
  visibly has ≥2 consumers across this family, but I did not count consumers with `pnpm ast`.
- **The D1 real-tree half is UNMEASURED by me.** `check:structure` says `0 tool error(s) · 0 withheld` today,
  which proves no subject is blinded RIGHT NOW; it does not prove the escape is unreachable on a future tree.
  What IS proven is that an ordinary in-repo fixture reaches it in five of five.
- **I did not run CT, e2e, biome or typecheck.** This lane modified no tracked code.
- `tests/tooling/check-gates.repo.int.test.ts` was not run (it is the orchestrator's, and not concurrency-safe
  with itself).

## Proposed memory lessons (the orchestrator owns the write)

**Index line:** `- [a fence row that states its own cut result is the cheap §4.1 mechanism](fence-row-states-its-own-cut-result.md) — "deleting X REDS this row" in a why is verifiable in one probe, and the modules that write it are the ones with zero unenforced narrowings`

Body: The two modules in the registry/completeness family with 4-of-4 narrowings ENFORCED
(`section-registry-completeness`, `modal-registry-completeness`) are the two whose fence rows' `why` strings
name the cut and its consequence — "Deleting the `startsWith(ROUTES)` guard flags this component and REDS this
row — without it the fence is a claim the positives never visit". The modules with 1-of-5 and 2-of-5
(`message-kind-policy-coverage`, `warning-code-coverage`) do not use the idiom. The correlation is not luck:
writing the sentence forces the author to run the cut, and it converts §4.1 from an audit obligation into a
one-command check any later reader can re-run. Verify it, don't trust it — every such claim in this family was
re-cut and all were TRUE, but the inverse failure (a `why` naming a narrowing the row does not prove) is the
recurring defect, seen in `no-raw-matchmedia`'s `mustPass[1]` (wave 1 D6) and again in
`message-kind-policy-coverage`'s `mustPass[3]`.

**Index line:** `- [ctx.relativePath escapes the population through an ORDINARY cross-package import](relativepath-escapes-without-node-modules.md) — the #1972 class needs no .d.ts; a sibling @orb package one import away reproduces it in a proof row`

Body: §12.3 documents `ctx.relativePath` as partial and illustrates the class with a `node_modules` `.d.ts`,
which reads as exotic. It is not. A `mustPass` fixture whose subject's initializer is imported from
`packages/ui/src/...` while the policy's population is `@client` throws
`PASS TOOL ERROR [evaluate] source file is outside the effective population` in the conformance runtime —
reproduced in four registry policies at their `object.getSourceFile()` site plus `warning-code-coverage` at its
`fact.symbol.declaration.getSourceFile()` site. The warning-code case is the general lesson: **a fact provider
whose population is a strict SUPERSET of its consumer's hands that consumer nodes it cannot name**
(`tupleVocabularyFact` is `@client`+`@server`+`@contracts`; `warning-code-coverage` is `@server`+`@contracts`),
so the mismatch is a property of the PAIR and should be checked whenever a policy declares `facts:`. A two-file
`mustPass` row is the whole probe; the fix is the total idiom
`canonical.sourceFile.getFilePath().replaceAll("\\","/")`, never a `ctx.files` membership test (that reads
clean under every `--scope` run).

**Index line:** `- [a DENSE roster row can be dense about the legacy implementation](dense-roster-row-describes-the-legacy-gate.md) — worse than a bare label, because a lane reads it as a specification`

Body: Wave 1's D9 found four `Core-Enforcement-Active-Gates.md` rows left as bare pre-conversion labels. The
registry/completeness family has zero of those and five of the inverse: long, specific, confident rows
describing mechanisms the converted module deleted — a `DEFERRED` table and a mode-B anchor guard
(`message-kind-policy-coverage`), a `*-section.*` filename population and a `non-literal-copy` skip that is now
a fail-closed finding (`placeholder-copy-registry`), a `fileLoaded(compose/authed-app.tsx)` door that appears
zero times in the module (`config-group-completeness`), an "annotation head" subject the module's own shadow
control refutes (`chrome-registry-completeness`), and the wrong shared reader (`warning-code-coverage`). The
check is mechanical and cheap: for every noun of ART in the roster row — a helper name, a table name, a file
regex, a skip label — grep the converted module for it. A row clause that names something absent from the
module is a defect in the same class as a stale fixture, and the conversion commit is where it should have
died.

## Issue summary for #1584

A fresh-context Opus verifier audited the eight-module registry/completeness family against §5b's seven
criteria, ran the mandatory §4.1 narrowing sweep (30 cuts across nine `cp`/`mv` probe rounds) and the #1968
expectation sweep (all 45 `mustFlag` rows), and **REFUTES five, CONFIRMS one, and refuses the eighth as out of
scope**. First, a premise correction: **`home-tile-registry-completeness` is LEGACY, not converted** —
`GateDescriptor` + `scopeSafety` + `run` + two direct walks, and `pnpm gate:contract`'s five subject-named
findings ALL belong to it (zero for the seven final modules), so §5b does not bind it; it is a good conversion
candidate for the `registry-definitions` family. **`check:policy-conformance` reproduced the brief's headline
exactly — 271 modules / 167 final / 1,662 rows / 0 failures / exit 0 — before and after every probe, and
`gate:contract` is 761, unchanged.** The brief's sharpest item is **CONFIRMED and upgraded from latent to
reproduced**: the #1972 `ctx.relativePath` escape fires in **five of five** predicted modules, and it needs no
`node_modules` `.d.ts` — an ordinary `packages/ui/src/...` import one hop from `@client` produces
`PASS TOOL ERROR [evaluate] source file is outside the effective population` in `chrome`, `section`, `modal` and
`config-group` at their RESOLVED-object site, and in `warning-code-coverage` at its tuple-symbol site, where the
exposure is STRUCTURAL: `tupleVocabularyFact`'s population (`@client`+`@server`+`@contracts`) is a strict
SUPERSET of its consumer's (`@server`+`@contracts`), so the provider hands the policy nodes it cannot name. The
declaration sites are SAFE in all five (the registry fact's population is byte-identical to its consumers'), so
the fix is the §12.3 total idiom at exactly five call sites. **This family is markedly cleaner than wave 1's
exemplars on everything wave 1 found rotten: all 45 `mustFlag` rows carry an exact `count` (wave 1: two
missing), all six `messageIncludes` discriminators PROVE discriminating under a sibling-arm transplant (wave 1:
three tautologies), and all seven §4.2 identity arms alarm under a planted dead-position control.** Unenforced
narrowings are 12 of 30 (40%, the same rate) but concentrated rather than spread: `section` and `modal` are 4/4
and 4/4 enforced — and each of their fence rows' `why` strings names the exact row that dies, every one
verified TRUE — while `message-kind-policy-coverage` is 1/5 and `warning-code-coverage` 2/5. Also filed:
`message-kind-policy-coverage` has **no family line and no population-port line at all** (§5b.4/§5b.5; its
sibling `warning-code-coverage` declares its singleton WITH its reason and is the standard to copy), and its
`mustPass[3]` `why` claims a narrowing that survives deletion — the recurring wave-1-D6 shape; **five of eight
roster rows in `Core-Enforcement-Active-Gates.md` are dense about the LEGACY implementation** (a `DEFERRED`
table and mode-B anchor guard at `:327`, a `*-section.*` population and a `non-literal-copy` skip at `:168`, a
`fileLoaded(compose/authed-app.tsx)` door that appears zero times in the module at `:165`, an "annotation head"
subject the module's own shadow control refutes at `:160`, and the wrong shared reader at `:196`) — the inverse
of wave 1's bare-label defect and worse, because a lane reads a dense row as a specification; and
`config-group-completeness` and `placeholder-copy-registry` carry **no §4.5 refusal pin**, including for
config-group's third declared denominator whose stated purpose is that "a renamed host cannot silently retire
its import arm" — I probed both and **both withhold correctly** (`policy receipt refused: population "config
content host" resolved zero members`), so these are missing pins rather than broken guards. **CONFIRMED clean:
`placeholder-copy-registry`** — the only module in the batch with no `ctx.relativePath` call site at all, and
the one I would hand a conversion lane today; **`section-registry-completeness` is the one to hand a lane once
D1 lands.** Per the brief I ran **`pnpm check:structure` once, alone** — the instrument wave 1 skipped: `0 tool
error(s) · 0 withheld`, `271/271 active gate(s)`, run COMPLETE, with all eight subjects `✓` at non-zero
real-tree populations. **Nothing in this family is blinded or withheld on the real tree today**, which is what
makes D1 a fix-before-copy rather than a fix-now. Scoped suite: 53/57 files passed; the 4 timing-out tests pass
3/3 on a quiet re-run, and the 2 remaining reds are `caught-failure-ownership`'s census drift, another lane's
scope.
