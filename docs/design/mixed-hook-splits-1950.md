---
kind: design
status: active
updated: 2026-09-12
---

# The 13 mixed-hook splits (#1950, lane `f-mixed-hooks`) — design record

The lane design for converting the thirteen mixed-hook legacy gates ruled in
[`gate-runtime-standardization.md`](gate-runtime-standardization.md) §12.6. That table is the DECISION; this file
records how each ruling is realized on today's tree, the alternatives rejected and why, the coupled-site
inventory, the proof plan, and every fork escalated. It is written per GROUP before that group's edits land
(the forge rule: no edit before the design exists in writing), so the later groups' sections are filled in as
the lane reaches them — a section headed "not yet designed" is exactly that, never an omission.

Memory lessons consulted (by filename, from the shared store): `gate-migration-1584-lessons-hub.md` (the
wave-4 trap list: one `execution` cannot serve two jobs; `report.node` derives its token; a population fence
needs an in-population anchor; the `@orb-gate-ignore` count after conversion; the roster row is a coupled site
the gate itself polices; conformance has no must-refuse arm), `gate-authoring-lessons-hub.md` (a gate reader
that cannot establish its set THROWS; a real-tree anchor is how a fixture opts in; conformance cannot pin a
refusal), `instruments-lie-verify-the-verifier.md`, `gate-blind-spots-are-spelling-shaped.md`,
`new-doc-catalog-two-commit-stack.md`, `ledger-and-doc-catalog-hub.md`.

## 0. What binds every group

- **§12.6 is the spec.** Each module's final mapping is implemented as ruled; a deviation is recorded here with
  the tree receipt that forced it and escalated by SendMessage with a stated default.
- **Every policy header carries the §5b.5 block:** FAMILY (module + function, or singleton with its reason),
  POPULATION PORT (byte-identical, or each intentional delta), the legacy SHA from the brief's table, the
  marker census where a private grammar retired, and every declared limit naming the row that holds it.
- **Proofs per guide §4:** legacy rows carried; `expect.count` on every `mustFlag`; a §4.1 cut per narrowing in
  the flag-MORE direction, classified four ways; the §4.2 positive identity arm per ordinary policy; §4.5
  refusal pins through `runPolicyPass`; the §4.6 differential replayed from the legacy SHA through the frozen
  legacy `runPass` and the UNION of the final policies, with a per-example coverage statement for every split
  arm — a zero-coverage arm gets a CONSTRUCTED successor proof, never a replay.
- **Harness hygiene for cuts:** a cut is applied to a sibling scratch module in `gates/` (relative imports
  resolve), the anchor must occur EXACTLY ONCE in the file (module headers and `why` strings quote their own
  fences), and the scratch file is `rmSync`'d in a `finally`.
- **Coupled sites every group touches:** the roster (`docs/architecture/core/Core-Enforcement-Active-Gates.md`
  — one row rewritten per converted module, one row ADDED per split sibling, and the declared count line,
  277 at the base), `docs/test-baseline/manifest.json` (regenerated in this worktree after every new spec is
  `git add`ed), and any `tests/tooling/**` suite naming the id as a string literal (measured per group below).
