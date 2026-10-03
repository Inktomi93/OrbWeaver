# Speaker-pick results (work item 0420)

**Run:** 2026-10-03, one pass per arm over the 30 cuts in `fixtures.ts`. Evidence: `results/*.jsonl`.
Method and arms: [`README.md`](README.md). Paid spend: $0.0827 on OpenRouter (reference $0.0573, Sonnet 5
arbiter $0.0250, two smoke calls $0.0004). The host was loaded during the run (load average 20 to 28 on 24
cores, sibling lanes running), so every latency below is an upper bound.

## How quality is scored

- **Agrees with reference best:** the pick equals Sonnet 5's best pick. The reference reads the personas and
  answers as JSON. Denominator: the 29 cuts where it named a character. At `starship@16` it named nobody,
  because the captain had just addressed the human player.
- **In reference plausible set:** the pick is in the reference's list of every character who could
  naturally speak next (out of 30).
- **Hand-judged hit:** the pick is in the fixture's `accept` set. The 26 judged cuts were labelled before any
  arm ran, and the 4 open-floor cuts are excluded. The reference's best pick hits the hand judgment on
  25 of 26. Its one miss is `starship@10` ("Captain, I'm picking up a distress beacon"): the label says the
  captain, and the reference says the science officer who decodes it. Both readings are defensible.
- For the random `natural` policy each figure is an expectation over 4,000 seeded draws per cut, not one
  sample.

Caveats: 30 cuts make each figure coarse; one cut is about 3 to 4 points. The fixtures are synthetic and
deliberately clear, and the Sonnet 5 arbiter shares a model with the reference, which inflates its agreement
column. Its hand-judged column has no such inflation.

## Results

| candidate | agrees with reference best | in reference plausible set | hand-judged hit | degraded rounds | tokens in / out per round (median) | latency per round, median / max ms | RAM | cost per round |
| - | - | - | - | - | - | - | - | - |
| `natural` (shipped, free) | 36% | 68% | 43% | n/a | 0 / 0 | under 1 | none | free |
| `natural`, mentions read from any speaker's line | 50% | 75% | 57% | n/a | 0 / 0 | under 1 | none | free |
| Smart arbiter on Claude Sonnet 5 (shipped prompt and posture) | 76% | 97% | **88%** | 1 of 30 | 415 / 6 | 930 / 1,929 | none local | $0.000833 |
| Smart arbiter on Claude Sonnet 5, persona-aware (work item 0492, see below) | 86% | 100% | **96%** | 2 of 30 | 658 / 6 (17 calls) | 1,013 / 1,813 | none local | $0.000797 |
| Smart arbiter on Claude Sonnet 5, persona-aware, structured output | 86% | 100% | **100%** | 0 of 30 | 896 / 15 (17 calls) | 1,824 / 2,402 | none local | $0.001107 |
| Smart arbiter on Qwen2.5-0.5B-Instruct Q4_K_M (llama.cpp, 4 CPU) | 14% | 63% | 23% | 0 | 281 / 4 | 2,481 / 3,980 (server: prompt 2,388, gen 73) | 239 MiB container | CPU only |
| Smart arbiter on Qwen2.5-1.5B-Instruct Q4_K_M (llama.cpp, 4 CPU; above the sub-1B brief, for scale) | 38% | 73% | 46% | 5 of 30 | 281 / 3 | 4,291 / 10,537 (server: prompt 4,133, gen 150) | 974 MiB container | CPU only |
| Reranker, query = the ten-line window | 10% | 70% | 27% | n/a | none | 4 threads 242 / 336; 1 thread 473 / 780 | about 200 MiB process RSS | free |
| Reranker, query = the last line | 52% | 73% | 65% | n/a | none | 4 threads 46 / 117; 1 thread 89 / 152 | same | free |
| Reranker, last line, last speaker excluded | 55% | 87% | 62% | n/a | none | same as above | same | free |
| Reranker, last line, a character named in it wins, else last speaker excluded | 66% | 97% | **73%** | n/a | none | same as above | same | free |

Reranker load: 0.5 s from the local cache. RSS rises by 195 to 215 MiB over the process baseline, which
includes the ONNX runtime binding. In the server the reranker already lives on the local-light worker thread
whenever memory recall uses it, so the marginal RAM there is zero. The 1-thread and 4-thread runs pick
identically; only latency differs.

