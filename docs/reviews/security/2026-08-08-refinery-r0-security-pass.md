---
kind: review
status: executed
updated: 2026-08-08
---

# Refinery R0 — the mandatory pre-R1 security pass

> **VERDICT: GO for R1**, conditional on the belt list in §4 being carried by R1's design (not deferred to
> R2/R3). R0's foundation is structurally sound — D23 derivation is right, the cascade chain is proven, the
> id brands and enum CHECKs are real. Its gap was BOUNDS: three of the four model-authored payload shapes had
> none, and the one host-authored free-text column had no schema at all. **Those are closed in this pass**
> (commit on `main`, contract-tier zod bounds + red-first pins). Everything structural — heal semantics, the
> `greetingIndex` biconditional, strict-vs-strip — is PRESCRIBED here for R1 to build.
>
> Threat model this pass works from: **a character card is untrusted text authored by a stranger** (serde
> header law; D44's UNTRUSTED tier). The refinery feeds that text to an LLM and writes the model's structured
> output back into canon. Prompt injection in the card can steer the model's payload; **the payload schemas
> are the only belt between a steered model and a canon write**, because the per-wire scrubs deliberately
> drop the bounds on hosted wires and the zod parse is what re-imposes them
> (`packages/kit/src/json-schema/wire-subset.ts:22-23`).

## 0. Method + receipts

Every claim below was re-derived on today's tree, not read off the brief. The five briefed gaps were
independently reproduced by executing the real contract schemas out of `packages/contracts/src/refinery/`
(node type-stripping, probe run from the session scratchpad — never the repo tree), and each post-fix claim
was re-run against the edited source. Projection claims were verified through the REAL
`projectJsonSchema` + `scrubWireSchema` engines, not by reading them.

Suites run: `tests/contracts/refinery/index.contract.test.ts` (21 pass, 8 of them RED before the fix) ·
`tests/db/schema/refinery.int.test.ts` (9 pass) · `tests/contracts/character/index.contract.test.ts` ·
`tests/db/schema/character.int.test.ts` · `tests/server/kit/serde/card/index.test.ts`. Floors:
`pnpm typecheck` · `pnpm typecheck:graph` · `pnpm check:structure` · `pnpm check:db-baseline` ·
`npx knip --cache` · biome + eslint on the touched files. No new files and no import-path changes, so
depcruise was not re-run (the only condition that requires it).

**One brief premise corrected:** the brief cites "the D30-class trust boundary". D30 is the `chat_tags`
per-user overlay ruling (`Core-Path-Registry.md:73`) and has nothing to do with card trust. The laws that
actually govern this surface are **D44** (the two trust tiers — card content is UNTRUSTED), the serde header's
cards-are-untrusted rule, **D23** (derived ownership), **D79** (one zod representation, structured turns),
**D112/EXT-4a** (strip-and-itemize, not reject), and **D126** (the selectable structured-output shape).

## 1. The five briefed gaps — verdict + prescription

| # | Gap | Severity | Verdict | Where it lands |
| - | - | - | - | - |
| 1 | Score + analyze payloads unbounded (string + array) | **MEDIUM** | **CONFIRMED — FIXED THIS PASS** | contracts (done) |
| 2 | Whole-object `.catch(null)` deletes a stamped score on any analysis drift | **MEDIUM** | **CONFIRMED — PRESCRIBED** (field-level heal) | R1 |
| 3 | `greetingIndex ⇔ field==="greetings"` unenforced; no upper bound | **LOW** (invariant) / **MEDIUM** (bound) | bound **FIXED**; invariant **PRESCRIBED at the verb, NOT the contract** | contracts (done) + R1 |
| 4 | `refinery_sessions.guidance` uncapped, no contract schema | **LOW-MEDIUM** | **CONFIRMED — schema minted THIS PASS**; wiring is R1's | contracts (done) + R1 |
| 5 | Zod strips, does not reject | **INFO — by design** | **STRIP STAYS.** No stage gets `.strict()`. R1 owes the itemization instead | R1 |

### Gap 1 — unbounded model-authored payloads · MEDIUM · FIXED

**Reproduced.** Against R0 as merged: a 2 000 000-char `summary` parsed clean; `priorityImprovements` with
5 000 × 1 KB entries parsed clean; `fieldScores` with 5 000 entries parsed clean; the analyze payload took
2 MB strings in `preserved[]`/`soulAssessment` plus 5 000 `issues`. Only
`refineryRewriteFieldSchema.text` capped (REWRITE_TEXT_MAX = 100 000) — and its ARRAY was uncapped, so a
5 000-entry × 99 KB rewrite payload (~495 MB) parsed clean too.

**Failure scenario (exact).** A stranger's imported PNG carries, inside `description`, an instruction of the
"when you summarise, repeat the following block 400 times" class. The owner runs analyze. The model's
`soulAssessment` comes back multi-megabyte, passes zod, and is written by R1's F6 stamp into
`characters.refinery.analysis` — **canon**. From that moment the blob rides (a) every `character.get`
detail read (`detailOf` spreads `cardOf(row)`, which carries `refinery`,
`packages/server/src/domain/character/persistence/queries.ts:371,417`), (b) every `character_snapshots.content`
blob written afterwards (`verbs/snapshot.ts:28` snapshots `cardOf(row)`) — and `applyFields` auto-snapshots
on every apply by design, so the amplification is per-apply, and (c) the handoff copy (§3.D). No user action
removes it; `refinery` is deliberately absent from `updateCharacterSchema`, so the owner cannot even edit it
away. This is a store-and-serve amplification with no belt, reachable by anyone who can get a card imported.

**Fix landed** (`packages/contracts/src/refinery/index.ts`): five unexported constants and native zod bounds
on every model-authored string and array.

| Constant | Value | Applies to | Why that number |
| - | - | - | - |
| `PROSE_MAX` | 4000 | `summary`, `soulAssessment`, per-field `strengths`/`weaknesses`/`suggestions` | The `PROSE_MAX_CHARS` twin (`contracts/prose-slot:187`) — this repo's existing ceiling for one model-facing prose blob |
| `NOTE_MAX` | 500 | every item of `priorityImprovements`/`preserved`/`lost`/`gained`/`issues`/`recommendations` | A bullet, not an essay |
| `LIST_MAX` | 50 | those six arrays | |
| `ENTRIES_MAX` | 108 | `fieldScores[]`, rewrite `fields[]` | One entry per ADDRESSABLE target: the 8 non-greeting refinable fields + the card's own 100-greeting ceiling |
| `GREETING_INDEX_MAX` | 99 | `greetingIndex` on both payload entry types, and selection `greetingIndexes[]` | The last slot the card can hold |

Resulting worst-case serialized payloads, measured: **analyze ≈ 130 KB** (the one that reaches canon),
**score ≈ 1.33 MB** (run rows only), rewrite ≤ the card's own ceiling by construction (108 × TEXT_MAX — a
rewrite can never exceed what the card it targets can hold).

