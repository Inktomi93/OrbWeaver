---
kind: review
status: active
updated: 2026-09-11
---

# Gate-runtime conversion exemplars for #1584

One converted gate per capability of the final `defineGate` runtime, each read in full before being cited, with its
tests and the central files a conversion lane must read first. Produced by a read-only scout on 2026-09-11 at
`f898b14b1` for the orchestrator; every future conversion brief names this file as "copy these shapes". The
"did not cover" section at the end is part of the record, not a footnote: an exemplar it marks unconfirmed is a
lead, not a precedent.

## EXEMPLARS - copy these shapes

Attribution note: every commit in this repo is authored as Inktomi93 regardless of which agent produced
it, so "who landed it" is judged by commit message/content. The four SHAs named in the brief - 99b7429e2,
7be684811, 941d730cc, 9377887c0 - are last night's orchestrator lanes; everything else cited below predates
them (mostly under commit 3d8abaf5b "refactor(tooling): make shared facts first class" and its neighbors,
the "Codex era").

## Central files to read before converting anything

| File | What it owns |
| - | - |
| tooling/src/verify/contract/policy.ts | defineGate/GatePolicy type - the whole final contract, GatePolicyContext, execution/analysis enums |
| tooling/src/verify/contract/population.ts | PopulationExpr shape (named roots, in/under/notUnder, {of:"none"}) |
| tooling/src/verify/contract/resource-declaration.ts | GateResourceRequest - the closed resource-kind vocabulary (authored-tree, package-metadata, etc.) |
| tooling/src/verify/lib/population-resolver.ts | globRegex + the end-anchored under/notUnder resolver - the population algebra runtime |
| tooling/src/verify/lib/policy-pass.ts (859 lines) | runPolicyPass/resolveRun - the dispatcher: fact ordering, receipts, authority reconciliation, refusals |
| tooling/src/verify/ops/policy-conformance.ts | verifyPolicyProofs - the self-proof runner every mustFlag/mustPass row runs through |
| tooling/src/verify/gates/GATE-AUTHORING.md | LEGACY (owner, 2026-09-11): describes the PRE-cutover production runtime (scanRoot, scopeSafety, run hooks, ExemptionRow tables, check-gates.int fixtures) and never mentions defineGate. Read it only to understand what a legacy descriptor meant; never copy its shapes or satisfy its coupled-site checklist. It is rewritten at cutover (design doc, "Existing machinery we retain") |
| tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md | API choice / performance guidance for ts-morph reads |
| tooling/src/verify/gates/NODE-26-FILESYSTEM-CAPABILITIES.md | filesystem-backed resource provider guidance |

---

## 1. Pure syntax policy, exact-slice anchoring, wrapper-stripped near-misses

File: tooling/src/verify/gates/no-array-literal-querykey.ts (83 lines, whole file read)
Commit 3d8abaf5b "refactor(tooling): make shared facts first class" (pre-last-night, Codex era).

- analysis syntax, execution selected-files, facts empty, resources empty at lines 20-24
- kind-indexed visitors on PropertyAssignment, state-free create, lines 27-41
- ctx.report.node with token queryKey offset 0, an exact-slice anchor, line 36
- unwrapExpression strips satisfies / as-const / parens before judging the initializer, line 35
- mustFlag proves wrapper-stripping survives satisfies, as-const, and parens (count 2), lines 48-56
- mustPass rows are declared-limit controls: identifier passthrough, an as-unknown-as cast over a
  non-array, a sanctioned proxy call, and a resolved-constant / arrow-factory / spread trio, lines 58-82

Why exhaustive: every near-miss that could tempt a lazy conversion into over- or under-matching is its
own named mustPass row with a why explaining the boundary, not one happy-path pair.

Wart: no explicit empty-population control. Acceptable here (no cross-file semantics); do not copy that
omission into a policy whose subject resolution can itself be empty or unresolved (see items 3 and 5).

Test: proofs run through verifyPolicyProofs at conformance time; no dedicated test file was located for
this policy by name. Do not copy "no test file" as a shortcut for a policy whose family DOES have one
(see items 2, 4, 5, 10).

---

## 2. Cross-file evaluate policy, execution entire-population

Files: tooling/src/verify/gates/spacing-tier-home-health.ts (69 lines, whole file read) and
tooling/src/verify/gates/no-raw-spacing-in-features.ts (99 lines, whole file read; the selected-files
sibling and the SANCTIONED\_HOMES source). Commit 99b7429e2, "fix(gates): migrate the raw-CSS-literal-in-
features family to defineGate" - one of last night's four named SHAs.

- execution entire-population, create returns only an evaluate hook, no visitors at all, lines 24, 29-41.
  The verdict (does this sanctioned-home row resolve to any file on the tree) cannot compose over a
  narrowed subset - exactly the design doc's definition of entire-population.
