---
kind: review
status: active
updated: 2026-09-13
---

# P7 (#2189) + Q05 — independent security review of the reviewed-grant identity proof

Lane `cb-sec-p7-review`, fresh context, READ-ONLY on the subject tree
(`.claude/worktrees/agent-a6646bc6706ca2732`, never touched). Subject stack: `779ac6a2d` (claude-b P7 core)
→ `484d1764e` (merge of main `b1a23e534`) → `b29dc50ab` (Astra: mandatory witness + 45-policy adoption + Q05).
Claim manifest reviewed against: `/tmp/codex-enforcement-p7-completion.md`.

**VERDICT: INTEGRATE `b29dc50ab` WITH `88f80369b`.** (Original verdict, 2026-09-13: integrate with named corrections. Two of the three corrections — L3 and L5 — were repaired by `88f80369b` and independently verified below; L4, the law delta, remains OPEN and orchestrator-owned.) The authority contract is sound. The annotation is
inert in production — it is read by the conformance runner, the row counter and the loader validator and by
nothing else, and the grant it mints is synthetic, in-memory, and never reaches `REVIEWED_GRANTS` or a real
structure run, so no witness can silence a real finding. Every one of the ten review items is CONFIRMED by a
driven receipt, including the item-6 tautology cut. The three corrections were documentation/consistency, none
blocking: L4 (a law doc now states a falsehood — **still OPEN**), L5 (a `status: active` review doc
contradicted by its own stack — **REPAIRED by `88f80369b`**), L3 (a low-severity own-key asymmetry the same
stack tightened everywhere else — **REPAIRED by `88f80369b`**, and the repair widened it from one line to the
whole eight-site class). The followup verification of `88f80369b` is the dated section near the end.

## Method and base

I did NOT apply patches. I branched my own worktree directly at the checkpoint commit —
`git -C <mine> checkout -b cbsp7-review b29dc50ab` — so the tree I measured is byte-identical to the subject
tree, with no `am`/cherry-pick drift. Base stated: `b29dc50ab`, `git status --short` empty before and after
every probe. Package/lockfile parity with my prior HEAD confirmed (`git diff b29dc50ab HEAD -- package.json
pnpm-lock.yaml pnpm-workspace.yaml` empty), so no `pnpm install` was needed and none was run.

Probes are reviewer-owned, live only in the session scratchpad
(`…/scratchpad/cbsp7/`, prefix `cbsp7-`), import PRODUCTION functions (`loadMixedGateCorpus`,
`assertGatePolicyDescriptor`, `runPolicyPass`, `planPolicyCommand`, `verifyPolicyProofs`), and use temp roots
they remove in `finally`. One real file was edited in MY OWN worktree for the item-6 cut
(`tooling/src/verify/ops/policy-conformance.ts`), backed up with `cp … .cbsp7bak` and restored with `mv`, one
command per call; `git status --short` empty afterwards.

### Floor run in my worktree