**Why native keywords and not refinements** — verified, not assumed: `projectJsonSchema` emits them as
`maxLength`/`maxItems`/`minimum`/`maximum`, the `guided-decoding` subset KEEPS them (xgrammar compiles them
into the grammar, so they are prevented at generation time on local backends), and the hosted subsets STRIP
them with the zod belt re-imposing them on the reply. A `.refine()` would have been silently dropped from
the projection instead — legal, but it would put the wire schema and the parse out of step, which is exactly
what the file header forbids.

The constants stay unexported and are pinned BEHAVIORALLY in the contract test (at-cap accepted / over-cap
rejected), the existing `REWRITE_TEXT_MAX` precedent. `ENTRIES_MAX` and `GREETING_INDEX_MAX` additionally
carry a cross-namespace pin asserting they equal `REFINABLE_FIELDS.length - 1 + <card greetings ceiling>` and
`<ceiling> - 1`, with the card ceiling itself probed behaviorally — so a future change to the card's
`GREETINGS_MAX` turns this test red instead of silently under-capping.

### Gap 2 — the whole-object heal DELETES a stamped score · MEDIUM · PRESCRIBED (R1)

**Reproduced.** `refinerySignalsSchema.nullable().catch(null)`
(`packages/server/src/domain/character/persistence/queries.ts:29`) is a WHOLE-OBJECT catch. Measured:
`{score: 8, analysis: {tone: "dark"}}` → **`null`**. The score is not preserved; it is deleted, on read, with
no error and no log. Today that is harmless (`score` has zero producers). The day R1 stamps scores it is a
silent data-loss path: any drift in the analysis arm — a schema tightening, a stage-payload version bump, a
partially-written row — costs the user every score in their library at once, invisibly, and the client's two
readouts (`character-overview-card.tsx:89`, `character-provenance-section.tsx:38`) simply stop rendering.
Note the coupling: the R0 design leans on this catch as its "no migration mechanics" bargain, so the heal is
load-bearing and must not simply be deleted.

