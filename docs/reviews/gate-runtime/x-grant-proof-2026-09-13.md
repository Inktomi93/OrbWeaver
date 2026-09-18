---
kind: review
status: active
updated: 2026-09-13
---

# P7 — the reviewed-grant identity witness (#2189), core + census

Lane `cb-x-grant-proof`. CHECKPOINT: the core landed and the census is complete; adoption beyond the one
exemplar and the flip to mandatory enforcement are the next owner's, per the 10:05Z owner change that
consolidates enforcement work on one Codex lane. **LANDED 2026-09-13 (`b29dc50ab`)** — both did: the flip is
DONE (the gating constant and its conditional are deleted, the witness rule is unconditional at every loading
door) and adoption is **45/45 witnessed**. The four sentences this document states in the checkpoint's tense
are annotated in place below; every measured fact is kept as taken.

## 1. The defect, measured before anything was built

`verifyPolicyProofs` was blind to a `reviewed-grant` policy's emitted `(subject, operation)`. Two synthetic
policies identical but for their operation — `"the-operation"` and
`"the-oepration-TYPO-no-grant-can-name"` — both returned `[]` from the runner on the unmodified tree.

The same measurement on a REAL policy, taken with the annotated adopter reverted to `HEAD` (`cp` backup +
`git show HEAD:<path>`, restored, `git status` verified): renaming `bus-payload-allowlist`'s emitted
`OPERATION` in a scratch sibling module produced **zero** additional failures. Nothing in the corpus asked
whether a reviewed-grant policy's identity could bind a grant at all, so a conversion could ship an
identity no central row can ever consume and every check stayed green.

## 2. The contract delta

`tooling/src/verify/contract/policy.ts`

- `GatePolicyProofGrant { subject, operation }` — a new interface; both values are AUTHORED strings.
- `GatePolicyProof.grant?: GatePolicyProofGrant` — optional; absent is byte-identical to before.
- `POLICY_PROOF_KEY_TABLE` gains `grant` (held two-sided against the interface by `satisfies`; adding the
  field without the row is a `tsc` error, which is how the first edit failed).
- `POLICY_PROOF_GRANT_KEYS` — the witness's own key vocabulary, the validator's exact-key set derives.
- `REVIEWED_GRANT_WITNESS_REQUIRED: boolean = false` — the gate on the GLOBAL obligation only. Typed
  `boolean` rather than the literal so the guarded call stays live code. **The flip commit DELETES this
  constant and makes the call unconditional**; a `= true` left standing would be the backward-compatibility
  toggle this program forbids. **LANDED 2026-09-13 (`b29dc50ab`)** — deleted, with its conditional; the call
  is unconditional. This bullet is the LAST repo-wide occurrence of that identifier and it is HISTORY, not a
  live contract constant: a grep landing here has found the record of a deleted toggle, never a live gate.

### Validator rules (`tooling/src/verify/lib/policy-validation.ts#assertProofGrant`), with their exact text

| rule | error |
| - | - |
| `mustPass` / `mustRefuse` row | `<label>.grant is valid only for a mustFlag proof — a reviewed-grant identity is a second verdict over a row that already reports a finding` |
| `hard` / `ordinary` policy | `<label>.grant is valid only for a reviewed-grant policy, and descriptor.authority is "<authority>", which has no grant door` |
| unknown key inside `grant` | `<label>.grant has unknown property "<key>"` (shared `exactKeys`) |
| blank / control-bearing value | `<label>.grant.<subject\|operation> must be a nonempty control-free string` |