- a real-tree anchor guard, ANCHOR is packages/ui/src/tokens/index.ts, so the tripwire self-guards off
  under a mini fixture run instead of falsely declaring both sanctioned homes dead, lines 11-16, 31-33
- imports SANCTIONED\_HOMES directly from its sibling occurrence policy so both judge identical rows,
  line 9; the sibling's own header states the split reason, one execution value cannot serve both,
  no-raw-spacing-in-features.ts lines 9-11
- mustFlag is the rename tripwire itself: one home still resolves, the other doesn't, lines 42-51
- mustPass carries two controls: both homes still earned (lines 53-61) and the anchor-not-loaded
  self-guard-off case (lines 63-67) - the empty/unresolved-subject control this capability needs

Why exhaustive: the tripwire never asserts the tree is broken off a fixture that never loaded its own
anchor - the control most lazy entire-population conversions skip, proven here explicitly.

Wart: none found; both files read in full, no shortcuts visible.

Test: no dedicated test file was located for this pair by name; its family appears to run through
check-gates.repo.int.test.ts / conformance. Confirm the gate id before reusing that as precedent for
skipping a family test file, since items 4, 5, 10 below DO have one.

---

## 3. Resource policy - closed ResourceHost facts, no source population

File: tooling/src/verify/gates/server-layout.ts (106 lines, whole file read)
Commit 3d8abaf5b, Codex era. Confirmed the cleaner of the brief's two precedents: ui-exports-map-
complete.ts (186 lines) does the same shape but is longer and was only skimmed; server-layout.ts is the
minimal clean version.

- population is of none with a why string, analysis resource, execution entire-population, lines 27-29
- resources declares two rows: kind authored-tree id server, kind package-metadata id server, lines 31-34
- create returns evaluate reading ctx.resources.authoredTree("server"), with an explicit status-not-ready
  withhold check before reading either resource, lines 38-43
- reports both directions of the same closed vocabulary: an illegal top-level entry anchored on the stray
  path, and a missing required tier anchored on the package.json manifest instead (no file to point at),
  lines 49-62
- mustFlag and mustPass rows use mode resource and materialize a full fake server src tree plus its
  package.json, lines 65-106

Why exhaustive: the resource-not-ready guard means a partial or failed resource read withholds rather than
reporting half a verdict - exactly the missing/empty/unresolved-population-refusal standard capability the
design doc requires.

Wart: none found.

Test: proofs run via verifyPolicyProofs / family conformance; this scout did not locate a dedicated test
file named for server-layout specifically in the time available - treat as unconfirmed, not "none exists."

---

## 4. defineFact provider consumption

File: tooling/src/verify/gates/schema-branding.ts (whole file read, about 100 lines), consuming
tooling/src/verify/lib/schema-fact.ts's drizzleSchemaFact provider. The defineFact machinery itself lives
in tooling/src/verify/contract/fact.ts - not read in full in this pass; its collector/finish/receipts
surface is bigger than this pass's time budget covered.
Commit 3d8abaf5b, Codex era.

- facts declares drizzleSchemaFact, analysis types, execution entire-population, lines 44-48
- reads the fact only inside evaluate, via ctx.fact(drizzleSchemaFact).schema(), lines 55-56 - never calls
  Project getSourceFiles or walks itself
- recordReadySchemaFact(ctx, fact) - the receipt call the design doc requires for fact consumers, line 56
- pure intent logic on top of the fact's already-resolved table/column shapes: primary-key brand check and
  FK-brand-must-match-parent check, each its own named helper, lines 17-38
- mustFlag/mustPass rows are mode types (needs the type checker to resolve the id-brand generic) and
  include a declared-limit central-waiver row, an inline waiver marker naming schema-branding and a column,
  proving the ordinary marker works through a fact-consuming policy too, lines 107-115

A more complex sibling worth knowing about: tooling/src/verify/gates/bus-producer-coverage.ts and
bus-fact-health.ts consume two independently-derived facts and additionally cross-check that their belted
rosters AGREE, refusing the whole run if they disagree (bus-producer-coverage.ts lines 39-57) - a stronger
but much denser exemplar of the same capability. Prefer schema-branding.ts as the copy-shape; read
bus-producer-coverage.ts only if the target gate itself needs cross-fact agreement.