**Prescription — FIELD-LEVEL HEAL, not versioned parse, not keep-and-document.** R1 changes the read parser
to heal the two halves independently:

```
refinerySignalsSchema = z.object({
  score:    z.number().min(1).max(10).nullable().catch(null),
  analysis: refineryAnalyzePayloadSchema.nullable().catch(null),
})
```

…and the READ SEAM keeps its outer `.nullable().catch(null)` only for the not-an-object case. Rationale: the
two halves have independent producers (score runs vs analyze runs) and independent consumers (a number the
client renders vs a payload the client renders as typed text), so one arm's rot must not cost the other. A
versioned parse loses to this on cost — there is exactly one shape to migrate from and it is pre-launch — and
keep-and-document loses because the failure is SILENT: the honest version of "documented" here is a log, and
if you are adding a log you may as well keep the data.

**Two conditions R1 must land in the SAME change**, or it re-opens the hole it closed:

1. The `score` tightening to `.min(1).max(10)` belongs in that same edit and NOT before it — under today's
   whole-object catch, tightening `score` would turn every out-of-range legacy value into a total wipe of
   both halves. That ordering is why this pass did not tighten `score` itself.
2. The heal must be OBSERVABLE. A silent `.catch` on a canon read is the "banned-silent-fork" class (D112):
   emit a counter/log when either arm heals, keyed by which arm — otherwise the first real drift is
   discovered by a user noticing their scores are gone.

### Gap 3 — `greetingIndex` · bound FIXED · biconditional PRESCRIBED AT THE VERB

**Reproduced.** `{field: "description", greetingIndex: 99999, text: "…"}` parsed clean; so did
`greetingIndex: 2^40` on a `systemPrompt` field score; so did a selection naming index 1e9 or 100 000 indexes.