- **Floor per group:** the family test(s); `pnpm check:policy-conformance` (base: 179 policies · 1,898 rows ·
  0 failures); `pnpm gate:contract` (base: 714 findings across 277 modules; converted modules at zero);
  scoped biome + eslint; `pnpm typecheck --config tsconfig.json --config tooling/tsconfig.json`;
  `tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` when the roster moves. Never
  `check:structure` (the orchestrator's).

## 1. Group 1 — `session-channel-boundary`, `tooling-ops-direct-invocation`

### 1.1 Premises re-derived on the tree

| Premise | Receipt |
| - | - |
| Both modules are byte-identical to their legacy SHAs | `git diff --stat 774231540 HEAD -- …/session-channel-boundary.ts` and `git diff --stat 36bf5fa74 HEAD -- …/tooling-ops-direct-invocation.ts` both print nothing |
| Neither has a live `@orb-gate-ignore` marker anywhere | `rg` over `packages/`, `tests/`, `tooling/`, `scripts/` for both openers: 0 lines; positive control `@orb-gate-ignore` in `lib/gate-ignore.ts` = 4 |
| No `tests/tooling/**` suite names either id as a literal (beyond the module itself) | the id grep (`fmh-idgrep.sh`): `session-channel-boundary` appears only in docs and its module; `tooling-ops-direct-invocation` only in `_shared/ts-workspace.ts`'s comment, docs and its module |
| Real-tree state of the ops corpus | 271 `tooling/src/*/ops/**/*.ts` modules: 266 call `refuseDirectInvocation(import.meta.url, …)`, 5 enter through module-scope `runTool(` — the gate is green on the live tree |
| The session-channel home still constructs the channel | `packages/client/src/lib/session-channel.ts:92` `new BroadcastChannel(CHANNEL_NAME)`; the anchor `packages/client/src/lib/index.ts` exists |
| Base counts | conformance 179 · 1,898 · 0; `gate:contract` 714 across 277; both modules carry 7 and 9 legacy-shape findings respectively |

### 1.2 `session-channel-boundary` → `session-channel-boundary` (ordinary) + `session-channel-boundary-health` (hard)

**Ruling (§12.6):** "ordinary construction policy plus hard home-health policy". Implemented as ruled.

**Family `session-channel`, reader `lib/broadcast-channel-origin.ts#classifyBroadcastChannelConstruction`** — one
predicate both policies judge with, homed in `lib/` because two policies consume it. It is identity, not
spelling: a `NewExpression` whose callee NAMES `BroadcastChannel` (the shared `referenceNamesExport`
prefilter — bare identifier, or an immutable const alias of it) and whose callee RESOLVES through the
shared `resolveGlobalMemberOrigin` to the ambient global `BroadcastChannel` with an empty member path. A
callee that provably binds a project declaration (a local polyfill class of that name) is `other` and
passes; a callee the readers cannot place (a written `let BroadcastChannel` binding) is `unreadable` and
is REPORTED with a disjoint message (the #944 third answer, pinned by a `messageIncludes` row). This is the
`bus-channel-primitive` shape (its server twin, converted at `123b36f45`) applied to an ambient global
instead of a package door, so `analysis: "types"` and `mode: "types"` rows.

**`session-channel-boundary`** — `authority: "ordinary"`, `severity: "error"`, `population: "@client"`,
`execution: "selected-files"` (a per-file verdict). Visitor `NewExpression`; the sanctioned home
(`packages/client/src/lib/session-channel.ts`) is skipped by exact repo-relative path INSIDE the visitor,
never subtracted from the population — its liveness is the sibling's whole job. Reported position: the
CALLEE expression (`token: node.getExpression().getText()` at its offset inside the `new` expression), so
`new BroadcastChannel("x")` is waived at `BroadcastChannel`. This is an ANCHOR MOVE from the legacy
`new BroadcastChannel` at offset 0 (§4.6 category 6); zero live markers exist, so nothing re-binds, and
the new position is what makes an aliased construction (`new BC("x")`) waivable at its own spelling.
`fix` names `// @orb-waive session-channel-boundary(<callee>): <reason>` — the callee text, normally
`BroadcastChannel`.

**`session-channel-boundary-health`** — `authority: "hard"`, `severity: "error"`, `population: "@client"`,
`execution: "entire-population"` (whether the home constructs the channel is a whole-tree question). Visitor
`NewExpression` restricted to the home path, recording whether the home constructs; `evaluate` reports ONE
file-level finding when the real-tree anchor (`packages/client/src/lib/index.ts`, the legacy §4.5 anchor) is
loaded and the home constructs nothing — the home moved, or its construction left. The finding is anchored
on the ANCHOR at line 1 because the legacy anchor (the gate module's own path) is outside `@client` and
`report.file` cannot express it — the same classified difference `tier-home-health-family.int.test.ts`
records for the spacing family. No waiver door by construction (an absence verdict has no node).

**Rejected alternative — ONE reviewed-grant policy, no `-health` sibling.** The 2026-09-06 ruling (sanctioned
homes convert as exact reviewed grants with liveness) and the twin `bus-channel-primitive` both point at it:
report every construction with `(subject: <file>, operation: "broadcast-channel-construction")`, grant the
home's row, and let central stale-grant reconciliation own the rename tripwire. Rejected for two receipts:
(1) grant liveness is only sound after a COMPLETE owner run, so the policy must be `entire-population`
(`bus-channel-primitive` is), which DEFERS the rogue-channel arm — the only arm that ever fires — under every
`--changed`/`--scope` run; the ruled split keeps that arm `selected-files`. (2) The legacy descriptor has no
`markerImmune`, so its construction arm is `ordinary` authority today; promoting it to reviewed-grant is a
change of who may except it (a central row instead of an author's reasoned inline marker) that §12.6 did not
make. Recorded so the next reader does not re-derive it.

**Rejected alternative — keep the spelling check** (`getExpression().getText() === "BroadcastChannel"`).
Rejected: a local polyfill/test-double class of that name is a false red, a const alias is a false pass, and
the shared readers already answer both; the merge rule ("the stronger identity reader wins") applies within
a conversion as much as across waves.

**Population port:** byte-identical in effect — legacy `scanRoot: p.includes("packages/client/src/")` is
`@client`. Legacy `mustPass[1]` (a server file alone) admits NOTHING under `@client` and would tool-error,
so it carries an added in-population clean file (the standing wave-4 correction).

**Proof plan.** Ordinary: legacy `mustFlag[0]` (founding, `count: 1, token: "BroadcastChannel"`), legacy
`mustFlag[2]` as a map (`count: 1`), NEW const-alias flag row (the stronger reader), NEW unreadable row
(`let BroadcastChannel …` written binding; `messageIncludes` on the unreadable text); `mustPass`: the home
constructing (legacy `[0]`), the server-file declared limit with its anchor file (legacy `[1]`), NEW local
class counterfactual (identity), NEW §4.2 arm (`@orb-waive session-channel-boundary(BroadcastChannel)`).
Health: legacy `mustFlag[1]` (anchor + home with no construction, `count: 1`), NEW anchor + home ABSENT
(`count: 1` — the "moved" half the message names), `mustPass`: anchor + constructing home (legacy `[0]`),
no anchor + silent home (legacy `mustFlag[2]`'s "exactly ONE finding" half, which is 0 for this policy).
§4.1 cuts, flag-MORE direction: the home skip (delete → `mustPass[0]` reds), the callee prefilter (delete →
the local-class row reds, since an unprefiltered global resolver reports every `new`? no — the cut that
discriminates is the IDENTITY comparison `globalName === CTOR`: replace with `true` and the local-class row
reds), the anchor guard in the health policy (delete → the no-anchor `mustPass` reds). Family test
`tests/tooling/verify/gates/session-channel-family.test.ts`: conformance over both, the §4.2 triple through
`runPolicyPass`, the §4.5 narrowed-request deferral pin for the health policy, and the §4.6 differential
replaying every legacy example (SHA `774231540`) through the frozen legacy `runPass` and the union of both
final policies, with the classified differences: SPLIT, TRIPWIRE ANCHOR (gate file → `lib/index.ts`),
POSITION (`new BroadcastChannel`@col → `BroadcastChannel`@col+4). Legacy coverage of the moved arm: 1 of 5
examples (`mustFlag[1]`) — nonzero, so the replay is evidence.

### 1.3 `tooling-ops-direct-invocation` → one hard policy

**Ruling (§12.6):** "canonical exported-function/module-call facts plus `evaluate`; one hard policy".
Implemented as ruled; the "facts" are shared readers, not a `defineFact` (no second consumer exists yet).

\*\*Family: singleton (`tooling-ops-direct-invocation`) today; readers `_shared/ts-workspace.ts#moduleScopeCalls`

- `lib/project-home-origin.ts#classifyProjectHomeOrigin`.\*\* The first build declared `tooling-program-entry`
  ahead of its sibling and the loader REFUSED it — `lib/policy-module.ts:79` requires a one-member family to be
  named by its sole policy id (measured: `pnpm check:policy-conformance` exit 2, "singleton family
  tooling-program-entry must equal its sole policy id"). So the family name is minted WITH the second member:
  §12.6 rules `tooling-shared-plumbing`'s exit/CLI arm ("every tool cli.ts enters through runTool") into its own
  policy in group 4, which reads the SAME runner home through the SAME two readers; when it lands, both take
  `tooling-program-entry`.

**Shape.** `authority: "hard"` (every finding is an ABSENCE — no module-scope guard statement — so there is no
node and no waiver door by construction; the legacy findings were line 0/column 0 and unmarkable for the same
reason), `severity: "error"`, `analysis: "types"`, `execution: "entire-population"`. Population
`{ in: ["@tooling"], under: ["tooling/src/*/ops/**", "tooling/src/_shared/entrypoint.ts", "tooling/src/_shared/run-tool.ts"], ext: ["ts"] }`
— the ops glob is the legacy `OPS_RE` verbatim, and the two `_shared` homes are ADDED so the policy can read
its vocabulary through `ctx.files` (an intentional port delta, skipped by the per-file arm). `create` locates
both homes with `locateProjectHome` (fixed export names `refuseDirectInvocation` / `runTool`); `visitFile`
judges every ops module: it passes when one module-scope call's callee resolves BY DECLARATION to the guard
home's export (guarded) or to the runner home's export (a program), and reports otherwise — including a
callee the reader cannot place, because an unprovable guard is no guard. `evaluate` files TWO population
receipts, one per home, so an absent or renamed home refuses the run independently (the summed-receipt shape
`persisted-store-registry` uses lets one absent home read as `members: 1` — not copied).

**Why identity rather than the legacy derived NAME.** The legacy derived each name as "the sole exported
function of its home" and compared callee TEXT. A local `function refuseDirectInvocation()` in an ops module
passed as guarded; `import { refuseDirectInvocation as refuse }` was reported. The shared home reader judges
the declaration, closing both. The name is now FIXED in the policy, which is the house shape
(`persisted-store-registry`, `registry-assembly-at-door-only`): a renamed export makes the home's receipt
`unresolved: 1` and the run REFUSES — the legacy's "derivation failed → RED finding" becomes the runtime's
own tool error (§4.5: a legacy blindness FINDING converts to a receipt refusal, pinned by `runPolicyPass`).

**Why `entire-population`.** The verdict for one ops file depends on two files outside any per-file subset; a
`selected-files` policy under `--scope <one ops file>` would find neither home in `ctx.files` and refuse on
every scoped run. Deferral under a narrowed request is the honest answer; the whole run judges all 271.

**`_shared/ts-workspace.ts` change (shared reader, additive):** `moduleScopeCalls(sf): readonly CallExpression[]`
— the statement-level read (`sf.getStatements()`, no descendant walk) that `moduleScopeCallees` now derives
its names from, so the gate (identity) and the behavioural twin `tests/tooling/_shared/entrypoint.int.test.ts`
(names) still read ONE statement shape. `soleExportedFunction` stays for the twin.

**Rejected alternative — keep `visitFile` as `selected-files` and read the homes through `ctx.sourceFile`.**
`ctx.sourceFile` throws outside the effective population, and a scoped run intersects the population with
the request, so the throw (or a `ctx.files` membership test reading silently clean) fires on every scoped
run. Rejected on the guide §12.3 rule.

**Rejected alternative — split the blindness arm into a `-health` sibling.** Same authority and severity as
the main arm (hard, error) and the runtime already accuses a missing home more loudly than a finding could;
§12.6 rules one policy.

**Proof plan.** Carried: `mustFlag[0]` (founding, `count: 1`), `mustFlag[1]` (guard spelled in a template
string and a comment, `count: 1`); `mustPass[0]` (guarded through the import), `[1]` (a `runTool` program),
`[2]` (`lib/` and `cli.ts` out of population — the two homes keep the fixture admitted). NEW: `mustFlag` a
LOCAL function named `refuseDirectInvocation` called at module scope (identity — legacy passed it),
`mustFlag` an unreadable guard door (`from "./missing.ts"`), `mustPass` an aliased import
(`refuseDirectInvocation as refuse` — legacy reported it), `mustPass` a module-scope call to a DIFFERENT
export of the guard home (proves the export-name half of the identity). Legacy `mustFlag[2]` (guard home
gone) → §4.5 pin in `tests/tooling/verify/gates/tooling-ops-direct-invocation.test.ts`: `runPolicyPass` with
the guard home absent asserts `toolErrors[0]` is `{ phase: "receipt" }` naming the guard home's receipt and
the policy is withheld; the same for the runner home, plus the renamed-export shape (`unresolved: 1`) and
the complete-run receipt pair. §4.1 cuts: the home skip in `visitFile` (delete → the homes themselves are
judged and `mustPass[0]`/`[1]` red with 2 extra findings), the `"home"` verdict on the runner arm (replace
with `true` → the local-function row reds), the export-name half (`mustPass` different-export row reds when
`names` is widened). §4.6 differential: legacy SHA `36bf5fa74`; every legacy example replayed through the
frozen `runPass` and the final policy — `mustFlag[2]` is the classified difference (finding → receipt
refusal) and is asserted as such; position delta on every file-level finding: legacy `0:0` → final `1:1`
(the final sink refuses a zero coordinate).

### 1.4 Group 1 coupled sites

| Site | Action |
| - | - |
| `tooling/src/verify/gates/session-channel-boundary.ts` | rewrite as the ordinary policy |
| `tooling/src/verify/gates/session-channel-boundary-health.ts` | NEW hard sibling |
| `tooling/src/verify/lib/broadcast-channel-origin.ts` | NEW shared reader (the family) |
| `tooling/src/verify/gates/tooling-ops-direct-invocation.ts` | rewrite as the hard policy |
| `tooling/src/_shared/ts-workspace.ts` | add `moduleScopeCalls`; header comment corrected |
| `tests/tooling/verify/gates/session-channel-family.test.ts` | NEW: conformance, §4.2, §4.5, §4.6 |
| `tests/tooling/verify/gates/tooling-ops-direct-invocation.test.ts` | NEW: conformance, §4.5 pins, §4.6 |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md` | two rows rewritten, one row added, count 277 → 278 |
| `docs/test-baseline/manifest.json` | regenerated after the two new specs are staged |
| `tests/tooling/_shared/entrypoint.int.test.ts` | unchanged; its "one home" comment stays true through `moduleScopeCalls` |

Marker reconciliation: no private grammar and zero live central markers for either id — nothing to translate.

### 1.5 Group 1 measured (2026-09-12, this worktree)

Two design corrections the build forced, both recorded in the modules: (a) the identity comparison in the
shared reader was UNENFORCED by the planned rows — a project class of the global's name never REACHES the
comparison (the readers refuse it earlier as a proven non-module binding), so the discriminating fixture is a
`const BroadcastChannel = Map` shadowing alias, which resolves to a different GLOBAL; (b) the legacy text check
also passed the `globalThis.`/`self.`/`window.` receiver spellings, and so did the first draft of the reader —
closed through `readsAmbientGlobalPath`, with a member read off any other receiver answering `other` (the
injected-port shape) and pinned in both directions.

§4.1 cut table, every cut in the flag-MORE direction on a sibling scratch copy with the anchor asserted to
occur exactly once (harness: `fmh-cut.ts`, kept in the lane scratchpad):

| Policy | Narrowing | Replaced with | Rows that died | Bucket |
| - | - | - | - | - |
| `session-channel-boundary` | the home skip | dropped | `mustFlag[0]` (got 2) · `mustPass[0]` | ENFORCED |
| `session-channel-boundary` | `globalName === CTOR && memberPath.length === 0 ? "constructs" : "other"` | `"constructs"` | none at first → `mustPass[3]` (the `Map` shadowing alias) once written | ENFORCED after the added row |
| `session-channel-boundary` | the `referenceNamesExport` prefilter | dropped | none at first → `mustPass[4]` (an unrelated unresolvable `new`) once written | ENFORCED — and it is a real fence, not only a speed prefilter: without it the unreadable arm accuses every unresolvable `new` |
| `session-channel-boundary` | the ambient-receiver check | `"constructs"` | `mustPass[5]` (the injected port) | ENFORCED |
| `session-channel-boundary` | the unreadable arm | `return "other"` | `mustFlag[3]` | the #944 third answer is REACHED (the fail-open probe) |
| `session-channel-boundary-health` | the anchor guard | dropped | `mustPass[1]` (as an `[evaluate]` tool error — the anchor is not in that fixture's population, which is itself the fence firing) | ENFORCED |
| `session-channel-boundary-health` | the home-path restriction in the visitor | dropped | `mustFlag[1]` (the moved home) | ENFORCED |
| `session-channel-boundary-health` | the global-name comparison (shared reader) | `"constructs"` | `mustFlag[2]` (the home constructs a shadowing alias) | ENFORCED after the added row |
| `tooling-ops-direct-invocation` | the two-home skip in `visitFile` | dropped | all 10 rows (the homes are judged as ops modules) | ENFORCED |
| `tooling-ops-direct-invocation` | `classifyProjectHomeOrigin(...) === "home"` | `home.members >= 0` (any module-scope call counts) | `mustFlag[2]` · `[3]` · `[4]` | ENFORCED |
| `tooling-ops-direct-invocation` | `GUARD_HOME.names` | widened to admit `other` | `mustFlag[4]` (the other-export call) alone reads green; 8 other rows die as receipt refusals because their fixtures do not export `other` | ENFORCED |
| `tooling-ops-direct-invocation` | the runner arm | dropped | `mustPass[1]` (the `runTool` program) | ENFORCED |

§4.6 differentials are committed (`session-channel-family.test.ts`, `tooling-ops-direct-invocation.test.ts`):
legacy side executed on every original example; coverage of the moved/changed arms is nonzero on both
(tripwire 1 of 5; blindness 1 of 6) and asserted in the tests. Classified differences: session-channel —
SPLIT, TRIPWIRE ANCHOR (gate file → `lib/index.ts`), POSITION (callee, +4 columns, token `BroadcastChannel`),
EMPTY ADMISSION (the server-only legacy row is a `[population]` refusal under `@client`); tooling-ops —
POSITION (`0:0` → `1:1`), BLINDNESS (a finding → a receipt refusal with the policy withheld). Stronger-reader
catches ADDED (not in any legacy row): the const alias, the ambient-receiver spelling, the local lookalike
function in an ops module, the unreadable guard door; legacy false positives DROPPED: the aliased guard import.

## 2. Group 2 — `tooling-front-door`, `tooling-argv-front-door` — not yet designed

## 3. Group 3 — `sub-floor-disclosure`, `query-boundary-reservation` — not yet designed

## 4. Group 4 — `tooling-shared-plumbing` — not yet designed

## 5. Group 5 — `design-audit-rule-proof`, `testid-liveness`, `tooling-instrument-proof` — not yet designed

## 6. Group 6 — `agent-bridge-lock`, `no-inline-union-redecl`, `ui-variant-axes-stamped` — not yet designed

## 7. Forks escalated

None yet. (Each is recorded here with the default taken and the message sent.)