| check | command | result |
| - | - | - |
| scoped suites | `pnpm test:scoped` over the 9 touched suites + `lib/gate-authority.test.ts` + `lib/ordinary-waiver.test.ts` | **11 files / 217 tests passed**, exit 0 |
| whole-corpus stage (run ONCE, as permitted) | `pnpm check:policy-conformance` | exit 0 — see item 9 |
| biome | `pnpm exec biome check --diagnostic-level=error` over the 59 touched TS files | exit 0, "Checked 59 files … No fixes applied" |
| eslint | `pnpm exec eslint` over the same 59 files | exit 0 |
| types | `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | exit 0 — `11 discovered, 2 runnable`, both PASS |

## Verdicts, item by item

### 1. ADOPTION — CONFIRMED (driven, through the mixed loader)

`loadMixedGateCorpus(<my worktree>)` reports **309 modules · 267 final · 42 legacy · 0 unregistered**;
authority histogram `hard 96 · ordinary 126 · reviewed-grant 45`. **45 reviewed-grant final policies, 45
witnessed, 0 unwitnessed**, exactly one witness each, and **zero** witnesses on non-reviewed policies. The
manifest's "267 final, 45 reviewed, 45 witnessed" is exact. No grep was used for any count.

The manifest's "506 proof rows" reconciles as the 45 adopted policies' own rows, not the corpus:
`mustFlag 283 + mustPass 218 + mustRefuse 5 = 506`. The whole corpus is 3229 + 30. Both numbers are right;
they answer different questions, and the manifest's sentence does not say which. Worth one clarifying word at
integration, not a defect.

The manifest's "forty pairs correspond to existing central operation vocabulary … the five C-census policies
remain valid synthetic identity proofs" reconciles EXACTLY: 40 witnesses name an `operation` that an existing
`REVIEWED_GRANTS` row for the same policy already uses; 5 do not
(`no-effect-on-shared-selection`, `no-untrusted-html-in-main-dom`, `package-layout`,
`theme-override-only-via-scope` have no central row at all; `single-stream-transport`'s
`sse-subscription:live` sits beside central `sse-subscription:impersonateStream` / `:connect`).

Table-side completeness, driven: **all 218 `REVIEWED_GRANTS` rows across 41 distinct policyIds** name a final
`reviewed-grant` policy that now carries a witness — zero rows name a legacy gate, an unknown policy, a
non-reviewed policy, or an unwitnessed one.

#### Adoption table (roster vs witnesses, by policy id — all 45 carry exactly 1)

| policy id | mustFlag rows | witnesses | authored `subject :: operation` |
| - | - | - | - |
| `biome-grant-liveness` | 4 | 1 | `packages/nonexistent/** :: biome-glob-grant` |
| `bound-field-via-hook` | 6 | 1 | `packages/client/src/forms/editor/bound-fields/x-field.tsx :: raw-field-context-read` |
| `bus-channel-primitive` | 7 | 1 | `packages/server/src/transport/trpc/probe-bus.ts :: event-emitter-construction` |
| `bus-payload-allowlist` | 12 | 1 | `apiKey :: bus-payload-field` |
| `chat-stream-writes-in-bus-only` | 5 | 1 | `packages/client/src/features/chat/components/turn.tsx :: chat-stream-write-handle` |
| `client-cache-surgery-only-in-data` | 7 | 1 | `packages/client/src/features/some-feature/surfaces/surface.tsx :: cache-surgery:invalidateQueries` |
| `config-anchor-in-registry` | 5 | 1 | `packages/client/src/features/b/components/orphan-section.tsx :: config-anchor-stamp` |
| `content-part-seam` | 5 | 1 | `packages/server/src/domain/chat/verbs/assemble.ts :: chat-content-part-reference` |
| `css-family-direct-client-mechanism` | 3 | 1 | `packages/client/src/styles/globals.css :: direct-client-mechanism:slot:dialog-popup` |
| `no-direct-useform` | 6 | 1 | `packages/client/src/forms/editor/use-app-form.ts :: tanstack-form-mint:createFormHook` |
| `no-direct-users-read` | 6 | 1 | `packages/server/src/domain/billing/x.ts :: users-table-reference` |
| `no-effect-on-shared-selection` | 6 | 1 | `packages/client/src/features/chat/hooks/x.ts :: effect-on-shared-selection` |
| `no-inline-invalidate-outside-seam` | 5 | 1 | `packages/client/src/features/a/mutation.ts :: inline-invalidate-queries` |
| `no-raw-clock` | 9 | 1 | `packages/server/src/domain/feature/logic.ts :: ambient-clock-read` |
| `no-raw-egress` | 8 | 1 | `packages/server/src/domain/hub/verbs/browse.ts :: raw-fetch` |
| `no-raw-interactive-intrinsics` | 6 | 1 | `packages/client/src/features/demo/thing.tsx :: raw-interactive-intrinsic:button` |
| `no-raw-intl-time` | 9 | 1 | `packages/client/src/alias.ts :: intl-formatter` |
| `no-raw-matchmedia` | 9 | 1 | `packages/client/src/features/x/x.tsx :: raw-match-media` |
| `no-raw-random` | 8 | 1 | `packages/server/src/domain/feature/logic.ts :: ambient-entropy-draw` |
| `no-raw-zustand-persist` | 8 | 1 | `packages/client/src/features/x/store.ts :: zustand-persist-mint` |
| `no-untrusted-html-in-main-dom` | 3 | 1 | `packages/client/src/components/foo.tsx :: raw-html-injection` |
| `no-untyped-soft-ref` | 4 | 1 | `t.widgetId :: soft-reference` |
| `owner-role-split` | 8 | 1 | `packages/server/src/domain/hub/x.ts :: global-role-comparison` |
| `package-layout` | 1 | 1 | `packages/kit/src/loose.ts :: loose-package-root-module` |
| `persistence-boundary` | 7 | 1 | `packages/client/src/features/x/x.ts :: raw-storage:localStorage` |
| `render-error-via-battery` | 6 | 1 | `packages/client/src/features/a/x.tsx :: custom-render-error` |
| `route-imports-no-feature` | 3 | 1 | `packages/client/src/routes/some-route.tsx :: feature-front-door-import:#features/chat` |
| `scrubber-home` | 5 | 1 | `packages/server/src/transport/trpc/leak.ts :: hidden-span-scrubber-construction` |
| `seed-theme-ink-contrast` | 9 | 1 | `packages/ui/src/charts/meter/variants.ts :: ink:border` |
| `selection-store-via-factory` | 5 | 1 | `packages/client/src/state/x-selection-store.ts :: raw-gated-store-mint` |
| `single-stream-transport` | 5 | 1 | `packages/server/src/transport/trpc/routers/probe.ts :: sse-subscription:live` |
| `sole-env-reader` | 11 | 1 | `packages/server/src/domain/hub/door.ts :: process-env-read:OWNER_HANDLES` |
| `suppressions` | 13 | 1 | `lint/foo :: source` |
| `theme-override-only-via-scope` | 4 | 1 | `packages/client/src/components/foo.tsx :: color-token-inline-override` |
| `tooling-argv-front-door` | 7 | 1 | `tooling/src/codemod/lib/diagnostics.ts :: process-argv-read` |
| `tooling-artifact-path-home` | 7 | 1 | `tooling/src/snap/ops/out.ts :: reports-path-literal` |
| `tooling-browser-door` | 6 | 1 | `tooling/src/snap/ops/capture.ts :: browser-launch` |
| `tooling-child-process-door` | 7 | 1 | `tooling/src/seed/ops/raw.ts :: child-process-import` |
| `tooling-port-registry` | 6 | 1 | `tooling/src/stack/ops/up.ts :: port-literal` |
| `tooling-process-exit-home` | 5 | 1 | `tooling/src/ast/ops/bail.ts :: process-exit` |
| `tooling-project-home` | 5 | 1 | `tooling/src/ast/ops/load.ts :: ts-morph-project-construction` |
| `tooling-root-config-import` | 3 | 1 | `tooling/src/aa/ops/x.ts :: root-config-import:knip.ts` |
| `tsconfig-entry-liveness` | 5 | 1 | `packages/client/src/gone.ts :: tsconfig-exact-entry` |
| `two-class-role-authority` | 9 | 1 | `packages/server/src/domain/rpg/verbs/patch-actor.ts :: enforcement-role-comparison` |
| `zod-error-issues-home` | 5 | 1 | `packages/contracts/src/x.ts :: error-issues-read` |

All 45 authored pairs are STRING LITERALS. Sweep receipt: 45 added `grant: {` lines across the
`b1a23e534...b29dc50ab` gate diff, 45 carrying `subject: "` and 45 carrying `operation: "`; zero identifier,
template or spread forms.

### 2. LOADER / DESCRIPTOR BOUNDARY — CONFIRMED (driven at five doors, both polarities)

The witness rule is **UNCONDITIONAL**. `REVIEWED_GRANT_WITNESS_REQUIRED` and its guard were deleted in
`b29dc50ab` (`git diff 484d1764e b29dc50ab -- tooling/src/verify/lib/policy-validation.ts`), and the constant
survives repo-wide in exactly one place — a prose line in the checkpoint doc (see L5). So the manifest's
"Compatibility constant and conditional deleted" is CONFIRMED, and its gating claim no longer matches the doc
it was written beside.

Every production entrypoint that loads a policy runs the same validator — driven, each with a witnessless
reviewed-grant policy AND a witnessed positive control:

| door | witnessless | witnessed control |
| - | - | - |
| `assertGatePolicyDescriptor` (`lib/policy-validation.ts:488`) | THROWS `…carries no grant identity witness…` | no throw |
| `runPolicyPass` (`lib/policy-pass.ts:224`) | THROWS, same text | no throw |
| `planPolicyCommand` (`lib/policy-plan.ts:66`) | `{ ok: false, exitCode: 2, message: "…no grant identity witness…" }` | proceeds past validation (fails later, on the scope manifest) |
| `verifyPolicyProofs` (`ops/policy-conformance.ts:439`) | THROWS, same text | returns `[]` |
| `loadMixedGateCorpus` → `assertPolicyModuleExport` (`lib/loader.ts:130,138`) — the structure + conformance front door | THROWS naming the module path | loads, `final=1` |

No door skips validation. Annotation admission, driven (all refuse with the exact texts): `grant` on
`mustPass` · on `mustRefuse` · on an `ordinary` policy · on a `hard` policy · blank / empty / control-char /
non-string `subject` · same four for `operation` · an unknown key inside `grant` · a MISSING key. An
unannotated reviewed-grant policy's fate is refusal at load, at every door above.

### 3. BASELINE-FIRST, LAZY RERUN ON ONE MATERIALIZATION — CONFIRMED (root path AND inode)

Astra's repair holds. Driven with a resource-mode reviewed-grant policy that records the fixture root and the
`SourceFile` object on each `evaluate`:

- 3 evaluations for a passing row set (mustFlag baseline · mustFlag grant pass · mustPass).
- baseline and grant pass share the ROOT PATH: `true`.
- baseline and grant pass share the same **inode**: `dev:ino 64512:106693696` on both — `true`. (This is the
  control the earlier checkpoint failed, when `runExample` was called twice and the root was recreated.)
- baseline and grant pass see the **same `SourceFile` object**: `true`.
- the next row gets a DIFFERENT root: `true`. Every root removed: `true`.
- **a FAILING baseline never reaches the grant pass**: with `expect: { count: 9 }` against one finding, only
  **2** evaluations occur (baseline + mustPass) and the verdict is the baseline's own
  `expected effective finding count=9 but got 1`.

Mechanism, source-confirmed: `proofFailure` builds `grantSets = [[], [grant]]` and `runPasses` is a generator
over it inside the ONE `try/finally` that owns the materialization; `mustFlagFailure` calls `runs.next()` for
the second pass **only** when the baseline detail is `null`; `finally { runs.return(); }` releases the
substrate on every path.

### 4. FRESH INVOCATION STATE — CONFIRMED

- A generated grant does not leak into the next row's baseline: a witnessed row followed by an UNANNOTATED
  `mustFlag` row is CLEAN — the second row still sees zero grants and its finding stays effective. (Had the
  grant leaked, that row would red `expected at least one effective finding but got 0`.)
- A THROW inside the GRANT pass is classified as a proof failure, not swallowed and not a tool-crash:
  `grant identity run for subject=… operation=…: PASS TOOL ERROR [evaluate] cbsp7 exploded inside the grant
  pass`, with **every root cleaned** and — checked deliberately — **no tmp-root path leaked into the detail**
  (`sanitizeProofRoot` holds on this path too).
- A policy that refuses in its reader reds through the EXISTING refusal logic on BOTH arms and **neither
  failure mentions the grant run** — the identity pass is never reached.

### 5. THE TRIPLE — CONFIRMED (independent control table, all through `verifyPolicyProofs`)

| control | expected | observed |
| - | - | - |
| valid authored identity | pass | `CLEAN (0 failures)` |
| WRONG SUBJECT | effective + stale alarm → failure | `grant identity run for subject="NOT-the-subject" operation="the-operation": AUTHORITY ALARM [stale-reviewed-grant] reviewed grant was unused after a complete owner run` |
| WRONG OPERATION | same | `…subject="the-subject" operation="NOT-the-operation": AUTHORITY ALARM [stale-reviewed-grant]…` |
| BOTH fields wrong | same | `…subject="x-subject" operation="x-operation": AUTHORITY ALARM [stale-reviewed-grant]…` |
| duplicate emitted identity (2 findings share the pair) | over-broad alarm → failure | `AUTHORITY ALARM [over-broad-reviewed-grant] reviewed grant matched 2 findings after a complete owner run` |
| PARTIAL — one granted, a second finding still effective | failure (never one half alone) | `grant identity run: expected ZERO effective findings once the authored identity is granted but got 1` |
| policy emits on the BASELINE pass only (0 granted, 0 effective) | failure (the other half alone) | `AUTHORITY ALARM [stale-reviewed-grant]` |
| owner refuses (reader throws) | failure via the existing refusal logic, no identity mention | `PASS TOOL ERROR [visitFile] …` on BOTH arms, neither naming the grant run |
| baseline miscount | baseline's own failure, grant pass skipped | `expected effective finding count=7 but got 1` |
| a SECOND valid annotated row | legal and proven | `CLEAN (0 failures)` |

A finding carrying another policy's id cannot reach `granted` (the filter is
`finding.policyId === policy.id && grantId === grant.id`, `ops/policy-conformance.ts:378`) and cannot count as
effective for this policy (`:382`), so it reds as "granted 0" — source-confirmed; the driven analogue is the
wrong-identity pair above, since `knownPolicies: [policy]` makes a foreign id unreachable at runtime.

### 6. INDEPENDENT AUTHORED IDENTITY — CONFIRMED by the cut

Source: `identityProofGrant` (`ops/policy-conformance.ts:337`) reads `identity.subject` / `identity.operation`
— the ROW's authored literals — and has exactly two callers, both inside that file. Nothing derives from the
emitted finding.

**The cut, driven in my own worktree** (`cp … .cbsp7bak`, edit, run, `mv` back, `git status --short` empty):
I made the runner mint the grant from the finding the baseline produced (the grant set filled lazily between
the two `next()` calls, which the array iterator permits). Result:

| control | shipped runner | under the tautology cut |
| - | - | - |
| WRONG SUBJECT | RED (`stale-reviewed-grant`) | **CLEAN** |
| WRONG OPERATION | RED (`stale-reviewed-grant`) | **CLEAN** |
| BOTH wrong | RED (`stale-reviewed-grant`) | **CLEAN** |
| over-broad / partial / baseline-only | RED | RED (unchanged — these probe count semantics, not provenance) |

The three identity controls are the ones that discriminate, and they do. The shipped implementation is not
tautological.

The second half of the item — "never the module's own `OPERATION` constant" — also holds: all 45 authored
pairs are literals (sweep above). `bus-payload-allowlist:132-146` records that this row was written first as
`operation: OPERATION`, that the rename cut left it GREEN, and that the literal reds it — an author-side
planted break I did not need to re-run, and whose class my cut independently reproduces.

### 7. `mustRefuse` EXACT EXPECTATION KEYS (Q05) — CONFIRMED

`assertRefusalExpectation` now derives from `POLICY_EXPECTATION_KEYS` and tests `Object.hasOwn`
(`lib/policy-validation.ts:177-181`), replacing a hand-spelled `["count","line","token"]` list tested with
`!== undefined`. Both holes the old form left are closed. Driven:

| control | expected | observed |
| - | - | - |
| `{ messageIncludes }` alone | admitted | no throw |
| `count: 1` | refused | `mustRefuse[0].expect.count is forbidden…` |
| `count: undefined` (own key) | refused | same text |
| `countFrom: "SOME_DRIVER"` | refused | `…countFrom is forbidden…` |
| `countFrom: undefined` (own key) | refused | same text |
| `line: 1` / `line: undefined` | refused | `…line is forbidden…` (both) |
| `token: "x"` / `token: undefined` | refused | `…token is forbidden…` (both) |
| `count` on the PROTOTYPE, not own | admitted | no throw — the check is own-key, as intended, not a `in` test |
| envelope needle `"ERROR"` | refused | `…names only the runner's generic refusal text ("ERROR" sits inside "FACT TOOL ERROR")…` |
| envelope needle `"OWNER"` | refused | `…("OWNER" sits inside "OWNER RESULT missing")…` |
| envelope needle `"PASS TOOL ERROR"` | refused | `…("PASS TOOL ERROR" sits inside "PASS TOOL ERROR")…` |

### 8. PRESERVED CONTROLS — CONFIRMED, and the bus repair is a real fix, not a weakening

**Zero test titles were removed or renamed** in any touched suite. Census by title, `b1a23e534` vs
`b29dc50ab`: `bus-payload-family` 13→13 · `policy-loader` 21→**24** · `policy-pass-readers.suite` 2→2 ·
`policy-pass` 44→44 · `policy-plan` 24→24 · `policy-refusal-envelope` 9→9 · `resource-policy` 6→6 ·
`policy-conformance-stage.int` 5→5 · `policy-conformance` 16→**23**. The 10 additions are the P7 arm. The
security suites the brief names — `lib/gate-authority.test.ts` (19) and `lib/ordinary-waiver.test.ts` (20) —
are **untouched by the diff** and green in my floor run.

The bus adjudication is the substantive half, and I re-derived it rather than taking the manifest's word.
`bus-payload-allowlist` row census as shipped: `mustFlag 12 · mustPass 9 · mustRefuse 1`; mustPass count
UNCHANGED from main; the whole policy verdict is CLEAN.

- **The two pre-repair `mustPass` rows were genuinely RED.** I replayed main's exact fixture bodies through
  the shipped detector (which the diff does not change — only proof rows and comments moved in that module):
  MessageView-only → `PASS TOOL ERROR [receipt] policy receipt refused: population "bus-payload-allowlist"
  resolved zero members`; settings-only → the same. So Astra repaired two false controls; it did not weaken a
  passing arm. This independently reproduces the checkpoint doc's ledger row **L1**, and settles it.
- **The zero-population refusal EVIDENCE is retained and it discriminates.** The new `mustRefuse` row
  (`expect: { messageIncludes: 'population "bus-payload-allowlist" resolved zero members' }`, fixture = both
  files) passes as shipped, and my NEGATIVE control — the same row with a real bus root added — reds
  `expected the pass to REFUSE but it completed with 0 effective finding(s)`. The arm is live, not decorative.
- **One nuance, stated rather than glossed:** the two originally SEPARATE zero-population conditions are now
  proven by ONE combined row. This is not a coverage loss in the direction that matters — if EITHER file
  starts contributing a bus field the union stops refusing and the row reds — but the row count for that
  condition went 2 → 1, and the brief's phrasing ("the two rows … are refusal EVIDENCE, kept") anticipates
  two. Accept as authored; no action.

### 9. THE STAGE'S OWN SEGMENT — CONFIRMED (driven, one whole-corpus run)

`pnpm check:policy-conformance` in my worktree, exit **0**:

```
policy-conformance: 267 final policies · 3229 proof rows · 30 refusal rows · 45 identity-proof rows ·
0 failure(s) · 218 grant rows (whole table) · 0 invalid · 54996ms (corpus: 309 module(s), 42 legacy …)
```

`45 identity-proof rows` is its OWN segment, printed apart from `proof rows`, and **equals the witness count
from item 1 (45)**. A zero there could not be read as "the arm never ran". The stage's counters derive from
`policyGrantIdentityRowCount` (`lib/policy-proof-rows.ts:29`), so annotating a policy never edits the stage or
its int test. The int test asserts the segment from the same derived helper, not from a literal.

### 10. SCOPE — CONFIRMED, no undeclared authority-engine change

`git diff --stat b1a23e534...b29dc50ab` restricted to `lib/gate-authority.ts`,
`lib/gate-authority-validation.ts`, `lib/reviewed-grants.ts`, `lib/policy-pass.ts`, `lib/loader.ts`,
`lib/policy-module.ts`, `lib/policy-loader.ts`, `contract/gate-authority.ts`, `lib/population-resolver.ts` is
**EMPTY**. The whole non-gate `tooling/src` delta is five files: `contract/policy.ts` (+39),
`lib/policy-proof-rows.ts` (+8), `lib/policy-validation.ts` (+77/−…), `ops/policy-conformance-stage.ts` (+21),
`ops/policy-conformance.ts` (+174). All are P7/Q05's declared surface.

The security-decisive negative: `identityProofGrant` has exactly two callers, both in
`ops/policy-conformance.ts`; no real `REVIEWED_GRANTS` row uses the `:conformance-identity-proof` id suffix;
and `proof.grant` is read at only five sites (three in the conformance runner, one in the row counter, one in
the validator). **A proof-row witness therefore cannot license anything on a real tree.**

## Per-commit verdicts

- **`779ac6a2d` (claude-b P7 core) — SOUND.** Contract key + validator rules + runner second verdict + stage
  segment + the exemplar adopter + the 275-line census doc. Its one design compromise, the gated
  `REVIEWED_GRANT_WITNESS_REQUIRED`, is explicitly declared in the code comment and in the doc as
  flip-and-delete. Its own ledger rows L1/L2 are both accurate (I reproduced both independently).
- **`484d1764e` (merge of main `b1a23e534`) — CLEAN, no evil merge.** `git show --cc 484d1764e` emits **9
  lines and ZERO `diff --` headers** — no conflict-resolution content at all. `git diff b1a23e534 484d1764e`
  over `tooling/src/verify/` + `tests/tooling/verify/` reproduces `779ac6a2d`'s P7 delta exactly, byte for
  byte; the merge brought main's config-snapshot / structure-delta / eslint-grant-liveness work in untouched.
- **`b29dc50ab` (Astra) — SOUND, with the two doc corrections below.** Deletes the gating constant and its
  guard (the flip), tightens Q05 to derive from `POLICY_EXPECTATION_KEYS` with own-key semantics, repairs the
  one-materialization defect (proven by my inode control), adopts 44 further witnesses as authored literals,
  and repairs two genuinely-red bus `mustPass` rows while preserving their refusal evidence. It does NOT
  update the two documents its own changes falsify (L4, L5).

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `policy-validation` | sec-p7 `tooling/src/verify/lib/policy-validation.ts:203` | `assertProofGrant` gates on `proof["grant"] === undefined`, so an OWN `grant: undefined` key on a `mustPass`/`mustRefuse` row of a reviewed-grant policy is silently ADMITTED — while the two sibling rules shipped beside it in the same commit use `Object.hasOwn` (`:178` the Q05 expectation keys, `:528` the optional-arm check, which correctly refuses `mustRefuse: undefined`). One validator, two strictnesses | §5b validator consistency | **REPAIRED `88f80369b`** (verified below; integrator's sha pending) | Driven 2026-09-13: `assertGatePolicyDescriptor` on a reviewed-grant descriptor whose `mustPass[0]` carries `grant: undefined` does NOT throw, where `grant: G` throws `mustPass[0].grant is valid only for a mustFlag proof`. MITIGATED, not unreachable: `tsconfig.base.json:88` sets `exactOptionalPropertyTypes: true`, so a TYPED `defineGate` descriptor cannot spell it; the hole is reachable only through the `as GatePolicy` cast the fixtures use. No suppression consequence — an `undefined` witness binds nothing. Minimal fix: `Object.hasOwn(proof, "grant")` at `:202`, one line, matching `:178` |
| `gate-runtime-standardization` | sec-p7 `docs/design/gate-runtime-standardization.md:735` | the guide states as LAW that *"a reviewed-grant policy cannot prove grant consumption in a module row at all; that belongs in a family test with a real grant table (§4.3)"* — which this stack makes FALSE. `:741` (§4 item 3) still says the §4.3 identity arm lives "beside the family" only; `:1019` and `:1040` repeat it; §5's "the stage prints THREE arms" is now four segments; §12.1's descriptor block and its "THE FIELD VOCABULARY IS DATA" paragraph never mention `grant` / `POLICY_PROOF_GRANT_KEYS` | law delta | **OPEN** | The stack changes zero bytes of the guide (`git diff --stat b1a23e534...b29dc50ab -- docs/design/gate-runtime-standardization.md` empty) while three gate modules (`tooling-argv-front-door.ts:159`, `tooling-port-registry.ts:117`, `tooling-root-config-import.ts:22-24`) DELETE their local copies of the same sentence. A cold conversion lane reading `:735` as law will decline to author a witness the loader now requires — the exact contradiction constitution §0.1.1 routes to the ledger. Declared as owed and orchestrator-owned in `x-grant-proof-2026-09-13.md:253-256`; it should land WITH integration, not after |
| `x-grant-proof-2026-09-13` | sec-p7 `docs/reviews/gate-runtime/x-grant-proof-2026-09-13.md:9,35,247,249-251,255` | a `status: active` review doc carries four claims its OWN stack falsified two commits later: `:35` documents `REVIEWED_GRANT_WITNESS_REQUIRED: boolean = false` as a live contract constant (DELETED in `b29dc50ab`); `:9` says adoption and the flip "are the next owner's" (both landed); `:247` "The GLOBAL obligation is gated OFF. 44 of 45 reviewed-grant policies carry no witness today" (now unconditional, 45/45); `:249-251` "Not run: `pnpm check:policy-conformance` whole … owed before the flip" (I ran it: clean, exit 0) | doc freshness | **REPAIRED `88f80369b`** (verified below; integrator's sha pending) | `REVIEWED_GRANT_WITNESS_REQUIRED` now survives repo-wide at exactly ONE site — this doc line — so a grep for the gating flag returns a false positive and nothing else (that is how I first found it). Its ledger row L1 is likewise SETTLED by `b29dc50ab` and still reads "NOT this lane's … the settling command is `pnpm check:policy-conformance` on main". Minimal fix: a CHECKPOINT→SUPERSEDED banner naming `b29dc50ab`, plus striking the four claims and marking L1 settled |

ledger rows OWED: 3

### Existing-row updates (not new rows)

- **L1** (`x-grant-proof-2026-09-13.md`, "`bus-payload-allowlist` `mustPass[1]`/`mustPass[8]` are RED under
  the conformance runner on HEAD") — **CONFIRMED and now SETTLED.** Independently reproduced by replaying
  main's two fixture bodies through the shipped detector (both `PASS TOOL ERROR [receipt] … resolved zero
  members`), and settled by `b29dc50ab`: the whole-corpus stage is exit 0 in my worktree. Its own "settling
  command is `pnpm check:policy-conformance` on main" is now discharged inside the stack. Consequence worth
  the orchestrator's attention: `structure:policy-conformance` was TOOL-ERRORING on main `b1a23e534` for
  these two rows, hidden by the migration's red-by-construction whole-tree posture — **this stack repairs a
  latent red main stage**, which is an argument FOR integrating it promptly.
- **L2** (`x-grant-proof-2026-09-13.md`, "the 48-reviewed-grant figure is a grep artifact; the loader says
  45") — **CONFIRMED.** The loader says 45 in my run too.

## Declared limits — what this review did NOT cover

- **Semantic adequacy of the 45 authored pairs is out of scope and remains an owner/family obligation.** I
  proved every pair BINDS; I did not judge whether each pair is the identity that policy *should* emit, nor
  whether any real `REVIEWED_GRANTS` row deserves to exist. The witness is a bindability proof, not a
  permission decision, and the code says so.
- **Three witnesses' authored pairs are byte-identical to a REAL central grant row** —
  `css-family-direct-client-mechanism` (`packages/client/src/styles/globals.css` ::
  `direct-client-mechanism:slot:dialog-popup`), `no-direct-useform`
  (`packages/client/src/forms/editor/use-app-form.ts` :: `tanstack-form-mint:createFormHook`),
  `seed-theme-ink-contrast` (`packages/ui/src/charts/meter/variants.ts` :: `ink:border`). This grants
  NOTHING: the conformance pass supplies only the synthetic grant, `validateReviewedGrants` never sees a
  proof-row grant, and the two proofs stay independent. I flag it only because §4.3's design intent is that
  the module row proves the SYNTHETIC door while the family test proves the REAL row, and in these three the
  two are indistinguishable by eye. Observation, not a finding; no action requested.
- **The witness obligation covers FINAL policies only.** The 42 legacy modules are not subject to it, by
  design. I checked the consequence is empty: zero of the 218 `REVIEWED_GRANTS` rows names a legacy gate.
- **Not run:** `pnpm check` / `check:structure` / `verify --push`, any planter, any mutation run,
  `policy-soundness-family.repo.int.test.ts`, `check-gates.repo.int.test.ts` (not concurrency-safe; the
  orchestrator's during a train), and the `gate:contract` corpus total. `pnpm check:docs` on this file only.
- **`pnpm check:policy-conformance` was run exactly ONCE**, in my own worktree; it published a pointer only
  under my worktree's `reports/`. No subject-tree artifact was written by me at any point.

## Integration notes for the orchestrator (not defects in the reviewed logic)

- **Two uncatalogued review docs will ride this integration.** Neither
  `docs/reviews/gate-runtime/x-grant-proof-2026-09-13.md` (added by `779ac6a2d`) nor this file appears in
  `docs/catalog/catalog.json` or `docs/catalog/receipts/reviews.json` (grep count 0 for both). The merge
  `484d1764e` shows the shape a catalogued review doc takes — main's `x-config-scoped-proof-2026-09-13.md`
  landed WITH catalog and receipt rows. I deliberately did NOT regenerate the catalog: it is a shared
  multi-lane file and a whole-tree regenerator run from a lane bakes in whatever else the tree is carrying.
  Both rows are the orchestrator's, in the integration commit.
- **`pnpm check:docs docs/reviews/gate-runtime/sec-p7-review-2026-09-13.md` exits 0** on this file.

## Followup verification (`88f80369b`) — 2026-09-13

Warm leg, review/author separation preserved: I did not author the repair. `88f80369b` (lane
`cb-x-p7-ownprop`) has **`b29dc50ab` as its exact parent** and touches **3 files, +263/−31**. Verified
READ-ONLY by copying its three files into MY worktree (`git show 88f80369b:<path> > <mine>/<path>`, one
command per call), driving, then restoring each from `git show HEAD:<path>`; `git status --short` EMPTY after.
**Verdict: the repair is CORRECT and COMPLETE, and it closes both L3 and L5. Integrate `b29dc50ab` WITH
`88f80369b`.**

### 1. Every listed line and its direction — CONFIRMED (with a citation-drift note)

Post-fix, `Object.hasOwn` appears at 13 sites; **8 are new**, and every one moves in the TIGHTENING direction
(a shape that was admitted is now refused; nothing previously refused is now admitted):

| post-fix line | rule | direction under an own `…: undefined` |
| - | - | - |
| `:120` | `assertExpectation` count validity | was skipped → now `count must be a positive integer` |
| `:123` | `assertExpectation` line validity | was skipped → now `line must be a positive integer` |
| `:127` | `assertExpectation` `token`/`messageIncludes`/`countFrom` nonblank | was skipped → now `must be a nonempty control-free string` |
| `:133` | `assertExpectation` count/countFrom mutual exclusion | own-presence; in practice `:127` refuses first, so strictly non-loosening |
| `:143` | `assertProofLinks` early return | was silent return → now falls through to `links must be an object` (and to the resource-mode fence) |
| `:209` | `assertProofGrant` early return — **the L3 row** | was silent return → now the arm/authority/shape rules run |
| `:269` | `assertProof` `expect` mustFlag-only | was skipped → now `expect is valid only for mustFlag proofs` / `must be an object` |
| `:523` | `assertGatePolicyDescriptor` `fix` | was skipped → now `descriptor.fix must be a nonempty control-free string` |

**Citation drift, worth one word to the integrator:** the handoff cites `:202` / `:260` / `:514` and the
pre-existing spellings `:367` / `:483` / `:528`. Those are PRE-fix line numbers — the 7-line comment block
added above `assertProofGrant` shifts everything below it. Post-fix the same rules are `:209` / `:269` /
`:523` and `:376` / `:492` / `:537`. The claim is true; only its coordinates are one commit stale.

### 2. The two value-reading sites are correctly left — CONFIRMED, and no admission site was missed

I enumerated **every** remaining `=== undefined` / `!== undefined` in the post-fix file (11 sites) and judged
each. Nine are not key tests at all (`:71` a `.find()` result, `:86` `codePointAt`, `:184` a lookup result,
`:371`/`:372` an internal vocabulary lookup, `:577`/`:585`/`:591`/`:599` the runtime `create` result). The two
the handoff names are the judgment calls, and both are right:

- **`:263` — the `mustRefuse` REQUIREMENT for `expect`.** Correctly value-based. Switching it to
  `Object.hasOwn` would make an own `expect: undefined` PASS the presence test and fall into
  `assertRefusalExpectation(undefined)` → the generic `must be an object`, which is a WORSE message than the
  `expect.messageIncludes is required for a mustRefuse proof` the author actually needs. Own-undefined
  refuses either way, so the choice is message quality, and the in-code comment says exactly that.
- **`assertGatePolicyHooks` (`:585`/`:591`/`:599`) and `assertOptionalHook` (`:577`).** These read a value
  RETURNED by user code at runtime, not an authored descriptor literal. `{ visitFile: undefined }` returned
  from `create` genuinely means "no visitFile", and the "at least one hook" check at `:591` correctly refuses
  it. Reading by value is right here.
- One site the handoff does not list and that MUST stay value-based: **`:292`,
  `reviewedGrantWitnessFailure`'s `proof.grant !== undefined`.** It is the witness COUNTER, not an admission
  rule — an own `grant: undefined` must never count as a witness. It stays value-based, and `:209` now
  refuses such a row before it can reach the counter anyway. Correct as left.

**No missed admission site.** The fence is complete.

### 3. The five-door red-first matrix — CONFIRMED for BOTH arms, control unchanged

Driven twice in this session over the same probe: once with the validator restored to `b29dc50ab`, once with
`88f80369b`'s. `ADMITTED` means the descriptor passed validation at that door.

| subject | D1 `assertGatePolicyDescriptor` | D2 `runPolicyPass` | D3 `planPolicyCommand` | D4 `verifyPolicyProofs` | D5 `loadMixedGateCorpus` |
| - | - | - | - | - | - |
| own `grant: undefined` on **mustPass** — BEFORE | ADMITTED | ADMITTED | ADMITTED (`ok` past validation) | ADMITTED (0 failures) | ADMITTED (`final=1`) |
| own `grant: undefined` on **mustPass** — AFTER | `mustPass[0].grant is valid only for a mustFlag proof` | same | same | same | same, named with the module path |
| own `grant: undefined` on **mustRefuse** — BEFORE | ADMITTED | ADMITTED | ADMITTED | ADMITTED (only the unrelated row expectation reds) | ADMITTED (`final=1`) |
| own `grant: undefined` on **mustRefuse** — AFTER | `mustRefuse[0].grant is valid only for a mustFlag proof` | same | same | same | same, named with the module path |
| **witnessless control** — BEFORE / AFTER | refuses / refuses, identical text | idem | idem | idem | idem |
| **witnessed positive control** — BEFORE / AFTER | ADMITTED / ADMITTED | idem | idem | 0 failures / 0 failures | `final=1` / `final=1` |

The witnessed control is byte-identical across the repair at all five doors, and the witnessless control
refuses identically at all five — the fix adds a refusal and removes none.

### 4. Own-undefined on a `mustFlag` row cannot satisfy the at-least-one rule — CONFIRMED both directions

`reviewedGrantWitnessFailure` is private post-`b29dc50ab`, so I drove its observable at all five doors, in two
shapes: a reviewed-grant policy whose ONLY `mustFlag` row carries own `grant: undefined`, and one with two
`mustFlag` rows (one own-undefined, one with no `grant` key at all).

- BEFORE: both refuse with `descriptor.mustFlag carries no grant identity witness` — the counter's
  value-based filter already declined to count them.
- AFTER: both refuse earlier and more precisely with `mustFlag[0].grant must be an object`.

Either way the shape can never be GREEN, at any door. The handoff's claim is exact.

### 5. Zero engine bytes — CONFIRMED

`git diff --stat b29dc50ab 88f80369b` over `lib/gate-authority.ts`, `lib/gate-authority-validation.ts`,
`lib/reviewed-grants.ts`, `lib/policy-pass.ts`, `lib/loader.ts`, `lib/policy-module.ts`, `lib/policy-plan.ts`,
`contract/`, `ops/` and `gates/` is **EMPTY**. The whole change is one validator, one test file, one doc.

**The regression receipt the author's own floor could not give.** Their floor was 5 suites / 132 tests; I ran
my full 11-suite floor against the patched validator — the six suites they omitted
(`gate-authority`, `ordinary-waiver`, `bus-payload-family`, `resource-policy`, `policy-refusal-envelope`,
`policy-pass-readers`) are precisely the ones that hand-build descriptors and were the plausible breakage
surface for a presence-based tightening. Result: **11 files / 219 tests passed** (217 before, +2 from the
repair's own arms). And the corpus is unchanged: `loadMixedGateCorpus` still 309/267/42/0 with 45 witnesses on
45 reviewed-grant policies, and `pnpm check:policy-conformance` exits **0** with a byte-identical summary
(`267 final · 3229 proof rows · 30 refusal rows · 45 identity-proof rows · 0 failure(s) · 218 grant rows ·
0 invalid`). No real gate module authored an own-undefined key, so the tightening cost the corpus nothing.

### 6. The report corrections are true and the table is machine-readable — CONFIRMED

All four stale claims I raised as L5 are corrected IN PLACE, annotated rather than rewritten, with the
original measured text preserved as history — the right pattern for a checkpoint record:
`:9-14` (the flip and adoption both landed), `:37-42` (the constant is deleted, and the bullet now tells a
future grepper it is HISTORY, not a live gate — which is exactly the false positive I hit), `:260-264`
(unconditional, 45 of 45, re-derived through the loader), `:265-271` (`check:policy-conformance` driven and
clean, with `policy-soundness-family.repo.int.test.ts` correctly still declared NOT RUN).

Machine-readability driven through the production reader `reportLedgerRows`
(`lib/gate-program-docs.ts:238`), with its negative control:

| document | `reportLedgerRows` |
| - | - |
| `x-grant-proof-2026-09-13.md` at `88f80369b` | `{ rows: 3, declared: 3 }` |
| the same file at `b29dc50ab` (the pre-repair bullet list) | `{ declared: 2 }`, **`rows` UNDEFINED — unreadable** |
| this report | `{ rows: 3, declared: 3 }` |

L1 is correctly restated as **SETTLED (`b29dc50ab`)**, L2 as **CONFIRMED**, L3 as **REPAIRED**, and
`ledger rows OWED: 0`. The one thing the repair does NOT touch, correctly, is **L4** — the guide's
`:735` "a reviewed-grant policy cannot prove grant consumption in a module row at all" is still false and
`docs/design/gate-runtime-standardization.md` is still byte-unchanged across the whole stack. L4 stays OPEN
and orchestrator-owned.

### 7. Nothing outside the fence — CONFIRMED

`git show --stat 88f80369b` lists exactly the three declared files, and applying them into my worktree
produced exactly three `M` entries in `git status --short`. No board file, no shared ledger, no catalog, no
peer-tree edit. The two uncatalogued review docs flagged above are still uncatalogued (this commit adds no
catalog row), so that integration chore stands unchanged.

## Commit receipt

```
commit e8f43e668e223848d5c6e81cde9c5661fbec9aed  (branch cbsp7-review, parent b29dc50ab)
docs(reviews): independent security review of P7 identity proof + Q05 (#2189)
 .../gate-runtime/sec-p7-review-2026-09-13.md       | 378 +++++++++++++++++++++
 1 file changed, 378 insertions(+)
```

`git status --short` EMPTY after the commit. The report's own SHA is amended in
(`e8f43e668` names the pre-amend content); the amended commit is the one carrying this block.