**REPAIRED 2026-09-13 (lane `cb-x-p7-ownprop`, integrator's sha pending)** — every rule in that table fires on
OWN-PROPERTY PRESENCE, not on a defined value. As shipped in `b29dc50ab` the guard was `proof["grant"] ===
undefined`, so an own `grant: undefined` on a `mustPass`/`mustRefuse` row was ADMITTED at all five loading
doors while `grant: {…}` was refused by name. See §9.

`assertProof` now takes a `ProofRowContext { arm, authority }` instead of a positional
`allowExpectation: boolean` (biome caps functions at four parameters, and two rules now key off the arm).
That also retires the `label.startsWith("mustRefuse")` string test — the arm identity was travelling as
prose in a label.

`reviewedGrantWitnessFailure(policy)` is the GLOBAL rule, exported and directly callable so both of its
positions are pinnable. **AT LEAST ONE** witness per reviewed-grant policy, not exactly one: a second valid
witness is strictly more evidence and refusing it would price honesty as a defect.

## 3. The runner's second-run mechanism

`tooling/src/verify/ops/policy-conformance.ts`

The substrate runners now take a LIST of grant sets and return a LIST of runs over ONE materialization
(`runPasses` / `PassTarget` / `ExampleInput`; default `NO_GRANTS = [[]]`, byte-identical to the previous
single pass). One materialization, N passes — a re-materialized `resource` root is a different directory
with a different git index, so two verdicts taken across two roots would be two verdicts about two inputs.

`grantIdentityFailure` runs after the baseline `mustFlag` verdict has already held, with one grant minted
by `identityProofGrant` from the row's AUTHORED strings (`id: "<policyId>:conformance-identity-proof"`).
It holds only when all of these are true together:

- the pass neither threw nor refused — `toolFailure` covers tool errors, authority ALARMS, a non-success
  owner and withholding;
- `grantedFindings` filtered to this policy and this generated grant has length exactly 1;
- `effectiveFindings` for this policy is empty.

A wrong authored subject or operation lands in the first bullet: the finding matches no grant, stays
effective, and the unused generated row alarms `stale-reviewed-grant`. Two findings sharing the authored
identity alarm `over-broad-reviewed-grant` and license nothing (§12.5). The identity run is never reached
when the baseline refuses, because `toolFailure` precedes the arm verdict by design.

`ops/policy-conformance-stage.ts` prints `· N identity-proof rows` as its own segment, derived through
`lib/policy-proof-rows.ts#policyGrantIdentityRowCount`. Counted APART from `proof rows` for the reason
\#1977 paid for: a second verdict folded into the first arm's total leaves the total reading unchanged while
the whole arm is absent, and a zero could not be told from "the arm never ran".

## 4. Controls, each with its receipt

All in `tests/tooling/verify/lib/policy-loader.test.ts` (load) and
`tests/tooling/verify/ops/policy-conformance.test.ts` (runner). Every one green at
`pnpm test:scoped` — 6 files, 142 tests, exit 0.

| # | control | state |
| -: | - | - |
| 1 | reviewed-grant policy with no witness → the global rule reds when CALLED, and the loader still accepts it | green, both positions pinned |
| 2 | witness on `mustPass` and on `mustRefuse` → refused by name | green |
| 3 | witness on a `hard` and on an `ordinary` policy → refused, naming the authority | green |
| 4 | blank `subject` / blank `operation` → refused per key; unknown key inside `grant` → refused | green |
| 5 | valid witness → baseline flags, grant rerun yields 1 granted / 0 effective / 0 alarms | green |
| 6 | WRONG authored subject → `[stale-reviewed-grant]`, and the wrong pair is named in the detail | green |
| 7 | WRONG authored operation → same | green |
| 8 | two findings sharing the authored identity → `[over-broad-reviewed-grant]` | green |
| 9 | owner refuses → reported by the EXISTING refusal logic on BOTH arms; neither detail mentions the identity run | green |
| 10 | a SECOND valid witness on another row is legal, and crossing the two identities reds ONLY row 1 | green |

Controls 6 and 7 are the load-bearing ones: they are what proves the runner mints its grant from the row's
authored strings rather than from the finding it just watched the policy emit. Control 10's crossed arm is
the anti-vacuity control for control 10 itself.

Beyond the brief: **"never one half alone"** has its own row — a policy emitting the authored identity on
one file and a different identity on another reaches `grantedFindings` 1 while a finding stays effective,
and the row still reds.

## 5. Planted-break receipts (§4.7)

The witness is an INVENTED property, so it owes a planted break. Anchor asserted to occur EXACTLY ONCE in
the file before each cut; cut written to a scratch SIBLING module (a `?query` re-import returns the cached
module), `rmSync` in a `finally`; the real file never mutated.

**Cut 1 — and it found a real defect in the row I had just written.** The adopter's annotation was first
authored as `operation: OPERATION`, reusing the module constant. Renaming that constant moved the EMITTED
and the AUTHORED value TOGETHER and the row stayed GREEN — the same tautology as deriving the identity from
the finding, and a live hazard: the central table still spells `bus-payload-field`, so the rename would
break every real grant while the proof reported success. Fixed by authoring both strings as literals, with
the measurement recorded at the row.

**Cut 2 — with its uncut control in the same invocation**, because cut 1 came back with two `mustPass` tool
errors and a cut whose baseline is already red proves nothing:

```
UNCUT CONTROL (the real module): 2 failure(s)
  ✗ mustPass[1] · PASS TOOL ERROR [receipt] policy receipt refused: population "bus-payload-allowlist" resolved zero members
  ✗ mustPass[8] · PASS TOOL ERROR [receipt] policy receipt refused: population "bus-payload-allowlist" resolved zero members
CUT (emitted operation renamed; annotation still the literal): 3 failure(s)
  ✗ mustFlag[0] · grant identity run for subject="apiKey" operation="bus-payload-field": AUTHORITY ALARM [stale-reviewed-grant] reviewed grant was unused after a complete owner run: bus-payload-allowlist:conformance-identity-proof
  ✗ mustPass[1] · … (unchanged)
  ✗ mustPass[8] · … (unchanged)
ROW DIED UNDER THE CUT — the annotation is enforced.
```

The two `mustPass` rows are PRE-EXISTING and not this lane's: with the gate reverted to `HEAD` the uncut
and cut columns are byte-identical at 2 failures each — which is simultaneously the §1 red baseline taken
on a real policy. See §7 row L1.

## 6. The adopter

`tooling/src/verify/gates/bus-payload-allowlist.ts` `mustFlag[0]` gains
`grant: { subject: "apiKey", operation: "bus-payload-field" }`. Picked by reading, not by the brief's list:
its family test already proves the §4.3 triple, its grant identity is the FIELD NAME (which is what makes
the live `credentialId` row grantable at all), and its family test is neither `registry-family.suite.test.ts` nor
`resource-layout-wave-*.test.ts`. Driven before it was written — that fixture's raw finding carries
`subject: "apiKey"`, `operation: "bus-payload-field"`.

`tests/tooling/verify/gates/bus-payload-family.suite.test.ts` is UNCHANGED and green before and after.

The subject is `apiKey` rather than `credentialId` on purpose: the claim is that the policy's emitted
identity can reach the central door, not that this field deserves a grant. A `credentialId` fixture would
prove the same mechanism at a different value and is available if the next owner wants the stronger
optics.

## 7. Census — 45 reviewed-grant policies, not 48

**The brief's "48" is a GREP artifact and the tree says 45.** `grep 'authority: "reviewed-grant"'` over
`tooling/src/verify/gates/` returns 48 files; the production loader returns 45 final policies with that
authority. The three extra are prose and fixture text inside modules of another authority:
`biome-grant-liveness-health.ts:7` (a header sentence about its sibling, itself `hard`),
`over-art-plate-arm.ts:69` (a header sentence about a rejected alternative, itself `ordinary`),
`policy-waiver-spelling.ts:170` (a `String.replace` inside a proof fixture, itself `hard`).

Method: every reviewed-grant final policy from `loadMixedGateCorpus`, each `mustFlag` row DRIVEN through
`runPolicyPass` on its own materialized fixture, the raw finding identities read off the owner result.
Positive control: every row came back `owner=success` with at least one finding and a non-blank
`(subject, operation)` — zero rows threw, tool-errored or produced an empty identity.

Classes:

- **B — 40 policies.** A `mustFlag` row emits a single stable identity whose OPERATION is also named by a
  central `REVIEWED_GRANTS` row for that policy. Ready to annotate with no new fixture.
- **C — 5 policies.** A `mustFlag` row emits a single stable identity, but no central row corroborates the
  operation. Four of the five (`no-effect-on-shared-selection`, `no-untrusted-html-in-main-dom`,
  `package-layout`, `theme-override-only-via-scope`) have ZERO central grant rows, so there is nothing to
  match — the witness is still valid, just uncorroborated. **`single-stream-transport` is the one worth a
  read:** it has two central rows (`sse-subscription:impersonateStream`, `sse-subscription:connect`) and
  its five `mustFlag` rows emit `sse-subscription:live` / `:streamSomethingNew` / `:a` / `:b`. The
  operation is derived per-procedure, so the fixtures name procedures the real table does not; the witness
  is honest but proves a synthesized operation.
- **D — 0 policies.** Nothing in the corpus lacks a suitable fixture.

**The weak-signal column is NOT a pin.** It says only that some family-test FILE importing this module also
mentions `grantedFindings` somewhere. A file covering nine policies with one grant assertion credits all
nine, so a first cut of this census read 42/45 as "already semantically pinned" — a false clean by
construction. It is a place to look before annotating, never a reason to skip a row. Three policies have no
signal at all: `css-family-direct-client-mechanism`, `package-layout`, `seed-theme-ink-contrast`.

<!-- prettier-ignore-start -->

| # | policy | central grant rows | `mustFlag` rows | witness candidate (row · subject · operation) | class | family-test file asserting `grantedFindings` (WEAK) |
| -: | - | -: | -: | - | :-: | - |
| 1 | `biome-grant-liveness` | 1 | 4 | `mustFlag[2]` · `packages/nonexistent/**` · `biome-glob-grant` | B | `grant-liveness-family.suite.test.ts` |
| 2 | `bound-field-via-hook` | 1 | 6 | `mustFlag[0]` · `packages/client/src/forms/editor/bound-fields/x-field.tsx` · `raw-field-context-read` | B | `home-client-family.suite.test.ts` |
| 3 | `bus-channel-primitive` | 1 | 7 | `mustFlag[0]` · `packages/server/src/transport/trpc/probe-bus.ts` · `event-emitter-construction` | B | `home-server-family.suite.test.ts` |
| 4 | `bus-payload-allowlist` | 1 | 12 | `mustFlag[0]` · `apiKey` · `bus-payload-field` | B | `bus-payload-family.suite.test.ts` |
| 5 | `chat-stream-writes-in-bus-only` | 2 | 5 | `mustFlag[0]` · `packages/client/src/features/chat/components/turn.tsx` · `chat-stream-write-handle` | B | `home-client-family.suite.test.ts` |
| 6 | `client-cache-surgery-only-in-data` | 9 | 7 | `mustFlag[0]` · `packages/client/src/features/some-feature/surfaces/surface.tsx` · `cache-surgery:invalidateQueries` | B | `home-client-family.suite.test.ts` |
| 7 | `config-anchor-in-registry` | 2 | 5 | `mustFlag[0]` · `packages/client/src/features/b/components/orphan-section.tsx` · `config-anchor-stamp` | B | `registry-family.suite.test.ts` |
| 8 | `content-part-seam` | 9 | 5 | `mustFlag[0]` · `packages/server/src/domain/chat/verbs/assemble.ts` · `chat-content-part-reference` | B | `home-server-family.suite.test.ts` |
| 9 | `css-family-direct-client-mechanism` | 3 | 3 | `mustFlag[0]` · `packages/client/src/styles/globals.css` · `direct-client-mechanism:slot:dialog-popup` | B | — |
| 10 | `no-direct-useform` | 2 | 6 | `mustFlag[1]` · `packages/client/src/forms/editor/use-app-form.ts` · `tanstack-form-mint:createFormHook` | B | `home-client-family.suite.test.ts` |
| 11 | `no-direct-users-read` | 7 | 6 | `mustFlag[0]` · `packages/server/src/domain/billing/x.ts` · `users-table-reference` | B | `home-server-family.suite.test.ts` |
| 12 | `no-effect-on-shared-selection` | 0 | 6 | `mustFlag[0]` · `packages/client/src/features/chat/hooks/x.ts` · `effect-on-shared-selection` | C | `home-client-family.suite.test.ts` |
| 13 | `no-inline-invalidate-outside-seam` | 1 | 5 | `mustFlag[0]` · `packages/client/src/features/a/mutation.ts` · `inline-invalidate-queries` | B | `home-client-family.suite.test.ts` |
| 14 | `no-raw-clock` | 2 | 9 | `mustFlag[0]` · `packages/server/src/domain/feature/logic.ts` · `ambient-clock-read` | B | `home-server-family.suite.test.ts` |
| 15 | `no-raw-egress` | 8 | 8 | `mustFlag[0]` · `packages/server/src/domain/hub/verbs/browse.ts` · `raw-fetch` | B | `ordinary-visitors-family.suite.test.ts` |
| 16 | `no-raw-interactive-intrinsics` | 1 | 6 | `mustFlag[0]` · `packages/client/src/features/demo/thing.tsx` · `raw-interactive-intrinsic:button` | B | `ordinary-visitors-family.suite.test.ts` |
| 17 | `no-raw-intl-time` | 1 | 9 | `mustFlag[2]` · `packages/client/src/alias.ts` · `intl-formatter` | B | `home-client-family.suite.test.ts` |
| 18 | `no-raw-matchmedia` | 5 | 9 | `mustFlag[0]` · `packages/client/src/features/x/x.tsx` · `raw-match-media` | B | `home-client-family.suite.test.ts` |
| 19 | `no-raw-random` | 1 | 8 | `mustFlag[0]` · `packages/server/src/domain/feature/logic.ts` · `ambient-entropy-draw` | B | `home-server-family.suite.test.ts` |
| 20 | `no-raw-zustand-persist` | 4 | 8 | `mustFlag[0]` · `packages/client/src/features/x/store.ts` · `zustand-persist-mint` | B | `home-client-family.suite.test.ts` |
| 21 | `no-untrusted-html-in-main-dom` | 0 | 3 | `mustFlag[0]` · `packages/client/src/components/foo.tsx` · `raw-html-injection` | C | `home-client-family.suite.test.ts` |
| 22 | `no-untyped-soft-ref` | 6 | 4 | `mustFlag[0]` · `t.widgetId` · `soft-reference` | B | `ordinary-visitors-family.suite.test.ts` |
| 23 | `owner-role-split` | 5 | 8 | `mustFlag[0]` · `packages/server/src/domain/hub/x.ts` · `global-role-comparison` | B | `home-server-family.suite.test.ts` |
| 24 | `package-layout` | 0 | 1 | `mustFlag[0]` · `packages/kit/src/loose.ts` · `loose-package-root-module` | C | — |
| 25 | `persistence-boundary` | 4 | 7 | `mustFlag[0]` · `packages/client/src/features/x/x.ts` · `raw-storage:localStorage` | B | `ordinary-visitors-family.suite.test.ts` |
| 26 | `render-error-via-battery` | 3 | 6 | `mustFlag[0]` · `packages/client/src/features/a/x.tsx` · `custom-render-error` | B | `home-client-family.suite.test.ts` |
| 27 | `route-imports-no-feature` | 5 | 3 | `mustFlag[0]` · `packages/client/src/routes/some-route.tsx` · `feature-front-door-import:#features/chat` | B | `registry-family.suite.test.ts` |
| 28 | `scrubber-home` | 1 | 5 | `mustFlag[0]` · `packages/server/src/transport/trpc/leak.ts` · `hidden-span-scrubber-construction` | B | `home-server-family.suite.test.ts` |
| 29 | `seed-theme-ink-contrast` | 9 | 9 | `mustFlag[6]` · `packages/ui/src/charts/meter/variants.ts` · `ink:border` | B | — |
| 30 | `selection-store-via-factory` | 3 | 5 | `mustFlag[0]` · `packages/client/src/state/x-selection-store.ts` · `raw-gated-store-mint` | B | `home-client-family.suite.test.ts` |
| 31 | `single-stream-transport` | 2 | 5 | `mustFlag[0]` · `packages/server/src/transport/trpc/routers/probe.ts` · `sse-subscription:live` | C | `home-server-family.suite.test.ts` |
| 32 | `sole-env-reader` | 9 | 11 | `mustFlag[2]` · `packages/server/src/domain/hub/door.ts` · `process-env-read:OWNER_HANDLES` | B | `home-server-family.suite.test.ts` |
| 33 | `suppressions` | 65 | 13 | `mustFlag[0]` · `lint/foo` · `source` | B | `suppressions-family.suite.test.ts` |
| 34 | `theme-override-only-via-scope` | 0 | 4 | `mustFlag[0]` · `packages/client/src/components/foo.tsx` · `color-token-inline-override` | C | `home-client-family.suite.test.ts` |
| 35 | `tooling-argv-front-door` | 6 | 7 | `mustFlag[0]` · `tooling/src/codemod/lib/diagnostics.ts` · `process-argv-read` | B | `tooling-front-door-family.suite.test.ts` |
| 36 | `tooling-artifact-path-home` | 1 | 7 | `mustFlag[0]` · `tooling/src/snap/ops/out.ts` · `reports-path-literal` | B | `tooling-plumbing-family.suite.test.ts` |
| 37 | `tooling-browser-door` | 2 | 6 | `mustFlag[0]` · `tooling/src/snap/ops/capture.ts` · `browser-launch` | B | `tooling-plumbing-family.suite.test.ts` |
| 38 | `tooling-child-process-door` | 5 | 7 | `mustFlag[0]` · `tooling/src/seed/ops/raw.ts` · `child-process-import` | B | `tooling-plumbing-family.suite.test.ts` |
| 39 | `tooling-port-registry` | 1 | 6 | `mustFlag[0]` · `tooling/src/stack/ops/up.ts` · `port-literal` | B | `tooling-plumbing-family.suite.test.ts` |
| 40 | `tooling-process-exit-home` | 1 | 5 | `mustFlag[0]` · `tooling/src/ast/ops/bail.ts` · `process-exit` | B | `tooling-plumbing-family.suite.test.ts` |
| 41 | `tooling-project-home` | 9 | 5 | `mustFlag[0]` · `tooling/src/ast/ops/load.ts` · `ts-morph-project-construction` | B | `tooling-plumbing-family.suite.test.ts` |
| 42 | `tooling-root-config-import` | 1 | 3 | `mustFlag[1]` · `tooling/src/aa/ops/x.ts` · `root-config-import:knip.ts` | B | `tooling-front-door-family.suite.test.ts` |
| 43 | `tsconfig-entry-liveness` | 8 | 5 | `mustFlag[0]` · `packages/client/src/gone.ts` · `tsconfig-exact-entry` | B | `grant-liveness-family.suite.test.ts` |
| 44 | `two-class-role-authority` | 3 | 9 | `mustFlag[0]` · `packages/server/src/domain/rpg/verbs/patch-actor.ts` · `enforcement-role-comparison` | B | `home-server-family.suite.test.ts` |
| 45 | `zod-error-issues-home` | 8 | 5 | `mustFlag[0]` · `packages/contracts/src/x.ts` · `error-issues-read` | B | `ordinary-visitors-family.suite.test.ts` |

<!-- prettier-ignore-end -->

## 8. Limits, and what this does NOT cover

- One representative identity per policy. Whole-table production liveness still owns "every central row is
  consumed"; this proves the emitted identity can reach the door.
- It does not judge whether a grant is a good decision — `why` / `endsWhen` and owner review own that.
- The GLOBAL obligation is gated OFF. 44 of 45 reviewed-grant policies carry no witness today.
  **LANDED 2026-09-13 (`b29dc50ab`)** — the obligation is UNCONDITIONAL and adoption is **45 of 45**, every
  one carrying exactly one witness. Re-derived on this stack through `loadMixedGateCorpus`: 309 modules · 267
  final · 42 legacy · 0 unregistered; authorities `hard 96 · ordinary 126 · reviewed-grant 45`; 45 witnesses
  across 45 policies.
- Not run: `pnpm check:policy-conformance` whole (publishes a pointer; the brief required a GO that the
  checkpoint pre-empted) and `policy-soundness-family.suite.repo.int.test.ts` (no meta-policy vocabulary changed,
  and it is parser-heavy). Both are owed before the flip. **LANDED 2026-09-13 (`b29dc50ab`)** —
  `pnpm check:policy-conformance` was driven ONCE by the independent P7 security review (lane
  `cb-sec-p7-review`, its own worktree) and exits **0**: 267 final policies · 3229 proof rows · 30 refusal
  rows · **45 identity-proof rows** as its own segment · 0 failures · 218 grant rows · 0 invalid.
  `policy-soundness-family.suite.repo.int.test.ts` remains NOT RUN and stays owed to the orchestrator's train.
- Owed LAW DELTA, not landed here (the guide is a multi-lane file and law deltas are the orchestrator's):
  `docs/design/gate-runtime-standardization.md` §12.1's hand-restated descriptor block and its "THE FIELD
  VOCABULARY IS DATA" paragraph do not mention `grant` / `POLICY_PROOF_GRANT_KEYS`, and §4 item 3 still
  says the §4.3 identity arm lives "beside the family" only. **STILL OPEN 2026-09-13** — re-derived on this
  stack: the guide is unchanged, and the independent P7 review adds that its §4.3 sentence ("a reviewed-grant
  policy cannot prove grant consumption in a module row at all") is now FALSE law, which a cold conversion
  lane would read as licence to skip the witness the loader requires. Orchestrator's, WITH integration.

## 9. Own-property correction (cb-x-p7-ownprop)

Lane `cb-x-p7-ownprop`, on top of `b29dc50ab`. It repairs L3 of the independent P7 security review (lane
`cb-sec-p7-review`): the validator held TWO notions of "the author declared this key". `exactKeys`, the Q05
`mustRefuse` expectation rule, the optional-arm rule and the `workItem` rule all read OWN-PROPERTY PRESENCE;
five other rules read the VALUE. So an own `grant: undefined` on a `mustPass`/`mustRefuse` row — the arms the
witness rule exists to refuse — was ADMITTED, while `grant: { subject, operation }` on the same row was
refused by name. Not reachable from a typed descriptor (`tsconfig.base.json` sets
`exactOptionalPropertyTypes`), reachable through the `as never` / `as GatePolicy` cast every hand-built
descriptor and fixture uses. No suppression consequence at any point: an `undefined` witness binds nothing,
`reviewedGrantWitnessFailure` never counted it, and the corpus carries no such key.

### 9.1 Lines changed — all in `tooling/src/verify/lib/policy-validation.ts`

Own-key presence is spelled `Object.hasOwn`, which is this file's EXISTING spelling for the notion (`:157`
links-vs-files, `:178` the Q05 expectation keys, `:367` resource ids, `:483` `workItem`, `:528` the optional
arm). No new helper, no third spelling.

| site (pre-fix line) | rule | before | after |
| - | - | - | - |
| `assertProofGrant` `:202` | the witness's arm + authority gate — the row L3 names | `proof["grant"] === undefined` | `!Object.hasOwn(proof, "grant")` |
| `assertProof` `:260` | `expect` is mustFlag-only | `proof["expect"] !== undefined` | `Object.hasOwn(proof, "expect")` |
| `assertProofLinks` `:143` | `links` is resource-mode only | `proof["links"] === undefined` | `!Object.hasOwn(proof, "links")` |
| `assertExpectation` `:120` `:123` | `count` / `line` are positive integers | `expectation["count"] !== undefined` | `Object.hasOwn(expectation, "count")` |
| `assertExpectation` `:127` | `token` / `messageIncludes` / `countFrom` are nonblank | `expectation[key] !== undefined` | `Object.hasOwn(expectation, key)` |
| `assertExpectation` `:133` | `count` and `countFrom` are mutually exclusive (#2001) | both `!== undefined` | both `Object.hasOwn` |
| `assertGatePolicyDescriptor` `:514` | `fix` is a nonblank string when present | `policy["fix"] !== undefined` | `Object.hasOwn(policy, "fix")` |

Two sites were audited and deliberately LEFT reading the value, each with the reason in a comment: `:254`
(`mustRefuse` REQUIRES `expect` — an own `expect: undefined` is a missing expectation either way, and the
value test keeps the message that names the omission) and `assertGatePolicyHooks` / `assertOptionalHook`,
which judge a `create` RESULT at runtime rather than an authored annotation, and where both readings already
refuse. `:133` is now unreachable by an undefined `count` because `:120` refuses it first — the change there
is one spelling for one notion, not a behaviour change, and no control claims otherwise.

### 9.2 Controls — red-first against the unmodified validator, at all FIVE production doors

Driven from the session scratchpad against PRODUCTION functions, one subject per column, with the review's
witnessless control re-driven in the same invocation to prove nothing regressed.

| door | witnessed (control) | own `grant: undefined` on `mustPass` — BEFORE | the same — AFTER | witnessless, before and after |
| - | - | - | - | - |
| `assertGatePolicyDescriptor` | admitted, both | **ADMITTED** | THROWS `mustPass[0].grant is valid only for a mustFlag proof` | THROWS `…carries no grant identity witness…` |
| `runPolicyPass` | ran, both | **ADMITTED** | THROWS, same text | THROWS, same text |
| `planPolicyCommand` | `ok:true`, both | **`ok:true`** | `ok:false exit=2`, same text | `ok:false exit=2`, same text |
| `verifyPolicyProofs` | 1 fixture failure, both | **ADMITTED** | THROWS, same text | THROWS, same text |
| `loadMixedGateCorpus` | `final=1`, both | **`final=1`** | THROWS naming the module path | THROWS naming the module path |

The witnessed column is identical before and after at every door (its single failure is the stub fixture's
own `mustFlag` row, which reports nothing — unchanged by this lane). The committed arms are in
`tests/tooling/verify/lib/policy-loader.test.ts`, two tests, both RED on the unmodified validator (24 passed
/ 2 failed) and green after:

| arm | expected | pre-fix |
| - | - | - |
| own `grant: undefined` on `mustPass` / on `mustRefuse` | refused, forbidden-arm message | ADMITTED |
| own `grant: undefined` on `mustFlag` of a `hard` / `ordinary` policy | refused, naming the authority | ADMITTED |
| own `grant: undefined` on `mustFlag` of a reviewed-grant policy | refused `grant must be an object`; NEVER a witness | refused, but by the witness rule |
| the same beside a REAL witness on another row | refused `mustFlag[1].grant must be an object` | ADMITTED |
| grant legitimately ABSENT on `mustPass` / `mustRefuse` | admitted | admitted |
| own `expect: undefined` on `mustPass`; on `mustFlag` | refused mustFlag-only; refused `must be an object` | ADMITTED |
| own `links: undefined` on a source-mode row | refused resource-mode-only | ADMITTED |
| own `count` / `line` / `token` / `countFrom` / `messageIncludes` `: undefined` | refused per key by its value rule | ADMITTED |
| own `fix: undefined` on the descriptor | refused nonblank | ADMITTED |
| the trunk with those keys absent, and with real values | admitted | admitted |

**An undefined grant is NOT a witness and must never count toward the at-least-one rule.** It never did —
`reviewedGrantWitnessFailure` filters `proof.grant !== undefined` — and now the row cannot load at all, so
the two halves of the rule can no longer disagree.

**No real module is affected.** `loadMixedGateCorpus` over this stack, after the fix: 309 modules · 267 final
· 42 legacy · 0 unregistered; `hard 96 · ordinary 126 · reviewed-grant 45`; 45 witnesses across 45 policies —
the review's item-1 numbers, unchanged. A repo-wide sweep for an own-undefined spelling of any of these keys
across `tooling/`, `tests/`, `scripts/` and `packages/*/src` returns only two prose comments and two
unrelated ternaries (304 files call `defineGate(`, so the sweep had a population).

### 9.3 Scope

Zero bytes in the authority engine: `git diff --stat` restricted to `lib/gate-authority.ts`,
`lib/gate-authority-validation.ts`, `lib/reviewed-grants.ts`, `lib/policy-pass.ts` and
`ops/policy-conformance.ts` is EMPTY. The whole commit is two files —
`tooling/src/verify/lib/policy-validation.ts` (+18/−9 — the 9 deletions are the 8 rewritten rule lines plus
the JSDoc's old closing line; the 18 insertions are those 8 rules, the widened `assertProofGrant` contract
comment, and the two deliberate-value notes) and `tests/tooling/verify/lib/policy-loader.test.ts` (+110/−0) —
plus this document.

Floor: `pnpm test:scoped` over `policy-loader.test.ts`, `ops/policy-conformance.test.ts`,
`ops/policy-conformance-stage.int.test.ts`, `lib/gate-authority.test.ts`, `lib/policy-pass.test.ts` — **5
files / 132 tests, exit 0**; `pnpm exec biome check` and `pnpm exec eslint` over the two touched files, exit
0 each; `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` — 11 discovered, 2 runnable,
both PASS; `pnpm check:docs` on this file. NOT run and owed to the integrator: the whole
`check:policy-conformance`, `check:structure`, any planter, `policy-soundness-family.suite.repo.int.test.ts`.

One editorial change beyond the annotations: the LEDGER ROWS section below was a bullet list, and
`reportLedgerRows` (`tooling/src/verify/lib/gate-program-docs.ts`) reconciles a report against the refutation
ledger by counting TABLE body rows under that heading — a bullet list counts as zero against a declared 2.
It is now one table of three rows with a matching declared count, cell text preserved. Adding a SECOND
`## LEDGER ROWS` heading instead would have been worse: that reader accumulates every matching heading into
one count and takes `declared` from the last one that spells `(N rows)`.

## LEDGER ROWS (3 rows)

| row | subject | defect | state | receipt |
| - | - | - | - | - |
| L1 | `bus-payload-allowlist` `mustPass[1]` and `mustPass[8]` | Both rows are RED under the conformance runner on `HEAD`, before the P7 core lane. Driven 2026-09-13: `verifyPolicyProofs([gate])` over the module at `bc6036ba1` returns two failures, both `PASS TOOL ERROR [receipt] policy receipt refused: population "bus-payload-allowlist" resolved zero members`. Both fixtures legitimately scan zero bus fields (`mustPass[1]` is the "MessageView is not a bus-union declaration name" row, `mustPass[8]` the "non-bus contract file declares no bus root" row) and the policy receipts `members: fact.fields.length`, which is 0 — the dispatcher refuses a receipt that resolved zero members | **SETTLED (`b29dc50ab`)** | Confirmed pre-existing by an uncut control against `git show HEAD:` of the module; independently reproduced by the P7 security review, which replayed both fixture bodies through the shipped detector and got the same two refusals; repaired in `b29dc50ab`, after which the whole `check:policy-conformance` stage exits 0. Those two rows were TOOL-ERRORING on main `b1a23e534`, so this stack repairs a latent red main stage |
| L2 | the "48 reviewed-grant policies" figure on the #2189 board row and in the P7 brief | A GREP artifact: `grep 'authority: "reviewed-grant"'` returns 48 files, three of which are prose or fixture text inside modules of another authority. The loader says 45, so an adoption plan priced at 48 is priced at three modules that cannot carry a witness | **CONFIRMED** | Receipts in §7; 45 again in the security review's `loadMixedGateCorpus` run and again in this lane's. Correcting the board row's figure is the orchestrator's |
| L3 | `tooling/src/verify/lib/policy-validation.ts` | The validator held two notions of "declared": `assertProofGrant` gated on `proof["grant"] === undefined`, so an OWN `grant: undefined` on a `mustPass`/`mustRefuse` row was ADMITTED while `grant: {…}` was refused by name — and the same asymmetry sat at FOUR more sites the review's row did not reach (`links` outside resource mode, `expect` outside `mustFlag`, the five expectation value rules, and descriptor `fix`), so the row is a CLASS, not one line. Unreachable from a typed descriptor under `exactOptionalPropertyTypes`; reachable through the `as never` cast fixtures use. No suppression consequence — an undefined witness binds nothing and was never counted as one | **REPAIRED** (lane `cb-x-p7-ownprop`; integrator's sha pending) | §9 above: eight rule sites moved to `Object.hasOwn`, red-first at all five production doors (own `grant: undefined` on `mustPass` was admitted at every one of them before, refused at every one after), two committed arms in `tests/tooling/verify/lib/policy-loader.test.ts` red before and green after, zero engine bytes, and the 309-module corpus loads unchanged at 45/45 witnessed |

ledger rows OWED: 0
