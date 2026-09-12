---
kind: review
status: active
updated: 2026-09-11
---

# v-exemplar-audit — the ten cited exemplars against §5b PRISTINE (#1584)

Read-only adversarial audit of the full exemplar set named by
[`exemplars-2026-09-11.md`](exemplars-2026-09-11.md), held to
[`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven criteria and §4's
proof rules. Every number below came out of a run produced in this session, in an isolated worktree at
`0bada5a3b`; nothing is quoted from a lane report or from the exemplars document. All probes were
`cp f f.v-ea-bak` … `mv f.v-ea-bak f` inside this worktree — never `git stash`/`checkout`/`restore` — and
`git status --short` was EMPTY after every one of the nine probe rounds.

**The bar was not "does it pass."** `check:policy-conformance` is at **0 failures, exit 0** before and after
this audit and stays there through every defect below.

## Headline

**The set is NOT copyable as it stands.** One module of ten survives the sentence *"point a conversion lane
at this and tell it to copy."* Twelve of thirty narrowings are UNENFORCED (40%, against the corpus's prior
~1-in-5 rate), and the two modules the exemplars document certifies "Wart: none found" — `server-layout` and
`no-raw-matchmedia` — carry the worst of them, including a guard that **cannot execute** and a documented
behaviour that **does not happen**.

| # | Module | Verdict |
| -: | - | - |
| 1 | `no-array-literal-querykey` | **REFUTED** — `fix` names no waiver spelling; the `queryKey` name fence is unenforced |
| 2 | `spacing-tier-home-health` | **REFUTED (minor)** — population fence unenforced; carries a legacy `ExemptionTable` (#1922) |
| 3 | `no-raw-spacing-in-features` | **REFUTED** — two sub-narrowings inside the repaired carrier fence are still unenforced; roster row is a bare pre-conversion label |
| 4 | `server-layout` | **REFUTED (severe)** — `mustFlag[0]` tolerates **8** findings from two arms; the cited not-ready guard is UNREACHABLE; "Wart: none found" is false |
| 5 | `schema-branding` | **REFUTED (minor)** — three arm narrowings unenforced; roster row is a bare label. Its `messageIncludes` discrimination is the corpus's correct shape and is PROVEN |
| 6 | `no-raw-matchmedia` | **REFUTED (severe)** — four unenforced narrowings, a fail-closed arm no row exercises, and a DECLARED LIMIT that is false in module header, two row `why`s and the enforcement roster |
| 7 | `no-inline-types` | **REFUTED** — `fix` names no waiver spelling; the `zod` door and 7 of 10 population clauses are unenforced |
| 8 | `no-raw-typography-in-features` + `-health` | **REFUTED** — byte-for-byte the same defects as #3 / #2 |
| 9 | `user-bus-deferred-member` | **CONFIRMED** (one nit: the inert `ext: ["ts","tsx"]`, #1959) — the only module here I would tell a lane to copy |
| 10 | `ui-exports-map-complete` | **REFUTED** — `messageIncludes: "not"` discriminates nothing; a `mustFlag` with no `count`; the same unreachable guard; its roster row declares an arm A4 the module does not have |

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline) | `167 final policies · 1659 proof rows · 0 failure(s) · 105 grant rows (whole table) · 0 invalid · 12454ms (corpus: 271 module(s), 104 legacy proven by gate-conformance)`, **exit 0**. Identical to the brief's headline |
| `pnpm check:policy-conformance` (after all nine probe rounds) | same line, **exit 0** — restored |
| `pnpm gate:contract` | `762 finding(s) across 271 gate module(s)`, exit 1 (the legacy corpus). Total did not rise. **ZERO findings naming any of the eleven subject modules** (grep count 0 over the 765-line log) |
| `pnpm test:scoped tests/tooling/verify/gates/` | 57 files, 399 tests, **393 passed / 6 failed**, 241.9 s — triaged below. Every family test covering a subject PASSED |
| quiet re-run `drizzle-registry-conversion.test.ts` | **3/3 PASS, exit 0, 4.4 s** — the two failures above were 5 s contention timeouts |
| 9 `cp`/`mv` probe rounds (30 narrowing cuts, 4 dead-position controls, 8 expectation rewrites, 2 resource-absence probes) | each restored; `git status --short` EMPTY after every round |

`pnpm exec biome` / `pnpm typecheck` were **not** run: this lane wrote one markdown file and modified no
tracked code. `pnpm check:docs` was run scoped for that file.

## MANDATORY SWEEP A — the §4.1 narrowing cut table

Method, per §4.1: `cp` the module, cut the narrowing so the policy flags MORE, run every declared row through
the production conformance door, `mv` back. A cut that kills no row means the narrowing is UNENFORCED.

| Module | Narrowing (`path:line`) | Cut | Row that died | Verdict |
| - | - | - | - | - |
| `no-array-literal-querykey` | `node.getName() !== "queryKey"` (:32) | flag every `PropertyAssignment` | — | **UNENFORCED** |
| `no-array-literal-querykey` | `population: "@client"` (:20) | `["@client","@server"]` | — | **UNENFORCED** |
| `no-array-literal-querykey` | `unwrapExpression(...)` (:35) — a WIDENING, control | remove the unwrap | `mustFlag[1]` | enforced (control bites) |
| `spacing-tier-home-health` | real-tree ANCHOR self-guard (:31) | `if (false)` | `mustPass[1]` (`PASS TOOL ERROR … finding file is outside the effective population`) | ENFORCED |
| `spacing-tier-home-health` | `population: ["@client","@ui"]` (:22) | `+ "@server"` | — | **UNENFORCED** |
| `no-raw-spacing-in-features` | `sanctionedHome(...) !== undefined` (:83) | `if (false)` | `mustPass[0]` | ENFORCED |
| `no-raw-spacing-in-features` | `inClassCarrier(node)` (:87) | — | `mustPass[2]` (per the module's own re-verified header) | ENFORCED |
| `no-raw-spacing-in-features` | `jsxAttr.getNameNode().getText() === "className"` (:55) | any JSX attribute | — | **UNENFORCED** |
| `no-raw-spacing-in-features` | `CLASS_COMPOSERS.has(...)` (:59) | any call expression | — | **UNENFORCED** |
| `no-raw-spacing-in-features` | `population: ["@client","@ui"]` (:67) | `+ "@server"` | — | **UNENFORCED** |
| `server-layout` | `!relative.includes("/")` (:19) | drop it | `mustFlag[1]` + `mustPass[0]` (6 spurious findings) | ENFORCED |
| `server-layout` | `entry.path.startsWith(\`${SERVER_SOURCE}/\`)\` (:15) | `if (false)` | — | **UNENFORCED** |
| `server-layout` | `tree.status !== "ready" \|\| metadata.status !== "ready"` (:41) | see **D4** | **UNREACHABLE** | **DEAD CODE** |
| `schema-branding` | `column.primaryKey` (:17) | drop it | — | **UNENFORCED** |
| `schema-branding` | `column.identity.propertyName === "id"` (:17) | drop it | — | **UNENFORCED** |
| `schema-branding` | `parentBrand === null \|\|` (:33) | drop it | — | **UNENFORCED** |
| `no-raw-matchmedia` | `resolveModuleMemberOrigin(node).kind === "resolved"` → `"other"` (:105) | `if (false)` | — | **UNENFORCED** |
| `no-raw-matchmedia` | `isExpressionReference(node)` (:133) | drop it | — | **UNENFORCED** |
| `no-raw-matchmedia` | `memberPath.length === 0` (:101) | drop it | — | **UNENFORCED** |
| `no-raw-matchmedia` | `isCapabilityProbe(node)` (:133) | drop it | — | **UNENFORCED** (and `mustPass[1]` is the row whose `why` claims it — see **D6**) |
| `no-raw-matchmedia` | `classifyOriginRefusal(...)` fail-CLOSED verdict (:108) | `return "other"` (fail open) | — | **UNENFORCED — the arm is exercised by no row at all** (see **D5**) |
| `no-raw-matchmedia` | `readsAmbientGlobalPath(...)` (:96) | `if (false)` | `mustFlag[4]` (the cast dodge) | ENFORCED |
| `no-raw-matchmedia` | `verdict === "other"` early return (:137) | — | not cut; `mustPass[2]`/`[3]` are its declared rows | NOT EVALUATED |
| `no-inline-types` | `doors.has(ZOD_DOOR)` (:70) | drop it | — | **UNENFORCED** |
| `no-inline-types` | `ZOD_FACTORIES.has(terminal)` (:70) | — | not cut; `mustPass[5]` (`z.string()`) is its declared row | NOT EVALUATED |
| `no-inline-types` | TypeAlias `node.hasExportKeyword()` (:76) | drop it | `mustPass[1]` | ENFORCED |
| `no-inline-types` | VariableStatement `node.hasExportKeyword()` (:79) | drop it | — | **UNENFORCED** |
| `no-inline-types` | `notUnder` `forms/**` · `state/**` · `lib/**` · `server/src/kit/**` + ALL `notNamed` (:104-112) | repoint to dead paths | — | **UNENFORCED** (only `**/contract/**`, `tooling/src/_shared/**`, `client/src/data/**` have rows) |
| `no-raw-typography-in-features` | the four narrowings mirrored from `no-raw-spacing-in-features` | same cuts | `mustPass[0]` only | **same result: 3 of 4 UNENFORCED** |
| `typography-tier-home-health` | ANCHOR guard · population | same cuts | `mustPass[1]` · — | ENFORCED · **UNENFORCED** |
| `user-bus-deferred-member` | `bus.emitters.some(...)` (:80) | `if (true)` | `mustPass[0]` + `mustPass[1]` | ENFORCED |
| `user-bus-deferred-member` | `deferralsFor` union filter (:45) | — | pinned in `bus-pair.test.ts` with a planted second bus | ENFORCED (by pin) |
| `ui-exports-map-complete` | `files.has(topIndex)` top-module short-circuit (:40) | `if (false)` | `mustPass[2]` | ENFORCED |
| `ui-exports-map-complete` | `!path.includes("/")` (:30) | drop it | `mustFlag[0,1,3]` + `mustPass[0,1]` | ENFORCED |
| `ui-exports-map-complete` | `target.startsWith("./") && target.length > 2` (:54) | always resolve | — | **UNENFORCED** |
| `ui-exports-map-complete` | the not-ready guard (:104) | see **D4** | **UNREACHABLE** | **DEAD CODE** |

**12 UNENFORCED of 30 cut** (2 more are dead code, 3 not evaluated). Every one owes a `mustPass` row placing
the same subject OUTSIDE the fence.

## MANDATORY SWEEP B — the expectation rows (#1968)

`expectationFailure` read off the source: `count` compares `findings.length` EXACTLY
(`ops/policy-conformance.ts:195`); `line`/`token`/`messageIncludes` run through `findings.some(...)`
(`:204-211`), so any one match satisfies the row.

33 `mustFlag` rows across the ten subjects. **Two carry no `count`** — exactly the two the brief predicted.

| Module · row | Declared `expect` | Derived count | Discriminator verdict |
| - | - | -: | - |
| `no-array-literal-querykey` mF0 | `{count:1, token:"queryKey"}` | 1 | `token` is a policy-supplied CONSTANT (`token:"queryKey"` at `:36`) — discriminates nothing; `count` carries the row |
| `no-array-literal-querykey` mF1 | `{count:2}` | 2 | `count` is the claim; fine |
| `spacing-tier-home-health` mF0 | `{count:1, messageIncludes:"stale SANCTIONED-HOME row"}` | 1 | **TAUTOLOGY** — one `report.file` call, one message template; matches every finding the policy can emit. `count:1` carries it |
| `no-raw-spacing-in-features` mF0/mF1 | `{count:1, token:'"p-4"'}` / `{count:1, token:'"gap-2"'}` | 1 / 1 | `token` is `node.getText()` — genuinely per-finding. **Correct shape** |
| `server-layout` mF0 | `{messageIncludes:"illegal top-level entry"}` — **NO COUNT** | **8** | See **D1**. `messageIncludes` does discriminate (2 message shapes), but 7 of the 8 findings come from the OTHER arm |
| `server-layout` mF1 | `{count:1, messageIncludes:'"kit" is required'}` | 1 | discriminates |
| `schema-branding` mF0/mF1/mF2 | `{count:1, token, messageIncludes}` ×3 | 1 each | **PROVEN discriminating** — transplanting mF2's `"but its parent"` onto mF0 fails the row. This is the legitimate shape §4.1 describes |
| `no-raw-matchmedia` mF0 | `{count:1, token:MATCH_MEDIA}` | 1 | `token` is a CONSTANT (`:145`) — discriminates nothing |
| `no-raw-matchmedia` mF1..mF7 | `{count:1}` ×7 | 1 each | no discriminator beyond count, in a module with **two** message shapes; rows 5 and 6 make message-class claims nothing pins — see **D5/D6** |
| `no-inline-types` mF0..mF6 | `{count:1, token:"Foo"}` ×7 | 1 each | `token` is derived per finding (the declared name) but is literally `"Foo"` in all seven fixtures. `count` carries |
| `no-raw-typography-in-features` mF0/mF1 | `{count:1, token:'"text-sm"'/'"text-xl"'}` | 1 / 1 | correct shape |
| `typography-tier-home-health` mF0 | `{count:1, messageIncludes:"stale SANCTIONED-HOME row"}` | 1 | **TAUTOLOGY**, as its twin |
| `user-bus-deferred-member` mF0 | `{count:1, messageIncludes:"deferral is retired"}` | 1 | **TAUTOLOGY** (one `report.node`, one MESSAGE) — `count` carries |
| `ui-exports-map-complete` mF0 | `{count:1, messageIncludes:"no entry at all"}` | 1 | discriminates |
| `ui-exports-map-complete` mF1 | `{count:1, messageIncludes:"not"}` | 1 | **DOES NOT DISCRIMINATE** — see **D3** |
| `ui-exports-map-complete` mF2 | `{messageIncludes:"has no index.ts"}` — **NO COUNT** | **1** | count is benign here, but §4.1 says name it always |
| `ui-exports-map-complete` mF3 | `{count:1, messageIncludes:"does not exist"}` | 1 | discriminates |

### §4.2 positive identity arms — all four in-module arms DISCRIMINATE

Flipping each arm's marker position to a dead token in a `cp`-backed copy, with `authorityAlarms` asserted
first by the runner's own ordering (`toolFailure` at `:163` precedes the arm verdict at `:227`):

```
✗ no-array-literal-querykey · mustPass[4]
    AUTHORITY ALARM [ordinary-waiver] … packages/client/src/features/a/data.ts:1:1 names a dead position
✗ no-raw-spacing-in-features · mustPass[3]
    AUTHORITY ALARM [ordinary-waiver] … packages/client/src/test.tsx:1:1 names a dead position
✗ no-raw-typography-in-features · mustPass[3]
    AUTHORITY ALARM [ordinary-waiver] … packages/client/src/test.tsx:1:1 names a dead position
✗ schema-branding · mustPass[2]
    AUTHORITY ALARM [ordinary-waiver] … packages/db/src/schema/plain.ts:3:3 names a dead position
```

`no-inline-types`'s arm is the family-test shape (`ordinary-visitors-family.test.ts:187-195`, asserting
`effectiveFindings === []`, `waivedFindings` length 1, `authorityAlarms === []`), with the dead-position
negative immediately after at `:197-204`. **All five ordinary policies satisfy §4.2.** That is the one
criterion the whole set passes cleanly.

## DEFECTS

### D1 — `server-layout` `mustFlag[0]` tolerates 8 findings from two arms (HIGH; the doc's "minimal clean version")

`tooling/src/verify/gates/server-layout.ts:65-74`. The fixture supplies one stray file and **no tiers**, so
the missing-tier loop (`:54-62`) fires seven times alongside the one illegal-entry finding. Derived by
planting `count: 99` and reading the runner back:

```
✗ server-layout · mustFlag[0] · a stray server-root file is outside the six tiers plus index.ts
    expected effective finding count=99 but got 8
```

The row's `why` claims one thing; eight things happen, seven of them from the arm `mustFlag[1]` exists to
prove. Per §4.1 the fix is **both** a `count` and a tightened fixture that isolates the arm the `why` names
(add the six tiers plus `index.ts` beside the stray file).

### D2 — `no-raw-matchmedia`'s DECLARED LIMIT is false, in three places at once (HIGH; the doc's strongest exemplar)

`no-raw-matchmedia.ts:92-95` (header), `:204` and `:212` (two `mustFlag` `why` strings), and
`docs/architecture/core/Core-Enforcement-Active-Gates.md:286` (the roster row) all state that
`window.matchMedia` / `self.matchMedia` / a bare `matchMedia(q)` "land on the FAIL-CLOSED unreadable finding"
because those are DOM-lib declarations the analysis program does not load, and that "only the `globalThis`
root gets the precise message".

Measured. Transplanting `messageIncludes: "CANNOT be established"` (the UNREADABLE text, `:43`) onto
`mustFlag[5]` (bare) and `mustFlag[6]` (`window.`):

```
✗ no-raw-matchmedia · mustFlag[5] … expected one effective finding matching
    messageIncludes="CANNOT be established" but no single finding matched
✗ no-raw-matchmedia · mustFlag[6] … (same)
```

Transplanting the PRECISE text (`"outside the named media-query one-homes"`) onto the same two rows plus the
cast row instead: **exit 0, 0 failures.** Both spellings carry the precise message. And cutting
`readsAmbientGlobalPath` (`:96`) to `false` kills only `mustFlag[4]`, so rows 5 and 6 do not even reach the
receiver rule — they resolve through `resolveGlobalMemberOrigin` to `"global"`.

`mustFlag[6]`'s `why` is self-refuting: it says the row is "pinned separately so a future DOM-aware program …
shows up here as a message change rather than as a silent one." With no `messageIncludes`, a message change
cannot show up there at all — and the message it promises is not even the one it gets today.

Scope of my claim: proven in the conformance runtime, the only runtime these rows execute in. Real-tree
behaviour is UNMEASURED by me (see "what I did not cover").

> **AMENDED 2026-09-12 by the fix lane `p-matchmedia-exemplar` (`b157bb9be`) — the FINDING stands, the
> MECHANISM above is WRONG, and the unmeasured half is now measured AGAINST the module.**
>
> This section explains the false limit as *"DOM-lib declarations the analysis program does not load"*. It
> does load them. Both live loaders construct ts-morph with **no `compilerOptions`** —
> `lib/pass.ts`'s `projectCtx` → `_shared/ts-workspace.ts:62` `new Project({ skipAddingFilesFromTsConfig: true })`,
> and `ops/policy-conformance.ts:264`'s virtual project the same way — so the **DEFAULT lib applies, and the
> default lib includes DOM**. Driven through `runPolicyPass` on that exact construction,
> `globalThis` / `window` / `self` / bare all resolve **PRECISE**.
>
> So the limit is false in the **live runtime too**, not only in conformance. The "real-tree behaviour is
> UNMEASURED" caveat resolves against the module, not for it.
>
> The limit is *conditionally* true of a DOM-less program: built with the root `tsconfig.json`
> (`lib: ["es2025","esnext.disposable","esnext.temporal"]`), `window`/`self`/bare go UNREADABLE while
> `globalThis` stays PRECISE because it is checker-intrinsic. That residue is now pinned in
> `home-client-family.test.ts` with an explicit `compilerOptions.lib`, with a default-lib control arm beside it.
>
> **The generalisable rule, and it is why this amendment exists:** a gate claiming *"the analysis program
> cannot see X"* is asserting a property of the **LOADER**, not of the tree — measure it by driving
> `runPolicyPass` over the exact construction before writing it into a header, a `why`, and the enforcement
> roster. This one was wrong in all three for the corpus's most-cited exemplar. And a `lib`-dependent verdict
> **cannot be pinned by a proof row at all** (`mode: "types"` gives the row no say over `lib`), so it belongs
> in a family test or it is unpinnable and must say so.

### D3 — `ui-exports-map-complete` `mustFlag[1]`'s sole discriminator matches a different arm (MEDIUM)

`ui-exports-map-complete.ts:130` — `expect: { count: 1, messageIncludes: "not" }`. The wrong-target message
(`:66`) reads `… exports has "…", not "…" for "…"`, but the dead-target message (`:79`) reads
`… points at "…", which does not exist.` — which also contains `not`.

Reproduction: transplant `messageIncludes: "not"` onto `mustFlag[3]` (the dead-target row) and run. **exit 0,
0 failures** — the discriminator matches the other arm's message, so it discriminates nothing. `count: 1`
is doing all the work.

### D4 — a guard the exemplars document cites as the refusal mechanism CANNOT EXECUTE (HIGH)

`server-layout.ts:41-43` and `ui-exports-map-complete.ts:104-106`:

```ts
if (tree.status !== "ready" || metadata.status !== "ready") {
  return;
}
```

`exemplars-2026-09-11.md` §3 makes this `server-layout`'s headline virtue: *"the resource-not-ready guard
means a partial or failed resource read withholds rather than reporting half a verdict — exactly the
missing/empty/unresolved-population-refusal standard capability the design doc requires."*

It does not. `resolveResourceDeclarations` (`lib/resource-declaration.ts:182`) **throws** on any non-ready
declared resource during the POPULATION phase, long before `create`/`evaluate` run. Proven by deleting the
`package.json` from one `mustFlag` fixture of each policy:

```
✗ server-layout · mustFlag[0]
    PASS TOOL ERROR [population] resource declaration package-metadata:server is missing:
      resource is absent from the invocation inventory: packages/server/package.json
✗ ui-exports-map-complete · mustFlag[0]
    PASS TOOL ERROR [population] resource declaration package-metadata:ui is missing:
      resource is absent from the invocation inventory: packages/ui/package.json
```

Not a silent green-zero — a population-phase refusal. The guard is unreachable, and it is the wrong shape to
copy twice over: it teaches a lane that a resource policy owns its own withhold, and that the correct
response to a non-ready resource is a **silent return** rather than a refusal. §5b.1 (nothing declared that
is not used) fails on both modules.

Coupled consequence: `Core-Enforcement-Active-Gates.md:111` declares `ui-exports-map-complete` arm
**"A4 no readable `exports` block on a real tree (blindness)"**. The converted module has no A4 — the case is
a tool error from the runtime, is not a finding, and is pinned by no proof row and no `runPolicyPass` pin.

### D5 — `no-raw-matchmedia`'s fail-closed UNREADABLE verdict is exercised by NO row (HIGH)

`no-raw-matchmedia.ts:108` — `return classifyOriginRefusal(global.reason, node);`. Replace it with
`return "other"` (fail OPEN, the exact behaviour the module says it exists to prevent):

```
### r6 exit=2 — 1 failure, and it is the OTHER module in the round
policy-conformance: 167 final policies · 1659 proof rows · 1 failure(s) · … 
  ✗ no-array-literal-querykey · mustFlag[1] · (the unwrap control, planted deliberately)
```

Nothing in `no-raw-matchmedia` notices. The two rows the module advertises as its fail-closed pins
(`mustFlag[5]`, `mustFlag[6]`) carry the precise message instead (D2), so the module's entire
"reported, never silently passed" posture is unproven. Fix per §4.1: a row whose subject genuinely refuses
origin resolution, pinned with `messageIncludes` on the UNREADABLE text.

### D6 — `no-raw-matchmedia` `mustPass[1]` does not prove the narrowing its `why` names (MEDIUM)

`mustPass[1]` (`:233-240`) is titled *"THE DECLARED NARROWING: a bare `typeof` CAPABILITY PROBE is not a read
of the api"*. Cutting `isCapabilityProbe(node)` out of the visitor guard (`:133`) leaves it GREEN — the row
passes for an unrelated reason (`globals` is a parameter, so `classify` returns `"other"` regardless). The
narrowing is declared in the header, in the row `why`, and in the roster row `:286`, and nothing enforces it.

### D7 — two ordinary policies' `fix` names no waiver spelling (§5b.3, MEDIUM)

§5b.3 is unconditional for ordinary policies, and §3 explains why: the position is routinely not what a reader
would call the offense.

- `no-array-literal-querykey.ts:26` — `fix` is remediation only ("mint the key from the tRPC options proxy…").
  The position is `queryKey` (the policy supplies `token: "queryKey", offset: 0` at `:36`; `mustPass[4]` plus
  my dead-position control prove it binds). An author who cannot move the key has no spelling to type.
- `no-inline-types.ts:42` — `FIX = "move the shape to contract/ (or @orb/contracts) and import it."` The
  position is the declared NAME (`token: name.getText()` at `:126`; the family test uses `(Foo)`).

Contrast `no-raw-spacing-in-features.ts:73-77`, which states the spelling AND the quotes rule — that is the
standard, met in the same corpus.

### D8 — a legacy `ExemptionTable` survives behind `defineGate` in the raw-CSS family (§5b.7, MEDIUM — #1922)

`no-raw-spacing-in-features.ts:29,35` and `no-raw-typography-in-features.ts:29,35`:

```ts
import type { ExemptionTable } from "../contract/gate.ts";
export const SANCTIONED_HOMES: ExemptionTable = { … };
```

§5b.7 forbids "a gate-owned … exemption table"; §12.5 says "Gate modules receive neither grant tables nor
marker parsers"; `contract/gate.ts` is the LEGACY descriptor contract. Both `-health` siblings import the
table, so all four modules in the split family carry it. This is **known open work** —
`exception-authority-census.md` counts 25 `SANCTIONED_HOMES` tables / 42 rows under #1922 — so it is not a
lane defect; it is a reason these four modules should not be cited as "copy this shape" until #1922 lands.
A lane told to copy the split family today will mint a 26th table.

### D9 — four roster rows are bare pre-conversion labels (§5b.5 coupled site, MEDIUM)

The guide's own routing table calls `Core-Enforcement-Active-Gates.md` a COUPLED SITE whose "Enforces" cell is
"a dense SPECIFICATION, not a label".

| Row | Current text | Missing |
| - | - | - |
| `:254` `no-raw-spacing-in-features` | "raw spacing tokens/values in features" | the carrier fence, the tier permission, the split, the family, the `@orb-waive` position |
| `:256` `no-raw-typography-in-features` | "raw typography tokens/values in features" | same |
| `:132` `server-layout` | "`packages/server/src` root = the 6 tier dirs + `index.ts` only (§3)" | ResourceHost, `population: {of:"none"}`, the two arms, the blindness posture |
| `:100` `schema-branding` | "db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK)" | the `drizzleSchemaFact` provider, the fail-closed receipt, the waiver spelling |

The standard is met in the SAME commit for their siblings — `:255` and `:257` (the two `-health` policies) are
dense and correct, as are `:111`, `:141`, `:277` and `:286`. This is the same shape as the prior verifier's D2
(`v-gate-batch-2026-09-12.md`), recurring: a conversion writes the NEW row and leaves the OLD one.

### D10 — `ext: ["ts","tsx"]` is inert and lives in an exemplar (#1959, LOW)

`user-bus-deferred-member.ts:57`. `lib/policy-source-candidate.ts` pre-filters every policy source to
`/\.tsx?$/u`, so the declaration is a no-op. Proven in **both** directions in this session:

- narrowing it to `ext: ["tsx"]` empties the population —
  `PASS TOOL ERROR [population] Invalid population resolution: expression admitted zero paths from 2 candidate(s)`
  on all three rows. So the field is LIVE, not ignored.
- deleting it entirely — **exit 0, 0 failures.** So `["ts","tsx"]` equals the default.

It is the only `ext:` declaration among the eleven subjects.

## PRISTINE per module — ten verdict blocks, seven criteria each

Legend: **P** pass · **F** fail · **N/A** does not bind · **NE** not evaluated.

### 1. `no-array-literal-querykey` — REFUTED (criteria 3, 4, 5, 6)

1. **P** — `facts: []`/`resources: []` explicit, no `ctx.checker()`, `execution: "selected-files"` honest, no `getType()` anywhere (grep over all eleven returned exit 1).
2. **P** — the message describes a `queryKey:` property with an inline array-literal value; that is what the visitor reports.
3. **F** — D7.
4. **F** — `family` equals its own id (a singleton) but the header declares no singleton and gives no reason; §5b.4 requires one.
5. **F** — the header states the rule only: no family/singleton line, no population-port note, no marker census.
6. **F** — §4.2 arm present and PROVEN (dead-position control). Two §4.1 narrowings UNENFORCED (name fence, population). The exemplars doc's own "Wart: no explicit empty-population control" stands.
7. **P** — `gate:contract` zero; no walk, cache, table, marker parser or fs read.

### 2. `spacing-tier-home-health` — REFUTED (minor: criteria 6, 7)

1\. **P** · 2. **P** · 3. **N/A** (hard; `fix` correctly absent) · 4. **P** — family `raw-spacing-tier`, shared reader `lib/sanctioned-home.ts` (`unresolvedSanctionedHomeKeys`), both named · 5. **P** — header records the split reason and the anchor rationale; roster row `:255` describes the CONVERTED implementation.
6\. **F (minor)** — the ANCHOR self-guard is ENFORCED in the direction that matters; the population fence is UNENFORCED; `mustFlag[0]`'s `messageIncludes` is a tautology (carried by `count: 1`).
7\. **F** — D8, by import.

### 3. `no-raw-spacing-in-features` — REFUTED (criteria 5, 6, 7)

1\. **P** · 2. **P** — probed, not re-read: both admitted carriers are real today (the `cn(…)` `mustFlag` row bites; the uncarried-constant `mustPass` row does not flag) · 3. **P** — the best `fix` in the set; the dead-position control proves the position is the whole quoted literal · 4. **P**.
5\. **F** — the module header is excellent; its ROSTER row is a bare label (D9).
6\. **F** — §4.2 arm PROVEN; `sanctionedHome` and `inClassCarrier` ENFORCED; but the two sub-narrowings INSIDE `inClassCarrier` (the `className` attribute-name test, the `CLASS_COMPOSERS` membership test) and the population fence are UNENFORCED. The #1954 repair fixed the OUTER fence and left both halves of the claim it makes unproven.
7\. **F** — D8.

### 4. `server-layout` — REFUTED, severe (criteria 1, 4, 5, 6). "Wart: none found" is FALSE

1. **F** — D4: an unreachable guard is declared code that is never used.
2. **P** — both per-finding messages are true of what they anchor (the stray path; the manifest for a missing tier).
3. **N/A** (hard); `fix` is present and sound.
4. **F** — singleton with no declared reason.
5. **F** — D9; the header records no family, no population port, no decisions beyond the rule.
6. **F** — D1 (8 findings under a one-finding `why`, no `count`); the `startsWith` fence UNENFORCED; **no §4.5 refusal/receipt pin exists** — `tests/tooling/verify/gates/resource-layout-wave-1.test.ts` contains exactly one `runPolicyPass` pin and it is for `package-layout`, not this policy.
7. **P**.

### 5. `schema-branding` — REFUTED (minor: criteria 5, 6)

1. **P** — `facts: [drizzleSchemaFact]` read unconditionally in `evaluate` with `recordReadySchemaFact`; `resources: []` explicit; no `ctx.checker()` call, and `analysis: "types"` is honest because the provider resolves symbol identity.
2. **P** — three distinct per-finding messages, each matched to its arm, and `messageIncludes` PROVEN to discriminate.
3. **P** — `FIX` names `@orb-waive schema-branding(<column>)`; the dead-position control proves `<column>` is the property name.
4. **P** — family `drizzle-schema`; provider `lib/schema-fact.ts`; the header states the ownership split in one line.
5. **F** — roster row `:100` is a bare label (D9); the header records no population port (it is delegated to the imported `DRIZZLE_SCHEMA_POPULATION`, which is defensible) and no marker census.
6. **F** — §4.2 arm PROVEN; §4.5 refusal pins genuinely present (`schema-fact-wave-1.test.ts:85`, `:103`, `:118`). But THREE arm narrowings are UNENFORCED: nothing proves the primary-brand arm is scoped to a column named `id` , nothing proves it is scoped to a PRIMARY KEY, and nothing proves an FK to an UNBRANDED parent passes.
7. **P**.

### 6. `no-raw-matchmedia` — REFUTED, severe (criteria 2, 4, 5, 6). "Wart: none found — as thorough as the corpus gets" is FALSE

1\. **P** · 3. **N/A** (reviewed-grant has no inline door; `fix` correctly describes the grant route).
2\. **F** — D2. §5b.2's exact failure: a context clause that is a claim, and the claim is untrue.
4\. **P (partial)** — the identity is genuinely resolved through four named shared readers; but "singleton" is never declared with its reason.
5\. **F** — the header and the roster row both record a decision the code does not implement (D2).
6\. **F** — FOUR unenforced narrowings (D-table), the fail-closed arm exercised by no row (D5), and `mustPass[1]` not proving its own declared narrowing (D6). §4.3 grant-identity pins DO exist and are correct (`home-client-family.test.ts`).
7\. **P**.

### 7. `no-inline-types` — REFUTED (criteria 3, 4, 6)

1\. **P** · 2. **P** · 5. **P** — the header is one of the two best in the set (population-as-homes rationale, the `no-inline-domain-interface` split, identity-not-spelling, the declared non-fail-closed limit), and roster row `:277` describes the converted implementation.
3\. **F** — D7.
4\. **P (partial)** — shared readers named (`readMemberReference`, `resolveModuleMemberOrigin`); singleton not declared.
6\. **F** — §4.2 arm present in `ordinary-visitors-family.test.ts:187-195` with its dead-position negative at `:197`. But `doors.has(ZOD_DOOR)` is UNENFORCED — **nothing proves the factory must come from `zod` at all**, which is the module's own headline identity claim; the VariableStatement export fence is UNENFORCED; and 7 of the 10 population clauses (4 `notUnder`, all 3 `notNamed`) have no row.
7\. **P**.

### 8. `no-raw-typography-in-features` + `typography-tier-home-health` — REFUTED, identically to #3 and #2

The two files are the spacing pair with the regex and the token vocabulary swapped. Every probe reproduced
the same verdict on the same line numbers: `sanctionedHome` ENFORCED, `inClassCarrier` ENFORCED, the
`className` attribute-name test and `CLASS_COMPOSERS` membership UNENFORCED, population UNENFORCED, §4.2 arm
PROVEN, `ExemptionTable` present, roster row `:256` a bare label, `-health` roster row `:257` dense and
correct. **A defect present in both halves of a deliberately mirrored pair is the propagation §5b warns
about, already happening inside the exemplar set itself.**

### 9. `user-bus-deferred-member` — CONFIRMED

1. **P (one nit)** — `facts: [busProducerFact]` read unconditionally; `resources: []` explicit; `workItem: 1822` with `severity: "warning"` is the discriminated-union pairing the contract enforces (`contract/policy.ts:99-110`), and `authority: "hard"` + `warning` is the unusual-but-legal combination the exemplars doc already flags honestly. The nit is D10.
2. **P** — one message, emitted in exactly the direction the header says (the member GAINED a producer).
3. **N/A** (hard); `fix` names the retirement, which is the correct instruction for an unsuppressible policy.
4. **P** — family `bus-fact`, provider `lib/bus-fact.ts`, sibling relationship stated and enforced by the shared `BUS_MEMBER_DEFERRALS` import.
5. **P** — the densest header in the set: the split reason, the debt identity, why the FINDING is the retirement rather than the debt, the refusal and where it is pinned. Roster row `:141` matches it.
6. **P** — `mustFlag[0]` ENFORCED under cut; §4.5 refusal pin present and asserted through `runPolicyPass` (`bus-pair.test.ts`, "a deferral that outlives its subject REFUSES"); the union-filter narrowing has a planted-second-bus observability pin — which is §4.7 done correctly, including the honest note that an unfiltered mutant left every spec green; and the family test carries a dangling-specifier control with a derived did-the-sweep-run assertion.
7. **P**.

**This is the module to point a conversion lane at.** Its header is the only one that prices the alternative,
states where each un-rowable claim is pinned, and admits what a fixture could not have distinguished.

### 10. `ui-exports-map-complete` — REFUTED (criteria 1, 4, 5, 6)

1. **F** — D4.
2. **P** — four per-finding messages, each true of its arm.
3. **N/A** (hard); `fix` sound.
4. **F** — singleton, no declared reason.
5. **F** — D4's coupled half: the roster row declares an arm A4 the module does not implement.
6. **F** — D3 (`messageIncludes: "not"` discriminates nothing), `mustFlag[2]` with no `count`, `targetPath`'s guard UNENFORCED, and no §4.5 refusal/receipt pin. The two structural narrowings ARE enforced, and `mustPass[1]`/`mustPass[2]` are genuine declared-limit rows.
7. **P**.

## Corrections to `exemplars-2026-09-11.md`

That document is what conversion lanes trust, so these are the rows to fix.

| Its claim | Correction |
| - | - |
| §2 (spacing pair) "Wart: none found; both files read in full, no shortcuts visible" | **FALSE.** Population fence unenforced in both halves; the occurrence sibling's roster row is a bare pre-conversion label; both carry a legacy `ExemptionTable` (#1922) |
| §3 (`server-layout`) "Wart: none found" | **FALSE.** `mustFlag[0]` has no `count` and produces **8** findings from two arms; the `startsWith` fence is unenforced; there is no §4.5 pin; the roster row is a bare label |
| §3 "the resource-not-ready guard means a partial or failed resource read withholds … exactly the missing/empty/unresolved-population-refusal standard capability the design doc requires" | **FALSE.** The guard is UNREACHABLE (D4). The capability is the RUNTIME's (`lib/resource-declaration.ts:182`), which throws at the population phase. Citing the guard teaches a lane to write dead code and to answer a broken resource with a silent return |
| §3 "`server-layout.ts` is the minimal clean version", preferred over `ui-exports-map-complete.ts` | **Withdraw the preference.** Both carry the same dead guard; `ui-exports-map-complete` additionally has real declared-limit `mustPass` rows and a dense roster row, and `server-layout` has the worse expectation row |
| §5 (`no-raw-matchmedia`) "Wart: none found — this is as thorough as the corpus gets" | **FALSE, and it is the worst module in the set on §4.1.** Four unenforced narrowings, a fail-closed arm no row exercises, a `mustPass` that does not prove the narrowing it names, and a DECLARED LIMIT that is false in three documents |
| §1 "no dedicated test file was located for `no-array-literal-querykey`" | **RESOLVED: none exists.** No test under `tests/` imports it (symbol grep) and no test names its id or path except two legacy-era comments in `check-gates.repo.int.test.ts:582`. Its rows run through conformance only |
| §2 "no dedicated test file was located for this pair" | **RESOLVED: none exists** for `no-raw-spacing-in-features` / `spacing-tier-home-health` / `no-raw-typography-in-features` / `typography-tier-home-health`. `ui-token-surface-wave-1.test.ts:8` mentions the split in a comment; `check-gates.repo.int.test.ts:811,813` are legacy-era comments |
| §3 "did not locate a dedicated test file named for `server-layout`" · §10 the same for `ui-exports-map-complete` | **RESOLVED: one exists.** `tests/tooling/verify/gates/resource-layout-wave-1.test.ts` imports BOTH (`:6`, `:7`) and runs `verifyPolicyProofs` on a six-policy array. It contains no pin for either policy beyond that |
| §8 "the only severity warning policy in the 146-module `defineGate` corpus" | Count is stale by construction; the corpus is **167 final** policies today (`check:policy-conformance`). The "only warning policy" half I did not re-derive |

## Red triage — `pnpm test:scoped tests/tooling/verify/gates/` (6 failures)

A scoped red is never baseline, so each is attributed.

- **Contention, not regressions (2 tests).** `drizzle-registry-conversion.test.ts` — both failed with
  `Test timed out in 5000ms` (the per-test default). Re-run ALONE: **3/3 PASS, exit 0, 4.4 s.**
- **Sibling lane / pre-existing (1 test).** `enforcement-registry-parity.int.test.ts` real-tree arm — the
  count line `Core-Enforcement-Active-Gates.md:348` still says "270 registered gates" against 271 active
  modules. This is the prior verifier's D2, still open, and that file is `p-roster-narrowings`' scope. **Not
  mine, not a finding of this audit.**
- **Pre-existing (3 tests).** `dangling-refs.repo.int.test.ts` — the three phantom cites at
  `Core-Enforcement-Active-Gates.md:143` (`BELT_EXEMPT`), `:146` (`SERVER_INTERNAL_REACH`) and `:194`
  (`@orb/contracts/sessions`), already dated pre-batch in `v-gate-batch-2026-09-12.md` §"Red triage" and
  byte-identical here.

**Every family test covering a subject module PASSED**: `resource-layout-wave-1`, `schema-fact-wave-1`,
`home-client-family`, `ordinary-visitors-family`, `bus-pair`.

## What I did NOT cover

- **I did not run `pnpm check:structure`.** All verdicts are from the conformance runtime, which is the
  runtime every proof row executes in. D2's real-tree half — whether a DOM-aware analysis program on the live
  tree would produce the UNREADABLE message for `window.matchMedia` — is **UNMEASURED**. What IS proven is
  that the two rows written to pin it do not pin it, and that the fail-closed branch is dead to every row.
- **I did not cut every narrowing.** Three are marked NE in the table (`no-raw-matchmedia`'s
  `verdict === "other"` return, `no-inline-types`' `ZOD_FACTORIES.has(terminal)`, and the two `-health`
  policies' `unresolvedSanctionedHomeKeys` internals) — each has a declared row and cutting them would have
  cost a round for a likely-enforced result. A follow-up should close them.
- **I did not replay any LEGACY descriptor** (§4.6 differential). Only two of my subjects have a committed
  differential (`drizzle-registry-conversion.test.ts` covers neither); whether each conversion's population is
  byte-identical to its legacy predecessor is out of this audit's scope.
- **I did not audit the shared readers** (`lib/sanctioned-home.ts`, `lib/reference-fact.ts`,
  `lib/origin-verdict.ts`, `lib/reviewed-grant-findings.ts`, `lib/schema-fact.ts`, `lib/bus-fact.ts`) for the
  §5b.7 "private reader wearing a shared reader's clothes" shape. Each has ≥2 consumers by the family
  relationships I read, but I did not count consumers with `pnpm ast`.
- **I did not run CT, e2e, biome or typecheck.** This lane modified no tracked code.
- `tests/tooling/check-gates.repo.int.test.ts` and `gate-ignore-grammar.int.test.ts` were not run, per the brief.

## Proposed memory lessons (the orchestrator owns the write)

**Index line:** `- [a resource policy's not-ready guard is dead code](resource-not-ready-guard-is-unreachable.md) — resolveResourceDeclarations throws at the POPULATION phase, so an in-module status check never runs`

Body: A final `analysis: "resource"` policy that opens `evaluate` with
`if (fact.status !== "ready") return;` has written unreachable code. `lib/resource-declaration.ts:182`
throws `resource declaration <id> is <status>` while resolving the declared population, before `create` is
called, and `bindPolicyResources` separately files an `unresolved: 1` receipt that withholds the policy. Prove
it in one probe: delete the resource's file from a `mustFlag` fixture and read the runner back — you get
`PASS TOOL ERROR [population] resource declaration package-metadata:<id> is missing`, never a silent
green-zero. The guard is worse than redundant: it teaches the next lane that the correct answer to a broken
resource is a silent `return`, which is exactly the "clean zero from a detector that might be blind" §4.5
forbids. Found in BOTH shipped resource exemplars (`server-layout.ts:41`, `ui-exports-map-complete.ts:104`),
one of which the exemplars document cites the guard as the reason to copy.

**Index line:** `- [a messageIncludes substring can match the sibling arm](messageincludes-substring-matches-the-sibling-arm.md) — transplant it onto the other row; if that row stays green the discriminator is fake`

Body: `expectationFailure` runs `messageIncludes` through `findings.some(...)`, so a short substring silently
matches an arm the row was never about. `ui-exports-map-complete`'s `mustFlag[1]` pins
`messageIncludes: "not"` for the wrong-target arm — and the dead-target arm's message
`points at "…", which does not exist.` contains it too. The two-command test is a TRANSPLANT, not a read:
move the discriminator onto a sibling row and re-run conformance; if the sibling stays green, the substring
does not discriminate and `count` is carrying the row alone. The same transplant is the positive control for
a GOOD discriminator — `schema-branding`'s three arm messages each fail when swapped.

**Index line:** `- [a narrowing's own mustPass row can pass for an unrelated reason](narrowing-row-can-pass-for-the-wrong-reason.md) — the §4.1 cut test outranks a row titled after the narrowing`

Body: A `mustPass` row whose `why` names a narrowing is not evidence the narrowing is enforced. In
`no-raw-matchmedia`, `mustPass[1]` is titled "THE DECLARED NARROWING: a bare `typeof` CAPABILITY PROBE …" and
survives the deletion of `isCapabilityProbe` — because its fixture reads the api off a PARAMETER, which the
origin classifier already calls a different identity. Two independent fences protect one fixture, and the row
credits the wrong one. So the §4.1 cut is mandatory even where a row exists AND is named after the narrowing;
the row title is a hypothesis, the cut is the measurement.

## Issue summary for #1584

A fresh-context Opus verifier audited all ten cited exemplars in full against §5b's seven criteria, ran the
mandatory §4.1 narrowing sweep (30 cuts across nine `cp`/`mv` probe rounds) and the #1968 expectation sweep
(all 33 `mustFlag` rows), and **REFUTES nine of the ten**. `check:policy-conformance` reproduced the brief's
headline exactly — 271 modules / 167 final / 104 legacy / 1,659 rows / 0 failures / exit 0 — before and after
every probe, and `gate:contract` is 762 findings with ZERO for all eleven subject modules. **12 of 30
narrowings are UNENFORCED (40%, double the corpus's prior 1-in-5 rate)**, and the two modules the exemplars
document certifies "Wart: none found" carry the worst defects. `server-layout`'s `mustFlag[0]` tolerates **8**
findings from two different arms under a `why` claiming one (derived by planting `count: 99`), and its
not-ready guard — the exemplars doc's headline reason to copy it — is **UNREACHABLE**:
`lib/resource-declaration.ts:182` throws at the POPULATION phase, proven by deleting the fixture's
`package.json` and getting `PASS TOOL ERROR [population] resource declaration package-metadata:server is
missing` rather than a silent green-zero; `ui-exports-map-complete.ts:104` carries the identical dead guard,
and its roster row declares an arm A4 (blindness) the module does not implement. `no-raw-matchmedia` — "as
thorough as the corpus gets" — has four unenforced narrowings, a fail-closed UNREADABLE arm that NO row
exercises (cutting it to fail-open kills nothing), a `mustPass` that survives deletion of the narrowing it is
named after, and a DECLARED LIMIT that is false in the module header, in two `mustFlag` `why` strings and in
`Core-Enforcement-Active-Gates.md:286`: `window.matchMedia` and a bare `matchMedia(q)` carry the PRECISE
message, not the unreadable one (proven by transplanting each message text onto the rows). Also filed:
`ui-exports-map-complete` `mustFlag[1]`'s sole discriminator `messageIncludes: "not"` matches the sibling
dead-target arm too; `no-array-literal-querykey` and `no-inline-types` ship no `@orb-waive` spelling in `fix`
(§5b.3 is unconditional for ordinary policies); `no-inline-types` proves neither the `zod` DOOR nor 7 of its
10 population clauses; `schema-branding` proves none of its three arm narrowings; the raw-spacing/typography
pair's #1954 carrier-fence repair fixed the outer fence and left BOTH halves of the claim it makes
(`className` attribute identity, `cn/clsx/cva/tv` membership) unenforced in both twins; four roster rows
(`:100`, `:132`, `:254`, `:256`) are bare pre-conversion labels while their siblings in the same commit are
dense; all four raw-CSS modules still carry a legacy `ExemptionTable` (#1922); and `ext: ["ts","tsx"]`
(#1959) sits in an exemplar, proven inert in both directions. **CONFIRMED clean: `user-bus-deferred-member`**
— the only module here I would hand a lane and say "copy it". The one criterion the whole set passes is
§4.2: all five ordinary policies have a positive identity arm, and all four in-module arms DISCRIMINATE under
a planted dead-position control (`AUTHORITY ALARM … names a dead position` on every one). Corrections owed to
`exemplars-2026-09-11.md`: three "Wart: none found" lines are false, the `server-layout`-over-
`ui-exports-map-complete` preference should be withdrawn, and its five "no test file located" entries resolve
— `resource-layout-wave-1.test.ts` covers both resource policies, while `no-array-literal-querykey` and the
four raw-CSS modules genuinely have none.
