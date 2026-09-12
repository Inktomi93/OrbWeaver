---
kind: review
status: active
updated: 2026-09-12
---

# Refutation ledger — which of the §5b audit's defects are still OPEN (#1584, #2012)

Program #1584's §5b audit ran **ten waves** and refuted roughly 100 of 112 audited modules across \~430 KB of
review prose. Nobody could say which of those refutations were still open, so the audit could not be used as a
work queue and every fix pass re-read the whole corpus to discover its own scope. **This file is the index:
one row per NAMED DEFECT, with the wave that found it, its class, and its state against TODAY's `main`.**

## How to read a state

| state | means |
| - | - |
| **CLOSED** | the code no longer has the shape the wave described, and the `receipt` column says which shape replaced it |
| **OPEN** | the shape is still on the tree; the `state` cell names the board row if one exists, or says none does |
| **SUPERSEDED** | the METHOD changed under the cell — a later wave re-read the same fence and reclassified it, or a gate now mechanizes the class. Not a silent drop: the reason is in the receipt |
| **UNADJUDICATED** | extracted but not checked against the tree in this session. Listed so it is findable, never so it looks covered |

**A defect's state is a question about TODAY's tree, never about what the wave said** — wave 6 reported 25
unenforced cells for `origin-client` and fifteen were genuinely open by the time a fix lane started, because a
sibling lane had already closed D1, D2 and all five of D5 (#1989/#1990). Every CLOSED row below carries a
receipt I produced in this session; every OPEN row was re-derived against `831576613`.

## Method and its limits

- Adjudicated by reading the CURRENT gate module / roster / doc, never by re-running a §4.1 cut. Where a wave's
  defect is a cut verdict, the check is **whether a `mustPass`/`mustFlag` row now exists that the cut would
  kill** — that is what the receipt column states.
- Baseline commit `831576613` (worktree `wt/agent-aff85de92a395152c`). **Wave 10 lives in an unmerged worktree**
  (`agent-a6a5469bbfac5b55d`, `fca7c9b42`); its rows are extracted from there and adjudicated against main's tree.
- **No `check:structure`, no `gate:contract`, no conformance run** — four lanes were live. Every live number
  quoted below is a RECORDED receipt from a wave or the playbook, and is labelled as recorded rather than measured.
- Adjudication order was HIGH/SEVERE first, then defects in modules named by guide §3's plane table, then the rest.

## THE LEDGER

### Wave 1 — the ten cited exemplars (`v-exemplar-audit-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `server-layout` | w1 `:153` | `mustFlag[0]` carries no `count` and tolerates **8** findings from two arms under a one-finding `why` | §4.1 narrowing | **CLOSED** | `server-layout.ts:97` is now `expect: { count: 1, messageIncludes: "illegal top-level entry" }`, and `:94-96` documents that the fixture supplies the complete legal root so the count isolates the arm |
| `no-raw-matchmedia` | w1 `:168` | the DECLARED LIMIT ("`window`/`self`/bare land on the unreadable finding") is FALSE in the header, two row `why`s and the roster | §5b.2 message | **CLOSED** | fix lane `b157bb9be`. Header `:122` now records the DEFAULT-lib/DOM measurement; `mustFlag` `:237-238` pins the precise message with the correction in its `why`; roster `:286` carries an explicit WITHDRAWN sentence |
| `ui-exports-map-complete` | w1 `:222` | `mustFlag[1]`'s sole discriminator `messageIncludes: "not"` also matches the dead-target arm | §4.1 narrowing | **CLOSED** | `:148` is now the full `exports has "./src/primitives/button/index.ts", not "./src/primitives/badge/index.ts"` string |
| `server-layout` · `ui-exports-map-complete` | w1 `:232` | the cited not-ready guard CANNOT EXECUTE (`resolveResourceDeclarations` throws in the population phase) | §5b.7 forbidden | **CLOSED** | both read through `readyResourceValue` (`server-layout.ts:58`, `ui-exports-map-complete.ts:120`) and **both headers now state that an in-module `if (fact.status !== "ready") return;` would be unreachable code** |
| `no-raw-matchmedia` | w1 `:268` | the fail-closed UNREADABLE verdict is exercised by NO row | §4.1 narrowing | **CLOSED** | `:261` `expect: { count: 1, messageIncludes: "CANNOT be established" }`; its `why` names the audit and says the row dies if `classifyOriginRefusal` fails open |
| `no-raw-matchmedia` | w1 `:284` | `mustPass[1]` does not prove the narrowing its `why` names (`isCapabilityProbe`) | §4.1 narrowing | **CLOSED** | `:280`'s `why` is rewritten: the subject moved to the `globalThis` root deliberately *"so the probe fence is the ONLY thing keeping this row green"*, and it cites the audit |
| `no-array-literal-querykey` · `no-inline-types` | w1 `:291` | ordinary `fix` names no `@orb-waive` spelling | other (§5b.3) | **CLOSED** | `no-array-literal-querykey.ts:32` and `no-inline-types.ts:55` both name the exact spelling AND the position rule |
| `no-raw-spacing-in-features` · `no-raw-typography-in-features` (+ two `-health` siblings, by import) | w1 `:305` | a legacy `ExemptionTable` from `contract/gate.ts` survives behind `defineGate` | §5b.7 forbidden | **OPEN — #1922 (Triage)** | `no-raw-spacing-in-features.ts:29,35` and `no-raw-typography-in-features.ts:29,35` unchanged. Wave 4 widened the class: **42 modules import `ExemptionTable`, NINE of them FINAL** |
| four roster rows (`:100`, `:132`, `:254`, `:256`) | w1 `:321` | bare pre-conversion labels in `Core-Enforcement-Active-Gates.md` | roster row | **CLOSED** | playbook §2b DONE table, receipt `9017baf60` ("Wave-1 exemplar audit D1–D6, D10 · **D9 roster rows (all four)**") |
| `user-bus-deferred-member` | w1 `:337` | inert `ext: ["ts","tsx"]` in an exemplar | other | **CLOSED** | no inert `ext` survives corpus-wide (only narrowing `ext: ["tsx"]` in three modules), and `policy-soundness` ARM E1 now REDS the shape on every commit (#1959, #1971) |
| the ten exemplars | w1 `:445` | `exemplars-2026-09-11.md` asserts "Wart: none found" for three modules that are refuted, and prefers a refuted module | other | **CLOSED** | corrected in place — `exemplars-2026-09-11.md:23` carries the REFUTED banner and `:106`, `:139`, `:214` each read "CORRECTED 2026-09-12 — this line was FALSE" |
| wave 1's whole cut table | w1 `:99` | "12 of 30 narrowings UNENFORCED (40%)" | §4.1 narrowing | **SUPERSEDED** | the figure is NAIVE (pre-classification). Wave 2 reclassified the same method to 17%; wave 5 re-cut `no-inline-types` and reclassified `ZOD_FACTORIES.has` from NOT EVALUATED to MUTUALLY REDUNDANT; **wave 4 read the tier-home-health population fence and did not list it as a narrowing at all** because no discriminating fixture can exist. Prefer wave 4/5's reading — theirs names a mechanism |

### Wave 2 — registry / completeness (`v-audit-wave2-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `chrome-` · `section-` · `modal-` · `config-group-registry-completeness` · `warning-code-coverage` | w2 `:107` (HIGH) | the #1972 `ctx.relativePath` escape FIRES in five of seven — reproduced with an ordinary in-repo cross-package import, no `node_modules` needed | other (§12.3) | **CLOSED** | all five now read the home through `lib/declaration-home.ts`, and each carries a `mustPass` row whose `why` **cites this audit by path** (`chrome:157`, `section:204`, `modal:303`, `config-group:274`; `warning-code-coverage:155` records it in the header). This is the closure pattern the brief named |
| eight roster rows | w2 `:167` | five of eight rows are DENSE about the LEGACY implementation (a `DEFERRED` table, a `*-section.*` population, a `fileLoaded` door, an "annotation head" subject, the wrong shared reader) | roster row | **UNADJUDICATED** | eight independent noun-of-art claims; needs a per-clause grep of the converted module. Related closure precedent: wave 1 D9 |
| `message-kind-policy-coverage` | w2 `:188` | the header records NO family line and NO population port; singleton declared with no reason | §5b.5 header | **CLOSED** | `:20` `FAMILY: SINGLETON under its own id` **with its reason** (names `lib/reference-fact.ts` as a shared primitive), `:31` `POPULATION PORT: an INTENTIONAL NARROWING, and lossless` |
| `message-kind-policy-coverage` | w2 `:208` | `mustPass[3]`'s `why` names a narrowing the row does not prove (`isReaderScope`); the property is a `mustFlag`, not a `mustPass` | §4.1 narrowing | **UNADJUDICATED** | wave built the falsifier (a second `@contracts` file importing the record); check whether that row landed |
| chrome unreadable-id gate · warning-code chat-emitter gate · warning-code pushed-record `message` · message-kind reader-scope · placeholder pair-key | w2 `:223` | five genuinely UNENFORCED narrowings, each with a built falsifier | §4.1 narrowing | **UNADJUDICATED** | five falsifier rows are written out in the wave's table, ready to paste |
| `config-group-completeness` · `placeholder-copy-registry` | w2 `:234` | no §4.5 refusal/receipt pin at all — including for config-group's third declared denominator whose stated purpose is that "a renamed host cannot silently retire its import arm". Both mechanisms PROBED SOUND | §4.5 pin | **UNADJUDICATED** | two `runPolicyPass` pins, both probe outputs recorded in the wave |

### Wave 3 — the Drizzle-schema fact family (`v-audit-wave3-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| all nine | w3 `:187` (HIGH) | 9 of 9 headers record **no FAMILY line**, 8 of 9 record **no POPULATION PORT**, 0 of 9 cite a legacy SHA; `table-explicit-primary-key` has a ONE-LINE header | §5b.5 header | **OPEN — no dedicated row; folded into the systemic §5b.5 gap** | re-derived this session: `grep -c 'FAMILY'` and `grep -c 'POPULATION PORT'` return **0 for all nine**. Waves 8 (25/25) and 9 (14/14) reproduce the same gap on the server plane, so this is systemic, not family-local |
| `contract-banned-shapes` | w3 `:216` | `mustFlag[6]` cannot discriminate the two §4.6 arms — `missingHome` embeds `missingSubject` verbatim, so `"SILENT NO-OP"` is in both messages | §4.1 narrowing | **UNADJUDICATED** | proven by cut in the wave; `policy-proof-expectations` ARM M was minted for exactly this shape (a substring inside TWO message sources) so it may now be enforced — check the gate's worklist |
| `schema-branding` ×3 · `fk-columns-indexed` ×1 | w3 `:246` | four genuinely UNENFORCED narrowings, each with a falsifier run in BOTH arms. `fk-columns-indexed`'s is the sharpest — **the module's own `fix` names the `.unique()` arm nothing proves** | §4.1 narrowing | **UNADJUDICATED** | the four falsifiers are tabulated at `:492-497`, ready to paste. Wave 3 also notes that closing `schema-branding`'s `parentBrand === null` fence by DELETION rather than by a row ships the string `carries null` to a user (D8) |
| `ownerid-registry` | w3 `:262` | `mustFlag[4]` (the stale arm) carries no `count`; derived value is 27 | §4.1 narrowing | **OPEN, with a FORK** | re-derived: `ownerid-registry.ts:178` is still `expect: { messageIncludes: "classifies nothing" }`. **The fork:** #1968 closed 78 → 11 rows and the playbook calls the remaining 11 "a measured registry-cardinality exemption (#2001), NOT debt". This row is plausibly one of the 11. A fix lane must check `policy-proof-expectations`' own worklist before adding `count: 27` |
| `fk-ondelete-stated` | w3 `:277` | ORDINARY policy whose `fix` names NO waiver spelling; the best position statement in the family sits in a `mustPass` `why` the author never sees | other (§5b.3) | **OPEN — #1978** | re-derived: `fk-ondelete-stated.ts:10-11` `FIX` is remediation only. The only `@orb-waive fk-ondelete-stated(` on the tree is the fixture at `:92` |
| roster `:102` `fk-columns-indexed` · roster `:100` `schema-branding` | w3 `:301` | one cites the LEGACY reader `_shared/schema-read.ts` the converted module does not import; the other is a bare label that OVERSTATES the subject (`*Id` columns vs the exact property `id`) | roster row | **UNADJUDICATED** | — |
| `contract-banned-shapes` | w3 `:316` | declares a SINGLETON `family` with no reason while sharing `lib/ledger-banned-shapes.ts` with `schema-banned-shapes` | §5b.5 header | **UNADJUDICATED** | — |
| `schema-banned-shapes` · `schema-branding` | w3 `:326` | an `offset < 0` fallback arm reached by NO row; and a latent `carries null` message defect the `parentBrand` fence is hiding | §4.1 narrowing | **UNADJUDICATED** | — |

### Wave 4 — raw-CSS / token surface (`v-audit-wave4-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `no-raw-spacing-in-features` · `no-raw-typography-in-features` · `no-off-token-radius-shadow` | w4 `:110` (HIGH) | the #1954 carrier-fence repair pinned the OUTER fence and left BOTH INNER HALVES (the `className` attribute-name test, the `CLASS_COMPOSERS` membership test) unenforced in three modules; cluster cuts REFUTED redundancy, so six `mustPass` rows were owed | §4.1 narrowing | **CLOSED** | the six falsifier rows landed — `no-raw-spacing-in-features.ts:134` (`<div title="p-4" />`) and `:139` (`describe("p-4 spacing helper")`), with the byte-identical mirrors in the typography twin and in `no-off-token-radius-shadow` (2 each, verified by count) |
| `no-color-literals` · `no-off-token-radius-shadow` · `no-raw-container-widths` | w4 `:153` (HIGH) | three ORDINARY policies have no §4.2 identity arm ANYWHERE — not in the module, not in a family test | §4.2 identity | **SUPERSEDED — mechanized** | #1952 closed at **0 of 86 outstanding** (playbook §2b, verifier flipped seven to dead positions and got the alarm on all seven), and `policy-waiver-identity` (#1971) now REDS an ordinary policy with no positive arm on every commit. Its header records the exact trap this defect is: *"a `fix` string, a header comment and a `messageIncludes` all MENTION the spelling and none is an arm"* |
| `no-raw-color-in-css` · `no-raw-container-widths` · `no-color-literals` · `no-off-token-radius-shadow` | w4 `:175` | four of eight ordinary `fix` strings name no waiver spelling | other (§5b.3) | **OPEN (partial) — #1978** | `no-raw-container-widths.ts:61` is still a bare `'wrap in <Container size="sm\|md\|lg"> instead of hardcoded length'`. `no-color-literals` and `no-off-token-radius-shadow` now carry a spelling |
| `no-color-literals` | w4 `:181` (HIGH) | declares one of three disjoint messages as THE policy message (printed as the group header by `render.ts:233`), and 4 of 5 rows cannot say which pattern fired | §5b.2 message | **CLOSED** | #1991. Four disjoint strings, `message: MESSAGE_POLICY` at `:100`, and a per-arm `messageIncludes` on EVERY row (`:125`, `:131`, `:137`, `:143`, `:151`); `:126`'s `why` names the audit's own reproduction |
| `no-raw-color-in-css` | w4 `:219` | answers a broken resource with a SILENT RETURN (§12.3 says THROW); unfalsifiable by any proof row (§4.5b gap 1) | other (§12.3) | **CLOSED — and the whole class with it** | #1979. `no-raw-color-in-css.ts:73` reads through `readyResourceValue`, **and so do all four sibling sites the wave named** — `client-structure.ts:245`, `eslint-grant-liveness.ts:105`, `feature-structure.ts:195`, `verify-registry-parity.ts:90`. Three of them gained a header paragraph saying why a silent return would be unreachable code |
| `no-off-token-radius-shadow` (conversion) | w4 `:256` (HIGH) | the conversion left `gate-conformance.repo.int.test.ts:49` RED on a quiet tree, and disconnected `gate-ignore-grammar.repo.int.test.ts` — all three of its carriers went final while it loads via `loadGates` (legacy only) | other | **UNADJUDICATED — needs the orchestrator** | both suites are fenced from lanes (they plant fixtures in the working tree). The playbook records that "the rule that catches it is now guide §8 + the path-scoped rule (`047dc1570`)", which is the RULE, not the suite's state |
| `grant-liveness-family.test.ts` · `drizzle-registry-conversion.test.ts` | w4 `:304` | red on a QUIET tree — a 5 s default budget with no `scaledBudget`, against a policy measured at 5022.9 ms in its population phase alone | other | **OPEN — #1985 (Ready, P3)** | the board row exists and names the measurement |
| seven of nine roster rows | w4 `:320` | two bare labels, one asserting the "in className/cn" context #1954 REMOVED, two describing retired allowlists, one stale row count | roster row | **UNADJUDICATED** | the two `-health` rows (`:255`, `:257`) are the accurate ones worth copying |
| nine modules | w4 `:336` | 10 of 31 narrowings unenforced (32%); **1 of 9 modules has any §4.5 pin** | §4.1 narrowing · §4.5 pin | **PARTIAL** | the six carrier-fence cells are CLOSED (row 1 above). The remaining four (`no-raw-container-widths` ×2, `no-color-literals` ×1, `no-tailwind-dark-variant` ×1) and the §4.5 gap are **UNADJUDICATED** |

### Wave 5 — `ordinary-visitors` ×15 (`v-audit-wave5-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `persistence-boundary` | w5 `:213` | the header claims SIX grant rows where FOUR exist (`lib/reviewed-grants.ts`); the roster row was the correct one | §5b.5 header | **CLOSED** | the "six FILES" sentence no longer appears in `persistence-boundary.ts` |
| `no-untyped-soft-ref` | w5 `:222` | `mustPass[2]`'s `why` claims to prove the primary-key exemption and does not — the fixture's key is `id`, excluded by the id-shape test before the pk clause runs | §4.1 narrowing | **UNADJUDICATED** | the falsifier (`widgetId: text("widget_id").primaryKey()`) was built and measured in both directions |
| `registry-assembly-at-door-only` | w5 `:229` | header declares `FAMILY: SINGLETON under its own id` while `no-mutating-register-api` carries the identical `family` string — the family has TWO members | §5b.5 header | **OPEN — no board row** | re-derived: `registry-assembly-at-door-only.ts:26` still says SINGLETON; `no-mutating-register-api.ts:46` and `registry-assembly-at-door-only.ts:54` both declare `family: "registry-assembly-at-door-only"` |
| `persisted-store-registry` | w5 `:246` | `mustFlag[4]` carries no `count`; derived value **14**, so the two-sided stale ratchet's COMPLETENESS is unpinned (the row passes on 1 stale finding as readily as on 14) | §4.1 narrowing | **UNADJUDICATED** | same #1968/#2001 fork as wave 3's `ownerid-registry` row — check the enforcer's worklist first |
| `no-untyped-soft-ref` | w5 `:252` | both `messageIncludes` discriminators are TAUTOLOGIES because `:42` sets `const UNREADABLE = MESSAGE` — every finding carries the whole string | §4.1 narrowing | **UNADJUDICATED** | `policy-proof-expectations` ARM M is minted for exactly this (a substring inside the module's ONLY message source); likely now gate-reported |
| 12 modules (33 cells) | w5 `:171` | 33 genuinely unenforced narrowings, each with its falsifier named. Concentrated: `no-inline-types` 9 · `zod-modern-spellings` 6 · `zod-error-issues-home` 3 | §4.1 narrowing | **UNADJUDICATED** | every falsifier is written out at `:173-203`. Playbook records `eff4b5756` / `8ad418868` closing "the four worst ordinary-visitors modules" — re-derive before building |
| `empty-state-has-action` · `no-inline-domain-interface` · `no-inline-types` · `zod-modern-spellings` | w5 `:360` | four of six ordinary `fix` strings name no waiver spelling | other (§5b.3) | **PARTIAL** | `no-inline-types` CLOSED (`:53-57` names the spelling AND the position rule). `empty-state-has-action.ts:47` is still a bare remediation → **OPEN, #1978** |
| `no-inline-types` (real tree) | w5 `:396` | `check:structure` reports **19** live findings, 18 of them exported verdict types in `tooling/src/verify/lib/**` — the shared readers the program MANDATES. The count ratcheted 15 → 18 → 19 across three dated receipts and nobody tracks it | other | **UNADJUDICATED** | recorded, not measured (I ran no `check:structure`). The decision it forces: either `tooling/src/verify/lib/**` is a type home (a population edit) or the verdict types belong in `verify/contract/` (a code edit) |
| the §4.2 exemplar citation | w5 `:81` | `.claude/rules/gates-and-tooling.md` and §4.2 cite `ordinary-visitors-family.test.ts:187-205`, which INCLUDES the dead-position NEGATIVE arm §4.2 tells lanes not to copy; wave 1 cites `:187-195` for the same thing | other | **LIKELY CLOSED — verify** | `policy-waiver-identity.ts` (the #1971 enforcer) cites `:187-196` — the positive arm alone, as wave 5 recommended. The rule file was not re-checked |

### Wave 6 — `origin-client` ×12 (`v-audit-wave6-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| nine of twelve | w6 `:102` (HIGH) | the advertised **#944 THIRD ANSWER is UNPROVEN** — a `throw` planted in the `unreadable` branch fires on zero declared rows in nine modules. "The virtue the whole family is named for is, in three quarters of it, dead code with a nice paragraph" | §4.1 narrowing | **CLOSED** | #1990, `a54394df6`. Census this session: **all nine** now carry exactly one `messageIncludes: "CANNOT be established"` row — `fetch-fn-in-features`, `no-chat-trpc-in-surface`, `no-context-provider`, `no-context-returntype`, `no-forward-ref`, `no-use-context`, `no-inline-optimistic-in-surface`, `no-manual-autosave-flush`, `no-manual-token-estimate` |
| `no-chat-trpc-in-surface` | w6 `:133` (HIGH) | the WHOLE `isProxyRoot` predicate is unenforced; only a MESSAGE discriminates it, so every count-only row is blind | §4.1 narrowing | **CLOSED (by the same row)** | the wave stated one `mustFlag` with `messageIncludes: "CANNOT be established"` closes D2 and its half of D1 together; that row is now present |
| `lib/react-origin.ts` (serving `no-forward-ref` · `no-use-context` · `no-context-provider`) | w6 `:157` (HIGH) | both SHARED-READER fences that prevent a repo-wide false accusation are unenforced — including one whose comment records a measured **439 false "unreadable" findings per policy** | §4.1 narrowing | **UNADJUDICATED** | two `mustPass` rows in the consumers protect three policies at once; both falsifiers built and run in both arms |
| `no-manual-autosave-flush` | w6 `:176` | a module-scope pair in a `features/**` file is UNREPORTED and nothing says so; plus two more unenforced fences | §4.1 narrowing | **UNADJUDICATED** | — |
| `no-manual-token-estimate` | w6 `:195` (HIGH) | five unenforced fences — including BOTH divisor fences that ARE the law's discrimination — and an advertised rename tripwire with NO §4.5 pin (the tripwire WORKS; measured both sides by hand) | §4.1 narrowing · §4.5 pin | **PARTIAL** | the third-answer row landed (above). The five fences and the missing `runPolicyPass` pin are **UNADJUDICATED**. The wave names this "the family's densest collection of unpinned fences" and says **do not point a lane at it** |
| `no-multiplexed-mutation-error` · `no-manual-autosave-flush` · `zustand-selector-stability` | w6 `:226` | `UNREADABLE` is built by EMBEDDING `MESSAGE`, so a base-message pin can never discriminate — the pair works in ONE direction only | §4.1 narrowing | **UNADJUDICATED** | the terminal form of this (two names bound to ONE string) recurs in wave 7 as `unreadableMessage: MESSAGE` in three modules |
| roster `:289` `no-use-context` · `:262` `no-static-staletime` · `:271` `zustand-selector-stability` | w6 `:269` | one row is stale AND INVERTED (it teaches the name-keyed mechanism the conversion deleted); two are content-free | roster row | **UNADJUDICATED** | — |
| `gate-spelling-twins` (program-wide) | w6 `:285` (HIGH) | the conversion left the #1506 spelling control DEAD for **54 ledger rows**, 7 of them this family's — `loadGates` returns legacy ALONE, so the suite is RED by construction and covers no converted policy at all | other | **OPEN — #1983 class (Ready, P2)** | the wave proved it statically (104 legacy modules vs 79 ledger rows ⇒ 54 orphans) rather than running the 470-pass suite |
| twelve modules | w6 `:309` | §5b.3 **1 of 12** `fix` strings names the spelling; §5b.4 family decision recorded **2 of 12**; §5b.5 population port **1 of 12** | other (§5b.3) · §5b.5 header | **OPEN** | the §5b.3 half is #1978; the §5b.5 half is the systemic gap waves 3/8/9 reproduce |
| twelve modules (25 cells) | w6 `:325` | 25 genuinely UNENFORCED narrowings of 59 cuts (42%), each with a built falsifier | §4.1 narrowing | **PARTIAL — decayed** | the wave's own headline number is the one the brief warns about: D1 (nine modules), D2 and all five of D5 have since landed, so the open count is materially lower than 25. **Re-derive per module before building** |

### Wave 7 — `home-client` ×14 (`v-audit-wave7-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `no-effect-on-shared-selection` | w7 `:337` (HIGH — the ANTI-pattern) | FAILS OPEN on the shared reader's third answer: `=== "home"` treats an `unreadable` pointer receiver identically to a proven non-pointer. Every one of the eleven siblings writes `!== "other"` and reports. Pinned in NEITHER direction | §4.1 narrowing | **OPEN — no dedicated board row** | re-derived: `no-effect-on-shared-selection.ts:186` is still `.filter((callee) => classifyProjectDirectoryOrigin(callee, STATE_DIR, POINTERS) === "home")` |
| ten of eleven implementers | w7 `:231` | the #944 THIRD ANSWER is reached in **1 of 11** — the wave-6 correlation reproduces exactly, in a family with no author overlap: the only module that proves its arm is the only one that wrote `messageIncludes` | §4.1 narrowing | **OPEN — the wave-6 fix was never applied here** | census this session: `messageIncludes: "CANNOT be established"` count is **0** in `client-cache-surgery-only-in-data`, `no-inline-invalidate-outside-seam`, `no-direct-useform`, `bound-field-via-hook`, `chat-stream-writes-in-bus-only`, `selection-store-via-factory`, `render-error-via-battery`, `no-raw-intl-time`, `no-raw-zustand-persist`, `registry-context-via-mint`. Ten modules carry `unreadableMessage: UNREADABLE` through `reportReviewedGrantCandidates` with nothing pinning it |
| `no-untrusted-html-in-main-dom` | w7 `:362` (HIGH) | the attribute-NAME fence is the WHOLE policy and nothing pins it — cutting it makes a D44 SECURITY policy on 1685 files flag `className`, `key`, `onClick`, everything | §4.1 narrowing | **UNADJUDICATED** | falsifier built: `mustPass` `<div className='x' />`, CLEAN → RED 1. One row closes it |
| `no-raw-intl-time` | w7 `:379` | carries `no-raw-matchmedia`'s UNFALSIFIABLE clause WITHOUT the paragraph that makes it honest — and the sibling clause beside it is a genuine gap | §5b.5 header · §4.1 narrowing | **UNADJUDICATED** | "the fix is one paragraph plus one row, and the paragraph already exists, in the module next door" |
| `no-direct-useform` | w7 `:393` | a CODE COMMENT claims canonical-operation keying that no row proves; not closable by a proof row (`runPass` pins `reviewedGrants: []`) — belongs in the family test | §4.1 narrowing | **OPEN — #1997 class (Ready, P3)** | the board row names exactly this shape ("a CODE COMMENT asserting a guarantee no row enforces — the §4.7 header lie one layer down") |
| `render-error-via-battery` | w7 `:410` | a foreign `return` licenses a custom arm — the containment test IS the conversion's correctness claim (it replaced the legacy `getDescendantsOfKind` walk) and it is the claim nothing checks | §4.1 narrowing | **UNADJUDICATED** | falsifier built, both arms |
| `no-raw-zustand-persist` | w7 `:420` | two more comment-claims with no rows, plus ARM B's zustand-identity fence unfenced; its `fix` is the one reviewed-grant `fix` that names no grant door | §4.1 narrowing | **UNADJUDICATED** | three cells, one falsifier built |
| `no-raw-matchmedia` | w7 `:435` | header AND roster both say "All four" permissions against **FIVE** live grant rows, and the stated reason for one ("no coarse-pointer home exists") is now false | §5b.5 header · roster row | **CLOSED** | header `:8-11` now names the coarse-pointer home as a standing one-home and states the grant survives *"with its `why` naming that mismatch instead"*; roster `:286` enumerates five homes and carries the WITHDRAWN sentence for the DOM-less claim |
| `registry-context-via-mint` | w7 `:451` | the family's ONE ordinary policy gives its author no `@orb-waive` spelling, in a module whose own `mustPass[5]` `why` explains at length that the position is the TYPE ARGUMENT, not the `createContext` callee | other (§5b.3) | **OPEN — #1978** | — |
| `home-client-family.test.ts` | w7 `:461` | the substring trap is unpinned in the one module that avoids it — a future edit folding `MESSAGE` into `UNREADABLE` keeps all three rows green and silently destroys the family's only proven fail-closed arm | §4.5 pin | **UNADJUDICATED** | needs an equality assertion in the family test; no proof row can catch it |

### Wave 8 — the SERVER plane, `home-server` 11 + `origin-server` 14 (`v-audit-wave8-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `bus-channel-primitive` | w8 `:140` (HIGH) | the canonical `exportedName` half of the identity fence is UNENFORCED (falsified: a barrel re-exporting `setMaxListeners as EventEmitter`) | §4.1 narrowing | **UNADJUDICATED** | control green → armed red, both runs recorded |
| `sole-env-reader` | w8 `:162` (HIGH) | the `node:process` DOOR comparison is UNENFORCED and the ambient half is unfalsified beside it — **the only clause of the identity reader any row enforces is the REFUSAL classifier**, and this is the module's own headline claim | §4.1 narrowing | **UNADJUDICATED** | one falsifier built; the ambient half is recorded as UNENFORCED-unproven after two failed attempts, which is the honest form |
| `single-stream-transport` | w8 `:239` (HIGH) | the ENTIRE fail-closed branch is DEAD — reached by none of its 8 rows, and its comment asserts two properties that are both unproven | §4.1 narrowing | **UNADJUDICATED** | reusable falsifier named: `declare function opaque(): any; opaque().subscription(…)` |
| `no-raw-clock` · `no-raw-random` | w8 `:247` | both advertise a fail-closed unreadable arm no row reaches; the acquittal half IS proven, the refusal half is not | §4.1 narrowing | **UNADJUDICATED** | #1997 class |
| `bus-channel-primitive` | w8 `:253` | two dead branches; the header's sentence *"A construction that PROVABLY binds another declaration is a different class and passes"* is enforced by nothing | §4.1 narrowing | **UNADJUDICATED** | — |
| `content-part-seam` | w8 `:261` (HIGH — the wave's ANTI-pattern) | declares two visitor kinds its subject can NEVER produce — `ChatContentPart` is `export type`, and `PropertyAccessExpression`/`ElementAccessExpression` are value-position nodes — and the header sells them as the conversion's value | §5b.7 forbidden | **CLOSED** | `content-part-seam.ts:82` is now `kinds: [SyntaxKind.ImportSpecifier]` alone. The durable rule the wave proposed (visitor KIND set follows value-vs-type) is the reason the sibling policies keep all three |
| seven of ten reviewed-grant policies | w8 `:289` (HIGH) | NO §4.3 grant pin anywhere — and `home-server-family.test.ts`'s own header claims grant liveness for "every policy here" while it has it for ONE of ten. §4.2 makes this structurally unprovable by a module row | §4.5 pin | **UNADJUDICATED** | matters more than usual because that file is what the remaining sanctioned-home conversions will copy |
| `owner-role-split` | w8 `:326` | the withholding claim is unenforced while its TWIN's identical claim is pinned; "the twin's pin covers me" is not a receipt | §4.5 pin | **UNADJUDICATED** | two `runPolicyPass` arms copied from the `two-class` block close it |
| all 25 | w8 `:337` | §5b.5 fails **25 of 25** — no FAMILY line, no POPULATION PORT, no legacy SHA; 20 of 25 declare a singleton family with no reason | §5b.5 header | **OPEN — systemic** | corroborated by wave 9 (14/14) and wave 3 (9/9, re-derived this session). Wave 9 names the consequence: it is the mechanical reason **#2000 cannot attempt a §4.6 differential** — no module records the SHA to replay against |
| 14 ordinary (origin-server) | w8 `:369` | §5b.3 — `fix` names the exact waiver spelling in **3 of 14** | other (§5b.3) | **OPEN — #1978** | re-derived on a sample: `bounded-list-limit.ts:23-25` still carries remediation only |

### Wave 9 — `origin-server` ×14, closing wave 8's open axes (`v-audit-wave9-2026-09-12.md`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `discovery-no-stats-rollups` · `membership-enforcer` · `providers-runner-seal` · `turn-identity` · `vector-scope-derived` | w9 `:90` (HIGH — the wave) | **FIVE CONFIRMED FALSE POSITIVES ON PRISTINE SOURCE, no cut applied.** Each compares `readSealedOrigin(…).kind !== "foreign"` instead of calling `sealedOriginReports(verdict, anchor)`, so a LOCAL OBJECT whose KEY is spelled like the sealed export is accused. **The fix is one line and is PROVEN** (the unreadable-door `mustFlag` still flags after it) | other (correctness) | **OPEN — #2006 (P1)** | re-derived this session, all five unchanged: `discovery-no-stats-rollups.ts:71`, `membership-enforcer.ts:97`, `turn-identity.ts:68`, `vector-scope-derived.ts:114`, and `providers-runner-seal.ts:71` reads the verdict without the decision helper. `untrusted-regex-safe-exec.ts:65` carries the same shape and is outside the wave's subject set |
| `bounded-list-limit` · `test-mock-doctrine` · `byte-check-cast` | w9 `:196` (HIGH — the ANTI-pattern) | the "IDENTITY COUNTERFACTUAL" `mustPass` row is built from a LOCAL object, so it falsifies only `origin.kind !== "resolved"` — the MODULE specifier and exported-NAME comparisons stay unproven, including when cut TOGETHER, and each row's `why` claims otherwise | §4.1 narrowing | **UNADJUDICATED** | two falsifiers built (F1, F2), both control-green → armed-red. `byte-check-cast`'s is reasoned by mechanism, not built — the wave says so |
| `persistence-no-in-memory-state` | w9 `:341` (HIGH) | the FAIL-CLOSED report line is DEAD, and the `mustFlag` row LABELLED "FAIL-CLOSED" flags through a DIFFERENT arm | §4.1 narrowing | **UNADJUDICATED** | — |
| `membership-enforcer` | w9 `:357` | advertises a fail-closed unreadable door no row reaches; its near-twin `discovery-no-stats-rollups` HAS the row | §4.1 narrowing | **UNADJUDICATED** | one copied `mustFlag` row closes it. #1997 class |
| `no-await-db-in-loop` | w9 `:364` (HIGH) | the "FUNCTION BOUNDARY" declared-limit row contains NO LOOP, so the boundary stop it advertises is proven by nothing; the row proves the absence of a loop | §4.1 narrowing | **UNADJUDICATED** | the wave gives the exact replacement fixture |
| `bounded-list-limit` · `no-direct-reports-write` · `no-handwritten-wire-json-schema` · `no-hardcoded-side-gen-sampling` | w9 `:385` | a byte-identical `propertyName` helper is COPIED four times and its computed-key refusal arm is reached by zero rows in all four; a §5b.7 extraction would give all four one row | §5b.7 forbidden | **UNADJUDICATED** | — |
| 14 modules (34 cells) | w9 `:262` | 34 genuinely UNENFORCED narrowings of 107 cuts (32%). Two recurring shapes account for 20: **population fences** (9 of 14 modules carry an unexercised `notNamed`/`notUnder`) and **SANCTIONED-HOME LISTS with unexercised entries** (`vector-scope-derived` proves 2 of 5; `no-hardcoded-side-gen-sampling` 1 of 2) | §4.1 narrowing | **UNADJUDICATED** | "an unexercised list entry is the one a future re-home deletes silently" |
| `vector-scope-derived` | w9 `:426` | wave 8's "78 rows carry `token` (every origin-server row)" is WRONG — two rows carry `expect: { count: 2 }` with no `token`, on a byte-identical tree | §4.1 narrowing | **CLOSED as a correction** | wave 9's mechanical census is the receipt and supersedes wave 8's cell. The two rows themselves are **UNADJUDICATED** |

### Wave 10 — the BUS plane + `id-brand-flow` (`v-audit-wave10-2026-09-12.md`, unmerged at `fca7c9b42`)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `no-raw-id` | w10 `:136` (HIGH — the ANTI-pattern) | its hand-rolled `isZodString` identity reader is **BLIND to a one-hop re-export door** where its family sibling `no-mint-via-cast` (using the shared `resolveCallableOrigin`) catches the byte-identical shape. One `export { z } from "zod"` barrel silently turns the brand gate off; neither header nor roster declares the limit | §5b.7 forbidden | **OPEN — #2009 (Running, lane `p-rawid-door`)** | re-derived: `no-raw-id.ts:27` still declares the private `isZodString`; no `resolveCallableOrigin` import. Proven by a same-family A/B, which is a stronger receipt than a cut |
| `brand-in-name-position` | w10 `:205` (HIGH) | the roster row publishes a **RETIRED marker vocabulary** (`@foreign-id-ok`), so an author who follows it writes a marker no reader parses and gets no suppression. Corpus receipt: 3 dead occurrences vs 76 live `@orb-waive brand-in-name-position` | roster row | **OPEN — #2010 (Ready, P2)** | re-derived: `Core-Enforcement-Active-Gates.md:189` still carries the full `@foreign-id-ok` ESCAPE + TWO-SIDED paragraph |
| `id-brand-flow` ×5 | w10 `:180` | the #944 THIRD ANSWER is ABSENT from the whole family, and **two modules fail OPEN** — `no-mint-via-cast` returns `false` on an unresolved origin in a **hard/error** mint-laundering ban, and nothing in the tree says so | §4.1 narrowing | **UNADJUDICATED** | the wave's asymmetry finding is the useful half: a fact-driven policy refuses and pins the refusal; a visitor policy has no refusal and no arm |
| `bus-on-data-no-store-write` | w10 `:225` | the outer carrier fence is pinned and BOTH discriminating halves — WHICH handler, WHICH member — are not; the red on the outer cut is carried entirely by the node-KIND half. The wave-4 D1 shape, recurring | §4.1 narrowing | **UNADJUDICATED** | three `mustPass` rows fix all three; F1 built |
| 11 cells + 3 uncovered arms | w10 `:158` | 11 genuinely UNENFORCED narrowings + 3 UNCOVERED ARMS (14 of 47, 30%), six with a built falsifier ready to paste | §4.1 narrowing | **UNADJUDICATED** | F1–F6 tabulated at `:160-169`, each control-green → armed-red |
| `brand-in-name-position` | w10 `:481` | the message's "at this boundary" clause is untrue of one of its own two live real-tree findings (a type argument to `toEqualTypeOf` is not a boundary) | §5b.2 message | **UNADJUDICATED** | — |
| six ordinary policies | w10 `:257` | §5b.3 — `fix` names the spelling in 2 of 6 | other (§5b.3) | **OPEN — #1978** | the wave itself fences this to the `p-fix-spellings` lane |
| `no-fake-disabled-id` · `no-mint-via-cast` · `no-loose-id-cast` | w10 `:274` | three bare-`count` rows whose `why` claims WHICH node flags; two are proven pinnable TODAY at zero cost (the tokens were derived by transplant) | §4.1 narrowing | **UNADJUDICATED** | tokens named: `brand` for both |
| `brand-in-name-position` · `bus-fact-health` | w10 `:242` | **NOT DEFECTS — two roster claims the wave expected to be lies and PROVED TRUE by a planted break.** The blindness tripwire MOVED into `receiptFailures`' `count === 0`; the `members: 1` constant is load-bearing | other | **N/A — recorded so nobody re-opens them** | the durable rule: a "the header claims X and the code does not do X" finding owes a planted break FIRST |

### The gate-batch verifier (`v-gate-batch-2026-09-12.md`) — the four exemplar lanes

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `tooling/src/stack/ops/engines-ctl.ts` | gb `:44` (HIGH) | `p-caught-failure` DELETED a live legacy marker instead of translating it — a LOST SUPPRESSION, and the landing commit's "23 pre-existing + 1 new" split is wrong by one | other | **CLOSED** | `engines-ctl.ts:101` now carries `// @orb-waive caught-failure-ownership(catch): an unreadable OS user identity falls back to a fixed label ("unknown") …` — the legacy reason verbatim, at the position the converted policy reports |
| `Core-Enforcement-Active-Gates.md` | gb `:76` (HIGH) | `p-keyset` did not do its ratified coupled site: the count line was stale and `freeze-provenance-write-pairing-health` had no row, so `enforcement-registry-parity` was RED; and the surviving row described the LEGACY implementation verbatim | roster row | **CLOSED** | `:353` now reads "275 registered gates" and `freeze-provenance-write-pairing-health` has rows (2 occurrences). The stale-prose half was not re-read clause by clause |
| `freeze-provenance-write-pairing` | gb `:105` | §4.1 UNENFORCED: `memberPath.length === 0` — a MEMBER of the table binding is not "ours", and no row places a member expression at the table argument | §4.1 narrowing | **UNADJUDICATED** | the other four narrowings in the module ARE enforced, each cut killing exactly the row whose `why` claims it |
| `lib/caught-failure.ts` | gb `:137` | §4.1 UNENFORCED: the `finally`-block owner clause — and **the module's own `message` ASSERTS it** (`"a catch block (and its finally) that names no owner at all"`), so it is a §5b.2 claim nothing proves | §4.1 narrowing · §5b.2 message | **UNADJUDICATED** | the lane's own count of 3 repairs is confirmed as a count of what it FOUND, not the complete set |
| `detached-work-traced.ts` | gb `:173` | orphan export `hasLiveDetachedSwallowOwner` left by the retired `@swallowed-ok` arm; invisible to knip | other | **CLOSED** | the only surviving occurrence on the tree is PROSE at `caught-failure-ownership.ts:49` describing the retirement; the export is gone |
| `lib/drizzle-write-target.ts` | gb `:187` | a new shared reader with ONE consumer and NO test file, asymmetric with its own sibling `lib/authored-key-set.ts` landed in the same commit (18 tests, both directions) | §5b.7 forbidden | **UNADJUDICATED** | the wave is explicit it is not calling the reader private — the defect is *one consumer + no independent pin*, which a copying lane reads as permission |
| `contract/population.ts` (batch-wide) | gb `:201` | `@showcase` was added as a root but NOT to `@authored`, which is a literal nine-root list — so `packages/showcase-plugins/src` is silently outside **19 policies**, and `member-card-clamped.ts:59`'s comment is now false | other | **OPEN — #1980 (Ready, P2)** | the board row names it: "`@authored` is a hand-typed 9-element literal with no liveness gate" |
| `ops/conformance.int.test.ts:343` | gb `:241` | `expected 749 to be greater than 1000` — a hard-coded LEGACY denominator that every conversion pushes further down, and it reads as a fresh red on each lane's verifier | other | **UNADJUDICATED** | reproduces on a quiet re-run, so not contention. Needs re-expressing against the MIXED corpus |

## CLASS ROLLUP

Counted per ROW above (a row is one named defect, which may span N modules). Cross-cutting classes are counted
once with their module span, not restated per module.

| class | rows | CLOSED | OPEN | SUPERSEDED | UNADJUDICATED |
| - | -: | -: | -: | -: | -: |
| **§4.1 narrowing** | 38 | 8 | 4 | 2 | 24 |
| **§4.2 identity** | 1 | 0 | 0 | 1 | 0 |
| **§4.5 pin** | 6 | 0 | 0 | 0 | 6 |
| **§4.6 differential** | 0 | — | — | — | — |
| **§5b.2 message** | 4 | 2 | 0 | 0 | 2 |
| **§5b.5 header** | 9 | 3 | 3 | 0 | 3 |
| **§5b.7 forbidden** | 6 | 2 | 2 | 0 | 2 |
| **roster row** | 8 | 3 | 1 | 0 | 4 |
| **other** | 19 | 7 | 5 | 0 | 7 |
| **TOTAL** | **91** | **25** | **15** | **3** | **48** |

### The cross-cutting classes, counted PER MODULE rather than per row

These are the leverage. Each is ONE decision that lands across many modules, which is why they are counted here
instead of being restated 25 times in the table.

| class | modules affected | state |
| - | -: | - |
| **§5b.5 header — no FAMILY line, no POPULATION PORT, no legacy SHA** (#2005) | **48+** — wave 3's 9 (re-derived 0/9 this session), wave 8's 25, wave 9's 14 (overlaps wave 8), wave 6's 10 of 12, wave 10's 8 of 12 | **OPEN, systemic.** Wave 9 names the consequence: it is the mechanical blocker for #2000's §4.6 differential — no module records a SHA to replay against |
| **§5b.3 — ordinary `fix` names no `@orb-waive` spelling** (#1978) | **51 of 88** at `8257071ee` (recorded, from `policy-waiver-spelling.ts`'s own header) | **OPEN as WARNING DEBT.** MECHANIZED: `policy-waiver-spelling` (#1971) reports its own worklist on the commit bar. Confirmed still open on a sample: `fk-ondelete-stated`, `empty-state-has-action`, `bounded-list-limit`, `no-raw-container-widths` |
| **#1968 expectation rows with no `count`** | **78 → 11** (recorded, playbook §2b) | **SUPERSEDED — mechanized.** `policy-proof-expectations` ARM C. The 11 survivors are a measured registry-cardinality exemption (#2001), NOT debt. Wave 3's `ownerid-registry` and wave 5's `persisted-store-registry` cells are plausibly inside it — **check the enforcer's worklist before adding a `count`** |
| **§4.2 identity arms** (#1952) | **0 of 86 outstanding** (recorded, playbook §2b) | **SUPERSEDED — mechanized.** `policy-waiver-identity` accepts both sanctioned shapes and is marker-FORM, not mention, which is the trap wave 4's D2 grep fell into |
| **inert `ext` / contract residue / `node:fs`** (#1959) | swept to 0 at `8257071ee` | **SUPERSEDED — mechanized.** `policy-soundness` E1/E2/E3 |
| **#944 third answer unreached** | wave 6: **9 CLOSED** · wave 7: **10 still OPEN** · wave 8: 3 · wave 9: 3 · wave 10: 12 (whole `id-brand-flow` family has no arm at all) | **PARTIALLY OPEN.** The wave-6 fix (one `mustFlag` with `messageIncludes` on the unreadable text) is proven and was never applied to the other four planes |
| **unenforced §4.1 narrowing cells** | \~110 cells across \~55 modules, after classification | **MOSTLY UNADJUDICATED and DECAYING** — wave 6's 25 is already materially lower. Every wave's figure is an upper bound; re-derive per module |

## THE FIVE HIGHEST-VALUE OPEN DEFECTS, ranked

Ranked by *a correct gate accusing correct code* first, then by blast radius, then by cost-to-close.

1. **#2006 — the sealed-origin conflation, five gates ACCUSING CORRECT CODE on pristine source** (wave 9 D1,
   `v-audit-wave9-2026-09-12.md:90`). Re-derived open this session in all five modules. This is the only row in
   the whole ledger where a gate is WRONG about real code rather than under-proven: a local object whose key is
   spelled like the sealed export is reported. **The fix is one line per module and is PROVEN** — swapping
   `readSealedOrigin(…).kind !== "foreign"` for `sealedOriginReports(verdict, anchor)` goes to 0 failures while
   the unreadable-door `mustFlag` still flags. `untrusted-regex-safe-exec` carries the same shape and is a sixth
   candidate the wave did not measure. The counter-example AND the fix both already live inside the family
   (`test-fixture-imports` scopes its fail-closure correctly, with an 89-false-positive receipt in its own row).

2. **The #944 third answer is dead in ten `home-client` modules** (wave 7 `:231`, census re-derived this
   session: zero `messageIncludes` pins). Wave 6 proved the fix — ONE `mustFlag` row per module with
   `expect: { count: N, messageIncludes: "CANNOT be established" }` — and it landed for its own nine
   (`a54394df6`). It was never applied to `home-client`. These are the modules whose headers sell the fail-closed
   arm as the whole reason the conversion is better than the legacy gate; if a future reader change turns
   `unreadable` back into silence, every declared row stays green. Ten rows, one known shape, zero design risk.

3. **`no-effect-on-shared-selection` FAILS OPEN on the shared reader's third answer** (wave 7 D1, `:337`;
   `:186` unchanged). It is the program's named ANTI-pattern: eleven siblings write `!== "other"` and report,
   this one writes `=== "home"` and drops the verdict. Measured pinned in NEITHER direction — flipping the
   predicate changes no declared row — so a future edit moves it between fail-open and fail-closed invisibly.
   It is a security-adjacent selection-taint policy, and it currently has no board row of its own.

4. **§5b.5 — the header gap across 48+ modules (#2005), because it BLOCKS #2000.** Not prose polish: wave 9
   states the mechanical consequence outright — no converted module records the legacy pre-conversion SHA its
   §4.6 differential would replay against, so the parity question (#2000, P1) cannot be attempted for the
   corpus. Re-derived 0 of 9 on the Drizzle family this session; waves 8 and 9 measured 25 of 25 and 14 of 14.
   The standard already exists in one paragraph: `nullable-column-inequality.ts:42-53` (legacy `scanRoot`,
   measured 6,113 → 6,112 delta, the one dropped path, a positive control).

5. **#1922 — nine FINAL modules still carry a legacy `ExemptionTable`** (wave 1 D8, wave 4 premise 2;
   re-derived open this session in the two raw-CSS modules). The reason this outranks the remaining narrowing
   cells: the raw-CSS family is cited as copy material, so **a lane told to copy the split family today mints a
   26th table**, and `exception-authority-census.md` structurally cannot see these because it is keyed on the
   table TYPE and dated before the conversions. Wave 4's scope correction is the actionable half: the census
   owes a re-derivation keyed on CONTRACT FORM, not on the table type.

## WHAT A WAVE CLAIMED THAT I FOUND FALSE

- **Wave 8's `token` census for `origin-server` is wrong** ("78 rows carry `token` — every origin-server row").
  Wave 9 re-derived the same byte-identical files and found **79 rows, 77 with `token`** — `vector-scope-derived`
  carries two multi-arm rows with `expect: { count: 2 }` and no token. I did not re-run the census; I record
  that wave 9's correction names a MECHANISM (a multi-arm row has no slot for a per-row `token`), which is the
  tie-breaker the brief prescribes, so **prefer wave 9**.
- **Wave 1's 40% unenforced-narrowing headline does not survive its own method.** Waves 2, 5, 7, 8, 9 and 10 all
  measured naive over-reports of 41–73% once the four-way classification was applied. Wave 1 predates every one
  of §4.1's five method rules. Its per-defect findings (D1–D10) hold and nine of ten are closed; its AGGREGATE
  does not, and the playbook already carries that caveat.
- **Wave 4's "three ORDINARY policies have no §4.2 identity arm anywhere" is superseded, not closed by luck.**
  The grep that produced it matched prose; `policy-waiver-identity`'s header records the same trap and is
  marker-FORM rather than mention, and #1952 closed at 0 of 86. A fix lane reading wave 4 D2 today would be
  chasing a row that a gate has been holding since `e4250ae50`.
- **Wave 10 records two claims it EXPECTED to be lies and proved TRUE** (`brand-in-name-position`'s blindness
  tripwire moved into `receiptFailures`' `count === 0`; `bus-fact-health`'s `members: 1` constant is
  load-bearing). Those are not defects and must not be re-opened as roster lies.

## WHAT I DID NOT COVER

This section is load-bearing. Treat anything below as unmeasured.

- **48 of 91 rows are UNADJUDICATED**, listed as such in the state column. The extraction is complete; the
  adjudication is not, and thinning the extraction to make the adjudication look complete was explicitly out.
  The heaviest unadjudicated block is the §4.1 narrowing cells (24 rows, \~110 cells across \~55 modules).
- **I ran no `check:structure`, no `gate:contract`, no `check:policy-conformance`, and no test suite** — four
  lanes were live and the brief fenced them. **So no state in this ledger is a LIVE-INSTRUMENT verdict.** Every
  CLOSED row is a source-shape receipt (the code no longer has the shape the wave described); every live number
  is a RECORDED receipt from a wave or the playbook and is labelled as such. In particular I cannot say how many
  of #1978's 51 `fix` strings survive today, nor which 11 rows #2001 exempts.
- **I did not re-run a single §4.1 cut.** A CLOSED verdict on a narrowing cell here means "a row now exists that
  the cut would kill", not "I cut it and the row died". That is the standard the brief set and it is weaker than
  the wave's own receipt.
- **The four meta-policies are a premise I checked by reading, not by running.** `policy-soundness`,
  `policy-proof-expectations`, `policy-waiver-identity` and `policy-waiver-spelling` (#1971) mechanize four
  defect classes. I read all four headers; I did not verify any of them is GREEN or read its worklist. If one of
  them is withheld on the real tree, every SUPERSEDED-mechanized row above reverts to OPEN and nothing here
  would show it.
- **Roster-row defects are under-adjudicated** (4 of 8 rows). Wave 2's D2 alone is eight independent
  noun-of-art claims against `Core-Enforcement-Active-Gates.md`, and the honest check is a per-clause grep of
  the converted module, which I did not do. Wave 4's D7 (seven of nine rows wrong) is in the same state.
- **Wave 10's rows are adjudicated against MAIN's tree, but its document is not merged** (worktree
  `agent-a6a5469bbfac5b55d` at `fca7c9b42`; the playbook's §2 AUDIT STATE table already cites it). If that
  worktree's tree diverges from main for the `id-brand-flow` modules, my `no-raw-id` and
  `brand-in-name-position` receipts describe main, not wave 10's base.
- **Two suites the waves flagged are fenced to the orchestrator and were not run:**
  `gate-conformance.repo.int.test.ts` (wave 4 D5 reproduced it RED on a quiet tree) and
  `gate-ignore-grammar.repo.int.test.ts` (wave 4 proved all three of its carriers went final, statically). The
  actual failure mode of the second — red vs vacuously green — remains UNMEASURED by anyone.
- **I did not adjudicate any §4.6 differential row, because there are none to adjudicate.** No wave ran a
  conversion differential; waves 1, 2, 3, 5, 6, 7, 8, 9 and 10 each declare it in their own "did not cover".
  That whole axis is #2000's and the §5b.5 SHA gap is why it cannot start.
- **The per-wave "did not cover" sections are themselves un-indexed here.** Nine of the ten waves declare gaps
  in their own method (wave 3 did not run the §4.2 dead-position control; wave 7 built 8 of 17 falsifiers;
  wave 8 left origin-server's §4.1 uncovered, which wave 9 then closed). A second pass over those sections would
  add rows to this ledger that no wave ever filed as a defect.
