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

## 2. Group 2 — `tooling-front-door`, `tooling-argv-front-door`

### 2.1 Premises re-derived on the tree

| Premise | Receipt |
| - | - |
| Both modules are byte-identical to their legacy SHAs | `git diff --stat 1f5e25c00 HEAD -- …/tooling-front-door.ts` and `git diff --stat 4097be20d HEAD -- …/tooling-argv-front-door.ts` print nothing |
| Zero live `@orb-gate-ignore` markers for either id | `rg` over `packages/`, `tests/`, `tooling/`, `scripts/`: 0 lines (control: 4 in `lib/gate-ignore.ts`) |
| Coupled suites | `tests/tooling/verify/gates/tooling-front-door.int.test.ts` drives the LEGACY descriptor's `begin`/`visit`/`run` directly (5 tests) — it retires into the family test; `tests/tooling/_shared/entrypoint.int.test.ts:14,150` imports `isGovernedArgvEntry` (the ARGV\_ENTRIES table's door) |
| The ROOT\_CONFIG row is live | `tooling/src/ast/ops/prodonly.ts:7` `import knipConfig from "../../../../knip.ts"` — the only relative `knip.ts` importer outside gate fixtures |
| All six ARGV\_ENTRIES subjects still read argv | the real-tree `process.argv` reader census: 17 `cli.ts`, the 6 rows, and 4 comment-only mentions (`codemod/contract/types.ts`, `codemod/lib/example.ts`, `snap/lib/run-report-columns.ts`, `stack/ops/prod.ts` — the gate is green on the tree) |
| Five of the six ARGV\_ENTRIES rows are module-scope `runTool` programs | `stack/ops/{dev-identity-entry,engines,engines-ctl,prod-entry}.ts`, `verify/ops/config-snapshot-entry.ts`; only `_shared/entrypoint.ts` is not |
| The `process` receiver identity already has a house reader | `gates/sole-env-reader.ts#readsProcessEnv` (ambient global OR the `node:process` default export, fail-closed on unreadable) — the `process.env` twin of this rule |

### 2.2 `tooling-front-door` → `tooling-front-door` (ordinary) + `tooling-root-config-import` (reviewed-grant)

**Ruling (§12.6):** "ordinary import-boundary policy plus reviewed root-config grant policy". Implemented as ruled.

**Family `tooling-front-door`, reader `lib/tooling-import-door.ts`** — the specifier classification both policies
share: `toolOf(rel)`, `isToolCli(rel)` (the `tooling/src/<tool>/cli.ts` shape at exactly four segments), and
`resolveRelativeImport(rel, spec)` (posix-normalized against the importing file; `null` for a `#` map entry
or a package specifier, which the resolver and the cruiser own). Pure syntax over the ImportDeclaration's
specifier — no identity question exists here, the SPELLING is the subject.

**`tooling-front-door`** — ordinary/error/`selected-files`/`@tooling`/`syntax`. Two arms, each with its own
message so a row can discriminate them: a cross-tool DEEP import (resolves into sibling `<b>` anywhere but
`<b>/index.ts`; `_shared/*` is per-module by design), and a `cli.ts` importing anything of its own tool but
`./index.ts`. A relative ESCAPE out of `tooling/src/` is NOT this policy's arm any more — it is the grant
policy's. Reported position: the module-specifier STRING LITERAL, quotes included (the derived token of the
specifier node), so the waiver is `@orb-waive tooling-front-door("../../bb/ops/y.ts")` — an ANCHOR MOVE
from the legacy `token: spec, offset: 0` (which was not even an exact slice of the ImportDeclaration text;
the final sink would have thrown). Population byte-identical (`@tooling` = `scanRoot startsWith("tooling/src/")`).

**`tooling-root-config-import`** — reviewed-grant/error/`entire-population`/`@tooling`/`syntax`. Every relative
import that resolves OUTSIDE `tooling/src/` is a finding with `subject: <importing file>` and
`operation: root-config-import:<resolved target>`, deduped per `(subject, operation)` through
`reportReviewedGrantCandidates`. The one legacy `ROOT_CONFIG_IMPORTS` row becomes the grant
`tooling-root-config-import:prodonly-knip` (`tooling/src/ast/ops/prodonly.ts` × `root-config-import:knip.ts`);
the legacy two-sided stale sweep IS central grant liveness (a row consumed zero times after a complete run
is STALE). `entire-population` because liveness is only sound after a complete owner run — which is also
what retires the legacy int test's scoped-run defect (a scoped run never adjudicates the row: it DEFERS)
and its `fileLoaded(exit-contract)` anchor guard (a proof row cannot carry a grant, so the knip import is
a `mustFlag` and its licensing is proven in the family test with the real row).

**Rejected — keep the escape arm ordinary with the root-config row as a carve-out.** The row is a
recurring repository PERMISSION with a two-sided liveness demand, which is the reviewed-grant shape by
definition (§12.5); an ordinary policy has no liveness and would need a gate-owned table, which §12.5 bans.

### 2.3 `tooling-argv-front-door` → `tooling-argv-front-door` (reviewed-grant) + `tooling-argv-front-door-health` (hard)

**Ruling (§12.6):** "ordinary illegal-reader, reviewed entry-grant, and hard population-health policies" —
THREE. **Refuted on the tree and approved by the orchestrator as a two-policy shape (2026-09-12):** the
legacy has ONE predicate (a `process.argv` read outside a `cli.ts`, `:92-110`) and one exemption table
(`ARGV_ENTRIES`, `:33-52`); an ordinary and a reviewed-grant policy over that predicate would both report
every non-cli read unless one partitioned by the table's subjects, which §12.5 keeps out of gate modules.
The only DERIVABLE partition — a module-scope `runTool` program counts as a front door like `cli.ts` (five
of the six rows are such programs) — was REFUSED because it narrows the catch: a new `runTool` program
reading argv would pass unreviewed where today it needs a censused row (the catch-regression §4.6 exists
to find). Zero live markers ever used the ordinary door.