Why exhaustive: schema-branding.ts owns zero schema parsing (its own header comment: "The provider owns
type/symbol identity; this policy owns intent") - the clean separation the design doc's shared-query-
boundary section demands.

Test: tests/tooling/verify/gates/schema-fact-wave-1.test.ts - confirmed by grep, imports schemaBranding
alongside schemaFactHealth, fkColumnsIndexed, and others, and asserts verifyPolicyProofs on the family
equals an empty array. For the denser bus exemplar: tests/tooling/verify/gates/bus-fact-health.test.ts and
bus-pair.test.ts.

---

## 5. reviewed-grant authority - typed central grant, subject/operation identity

File: tooling/src/verify/gates/no-raw-matchmedia.ts (266 lines, whole file read) - confirmed as the
design doc's own worked example, and confirmed converted. Exact SHA not isolated in this pass (no
wave-marker comment ties it to one of the four named SHAs) - treat as pre-last-night, Codex era, unless
corrected.

- authority reviewed-grant, execution entire-population since grant liveness is a whole-population verdict,
  lines 114 and 121
- builds a list of grant candidates during the walk (subject, operation, token, offset, unreadable flag),
  then calls the shared reportReviewedGrantCandidates helper in evaluate - the policy never touches a
  grant table itself, lines 126-155
- identity resolved through shared readers (resolveGlobalMemberOrigin, readsAmbientGlobalPath,
  classifyOriginRefusal), not by name-matching a callee - header comment lines 15-18, classify function
  lines 84-109
- a fail-closed UNREADABLE verdict for spellings the analysis program cannot resolve (window and self
  roots are DOM-lib declarations not loaded) - reported, never silently passed, line 204
- mustFlag rows enumerate every identity variant that must still be caught: bare global, computed-literal
  member, stored alias, a cast-away-receiver dodge, both DOM-root spellings, and the translated marker
  turned into a grant row, lines 156-221
- mustPass rows are the declared narrowing / limit controls: a typeof capability probe, a same-named local
  class method, a parameter shadow, and the one honestly-unclosed Reflect.get escape, lines 223-265

Why exhaustive: this is the strongest exemplar in the corpus for identity-not-spelling - it explicitly
names and closes the legacy check's blind spots (alias, computed key, cast) with one mustFlag row each,
and is honest about the one it cannot close (Reflect.get) rather than hiding it.

Wart: none found - this is as thorough as the corpus gets.

Central grant-liveness proof: tooling/src/verify/lib/reviewed-grants.ts (grant table shape and lookup),
tests/tooling/verify/lib/reviewed-grants.test.ts (malformed/stale/over-broad reconciliation),
tooling/src/verify/lib/reviewed-grant-findings.ts (the shared reportReviewedGrantCandidates helper, used
by every reviewed-grant policy), and tests/tooling/verify/lib/reviewed-grant-findings.test.ts.

Test for this specific gate: tests/tooling/verify/gates/home-client-family.test.ts - confirmed by grep
(imports noRawMatchmedia, runs verifyPolicyProofs, and separately drives runPolicyPass directly to assert
the reviewed-grant-consumption count on a granted fixture and a stale-reviewed-grant authority alarm on a
stale one - the malformed/stale cases a proof row cannot express).

---

## 6. Ordinary policy proving its own marker identity, plus the central authority

The gate tooling/src/verify/gates/no-inline-types.ts (authority ordinary; consumed by the central marker
engine) is exercised in tests/tooling/verify/gates/ordinary-visitors-family.test.ts, which - beyond
running verifyPolicyProofs - separately drives runPolicyPass directly to assert that a mismatched-waiver
fixture's authority alarms equal one row with kind ordinary-waiver and policyId no-inline-types, when an
inline waiver marker names a type the carrier does not declare (ordinary-visitors-family.test.ts lines
190-204). That is, the test proves the report's policy id and position identity are exactly what the
central reconciler keys on, not just that a finding fired.

Central authority: tooling/src/verify/lib/ordinary-waiver.ts (the one shared marker engine - unmarked,
exact-position, stale/dead-position, malformed, over-broad, consumption-order) and
tests/tooling/verify/lib/ordinary-waiver.test.ts (the six-case proof, run once for every ordinary policy
rather than copied per gate, per the design doc's line that the historical six-case marker probe becomes a
central authority proof).

Note: this scout did not read no-inline-types.ts in full (time budget) - cite the test's assertion as the
receipt for the capability; read the gate itself before copying its shape verbatim.

---

## 7. Split family - one legacy module becomes several policies sharing one family

Files: tooling/src/verify/gates/no-raw-spacing-in-features.ts (ordinary, execution selected-files) and
spacing-tier-home-health.ts (hard, execution entire-population), both family raw-spacing-tier - same
commit as item 2 above, 99b7429e2, last night. Both header comments cross-reference each other's execution
value as the reason for the split, and both files declare the family string identically
(no-raw-spacing-in-features.ts line 49, spacing-tier-home-health.ts line 19).

The same commit also splits no-raw-typography-in-features the identical way (a typography-tier-home-health
sibling) - not re-read in full here, but confirmed present by the commit message, which states that both
raw-spacing and raw-typography each split into an ordinary occurrence policy plus a new hard tier-home-
health policy sharing a family.

