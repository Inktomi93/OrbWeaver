---
kind: review
status: active
updated: 2026-09-06
---

# Ordinary simple-visitor wave conversion for #1584

Lane `cb-ordinary-visitors`, based at `0c7bc1eca`. Ten legacy simple-visitor gates are now fifteen final
`defineGate` policies. Five gates split, in every case because the final contract gives one policy ONE
authority, ONE execution and ONE population, and the legacy module carried two of something.

Every one of the ten stood on a SPELLING where its law is an IDENTITY, or on a hand-rolled exemption table
where the final runtime owns liveness centrally. Each conversion keeps the identity claim honest with a
counterfactual that shares the spelling and differs only in the thing that matters.

## Disposition

| Legacy id | Final policy | Authority / severity | Family | Execution | Identity mechanism | Grant rows | Markers |
| - | - | - | - | - | - | -: | -: |
| `no-inline-types` | `no-inline-types` | ordinary / error | `no-inline-types` | selected-files | module-member origin through the `zod` door | 0 | 5 translated |
| ″ (interface arm) | `no-inline-domain-interface` | ordinary / error | `no-inline-types` | selected-files | authored syntax (an `export` cannot be aliased) | 0 | 0 |
| `no-raw-egress` | `no-raw-egress` | reviewed-grant / error | `no-raw-egress` | entire-population | ambient global + the shared receiver-axis reader | 8 | 0 |
| ″ (proxy arm) | `no-rejected-cors-proxy` | hard / error | `no-raw-egress` | selected-files | a literal, by law | 0 | 0 |
| `no-untyped-soft-ref` | `no-untyped-soft-ref` | reviewed-grant / error | `drizzle-schema` | entire-population | `drizzleSchemaFact` builder/FK/primary-key resolution | 6 | 0 |
| `persistence-boundary` | `persistence-boundary` | reviewed-grant / error | `persistence-boundary` | entire-population | ambient global + the shared receiver-axis reader | 4 | 0 |
| ″ (registry arm) | `persisted-store-registry` | hard / error | `persistence-boundary` | entire-population | project-home origin of the two factories | 0 | 0 |
| `plugin-dump-guard` | `plugin-dump-guard` | hard / error | `plugin-dump-guard` | entire-population | type-member origin in `quickjs-emscripten-core` | 0 | 0 |
| `registry-assembly-at-door-only` | `registry-assembly-at-door-only` | ordinary / error | `registry-assembly-at-door-only` | entire-population | project-home origin of the two factories | 0 | 0 |
| ″ (`register()` arm) | `no-mutating-register-api` | ordinary / error | `registry-assembly-at-door-only` | selected-files | the NAME, by law (§5 rule 1) | 0 | 0 |
| `untrusted-regex-safe-exec` | `untrusted-regex-safe-exec` | hard / error | `untrusted-regex-safe-exec` | entire-population | sealed origin in the server regex kit | 0 | 0 |
| `zod-modern-spellings` | `zod-modern-spellings` | ordinary / error | `zod-modern-spellings` | selected-files | module-member origin through the `zod` door | 0 | 0 |
| ″ (`error.issues` arm) | `zod-error-issues-home` | reviewed-grant / error | `zod-modern-spellings` | entire-population | type-member origin declared by the `zod` package | 8 | 1 deleted |
| `empty-state-has-action` | `empty-state-has-action` | ordinary / error | `empty-state-has-action` | selected-files | sealed origin of the `@orb/ui` primitive | 0 | 20 minted |
| `no-raw-interactive-intrinsics` | `no-raw-interactive-intrinsics` | reviewed-grant / error | `no-raw-interactive-intrinsics` | entire-population | none — a JSX intrinsic IS its spelling | 1 | 0 |