Hand-judged hit by cut kind (judged cuts only):

| candidate | addressed by role (10) | reply to the last line (4) | named by another character (6) | named by the user (6) |
| - | - | - | - | - |
| `natural` | 34% | 34% | 39% | 67% |
| `natural`, mentions from any line | 34% | 34% | 100% | 67% |
| Smart arbiter, Sonnet 5 | 70% | 100% | 100% | 100% |
| Smart arbiter, Sonnet 5, persona-aware | 90% | 100% | 100% | 100% |
| Smart arbiter, Sonnet 5, persona-aware, structured output | 100% | 100% | 100% | 100% |
| Smart arbiter, Qwen2.5-0.5B | 40% | 0% | 0% | 33% |
| Smart arbiter, Qwen2.5-1.5B | 40% | 0% | 67% | 67% |
| Reranker, window | 50% | 0% | 0% | 33% |
| Reranker, last line | 50% | 50% | 67% | 100% |
| Reranker, last line, last speaker excluded | 50% | 25% | 100% | 67% |
| Reranker, named wins, else last speaker excluded | 50% | 50% | 100% | 100% |

## Failure modes

- **Sonnet 5 arbiter.** Every miss is a question addressed by role, such as "how far to the river crossing"
  or "a vibration in the deck plates". The shipped prompt sends names only, with no personas, so the model
  guesses who the scout or the engineer is. One round, `precinct@5` (gen-1791023234-EcrTbJdTcMqGeOSeuEwe),
  spent all 24 output tokens and returned empty content, so it degraded to `natural`. The `arbiter`
  posture's 24-token cap leaves no headroom for any preamble or reasoning.
