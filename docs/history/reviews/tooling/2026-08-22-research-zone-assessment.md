---
kind: review
status: archived
updated: 2026-08-30
---

# Research-zone assessment — per-file tool-potential vs research-keep vs delete

Lane `scripts-assess`, read-and-judge, owner-ordered 2026-08-22. Every file below was read IN FULL.
The task was to CHALLENGE `scripts/README.md`'s classification per file, not restate it.

## Method + its ceiling (stated, not hedged)

- **Every `.ts` under `scripts/` compiles against today's tree.** `pnpm typecheck:graph`
  (`node scripts/ts7.cjs --noEmit -p tsconfig.json`) exited **0 with empty output** on 2026-08-22.
  `tsconfig.json:46-60` `include`s `"scripts"`, and its only `scripts/` exclusion is
  `scripts/probes/st-goldens/sillytavern-runtime` (`:141`). So "imports resolve · seams alive · type
  contracts still match" is a MEASURED fact for the whole set, not an inference.
- **That is the honest ceiling for the model rigs.** The sdk probes, openrouter probes, impersonate,
  rpg-extraction and st-goldens all spend live quota / drive GPUs / boot a foreign app. Nothing here
  was EXECUTED. Where I say "runnable", I mean *import-traced + typechecked + its named production
  symbols exist*, never *I ran it*.
- **Seam-liveness receipts** are exported-symbol reads on today's tree, listed per rig.
- **`pnpm ast` is BLIND to `scripts/`.** Its corpus is
  `packages/*/src, tests, tooling/src/verify/gates` (+workspace) — measured
  `scanned=5430`, and zero of those files are under `scripts/`. Every liveness claim below therefore
  uses literal `rg`/`grep` with an explicit scope, and I say so rather than citing an `ast` zero.

## Headline challenges to the current classification

Three rows in `scripts/README.md` (and its source, `docs/design/tooling-package.md` §2.7) do not
survive a full read.

### C1 — `dev/oracle-steady-clone.sh` is NOT an "operator one-off". It is a live golden regenerator.

`docs/design/tooling-package.md:133` and `scripts/README.md` §"Operator one-offs" both file it beside
`sandbox.sh`. The tree disagrees:

- It writes `tests/support/fixtures/parity/neo-reference.json` (`oracle-steady-clone.sh:32`, `:224-235`).
- `tests/support/parity-runner.ts:111` loads exactly that file (`loadReference()`).
- `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` asserts against it.
- That spec is in the **live `parity` vitest project** — `vitest.config.ts:211`
  (`include: ["tests/**/*.parity.test.ts"]`), driven by `pnpm test:parity` (`package.json:80`), which
  is a `verify --full` tier.
- The oracle's main arm is **wired, not skipped**: `parity-runner.ts:118` states *"Assembly landed and
  `runOrbweaverShape` IS wired (it calls `shape()` below)"*, and `UNSKIP_WHEN` (`:124`) now names only
  the LIVE-backend cache-token tier.

So this script is a build-time regenerator whose output a committed test asserts on — the same hazard
class as the fabrication baseline (never regenerate on a shared/multi-lane tree). Filing it as an
operator throwaway invites exactly the delete that breaks `pnpm test:parity`.

### C2 — "the RESULTS carry the value, so the script is deletable" is FALSE for `rpg-extraction/`.