**Bound — fixed this pass** (`.max(GREETING_INDEX_MAX)` on both payload entry types + the selection array,
plus `.max(GREETING_INDEXES_MAX)` on the selection array's length). An index above the card's last slot names
a greeting that cannot exist, so it was unapplicable by construction — a guaranteed apply failure that the
belt now rejects at parse instead of at write.

**Biconditional — the invariant is enforced at R1's apply/render belt, NOT at the contract. Ruling: verb-tier
assert.** Three reasons, in order of weight:

1. **A contract refine costs the WHOLE payload.** Zod refinements are all-or-nothing at the object they sit
   on. A single stray `greetingIndex` on a `description` entry would fail the entire rewrite payload, losing
   the other 8 legitimately-rewritten fields — and then `runStructuredTurn`'s bounded retry burns a second
   provider call before the run fails outright. At the verb, the same defect costs exactly the offending
   entry (the `salvageArgs`/`salvageExtraction` per-entry posture the RPG vehicles already use).
2. **The refinement would not reach the wire anyway.** Verified: `projectJsonSchema` silently DROPS a
   `.refine()` from the emitted JSON Schema. The grammar would not enforce it on the guided-decoding wire, so
   a contract refine buys strictness only on the parse — the exact place where strictness is most expensive.
3. **`.partial()` is banned on a refined object.** Verified on zod 4.4.3: `.partial()` on an object carrying
   its own refinement THROWS `".partial() cannot be used on object schemas containing refinements"`. The
   memory-pinned gotcha holds and applies here. (Precise scope, since this bit an earlier reading: it is
   refinements on the OBJECT that block it. `refinerySelectionSchema.partial()` works TODAY because its two
   refinements sit on the inner ARRAYS. Put a refine on `refineryRewriteFieldSchema` and any future
   `.partial()` derivation of that entry shape breaks; `.extend()` keeps working.)

So R1's apply belt owes, per entry, in this order: (a) `field ∈ REFINABLE_FIELDS`; (b) if
`field === "greetings"` then `greetingIndex` is present AND `< card.greetings.length` **of the live card, not
the snapshot** (a greeting deleted since session start must not be re-created by index); (c) if
`field !== "greetings"` then `greetingIndex` is absent — an entry failing any of these is DROPPED with an
itemized reason, never silently coerced, and never allowed to fall through to a different field.

### Gap 4 — `guidance` · LOW-MEDIUM · schema minted this pass, wiring is R1's

**Confirmed:** `refinery_sessions.guidance` was plain `text("guidance")` with no contract schema anywhere.
It is host-authored, so it is not an untrusted-author surface — but it is spliced into EVERY stage prompt,
which makes it model-facing bytes, and unbounded model-facing bytes are a cost/context-overflow surface
(a 10 MB guidance string is a prompt that costs money and fails).

**Minted this pass:** `refineryGuidanceSchema = z.string().max(4000)` — the same `PROSE_MAX_CHARS` ceiling
every other model-facing prose blob in this repo carries. Also minted `refinerySessionNameSchema =
z.string().max(200)` (the card `NAME_MAX` twin) for the roster label, which was equally unbounded and is
already consumed by `refinerySessionSummarySchema.name`. Both db columns now carry a comment naming their
schema.

**R1 owes:** parsing `guidance` through this schema at the start/iterate input boundary, and — the part that
matters more — **neutralizing it before it is spliced into a template.** Guidance is the exact analogue of
the guided `{{input}}`: `resolveGuidedInstruction` runs `neutralizeMacros(userInput)` before substitution
precisely so a user cannot re-trigger macro evaluation by typing `{{…}}`
(`packages/kit/src/guided/index.ts`). A guidance string spliced raw into a macro-processed stage template
re-opens that hole for the host against themselves.

### Gap 5 — strip vs strict · INFO, by design · STRIP STAYS

**Confirmed** and **ruled: no refinery stage gets `.strict()`.** This is not a gap; it is the repo's decided
posture, and it is written down in the projection engine's own header
(`packages/kit/src/json-schema/index.ts:13-20`): v4 `z.object` is STRIP mode, the model-facing parses
deliberately do NOT use `z.strictObject`, "rejecting a whole call over a junk key drops more than it saves"
(EXT-4a), and **the residual silence is closed by OBSERVABILITY, not by strictness** (D112 (3),
banned-silent-fork). The RPG vehicles already implement the sanctioned shape: `strippedToolCallKeys` and
`salvageExtraction`'s `stripped` itemize every key the schema silently removed.

Two reasons this is also the RIGHT answer for refinery specifically, not just the consistent one: (a) the
payload is a whole run — a strict failure costs the provider call twice (`runStructuredTurn`'s bounded retry)
and then the run; and (b) `additionalProperties:false` is ALREADY pinned on the wire schema, so on the
guided-decoding backend an extra key is *prevented*, and on hosted wires it is advisory prompt-shaping — a
`.strict()` parse would convert a vendor's harmless extra key into a user-visible failure without preventing
anything an attacker actually wants.

What R1 owes instead: **the parse failure must not be the tamper signal, so the stripped keys must be.** R1's
run-recording path itemizes the keys that failed to survive validation (the `stripped` shape), so an invented
key appears in observability rather than vanishing into a success record. And keep the discipline the
structured-turn kit already documents: paths, never messages — zod messages quote the model's own output,
i.e. untrusted card-derived content, which must never reach a span attribute or a log field
(`packages/server/src/kit/structured-turn/index.ts:26-33`).

## 2. What landed in this pass

One commit on `main`. Contract-tier bounds only — nothing structural, nothing behavioral.

- `packages/contracts/src/refinery/index.ts` — the five ceiling constants + native bounds on every
  model-authored string/array; `refineryGuidanceSchema` + `refinerySessionNameSchema`;
  `refinerySessionSummarySchema.name` now uses the bounded schema; the analyze payload's docstring now states
  that it is the one payload that reaches canon.
- `tests/contracts/refinery/index.contract.test.ts` — 8 new bound pins (**run RED against the pre-fix source
  before the fix landed**, then green), including the cross-namespace greeting-ceiling twin pin.
- `tests/db/schema/refinery.int.test.ts` — the two verifier-noted control gaps closed: the **sessions
  `status` CHECK is now bitten** (it was declared but never exercised — a control nobody had seen fail), and
  the user-cascade test gained its missing session-level positive control.
- `packages/db/src/schema/refinery.ts` — comments only: `guidance` and `name` now name the schema that
  bounds them and state that the belt is the verb (SQLite has no length domain).

Deliberately NOT done here (all R1's, all in §1/§4): the heal split, the `score` tightening, the
biconditional assert, the guidance wiring, the stripped-key itemization.

## 3. Beyond the five — this pass's own sweep

### A. The internal write path does not re-validate — `applyFields` must · MEDIUM

`updateCharacterSchema` is parsed in exactly ONE place: the tRPC wire
(`packages/server/src/transport/trpc/routers/character.ts:45`). A server-internal injected `character.update`
op — which is precisely how R1's `applyFields` is designed to write — is typed by `UpdateCharacterInput` and
gets **no runtime validation at all**. Consequence: the card's own TEXT_MAX is NOT a belt on the refinery
apply path; the refinery payload's `REWRITE_TEXT_MAX` is the only thing standing between a steered model and
an over-length card field.

**Prescription:** `applyFields` parses its constructed input through `updateCharacterSchema` before handing it
to the injected op. This is not new machinery — it is exactly what the import domain already does at its own
non-wire producer seam (`domain/import/substrate/card.ts:192` runs `createCharacterSchema.safeParse` on a
flattened card). Cite that precedent in the verb header so the next reader does not "simplify" it away.

### B. `strict-compatible` mode breaks every rewrite run · MEDIUM · availability

Under `AppSettings.structuredOutputShape = strict-compatible` (D126 — a live, owner-selectable per-deployment
option), the projection reshapes optional properties into `anyOf: [T, {"type":"null"}]` and marks them
required. Verified end-to-end through the real scrub: the rewrite payload's `greetingIndex` becomes
`{"anyOf":[{"type":"integer"},{"type":"null"}]}`, and a conforming reply
`{fields:[{field:"description", greetingIndex:null, text:"hi"}]}` **FAILS** the zod parse
(`z.number().optional()` rejects `null`) — then fails the bounded retry the same way, then fails the run.
Every rewrite stage would be dead on any deployment that flipped that setting.

**Prescription:** R1 runs `dropNullValues` on the extracted reply BEFORE the payload parse, on every stage.
The kit function exists for exactly this and its docstring says it is safe to run unconditionally
(`packages/kit/src/json-schema/wire-subset.ts:221-230`). This belongs in the stage-parse seam that dispatches
through `REFINERY_STAGE_PAYLOADS`, so all three stages inherit it.

### C. Card text spliced into a stage prompt must be macro-neutralized · MEDIUM

The refinery's whole job is to put untrusted card text into a prompt. If R1's `refine-prompt.ts` builds the
stage prompt from a prose-slot template and then runs the assembled string through the macro engine, any
`{{…}}` inside the card's own `description`/`greetings`/`systemPrompt` gets EVALUATED — the card author
choosing which macros fire in the host's prompt.

The standing law is already written for this exact case: `resolveGuidedInstruction` neutralizes `{{base}}`
"other-author content (the card creator's greeting) … so a `{{…}}` in the stored greeting cannot re-trigger
macro evaluation once it lands in the template" (`packages/kit/src/guided/index.ts`). **Prescription:** every
card-derived string the refinery splices into a template goes through `neutralizeMacros` first — the same
treatment `{{base}}` gets, for the same reason — and so does `guidance` (§1 gap 4). Card-derived values that
ride as macro VALUES (the `cardMacroOptions` shape) are fine as-is: the engine does not re-parse handler
return values.

### D. `refinery` crosses an owner boundary on host-handoff · LOW · latent until R1 stamps

`createCopyHandoffCards` spreads `...cardOf(source)` into the nominee's new row
(`packages/server/src/domain/character/persistence/handoff-copy-write.ts:92-99`), so `characters.refinery`
rides a member→host card copy. Inert today (zero producers); live the day R1 stamps. The blob is a critique
OF the card the nominee is receiving anyway, so this is not an obvious leak — but per the standing rule that
a COPIED verdict names the FIELD rather than the genre, it must be a DECISION with a pin, not an accident of
a spread. Note the exposure asymmetry that makes it worth ruling: `duplicate` also carries it (same owner —
fine), and the serde/export path deliberately does NOT (`serde/card/index.ts:302` writes `refinery: null`;
refinery is not on the card wire) — so today every cross-boundary path clears it except this one.

**Prescription:** R1 states the verdict in `handoff-copy-write`'s header (my recommendation: **CLEAR it** —
the analysis is the old host's private quality judgement of the card, it is derived data the new owner can
regenerate in one run, and the model may have echoed the old host's `guidance` into `soulAssessment`) and
pins it in `tests/server/domain/character/…` alongside the existing copy assertions.

### E. Ownership / oracle — the read pattern R1 must use · confirmed correct as designed

R0's D23 call is right and I found nothing to reverse: `refinery_sessions` correctly carries no `ownerId`
(it is anchored by `character_id NOT NULL → characters`, the `gallery_items`/`imagery_generations` DERIVE
class), the two-level cascade is proven by test, and both tables are declared `parent`-class in
`scripts/check/gates/table-scoping-class.ts:184-190`.

R1's obligations, precisely:

- **No `fetchOwned` on refinery tables** — there is no `ownerId` to scope by. The gate is the join through
  the character: the `ensureCharacterOwned` shape
  (`packages/server/src/domain/databank/persistence/queries.ts:82`, which reads `characters` directly — a
  sanctioned cross-table read — and throws a domain-typed not-found when `rows[0]?.ownerId !== ownerId`).
- **A run read scopes through its session**: `refinery_runs → refinery_sessions.characterId →
  characters.ownerId`. A run id alone must never be sufficient to read a payload; the `session_id` FK is the
  only path and the join must carry the owner predicate in the WHERE, not in a post-filter.
- **Leak-free NOT_FOUND, ownership BEFORE any content verdict** — a foreign session id and a non-existent
  session id must return the identical error, and the ownership check must run before any check that could
  differ by content (the `distill`/`generate-greeting` existence-oracle posture). A "session is not yours"
  error distinguishable from "no such session" is an enumeration oracle over other users' sessions.
- **Portability: nothing owed.** The `lifecycle-portability` gate's arm A deliberately does not see
  FK-inherited tables (its own declared limit names `gallery_items` as the exemplar), so refinery's two
  tables need no classification row — their portability is their character's.
- **Cross-tenant sweep classification per tRPC procedure** is owed when the router lands (the new-domain
  coupled set), not before.

### F. The member plane is clean — checked, with one exception (§3.D)

Walked the visibility checklist rather than assuming. `characters.refinery` reaches: the owner's detail read
(`detailOf`); NOT the library list (`summaryOf` builds an explicit field set with no `refinery`); NOT any
chat member surface (the roster projects `displayName`/`avatarAssetId` only — `verbs/roster.ts:137-156` — and
chat's card loads are host-scoped, server-side, for assembly); NOT the card wire (serde nulls it); and the
debug inspector's `refinery: unknown` sits behind the post-AUTHFIX-2 admin gate
(`entry/auth/seam.ts:302-334`). The only owner-crossing path is the handoff copy, which is §3.D.

### G. Prose slots — R1 owes NO fork strip, provided it homes them right

The per-GAME prose home was **retired by owner ruling on 2026-08-08** and the whole rpg cohort re-homed to
`preset` (`packages/contracts/src/prose-slot/index.ts:13-19`). `PROSE_HOMES` is now exactly
`["preset", "user"]`. So the question "what fork strips does refinery prose owe if games/forks carry refinery
config" resolves to: **none — because that storage no longer exists.** Two conditions:

1. R1's four slots (`refinery.score.system`, `.rewrite.system`, `.refine.system`, `.analyze.system`) home
   `user`, beside the discovery cohort. They are library-authoring prose, not per-preset generation voice.
   A per-session or per-character prose home would re-open a storage the owner just closed.
2. Prose overrides ride no portability bundle today (0 hits for prose in `contracts/portability`) — R1 must
   not add refinery prose to one. If a later stage makes prose portable, THAT change owns the strip question
   for every slot at once, not refinery alone.

Standing rules that still apply to the slot bodies: prose is owner-sacred (the owner signs the shipped
baselines, seeded from the extension corpus), each slot declares its `macros` mode, and the version bumps in
the same commit as any `text` change.

## 4. The R1 belt list — the checklist R1 builds against

Ordered by where it lands in the verb. Each is enforced or the lane is not done.

**Prompt assembly (untrusted in):**

1. `neutralizeMacros` every card-derived string and the guidance before splicing into a template (§3.C).
2. `guidance` parsed through `refineryGuidanceSchema`; session `name` through `refinerySessionNameSchema`.
3. Analyze always compares against the session's `original_card` snapshot, never a previous rewrite (the
   anti-drift invariant — a correctness rule, but also what keeps a steered rewrite from bootstrapping itself
   across iterations).

**Model output (untrusted back):**

4. `dropNullValues` before every stage parse (§3.B).
5. Parse dispatch through `REFINERY_STAGE_PAYLOADS` — one home, no per-stage re-spelling.
6. Strip stays; itemize the stripped keys into observability (§1 gap 5). Paths, never zod messages.
7. Bounded retry via `runStructuredTurn`; a second failure is a typed error, not a fallback write.

**Write-back to canon (the sharp end):**

8. **Ownership belt BEFORE any content verdict**, `ensureCharacterOwned`-shaped, leak-free NOT_FOUND (§3.E).
9. **Per-field allowlist**: only `REFINABLE_FIELDS`, only fields the SESSION's selection named. A payload
   entry naming a field outside the session's selection is dropped — the model does not get to widen its own
   apply scope. This is the belt that stops "card text instructs the model to rewrite `systemPrompt`" when
   the user never selected `systemPrompt`.
10. **Explicit user accept per field.** Apply is never automatic and never all-fields-by-default; the accept
    set comes from the client's `CompareBlocks` selection and is intersected with (9).
11. **Greeting-index assert at the verb** (§1 gap 3), validated against the LIVE card, not the snapshot.
12. **Re-validate through `updateCharacterSchema`** before the injected op (§3.A).
13. **Snapshot first** — `character.snapshot("auto: before refinery apply")` — the `restore.ts` reversibility
    precedent. Reversibility is the real mitigation for a rewrite nobody noticed was steered.
14. **`character` stays the only writer of `characters.*`**, including the `refinery` stamp (F6): injected op,
    typed in the domain's `contract/`, wired at `entry/compose`.
15. **Field-level heal + observable heal** on the signals read, landed together with the `score` tightening
    (§1 gap 2).
16. **Handoff-copy verdict stated and pinned** (§3.D).

**Rendering (R3, but decided now):**

17. Analysis and rewrite text render as TEXT, never HTML, never through a trusted markdown policy. This is
    model output derived from an untrusted card — it belongs on Streamdown's `untrusted` policy side (D43/D44),
    the same tier as card content itself.

## 5. GO / NO-GO

**GO.** R0's foundation is sound and its one exploitable class — unbounded model-authored payloads reaching
canon — is closed at the contract tier with red-first pins, on `main`, with the coupled suites and floors
green. Nothing in R0 needs to be rebuilt or reverted; every remaining item is additive work that belongs in
R1's own verbs and is enumerated in §4.

Two conditions on the GO, both cheap and both structural rather than discretionary:

1. §4 is carried by R1's DESIGN document before the lane builds, not discovered during review. The four items
   most likely to be dropped because they are invisible from the happy path: `dropNullValues` (§3.B),
   `neutralizeMacros` (§3.C), the `updateCharacterSchema` re-parse (§3.A), and the field-level heal (§1 gap 2).
2. The heal fix and the `score` tightening land in ONE change, in that order (§1 gap 2) — tightening first
   under today's whole-object catch would be a data-loss bug, not a hardening.

**Wants a human eye, not because it is wrong but because it is a product call:** the §3.D handoff-copy verdict
(carry the previous owner's private card critique to the new owner, or clear it — I recommend clear), and the
`ENTRIES_MAX = 108` / `PROSE_MAX = 4000` ceilings, which are judgement calls about how much critique a model
may write, not derivations. If a stage mode ever wants a longer form, raise the constant deliberately with its
test — do not let a payload class grow past its cap by exception.
