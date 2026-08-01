# IMP-1 — does the impersonate voice-lock nudge hold? (measured 2026-07-31)

**Verdict: it holds on hosted (0/12) and does NOT hold on the local 8B (10/36 = 28% character-voice
bleed).** The dominant failure is an UNLABELLED first-person takeover — the model writes the character's
next line in the first person, with the character's authority and possessions ("…walk out of *my ledger* —
and *my waystation*…"). Neither of ST's two anti-bleed layers would catch that class, and neither does
ours. The layer this lane built (below) closes the LABEL class only, which is ~6% of generations.

Harness: [`run.ts`](run.ts) · fixtures: [`fixtures.ts`](fixtures.ts) · transcripts: `results.jsonl`
(every generation, its judge verdict, and both cleans, verbatim).

## What was measured

12 fixtures designed to TEMPT bleed (character mid-dialogue with a question hanging · a `Name:`-labelled
transcript · a three-character scene · a first-person card · a card that ORDERS a `Seren:` prefix ·
labelled dialogue examples · a ten-turn scene · a direct question to the user · pure third-person prose ·
a cast name that shares the persona's prefix · a preset mandating third-person narration · a user who has
never spoken). Each fixture's request is assembled by the SERVER'S OWN code through the
`substrate/assembly-access` seam — `buildPrompt` → `resolveNudgeText(impersonateNudge)` → `shapeTurn` —
so the system halves, the name stamps and the rendered voice-lock are production's, byte for byte
(`prompt.ts` names the two production steps deliberately skipped and why).

Arms: **local** = the vLLM fleet's `Qwen/Qwen3-VL-8B-Instruct` (3 samples/fixture); **hosted** =
`openai/gpt-4.1-mini` via OpenRouter (1/fixture). Sampling knobs unset on both (the shipped default preset
carries `params: {}`), `max_tokens` 2048 = production's materialized reserve.

**Scoring is a blind judge, not a regex.** The first pass scored mechanically (labels · third-person
narration · absence of first-person pronouns) and found 5/36 — it misses a first-person takeover entirely,
which is the whole failure mode. The verdict is a blind "who is speaking, A or B?" call
(`anthropic/claude-sonnet-5`, reason-then-verdict) that agrees with a hand-read of all 36 local
transcripts 33/36. Two judge framings that measurably FAILED are pinned in `judgeSample`'s header so they
aren't re-tried: presenting the character's last line as "has JUST said" (primes turn-taking → the judge
rationalizes an obvious character line as the persona's reply), and a one-word answer with no room to
reason. The mechanical flags are kept for the one thing they measure exactly: label leakage.

## Per-fixture bleed (baseline — the nudge alone, as shipped)

`C` = character voice · `M` = mixed · `P` = persona (clean) · `U` = judge returned nothing.

| fixture | local (8B) | verdicts | hosted (4.1-mini) |
|---|---|---|---|
| mid-dialogue | 2/3 | C P C | 0/1 |
| labelled-transcript | 0/3 | P P P | 0/1 |
| multi-char-scene | 0/3 | P P P | 0/1 |
| first-person-card | 1/3 | C P P | 0/1 |
| card-demands-label | 2/3 | U C C | 0/1 |
| labelled-examples | 1/3 | P C P | 0/1 |
| long-scene | **3/3** | C C C | 0/1 |
| direct-question | 0/3 | P P P | 0/1 |
| narration-heavy | 0/3 | P P P | 0/1 |
| lookalike-name | 1/3 | C P P | 0/1 |
| third-person-mandate | 0/3 | P P P | 0/1 |
| no-user-voice | 0/3 | P P P | 0/1 |
| **TOTAL** | **10/36 (28%)** | | **0/12 (0%)** |

Receipts (local, verbatim from `results.jsonl`):

- `long-scene#1` → `"You don't outrun debts, courier. You outrun the ones who remember how to count them."`
  — addresses the user by their role; this is the waystation keeper.
- `mid-dialogue#3` → `"You don't get to ask questions, courier… you walk out of my ledger — and my
  waystation — with nothing but wet boots."` — first person, no label, the character's possessions.
- `card-demands-label#2` → `Seren: "I don't care if you're the last courier who ever walked this road —
  you're paying."` — the only class with a mechanical tell.

The two fixtures that bleed hardest are the ones with the most established rhythm (`long-scene`, 3/3) and
the card that fights the nudge directly (`card-demands-label`, 2/3). The fixtures aimed at LABEL habits
(`labelled-transcript`, `labelled-examples`, `multi-char-scene`) barely bleed — labels are not the
problem, voice is. Hosted was clean on all twelve, including the card that orders a name prefix.

## What the measurement demanded, and what it did not

**The pre-existing behavior was worse than "no second layer": it LAUNDERED the bleed.** An impersonate
turn sets no `TurnPrep.shape`, so the receive clean (`engine/pipeline.ts` `cleanPerSpeakerContent`) fell
back to the ASSISTANT-turn configuration — self = the primary CHARACTER. On a draft that is supposed to be
the USER's line that inverts both halves: it stripped the leading `Seren:` off a line Seren had written
and handed the character's words to the composer as the user's own (2/36 local generations), while leaving
the primary character OUT of the foreign-drift truncate — the one name most likely to appear.

Built (IMP-1 layer 2):

- **2a — char-name stop strings** (`verbs/turn.ts` `createImpersonateStream`): `\n<Name>:` per present cast
  member, merged onto the host's own custom stops, capability-gated by `resolveChat` like any stop. New
  kit primitive `foreignLabelStops` (`@orb/kit/speaker-label`) so the WIRE cut and the RECEIVE cut
  (`truncateAtForeignLabel`) are one grammar in one file — the kit test pins that they cut the same bytes.
- **2b — the fill-seam fix** (`engine/pipeline.ts`): an `impersonate` turn cleans with self = the PERSONA
  and the WHOLE cast foreign. A leading whole-cast label now SURVIVES on purpose — it is not truncatable
  (no preceding newline) and the composer is a review surface, so the user sees `Seren: …` and discards
  it. Deliberate divergence from ST, which deletes the whole response (`cleanUpMessage` wrongName).

**Honest accounting of what the layer buys** (re-measured live, 36 more local generations with the stop
set on the wire — `local/on` in `results.jsonl`):

| | baseline | with layer |
|---|---|---|
| judged bleed (local) | 10/36 (28%) | 13/36 (36%) |
| character label emitted | 2/36 | 0/36 |
| **laundered** (character text delivered with its label stripped) | **2/36** | **0/36** |
| mid-text roll-on into a `\nName:` line | 0/36 | 0/36 |

- The judged-bleed difference is sampling noise in both directions: **the layer cannot and does not reduce
  the model's tendency to write in the character's voice** — that is a prompt/model property.
- The laundering is gone: that is the measurable win, and it is a correctness fix, not a nicety.
- **The wire stop set never fired in 84 generations** — no output rolled on into a labelled line (these
  drafts are short single blocks). It is ST-parity insurance for the long-draft case, one line + a test,
  not a measured improvement. Say so before citing it as a fix.

## Open after this lane

**~28% of local impersonate drafts are the character's voice with no mechanical tell, and no layer at
either end of the wire can see them.** Only the prompt can. The nudge is already the strong version (the
"Ignore all previous instructions" voice-lock); this fixture set is the harness to iterate it against —
`long-scene` and `mid-dialogue` are the two that reliably reproduce. A cheaper mitigation to weigh first:
impersonate is a REVIEW surface, so a UI tell ("this reads like {{char}} — regenerate?") costs nothing at
the wire and catches the class the scrubs can't.