`scripts/README.md` credits the rig with "the RPG structured-extraction probe corpus + committed
`SPEC*.md` verdicts". The corpus is real; the *results* are not in git. `git ls-files
scripts/probes/rpg-extraction/` returns **20 paths**: 4 `.md`, 5 `.json` (`captures.json`,
`real-{cheap-toolround,narrative-turn,reliable-structured}.json`, and nothing else), 10 `.ts`, 1
`.gitignore`. Everything under `out/`, `out2*/`, `f1-*/`, `v2/`, `vllm-1/`, plus `steer-out.json`,
`steer-real-out.json` and `card-teach-out*.json`, is gitignored by
`scripts/probes/rpg-extraction/.gitignore` (`*/` + explicit flat-file rows). The durable value is in
`docs/design/rpg-extraction-one-call-spike.md`, `SPEC.md`, `SPEC-coverage.md` and
`CARD-TEACH-SAMPLES.md` — **not** in a results artifact a delete would preserve.

Contrast `openrouter/`, where the claim IS true: `results/{f4,f4a,f5,or5,or5b,or7,or7b}.jsonl` are all
git-tracked (`git ls-files scripts/probes/openrouter/`), re-included by that dir's own `.gitignore`
negation (`!results/`).

### C3 — four `rpg-extraction` harnesses self-declare ARCHIVED-DO-NOT-RUN in their own first line.

`run.ts:1`, `run-coverage.ts:1`, `native-wire-probe.ts:1`, `native-format-roundtrip.ts:1` each open
with: *"ARCHIVED 2026-08-02 — pre-R2R3 vocabulary (hpDelta et al., retired by the actor-state
reshape); … do NOT run against the current contracts."* The classification table does not carry that
distinction, so the rig reads as uniformly "research-keep, recent use (2026-08-17)" when four of its
ten scripts are explicitly retired and two more are built on the retired corpus.

(The vocabulary claim is half-true and worth recording precisely: `hpDelta` still exists on today's
tree in 6 files — `contracts/src/rpg/{config,tools,profile}.ts`, `kit/src/json-schema/index.ts`,
`server/src/domain/rpg/tools/{index,apply}.ts`. What actually died is the *captured wire body* these
four read: `real-cheap-toolround.json` froze `poolDeltas` / `set_widget_value` /
`presentUpsert.customFields`, per `local-8b-vehicles.ts:9-11`. So they still RUN; they measure a
surface we no longer ship.)

---

## Per-file verdicts

### The agent-sdk behavioral rig — `scripts/probes/sdk-*.ts`

Shared seam check (all six): every named import resolves to a live export today —
`buildClaudeSdkEnv`, `buildClaudeOpenRouterEnv`, `consumeTurnStream`, `dynamicContextOptions`,
`firewallBase` from `packages/server/src/infra/providers/backends/agent-sdk/index.ts`;
`buildSeedFrames`, `InMemorySessionStore`, `SessionCache`, `seedSessionId`, `toSeedTurns`,
`SeedTurn` from `.../agent-sdk/session/index.ts`. Installed SDK is `@anthropic-ai/claude-agent-sdk`
**0.3.216**, and `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` (imported by `sdk-behavior-probe.ts:20`) is present
in its `sdk.d.ts`. Seams: **all alive.**

| file | verdict |
| - | - |
| `sdk-cache-probe.ts` | **RESEARCH-KEEP (load-bearing).** `Tier-3b-Providers.md:120` names it BY PATH as the reproduction for the agent-sdk cache matrix — "re-run after every SDK bump". A law doc cites it; it is not deletable. Its s7 arm is a *documented negative* (seed-frame `api_system` is a dead channel) kept deliberately as standing proof. |
| `sdk-behavior-probe.ts` | **RESEARCH-KEEP.** Positional/ordering + reasoning ground truth, plus the `so1` structured-output model matrix with a real `--dry-run` plan. Idle, but it answers questions no test can (what the model SEES). |
| `sdk-injection-cache-probe.ts` | **RESEARCH-KEEP.** The most rigorous member: a 24-cell matrix + grow cells + a two-axis cache classifier that names the `system-only` masquerade explicitly (`:316-342`) so a write-only classifier can't file an expensive fork as a cheap one. Deep-imports the PRODUCTION `spliceInChatInjections` (`domain/chat/assembly/injections.ts:125`) and `squashSameRole` (`role-squash.ts:69`) — both alive. |
| `sdk-dynamic-content-probe.ts` | **RESEARCH-KEEP.** Same production splice imports; reads verdicts off REPLY TEXT rather than cache tokens, and its header says why (the token approach drowned the question in the sibling probe). Carries a `--nonce` cache-isolation discipline worth copying. |
| `sdk-session-probe.ts` | **RESEARCH-KEEP, weakest of the five.** It is the measurement half of a PD (`reports/agent-sdk/held-open-sessions-pd.md`) — `reports/` is ephemera, so the probe now outlives the doc that motivated it. Keep, but it is the first candidate if the family is ever trimmed. Its `sliceOneTurn` refusal-to-fabricate (`:323-327`) is a good pattern regardless. |
| `sdk-hook-wire-probe.ts` | **RESEARCH-KEEP; its MECHANISM is already promoted.** The family's only wire-level member (loopback capture server on 127.0.0.1:8791 reading the real `/v1/messages` body, free, no quota). Its capture-server idiom is ALREADY cited as the wire-tap gate fixture: `docs/design/tooling-package.md:274` names `sdk-hook-wire-probe.ts:10-13` as the shape `wire-tap`'s planted-positive test copies. So the extraction question is **answered** — the idiom moves, the probe stays as the reference implementation. |

**Is the rest of the family tool-shaped?** No — and the reason is structural, not stylistic. Every
non-hook member spends real Max-sub quota or OpenRouter credits per invocation. A `@orb/tooling` slot
buys gates, an exit contract and proc doors; none of those help an instrument whose cost model
forbids CI. The one exception is the hook probe, whose whole point is that it is FREE — and that
member's capability has already been routed.

### The tool-guard tuning rig

| file | verdict |
| - | - |
| `probes/guard-replay.ts` | **RESEARCH-KEEP, correctly hand-run.** `.claude/hooks/tool-guard.mjs:325` names it in `SELF_TOOL_RELPATHS` verbatim (`["scripts/probes/guard-replay.ts", "scripts/probes/transcript-census.ts"]`) — deleting it orphans a live guard constant. It imports the guard's REAL `classify` (`:31`) rather than re-deriving it, which is what makes the replay evidence and not a model. |
| `probes/transcript-census.ts` | **RESEARCH-KEEP, correctly hand-run.** Same `SELF_TOOL_RELPATHS` row. Its header (`:14-27`) is the only record of the reverse-engineered transcript JSONL shape, and the doctrine's 133,631-Bash-call census is its output. |

Neither is tool-shaped, for one reason worth stating: **their corpus is outside the repo**
(`~/.claude/projects`, `~/.claude-b/projects`, 4.5 GB). A `@orb/tooling` instrument that reads the
operator's home directory and cannot be exercised on a fixture tree fails the fleet's own
planted-positive proof requirement (`tooling-package.md` §4.5's
`@instrument-proof` / `@instrument-absence-proof` pair). They are correctly hand-run.

**One defect, both files:** their usage lines print a filename that does not exist.
`guard-replay.ts:3` says "`guard-replay.mjs`" and `:13` prints
`node scripts/probes/guard-replay.mjs`; `transcript-census.ts:3` and `:30` do the same with
`transcript-census.mjs`. Both files are `.ts`. A cold agent copy-pastes the printed command and gets
ENOENT. One-line fix each; no behavior change.

### `probes/history-system-rows.ts`

**RESEARCH-KEEP.** The alias exists and is correct: `package.json` →
`"probe:history-system-rows": "node scripts/probes/history-system-rows.ts"`. Its target is live —
`turns.historySystemRows` is declared in `contracts/src/connection/index.ts:227`, defaulted at `:284`,
derived at `domain/connection/catalog/turns.ts:79/89/102`, set `true` at `:203`, and read by
`domain/chat/verbs/read.ts:983` + three `assembly/` headers. It has zero deps beyond `fetch`, defaults
to the free local vLLM endpoint, and is deliberately **read-only about production**: its own header
says "this probe NEVER edits the capability factory" and prints the cell for a human to land. That
discipline is right and should not be automated away.

Not tool-shaped: it is a one-cell measurement whose output is a sentence a human writes into
`turns.ts` with a dated receipt (the `tools.silencesProse` 36/36 pattern). Automating the write would
destroy the very property (`D69`: measured, never guessed) it exists to protect.

### `probes/impersonate/**`

**RESEARCH-KEEP — the highest-quality rig in the zone, and its results ARE committed.**
`git ls-files` shows `README.md`, `RESULTS.md`, `results.jsonl`, `fixtures.ts`, `prompt.ts`,
`run.ts`, `score.ts` — all seven tracked, including the full transcript corpus.

- **Reads through PRODUCTION.** `prompt.ts:20` imports `buildPrompt` / `resolveNudgeText` /
  `shapeTurn` from `domain/chat/substrate/assembly-access.ts` — all three are live exports there
  (`:33`, `:103`, `:48`). Only the HTTP call is hand-rolled, and the header names the two production
  steps deliberately skipped and why.
- **`score.ts` imports the real `cleanPerSpeakerReply` from `@orb/kit/speaker-label`**, and keeps the
  PRE-IMP-1 clean beside it so the laundering the fix removed stays measurable on the same bytes.
- **It documents its own instrument's failure.** `score.ts:12-17` and `README.md:38` both state, in
  the file, that the mechanical flags are NOT the verdict — they miss a first-person takeover
  entirely — and that the blind judge is. `RESULTS.md` pins two judge framings that measurably
  failed so they are not re-tried.
- `RESULTS.md` closes with an OPEN finding (\~28% local bleed no layer can see) and names the two
  fixtures that reproduce it. That makes the rig a live iteration harness, not an archive.

**Generalizable capability:** yes, but it is a PATTERN, not a tool — "assemble through
`substrate/assembly-access`, drive N fixtures × M arms, score with a blind calibrated judge, persist
resumable JSONL". `card-teach-probe.ts` independently re-derived the same shape. See T3 below.

### `probes/openrouter/**`

**RESEARCH-KEEP, and the strongest candidate for a capability extraction.**

- All eight `.ts` + all seven `results/*.jsonl` are git-tracked. `RESULTS.md` (262 lines) carries
  seven dated verdicts with per-arm tables, and it is cited by
  `docs/history/design/openrouter-provider-findings.md`.
- **It already earned its keep twice over.** OR-5b's verdict (5341 wasted cache-write tokens → 0) is
  the receipt behind the shipped fix, and `or5b-depth-invariance.ts:36-58` hand-MIRRORS
  `backends/kit/cache-control.ts:indexAtDepth` (alive, `:138`) so the probe agrees with the code it
  verifies. OR-7b records **two instrument repairs** that each produced a confident wrong verdict
  first — that is the zone's best example of probing the instrument before trusting its zero.
- `_kit.ts` is already a small framework: `orCall` + `usageOf` + nonce `filler` + `jsonl()` with a
  resume-by-`kind:"verdict"` rule + `totalSpend()`. `run.ts` is a 47-line batch driver over
  `export const id / title / run()` modules.
- **The house rules in `README.md:29-42` are the real asset** — one variable per arm, each probe
  carries its own controls, resume unit is the PROBE not the arm, a 400 is a verdict not a failure,
  prefixes nonce-stamped per run. That is a tool contract written in prose.

### `probes/rpg-extraction/**`

| file | verdict |
| - | - |
| `card-teach-probe.ts` | **RESEARCH-KEEP, live and current.** Imports `RPG_PROSE_SLOTS`, `RPG_PROFILE_FREEFORM`, `rpgTrackerDefSchema` from `@orb/contracts/rpg`, `tokenizeContent` from `@orb/kit/content`, the production `buildLiteReminder` (`domain/rpg/substrate/reminder.ts:496`, alive), and `REPO_ROOT` from `@orb/tooling/_shared/artifacts`. It carries a **drift guard** (`:244`: throws if the real reminder no longer contains `RPG_CARD_TEACH`), a `CARD_DRY=1` no-spend arm and a `CARD_SCORE=` free re-score arm. Its central finding — `emitted` (95%) vs `rendered` (73%), the gap being a malformed open fence the production tokenizer silently drops — exists ONLY because it scores through the real tokenizer. Best-in-class. |
| `local-8b-vehicles.ts` | **RESEARCH-KEEP, live, $0 to run.** Drives the REAL exported builders (`constrainExtractionSchema`, `projectJsonSchema`, `buildRpgToolDescriptions`, `composePlaneTeaching`, `buildLiteReminder`, `extractionToStateDelta`, `cleanJsonSchema`) and names, in its header, the exact three private compose wrappers it mirrors and the file they drift from. **It self-declares a stale premise** at `:665-667`: the vllm arm now declares `midConversationSystem:true` (#201/D143, 2026-08-18), so the frozen delivery shape it measures is no longer production's — "re-run before quoting its numbers as current". Honest and load-bearing; keep. |
| `steer-probe-real.ts` | **RESEARCH-KEEP.** The R4b closing-the-loop arm: real `buildLiteReminder`, two arms, blind judge. Live imports. |
| `steer-probe.ts` | **DELETE-CANDIDATE (low priority).** Superseded by `steer-probe-real.ts`, which its own header says so (`steer-probe-real.ts:5-10`: the bare-number arm "was already proven noise and is not re-bought"). It hand-rolls the reminder text rather than building it; its finding (Δ −0.12 bare vs −1.00 glossed) is durable in the §4d writeup. Preserving recipe: `git log --diff-filter=D --oneline -- scripts/probes/rpg-extraction/steer-probe.ts` → `git show <sha>^:<path>`. Weak recommendation — it is 172 lines and costs nothing to keep. |
| `run.ts` · `run-coverage.ts` | **DELETE-CANDIDATE, self-declared.** Both open with `ARCHIVED 2026-08-02 … do NOT run against the current contracts`. Their measured value is entirely in `docs/design/rpg-extraction-one-call-spike.md` + `SPEC.md` + `SPEC-coverage.md` (all committed), and their outputs are gitignored (C2). Together they are 2,111 lines of a wire vocabulary we retired. **Blocker:** they are the only readers of `real-cheap-toolround.json` / `real-reliable-structured.json` / `real-narrative-turn.json`, which ARE tracked — deleting the scripts orphans the captures. Delete the pair, or keep both and mark the pairing in the README. |
| `native-wire-probe.ts` · `native-format-roundtrip.ts` | **DELETE-CANDIDATE, self-declared ARCHIVED.** 249 lines total. Their question (does `output_config.format` compose with `tools` on the native wire) was answered — the second file's own verdict block records the answer — and the answer lives in the spike doc §2. They also carry a live dep on `@anthropic-ai/sdk` and burn native Anthropic credits. |
| `effort-ladder-native-vs-or.ts` · `effort-reasoning-probe.ts` | **DELETE-CANDIDATE.** Not headed ARCHIVED, but both load `real-cheap-toolround.json` (the retired corpus) and both ask the effort-ladder question that `openrouter/f5-effort-translation.ts` re-asked more rigorously and answered definitively (F5: OR best 205 thinking tokens vs native 5783 = 28×, with a committed `results/f5.jsonl`). Superseded by a probe with committed evidence. |
| `replay-toolround.ts` | **DELETE-CANDIDATE (54 lines).** Its whole job is to replay `real-cheap-toolround.json` with `tool_choice` required-vs-auto; the corpus it replays is retired and the required-vs-auto answer is in the spike doc §3 (M7). |

### `probes/st-goldens/**` (NOT the captured `sillytavern-runtime/` tree)

**RESEARCH-KEEP with the highest TOOL-POTENTIAL in the set after the oracle.** Nine files tracked;
everything the rig generates (fixtures, both capture arms, the 500 MB ST install) is gitignored.

- **Its findings were already promoted.** `README.md:3-6` opens by disclaiming itself — *"several of
  its factual claims have been measured false … read `docs/history/design/st-message-shaping-atlas.md`;
  when this file and a script disagree, the script wins."* The atlas exists and is the durable home.
  So the rig's value today is REPRODUCTION, not record.
- **`compare-runner.ts` already implements the tooling exit contract by hand.** `:130` and `:137`
  both set `process.exitCode = 2` — one for a missing capture dir, one for *"No ST captures … nothing
  was compared"*, with the comment *"A scope that matched nothing is an ERROR, not a clean result — a
  silent zero here reads as 'parity'."* That is exactly the `@instrument-absence-proof` posture the
  fleet gate mandates, written before the gate existed.
- **`capture-orbweaver.ts` is a genuine in-process replay harness**: it drives the REAL `driveRound`
  behind a wire-capturing OpenRouter backend against a `freshDb()`, needs no running stack, and
  imports the test factories directly (`../../../tests/server/domain/chat/_support.ts`,
  `../../../tests/support/db.ts`) — a `scripts/ → tests/` edge worth noting at any promotion.
- **`rig-paths.ts` is the one-home path config**, with `ST_GOLDENS_DATA_ROOT` existing specifically
  because the data lives in one checkout while the scripts live in every worktree. Both sweeps carry
  a fail-closed `RUN_STAMP` freshness gate that refuses to compare against stale evidence.
- **The weak member is `generate-goldens.ts`** (615 lines): `any`-typed fixture, seven
  `noExplicitAny` suppressions, and it reads `fixture.commands` which no declared type carries (only
  `run-demo-complex.sh` emits it). It is also the only file that boots a foreign app and patches its
  source in place (`:195-203`). Any promotion should leave this one in `scripts/` and take the
  comparator + the ORB arm.

### Root shims

| file | verdict |
| - | - |
| `scripts/ts7.cjs` | **KEEP, no rot.** 14 lines. Three `package.json` typecheck rows + `UNIFIED-VERIFICATION-DESIGN.md` + every brief's `types:graph` spelling depend on this exact path. Its one non-obvious job is documented in place (`:9-11`): the `--max-old-space-size=16384` floor rides IN the wrapper so bare `node scripts/ts7.cjs` invocations get it, because `pnpm-workspace.yaml`'s `nodeOptions` only reaches pnpm-run scripts. Correct as written. |
| `scripts/worktree-bootstrap.sh` | **KEEP, no rot.** 35 lines, `pnpm worktree:bootstrap`'s target. Resolves root via `git rev-parse --show-toplevel` (no hardcoded paths), does a proper per-worktree `pnpm install` rather than neo's symlink hack, and links `.env` from the main checkout. Its comments explain both choices. It is the remedy for §L.5 ("`git worktree add` does NOT fire the install hook"). |

### `dev/sandbox.sh`

**RESEARCH-KEEP as an operator script — worth improving into stack ops SOMEDAY, not today.**
100 lines, `pnpm sandbox`. Content is better than "throwaway": `set -euo pipefail`, a
`$DEVCONTAINER` host-only guard, idempotent `devcontainers up`, a `--rebuild` arm, and a
seven-emulator terminal detection ladder with a `--here` fallback. Its one real weakness is
`for a in ${CLAUDE_ARGS[@]+"${CLAUDE_ARGS[@]}"}` (`:54`) — an unquoted expansion inside `printf %q`
re-quoting, which word-splits a multi-word passthrough arg. Cosmetic for its use.

It is not tool-shaped: it launches a GUI terminal and `exec`s into a container. It has no output to
gate and no artifact to verify — nothing the `@orb/tooling` exit contract or proc doors would buy.

### `dev/oracle-steady-clone.sh`

**TOOL-CANDIDATE (rank 1) — see C1.** 238 lines. What it actually does: pins `/tmp/neo-tavern-steady`
to `$SRC` HEAD, symlinks `node_modules` (936 MB), writes a capture script INTO the clone via a quoted
heredoc so neo's `#server/*` subpath imports resolve, drives neo's REAL transforms
(`spliceInChatInjections`, `applyNamesBehavior`, `squashSameRole`, `hasMultipleCharacters`,
`computeHistoryBreakpoint`) over the committed fixture, and emits the reference — biome-formatted so
the committed JSON matches the hook.

Live premises, all verified today: `/home/inktomi/inktomi-stack/development/neo-tavern` exists;
`tests/support/fixtures/parity/{breakpoint-cases,neo-reference}.json` exist; `parity-runner.ts` reads
the reference; the `.parity.test` asserts on it; `pnpm test:parity` runs the project.

Two real defects found in the read:

1. **Stale cross-reference.** `breakpoint-cases.json`'s `$comment` still says the capture script is
   `scripts/dev/oracle-capture.ts` "run inside /tmp/neo-tavern-steady". No such file exists — the
   capture is the heredoc at `oracle-steady-clone.sh:87-220`, written into the clone at run time.
2. **It is a whole-tree regenerator with no shared-tree fence.** It rewrites a COMMITTED fixture from
   whatever `$SRC` HEAD happens to be. That is precisely the class the lane rules ban running on a
   multi-lane tree, and nothing in the script says so.

---

## Ranked tool-candidate shortlist

Bar applied: durable · re-runnable · would genuinely benefit from the tooling gates / exit contract /
proc doors. Effort estimates are lane-days for one executor including the fleet's five-slot template,
the `@instrument-proof` + `@instrument-absence-proof` pair, and the coupled-site sweep.

| # | Candidate | Shape it would take | Why it clears the bar | Effort |
| - | - | - | - | - |
| 1 | **`parity-oracle/`** — promote `dev/oracle-steady-clone.sh` | `lib/{clone,capture}.ts` + `ops/{clone,capture,verify}.ts`; the heredoc becomes a real module written into the clone; `--check` re-captures and diffs against the committed reference WITHOUT writing (the missing arm today) | Its output is asserted by a live test tier (C1). It is a golden regenerator with no freshness check, no shared-tree fence, and a stale self-reference — the three things the exit contract (0 clean / 1 drift / 2 could-not-measure) and the proc doors exist for. A `--check` op turns "someone must remember to re-run this" into a gate. | **1.5–2 days** (the neo dependency is the risk: the tool must fail-loud with exit 2 when `$SRC` is absent, and be honest that it CANNOT measure rather than silently keeping the old reference) |
| 2 | **`st-parity/`** — promote `compare-runner.ts` + `capture-orbweaver.ts`; leave `generate-goldens.ts` in `scripts/` | `lib/{normalize,identity}.ts` + `ops/{capture,compare}.ts`; keeps `rig-paths.ts`'s `ST_GOLDENS_DATA_ROOT` as the data-root door | The comparator already hand-implements the exit contract INCLUDING the absence arm (`compare-runner.ts:130,137`) and the identity-class diff is the atlas's own definition. `capture-orbweaver.ts` is a stack-free in-process replay — exactly the shape a tool op wants. The ST arm stays research because it boots + patches a foreign app. | **2–3 days** (the `scripts/ → tests/_support` import must be resolved at the move: either the factories go to a shared home or the capture op grows its own seeding) |
| 3 | **`model-probe/`** — a shared harness kit, generalizing `openrouter/_kit.ts` | `_shared` or a slot exposing `orCall`/`nativeCall` + `usageOf` + nonce `filler` + `jsonl()` resume-by-verdict + `totalSpend()` + a `{id,title,run}` module contract and batch driver | Three rigs independently re-derived it: `openrouter/_kit.ts` (the mature one), `impersonate/run.ts` (adds resumable JSONL + a calibrated blind judge), `card-teach-probe.ts` (adds a production-tokenizer scorer + `DRY`/`SCORE` no-spend arms). The house rules in `openrouter/README.md:29-42` are already a tool contract in prose. Consumers stay in `scripts/` and import the kit — the zone is explicitly allowed to import `@orb/tooling`. | **2 days for the kit + 0.5/rig to repoint.** NOTE: the kit is the only durable part; the PROBES must stay research (live spend forbids CI), so this is a de-duplication win, not a fleet instrument. Rank it below 1–2 for that reason. |
| 4 | **the `sdk-hook-wire-probe` loopback-capture idiom** | already routed — `tooling-package.md:274` makes it `wire-tap`'s planted-positive fixture | Named, ruled, in flight. Listed here only so nobody re-opens it. | **0** (done elsewhere) |

**Explicitly NOT candidates, with the reason:** the five quota-spending `sdk-*` probes (cost model
forbids CI); `guard-replay` + `transcript-census` (corpus is outside the repo — cannot satisfy the
planted-positive proof on a fixture tree); `history-system-rows` (automating the write would destroy
the measure-then-declare discipline it enforces); `sandbox.sh` (no artifact to gate); `ts7.cjs` and
`worktree-bootstrap.sh` (launcher shims — already correctly ruled to stay put).

## Deletion shortlist (rpg-extraction only), with what preserves the value

All six are `git log --diff-filter=D --oneline -- <path>` → `git show <sha>^:<path>` recoverable.

| path | lines | value preserved by |
| - | - | - |
| `rpg-extraction/run.ts` | 1006 | `docs/design/rpg-extraction-one-call-spike.md` §3 + `SPEC.md` (committed) |
| `rpg-extraction/run-coverage.ts` | 1105 | same doc §4 + `SPEC-coverage.md` + `out2/COVERAGE-SUMMARY.md` receipt quoted in the doc |
| `rpg-extraction/native-wire-probe.ts` | 152 | same doc §2 (its verdict block is the record) |
| `rpg-extraction/native-format-roundtrip.ts` | 97 | same doc §2 |
| `rpg-extraction/effort-ladder-native-vs-or.ts` | 123 | `openrouter/RESULTS.md` §F5 + `results/f5.jsonl` (committed, more rigorous) |
| `rpg-extraction/effort-reasoning-probe.ts` | 94 | same |
| `rpg-extraction/replay-toolround.ts` | 54 | same doc §3 (M7) |
| `rpg-extraction/steer-probe.ts` | 172 | superseded by `steer-probe-real.ts`; §4d writeup holds the numbers — **weak, keep if in doubt** |

**Coupling to resolve first:** the three tracked capture JSONs (`real-cheap-toolround.json`,
`real-reliable-structured.json`, `real-narrative-turn.json`) have no reader once `run.ts`,
`run-coverage.ts`, `replay-toolround.ts`, `effort-ladder-native-vs-or.ts` and
`effort-reasoning-probe.ts` are gone. Either they go with the delete, or `README.md` records that
they are a frozen wire-shape record with no live reader.

## Small fixes worth landing whoever touches these next

1. `guard-replay.ts:3,13` and `transcript-census.ts:3,30` — usage lines print `.mjs`; the files are
   `.ts`. Copy-pasting the printed command fails.
2. `breakpoint-cases.json` `$comment` — cites `scripts/dev/oracle-capture.ts`, which does not exist.
3. `scripts/README.md` — move `oracle-steady-clone.sh` out of "Operator one-offs" (C1); mark the four
   ARCHIVED rpg-extraction harnesses as such (C3); correct the "committed RESULTS" phrasing for
   rpg-extraction, whose result dirs are gitignored (C2).
4. The six `sdk-*-probe.ts` files carry `#!/usr/bin/env tsx` shebangs while their `package.json`
   aliases invoke `node`. `tsx` IS still a declared devDependency (`package.json:147`), so this is
   inert rather than broken — but it contradicts the shed and misleads a cold reader.
