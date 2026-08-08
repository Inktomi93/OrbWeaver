---
kind: review
status: executed
updated: 2026-08-08
---

# Refinery R1 — the live untrusted-input flow (mandatory graduation security pass)

> **VERDICT: GO** (one LOW-severity belt-9 gap found and FIXED this pass, `11c3ec6e7`). R1
> (`domain/refinery` — 9 verbs, the stage engine, 3 substrates + the character-side belts, merged as
> `1abec875b`) carries every belt the R0 security pass (§4) prescribed. The untrusted-card → LLM →
> write-back surface is bounded on every leg I could reach: the injection stopper (intersection + selection
> fence + explicit accept) is verb-tier and — after this pass's fix — now fences on the greeting-index
> granularity too; the write-back re-validates against the card's own caps; the stamp op gates ownership in
> the SQL WHERE (not app-side); nothing on the refinery path runs the macro engine; and the derived-signal
> blob reaches no chat/prompt/macro consumer. No VULNERABLE finding remains. One INFO observation and two
> non-blocking coverage gaps noted.
>
> Threat model (unchanged from R0): a character card is UNTRUSTED text authored by a stranger (D44, serde
> header law). Prompt injection in the card can steer the model's structured payload; the payload zod
> schemas + the apply intersection are the belt between a steered model and a canon write.

## Method

Read IN FULL: `docs/design/refinery-r0.md` §9, the R0 security pass, and every touched file — the 9 verbs,
`persistence/queries.ts`, `substrate/{refine-prompt,stage-parse}.ts`, the tRPC router,
`character/persistence/refinery-ops.ts`, `character/persistence/queries.ts` (heal + `cardOf`),
`handoff-copy-write.ts`, `contracts/refinery/index.ts`, `contracts/character` (`updateCharacterSchema`),
`entry/compose/refinery.ts`, `infra/providers/roles/summarize.ts`. Traced downstream consumers of
`characters.refinery` by repo grep. Floor: the 14 refinery/character suites — **55 pass, no type errors**
(`tests/server/domain/refinery/**` · `tests/server/domain/character/persistence/refinery-ops.int.test.ts` ·
`tests/contracts/refinery/index.contract.test.ts`).

## Per-target verdicts

### 1. BELT-5 by-construction (card bytes never reach macro EXECUTION) — CONFIRMED-SAFE

The by-construction claim holds on the prompt path AND downstream of the write-back — the seam the brief
told me to break did not break.

Prompt path (four independent legs, all verified):
- **No macro engine in the domain.** `grep` of `packages/server/src/domain/refinery/` for
  `neutralizeMacros|resolveMacros|spliceProseTokens|substituteMacros|processMacros|@orb/kit/macro` returns
  only a *comment* in `refine-prompt.ts:8`. Zero engine imports.
- **All 12 prose slots are `macros:"none"`** (`contracts/refinery/prose.ts:189..310`).
- **`resolveProseText` ships verbatim.** Refinery calls it WITHOUT the `tokens` arg
  (`refine-prompt.ts:192,196,200,211,217,224`); with no tokens, `spliceProseTokens(text, undefined)` returns
  the text unchanged and is "a plain replace, never the macro engine" (`contracts/prose/index.ts:136-142`).
- **Card sections are CONCATENATED, not spliced** (`buildCardSections` → `parts.join`,
  `refine-prompt.ts:91-108`); the `## field\n<card text>` bytes ride verbatim.
- **`summarize` is a direct backend request-shaper**, not chat assembly — no macro pass
  (`infra/providers/roles/summarize.ts`). The macro engine lives in `domain/chat/assembly/`, which the
  refinery never touches.