A larger ordinary-plus-reviewed-grant-plus-hard three-way split is RULED, not necessarily landed, for
no-inline-union-redecl and tooling-argv-front-door per the design doc's mixed-hook table (see the design
doc's "Migration evidence" section, the thirteen mixed-hook modules table) - not independently verified
converted in this pass; confirm conversion status before citing those two as landed exemplars.

---

## 8. Warning severity plus a workItem (debt shape)

File: tooling/src/verify/gates/user-bus-deferred-member.ts (121 lines, whole file read) - the only
severity warning policy in the 146-module defineGate corpus (confirmed by grep across
tooling/src/verify/gates/\*.ts).

- authority hard, severity warning, workItem 1822, lines 54-56
- the finding fires only in the direction that retires the debt (the deferred bus member gained a real
  producer) - the debt itself is stated by the severity plus workItem pair, not by a finding, header
  comment lines 13-21
- refuses, by throwing, if the deferred member is no longer declared at all - a vanished subject cannot
  silently keep passing, lines 77-79; the header states this refusal is pinned via runPolicyPass in
  bus-pair.test.ts because a refusal cannot be expressed as a mustFlag/mustPass row

Wart to flag honestly: this is authority hard, meaning unsuppressible, combined with severity warning - an
unusual pairing. It demonstrates the two axes ARE independent (the design doc states authority and
severity are independent and required on every policy), but it is not the simplest illustration of
ordinary debt with an escape door - there is no ordinary-plus-warning exemplar in the corpus today. Say so
in the brief rather than implying this is the only warning shape available.

---

## 9. The self-proof runner

File: tooling/src/verify/ops/policy-conformance.ts, function verifyPolicyProofs (lines 247-265, read in
context): iterates every policy's mustFlag and mustPass rows over a shared in-memory ts-morph Project,
dispatches each row by its own declared mode (source, types, or resource - see GatePolicyProofMode in
contract/policy.ts line 13), and returns a flat list of conformance failures. Every family-conformance
test under tests/tooling/verify/gates/ calls verifyPolicyProofs on its family array and asserts the result
equals an empty array as its main assertion - this is the one harness every family test shares, per the
design doc's line that the same fixture runtime serves mustFlag and mustPass, with an explicit fixture
mode instead of fake real-tree anchors.

---

## 10. Frozen-legacy differential proof, conversion-time only, not standing law

File: tests/tooling/verify/gates/simple-visitors-wave-2.test.ts (header plus first \~55 lines read) - the
proof shape for last night's 7be684811 conversion of member-card-clamped and test-determinism:

- pins BASE to the commit hash 99b7429e2b0377aa5a6ae62341f9a22aa40de94c, the commit immediately before
  this wave's conversion, meaning the last commit where these two gates still carried the legacy
  descriptor shape, lines 24-27
- a legacyFindings helper runs the frozen pre-conversion descriptor through the legacy runPass dispatcher;
  a finalFindings helper runs the converted policy through runPolicyPass, lines 39-56; the test (header
  states this explicitly; body past line 60 not fully read) replays every original mustFlag/mustPass
  example through both runtimes and asserts identical findings, catching a silently narrowed population or
  a changed verdict that a green mustFlag/mustPass rewritten after conversion could not detect, since a
  rewritten proof row only proves the new code agrees with itself
- this is explicitly conversion-time evidence, not a standing regression gate: it freezes the old source at
  one commit and is retired once the differential is trusted - do not treat it as a template for every
  future gate's permanent test suite, only for the conversion pull request itself

---

## What this scout did NOT cover

- Did not read tooling/src/verify/contract/fact.ts (defineFact itself) in full - cited its consumers
  instead; a lane converting a NEW fact provider should read it before copying schema-fact.ts's shape.
- Did not verify conversion status of the no-inline-union-redecl / tooling-argv-front-door three-way splits
  named in the design doc's ruling table (item 7 above) - the table states the ruling, not landed status.
- Did not read ui-exports-map-complete.ts in full (186 lines) - used server-layout.ts instead as the
  cleaner resource exemplar; only skimmed enough to confirm both are converted and resource-shaped.
- Did not locate a dedicated test file for no-array-literal-querykey.ts, the spacing-tier pair, or
  server-layout.ts specifically - confirmed only that their proofs run through family/whole-corpus
  conformance, not that no test exists; a lane should re-grep before assuming.
- Searched only tooling/src/verify/gates/\*.ts (146 files carry defineGate, not the brief's stated 135 -
  re-derive the exact in-scope count with the gate-contract census before treating either number as
  current) and tests/tooling/\*\*; did not run any pnpm command per the hazards list.
- Language: all cited files are .ts (ast-grep language ts); no .tsx gate modules were found or needed.
