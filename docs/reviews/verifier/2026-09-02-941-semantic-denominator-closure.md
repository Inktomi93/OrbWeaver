---
kind: review
status: active
updated: 2026-09-02
---

# #941 semantic-denominator program — closure verification

Lane `p-941-closure`, isolated worktree at `.claude/worktrees/agent-ae4dbf949d2b5d82d`, tree at
`718e97ab3`. Adversarial re-verification of the #941 Done text against the tree, with every receipt
produced in this session. Nothing was fixed; every probe was restored (`git status --short` empty after
each batch — `plant-status.txt` / `restored-status.txt` etc. in the lane scratchpad).

## Verdict — REFUTED (narrowly, and not on the three named escapes)

The three current escapes (#934/#942/#943) are genuinely closed, each with a live census receipt AND a
planted regression I produced. The eight Drizzle-column gates, the six imported-initializer gates and
five of the seven latent gates hold. **The claim fails on its own universal quantifier**: two of the 24
audited gates still silently under-read a composition shape their source law sanctions — they neither
follow it nor fail closed, and they carry no declared-limit row for it. Four planted controls prove it,
each paired in the SAME run with the byte-equivalent inline spelling that REDs.

| # | Gate | Shape silently dropped | Receipt |
| - | - | - | - |
| G1 | `chat-viewer-plane-canon-reads` | a `CHAT_VERB_AUTHORITY` row whose value is a const identifier, not a string literal | census 93 → 92, gate ✓, no refusal |
| G2 | `knob-wire-coverage` arm A | an `EffectiveAppConfig` field INHERITED through `extends` | inline field REDs, inherited field silent |
| G3 | `knob-wire-coverage` arm B | a `USER_SETTINGS_SECTIONS` member arriving through a tuple SPREAD | inline member REDs, spread member silent |
| G4 | `knob-wire-coverage` arms B2 + C | an `appSettingsSchema` key arriving through an object SPREAD | inline key REDs (B2 and C), spread key silent, `leaves` short by one |

G1 is the higher-consequence one: it is a credential/transcript-visibility gate.

## What I ran

| Run | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates tests/tooling/gate-conformance.int.test.ts tests/tooling/verify/lib/tuple-read.test.ts tests/tooling/_shared/schema-read.test.ts --maxWorkers=4` | 30/32 files pass, 273/275 tests; the 2 reds were 5000ms hook timeouts at load-avg 17-20 on `css-selector-has-a-writer` + `test-presence-client`, both OUTSIDE the 24 |
| the same two suites re-run quiet (load-avg 11.16, `--maxWorkers=2`) | 16/16 pass in 2.61s — contention flakes, not a verdict |
| `tests/tooling/gate-conformance.int.test.ts` (inside the above) | ✓ "every contract-form gate's mustFlag/mustPass proofs hold" — this is the run that makes every planted split control below a live pin, not a source claim |
| `tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` | ✓ every row declaring itself a mirror matches its descriptor byte-for-byte |
| `pnpm check:structure` clean (baseline) | exit 0, 248/248 active gates, run COMPLETE |
| `pnpm check:structure` × 3 probe batches | exit 1 each, findings quoted below |

`pnpm check` / `pnpm test` whole-tree were not run (banned in lanes).

## The three named escapes — planted-regression receipts

All three planted in one batch, one `check:structure` pass, then restored with `git show HEAD:<path>`
(the `__probe` file `rm`'d). Baseline census for each is from the clean run above.

**#934 `knob-wire-coverage`, 41 Appearance leaves.** Clean census
`settings graph [contracts=1 sources=2 leaves=166 appearanceLeaves=41]`. Planted
`ghostAppearanceProbe: z.boolean()` in `packages/contracts/src/settings/appearance.ts` (the IMPORTED
sub-schema, never `settings/index.ts`). Result: census moves to `leaves=167 appearanceLeaves=42` and the
gate REDs `knob-wire-coverage[C:ghostAppearanceProbe]: settings schema leaf "ghostAppearanceProbe" is
READ by nothing`. `appearance-carrier-contract` independently went `41/42 appearance keys` with two
findings. The imported leaves are in the denominator.

**#942 `no-parallel-section-map`, the four chrome zones.** Clean census
`CHROME_ZONES=4 from packages/client/src/state/chrome-registry.ts#CHROME_ZONES+packages/client/src/state/section-registry.ts#RAIL_ZONES`.
Planted `packages/client/src/features/__probe/lib/hand-rail.ts` with a two-element array over
`rail.nav` + `rail.brand` — the two zones that reach the vocabulary ONLY through the imported
`RAIL_ZONES` spread. Result: RED `packages/client/src/features/__probe/lib/hand-rail.ts:1:27
chrome-array`. Under the pre-#942 direct-element reader this map was invisible.

**#943 `contract-verb-presence`, five inherited workload verbs.** Clean census
`service verb [interfaces=29 local=546 inherited=5 total=551]` — the five are `WorkloadScheduleService`'s.
Neutered every service-receiver call of `setScheduleEnabled` in
`tests/server/domain/workloads/verbs/set-schedule-enabled.int.test.ts`. Result: RED
`workloads.setScheduleEnabled (declared on WorkloadScheduleService) — the *Service interface declares
this verb but no test in its domain tree invokes it`, anchored on `contract/service.ts` and naming the
DECLARING base. The inherited verbs are obligations.

## The 24-row table

Reader = today's `path:line`. "Pin" = the permanent planted control, all executed green by
`gate-conformance.int.test.ts` in this session. Population = the gate's own `ctx.scan` line from the
clean `check:structure` run.

### Tier A — the three current escapes

| Gate | Reader | Sanctioned shape → status | Pin | Population |
| - | - | - | - | - |
| `knob-wire-coverage` | arm C `:479` → `settingsLeaves` imported source manifest | imported schema module → FOLLOWED; missing binding / unsupported composition / cycle / zero leaves → FAILS CLOSED. **Arms A/B/B2/E/F: see G2-G4 below** | `:778` red / `:853` green | `contracts=1 sources=2 leaves=166 appearanceLeaves=41` |
| `no-parallel-section-map` | `:36` → `lib/tuple-read.ts` `readTupleVocabulary` | literal element + local/imported spread → FOLLOWED; any other element, unbound identifier, cycle, zero-member spread → FAILS CLOSED (throw ⇒ exit-2 ToolError) | `:432` red / `:518` green | 4 vocabularies incl. `CHROME_ZONES=4` from two declarations |
| `contract-verb-presence` | `:252` `iface.getType().getProperties()`; `:231` heritage refusal | interface inheritance through imports → FOLLOWED; an `extends` resolving to nothing, a member with no declaration → FAILS CLOSED | `:385` red / `:457`,`:466` green | `local=546 inherited=5 total=551` |

### Tier B/D — latent semantic-member gates

| Gate | Reader | Sanctioned shape → status | Pin | Population |
| - | - | - | - | - |
| `tooling-instrument-proof` | `:87` `readTupleDeclaration` | tuple spread → FOLLOWED / else FAILS CLOSED | `:281` red / `:358` green | `INSTRUMENT_TOOLS=9 from tooling/src/_shared/instruments.ts` |
| `warning-code-coverage` | `:64` `readTupleDeclaration`, per channel | tuple spread → FOLLOWED / else FAILS CLOSED | `:263` + `:277` red (both channels) / `:331` green | `WARNING_CODES=12` · `CHAT_WARNING_CODES=13` |
| `duplicate-action-doors` | `:102` `readTupleDeclaration` | tuple spread → FOLLOWED / else FAILS CLOSED | `:346` red (pins the derived PLANE token) / `:379` green | `SECTION_IDS=10` |
| `chat-viewer-plane-canon-reads` | `:191` `foldMatrix` / `:230` `readMatrix` | object spread, local + imported, alias hops, precedence → FOLLOWED; unsupported matrix expression, unbound binding, cycle, zero-verb spread → FAILS CLOSED. **A non-literal property VALUE → GAP G1** | `:568` red / `:673` green | `CHAT_VERB_AUTHORITY=93 from …matrix.ts#CHAT_VERB_AUTHORITY` |
| `message-kind-policy-coverage` | `:96` `iface.getType().getProperties()` | interface inheritance → FOLLOWED; unresolvable heritage / member with no declaration → FAILS CLOSED. Single-literal axis = declared limit with its own `mustPass` (`:283`) | `:241` red / `:272` green | `local=3 inherited=0 total=3` |
| `bus-payload-allowlist` | `:111-194` identity walker + field walker; `:148` `readTupleDeclaration` | `extends` bases, intersections, aliased union arms, imported zod arms, `.extend`/`.merge`/`.shape` spreads, merged declarations, §5.5 mapped distribution → FOLLOWED; unresolvable base/schema, open key space, non-finite constraint, any unmodelled type node in EITHER walker → FAILS CLOSED. Four declared limits, each a `mustPass` (`:1240`, `:1260`, `:1266`, `:1271`), and `refPayloadsNotFollowed` MEASURES the non-transitive boundary | `:1068`, `:1077`, `:1083`, `:1119`, `:1126`, `:1154`, `:1161`, `:1167`, `:1173`, `:1179`, `:1185` red / `:1216`, `:1249` green | `events=10 local=238 inherited=10 carriers=2 refPayloadsNotFollowed=127 distributions=1` |
| `section-factory-contribution-bundle` | `:62-85` `denotesRegistry` symbol/alias resolution | type-alias chain (local + imported) → FOLLOWED; alias cycle, chain past `MAX_ALIAS_HOPS` → FAILS CLOSED; a parameter type the project graph does not DECLARE = declared limit with `mustPass` `:323` (the pre-#947 row that BLESSED the alias escape is now a `mustFlag`) | `:267` red / `:318` green | `factories=4 registryParams=2 aliasResolved=0` |

`aliasResolved=0` is honest: the live tree writes no aliased registry param. The blindness tripwire
(`:307`) covers the "no subject at all" direction.

### Tier C — imported definition-initializer gates (fail closed by design)

All six: an import/builder initializer is REPORTED, never skipped; an `as`/`satisfies` wrapper and
same-file indirection still RESOLVE (`lib/ast-read.ts` `readObjectLiteral`), each written down as a
`mustPass`.

| Gate | Reader | Pin | Population |
| - | - | - | - |
| `section-registry-completeness` | `:168` `lib/section-defs.ts` `sectionDefsIn` | `:305` red / `:348` green | `SectionDefinition: 10 member(s)` |
| `modal-registry-completeness` | `:185` `readObjectLiteral` | `:298` red / `:324`, `:329` green | `ModalDefinition: 11` |
| `chrome-registry-completeness` | `:139` `readObjectLiteral` + `:27` `readTupleVocabulary` for the zone axis | `:263` red, `:249` blindness tripwire, `:275` the `rail.brand` false-accusation fix / `:334`, `:344` green | `CHROME_ZONES=4` · `ChromeEntry: 5` |
| `config-group-completeness` | `:273` `literalInit` → `readObjectLiteral` | `:583`, `:594`, `:605` red — three fixtures, one per accumulator / `:654`, `:660` green | `CollectionContribution: 4` · `ConfigGroupDefinition: 13` · `ConfigSectionContribution: 47` |
| `placeholder-copy-registry` | `:130` `sectionDefsIn` (const AND `make<X>Section` factory) | `:180`, `:190` red / `:217` green | `10/10 sections · skipped 1 (non-literal-copy)` |
| `modal-body-not-placeholder` | `:79` `readObjectLiteral` | `:116` red / `:133`, `:138` green | `ModalDefinition: 11` |

The audit's "adjacent drift" is fixed too: `chrome-registry-completeness` no longer hand-copies the zone
list, it derives all four through `tuple-read` (the `rail.brand` legitimate-entry false accusation has
its own `mustPass` at `:275`).

### Tier B — the eight imported-Drizzle-column gates

All eight consume `@orb/tooling/_shared/schema-read` (`columnProperties` / `schemaTables` /
`schemaScan`). The reader follows a local or imported object-literal binding through alias hops and
object spreads, answers EVERY member kind (property, shorthand through its binding, computed literal
key, spread) and REFUSES loudly on anything else, on an unresolvable binding, on a cycle, and on a
binding resolving to zero columns. Each gate carries BOTH a `#945` imported-columns red and a `#1035`
shorthand red plus a green twin.

| Gate | Reader import | Pins (red / green) | Population |
| - | - | - | - |
| `asset-refs-fk-coverage` | `:11` | `:281` / `:268` / `:312` | `tables=97 resolvedColumns=848` · drizzle columns 848 |
| `fk-columns-indexed` | `:38` | `:101` / `:90` / `:175`, `:210`, `:221` | same |
| `json-column-write-parity` | `:60` | `:756` / `:740` / `:878`, plus two fail-closed rows `:831`, `:857` | + `defineVersionedConfig owners: 3` · `versioned-config columns: 2` |
| `lifecycle-portability` | `:28` | `:527` / `:518` / `:543`; declared limit `:549` (FK-inherited ownership) | same |
| `no-untyped-soft-ref` | `:11` | `:176` / `:168` / `:192` | same |
| `ownerid-registry` | `:11` | `:151` / `:143` / `:167` | same |
| `schema-banned-shapes` | `:11` | `:314` / `:306` / `:379` | same |
| `schema-branding` | `:13` | `:162` + `:171` (both legs) / `:154` / `:191` | same |

Population declaration (claim item 3): **24 of 24** print a semantic census on their `check:structure`
row, not merely a file count.

Docs (claim item 5): every row I read in `Core-Enforcement-Active-Gates.md`
(`:94`, `:109`, `:152`, `:155`, `:189`, `:274`, `:285`) names the resolution behaviour, the refusals and
the declared limits; `enforcement-registry-parity.int.test.ts` proves the mirror rows are byte-identical
to their descriptors. The gate headers I read carry the same boundary text. The four GAPs below are
absent from both the headers and the registry rows — they are unrecorded, not declared.

## The GAP rows (residuals)

Every one is a paired control in a SINGLE `check:structure` run: the inline spelling REDs, the composed
spelling is silent — so this is not "the gate was already off".

### G1 — `chat-viewer-plane-canon-reads`: a non-literal matrix VALUE silently drops the verb

`foldMatrix` (`tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts:191-213`) resolves
`SpreadAssignment` and reads `PropertyAssignment` whose value unwraps to a `StringLiteral`. **Every other
member kind falls out of the loop with no throw and no count** — a shorthand, a computed key, or a value
that is a const identifier.

Probe: in `packages/server/src/domain/chat/substrate/auth/matrix.ts`, `getChat: "member"` →
`getChat: MEMBER_AUTHORITY_PROBE` with `const MEMBER_AUTHORITY_PROBE = "member" as const;` beside it —
a shape that still satisfies the born-compliant `Record<keyof ChatService, …>` typing.

Result: `✓ chat-viewer-plane-canon-reads · scanned 131/6527 files · 1/1 authority matrix [CHAT_VERB_AUTHORITY=92 from …#CHAT_VERB_AUTHORITY]`. Green, no refusal, denominator silently 93 → 92.

Consequence: `isViewerPlane(undefined)` is `false` (`:446-447`), so at `:538-539` the verb's factory is
no longer judged for room-plane bulk canon reads at all, and the `:484-488` "no discoverable factory"
arm also stops covering it. That is the D16 transcript-visibility leak class going invisible — the same
false-negative direction the program exists to kill, in a gate the audit itself lists.

This is the member-KIND class `#1035` closed in `_shared/schema-read.ts` ("EVERY MEMBER KIND IS
ANSWERED, NONE IS SKIPPED"); the lesson was applied to the Drizzle reader and never carried to this
gate's own matrix fold.

### G2 — `knob-wire-coverage` arm A: an INHERITED `EffectiveAppConfig` field is not a subject

`interfaceKeys` (`tooling/src/verify/gates/knob-wire-coverage.ts:165-172`) returns
`iface.getProperties()` — locally declared members. No heritage resolution, no refusal.

Probe (one run, both arms of the pair): in `packages/contracts/src/settings/index.ts`,
`export interface EffectiveAppConfig extends GhostBaseProbe { readonly ghostInlineProbe: number; … }`
with `export interface GhostBaseProbe { readonly ghostInheritedProbe: number }`.

Result: `✗ knob-wire-coverage (1)` — `knob-wire-coverage[A:ghostInlineProbe]: EffectiveAppConfig.
ghostInlineProbe is resolved … but READ by no server behavior`. **`ghostInheritedProbe` appears nowhere
in the run.** The identical interface-inheritance shape is explicitly resolved-type in
`contract-verb-presence` (#943) and `message-kind-policy-coverage` (#947); arm A was left local-only.

### G3 — `knob-wire-coverage` arm B: a spread `USER_SETTINGS_SECTIONS` member is dropped

`tupleMembers` (`:155-162`) keeps only direct `StringLiteral` elements. A `SpreadElement` is dropped
with no refusal — while `lib/tuple-read.ts`, which exists for exactly this question and refuses loudly,
is already used by six other gates.

Probe: `USER_SETTINGS_SECTIONS = [...GHOST_SECTIONS_PROBE, "ghostInlineSection", …]`.
Result: RED `knob-wire-coverage[B:ghostInlineSection]`; `ghostSpreadSection` never appears.

### G4 — `knob-wire-coverage` arms B2 and C: a spread `appSettingsSchema` key is dropped

`zObjectKeys` (`:137-151`) reads the last `z.object({…})` chain's literal argument and flatMaps
`PropertyAssignment` only; a `SpreadAssignment` (or a shorthand) is dropped, and an imported schema
argument yields `[]` — silently, with no fail-closed arm. (Arm F's `chatMetadataSchema` reader is the
same function, so it carries the same hole; I did not probe arm F separately.)

Probe: `appSettingsSchema = z.object({ ...GHOST_APP_SHAPE_PROBE, ghostInlineAppKey: z.boolean(), … })`.
Result: RED `knob-wire-coverage[B2:ghostInlineAppKey]` and RED `knob-wire-coverage[C:ghostInlineAppKey]`;
`ghostSpreadAppKey` appears in neither arm, and the census reads `leaves=167` — the leaf population is
silently short by exactly the spread key.

Note the shape of the miss: arm C was re-homed by #934 for the IMPORTED-MODULE axis and still under-reads
an object SPREAD in its own local object. The gate header's "the other member sources retain paired-anchor
rename tripwires" is accurate — a rename tripwire is not a member-shape resolver, and the #941 claim reads
those arms as covered when they are not.

## Environment notes

- The two suite reds in the first battery were pure contention (load-avg 17-20, 5000ms hook timeouts,
  both green in 2.61s at load-avg 11). No environment lie was found; the clean `check:structure`
  baseline and all three probe runs printed `run COMPLETE` over 248/248 active gates.
- Every probe ran in this lane's isolated worktree, never on main. `git status --short` was empty after
  each restore.

## Issue summary for #941

Re-verified the #941 program cold on `718e97ab3` in an isolated worktree. **The three named escapes are
genuinely closed** — each has a live semantic census on its `check:structure` row AND a planted
regression I produced this session: a new leaf in the IMPORTED `settings/appearance.ts` REDs arm C and
moves the census to `leaves=167 appearanceLeaves=42`; a hand chrome array over `rail.nav` + `rail.brand`
(zones reachable only through the imported `RAIL_ZONES` spread) REDs `chrome-array`; neutering the
`setScheduleEnabled` invocations REDs `workloads.setScheduleEnabled (declared on
WorkloadScheduleService)`. `gate-conformance.int.test.ts` ran green, so every planted split control in
all 24 descriptors is a live pin, and all 24 gates declare a semantic population.
**The universal claim nonetheless fails on two gates, with four paired controls (inline spelling REDs,
composed spelling silent, same run):** (G1, P1) `chat-viewer-plane-canon-reads`'s `foldMatrix`
(`:191-213`) silently drops any `CHAT_VERB_AUTHORITY` row whose value is not a string literal — a
`getChat: MEMBER_AUTHORITY_PROBE` const reference took the census from 93 to 92 with a green gate and no
refusal, and `isViewerPlane(undefined)===false` then removes that verb from the D16 room-plane check
entirely; this is the `#1035` "answer every member kind" lesson applied to `schema-read.ts` but never to
this matrix fold. (G2-G4, P2) `knob-wire-coverage`'s non-C arms were never re-homed: `interfaceKeys`
(`:165`) drops an INHERITED `EffectiveAppConfig` field, `tupleMembers` (`:155`) drops a spread
`USER_SETTINGS_SECTIONS` member, and `zObjectKeys` (`:137`, shared with arm F) drops a spread
`appSettingsSchema` key from arms B2 AND C — each silently, each while the byte-equivalent inline
spelling REDs, and none of the four is recorded as a declared limit in the gate header or the
`Core-Enforcement-Active-Gates.md` row. Full table, receipts and probe scripts:
`docs/reviews/verifier/2026-09-02-941-semantic-denominator-closure.md`. Recommend filing G1 as the P1
residual (security-adjacent, `security-executor` or the bus/chat gate owner) and G2-G4 as one P2
knob-wire arms row, before #941 closes.

## Re-verification 2026-09-02 — CONFIRMED after #1091 + #1094

Warm leg. Branch fast-forwarded to main's tip `3b38d5b84` after proving containment
(`git rev-list --left-right --count main...HEAD` → `31 0`: nothing of mine outstanding). The two
residual fixes on main are `921f52d33` (#1091, `chat-viewer-plane-canon-reads` — the fold is now total
over member kinds) and `f93bc911d` (#1094, `knob-wire-coverage` arms A/B/B2/C/E/F through the resolved
type / `tuple-read` / one shared authored-object reader). I re-ran ONLY my own paired controls plus the
computed-key case #1094 surfaced.

**Verdict: CONFIRMED.** All four GAP rows are closed, each by the composed spelling now producing the
finding its inline twin produces, and the arithmetic of the census matches the plant exactly.

### Runs

| Run | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates/chat-viewer-plane-canon-reads.test.ts tests/tooling/verify/gates/knob-wire-coverage.test.ts tests/tooling/gate-conformance.int.test.ts --maxWorkers=4` | 43/43 pass (15 + 20 new committed pins, plus conformance still green over every descriptor) |
| `pnpm check:structure` CLEAN on `3b38d5b84` | exit 0, `single-pass: clean`, 251/251 active gates, run COMPLETE |
| `pnpm check:structure` with the probe batch | exit 1, exactly the 8 expected findings |

### Clean baseline vs. planted, same tip

| Census | Clean | Planted | Δ |
| - | - | - | - |
| `chat-viewer` `CHAT_VERB_AUTHORITY` | 93 | **93** | 0 |
| `knob-wire` `fields` (arm A) | 26 | 27 | +1 inherited |
| `knob-wire` `sections` (arm B) | 16 | 17 | +1 spread |
| `knob-wire` `appKeys` (arm B2) | 26 | 29 | +3 spread / computed / inline |
| `knob-wire` `leaves` (arm C) | 166 | 169 | +3 |
| `knob-wire` `appearanceLeaves` | 41 | 41 | 0 |

Every planted member entered its denominator by exactly one and produced its finding — the pre-fix
behaviour was the opposite (the composed member never entered the count at all).

### G1 — `chat-viewer-plane-canon-reads`: CLOSED

Planted on two VIEWER-PLANE verbs at once in
`packages/server/src/domain/chat/substrate/auth/matrix.ts`: `getChat: MEMBER_AUTHORITY_PROBE` (the
identifier-bound value that previously took the census 93 → 92 silently) and `["listForks"]: "member"`
(the computed string-literal key, which previously would have entered the map as bracket text — the
wrong-name case).

Result: `✓ chat-viewer-plane-canon-reads · 1/1 authority matrix [CHAT_VERB_AUTHORITY=93 …]`. The census
is UNCHANGED at 93 and both verbs stay classified, so their factories are still judged for room-plane
bulk canon reads. `isViewerPlane` now takes `string` rather than `string | undefined`
(`tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts`), so an unclassified verb can no longer
reach the verdict as a silent "not viewer plane" — the leak path I reported is closed by construction,
not only by the reader widening. The refuse direction (non-literal value, unbound or cyclic binding,
non-literal computed key, method, accessor) is pinned by the 15 committed cases in
`tests/tooling/verify/gates/chat-viewer-plane-canon-reads.test.ts`, which I ran green.

### G2/G3/G4 — `knob-wire-coverage`: CLOSED, and the computed-key case with them

One plant in `packages/contracts/src/settings/index.ts`, all five spellings in the same run; the inline
key is the live-arm control.

| Control | Spelling | Finding |
| - | - | - |
| G2 arm A | `EffectiveAppConfig extends GhostBaseProbe` | `knob-wire-coverage[A:ghostInheritedProbe]` |
| G3 arm B | `USER_SETTINGS_SECTIONS = [...GHOST_SECTIONS_PROBE, …]` | `knob-wire-coverage[B:ghostSpreadSection]` |
| G4 arms B2+C | `z.object({ ...GHOST_APP_SHAPE_PROBE, … })` | `[B2:ghostSpreadAppKey]` + `[C:ghostSpreadAppKey]` |
| computed key | `z.object({ ["ghostComputedAppKey"]: … })` | `[B2:ghostComputedAppKey]` + `[C:ghostComputedAppKey]` — named by the RESOLVED key, never the bracket text |
| control (inline) | `ghostInlineAppKey: z.boolean()` | `[B2:ghostInlineAppKey]` + `[C:ghostInlineAppKey]` |

Eight findings, no silent member. Each arm now also declares its own population on the scan line
(`EffectiveAppConfig` · `USER_SETTINGS_SECTIONS` · `appSettingsSchema` · `userSettingsSchema leaves`),
so a future shrink is visible per arm rather than only in aggregate.

### Restoration

Both probe files restored with `git show HEAD:<path>` (never `git stash`/`checkout`/`restore`);
`git status --short` empty after the batch. No whole-tree battery was run; two sibling lanes were live.

## Issue summary for #941 (re-verification)

Re-verified the two residual GAP rows on main's tip `3b38d5b84` after `921f52d33` (#1091) and
`f93bc911d` (#1094). **CONFIRMED — both are closed, and the program's Done text now holds for all 24
audited gates.** The 35 new committed pins in
`tests/tooling/verify/gates/chat-viewer-plane-canon-reads.test.ts` +
`knob-wire-coverage.test.ts` run green alongside `gate-conformance.int.test.ts` (43/43), and
`pnpm check:structure` on the clean tip is `single-pass: clean` over 251/251 gates. Re-planting my own
four paired controls plus the computed-key case in ONE batch: `chat-viewer-plane-canon-reads` holds
`CHAT_VERB_AUTHORITY=93` with BOTH an identifier-bound value (`getChat: MEMBER_AUTHORITY_PROBE`, which
previously took the census silently to 92) and a computed key (`["listForks"]`) planted, and
`isViewerPlane` now takes `string` so an unclassified verb cannot reach the verdict as a silent "not
viewer plane"; `knob-wire-coverage` reports all eight expected findings —
`[A:ghostInheritedProbe]` (inherited field), `[B:ghostSpreadSection]` (tuple spread),
`[B2/C:ghostSpreadAppKey]` (object spread), `[B2/C:ghostComputedAppKey]` (computed key, named by the
resolved key rather than bracket text) and the inline control — with the per-arm census moving by
exactly the planted member each time (fields 26→27, sections 16→17, appKeys 26→29, leaves 166→169,
appearanceLeaves 41 unchanged). No new gap surfaced. #941 can close on this evidence.