Downstream of the write-back (the brief's real target):
- The **applied card fields** (description/greetings/systemPrompt/…) become ordinary card canon via
  `character.update`. Macros in them resolve at chat time exactly as any card's own fields do — which is the
  intended behavior (a `{{char}}` in a rewritten description must keep working; neutralizing would corrupt
  it). A rewrite is an owner-approved per-field edit, byte-identical in exposure to the owner typing it. No
  NEW macro path.
- The **stamped `characters.refinery` blob**: the ONLY readers repo-wide are the admin debug inspector
  (`foundation/observability/debug/inspect/config.ts:369`, admin-gated per R0 §3.F) and `card-merge.ts:44`
  (a field carry, no resolution). **No chat-assembly / prompt / macro consumer reads `characters.refinery`.**
  The analysis blob is display-only (belt 17: text-tier render, R3).

The design's documented deviation from the R0 §4 item-1 letter (`neutralizeMacros` on card text + guidance)
is therefore justified: neutralization is unnecessary (no execution path exists) and actively harmful (ZWSP
splitting rides the model's rewrite back into canon and kills the card's own macros). The R0 §3.C
prescription was explicitly conditioned on "if refine-prompt runs the assembled string through the macro
engine" — it does not.

### 2. The stamp WHERE belt — CONFIRMED-SAFE (non-vacuous)

`createStampRefinerySignals` (`character/persistence/refinery-ops.ts:30-49`): BOTH the read
(`.select … .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))`, line 35) and the
write (`.update(characters).set … .where(and(eq(id), eq(ownerId)))`, line 47) carry the owner predicate IN
the SQL WHERE. A foreign principal matches 0 rows → the update is a silent no-op (never an existence
signal). The `loadOwnedCard` read op is the same shape via `loadOwnedCharacterRow`. The pin is real and
non-vacuous: `refinery-ops.int.test.ts:55-76` seeds a stranger, calls `stamp({ownerId: stranger …})`, and
asserts the row is unchanged. Defense-in-depth: the caller (`run-stage.ts` dispatch) already derives
`characterId` from an owner-scoped session, so the WHERE is a second belt, not the only one.

### 3. Injection widening the apply set (belts 9/10/11) — NEEDS-FIX (FIXED THIS PASS, `11c3ec6e7`)

**One real gap, found by the parallel code-verifier and confirmed here: the selection fence honored
`selection.fields[]` but NOT `selection.greetingIndexes`.** A user who narrowed a session to a subset of
greeting indexes (e.g. only index 0) could have an unselected index (say 1) OVERWRITTEN if a prompt-steered
rewrite fabricated an entry for it AND the user accepted that entry — the index was never in the pipeline
(never fed to the model at prompt time via `selectedGreetingIndexes`, `refine-prompt.ts:52-59`), so its
"rewrite" is invented content reaching a slot the user excluded. This is exactly the scope-widening class
belt 9 exists to stop; the fields-level fence closed cross-FIELD widening but left the intra-greetings
granularity open. Severity is LOW as an exploit (requires the uncommon explicit-index-narrowing + a steered
rewrite + a user accepting a change to a greeting they didn't select), but it is a genuine hole in the
control's stated invariant and the R0 belt-9 wording ("only fields the selection named") under-specified the
greeting granularity that the selection schema carries as a first-class dimension.

**Fixed this pass** (`apply-fields.ts` `classifyAccept`, commit `11c3ec6e7`): the selection fence now has two
arms — the field must be selected AND, when the selection narrowed greetings to specific indexes, the
greeting index must be among them; an accept outside the selected indexes is dropped `not_selected` (reused,
not a new enum member — the greetingIndex rides the drop record so the client still renders the exact slot).
`undefined` greetingIndexes still means "every greeting" (contracts law), so the common case is unaffected.
Red-first: `apply-fields.int.test.ts` "the selection fence honors greetingIndexes" run RED against the
pre-fix source (it applied index 1), GREEN after. Floor: 56/56 refinery+character suites, `pnpm typecheck`
and `pnpm typecheck:graph` clean.

The rest of the intersection was and remains sound:
`classifyAccept` (`apply-fields.ts:118-160` post-fix) is the intersection, in itemized order:
`accepts ∩ rewrite.fields ∩ session.selection ∩ live-card-applicability`. The **selection fence** (step 3,
line 133: `!belts.selectedFields.includes(accept.field)` → `not_selected` drop) is the injection stopper: a
card that steers the model into producing a `systemPrompt` rewrite the owner never selected dies here.
`accepts` is the host's explicit client choice (belt 10) — the model cannot add to it, and `characterId`
for the write is derived server-side from the owned session (`apply-fields.ts:51,66,75,76`), never client
input, so the write can never be redirected to another character.

The greeting-index biconditional is enforced AT THE VERB (not the contract): both arms
(`apply-fields.ts:121-125`) plus the LIVE-card bound (`accept.greetingIndex >= belts.liveGreetingCount` →
drop, line 137). Off-by-one surface is closed twice — the `>=` drop and `buildPatch`'s
`greetings[i] !== undefined` guard (line 157). A greeting deleted since session start is dropped, never
re-created. `contracts/refinery` additionally caps the payload's `greetingIndex` at `GREETING_INDEX_MAX=99`
as a native keyword.

### 4. `strippedKeys` never carries content (belt 6) — CONFIRMED-SAFE

`diffKeyPaths`/`walk` (`stage-parse.ts:37-70`) pushes dotted KEY PATHS only (`out.push(path)` where `path`
is composed from object keys / array indices); no value is ever emitted. The capture is taken AFTER
`dropNullValues` (line 24-26) so a protocol-null absent-encoding under `strict-compatible` does not itemize —
only schema-unknown keys do (the tamper signal is not drowned). The run-view schema documents "dotted paths,
never content" (`contracts/refinery/index.ts:277-281`).

### 5. `applyFields` re-parses `updateCharacterSchema` (belt 12) — CONFIRMED-SAFE

`apply-fields.ts:72` runs `updateCharacterSchema.parse(buildPatch(liveCard, chosen))` before the injected
op. `updateCharacterSchema = createCharacterSchema.partial().extend(...)` (`contracts/character:197`) — every
text field `.max(TEXT_MAX=100_000)`, greetings each `.max(TEXT_MAX)` via `greetingSchema`, `depthPrompt` via
`cardDepthPromptSchema` (prompt `.max(TEXT_MAX)`). A steered model cannot write past the card's own cap into
a card field. The re-parse is non-partial: the rewrite payload's `REWRITE_TEXT_MAX` equals `TEXT_MAX`, so a
legitimate rewrite is never refused (a throw here would be OUR defect — the header says so).

### 6. `dropNullValues` under D126 strict-compatible (belt 4) — CONFIRMED-SAFE

`buildStageParse` (`stage-parse.ts:21-27`) wraps every stage's payload schema in a `z.preprocess` that runs
`dropNullValues` BEFORE validation. Applied uniformly to all three stages through the `REFINERY_STAGE_PAYLOADS`
dispatch (`run-stage.ts:293`). This is what keeps `strict-compatible`'s `{...:null}` optional encoding from
failing every rewrite (`z.number().optional()` rejects `null`), and — because capture is after the drop — it
does not drown the tamper signal.

### 7. Ownership reads / oracle — CONFIRMED-SAFE

No `fetchOwned` on refinery tables (correct — the tables carry no `ownerId`; ownership DERIVES through the
character join, D23). Every session read joins `characters` with the owner predicate in the WHERE
(`queries.ts:54-73`). Run rows are reachable ONLY through a session id that already passed
`loadOwnedSessionRow` — verified at every consuming verb: `getSession:11`, `listRuns:13`, `deleteSession:13`,
`updateSession:24`, `applyFields:39`, `run-stage/iterate` (`executeStage` re-loads owner-scoped each call),
`listSessions` (owner-scoped `listOwnedSessionRows` + `latestVerdictsOf` fed only owner ids). Foreign and
absent collapse to the identical `DomainNotFoundError` — no enumeration oracle. `deleteSession`/`updateSession`
write by bare `eq(id)` only AFTER the belt threw for a foreign id (the shared-belt pattern; safe).

### 8. Adversarial sweep beyond the list

- **Write redirection: closed.** `applyFields`/`runStage`/`iterate`/`stamp` all derive the target
  `characterId` from the owner-scoped session, never from client input. There is no verb where a caller
  supplies a `characterId` to write to except `startSession`, where `loadOwnedCard` scopes it (foreign →
  NOT_FOUND).
- **Handoff clear (belt 16): confirmed.** `handoff-copy-write.ts:117` sets `refinery: null` and it OVERRIDES
  the earlier `...card` spread (line 95) — the old host's private critique does not cross the owner boundary.
  Every other cross-boundary path already clears it (serde nulls the wire; only same-owner `duplicate`
  carries it).
- **Heal split (belt 15): confirmed.** `refinerySignalsReadParser` (`character/persistence/queries.ts:38-50`)
  heals `score` and `analysis` independently, each observably (`addSpanEvent("character.refinery.heal", {arm}`),
  with the outer `.nullable().catch(null)` only for the not-an-object case; the contract `score` tightened to
  `.min(1).max(10)` in the same change (`contracts/character:73`).
- **INFO (not a hole): `accepts` has no `.max()` at the wire** (`routers/refinery.ts:82`,
  `z.array(...).min(1)`) — unlike the payload's `ENTRIES_MAX`. The effective write is still bounded (applied
  ⊆ rewrite payload ⊆ 108 entries ⊆ selection), so this is a self-DoS on the owner's own request bounded by
  body-size limits, not a canon or cross-tenant risk. Left as-is; flag if a future non-owner caller appears.
- **Nice-to-have test gap (non-blocking): `apply-fields.int.test.ts` has no explicit foreign-session
  NOT_FOUND case.** It reuses the identical `loadOwnedSessionRow` belt that is proven foreign-safe in six
  sibling verb tests (`get-session`, `list-runs`, `delete-session`, `update-session`, `run-stage`,
  `start-session` + `queries.int`). The belt is proven; the sharp-end verb just doesn't restate it. Adding a
  one-line foreign-apply pin would be cheap insurance.
- **Coverage gap (non-blocking, agreeing with the code-verifier): the `depthPrompt → not_applicable` branch**
  (`apply-fields.ts:148-150`, a depth-prompt rewrite when the LIVE card has no note to hang it on) is unpinned
  by any test. Not a defect — the branch is correct and the overlay mirrors it (`refine-prompt.ts:145-147`) —
  but it is the one classify arm with no red-first witness. Worth a pin when R3 touches this verb.

## For the human eye (product calls, not defects — carried from R0)

- The §3.D handoff verdict landed as CLEAR (my R0 recommendation). Owner may override — it is a product
  decision about whether a new owner inherits the previous owner's private card critique.
- The `PROSE_MAX=4000` / `ENTRIES_MAX=108` payload ceilings are judgement calls (how much critique a model
  may author), not derivations. Raise deliberately-with-a-test if a mode ever needs a longer form.

## GO / NO-GO

**GO.** The live untrusted-input flow is now enforced end-to-end: injection cannot widen the apply set past
the owner's selection — including the greeting-index granularity, closed this pass (`11c3ec6e7`) — plus the
explicit accept; the write-back re-validates against the card's own caps; the stamp op gates ownership in the
SQL WHERE; strip/heal/null-drop are observable and correct; card bytes reach no macro-execution path on the
prompt leg OR downstream; and the derived blob is display-only, owner-scoped, and cleared on the one
owner-crossing copy. 56/56 suite green, both typecheck programs clean. One LOW belt-9 gap found and fixed;
nothing left needing a human security decision beyond the two R0 product calls above.
