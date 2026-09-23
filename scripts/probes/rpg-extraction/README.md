# rpg-extraction coverage probe

Throwaway spike harness behind the one-call-tools decision. The decision it fed is D112.

**Deleted 2026-08-22 (#426), per the research-zone-assessment disposition:**
`run.ts`, `run-coverage.ts`, `native-wire-probe.ts`, `native-format-roundtrip.ts`,
`effort-ladder-native-vs-or.ts`, `effort-reasoning-probe.ts`, `replay-toolround.ts` — four were
self-declared `ARCHIVED 2026-08-02 — pre-R2R3 vocabulary … do NOT run against the current contracts`
(the actor-state reshape retired the `hpDelta`/`setHp` wire body they read), the other two were
superseded by `openrouter/f5-effort-translation.ts`'s more rigorous, committed answer. Recover any of
them with `git log --diff-filter=D --oneline -- scripts/probes/rpg-extraction/<path>` →
`git show <sha>^:scripts/probes/rpg-extraction/<path>`. Their measured value lives on in this
directory's `SPEC.md` + `SPEC-coverage.md`.

`real-cheap-toolround.json`, `real-reliable-structured.json`, `real-narrative-turn.json`, and
`captures.json` all carry the retired `hpDelta`/`setHp` party vocab (pre-actor-state-reshape) and lost
their only in-tree readers with the deletion above. They are KEPT anyway — they are a frozen wire-shape
record: the spike doc (`:1255-1256`) still cites them by name as the corpus behind its findings. Do not
run anything against them as if they were live fixtures; mint fresh corpora instead.

`card-teach-probe.ts` is the **F2** harness (§4h) — a 10-turn scene of pure card OPPORTUNITIES, the real
`buildLiteReminder` with only the card-teach block swapped per arm (A–H), scored twice: `emitted` (a `:::card`
line in the text) vs **`rendered`** (a `card` span out of the production tokenizer). That split is the whole
finding — Sonnet emits 95%, we render 73%, the gap is a malformed open fence we silently drop.

| var | effect |
|---|---|
| `CARD_ARMS` | subset, default `A,B,C,D,E` (`F`/`G`/`H` are opt-in) — one arm ≈ $0.18 |
| `CARD_OUT` | transcript path (default `card-teach-out.json`, gitignored) |
| `CARD_DRY=1` | print each arm's assembled injection and exit — **no spend** |
| `CARD_SCORE=<file>` | re-score a saved transcript with the current scorer — **no spend** |

Sampled outputs: `CARD-TEACH-SAMPLES.md`.

`out/`, `out2/`, `out2-medium/` hold the results — gitignored, so they live on disk only. Everything here
was recovered from a session scratchpad on 2026-07-30; don't let it drift back to `/tmp`.