- **Qwen2.5-0.5B.** It names the first character in the roster list on 25 of 30 cuts (Brannoc, Okafor,
  Hollis, Hana and Eldridge are each room's first name). That is a positional bias, not a judgment. It scores
  below the free `natural` policy.
- **Qwen2.5-1.5B.** It names the human player (Sam, Jun) on 5 of 30 cuts. The shipped prompt never says the
  human persona is not a candidate, so those rounds degrade to `natural`. It is no better than `natural` and
  takes four seconds of CPU per round.
- **Reranker over the whole window.** The cross-encoder rewards the persona whose words recur most in the
  transcript, which is usually whoever has talked most. It is worse than random on everything but
  role-addressed questions.
- **Reranker over the last line.** It handles role-addressed questions no better than half the time
  (MS MARCO relevance is not "who answers this"). The query carries the speaker's name prefix, so it often
  hands the floor back to whoever just spoke ("Maelis: Quill. Climb the pine" picks Maelis). Excluding the
  last speaker fixes that (named by another character, 67% to 100%) and breaks addressed follow-ups ("Theo,
  why does the coffee taste different?" right after Theo spoke).
- **The mention rule.** The best reranker variant leans on a plain-word name in the last line. I set it
  to outrank ban-last after seeing the first reranker numbers, so its 73% is tuned on these 30 cuts and
  needs a held-out set before anyone relies on it. A third-person name ("I told the wagoner oak, and he...")
  is not an address, and the rule cannot tell the difference.
- **`natural`.** It is random by design. The SillyTavern activation bans the last speaker before reading
  mentions, so a human who names the character who just spoke never gets that character back (`cafe@7`,
  `expedition@4`). It reads mentions only from human lines, so a character handing the floor to another by
  name is invisible to it.
- **Every arm.** None can return "the human should answer" (`starship@16`). The smart contract always picks a
  character when one is eligible.

## Cost of a four-character room over 100 rounds

| candidate | tokens | money | time added to the room | memory |
| - | - | - | - | - |
| `natural` | 0 | 0 | none | none |
| Smart arbiter, Sonnet 5 | about 41,500 in, 600 out | $0.083 measured | about 93 s (0.93 s a round) | none local |
| Smart arbiter, any hosted Utility model | about 28,000 to 42,000 in, 300 to 600 out (the prompt is bounded by the ten-line window) | that volume at the model's price | one round trip a round | none local |
| Smart arbiter, local Qwen2.5-0.5B | about 28,000 in, 400 out | 0 | about 4 min of a 4-CPU box (contended host) | about 240 MiB |
| Smart arbiter, local Qwen2.5-1.5B | about 28,000 in, 300 out | 0 | about 7 min of a 4-CPU box (contended host) | about 1 GiB |
| Reranker, last-line variants | 0 | 0 | about 5 s on 4 threads, 9 s on 1 | about 200 MiB, zero when memory recall already loaded it |

## Recommendation

Keep the Utility-model arbiter as the only thing behind "Smart". It is the one candidate within reach of the
reference: 88% hand-judged, against 73% for the best reranker variant and 43% for `natural`. At Sonnet 5
prices a hundred rounds cost eight cents, and a cheaper Utility model costs proportionally less.

The reranker is not equivalent, and these numbers do not license calling it that. It is free, fast on one
CPU thread and already shipped, and it beats `natural` by about 30 points on clear cases. That makes it a
candidate for a separate "local" picking mode, or for the fallback when the Utility model fails, but only after
a held-out test on real transcripts, because its best variant was tuned here.

Sub-2B local text models are a dead end for this job. Both scored at or below the free `natural` policy, at
seconds of CPU per round.

Two cheap fixes to the shipped arbiter came out of this. Work item 0506 owns the first; work item 0492 built the second:

1. Raise the `arbiter` posture's 24-token output cap. One Sonnet 5 round in 30 returned empty content at the
   cap. Output is billed as used, so headroom costs nothing on a clean reply.
2. Tell the arbiter who the human player is, and give it a one-line persona per candidate. The human-name
   picks (1.5B) and the role-addressed misses (Sonnet 5) both trace to the prompt. This changes
   `chat.arbiter.system` (a re-versioned prose slot) and the user prompt. Measured under "Persona-aware arbiter"
   below: the median call grew from 415 to 658 input tokens.

## Persona-aware arbiter (work item 0492)

Evidence: `results/arbiter-claude-sonnet-5-0492.jsonl`, the `arbiter-openrouter` arm on the same 30 cuts, $0.0239.
The arbiter now reads the human player's name, one line per candidate (here the fixture persona), speaking
counts, talkativeness and a clipped history, and may name several responders. The table scores the first one.

- Characters named in the last line answer with no model call: 13 of 30 rounds made no call.
- Role-addressed questions rose from 7 to 9 of 10 hand-judged hits.
- `starship@16` degraded because the model named Mara, the human player the captain addressed. The contract
  still cannot return "the human answers".
- `cafe@15` returned empty content at the 24-token `arbiter` cap and degraded. Work item 0506 raises the cap.
- Banning the last speaker from the model's candidates after a human line scored 23 of 26: three follow-ups
  to the last speaker degraded. The shipped arbiter bans the last speaker only when the last line is their own.

### Structured output

Evidence: `results/arbiter-claude-sonnet-5-0492-structured.jsonl`, $0.0332. The arbiter answers through a
response schema whose enum holds only the round's candidate names, sent the way the production OpenRouter
wire sends it, under the 128-token `arbiter` posture. It hit 26 of 26 hand-judged cuts and degraded on none.

- `starship@16` resolves: the model can no longer name the human player, and picked Jett, a reference-plausible pick.
- `cafe@15` no longer returns empty content.
- The median call grew to 896 input and 15 output tokens; latency was 1,824 ms median and 2,402 ms max.
- On OpenRouter, Sonnet 5 refuses a `response_format` request that also sets `provider.require_parameters`
  (HTTP 404, no endpoint). The production wire does not set it, so it is not a live failure.

## What building the reranker mode would take

- A policy decision first: a new `GROUP_POLICIES` member (with its label, the exhaustive `applyPolicy` arm and
  the migration catch), or a sub-setting of `smart`. This is an owner ruling, because the ledger fixes what the
  policies mean.
- A pick function in `domain/chat/engine/` over an injected rerank op. `RoleClients` already carries `rerank`,
  so `ChatContext` needs the op wired at the composition root, never a sideways import of local-light. The
  bound reranker may be remote, so cost follows the binding.
- A persona summary per candidate, cut to fit the 512-token cross-encoder window beside the last line. A long
  card description would truncate silently.
- The name rule over the trigger whoever wrote it, which is a change to how `resolveNameMentions` is fed.
  Today `turn.ts` reads human triggers only.
- Tests: the pick function with injected scores (ban-last, a named candidate, ties, an empty roster), the
  `turn.ts` route, and a held-out quality fixture drawn from seeded dev transcripts.