**Family `tooling-argv-front-door`, reader `lib/process-member-origin.ts#readsProcessMember`** — the
`process` receiver identity: the read's receiver is the AMBIENT global `process` or the DEFAULT export of
the `node:process`/`process` door (how every live reader spells it), never its text; a local object named
`process` is provably different and passes; an unreadable receiver is reported fail-closed. This is
`sole-env-reader.ts#readsProcessEnv` generalized over the member name; that module keeps its private copy
(outside this lane's fence) and is the recorded MERGE CANDIDATE — re-home it onto the shared reader in a
follow-up, which is the §8.3 rule applied across waves.

**`tooling-argv-front-door`** — reviewed-grant/error/`entire-population`/`@tooling`/`types`. A `process.argv`
read (dotted, optional, or computed-literal `process["argv"]`, through `readMemberReference`) in any file
that is not a `cli.ts` by shape is a finding with `subject: <file>`, `operation: process-argv-read`,
deduped per subject. The six ARGV\_ENTRIES rows become six grant rows carrying their legacy `why` verbatim
plus an `endsWhen`; arm B's two-sided stale sweep IS central liveness. Reported position: the whole member
read (`process.argv` / `process["argv"]`, the node's own text) — the legacy normalized the element form to
`process.argv`, which is not an exact slice and would throw in the final sink.

**`tooling-argv-front-door-health`** — hard/error/`entire-population`/`@tooling`/`types`, same family and
reader: arm C, the §4.6 blindness tripwire — zero `cli.ts` readers on a run where the real-tree anchor
(`tooling/src/_shared/exit-contract.ts`, the legacy anchor) is loaded is ONE file-level finding at the
anchor (the legacy anchored on the gate module's own path, which is inside `@tooling` but is the WRONG
subject — a policy anchoring a verdict on itself teaches the next lane a self-anchor; the anchor file is
what the legacy guarded on and is the honest subject).

### 2.4 Group 2 coupled sites

| Site | Action |
| - | - |
| `tooling/src/verify/lib/tooling-import-door.ts` · `lib/process-member-origin.ts` | NEW shared readers (the two families) |
| `gates/tooling-front-door.ts` · `gates/tooling-argv-front-door.ts` | rewritten |
| `gates/tooling-root-config-import.ts` · `gates/tooling-argv-front-door-health.ts` | NEW |
| `lib/reviewed-grants.ts` | +7 rows (1 root-config, 6 argv), sorted by `policyId` then `id` |
| `tests/tooling/verify/gates/tooling-front-door-family.test.ts` | NEW: conformance ×4, §4.2 arm, §4.3 grant identity for both grant policies, §4.5 deferral pins, §4.6 differentials ×2, the real-tree prodonly/knip fact |
| `tests/tooling/verify/gates/tooling-front-door.int.test.ts` | DELETED (drove the legacy descriptor's hooks directly; every pin has a successor above) |
| `tests/tooling/_shared/entrypoint.int.test.ts` | derives the governed argv entries from `REVIEWED_GRANTS` instead of importing the gate's table door |
| roster | 2 rows rewritten, 2 rows added, count +2 |
| `Core-Tooling-Law.md` §4.2 / §4.9 | mechanism sentences truth-repaired (rows → grants, stale sweep → central liveness, arm C → `-health`) |
| `docs/test-baseline/manifest.json` | regenerated (+1 spec, 1 deletion ledgered) |

### 2.5 Group 2 measured (2026-09-12, this worktree)

**Two build-time findings, both recorded in the modules.** (a) The shared global resolver
(`lib/reference-fact-global.ts#isAmbientGlobalDeclaration`) trusts only `node_modules/typescript/lib/lib.*`
and `node_modules/@types/` declaration files, so in the proof workspace a bare `process` binds nothing and
the family reader answers UNREADABLE — every ambient-spelling row passed for the WRONG reason (the
fail-closed report counts the same as the precise one; guide §4.8b). Closed by planting `@types/node`'s
`declare var process` as a trusted declaration (`gates/_proof/node-types.ts`), so the global branch is
exercised, and by keeping the undeclared shape as its own row proving the fail-closed answer. The same
class is live in `sole-env-reader`'s ambient rows (outside this fence; reported). (b) The global-branch name
comparison is reachable only by a member some TRUSTED global declares: `process.env.argv` and a
`const process = console` alias are refused as unreadable one step earlier, so the discriminating fixture is
a planted lookalike global (`declare var lookalike: { argv }`), the zustand-lookalike pattern.

§4.1 cut table, flag-MORE direction, sibling scratch copies, anchor asserted to occur exactly once:

| Policy | Narrowing | Replaced with | Rows that died | Bucket |
| - | - | - | - | - |
| `tooling-front-door` | the `_shared` allowance | dropped | `mustPass[0]` | ENFORCED |
| `tooling-front-door` | the sibling `index.ts` allowance | dropped | `mustPass[0]` | ENFORCED |
| `tooling-front-door` | the escape short-circuit (`!resolved.startsWith(TOOLING_PREFIX)`) | dropped | `mustPass[2]` (both escapes read as deep imports) | ENFORCED |
| `tooling-front-door` | the cli own-`index.ts` check | `isToolCli(rel)` alone | `mustPass[1]` | ENFORCED |
| `tooling-front-door` | `isToolCli` depth (shared reader) | `endsWith("/cli.ts")` | the nested `ops/cli.ts` row | ENFORCED |
| `tooling-front-door` | the non-relative short-circuit (shared reader) | dropped | none at first → the cli.ts `node:process`/`#bb` row once written (an unfenced package specifier posix-joins INSIDE the tool and reads as cli internals) | ENFORCED after the added row |
| `tooling-root-config-import` | the prefix test | dropped | `mustPass[0]` | ENFORCED |
| `tooling-root-config-import` | the non-relative short-circuit (shared reader) | dropped | none | UNFALSIFIABLE for this policy, documented in the row: an unfenced non-relative specifier joins inside the importing directory and is never an escape (tried `#bb`, `node:path`, `@orb/kit`); the fence is pinned by the ordinary sibling |
| `tooling-argv-front-door` | the `isToolCli` skip | dropped | `mustPass[0]` | ENFORCED |
| `tooling-argv-front-door` | the global-branch name/path comparison (shared reader) | `"reads"` | none at first → `mustPass[6]` (the planted lookalike global) | ENFORCED after the added row |
| `tooling-argv-front-door` | the door comparison (shared reader) | `"reads"` | `mustPass[7]` (`import process from "node:fs"`) | ENFORCED |
| `tooling-argv-front-door` | the unreadable arm | `"other"` | `mustFlag[3]` (undeclared) · `mustFlag[4]` (written binding) | the #944 third answer is REACHED |
| `tooling-argv-front-door` | the member-name prefilter (shared reader) | dropped | `mustFlag[2]` (token) · `mustPass[3]` · `mustPass[6]` | ENFORCED |
| `tooling-argv-front-door-health` | the anchor guard | dropped | `mustPass[2]` (as an `[evaluate]` tool error — the fence firing) | ENFORCED |
| `tooling-argv-front-door-health` | `isToolCli` in the counter | dropped | `mustFlag[0]` · `mustFlag[2]` | ENFORCED |
| `tooling-argv-front-door-health` | `isToolCli` depth (shared reader) | `endsWith("/cli.ts")` | `mustFlag[2]` | ENFORCED |
| `tooling-argv-front-door-health` | the global-branch comparison (shared reader) | `"reads"` | `mustFlag[3]` (the lookalike global in a cli.ts) | ENFORCED after the added row |
| `tooling-argv-front-door-health` | the global-branch comparison (shared reader) | `"other"` | `mustPass[1]` (the ambient cli reader) | the global branch is EXERCISED by the planted types |
| `tooling-argv-front-door-health` | the unreadable arm | `"reads"` | `mustFlag[1]` · `mustFlag[3]` | REACHED |

§4.6 differentials are committed in `tooling-front-door-family.test.ts` (14/14): every legacy example of
both descriptors (6 and 11) replayed through the frozen legacy `runPass` and the union of each pair, with
the classified differences enumerated in the test header (position → quoted specifier; the root-config row
and the six entry rows are findings licensed by grants the differential does not carry; the stale sweep is
grant liveness; the blindness anchor; the element-access token; the undeclared-global message). Legacy-side
coverage asserted: import family 3 of 6 examples flag; argv family 3 reads + 1 six-row stale sweep + 1
blindness of 11 — every moved arm nonzero.

## 3. Group 3 — `sub-floor-disclosure`, `query-boundary-reservation`

### 3.1 Premises re-derived on the tree

| Premise | Receipt |
| - | - |
| Both modules are byte-identical to their legacy SHAs | `git diff --stat 4e1bdb87e HEAD -- …/sub-floor-disclosure.ts` and `git diff --stat 370243fe7 HEAD -- …/query-boundary-reservation.ts` print nothing |
| `@sub-floor-ok` live markers (marker form, opener-anchored) | exactly 2: `packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx:92` (a `{/* */}` JSX carrier with NO significant sibling before it — the engine's adjacency rule binds it to the trigger that follows) and `rpg-beat-row.tsx:179` (a `//` in the leading trivia of a multi-line `<CollapsibleTrigger` whose `size="text"` sits three lines below) |
| `@first-boot-only` live markers | 0 (the only mention is the central engine's foreign-grammar fixture list) — the grammar DELETES |
| Central `@orb-gate-ignore` markers for either id | 0 |
| Prose sites that teach the retired spelling | 8: `packages/ui/src/primitives/collapsible/{collapsible.tsx:31,variants.ts:32}`, the product comment at `turn-tool-calls-disclosure.tsx:90-91` ("the gate reads the line directly above"), `tests/ui/primitives/collapsible/collapsible.ct.tsx:118`, `tests/client/features/rpg/components/turn-tool-calls-disclosure.ct.tsx:382`, `tests/tooling/ui-audit/index.test.ts:575`, `tooling/src/ui-audit/ops/walker/census-interactive.ts:317`, `tooling/src/ui-audit/contract/samples-interactive.ts:37` — comment-only edits inside a conversion lane's fence (guide §7) |
| The legacy fixture battery carries both gates | `tests/tooling/check-gates.repo.int.test.ts:324-327` (`__g_qbres`) and `:345-346` (`__g_subfloor`) — deleted with the conversion, the precedent every earlier conversion set |
| The vocabulary homes are live | `packages/ui/src/primitives/collapsible/variants.ts:36-37` declares `text: {}` and `control: {…}`; `packages/client/src/components/query-boundary.tsx` spells `reserveKey` 13 times; no duplicate literal `reserveKey` on the client tree |
| The roster row's "`tests/` is scope" claim is FALSE on the legacy code | both `scanRoot`s admit `packages/client/src/` (+ `packages/ui/src/` for sub-floor) only; a `size="text"` story at `tests/ui/primitives/collapsible/collapsible.ct.tsx:138` was never judged. The population port is byte-identical to the CODE; the roster row is corrected |

### 3.2 `sub-floor-disclosure` → `sub-floor-disclosure` (ordinary) + `sub-floor-disclosure-health` (hard)

**Ruling (§12.6):** "ordinary occurrence policy plus hard vocabulary-health policy". Implemented as ruled.

**Family `sub-floor-disclosure`, shared reader `lib/collapsible-size-vocabulary.ts`** — the size vocabulary both
policies judge against (`COLLAPSIBLE_TRIGGER`, the sub-floor arm `text`, the floor arm `control`, the
variants home), so the occurrence policy and the tripwire cannot drift on which arm is the opt-out.

**`sub-floor-disclosure`** — ordinary/error/`selected-files`/`["@client","@ui"]`/`syntax`. A
`CollapsibleTrigger` (opening or self-closing) whose `size` attribute is the literal `"text"` is a finding
anchored on the `"text"` STRING LITERAL (derived token `"text"`, quotes included — the house convention).
The private `@sub-floor-ok` grammar RETIRES: the escape is `@orb-waive sub-floor-disclosure("text"): <reason>`,
bound by the central engine (`//` leading trivia of the element or the attribute; a `{/* */}` JSX carrier
with exactly one significant neighbour). Arm B (malformed / stale / over-exempting) is central
reconciliation now; the successor proofs drive the retired shapes through `runPolicyPass` in the family
test and assert the central alarm each produces. **Identity of the tag is a DECLARED LIMIT carried from the
legacy** (a wrapped or re-exported trigger under another name is invisible): the tag resolves through the
`@orb/ui` package door on the real tree and to nothing in the proof workspace, so an identity row would pass
as `external-door` (§4.8b) until an `@orb/ui` proof plant exists — deferred with that receipt, not faked.

**`sub-floor-disclosure-health`** — hard/error/`entire-population`, population EXACTLY the variants home
(`{ in: ["@ui"], under: ["packages/ui/src/primitives/collapsible/variants.ts"] }`): an ABSENT home admits
nothing and the runtime refuses at the population phase (louder than the legacy's silent skip). Visitors
`PropertyAssignment` + `ShorthandPropertyAssignment` record which arm keys the home declares; `evaluate`
reports one finding per missing arm at the home, line 1 — comment mentions cannot keep it healthy by
construction (a comment is not a property). The legacy anchored this on the gate module's own path.

**Marker reconciliation (§8.6), per file:** `turn-tool-calls-disclosure.tsx` legacy 1 → current 1;
`rpg-beat-row.tsx` legacy 1 → current 1; total 2 = 2 = 2 (the census's two). Site 1's `{/* */}` carrier
stays where it is. Site 2 MOVED: the real-site pin (the family test runs the final policy over both files
read off disk) came back `ambiguous comment trivia spanning disjoint authored regions and suppressed none`
for the in-place translation — the central engine records the ENCLOSING JSX expression for any comment
inside one (`lib/ordinary-waiver.ts:134-140`) and judges it by sibling adjacency, and `{open ? null : (…)}`
sits between `{lead}` and `{trailing}`. No placement inside that expression can bind, so the marker moved
to the enclosing return statement's trivia — the nearest carrier that contains the finding — with the
legacy reason verbatim plus the placement note. Engine finding reported: a `//` marker inside a non-empty,
sibling-flanked JSX expression is unbindable even when its carrier contains the finding (loud, not silent).

### 3.3 `query-boundary-reservation` → `query-boundary-reservation` (ordinary) + `query-boundary-reservation-health` (hard)

**Ruling (§12.6):** "ordinary unreserved-boundary policy plus hard duplicate/seam-health policies". The two
hard arms (B duplicate literal keys, D the seam tripwire) share authority, severity and execution
(`entire-population` over `@client`), so they are ONE `-health` policy with two messages — the smallest
complete contract; a split is owed only where an axis differs.

**Family `query-boundary-reservation`, shared reader `lib/query-boundary-vocabulary.ts`** (`QUERY_BOUNDARY`,
`SKELETON_ROWS`, `RESERVE_KEY`, the boundary home) — both policies judge the same vocabulary.

**`query-boundary-reservation`** — ordinary/error/`selected-files`/`@client`/`syntax`: arm A byte-identical
(a `QueryBoundary` with no `reserveKey`, whose `fallback` is a DIRECT `<SkeletonRows …/>` with a STATIC count —
a numeric literal or a same-file const numeric), reported on the `fallback` attribute (derived token
`fallback`, byte-identical to the legacy position). The `@first-boot-only` grammar is EMPTY and DELETES;
the escape is `@orb-waive query-boundary-reservation(fallback): <reason>`; the legacy marker rows retire
into central reconciliation with successor pins.

**`query-boundary-reservation-health`** — hard/error/`entire-population`/`@client`: arm B collects every
literal `reserveKey` value with its site and reports every duplicate at the literal (each site's message
names the others — a cross-file verdict no single-site marker could speak for); arm D reads the boundary
home through the shared `blankTsComments` (byte-identical predicate: `reserveKey` spelled in CODE, not a
comment) and reports at the home, line 1, when the home is loaded and does not spell it. The legacy
anchored arm D on the gate module's own path.

### 3.4 Group 3 coupled sites

| Site | Action |
| - | - |
| `lib/collapsible-size-vocabulary.ts` · `lib/query-boundary-vocabulary.ts` | NEW shared readers (the two families) |
| the four policy modules | 2 rewritten, 2 new |
| the two live `@sub-floor-ok` sites | translated in place to `@orb-waive sub-floor-disclosure("text"): <legacy reason verbatim>` |
| the 8 prose sites | re-worded to the central spelling |
| `tests/tooling/check-gates.repo.int.test.ts` | the two `__g_` fixture blocks deleted |
| `tests/tooling/verify/gates/disclosure-reservation-family.test.ts` | NEW: conformance ×4, §4.2 arms (both real carrier shapes), the real-site binding pin, retired-arm successor pins, §4.5 deferral pins, §4.6 differentials ×2 |
| roster | 2 rows rewritten (the false `tests/` claim corrected), 2 added, count +2 |
| `docs/test-baseline/manifest.json` | regenerated (+1 spec) |

### 3.5 Group 3 measured (2026-09-12, this worktree)

§4.1 cut table, flag-MORE direction, sibling scratch copies, anchors asserted to occur exactly once:

| Policy | Narrowing | Replaced with | Rows that died | Bucket |
| - | - | - | - | - |
| `sub-floor-disclosure` | the tag-name check (shared reader) | dropped | `mustPass[2]` (another tag) | ENFORCED |
| `sub-floor-disclosure` | the arm comparison `=== "text"` (shared reader) | any literal | `mustPass[1]` (`control`) · `mustPass[3]` (a tool error — the variable row) | ENFORCED |
| `sub-floor-disclosure` | the literal-shape fence (shared reader) | a non-literal initializer admitted | `mustPass[3]` (the variable) | ENFORCED |
| `sub-floor-disclosure-health` | `ShorthandPropertyAssignment` in the visitor | dropped | `mustPass[1]` (shorthand arms) | ENFORCED |
| `sub-floor-disclosure-health` | the declared-arm census | both arms always declared | `mustFlag[0..2]` | the rule |
| `query-boundary-reservation` | the `reserveKey` short-circuit | dropped | `mustPass[0]` (keyed) | ENFORCED |
| `query-boundary-reservation` | the `QueryBoundary` tag check | dropped | `mustPass[4]` (another tag) | ENFORCED |
| `query-boundary-reservation` | `hasStaticCount` | dropped | `mustPass[1]` (dynamic count) | ENFORCED |
| `query-boundary-reservation` | the `SkeletonRows` tag half of the fallback reader (shared reader) | dropped | none at first → `mustPass[3]` (a self-closing `<Spinner count={3} />`) once written — the `<Text>` row is refused by the self-closing half first | ENFORCED after the added row |
| `query-boundary-reservation-health` | `sites.length < 2` | dropped | `mustPass[0]` · `mustPass[3]` | ENFORCED |
| `query-boundary-reservation-health` | the home-loaded guard | dropped | `mustFlag[0]` · `mustPass[0]` · `[1]` · `[3]` (as `[evaluate]` tool errors — the fence firing) | ENFORCED |
| `query-boundary-reservation-health` | string-literal keys only | expression keys admitted | `mustPass[1]` (the shared exported const) | ENFORCED |

§4.6 differentials are committed in `disclosure-reservation-family.test.ts` (11/11): every legacy example
of both descriptors (9 and 12) replayed through the frozen legacy `runPass` — over the fixture with the
retired grammar BLANKED, which is the legacy verdict the final policies must reproduce since to them the
marker is inert — and the union of each pair over the fixture as written. Classified: the retired grammar
(marker verdicts vanish, consumed sites report), the position deltas (`text` → `"text"` −1 column; the
duplicate key on its literal, +`reserveKey=` columns), the tripwire anchors (gate module → home), and the
EMPTY ADMISSION of the sub-floor tripwire (its population is exactly the home; a legacy example without the
home refuses at the population phase, pinned separately). Legacy-side coverage asserted per family:
sub-floor — 3 occurrence, 2 marker verdicts + 1 consumed marker, 2 tripwire reds; query-boundary — 4
occurrence, 2 marker verdicts + 1 consumed, 2 duplicate sites, 1 seam.

**The engine finding.** The real-site pin refuted the in-place translation for `rpg-beat-row.tsx`: the
central engine records the enclosing JSX expression for ANY comment inside one and judges it by sibling
adjacency, so a `//` marker inside `{open ? null : (…)}` between `{lead}` and `{trailing}` is `ambiguous …
suppressed none` even though its carrier (the element) contains the finding. The marker moved to the
enclosing return statement; the family test pins BOTH the binding placement and the non-binding one so
nobody moves it back. Loud, not silent — but an author has no working placement inside such an expression,
which is worth an engine row.

## 4. Group 4 — `tooling-shared-plumbing`

### 4.1 Premises re-derived on the tree

| Premise | Receipt |
| - | - |
| The module is byte-identical to its legacy SHA | `git diff --stat 2c1a1d37c HEAD -- …/tooling-shared-plumbing.ts` prints nothing |
| Zero live `@orb-gate-ignore tooling-shared-plumbing` markers | `rg` over `packages/`, `tests/`, `tooling/`, `scripts/`, the repo-root `*.ts`: 0 lines |
| **The legacy gate is RED on the live tree, hidden under the `check:structure` baseline red** | the legacy descriptor run through the frozen `runPass` over its own jurisdiction (tooling/src + tests/tooling + tests/e2e/support, 1,596 files): **12 findings** — 8 fixed wall clocks (arm J drift in `home-server-family.test.ts:28`, `origin-server-family.test.ts:22`, `test-world-browser-contracts.repo.int.test.ts:154`, `program-routing.test.ts:60`, `reviewed-grants.test.ts:16`, `_shared/test-tags.ts:14`, `verify/lib/config-snapshot.ts:29`, `verify/ops/resource-tracked.ts:12`), 1 stale `CLOCK_SITES` row (`structure.int.test.ts` no longer carries its 4 s kill literal), 3 un-censused `new Project(` in `verify/ops/policy-conformance.ts`. Orchestrator ruling 2026-09-12: pre-existing-exposed violations are fixed IN LANE (route the clocks through `scaledBudget`/`budget`, let the stale row die, grant the conformance runner's Projects) — `ops/policy-conformance.ts` itself is another lane's and is NOT edited |
| The five HOMES still carry their capability | ts-workspace 3 `new Project(`, browser.ts 2 launch/attach, artifacts.ts 2 `"reports` literals, run-tool.ts 2 `process.exit(`, proc.ts 1 `node:child_process` |
| All 7 `PROJECT_SITES` rows still construct; the 4 `FULL_PRIORITY_CALLERS` still call a door | measured per file (`rg -c`) |
| The root runner configs | `vitest.config.ts`, `playwright.config.ts`, `playwright-ct.config.ts` exist; the legacy run reported ZERO findings in them (their clocks are derived, they hold no port literals) — both root-config halves are silent tripwires today |
| `static-config` cannot serve the root-config halves | its rows are SELECTION rows (`key`, `value: row.path`, `line`) from the preserved selector evaluator — no numeric literals; `authored-text` cannot admit a repo-root file (no authored tree contains one) |
| `withInstrumentRun` / artifact filers | 15 tool `cli.ts`; filers under `snap` and `verify`; the legacy run reported no arm-G finding |

### 4.2 The ruling and its realization

**Ruling (§12.6):** "separate family ids for Project home, browser doors, artifact/run-slot, exit/CLI,
child-process priority, ports, and clock budgets; each id has one authority". Realized as TEN policies. Two
refinements the loader and the family law force, both recorded rather than silently taken: (a) a one-member
family must be named by its policy id (`lib/policy-module.ts:79`), so a "family id" with one policy is that
policy's own id; (b) a family is a shared READER, so the ruling's "exit/CLI" splits by reader into two
EXISTING families — `process.exit` reads the real `process` through `lib/process-member-origin.ts` (the
argv pair's family, renamed `process-member` to say what it shares), and the cli.ts entry reads
`run-tool.ts`'s export through the readers `tooling-ops-direct-invocation` already uses (family
`tooling-program-entry`, which that policy now joins as §1.3 promised).

| Policy | Authority · execution · analysis | Population | Legacy arm(s) | Family / reader | Grants |
| - | - | - | - | - | - |
| `tooling-project-home` | reviewed-grant · entire · types | `@tooling` | A | singleton; `lib/reference-fact-call.ts#resolveCallableOrigin` (the `ts-morph` door, fail-closed) | 9: ts-workspace + 7 `PROJECT_SITES` + `ops/policy-conformance.ts`, op `ts-morph-project-construction` |
| `tooling-browser-door` | reviewed-grant · entire · types | `@tooling` | B, H | singleton; the receiver resolves to the playwright door (`@playwright/test` / `playwright` / `playwright-core`), member `chromium\|firefox\|webkit` — puppeteer's `connect` is a proven different door, not a text limit | 2: browser.ts × `browser-launch`, × `browser-attach` |
| `tooling-artifact-path-home` | reviewed-grant · entire · types | `@tooling` | C | `tooling-artifact` / `lib/artifact-filing.ts` | 1: artifacts.ts × `reports-path-literal` |
| `tooling-artifact-run-slot` | hard · entire · types | `@tooling` | G | `tooling-artifact` / `lib/artifact-filing.ts` (filer + slot exports resolved against `_shared/artifacts.ts` by identity; the home receipted) | — |
| `tooling-process-exit-home` | reviewed-grant · entire · types | `@tooling` | D | `process-member` / `lib/process-member-origin.ts` | 1: run-tool.ts × `process-exit` |
| `tooling-cli-entry` | hard · entire · types | `tooling/src/*/cli.ts` + `_shared/run-tool.ts` | E | `tooling-program-entry` / `moduleScopeCalls`… no: ANY call in the cli whose callee resolves to `runTool` (the legacy accepted a call anywhere) through `lib/project-home-origin.ts`; the home receipted | — |
| `tooling-child-process-door` | reviewed-grant · entire · types | `@tooling` | F, F2 | singleton; the import door by specifier, the full-priority call by identity against `proc.ts`'s exports (home receipted) | 5: proc.ts × `child-process-import`, proc.ts + 4 callers × `full-priority-spawn` |
| `tooling-port-registry` | reviewed-grant · entire · syntax | `tooling/src/**` + `tests/e2e/support/**` | I (tree half) | `plumbing-literals` / `lib/plumbing-literals.ts#portLiteralOf` (REGISTRY\_PORTS imported from `_shared/ports.ts`, as the legacy did) | 1: ports.ts × `port-literal` |
| `tooling-clock-budget` | **ordinary** · selected-files · syntax | `tooling/src/**` + `tests/tooling/**` | J (tree half) | `plumbing-literals` / `lib/plumbing-literals.ts#fixedClockOf` | — (the shrink-only census becomes per-site waivers: the tool-guard row translates to `@orb-waive tooling-clock-budget(<literal>)` at its site; the structure.int.test row is stale and dies) |
| `tooling-runner-config-literals` | hard · entire · **resource** | `{ of: "none" }` + `exact-file` × `vitest-config`, `playwright-config`, `playwright-ct-config` | I, J (root-config halves) | `plumbing-literals` / the same literal readers over the shared scratch parse (`lib/config-static-read.ts#parseStaticSourceText`, new) | — |

**Why clocks are ORDINARY and every other permission is a grant.** The legacy `CLOCK_SITES` census was
declared SHRINK-ONLY ("a new fixed clock is RED, never a new row") and each of its two reasons is a
per-site argument (the guard's INPUT UNDER TEST; the kill whose assertion IS the timeout) — that is the
shape of a reasoned per-occurrence waiver, not of a recurring repository permission, and a grant table
would invite exactly the rows the census forbade. The reported node is the NUMERIC LITERAL (token
`30_000`), never the legacy `setTimeout(…, 30_000)` composite, which contains parens and is unwaivable
under the marker grammar. Everything else (a home, a censused caller, a scratch-parser site) is a
permission that outlives any one edit, which is the reviewed-grant shape and how liveness is owned.

**The root-config reader (fork 2, ruled BUILD).** Three `exact-file` ids are a contract edit with a named
consumer, not a reopening (§12.4's own sentence). The reader arithmetic over them — parse the text through
the ONE scratch parser, list the port/clock literal facts — lives in `lib/`, single-consumer today; the
header states that plainly, names the natural second consumer (`runner-config-path-liveness`, which reads
the same three files through `static-config` for their selectors and would take the literal facts the day
it judges a numeric option), and why `lib/` is still right: the ids ARE the capability, the reader is
arithmetic over them, a weaker claim than a kind. DECLARED LIMIT recorded: the legacy DISCOVERED
`playwright*.config.ts` by readdir; the closed ids name the three files that exist, and a fourth runner
config would be unjudged until it gets an id — the price of no gate-owned filesystem read.

**Rejected — keep arm G (run-slot) inside the artifact-path policy.** Different authority (a missing run
slot is not a permission anyone reviews; it is a defect) and a different subject (a TOOL, cross-file) — one
authority per policy.

**Rejected — one `tooling-process-exit` singleton.** It would re-spell `readsProcessMember`, which is the
two-spellings-of-one-concept merge case the family law forbids; joining the existing reader's family is the
honest declaration, and it names the reader rather than a topic.

### 4.3 Coupled sites

| Site | Action |
| - | - |
| `gates/tooling-shared-plumbing.ts` | DELETED; ten policy modules replace it |
| `lib/plumbing-literals.ts` · `lib/artifact-filing.ts` | NEW shared readers |
| `lib/config-static-read.ts` | `parseStaticSourceText(rel, text)` added beside `readStaticSource` (the one scratch parser, now also fed by a resource fact) |
| `contract/resource-exact.ts` | +3 ids with their named consumer |
| `lib/reviewed-grants.ts` | +19 rows |
| `gates/tooling-ops-direct-invocation.ts` · `tooling-argv-front-door(-health).ts` | family strings → `tooling-program-entry` / `process-member`; roster rows follow |
| the 8 clock drift sites | routed through `scaledBudget` (tests) / `budget` (tooling libs); `tests/tooling/tool-guard.int.test.ts` gains the translated waiver |
| roster | the plumbing row replaced by ten rows; count +9 |
| `docs/architecture/core/Core-Tooling-Law.md` §4.4 | mechanism sentences truth-repaired |
| `tests/tooling/verify/gates/tooling-plumbing-family.test.ts` | NEW: conformance ×10, §4.2 arm for the clock policy, §4.3 grant identity per grant policy, §4.5 pins (home receipts, exact-file refusals, deferral), §4.6 differential over all 36 legacy examples through the union, plus the real-tree replay of the 12-finding baseline |
| `tests/tooling/gate-spelling-twins.baseline.json` | untouched — a legacy-roster ledger that retires at cutover (already red for 54 converted gates; its `tooling-shared-plumbing` row is one more) |
| `docs/test-baseline/manifest.json` | regenerated (+1 spec) |

## 5. Group 5 — `design-audit-rule-proof`, `testid-liveness`, `tooling-instrument-proof`
### 4.4 What was built (2026-09-12) — deviations from §4.2 recorded

- **Ten policies as tabled**, with two id-level corrections to the table: the port policy's population is the
  legacy's exactly (`tooling/src/**` + `tests/e2e/support/**`, never `tests/tooling/**`), and the clock
  policy's is `tooling/src/**` + `tests/tooling/**`. The e2e support tree and the tooling test tree are each
  ONE arm's jurisdiction, as the legacy fenced them per arm.
- **Identity runs FIRST; the spelled name gates only the fail-closed answer.** The first build prefiltered
  every door arm by the callee's spelled name and then resolved — which passed every ALIASED import
  (`import { withInstrumentRun as slot }`, `spawnFullPriorityChild as detach`, `join as j`): the proofs
  went red on exactly those rows. The corrected order (`lib/artifact-filing.ts#classifyFilingCall`,
  `#classifyPathCallee`, the child-process door arm) resolves the declaration first and consults the name
  only to decide whether an UNPLACEABLE callee is reported — otherwise every unplaceable call in the tree
  would be a finding. A `mustFlag` row per alias pins it.
- **The grant table grew by 19, not the 20 briefly asked for**: the `surface-in-a-container:app-shell` row
  the orchestrator requested was withdrawn on measurement (the exemption reaches nothing; it would have been
  born stale) and is not in the tree.
- **The eight clock fixes and the playwright routing, per id (quiet-box value before → after):**
  `home-server-family.test.ts` `FAMILY_TIMEOUT_MS` 300\_000 → `scaledBudget(300_000)` (300\_000);
  `origin-server-family.test.ts` same; `test-world-browser-contracts.repo.int.test.ts` `timeout`
  120\_000 → `scaledBudget(120_000)`; `program-routing.test.ts` 30\_000 → `scaledBudget(30_000)`;
  `reviewed-grants.test.ts` `ROSTER_TIMEOUT_MS` 120\_000 → `scaledBudget(120_000)`; `_shared/test-tags.ts`
  `slow.timeout` 30\_000 → `budget(SLOW_TIMEOUT_BASE_MS)` (30\_000); `verify/lib/config-snapshot.ts`
  `SNAPSHOT_TIMEOUT_MS` 30\_000 → `budget(SNAPSHOT_TIMEOUT_BASE_MS)`; `verify/ops/resource-tracked.ts`
  `GIT_INDEX_TIMEOUT_MS` 30\_000 → `budget(GIT_INDEX_TIMEOUT_BASE_MS)`; `playwright.config.ts`
  `webServer.timeout` 180\_000 → `budget(180_000)`, test `timeout` 60\_000 → `budget(60_000)`,
  `use.actionTimeout` 15\_000 → `budget(15_000)`. `budget()` returns EXACTLY its base on a quiet box
  (`computeLoadFactor` → 1; `Math.max(base, min(ceiling, scaled))`), so every effective quiet-box value
  is preserved; under contention each stretches by the per-core factor, capped at 8× and at the 10-minute
  absolute ceiling — the semantics every other clock in the tree already had. `tool-guard.int.test.ts:739`
  keeps its literal 120\_000 under `@orb-waive tooling-clock-budget(120_000)` (it is the guard's input
  under test). `model-ab/ops/run.ts:110` `path.join(REPO_ROOT, "reports", "ab", stamp)` →
  `reportsPath(REPO_ROOT, "ab", stamp)`.
- **The ambient branch of `tooling-process-exit-home`** is pinned in the family test against a plant
  DERIVED from `_proof/node-types.ts` (the augmentation shape plus `exit(code?: number): never`), because
  the shared plant declares no `exit` and is three policies' shared fixture; a module row can take the pin
  over the day the shared plant carries `exit`. The undeclared-global refusal is a module row.

### 4.5 §4.1 cuts (measured 2026-09-12; the anchor occurs exactly once on a sibling scratch copy, flag-MORE direction)

| Policy · fence | Cut | Rows that died |
| - | - | - |
| project-home · the package comparison | admit every construction | mustPass\[0] (local class), mustPass\[1] (project door) |
| project-home · the package name | `ts-morph-lookalike` | mustFlag\[0..3] |
| browser-door · the attach set | `launch` only | mustFlag\[1], \[2], \[3] (count 2 → 1) |
| browser-door · the door set | admit every receiver | mustFlag\[5] (unreadable), mustPass\[0] (puppeteer), \[1] (local), \[2] (project door) |
| artifact-path-home · the literal fence (lib) | any string | mustFlag\[0..2], \[4]; mustPass\[1] (`report-cards`) |
| artifact-path-home · the door set (lib) | any module door | mustPass\[2] (project-declared `join`) |
| artifact-run-slot · the cli-only slot | a slot anywhere | mustFlag\[1] (slot in ops/) |
| artifact-run-slot · the `_shared` skip | judge the home dir | mustPass\[3] |
| process-exit-home · the member name | `exitCode` | mustFlag\[0..4] |
| cli-entry · the home export name | admit `other` | mustFlag\[2]; every other row REFUSES at the receipt (the widened name is unresolved) — the receipt fence measured in the same cut |
| cli-entry · the cli shape in `evaluate` | judge every admitted file | **0** — UNFALSIFIABLE by row: the population glob `tooling/src/*/cli.ts` is the enforcer and the only admitted non-cli file is the receipted runner home, which the cut excluded by hand; recorded, the belt stays |
| child-process-door · the specifier set | `node:` only | mustFlag\[1] (bare `child_process`) |
| child-process-door · the identity | spelling instead | mustFlag\[6] (count 1 → 2), mustPass\[0] (local declaration) |
| port-registry · the value half (lib) | drop | mustFlag\[0], \[1], \[5] |
| port-registry · the name half (lib) | drop | mustFlag\[3], \[4] |
| clock-budget · the BASE exemption (lib) | drop | **0 on the first cut** — the legacy mustPass spelled `NAV_TIMEOUT_BASE_MS`, which the suffix regex already rejects (the cut measured the helper, not the fence); mustPass\[2] (`BASE_NAV_TIMEOUT_MS`) added, re-cut: 1 row died |
| clock-budget · the settle ceiling (lib) | 0 | mustPass\[3] (settle 400) |
| clock-budget · the option key set (lib) | drop `timeout` | mustFlag\[0], \[3] |
| runner-config-literals · the unparseable branch | skip silently | mustFlag\[4] |

### 4.6 Differential and real-tree receipts

- **Legacy side first**: all 36 legacy examples (21 mustFlag, 15 mustPass) replayed through the frozen
  `runPass` of `2c1a1d37c`; per-arm coverage A1 B1 C1 D1 E1 F2 F2×2 G1 H2 I6 J3 plus the stale/blind
  example (nonzero on every arm the descriptor carried). Then through the UNION of the nine tree policies
  with the three located homes planted beside each example (the legacy verdict is asserted identical with
  and without the plant). Seven classified differences (identity · granularity · grants · homes ·
  stale/blind · position · message) are stated in the family test header and applied so every comparison
  is one `toEqual`. The resource policy has no legacy proof rows: its differential is the real-tree replay
  below (legacy 0 findings on the two configs it read; final 3 on the third it never read).
- **Real tree, ten policies with the central grant table** (`fmh-g4-real` scratch, then the committed
  family test): 0 tool errors · 0 effective findings · 19 grants consumed ×1 · 1 waiver bound
  (`tool-guard.int.test.ts:739 120_000`) · 261 alarms, ALL `ordinary-waiver … targets unknown policy` for
  other policies' live markers (a narrowed-roster artefact: `knownPolicies` = the ten), none naming a
  plumbing policy; populations: 1,127 files for the `@tooling` policies, 16 for `tooling-cli-entry`, 1,142
  for the port policy, 1,606 for the clock policy, 0 for the resource policy.
- **Red-first over the PRE-FIX tree** (the eleven fixed files probe-copied back from `b6a4e012d`): **13
  effective findings** — the 8 legacy-visible clocks, the tool-guard row no longer censused (un-waived),
  the 3 `playwright.config.ts` clocks the legacy never read, and `model-ab/ops/run.ts:110`; the legacy's 3
  `policy-conformance.ts` Projects are licensed by their grant. Restored; `git status` clean.
- Floor and counts: in the completion commit's message.

## 5. Group 5 — `design-audit-rule-proof`, `testid-liveness`, `tooling-instrument-proof` — not yet designed

`testid-liveness` is designed and landed below by lane `p-hooks-split`; `design-audit-rule-proof` and
`tooling-instrument-proof` belong to lane `p-hooks-single` and are not yet designed here.

### 5.1 Premises re-derived on the tree (lane `p-hooks-split`, 2026-09-12)

| Premise | Receipt |
| - | - |
| `testid-liveness` is byte-identical to its legacy SHA | `git log --oneline -3 -- tooling/src/verify/gates/testid-liveness.ts` → `9e2eca320` is the last touch |
| Zero live `@orb-gate-ignore testid-liveness` and zero `@orb-waive testid-liveness` markers | `grep -rn` over `packages/ tests/ tooling/ scripts/ docs/` → exit 1, no lines; positive control `grep -c orb-gate-ignore tooling/src/verify/lib/gate-ignore.ts` = 4 |
| The legacy gate is GREEN on the real tree | `runPass([testid-liveness], projectCtx(root))` → `scanned=6296 findings=0 toolErrors=0` — the scanned count is the positive control that the probe measured rather than failed |
| The registry home is live | `packages/client/src/lib/test-ids.ts` declares `export const TEST_IDS = { … }` with string rows |
| `tests/tooling/**` suites naming the id as a literal | `gate-spelling-twins.baseline.json:72` (the shrink-only legacy-roster ledger, already red for 54 converted gates — LEAVE, it retires at cutover) and `check-gates.repo.int.test.ts:829` (its `__g_` block, deleted with the conversion) |
| Base counts | `gate:contract` 532 findings across 285 modules (12 of them this module); `check:policy-conformance` 214 policies · 2,342 rows · 0 failures; roster count line 285 |

### 5.2 `testid-liveness` → `testid-liveness` (ordinary) + `testid-liveness-health` (hard)

**Ruling (§12.6):** "ordinary dead-consumer/row policy plus hard registry-health policy". Implemented as
ruled — the ARITY held. A1 (a dead consumer, in all three spellings) and A2 (a dead registry row) report at
different subjects and never double-report a site, so they are one ordinary policy; A3 is the tripwire.

**Family `testid-liveness`, shared reader `lib/testid-registry.ts`** (`testIdRegistryRow`,
`TESTID_REGISTRY_HOME`, `TESTID_REGISTRY_CONST`, `TESTID_ATTR`, `TESTID_FN`) — the REGISTRY READ, which is
what both policies share. **The producer-evidence rules and `SELECTOR_RE`/`KEY_SHAPE_RE` deliberately stay
in the policy:** they have exactly one consumer, and a `lib/` module with one consumer is that policy's
private reader wearing a contract's clothes (§11.5, one layer down). The sharper reason the registry read is
the right family subject: the tripwire's claim is *"the read still yields rows"*, and it must be proving that
about the SAME read the liveness arms use or it guards a different thing than it appears to.

**`testid-liveness`** — ordinary/error/`entire-population`/`["@packages", "@showcase", "@tests"]`/`syntax`.
Population port BYTE-IDENTICAL and the `@showcase` root is the whole point: the legacy `scanRoot`
(`(p.includes("packages/") && p.includes("/src/")) || p.includes("tests/")`) admits
`packages/showcase-plugins/src`, which `@packages` and `@authored` deliberately EXCLUDE, so a lane reaching
for `@packages` alone narrows the policy silently. The equality is MEASURED in the family test rather than
asserted in the header.

**THE ORDINARY DOOR WORKS, AND THIS MODULE IS THE EXCEPTION TO THE 9/9 BASE RATE.** The legacy positions
were `{ token: <the selected value>, offset: <indexOf inside the reported node> }` — free-form by intent, but
incidentally AUTHORED CODE at their offset, so `locateFinding` would have bound them. The position
nevertheless MOVED, deliberately: every finding is now anchored through `lib/caught-failure.ts`'s
`firstAnchor`, so the position is the whole authored literal (`"draft-cast"`,
`'[data-testid="ghost-row"]'`, `"ghostRow"`) or, for a dead row, the bare key (`ghostRow`). Two reasons: the
selector spelling has no clean sub-literal position at all (two dead values in one selector string would
share a carrier AND a token and be jointly unwaivable), and a shared anchor means two policies governing one
site report ONE position, so one marker can waive both. The move is FREE because the marker census is
0 = 0 = 0.

**`testid-liveness-health`** — hard/error/`entire-population`, population EXACTLY the registry home
(`{ in: ["@client"], under: ["packages/client/src/lib/test-ids.ts"] }`). One `PropertyAssignment` visitor
counts rows through the family reader; zero rows is one finding at the home, line 1.

**THE LEGACY REAL-TREE ANCHOR RETIRES, and that is the arm's mechanism, not a simplification.** The legacy A3
opted into real runs by testing `fileLoaded(ctx, "packages/db/src/schema/index.ts")`. Under the final runtime
an ABSENT home admits zero paths and the runtime REFUSES at the population phase — driven:
`toolErrors=[{policyId:"testid-liveness-health",phase:"population",message:"Invalid population resolution:
expression admitted zero paths from 1 candidate(s)"}]` — which is LOUDER than the legacy silent skip. Keeping
the db anchor would have put a foreign file in the policy's population for no verdict, which is a population
lie rather than a harmless extra. Same shape as `sub-floor-disclosure-health` (§3.2).

**Marker reconciliation (§8.6):** 0 legacy = 0 waives = 0, per file and in total. Nothing to translate.

### 5.3 Group 5 coupled sites (`testid-liveness` half)

| Site | Action |
| - | - |
| `lib/testid-registry.ts` | NEW shared reader (the family) |
| `gates/testid-liveness.ts` · `gates/testid-liveness-health.ts` | 1 rewritten, 1 new |
| `tests/tooling/check-gates.repo.int.test.ts` | the `__g_testidlive` fixture block deleted |
| `tests/tooling/verify/gates/testid-variant-split-family.test.ts` | NEW (shared with group 6): conformance ×4, §4.2 arms ×2 + the dead-position discrimination control, the measured population-port equality, §4.5 refusal/deferral pins, §4.6 differentials ×2 |
| roster | 1 row rewritten, 1 added, count 285 → 287 (with group 6) |
| `docs/test-baseline/manifest.json` | regenerated (+1 spec) |

### 5.4 Group 5 measured (`testid-liveness` half, 2026-09-12, this worktree)

§4.1 cut table. Cuts are applied to a SIBLING SCRATCH MODULE in the same directory with the anchor asserted
to occur EXACTLY ONCE and `rmSync` in a `finally`; a `lib/` cut also copies the GATE with its import
rewritten, because the module under test is the policy. **Direction is stated per row, and the tripwire's
rows are cut in the INVERTED direction (its fences ACQUIT, so its falsifier is a `mustFlag` going GREEN).**

| Policy | Narrowing | Replaced with | Rows that died | Bucket |
| - | - | - | - | - |
| `testid-liveness` | rule-3's `PACKAGE_SRC_RE` fence | dropped (admit key mentions from anywhere) | 1 (`mustFlag[2]`) | ENFORCED |
| `testid-liveness` | rule 3 itself | the key-mention set dropped from the producer fold | 2 | ENFORCED |
| `testid-liveness` | rule 2, template producers | `patternProducers` dropped from `isProduced` | 1 | ENFORCED |
| `testid-liveness` | the A2 registry-row loop | never reports | 2 | ENFORCED |
| `testid-liveness` | the `[data-testid=…]` selector reader | the match loop dropped | 1 | ENFORCED |
| `testid-liveness` | the dynamic-consumer guard | a non-literal argument read as its own text | 1 | ENFORCED |
| `testid-liveness-health` | the `TEST_IDS` owner-name fence | OPENED (any variable declaration owns rows) | 1 | ENFORCED |
| `testid-liveness-health` | the string-VALUE fence | OPENED (any initializer is a row) | 1 | ENFORCED |
| `testid-liveness-health` | the zero-rows verdict | never reports | 3 | the rule |

**A FALSE CLEAN THE HARNESS PRODUCED AND THE FIX, worth carrying:** the first run of the two `-health` cuts
came back `0 rows died`. The cuts are in `lib/`, and the harness rewrote the import of the GATE it was told
to load — which was `testid-liveness.ts`, the ORDINARY sibling, whose rows barely exercise registry
readability. **A `lib/` cut in a SPLIT family must name the sibling whose rows the fence serves**; re-run
against `testid-liveness-health.ts` both cuts reddened immediately. Same class as §4.1's "a cut that did not
reach the code proves nothing", one axis over: here the cut reached the code and the WRONG POLICY was driven.

§4.6 differential is committed in `testid-variant-split-family.test.ts`: all 9 legacy examples replayed
through the frozen legacy `runPass` (SHA `9e2eca320`) and through the UNION of the final pair. Differences
CLASSIFIED: (1) ARM SPLIT + ANCHOR MOVE — the A3 tripwire is its own policy and the final contract forbids a
zero coordinate, so `test-ids.ts:0:0` becomes `test-ids.ts:1:1`; (2) ANCHOR MOVE on the consumer arms,
asserted by CONTAINMENT rather than an arithmetic column shift, because the shift is NOT uniform (one column
for a `getByTestId("x")`, fourteen for a `[data-testid="x"]` selector) — the honest statement is *the final
position is the start of the authored literal that CONTAINS the legacy position*, and that is what is pinned;
(3) A2's position is UNCHANGED. Legacy-side coverage asserted: 3 consumer findings, 1 dead registry row,
1 tripwire red — every split arm exercised. EMPTY ADMISSION: a legacy example that does not carry the
registry home refuses the tripwire at the population phase, so the union is taken over the ordinary half
alone there.

**Real-corpus differential: BOTH SIDES ZERO** (`scanned=6296 findings=0` legacy; the final policies report
nothing on the live tree). Recorded as vacuity shape 1 — informative only as a no-regression receipt, with
the scanned count as the positive control. The EVIDENTIAL differential is the fixture-level replay above.

## 6. Group 6 — `agent-bridge-lock`, `no-inline-union-redecl`, `ui-variant-axes-stamped`

`ui-variant-axes-stamped` is designed and landed below by lane `p-hooks-split`; `agent-bridge-lock` belongs
to lane `p-hooks-single` and `no-inline-union-redecl` is unassigned — neither is designed here.

### 6.1 Premises re-derived on the tree (lane `p-hooks-split`, 2026-09-12)

| Premise | Receipt |
| - | - |
| `ui-variant-axes-stamped` is byte-identical to its legacy SHA | the module's whole history is `da01f7eb9`, its only touch |
| **THE BASELINE IS EMPTY — the ruled arity's warning-debt half has NO POPULATION** | `ui-variant-axes-stamped.baseline.json` is `{}`, three bytes. 11 rows at mint (`da01f7eb9`), ALL DRAINED at `fc5f99e4c` (#1097, tranche 2). `exception-authority-census.md:38` independently records "`ui-variant-axes-stamped`: 0 rows" and `:164` rules the empty ledger "can delete immediately at cutover" |
| Zero live markers for the id | a literal sweep over `packages/ tests/ tooling/ scripts/ docs/` returns nothing; positive control `@orb-gate-ignore` in `lib/gate-ignore.ts` = 4 |
| The legacy gate is GREEN on the real tree | `runPass([ui-variant-axes-stamped], projectCtx(root))` → `scanned=366 findings=0 toolErrors=0` |
| The baseline has FIVE coupled sites, one of which breaks the build | the ledger JSON · `ops/gen/ui-variant-axes-stamped.ts` · `ops/baseline.ts:40` (the verb row + its import) · `verify/index.ts:168` (the export) · **`ops/debt.ts:55,92` — `debt.ts` imports `BASELINE_REL` FROM THE GATE MODULE**, so deleting the gate's export without touching `debt.ts` fails the whole tooling program to parse |
| Base counts | as §5.1; 17 of the 532 `gate:contract` findings are this module |

### 6.2 `ui-variant-axes-stamped` → `ui-variant-axes-stamped` (hard) + `ui-variant-axes-stamped-health` (hard)

**Ruling (§12.6):** "hard recipe/duplicate/blindness policies plus work-item-linked warning debt; baseline
deleted." **TWO of the ruled row's claims disagree with the tree and the row is amended (§12.6's own banner:
a ruled arity is still a claim about the tree). Both were escalated with receipts and RATIFIED by the
orchestrator before the modules landed.**

**AMENDMENT 1 — there is NO warning debt to mint.** §12.5 retires `*.baseline.json` debt rather than
converting it, and every row it held must become exactly one of fixed / an exact reviewed grant /
`severity: "warning"` with a positive `workItem`. The ledger held ZERO rows on conversion day, so ZERO rows
were carried in any of the three directions. A `warning` policy with a `workItem` and no population would be
born stale — the shape §12.5 forbids from the other side. Both policies are `severity: "error"`.

**THE PER-ROW ACCOUNTING TABLE**, which is the deliverable that proves nothing was dropped:

| Baseline row (all 11, as minted at `da01f7eb9`) | Disposition |
| - | - |
| `packages/ui/src/charts/meter/variants.ts::segmentedClockVariants` | FIXED at `fc5f99e4c` (#1097) |
| `packages/ui/src/content/theme-swatch/variants.ts::themeSwatchVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/layout/variants.ts::containerVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/avatar/variants.ts::avatarVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/collapsible/variants.ts::collapsibleVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/dialog/variants.ts::dialogVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/number-field/variants.ts::numberFieldVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/slider/variants.ts::sliderVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/status-chip/variants.ts::statusChipVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/switch/variants.ts::switchVariants` | FIXED at `fc5f99e4c` |
| `packages/ui/src/primitives/text/variants.ts::textVariants` | FIXED at `fc5f99e4c` |
| **rows live on conversion day** | **0 — ledger content `{}`, 3 bytes** |
| **reviewed grants minted** | **0** |
| **warning-debt rows minted** | **0** |
| **silently dropped** | **0 — no row dropped, and no count ratchet survives (§12.5 forbids both)** |

Arm A4 (the two-sided stale-row arm: a row whose recipe got stamped, or whose key names nothing) DIES with
the ledger — with nothing to be stale about, a successor proof would discriminate nothing.

**AMENDMENT 2 — the split is TWO policies, not three, with A3 (duplicate NAME) in the main hard policy.**
A1, A2 and A3 differ on NO axis: same authority (`hard`), severity, `execution` (`entire-population`) and
population (`@ui`). §3 says use the smallest complete contract, and this lane's own §3.3 ruling says *"a
split is owed only where an axis differs"*. A5 DOES differ on population — its subject is exactly the axis
home — so it is the `-health` sibling. **The structural clincher: A3 cannot live in `-health` at all.** A
duplicate exported NAME is a cross-file verdict over the whole `@ui` corpus, and `-health`'s population is
one file, so that arrangement is the one that cannot be built.

**Family `ui-variant-axes-stamped`, shared reader `lib/variant-axis-stamp.ts`** — REWRITTEN to be NODE-LEVEL
(`declaredAxes(declaration)`, `stampDoorRecipeName(call)`, `readStampedAxes(sf)`, `stampDoorPresent(sf)`,
`recipeKey`). The legacy per-SourceFile entry points (`scanRecipes`, `stampedNames`, and `stampedNames`'
`getDescendantsOfKind` walk) and `scanUiPackage` — which opened its OWN ts-morph workspace for the baseline
generator — are DELETED; the policies subscribe `VariableDeclaration` and `CallExpression` through the
shared kind-indexed walk, and the generator went with the ledger.

**`ui-variant-axes-stamped`** — hard/error/`entire-population`/`@ui`/`syntax`. Population port
byte-identical (`p.includes("packages/ui/src/")` → `@ui`). The duplicate-NAME map is built in VISITORS and
judged in `evaluate`, never in `visitFile` — the legacy `visitFile` + `run` + `finalize` split is what made
that a trap. Each of the three arms carries its own message DISCRIMINATOR (`A1 unstamped:`,
`A2 unreadable:`, `A3 duplicate name:`), deliberately DISJOINT so a proof row can pin WHICH arm fired; the
legacy passed no per-finding message and every arm produced the same count.

**The A2 fail-closed arm is the #944 third answer and it is PROVEN REACHED, not asserted.** Its `mustFlag`
row carries a `messageIncludes`, because the arm produces the same finding COUNT as A1 and differs only in
message — a bare `{ count: 1 }` passes identically whether the arm fires or is unreachable. Probe per
§4.5b: the branch's `report` call replaced with `throw` in a scratch copy — **1 row died**, so the arm is
reached.

**`ui-variant-axes-stamped-health`** — hard/error/`entire-population`, population EXACTLY the axis home
(`{ in: ["@ui"], under: ["packages/ui/src/lib/variant-attrs.ts"] }`). TWO independent verdicts with
separate messages: the `STAMPED_VARIANT_AXES` tuple must read, and the home must still declare
`variantProps`. Both gone is TWO findings, never one and never silence. The legacy real-tree anchor
(`packages/ui/src/lib/class-merge.ts`) RETIRES for the same reason as §5.2's — driven:
`toolErrors=[{policyId:"ui-variant-axes-stamped-health",phase:"population", …"admitted zero paths from 1
candidate(s)"}]`.

**Marker reconciliation (§8.6):** 0 legacy = 0 waives = 0. And the family test PINS the hard refusal: a
`@orb-waive ui-variant-axes-stamped(thingVariants)` marker produces
`ordinary waiver … targets non-ordinary policy ui-variant-axes-stamped`, 1 effective finding, 0 waived — so
a split that silently softened the authority would be caught.

### 6.3 Group 6 coupled sites (`ui-variant-axes-stamped` half)

| Site | Action |
| - | - |
| `lib/variant-axis-stamp.ts` | rewritten node-level; `scanRecipes`, `stampedNames`, `scanUiPackage`, `repoRel`, `AXIS_ANCHOR_REL` deleted |
| `gates/ui-variant-axes-stamped.ts` · `gates/ui-variant-axes-stamped-health.ts` | 1 rewritten, 1 new |
| `gates/ui-variant-axes-stamped.baseline.json` · `ops/gen/ui-variant-axes-stamped.ts` | DELETED |
| `ops/baseline.ts` · `verify/index.ts` · `ops/debt.ts` | the verb row, the export and the debt-ledger row removed (the last also drops the `BASELINE_REL` import that would otherwise fail the program to parse) |
| `tests/tooling/check-gates.repo.int.test.ts` | the `__g_variantaxes` fixture block deleted |
| `tests/tooling/verify/gates/testid-variant-split-family.test.ts` | shared with group 5 |
| roster | 1 row rewritten (the ratchet paragraph replaced by its terminal statement), 1 added |

### 6.4 Group 6 measured (`ui-variant-axes-stamped` half, 2026-09-12, this worktree)

| Policy | Narrowing | Replaced with | Rows that died | Bucket |
| - | - | - | - | - |
| `ui-variant-axes-stamped` | the A2 fail-closed branch | `throw` (the §4.5b reachability probe) | 1 | REACHED |
| `ui-variant-axes-stamped` | the axis-home SELF-CREDIT fence | OPENED (credit stamp calls inside the axis home) | 1 (`mustFlag[3]`) | ENFORCED after the fixture was repaired |
| `ui-variant-axes-stamped` | the stamped-axis INTERSECTION | OPENED (judge every declared variant) | 2 | ENFORCED |
| `ui-variant-axes-stamped` | the A1 stamp check | nothing is ever credited | 3 | the rule |
| `ui-variant-axes-stamped` | the A3 `sharing.length < 2` guard | OPENED (one recipe duplicates itself) | 4 | ENFORCED |
| `ui-variant-axes-stamped` | the `tv` mint check | OPENED (any call initializer is a recipe) | 2 | ENFORCED |
| `ui-variant-axes-stamped` | the `STAMP_DOORS` set | OPENED (any callee credits its first identifier argument) | 1 (`mustFlag[0]`) | ENFORCED after the fixture was repaired |
| `ui-variant-axes-stamped` | the `variantAttrs` slot door | NARROWED to `variantProps` alone | 1 | ENFORCED |
| `ui-variant-axes-stamped-health` | the `AXIS_TUPLE_NAME` fence | OPENED (any array const is the vocabulary) | 1 | ENFORCED |
| `ui-variant-axes-stamped-health` | the `STAMP_DOOR` function fence | OPENED (any declaration is the door) | 2 | ENFORCED |
| `ui-variant-axes-stamped-health` | the tuple-arm verdict | never reports | 3 | the rule |
| `ui-variant-axes-stamped-health` | the door-arm verdict | never reports | 2 | the rule |

**TWO CELLS READ CLEAN FIRST AND BOTH WERE UNENFORCED FIXTURES, NOT UNENFORCED FENCES — the §4.1 outcome
that is worth the most.** The SELF-CREDIT fence cut clean because `mustFlag[3]`'s axis home only DECLARED
`variantProps` and never CALLED it, so the fence was never reached; the fixture now calls
`variantAttrs(thingVariants, …)` inside the home, and the cut reds. The `STAMP_DOORS` cut read clean because
no fixture handed a recipe IDENTIFIER to a non-door call — `cn(thingVariants({ … }))` passes a CALL, so it
can never credit whatever the door set is; `mustFlag[0]` now also carries `register(thingVariants)`, and the
cut reds. **In both cases the honest classification was UNENFORCED with the fix being a row, exactly as §4.1
prescribes — and in both cases the discriminating row was one line, which is why "UNFALSIFIABLE" owes a
constructed attempt rather than an argument.**

**Both `-health` siblings' fences are cut in the INVERTED direction** (§4.1: a tripwire's fences ACQUIT, so
opening one makes it flag FEWER and its falsifier is a `mustFlag` going GREEN). A tripwire whose cells all
read clean is the tell that the direction was wrong.

§4.6 differential is committed in `testid-variant-split-family.test.ts`: all 8 legacy examples replayed
through the frozen legacy `runPass` (SHA `da01f7eb9`, with the legacy `lib/variant-axis-stamp.ts` frozen
BESIDE it because this conversion changed the shared reader) and through the UNION of the final pair.
POSITION is byte-identical on every recipe arm (both sides anchor the declaration's own name node).
Classified: A4 retired (no legacy example produces a stale-ratchet finding — asserted per example), and the
A5 tripwire has **ZERO legacy coverage on BOTH sides**, asserted per example, because it is guarded on a
real-tree anchor no legacy example loads. That is §4.6's "a split's differential is weakest exactly where it
feels strongest": the successor proof is the health policy's own four CONSTRUCTED `mustFlag` rows, not a
replay. Legacy-side recipe coverage: 4 findings (A1 ×1, A2 ×1, A3 ×2).

**Real-corpus differential: BOTH SIDES ZERO** (`scanned=366 findings=0`), vacuity shape 1, recorded as a
no-regression receipt only.

## 7. Forks escalated

None yet. (Each is recorded here with the default taken and the message sent.)