**Twenty-seven grant rows, twenty-five ordinary waivers, zero baselines, zero gate-local exemption tables**
except the two the exception census classifies as AUTHORITATIVE DATA (`DEVICE_LOCAL_REGISTRY`'s fourteen
§12.1 rulings, which stay in `persisted-store-registry` as typed rows carrying their `why`, exactly like
`ownerid-registry`'s classifications).

## The five splits, and why each was forced

1. **`no-raw-egress` → + `no-rejected-cors-proxy`** — AUTHORITY. Raw `fetch` has eight reviewed homes;
   `corsproxy.io` has none and never can (D61 ruled it out), so it is `hard` with no suppression door.
2. **`persistence-boundary` → + `persisted-store-registry`** — AUTHORITY. The six raw-storage file rows are
   recurring PERMISSIONS (reviewed-grant); the persisted-store registry is authoritative §12.1 data whose
   escape is re-deciding the ruling (hard).
3. **`registry-assembly-at-door-only` → + `no-mutating-register-api`** — POPULATION. The assembly rule
   subtracts the door (`main.tsx` plus every `compose/` module); the `register()` ban applies INSIDE those
   files too. Folding them would have blinded the ban in exactly the modules that register the most.
4. **`zod-modern-spellings` → + `zod-error-issues-home`** — AUTHORITY. Three spelling arms are ordinary
   respellings; the `error.issues` arm's survivors are standing model-facing/structural permissions.
5. **`no-inline-types` → + `no-inline-domain-interface`** — POPULATION. Legacy judged exported interfaces
   only under `packages/server/src/domain/**` while judging type aliases across the corpus.

**Two census-directed splits were REFUSED, with receipts.** The manifest asked for
`plugin-dump-guard` → guard + subject-health and `untrusted-regex-safe-exec` → unsafe-value + subject-health.
Both arms of each are `hard`/`error`; what forced the split under the legacy runtime was the EXECUTION axis
(a per-node report plus a whole-tree blindness claim). Under the final contract the blindness arm is not a
finding at all: zero measured subjects is a POPULATION RECEIPT of zero, which the runtime refuses as a tool
error. A gate that lost its subject now FAILS THE RUN instead of emitting a finding someone can shrug at,
and a second policy id would only have re-spelled that receipt.

## Population equality, over one frozen 7,262-path candidate manifest

Each legacy `scanRoot` extracted from `0c7bc1eca` and each final `PopulationExpr` through
`compilePopulation`, run over the SAME byte set (the final loader's `searchGlobs` corpus). Eight of the ten
are byte-exact; two carry classified deltas.

| Legacy id | Legacy | Final | Verdict |
| - | -: | -: | - |
| `no-raw-egress` | 1,492 | 1,492 | exact |
| `no-untyped-soft-ref` | 30 | 30 | exact |
| `persistence-boundary` | 1,313 | 1,313 | exact |
| `plugin-dump-guard` | 9 | 9 | exact |
| `registry-assembly-at-door-only` | 1,313 | 1,313 | exact |
| `untrusted-regex-safe-exec` | 34 | 34 | exact |
| `empty-state-has-action` | 621 | 621 | exact |
| `no-raw-interactive-intrinsics` | 621 | 621 | exact |
| `zod-modern-spellings` | 3,381 | 3,375 | classified: −6 |
| `no-inline-types` | 3,198 judged | 3,205 | classified: −3 / +10 |

**`zod-modern-spellings`, six dropped.** Five are package-ROOT and Playwright-harness files
(`packages/client/vite.config.ts`, `packages/db/drizzle.config.ts`, `packages/ui/token-contract.ts`,
`packages/ui/tokens.build.ts`, `packages/ui/tokens.near-duplicate.ts`) that `searchGlobs` adds on top of
`harnessGlobs`; the legacy gate ran on `harnessGlobs`, so they were never in its corpus and the difference
is one of METHOD. The sixth, `packages/showcase-plugins/src/index.ts`, is the one genuine drop — the same
one-file delta `nullable-column-inequality` and `no-await-db-in-loop` recorded, because `@packages` names
the six cake packages and guest showcase code is not one of them. It admits nothing today (the legacy
replay reports zero findings there).

**`no-inline-types`: its `scanRoot` was `() => true`, so the admitted set is not the JUDGED set.** The
type-home decision moved out of the visitor and into the population, so equality was measured against
`scanRoot AND not isTypeHome`, with `isTypeHome` transcribed verbatim from the base commit.

- **Three dropped**: `packages/client/vite.config.ts` and `playwright/index.tsx` are the same
  `searchGlobs`-only measurement artifact; `packages/showcase-plugins/src/index.ts` is the same genuine
  guest-code drop as above.
- **Ten added, and this is an INTENTIONAL CORRECTION of a string accident**: the legacy `/scripts/` clause
  matched exactly ONE directory inside the judged roots — `packages/server/src/domain/regex/verbs/scripts/`,
  the regex SCRIPT library's verbs — and exempted a domain subsystem by pure substring luck. That is
  verbatim the accident #408 fixed when it deleted the `/tools/` clause, and the legacy header's own ruling
  says so: "Do NOT reintroduce a path clause for a subsystem — a tool subsystem is domain code." The repo's
  own `tests/` and `scripts/` TREES are out of the population by root (`@tests`/`@scripts` are not in
  `in:`), so nothing is lost by not reproducing the substring clauses. The ten files carry no exported
  shape today, so the correction adds zero findings; a `mustFlag` row pins it.

## Old/new finding differential — ZERO delta on all ten

**Legacy replay**: the ten descriptors extracted from `0c7bc1eca`, run through the production LEGACY
dispatcher (`runPass` + a project-scope context) over the real 7,256-file harness corpus, 23.6 s wall,
3.5 GB RSS, zero tool errors.

| Legacy id | Legacy findings | Final raw | Final effective | Classification |
| - | -: | -: | -: | - |
| `no-inline-types` | 15 | 20 | **15** | identical set; the 5 extra raw are the translated markers, waived |
| `no-raw-egress` | 0 | 8 | 0 | the 8 the legacy directory ZONES hid, now exact grant rows |
| `no-untyped-soft-ref` | 0 | 6 | 0 | the 6 allowlist pairs, now exact grant rows |
| `persistence-boundary` | 0 | 4 | 0 | 4 of the 6 allowlist files, now exact grant rows |
| `zod-modern-spellings` | 0 | 0 | 0 | — |
| `zod-error-issues-home` | 0 | 8 | 0 | the 7 allowlist files + the 1 marker site, now grant rows |
| `empty-state-has-action` | 0 | 20 | 0 | the 16 allowlist files' 20 occurrences, now markers |
| `no-raw-interactive-intrinsics` | 0 | 1 | 0 | the shell-tier home, now one exact grant row |
| every other policy | 0 | 0 | 0 | — |

The legacy numbers are POST-suppression (the legacy dispatcher honours `@orb-gate-ignore`), which is why
`no-inline-types` reads 15 there and 20 raw here: the same five marked sites, translated.

**Two legacy allowlist rows were DELETED with receipts.** `persistence-boundary`'s
`RAW_STORAGE_ALLOWLIST` licensed the two persist factories themselves
(`create-persisted-store.ts`, `create-entity-draft-store.ts`), and neither performs a licensed operation:
both go through the `durable-local.ts` namespace, which has its own row. A row consumed zero times is
STALE by contract, so copying them would have shipped two dead rows.

## The identity work, per policy

- **`no-raw-egress` / `persistence-boundary`** — the subject is the AMBIENT GLOBAL through
  `resolveGlobalMemberOrigin` plus `readsAmbientGlobalPath`, so `globalThis.fetch`, `globalThis["fetch"]`,
  a stored alias and a structurally cast `globalThis` are all in subject where the legacy identifier-callee
  check saw none of them. A member read whose ROOT is not an ambient global is NOT A SUBJECT — an injected
  port is the testable shape this law wants — which is a different answer from "unproven innocence", and
  the prefilter on the api NAME keeps fail-closure inside a candidate set.
- **`no-raw-egress`: a TYPE QUERY is not a call.** Widening the subject from the legacy identifier-CALLEE
  to every reference named `fetch` reported `agent-sdk/host-token.ts`'s
  `readonly fetch?: typeof fetch` on the first real pass — a port DECLARATION, which is the fix, not the
  hole. Excluded with its own proof row, next to the existing `typeof` capability probe.
- **`no-untyped-soft-ref`** — builder, `.references()` and `.primaryKey()` come from the shared
  `drizzleSchemaFact` rather than from `chainRoot` text and `.includes(".references(")` probes, so the
  imported-columns object (#945) and the shorthand member (#1035) carry the same obligation by resolution.
- **`plugin-dump-guard`** — `ctx.dump` is the METHOD declared by the installed `quickjs-emscripten-core`
  package, read off the receiver's TYPE, and `handleSafeToDump` is the membrane's OWN declaration. The
  legacy check accepted any property named `dump` on anything and any callee named `handleSafeToDump`, so a
  host-side `logger.dump(x)` in the membrane would have been judged as a guest materialization and an
  imported same-named guard would have satisfied it. Both counterfactuals have proof rows.
- **`untrusted-regex-safe-exec`** — the watchdog factory is the exported declaration in
  `server/src/kit/regex`, so an alias, a namespace member and a re-export are the same composition. Legacy
  asked TWO text questions (the callee's text AND an import declaration whose specifier was literally
  `#kit/regex`), either of which a rename or a barrel hop answered wrongly in both directions; a `mustPass`
  row proves a safe aliased composition that legacy would have RED.
- **`zod-modern-spellings` / `no-inline-types`** — every arm resolves its callee through the `zod` door, so
  `import * as zod`, `import { union }` and an aliased `import { z as s }` are the same call while a
  project object spelled `z` is not.
- **`zod-error-issues-home`** — a genuine WIDENING: the subject is the `issues` property declared by the
  installed zod package, read off the receiver's type, so a `ZodError` bound under any name is judged where
  legacy required a receiver spelled `error`.
- **`empty-state-has-action`** — the canonical `@orb/ui` primitive through the sealed-origin reader, and
  the PAIRED `<EmptyState></EmptyState>` spelling is newly in subject (legacy subscribed only to
  self-closing tags).
- **`no-raw-interactive-intrinsics` resolves NOTHING, deliberately.** A lowercase JSX tag is the DOM
  element by language rule; it cannot be aliased, re-exported or shadowed by a project component. The
  identity IS the spelling here, and the module says so rather than performing a resolution that could only
  ever agree.

## Two rulings recorded rather than silently taken

1. **A structural class the LAW names is population; an enumerated permission is a grant.** The design's
   "sanctioned homes remain exact reviewed grants, not population subtraction" is about homes someone
   REVIEWED. `no-inline-types`'s type homes (`contract/` directories, four whole packages, the client
   data/forms/state/lib tiers) and `registry-assembly-at-door-only`'s door (`main.tsx` plus any `compose/`
   module) are neither: they are classes the law defines, and writing them as grants would RED every new
   `contract/` directory and every new compose module — the exact opposite of the rule. Both are
   `notUnder`, which is the census's own reservation ("current test/spec population exclusions remain
   population algebra where they define the policy's subject").
2. **`empty-state-has-action`'s sixteen path rows became TWENTY per-occurrence markers, not sixteen file
   grants.** The census offers both arms and rules out copying the file rows verbatim, because a file row
   suppresses every matching occurrence in that file including tomorrow's. A grant needs a stable
   per-occurrence SUBJECT and none exists (a title is often an expression, an index moves on the next
   edit), so the ordinary marker is the exact instrument: it lives AT the occurrence and consumes exactly
   one finding. FOUR files had two dead ends each riding one row — `section-placeholder.tsx` (the weave and
   icon arms), `variant-wire-viewer.tsx`, `databank-context-body.tsx` and `databank-detail-surface.tsx` —
   and each is now two decisions.

## The marker-carrier lesson this wave paid for

Four of the twenty `empty-state-has-action` markers were first authored as JSX-EXPRESSION comments
(`{/* … */}`) in a children list that also had a PRECEDING significant sibling. A JSX-expression marker
binds to its adjacent children on BOTH sides, so the engine called the carrier AMBIGUOUS and it suppressed
nothing — measured on the real pass, not assumed. They were re-homed to a `//` marker above the enclosing
`return (`, whose carrier is the statement and contains exactly one of this policy's findings. The other
three JSX-expression markers, where the EmptyState is the first significant child, bind correctly and stay.

## Real-tree final pass

`runPolicyPass` over `getWorkspace({root, types: true})`, ALL 124 loaded final policies as `knownPolicies`
(a hand-picked roster manufactures unknown-policy waiver alarms), the fifteen selected, and
`reviewedGrantsFor(policies)`:

- 7,263 loaded sources; 4.5 s workspace + 23.3 s pass = **27.8 s wall, 3,978,028 KiB peak RSS** on the
  quieter of two runs. The same selection re-measured on the committed tree under a busier box cost
  **38.9 s wall at 3,985,636 KiB** — identical verdict, flat RSS. The cost is a RANGE under box load, as
  every previous wave recorded; only the RSS is stable enough to compare directly;
- 15/15 owners `success`, **nothing withheld**, zero fact errors, zero policy tool errors, zero authority
  tool errors, **zero authority alarms**;
- **raw 67 = waived 25 + granted 27 + effective 15**; every one of the 27 grant rows consumed EXACTLY once,
  every one of the 25 waivers consumed exactly once;
- `drizzleSchemaFact` is shared with the already-converted `drizzle-schema` family and ready over its exact
  30 files.

Per-policy cost is concentrated where the population is: `persisted-store-registry` 5.3 s over 1,313 files,
`zod-error-issues-home` 2.8 s over 3,375, `zod-modern-spellings` 1.5 s over 3,375. **The prefilter lesson
repeated itself**: `persisted-store-registry` first measured **59.1 s** because it resolved a project-home
origin for every CallExpression in the client tree. Adding the shared `referenceNamesExport` name prefilter
— the same one that makes fail-closure honest — took it to 5.3 s with an identical verdict.

## Open findings this conversion surfaced

**`no-inline-types`, 15 effective, all in `tooling/src/verify/lib/**`.** These are the #1584 program's OWN
shared readers exporting type aliases outside a type home: `ambient-determinism.ts:27`,
`bus-fact-read.ts:273,380`, `drizzle-client-call.ts:13`, `ledger-banned-shapes.ts:62,63`,
`policy-pass-context.ts:40,45`, `project-home-origin.ts:37`, `react-origin.ts:31,147`,
`registry-definition-home.ts:20`, `role-vocabulary.ts:103`, `sealed-origin.ts:14`,
`test-runner-door.ts:20`.

**They are PRE-EXISTING, not introduced here**: the legacy replay reports the same fifteen sites at the same
lines from the base commit's own descriptor. They have been invisible only because `check:structure` is
skipped by owner directive while the corpus converts. `verify/contract/` is the tool's type home and
already carries the siblings of several of these (`contract/reference-fact.ts`,
`contract/type-member-origin.ts`), so the fix is a move rather than a design question.

They are deliberately **UNWAIVED** — a waiver here would be a `// TODO` wearing a marker — and deliberately
**UNFIXED by this lane**: moving them re-homes public reader APIs across twelve files, two of which
(`bus-fact-read.ts`) are in a sibling lane's live diff. **This needs its own row.**

## Verification

| Check | Result |
| - | - |
| family conformance (`tests/tooling/verify/gates/ordinary-visitors-family.test.ts`) | green — 15 policies, 126 proofs, 14 tests, 2.1 s |
| fixture-resolution control (every relative specifier in every proof of this wave) | zero dangling, visited-count derived from the descriptors |
| receipt refusals (4) + ordinary marker identity (3) + grant liveness (4) | pinned through `runPolicyPass` in the same file |
| population equality over a frozen 7,262-path manifest | 8 exact, 2 classified |
| legacy replay + final real-tree pass | zero finding delta on all ten; see above |
| tooling type program (`ts7.cjs -p tooling/tsconfig.json`) | green |
| client / server / contracts package programs | green |
| scoped biome + eslint over the full base-to-tip changed-file set | green |
| both line-coupled ledgers | re-derived and fresh |
| the fifteen `Core-Enforcement-Active-Gates.md` rows | authored for the CUTOVER rewrite — today's `enforcement-registry-parity` cannot read a final policy, so they are inert to it (see the limit below) |

## Known limits, written down

- **The enforcement-document rows are INERT to `enforcement-registry-parity` today, and that is program-wide
  pre-existing debt rather than this wave's.** That gate reads `name` and `status` off an OBJECT-LITERAL
  `gate` initializer (`gates/enforcement-registry-parity.ts:199-210`), so a `defineGate({…})` call
  initializer yields no descriptor and EVERY final policy is invisible to it: at the base commit it
  measures 108 findings (107 orphan rows plus the "declares 255 / there are 155" count line) and at this
  tip 123 (+15 orphans, 145 registered). The rows here are authored for the cutover rewrite of that gate,
  which is when the roster becomes loader-derived; the branch's own
  `enforcement-registry-parity.int.test.ts` is red for the same reason and belongs to the legacy-loader
  known-red set. Measured and confirmed by a fresh-context verifier on this branch.

- **`no-inline-types`'s schema arm is NOT fail-closed.** Its population is every exported const in three
  roots, so reporting each factory-named call whose origin cannot be read would accuse the whole unreadable
  tail rather than a bounded candidate set. An unreadable `makeSchema.object({})` passes; the type-alias
  arm carries the law where a schema read cannot place the call. Its own `mustPass` row says so.

- **`no-raw-egress` / `persistence-boundary` are precise only where the ROOT resolves**, which on this
  DOM-less analysis program means `globalThis`. A bare `fetch(url)` or `window.localStorage` lands on the
  fail-closed UNREADABLE finding — still reported, never silently passed, but without the precise message.
  Each spelling carries its own proof row.

- **`no-raw-egress` reports an IMPORTED binding named `fetch`** (a polyfill, `undici`) as a finding, which
  is what legacy did through its identifier-callee check. A parameter or local named `fetch` now PASSES,
  which legacy reported — a declared narrowing with its own row, because an injected reader is the testable
  shape.

- **`plugin-dump-guard`'s ordering analysis is unchanged** and remains shallow: the guard must precede the
  dump STATEMENT in the same helper body, and "every unsafe path exits" is the same structural walk legacy
  used. Nested control flow beyond an if/else pair is out of its reach, as before.

- **`empty-state-has-action` still treats a SPREAD attribute as satisfying the rule.** A spread may carry a
  conditional `action` no static read resolves, and accusing it would demand a fix for something that may
  already be correct.

- **`zod-modern-spellings` ARM A stays narrow**: the `.strict()` receiver must be the `object(…)` call
  itself, because `.strict()` on a schema VARIABLE has no `z.strictObject` respelling and flagging it would
  demand a fix that does not exist.

- **`no-untyped-soft-ref` reads the JS key**, exactly as D24 states it; a column named `widget_id` whose JS
  key is not `*Id` is outside the subject, and an id-shaped column built by something other than
  `text`/`integer` is a different shape.
